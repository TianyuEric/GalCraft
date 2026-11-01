import { afterAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { StudioProjectLibrary } from './project-library.mjs';
import { ProjectDocuments } from './document-providers.mjs';
import { ProjectAccess } from './project-access.mjs';

const root = resolve('../../tmp/testing/round6-project-library');
const documentId = randomUUID();
async function project(name, id = randomUUID()) {
  const directory = join(root, name);
  await ProjectSession.createProject(directory, id, [{ documentId, revision: 1, format: 'json', files: {
    'project.json': JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data: { ...FixtureProject, projectId: id, name } }),
  } }]);
  return { projectId: id, directory };
}
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe('personal project library on disk', () => {
  it('reads the existing backup registry, records metadata, and keeps files when forgetting', async () => {
    const registered = await project('registered'), userData = join(root, 'profile');
    await mkdir(userData, { recursive: true });
    await writeFile(join(userData, 'recent-projects.json'), JSON.stringify([registered]));
    const library = new StudioProjectLibrary({ userData });
    expect((await library.listRecent()).value[0]).toMatchObject({ ...registered, name: 'registered', status: 'available', lastOpenedAt: null });
    await library.setPinned({ directory: registered.directory, pinned: true });
    await library.register(registered);
    const entries = (await new StudioProjectLibrary({ userData }).listRecent()).value;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pinned: true, engineVersion: FixtureProject.engineVersion });
    expect(entries[0].lastOpenedAt).toBeTypeOf('string');
    await library.forget(registered.directory);
    expect((await library.listRecent()).value).toEqual([]);
    expect(JSON.parse(await readFile(join(registered.directory, 'project.json'), 'utf8')).data.projectId).toBe(registered.projectId);
  });

  it('relocates the same project and retains pin and opening time', async () => {
    const original = await project('before-move'), unrelated = await project('unrelated');
    const library = new StudioProjectLibrary({ userData: join(root, 'move-profile') });
    await library.register(original);
    await library.setPinned({ directory: original.directory, pinned: true });
    const before = (await library.listRecent()).value[0];
    const replacement = join(root, 'after-move');
    await rename(original.directory, replacement);
    expect((await library.listRecent()).value[0].status).toBe('missing');
    expect((await library.relocate({ directory: original.directory, replacement: unrelated.directory })).error.code).toBe('PROJECT_ID_MISMATCH');
    expect((await library.relocate({ directory: original.directory, replacement })).ok).toBe(true);
    expect((await library.listRecent()).value[0]).toMatchObject({ directory: replacement, projectId: original.projectId, pinned: true, lastOpenedAt: before.lastOpenedAt, status: 'available' });
  });
});

describe('safe project switching', () => {
  it('keeps current working documents on failed open, then saves and switches successfully', async () => {
    const first = await project('switch-first'), second = await project('switch-second');
    const access = new ProjectAccess(), documents = new ProjectDocuments(access);
    const opened = await documents.open(first.directory);
    const session = documents.currentSession;
    const expected = [{ ref: { kind: 'document', id: documentId }, revision: 1 }];
    const plan = documents.planEdit({ label: 'Rename', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [{ kind: 'json', documentId,
      changes: [{ path: '/data/name', before: 'switch-first', after: 'Saved before switching', op: 'set' }] }] });
    expect(plan.ok).toBe(true);
    expect((await documents.applyEdit(plan.value.planId, expected)).ok).toBe(true);
    const broken = join(root, 'broken'); await mkdir(broken); await writeFile(join(broken, 'project.json'), '{broken');
    await expect(documents.switch({ directory: broken, choice: 'discard' })).rejects.toThrow();
    expect(documents.currentSession).toBe(session);
    expect(documents.currentSession.dirtyIds()).toContain(documentId);
    expect(access.getRoot(opened.value.sessionId)).toBe(first.directory);
    const invalidCharacter = join(second.directory, 'characters', 'invalid.json');
    await mkdir(join(second.directory, 'characters'));
    await writeFile(invalidCharacter, JSON.stringify({ schemaVersion: 1, documentId: randomUUID(), revision: 1, data: { name: 'Incomplete character' } }));
    await expect(documents.switch({ directory: second.directory, choice: 'discard' })).rejects.toThrow();
    expect(documents.currentSession).toBe(session);
    await rm(invalidCharacter);
    const switched = await documents.switch({ directory: second.directory, choice: 'save' });
    expect(switched.ok).toBe(true);
    expect(documents.currentRoot).toBe(second.directory);
    expect(access.getRoot(opened.value.sessionId)).toBeNull();
    expect(JSON.parse(await readFile(join(first.directory, 'project.json'), 'utf8')).data.name).toBe('Saved before switching');
    await documents.close(switched.value.sessionId, 'discard');
  });

  it('keeps the original project when creation or sample preparation fails', async () => {
    const first = await project('creation-first');
    const documents = new ProjectDocuments(new ProjectAccess(), undefined, { resolveEngine: async () => ({ ok: true, value: { version: '0.1.0', manifest: { targets: ['web','windows'] } }, warnings: [] }) });
    await documents.open(first.directory);
    const session = documents.currentSession;
    const input = { path: root, name: 'candidate', template: 'standard', width: 1280, height: 720, engineVersion: '0.1.0', closeChoice: 'discard' };
    await expect(documents.create(input, async candidate => {
      expect(candidate.currentRoot).toBe(join(root, 'candidate'));
      expect(documents.currentSession).toBe(session);
      throw new Error('Sample resources unavailable');
    })).rejects.toThrow('Sample resources unavailable');
    expect(documents.currentSession).toBe(session);
    await expect(documents.create({ ...input, name: 'creation-first' })).rejects.toThrow();
    expect(documents.currentSession).toBe(session);
    await documents.close(documents.currentSessionId, 'discard');
  });
});
