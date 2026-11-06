import type { DocumentView, Result } from '@galcraft/contracts';
import { prepareAuthoringEdit, type AuthorOperation } from '@galcraft/documents/authoring';
import { describe, expect, it } from 'vitest';
import { createReviewSeed } from '../../../stories/review/studio-r0/galcraft/fixtures.js';
import type { Scene } from '../../../studio-r0/model.js';
import { createCandidateHost, type CandidateHost } from '../adapters/candidate-host.js';
import { extendCandidateAuthoringEdit } from './authoring-extensions.js';
import { authoringSource, createCandidateSeed, documentData, projectProjection, sceneExtension } from './documents.js';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code} ${result.error.message}`);
  return result.value;
}

function formalEdit(documents: DocumentView[], operation: AuthorOperation) {
  const formal = documents.filter(document => !Object.keys(document.files).some(path => path.startsWith('candidate/')));
  return unwrap(prepareAuthoringEdit(formal, operation));
}

function candidateEdit(documents: DocumentView[], operation: AuthorOperation) {
  return unwrap(extendCandidateAuthoringEdit(documents, operation, formalEdit(documents, operation)));
}

function reviewWithTwoAnchoredScenes() {
  const review = createReviewSeed();
  review.project.scenes[1]!.lines[0]!.events = [{ id: 'shop-pause', kind: 'pause', offset: 2, durationMs: 250, value: '' }];
  return review;
}

function assertCopiedScene(source: Scene, copy: Scene, usedIds: Set<string>) {
  expect(copy.id).not.toBe(source.id);
  expect(copy.background).toBe(source.background);
  expect(copy.cast).toEqual(source.cast);
  expect(copy.lines).toHaveLength(source.lines.length);
  expect(copy.lines.some(line => line.events.length)).toBe(true);
  for (const [index, line] of source.lines.entries()) {
    const copiedLine = copy.lines[index]!;
    expect(copiedLine.id).not.toBe(line.id);
    expect(copiedLine.text).toBe(line.text);
    expect(copiedLine.speakerId).toBe(line.speakerId);
    expect(copiedLine.events.map(({ id: _id, ...fields }) => fields)).toEqual(line.events.map(({ id: _id, ...fields }) => fields));
    for (const event of copiedLine.events) {
      expect(usedIds.has(event.id)).toBe(false);
      usedIds.add(event.id);
    }
  }
}

async function undo(host: CandidateHost, documentId: string) {
  const { documents } = host.bridge;
  const plan = unwrap(await documents.planUndo(documentId));
  expect(plan.reverseOrder).toHaveLength(1);
  unwrap(await documents.undo(plan.planId));
  return plan;
}

describe('candidate authoring extensions', () => {
  it('duplicates scene presentation with new event identities in the same edit', async () => {
    const seed = createCandidateSeed(createReviewSeed()), host = createCandidateHost(seed.documents);
    const before = projectProjection(host.list(), seed), source = before.scenes[0]!;
    const operation = { op: 'scene.duplicate', id: source.id, name: '街道副本' } as const;
    const documents = host.list(), formal = formalEdit(documents, operation), originalInput = structuredClone(formal);
    const edit = unwrap(extendCandidateAuthoringEdit(documents, operation, formal));
    expect(formal).toEqual(originalInput);
    unwrap(host.commit(edit));

    const copy = projectProjection(host.list(), seed).scenes.find(scene => scene.name === operation.name)!;
    const sourceState = authoringSource(host.list());
    const copiedDocument = sourceState.scenes.find(scene => scene.sceneId === copy.id)!;
    expect(edit.requiredRefs).toContainEqual({ kind: 'document', id: copiedDocument.documentId });
    assertCopiedScene(source, copy, new Set(before.scenes.flatMap(scene => scene.lines.flatMap(line => line.events.map(event => event.id)))));
    expect(Object.keys(sceneExtension(host.list(), copy.id).events)).toEqual(copy.lines.map(line => line.id));

    await undo(host, copiedDocument.documentId);
    expect(projectProjection(host.list(), seed).scenes).toEqual(before.scenes);
    expect(sceneExtension(host.list(), copy.id)).toMatchObject({ background: '', cast: {}, events: {} });
  });

  it('duplicates each scene and its events in the source chapter order', async () => {
    const seed = createCandidateSeed(reviewWithTwoAnchoredScenes());
    const projectDocument = seed.documents.find(document => 'project.json' in document.files)!;
    const projectEnvelope = JSON.parse(projectDocument.files['project.json']!);
    projectEnvelope.data.chapters[0].sceneIds.reverse();
    projectDocument.files['project.json'] = projectDocument.savedFiles['project.json'] = JSON.stringify(projectEnvelope);
    const host = createCandidateHost(seed.documents), before = projectProjection(host.list(), seed);
    const chapter = authoringSource(host.list()).project.chapters[0]!;
    const operation = { op: 'chapter.duplicate', id: chapter.id, name: '春灯副本' } as const;
    unwrap(host.commit(candidateEdit(host.list(), operation)));

    const current = authoringSource(host.list());
    const copiedChapter = current.project.chapters.find(item => item.name === operation.name)!;
    const after = projectProjection(host.list(), seed), copies = copiedChapter.sceneIds.map(id => after.scenes.find(scene => scene.id === id)!);
    expect(copies).toHaveLength(2);
    const usedIds = new Set(before.scenes.flatMap(scene => scene.lines.flatMap(line => line.events.map(event => event.id))));
    for (const [index, copy] of copies.entries()) {
      const source = before.scenes.find(scene => scene.id === chapter.sceneIds[index])!;
      expect(copy.name).toBe(source.name);
      assertCopiedScene(source, copy, usedIds);
    }

    await undo(host, current.projectDocumentId);
    expect(projectProjection(host.list(), seed).scenes).toEqual(before.scenes);
    expect(authoringSource(host.list()).project.chapters).toEqual([chapter]);
  });

  it('rejects a duplicate planned against an older sidecar revision', async () => {
    const seed = createCandidateSeed(createReviewSeed()), host = createCandidateHost(seed.documents);
    const sourceId = seed.ui.sceneId, sidecarId = seed.extensionDocuments[sourceId]!;
    const operation = { op: 'scene.duplicate', id: sourceId, name: '过时副本' } as const;
    const { documents } = host.bridge;
    const plan = unwrap(await documents.planEdit(candidateEdit(host.list(), operation)));
    unwrap(host.commit({
      label: '更新背景', origin: 'field', preparedAssets: [], requiredRefs: [],
      expected: [{ ref: { kind: 'document', id: sidecarId }, revision: 1 }],
      patches: [{ kind: 'json', documentId: sidecarId, changes: [{
        path: '/data/background', op: 'set', before: sceneExtension(host.list(), sourceId).background, after: '',
      }] }],
    }));
    expect(await documents.applyEdit(plan.planId, plan.input.expected)).toMatchObject({ ok: false, error: { code: 'EDIT_CONFLICT' } });
    expect(projectProjection(host.list(), seed).scenes.some(scene => scene.name === operation.name)).toBe(false);
  });

  it('removes a scene with its sidecar and restores both on undo', async () => {
    const seed = createCandidateSeed(reviewWithTwoAnchoredScenes()), host = createCandidateHost(seed.documents);
    const source = authoringSource(host.list()).scenes[1]!, sidecarId = seed.extensionDocuments[source.sceneId]!;
    const original = sceneExtension(host.list(), source.sceneId);
    const edit = candidateEdit(host.list(), { op: 'scene.remove', id: source.sceneId });
    unwrap(host.commit(edit));

    expect(host.list().find(document => document.documentId === source.documentId)?.files).toEqual({});
    expect(host.list().find(document => document.documentId === sidecarId)?.files).toEqual({});
    expect((await undo(host, source.documentId)).members).toContain(sidecarId);
    expect(sceneExtension(host.list(), source.sceneId)).toEqual(original);
    expect(authoringSource(host.list()).scenes.some(scene => scene.sceneId === source.sceneId)).toBe(true);
  });

  it.each(['cast', 'event'] as const)('reports a candidate-only %s reference before deleting a character', kind => {
    const review = createReviewSeed(), scene = review.project.scenes[0]!;
    const character = { ...review.project.characters[0]!, id: 'candidate-only', name: '场务' };
    review.project.characters.push(character);
    if (kind === 'cast') scene.cast[character.id] = scene.cast[review.project.characters[0]!.id]!;
    else scene.lines[0]!.events.push({ id: 'sidecar-event', kind: 'expression', characterId: character.id, offset: 0, durationMs: 0, value: 'smile' });
    const seed = createCandidateSeed(review), host = createCandidateHost(seed.documents);
    const operation = { op: 'character.remove', id: seed.presentation.characters.at(-1)!.id } as const;
    const baseline = host.getSnapshot();
    const result = extendCandidateAuthoringEdit(host.list(), operation, formalEdit(host.list(), operation));

    expect(result).toMatchObject({ ok: false, error: { code: 'REFERENCE_IN_USE', message: expect.stringContaining(`candidate/scenes/${seed.ui.sceneId}.json`) } });
    expect(host.getSnapshot()).toBe(baseline);
  });

  it('cleans an unreferenced character appearance and rejects deletion if a sidecar gained a reference', async () => {
    const review = createReviewSeed();
    review.project.characters.push({ ...review.project.characters[0]!, id: 'unused-character', name: '场务' });
    const seed = createCandidateSeed(review), host = createCandidateHost(seed.documents);
    const id = seed.presentation.characters.at(-1)!.id;
    const operation = { op: 'character.remove', id } as const;
    const sceneId = seed.ui.sceneId, sidecarId = seed.extensionDocuments[sceneId]!;
    const cast = sceneExtension(host.list(), sceneId).cast;
    const { documents } = host.bridge;
    const plan = unwrap(await documents.planEdit(candidateEdit(host.list(), operation)));
    unwrap(host.commit({
      label: '登记候选场景角色', origin: 'field', preparedAssets: [], requiredRefs: [],
      expected: [{ ref: { kind: 'document', id: sidecarId }, revision: 1 }],
      patches: [{ kind: 'json', documentId: sidecarId, changes: [{
        path: '/data/cast', op: 'set', before: cast, after: { ...cast, [id]: Object.values(cast)[0]! },
      }] }],
    }));
    expect(await documents.applyEdit(plan.planId, plan.input.expected)).toMatchObject({ ok: false, error: { code: 'EDIT_CONFLICT' } });

    await undo(host, sidecarId);
    unwrap(host.commit(candidateEdit(host.list(), operation)));
    expect(projectProjection(host.list(), seed).characters.some(character => character.id === id)).toBe(false);
    const appearances = documentData<{ appearances: Record<string, unknown> }>(host.list(), 'candidate/appearances.json')!.appearances;
    expect(appearances).not.toHaveProperty(id);
  });

  it('rebinds cast and events, preserves the replacement appearance, and restores all changes on undo', async () => {
    const seed = createCandidateSeed(createReviewSeed()), host = createCandidateHost(seed.documents);
    const before = projectProjection(host.list(), seed);
    const [replacement, removed] = before.characters;
    const appearance = () => documentData<{ appearances: Record<string, unknown> }>(host.list(), 'candidate/appearances.json')!.appearances;
    const originalAppearances = appearance();
    const removedDocument = host.list().find(document => `characters/${removed!.id}.json` in document.files)!;
    const operation = { op: 'character.remove', id: removed!.id, replacementId: replacement!.id } as const;
    unwrap(host.commit(candidateEdit(host.list(), operation)));

    const after = projectProjection(host.list(), seed);
    expect(after.characters).toEqual(before.characters.filter(character => character.id !== removed!.id));
    expect(appearance()).not.toHaveProperty(removed!.id);
    expect(appearance()[replacement!.id]).toEqual(originalAppearances[replacement!.id]);
    expect(after.scenes[0]!.cast[replacement!.id]).toEqual(before.scenes[0]!.cast[replacement!.id]);
    expect(after.scenes[1]!.cast[replacement!.id]).toEqual(before.scenes[1]!.cast[removed!.id]);
    for (const [index, scene] of after.scenes.entries()) {
      expect(scene.cast).not.toHaveProperty(removed!.id);
      expect(scene.lines.map(line => line.events)).toEqual(before.scenes[index]!.lines.map(line =>
        line.events.map(event => event.characterId === removed!.id ? { ...event, characterId: replacement!.id } : event),
      ));
    }

    await undo(host, removedDocument.documentId);
    expect(projectProjection(host.list(), seed)).toEqual(before);
    expect(appearance()).toEqual(originalAppearances);
  });
});
