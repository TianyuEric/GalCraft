import { expect, it } from 'vitest';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ConnectionConfig, ProductionOperationSnapshot } from '@galcraft/contracts';
import type { ProjectSession } from '@galcraft/documents';
import { ProductionService } from './service.js';
import { ProductionOperationCatalog } from './operations.js';
import { candidateText } from './review.js';
import { ok, requireValue } from './validation.js';
import type { GenerationAdapter, GenerationInput, TaskItem } from './types.js';

it('executes a text → extension video DAG through the shared scheduler using a declared prompt port', async () => {
  const directory = resolve(import.meta.dirname, '../../../tmp/testing/operation-dag'); await mkdir(directory, { recursive: true }); const userData = await mkdtemp(join(directory, 'run-'));
  const snapshot: ProductionOperationSnapshot = { id: 'org.test.clip/create', version: 1, provider: { id: 'org.test.clip', version: '0.1.0' }, definition: { contractVersion: 1, id: 'org.test.clip/create', version: 1, title: 'Clip', description: '', purpose: 'org.test.clip/create', providerKey: 'org.test.clip/provider', fields: [], inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', minLength: 1 } }, additionalProperties: false }, inputs: [{ key: 'prompt', type: 'text', required: true, multiple: false, mimeTypes: ['text/plain'] }], outputs: [{ key: 'clip', type: 'video', required: true, multiple: false, mimeTypes: ['video/mp4'] }], capabilities: { query: false, refetch: false, cancelPerTask: false, resume: false }, adoption: { kind: 'asset', assetKind: 'video', usages: ['background'] } } };
  const received: GenerationInput[] = [], remote: GenerationAdapter = {
    inspect: async () => { throw new Error('unused'); }, query: async () => ok({ state: 'unknown', output: null, issues: [] }), fetch: async () => ok([]), cancel: async () => ({ local: 'stopped', remote: 'unsupported' }),
    async *submit(input, ctx) { received.push(structuredClone(input)); await mkdir(ctx.directory, { recursive: true }); const text = input.purpose === 'text', path = join(ctx.directory, text ? 'result.txt' : 'result.mp4'); await writeFile(path, text ? 'upstream typed prompt' : 'domain-only video fixture');
      yield { kind: 'output', artifacts: [{ kind: text ? 'text' : 'video', ...(text ? {} : { port: 'clip', typeVersion: 1 }), localPath: path, mime: text ? 'text/plain' : 'video/mp4', bytes: 1, metadata: {}, groupId: ctx.requestId, role: 'primary', background: null }], usage: null }; },
  };
  const config: ConnectionConfig = { id: 'ConnAA', revision: 1, name: 'Domain fixture', protocol: 'chatCompletions', baseUrl: 'http://unused.invalid', credentialId: null, auth: 'none', apiKeyHeader: null, model: '', purposes: ['text'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  const base: TaskItem = { id: 'Parent', purpose: 'text', operation: 'discuss', operationSnapshot: new ProductionOperationCatalog().resolve('discuss'), target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'background', uiScope: null }, backgroundRemoval: null, backgroundPreview: null, dependencies: [], input: { purpose: 'text', system: '', messages: [{ role: 'user', text: 'a clip', attachments: [] }], maxOutputTokens: 30, temperature: null, seed: null }, sourceVersions: [], configSnapshot: config, workflowSnapshot: null, recipeSnapshot: null, state: 'draft', remote: null, progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] };
  const child: TaskItem = { ...structuredClone(base), id: 'ChildA', purpose: 'org.test.clip/create', operation: snapshot.id, operationSnapshot: snapshot, dependencies: [{ itemId: base.id, sourcePort: 'result', output: 'prompt', selectedCandidateId: null }], input: { purpose: 'org.test.clip/create', fields: {}, references: [] }, configSnapshot: { ...config, id: 'ConnBB', protocol: 'plugin', providerKey: 'org.test.clip/provider', purposes: ['org.test.clip/create'] } };
  const service = new ProductionService({ userData, project: { projectId: 'WorkAA', documents: new Map(), readDocument: () => null } as unknown as ProjectSession, adapter: () => remote, acquireAdapter: async () => ({ adapter: remote, release() {} }),
    freezeProvider: async config => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: snapshot.definition.capabilities, capability: { connectionId: config.id, connectionRevision: config.revision, checkedAt: new Date().toISOString(), serviceVersion: null, purpose: 'org.test.clip/create', status: 'verified', inputs: [{ port: 'fields', required: true, supported: true, limits: {} }, { port: 'references', required: false, supported: true, limits: {} }], output: 'video', models: null, promptFormat: null, textVision: null, remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [] } }), review: async () => { throw new Error('adoption not exercised by domain fixture'); } });
  try {
    const invalidChild = structuredClone(child); invalidChild.dependencies[0]!.sourcePort = 'missing';
    const invalidPlan = await service.planTask({ projectId: 'WorkAA', name: 'invalid port DAG', context: [], items: [base, invalidChild], policy: 'continueWithRule', selectionRule: 'firstValid' });
    expect(invalidPlan.ok).toBe(false); if (!invalidPlan.ok) expect(invalidPlan.error.message).toContain('Dependency port is missing');
    expect(received).toEqual([]);
    const plan = requireValue(await service.planTask({ projectId: 'WorkAA', name: 'typed DAG', stagePolicy:'external', context: [], items: [base, child], policy: 'continueWithRule', selectionRule: 'firstValid' })); const task = requireValue(await service.submit(plan.planId)); await service.drain();
    expect(service.listTasks().find(value => value.id === task.id)!.items.map(item => item.state)).toEqual(['review', 'review']); expect(received[1]).toMatchObject({ purpose: snapshot.id, fields: { prompt: 'upstream typed prompt' }, references: [] });
  } finally { await service.close(); await rm(userData, { recursive: true, force: true }); }
});

