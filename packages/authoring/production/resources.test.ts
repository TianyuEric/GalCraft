import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ConnectionConfig, ResourceReleaseReceipt, ResourceSnapshot } from '@galcraft/contracts';
import type { ProjectSession } from '@galcraft/documents';
import { ProductionService } from './service.js';
import type { GenerationAdapter, TaskItem } from './types.js';
import { ok, requireValue } from './validation.js';
let directory: string, service: ProductionService | undefined;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'galcraft-resource-scheduling-')); });
afterEach(async () => { await service?.close(); service = undefined; await rm(directory, { recursive: true, force: true }); });
const snapshot = (): ResourceSnapshot => ({ serviceUrl: 'http://comfy.test', checkedAt: new Date().toISOString(), queue: { running: [], pending: [] }, system: { ramTotal: 10000, ramFree: 9000 }, devices: [], issues: [] });
const released = (status: ResourceReleaseReceipt['status'] = 'observed'): ResourceReleaseReceipt => ({ status, requestedAt: new Date().toISOString(), before: snapshot(), after: snapshot(), issues: [] });
function item(family: string, policy: ConnectionConfig['comfyResources'] = { ownership: 'exclusive', release: 'onSwitch' }): TaskItem {
  return { id: randomUUID(), purpose: 'image', target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'background', uiScope: null }, backgroundRemoval: null, backgroundPreview: null, dependencies: [],
    input: { purpose: 'image', usage: 'background', positive: family, negative: '', width: 64, height: 64, count: 1, seed: 1, references: [] }, sourceVersions: [],
    configSnapshot: { id: randomUUID(), revision: 1, name: family, protocol: 'comfyUI', baseUrl: 'http://comfy.test/', credentialId: null, auth: 'none', apiKeyHeader: null, model: family, purposes: ['image'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null, ...(policy ? { comfyResources: policy } : {}) },
    workflowSnapshot: { id: randomUUID(), revision: 1, name: family, purpose: 'image', imageUsages: ['background'], graphVersion: '1', modelFamily: family, editorWorkflowPath: null,
      apiGraph: { '1': { class_type: 'Generate', inputs: { positive: '', negative: '', width: 64, height: 64, count: 1, seed: 1 } } },
      inputs: ['positive', 'negative', 'width', 'height', 'count', 'seed'].map(port => ({ port, nodeId: '1', classType: 'Generate', input: port, valueType: port === 'positive' || port === 'negative' ? 'string' as const : 'number' as const, required: true, transform: 'identity' as const })),
      uploads: [], outputs: [{ nodeId: '1', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'image', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] },
    recipeSnapshot: null, state: 'draft', remote: null, progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] };
}
function setup(remote: GenerationAdapter) {
  service = new ProductionService({ userData: directory, project: { projectId: 'Work01', documents: new Map(), readDocument: () => null } as unknown as ProjectSession,
    adapter: () => remote, review: async () => { throw new Error('unused'); } }); return service;
}
function adapter(order: string[] = []): GenerationAdapter {
  return { inspect: async () => { throw new Error('unused'); }, query: async () => ok({ state: 'unknown', output: null, issues: [] }), fetch: async () => ok([]), cancel: async () => ({ local: 'stopped', remote: 'unsupported' }),
    inspectResources: async () => ok(snapshot()), releaseResources: async () => { order.push(`release:${service!.listTasks().flatMap(task => task.items).reduce((count, item) => count + item.candidateIds.length, 0)}`); return ok(released()); },
    async *submit(_input, ctx) { order.push(`send:${ctx.workflow?.modelFamily}`); await mkdir(ctx.directory, { recursive: true }); const localPath = join(ctx.directory, 'image.png'); await writeFile(localPath, 'fixture');
      yield { kind: 'output', artifacts: [{ kind: 'image', localPath, mime: 'image/png', bytes: 7, metadata: { width: 64, height: 64 }, groupId: 'image/0', role: 'primary', background: { declared: 'unknown', hasAlpha: false, hasTransparency: false } }], usage: null }; } };
}
async function submit(items: TaskItem[]) {
  const plan = requireValue(await service!.planTask({ projectId: 'Work01', name: 'resource fixture', context: [], items, policy: 'waitForSelection', selectionRule: null, stagePolicy: 'external' }));
  return requireValue(await service!.submit(plan.planId));
}
describe('instance-wide model handoff', () => {
  it.each([true, false])('preserves cross-connection concurrency only for the same family (%s)', async sameFamily => {
    const order: string[] = [], remote = adapter(order), original = remote.submit.bind(remote); let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; }); const entered: string[] = [];
    remote.submit = async function* (input, context) { entered.push(context.workflow!.modelFamily!); if (entered.length === 1) await hold; yield* original(input, context); };
    setup(remote); await submit([item('image'), item(sameFamily ? 'image' : 'breeze')]); const draining = service!.drain();
    await expect.poll(() => entered.length, { interval: 5 }).toBe(sameFamily ? 2 : 1);
    expect(order.filter(value => value.startsWith('release:'))).toHaveLength(1);
    release(); await draining; expect(entered).toEqual(['image', sameFamily ? 'image' : 'breeze']);
  });
  it('takes outputs before cross-connection image→Breeze→Irodori handoff and reuses the declared family', async () => {
    const order: string[] = []; setup(adapter(order)); const sources = [item('image'), item('breeze'), item('breeze'), item('irodori')];
    await submit(sources); await service!.drain();
    expect(order).toEqual(['release:0', 'send:image', 'release:1', 'send:breeze', 'send:breeze', 'release:3', 'send:irodori']);
    expect(service!.listTasks()[0]!.items.every(item => item.state === 'review' && item.attempts.length === 1)).toBe(true);
  });
  it('keeps shared/manual instances untouched and releases after each exclusive task', async () => {
    const order: string[] = []; setup(adapter(order));
    const task = await submit([item('image', { ownership: 'shared', release: 'manual' }), item('breeze', { ownership: 'shared', release: 'manual' })]);
    await service!.drain(); expect(order).toEqual(['send:image', 'send:breeze']);
    requireValue(await service!.releaseTaskResources(task.id, task.items[0]!.id)); expect(order.at(-1)).toBe('release:2');
    await submit([item('image', { ownership: 'exclusive', release: 'afterTask' }), item('image', { ownership: 'exclusive', release: 'afterTask' })]);
    await service!.drain(); expect(order.slice(3)).toEqual(['release:2', 'send:image', 'release:3', 'send:image', 'release:4']);
  });
  it('blocks unverified release before creating an attempt, and manual observation resumes the frozen task', async () => {
    const order: string[] = [], remote = adapter(order); let verified = false;
    remote.releaseResources = async () => ok(released(verified ? 'observed' : 'unverified')); setup(remote);
    const task = await submit([item('image')]); await service!.drain();
    expect(service!.listTasks()[0]!.items[0]).toMatchObject({ state: 'queued', resourceWait: 'unverified', attempts: [] }); expect(order).toEqual([]);
    expect(await service!.waitForTask(task.id, { timeoutMs: 5 })).toMatchObject({ ok: true, value: { reason: 'attention' } });
    verified = true; requireValue(await service!.releaseTaskResources(task.id, task.items[0]!.id)); await service!.drain();
    expect(service!.listTasks()[0]!.items[0]!.attempts).toHaveLength(1); expect(order).toEqual(['send:image']);
  });
  it('starts an explicitly confirmed new request without copying old resource waits or execution diagnostics', async () => {
    const remote = adapter(); remote.releaseResources = async () => ok(released('unverified')); setup(remote);
    const task = await submit([item('image')]); await service!.drain(); requireValue(await service!.cancel(task.id));
    const replacement = requireValue(await service!.retryItem(task.id, task.items[0]!.id, true)).task.items[0]!;
    expect(replacement.resourceWait).toBeUndefined(); expect(replacement.resourceRelease).toBeUndefined(); expect(replacement.remoteError).toBeUndefined();
    expect(replacement.progress).toEqual({ phase: '', completed: null, total: null }); expect(replacement.attempts).toEqual([]);
  });
  it('keeps an unknown original prompt occupying the instance, and recovery never adds a generation request', async () => {
    const order: string[] = [], remote = adapter(order); let done = false;
    remote.submit = async function* (_input, ctx) { order.push(`send:${ctx.workflow?.modelFamily}`); yield { kind: 'accepted', remote: { protocol: 'comfyUI', id: ctx.workflow!.modelFamily!, connectionId: ctx.config.id, submittedAt: new Date().toISOString() } }; };
    remote.query = async () => ok({ state: done ? 'completed' : 'unknown', output: {}, issues: [] });
    remote.fetch = async (_ref, _output, ctx) => { await mkdir(ctx.directory, { recursive: true }); const localPath = join(ctx.directory, 'original.txt'); await writeFile(localPath, 'original output'); return ok([{ kind: 'text', localPath, mime: 'text/plain', bytes: 15, metadata: {}, groupId: 'original', role: 'primary', background: null }]); };
    setup(remote); const task = await submit([item('image'), item('breeze')]); await service!.drain();
    expect(order.filter(value => value.startsWith('send:'))).toEqual(['send:image']);
    await service!.resume(task.id); expect(order.filter(value => value.startsWith('send:'))).toEqual(['send:image']);
    done = true; await service!.resume(task.id); await service!.drain();
    expect(order.filter(value => value.startsWith('send:'))).toEqual(['send:image', 'send:breeze']);
    expect(service!.listTasks()[0]!.items[0]!.attempts).toHaveLength(1);
  });
});
describe('bounded wait on the original task', () => {
  it('waits for queued work, returns a terminal snapshot, and cancellation only ends waiting', async () => {
    const order: string[] = []; setup(adapter(order)); const task = await submit([item('image', { ownership: 'shared', release: 'manual' })]);
    expect(await service!.waitForTask(task.id, { timeoutMs: 2 })).toMatchObject({ ok: true, value: { reason: 'timeout' } });
    const controller = new AbortController(), waiting = service!.waitForTask(task.id, { signal: controller.signal }); controller.abort();
    expect(await waiting).toMatchObject({ ok: false, error: { code: 'TASK_WAIT_CANCELLED' } }); expect(order).toEqual([]);
    const complete = service!.waitForTask(task.id, { timeoutMs: 2000 }); await service!.drain();
    expect(await complete).toMatchObject({ ok: true, value: { reason: 'terminal', task: { id: task.id } } }); expect(order).toEqual(['send:image']);
  });
});
