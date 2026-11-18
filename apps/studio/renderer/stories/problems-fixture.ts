import { DefaultTimeoutSecByPurpose, type AssetImportBatch, type Issue, type Result, type StudioPreferences } from '@galcraft/contracts';
import { fixtureId } from '@galcraft/contracts/fixtures';
import type { Candidate, ProductionProblemSnapshot, Task, TaskPlan } from '@galcraft/authoring/production';
import type { AuthoringServices } from '../authoring/controller.js';
import type { WorkbenchBridge } from '../pages/Production/bridge.js';
import { studioFixture, ok } from './studio-fixture.js';
import { productAssets, productSnapshot } from './product-fixture.js';
import { productionRecords } from './production-fixture.js';

export type ProblemsScenario = 'import' | 'production' | 'build';
export const reviewBatchId = fixtureId(0x1e01);
export const reviewTaskId = fixtureId(0xe32);
export const reviewBuildPlanId = fixtureId(0x2400);
export type ReviewCalls = { importReads: number; productionReads: number; overviewReads: number; imports: number; prepares: number; submits: number; saves: number; builds: number; workspaceReads: number };
const initialTime = '2026-11-17T03:00:00.000Z';
const issue = (code: string, message: string, owner: Issue['owner']): Issue => ({ code, message, owner, severity: 'error', related: [], actions: ['retry'] });
const failed = <T,>(error: Issue): Result<T> => ({ ok: false, error, issues: [error] });