it.each([
  { ports: ['result'], selectedPort: 'result', editedText: null, expected: 'result text' },
  { ports: ['result'], selectedPort: 'result', editedText: 'edited prompt', expected: 'edited prompt' },
  { ports: ['first', 'second'], selectedPort: 'second', editedText: null, expected: 'second text' },
  { ports: ['first', 'second'], selectedPort: 'second', editedText: 'global edit', expected: 'second text' },
  { ports: ['first', 'second'], selectedPort: 'first', editedText: 'global edit', expected: 'global edit' },
])('sends $selectedPort to the downstream adapter with ports $ports and editedText $editedText', async ({ ports, selectedPort, editedText, expected }) => {
  const directory = resolve(import.meta.dirname, '../../../tmp/testing/operation-text-dag'); await mkdir(directory, { recursive: true }); const userData = await mkdtemp(join(directory, 'run-'));
  const purpose = 'org.test.text/compose' as const;
  const snapshot: ProductionOperationSnapshot = { id: purpose, version: 1, provider: { id: 'org.test.text', version: '0.1.0' }, definition: {
    ...new ProductionOperationCatalog().resolve('discuss').definition, id: purpose, purpose, providerKey: 'org.test.text/provider',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'], additionalProperties: false },
    inputs: [{ key: 'prompt', type: 'text', required: true, multiple: false, mimeTypes: ['text/plain'] }],
    outputs: ports.map(key => ({ key, type: 'text', required: true, multiple: false, mimeTypes: ['text/plain'] })),
  } };
  const received: GenerationInput[] = [], adapter: GenerationAdapter = {
    inspect: async () => { throw new Error('unused'); }, query: async () => ok({ state: 'unknown', output: null, issues: [] }), fetch: async () => ok([]), cancel: async () => ({ local: 'stopped', remote: 'unsupported' }),
    async *submit(input, ctx) {
      received.push(structuredClone(input)); await mkdir(ctx.directory, { recursive: true });
      const artifacts = await Promise.all(ports.map(async port => {
        const localPath = join(ctx.directory, `${port}.txt`); await writeFile(localPath, `${port} text`);
        return { kind: 'text' as const, port, localPath, mime: 'text/plain', bytes: 1, metadata: {}, groupId: ctx.requestId, role: 'primary' as const, background: null };
      }));
      yield { kind: 'output', artifacts, usage: null };
    },
  };
  const config: ConnectionConfig = { id: 'ConnAA', revision: 1, name: 'Text fixture', protocol: 'plugin', providerKey: 'org.test.text/provider', baseUrl: 'http://unused.invalid', credentialId: null, auth: 'none', apiKeyHeader: null, model: '', purposes: [purpose], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  const parent: TaskItem = { id: 'Parent', purpose, operation: snapshot.id, operationSnapshot: snapshot, target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'script', uiScope: null }, backgroundRemoval: null, backgroundPreview: null, dependencies: [], input: { purpose, fields: { prompt: 'source' }, references: [] }, sourceVersions: [], configSnapshot: config, workflowSnapshot: null, recipeSnapshot: null, state: 'draft', remote: null, progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] };
  const child: TaskItem = { ...structuredClone(parent), id: 'ChildA', dependencies: [{ itemId: parent.id, sourcePort: selectedPort, output: 'prompt', selectedCandidateId: null }], input: { purpose, fields: {}, references: [] } };
  const service = new ProductionService({ userData, project: { projectId: 'WorkAA', documents: new Map(), readDocument: () => null } as unknown as ProjectSession, adapter: () => adapter, acquireAdapter: async () => ({ adapter, release() {} }),
    freezeProvider: async config => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: snapshot.definition.capabilities, capability: { connectionId: config.id, connectionRevision: config.revision, checkedAt: new Date().toISOString(), serviceVersion: null, purpose, status: 'verified', inputs: [{ port: 'fields', required: true, supported: true, limits: {} }, { port: 'references', required: false, supported: true, limits: {} }], output: 'text', models: null, promptFormat: null, textVision: null, remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [] } }), review: async () => { throw new Error('unused'); } });
  try {
    const sibling = { ...structuredClone(child), id: 'ChildB' };
    const plan = requireValue(await service.planTask({ projectId: 'WorkAA', name: 'text ports', context: [], items: [parent, child, sibling], policy: 'waitForSelection', selectionRule: null }));
    expect(plan.task.items[1]!.stageId).toBe(plan.task.items[2]!.stageId);
    const task = requireValue(await service.submit(plan.planId)); await service.drain();
    expect(received).toHaveLength(1);
    const candidateId = service.listTasks()[0]!.items[0]!.candidateIds[0]!;
    const candidate = editedText === null ? service.getCandidate(candidateId)! : requireValue(await service.editCandidate(candidateId, editedText));
    expect(candidate.checks).toEqual([]);
    expect(await candidateText(candidate)).toBe(editedText ?? `${ports[0]} text`);
    requireValue(await service.selectCandidates({ taskId: task.id, selections: [{ itemId: parent.id, candidateId: candidate.id }], target: 'taskOnly', expected: [] })); expect(received).toHaveLength(1); requireValue(await service.authorizeStage(task.id,child.id)); await service.drain();
    expect(service.listTasks()[0]!.items.map(item => item.state)).toEqual(['review', 'review', 'review']);
    expect(received).toHaveLength(3); expect(received.slice(1)).toEqual([expect.objectContaining({ purpose: snapshot.id, fields: { prompt: expected }, references: [] }),expect.objectContaining({ purpose: snapshot.id, fields: { prompt: expected }, references: [] })]);
    expect((await service.authorizeStage(task.id,child.id)).ok).toBe(false);
  } finally { await service.close(); await rm(userData, { recursive: true, force: true }); }
});
