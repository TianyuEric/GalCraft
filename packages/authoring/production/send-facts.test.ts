import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ProjectSession } from '@galcraft/documents';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ConnectionConfig, GenerationAdapter, ServiceEvent, SubmissionContext } from '@galcraft/contracts';
import { inputCapability } from './capabilities.js';
import { ProductionService } from './service.js';
import type { Task, TaskItem } from './types.js';
import { ok, requireValue } from './validation.js';

async function fixture(submit: GenerationAdapter['submit']) {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-send-facts-'));
  const projectId = randomUUID(), projectDirectory = join(root, 'project');
  await mkdir(projectDirectory);
  await writeFile(join(projectDirectory, 'project.json'), JSON.stringify({ schemaVersion: 1, documentId: randomUUID(), revision: 1, data: { projectId } }));
  const project = await ProjectSession.open(projectDirectory, projectId);
  const config: ConnectionConfig = { id: randomUUID(), revision: 1, name: 'Controlled local adapter', providerKey: 'test.service/generate',
    protocol: 'chatCompletions', baseUrl: 'http://local.invalid/v1', credentialId: null, auth: 'none', apiKeyHeader: null, model: 'test', purposes: ['text'],
    timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  const item: TaskItem = { id: randomUUID(), purpose: 'text', target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'script', uiScope: null },
    backgroundRemoval: null, backgroundPreview: null, dependencies: [], input: { purpose: 'text', system: '', messages: [{ role: 'user', text: 'test', attachments: [] }], maxOutputTokens: 32, temperature: null, seed: null },
    sourceVersions: [], configSnapshot: config, workflowSnapshot: null, recipeSnapshot: null, state: 'draft', remote: null,
    progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] };
  const remote: GenerationAdapter = { submit, inspect: async () => { throw new Error('unused'); }, query: async () => ok({ state: 'running', output: null, issues: [] }),
    fetch: async () => ok([]), cancel: async () => ({ local: 'stopped', remote: 'unsupported' }) };
  let production = new ProductionService({ userData: join(root, 'profile'), project, adapter: () => remote,
    freezeProvider: async (frozen, input) => ({ providerKey: frozen.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: true, cancelPerTask: false, resume: false }, capability: inputCapability(frozen, input, null) }),
    acquireAdapter: async () => ({ adapter: remote, release() {} }), review: async () => { throw new Error('unused'); } });
  const plan = requireValue(await production.planTask({ projectId, name: 'Send facts', items: [item], context: [], policy: 'waitForSelection', selectionRule: null }));
  const task = requireValue(await production.submit(plan.planId));
  return { remote, task, item, get production() { return production; },
    stored: async () => JSON.parse(await readFile(production.store.taskPath(task.id), 'utf8')) as Task,
    async reopen() { await production.close(); production = new ProductionService(production.options); await production.open(); },
    async close() { await production.close(); await project.dispose('discard'); await rm(root, { recursive: true, force: true }); } };
}

it('persists an unsent attempt when the adapter fails before the send callback', async context => {
  let sends = 0;
  const work = await fixture(async function* (_input, _ctx): AsyncIterable<ServiceEvent> { throw new Error('local credential preparation failed'); });
  context.onTestFinished(() => work.close());
  work.production.options.authorize = async (_task, _item, consume) => { if (consume) sends++; };
  await work.production.drain();
  const current = (await work.stored()).items[0]!;
  expect(current.state).toBe('interrupted');
  expect(current.attempts).toEqual([expect.objectContaining({ sentAt: null, outcome: 'unknown' })]);
  expect(sends).toBe(0);
  await work.reopen();
  expect(work.production.listTasks()[0]!.items[0]!.attempts).toEqual(current.attempts);
});

it('persists the send time before yielding a remote identity and queries the same attempt after reopen', async context => {
  let sends = 0, requestId = '';
  let work: Awaited<ReturnType<typeof fixture>>;
  work = await fixture(async function* (_input, ctx): AsyncIterable<ServiceEvent> {
    expect((await work.stored()).items[0]!.attempts[0]!.sentAt).toBeNull();
    await ctx.beforeSend!();
    sends++; requestId = ctx.requestId;
    const attempt = (await work.stored()).items[0]!.attempts[0]!;
    expect(attempt.id).toBe(requestId);
    expect(attempt.sentAt).toEqual(expect.any(String));
    yield { kind: 'accepted', remote: { protocol: 'plugin', id: 'original-job', connectionId: ctx.config.id, submittedAt: attempt.sentAt! } };
  });
  context.onTestFinished(() => work.close());
  await work.production.drain();
  const original = (await work.stored()).items[0]!.attempts;
  await work.reopen();
  const queried: string[] = [];
  work.remote.query = async (ref, ctx: SubmissionContext) => { expect(ref.id).toBe('original-job'); queried.push(ctx.requestId); return ok({ state: 'running', output: null, issues: [] }); };
  requireValue(await work.production.queryRemote(work.task.id, work.item.id));
  requireValue(await work.production.queryRemote(work.task.id, work.item.id));
  expect(queried).toEqual([requestId, requestId]);
  const queriedAttempts = (await work.stored()).items[0]!.attempts;
  expect(queriedAttempts).toHaveLength(1);
  expect(queriedAttempts[0]).toMatchObject({ id: original[0]!.id, createdAt: original[0]!.createdAt, sentAt: original[0]!.sentAt, remote: original[0]!.remote });
  expect(sends).toBe(1);
});
