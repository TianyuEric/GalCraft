import { createId, DiscardScopeSchema, DocumentViewSchema, EditInputSchema, IdSchema, JsonSchema, RelativePathSchema, SaveScopeSchema } from '@galcraft/contracts';
import type { DiscardPlan, DiscardScope, DocumentView, EditInput, EditPlan, EditReceipt, Id, Issue, Json, Patch, Ref, Result, SaveObject, SavePlan, SaveReceipt, SaveScope, StudioBridge, UndoPlan, VersionRef } from '@galcraft/contracts';
import { authoringReferences } from '@galcraft/documents/authoring';
import { applyTextEdits, parse } from '@galcraft/dsl';
import { CandidateSourceRecoveryStore, type CandidateSourceRecovery } from '../application/source-recovery.js';

export type CandidateDocuments = Pick<StudioBridge['documents'],
  'list' | 'planEdit' | 'applyEdit' | 'planUndo' | 'undo' | 'planRedo' | 'redo' | 'planSave' | 'save'> &
  Required<Pick<StudioBridge['documents'], 'planDiscard' | 'applyDiscard'>>;
export type CandidateDocumentSnapshot = Readonly<Omit<DocumentView, 'files' | 'savedFiles'>> & {
  readonly files: Readonly<Record<string, string>>;
  readonly savedFiles: Readonly<Record<string, string>>;
};
export type CandidateHostSnapshot = {
  readonly documents: readonly CandidateDocumentSnapshot[];
  readonly saving: boolean;
  readonly saveError: string | null;
};
export type CandidateHistoryStatus = { canUndo: boolean; canRedo: boolean; undoLabel: string; redoLabel: string };
export type CandidateHostOptions = {
  sourceRecovery?: CandidateSourceRecovery;
  savedSourceRecovery?: CandidateSourceRecovery;
  historyScope?(documentId: Id): readonly Id[];
  resolveRequiredRef?(ref: Ref, documents: readonly CandidateDocumentSnapshot[]): boolean;
  persist?(documents: readonly CandidateDocumentSnapshot[]): Promise<void>;
  saveDelayMs?: number;
};

type Image = Pick<DocumentView, 'format' | 'files'>;
type Operation = {
  id: Id;
  groupId: Id;
  label: string;
  paths: Map<Id, Set<string>>;
  members: Id[];
  before: Map<Id, Image | null>;
  after: Map<Id, Image>;
  requiredRefs: Ref[];
  applied: boolean;
  savedApplied: Set<Id>;
  recoveryBefore: CandidateSourceRecovery;
  recoveryAfter: CandidateSourceRecovery;
};
type HistoryPlan = { plan: UndoPlan; action: 'undo' | 'redo'; group: Operation[] };
type DiscardCapture = { plan: DiscardPlan; savedRevisions: Map<Id, number>; after: Map<Id, Image> };

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
function fail(code: string, message: string): Result<never> {
  const error: Issue = { code, message, severity: 'error', owner: 'M02', related: [], actions: [] };
  return { ok: false, error, issues: [error] };
}
const version = (document: DocumentView): VersionRef => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
const hasFiles = (document: DocumentView | undefined): document is DocumentView => !!document && Object.keys(document.files).length > 0;
const intersects = (left: readonly Id[], right: readonly Id[]) => left.some(id => right.includes(id));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const objectKey = (id: Id) => id + ':document';

function equal(left: Json, right: Json): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right))
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equal(value, right[index]!));
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key]!, right[key]!));
}

function jsonFile(raw: string): Record<string, Json> | null {
  try {
    const parsed = JsonSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : null;
  } catch { return null; }
}

function comparable(path: string, raw: string): Json {
  if (!path.endsWith('.json')) return raw;
  const data = jsonFile(raw);
  if (data?.schemaVersion === 1 && typeof data.documentId === 'string') {
    delete data.revision;
    return data;
  }
  return raw;
}

function sameFiles(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && equal(comparable(key, left[key]!), comparable(key, right[key]!)));
}

function documentIds(document: DocumentView, files: Image['files']): Set<Id> {
  const ids = new Set<Id>();
  const referenceKinds = ['variable', 'character', 'scene', 'label', 'asset', 'statement', 'object'];
  if (Object.keys(files).length) ids.add(document.documentId);
  const add = (value: unknown) => { if (typeof value === 'string' && IdSchema.safeParse(value).success) ids.add(value); };
  const visit = (value: Json | undefined) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      if (!referenceKinds.includes(String(value.kind))) add(value.id);
      Object.values(value).forEach(visit);
    }
  };
  for (const [path, raw] of Object.entries(files)) {
    if (path.endsWith('.json')) visit(jsonFile(raw)?.data);
    if (path.endsWith('.gal')) for (const node of parse({ documentId: document.documentId, revision: document.revision, text: raw }).cst) {
      if (!node.valid) continue;
      add(node.id);
      if (node.command === 'label') add((node.object?.value as Record<string, unknown> | undefined)?.labelId);
    }
  }
  return ids;
}

