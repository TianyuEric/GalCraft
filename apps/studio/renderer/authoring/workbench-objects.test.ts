import { describe, expect, it } from 'vitest';
import { FixtureProject, FixtureScenes } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from './controller.js';
import { createWorkbenchChapter, moveWorkbenchObjects, renameWorkbenchObject } from './workbench-objects.js';
import { openAuthorDocument } from './workbench-host.js';

const source = (): AuthoringSource => ({ projectDocumentId: FixtureProject.projectId, projectRevision: 3, projectSavedRevision: 1, projectDirty: true, project: { ...FixtureProject, chapters: [{ ...FixtureProject.chapters[0], sceneIds: FixtureScenes.map(scene => scene.id) }, { id: 'target-chapter', name: '第二章', sceneIds: [] }] }, scenes: FixtureScenes.map((scene, index) => ({ sceneId: scene.id, documentId: `document-${index}`, revision: 4, savedRevision: 1, dirty: false, name: scene.name, chapterId: FixtureProject.chapters[0].id, text: '' })), characters: [] });
describe('workbench objects over M02 transactions', () => {
  it('moves all selected scenes in source order and submits both chapter lists and scene ownership in one edit', () => {
    const input = source(), edit = moveWorkbenchObjects(input, input.scenes.map(scene => scene.sceneId).reverse(), 'target-chapter');
    expect(edit).not.toBeNull(); if (!edit || typeof edit === 'string') throw new Error(String(edit));
    expect(edit.expected).toHaveLength(input.scenes.length + 1); expect(edit.patches).toHaveLength(input.scenes.length + 1);
    const patch = edit.patches[0]; if (patch.kind !== 'json') throw new Error('Expected project patch');
    const chapters = patch.changes[0].after as typeof input.project.chapters;
    expect(chapters[0].sceneIds).toEqual([]); expect(chapters[1].sceneIds).toEqual(input.scenes.map(scene => scene.sceneId));
    expect(edit.patches.slice(1).every(patch => patch.kind === 'json' && patch.changes[0].path === '/data/chapterId' && patch.changes[0].after === 'target-chapter')).toBe(true);
  });
  it('translates Arborist insertion slots before removing selected rows', () => {
    const input = source(), first = input.scenes[0].sceneId, chapter = input.project.chapters[0];
    const edit = moveWorkbenchObjects(input, [first], chapter.id, chapter.sceneIds.length);
    if (!edit || typeof edit === 'string' || edit.patches[0].kind !== 'json') throw new Error(String(edit));
    const after = edit.patches[0].changes[0].after as typeof input.project.chapters;
    expect(after[0].sceneIds).toEqual([...chapter.sceneIds.slice(1), first]);
    expect(edit.expected).toHaveLength(1);
    expect(moveWorkbenchObjects(input, [first], chapter.id, 1)).toBeNull();
    const reorder = moveWorkbenchObjects(input, [chapter.id], null, 2);
    if (!reorder || typeof reorder === 'string' || reorder.patches[0].kind !== 'json') throw new Error(String(reorder));
    expect((reorder.patches[0].changes[0].after as typeof input.project.chapters).map(c => c.id)).toEqual(['target-chapter', chapter.id]);
  });
  it('rejects mixed object moves and sibling name collisions before creating an edit', () => {
    const input = source(); expect(moveWorkbenchObjects(input, [input.project.chapters[0].id, input.scenes[0].sceneId], 'target-chapter')).toBe('请分别移动章节或场景');
    expect(renameWorkbenchObject(input, input.scenes[0].sceneId, input.scenes[1].name)).toBe('同一分组已有此名称');
    expect(createWorkbenchChapter(input, '第二章')).toBe('已有此章节名称');
  });
  it('keeps changed preview documents and preserves a preview marker during source refresh', () => {
    const preview = { id: 'scene:a', kind: 'scene' as const, title: 'A', preview: true };
    const refreshed = openAuthorDocument([preview], { id: preview.id, kind: preview.kind, title: 'A updated' }); expect(refreshed[0].preview).toBe(true);
    const dirty = openAuthorDocument(refreshed, { ...preview, dirty: true }); expect(dirty[0].preview).toBe(false);
    const next = openAuthorDocument(dirty, { ...preview, id: 'scene:b', title: 'B' }); expect(next.map(document => document.id)).toEqual(['scene:a', 'scene:b']);
    expect(openAuthorDocument([preview], { ...preview, id: 'scene:b', title: 'B' }).map(document => document.id)).toEqual(['scene:b']);
  });
});
