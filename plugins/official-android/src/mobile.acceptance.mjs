import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate } from '@galcraft/templates';
import { ReleaseBuilder } from '../../../packages/publishing/dist/engine/build.js';
import { loadPluginServices } from '../../../packages/plugins/dist/registry/host.js';
const root = resolve('test-results/sh6-mobile'), log = [];
await mkdir(root, { recursive: true });
const snapshot = structuredClone(FixtureSnapshot);
snapshot.assets = []; snapshot.characters = []; snapshot.flows = []; snapshot.gallery = [];
snapshot.template = createOfficialTemplate({ kind: 'light' }); snapshot.pluginDocuments = {};
snapshot.project.name = '移动目标最小作品'; snapshot.scenes = [snapshot.scenes[0]];
snapshot.scenes[0].instructions = snapshot.scenes[0].instructions.slice(0, 1);
snapshot.scenes[0].instructions[0].args = { speaker: { kind: 'narrator' }, text: '这是由 GalCraft 公共运行时承载的移动作品。', voice: null };
snapshot.project.chapters[0].sceneIds = [snapshot.scenes[0].scene.id];
snapshot.lock.plugins = []; snapshot.lock.engine.targets = ['web', 'windows', 'android', 'ios']; snapshot.lock.template = snapshot.template.dependencies[0]; snapshot.lock.template.targets = ['web', 'windows', 'android', 'ios'];
const savedVersions = snapshot.documents.map(item => ({ ref: { kind: 'document', id: item.documentId }, revision: item.revision }));
const runtime = resolve('apps/player-web/dist'), files = [];
async function walk(directory, prefix = '') { for (const item of await readdir(directory, { withFileTypes: true })) { const path = `${prefix}${item.name}`;
  if (item.isDirectory()) await walk(join(directory, item.name), `${path}/`); else files.push({ path, source: join(directory, item.name), size: (await stat(join(directory, item.name))).size, role: 'runtime' }); } }
await walk(runtime);
for (const [target, output] of [['android', 'apk'], ['android', 'aab'], ['ios', 'xcodeProject']]) {
  const pkg = resolve(`plugins/official-${target}/package`), manifest = JSON.parse(await readFile(join(pkg, 'manifest.json'), 'utf8'));
  const plugin = await loadPluginServices(pkg, manifest);
  const offered = await plugin.activate({ pluginId: manifest.id, target, domain: { kind: 'sample', projectId: snapshot.projectId, instance: 'sh6' }, documents: {}, assets: {}, pages: {}, log() {} });
  const builder = offered.targetBuilders[0];
  const input = { projectId: snapshot.projectId, target, outputDirectory: join(root, output), releaseVersion: snapshot.releaseVersion, snapshotId: snapshot.snapshotId, savedVersions,
    keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [], targetBuilder: { key: builder.key, pluginId: manifest.id, version: manifest.version },
    targetOptions: target === 'android' ? { applicationId: 'org.galcraft.sh6minimal', versionCode: 1, output, toolchain: { directory: 'D:/GalCraftTools' } } : { bundleId: 'org.galcraft.sh6minimal', buildNumber: '1', output } };
  assert.deepEqual(await builder.validate(input.targetOptions, input), []);
  const release = new ReleaseBuilder(async () => ({ ok: true, value: { evidencePaths: [] }, warnings: [] }), (_id, phase) => console.log(target, output, phase), undefined,
    (build, signal) => builder.build(build, { signal, progress: event => { log.push(event); if (event.phase === 'building') console.log(event.message); } }));
  const planned = release.planBuild(input, { project: snapshot.project, snapshot, savedVersions, engine: { manifest: { version: '0.1.0' }, directory: runtime, target, availability: 'ready' }, files,
    textFiles: { 'game/style.css': '' }, capabilities: [], issues: [], entry: 'index.html', gameDirectory: 'game', instructions: '<p>Android: install the APK, or upload the AAB with your release signing. iOS: open ios-project/GalCraftPlayer.xcodeproj in Xcode.</p>' });
  assert.equal(planned.ok, true, JSON.stringify(planned));
  const result = await release.build(planned.value.planId); await writeFile(join(root, `${output}-receipt.json`), JSON.stringify(result, null, 2));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok((await stat(result.value.entry)).size > 0);
  if (target === 'android') { const bytes = await readFile(result.value.entry); assert.equal(bytes.subarray(0, 2).toString(), 'PK'); }
  await plugin.deactivate();
}
await writeFile(join(root, 'progress.json'), JSON.stringify(log, null, 2)); console.log('SH6 real APK/AAB and Windows Xcode project export passed');
