import { describe, expect, it } from 'vitest';
import type { DiscardScope, DocumentView, EditInput, Id, Json, Patch, Result } from '@galcraft/contracts';
import { FixtureProject, FixtureScenes, fixtureId } from '@galcraft/contracts/fixtures';
import { prepareAuthoringEdit } from '@galcraft/documents/authoring';
import { parse } from '@galcraft/dsl';
import { createCandidateHost, type CandidateHost } from './candidate-host.js';

const sceneId = 'SceneA', otherId = 'SceneB', eventId = 'EventA';
const scriptPath = 'scenes/Street/script.gal', otherPath = 'scenes/Garden/script.gal', eventPath = 'review/events/Street.json';
const initial = 'say {"speaker":{"kind":"narrator"},"text":"初稿"} @Line01;';
const other = 'say {"speaker":{"kind":"narrator"},"text":"另一稿"} @Line02;';
const envelope = (id: Id, data: Json) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data });
const unwrap = <T>(result: Result<T>) => {
  if (!result.ok) throw new Error(result.error.code + ': ' + result.error.message);
  return result.value;
};
const document = (documentId: Id, path: string, raw: string): DocumentView => ({
  documentId, format: path.endsWith('.gal') ? 'dsl' : 'json', revision: 1, savedRevision: 1, dirty: false,
  files: { [path]: raw }, savedFiles: { [path]: raw },
});
const seed = () => [document(sceneId, scriptPath, initial), document(otherId, otherPath, other), document(eventId, eventPath, envelope(eventId, { offset: 1 }))];
const working = (host: CandidateHost, id: Id) => host.list().find(item => item.documentId === id)!;
const text = (documentId: Id, before: string, after: string): Patch => ({
  kind: 'text', documentId, edits: [{ start: 0, end: before.length, before, after }],
});
const offset = (before: number, after: number): Patch => ({
  kind: 'json', documentId: eventId, changes: [{ path: '/data/offset', before, after, op: 'set' }],
});
const input = (host: CandidateHost, label: string, patches: Patch[]): EditInput => ({
  label, origin: 'field', patches, expected: [...new Set(patches.map(patch => patch.documentId))].flatMap(id => {
    const doc = working(host, id);
    return doc ? [{ ref: { kind: 'document', id }, revision: doc.revision }] : [];
  }), preparedAssets: [], requiredRefs: [],
});
const discardScope = (host: CandidateHost, documentId: Id, ids: Id[] = [documentId]): DiscardScope => ({
  documentId, objects: ids.map(id => ({ kind: 'document', documentId: id, objectId: null })),
  expected: host.list().map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
});