function saveObject(document: DocumentView): SaveObject {
  const paths = [...new Set([...Object.keys(document.files), ...Object.keys(document.savedFiles)])];
  return { documentId: document.documentId, kind: 'document', objectId: null, key: objectKey(document.documentId),
    revision: document.revision, name: paths[0] ?? document.documentId, paths };
}

function readImage(value: Json | null, documentId: Id): Image {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (value.format !== 'dsl' && value.format !== 'json') || value.documentId !== undefined && value.documentId !== documentId ||
      !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) throw new Error('文档内容无效');
  const files = Object.fromEntries(Object.entries(value.files).map(([path, content]) => {
    if (typeof content !== 'string' || path.startsWith('.galcraft/') || !RelativePathSchema.safeParse(path).success)
      throw new Error('文档文件无效');
    return [path, content];
  }));
  const paths = Object.keys(files), jsonPaths = paths.filter(path => path.endsWith('.json'));
  const data = jsonPaths.length === 1 ? jsonFile(files[jsonPaths[0]!]!) : null;
  if (data?.schemaVersion !== 1 || data.documentId !== documentId) throw new Error('文档身份无效');
  if (value.format === 'dsl' && !paths.some(path => path.endsWith('.gal'))) throw new Error('场景文档缺少源码');
  return { format: value.format, files };
}

function applyPatch(documents: Map<Id, Image>, patch: Patch) {
  const document = documents.get(patch.documentId);
  if (patch.kind === 'document') {
    if (patch.op === 'create') {
      if (document || patch.before !== null) throw new Error('文档已经存在');
      documents.set(patch.documentId, readImage(patch.after, patch.documentId));
    } else {
      const before = readImage(patch.before, patch.documentId);
      if (!document || patch.after !== null || document.format !== before.format || !sameFiles(document.files, before.files))
        throw new Error('删除的文档已变化');
      documents.delete(patch.documentId);
    }
    return;
  }
  if (!document) throw new Error('目标文档不存在');
  if (patch.kind === 'file') {
    if (!patch.path.startsWith('ui/styles/') || !/\.(css|scss)$/.test(patch.path)) throw new Error('文件补丁需要界面样式表');
    if ((document.files[patch.path] ?? null) !== patch.before) throw new Error('文件基线已变化');
    if (patch.after === null) delete document.files[patch.path];
    else document.files[patch.path] = patch.after;
    return;
  }
  const extension = patch.kind === 'text' ? '.gal' : '.json';
  const path = Object.keys(document.files).find(file => file.endsWith(extension));
  if (!path) throw new Error('文档缺少 ' + extension + ' 文件');
  const raw = document.files[path]!;
  if (patch.kind === 'text') {
    let boundary = raw.length;
    const edits = [...patch.edits].sort((a, b) => b.start - a.start || b.end - a.end);
    for (const edit of edits) {
      if (edit.start > edit.end || edit.end > boundary || raw.slice(edit.start, edit.end) !== edit.before)
        throw new Error('源码基线已变化或编辑范围重叠');
      boundary = edit.start;
    }
    document.files[path] = applyTextEdits(raw, edits.map(edit => ({ start: edit.start, end: edit.end, oldText: edit.before, text: edit.after })));
    return;
  }
  const data = jsonFile(raw);
  if (!data) throw new Error('JSON 文档无效');
  for (const change of patch.changes) {
    if (!change.path.startsWith('/') || change.path === '/') throw new Error('JSON 路径无效');
    const keys = change.path.slice(1).split('/').map(key => key.replaceAll('~1', '/').replaceAll('~0', '~'));
    const key = keys.pop()!;
    let parent: Record<string, Json> | Json[] = data;
    for (const part of keys) {
      const next: Json | null = Object.hasOwn(parent, part) ? (Array.isArray(parent) ? parent[Number(part)]! : parent[part]!) : null;
      if (!next || typeof next !== 'object') throw new Error('JSON 路径已变化');
      parent = next;
    }
    if (Array.isArray(parent)) {
      const index = Number(key); if (!/^\d+$/.test(key) || !Number.isSafeInteger(index) || index > parent.length) throw new Error('JSON 数组路径无效');
      if (!equal(parent[index] ?? null, change.before)) throw new Error('JSON 基线已变化');
      if (change.op === 'remove') parent.splice(index, 1); else parent[index] = structuredClone(change.after);
    } else {
      if (!equal(Object.hasOwn(parent, key) ? parent[key]! : null, change.before)) throw new Error('JSON 基线已变化');
      if (change.op === 'remove') delete parent[key];
      else Object.defineProperty(parent, key, { value: structuredClone(change.after), writable: true, enumerable: true, configurable: true });
    }
  }
  document.files[path] = JSON.stringify(data, null, 2) + '\n';
}

function snapshotDocument(document: DocumentView): CandidateDocumentSnapshot {
  return Object.freeze({ ...document, files: Object.freeze({ ...document.files }), savedFiles: Object.freeze({ ...document.savedFiles }) });
}

