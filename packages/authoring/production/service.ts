import { isDeepStrictEqual } from 'node:util';
import { createId, reserveIds } from '@galcraft/contracts';
import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile, stat, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { ConnectionConfigSchema, IdSchema, readPluginDocumentInstances } from '@galcraft/contracts';
import type { Artifact, Asset, CancelResult, ConnectionConfig, EditPlan, EditReceipt, Id, Issue, Json, RemoteStatus, Result, VersionRef } from '@galcraft/contracts';
import type { ProjectSession } from '@galcraft/documents';
import type { Candidate, GenerationAdapter, GenerationAdapterLease, GenerationProviderSnapshot, GenerationInput, GenerationReadiness, MediaInput, ProductionFormDraft, ReviewProvider, SubmissionContext, Task, TaskSummary, TaskItem, TaskPlan, TaskPlanInput } from './types.js';
import { ProductionStore } from './store.js';
import { fail, issue, ok, validateItems } from './validation.js';
import { defaultOperation, normalizeProductionDraft } from './draft.js';
import { emptyNovelAIPrompt, NovelAIPromptSchema } from '@galcraft/generation-services/novelai';
import { parsePrompt } from './recipe-preparer.js';
import { confirmInput, generationReadiness, inputCapability } from './capabilities.js';
import { inputTextSummary } from './input-summary.js';
import { isExtensionInput, operationOutputIssues, validateOperationInput } from './operations.js';
import { resourceEndpoint, resourceFamily, resourcePolicy } from './resources.js';

export type ProductionOptions = { userData: string; project: ProjectSession; adapter: (config: ConnectionConfig) => GenerationAdapter;
  resolveOperation?: (id: string, frozen: import('@galcraft/contracts').ProductionOperationSnapshot) => Promise<import('@galcraft/contracts').ProductionOperationSnapshot>;
  freezeProvider?: (config: ConnectionConfig, input: GenerationInput) => Promise<GenerationProviderSnapshot>;
  acquireAdapter?: (config: ConnectionConfig, snapshot: GenerationProviderSnapshot | undefined) => Promise<GenerationAdapterLease>;
  refreshItem?: (item:TaskItem) => Promise<TaskItem>;
  acquireRecoveryAdapter?: (config:ConnectionConfig,snapshot:GenerationProviderSnapshot|undefined) => Promise<GenerationAdapterLease>;
  acquireTextPreparation?: (key:string, version?:string) => Promise<{provider:import('@galcraft/plugins/contracts').TextPreparationContribution;packageVersion:string;release():Promise<void>}>;
  authorize?: (task:Task,item:TaskItem,consume:boolean) => Promise<void>;
  inspectHostCommit?: (config: ConnectionConfig) => Promise<import('@galcraft/contracts').ResourceSnapshot['hostCommit']>;
  review: ReviewProvider; prepareReference?: (media: MediaInput) => Promise<MediaInput>; validateCandidate?: (candidate: Candidate, item: TaskItem) => Promise<Issue[]>;
  localStep?: (item: TaskItem, parents: Candidate[], directory: string, signal: AbortSignal) => Promise<Artifact[]> };