describe('browser candidate documents', () => {
  it('validates the entire patch and expected vector before publishing any document', async () => {
    const host = createCandidateHost(seed());
    const { documents } = host.bridge;
    const baseline = host.getSnapshot();
    const failed = host.commit(input(host, '跨文档错误', [text(sceneId, initial, '// 新稿'), offset(7, 2)]));
    expect(failed).toMatchObject({ ok: false, error: { code: 'PATCH_CONFLICT' } });
    expect(host.getSnapshot()).toBe(baseline);
    expect(Object.isFrozen(baseline.documents[0]!.files)).toBe(true);
    const original = input(host, '写作', [text(sceneId, initial, '// 新稿')]);
    const plan = unwrap(await documents.planEdit(original));
    unwrap(host.commit(input(host, '更早应用', [text(sceneId, initial, '// 当前稿')])));
    expect(await documents.applyEdit(plan.planId, original.expected)).toMatchObject({ ok: false, error: { code: 'EDIT_CONFLICT' } });
    expect(working(host, sceneId).files[scriptPath]).toBe('// 当前稿');
  });

  it('undoes a related document group atomically while preserving another scene', async () => {
    const host = createCandidateHost(seed());
    const { documents } = host.bridge;
    unwrap(host.commit(input(host, '拆句并移动锚点', [text(sceneId, initial, '// 新稿'), offset(1, 2)])));
    unwrap(host.commit(input(host, '另一稿的新内容', [text(otherId, other, '// 并排稿')])));
    unwrap(host.commit(input(host, '移动锚点', [offset(2, 3)])));
    const plan = unwrap(await documents.planUndo(sceneId));
    expect(plan.reverseOrder).toHaveLength(2);
    expect(plan.members).toEqual([sceneId, eventId]);
    unwrap(await documents.undo(plan.planId));
    expect(working(host, sceneId)).toMatchObject({ revision: 3, dirty: false, files: { [scriptPath]: initial } });
    expect(JSON.parse(working(host, eventId).files[eventPath]!).data.offset).toBe(1);
    expect(working(host, otherId).files[otherPath]).toBe('// 并排稿');
    const redo = unwrap(await documents.planRedo(sceneId));
    unwrap(await documents.redo(redo.planId));
    expect(JSON.parse(working(host, eventId).files[eventPath]!).data.offset).toBe(3);
    expect(working(host, sceneId)).toMatchObject({ revision: 4, files: { [scriptPath]: '// 新稿' } });
    expect(await documents.planRedo(sceneId)).toMatchObject({ ok: false, error: { code: 'NOTHING_TO_REDO' } });
  });

  it('routes sidecar edits to the logical scene scope and coalesces an input group', async () => {
    const host = createCandidateHost(seed(), { historyScope: id => id === sceneId ? [eventId] : [] });
    const { documents } = host.bridge;
    const first = unwrap(host.commit(input(host, '写作', [text(sceneId, initial, '// 草')]), 'scene-writing'));
    const second = unwrap(host.commit(input(host, '写作', [text(sceneId, '// 草', '// 草稿')]), 'scene-writing'));
    expect(first.operationId).toBe(second.operationId);
    host.endEditGroup();
    unwrap(host.commit(input(host, '插入句内事件', [offset(1, 2)])));
    expect(host.history(sceneId).undoLabel).toBe('插入句内事件');
    unwrap(await documents.undo(unwrap(await documents.planUndo(sceneId)).planId));
    expect(working(host, sceneId).files[scriptPath]).toBe('// 草稿');
    expect(host.history(sceneId).undoLabel).toBe('写作');
    unwrap(await documents.undo(unwrap(await documents.planUndo(sceneId)).planId));
    expect(working(host, sceneId).files[scriptPath]).toBe(initial);
  });

  it('saves a captured revision, keeps later edits dirty, and retries a failure', async () => {
    let finish: (() => void) | undefined;
    let captured: readonly { revision: number; files: Readonly<Record<string, string>> }[] = [];
    const host = createCandidateHost(seed(), { saveDelayMs: 0, persist: documents => {
      captured = documents;
      return new Promise(resolve => { finish = resolve; });
    } });
    const { documents } = host.bridge;
    unwrap(host.commit(input(host, '作品内容', [text(sceneId, initial, '// 待保存'), offset(1, 2)])));
    const firstPlan = unwrap(await documents.planSave({ kind: 'current', documentId: sceneId }));
    expect(firstPlan.extraDirtyMembers).toEqual([eventId]);
    const pending = documents.save(firstPlan.planId);
    expect(host.getSnapshot().saving).toBe(true);
    expect(captured[0]).toMatchObject({ revision: 2, files: { [scriptPath]: '// 待保存' } });
    unwrap(host.commit(input(host, '继续输入', [text(sceneId, '// 待保存', '// 较新')]), 'scene-writing'));
    finish!();
    const receipt = unwrap(await pending);
    expect(receipt.remainingDirty).toEqual([sceneId]);
    expect(working(host, sceneId)).toMatchObject({ savedRevision: 2, revision: 3, savedFiles: { [scriptPath]: '// 待保存' } });
    host.failNextSave('演示保存失败');
    const failurePlan = unwrap(await documents.planSave({ kind: 'all' }));
    expect(await documents.save(failurePlan.planId)).toMatchObject({ ok: false, error: { code: 'SAVE_FAILED' } });
    expect(host.getSnapshot()).toMatchObject({ saving: false, saveError: '演示保存失败' });
    expect(working(host, sceneId).files[scriptPath]).toBe('// 较新');
    const retryPlan = unwrap(await documents.planSave({ kind: 'all' }));
    const retry = documents.save(retryPlan.planId);
    finish!();
    expect(unwrap(await retry).remainingDirty).toEqual([]);
    expect(host.getSnapshot().saveError).toBeNull();
  });

  it('invalidates a save or history plan when edits change its captured revision', async () => {
    const host = createCandidateHost(seed());
    const { documents } = host.bridge;
    unwrap(host.commit(input(host, '初次编辑', [text(sceneId, initial, '// 草稿')])));
    const save = unwrap(await documents.planSave({ kind: 'all' }));
    const undo = unwrap(await documents.planUndo(sceneId));
    unwrap(host.commit(input(host, '新编辑', [text(sceneId, '// 草稿', '// 更新')])));
    expect(await documents.save(save.planId)).toMatchObject({ ok: false, error: { code: 'SAVE_PLAN_STALE' } });
    expect(await documents.undo(undo.planId)).toMatchObject({ ok: false, error: { code: 'EDIT_CONFLICT' } });
    expect(working(host, sceneId).files[scriptPath]).toBe('// 更新');
  });

  it('previews and discards an associated edit as one undoable operation', async () => {
    const host = createCandidateHost(seed());
    const { documents } = host.bridge;
    unwrap(host.commit(input(host, '场景和锚点', [text(sceneId, initial, '// 待丢弃'), offset(1, 2)])));
    unwrap(host.commit(input(host, '无关编辑', [text(otherId, other, '// 保留这稿')])));
    const before = host.getSnapshot();
    const plan = unwrap(await documents.planDiscard(discardScope(host, sceneId)));
    expect(host.getSnapshot()).toBe(before);
    expect(plan.members).toEqual([sceneId, eventId]);
    expect(plan.reasons).toEqual([{ objectKey: eventId + ':document', requiredBy: sceneId + ':document', kind: 'recovered-edit' }]);
    expect(plan.preview[0]).toMatchObject({ files: { [scriptPath]: initial }, savedFiles: { [scriptPath]: '// 待丢弃' } });
    const receipt = unwrap(await documents.applyDiscard(plan.planId));
    expect(receipt.dirty).toEqual([otherId]);
    expect(working(host, sceneId).files[scriptPath]).toBe(initial);
    expect(JSON.parse(working(host, eventId).files[eventPath]!).data.offset).toBe(1);
    expect(working(host, otherId).files[otherPath]).toBe('// 保留这稿');
    unwrap(await documents.undo(unwrap(await documents.planUndo(sceneId, receipt.operationId)).planId));
    expect(working(host, sceneId).files[scriptPath]).toBe('// 待丢弃');
    expect(JSON.parse(working(host, eventId).files[eventPath]!).data.offset).toBe(2);
    unwrap(await documents.redo(unwrap(await documents.planRedo(sceneId)).planId));
    unwrap(host.commit(input(host, '新的独立修改', [text(sceneId, initial, '// 新稿')])));
    unwrap(host.commit(input(host, '另一个独立修改', [offset(1, 3)])));
    expect(unwrap(await documents.planDiscard(discardScope(host, sceneId))).members).toEqual([sceneId]);
  });

  it('invalidates a discard after working or saved revisions change and ignores saved associations', async () => {
    const host = createCandidateHost(seed(), { saveDelayMs: 0 });
    const { documents } = host.bridge;
    unwrap(host.commit(input(host, '保存关联修改', [text(sceneId, initial, '// 已保存'), offset(1, 2)])));
    const old = unwrap(await documents.planDiscard(discardScope(host, sceneId)));
    unwrap(await documents.save(unwrap(await documents.planSave({ kind: 'all' })).planId));
    expect(await documents.applyDiscard(old.planId)).toMatchObject({ ok: false, error: { code: 'DISCARD_PLAN_STALE' } });
    expect(working(host, sceneId).revision).toBe(old.expected[0]!.revision);
    unwrap(host.commit(input(host, '独立草稿', [text(sceneId, '// 已保存', '// 待丢弃')])));
    unwrap(host.commit(input(host, '独立锚点', [offset(2, 3)])));
    const scope = discardScope(host, sceneId);
    const reviewed = unwrap(await documents.planDiscard(scope));
    expect(reviewed.members).toEqual([sceneId]);
    unwrap(host.commit(input(host, '并发修改', [text(otherId, other, '// 新内容')])));
    expect(await documents.planDiscard(scope)).toMatchObject({ ok: false, error: { code: 'DISCARD_PLAN_STALE' } });
    expect(await documents.applyDiscard(reviewed.planId)).toMatchObject({ ok: false, error: { code: 'DISCARD_PLAN_STALE' } });
    const fresh = unwrap(await documents.planDiscard(discardScope(host, sceneId)));
    unwrap(await documents.applyDiscard(fresh.planId));
    expect(working(host, sceneId).files[scriptPath]).toBe('// 已保存');
    expect(JSON.parse(working(host, eventId).files[eventPath]!).data.offset).toBe(3);
  });

  it('discards new documents and restores deleted documents with undo', async () => {
    const host = createCandidateHost(seed());
    const { documents } = host.bridge;
    const id = 'NewDoc', path = 'review/events/New.json', files = { [path]: envelope(id, {}) };
    unwrap(host.commit(input(host, '新增和删除', [
      { kind: 'document', documentId: id, op: 'create', before: null, after: { format: 'json', files } },
      { kind: 'document', documentId: eventId, op: 'delete', before: { format: 'json', files: working(host, eventId).files }, after: null },
    ])));
    const plan = unwrap(await documents.planDiscard(discardScope(host, id)));
    expect(plan.preview.map(document => document.files)).toEqual([{}, { [eventPath]: envelope(eventId, { offset: 1 }) }]);
    const receipt = unwrap(await documents.applyDiscard(plan.planId));
    expect(working(host, id)).toMatchObject({ files: {}, dirty: false });
    expect(JSON.parse(working(host, eventId).files[eventPath]!).data.offset).toBe(1);
    unwrap(await documents.undo(unwrap(await documents.planUndo(id, receipt.operationId)).planId));
    expect(working(host, id)).toMatchObject({ dirty: true });
    expect(JSON.parse(working(host, id).files[path]!).data).toEqual({});
    expect(working(host, eventId)).toMatchObject({ files: {}, dirty: true });
  });

  it('expands to independent reference edits in both directions', async () => {
    const host = createCandidateHost(seed(), { saveDelayMs: 0 });
    const { documents } = host.bridge;
    const id = 'NewDoc', path = 'review/events/New.json', files = { [path]: envelope(id, {}) };
    const reference = (before: Json, after: Json): Patch => ({
      kind: 'json', documentId: eventId, changes: [{ path: '/data/targetId', before, after, op: after === null ? 'remove' : 'set' }],
    });
    unwrap(host.commit(input(host, '新增被引用文档', [{ kind: 'document', documentId: id, op: 'create', before: null, after: { format: 'json', files } }])));
    unwrap(host.commit(input(host, '新增独立引用', [reference(null, id)])));
    const remove = unwrap(await documents.planDiscard(discardScope(host, id)));
    expect(remove.members).toEqual([id, eventId]);
    expect(remove.reasons).toEqual([{ objectKey: eventId + ':document', requiredBy: id + ':document', kind: 'reference' }]);
    unwrap(await documents.save(unwrap(await documents.planSave({ kind: 'all' })).planId));
    unwrap(host.commit(input(host, '移除引用', [reference(id, null)])));
    unwrap(host.commit(input(host, '删除被引用文档', [{ kind: 'document', documentId: id, op: 'delete', before: { format: 'json', files }, after: null }])));
    const restore = unwrap(await documents.planDiscard(discardScope(host, eventId)));
    expect(restore.members).toEqual([eventId, id]);
    unwrap(await documents.applyDiscard(restore.planId));
    expect(JSON.parse(working(host, eventId).files[eventPath]!).data.targetId).toBe(id);
    expect(working(host, id).files[path]).toBeDefined();
  });

  it('creates, deletes, and restores a document using the authoring document image shape', async () => {
    const host = createCandidateHost(seed());
    const { documents } = host.bridge;
    const id = 'NewDoc', path = 'review/events/NewScene.json', files = { [path]: envelope(id, {}) };
    const created = input(host, '新增文档', [{ kind: 'document', documentId: id, op: 'create', before: null, after: { format: 'json', files } }]);
    unwrap(host.commit(created));
    expect(working(host, id).revision).toBe(1);
    unwrap(host.commit(input(host, '删除文档', [{ kind: 'document', documentId: id, op: 'delete', before: { format: 'json', files }, after: null }])));
    expect(working(host, id).files).toEqual({});
    unwrap(await documents.undo(unwrap(await documents.planUndo(id)).planId));
    expect(working(host, id).revision).toBe(3);
    expect(JSON.parse(working(host, id).files[path]!).data).toEqual({});
  });

  it('applies real project and scene authoring operations through the same bridge', async () => {
    const projectId = 'Proj01', chapter = FixtureProject.chapters[0]!;
    const originalScenes = FixtureScenes.map((scene, index) => {
      const id = fixtureId(0xe80 + index), path = 'scenes/' + scene.id + '/script.gal';
      const files = { ['scenes/' + scene.id + '/scene.json']: envelope(id, scene), [path]: '' };
      return { ...document(id, path, ''), files, savedFiles: files };
    });
    const host = createCandidateHost([document(projectId, 'project.json', envelope(projectId, FixtureProject)), ...originalScenes]);
    const { documents } = host.bridge;
    const scene = unwrap(prepareAuthoringEdit(host.list(), { op: 'scene.create', chapterId: chapter.id, name: '新场景' }));
    const plan = unwrap(await documents.planEdit(scene));
    unwrap(await documents.applyEdit(plan.planId, plan.input.expected));
    const sceneDocument = host.list().find(item => item.format === 'dsl' && !originalScenes.some(scene => scene.documentId === item.documentId))!;
    const metadataPath = Object.keys(sceneDocument.files).find(path => path.endsWith('/scene.json'))!;
    const scriptPath = metadataPath.replace(/scene\.json$/, 'script.gal');
    const id = JSON.parse(sceneDocument.files[metadataPath]!).data.id as Id;
    const say = unwrap(prepareAuthoringEdit(host.list(), { op: 'commands.insert', sceneId: id, beforeId: null,
      commands: [{ command: 'say', args: { speaker: { kind: 'narrator' }, text: '真实语义操作' } }] }));
    unwrap(host.commit(say));
    const edited = working(host, sceneDocument.documentId);
    const parsed = parse({ documentId: edited.documentId, revision: edited.revision, text: edited.files[scriptPath]! });
    expect(parsed.cst[0]).toMatchObject({ command: 'say', valid: true });
    const jump = unwrap(prepareAuthoringEdit(host.list(), { op: 'commands.insert', sceneId: FixtureScenes[0]!.id, beforeId: null,
      commands: [{ command: 'changeScene', args: { sceneId: id } }] }));
    unwrap(host.commit(jump));
    const discard = unwrap(await documents.planDiscard(discardScope(host, sceneDocument.documentId)));
    expect(discard.members).toContain(originalScenes[0]!.documentId);
    const receipt = unwrap(await documents.applyDiscard(discard.planId));
    expect(working(host, sceneDocument.documentId).files).toEqual({});
    unwrap(await documents.undo(unwrap(await documents.planUndo(sceneDocument.documentId, receipt.operationId)).planId));
    expect(working(host, sceneDocument.documentId).files[scriptPath]).toBe(edited.files[scriptPath]);
  });
});
