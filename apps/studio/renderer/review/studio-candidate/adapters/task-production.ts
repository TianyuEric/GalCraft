import { AnimationGenerationRequestSchema, AuthoringOutlineSchema, GenerationInputSchema, ProjectSchema, createId, type EditInput, type EditPlan, type EditReceipt, type Json, type Result, type VersionRef } from '@galcraft/contracts';
import { operationPurpose, resolveProductionFields, speechLines, variantOperation } from '@galcraft/authoring/production/draft';
import { previewTextInput, speechPreparationInstruction } from '@galcraft/authoring/production/preview';
import { operationSupportsConnection, validateOperationInput } from '@galcraft/authoring/production/operations';
import type { Candidate, FormVariant, GenerationInput, ProductionFormDraft, Task, TaskItem, TaskPlan, TaskPlanInput } from '@galcraft/authoring/production';
import type { Overview, ProductionBridge } from '../../../../desktop-bridge.js';
import type { CandidateSession } from '../application/session.js';
import { candidateAssets } from '../application/services.js';
import type { AdoptionChoice, CandidateOutput } from './task-adoption.js';
import { prepareCandidateTaskAdoption, previewCandidateScript } from './task-script-adoption.js';
import { createTaskLibrary } from './task-library.js';
import { captureTaskContext, currentVersions, documentVersion, hasUnappliedTaskSource, projectTaskSource, requestSummary, taskError, taskIssue, taskOk, taskTime, unsupported } from './task-model.js';
import { resolveReviewAnimation, reviewCandidates } from './task-provider.js';
import { candidatePageStructureUnavailable } from './task-ui.js';
import { isPageStructureOperation } from './production-session.js';

const activeStates = new Set<TaskItem['state']>(['queued', 'submitting', 'running', 'fetching']);
const active = (task: Task) => task.items.some(item => activeStates.has(item.state));
const record = (value: Json) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const outlinePath = 'authoring/outline.json';
const sameVersions = (a: VersionRef[], b: VersionRef[]) => a.length === b.length && a.every(item =>
  b.some(value => value.ref.kind === item.ref.kind && value.ref.id === item.ref.id && value.revision === item.revision));

type StageIdentity = { taskId: string; itemId: string };
export type CandidateStageReview = StageIdentity & { taskRevision: number; input: GenerationInput; summary: TaskPlan['sendSummary'][number] };
export type CandidateProductionBridge = ProductionBridge & {
  reviewStage(input: StageIdentity): Promise<Result<CandidateStageReview>>;
  confirmStage(input: StageIdentity & { taskRevision: number }): Promise<Result<Task>>;
};

