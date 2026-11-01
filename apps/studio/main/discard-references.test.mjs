import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureProject, FixtureScenes, fixtureId } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { ProjectDocuments } from './document-providers.mjs';
import { ProjectAccess } from './project-access.mjs';
import { StudioAssets } from './asset-providers.mjs';

const base = resolve('../../tmp/testing/discard-references');
const projectId = fixtureId(0xf01), indexId = fixtureId(0xf02), characterId = fixtureId(0xf03), differenceId = fixtureId(0xf04);
const labelId = fixtureId(0xf05), statementId = fixtureId(0xf06);
const characterPath = `characters/${FixtureIds.an}.json`, scenePath = `scenes/${FixtureIds.street}/scene.json`, scriptPath = `scenes/${FixtureIds.street}/script.gal`;
const bookshopScript = `scenes/${FixtureIds.bookshop}/script.gal`;
const sceneCall = `changeScene {sceneId:"${FixtureIds.street}",labelId:"${labelId}"} @${fixtureId(0xf0b)};\n`;
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n';
const value = result => { expect(result.ok, result.error?.message).toBe(true); return result.value; };
const active = [];
let sequence = 0;
async function fixture() {
  const root = join(base, String(++sequence)); await mkdir(base, { recursive: true }); await rm(root, { recursive: true, force: true });
  const character = { ...structuredClone(FixtureCharacters[0]), differences: [{ id: differenceId, name: '固定差分', figure: { assetId: FixtureAsset.id, variantId: FixtureAsset.activeVariantId }, avatar: null }], initialDifferenceId: differenceId,
    afterstory: { id: fixtureId(0xf07), title: '后日谈', entry: { sceneId: FixtureIds.street, labelId }, unlockEndingIds: ['ending'], initialProgress: {}, lockedView: 'locked' } };
  const session = await ProjectSession.createProject(root, FixtureProject.projectId, [
    { documentId: projectId, revision: 1, format: 'json', files: { 'project.json': envelope(projectId, { ...FixtureProject, display: { ...FixtureProject.display, splash: FixtureAsset.id } }) } },
    { documentId: indexId, revision: 1, format: 'json', files: { 'assets/index.json': envelope(indexId, { assets: [FixtureAsset] }) } },
    { documentId: characterId, revision: 1, format: 'json', files: { [characterPath]: envelope(characterId, character) } },
    { documentId: FixtureIds.streetDocument, revision: 1, format: 'dsl', files: { [scenePath]: envelope(FixtureIds.streetDocument, FixtureScenes[0]),
      [scriptPath]: `label {labelId:"${labelId}",name:"入口"} @${statementId};\n` } },
    { documentId: FixtureIds.bookshopDocument, revision: 1, format: 'dsl', files: { [`scenes/${FixtureIds.bookshop}/scene.json`]: envelope(FixtureIds.bookshopDocument, FixtureScenes[1]), [bookshopScript]: sceneCall } },
  ]);
  await session.dispose('saved');
  const documents = new ProjectDocuments(new ProjectAccess()); value(await documents.open(root)); active.push({ documents, root });
  return { documents, root, character: data(documents, characterId, characterPath) };
}
function edit(documents, patches) {
  const ids = [...new Set(patches.map(patch => patch.documentId))], session = documents.currentSession;
  const expected = ids.map(id => ({ ref: { kind: 'document', id }, revision: session.readDocument(id).revision }));
  const plan = value(documents.planEdit({ label: '引用放弃回归', origin: 'field', expected, patches, preparedAssets: [], requiredRefs: [] }));
  return value(documents.applyEdit(plan.planId, expected));
}
const change = (documentId, path, before, after) => ({ kind: 'json', documentId, changes: [{ path, before, after, op: 'set' }] });
const data = (documents, documentId, path) => JSON.parse(documents.currentSession.readDocument(documentId).files[path]).data;
afterEach(async () => { for (const { documents, root } of active.splice(0)) { await documents.close(documents.currentSessionId, 'discard'); await rm(root, { recursive: true, force: true }); } });

