import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createId } from '@galcraft/contracts';
import { FixtureAsset, FixtureCharacters, FixtureLock, FixtureProject, FixtureScenes } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { Resvg } from '@resvg/resvg-js';

/** Rebuild the no-service host dataset from maintained schemas and authored SVG data. */
export async function ensureProjectFixture(directory) {
  const projectRoot = join(directory, '自制测试作品');
  try { await access(join(projectRoot, 'project.json')); return projectRoot; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(directory, { recursive: true });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><rect width="800" height="480" fill="#243b63"/><circle cx="400" cy="200" r="90" fill="#e6c87a"/></svg>';
  const png = new Resvg(svg).render().asPng();
  await writeFile(join(directory, 'fixture-lantern.svg'), svg);
  const template = createOfficialTemplate({ kind: 'standard' }), project = structuredClone(FixtureProject), lock = structuredClone(FixtureLock);
  const scenes = structuredClone(FixtureScenes.slice(0, 2)), characters = structuredClone(FixtureCharacters), asset = structuredClone(FixtureAsset);
  project.name = '可重建测试作品'; project.templateDocumentId = template.instanceId;
  project.entry = { sceneId: scenes[0].id, labelId: null };
  project.chapters = [{ id: scenes[0].chapterId, name: '可重建场景', sceneIds: scenes.map(scene => scene.id) }];
  project.player.name = null; project.platform.steamAppId = null;
  project.display = { icon: null, splash: null, titleBackground: null, titleMusic: null, titleVideo: null };
  lock.plugins = template.dependencies.filter(item => item.kind === 'plugin');
  lock.template = template.dependencies.find(item => item.kind === 'template');
  asset.name = '自制灯笼.png'; asset.sourceName = 'fixture-lantern.svg'; asset.sceneIds = scenes.map(scene => scene.id);
  const variant = asset.variants.find(variant => variant.id === asset.activeVariantId);
  asset.variants = [variant]; asset.originalVariantId = variant.id;
  variant.entry = 'lantern.png'; variant.files = [{ path: 'lantern.png', mime: 'image/png', bytes: png.length, role: 'entry' }];
  variant.metadata = { width: 800, height: 480 }; variant.canvas = { width: 800, height: 480, offsetX: 0, offsetY: 0 };
  variant.groupCapabilities = null; variant.typeData = undefined; variant.processing = null;
  const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n';
  const document = (path, data) => { const id = createId(); return { documentId: id, revision: 1, format: 'json', files: { [path]: envelope(id, data) } }; };
  const inputs = [document('project.json', project), document('dependencies.lock.json', lock), document('assets/index.json', { assets: [asset] }),
    ...characters.map(character => document(`characters/${character.id}.json`, character)), ...createTemplateDocuments(template)];
  for (const [index, scene] of scenes.entries()) {
    scene.chapterId = scenes[0].chapterId; scene.parameters = []; scene.locals = []; scene.returns = 'void';
    const id = createId();
    const command = (opcode, args) => `${opcode} ${JSON.stringify(args)} @${createId()};`;
    const lines = [command('changeBg', { assetId: asset.id }),
      command('say', { speaker: { kind: 'character', id: characters[index % characters.length].id }, text: `可重建场景 ${index + 1}。` }),
      command('say', { speaker: { kind: 'narrator' }, text: '本夹具没有生成请求或个人服务凭据。' }), command('end', { target: { kind: 'title' } })];
    inputs.push({ documentId: id, revision: 1, format: 'dsl', files: { [`scenes/${scene.id}/scene.json`]: envelope(id, scene), [`scenes/${scene.id}/script.gal`]: lines.join('\n') + '\n' } });
  }
  const session = await ProjectSession.createProject(projectRoot, project.projectId, inputs);
  await session.dispose('saved');
  const media = join(projectRoot, 'assets/files', asset.id, variant.id, variant.entry);
  await mkdir(dirname(media), { recursive: true }); await writeFile(media, png);
  return projectRoot;
}
