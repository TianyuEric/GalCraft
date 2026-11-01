import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createId } from '@galcraft/contracts';
import { ProjectSession } from '@galcraft/documents';
import { Resvg } from '@resvg/resvg-js';
import { ensureProjectFixture } from './project-fixture.mjs';

export const Adoption = { figure: 'AdpFA1', chibi: 'AdpFA2', illustration: 'AdpIA1', other: 'AdpIA2',
  backgroundStatement: 'AdpB01', figureStatement: 'AdpF01', chibiStatement: 'AdpF02',
  illustrationStatement: 'AdpI01', otherStatement: 'AdpI02', differenceStatement: 'AdpD01', sayStatement: 'AdpS01' };

/** Authored geometry and tone only; no downloaded assets, personal cache or generation service. */
export async function writeAdoptionMedia(directory) {
  await mkdir(directory, { recursive: true });
  const images = [
    ['wide', 960, 300, '<rect width="960" height="300" fill="#203756"/><circle cx="480" cy="150" r="110" fill="#efd17d"/>'],
    ['tall', 300, 800, '<rect width="300" height="800" fill="#356666"/><path d="M30 730L150 80L270 730Z" fill="#8fceb6"/>'],
    ['padded', 1000, 600, '<rect x="250" y="150" width="500" height="300" fill="#815697"/><circle cx="500" cy="300" r="80" fill="#eec6ed"/>'],
  ];
  const paths = {};
  for (const [name, width, height, content] of images) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`;
    await writeFile(join(directory, `${name}.svg`), svg);
    paths[name] = join(directory, `${name}.png`);
    await writeFile(paths[name], new Resvg(svg).render().asPng());
  }
  const rate = 16000, samples = rate, wave = Buffer.alloc(44 + samples * 2);
  wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(rate, 24); wave.writeUInt32LE(rate * 2, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
  wave.write('data', 36); wave.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) wave.writeInt16LE(Math.round(Math.sin(index / rate * Math.PI * 440) * 1000), 44 + index * 2);
  paths.music = join(directory, 'authored-tone.wav'); await writeFile(paths.music, wave);
  return paths;
}

export async function ensureAdoptionFixture(directory) {
  const project = await ensureProjectFixture(join(directory, 'projects'));
  const marker = join(directory, 'adoption-fixture.json');
  try { return JSON.parse(await readFile(marker, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const raw = JSON.parse(await readFile(join(project, 'project.json'), 'utf8'));
  const session = await ProjectSession.open(project, raw.data.projectId);
  const docs = [...session.documents.values()], first = docs.find(document => document.format === 'dsl');
  const scriptPath = Object.keys(first.files).find(path => path.endsWith('/script.gal'));
  const scene = JSON.parse(first.files[scriptPath.replace('script.gal', 'scene.json')]).data;
  const character = JSON.parse(Object.values(docs.find(document => Object.keys(document.files).some(path => path.startsWith('characters/'))).files)[0]).data;
  const asset = JSON.parse(docs.find(document => document.files['assets/index.json']).files['assets/index.json']).data.assets[0];
  const command = (opcode, args, id = createId()) => `${opcode} ${JSON.stringify(args)} @${id};`;
  const script = [
    command('changeBg', { assetId: asset.id, fit: 'contain', positionX: .31, positionY: .76 }, Adoption.backgroundStatement),
    command('changeFigure', { objectId: Adoption.figure, characterId: character.id, assetId: asset.id, effects: { x: -330, y: 25, z: 3, scaleX: .8, scaleY: .8 } }, Adoption.figureStatement),
    command('changeFigure', { objectId: Adoption.chibi, characterId: character.id, assetId: asset.id, effects: { x: 390, y: 180, z: 5, scaleX: .4, scaleY: .4 } }, Adoption.chibiStatement),
    command('changeIllustration', { objectId: Adoption.illustration, assetId: asset.id,
      states: [{ name: 'calm', assetId: asset.id }, { name: 'bright', assetId: asset.id }],
      effects: { x: 130, y: -40, z: 7, rotationDeg: 12, blend: 'screen' }, illustrationFrame: { widthRatio: .7, heightRatio: .4, fit: 'contain' },
      transition: { enter: { type: 'fade', durationMs: 80 } } }, Adoption.illustrationStatement),
    command('changeIllustration', { objectId: Adoption.other, assetId: asset.id, effects: { x: -300, z: 6 } }, Adoption.otherStatement),
    command('changeIllustrationDiff', { objectId: Adoption.illustration, stateName: 'bright' }, Adoption.differenceStatement),
    command('say', { speaker: { kind: 'narrator' }, text: 'Adoption：独立插图、精确对象替换与真实采用验收。' }, Adoption.sayStatement),
    command('end', { target: { kind: 'title' } }),
  ].join('\n') + '\n';
  const expected = [{ ref: { kind: 'document', id: first.documentId }, revision: first.revision }];
  const plan = session.planEdit({ label: 'Adoption 自制可重建场景', origin: 'batch', expected, requiredRefs: [], preparedAssets: [],
    patches: [{ kind: 'text', documentId: first.documentId, edits: [{ start: 0, end: first.files[scriptPath].length, before: first.files[scriptPath], after: script }] }] });
  if (!plan.ok) throw new Error(plan.error.message);
  const applied = session.applyEdit(plan.value.planId, expected); if (!applied.ok) throw new Error(applied.error.message);
  const save = await session.save(session.planSave({ kind: 'all' }).value.planId); if (!save.ok) throw new Error(save.error.message);
  await session.dispose('saved');
  const media = await writeAdoptionMedia(join(directory, 'authored-media'));
  const fixture = { project, projectId: raw.data.projectId, sceneId: scene.id, sceneDocumentId: first.documentId,
    scriptPath, characterId: character.id, seedAssetId: asset.id, seedVariantId: asset.activeVariantId,
    seedPath: join(project, 'assets/files', asset.id, asset.activeVariantId, asset.variants[0].entry), media,
    profile: join(directory, 'profile'), source: 'Authored SVG geometry, rasterized PNG and synthesized mono PCM tone; local acceptance provider only.' };
  await mkdir(dirname(marker), { recursive: true }); await writeFile(marker, JSON.stringify(fixture, null, 2));
  return fixture;
}