describe('object discard owned references', () => {
  it('restores a removed splash asset in its reviewed index field and undoes both without saving', async () => {
    const { documents, root, character } = await fixture();
    edit(documents, [change(projectId, '/data/display/splash', FixtureAsset.id, null), change(characterId, '/data/differences', character.differences, []), change(characterId, '/data/initialDifferenceId', differenceId, null)]);
    const assets = new StudioAssets(documents);
    value(await assets.remove([FixtureAsset.id]));
    edit(documents, [change(projectId, '/data/player/autosave', true, false)]);
    const disk = await readFile(join(root, 'assets/index.json'), 'utf8');
    const plan = value(documents.planDiscard({ documentId: projectId, paths: ['/data/display'] }));
    expect(plan.expanded).toContainEqual({ documentId: indexId, paths: ['/data/assets'] });
    const receipt = value(documents.applyDiscard(plan.planId));
    expect(data(documents, projectId, 'project.json').display.splash).toBe(FixtureAsset.id);
    expect(data(documents, projectId, 'project.json').player.autosave).toBe(false);
    expect(data(documents, indexId, 'assets/index.json').assets[0].id).toBe(FixtureAsset.id);
    expect(data(documents, characterId, characterPath).differences).toEqual(character.differences);
    expect(await readFile(join(root, 'assets/index.json'), 'utf8')).toBe(disk);
    value(documents.undo(value(documents.planUndo(projectId, receipt.operationId)).planId));
    expect(data(documents, projectId, 'project.json').display.splash).toBeNull();
    expect(data(documents, indexId, 'assets/index.json').assets).toEqual([]);
  });
  it('restores a fixed core variant instead of accepting another available variant', async () => {
    const { documents, character } = await fixture();
    edit(documents, [change(characterId, '/data/differences', character.differences, []), change(characterId, '/data/initialDifferenceId', differenceId, null)]);
    const replacement = { ...structuredClone(FixtureAsset), variants: [{ ...structuredClone(FixtureAsset.variants[0]), id: fixtureId(0xf08) }], activeVariantId: fixtureId(0xf08), originalVariantId: fixtureId(0xf08) };
    edit(documents, [change(indexId, '/data/assets', [FixtureAsset], [replacement])]);
    const plan = value(documents.planDiscard({ documentId: characterId, paths: ['/data/differences', '/data/initialDifferenceId'] }));
    expect(plan.expanded).toContainEqual({ documentId: indexId, paths: ['/data/assets'] });
    value(documents.applyDiscard(plan.planId));
    expect(data(documents, characterId, characterPath).differences[0].figure.variantId).toBe(FixtureAsset.activeVariantId);
    expect(data(documents, indexId, 'assets/index.json').assets[0].variants[0].id).toBe(FixtureAsset.activeVariantId);
  });
  it('expands a discarded new asset to a retained consumer that did not declare historical requiredRefs', async () => {
    const { documents, character } = await fixture();
    const asset = { ...structuredClone(FixtureAsset), id: fixtureId(0xf09), variants: [{ ...structuredClone(FixtureAsset.variants[0]), id: fixtureId(0xf0a) }], activeVariantId: fixtureId(0xf0a), originalVariantId: fixtureId(0xf0a) };
    edit(documents, [change(indexId, '/data/assets', [FixtureAsset], [FixtureAsset, asset])]);
    const differences = [{ ...character.differences[0], figure: { assetId: asset.id, variantId: asset.activeVariantId } }];
    edit(documents, [change(characterId, '/data/differences', character.differences, differences)]);
    const plan = value(documents.planDiscard({ documentId: indexId }));
    expect(plan.expanded).toContainEqual({ documentId: characterId, paths: ['/data/differences'] });
    value(documents.applyDiscard(plan.planId));
    expect(data(documents, indexId, 'assets/index.json').assets).toEqual([FixtureAsset]);
    expect(data(documents, characterId, characterPath).differences).toEqual(character.differences);
  });
  it('expands an afterstory restored label to the actual scene source while retaining unrelated project edits', async () => {
    const { documents, character } = await fixture();
    edit(documents, [change(characterId, '/data/afterstory', character.afterstory, null)]);
    const script = documents.currentSession.readDocument(FixtureIds.streetDocument).files[scriptPath];
    edit(documents, [{ kind: 'text', documentId: FixtureIds.streetDocument, edits: [{ start: 0, end: script.length, before: script, after: '' }] }]);
    edit(documents, [change(projectId, '/data/player/autosave', true, false)]);
    const plan = value(documents.planDiscard({ documentId: characterId, paths: ['/data/afterstory'] }));
    expect(plan.expanded).toContainEqual({ documentId: FixtureIds.streetDocument, paths: ['#source'] });
    value(documents.applyDiscard(plan.planId));
    expect(documents.currentSession.readDocument(FixtureIds.streetDocument).files[scriptPath]).toBe(script);
    expect(data(documents, projectId, 'project.json').player.autosave).toBe(false);
  });
  it('restores a scene deleted after its chapter and afterstory references were removed', async () => {
    const { documents, character } = await fixture();
    const project = data(documents, projectId, 'project.json');
    edit(documents, [change(projectId, '/data/chapters', project.chapters, []), change(projectId, '/data/entry/sceneId', FixtureIds.street, FixtureIds.bookshop), change(characterId, '/data/afterstory', character.afterstory, null)]);
    const scene = documents.currentSession.readDocument(FixtureIds.streetDocument);
    edit(documents, [{ kind: 'document', documentId: scene.documentId, op: 'delete', before: { format: scene.format, files: scene.files }, after: null }]);
    const plan = value(documents.planDiscard({ documentId: projectId, paths: ['/data/chapters'] }));
    expect(plan.expanded).toContainEqual({ documentId: FixtureIds.streetDocument, paths: ['*'] });
    value(documents.applyDiscard(plan.planId));
    expect(documents.currentSession.readDocument(FixtureIds.streetDocument).files[scenePath]).toBeTruthy();
  });
  it('uses M03 command fields to restore the deleted target of a saved scene call', async () => {
    const { documents, character } = await fixture();
    edit(documents, [{ kind: 'text', documentId: FixtureIds.bookshopDocument, edits: [{ start: 0, end: sceneCall.length, before: sceneCall, after: '' }] }]);
    const project = data(documents, projectId, 'project.json');
    edit(documents, [change(projectId, '/data/chapters', project.chapters, [{ ...project.chapters[0], sceneIds: [FixtureIds.bookshop] }]), change(projectId, '/data/entry/sceneId', FixtureIds.street, FixtureIds.bookshop), change(characterId, '/data/afterstory', character.afterstory, null)]);
    const scene = documents.currentSession.readDocument(FixtureIds.streetDocument);
    edit(documents, [{ kind: 'document', documentId: scene.documentId, op: 'delete', before: { format: scene.format, files: scene.files }, after: null }]);
    const plan = value(documents.planDiscard({ documentId: FixtureIds.bookshopDocument }));
    expect(plan.expanded).toContainEqual({ documentId: FixtureIds.streetDocument, paths: ['*'] });
    expect(plan.members).not.toContain(projectId);
    value(documents.applyDiscard(plan.planId));
    expect(documents.currentSession.readDocument(FixtureIds.bookshopDocument).files[bookshopScript]).toBe(sceneCall);
    expect(documents.currentSession.readDocument(FixtureIds.streetDocument).files[scriptPath]).toContain(labelId);
  });
});