/** Browser review working copy. Save persists only the captured review documents through the supplied adapter. */
export function createCandidateHost(seed: readonly DocumentView[], options: CandidateHostOptions = {}) {
  const documents = new Map(seed.map(value => {
    const document = DocumentViewSchema.parse(value);
    return [document.documentId, document];
  }));
  if (documents.size !== seed.length) throw new Error('候选作品的文档身份重复');
  const sourceRecovery = new CandidateSourceRecoveryStore([...documents.values()], options.sourceRecovery);
  const savedSourceRecovery = new Map((options.savedSourceRecovery ?? sourceRecovery.capture([...documents.values()].map(document => ({...document, files: document.savedFiles, revision: document.savedRevision})))).scenes.map(entry => [entry.documentId, entry]));
  const operations: Operation[] = [];
  let redoGroups: Operation[][] = [];
  const editPlans = new Map<Id, EditPlan>();
  const historyPlans = new Map<Id, HistoryPlan>();
  const savePlans = new Map<Id, { plan: SavePlan; baseline: VersionRef[] }>();
  const discardPlans = new Map<Id, DiscardCapture>();
  const listeners = new Set<() => void>();
  let editGroup: { name: string; time: number; operation: Operation } | null = null;
  let closed = false, saving = false, saveError: string | null = null, nextSaveError: string | null = null;
  const list = () => structuredClone([...documents.values()]);
  const readSnapshot = (): CandidateHostSnapshot => Object.freeze({
    documents: Object.freeze([...documents.values()].map(snapshotDocument)), saving, saveError,
  });
  let snapshot = readSnapshot();
  const emit = () => {
    sourceRecovery.observe(list());
    snapshot = readSnapshot();
    for (const listener of [...listeners]) listener();
  };
  const nextId = () => createId([documents, operations, editPlans, historyPlans, savePlans, discardPlans]);
  const versions = (members: readonly Id[]) => members.flatMap(id => documents.has(id) ? [version(documents.get(id)!)] : []);
  const dirtyIds = () => [...documents.values()].filter(document => document.dirty).map(document => document.documentId);
  const matches = (expected: readonly VersionRef[]) => expected.every(entry => entry.ref.kind === 'document' &&
    documents.get(entry.ref.id)?.revision === entry.revision);
  const closedResult = () => fail('SESSION_CLOSED', '候选作品会话已关闭');

  function prepare(input: EditInput): Result<EditPlan> {
    if (closed) return closedResult();
    const parsed = EditInputSchema.safeParse(input);
    if (!parsed.success) return fail('INVALID_EDIT', parsed.error.message);
    input = parsed.data;
    const guarded = sourceRecovery.guard(input, list());
    if (guarded) return fail('SOURCE_READ_ONLY', guarded);
    const members = [...new Set(input.patches.map(patch => patch.documentId))];
    if (!members.length) return fail('UNKNOWN_DOCUMENT', '编辑没有目标文档');
    if (!matches(input.expected) || new Set(input.expected.map(entry => entry.ref.id)).size !== input.expected.length ||
      members.some(id => documents.has(id) && !input.expected.some(entry => entry.ref.id === id)))
      return fail('EDIT_CONFLICT', '文档工作版本已变化');
    try { apply(input); }
    catch (error) { return fail('PATCH_CONFLICT', message(error)); }
    const plan: EditPlan = { planId: nextId(), input, members, issues: [], preview: [],
      before: Object.fromEntries(members.map(id => [id, documents.get(id)?.revision ?? 0])) };
    editPlans.set(plan.planId, plan);
    return ok(structuredClone(plan));
  }

  function apply(input: EditInput): Map<Id, Image> {
    const touched = new Set(input.patches.map(patch => patch.documentId));
    const next = new Map([...documents].filter(([, document]) => hasFiles(document)).map(([id, document]) =>
      [id, { format: document.format, files: touched.has(id) ? { ...document.files } : document.files }]));
    for (const patch of input.patches) applyPatch(next, patch);
    checkPaths(next);
    return next;
  }

  function checkPaths(working: ReadonlyMap<Id, Image>) {
    const owners = new Map<string, Id>();
    const reserve = (id: Id, files: Image['files']) => {
      for (const path of Object.keys(files)) {
        const owner = owners.get(path);
        if (owner && owner !== id) throw new Error('文档路径重复：' + path);
        owners.set(path, id);
      }
    };
    for (const [id, document] of documents) reserve(id, document.savedFiles);
    for (const [id, image] of working) reserve(id, image.files);
  }

  function put(id: Id, image: Image) {
    const previous = documents.get(id);
    const revision = (previous?.revision ?? 0) + 1;
    const files = { ...image.files };
    for (const [path, raw] of Object.entries(files)) {
      if (!path.endsWith('.json')) continue;
      const data = jsonFile(raw);
      if (data?.schemaVersion === 1 && data.documentId === id) files[path] = JSON.stringify({ ...data, revision }, null, 2) + '\n';
    }
    const savedFiles = previous?.savedFiles ?? {};
    documents.set(id, { documentId: id, format: image.format, revision, files, savedFiles,
      savedRevision: previous?.savedRevision ?? 0, dirty: !sameFiles(files, savedFiles) });
  }

  function commitPlan(planId: Id, expected: VersionRef[], group?: string): Result<EditReceipt> {
    if (closed) return closedResult();
    const plan = editPlans.get(planId);
    if (!plan) return fail('EDIT_PLAN_MISSING', '编辑计划已失效');
    editPlans.delete(planId);
    if (expected.length !== plan.input.expected.length || plan.input.expected.some(entry =>
      !expected.some(value => value.ref.kind === entry.ref.kind && value.ref.id === entry.ref.id && value.revision === entry.revision)) ||
      !matches(plan.input.expected) || plan.members.some(id => (documents.get(id)?.revision ?? 0) !== plan.before[id]))
      return fail('EDIT_CONFLICT', '文档工作版本已变化');
    let next: Map<Id, Image>;
    try { next = apply(plan.input); }
    catch (error) { return fail('PATCH_CONFLICT', message(error)); }
    let missing: Ref | undefined;
    try {
      if (plan.input.requiredRefs.length) {
        const working = [...next].map(([id, image]) => snapshotDocument({ ...image, documentId: id, revision: documents.get(id)?.revision ?? 0,
          savedRevision: documents.get(id)?.savedRevision ?? 0, savedFiles: documents.get(id)?.savedFiles ?? {}, dirty: true }));
        missing = plan.input.requiredRefs.find(ref => !available(ref, working));
      }
    } catch (error) { return fail('REF_CHECK_FAILED', message(error)); }
    if (missing) return fail('REQUIRED_REF_MISSING', '所需引用不可用：' + missing.id);
    const after = new Map(plan.members.map(id => [id, next.get(id) ?? { format: documents.get(id)?.format ?? 'json', files: {} }]));
    const paths = new Map<Id, Set<string>>();
    for (const patch of plan.input.patches) {
      const documentPaths = paths.get(patch.documentId) ?? new Set<string>();
      for (const path of patch.kind === 'json' ? patch.changes.map(change => change.path) : ['*']) documentPaths.add(path);
      paths.set(patch.documentId, documentPaths);
    }
    return publishEdit(planId, plan.input, after, paths, group);
  }

  function available(ref: Ref, working: readonly CandidateDocumentSnapshot[]): boolean {
    return ref.kind === 'document' ? working.some(document => document.documentId === ref.id && Object.keys(document.files).length > 0)
      : !!options.resolveRequiredRef?.(ref, working);
  }

  function publishEdit(planId: Id, input: Pick<EditInput, 'label' | 'preparedAssets' | 'requiredRefs'>, after: Map<Id, Image>,
    paths: Map<Id, Set<string>>, group?: string, restoreRecovery?: CandidateSourceRecovery): Result<EditReceipt> {
    const members = [...after.keys()];
    const before = new Map(members.map(id => {
      const current = documents.get(id);
      return [id, hasFiles(current) ? { format: current.format, files: { ...current.files } } : null] as const;
    }));
    const time = Date.now();
    const previous = group && editGroup?.name === group && time - editGroup.time <= 900 ? editGroup.operation : null;
    const operation: Operation = previous ?? { id: nextId(), groupId: planId, label: input.label, paths: new Map(),
      members: [], before: new Map(), after: new Map(), requiredRefs: [], applied: true, savedApplied: new Set(),
      recoveryBefore: sourceRecovery.capture(list()), recoveryAfter: {version:1,scenes:[]} };
    operation.requiredRefs.push(...input.requiredRefs);
    for (const [id, documentPaths] of paths) {
      const combined = operation.paths.get(id) ?? new Set<string>();
      for (const path of documentPaths) combined.add(path);
      operation.paths.set(id, combined);
    }
    for (const id of members) {
      if (!operation.before.has(id)) { operation.members.push(id); operation.before.set(id, before.get(id)!); }
      operation.after.set(id, after.get(id)!);
    }
    for (const [id, image] of after) put(id, image);
    if(restoreRecovery)sourceRecovery.restore(list(),restoreRecovery,[...after.keys()]);
    sourceRecovery.observe(list());
    operation.recoveryAfter=sourceRecovery.capture(list());
    if (!previous) operations.push(operation);
    editGroup = group ? { name: group, time, operation } : null;
    const replaced = new Set(members);
    let previousSize = -1;
    while (previousSize !== replaced.size) {
      previousSize = replaced.size;
      redoGroups = redoGroups.filter(group => {
        if (!group.some(item => item.members.some(id => replaced.has(id)))) return true;
        for (const item of group) for (const id of item.members) replaced.add(id);
        return false;
      });
    }
    const receipt = { groupId: operation.groupId, operationId: operation.id, documents: versions(members), dirty: dirtyIds(), assetIds: input.preparedAssets };
    emit();
    return ok(receipt);
  }

  function affects(operation: Operation, documentId: Id, paths?: readonly string[]) {
    const ids = [documentId, ...(options.historyScope?.(documentId) ?? [])];
    if (!paths) return intersects(operation.members, ids);
    return ids.some(id => [...operation.paths.get(id) ?? []].some(change => paths.some(path => path === '*' ||
      change === '*' || path === change || path.startsWith(change + '/') || change.startsWith(path + '/'))));
  }

  function findUndo(documentId: Id, operationId?: Id, paths?: string[]) {
    return [...operations].reverse().find(item => item.applied && (!operationId || item.id === operationId) && affects(item, documentId, paths));
  }

  function findRedo(documentId: Id, paths?: string[]) {
    const blocked = new Set<Id>();
    for (const group of [...redoGroups].reverse()) {
      const members = group.flatMap(item => item.members);
      if (affects(group[0]!, documentId, paths) && !members.some(id => blocked.has(id))) return group;
      for (const id of members) blocked.add(id);
    }
    return undefined;
  }

  function planHistory(action: HistoryPlan['action'], documentId: Id, operationId?: Id, paths?: string[]): Result<UndoPlan> {
    if (closed) return closedResult();
    const group = action === 'redo' ? findRedo(documentId, paths) : undefined;
    const target = action === 'undo' ? findUndo(documentId, operationId, paths) : group?.[0];
    if (!target) return fail(action === 'undo' ? 'NOTHING_TO_UNDO' : 'NOTHING_TO_REDO', '当前文档没有可执行的历史操作');
    const related = new Set(target.members);
    const selected = group ?? operations.slice(operations.indexOf(target)).filter(item => {
      if (!item.applied || !item.members.some(id => related.has(id))) return false;
      for (const id of item.members) related.add(id);
      return true;
    });
    const members = [...new Set(selected.flatMap(item => item.members))];
    const plan: UndoPlan = { planId: nextId(), requestedOperationId: target.id, reverseOrder: selected.map(item => item.id).reverse(),
      members, expected: versions(members), label: target.label,
      operations: selected.map(item => ({ operationId: item.id, label: item.label, members: item.members })) };
    historyPlans.set(plan.planId, { plan, action, group: selected });
    return ok(structuredClone(plan));
  }

  function applyHistory(action: HistoryPlan['action'], planId: Id): Result<EditReceipt> {
    if (closed) return closedResult();
    const capture = historyPlans.get(planId);
    if (!capture || capture.action !== action) return fail('HISTORY_PLAN_MISSING', '历史计划已失效');
    historyPlans.delete(planId);
    const { plan, group } = capture;
    const undoing = action === 'undo';
    if (!matches(plan.expected) || group.some(item => item.applied !== undoing) || !undoing && !redoGroups.includes(group))
      return fail('EDIT_CONFLICT', '文档工作版本已变化');
    const changes = new Map<Id, Image>();
    const recoveries = new Map<Id, CandidateSourceRecovery['scenes'][number]>();
    for (const item of undoing ? [...group].reverse() : group) {
      for (const [id, image] of undoing ? item.before : item.after)
        changes.set(id, image ?? { format: item.after.get(id)!.format, files: {} });
      for(const entry of (undoing?item.recoveryBefore:item.recoveryAfter).scenes)
        if(item.members.includes(entry.documentId)||entry.baseline.sidecar&&item.members.includes(entry.baseline.sidecar.documentId))recoveries.set(entry.documentId,entry);
    }
    try { checkPaths(new Map([...documents, ...changes])); }
    catch (error) { return fail('PATCH_CONFLICT', message(error)); }
    editGroup = null;
    for (const [id, image] of changes) put(id, image);
    sourceRecovery.restore(list(),{version:1,scenes:[...recoveries.values()]},[...changes.keys()]);
    for (const item of group) item.applied = !undoing;
    if (undoing) redoGroups.push(group);
    else redoGroups = redoGroups.filter(item => item !== group);
    const receipt = { groupId: planId, operationId: plan.requestedOperationId, documents: versions(plan.members), dirty: dirtyIds(), assetIds: [] };
    emit();
    return ok(receipt);
  }

  function pendingGroups(dirty: ReadonlySet<Id>) {
    const restored = new Map<Id, number>();
    for (const [index, operation] of operations.entries()) if (operation.applied) {
      for (const id of operation.members) {
        if (dirty.has(id) && sameFiles(operation.after.get(id)!.files, documents.get(id)!.savedFiles)) restored.set(id, index);
      }
    }
    return operations.map((operation, index) => ({ operation, members: operation.members.filter(id =>
      dirty.has(id) && index > (restored.get(id) ?? -1) && operation.applied !== operation.savedApplied.has(id)) }));
  }

  function expandAssociatedEdits(groups: ReturnType<typeof pendingGroups>, selected: Set<Id>, add: (id: Id, requiredBy: Id) => void) {
    let previousSize = -1;
    while (previousSize !== selected.size) {
      previousSize = selected.size;
      for (const { members } of groups) {
        const requiredBy = members.find(id => selected.has(id));
        if (!requiredBy) continue;
        for (const id of members) if (!selected.has(id)) {
          selected.add(id);
          add(id, requiredBy);
        }
      }
    }
  }

  function planSave(scope: SaveScope): Result<SavePlan> {
    if (closed) return closedResult();
    const parsed = SaveScopeSchema.safeParse(scope);
    if (!parsed.success) return fail('INVALID_SAVE_SCOPE', parsed.error.message);
    scope = parsed.data;
    if (scope.kind === 'objects' && (!matches(scope.expected) || scope.objects.some(item => item.kind !== 'document')))
      return fail('SAVE_PLAN_STALE', '候选按文档保存，请重新选择保存范围');
    const dirty = new Set(dirtyIds());
    const requested = scope.kind === 'all' ? [...dirty] : scope.kind === 'current'
      ? [scope.documentId, ...(options.historyScope?.(scope.documentId) ?? []).filter(id => documents.has(id))]
      : scope.objects.map(item => item.documentId);
    if (requested.some(id => !documents.has(id))) return fail('UNKNOWN_DOCUMENT', '保存的文档不存在');
    const selected = new Set(requested.filter(id => dirty.has(id)));
    const reasons: SavePlan['reasons'] = [];
    expandAssociatedEdits(pendingGroups(dirty), selected, (id, requiredBy) => {
      reasons.push({ objectKey: objectKey(id), requiredBy: objectKey(requiredBy), kind: 'associated-edit' });
    });
    const members = [...selected], preview = members.map(id => structuredClone(documents.get(id)!));
    const plan: SavePlan = { planId: nextId(), members, versions: versions(members), objects: preview.map(saveObject), preview, reasons,
      requestedObjects: [...new Set(requested.filter(id => dirty.has(id)).map(objectKey))],
      extraDirtyMembers: members.filter(id => !requested.includes(id)),
      files: preview.flatMap(document => [...new Set([...Object.keys(document.files), ...Object.keys(document.savedFiles)])]
        .filter(path => document.files[path] !== document.savedFiles[path]).map(path => ({
          path, documentId: document.documentId, oldExists: Object.hasOwn(document.savedFiles, path), newExists: Object.hasOwn(document.files, path),
        }))),
    };
    savePlans.set(plan.planId, { plan, baseline: [...documents.values()].map(version) });
    return ok(structuredClone(plan));
  }

  function planDiscard(scope: DiscardScope): Result<DiscardPlan> {
    if (closed) return closedResult();
    if (saving) return fail('SAVE_BUSY', '候选保存正在进行');
    const parsed = DiscardScopeSchema.safeParse(scope);
    if (!parsed.success) return fail('INVALID_DISCARD_SCOPE', parsed.error.message);
    scope = parsed.data;
    if (!documents.has(scope.documentId)) return fail('UNKNOWN_DOCUMENT', '丢弃范围的文档不存在');
    if (scope.objectId || scope.paths?.length || scope.objects?.some(object => object.kind !== 'document'))
      return fail('DISCARD_SCOPE_UNSUPPORTED', '候选按整份文档丢弃修改');
    const dirty = new Set(dirtyIds());
    const requested = scope.objects ? scope.objects.map(object => object.documentId) : [scope.documentId].filter(id => dirty.has(id));
    const selected = new Set(requested);
    if (scope.objects && (!scope.expected || requested.length !== selected.size ||
      requested.some(id => !dirty.has(id) || !scope.expected!.some(entry => entry.ref.id === id))))
      return fail('DISCARD_PLAN_STALE', '对象修改已变化，请刷新丢弃范围');
    if (scope.expected && (!matches(scope.expected) || new Set(scope.expected.map(entry => entry.ref.id)).size !== scope.expected.length))
      return fail('DISCARD_PLAN_STALE', '对象修改已变化，请刷新丢弃范围');

    const working = [...documents.values()];
    const groups = pendingGroups(dirty);
    const reasons: NonNullable<DiscardPlan['reasons']> = [];
    const restore = (document: DocumentView): DocumentView => ({ ...document, files: document.savedFiles, dirty: false });
    const saved = working.filter(document => document.dirty).map(restore);
    const affected = new Map<Id, { current: Set<Id>; saved: Set<Id> }>();
    const identities = working.map(document => {
      const current = documentIds(document, document.files);
      return { documentId: document.documentId, current, saved: document.dirty ? documentIds(document, document.savedFiles) : current };
    });
    for (const entry of identities) for (const id of [...entry.current, ...entry.saved]) {
      if (entry.current.has(id) !== entry.saved.has(id)) affected.set(id, { current: new Set(), saved: new Set() });
    }
    for (const entry of identities) for (const [id, owners] of affected) {
      if (entry.current.has(id)) owners.current.add(entry.documentId);
      if (entry.saved.has(id)) owners.saved.add(entry.documentId);
    }
    const addReference = (id: Id, requiredBy: Id, ref?: Ref) => {
      selected.add(id);
      reasons.push({ objectKey: objectKey(id), requiredBy: objectKey(requiredBy), kind: 'reference', ...(ref ? { ref } : {}) });
    };
    let size = -1;
    try {
      while (selected.size && size !== selected.size) {
        size = selected.size;
        expandAssociatedEdits(groups, selected, (id, requiredBy) => {
          reasons.push({ objectKey: objectKey(id), requiredBy: objectKey(requiredBy), kind: 'recovered-edit' });
        });
        const projected = working.map(document => selected.has(document.documentId) ? restore(document) : document);
        let expanded = false;
        for (const [id, owners] of affected) {
          if ([...owners.current].some(owner => !selected.has(owner)) || [...owners.saved].some(owner => selected.has(owner))) continue;
          const ref: Ref = { kind: 'document', id };
          const source = authoringReferences(projected, ref).find(reference => owners.current.size || selected.has(reference.documentId));
          if (!source) continue;
          const provider = [...owners.saved].find(owner => !selected.has(owner));
          const target = [...owners.current].find(owner => selected.has(owner));
          const sourceSaved = saved.find(document => document.documentId === source.documentId);
          if (provider) addReference(provider, selected.has(source.documentId) ? source.documentId : target ?? requested[0]!);
          else if (sourceSaved && !selected.has(source.documentId) && !authoringReferences([sourceSaved], ref).length)
            addReference(source.documentId, target ?? requested[0]!);
          else return fail('DISCARD_REF_CONFLICT', '丢弃范围无法恢复引用：' + id);
          expanded = true;
          break;
        }
        if (expanded) continue;
        const currentSnapshots = working.map(snapshotDocument), projectedSnapshots = projected.map(snapshotDocument);
        for (const { operation, members } of groups) {
          if (!operation.applied || !operation.requiredRefs.length) continue;
          const owner = members.find(id => !selected.has(id) && sameFiles(operation.after.get(id)!.files, documents.get(id)!.files));
          if (!owner) continue;
          const missing = operation.requiredRefs.find(ref => available(ref, currentSnapshots) && !available(ref, projectedSnapshots));
          if (missing) { addReference(owner, selected.has(missing.id) ? missing.id : requested[0]!, missing); break; }
        }
      }
    } catch (error) { return fail('REF_CHECK_FAILED', message(error)); }

    const members = [...selected];
    const after = new Map(members.map(id => {
      const document = documents.get(id)!;
      return [id, { format: document.format, files: { ...document.savedFiles } }] as const;
    }));
    const plan: DiscardPlan = { planId: nextId(), scope, members, expected: working.map(version),
      requestedObjects: requested.map(objectKey), objects: members.map(id => saveObject(documents.get(id)!)), reasons,
      expanded: members.map(documentId => ({ documentId, paths: ['*'] })),
      preview: members.map(id => {
        const document = documents.get(id)!;
        return { ...document, files: after.get(id)!.files, savedFiles: document.files, savedRevision: document.revision };
      }),
    };
    discardPlans.set(plan.planId, { plan, savedRevisions: new Map(working.map(document => [document.documentId, document.savedRevision])), after });
    return ok(structuredClone(plan));
  }

  function applyDiscard(planId: Id): Result<EditReceipt> {
    if (closed) return closedResult();
    if (saving) return fail('SAVE_BUSY', '候选保存正在进行');
    const capture = discardPlans.get(planId);
    discardPlans.delete(planId);
    if (!capture || capture.plan.expected.length !== documents.size || !matches(capture.plan.expected) ||
      [...capture.savedRevisions].some(([id, revision]) => documents.get(id)?.savedRevision !== revision))
      return fail('DISCARD_PLAN_STALE', '文档版本已变化，请重新审阅丢弃范围');
    if (!capture.after.size) return ok({ groupId: planId, operationId: planId, documents: [], dirty: dirtyIds(), assetIds: [] });
    try { checkPaths(new Map([...documents, ...capture.after])); }
    catch (error) { return fail('DISCARD_CONFLICT', message(error)); }
    return publishEdit(planId, { label: '丢弃未保存的修改', preparedAssets: [], requiredRefs: [] }, capture.after,
      new Map(capture.plan.expanded.map(({ documentId, paths }) => [documentId, new Set(paths)])),undefined,
      {version:1,scenes:[...savedSourceRecovery.values()].filter(entry=>capture.after.has(entry.documentId)||entry.baseline.sidecar&&capture.after.has(entry.baseline.sidecar.documentId))});
  }

  async function save(planId: Id): Promise<Result<SaveReceipt>> {
    if (closed) return closedResult();
    if (saving) return fail('SAVE_BUSY', '候选保存正在进行');
    const capture = savePlans.get(planId);
    if (!capture) return fail('SAVE_PLAN_MISSING', '保存计划已失效');
    savePlans.delete(planId);
    if (capture.baseline.length !== documents.size || !matches(capture.baseline)) return fail('SAVE_PLAN_STALE', '保存前文档工作版本已变化');
    const { plan } = capture, injected = nextSaveError;
    const capturedRecovery = sourceRecovery.capture(list());
    const capturedHistory = operations.map(item => ({ item, applied: item.applied }));
    editGroup = null;
    nextSaveError = null;
    saving = true;
    saveError = null;
    emit();
    try {
      const delay = options.saveDelayMs ?? 350;
      if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
      if (closed) return closedResult();
      if (injected) throw new Error(injected);
      await options.persist?.(Object.freeze(plan.preview.map(snapshotDocument)));
      if (closed) return closedResult();
      for (const saved of plan.preview) {
        const current = documents.get(saved.documentId)!;
        documents.set(current.documentId, { ...current, savedFiles: { ...saved.files }, savedRevision: saved.revision,
          dirty: !sameFiles(current.files, saved.files) });
      }
      for (const { item, applied } of capturedHistory) for (const id of item.members) {
        if (!plan.members.includes(id)) continue;
        if (applied) item.savedApplied.add(id);
        else item.savedApplied.delete(id);
      }
      for (const entry of capturedRecovery.scenes) {
        if(!plan.members.includes(entry.documentId)&&!(entry.baseline.sidecar&&plan.members.includes(entry.baseline.sidecar.documentId)))continue;
        const saved=documents.get(entry.documentId),sidecar=entry.baseline.sidecar&&documents.get(entry.baseline.sidecar.documentId);
        if(saved?.savedFiles[entry.path]!==entry.raw||entry.baseline.sidecar&&(!sidecar||!sameFiles(sidecar.savedFiles,entry.baseline.sidecar.files)))continue;
        savedSourceRecovery.set(entry.documentId,{...entry,revision:saved.savedRevision});
      }
      return ok({ transactionId: planId, saved: plan.versions, remainingDirty: dirtyIds() });
    } catch (error) {
      if (closed) return closedResult();
      saveError = message(error);
      return fail('SAVE_FAILED', saveError);
    } finally {
      saving = false;
      if (!closed) emit();
    }
  }

  const api: CandidateDocuments = {
    list: async () => closed ? closedResult() : ok(list()),
    planEdit: async input => prepare(input),
    applyEdit: async (planId, expected) => commitPlan(planId, expected),
    planUndo: async (id, operationId, paths) => planHistory('undo', id, operationId, paths),
    undo: async planId => applyHistory('undo', planId),
    planRedo: async (id, paths) => planHistory('redo', id, undefined, paths),
    redo: async planId => applyHistory('redo', planId),
    planSave: async scope => planSave(scope),
    planDiscard: async scope => planDiscard(scope),
    applyDiscard: async planId => applyDiscard(planId),
    save,
  };

  return {
    bridge: { documents: api },
    list,
    graphDocuments: () => sourceRecovery.project(list()),
    sourceRecovery: (saved = false): CandidateSourceRecovery => saved ? structuredClone({version: 1, scenes: [...savedSourceRecovery.values()]}) : sourceRecovery.capture(list()),
    sourceRecoveryErrors: () => [...sourceRecovery.errors],
    sourceIsInvalid: (documentId: string) => { const document = documents.get(documentId); return !!document && sourceRecovery.isInvalid(document); },
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { if (!closed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    commit: (input: EditInput, group?: string): Result<EditReceipt> => {
      const plan = prepare(input);
      return plan.ok ? commitPlan(plan.value.planId, plan.value.input.expected, group) : plan;
    },
    endEditGroup: () => { editGroup = null; },
    historyGroupStatus: (groupId: Id, saved=false):'saved'|'adopted'|'unadopted'|undefined => {
      const group=operations.filter(item=>item.groupId===groupId);
      if(!group.length)return undefined;
      if(saved)return group.every(item=>item.members.every(id=>item.savedApplied.has(id)))?'saved':'unadopted';
      if(group.some(item=>!item.applied))return 'unadopted';
      return group.every(item=>item.members.every(id=>item.savedApplied.has(id)))?'saved':'adopted';
    },
    historyPlanNeedsReview:(planId:Id)=>new Set(historyPlans.get(planId)?.group.map(operation=>operation.groupId)??[]).size>1,
    history: (id: Id): CandidateHistoryStatus => {
      const undo = findUndo(id), redo = findRedo(id)?.[0];
      return { canUndo: !!undo, canRedo: !!redo, undoLabel: undo?.label ?? '', redoLabel: redo?.label ?? '' };
    },
    failNextSave: (error: string) => { nextSaveError = error; },
    dispose: () => {
      closed = true;
      listeners.clear();
      editPlans.clear();
      historyPlans.clear();
      savePlans.clear();
      discardPlans.clear();
    },
  };
}

export type CandidateHost = ReturnType<typeof createCandidateHost>;
