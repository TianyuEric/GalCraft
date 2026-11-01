import { afterEach, describe, expect, it } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DefaultStudioPreferences } from '@galcraft/contracts';
import type { Character, Result } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds, FixtureProject, FixtureScenes } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { AuthoringController, type AuthoringServices, type AuthoringSource } from '../controller.js';
import { characterDraft, endingOptions } from './model.js';

const root = resolve(import.meta.dirname, '../../../../../tmp/testing/round6-characters');
const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const characterDocument = crypto.randomUUID();
const envelope = (id: string, data: unknown) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data });
let session: ProjectSession | null = null;
afterEach(async () => { await session?.dispose('discard'); session = null; await rm(root, { recursive: true, force: true }); });
async function fixture() {
  await rm(root, { recursive: true, force: true });
  const script = `say {speaker:{kind:"character",id:"${FixtureIds.an}"},text:"你好"} @${crypto.randomUUID()};\nend {endingId:"spring-whale"} @${crypto.randomUUID()};\n`;
  session = await ProjectSession.createProject(root, FixtureProject.projectId, [
    { documentId: FixtureIds.projectA, revision: 1, format: 'json', files: { 'project.json': envelope(FixtureIds.projectA, FixtureProject) } },
    { documentId: FixtureIds.streetDocument, revision: 1, format: 'dsl', files: {
      [`scenes/${FixtureIds.street}/scene.json`]: envelope(FixtureIds.streetDocument, FixtureScenes[0]), [`scenes/${FixtureIds.street}/script.gal`]: script } },
    { documentId: characterDocument, revision: 1, format: 'json', files: { [`characters/${FixtureIds.an}.json`]: envelope(characterDocument, FixtureCharacters[0]) } },
  ]);
  const source = (): AuthoringSource => {
    const project = session!.readDocument(FixtureIds.projectA)!, scene = session!.readDocument(FixtureIds.streetDocument)!;
    return { projectDocumentId: FixtureIds.projectA, projectRevision: project.revision, projectSavedRevision: project.savedRevision, projectDirty: project.dirty,
      project: JSON.parse(project.files['project.json']!).data, anyDirty: session!.dirtyIds().length > 0,
      characters: [...session!.documents.values()].flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('characters/')).map(([, raw]) => JSON.parse(raw).data as Character)),
      scenes: [{ sceneId: FixtureIds.street, documentId: scene.documentId, chapterId: FixtureScenes[0]!.chapterId, name: FixtureScenes[0]!.name, revision: scene.revision, savedRevision: scene.savedRevision, dirty: scene.dirty,
        text: scene.files[`scenes/${FixtureIds.street}/script.gal`]! }] };
  };
  const documents = { list: async () => ok([...session!.documents.keys()].map(id => session!.readDocument(id)!)),
    planEdit: async (input: Parameters<ProjectSession['planEdit']>[0]) => session!.planEdit(input),
    applyEdit: async (id: string, expected: Parameters<ProjectSession['applyEdit']>[1]) => session!.applyEdit(id, expected),
    planUndo: async (id: string, op?: string, paths?: string[]) => session!.planUndo(id, op, paths), planRedo: async (id: string, paths?: string[]) => session!.planRedo(id, paths), undo: async (id: string) => session!.undo(id), redo: async (id: string) => session!.redo(id),
    planSave: async (scope: Parameters<ProjectSession['planSave']>[0]) => session!.planSave(scope), save: async (id: string) => session!.save(id) };
  const services: AuthoringServices = { bridge: { documents, authoringPreferences: { readWorkspace: async () => ok(null) } } as unknown as AuthoringServices['bridge'],
    read: async () => ok(source()), readPreferences: async () => ok(DefaultStudioPreferences), writePreferences: async () => ok(undefined), queryAssets: async () => ok({ items: [], total: 0, indexRevision: 1 }) };
  const controller = new AuthoringController(services); await controller.open(); return controller;
}

