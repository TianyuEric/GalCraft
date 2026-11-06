import { createId, reserveIds, type DocumentView, type EditInput, type Issue, type Json, type Project, type Result } from '@galcraft/contracts';
import type { AuthorOperation } from '@galcraft/documents/authoring';
import { parse } from '@galcraft/dsl';
import { documentData, envelope, sceneExtension, type SceneExtension } from './documents.js';

const sidecarPath = (sceneId: string) => `candidate/scenes/${sceneId}.json`;

function failure(code: string, message: string): Result<never> {
  const error: Issue = { code, message, severity: 'error', owner: 'M02', related: [], actions: ['edit', 'compare'] };
  return { ok: false, error, issues: [error] };
}

function expectDocument(edit: EditInput, document: DocumentView) {
  if (!edit.expected.some(item => item.ref.kind === 'document' && item.ref.id === document.documentId)) {
    edit.expected.push({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
  }
}

function requireDocument(edit: EditInput, documentId: string) {
  if (!edit.requiredRefs.some(ref => ref.kind === 'document' && ref.id === documentId)) {
    edit.requiredRefs.push({ kind: 'document', id: documentId });
  }
}

function setData(edit: EditInput, document: DocumentView, before: Json, after: Json) {
  edit.patches.push({ kind: 'json', documentId: document.documentId, changes: [{ path: '/data', op: 'set', before, after }] });
}

function copySidecars(documents: DocumentView[], sourceIds: string[], edit: EditInput) {
  // The formal copy emits scene creation patches in source chapter order.
  const copies = edit.patches.flatMap(patch => {
    if (patch.kind !== 'document' || patch.op !== 'create' || !patch.after || typeof patch.after !== 'object' || Array.isArray(patch.after)) return [];
    const { files } = patch.after;
    if (!files || typeof files !== 'object' || Array.isArray(files)) return [];
    return Object.entries(files).flatMap(([path, text]) => {
      const sceneId = /^scenes\/([^/]+)\/script\.gal$/.exec(path)?.[1];
      return sceneId && typeof text === 'string' ? [{ sceneId, documentId: patch.documentId, text }] : [];
    });
  });
  if (copies.length !== sourceIds.length) throw new Error('候选副本与源场景数量不一致。');

  reserveIds([documents, edit]);
  for (const [index, sourceId] of sourceIds.entries()) {
    const path = `scenes/${sourceId}/script.gal`;
    const source = documents.find(document => path in document.files);
    if (!source) throw new Error(`找不到源场景脚本 ${path}。`);
    const sidecar = documents.find(document => sidecarPath(sourceId) in document.files);
    const previous = sceneExtension(documents, sourceId);
    const copy = copies[index]!;
    const sourceNodes = parse({ documentId: source.documentId, revision: source.revision, text: source.files[path]! }).cst;
    const copyNodes = parse({ documentId: copy.documentId, revision: 1, text: copy.text }).cst;
    if (sourceNodes.length !== copyNodes.length) throw new Error(`场景 ${sourceId} 的副本语句与源脚本不一致。`);

    // The formal DSL rewrite retains statement order and replaces identities in place.
    const events: SceneExtension['events'] = {};
    for (const [ordinal, node] of sourceNodes.entries()) {
      const newId = copyNodes[ordinal]!.id;
      if (node.id && newId && previous.events[node.id]) {
        events[newId] = previous.events[node.id].map(event => ({ ...event, id: createId() }));
      }
    }
    const created = envelope(createId(), sidecarPath(copy.sceneId), { ...previous, sceneId: copy.sceneId, events });
    expectDocument(edit, source);
    if (sidecar) expectDocument(edit, sidecar);
    requireDocument(edit, copy.documentId);
    edit.patches.push({ kind: 'document', op: 'create', documentId: created.documentId, before: null, after: { format: created.format, files: created.files } });
  }
}

function removeCharacter(documents: DocumentView[], { id, replacementId }: Extract<AuthorOperation, { op: 'character.remove' }>, edit: EditInput): Result<EditInput> {
  const references: string[] = [];
  for (const document of documents) for (const [path, raw] of Object.entries(document.files)) {
    if (!/^candidate\/scenes\/[^/]+\.json$/.test(path)) continue;
    expectDocument(edit, document);
    const before: SceneExtension = JSON.parse(raw).data;
    const hasCast = Object.hasOwn(before.cast, id);
    const hasEvents = Object.values(before.events).some(events => events.some(event => event.characterId === id));
    if (!hasCast && !hasEvents) continue;
    references.push(path);
    if (!replacementId) continue;

    const cast = { ...before.cast };
    if (hasCast) {
      if (!Object.hasOwn(cast, replacementId)) cast[replacementId] = cast[id]!;
      delete cast[id];
    }
    const events = Object.fromEntries(Object.entries(before.events).map(([statementId, events]) => [statementId,
      events.map(event => event.characterId === id ? { ...event, characterId: replacementId } : event),
    ]));
    setData(edit, document, before, { ...before, cast, events });
  }

  if (references.length) {
    if (!replacementId) return failure('REFERENCE_IN_USE', `候选场景仍引用角色 ${id}，请先选择替代角色（${references.join('、')}）。`);
    const replacement = documents.find(document => `characters/${replacementId}.json` in document.files);
    if (!replacement) throw new Error(`找不到替代角色 ${replacementId}。`);
    requireDocument(edit, replacement.documentId);
  }

  const appearancePath = 'candidate/appearances.json';
  const appearance = documents.find(document => appearancePath in document.files);
  if (appearance) {
    expectDocument(edit, appearance);
    const before: { appearances: Record<string, Json> } = JSON.parse(appearance.files[appearancePath]!).data;
    if (Object.hasOwn(before.appearances, id)) {
      const appearances = { ...before.appearances };
      delete appearances[id];
      setData(edit, appearance, before, { ...before, appearances });
    }
  }
  return { ok: true, value: edit, warnings: [] };
}

/** Keep candidate presentation changes in the same transaction as the formal authoring operation. */
export function extendCandidateAuthoringEdit(documents: DocumentView[], operation: AuthorOperation, input: EditInput): Result<EditInput> {
  const edit = structuredClone(input);
  try {
    switch (operation.op) {
      case 'scene.remove': {
        const sidecar = documents.find(document => sidecarPath(operation.id) in document.files);
        if (sidecar) {
          expectDocument(edit, sidecar);
          edit.patches.push({ kind: 'document', op: 'delete', documentId: sidecar.documentId, before: { format: sidecar.format, files: { ...sidecar.files } }, after: null });
        }
        break;
      }
      case 'scene.duplicate':
        copySidecars(documents, [operation.id], edit);
        break;
      case 'chapter.duplicate': {
        const chapter = documentData<Pick<Project, 'chapters'>>(documents, 'project.json')?.chapters.find(item => item.id === operation.id);
        if (!chapter) throw new Error(`找不到源章节 ${operation.id}。`);
        copySidecars(documents, chapter.sceneIds, edit);
        break;
      }
      case 'character.remove':
        return removeCharacter(documents, operation, edit);
    }
    return { ok: true, value: edit, warnings: [] };
  } catch (error) {
    return failure('CANDIDATE_EDIT', error instanceof Error ? error.message : String(error));
  }
}