type AdoptionIntent = { planId:Id; candidates:Id[]; context?:import('@galcraft/contracts').CollaborationContext; receipt?:EditReceipt; files?:Record<string,Record<string,string>> };
export class ProductionService {
  readonly store: ProductionStore;
  private removedTasks = new Set<Id>();
  private tasks = new Map<Id, Task>(); private candidates = new Map<Id, Candidate>();
  private running = new Map<Id, AbortController>(); private executions = new Map<Id, Promise<unknown>>();
  private resumptions = new Map<Id, { promise: Promise<void>; resolve(): void; reject(error: unknown): void }>();
  private wakeDrain: (() => void) | null = null;
  private submitted = new Map<Id, Promise<Result<Task>>>(); private mutation: Promise<unknown> = Promise.resolve();
  private adoptions = new Map<Id, Id[]>(); private draining: Promise<void> | null = null;
  private adoptionIntents:Record<string,AdoptionIntent> = {};
  private listeners = new Set<(task: Task) => void>(); private closed = false;
  private lifetime = new AbortController(); private closing: Promise<void> | null = null;
  private resourceFamilies = new Map<string, { family: string | null; ownership: 'shared' | 'exclusive' }>();
  private preparingResources = new Set<string>();
  constructor(readonly options: ProductionOptions) { this.store = new ProductionStore(options.userData, options.project.projectId); }
  async open(): Promise<void> {
    this.removedTasks = new Set(await this.store.read<Id[]>(this.store.path("removed-records.json")) ?? []);
    for (const task of await this.store.tasks()) {
      let changed = false;
      for (const item of task.items) if (['submitting', 'running', 'fetching'].includes(item.state)) {
        changed = true;
        item.state = 'interrupted'; const attempt = item.attempts.at(-1); if (attempt?.outcome === 'pending') attempt.outcome = 'unknown';
      }
      for (const candidate of await this.store.candidates(task)) { reserveIds(candidate); this.candidates.set(candidate.id, candidate);
        const item = task.items.find(value => value.id === candidate.itemId); if (item && !item.candidateIds.includes(candidate.id)) item.candidateIds.push(candidate.id); }
      reserveIds(task);
      this.tasks.set(task.id, task); if (changed) await this.store.saveTask(task);
    }
    this.adoptionIntents=await this.store.read<Record<string,AdoptionIntent>>(this.store.path('adoptions.json'))??{};
    await this.reconcileAdoptions();
  }
  private serial<T>(action: () => Promise<T>): Promise<T> { const result = this.mutation.catch(() => {}).then(action); this.mutation = result; return result; }
  listTasks(): Task[] { return structuredClone([...this.tasks.values()].filter(task => !this.removedTasks.has(task.id))); }
  listTaskSummaries(): TaskSummary[] { return [...this.tasks.values()].filter(task => !this.removedTasks.has(task.id)).map(({ id, name, revision, createdAt, updatedAt, items }) => ({ id, name, revision, createdAt, updatedAt, items: items.map(({ id, state }) => ({ id, state })) })); }
  getTask(id: Id): Task | null { return this.removedTasks.has(id) ? null : structuredClone(this.tasks.get(id) ?? null); }
  listImageCandidates(): Pick<Candidate, 'id' | 'taskId' | 'artifacts' | 'provenance'>[] {
    return [...this.candidates.values()].filter(candidate => !this.removedTasks.has(candidate.taskId) && candidate.artifacts.some(artifact => artifact.kind === 'image' && artifact.role === 'primary')).map(({ id, taskId, artifacts, provenance }) => structuredClone({ id, taskId, artifacts, provenance }));
  }
  subscribe(listener: (task: Task) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async waitForTask(taskId: Id, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Result<{ task: Task; reason: 'terminal' | 'attention' | 'timeout' }>> {
    if (this.closed) return fail('TASK_CLOSED', 'The production service is closed. Reopen the project to continue.');
    if (!this.tasks.has(taskId) || this.removedTasks.has(taskId)) return fail('TASK_MISSING', 'The production task does not exist.');
    const timeoutMs = Math.min(30000, Math.max(0, options.timeoutMs ?? 25000));
    return new Promise(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined, unsubscribe = () => {};
      const cleanup = () => { clearTimeout(timer); unsubscribe(); options.signal?.removeEventListener('abort', aborted); this.lifetime.signal.removeEventListener('abort', closed); };
      const finish = (reason: 'terminal' | 'attention' | 'timeout') => { cleanup(); resolve(ok({ task: structuredClone(this.tasks.get(taskId)!), reason })); };
      const aborted = () => { cleanup(); resolve(fail('TASK_WAIT_CANCELLED', 'Waiting ended; the production task continues.')); };
      const closed = () => { cleanup(); resolve(fail('TASK_CLOSED', 'The production service is closed. Reopen the project to continue.')); };
      const inspect = () => {
        const task = this.tasks.get(taskId)!;
        if (task.items.some(item => item.state === 'interrupted' || item.needsReview || item.resourceWait === 'unverified' || item.resourceWait === 'policyConflict' || item.issues.some(value => value.code === 'COLLABORATION_WAIT') || task.stagePolicy !== 'external' && item.dependencies.length > 0 && !item.stageAuthorized && item.state === 'queued')) finish('attention');
        else if (task.items.every(item => ['review', 'failed', 'cancelled'].includes(item.state)) && !task.items.some(item => this.running.has(item.id))) finish('terminal');
        else if (task.items.some(item => item.state === 'blocked' && item.dependencies.some(edge => !edge.selectedCandidateId && !task.items.find(parent => parent.id === edge.itemId)?.selectedCandidateId && task.items.find(parent => parent.id === edge.itemId)?.state === 'review'))) finish('attention');
      };
      unsubscribe = this.subscribe(task => { if (task.id === taskId) inspect(); });
      timer = setTimeout(() => finish('timeout'), timeoutMs);
      options.signal?.addEventListener('abort', aborted, { once: true });
      this.lifetime.signal.addEventListener('abort', closed, { once: true });
      if (options.signal?.aborted) aborted(); else inspect();
    });
  }
  private async hostSnapshot(snapshot: import('@galcraft/contracts').ResourceSnapshot, item: TaskItem) {
    try { const hostCommit = await this.options.inspectHostCommit?.(item.configSnapshot!); return { ...snapshot, ...(hostCommit ? { hostCommit } : {}) }; }
    catch (error) { return { ...snapshot, issues: [...snapshot.issues, { ...issue('HOST_MEMORY_UNAVAILABLE', String(error)), severity: 'warning' as const }] }; }
  }
  async inspectTaskResources(taskId: Id, itemId: Id): Promise<Result<import('@galcraft/contracts').ResourceSnapshot>> {
    const task = this.tasks.get(taskId), item = task?.items.find(value => value.id === itemId);
    if (!task || !item?.configSnapshot) return fail('TASK_MISSING', 'The production item does not exist.');
    let lease: GenerationAdapterLease | null = null;
    try { lease = await this.acquire(item, true); if (!lease.adapter.inspectResources) return fail('RESOURCE_UNSUPPORTED', 'This provider has no resource inspection port.');
      const result = await lease.adapter.inspectResources(this.context(task, item, new AbortController().signal));
      return result.ok ? ok(await this.hostSnapshot(result.value, item)) : result;
    } catch (error) { return fail('RESOURCE_INSPECTION', String(error)); }
    finally { await this.releaseAdapter(task, item, lease, false); }
  }
  async releaseTaskResources(taskId: Id, itemId: Id): Promise<Result<import('@galcraft/contracts').ResourceReleaseReceipt>> {
    const task = this.tasks.get(taskId), item = task?.items.find(value => value.id === itemId);
    if (!task || !item?.configSnapshot) return fail('TASK_MISSING', 'The production item does not exist.');
    let lease: GenerationAdapterLease | null = null;
    const endpoint = resourceEndpoint(item); let locked = false;
    try {
      lease = await this.acquire(item, true);
      if (!lease.adapter.releaseResources || !lease.adapter.inspectResources) return fail('RESOURCE_UNSUPPORTED', 'This provider has no resource release port.');
      if (endpoint && (this.preparingResources.has(endpoint) || [...this.tasks.values()].some(task => task.items.some(other => resourceEndpoint(other) === endpoint && this.occupied(other))))) {
        const snapshot = await lease.adapter.inspectResources(this.context(task, item, new AbortController().signal));
        return snapshot.ok ? ok({ status: 'busy', requestedAt: null, before: await this.hostSnapshot(snapshot.value, item), after: null, issues: [] }) : snapshot;
      }
      if (endpoint) { this.preparingResources.add(endpoint); locked = true; }
      const beforeCommit = await this.options.inspectHostCommit?.(item.configSnapshot!).catch(() => undefined);
      const result = await lease.adapter.releaseResources(this.context(task, item, new AbortController().signal));
      if (result.ok) { item.resourceRelease = { ...result.value, before: { ...result.value.before, ...(beforeCommit ? { hostCommit: beforeCommit } : {}) }, ...(result.value.after ? { after: await this.hostSnapshot(result.value.after, item) } : {}) };
        if (result.value.status === 'observed' || result.value.status === 'idle') { delete item.resourceWait; if (endpoint) this.resourceFamilies.set(endpoint, { family: null, ownership: resourcePolicy(item).ownership }); }
        await this.persist(task); }
      return result.ok ? ok(structuredClone(item.resourceRelease!)) : result;
    } catch (error) { return fail('RESOURCE_RELEASE', String(error)); }
    finally { if (endpoint && locked) this.preparingResources.delete(endpoint); await this.releaseAdapter(task, item, lease, false); this.wake(); }
  }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.closed = true; this.lifetime.abort(); this.listeners.clear();
      for (const pending of this.resumptions.values()) pending.resolve();
      this.resumptions.clear();
      for (const controller of this.running.values()) controller.abort();
      this.wakeDrain?.();
      await this.draining;
      await Promise.allSettled(this.executions.values());
    })();
  }
  private async acquire(item: TaskItem, recovery = false): Promise<GenerationAdapterLease> {
    if (recovery && this.options.acquireRecoveryAdapter) return this.options.acquireRecoveryAdapter(item.configSnapshot!,item.providerSnapshot);
    if (!recovery && item.operationSnapshot?.provider && this.options.resolveOperation) await this.options.resolveOperation(item.operationSnapshot.id, item.operationSnapshot);
    if (item.configSnapshot?.providerKey && !item.providerSnapshot) throw new Error(`生成提供者 ${item.configSnapshot.providerKey} 缺少精确版本快照，请重新准备请求`);
    if (this.options.acquireAdapter) return this.options.acquireAdapter(item.configSnapshot!, item.providerSnapshot);
    if (item.providerSnapshot) throw new Error(`请补齐生成提供者 ${item.providerSnapshot.providerKey}@${item.providerSnapshot.packageVersion}`);
    return { adapter: this.options.adapter(item.configSnapshot!), release() {} };
  }
  private async releaseAdapter(task: Task, item: TaskItem, lease: GenerationAdapterLease | null, clearRunning = true): Promise<void> {
    try { await lease?.release(); }
    catch (error) {
      item.issues.push({ ...issue('PROVIDER_RELEASE_FAILED', String(error)), severity: 'warning', actions: [] });
      await this.persist(task);
    } finally { if (clearRunning) this.running.delete(item.id); }
  }
  private remoteCapabilities(item: TaskItem) {
    if (item.providerSnapshot) return item.providerSnapshot.capabilities;
    const remote = inputCapability(item.configSnapshot!, item.input as GenerationInput, item.workflowSnapshot).remote;
    return { query: remote.query, refetch: remote.query, cancelPerTask: remote.cancelQueued || remote.cancelRunning === 'perTask', resume: remote.query };
  }
  async removeTaskRecord(id: Id): Promise<Result<void>> {
    return this.serial(async () => {
      const task = this.tasks.get(id); if (!task) return fail('TASK_MISSING', '制作任务不存在');
      if (task.items.some(item => ['queued', 'submitting', 'running', 'fetching', 'blocked'].includes(item.state) || this.running.has(item.id) || this.resumptions.has(item.id)))
        return fail('TASK_ACTIVE', '请先取消正在执行或等待执行的步骤，再移除任务记录');
      const next = new Set(this.removedTasks); next.add(id);
      await this.store.write(this.store.path('removed-records.json'), [...next]); this.removedTasks = next;
      return ok(undefined);
    });
  }
  getCandidate(id: Id): Candidate | null { return structuredClone(this.candidates.get(id) ?? null); }
  private versionsMatch(expected: VersionRef[]): boolean { return expected.every(value => value.ref.kind === 'document' && this.options.project.readDocument(value.ref.id)?.revision === value.revision); }
  async saveFormDraft(draft: ProductionFormDraft, expectedRevision: number | null): Promise<Result<ProductionFormDraft>> {
    return this.serial(async () => {
      try { IdSchema.parse(draft.id); if (draft.projectId !== this.store.projectId) throw new Error('制作草稿归属不同作品');
        const previous = await this.store.loadDraft(draft.id);
        if ((previous?.revision ?? null) !== expectedRevision) return fail('DRAFT_CONFLICT', '制作草稿版本已变化');
        if (previous?.submittedTaskId) return fail('DRAFT_SUBMITTED', '继续编辑已提交配置需要新草稿身份');
        for (const variant of Object.values(draft.variants)) if (variant?.fields.novelaiPrompt !== undefined) NovelAIPromptSchema.parse(variant.fields.novelaiPrompt);
        const next = structuredClone({ ...draft, revision: (previous?.revision ?? 0) + 1, updatedAt: new Date().toISOString() });
        await this.store.write(this.store.draftPath(draft.id), next); return ok(next);
      } catch (error) { return fail('DRAFT_SAVE', String(error)); }
    });
  }
  async loadFormDraft(id: Id): Promise<Result<ProductionFormDraft | null>> {
    const draft = await this.store.loadDraft(id); if (draft) { const task = [...this.tasks.values()].find(task => task.sourceDraftId === id); if (task) draft.submittedTaskId = task.id; }
    return ok(draft ? normalizeProductionDraft(draft) : null);
  }
  async discardFormDraft(id: Id): Promise<Result<void>> { return this.serial(async () => { await this.store.discardDraft(id); return ok(undefined); }); }
  async planTask(input: TaskPlanInput): Promise<Result<TaskPlan>> {
    try {
      if (input.projectId !== this.store.projectId) throw new Error('任务归属不同作品');
      if ((input.policy === 'continueWithRule') !== (input.selectionRule === 'firstValid')) throw new Error('连续生成需要明确选择 firstValid');
      const items = structuredClone(input.items);
      for (const item of items) item.frozenSourceVersions = structuredClone(item.sourceVersions);
      for (const item of items) if (item.operationSnapshot?.provider && this.options.resolveOperation) item.operationSnapshot = await this.options.resolveOperation(item.operationSnapshot.id, item.operationSnapshot);
      validateItems(items);
      const stageDepth = (item:TaskItem):number => item.dependencies.length ? 1 + Math.max(...item.dependencies.map(edge => stageDepth(items.find(parent => parent.id === edge.itemId)!))) : 0;
      for (const item of items) {
        item.stageId ??= `stage-${stageDepth(item)}`;
        if (item.attempts.length || item.candidateIds.length || item.remote) throw new Error('新计划不能携带旧请求身份');
        if (item.configSnapshot) {
          ConnectionConfigSchema.parse(item.configSnapshot);
          if (item.configSnapshot.protocol === 'plugin' && !item.configSnapshot.providerKey) throw new Error('插件连接缺少生成提供者键');
          if (Object.keys(item.configSnapshot.parameters).some(key => /authorization|api.?key|secret|password|token$/i.test(key))) throw new Error('任务配置只通过 credentialId 引用个人凭据');
        }
        if (item.configSnapshot?.providerKey) {
          if (!this.options.freezeProvider) throw new Error(`生成提供者 ${item.configSnapshot.providerKey} 未连接`);
          const prepared = item.providerSnapshot;
          const sameSelection = prepared?.providerKey === item.configSnapshot.providerKey && prepared.capability.connectionId === item.configSnapshot.id &&
            prepared.capability.connectionRevision === item.configSnapshot.revision && prepared.capability.purpose === item.purpose;
          item.providerSnapshot = structuredClone(sameSelection ? prepared! : await this.options.freezeProvider(item.configSnapshot, item.input as GenerationInput));
          if (item.providerSnapshot.providerKey !== item.configSnapshot.providerKey) throw new Error('生成提供者身份与连接不一致');
        } else delete item.providerSnapshot;
        if(item.providerSnapshot?.execution==='local'&&!item.dependencies.length){const lease=await this.acquire(item);try{const checked=await lease.adapter.validateInput?.(item.input as GenerationInput);if(checked&&!checked.ok)throw new Error(checked.error.message);}finally{await lease.release();}}
        const preparationKey = item.operationSnapshot?.definition.textPreparationKey;
        if(preparationKey) { if(!this.options.acquireTextPreparation)throw new Error(`文字准备能力缺失 ${preparationKey}`);const lease=await this.options.acquireTextPreparation(preparationKey);try{const checked=await lease.provider.validateInput?.(item.input as GenerationInput);if(checked&&!checked.ok)throw new Error(checked.error.message);const preparedInput=lease.provider.prepare(item.input as GenerationInput);if(item.configSnapshot)confirmInput(item.configSnapshot,preparedInput,null,[]);item.textPreparationSnapshot={key:preparationKey,packageVersion:lease.packageVersion,...(lease.provider.transferOperation?{transferOperation:lease.provider.transferOperation}:{})};}finally{await lease.release();} }
        if (item.configSnapshot && !item.textPreparationSnapshot) item.input = confirmInput(item.configSnapshot, item.input as GenerationInput, item.workflowSnapshot, item.omittedPorts ?? item.recipeSnapshot?.omittedPorts ?? [], item.providerSnapshot?.capability);
        const fields = item.input as Record<string, Json>;
        if ('seed' in fields && fields.seed === null && (item.configSnapshot?.parameters.supportsSeed === true || item.workflowSnapshot?.inputs.some(port => port.port === 'seed'))) fields.seed = randomInt(0, 2147483647);
        item.state = item.dependencies.length ? 'blocked' : 'queued';
      }
      const expected = input.expected ?? [...new Map(items.flatMap(item => item.sourceVersions).map(value => [value.ref.id, value])).values()];
      if (!this.versionsMatch(expected)) return fail('TASK_SOURCE_CHANGED', '任务来源已变化');
      if(input.externalCallId) { const previous=[...this.tasks.values()].find(task=>task.externalCallId===input.externalCallId);if(previous) { const saved=await this.store.read<TaskPlan>(this.store.path('external-plans',`${encodeURIComponent(input.externalCallId)}.json`));if(saved)return ok(saved); } }
      const now = new Date().toISOString(), task: Task = { schemaVersion: 1, id: createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents]), projectId: input.projectId, revision: 1, name: input.name, createdAt: now, updatedAt: now,
        stagePolicy: input.stagePolicy ?? 'interactive', collaboration: structuredClone(input.collaboration), externalCallId:input.externalCallId, previousTaskId:input.previousTaskId, previousItemId:input.previousItemId, presetId: null, sourceDraftId: input.sourceDraftId ?? null, context: structuredClone(input.context.filter(part => part.included)), items, policy: input.policy, selectionRule: input.selectionRule };
      const plan: TaskPlan = { sourceDraftRevision: input.sourceDraftRevision, planId: createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents]), expected, task, issues: [], sendSummary: items.filter(item => item.configSnapshot).map(item => ({ itemId: item.id,
        destination: item.configSnapshot!.baseUrl, model: item.configSnapshot!.model, textCharacters: inputTextSummary(item.input as GenerationInput).textCharacters,
        media: this.mediaPaths(item.input), requests: 1, price: null })) };
      await this.store.savePlan(plan); if(input.externalCallId)await this.store.write(this.store.path('external-plans',`${encodeURIComponent(input.externalCallId)}.json`),plan); return ok(structuredClone(plan));
    } catch (error) { return fail('TASK_PLAN', String(error)); }
  }
  private mediaPaths(value: unknown): string[] { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(item => this.mediaPaths(item));
    const item = value as Record<string, unknown>; return typeof item.localPath === 'string' ? [item.localPath] : Object.values(item).flatMap(value => this.mediaPaths(value)); }
  async submit(planId: Id, collaboration?: import('@galcraft/contracts').CollaborationContext): Promise<Result<Task>> {
    if (this.submitted.has(planId)) {const result=await this.submitted.get(planId)!;return collaboration&&result.ok&&result.value.collaboration?.sessionId!==collaboration.sessionId?fail('TASK_COLLABORATION_SCOPE','制作计划不属于当前协作'):result;}
    const submission = this.serial(async (): Promise<Result<Task>> => {
      try {
        const plan = await this.store.read<TaskPlan>(this.store.planPath(planId)); if (!plan) return fail('TASK_PLAN_MISSING', '任务计划不存在');
        if(collaboration&&plan.task.collaboration?.sessionId!==collaboration.sessionId)return fail('TASK_COLLABORATION_SCOPE','制作计划不属于当前协作');
        const existing = this.tasks.get(plan.task.id) ?? [...this.tasks.values()].find(task => plan.task.sourceDraftId && task.sourceDraftId === plan.task.sourceDraftId);
        if (existing && this.removedTasks.has(existing.id)) return fail('TASK_RECORD_REMOVED', '该任务记录已移除，请新建制作草稿；已采用的素材保持不变');
        if (existing) { if(collaboration && !existing.submissionCalls?.includes(`${collaboration.sessionId}-${collaboration.callId}`)){(existing.submissionCalls??=[]).push(`${collaboration.sessionId}-${collaboration.callId}`);await this.persist(existing);}return ok(structuredClone(existing)); }
        if (plan.task.sourceDraftId && plan.sourceDraftRevision !== undefined) {
          const draft = await this.store.loadDraft(plan.task.sourceDraftId);
          if (!draft || draft.revision !== plan.sourceDraftRevision) return fail('TASK_DRAFT_CHANGED', '制作草稿已变化，请重新检查发送计划');
        }
        if (!this.versionsMatch(plan.expected)) return fail('TASK_SOURCE_CHANGED', '提交前来源版本已变化');
        const task = structuredClone(plan.task); if(collaboration)task.submissionCalls=[`${collaboration.sessionId}-${collaboration.callId}`];await this.store.freezeAttachments(task); await this.store.saveTask(task); this.tasks.set(task.id, task);
        if (task.sourceDraftId) { const draft = await this.store.loadDraft(task.sourceDraftId); if (draft) { draft.submittedTaskId = task.id; await this.store.write(this.store.draftPath(draft.id), draft); } }
        return ok(structuredClone(task));
      } catch (error) { return fail('TASK_SUBMIT', String(error)); }
    });
    this.submitted.set(planId, submission); const result = await submission; this.submitted.delete(planId); return result;
  }
  async submitContinuation(planId: Id, taskId: Id, collaboration?: import('@galcraft/contracts').CollaborationContext): Promise<Result<Task>> {
    return this.serial(async () => {
      try {
        const plan = await this.store.read<TaskPlan>(this.store.planPath(planId)), task = this.tasks.get(taskId);
        if (!plan || !task) return fail('TASK_PLAN_MISSING', '任务或后续计划不存在');
        if (collaboration && (collaboration.projectId !== task.projectId || plan.task.collaboration?.sessionId !== collaboration.sessionId)) return fail('TASK_COLLABORATION_SCOPE', 'Prepare the continuation through the current authorized collaboration.');
        if (this.removedTasks.has(task.id)) return fail('TASK_RECORD_REMOVED', '该任务已移除，请新建制作');
        if (plan.task.projectId !== task.projectId || plan.task.items.some(item => item.conversation && !task.items.some(original => original.candidateIds.includes(item.conversation!.parentCandidateId)))) return fail('TASK_PLAN_CHANGED', '后续计划不属于当前任务');
        if (plan.task.items.every(item => task.items.some(existing => existing.id === item.id))) return ok(structuredClone(task));
        if (!this.versionsMatch(plan.expected)) return fail('TASK_SOURCE_CHANGED', '提交前来源版本已变化');
        if (plan.task.items.some(item => task.items.some(existing => existing.id === item.id))) return fail('TASK_PLAN_CHANGED', '后续步骤身份重复');
        const extension = structuredClone({ ...plan.task, id: task.id });
        if (collaboration) for (const item of extension.items) await this.options.authorize?.({ ...task, executionCollaboration: collaboration }, item, false);
        await this.store.freezeAttachments(extension);
        if (collaboration) { task.executionCollaboration = structuredClone(collaboration); task.stagePolicy = 'external'; }
        task.items.push(...extension.items); await this.persist(task);
        return ok(structuredClone(task));
      } catch (error) { return fail('TASK_SUBMIT', String(error)); }
    });
  }
  private async persist(task: Task) { task.revision++; task.updatedAt = new Date().toISOString(); await this.store.saveTask(task); for (const listener of this.listeners) listener(structuredClone(task)); }
  private context(task: Task, item: TaskItem, signal: AbortSignal): SubmissionContext { return { requestId: item.attempts.at(-1)?.id ?? createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents]), config: item.configSnapshot!, workflow: item.workflowSnapshot,
    directory: this.store.path(task.id, 'items', item.id, 'outputs'), signal, beforeSend: async()=>{ await this.options.authorize?.(task,item,true);const attempt=item.attempts.at(-1);if(attempt&&!attempt.sentAt){attempt.sentAt=new Date().toISOString();await this.persist(task);} } }; }
  private parentsReady(task: Task, item: TaskItem): boolean {
    return item.dependencies.every(edge => { const parent = task.items.find(value => value.id === edge.itemId)!;
      const selected = edge.selectedCandidateId ?? parent.selectedCandidateId, candidate = selected && this.candidates.get(selected);
      if (!candidate || candidate.partial || candidate.checks.some(issue => issue.severity === 'error') || parent.needsReview) return false;
      edge.selectedCandidateId = candidate.id; return true; });
  }
  private domain(item: TaskItem): string { return item.configSnapshot ? `connection:${item.configSnapshot.id}` : 'local'; }
  private occupied(item: TaskItem): boolean {
    if (this.running.has(item.id)) return true;
    return !!item.remote && !['review', 'failed', 'cancelled'].includes(item.state) && item.remoteOutput === undefined &&
      !['completed', 'failed', 'cancelled'].includes(item.attempts.at(-1)?.outcome ?? 'unknown');
  }
  private concurrency(item: TaskItem): number {
    const value = item.configSnapshot?.concurrency;
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
  }
  private canStart(item: TaskItem): boolean {
    const endpoint = resourceEndpoint(item);
    if (endpoint) {
      if (this.preparingResources.has(endpoint)) return false;
      const active = [...this.tasks.values()].flatMap(task => task.items).filter(other => other.id !== item.id && resourceEndpoint(other) === endpoint && this.occupied(other));
      if (active.some(other => resourceFamily(other) !== resourceFamily(item) || resourcePolicy(other).release === 'afterTask' || resourcePolicy(item).release === 'afterTask')) return false;
    }
    const occupied = [...this.tasks.values()].flatMap(task => task.items).filter(other => this.domain(other) === this.domain(item) && this.occupied(other));
    const limit = Math.min(this.concurrency(item), ...occupied.map(other => this.concurrency(other)));
    return occupied.length + 1 <= limit;
  }
  private wake(): void { if (this.draining) this.wakeDrain?.(); else if (!this.closed) void this.drain(); }
  private start<T>(item: TaskItem, action: () => Promise<T>): Promise<T> {
    const work = action().finally(() => { this.executions.delete(item.id); if (!this.draining) this.wake(); });
    this.executions.set(item.id, work); this.wakeDrain?.(); return work;
  }
  async drain(): Promise<void> {
    if (this.closed) return;
    if (this.draining) { this.wakeDrain?.(); return this.draining; }
    this.draining = (async () => { while (!this.closed) {
      const waiting = new Set<string>(), waitingInstances = new Set<string>();
      const tasks = [...this.tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const task of tasks) for (const item of task.items) {
        if (this.closed) return;
        const resumption = this.resumptions.get(item.id);
        if (item.state === 'blocked' && this.parentsReady(task, item) && !item.needsReview) item.state = 'queued';
        if (task.stagePolicy !== 'external' && item.dependencies.length && item.configSnapshot && item.providerSnapshot?.execution !== 'local' && !item.stageAuthorized) continue;
        if (this.running.has(item.id) || !resumption && (item.state !== 'queued' || item.needsReview || !this.parentsReady(task, item))) continue;
        const domain = this.domain(item);
        const endpoint = resourceEndpoint(item);
        if (!resumption && item.resourceWait === 'unverified') continue;
        if (!resumption && endpoint) {
          const policy = resourcePolicy(item);
          const conflict = [...this.tasks.values()].flatMap(task => task.items).some(other => other.id !== item.id && resourceEndpoint(other) === endpoint && this.occupied(other) && !isDeepStrictEqual(resourcePolicy(other), policy));
          if (conflict) { if (item.resourceWait !== 'policyConflict') { item.resourceWait = 'policyConflict'; item.issues = [issue('COMFY_RESOURCE_POLICY_CONFLICT', 'Active connections to this ComfyUI instance declare different resource policies.')]; await this.persist(task); } continue; }
          if (item.resourceWait === 'policyConflict') { delete item.resourceWait; item.issues = item.issues.filter(value => value.code !== 'COMFY_RESOURCE_POLICY_CONFLICT'); }
          if (waitingInstances.has(endpoint)) continue;
        }
        // A known interrupted request already reserves its slot; querying it adds no occupancy.
        const reserved = !!resumption && this.occupied(item);
        if (!reserved && waiting.has(domain)) continue;
        if (!reserved && !this.canStart(item)) { waiting.add(domain); if (endpoint) waitingInstances.add(endpoint); continue; }
        if (resumption) {
          this.resumptions.delete(item.id);
          this.start(item, () => this.resumeItem(task, item)).then(resumption.resolve, resumption.reject);
        } else { try { await this.options.authorize?.(task,item,false); } catch(error) { const message=String(error);if(!item.issues.some(value=>value.code==='COLLABORATION_WAIT'&&value.message===message)){item.issues=[issue('COLLABORATION_WAIT',message)];await this.persist(task);}continue; } if (this.closed) return; this.start(item, () => this.run(task, item)); }
      }
      if (!this.executions.size) break;
      const wake = new Promise<void>(resolve => { this.wakeDrain = resolve; });
      try { await Promise.race([...this.executions.values(), wake]); } finally { this.wakeDrain = null; }
    } })();
    try { await this.draining; } finally { this.draining = null; }
  }
  private async run(task: Task, item: TaskItem): Promise<void> {
    const controller = new AbortController(); this.running.set(item.id, controller);
    const endpoint = resourceEndpoint(item), policy = resourcePolicy(item);
    if (endpoint && policy.ownership === 'exclusive' && policy.release !== 'manual') this.preparingResources.add(endpoint);
    let text = '', lastTextWrite = 0, lastProgressWrite = 0, outputReceived = false;
    let lease: GenerationAdapterLease | null = null;
    let preparation: Awaited<ReturnType<NonNullable<ProductionOptions['acquireTextPreparation']>>> | null = null;
    try {
      await this.options.authorize?.(task,item,false);
      const parents = item.dependencies.map(edge => this.candidates.get(edge.selectedCandidateId!)!);
      for (const [index, edge] of item.dependencies.entries()) {
        if (edge.output === 'prompt' && !item.operationSnapshot?.provider) {
          const parent = parents[index]!, purpose = parent.recipeSnapshot?.purpose ?? parent.operation;
          if (!purpose) throw new Error('提示准备步骤缺少输出契约');
          const parsed = parsePrompt(await this.store.text(parent), purpose as import('../recipes/schema.js').RecipePurpose);
          if (!parsed.ok) throw new Error(parsed.error.message);
          const input = item.input as GenerationInput, prompt = parsed.value;
          if ('fields' in input && prompt.kind === 'speechText') { input.fields.text = prompt.spokenText; }
          if (input.purpose === 'image' && prompt.kind === 'imagePrompt') { input.positive = prompt.positive; input.negative = prompt.negative ?? ''; }
          else if (input.purpose === 'difference' && prompt.kind === 'differencePrompt') { input.instruction = prompt.instruction; input.negative = prompt.negative ?? ''; }
          else if (input.purpose === 'speech' && prompt.kind === 'speechText') { input.text = prompt.spokenText; input.emotion = prompt.emotion; }
          else if (input.purpose === 'music' && prompt.kind === 'musicPrompt') { input.prompt = prompt.prompt; input.lyrics = input.instrumental ? null : prompt.lyrics; }
          else throw new Error('提示输出与下游用途不匹配');
          continue;
        }
        if (edge.output === 'context' && !item.operationSnapshot?.provider) {
          const input = item.input as GenerationInput;
          if (input.purpose === 'text' && !item.attempts.length) input.messages.push({ role: 'user', text: `已选上游候选 ${parents[index]!.id}\n${await this.store.text(parents[index]!).catch(() => '已生成媒体，按计划中的资源 key 引用。')}`, attachments: [] });
          continue;
        }
        const parent = parents[index]!, artifact = parent.artifacts.find(value => value.role === 'primary' && (!edge.sourcePort || value.port === edge.sourcePort || !value.port && parent.operationSnapshot?.definition.outputs.length === 1 && parent.operationSnapshot.definition.outputs[0]?.key === edge.sourcePort) && (item.operationSnapshot?.provider || edge.output !== 'references' || value.kind === 'image'));
        if (!artifact) throw new Error('选定依赖没有完整产物');
        const extension = isExtensionInput(item.input as GenerationInput) ? item.input as Extract<GenerationInput, { fields: unknown }> : null;
        const fields = extension ? extension.fields : item.input as Record<string, Json>;
        if (artifact.kind === 'text') fields[edge.output] = await this.store.text(parent, artifact);
        else { const media: MediaInput = { assetId: null, variantId: null, candidateId: parent.id, artifactIndex: parent.artifacts.indexOf(artifact), localPath: artifact.localPath, mime: artifact.mime, kind: artifact.kind as import('@galcraft/contracts').AssetKind, ...(artifact.typeVersion ? { typeVersion: artifact.typeVersion } : {}), ...(extension ? { port: edge.output } : {}) };
          if (extension || edge.output === 'references') {
            const reference = this.options.prepareReference ? await this.options.prepareReference(media) : media;
            const previous = extension ? extension.references : (fields.references ?? []) as MediaInput[];
            const next = [...previous.filter(value => value.candidateId !== reference.candidateId || extension && value.port !== reference.port), reference];
            if (extension) extension.references = next; else fields.references = next;
          } else fields[edge.output] = media; }
      }
      let executionInput = item.input as GenerationInput;
      if(item.textPreparationSnapshot){if(!this.options.acquireTextPreparation)throw new Error('文字准备能力缺失');preparation=await this.options.acquireTextPreparation(item.textPreparationSnapshot.key,item.textPreparationSnapshot.packageVersion);
        const checked=await preparation.provider.validateInput?.(item.input as GenerationInput);if(checked&&!checked.ok)throw new Error(checked.error.message);executionInput=preparation.provider.prepare(item.input as GenerationInput);}
      if (item.configSnapshot) {
        if (item.operationSnapshot) validateOperationInput(item.input as GenerationInput, item.operationSnapshot);
        if(preparation)executionInput=confirmInput(item.configSnapshot,executionInput,null,[]);
        else executionInput=item.input=confirmInput(item.configSnapshot, item.input as GenerationInput, item.workflowSnapshot, item.omittedPorts ?? item.recipeSnapshot?.omittedPorts ?? [], item.providerSnapshot?.capability);
        lease = await this.acquire(item);
        const checked=await lease.adapter.validateInput?.(executionInput);if(checked&&!checked.ok)throw new Error(checked.error.message);
        if (!await this.prepareResources(task, item, lease.adapter, controller.signal)) return;
      }
      if (endpoint) { this.preparingResources.delete(endpoint); this.wakeDrain?.(); }
      controller.signal.throwIfAborted();
      item.state = 'submitting'; item.attempts.push({ id: createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents]), createdAt: new Date().toISOString(), sentAt:null, remote: null, outcome: 'pending' }); await this.persist(task);
      controller.signal.throwIfAborted();
      const ctx = this.context(task, item, controller.signal);
      if (!item.configSnapshot) {
        if (!this.options.localStep) throw new Error('本地步骤提供方未连接');
        const artifacts = await this.options.localStep(item, parents, ctx.directory, controller.signal); controller.signal.throwIfAborted(); await this.recordOutput(task, item, artifacts, null, false); return;
      }
      for await (const event of lease!.adapter.submit(executionInput, ctx)) {
        if (event.kind === 'accepted') { item.remote = event.remote; item.attempts.at(-1)!.remote = event.remote; if (!controller.signal.aborted) item.state = 'running'; }
        else if (controller.signal.aborted) break;
        else if (event.kind === 'progress') {
          const { kind: _kind, ...progress } = event, previous = item.progress;
          item.progress = progress;
          if (previous.phase === progress.phase && previous.nodeId === progress.nodeId && previous.scope === progress.scope && Date.now() - lastProgressWrite < 500) continue;
          lastProgressWrite = Date.now();
        }
        else if (event.kind === 'textDelta') { text += event.text; if (Date.now() - lastTextWrite > 1000) { await this.store.write(this.store.path(task.id, 'items', item.id, 'partial.json'), { text }); lastTextWrite = Date.now(); } }
        else if (event.kind === 'output') { outputReceived = true; const artifacts = [...event.artifacts];
          if (text && !artifacts.some(artifact => artifact.kind === 'text')) artifacts.push(await this.textArtifact(task, item, text));
          if(preparation){const raw=artifacts.filter(a=>a.kind==='text').length ? (await Promise.all(artifacts.filter(a=>a.kind==='text').map(a=>readFile(a.localPath,'utf8')))).join('\n') : text;item.rawOutput=raw;await this.store.write(this.store.path(task.id,'items',item.id,'raw-output.json'),{text:raw});const processed=await preparation.provider.process(raw,item.input as GenerationInput,ctx);await this.recordOutput(task,item,processed,event.usage,false);}else await this.recordOutput(task, item, artifacts, event.usage, false); }
        else { item.issues = [event.issue]; if (event.details) item.remoteError = event.details; item.progress = { phase: event.remoteStatus === 'unknown' ? 'unknown' : 'failed', completed: null, total: null, scope: 'unknown', updatedAt: new Date().toISOString() }; if (!controller.signal.aborted) item.state = event.remoteStatus === 'unknown' ? 'interrupted' : 'failed'; item.attempts.at(-1)!.outcome = event.remoteStatus; }
        await this.persist(task);
      }
      if (!outputReceived && text) await this.recordOutput(task, item, [await this.textArtifact(task, item, text)], null, true);
      if (!outputReceived && !['cancelled', 'failed', 'interrupted'].includes(item.state)) { item.state = 'interrupted'; item.attempts.at(-1)!.outcome = 'unknown'; await this.persist(task); }
    } catch (error) { if (preparation && item.rawOutput && !item.candidateIds.length) await this.recordOutput(task,item,[await this.textArtifact(task,item,item.rawOutput)],null,true); if (item.state !== 'cancelled') { const domainFailure = !!preparation && outputReceived; item.state = domainFailure ? 'failed' : 'interrupted'; item.progress = { phase: domainFailure ? 'failed' : 'unknown', completed: null, total: null, scope: 'unknown', updatedAt: new Date().toISOString() }; item.issues = [{ ...issue(domainFailure ? 'PREPARATION_RESULT_INVALID' : item.providerSnapshot && !lease ? 'PROVIDER_UNAVAILABLE' : 'TASK_INTERRUPTED', String(error)),
        ...(item.providerSnapshot && !lease ? { actions: ['supplyDependency' as const] } : {}) }]; if (item.attempts.length) item.attempts.at(-1)!.outcome = domainFailure ? 'failed' : 'unknown'; }
      if (!outputReceived && text) await this.recordOutput(task, item, [await this.textArtifact(task, item, text)], null, true);
      await this.persist(task);
    } finally {
      if (endpoint) this.preparingResources.delete(endpoint);
      if (endpoint && lease && policy.ownership === 'exclusive' && policy.release === 'afterTask' && !controller.signal.aborted && (outputReceived || item.state === 'failed')) {
        this.preparingResources.add(endpoint);
        try { await this.observeRelease(task, item, lease.adapter, controller.signal); }
        catch (error) { item.issues.push(issue('RESOURCE_RELEASE', String(error))); }
        finally { this.preparingResources.delete(endpoint); }
      }
      await preparation?.release(); await this.releaseAdapter(task, item, lease); await this.persist(task);
    }
  }
  private async observeRelease(task: Task, item: TaskItem, adapter: GenerationAdapter, signal: AbortSignal): Promise<boolean> {
    if (!adapter.releaseResources) { item.resourceWait = 'unverified'; item.issues = [issue('RESOURCE_UNSUPPORTED', 'The selected provider has no resource release port.')]; await this.persist(task); return false; }
    while (!signal.aborted) {
      item.progress = { phase: 'releasingResources', scope: 'unknown', completed: null, total: null, updatedAt: new Date().toISOString() };
      const beforeCommit = await this.options.inspectHostCommit?.(item.configSnapshot!).catch(() => undefined);
      const result = await adapter.releaseResources(this.context(task, item, signal));
      if (!result.ok) { item.resourceWait = 'unverified'; item.issues = result.issues; await this.persist(task); return false; }
      item.resourceRelease = { ...result.value, before: { ...result.value.before, ...(beforeCommit ? { hostCommit: beforeCommit } : {}) }, ...(result.value.after ? { after: await this.hostSnapshot(result.value.after, item) } : {}) };
      if (result.value.status === 'busy') { item.resourceWait = 'busy'; item.progress.phase = 'waitingForResources'; await this.persist(task); await delay(1000, undefined, { signal }); continue; }
      if (result.value.status === 'unverified') { item.resourceWait = 'unverified'; item.issues = result.value.issues; await this.persist(task); return false; }
      delete item.resourceWait; item.issues = item.issues.filter(value => !value.code.startsWith('RESOURCE_'));
      const endpoint = resourceEndpoint(item); if (endpoint) this.resourceFamilies.set(endpoint, { family: null, ownership: resourcePolicy(item).ownership });
      await this.persist(task); return true;
    }
    signal.throwIfAborted(); return false;
  }
  private async prepareResources(task: Task, item: TaskItem, adapter: GenerationAdapter, signal: AbortSignal): Promise<boolean> {
    const endpoint = resourceEndpoint(item); if (!endpoint) return true;
    const policy = resourcePolicy(item), last = this.resourceFamilies.get(endpoint), family = resourceFamily(item);
    if (policy.ownership === 'exclusive' && policy.release !== 'manual' && (!last || last.ownership !== 'exclusive' || last.family !== null && last.family !== family)) {
      if (!await this.observeRelease(task, item, adapter, signal)) return false;
    }
    this.resourceFamilies.set(endpoint, { family, ownership: policy.ownership }); return true;
  }
  private async textArtifact(task: Task, item: TaskItem, text: string): Promise<Artifact> {
    const folder = this.store.path(task.id, 'items', item.id, 'outputs'); await mkdir(folder, { recursive: true }); const path = join(folder, `${createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents])}.txt`); await writeFile(path, text);
    return { kind: 'text', localPath: path, mime: 'text/plain', bytes: Buffer.byteLength(text), metadata: {}, groupId: 'text/0', role: 'primary', background: null };
  }
  private async candidateChecks(candidate: Candidate, item: TaskItem): Promise<Issue[]> {
    const purpose = candidate.recipeSnapshot?.purpose ?? candidate.operation;
    const checks: Issue[] = [];
    if (item.operationSnapshot) checks.push(...operationOutputIssues(item.operationSnapshot, purpose==='svg'?candidate.artifacts.filter(artifact=>artifact.kind==='text'):candidate.artifacts).map(message => issue('OPERATION_OUTPUT', message)));
    if (purpose && ['imagePrompt', 'novelaiPrompt', 'differencePrompt', 'speechText', 'musicPrompt'].includes(purpose)) {
      const parsed = parsePrompt(await this.store.text(candidate), purpose as import('../recipes/schema.js').RecipePurpose);
      if (!parsed.ok) checks.push(...parsed.issues);
    }
    return [...checks, ...await this.options.validateCandidate?.(candidate, item) ?? []];
  }
  private async recordOutput(task: Task, item: TaskItem, artifacts: Artifact[], usage: Json | null, partial: boolean, updateAttempt = true): Promise<void> {
    if (!artifacts.length) throw new Error('没有可审阅产物');
    const groups = [...new Set(artifacts.filter(value => value.role === 'primary').map(value => value.groupId))];
    for (const group of groups) {
      const id = createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents]), directory = this.store.candidatePath(task.id, item.id, id); await mkdir(directory, { recursive: true });
      const owned: Artifact[] = [];
      for (const artifact of artifacts.filter(value => value.groupId === group)) {
        const path = join(directory, basename(artifact.localPath)); await copyFile(artifact.localPath, path); owned.push({ ...artifact, localPath: path, bytes: (await stat(path)).size });
      }
      const candidate: Candidate = { schemaVersion: 1, id, taskId: task.id, itemId: item.id, createdAt: new Date().toISOString(), artifacts: owned, partial,
        operation: item.operation, operationSnapshot: structuredClone(item.operationSnapshot), backgroundPreview: structuredClone(item.backgroundPreview), idAliases: structuredClone(item.idAliases ?? item.recipeSnapshot?.idAliases), idCommands: structuredClone(item.idCommands), parentCandidateIds: item.conversation ? [item.conversation.parentCandidateId] : item.dependencies.flatMap(edge => edge.selectedCandidateId ? [edge.selectedCandidateId] : []), input: structuredClone(item.input) as Json,
        provenance: { connectionName: item.configSnapshot?.name ?? '本地处理', protocol: item.configSnapshot?.protocol ?? null, model: item.configSnapshot?.model ?? null, workflowVersion: item.workflowSnapshot?.graphVersion ?? null,
          seed: (item.input as { seed?: number }).seed ?? null, usage, serviceRequestId: item.remote?.id ?? null,
          ...(item.providerSnapshot ? { providerKey: item.providerSnapshot.providerKey, packageVersion: item.providerSnapshot.packageVersion } : {}) }, editedText: null, sourceVersions: structuredClone(item.sourceVersions), recipeSnapshot: structuredClone(item.recipeSnapshot), uiCompositionId: null, checks: [], adoption: [] };
      candidate.checks = await this.candidateChecks(candidate, item);
      const dimensions = item.input as { width?: number; height?: number };
      for (const artifact of candidate.artifacts.filter(value => value.kind === 'image' && value.role === 'primary')) {
        const actual = artifact.metadata as { width?: number; height?: number };
        if (dimensions.width && (actual.width !== dimensions.width || actual.height !== dimensions.height)) candidate.checks.push({ ...issue('OUTPUT_DIMENSIONS', `请求 ${dimensions.width}×${dimensions.height}，实际 ${actual.width}×${actual.height}`), severity: 'warning' });
      }
      await this.store.saveCandidate(candidate); this.candidates.set(id, candidate); item.candidateIds.push(id);
      if (!partial && !candidate.checks.some(issue => issue.severity === 'error') && (task.policy === 'continueWithRule' || task.items.some(next=>next.dependencies.some(edge=>edge.itemId===item.id) && (!next.configSnapshot || next.providerSnapshot?.execution==='local'))) && !item.selectedCandidateId) item.selectedCandidateId = id;
    }
    if (!partial) {
      item.state = 'review';
      if (updateAttempt) item.attempts.at(-1)!.outcome = 'completed';
      if (item.issues.some(issue => issue.code === 'PREPARATION_RESULT_INVALID')) {
        item.issues = item.issues.filter(issue => issue.code !== 'PREPARATION_RESULT_INVALID');
        item.progress = { phase: 'review', completed: null, total: null, scope: 'unknown', updatedAt: new Date().toISOString() };
      }
    }
    await this.persist(task);
  }
  async authorizeStage(taskId:Id,itemId:Id):Promise<Result<Task>> {
    const task=this.tasks.get(taskId),item=task?.items.find(value=>value.id===itemId);
    if(!task||!item)return fail('TASK_MISSING','制作阶段不存在');
    if(!['queued','blocked'].includes(item.state)||item.attempts.length)return fail('STAGE_STATE','当前阶段已执行；新请求请准备关联新计划');
    const stage=task.items.filter(value=>value.id===item.id||!!item.stageId&&value.stageId===item.stageId).filter(value=>['queued','blocked'].includes(value.state)&&!value.attempts.length);
    if(stage.some(value=>value.needsReview||!this.parentsReady(task,value)))return fail('STAGE_PARENT','请先复核本阶段各项并选择有效的上游候选');
    for(const value of stage)value.stageAuthorized=true;await this.persist(task);this.wake();return ok(structuredClone(task));
  }
  async reprocess(taskId:Id,itemId:Id,text?:string,sourceCandidateId?:Id,collaboration?:import('@galcraft/contracts').CollaborationContext):Promise<Result<Task>> {
    const task=this.tasks.get(taskId),item=task?.items.find(value=>value.id===itemId);
    if(!task||!item?.textPreparationSnapshot||!this.options.acquireTextPreparation)return fail('PREPARATION_MISSING','领域处理能力不可用');
    if(this.running.has(item.id))return fail('PREPARATION_RUNNING','请等待当前生成或取回结束后再处理结果');
    const parent=sourceCandidateId??item.candidateIds.at(-1);if(parent&&!item.candidateIds.includes(parent))return fail('CANDIDATE_MISSING','候选不属于当前制作步骤');
    const lease=await this.options.acquireTextPreparation(item.textPreparationSnapshot.key,item.textPreparationSnapshot.packageVersion);
    try {const raw=text??item.rawOutput;if(raw===undefined)throw new Error('原始输出缺失');const context={...this.context(task,item,new AbortController().signal),directory:this.store.path(task.id,'items',item.id,'reprocess',createId())};const artifacts=await lease.provider.process(raw,item.input as GenerationInput,context);item.rawOutput=raw;await this.recordOutput(task,item,artifacts,null,false,false);if(parent){const candidate=this.candidates.get(item.candidateIds.at(-1)!)!;candidate.parentCandidateIds=[...new Set([...candidate.parentCandidateIds,parent])];await this.store.saveCandidate(candidate);}this.recordExternalAction(task,collaboration,{action:'reprocess'});await this.persist(task);return ok(structuredClone(task));}
    catch(error){return fail('PREPARATION_RESULT',String(error));}finally{await lease.release();}
  }
  async resume(taskId: Id, collaboration?:import('@galcraft/contracts').CollaborationContext): Promise<Result<Task>> {
    const task = this.tasks.get(taskId); if (!task) return fail('TASK_MISSING', '任务不存在');
    if (this.closed) return fail('TASK_CLOSED', '制作服务已关闭');
    if(collaboration){
      if(collaboration.projectId!==task.projectId)return fail('TASK_PROJECT_MISMATCH','Continue this task from its original project.');
      const proposed={...task,executionCollaboration:structuredClone(collaboration)};
      try{for(const item of task.items)if(!item.remote&&!this.running.has(item.id)&&['queued','blocked'].includes(item.state))await this.options.authorize?.(proposed,item,false);}catch(error){return fail('TASK_COLLABORATION_AUTHORIZATION',String(error));}
      task.executionCollaboration=structuredClone(collaboration);await this.persist(task);
    }
    const work: Promise<void>[] = [];
    for (const item of task.items) {
      if (!['interrupted', 'cancelled'].includes(item.state) || !item.remote || this.running.has(item.id)) continue;
      const capabilities = this.remoteCapabilities(item);
      if (!capabilities.resume) { item.issues = [issue('REMOTE_RESUME_UNSUPPORTED', '此提供者不支持原任务续接；新增请求需要作者确认')]; continue; }
      let pending = this.resumptions.get(item.id);
      if (!pending) {
        let resolve!: () => void, reject!: (error: unknown) => void;
        const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
        pending = { promise, resolve, reject }; this.resumptions.set(item.id, pending);
      }
      work.push(pending.promise);
    }
    this.wake();
    await Promise.all(work);
    this.recordExternalAction(task,collaboration,{action:'resume'});await this.persist(task); return ok(structuredClone(task));
  }
  private applyRemoteStatus(item: TaskItem, status: RemoteStatus): void {
    item.progress.phase = status.state;
    item.progress.updatedAt = new Date().toISOString();
    if (status.errorDetails) item.remoteError = status.errorDetails;
    const attempt = item.attempts.at(-1);
    if (status.state === 'completed') { item.remoteOutput = status.output; if (attempt) attempt.outcome = 'completed'; }
    else if (status.state === 'failed' || status.state === 'cancelled') {
      item.state = status.state; item.issues = status.issues; if (attempt) attempt.outcome = status.state;
    } else if (status.state === 'queued' || status.state === 'running') { if (attempt) attempt.outcome = 'pending'; }
  }
  private async resumeItem(task: Task, item: TaskItem): Promise<void> {
    const capabilities = this.remoteCapabilities(item);
    let lease: GenerationAdapterLease | null = null;
    const controller = new AbortController(); this.running.set(item.id, controller);
    try {
      lease = await this.acquire(item,true);
      const ctx = this.context(task, item, controller.signal);
      let completed = item.remoteOutput !== undefined;
      if (capabilities.query) {
        while (true) {
          controller.signal.throwIfAborted();
          const status = await lease.adapter.query(item.remote!, ctx); controller.signal.throwIfAborted();
          if (!status.ok) { item.issues = status.issues; break; }
          this.applyRemoteStatus(item, status.value); completed = status.value.state === 'completed';
          if (status.value.state !== 'queued' && status.value.state !== 'running') {
            if (status.value.state === 'unknown') item.issues = [issue('REMOTE_STATUS_UNKNOWN', 'The remote state is unknown; a new request requires author confirmation.')];
            break;
          }
          item.state = 'running'; item.issues = []; await this.persist(task);
          await delay(1000, undefined, { signal: controller.signal });
        }
      } else if (!completed) item.issues = [issue('REMOTE_QUERY_UNSUPPORTED', 'This provider cannot query the remote request. Its state is unknown; a new request requires author confirmation.')];
      if (completed) {
        if (!capabilities.refetch) { item.state = 'interrupted'; item.issues = [issue('REMOTE_REFETCH_UNSUPPORTED', 'The original request completed, but this provider cannot refetch its output.')]; return; }
        item.state = 'fetching'; await this.persist(task);
        const files = await lease.adapter.fetch(item.remote!, item.remoteOutput ?? null, ctx); controller.signal.throwIfAborted();
        if (files.ok) { item.issues = []; await this.recordOutput(task, item, files.value, null, false); }
        else { item.state = 'interrupted'; item.issues = files.issues; }
      }
      if (item.state === 'running') item.state = 'interrupted';
    } catch (error) {
      if (item.state !== 'cancelled') {
        item.state = 'interrupted';
        if (!controller.signal.aborted) item.issues = lease ? [issue('REMOTE_QUERY', String(error))] : [{ ...issue('PROVIDER_UNAVAILABLE', String(error)), actions: ['supplyDependency'] }];
        if (item.attempts.at(-1)?.outcome === 'pending') item.attempts.at(-1)!.outcome = 'unknown';
      } else if (!controller.signal.aborted) item.issues = [{ ...issue('PROVIDER_UNAVAILABLE', String(error)), actions: ['supplyDependency'] }];
    } finally { await this.releaseAdapter(task, item, lease); await this.persist(task); }
  }
  async queryRemote(taskId: Id, itemId: Id): Promise<Result<import('@galcraft/contracts').RemoteStatus>> {
    const task = this.tasks.get(taskId), item = task?.items.find(item => item.id === itemId);
    if (!task || !item || !item.remote) return fail('REMOTE_TASK_MISSING', 'This task has no remote request identity to query.');
    if (!this.remoteCapabilities(item).query) return fail('REMOTE_QUERY_UNSUPPORTED', 'This provider cannot query the original request.');
    let lease: GenerationAdapterLease | null = null;
    try {
      lease = await this.acquire(item,true); const result = await lease.adapter.query(item.remote, this.context(task, item, new AbortController().signal));
      if (result.ok) this.applyRemoteStatus(item, result.value);
      else item.issues = result.issues;
      await this.persist(task); return result;
    } catch (error) { const unavailable = { ...issue('PROVIDER_UNAVAILABLE', String(error)), actions: ['supplyDependency' as const] }; return { ok: false, error: unavailable, issues: [unavailable] }; }
    finally { try { await lease?.release(); } finally { this.wake(); } }
  }
  async refetch(taskId: Id, itemId: Id, collaboration?:import('@galcraft/contracts').CollaborationContext): Promise<Result<Task>> {
    const task = this.tasks.get(taskId), item = task?.items.find(item => item.id === itemId);
    if (!task || !item || !item.remote) return fail('REMOTE_TASK_MISSING', 'This task has no remote request identity to refetch.');
    if (!this.remoteCapabilities(item).refetch) return fail('REMOTE_REFETCH_UNSUPPORTED', 'This provider cannot refetch output.');
    if (item.remoteOutput === undefined) return fail('REMOTE_OUTPUT_UNKNOWN', 'No original output is confirmed. Query the original remote request first.');
    if (this.running.has(item.id) || this.resumptions.has(item.id)) return fail('TASK_ACTIVE', 'This task item is active.');
    return this.start(item, async () => {
      const controller = new AbortController(); this.running.set(item.id, controller); let lease: GenerationAdapterLease | null = null;
      try {
        lease = await this.acquire(item,true); item.state = 'fetching'; await this.persist(task);
        const output = await lease.adapter.fetch(item.remote!, item.remoteOutput!, this.context(task, item, controller.signal)); controller.signal.throwIfAborted();
        if (!output.ok) { item.state = 'interrupted'; item.issues = output.issues; await this.persist(task); return output; }
        item.issues = []; await this.recordOutput(task, item, output.value, null, false);this.recordExternalAction(task,collaboration,{action:'refetch'});await this.persist(task); return ok(structuredClone(task));
      } catch (error) { if (item.state !== 'cancelled') { item.state = 'interrupted'; item.issues = [{ ...issue('PROVIDER_UNAVAILABLE', String(error)), actions: ['supplyDependency'] }]; } await this.persist(task); return fail('REMOTE_REFETCH_FAILED', String(error)); }
      finally { await this.releaseAdapter(task, item, lease); }
    });
  }
  async retryItem(taskId: Id, itemId: Id, confirmNewRequest: boolean): Promise<Result<TaskPlan>> {
    const task=this.tasks.get(taskId),original=task?.items.find(item=>item.id===itemId);
    if(!task||!original)return fail('TASK_MISSING','任务项不存在');
    if(!confirmNewRequest||!['failed','interrupted','cancelled'].includes(original.state)||this.running.has(original.id)||this.resumptions.has(original.id))return fail('NEW_REQUEST_CONFIRMATION','请先停止原步骤，再准备新增请求计划');
    try {
      let item=structuredClone(original);
      if(original.needsReview)return fail('REPREPARE_SOURCE','来源或上游候选已变化，请复核当前制作输入后重新准备');
      item=this.options.refreshItem?await this.options.refreshItem(item):item;
      item.id=createId([this.tasks,this.candidates,this.options.project.documents]);item.remote=null;delete item.remoteOutput;delete item.providerSnapshot;delete item.textPreparationSnapshot;delete item.rawOutput;delete item.stageAuthorized;
      delete item.remoteError;delete item.resourceRelease;delete item.resourceWait;item.progress={phase:'',completed:null,total:null};
      item.attempts=[];item.candidateIds=[];item.selectedCandidateId=null;item.issues=[];item.needsReview=false;
      item.dependencies=[];item.sourceVersions=item.sourceVersions.map(value=>({...value,revision:this.options.project.readDocument(value.ref.id)?.revision??value.revision}));
      return this.planTask({projectId:task.projectId,name:`${task.name} · 新请求`,context:task.context,items:[item],policy:'waitForSelection',selectionRule:null,previousTaskId:task.id,previousItemId:original.id,stagePolicy:task.stagePolicy,collaboration:task.collaboration});
    }catch(error){return fail('TASK_REPREPARE',String(error));}
  }
  async cancel(taskId: Id): Promise<Result<CancelResult>> {
    const task = this.tasks.get(taskId); if (!task) return fail('TASK_MISSING', '任务不存在');
    let remote: CancelResult['remote'] = 'notApplicable';
    const items = task.items.filter(item => item.state === 'cancelled' && this.running.has(item.id) || this.resumptions.has(item.id) || !['review', 'failed', 'cancelled'].includes(item.state));
    for (const item of items) {
      this.resumptions.get(item.id)?.resolve(); this.resumptions.delete(item.id);
      this.running.get(item.id)?.abort(); item.state = 'cancelled';
      if (item.attempts.length) item.attempts.at(-1)!.outcome = 'cancelled';
    }
    await this.persist(task);
    for (const item of items) {
      if (item.remote) {
        let lease: GenerationAdapterLease | null = null;
        let result: CancelResult['remote'] = 'unsupported';
        if (this.remoteCapabilities(item).cancelPerTask) {
          try { lease = await this.acquire(item,true); result = (await lease.adapter.cancel(item.remote, this.context(task, item, new AbortController().signal))).remote; }
          catch (error) { result = 'unknown'; item.issues = [issue('REMOTE_CANCEL_UNKNOWN', String(error))]; }
          finally { await this.releaseAdapter(task, item, lease, false); }
        }
        const ranks: CancelResult['remote'][] = ['notApplicable', 'confirmed', 'unsupported', 'unknown'];
        if (ranks.indexOf(result) > ranks.indexOf(remote)) remote = result;
      }
      else if (item.attempts.length) remote = 'unknown';
    }
    await this.persist(task); this.wake(); return ok({ local: 'stopped', remote });
  }
  async selectCandidates(input: { taskId: Id; selections: { itemId: Id; candidateId: Id }[]; target: 'taskOnly' | 'project'; expected: VersionRef[]; collaboration?:import('@galcraft/contracts').CollaborationContext }): Promise<Result<EditPlan | Task>> {
    const task = this.tasks.get(input.taskId); if (!task) return fail('TASK_MISSING', '任务不存在');
    const selected: Candidate[] = [];
    for (const selection of input.selections) { const item = task.items.find(value => value.id === selection.itemId), candidate = this.candidates.get(selection.candidateId);
      if (!item || !candidate || candidate.taskId !== task.id || candidate.itemId !== item.id || candidate.partial || candidate.checks.some(issue => issue.severity === 'error') || item.needsReview) return fail('CANDIDATE_INVALID', '候选尚未完整或需要复核');
      selected.push(candidate);
    }
    if (input.target === 'project') {
      if (!this.versionsMatch(input.expected) || selected.some(candidate => !this.versionsMatch(task.items.find(item => item.id === candidate.itemId)!.sourceVersions))) return fail('ADOPTION_CONFLICT', '候选来源已变化，请重新准备');
      const edit = await this.options.review(structuredClone(selected), input.expected); if (!edit.ok) return edit;
      edit.value.origin = 'candidate'; const plan = input.collaboration?await this.options.project.prepareExternalEdit(edit.value,input.collaboration):this.options.project.planEdit(edit.value); if (plan.ok){this.adoptions.set(plan.value.planId, selected.map(candidate => candidate.id));this.recordExternalAction(task,input.collaboration,{action:'prepareAdoption',plan:plan.value});await this.persist(task);} return plan;
    }
    for (const selection of input.selections) { const item = task.items.find(value => value.id === selection.itemId)!;
      if (item.selectedCandidateId && item.selectedCandidateId !== selection.candidateId) this.markDescendants(task, item.id);
      item.selectedCandidateId = selection.candidateId; }
    this.recordExternalAction(task,input.collaboration,{action:'select'});await this.persist(task); return ok(structuredClone(task));
  }
  private recordExternalAction(task:Task,context:import('@galcraft/contracts').CollaborationContext|undefined,fact:NonNullable<Task['externalActions']>[string]){if(context)(task.externalActions??={})[`${context.sessionId}-${context.callId}`]=fact;}
  registerAdoption(plan: EditPlan, candidateIds: Id[]): void { this.adoptions.set(plan.planId, candidateIds); }
  async adoptionReceipt(planId:Id):Promise<EditReceipt|undefined> {
    const intent=this.adoptionIntents[planId];if(!intent)return;
    if(intent.receipt)return structuredClone(intent.receipt);
    if(intent.context){const result=await this.options.project.lookupExternalCall(intent.context);return result?.ok?result.value:undefined;}
    return this.options.project.lookupTrackedEdit(planId);
  }
  hasPendingAdoption(planId:Id):boolean{return !!this.adoptionIntents[planId];}
  async reconcileAdoptions():Promise<void>{if(Object.keys(this.adoptionIntents).length)await this.serial(async()=>{for(const id of Object.keys(this.adoptionIntents))await this.restoreAdoption(id);});}
  async reconcileAdoption(planId:Id):Promise<EditReceipt|undefined>{return this.serial(()=>this.restoreAdoption(planId));}
  private async restoreAdoption(planId:Id):Promise<EditReceipt|undefined> {
    const intent=this.adoptionIntents[planId];if(!intent)return;
    const receipt=await this.adoptionReceipt(planId);if(!receipt)return;
    if(!intent.files&&receipt.documents.some(value=>(this.options.project.readDocument(value.ref.id)?.revision??-1)<value.revision))return;
    intent.receipt=receipt;
    if(!intent.files&&this.versionsMatch(receipt.documents))intent.files=Object.fromEntries(receipt.documents.map(value=>[value.ref.id,structuredClone(this.options.project.readDocument(value.ref.id)!.files)]));
    await this.store.write(this.store.path('adoptions.json'),this.adoptionIntents);
    for(const id of intent.candidates){const original=this.candidates.get(id);if(!original)throw new Error(`采用候选缺失 ${id}`);
      const candidate=structuredClone(original);
      if(!candidate.adoption.some(value=>value.groupId===receipt.groupId))candidate.adoption.push({groupId:receipt.groupId,documentVersions:receipt.documents,assets:receipt.assetIds,...(intent.files?{files:intent.files}:{})});
      await this.store.saveCandidate(candidate);this.candidates.set(id,candidate);
    }
    delete this.adoptionIntents[planId];await this.store.write(this.store.path('adoptions.json'),this.adoptionIntents);
    this.adoptions.delete(planId);return structuredClone(receipt);
  }
  async applyAdoption(planId: Id, expected: VersionRef[], context?: import('@galcraft/contracts').CollaborationContext, onApplied?: (receipt:EditReceipt)=>Promise<void>): Promise<Result<EditReceipt>> {
    return this.serial(async()=>{
      const candidates = this.adoptions.get(planId)??this.adoptionIntents[planId]?.candidates; if (!candidates) return fail('ADOPTION_MISSING', '采用计划不存在');
      if(!this.adoptionIntents[planId]){
        const preview=this.options.project.readEditPreview(planId);if(!preview.ok)return preview;
        this.adoptionIntents[planId]={planId,candidates:[...candidates],files:Object.fromEntries(preview.value.map(document=>[document.documentId,structuredClone(document.files)])),...(context?{context:structuredClone(context)}:{})};
      }
      await this.store.write(this.store.path('adoptions.json'),this.adoptionIntents);
      let receipt:Result<EditReceipt>;
      try{receipt = context ? await this.options.project.applyExternalEdit(planId,expected,context) : await this.options.project.applyTrackedEdit(planId, expected);}
      catch(error){const accepted=await this.adoptionReceipt(planId);if(accepted)await onApplied?.(accepted);throw error;}
      if(!receipt.ok){delete this.adoptionIntents[planId];await this.store.write(this.store.path('adoptions.json'),this.adoptionIntents);return receipt;}
      this.adoptionIntents[planId]!.receipt=receipt.value;
      await onApplied?.(receipt.value);
      await this.restoreAdoption(planId);return receipt;
    });
  }
  private adoptionFilesMatch(current: Record<string, string> | undefined, adopted: Record<string, string>): boolean {
    if (!current || !isDeepStrictEqual(Object.keys(current).sort(), Object.keys(adopted).sort())) return false;
    return Object.entries(adopted).every(([path, text]) => {
      if (path.endsWith('.json')) {
        try { const expected = JSON.parse(text), actual = JSON.parse(current[path]!);
          if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual) && 'documentId' in expected && 'revision' in expected) {
            delete expected.revision; delete actual.revision;
          }
          return isDeepStrictEqual(actual, expected);
        } catch { return current[path] === text; }
      }
      return current[path] === text;
    });
  }
  private adoptionContentsMatch(adoption: Candidate['adoption'][number]): boolean {
    if (!adoption.files) return false;
    const authorDocuments = new Set<Id>();
    const index = Object.entries(adoption.files).find(([, files]) => files['assets/index.json'] !== undefined);
    if (adoption.assets.length) {
      if (!index) return false;
      try {
        const expected = JSON.parse(index[1]['assets/index.json']!) as { documentId: Id; data: { assets: Asset[] } };
        const actual = JSON.parse(this.options.project.readDocument(index[0])?.files['assets/index.json'] ?? 'null') as typeof expected | null;
        if (!actual || actual.documentId !== expected.documentId) return false;
        for (const id of adoption.assets) {
          const asset = expected.data.assets.find(asset => asset.id === id), retained = actual.data.assets.find(asset => asset.id === id);
          const variant = asset?.variants.find(variant => variant.id === asset.activeVariantId), current = retained?.variants.find(current => current.id === variant?.id);
          if (!asset || !retained || asset.kind !== retained.kind || !variant || !current) return false;
          // Platform verification can change after adoption; the exact imported version remains the adopted output.
          const { targets: _expectedTargets, ...output } = variant, { targets: _currentTargets, ...retainedOutput } = current;
          if (!isDeepStrictEqual(output, retainedOutput)) return false;
          const ref = variant.metadata.authorDocument;
          if (ref) {
            const document = this.options.project.readDocument(ref.documentId, 'saved');
            const source = document && readPluginDocumentInstances([document]).find(source => source.documentId === ref.documentId);
            if (!source || source.pluginId !== ref.pluginId || source.contributionKey !== ref.contributionKey || source.stateVersion !== ref.stateVersion) return false;
            authorDocuments.add(ref.documentId);
          }
        }
      } catch { return false; }
    }
    return Object.entries(adoption.files).every(([id, files]) => {
      // An adopted media version keeps its author source identity while that source continues to be edited.
      if (authorDocuments.has(id)) return true;
      const current = this.options.project.readDocument(id)?.files;
      if (adoption.assets.length && id === index?.[0]) {
        const { 'assets/index.json': _expectedIndex, ...otherFiles } = files;
        const { 'assets/index.json': _currentIndex, ...currentOtherFiles } = current ?? {};
        return this.adoptionFilesMatch(currentOtherFiles, otherFiles);
      }
      return this.adoptionFilesMatch(current, files);
    });
  }
  adoptionState(id: Id): 'unadopted' | 'adopted' | 'saved' {
    const candidate = this.candidates.get(id); if (!candidate) return 'unadopted';
    const current = [...candidate.adoption].reverse().find(adoption => {
      const operation = this.options.project.operations.find(operation => operation.groupId === adoption.groupId);
      return operation ? operation.state === 'applied' : this.adoptionContentsMatch(adoption);
    });
    if (!current) return 'unadopted'; return current.documentVersions.every(value => (this.options.project.readDocument(value.ref.id)?.savedRevision ?? -1) >= value.revision) ? 'saved' : 'adopted';
  }
  private markDescendants(task: Task, id: Id): void { for (const child of task.items.filter(item => item.dependencies.some(edge => edge.itemId === id))) { delete child.stageAuthorized; if (!child.needsReview) { child.needsReview = true; this.markDescendants(task, child.id); } } }
  async sourceChanged(source: VersionRef, relevantItemIds: Id[]): Promise<void> {
    for (const task of this.tasks.values()) { for (const item of task.items) if (relevantItemIds.includes(item.id) && item.sourceVersions.some(value => value.ref.id === source.ref.id && value.revision !== source.revision)) { item.needsReview = true; this.markDescendants(task, item.id); } await this.persist(task); }
  }
  async keepResults(taskId: Id, itemId: Id, versions: VersionRef[]): Promise<Result<void>> {
    const task = this.tasks.get(taskId), item = task?.items.find(item => item.id === itemId); if (!task || !item) return fail('REVIEW_CONFLICT', '复核版本已变化');
    const sourceVersions: VersionRef[] = [];
    for (const source of item.sourceVersions) {
      const current = versions.find(value => value.ref.kind === source.ref.kind && value.ref.id === source.ref.id);
      if (!current) return fail('REVIEW_CONFLICT', '复核版本已变化');
      sourceVersions.push(current);
    }
    if (!this.versionsMatch(sourceVersions)) return fail('REVIEW_CONFLICT', '复核版本已变化');
    item.sourceVersions = structuredClone(sourceVersions); item.needsReview = false;
    for (const edge of item.dependencies) edge.selectedCandidateId = task.items.find(value => value.id === edge.itemId)?.selectedCandidateId ?? edge.selectedCandidateId;
    await this.persist(task); return ok(undefined);
  }
  async applyPromptTransfer(input: { candidateId: Id; draftId: Id; usage: ProductionFormDraft['activeUse']; expectedDraftRevision: number; acceptedFields: string[]; omittedPorts: string[] }): Promise<Result<ProductionFormDraft>> {
    const candidate = this.candidates.get(input.candidateId), draft = await this.store.loadDraft(input.draftId);
    if (!candidate || !(candidate.recipeSnapshot?.purpose ?? candidate.operation) || !draft || !draft.variants[input.usage]) return fail('PROMPT_TRANSFER', '候选或制作表单不存在');
    if(candidate.partial||candidate.checks.some(issue=>issue.severity==='error'))return fail('PROMPT_INVALID','请先修正并重新处理候选，再转入制作表单');
    const sourceItem=this.tasks.get(candidate.taskId)?.items.find(item=>item.id===candidate.itemId);
    const textTransfer = sourceItem?.operationSnapshot?.definition.textTransfer;
    if (textTransfer) {
      const variant = draft.variants[input.usage]!;
      if (variant.operation !== textTransfer.operation || !variant.operationSnapshot?.definition.fields.some(field => field.path === textTransfer.field)) return fail('PROMPT_TRANSFER_TARGET', '请选择此候选声明的下一制作操作');
      variant.fields[textTransfer.field] = candidate.editedText ?? await this.store.text(candidate);
      if (sourceItem?.input && typeof sourceItem.input === 'object' && 'references' in sourceItem.input) {
        const references = sourceItem.input.references as import('@galcraft/contracts').MediaInput[];
        if (references.some(reference => !variant.operationSnapshot!.definition.inputs.some(port => port.type !== 'text' && port.key === reference.port))) return fail('PROMPT_TRANSFER_PORT', '下一制作操作没有匹配的参考媒体端口');
        variant.fields.references = structuredClone(references) as unknown as Json;
      }
      return this.saveFormDraft(draft, input.expectedDraftRevision);
    }
    if(sourceItem?.textPreparationSnapshot&&this.options.acquireTextPreparation){const lease=await this.options.acquireTextPreparation(sourceItem.textPreparationSnapshot.key,sourceItem.textPreparationSnapshot.packageVersion);try{if(lease.provider.transfer){const variant=draft.variants[input.usage]!,transfer=lease.provider.transfer(JSON.parse(candidate.editedText??await this.store.text(candidate)),variant.fields,{candidateId:candidate.id,taskId:candidate.taskId,itemId:candidate.itemId});if(!transfer.ok)return transfer;variant.fields=transfer.value;return this.saveFormDraft(draft,input.expectedDraftRevision);}}finally{await lease.release();}}
    const parsed = parsePrompt(await this.store.text(candidate), (candidate.recipeSnapshot?.purpose ?? candidate.operation) as import('../recipes/schema.js').RecipePurpose); if (!parsed.ok) return parsed;
    const allowed = { novelaiPrompt: ['basePrompt', 'negativePrompt', 'characters', 'suggestions', 'kind', 'contractVersion'], imagePrompt: ['positive', 'negative'], differencePrompt: ['instruction', 'negative'], speechText: ['spokenText', 'emotion'], musicPrompt: ['prompt', 'lyrics'] }[parsed.value.kind];
    if (input.acceptedFields.some(key => !allowed.includes(key))) return fail('PROMPT_FIELDS', '只能接受本用途公开字段');
    const variant = draft.variants[input.usage]!;
    for (const key of parsed.value.kind === 'novelaiPrompt' ? [] : input.acceptedFields) variant.fields[key] = (parsed.value as unknown as Record<string, Json>)[key]!;
    variant.operation = parsed.value.kind === 'novelaiPrompt' ? 'novelaiPrompt' : defaultOperation(input.usage);
    if (parsed.value.kind === 'novelaiPrompt') {
      const previous = NovelAIPromptSchema.safeParse(variant.fields.novelaiPrompt);
      const next = { ...(previous.success ? previous.data : emptyNovelAIPrompt()) } as unknown as Record<string, Json>;
      for (const key of input.acceptedFields) next[key] = (parsed.value as unknown as Record<string, Json>)[key]!;
      variant.fields.novelaiPrompt = NovelAIPromptSchema.parse(next) as unknown as Json;
      variant.fields.novelaiPromptSource = { candidateId: candidate.id, taskId: candidate.taskId, itemId: candidate.itemId, contract: 'novelaiPrompt', contractVersion: 1 };
    }
    variant.fields.omittedPorts = input.omittedPorts; return this.saveFormDraft(draft, input.expectedDraftRevision);
  }
  generationReadiness(routes: Partial<Record<ProductionFormDraft['activeUse'], ConnectionConfig>> = {}): GenerationReadiness {
    return generationReadiness(routes);
  }
  async editCandidate(id: Id, text: string, collaboration?:import('@galcraft/contracts').CollaborationContext): Promise<Result<Candidate>> {
    const original = this.candidates.get(id); if (!original) return fail('CANDIDATE_MISSING', '候选不存在');
    const task = this.tasks.get(original.taskId)!, item = task.items.find(item => item.id === original.itemId)!;
    const candidate = structuredClone(original); candidate.id = createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents]); candidate.parentCandidateIds = [original.id]; candidate.editedText = text; candidate.adoption = [];
    candidate.createdAt = new Date().toISOString(); candidate.checks = await this.candidateChecks(candidate, item);
    await this.store.saveCandidate(candidate); reserveIds(candidate); this.candidates.set(candidate.id, candidate); item.candidateIds.push(candidate.id);this.recordExternalAction(task,collaboration,{action:'editCandidate',candidateId:candidate.id,itemId:item.id}); await this.persist(task); return ok(structuredClone(candidate));
  }
  async setBackgroundPreview(id: Id, preview: NonNullable<Candidate['backgroundPreview']>): Promise<Result<Candidate>> {
    const candidate = this.candidates.get(id); if (!candidate?.backgroundPreview) return fail('BACKGROUND_CANDIDATE', '不是背景候选');
    if (!['cover', 'contain', 'native'].includes(preview.frame.fit) || !Number.isFinite(preview.frame.positionX) || !Number.isFinite(preview.frame.positionY) || preview.frame.positionX < 0 || preview.frame.positionX > 1 || preview.frame.positionY < 0 || preview.frame.positionY > 1) return fail('BACKGROUND_FRAME', '取景参数无效');
    candidate.backgroundPreview = structuredClone(preview); await this.store.saveCandidate(candidate); return ok(structuredClone(candidate));
  }
  async importCandidates(packagePath: string): Promise<Result<Task>> {
    try { const files = unzipSync(await readFile(packagePath)), manifest = JSON.parse(Buffer.from(files['manifest.json']!).toString('utf8'));
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.candidates) || !manifest.candidates.length) throw new Error('候选包无效');
      const now = new Date().toISOString(), task: Task = { schemaVersion: 1, id: createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents]), projectId: this.store.projectId, revision: 1, name: manifest.taskName, createdAt: now, updatedAt: now,
        presetId: null, sourceDraftId: null, context: [], items: [], policy: 'waitForSelection', selectionRule: null };
      const ids = new Map<Id, Id>(manifest.candidates.map((candidate: Candidate) => [candidate.id, createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents])]));
      for (const source of manifest.candidates as Candidate[]) {
        const candidate = structuredClone(source); candidate.id = ids.get(source.id)!; candidate.taskId = task.id; candidate.itemId = createId([this.tasks, this.candidates, this.removedTasks, this.options.project.documents]); candidate.adoption = []; candidate.sourceVersions = []; candidate.partial = false;
        candidate.parentCandidateIds = source.parentCandidateIds.flatMap(id => ids.has(id) ? [ids.get(id)!] : []);
        const directory = this.store.candidatePath(task.id, candidate.itemId, candidate.id); await mkdir(directory, { recursive: true });
        for (const [index, artifact] of candidate.artifacts.entries()) { const bytes = files[artifact.localPath]; if (!bytes || bytes.length !== artifact.bytes) throw new Error('候选产物缺失或大小不符');
          const path = join(directory, `${index}-${basename(artifact.localPath)}`); await writeFile(path, bytes); artifact.localPath = path; }
        const primaryKind = candidate.artifacts.find(artifact => artifact.role === 'primary')?.kind;
        const purpose = candidate.operationSnapshot?.definition.purpose as import('@galcraft/contracts').Purpose | undefined
          ?? (primaryKind === 'audio' ? 'speech' : primaryKind === 'image' ? 'image' : primaryKind === 'text' ? 'text' : undefined);
        if (!purpose) throw new Error(`候选包缺少操作定义：${primaryKind}`);
        const item: TaskItem = { id: candidate.itemId, purpose, operation: candidate.operation, operationSnapshot: structuredClone(candidate.operationSnapshot), target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: candidate.operationSnapshot?.definition.adoption.kind === 'asset' ? candidate.operationSnapshot.definition.adoption.usages[0] as ProductionFormDraft['activeUse'] : purpose === 'speech' ? 'voice' : purpose === 'image' ? 'cg' : 'script', uiScope: null }, backgroundRemoval: null,
          backgroundPreview: candidate.backgroundPreview, dependencies: [], input: candidate.input, sourceVersions: [], configSnapshot: null, workflowSnapshot: null, recipeSnapshot: candidate.recipeSnapshot, state: 'review', remote: null,
          progress: { phase: 'imported', completed: null, total: null }, attempts: [], candidateIds: [candidate.id], selectedCandidateId: null, needsReview: false, issues: [] };
        candidate.checks = await this.candidateChecks(candidate, item);
        task.items.push(item); await this.store.saveCandidate(candidate); reserveIds(candidate); this.candidates.set(candidate.id, candidate);
      }
      await this.store.saveTask(task); this.tasks.set(task.id, task); return ok(structuredClone(task));
    } catch (error) { return fail('CANDIDATE_IMPORT', String(error)); }
  }
  async cleanupCandidates(ids: Id[]): Promise<Result<void>> {
    const selected = new Set(ids);
    for (const id of ids) { const candidate = this.candidates.get(id); if (!candidate) continue;
      if (this.adoptionState(id) !== 'unadopted' || [...this.candidates.values()].some(child => !selected.has(child.id) && child.parentCandidateIds.includes(id))) return fail('CANDIDATE_IN_USE', '候选已采用或仍被下游依赖'); }
    for (const id of ids) { const candidate = this.candidates.get(id); if (!candidate) continue;
      await rm(this.store.candidatePath(candidate.taskId, candidate.itemId, id), { recursive: true, force: true }); this.candidates.delete(id);
      const task = this.tasks.get(candidate.taskId)!, item = task.items.find(item => item.id === candidate.itemId)!; item.candidateIds = item.candidateIds.filter(value => value !== id); if (item.selectedCandidateId === id) item.selectedCandidateId = null; await this.persist(task); }
    return ok(undefined);
  }
  async exportCandidates(ids: Id[], destination: string): Promise<Result<string>> {
    try { const files: Record<string, Uint8Array> = {}, candidates: Candidate[] = [];
      for (const id of ids) { const source = this.candidates.get(id); if (!source || source.partial) throw new Error('候选未完整'); const candidate = structuredClone(source);
        for (const [index, artifact] of candidate.artifacts.entries()) { const path = `artifacts/${id}/${index}-${basename(artifact.localPath)}`; files[path] = await readFile(artifact.localPath); artifact.localPath = path; }
        const strip = (value: any): any => { if (Array.isArray(value)) return value.map(strip); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['localPath', 'credentialId', 'baseUrl', 'serverRoot', 'serverFileRoot', 'Authorization'].includes(key)).map(([key, item]) => [key, strip(item)])); return value; };
        candidate.input = strip(candidate.input); candidate.recipeSnapshot = strip(candidate.recipeSnapshot); candidates.push(candidate); }
      files['manifest.json'] = Buffer.from(JSON.stringify({ schemaVersion: 1, projectId: this.store.projectId, taskName: '候选交接', candidates }));
      await writeFile(destination, zipSync(files)); return ok(destination);
    } catch (error) { return fail('CANDIDATE_EXPORT', String(error)); }
  }
}
