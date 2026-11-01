import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createId, DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import { readTemplateDocuments } from '@galcraft/templates';
import { startStudioService } from './server.mjs';
import { createNodeStudioHost } from './host.mjs';
import { createNodeSafeStorage } from './credentials.mjs';
import { studioUserData } from './paths.mjs';
import { compileCollaborationProject } from '../main/collaboration-compile.mjs';

const root = resolve(import.meta.dirname, '../../..');
const evidence = await mkdtemp(join(await mkdir(join(root, 'test-results/studio-host-node'), { recursive: true }).then(() => join(root, 'test-results/studio-host-node')), 'run-'));
const profile = join(evidence, 'profile'), projectParent = join(evidence, 'projects'); await mkdir(projectParent, { recursive: true });
const records = [];
const record = (id, target, data, expected, actual) => records.push({ id, requirementIds: ['SH-F01', 'SH-F02', 'SH-F03'], target, environment: { platform: process.platform, arch: process.arch, node: process.version }, data, expected, actual, result: 'passed', executedAt: new Date().toISOString(), evidencePaths: [join(evidence, 'acceptance-records.json')] });
const value = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
let service, remoteServer;
try {
  service = await startStudioService({ userData: profile, createHost: createNodeStudioHost, frontendDirectory: join(root, 'apps/studio/dist') });
  const call = async (group, method, ...args) => (await fetch(`${service.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group, method, args, clientId: 'node-acceptance' }) })).json();
  value(await call('projects', 'create', { path: projectParent, name: 'Node Host', template: 'light', width: 960, height: 540, engineVersion: '0.1.0' }));
  const host = service.host, session = host.projects.currentSession, projectId = session.projectId, projectDirectory = host.projects.currentRoot;
  const documents = value(await call('documents', 'list')), scene = documents.find(document => document.format === 'dsl');
  const path = Object.keys(scene.files).find(path => path.endsWith('/script.gal'));
  const source = `say {speaker:{kind:"narrator"},text:"Node host capture and recovery"} @${createId()};\n`;
  const expected = [{ ref: { kind: 'document', id: scene.documentId }, revision: scene.revision }];
  const edit = value(await call('documents', 'planEdit', { label: 'Node fixture source', origin: 'script', expected, patches: [{ kind: 'text', documentId: scene.documentId, edits: [{ start: 0, end: scene.files[path].length, before: scene.files[path], after: source }] }], preparedAssets: [], requiredRefs: [] }));
  value(await call('documents', 'applyEdit', edit.planId, expected));
  const compiled = await compileCollaborationProject({ production: host.production, plugins: host.plugins }, session, { publish: true });
  assert(compiled.snapshot, JSON.stringify(compiled.issues));
  record('SH1-node-domain-compile', 'ordinary Node service / worker_threads', { projectId, documentId: scene.documentId, source }, 'HTTP creates a real project; M02 commits source; installed engine compiler creates the current Snapshot on a Node worker.', { snapshotId: compiled.snapshot.snapshotId, issueCodes: compiled.issues.map(issue => issue.code) });
  const template = readTemplateDocuments([...session.documents.values()]);
  const style = { id: createId(), name: 'Node SCSS', scope: { pageId: template.pages[0].id, componentId: null }, language: 'scss', sourcePath: 'ui/styles/node.scss', sourceRevision: 1, assetIds: [], issues: [] };
  const styled = value(await call('templates', 'compileStyle', { style, source: '$accent:#123456; [data-gc-part="title.workTitle"] { color:$accent; }', instanceId: template.instanceId }));
  assert(styled.css?.includes('#123456'), JSON.stringify(styled));
  const operationId = createId(), waiting = host.operations.start({ operationId, script: join(root, 'apps/studio/main/utility-smoke-worker.mjs'), input: { delayMs: 30000, value: 'cancelled' }, outputDirectory: null });
  await host.operations.cancel(operationId); assert.equal((await waiting).error.code, 'CANCELLED');
  record('SH1-node-style-cancel', 'Node compiler and cancellation protocol', { styleId: style.id, operationId }, 'The existing SCSS worker returns CSS, and cancel stops the same operationId.', { css: styled.css, cancelled: true, pendingWorkers: host.operations.tasks.size });
  const engineHandles = host.engines.handles.size;
  const capture = await host.collaboration.capture({ page: 'settings', freezeLayout: [template.pages.find(page => page.key === 'settings').root.id] });
  assert(capture.reached); assert(capture.pixels.length > 1000); assert(capture.renderedText.length > 0); assert.equal(capture.width, 960); assert.equal(host.engines.handles.size, engineHandles);
  await writeFile(join(evidence, 'player-settings.png'), capture.pixels);
  record('SH1-node-player-capture', 'real service-owned headless Chromium / installed Player', { projectId, page: 'settings' }, 'The exact installed Player yields readable pixels, text and layout frames without an Electron window; it releases its engine handle.', { width: capture.width, height: capture.height, mime: capture.mime, bytes: capture.pixels.length, layoutContainers: Object.keys(capture.layoutFrames), engineHandlesBefore: engineHandles, engineHandlesAfter: host.engines.handles.size });
  const imageLease = host.assets.resources.register({ projectId, assetId: createId(), variantId: createId(), relative: 'settings.png', path: join(evidence, 'player-settings.png'), mime: 'image/png' });
  try {
    const range = await fetch(imageLease.uri, { headers: { range: 'bytes=0-31' } }); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 32);
    assert.equal((await host.assets.verifyAssetPlayback({ kind: 'image' }, imageLease.uri)).ok, true);
    record('SH1-node-media-resource', 'real HTTP resource / Chromium image decode', { projectId, uri: imageLease.uri }, 'The service returns the original registered resource with MIME and byte range support; headless Chromium decodes it.', { status: range.status, mime: range.headers.get('content-type'), range: range.headers.get('content-range'), decoded: true });
  } finally { imageLease.release(); }
  const installedModels = join(studioUserData(), 'models');
  if (existsSync(join(installedModels, 'birefnet-v1-tiny/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx'))) {
    const operationId = createId();
    const matte = value(await host.operations.start({ operationId, script: host.assets.mattingWorker, input: { kind: 'removeBackground', inputPath: join(evidence, 'player-settings.png'), modelDirectory: installedModels }, outputDirectory: join(evidence, 'matting'), owner: 'M04' }));
    assert.equal(matte.width, 960); assert.equal(matte.height, 540); assert((await readFile(matte.imagePath)).length > 100);
    record('SH1-node-matting', 'real Node worker / ONNX CPU / installed BiRefNet', { operationId, input: join(evidence, 'player-settings.png') }, 'The existing matting worker loads the real model, infers a mask and writes the original-size transparent PNG from Node.', { width: matte.width, height: matte.height, provider: matte.provider, modelVersion: matte.modelVersion, imagePath: matte.imagePath, maskPath: matte.maskPath });
  }
  const credentialProfile = join(evidence, 'credential-profile'), storage = createNodeSafeStorage(credentialProfile);
  assert(storage.isEncryptionAvailable()); const fixture = 'GalCraft credential fixture — 安全';
  await writeFile(join(credentialProfile, 'node-cipher.bin'), storage.encryptString(fixture));
  const electron = createRequire(import.meta.url)('electron');
  await new Promise((resolve, reject) => {
    const env = { ...process.env, GALCRAFT_CREDENTIAL_FIXTURE: credentialProfile }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [join(import.meta.dirname, 'credentials-electron.acceptance.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Electron credential fixture timed out')); }, 45000);
    let output = ''; child.stdout.on('data', bytes => output += bytes); child.stderr.on('data', bytes => output += bytes);
    child.once('error', error => { clearTimeout(timeout); reject(error); }); child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Credential compatibility failed (${code}): ${output}`)); });
  });
  assert.equal(storage.decryptString(await readFile(join(credentialProfile, 'electron-cipher.bin'))), fixture);
  const original = studioUserData(); let existingCredentials = 0;
  if (existsSync(join(original, 'Local State')) && existsSync(join(original, 'credentials.json'))) {
    const originalStorage = createNodeSafeStorage(original);
    for (const encrypted of Object.values(JSON.parse(await readFile(join(original, 'credentials.json'), 'utf8')))) { originalStorage.decryptString(Buffer.from(encrypted, 'base64')); existingCredentials++; }
  }
  record('SH1-node-credentials', 'Windows DPAPI / Chromium v10 vault', { syntheticVault: credentialProfile, existingCredentialCount: existingCredentials }, 'Node and Electron 43 decrypt each other’s synthetic ciphertext; Node reads existing personal credentials without changing credential identities or displaying secrets.', { nodeToElectron: true, electronToNode: true, existingCredentialsDecrypted: existingCredentials });
  const credentialId = createId(), connectionId = createId();
  await host.connections.save({ id: connectionId, credentialId, name: 'Node credential fixture', protocol: 'chatCompletions', baseUrl: 'http://127.0.0.1:1', model: 'fixture' }, fixture);
  assert.equal((await host.connections.read(connectionId)).secret, fixture);
  const production = (await host.production.current()).service;
  let sends = 0, remoteCompleted = false;
  remoteServer = createServer((request, response) => {
    const json = body => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(body)); };
    if (request.url === '/prompt') { request.resume(); request.on('end', () => { sends++; json({ prompt_id: 'node-original-remote' }); }); }
    else if (request.url === '/history/node-original-remote') json(remoteCompleted ? { 'node-original-remote': { status: { completed: true }, outputs: { '1': { images: [{ filename: 'original.png', type: 'output' }] } } } } : {});
    else if (request.url === '/queue') json({ queue_running: [[0, 'node-original-remote']], queue_pending: [] });
    else if (request.url.startsWith('/view?')) { response.setHeader('content-type', 'image/png'); response.end(capture.pixels); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => remoteServer.listen(0, '127.0.0.1', resolve));
  const frozenConnection = { id: createId(), revision: 1, name: 'Node recovery protocol fixture', protocol: 'comfyUI', baseUrl: `http://127.0.0.1:${remoteServer.address().port}`, credentialId: null, auth: 'none', apiKeyHeader: null, model: 'fixture', purposes: ['image'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  const workflow = { id: createId(), revision: 1, name: 'Node recovery image', purpose: 'image', imageUsages: ['background'], graphVersion: '1', editorWorkflowPath: null,
    apiGraph: { '1': { class_type: 'Image', inputs: { positive: '', width: 960, height: 540, count: 1 } } }, inputs: ['positive', 'width', 'height', 'count'].map(port => ({ port, nodeId: '1', classType: 'Image', input: port, valueType: port === 'positive' ? 'string' : 'number', required: true, transform: 'identity' })), uploads: [], outputs: [{ nodeId: '1', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'image', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] };
  const step = { id: createId(), purpose: 'image', target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'background', uiScope: null }, backgroundRemoval: null, backgroundPreview: null, dependencies: [], input: { purpose: 'image', usage: 'background', positive: 'Node recovery', negative: '', width: 960, height: 540, count: 1, seed: null, references: [] }, sourceVersions: [], configSnapshot: frozenConnection, workflowSnapshot: workflow, recipeSnapshot: null, state: 'draft', remote: null, progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] };
  const plan = value(await production.planTask({ projectId, name: 'Node remote recovery', items: [step], context: [], policy: 'waitForSelection', selectionRule: null }));
  const task = value(await production.submit(plan.planId)), draining = production.drain();
  const deadline = Date.now() + 15000;
  while (!production.listTasks().find(value => value.id === task.id)?.items[0].remote && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  const accepted = production.listTasks().find(value => value.id === task.id).items[0]; assert.equal(accepted.remote?.id, 'node-original-remote'); assert.equal(sends, 1);
  const originalAttempt = accepted.attempts[0].id;
  await service.close(); service = null;
  await draining;
  service = await startStudioService({ userData: profile, createHost: createNodeStudioHost, frontendDirectory: join(root, 'apps/studio/dist') });
  value(await service.host.call('projects', 'open', projectDirectory));
  assert(value(await service.host.call('documents', 'listRecovery')));
  value(await service.host.call('documents', 'recover', 'restore'));
  const reopened = value(await service.host.call('documents', 'list')).find(document => document.documentId === scene.documentId);
  assert.equal(reopened.files[path], source); assert(reopened.dirty);
  assert.equal((await service.host.connections.read(connectionId)).secret, fixture);
  const restoredProduction = (await service.host.production.current()).service;
  const retained = restoredProduction.listTasks().find(value => value.id === task.id).items[0];
  assert.equal(retained.state, 'interrupted'); assert.equal(retained.remote.id, 'node-original-remote'); assert.equal(retained.attempts[0].id, originalAttempt); assert.equal(retained.attempts.length, 1); assert.deepEqual(retained.configSnapshot, frozenConnection); assert.deepEqual(retained.workflowSnapshot, workflow); assert.equal(sends, 1);
  remoteCompleted = true; value(await restoredProduction.resume(task.id)); await restoredProduction.drain();
  const recoveredTask = restoredProduction.listTasks().find(value => value.id === task.id).items[0];
  assert.equal(recoveredTask.state, 'review', JSON.stringify(recoveredTask.issues)); assert.equal(recoveredTask.attempts[0].id, originalAttempt); assert.equal(recoveredTask.attempts.length, 1); assert.equal(sends, 1);
  record('SH1-node-remote-recovery', 'Node service restart / real HTTP Comfy protocol fixture', { taskId: task.id, itemId: step.id, remoteId: retained.remote.id, attemptId: originalAttempt }, 'Stopping persists the frozen connection/workflow and original remote request; restart queries and retrieves its original result with one total POST.', { frozenConnectionRetained: true, frozenWorkflowRetained: true, restoredState: retained.state, recoveredState: recoveredTask.state, attempts: recoveredTask.attempts.length, remotePosts: sends, candidateCount: recoveredTask.candidateIds.length });
  record('SH1-node-stop-recovery', 'ordinary Node service restart / real M02 recovery and vault', { projectId, projectDirectory, connectionId, credentialId }, 'Stopping the service keeps unsaved working source; reopening recovers it dirty and the same credentialId reads successfully.', { sourceRecovered: true, dirty: reopened.dirty, credentialId: (await service.host.connections.read(connectionId)).config.credentialId });
  await service.close(); service = null;
  await writeFile(join(evidence, 'acceptance-records.json'), JSON.stringify(records, null, 2));
  console.log(JSON.stringify({ result: 'passed', evidence, records: records.length }));
} catch (error) {
  await writeFile(join(evidence, 'failure.txt'), String(error.stack ?? error));
  await writeFile(join(evidence, 'acceptance-records.json'), JSON.stringify(records, null, 2));
  console.error(error); process.exitCode = 1;
} finally { await service?.close(); if (remoteServer) { remoteServer.closeAllConnections(); await new Promise(resolve => remoteServer.close(resolve)); } }
