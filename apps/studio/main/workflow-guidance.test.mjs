import { expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StudioCollaboration } from './collaboration-providers.mjs';
import { domainCatalog } from './collaboration-catalog.mjs';
import { CatalogOutputSchema, WorkflowSummarySchema } from './collaboration-contracts.mjs';
import { StudioProduction } from './production-providers.mjs';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';

it('projects workflow summaries and details from the same persisted guidance revision', async () => {
  const root = resolve('../../tmp/testing/sh4-workflow-catalog'), directory = join(root, 'connections/workflows');
  await mkdir(directory, { recursive: true });
  const binding = { id: 'FlowS4', revision: 6, name: 'Standing character', purpose: 'image', imageUsages: ['figure'],
    graphVersion: '2', apiGraph: { '1': { class_type: 'SaveImage', inputs: {} } }, inputs: [], outputs: [], uploads: [],
    usageGuidance: { description: 'Transparent full figure', scenarios: ['Dialogue'], inputs: [{ port: 'positive', description: 'Appearance and pose' }],
      promptTips: ['Describe one character'], limitations: ['Inspect the silhouette'], examples: [{ title: 'Pose', input: 'One standing character', notes: 'Inspect the preview' }] } };
  const operation = { id: 'image', version: 1, provider: null, definition: { title: 'Image', purpose: 'image',
    adoption: { kind: 'asset', usages: ['figure', 'ui'] }, inputSchema: { type: 'object' } } };
  const owner = Object.create(StudioCollaboration.prototype);
  Object.assign(owner, { userData: root, project: () => ({}), production: { generationProviders: { operations: async () => [operation] } },
    core: { get: () => ({ scope: { workflowIds: [binding.id] } }) } });
  try {
    await writeFile(join(directory, `${binding.id}.json`), JSON.stringify(binding));
    const entries = await owner.workflows({ sessionId: 'SessS4' });
    expect(entries[0]).toMatchObject({ purpose: 'image', description: binding.usageGuidance.description, revision: 6, usages: ['figure'], operationIds: ['image'] });
    const { workflow, inputSchema, ...summary } = entries[0];
    expect(WorkflowSummarySchema.parse(summary)).toMatchObject({ description: binding.usageGuidance.description });
    const listed = CatalogOutputSchema.parse(await domainCatalog(owner, { category: 'workflows' }, {}));
    const detail = CatalogOutputSchema.parse(await domainCatalog(owner, { category: 'workflows', key: binding.id }, {}));
    expect(listed.entries[0]).toMatchObject({ purpose: 'image', usages: ['figure'], description: binding.usageGuidance.description, revision: 6 });
    expect(detail.entries[0].definition).toMatchObject({ description: listed.entries[0].description, revision: listed.entries[0].revision, binding: { usageGuidance: binding.usageGuidance } });
    binding.revision = 7; binding.usageGuidance.description = 'Revised guidance'; binding.imageUsages = [];
    await writeFile(join(directory, `${binding.id}.json`), JSON.stringify(binding));
    expect((await owner.workflows({ sessionId: 'SessS4' }))[0]).toMatchObject({ revision: 7, description: 'Revised guidance', operationIds: [], usages: [] });
    expect(JSON.parse(await readFile(join(directory, `${binding.id}.json`), 'utf8')).revision).toBe(7);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('checks the saved workflow revision and rejects explicit incompatible image uses without checking service nodes', async () => {
  const root = resolve('../../tmp/testing/sh4-workflow-inspection'), directory = join(root, 'connections/workflows');
  await mkdir(directory, { recursive: true });
  const workflow = { id: 'FlowS4', revision: 4, name: 'Character', purpose: 'image', imageUsages: ['figure'] };
  const config = { id: 'ConnS4', revision: 2, name: 'Comfy', protocol: 'comfyUI', purposes: ['image'], parameters: {},
    model: '', baseUrl: 'http://local.invalid', credentialId: null, auth: 'none', apiKeyHeader: null,
    timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, workflowBindingId: null, serverFileRoot: null };
  const checkedRevisions = [], owner = Object.create(StudioProduction.prototype);
  Object.assign(owner, { userData: root, projects: { currentSession: {} }, connections: { read: async () => ({ config }) },
    generationProviders: { operations: async () => [] },
    acquireAdapter: async () => ({ adapter: { inspect: async () => ({ status: 'unverified', checkedAt: '2026-10-25T00:00:00Z', issues: [] }) }, release() {} }),
    adapter: { checkWorkflow: async (_config, binding) => { checkedRevisions.push(binding.revision); return { ok: true, value: undefined, warnings: [] }; } } });
  try {
    await writeFile(join(directory, `${workflow.id}.json`), JSON.stringify(workflow));
    const input = { operation: 'image', connectionId: config.id, workflowId: workflow.id, usage: 'background' };
    const rejected = await owner.inspectOperationConnection(input);
    expect(rejected).toMatchObject({ ok: true, value: { workflow: { revision: 4 }, mapping: 'failed', issues: [{ code: 'WORKFLOW_PURPOSE' }] } });
    expect(checkedRevisions).toEqual([]);
    const accepted = await owner.inspectOperationConnection({ ...input, usage: 'figure' });
    expect(accepted).toMatchObject({ ok: true, value: { workflow: { revision: 4 }, mapping: 'passed' } });
    expect(checkedRevisions).toEqual([4]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('keeps exact operation identity and reports unavailable workflow contracts instead of an empty schema', async () => {
  const root = resolve('../../tmp/testing/music-workflow-missing-contract'), directory = join(root, 'connections/workflows');
  const selected = { id: 'vendor.voice/clone', version: 1, provider: { id: 'vendor.voice', version: '0.1.0' },
    definition: { purpose: 'speech', title: 'Clone', adoption: { kind: 'asset', usages: ['voice'] }, inputSchema: { type: 'object', properties: { referenceText: { type: 'string' } }, required: ['referenceText'], additionalProperties: false } } };
  const other = { ...selected, id: 'vendor.voice/design', definition: { ...selected.definition, inputSchema: { type: 'object', properties: { description: { type: 'string' } } } } };
  const owner = Object.create(StudioCollaboration.prototype);
  Object.assign(owner, { userData: root, project: () => ({}), production: { generationProviders: { operations: async () => [other, selected] } }, core: { get: () => ({ scope: { mode: 'currentProject' } }) } });
  try {
    await mkdir(directory, { recursive: true });
    const binding = { id: 'VoiceFlow', name: 'Clone', revision: 1, purpose: 'speech', operation: selected.id };
    await writeFile(join(directory, 'VoiceFlow.json'), JSON.stringify(binding));
    expect((await owner.workflows({}))[0]).toMatchObject({ operationIds: [selected.id], inputSchema: selected.definition.inputSchema });
    const detail = CatalogOutputSchema.parse(await domainCatalog(owner, { category: 'workflows', key: binding.id }, {}));
    expect(detail.entries[0].inputSchema).toEqual(selected.definition.inputSchema);
    binding.operation = 'missing.voice/clone';
    await writeFile(join(directory, 'VoiceFlow.json'), JSON.stringify(binding));
    expect((await owner.workflows({}))[0]).toMatchObject({ operationIds: [], inputSchema: null });
    const listing = CatalogOutputSchema.parse(await domainCatalog(owner, { category: 'workflows', limit: 1 }, {}));
    expect(listing.entries[0]).toMatchObject({ key: binding.id, availability: 'unavailable' });
    expect(listing.issues[0]).toMatchObject({ code: 'CONTRACT_UNAVAILABLE' });
    await expect(domainCatalog(owner, { category: 'workflows', key: binding.id }, {})).rejects.toMatchObject({ code: 'CONTRACT_UNAVAILABLE' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
