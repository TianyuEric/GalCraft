import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createId } from '@galcraft/contracts';
import { startStudioService } from './server.mjs';
import { createNodeStudioHost } from './host.mjs';
import { compileCollaborationProject } from '../main/collaboration-compile.mjs';
const root = resolve(import.meta.dirname, '../../..'), evidence = await mkdtemp(join(await mkdir(join(root, 'test-results/sh6-mobile-http'), { recursive: true }).then(() => join(root, 'test-results/sh6-mobile-http')), 'run-'));
const value = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
let service;
try {
  service = await startStudioService({ userData: join(evidence, 'profile'), createHost: createNodeStudioHost, frontendDirectory: join(root, 'apps/studio/dist') });
  const call = async (group, method, ...args) => (await fetch(`${service.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group, method, args, clientId: 'sh6-mobile' }) })).json();
  const parent = join(evidence, 'works'); await mkdir(parent);
  value(await call('projects', 'create', { path: parent, name: 'Mobile PNG and Core Variable', template: 'rich', width: 960, height: 540, engineVersion: '0.1.0' }));
  const host = service.host, session = host.projects.currentSession;
  const sharp = createRequire(join(root, 'packages/publishing/package.json'))('sharp');
  const image = join(evidence, 'title.png'); await sharp({ create: { width: 960, height: 540, channels: 4, background: '#496e91' } }).png().toFile(image);
  const imported = value(await call('assets', 'import', [image])); assert.equal(imported.failed.length, 0); const asset = imported.succeeded[0]; assert(asset);
  let docs = value(await call('documents', 'list')), project = docs.find(doc => doc.files['project.json']), scene = docs.find(doc => doc.format === 'dsl');
  const variableDocument = docs.find(doc => Object.keys(doc.files).some(path => path.startsWith('variables/'))); assert(variableDocument);
  const variable = JSON.parse(Object.values(variableDocument.files)[0]).data;
  const projectData = JSON.parse(project.files['project.json']).data, expected = [{ ref: { kind: 'document', id: project.documentId }, revision: project.revision }, { ref: { kind: 'document', id: scene.documentId }, revision: scene.revision }];
  const sourcePath = Object.keys(scene.files).find(path => path.endsWith('/script.gal')), source = `say {speaker:{kind:"narrator"},text:"PNG 与核心变量 HUD 的 Android/iOS 最小作品"} @${createId()};\n`;
  const edit = value(await call('documents', 'planEdit', { label: 'Mobile fixture', origin: 'script', expected, patches: [
    { kind: 'json', documentId: project.documentId, changes: [{ path: '/data/display/titleBackground', before: projectData.display.titleBackground, after: asset.id, op: 'set' }] },
    { kind: 'text', documentId: scene.documentId, edits: [{ start: 0, end: scene.files[sourcePath].length, before: scene.files[sourcePath], after: source }] },
  ], preparedAssets: [], requiredRefs: [{ kind: 'asset', id: asset.id }] })); value(await call('documents', 'applyEdit', edit.planId, expected));
  for (const target of ['android', 'ios']) { const verified = value(await call('assets', 'verifyTarget', target, createId())); assert.equal(verified.issues.length, 0, JSON.stringify(verified)); }
  const save = value(await call('documents', 'planSave', { kind: 'all' })); value(await call('documents', 'save', save.planId));
  const compiled = await compileCollaborationProject({ production: host.production, plugins: host.plugins }, session, { publish: true }); assert(compiled.snapshot, JSON.stringify(compiled.issues));
  assert(JSON.stringify(compiled.snapshot.template).includes(`"variableId":"${variable.id}"`));
  docs = value(await call('documents', 'list')); const snapshot = compiled.snapshot, savedVersions = docs.map(doc => ({ ref: { kind: 'document', id: doc.documentId }, revision: doc.savedRevision }));
  const catalog = value(await call('builds', 'targets')); assert(catalog.some(entry => entry.description.target === 'android')); assert(catalog.some(entry => entry.description.target === 'ios'));
  const android = catalog.find(entry => entry.description.target === 'android').builder;
  const toolchain = value(await call('builds', 'detectToolchain', { builder: android, input: { directory: 'D:/GalCraftTools' } })); assert(toolchain.sdkRoot.startsWith('D:\\GalCraftTools'));
  const receipts = [];
  for (const [target, output] of [['android', 'apk'], ['android', 'aab'], ['ios', 'xcodeProject']]) {
    const builder = catalog.find(entry => entry.description.target === target).builder;
    const targetOptions = target === 'android' ? { applicationId: `org.galcraft.game${session.projectId.toLowerCase()}`, versionCode: 1, output, toolchain: { directory: 'D:/GalCraftTools' } } : { bundleId: `org.galcraft.game${session.projectId.toLowerCase()}`, buildNumber: '1', output };
    const plan = value(await call('builds', 'planBuild', { projectId: session.projectId, target, outputDirectory: join(evidence, output), releaseVersion: snapshot.releaseVersion, snapshotId: snapshot.snapshotId, savedVersions, keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [], targetBuilder: builder, targetOptions }));
    assert.equal(plan.issues.filter(issue => issue.severity === 'error').length, 0, JSON.stringify(plan.issues));
    const receipt = value(await call('builds', 'build', plan.planId)); assert.ok((await stat(receipt.entry)).size > 0);
    const released = JSON.parse(await readFile(join(receipt.outputDirectory, 'game/snapshot.json'), 'utf8')); assert(released.assets.some(item => item.assetId === asset.id)); assert(JSON.stringify(released.template).includes(`"variableId":"${variable.id}"`));
    receipts.push(receipt); await writeFile(join(evidence, `${output}-receipt.json`), JSON.stringify(receipt, null, 2));
  }
  await writeFile(join(evidence, 'acceptance.json'), JSON.stringify({ result: 'passed', environment: { os: process.platform, arch: process.arch, node: process.version }, projectId: session.projectId, variableId: variable.id, assetId: asset.id, catalog, toolchain, receipts, evidenceBoundary: 'Real Node HTTP, M02/M04/M09/M11, Chromium common Player validation and Gradle APK/AAB; Windows Xcode project export. Device installation and macOS Xcode execution not performed.' }, null, 2));
  console.log(evidence);
} finally { await service?.close(); }
