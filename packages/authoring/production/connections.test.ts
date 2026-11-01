import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultTimeoutSecByPurpose, type ConnectionConfig, type ConnectionSelection } from '@galcraft/contracts';
import { GenerationConnections } from './connections.js';
import { HttpGenerationAdapter } from '@galcraft/generation-services';
import type { WorkflowBinding } from './types.js';

let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
const config: ConnectionConfig = { id: 'ConnD3', revision: 1, name: 'Comfy', protocol: 'comfyUI', baseUrl: 'http://local.test', credentialId: null,
  auth: 'none', apiKeyHeader: null, model: 'saved-model', purposes: ['image', 'speech'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose,
  concurrency: 1, parameters: {}, workflowBindingId: 'OldFlow', serverFileRoot: null };
const workflow: WorkflowBinding = { id: 'FlowD3', revision: 1, name: '背景', purpose: 'image', imageUsages: ['background', 'figure'],
  graphVersion: '1', editorWorkflowPath: null, requiredNodes: [], modelNotes: [],
  apiGraph: { '1': { class_type: 'SaveImage', inputs: {} } }, inputs: [], uploads: [], outputs: [{ nodeId: '1', key: 'images', kind: 'image', role: 'primary', decoder: 'comfyFileList', group: 'primary', background: 'unknown' }] };
const selection: ConnectionSelection = { connectionId: config.id, purpose: 'image', imageUsage: 'background', workflowBindingId: workflow.id, model: 'model/a' };

it('uses one inspection for the public report and dimension-specific record, retaining trial evidence only for the same revision', async () => {
  root = await mkdtemp(join(tmpdir(), 'galcraft-d3-checks-'));
  const requests: string[] = [];
  const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async (url, init) => {
    requests.push(`${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`);
    return Response.json({ SaveImage: {} });
  } });
  const original = structuredClone(config);
  const service = new GenerationConnections(root, adapter, undefined, async () => config);
  expect((await service.saveWorkflow(workflow, null)).ok).toBe(true);
  const first = await service.testConnection(selection);
  expect(first.ok && first.value).toMatchObject({ report: { purpose: 'image', status: 'unverified' }, check: { imageUsage: 'background', model: 'model/a', workflowRevision: 1, mapping: 'passed', trial: { result: 'notRun' } } });
  const folder = join(root, 'connections/checks', config.id);
  const firstFile = join(folder, (await readdir(folder))[0]!);
  const previous = JSON.parse(await readFile(firstFile, 'utf8'));
  previous.trial = { taskId: 'TaskD3', result: 'passed', checkedAt: new Date().toISOString() };
  await writeFile(firstFile, JSON.stringify(previous));
  await rename(firstFile, join(folder, 'image-background-FlowD3.json'));
  expect((await service.inspectConnection(selection))).toMatchObject({ ok: true, value: { trial: { result: 'passed' } } });
  await service.testConnection({ ...selection, model: 'model/b' });
  await service.testConnection({ ...selection, imageUsage: 'figure' });
  await service.testConnection({ ...selection, workflowBindingId: 'NoFlow' });
  await service.testConnection({ ...selection, purpose: 'speech', imageUsage: null, workflowBindingId: null });
  expect(await readdir(folder)).toHaveLength(6);
  expect(requests.every(request => request.startsWith('GET '))).toBe(true);
  expect(requests.filter(request => request === 'GET /system_stats')).toHaveLength(6);
  expect(config).toEqual(original);
  config.revision++;
  try { expect(await service.inspectConnection(selection)).toMatchObject({ ok: true, value: { trial: { result: 'notRun' } } }); }
  finally { config.revision--; }
});

it('records missing or mismatched workflows in both results and rejects an undeclared purpose without a request', async () => {
  root = await mkdtemp(join(tmpdir(), 'galcraft-d3-failure-'));
  let requests = 0;
  const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async () => { requests++; return Response.json({}); } });
  const service = new GenerationConnections(root, adapter, undefined, async () => config);
  expect(await service.testConnection({ ...selection, purpose: 'music' })).toMatchObject({ ok: false, error: { code: 'PURPOSE_UNSUPPORTED' } });
  expect(requests).toBe(0);
  expect(await service.testConnection(selection)).toMatchObject({ ok: true, value: { report: { status: 'unavailable', issues: [{ code: 'WORKFLOW_MISSING' }] }, check: { workflowBindingId: workflow.id, mapping: 'failed' } } });
  await service.saveWorkflow({ ...workflow, imageUsages: ['ui'] }, null);
  expect(await service.testConnection(selection)).toMatchObject({ ok: true, value: { report: { issues: [{ code: 'WORKFLOW_PURPOSE' }] }, check: { mapping: 'failed' } } });
});

it('persists guidance in the binding revision and keeps the available image configuration complete', async () => {
  root = await mkdtemp(join(tmpdir(), 'galcraft-sh4-guidance-'));
  const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }) });
  const service = new GenerationConnections(root, adapter);
  const guidance = { description: 'Full character silhouette', scenarios: ['Character introductions'], inputs: [{ port: 'positive', description: 'Appearance and pose' }],
    promptTips: ['Describe one character'], limitations: ['Review transparency'], examples: [{ title: 'Standing', input: 'One standing character', notes: 'Preview before adoption' }] };
  const saved = await service.saveWorkflow({ ...workflow, imageUsages: ['background'], usageGuidance: guidance }, null);
  expect(saved).toMatchObject({ ok: true, value: { revision: 1, imageUsages: ['background'], usageGuidance: guidance } });
  const changed = await service.saveWorkflow({ ...workflow, imageUsages: ['figure'], usageGuidance: { ...guidance, description: 'Revised character guidance' } }, 1);
  expect(changed).toMatchObject({ ok: true, value: { revision: 2 } });
  const stored = JSON.parse(await readFile(join(root, 'connections/workflows', `${workflow.id}.json`), 'utf8'));
  expect(stored).toMatchObject({ revision: 2, imageUsages: ['figure'], usageGuidance: { description: 'Revised character guidance' } });
  expect((await service.saveWorkflow({ ...workflow, usageGuidance: guidance }, 1))).toMatchObject({ ok: false, error: { code: 'WORKFLOW_CONFLICT' } });
});
