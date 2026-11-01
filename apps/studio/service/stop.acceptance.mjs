import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createId, DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import { startStudioService } from './server.mjs';
import { createNodeStudioHost } from './host.mjs';

const root = resolve(import.meta.dirname, '../../..');
const evidence = join(root, 'test-results/latest/studio-sh10/stop-fix');
await mkdir(evidence, { recursive: true });
const directory = await mkdtemp(join(evidence, 'run-')), profile = join(directory, 'profile'), projects = join(directory, 'projects');
await mkdir(projects);
const records = [], value = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
const record = (id, target, data, expected, actual) => records.push({ id, requirementIds: ['SH-F03', 'SH-E01'], target,
  environment: { platform: process.platform, arch: process.arch, node: process.version, directory }, data, expected, actual,
  result: 'passed', executedAt: new Date().toISOString(), evidencePaths: [join(evidence, 'acceptance-records.json')] });
const bounded = async (work, timeoutMs) => {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Stop regression timed out')), timeoutMs); })]); }
  finally { clearTimeout(timer); }
};
let service, remoteServer;
try {
  service = await startStudioService({ userData: profile, createHost: createNodeStudioHost });
  const call = (group, method, ...args) => fetch(`${service.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group, method, args, clientId: 'stop-regression', entry: 'browser' }) }).then(response => response.json());
  value(await call('projects', 'create', { path: projects, name: 'Stop lifecycle', template: 'light', width: 960, height: 540, engineVersion: '0.1.0' }));
  const host = service.host, projectId = host.projects.currentSession.projectId, projectDirectory = host.projects.currentRoot;
  const scene = value(await call('documents', 'list')).find(document => document.format === 'dsl');
  const path = Object.keys(scene.files).find(path => path.endsWith('/script.gal'));
  const source = `say {speaker:{kind:"narrator"},text:"Stop recovery"} @${createId()};\n`;
  const expected = [{ ref: { kind: 'document', id: scene.documentId }, revision: scene.revision }];
  const edit = value(await call('documents', 'planEdit', { label: 'Stop recovery source', origin: 'script', expected,
    patches: [{ kind: 'text', documentId: scene.documentId, edits: [{ start: 0, end: scene.files[path].length, before: scene.files[path], after: source }] }], preparedAssets: [], requiredRefs: [] }));
  value(await call('documents', 'applyEdit', edit.planId, expected));
  let sends = 0, remoteCompleted = false, queries = 0;
  const sharp = createRequire(import.meta.resolve('@galcraft/assets'))('sharp');
  const pixels = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#789abc' } }).png().toBuffer();
  remoteServer = createServer((request, response) => {
    const json = body => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(body)); };
    if (request.url === '/prompt') { request.resume(); request.on('end', () => { sends++; json({ prompt_id: 'stop-original-remote' }); }); }
    else if (request.url === '/history/stop-original-remote') { queries++; json(remoteCompleted ? { 'stop-original-remote': { status: { completed: true }, outputs: { '1': { images: [{ filename: 'original.png', type: 'output' }] } } } } : {}); }
    else if (request.url === '/queue') json({ queue_running: [[0, 'stop-original-remote']], queue_pending: [] });
    else if (request.url.startsWith('/view?')) { response.setHeader('content-type', 'image/png'); response.end(pixels); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => remoteServer.listen(0, '127.0.0.1', resolve));
  const config = { id: createId(), revision: 1, name: 'Stop recovery protocol fixture', protocol: 'comfyUI', baseUrl: `http://127.0.0.1:${remoteServer.address().port}`, credentialId: null,
    auth: 'none', apiKeyHeader: null, model: 'original-model', purposes: ['image'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  const workflow = { id: createId(), revision: 1, name: 'Stop recovery image', purpose: 'image', imageUsages: ['background'], graphVersion: '1', editorWorkflowPath: null,
    apiGraph: { '1': { class_type: 'Image', inputs: { positive: '', width: 64, height: 64, count: 1 } } },
    inputs: ['positive', 'width', 'height', 'count'].map(port => ({ port, nodeId: '1', classType: 'Image', input: port, valueType: port === 'positive' ? 'string' : 'number', required: true, transform: 'identity' })),
    uploads: [], outputs: [{ nodeId: '1', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'image', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] };
  const item = { id: createId(), purpose: 'image', target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'background', uiScope: null }, backgroundRemoval: null, backgroundPreview: null, dependencies: [],
    input: { purpose: 'image', usage: 'background', positive: 'Stop recovery', negative: '', width: 64, height: 64, count: 1, seed: null, references: [] }, sourceVersions: [], configSnapshot: config, workflowSnapshot: workflow, recipeSnapshot: null,
    state: 'draft', remote: null, progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] };
  const production = (await host.production.current()).service;
  const plan = value(await production.planTask({ projectId, name: 'Stop recovery', items: [item], context: [], policy: 'waitForSelection', selectionRule: null }));
  const task = value(await production.submit(plan.planId)), draining = production.drain();
  await bounded(new Promise(resolve => { const inspect = () => { if (production.listTasks()[0]?.items[0]?.remote) { unsubscribe(); resolve(); } }; const unsubscribe = production.subscribe(inspect); inspect(); }), 8000);
  const accepted = production.listTasks()[0].items[0]; assert.equal(accepted.remote.id, 'stop-original-remote'); assert.equal(sends, 1);

  // Exercise the real Node worker and its forced-stop fallback while an HTTP wait owns pending work.
  const script = join(directory, 'waiting-worker.mjs');
  await writeFile(script, "process.parentPort.once('message', ({ ports: [port] }) => { port.postMessage({ type: 'progress', phase: 'waiting' }); port.start(); setInterval(() => {}, 1000); });\n");
  const operationId = createId(); host.operations.cancelWaitMs = 50;
  const ready = new Promise(resolve => { const changed = event => { if (event.operationId === operationId && event.phase === 'waiting') { host.operations.off('changed', changed); resolve(); } }; host.operations.on('changed', changed); });
  const operation = host.operations.start({ operationId, script, input: {}, outputDirectory: null });
  const worker = host.operations.tasks.get(operationId).child; await bounded(ready, 8000);
  let waitingEntered;
  const entered = new Promise(resolve => { waitingEntered = resolve; }), waitForTask = production.waitForTask.bind(production);
  production.waitForTask = (...args) => { const work = waitForTask(...args); waitingEntered(); return work; };
  const waiting = call('production', 'waitForTask', { taskId: task.id, timeoutMs: 30000 }); await bounded(entered, 8000);
  const started = Date.now(), closing = service.close(); assert.equal(service.close(), closing);
  const [waitResult, operationResult] = await bounded(Promise.all([waiting, operation, closing, draining]), 8000);
  assert.equal(waitResult.error.code, 'TASK_CLOSED'); assert.equal(operationResult.error.code, 'CANCELLED');
  assert.equal(worker.threadId, -1); assert.equal(host.operations.tasks.size, 0);
  assert.throws(() => host.operations.start({ operationId: createId(), script, input: {} }), /stopping/);
  record('SH10-stop-cancels-before-drain', 'real Node host, HTTP production wait and noncooperative Node worker', { operationId, taskId: task.id, requestedWaitMs: 30000, cancelWaitMs: 50 },
    'Stop cancels and joins the local worker and ends the HTTP task wait before draining; repeated close shares one shutdown.',
    { waitCode: waitResult.error.code, operationCode: operationResult.error.code, workerThreadId: worker.threadId, pendingWorkers: host.operations.tasks.size, elapsedMs: Date.now() - started, sameClosePromise: true });
  service = await startStudioService({ userData: profile, createHost: createNodeStudioHost });
  value(await call('projects', 'open', projectDirectory)); value(await call('documents', 'recover', 'restore'));
  const recovered = value(await call('documents', 'list')).find(document => document.documentId === scene.documentId);
  assert.equal(recovered.files[path], source); assert(recovered.dirty);
  const reopened = (await service.host.production.current()).service, retained = reopened.listTasks()[0].items[0];
  assert.equal(retained.state, 'interrupted'); assert.deepEqual(retained.configSnapshot, config); assert.deepEqual(retained.workflowSnapshot, workflow);
  assert.deepEqual(retained.remote, accepted.remote); assert.equal(retained.attempts[0].id, accepted.attempts[0].id); assert.equal(retained.attempts.length, 1); assert.equal(sends, 1);
  remoteCompleted = true; const beforeQueries = queries; value(await reopened.resume(task.id)); await reopened.drain();
  const completed = reopened.listTasks()[0].items[0]; assert.equal(completed.state, 'review', JSON.stringify(completed.issues)); assert.equal(completed.candidateIds.length, 1);
  assert.equal(completed.attempts.length, 1); assert.equal(completed.attempts[0].id, accepted.attempts[0].id); assert.equal(sends, 1); assert(queries > beforeQueries);
  record('SH10-stop-retains-original-recovery', 'real M02 recovery and local HTTP Comfy protocol fixture', { projectId, taskId: task.id, itemId: item.id, remoteId: retained.remote.id, attemptId: retained.attempts[0].id },
    'Stop preserves unsaved source, frozen connection/workflow and original remote identity; restart queries and retrieves the original result with one total submission.',
    { sourceRecovered: true, sourceDirty: recovered.dirty, frozenConfigRetained: true, frozenWorkflowRetained: true, restoredState: retained.state, recoveredState: completed.state, attempts: completed.attempts.length, remotePosts: sends, candidateCount: completed.candidateIds.length });
  await service.close(); service = null;
  await writeFile(join(evidence, 'acceptance-records.json'), JSON.stringify(records, null, 2));
  console.log(JSON.stringify({ result: 'passed', evidence, records: records.length }));
} finally {
  await service?.close();
  if (remoteServer) { remoteServer.closeAllConnections(); await new Promise(resolve => remoteServer.close(resolve)); }
}