/** Only service receipts are controlled here; mountAuthoring owns every recovery control and result lifetime. */
export function problemsReviewFixture(scenario: ProblemsScenario, locale: StudioPreferences['locale'], theme: StudioPreferences['theme'], changed: (calls: ReviewCalls) => void) {
  const fixture = studioFixture('normal', locale, theme);
  const services = fixture.services as typeof fixture.services & AuthoringServices;
  const bridge = services.bridge as unknown as WorkbenchBridge;
  const project = productSnapshot(), assets = productAssets();
  const calls: ReviewCalls = { importReads: 0, productionReads: 0, overviewReads: 0, imports: 0, prepares: 0, submits: 0, saves: 0, builds: 0, workspaceReads: 0 };
  const count = (key: keyof ReviewCalls) => { calls[key]++; changed({ ...calls }); };
  const saved = bridge.documents.save.bind(bridge.documents), build = bridge.builds.build.bind(bridge.builds);
  bridge.documents.save = async (...args) => { count('saves'); return saved(...args); };
  bridge.builds.build = async (...args) => { count('builds'); return build(...args); };
  if (scenario === 'build') {
    bridge.builds.planBuild = async () => ok({ planId: reviewBuildPlanId, issues: [] });
    bridge.builds.build = async planId => {
      count('builds');
      return failed({ ...issue('BUILD_OUTPUT_BLOCKED', 'Windows 发行目录被另一个程序占用；原构建计划与输出位置已保留。', 'M11'),
        details: { planId, target: 'windows', outputDirectory: 'D:/review-fixture/windows-output' } });
    };
  }
  const readWorkspace = bridge.authoringPreferences.readWorkspace.bind(bridge.authoringPreferences);
  bridge.authoringPreferences.readWorkspace = async (...args) => { count('workspaceReads'); return readWorkspace(...args); };

  const importFailures = [
    { path: 'review-fixture/林舟-立绘.png', issue: issue('ASSET_DECODE_FAILED', '林舟-立绘.png 无法解码；原文件与本批成功素材已保留。', 'M04') },
    { path: 'review-fixture/春日-音乐.opus', issue: issue('ASSET_READ_FAILED', '春日-音乐.opus 暂时无法读取；请在原批次重试。', 'M04') },
  ];
  let batch: AssetImportBatch = {
    id: reviewBatchId, projectId: project.projectId, revision: 1, createdAt: initialTime, updatedAt: initialTime,
    succeeded: [{ id: assets[0]!.id, name: assets[0]!.name }], failed: structuredClone(importFailures),
    attempts: [{ id: fixtureId(0x1e10), createdAt: initialTime, succeeded: [assets[0]!.id], failed: structuredClone(importFailures) }],
  };
  // Native file picking is outside this review. The retained batch's real Retry failed files callback supplies its exact paths.
  services.pickAssetFiles = bridge.files.pickAssets = async () => ok([]);
  services.importAssets = bridge.assets.import = async (paths, options) => {
    count('imports');
    if (options?.projectId && options.projectId !== batch.projectId || options?.batchId && options.batchId !== batch.id)
      return failed(issue('IMPORT_BATCH_MISSING', '本批不属于当前作品。', 'M04'));
    const requested = new Set(paths);
    const recovered = batch.failed.filter(item => requested.has(item.path)).slice(0, batch.revision === 1 ? 1 : undefined);
    const succeeded = recovered.map(item => structuredClone(assets[importFailures.findIndex(value => value.path === item.path) + 1]!));
    const remaining = batch.failed.filter(item => !recovered.some(value => value.path === item.path));
    const attemptId = fixtureId(0x1e10 + batch.revision), updatedAt = new Date(Date.parse(initialTime) + batch.revision * 60000).toISOString();
    batch = { ...batch, revision: batch.revision + 1, updatedAt, failed: remaining,
      succeeded: [...batch.succeeded, ...succeeded.map(asset => ({ id: asset.id, name: asset.name }))],
      attempts: [...batch.attempts, { id: attemptId, createdAt: updatedAt, succeeded: succeeded.map(asset => asset.id), failed: structuredClone(remaining) }],
    };
    return ok({ succeeded, failed: structuredClone(remaining), batch: { id: batch.id, attemptId, revision: batch.revision } });
  };
  bridge.assets.listImportBatches = async () => { count('importReads'); return ok(scenario === 'import' ? [structuredClone(batch)] : []); };

  const records = productionRecords(project), tasks = records.tasks;
  const original = tasks.find(task => task.id === reviewTaskId)!;
  original.name = '雨站对白 · 两项请求待处理';
  const connection = { id: fixtureId(0x1f01), revision: 1, name: 'Review 夹具 · 文本连接', protocol: 'chatCompletions' as const,
    baseUrl: 'https://review-fixture.invalid/v1', credentialId: null, auth: 'none' as const, apiKeyHeader: null, model: 'controlled-text',
    purposes: ['text' as const], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  original.items[0]!.configSnapshot = connection;
  original.items[0]!.attempts = [{ id: fixtureId(0x1f10), createdAt: initialTime, remote: null, outcome: 'failed' }];
  original.items[0]!.issues = [issue('GENERATION_CONNECTION_FAILED', '对白续写连接中断；冻结输入与原请求身份已保留。', 'M10')];
  original.items.push({ ...structuredClone(original.items[0]!), id: fixtureId(0x1f11),
    attempts: [{ id: fixtureId(0x1f12), createdAt: initialTime, remote: null, outcome: 'failed' }],
    issues: [issue('REMOTE_FAILED', '演出描述未完成；请查看原任务，再准备新增请求。', 'M10')] });
  const plans = new Map<string, TaskPlan>();
  const recoveredCandidates: { candidate: Candidate; adoption: 'unadopted' }[] = [];
  const snapshot = (): ProductionProblemSnapshot => {
    const superseded = new Set(tasks.filter(task => task.previousTaskId && task.previousItemId).map(task => `${task.previousTaskId}:${task.previousItemId}`));
    return { projectId: project.projectId, tasks: scenario === 'production' ? tasks.map(task => ({ id: task.id, name: task.name, revision: task.revision,
      failures: task.items.flatMap(item => item.state === 'failed' && !superseded.has(`${task.id}:${item.id}`)
        ? [{ itemId: item.id, attemptId: item.attempts.at(-1)?.id ?? item.id, issues: structuredClone(item.issues) }] : []),
    })) : [] };
  };
  bridge.production.problemSnapshot = async () => { count('productionReads'); return ok(snapshot()); };
  const overview = bridge.production.overview.bind(bridge.production), content = bridge.production.candidateContent.bind(bridge.production);
  bridge.production.overview = async input => {
    count('overviewReads');
    const result = await overview(input);
    if (!result.ok) return result;
    const selected = input?.taskId ?? tasks.at(-1)?.id;
    return ok({ ...result.value, tasks: structuredClone(input ? tasks.filter(task => task.id === selected) : tasks),
      taskSummaries: tasks.map(({ id, name, revision, createdAt, updatedAt, items }) => ({ id, name, revision, createdAt, updatedAt, items: items.map(({ id, state }) => ({ id, state })) })),
      candidates: [...result.value.candidates, ...structuredClone(recoveredCandidates)], connections: [connection],
    });
  };
  bridge.production.retry = async ({ taskId, itemId, confirmNewRequest }) => {
    count('prepares');
    if (calls.prepares === 1) return failed(issue('PRODUCTION_PROVIDER_UNAVAILABLE', '受控制作服务暂不可用。输入和原任务已保留，可再次准备计划。', 'M10'));
    const previous = tasks.find(task => task.id === taskId), source = previous?.items.find(item => item.id === itemId);
    if (!previous || !source || !confirmNewRequest) return failed(issue('TASK_MISSING', '找不到对应的原任务项。', 'M10'));
    const id = fixtureId(0x2000 + calls.prepares * 4), now = new Date(Date.parse(initialTime) + calls.prepares * 60000).toISOString();
    const task: Task = { ...structuredClone(previous), id, name: `${previous.name} · 新请求`, revision: 1, createdAt: now, updatedAt: now,
      previousTaskId: taskId, previousItemId: itemId, sourceDraftId: null,
      items: [{ ...structuredClone(source), id: fixtureId(0x2001 + calls.prepares * 4), state: 'queued', attempts: [], remote: null, issues: [],
        candidateIds: [], selectedCandidateId: null, needsReview: false, progress: { phase: '', completed: null, total: null } }],
    };
    const plan: TaskPlan = { planId: fixtureId(0x2002 + calls.prepares * 4), expected: [], task, issues: [],
      sendSummary: [{ itemId: task.items[0]!.id, destination: 'Review 夹具 · 内存回执', model: connection.model, textCharacters: 32, media: [], requests: 1, price: null }] };
    plans.set(plan.planId, plan); return ok(structuredClone(plan));
  };
  bridge.production.submit = async planId => {
    const plan = plans.get(planId);
    if (!plan) return failed(issue('TASK_PLAN_MISSING', '请先准备新增请求计划。', 'M10'));
    const existing = tasks.find(task => task.id === plan.task.id);
    if (existing) return ok(structuredClone(existing));
    count('submits');
    const task = structuredClone(plan.task), item = task.items[0]!, success = calls.submits > 1;
    task.revision++; item.state = success ? 'review' : 'failed';
    item.attempts = [{ id: fixtureId(0x2200 + calls.submits), createdAt: task.createdAt, remote: null, outcome: success ? 'completed' : 'failed' }];
    item.issues = success ? [] : [issue('REMOTE_FAILED', '本次新增请求仍未完成；新尝试需要重新处理，原回执继续保留。', 'M10')];
    item.progress = { phase: success ? 'review' : 'failed', completed: null, total: null };
    if (success) {
      const candidate = { ...structuredClone(records.candidates[0]!.candidate), id: fixtureId(0x2300 + calls.submits), taskId: task.id, itemId: item.id,
        editedText: '雨声渐渐停了。林舟收起信，向站台尽头走去。', createdAt: task.createdAt };
      item.candidateIds = [candidate.id]; recoveredCandidates.push({ candidate, adoption: 'unadopted' });
    }
    tasks.push(task); return ok(structuredClone(task));
  };
  bridge.production.candidateContent = async id => {
    const candidate = recoveredCandidates.find(value => value.candidate.id === id)?.candidate;
    return candidate ? ok({ text: candidate.editedText ?? '', media: [] }) : content(id);
  };
  return { services, calls, batch: () => structuredClone(batch), production: snapshot };
}
