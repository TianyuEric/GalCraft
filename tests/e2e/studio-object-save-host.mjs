import { app, BrowserWindow, ipcMain } from 'electron';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { createId, SceneSchema } from '@galcraft/contracts';
import { FixtureProject, FixtureAsset, FixtureCharacters } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { startStudioService } from '../../apps/studio/service/server.mjs';
import { createNodeStudioHost } from '../../apps/studio/service/host.mjs';

const repo = resolve(import.meta.dirname, '../..'), owned = resolve(repo, 'tmp/testing/studio-object-save');
const root = join(owned, 'current'), project = join(root, 'project');
const child = relative(owned, root);
if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Acceptance root must stay inside its dedicated testing directory');
await rm(root, { recursive: true, force: true });
await mkdir(join(root, 'profile'), { recursive: true });
const logError = console.error; console.error = (...args) => { appendFileSync(join(root, 'startup.log'), args.map(String).join(' ') + '\n'); logError(...args); };
process.on('uncaughtException', error => { console.error(error.stack); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error?.stack ?? error); app.exit(1); });
app.setPath('userData', join(root, 'profile'));
const template = createOfficialTemplate({ kind: 'light' }), projectId = createId(), projectDocumentId = createId(), chapterId = createId(), sceneId = createId(), sceneDocumentId = createId(), secondSceneId = createId(), secondSceneDocumentId = createId(), indexId = createId();
const scene = SceneSchema.parse({ id: sceneId, name: '选择保存场景', chapterId, parameters: [], locals: [], returns: 'void', script: 'script.gal' });
const secondScene = SceneSchema.parse({ ...scene, id: secondSceneId, name: '独立干净场景' });
const data = { ...structuredClone(FixtureProject), projectId, name: '选择保存验收作品', templateDocumentId: template.instanceId,
  entry: { sceneId, labelId: null }, chapters: [{ id: chapterId, name: '验收章节', sceneIds: [sceneId, secondSceneId] }],
  display: { icon: null, splash: null, titleBackground: null, titleMusic: null, titleVideo: null }, dynamicAssets: [],
  player: { ...structuredClone(FixtureProject.player), name: null, emergencyImage: null, fallbackFonts: [] } };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const assets = ['素材一', '素材二'].map(name => {
  const id = createId(), variantId = createId(), variant = { ...structuredClone(FixtureAsset.variants[0]), id: variantId, parentId: null,
    entry: 'background.png', files: [{ path: 'background.png', bytes: png.length, mime: 'image/png', role: 'entry' }], metadata: { width: 1, height: 1 } };
  return { ...structuredClone(FixtureAsset), id, revision: 1, name, sceneIds: [], characterId: null, originalVariantId: variantId, activeVariantId: variantId, variants: [variant] };
});
const character = { ...structuredClone(FixtureCharacters[0]), id: createId(), name: '保存验收角色', initialDifferenceId: null, differences: [] };
const envelope = (documentId, value) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data: value }, null, 2) + '\n';
const lockId = createId();
const session = await ProjectSession.createProject(project, projectId, [
  { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, data) } },
  { documentId: lockId, revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(lockId, { engine: { kind: 'engine', id: 'galcraft', version: '0.1.0', targets: ['web', 'windows'], required: true },
    plugins: template.dependencies.filter(item => item.kind === 'plugin'), template: template.dependencies.find(item => item.kind === 'template'), selectedProviders: {} }) } },
  { documentId: sceneDocumentId, revision: 1, format: 'dsl', files: { [`scenes/${sceneId}/scene.json`]: envelope(sceneDocumentId, scene), [`scenes/${sceneId}/script.gal`]: '' } },
  { documentId: secondSceneDocumentId, revision: 1, format: 'dsl', files: { [`scenes/${secondSceneId}/scene.json`]: envelope(secondSceneDocumentId, secondScene), [`scenes/${secondSceneId}/script.gal`]: '' } },
  { documentId: character.id, revision: 1, format: 'json', files: { [`characters/${character.id}.json`]: envelope(character.id, character) } },
  { documentId: indexId, revision: 1, format: 'json', files: { 'assets/index.json': envelope(indexId, { assets }) } },
  ...createTemplateDocuments(template),
]);
await session.dispose('saved');
for (const asset of assets) { const folder = join(project, 'assets/files', asset.id, asset.activeVariantId); await mkdir(folder, { recursive: true }); await writeFile(join(folder, 'background.png'), png); }
const secondProject = join(root, 'second-project'); await cp(project, secondProject, { recursive: true, filter: path => !path.endsWith('.galcraft') });
const secondEnvelope = JSON.parse(await readFile(join(secondProject, 'project.json'), 'utf8'));
secondEnvelope.data.projectId = createId(); secondEnvelope.data.name = '切换目标作品';
await writeFile(join(secondProject, 'project.json'), JSON.stringify(secondEnvelope, null, 2) + '\n');
globalThis.creationSaveDirectory = project;
globalThis.creationSaveFixture = { project, secondProject, projectId, projectDocumentId, sceneId, sceneDocumentId, indexId, characterId: character.id, assetIds: assets.map(asset => asset.id) };
process.env.GALCRAFT_USER_DATA = join(root, 'profile');
void (async () => {
await app.whenReady();
const startService = () => startStudioService({ userData: join(root, 'profile'), createHost: createNodeStudioHost, frontendDirectory: join(repo, 'apps/studio/dist') });
let assembly = await startService();
globalThis.creationSaveAssembly = assembly;
globalThis.restartSaveService = async () => {
  await assembly.close();
  assembly = await startService(); globalThis.creationSaveAssembly = assembly;
  globalThis.creationSaveDirectory = project;
  return assembly.origin;
};
assembly.host.production.adapter.options.beforeSend = async () => { throw new Error('Object save test sends zero generation requests'); };
ipcMain.handle('studio:localDialog', () => ({ canceled: false, filePaths: [globalThis.creationSaveDirectory] }));
ipcMain.handle('studio:openExternal', () => {});
ipcMain.handle('studio:setAppearance', () => {});
const window = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: {
  preload: join(repo, 'apps/studio/main/service-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
} });
await window.loadURL(`${assembly.origin}/?entry=desktop`);
})().catch(error => { console.error(error.stack ?? error); app.exit(1); });
