import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CapabilityReportSchema, DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import { createNodeStudioHost } from '../service/host.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';

const state = { userData: '' };
let server, baseUrl, assembly;
const requests = [];
const context = new AsyncLocalStorage();
const invoke = (method, ...args) => assembly.host.call('connections', method, ...args);
const config = { id: 'D3Conn', revision: 1, name: '读取服务信息', protocol: 'chatCompletions', baseUrl: '',
  credentialId: null, auth: 'bearer', apiKeyHeader: null, model: 'first', purposes: ['text'],
  timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
const selection = { connectionId: config.id, purpose: 'text', imageUsage: null, workflowBindingId: null, model: 'selected-model' };

beforeAll(async () => {
  state.userData = await mkdtemp(join(tmpdir(), 'galcraft-d3-main-'));
  server = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization });
    response.setHeader('Content-Type', 'application/json');
    if (request.url.includes('/offline')) { response.statusCode = 503; response.end(JSON.stringify({ error: 'Service offline' })); return; }
    response.end(JSON.stringify({ data: [{ id: 'selected-model' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  assembly = await createNodeStudioHost({ userData: state.userData, origin: baseUrl, publish() {}, requestDialog: async () => ({ canceled: true, filePaths: [] }), requestContext: () => context.getStore() });
}, 60000);
afterAll(async () => { await assembly?.close(); await new Promise(resolve => server.close(resolve)); await rm(state.userData, { recursive: true, force: true }); });

it('the production Node assembly checks a personal connection without opening a project', async () => {
  expect((await invoke('save', { ...config, baseUrl }, 'private-d3-key')).ok).toBe(true);
  const result = await invoke('test', selection);
  expect(result.ok).toBe(true);
  expect(CapabilityReportSchema.parse(result.value)).toMatchObject({ purpose: 'text', status: 'unverified', models: ['selected-model'] });
  expect(JSON.stringify(result)).not.toContain('private-d3-key');
  expect(requests).toEqual([{ method: 'GET', path: '/v1/models', authorization: 'Bearer private-d3-key' }]);
  const folder = join(state.userData, 'connections/checks', config.id);
  const files = await readdir(folder);
  const check = JSON.parse(await readFile(join(folder, files[0]), 'utf8'));
  expect(check).toMatchObject({ purpose: 'text', imageUsage: null, model: 'selected-model', reachable: 'passed', mapping: 'passed', trial: { result: 'notRun' } });
  expect(assembly.host.projects.currentSession).toBeNull();
});

it('rejects an undeclared purpose before inspecting and preserves the saved connection on service failure', async () => {
  expect((await invoke('test', { ...selection, purpose: 'music' })).error.code).toBe('PURPOSE_UNSUPPORTED');
  expect(requests).toHaveLength(1);
  await invoke('save', { ...config, baseUrl: `${baseUrl}/offline`, revision: 2 });
  expect((await invoke('test', selection)).value).toMatchObject({ status: 'unavailable', issues: [{ code: 'CONNECTION_UNAVAILABLE' }] });
  expect((await invoke('list')).value[0]).toMatchObject({ revision: 2, baseUrl: `${baseUrl}/offline` });
}, 15000);

it('gives the existing plugin selection context diagnostic without requiring it for ordinary connections', async () => {
  await invoke('save', { ...config, protocol: 'plugin', providerKey: 'test.plugin/generate', baseUrl: '', revision: 3 });
  expect((await invoke('test', selection)).error).toMatchObject({ code: 'HOST_IO', owner: 'M10' });
});

it('keeps entry preferences, workspace and stage guides separate while retaining desktop files', async () => {
  const call = (entry, method, ...args) => context.run({ entry }, () => assembly.host.call('authoringPreferences', method, ...args));
  const initial = (await call('desktop', 'readPreferences')).value;
  await call('desktop', 'writePreferences', { ...initial, theme: 'dark' });
  await call('browser', 'writePreferences', { ...initial, theme: 'light' });
  expect((await call('desktop', 'readPreferences')).value.theme).toBe('dark');
  expect((await call('browser', 'readPreferences')).value.theme).toBe('light');
  expect(JSON.parse(await readFile(join(state.userData, 'preferences.json'), 'utf8')).theme).toBe('dark');
  const guides = { schemaVersion: 1, projectId: 'ProjAA', uiBounds: true, center: true, thirds: false };
  await call('desktop', 'writeStageGuides', guides);
  expect((await call('browser', 'readStageGuides', 'ProjAA')).value.uiBounds).toBe(false);
  expect((await call('desktop', 'readStageGuides', 'ProjAA')).value).toEqual(guides);
  const workspace = { schemaVersion: 1, projectId: 'ProjAA', documentId: 'DocuAA', sceneId: 'ScenAA', documentRevision: 1, view: 'script',
    caret: { statementId: null, field: null, offset: 0, documentOffset: 0 }, previousStatementId: null, nextStatementId: null,
    scroll: { statementId: null, offsetPx: 12, scrollLeft: 0 }, updatedAt: '2026-10-25T00:00:00.000Z' };
  await call('desktop', 'writeWorkspace', workspace);
  await call('browser', 'writeWorkspace', { ...workspace, view: 'writing' });
  expect((await call('desktop', 'readWorkspace', 'ProjAA')).value.view).toBe('script');
  expect((await call('browser', 'readWorkspace', 'ProjAA')).value.view).toBe('writing');
  await call('browser', 'clearWorkspace', 'ProjAA');
  expect((await call('browser', 'readWorkspace', 'ProjAA')).value).toBeNull();
  expect((await call('desktop', 'readWorkspace', 'ProjAA')).value).toEqual(workspace);
  expect(assembly.host.entryPreferences().root).toBe(assembly.host.preferences.root);
  expect(context.run({ entry: 'browser' }, () => assembly.host.entryPreferences().root)).toContain('entries');
});