export function createCandidateProduction(session: CandidateSession, projectId: string) {
  const library = createTaskLibrary(session, projectId);
  const drafts = new Map<string, ProductionFormDraft>();
  const plans = new Map<string, TaskPlan>();
  const tasks = new Map<string, Task>();
  const execution = new Map<string, { started: number; fail: boolean }>();
  const candidates = new Map<string, Candidate>();
  const outputs = new Map<string, CandidateOutput>();
  const adoptions = new Map<string, { plan: EditPlan; ids: string[] }>();
  const completedAdoptions = new Map<string, { expected: VersionRef[]; receipt: EditReceipt }>();
  const applying = new Map<string, Promise<Result<EditReceipt>>>();
  let failNext = false, disposed = false;
  const recovered=session.recoveryState<{drafts:ProductionFormDraft[];tasks:Task[];candidates:Candidate[];outputs:[string,CandidateOutput][];adoptions:Record<string,'saved'|'adopted'|'unadopted'>}>('production');
  const restoredAdoptions=recovered?.adoptions??{};
  if(recovered){
    for(const draft of recovered.drafts)drafts.set(draft.id,draft);
    for(const task of recovered.tasks){for(const item of task.items)if(activeStates.has(item.state)){item.state='failed';item.issues=[taskIssue('REVIEW_SESSION_REOPENED','上次会话已关闭；请求不会自动重发。请审阅后重试。')];}tasks.set(task.id,task);}
    for(const candidate of recovered.candidates)candidates.set(candidate.id,candidate);
    for(const [id,output] of recovered.outputs)outputs.set(id,output);
  }
  session.registerRecovery('production',saved=>({drafts:[...drafts.values()],tasks:[...tasks.values()],candidates:[...candidates.values()],outputs:[...outputs],adoptions:Object.fromEntries([...candidates.values()].flatMap(candidate=>candidate.adoption.map(adoption=>[adoption.groupId,session.host.historyGroupStatus(adoption.groupId,saved)??restoredAdoptions[adoption.groupId]??'unadopted'])))}));

  function tick(now = Date.now()) {
    if (disposed) return;
    for (const [id, run] of execution) {
      const task = tasks.get(id)!;
      const elapsed = now - run.started;
      const state = elapsed < 350 ? 'queued' : elapsed < 800 ? 'submitting' : elapsed < 4300 ? 'running' : elapsed < 4900 ? 'fetching' : run.fail ? 'failed' : 'review';
      const updatedAt = taskTime();
      let changed = false;
      for (const item of task.items) {
        if (!activeStates.has(item.state)) continue;
        const completed = state === 'running' ? Math.min(89, Math.floor(elapsed / 43)) : state === 'fetching' ? 93 : state === 'review' ? 100 : null;
        if (item.state === state && item.progress.completed === completed) continue;
        changed = true;
        item.state = state; item.progress = { phase: state, completed, total: completed === null ? null : 100, elapsedMs: elapsed, updatedAt };
        const attempt = item.attempts.at(-1);
        if (attempt && state !== 'queued') attempt.sentAt ??= updatedAt;
        if (state === 'failed') {
          item.issues = [taskIssue('REVIEW_PROVIDER_FAILED', '审核生成请求按预设失败。可通过新增请求重试。')];
          if (attempt) attempt.outcome = 'failed';
        } else if (state === 'review') {
          for (const value of reviewCandidates(task, item)) {
            candidates.set(value.candidate.id, value.candidate);
            outputs.set(value.candidate.id, value.output);
            item.candidateIds.push(value.candidate.id);
          }
          if (attempt) attempt.outcome = 'completed';
        }
      }
      if (changed) { task.revision++; task.updatedAt = updatedAt; }
      if (!active(task)) execution.delete(id);
    }
  }

  function makePlan(input: TaskPlanInput, existing?: Task): TaskPlan {
    const now = taskTime();
    const task: Task = { schemaVersion: 1, id: existing?.id ?? createId(tasks), projectId, name: input.name, revision: existing?.revision ?? 1,
      createdAt: existing?.createdAt ?? now, updatedAt: now, presetId: null, sourceDraftId: input.sourceDraftId ?? null,
      context: structuredClone(input.context.filter(part => part.included)), items: structuredClone(input.items), policy: input.policy, selectionRule: input.selectionRule,
      previousTaskId: input.previousTaskId, previousItemId: input.previousItemId };
    const expected = input.expected ?? [...new Map(task.items.flatMap(item => item.sourceVersions).map(version => [version.ref.id, version])).values()];
    const plan: TaskPlan = { planId: createId(plans), expected, task, sourceDraftRevision: input.sourceDraftRevision,
      sendSummary: task.items.map(requestSummary), issues: [] };
    plans.set(plan.planId, plan);
    return plan;
  }

  function makeItem(variant: FormVariant, usage: ProductionFormDraft['activeUse']): TaskItem {
    const options = library.overview(), operation = variantOperation(variant, usage), purpose = operationPurpose(operation);
    if (isPageStructureOperation(operation)) throw new Error('页面结构在页面设计器中手工编辑。');
    const config = options.connections.find(value => value.id === variant.connectionId);
    const snapshot = variant.operationSnapshot ?? options.operations.find(value => value.id === operation);
    if (!snapshot) throw new Error('所选制作操作需要外部提供方。');
    if (!config || !operationSupportsConnection(snapshot, config, purpose)) throw new Error('请选择支持此用途的连接。');
    const scheme = options.recipes.find(value => value.id === variant.productionRecipeId) ?? null;
    const preset = options.recipes.find(value => value.id === variant.parameterPresetId) ?? null;
    if (scheme?.production?.executor === 'planned') throw new Error('此制作方案尚未配置执行方。');
    const fields = { ...resolveProductionFields(variant, scheme, preset) };
    let sourceVersions = structuredClone(variant.sourceVersions);
    if ((purpose === 'image' || purpose === 'difference') && fields.sizeMode === 'project') {
      const document = session.host.list().find(item => 'project.json' in item.files);
      if (!document) throw new Error('当前作品画布不可用，请重新读取作品。');
      const { canvas } = ProjectSchema.parse(JSON.parse(document.files['project.json']!).data);
      fields.width = canvas.width; fields.height = canvas.height;
      sourceVersions = [...sourceVersions.filter(version => version.ref.id !== document.documentId), documentVersion(document)];
    }
    if (purpose === 'image' || purpose === 'difference') for (const [key, limit] of [['width', 4096], ['height', 4096], ['count', 8]] as const) {
      const value = fields[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > limit)) throw new Error(key + ' 请填写 1–' + limit + ' 的整数。');
    }
    const workflow = options.workflows.find(value => value.id === variant.workflowBindingId) ?? scheme?.production?.workflow ?? null;
    if (config.protocol === 'comfyUI' && !workflow) throw new Error('请选择 ComfyUI 执行图。');
    const omitted = new Set(Array.isArray(fields.omittedPorts) ? fields.omittedPorts : []);
    const field = (key: string) => omitted.has(key) ? undefined : fields[key];
    const imageSize = { width: field('width') ?? 1024, height: field('height') ?? 1024, count: field('count') ?? 1, seed: field('seed') ?? null };
    const rawInput = snapshot.provider
      ? { purpose, fields: Object.fromEntries(snapshot.definition.fields.map(value => [value.path, field(value.path) ?? value.default])), references: field('references') ?? [] }
      : purpose === 'text'
        ? previewTextInput(variant, usage, options.recipes, options.connections, options.workflows)?.input
        : purpose === 'image' ? { purpose, usage, ...imageSize, positive: field('positive') ?? '', negative: field('negative') ?? '', references: field('references') ?? [] }
        : purpose === 'difference' ? { purpose, ...imageSize, reference: field('reference'), instruction: field('instruction') ?? '', negative: field('negative') ?? '' }
        : purpose === 'speech' ? { purpose, text: field('spokenText') ?? field('text') ?? '', language: field('language') ?? 'ja', voiceId: field('voiceId') ?? null,
          referenceAudio: field('referenceAudio') ?? null, referenceText: field('referenceText') ?? null, referenceLanguage: field('referenceLanguage') ?? null,
          emotion: field('emotion') ?? null, speed: field('speed') ?? null }
        : purpose === 'music' ? { purpose, prompt: field('prompt') ?? '', durationSec: field('durationSec') ?? 30,
          instrumental: field('instrumental') ?? true, lyrics: field('lyrics') ?? null, seed: field('seed') ?? null }
        : { purpose, reference: field('reference') };
    const input = GenerationInputSchema.safeParse(rawInput);
    if (!input.success) throw new Error('请检查执行连接与实际发送字段。');
    validateOperationInput(input.data, snapshot);
    if ('fields' in input.data && snapshot.definition.outputs.some(output => output.type === 'animation')) {
      const request = AnimationGenerationRequestSchema.parse(input.data.fields);
      if (request.mode === 'patch' && request.range && request.paths.some(path => !request.currentAnimation?.tracks.some(track => track.path === path)))
        throw new Error('局部时间编辑需要原动画已有的轨道。');
    }
    return { id: createId(), purpose, operation, target: structuredClone(variant.target), input: input.data,
      operationSnapshot: snapshot, backgroundRemoval: variant.backgroundRemoval, backgroundPreview: variant.backgroundPreview, dependencies: [],
      configSnapshot: { ...config, model: variant.model || config.model }, workflowSnapshot: workflow, recipeSnapshot: null,
      creationMode: operation === 'performance' ? 'performance' : operation === 'discuss' ? 'discuss' : 'write',
      sourceVersions, state: 'draft', remote: null, progress: { phase: 'draft', completed: null, total: null },
      attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [],
      ...(scheme ? { productionSnapshot: scheme } : {}), ...(preset ? { parameterPresetSnapshot: preset } : {}) };
  }

  function start(plan: TaskPlan, original?: Task): Result<Task> {
    if (disposed || !currentVersions(session.host.list(), plan.expected)) return taskError('PRODUCTION_SOURCE_STALE', '制作来源已变化，请重新检查。');
    const draft = plan.task.sourceDraftId ? drafts.get(plan.task.sourceDraftId) : undefined;
    if (!original && !plan.task.previousTaskId && plan.task.sourceDraftId && (!draft || draft.revision !== plan.sourceDraftRevision || draft.submittedTaskId))
      return taskError('DRAFT_STALE', '制作草稿已变化，请重新生成计划。');
    const task = original ?? structuredClone(plan.task), items = original ? structuredClone(plan.task.items) : task.items;
    if (original) {
      if (active(original)) return taskError('TASK_RUNNING', '先等待本轮制作完成或取消。');
      task.items.push(...items);
    }
    const now = taskTime();
    for (const item of items) {
      item.state = item.dependencies.length ? 'blocked' : 'queued';
      item.progress = { phase: item.state, completed: null, total: null, updatedAt: now };
      item.attempts = item.state === 'queued' ? [{ id: createId(), createdAt: now, remote: null, outcome: 'pending' }] : [];
      item.remote = null; item.issues = []; item.candidateIds = []; item.selectedCandidateId = null;
    }
    task.updatedAt = now;
    task.revision++;
    tasks.set(task.id, task);
    execution.set(task.id, { started: Date.now(), fail: failNext });
    failNext = false;
    plans.delete(plan.planId);
    if (!original && !plan.task.previousTaskId && draft) drafts.set(draft.id, { ...draft, revision: draft.revision + 1, submittedTaskId: task.id, updatedAt: now });
    return taskOk(structuredClone(task));
  }
  const missingTask = () => taskError<never>('TASK_NOT_FOUND', '制作任务不存在。');
  const missingCandidate = () => taskError<never>('CANDIDATE_NOT_FOUND', '制作候选已离开任务。');
  const missingPlan = () => taskError<never>('PLAN_NOT_FOUND', '执行计划已失效，请重新准备。');

  function registerAdoption(input: EditInput, ids: string[]): EditPlan {
    const members = [...new Set(input.patches.map(patch => patch.documentId))];
    const plan: EditPlan = { planId: createId(adoptions), input, members, issues: [],
      before: Object.fromEntries(input.expected.map(value => [value.ref.id, value.revision])),
      preview: members.map(id => ({ ref: { kind: 'document', id }, description: input.label })) };
    adoptions.set(plan.planId, { plan, ids });
    return plan;
  }
  function makeDraftItems(variant: FormVariant, usage: ProductionFormDraft['activeUse']): TaskItem[] {
    const lines = usage === 'voice' ? speechLines(variant).filter(line => line.selected) : [];
    const variants: FormVariant[] = lines.length ? lines.map(line => ({
      ...variant, connectionId: line.connectionId ?? variant.connectionId, model: line.model ?? variant.model,
      target: { ...variant.target, sceneId: line.sceneId, statementId: line.statementId, locale: line.language, characterId: line.characterId },
      fields: { ...variant.fields, ...line.fields, text: line.text, language: line.language, voiceId: line.voiceId },
    })) : [variant];
    return variants.flatMap(value => {
      const item = makeItem(value, usage), preparation = value.promptPreparation;
      if (!preparation || item.purpose === 'text') return [item];
      const fields = value.fields;
      const instruction = preparation.purpose === 'speechText'
        ? speechPreparationInstruction(String(fields.spokenText ?? fields.text ?? ''), String(fields.instruction ?? ''))
        : String(fields.instruction || fields.positive || fields.prompt || '');
      const text = makeItem({ ...value, operation: preparation.purpose, operationSnapshot: undefined, recipe: preparation,
        productionRecipeId: null, parameterPresetId: null, parameterOverrides: {}, promptPreparation: null,
        connectionId: typeof fields.promptConnectionId === 'string' ? fields.promptConnectionId : null, workflowBindingId: null,
        model: typeof fields.promptModel === 'string' ? fields.promptModel : null, fields: { instruction, maxOutputTokens: fields.maxOutputTokens ?? 4096 },
      }, usage);
      item.dependencies = [{ itemId: text.id, output: 'prompt', selectedCandidateId: null }];
      return [text, item];
    });
  }

  function reviewStage({ taskId, itemId }: StageIdentity): Result<CandidateStageReview> {
    tick();
    const task = tasks.get(taskId), item = task?.items.find(value => value.id === itemId);
    if (!task || !item) return missingTask();
    if (item.state !== 'blocked' || active(task) || item.needsReview || item.dependencies.length !== 1)
      return taskError('STAGE_BLOCKED', '等待其他步骤完成，再审阅此请求。');
    const candidateId = item.dependencies[0]!.selectedCandidateId;
    const candidate = candidateId ? candidates.get(candidateId) : undefined;
    const output = candidateId ? outputs.get(candidateId) : undefined;
    if (!candidate || !output) return taskError('STAGE_BLOCKED', '请先选择用于此步骤的文字候选。');
    try {
      const proposal = record(JSON.parse(candidate.editedText ?? output.text) as Json);
      const current = GenerationInputSchema.parse(item.input);
      const input = GenerationInputSchema.parse(current.purpose === 'image' ? { ...current, positive: proposal.positive, negative: proposal.negative ?? current.negative }
        : current.purpose === 'difference' ? { ...current, instruction: proposal.instruction, negative: proposal.negative ?? current.negative }
        : current.purpose === 'speech' ? { ...current, text: proposal.spokenText, emotion: proposal.emotion ?? current.emotion }
        : current.purpose === 'music' ? { ...current, prompt: proposal.prompt, lyrics: proposal.lyrics ?? current.lyrics } : current);
      return taskOk({ taskId, itemId, taskRevision: task.revision, input, summary: requestSummary({ ...item, input }) });
    } catch { return taskError('STAGE_INPUT_INVALID', '所选准备候选缺少此步骤所需的字段。请修正文字候选后重新选择。'); }
  }

  const bridge: CandidateProductionBridge = {
    ...library.production,
    ...candidatePageStructureUnavailable,
    async overview() {
      tick();
      const documents = session.host.list(), source = projectTaskSource(documents);
      const index = documents.find(value => 'assets/index.json' in value.files);
      const adoptionState = (candidate: Candidate): Overview['candidates'][number]['adoption'] => {
        for (const adoption of candidate.adoption.slice().reverse()) {
          const state = session.host.historyGroupStatus(adoption.groupId) ?? restoredAdoptions[adoption.groupId];
          if (state === 'saved' || state === 'adopted') return state;
        }
        return 'unadopted';
      };
      const data: Overview = {
        ...library.overview(), scenes: source.scenes, pages: source.pages, characters: source.characters, canvas: source.project.canvas,
        assets: candidateAssets(documents), versions: source.versions,
        projectVersion: { ref: { kind: 'document', id: source.projectDocumentId }, revision: source.projectRevision },
        assetsVersion: index ? documentVersion(index) : undefined,
        drafts: [...drafts.values()], tasks: [...tasks.values()],
        candidates: [...candidates.values()].map(candidate => ({ candidate, adoption: adoptionState(candidate) })),
      };
      return taskOk(structuredClone(data));
    },
    async context(input) { return taskOk(captureTaskContext(session.host.list(), input)); },
    async saveDraft({ draft, expectedRevision }) {
      const previous = drafts.get(draft.id);
      if (disposed || draft.projectId !== projectId || (previous?.revision ?? null) !== expectedRevision || previous?.submittedTaskId)
        return taskError('DRAFT_STALE', '制作草稿已变化或所属作品已关闭。');
      const saved = structuredClone({ ...draft, updatedAt: taskTime(), revision: (previous?.revision ?? 0) + 1 });
      drafts.set(saved.id, saved);
      return taskOk(structuredClone(saved));
    },
    async discardDraft(id) {
      if (drafts.get(id)?.submittedTaskId) return taskError('DRAFT_SUBMITTED', '已发送的输入保留在任务记录中。');
      drafts.delete(id);
      return taskOk(undefined);
    },
    async plan(input) {
      if (!('draftId' in input)) {
        if (input.projectId !== projectId || !input.items.length || input.items.some(item => isPageStructureOperation(item.operation)))
          return taskError('PRODUCTION_INPUT', '检查制作任务的作品与用途。页面结构使用手工编辑。');
        const plan = makePlan(input);
        return taskOk(structuredClone(plan));
      }
      const draft = drafts.get(input.draftId);
      const variant = draft?.variants[draft.activeUse];
      if (!draft || !variant || draft.submittedTaskId) return taskError('DRAFT_NOT_FOUND', '请保存当前制作草稿。');
      if (!currentVersions(session.host.list(), variant.sourceVersions)) return taskError('PRODUCTION_SOURCE_STALE', '制作来源已变化，请复核来源。');
      try {
        const items = makeDraftItems(variant, draft.activeUse);
        const plan = makePlan({ projectId, name: input.name, context: items.some(item => item.purpose === 'text') ? variant.context : [], items, policy: 'waitForSelection', selectionRule: null,
          sourceDraftId: draft.id, sourceDraftRevision: draft.revision });
        return taskOk(structuredClone(plan));
      } catch (cause) { return taskError('PRODUCTION_INPUT', cause instanceof Error ? cause.message : String(cause)); }
    },
    async planOperation(input) {
      const operation = library.overview().operations.find(value => value.id === input.operation)?.id;
      if (!operation) return taskError('PRODUCTION_OPERATION', '此制作操作需要外部提供方。');
      const purpose = operationPurpose(operation);
      const usage = purpose === 'image' ? 'background' : purpose === 'speech' ? 'voice' : purpose === 'music' ? 'bgm' : purpose === 'difference' ? 'difference'
        : library.overview().operations.find(value => value.id === operation)?.definition.outputs.some(output => output.type === 'animation') ? 'animation' : 'script';
      try {
        const item = makeItem({ operation, fields: input.fields, connectionId: input.connectionId, model: input.model ?? null, workflowBindingId: input.workflowId ?? null,
          target: { usage, sceneId: typeof input.target?.sceneId === 'string' ? input.target.sceneId : null, statementId: typeof input.target?.statementId === 'string' ? input.target.statementId : null,
            characterId: typeof input.target?.characterId === 'string' ? input.target.characterId : null, locale: null, uiScope: null },
          recipe: null, promptPreparation: null, context: [], backgroundRemoval: null, backgroundPreview: null, sourceVersions: input.sourceVersions ?? [],
        }, usage);
        return taskOk(structuredClone(makePlan({ projectId, name: input.name ?? '制作任务', context: [], items: [item], policy: 'waitForSelection', selectionRule: null })));
      } catch (cause) { return taskError('PRODUCTION_INPUT', cause instanceof Error ? cause.message : String(cause)); }
    },
    async submit(planId) {
      const plan = plans.get(planId);
      return plan ? start(plan) : missingPlan();
    },
    async resume(id) {
      tick();
      const task = tasks.get(id);
      return task ? taskOk(structuredClone(task)) : missingTask();
    },
    async retry({ taskId, itemId, confirmNewRequest }) {
      tick();
      const task = tasks.get(taskId), item = task?.items.find(value => value.id === itemId);
      if (!task || !item) return missingTask();
      if (!confirmNewRequest || !['failed', 'cancelled', 'interrupted'].includes(item.state)) return taskError('RETRY_NOT_READY', '请选择已结束的步骤并确认新增请求。');
      const current = library.overview().connections.find(value => value.id === item.configSnapshot?.id);
      if (!current) return taskError('CONNECTION_MISSING', '当前执行连接已被移除。');
      const next = { ...structuredClone(item), id: createId(), state: 'draft' as const, configSnapshot: current };
      return taskOk(structuredClone(makePlan({ projectId, name: task.name + ' · 重试', context: task.context, items: [next],
        policy: task.policy, selectionRule: task.selectionRule, sourceDraftId: task.sourceDraftId, previousTaskId: taskId, previousItemId: itemId, expected: [] })));
    },
    async waitForTask({ taskId, timeoutMs = 30000 }) {
      const until = Date.now() + Math.max(0, Math.min(timeoutMs, 30000));
      do {
        tick();
        const task = tasks.get(taskId);
        if (!task) return missingTask();
        if (!active(task)) return taskOk({ task: structuredClone(task), reason: task.items.some(item => item.state === 'review') ? 'attention' : 'terminal' });
        if (Date.now() >= until || disposed) return taskOk({ task: structuredClone(task), reason: 'timeout' });
        await new Promise(resolve => setTimeout(resolve, Math.min(150, Math.max(0, until - Date.now()))));
      } while (true);
    },
    async cancel(id) {
      tick();
      const task = tasks.get(id);
      if (!task) return missingTask();
      if (!active(task) && !task.items.some(value => value.state === 'blocked')) return taskOk({ local: 'alreadyFinished', remote: 'notApplicable' });
      execution.delete(id);
      const now = taskTime();
      for (const item of task.items.filter(value => activeStates.has(value.state) || value.state === 'blocked')) {
        item.state = 'cancelled'; item.progress = { phase: 'cancelled', completed: null, total: null, updatedAt: now };
        const attempt = item.attempts.at(-1);
        if (attempt) attempt.outcome = 'cancelled';
      }
      task.revision++; task.updatedAt = now;
      return taskOk({ local: 'stopped', remote: 'notApplicable' });
    },
    async removeTaskRecord(id) {
      tick();
      const task = tasks.get(id);
      if (!task) return missingTask();
      if (active(task)) return taskError('TASK_RUNNING', '先结束当前任务。');
      tasks.delete(id);
      for (const [candidateId, candidate] of candidates) if (candidate.taskId === id) { candidates.delete(candidateId); outputs.delete(candidateId); }
      return taskOk(undefined);
    },
    async candidateContent(id) {
      const candidate = candidates.get(id), output = outputs.get(id);
      return candidate && output ? taskOk({ ...structuredClone(output), text: candidate.editedText ?? output.text }) : missingCandidate();
    },
    async editCandidate({ id, text }) {
      const candidate = candidates.get(id);
      const task = candidate && tasks.get(candidate.taskId), item = task?.items.find(value => value.id === candidate?.itemId), output = outputs.get(id);
      if (!candidate || !task || !item || !output) return missingCandidate();
      const updated: Candidate = { ...structuredClone(candidate), id: createId(candidates), createdAt: taskTime(),
        parentCandidateIds: [id], editedText: text, adoption: [] };
      let content = structuredClone(output);
      if (candidate.artifacts.some(artifact => artifact.kind === 'animation')) {
        try {
          const request = AnimationGenerationRequestSchema.parse(record(candidate.input).fields);
          const resolved = resolveReviewAnimation(text, request);
          content = resolved.output;
          updated.editedText = content.text;
          updated.artifacts = updated.artifacts.map(artifact => artifact.kind === 'animation'
            ? { ...artifact, localPath: 'review-' + updated.id + '.gca', bytes: resolved.bytes, metadata: resolved.metadata } : artifact);
        } catch (cause) {
          return taskError('ANIMATION_CANDIDATE_INVALID', cause instanceof Error ? cause.message : String(cause));
        }
      }
      item.candidateIds.push(updated.id);
      task.revision++; task.updatedAt = taskTime();
      candidates.set(updated.id, updated); outputs.set(updated.id, content);
      return taskOk(structuredClone(updated));
    },
    async select(input) {
      tick();
      const task = tasks.get(input.taskId);
      if (!task) return missingTask();
      const documents = session.host.list();
      const selected: AdoptionChoice[] = [];
      for (const choice of input.selections) {
        const candidate = candidates.get(choice.candidateId), item = task.items.find(value => value.id === choice.itemId), output = outputs.get(choice.candidateId);
        if (!item || !candidate || !output || candidate.taskId !== task.id || candidate.itemId !== item.id || item.state !== 'review' || item.needsReview)
          return taskError('CANDIDATE_INVALID', '请选择当前任务已经完成的候选。');
        selected.push({ candidate, item, output, choice: input.adoptions?.[candidate.id] });
      }
      if (!selected.length) return taskError('CANDIDATE_INVALID', '至少选择一个候选。');
      if (input.target === 'taskOnly') {
        for (const { item, candidate } of selected) {
          item.selectedCandidateId = candidate.id;
          for (const next of task.items) for (const dependency of next.dependencies.filter(value => value.itemId === item.id)) {
            if (next.state === 'blocked') dependency.selectedCandidateId = candidate.id;
            else if (dependency.selectedCandidateId !== candidate.id) next.needsReview = true;
          }
        }
        task.revision++; task.updatedAt = taskTime();
        return taskOk(structuredClone(task));
      }
      if (selected.some(({ choice }) => choice?.mode === 'bind')) {
        const scenes = projectTaskSource(documents).scenes;
        const staleBinding = selected.some(({ item, choice }) => {
          if (choice?.mode !== 'bind') return false;
          const scene = scenes.find(value => value.id === item.target.sceneId);
          return !scene || !item.sourceVersions.some(version => version.ref.id === scene.documentId && version.revision === scene.revision);
        });
        if (staleBinding) return taskError('ADOPTION_CONFLICT', '冻结的采用位置已变化。可以新建制作草稿，或将媒体结果入库。');
      }
      const prepared = await prepareCandidateTaskAdoption(session, selected);
      if (!prepared.ok) return prepared;
      const plan = registerAdoption(prepared.value, selected.map(({ candidate }) => candidate.id));
      return taskOk(structuredClone(plan));
    },
    async apply({ planId, expected }) {
      const completed = completedAdoptions.get(planId);
      if (completed && sameVersions(expected, completed.expected)) return taskOk(structuredClone(completed.receipt));
      const adoption = adoptions.get(planId);
      if (!adoption || !sameVersions(expected, adoption.plan.input.expected)) return missingPlan();
      const existing = applying.get(planId);
      if (existing) return existing;
      if (hasUnappliedTaskSource(session, adoption.plan.members)) return taskError('DOCUMENT_DRAFT', '采用位置有未应用的源码草稿。请先应用或恢复。');
      const run = (async () => {
        const result = await session.applyEdit(adoption.plan.input);
        if (!result.ok) return result;
        for (const id of adoption.ids) candidates.get(id)?.adoption.push({ groupId: result.value.groupId, documentVersions: result.value.documents, assets: result.value.assetIds });
        completedAdoptions.set(planId, { expected: structuredClone(expected), receipt: structuredClone(result.value) });
        adoptions.delete(planId);
        return result;
      })();
      applying.set(planId, run);
      try { return await run; } finally { applying.delete(planId); }
    },
    async discardAdoption(planId) { if (!applying.has(planId)) adoptions.delete(planId); return taskOk(undefined); },
    async keepResults({ taskId, itemId }) {
      const task = tasks.get(taskId), item = task?.items.find(value => value.id === itemId);
      if (!task || !item) return missingTask();
      return taskError('ADOPTION_TARGET_FROZEN', '采用位置随请求冻结。改用其他范围请新建草稿；媒体候选也可直接入库。');
    },
    async previewScript(candidateId) {
      tick();
      const candidate=candidates.get(candidateId), output=outputs.get(candidateId), task=candidate&&tasks.get(candidate.taskId);
      const item=task?.items.find(item=>item.id===candidate?.itemId);
      if(!candidate||!output||!item||item.state!=='review'||item.needsReview)return taskError('CANDIDATE_INVALID','请选择当前任务已经完成的剧情候选。');
      return previewCandidateScript(session,{candidate,item,output});
    },
    async planContinuation({ taskId, candidateId, instruction, mode, summary }) {
      tick();
      const task = tasks.get(taskId), candidate = candidates.get(candidateId);
      const previous = task?.items.find(value => value.id === candidate?.itemId);
      if (!task || !previous || candidate?.taskId !== taskId || active(task)) return missingTask();
      const conversation = { parentCandidateId: candidate.id, mode, instruction, summary };
      const prior = GenerationInputSchema.safeParse(previous.input);
      if (!prior.success || prior.data.purpose !== 'text') return taskError('CONTINUATION_INPUT', '请选择文字候选继续制作。');
      const input = { ...prior.data, messages: [...prior.data.messages,
        { role: 'assistant' as const, text: candidate.editedText ?? outputs.get(candidate.id)?.text ?? '', attachments: [] },
        { role: 'user' as const, text: [summary, instruction].filter(Boolean).join('\n\n'), attachments: [] }] };
      const item: TaskItem = { ...structuredClone(previous), id: createId(), operation: mode === 'write' ? 'script' : mode, creationMode: mode,
        state: 'draft', conversation, input, recipeSnapshot: null, candidateIds: [], attempts: [], selectedCandidateId: null };
      const plan = makePlan({ projectId, name: task.name, context: task.context, items: [item], policy: task.policy, selectionRule: task.selectionRule, expected: [] }, task);
      return taskOk({ ...structuredClone(plan), continuationTaskId: taskId });
    },
    async submitContinuation({ taskId, planId }) {
      const plan = plans.get(planId), task = tasks.get(taskId);
      return plan && task && plan.task.id === taskId ? start(plan, task) : missingPlan();
    },
    async reprocess({ taskId, itemId, candidateId, text }) {
      const task = tasks.get(taskId), candidate = candidateId && candidates.get(candidateId);
      if (!task || !candidate || candidate.taskId !== taskId || candidate.itemId !== itemId) return missingCandidate();
      if (text !== undefined) { const result = await bridge.editCandidate({ id: candidate.id, text }); if (!result.ok) return result; }
      return taskOk(structuredClone(task));
    },
    async transferPrompt({ candidateId, draftId, usage, expectedDraftRevision, acceptedFields }) {
      const candidate = candidates.get(candidateId), output = outputs.get(candidateId), draft = drafts.get(draftId);
      const variant = draft?.variants[usage];
      if (!candidate || !output || !draft || !variant || draft.revision !== expectedDraftRevision) return taskError('TRANSFER_STALE', '候选或目标草稿已变化。');
      const fields = { ...variant.fields };
      for (const key of acceptedFields) fields[key] = record(candidate.input)[key] ?? candidate.editedText ?? output.text;
      return bridge.saveDraft({ draft: { ...draft, variants: { ...draft.variants, [usage]: { ...variant, fields } } }, expectedRevision: expectedDraftRevision });
    },
    async readOutline() {
      const document = session.host.list().find(value => outlinePath in value.files);
      const outline = document ? AuthoringOutlineSchema.parse(JSON.parse(document.files[outlinePath]!).data) : { setting: '', style: '', audienceNotes: '', characters: [], chapters: [] };
      return taskOk({ documentId: document?.documentId ?? null, revision: document?.revision ?? null, outline });
    },
    async saveOutline({ outline, expectedRevision }) {
      const document = session.host.list().find(value => outlinePath in value.files);
      if ((document?.revision ?? null) !== expectedRevision) return taskError('OUTLINE_STALE', '大纲已变化，请重新读取。');
      return session.authorOperation({ op: 'outline.set', outline });
    },
    async mediaInput({ assetId, variantId }) {
      const asset = candidateAssets(session.host.list()).find(value => value.id === assetId);
      const variant = asset?.variants.find(value => value.id === (variantId ?? asset.activeVariantId));
      const file = variant?.files.find(value => value.role === 'primary') ?? variant?.files[0];
      if (!asset || !variant || !file) return taskError('ASSET_NOT_FOUND', '此素材版本不可用。');
      return taskOk({ assetId, variantId: variant.id, candidateId: null, artifactIndex: null, localPath: variant.entry, mime: file.mime, kind: asset.kind });
    },
    async assetReferences(assetId) {
      const result = await session.services.bridge.assets?.references?.(assetId);
      return result && !result.ok ? result : taskOk([]);
    },
    authorizeStage: async () => taskError('STAGE_REVIEW_REQUIRED', '先审阅下一阶段的目的地、材料及请求数。'),
    async reviewStage(input) { return reviewStage(input); },
    async confirmStage({ taskId, itemId, taskRevision }) {
      const reviewed = reviewStage({ taskId, itemId });
      if (!reviewed.ok) return reviewed;
      if (reviewed.value.taskRevision !== taskRevision) return taskError('STAGE_REVIEW_STALE', '前置候选或任务已变化，请重新审阅此请求。');
      const task = tasks.get(taskId)!;
      const item = task.items.find(value => value.id === itemId)!;
      const now = taskTime();
      item.state = 'queued'; item.progress = { phase: 'queued', completed: null, total: null, updatedAt: now };
      item.attempts = [{ id: createId(), createdAt: now, remote: null, outcome: 'pending' }]; item.stageAuthorized = true;
      item.input = reviewed.value.input;
      task.revision++; task.updatedAt = now;
      execution.set(task.id, { started: Date.now(), fail: failNext }); failNext = false;
      return taskOk(structuredClone(task));
    },
    attachment: unsupported, inspectTaskResources: unsupported, releaseTaskResources: unsupported,
  };

  return { bridge, library, failNextTask() { failNext = true; }, failurePending: () => failNext, dispose() { disposed = true; execution.clear(); } };
}