describe('global character management with real document transactions', () => {
  it('keeps older roles unclassified and associates main roles with string ending IDs', async () => {
    const controller = await fixture();
    expect(controller.source!.characters[0]!.narrativeRole).toBe('character');
    expect(endingOptions(controller.source!)).toEqual([{ id: 'spring-whale', scenes: [FixtureScenes[0]!.name] }]);
    const draft = { ...characterDraft(controller.source!.characters[0]!), narrativeRole: 'main' as const,
      personalRoute: { sceneIds: [FixtureIds.street], endingIds: ['spring-whale'] }, description: '独立个人线' };
    expect((await controller.saveCharacters([draft])).ok).toBe(true);
    expect(controller.source!.characters[0]).toMatchObject({ narrativeRole: 'main', personalRoute: draft.personalRoute });
    expect((await controller.save(true)).ok).toBe(true);
    expect(JSON.parse(await readFile(join(root, `characters/${FixtureIds.an}.json`), 'utf8')).data.personalRoute.endingIds).toEqual(['spring-whale']);
    expect((await controller.saveCharacters([{ ...draft, narrativeRole: 'viewpoint' }])).ok).toBe(false);
    expect((await controller.saveCharacters([{ ...draft, narrativeRole: 'viewpoint', personalRoute: undefined }])).ok).toBe(true);
    expect(controller.source!.characters[0]!.personalRoute).toBeUndefined();
    expect((await controller.undo({documentId:controller.lastOperationDocumentId!})).ok).toBe(true);
    expect(controller.source!.characters[0]!.narrativeRole).toBe('main');
    expect((await controller.redo({documentId:controller.lastOperationDocumentId!})).ok).toBe(true);
    expect(controller.source!.characters[0]!.narrativeRole).toBe('viewpoint');
  });
  it('applies several character drafts in one undoable change and permits incomplete main routes', async () => {
    const controller = await fixture();
    const first = crypto.randomUUID(), second = crypto.randomUUID();
    expect((await controller.saveCharacters([
      { id: first, name: '新主角色', description: '', narrativeRole: 'main', personalRoute: { sceneIds: [], endingIds: [] } },
      { id: second, name: '新配角', description: '', narrativeRole: 'supporting' },
    ])).ok).toBe(true);
    expect(controller.source!.characters).toHaveLength(3);
    expect((await controller.undo({documentId:controller.lastOperationDocumentId!})).ok).toBe(true);
    expect(controller.source!.characters).toHaveLength(1);
    expect((await controller.redo({documentId:controller.lastOperationDocumentId!})).ok).toBe(true);
    expect(controller.source!.characters).toHaveLength(3);
    expect((await controller.removeCharacter(second)).ok).toBe(true);
    expect(controller.source!.characters.some(character => character.id === second)).toBe(false);
    expect((await controller.undo({documentId:controller.lastOperationDocumentId!})).ok).toBe(true);
    expect(controller.source!.characters.some(character => character.id === second)).toBe(true);
  });
  it('retains a character that is still used by dialogue', async () => {
    const controller = await fixture();
    const result = await controller.removeCharacter(FixtureIds.an);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('script.gal');
    expect(controller.source!.characters).toHaveLength(1);
    expect(session!.dirtyIds()).toHaveLength(0);
  });
  it('requires viewpoint classification for player names and retains a bound viewpoint role', async () => {
    const controller = await fixture();
    const name = { characterId: FixtureIds.an, defaultName: '春树', allowCustom: false, variableId: null, maxLength: 24, promptPolicy: 'always' as const };
    expect((await controller.setPlayerName(name)).ok).toBe(false);
    const draft = { ...characterDraft(controller.source!.characters[0]!), narrativeRole: 'viewpoint' as const };
    expect((await controller.saveCharacters([draft])).ok).toBe(true);
    expect((await controller.setPlayerName(name)).ok).toBe(true);
    expect((await controller.saveCharacters([{ ...draft, narrativeRole: 'supporting' }])).ok).toBe(false);
    expect(controller.source!.characters[0]!.narrativeRole).toBe('viewpoint');
    expect((await controller.setPlayerName(null)).ok).toBe(true);
    expect((await controller.saveCharacters([{ ...draft, narrativeRole: 'supporting' }])).ok).toBe(true);
  });
});
