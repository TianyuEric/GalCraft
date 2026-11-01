import { createId, reserveIds } from '@galcraft/contracts';

import { cp, mkdir, readFile, readdir, writeFile, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import {
  EditInputSchema, IdSchema, RelativePathSchema, SaveScopeSchema, DiscardScopeSchema,
} from '@galcraft/contracts';
import type {
  EditInput, EditPlan, EditReceipt, Id, Issue, Json, Patch, Ref, Result,
  SavePlan, SaveReceipt, SaveScope, SaveObject, VersionRef, DiscardScope, DiscardPlan,
} from '@galcraft/contracts';
import { commitFiles, recoverTransactions, renameWithSharingRetry } from './file-transaction.js';
import type { FileChange } from './file-transaction.js';
import { dirtySaveObjects, patchSaveObjects, savedProjection, saveObjectKey, sourceSaveObject } from './logical-save.js';

type Format = 'dsl' | 'json';
export type WorkingDocument = { documentId: Id; revision: number; savedRevision: number; format: Format;
  files: Record<string, string>; savedFiles: Record<string, string>; dirty: boolean };
export type NewDocument = { documentId: Id; revision: number; format: Format; files: Record<string, string> };
/** Remove personal external prepare reviews while preserving committed operations and receipts. */
export async function deleteExternalEditReviews(root:string,sessionIds:string[]):Promise<Id[]> {
  sessionIds.forEach(id=>IdSchema.parse(id));
  const directory=join(root,'.galcraft','external-plans'),ids:Id[]=[];
  const entries=await readdir(directory).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  for(const name of entries)if(name.endsWith('.json')&&sessionIds.some(id=>name.startsWith(`${id}-`))){
    const path=join(directory,name),plan=JSON.parse(await readFile(path,'utf8')) as EditPlan;ids.push(plan.planId);await rm(path,{force:true});
  }
  return ids;
}
type DocumentState = WorkingDocument;
type Operation = { id: Id; groupId: Id; sequence: number; label: string; members: Id[];
  patches: Patch[]; inverse: Patch[]; state: 'applied' | 'undone'; after?: VersionRef[]; requiredRefs?: Ref[];
  savedStates?: Record<string, 'applied' | 'undone'> };
export type UndoPlan = { planId: Id; requestedOperationId: Id; reverseOrder: Id[]; members: Id[];
  expected: VersionRef[]; label: string; operations?: { operationId: Id; label: string; members: Id[] }[] };
type SaveCapture = { plan: SavePlan; documents: Map<Id, DocumentState>;
  operations: { operation: Operation; state: Operation['state']; objects: string[] }[];
  recoveredGroups: { group: Draft['groups'][number]; remaining: string[] }[] };
export type Conflict = { path: string; base: string | null; local: string | null; disk: string | null };
type DraftDocument = { documentId: Id; raw: string; format: Format; files: Record<string, string>;
  baseFiles: Record<string, string>; baseRevision: number; workingRevision: number };
type ExternalEdit = { input: EditInput; result: Result<EditReceipt> };
type Draft = { trackedEdits?: Record<string,EditReceipt>; externalCalls?: Record<string,ExternalEdit>; schemaVersion: 1; projectId: Id; savedAt: string; documents: DraftDocument[];
  groups: { id: Id; members: Id[]; objects?: string[] }[] };
/** Owners identify the actual referencing field; DSL source uses #source and whole documents use *. */
export type DocumentReference = { documentId: Id; path: string; ref: Ref };
export type ReferenceResolver = (ref: Ref, documents: ReadonlyMap<Id, WorkingDocument>, source?: DocumentReference) => boolean;
export type SessionOptions = { resolveRequiredRef?: ReferenceResolver;
  requiredReferences?: (documents: ReadonlyMap<Id, WorkingDocument>) => DocumentReference[] };

const clone = <T>(value: T): T => structuredClone(value);
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const ref = (id: Id, revision: number): VersionRef => ({ ref: { kind: 'document', id }, revision });
const issue = (code: string, message: string, actions: Issue['actions'] = ['retry']): Issue =>
  ({ code, message, severity: 'error', owner: 'M02', related: [], actions });
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const fail = <T>(code: string, message: string, actions?: Issue['actions']): Result<T> => {
  const error = issue(code, message, actions);
  return { ok: false, error, issues: [error] };
};
async function readOptional(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
async function copyProjectDirectory(root: string, target: string,
  overlays: { files: Record<string, string>; savedFiles: Record<string, string> }[]): Promise<void> {
  if (resolve(target) === resolve(root) || resolve(target).startsWith(resolve(root) + sep))
    throw new Error('Copy directory must be outside the project');
  if (await stat(target).then(() => true, () => false)) throw new Error('Copy directory already exists');
  const temporary = `${target}.galcraft-create-${createId()}`;
  try {
    await cp(root, temporary, { recursive: true });
    await rm(join(temporary, '.galcraft', 'recovery'), { recursive: true, force: true });
    await rm(join(temporary, '.galcraft', 'transactions'), { recursive: true, force: true });
    for (const overlay of overlays) {
      for (const path of new Set([...Object.keys(overlay.files), ...Object.keys(overlay.savedFiles)])) {
        RelativePathSchema.parse(path);
        const destination = join(temporary, ...path.split('/'));
        const content = overlay.files[path];
        if (content === undefined) await rm(destination, { force: true });
        else { await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, content, 'utf8'); }
      }
    }
    await renameWithSharingRetry(temporary, target);
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}
function comparable(files: Record<string, string>): Record<string, string> {
  const result = clone(files);
  for (const [path, raw] of Object.entries(result)) {
    if (!path.endsWith('.json')) continue;
    try {
      const value = JSON.parse(raw);
      if (value?.schemaVersion === 1 && value?.documentId) {
        delete value.revision;
        result[path] = JSON.stringify(value);
      }
    } catch { /* Raw source may intentionally be invalid. */ }
  }
  return result;
}
function dirty(document: DocumentState): boolean { return !equal(comparable(document.files), comparable(document.savedFiles)); }
function pointer(root: Json, path: string): { parent: Record<string, Json> | Json[]; key: string } {
  if (!path.startsWith('/') || path === '/') throw new Error('Expected a non-root JSON Pointer');
  const parts = path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent: Json = root;
  for (const part of parts.slice(0, -1)) {
    if (!parent || typeof parent !== 'object') throw new Error(`Missing JSON Pointer ${path}`);
    parent = (parent as Record<string, Json>)[part] ?? null;
  }
  if (!parent || typeof parent !== 'object') throw new Error(`Missing JSON Pointer ${path}`);
  return { parent, key: parts.at(-1)! };
}
function documentPath(document: DocumentState, kind: Format): string {
  const path = Object.keys(document.files).find(file => file.endsWith(kind === 'dsl' ? '.gal' : '.json'));
  if (!path) throw new Error(`Document ${document.documentId} has no ${kind} file`);
  return path;
}
function documentImage(value: Json | null, documentId: Id): { format: Format; files: Record<string, string> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Document image is required');
  const image = value as Record<string, Json>;
  if (image.format !== 'json' && image.format !== 'dsl') throw new Error('Invalid document format');
  if (!image.files || typeof image.files !== 'object' || Array.isArray(image.files)) throw new Error('Document files are required');
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(image.files)) {
    RelativePathSchema.parse(path);
    if (path.startsWith('.galcraft/')) throw new Error('Internal paths cannot be document members');
    if (typeof content !== 'string') throw new Error('Document file content must be text');
    files[path] = content;
  }
  const jsonPaths = Object.keys(files).filter(path => path.endsWith('.json'));
  if (jsonPaths.length !== 1) throw new Error('A document requires one JSON envelope');
  const envelope = JSON.parse(files[jsonPaths[0]!]!);
  if (envelope.schemaVersion !== 1 || envelope.documentId !== documentId) throw new Error('Document envelope identity mismatch');
  if (image.format === 'dsl' && !Object.keys(files).some(path => path.endsWith('.gal'))) throw new Error('DSL document requires source');
  return { format: image.format, files };
}
function applyPatch(documents: Map<Id, DocumentState>, patch: Patch): void {
  let document = documents.get(patch.documentId);
  if (!document && patch.kind === 'document' && patch.op === 'create') {
    const image = documentImage(patch.after, patch.documentId);
    for (const path of Object.keys(image.files)) {
      if ([...documents.values()].some(existing => existing.files[path] !== undefined || existing.savedFiles[path] !== undefined))
        throw new Error(`Document path already belongs to another document: ${path}`);
    }
    document = { documentId: patch.documentId, revision: 0, savedRevision: 0, format: image.format,
      files: {}, savedFiles: {}, dirty: false };
    documents.set(patch.documentId, document);
  }
  if (!document) throw new Error(`Unknown document ${patch.documentId}`);
  if (patch.kind === 'file') {
    RelativePathSchema.parse(patch.path);
    if (!patch.path.startsWith('ui/styles/') || !/\.(css|scss)$/.test(patch.path)) throw new Error('File patches require a UI stylesheet');
    if ((document.files[patch.path] ?? null) !== patch.before) throw new Error('File baseline mismatch');
    if ([...documents.values()].some(other => other !== document && (patch.path in other.files || patch.path in other.savedFiles)))
      throw new Error('Stylesheet belongs to another document');
    if (patch.after === null) delete document.files[patch.path]; else document.files[patch.path] = patch.after;
  } else if (patch.kind === 'text') {
    const path = documentPath(document, 'dsl');
    let raw = document.files[path]!;
    for (const edit of [...patch.edits].sort((a, b) => b.start - a.start)) {
      if (edit.end < edit.start || raw.slice(edit.start, edit.end) !== edit.before) throw new Error('Text baseline mismatch');
      raw = raw.slice(0, edit.start) + edit.after + raw.slice(edit.end);
    }
    document.files[path] = raw;
  } else if (patch.kind === 'json') {
    const path = documentPath(document, 'json');
    const object: Json = JSON.parse(document.files[path]!);
    for (const change of patch.changes) {
      const { parent, key } = pointer(object, change.path);
      if (Array.isArray(parent)) throw new Error('Array elements must be patched through the complete parent array');
      const actual = Object.hasOwn(parent, key) ? parent[key] : null;
      if (!equal(actual, change.before)) throw new Error(`JSON baseline mismatch at ${change.path}`);
      if (change.op === 'remove') delete parent[key];
      else parent[key] = clone(change.after);
    }
    document.files[path] = JSON.stringify(object, null, 2) + '\n';
  } else {
    if (patch.op === 'delete') {
      const before = documentImage(patch.before, patch.documentId);
      if (document.format !== before.format || !equal(comparable(document.files), comparable(before.files)))
        throw new Error('Document baseline mismatch');
      document.files = {};
    } else {
      const after = documentImage(patch.after, patch.documentId);
      if (Object.keys(document.files).length || patch.before !== null) throw new Error('Document already exists');
      for (const path of Object.keys(after.files)) {
        if ([...documents.values()].some(existing => existing !== document &&
          (existing.files[path] !== undefined || existing.savedFiles[path] !== undefined)))
          throw new Error(`Document path already belongs to another document: ${path}`);
      }
      document.format = after.format;
      document.files = clone(after.files);
    }
  }
  document.revision++;
  for (const [path, raw] of Object.entries(document.files)) {
    if (!path.endsWith('.json')) continue;
    try {
      const value = JSON.parse(raw);
      if (value?.schemaVersion === 1 && value?.documentId === document.documentId) {
        value.revision = document.revision;
        document.files[path] = JSON.stringify(value, null, 2) + '\n';
      }
    } catch { /* Invalid source stays available as raw text. */ }
  }
  document.dirty = dirty(document);
}
function inverse(patch: Patch, documents: Map<Id, DocumentState>): Patch {
  if (patch.kind === 'file') return { ...patch, before: patch.after, after: patch.before };
  if (patch.kind === 'text') {
    let shift = 0;
    const edits = [...patch.edits].sort((a, b) => a.start - b.start).map(edit => {
      const start = edit.start + shift;
      shift += edit.after.length - edit.before.length;
      return { start, end: start + edit.after.length, before: edit.after, after: edit.before };
    });
    // Adjacent removals become insertions at the same offset. Restore the later
    // range first so repeated insertion at that offset preserves source order.
    return { ...patch, edits: edits.reverse() };
  }
  if (patch.kind === 'json') {
    const document = documents.get(patch.documentId)!;
    const raw = document.files[documentPath(document, 'json')]!;
    const object: Json = JSON.parse(raw);
    const changes = patch.changes.map(change => {
      const { parent, key } = pointer(object, change.path);
      const existed = Object.hasOwn(parent, key);
      if (!Array.isArray(parent)) {
        if (change.op === 'remove') delete parent[key]; else parent[key] = clone(change.after);
      }
      return { path: change.path, before: change.op === 'remove' ? null : change.after, after: change.before,
        op: (existed ? 'set' : 'remove') as 'set' | 'remove' };
    });
    return { ...patch, changes: changes.reverse() };
  }
  return { ...patch, op: patch.op === 'create' ? 'delete' : 'create', before: patch.after, after: patch.before };
}
function versions(documents: Map<Id, DocumentState>, ids: Iterable<Id>): VersionRef[] {
  return [...ids].map(id => ref(id, documents.get(id)!.revision));
}
function sameVersions(documents: Map<Id, DocumentState>, expected: VersionRef[]): boolean {
  return expected.every(value => documents.get(value.ref.id)?.revision === value.revision);
}
function sameVector(left: VersionRef[], right: VersionRef[]): boolean {
  const entries = (values: VersionRef[]) => values.map(value =>
    `${value.ref.kind}:${value.ref.id}:${value.revision}`).sort();
  return equal(entries(left), entries(right));
}

const plain = (value: unknown): value is Record<string, Json> => !!value && typeof value === 'object' && !Array.isArray(value);
function jsonChanges(before: Json | undefined, after: Json | undefined, path: string): Extract<Patch, { kind: 'json' }>['changes'] {
  if (equal(before, after)) return [];
  if (plain(before) && plain(after)) return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key =>
    jsonChanges(before[key], after[key], `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  return [{ path, before: before ?? null, after: after ?? null, op: after === undefined ? 'remove' : 'set' }];
}
function granular(patches: Patch[]): Patch[] {
  return patches.map(patch => patch.kind === 'json' ? { ...patch, changes: patch.changes.flatMap(change => change.op === 'set' ? jsonChanges(change.before, change.after, change.path) : [change]) } : patch);
}
type FieldScope = { documentId: Id; path: string };
const overlaps = (a: string, b: string) => a === '*' || b === '*' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const scopes = (patches: Patch[]): FieldScope[] => patches.flatMap(patch => patch.kind === 'json' ? patch.changes.map(change => ({ documentId: patch.documentId, path: change.path })) : [{ documentId: patch.documentId, path: patch.kind === 'document' ? '*' : patch.kind === 'text' ? '#source' : `@${patch.path}` }]);
const intersects = (left: FieldScope[], right: FieldScope[]) => left.some(a => right.some(b => a.documentId === b.documentId && overlaps(a.path, b.path)));
function resetPatches(document: WorkingDocument): Patch[] {
  if (!document.dirty) return [];
  const { documentId, format, files, savedFiles } = document;
  const image = (value: Record<string, string>): Json => ({ format, files: value });
  if (!Object.keys(savedFiles).length) return [{ kind: 'document', documentId, op: 'delete', before: image(files), after: null }];
  if (!Object.keys(files).length) return [{ kind: 'document', documentId, op: 'create', before: null, after: image(savedFiles) }];
  const patches: Patch[] = [];
  for (const path of new Set([...Object.keys(files), ...Object.keys(savedFiles)])) {
    const before = files[path], after = savedFiles[path];
    if (before === after) continue;
    if (path.endsWith('.json') && before && after) {
      const changes = jsonChanges(JSON.parse(before), JSON.parse(after), '').filter(change => change.path !== '/revision');
      if (changes.length) patches.push({ kind: 'json', documentId, changes });
    } else if (path.endsWith('.gal') && before !== undefined && after !== undefined) patches.push({ kind: 'text', documentId, edits: [{ start: 0, end: before.length, before, after }] });
    else patches.push({ kind: 'file', documentId, path, before: before ?? null, after: after ?? null });
  }
  return patches;
}

export class ProjectSession {
  readonly root: string;
  readonly projectId: Id;
  readonly documents = new Map<Id, DocumentState>();
  readonly operations: Operation[] = [];
  readonly editPlans = new Map<Id, EditPlan>();
  readonly undoPlans = new Map<Id, UndoPlan>();
  readonly savePlans = new Map<Id, SavePlan>();
  private readonly saveExpected = new Map<Id, VersionRef[]>();
  private externalCalls: Record<string,ExternalEdit> = {};
  private trackedEdits: Record<string,EditReceipt> = {};
  readonly discardPlans = new Map<Id, { plan: DiscardPlan; edit: EditInput; references: DocumentReference[] }>();
  readonly conflicts = new Map<Id, Conflict[]>();
  readonly recoveredGroups: { id: Id; members: Id[]; objects?: string[] }[] = [];
  readonly resolveRequiredRef?: ReferenceResolver;
  readonly requiredReferences?: SessionOptions['requiredReferences'];
  recoveryConflicts: Conflict[] = [];
  #sequence = 0;
  #saving = false;
  #saveFinished: Promise<void> = Promise.resolve();
  #readersFinished: Promise<void> = Promise.resolve();
  #finishReaders: (() => void) | null = null;
  #readers = 0;
  #directoryChanging = false;
  #disposed = false;
  #pendingRecovery = false;
  #draftTimer: NodeJS.Timeout | null = null;
  #draftSince = 0;
  #draftWrite: Promise<void> = Promise.resolve();
  draftError: string | null = null;

  constructor(root: string, projectId: Id, options: SessionOptions = {}) {
    this.root = root;
    this.projectId = IdSchema.parse(projectId);
    this.resolveRequiredRef = options.resolveRequiredRef;
    this.requiredReferences = options.requiredReferences;
  }

  static async open(root: string, projectId: Id, options: SessionOptions = {}): Promise<ProjectSession> {
    if (await recoverTransactions(root) !== 'ready') throw new Error('Project recovery is pending');
    const session = new ProjectSession(root, projectId, options);
    async function scan(directory: string, prefix = ''): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === '.galcraft') continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await scan(join(directory, entry.name), relative);
        else if (entry.name.endsWith('.json')) {
          const raw = await readFile(join(directory, entry.name), 'utf8');
          let value: { schemaVersion?: number; documentId?: string; revision?: number };
          try { value = JSON.parse(raw); } catch { continue; }
          if (value.schemaVersion !== 1 || !IdSchema.safeParse(value.documentId).success || !Number.isSafeInteger(value.revision)) continue;
          const id = value.documentId as Id;
          const files: Record<string, string> = { [relative]: raw };
          if (entry.name === 'scene.json') {
            const scriptPath = `${prefix}/script.gal`;
            const script = await readOptional(join(root, ...scriptPath.split('/')));
            if (script !== null) files[scriptPath] = script;
          }
          session.registerDocument({ documentId: id, revision: value.revision!, format: entry.name === 'scene.json' ? 'dsl' : 'json', files });
        }
      }
    }
    await scan(root);
    const externalJournal=await readOptional(join(root,'.galcraft/external-results.json'));
    if(externalJournal)session.externalCalls=JSON.parse(externalJournal);
    const templateDocument = [...session.documents.values()].find(document => 'ui/template.json' in document.files);
    if (templateDocument) {
      const template = JSON.parse(templateDocument.files['ui/template.json']!).data?.template;
      for (const style of template?.styles ?? []) for (const path of [style.sourcePath, style.compiledPath]) {
        if (!path) continue;
        RelativePathSchema.parse(path);
        const content = await readOptional(join(root, path));
        if (content !== null) { templateDocument.files[path] = content; templateDocument.savedFiles[path] = content; }
      }
      const loadStyles = async (directory: string, prefix: string): Promise<void> => {
        for (const entry of await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; })) {
          const path = `${prefix}/${entry.name}`;
          if (entry.isDirectory()) await loadStyles(join(directory, entry.name), path);
          else if (/\.(css|scss|map)$/.test(entry.name)) { const content = await readFile(join(directory, entry.name), 'utf8'); templateDocument.files[path] = content; templateDocument.savedFiles[path] = content; }
        }
      };
      await loadStyles(join(root, 'ui/styles'), 'ui/styles');
    }
    session.#pendingRecovery = (await session.loadDraft()) !== null;
    return session;
  }

  registerDocument(input: NewDocument): void {
    if (this.#directoryChanging || this.#disposed) throw new Error('作品会话不可添加文档');
    IdSchema.parse(input.documentId);
    if (this.documents.has(input.documentId)) throw new Error('Duplicate document ID');
    for (const path of Object.keys(input.files)) RelativePathSchema.parse(path);
    reserveIds(input);
    const files = clone(input.files);
    this.documents.set(input.documentId, { ...input, files, savedFiles: clone(files), savedRevision: input.revision, dirty: false });
  }

  static async createProject(root: string, projectId: Id, inputs: NewDocument[], options: SessionOptions = {}): Promise<ProjectSession> {
    const exists = await stat(root).then(() => true, error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    });
    if (exists) throw new Error('Project directory already exists');
    await mkdir(dirname(root), { recursive: true });
    const temporary = join(dirname(root), `.${basename(root)}.galcraft-create-${createId(inputs)}`);
    await mkdir(temporary);
    const session = new ProjectSession(root, projectId, options);
    const changes: FileChange[] = [];
    try {
      for (const input of inputs) {
        session.registerDocument(input);
        for (const [path, content] of Object.entries(input.files)) changes.push({ path, content, documentId: input.documentId, revision: input.revision });
      }
      await commitFiles(temporary, projectId, changes);
      await renameWithSharingRetry(temporary, root);
      return session;
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  readDocument(documentId: Id, version: 'working' | 'saved' = 'working'): WorkingDocument | null {
    const document = this.documents.get(documentId);
    if (!document) return null;
    const copy = clone(document);
    if (version === 'saved') { copy.files = clone(document.savedFiles); copy.revision = document.savedRevision; copy.dirty = false; }
    return copy;
  }

  readRaw(documentId: Id, version: 'working' | 'saved' = 'working'): { raw: string; revision: number } | null {
    const document = this.readDocument(documentId, version);
    if (!document || document.format !== 'dsl' || !Object.keys(document.files).some(path => path.endsWith('.gal'))) return null;
    const path = documentPath(document, 'dsl');
    return { raw: document.files[path]!, revision: document.revision };
  }

  dirtyIds(): Id[] { return [...this.documents.values()].filter(doc => doc.dirty).map(doc => doc.documentId); }

  private operationSaveObjects(operation: Operation, objects: SaveObject[]): string[] {
    // Saving one asset consumes its group contribution without advancing another
    // asset in the same physical index. Undo can make that contribution pending again.
    const active = objects.filter(object => operation.savedStates?.[object.key] !== operation.state);
    return patchSaveObjects(operation.state === 'undone' ? operation.inverse : operation.patches, active, this.documents);
  }

  planEdit(input: EditInput): Result<EditPlan> {
    if (this.#directoryChanging) return fail('DIRECTORY_BUSY', '作品目录正在提交');
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    if (this.#pendingRecovery) return fail('RECOVERY_UNRESOLVED', 'A recovery draft still needs a choice', ['compare']);
    const parsed = EditInputSchema.safeParse(input);
    if (!parsed.success) return fail('INVALID_EDIT', parsed.error.message, ['edit']);
    input = { ...parsed.data, patches: granular(parsed.data.patches) };
    const members = [...new Set(input.patches.map(patch => patch.documentId))];
    if (!members.length || members.some(id => !this.documents.has(id) &&
      !input.patches.some(patch => patch.kind === 'document' && patch.documentId === id && patch.op === 'create')))
      return fail('UNKNOWN_DOCUMENT', 'Edit member is missing', ['edit']);
    if (!sameVersions(this.documents, input.expected) || members.some(id => this.documents.has(id) && !input.expected.some(value => value.ref.id === id)))
      return fail('EDIT_CONFLICT', 'Working revision changed', ['compare']);
    const copy = clone(this.documents);
    try { for (const patch of input.patches) applyPatch(copy, patch); }
    catch (error) { return fail('PATCH_CONFLICT', String(error), ['compare']); }
    const plan: EditPlan = { planId: createId([this.documents, this.operations]), input: clone(input), members, issues: [],
      before: Object.fromEntries(members.map(id => [id, this.documents.get(id)?.revision ?? 0])), preview: [] };
    this.editPlans.set(plan.planId, clone(plan));
    return ok(plan);
  }

  async lookupExternalCall(context: import('@galcraft/contracts').CollaborationContext): Promise<Result<EditReceipt> | undefined> {
    const key=`${context.sessionId}/${context.callId}`;
    if(this.externalCalls[key])return clone(this.externalCalls[key]!.result);
    const journal=await readOptional(join(this.root,'.galcraft','external-results.json'));
    const draft=await this.loadDraft();
    this.externalCalls={...(journal?JSON.parse(journal):{}),...draft?.externalCalls,...this.externalCalls};
    return this.externalCalls[key]?clone(this.externalCalls[key]!.result):undefined;
  }
  async externalCallInput(context: import('@galcraft/contracts').CollaborationContext): Promise<EditInput | undefined> {
    await this.lookupExternalCall(context);
    return clone(this.externalCalls[`${context.sessionId}/${context.callId}`]?.input);
  }
  readEditPreview(planId:Id):Result<WorkingDocument[]> {
    const plan=this.editPlans.get(planId);if(!plan)return fail('EDIT_PLAN_MISSING','修改计划已失效');
    if(!sameVersions(this.documents,plan.input.expected))return fail('EDIT_CONFLICT','工作版本已变化',['compare']);
    const copy=clone(this.documents);try{for(const patch of plan.input.patches)applyPatch(copy,patch);}catch(error){return fail('PATCH_CONFLICT',String(error),['compare']);}
    return ok(plan.members.flatMap(id=>copy.has(id)?[clone(copy.get(id)!)]:[]));
  }
  async lookupTrackedEdit(planId:Id):Promise<EditReceipt|undefined> {
    if(this.trackedEdits[planId])return clone(this.trackedEdits[planId]);
    const journal=await readOptional(join(this.root,'.galcraft','tracked-edit-results.json'));
    const draft=await this.loadDraft();
    this.trackedEdits={...(journal?JSON.parse(journal):{}),...draft?.trackedEdits,...this.trackedEdits};
    return this.trackedEdits[planId]?clone(this.trackedEdits[planId]):undefined;
  }
  /** Adopted media must retain the original receipt even if its owner fails after the edit. */
  async applyTrackedEdit(planId:Id,expected:VersionRef[]):Promise<Result<EditReceipt>> {
    const previous=await this.lookupTrackedEdit(planId);if(previous)return ok(previous);
    const result=this.applyEdit(planId,expected);if(!result.ok)return result;
    this.trackedEdits[planId]=clone(result.value);
    await this.writeDraft();
    const path=join(this.root,'.galcraft','tracked-edit-results.json');await mkdir(dirname(path),{recursive:true});await writeFile(`${path}.tmp`,JSON.stringify(this.trackedEdits));await renameWithSharingRetry(`${path}.tmp`,path);
    return result;
  }
  externalDocuments(sessionId:string):Id[]{return [...new Set(Object.entries(this.externalCalls).filter(([key,value])=>key.startsWith(`${sessionId}/`)&&value.result.ok).flatMap(([,value])=>value.input.patches.filter(patch=>patch.kind==='document'&&patch.op==='create').map(patch=>patch.documentId)))];}
  async prepareExternalEdit(input:EditInput, context:import('@galcraft/contracts').CollaborationContext):Promise<Result<EditPlan>> {
    if(context.projectId!==this.projectId)return fail('PROJECT_STALE','协作目标作品不一致');
    const path=join(this.root,'.galcraft','external-plans',`${context.sessionId}-${context.callId}.json`);
    const raw=await readOptional(path);
    if(raw){const saved=JSON.parse(raw) as EditPlan;if(!equal(saved.input,input))return fail('CALL_CONFLICT','同一调用已经准备了不同修改');this.editPlans.set(saved.planId,saved);return ok(saved);}
    const planned=this.planEdit(input);if(!planned.ok)return planned;
    await mkdir(dirname(path),{recursive:true});await writeFile(`${path}.tmp`,JSON.stringify(planned.value));await renameWithSharingRetry(`${path}.tmp`,path);return planned;
  }
  async applyExternalEdit(planId:Id,expected:VersionRef[],context:import('@galcraft/contracts').CollaborationContext):Promise<Result<EditReceipt>> {
    const previous=await this.lookupExternalCall(context);if(previous)return previous;
    const plan=this.editPlans.get(planId);if(!plan)return fail('EDIT_PLAN_MISSING','外部修改计划已失效，请重新准备');
    const result=this.applyEdit(planId,expected);if(!result.ok)return result;
    this.externalCalls[`${context.sessionId}/${context.callId}`]={input:clone(plan.input),result:clone(result)};
    // The working documents and the receipt enter the same atomic recovery image.
    await this.writeDraft();
    const path=join(this.root,'.galcraft','external-results.json');await mkdir(dirname(path),{recursive:true});await writeFile(`${path}.tmp`,JSON.stringify(this.externalCalls));await renameWithSharingRetry(`${path}.tmp`,path);
    return result;
  }
  async applyExternalHistory(action:'undo'|'redo',planId:Id,expected:VersionRef[],context:import('@galcraft/contracts').CollaborationContext):Promise<Result<EditReceipt>> {
    if(context.projectId!==this.projectId)return fail('PROJECT_STALE','The collaboration targets another project.');
    const previous=await this.lookupExternalCall(context);if(previous)return previous;
    const plan=this.undoPlans.get(planId);
    if(!plan||!sameVector(expected,plan.expected))return fail('UNDO_CONFLICT','The reviewed undo plan is stale. Prepare and review it again.',['compare']);
    const input:EditInput={label:plan.label,origin:'field',expected:clone(expected),patches:[],preparedAssets:[],requiredRefs:[]};
    const result=this[action](planId);if(!result.ok)return result;
    this.externalCalls[`${context.sessionId}/${context.callId}`]={input,result:clone(result)};
    await this.writeDraft();
    const path=join(this.root,'.galcraft','external-results.json');await mkdir(dirname(path),{recursive:true});await writeFile(`${path}.tmp`,JSON.stringify(this.externalCalls));await renameWithSharingRetry(`${path}.tmp`,path);
    return result;
  }
  applyEdit(planId: Id, expected: VersionRef[]): Result<EditReceipt> {
    if (this.#directoryChanging) return fail('DIRECTORY_BUSY', '作品目录正在提交');
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    const plan = this.editPlans.get(planId);
    if (!plan) return fail('EDIT_PLAN_MISSING', 'Edit plan is unavailable');
    if (!sameVector(expected, plan.input.expected) || !sameVersions(this.documents, plan.input.expected) ||
      plan.members.some(id => this.documents.has(id)
      ? !expected.some(value => value.ref.id === id && value.revision === plan.before[id])
      : expected.some(value => value.ref.id === id))) return fail('EDIT_CONFLICT', 'Working revision changed', ['compare']);
    const copy = clone(this.documents);
    const inverses: Patch[] = [];
    try { for (const patch of plan.input.patches) { inverses.unshift(inverse(patch, copy)); applyPatch(copy, patch); } }
    catch (error) { return fail('PATCH_CONFLICT', String(error), ['compare']); }
    for (const required of plan.input.requiredRefs) {
      if (required.kind === 'project' && required.id === this.projectId) continue;
      if (required.kind === 'document' && Object.keys(copy.get(required.id)?.files ?? {}).length) continue;
      if (!this.resolveRequiredRef) return fail('REF_RESOLVER_UNAVAILABLE', 'Required reference resolver is unavailable', ['retry']);
      try {
        if (this.resolveRequiredRef(required, copy)) continue;
      } catch (error) { return fail('REF_CHECK_FAILED', String(error), ['retry']); }
      return fail('REQUIRED_REF_MISSING', `Required ${required.kind} ${required.id} is unavailable`, ['locate']);
    }
    this.documents.clear();
    for (const [id, document] of copy) this.documents.set(id, document);
    const operation: Operation = { id: createId([this.documents, this.operations]), groupId: createId([this.documents, this.operations]), sequence: ++this.#sequence,
      label: plan.input.label, members: plan.members, patches: clone(plan.input.patches),
      inverse: inverses, state: 'applied', after: versions(this.documents, plan.members), requiredRefs: clone(plan.input.requiredRefs) };
    this.operations.push(operation);
    for (const [id, history] of this.undoPlans) if (history.reverseOrder.some(operationId => {
      const existing = this.operations.find(item => item.id === operationId);
      return existing?.state === 'undone' && intersects(scopes(existing.patches), scopes(plan.input.patches));
    })) this.undoPlans.delete(id);
    for (const history of this.undoPlans.values()) if (history.reverseOrder.every(id => this.operations.find(item => item.id === id)?.state === 'undone')) history.expected = versions(this.documents, history.members);
    this.editPlans.delete(planId);
    this.scheduleDraft();
    return ok({ groupId: operation.groupId, operationId: operation.id, documents: versions(this.documents, plan.members),
      dirty: this.dirtyIds(), assetIds: plan.input.preparedAssets });
  }

  planDiscard(scope: DiscardScope): Result<DiscardPlan> {
    if (this.#directoryChanging) return fail('DIRECTORY_BUSY', '作品目录正在提交');
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    if (this.#pendingRecovery) return fail('RECOVERY_UNRESOLVED', '请先处理恢复草稿', ['compare']);
    const checked = DiscardScopeSchema.safeParse(scope);
    if (!checked.success) return fail('INVALID_DISCARD_SCOPE', checked.error.message, ['edit']);
    if (!this.documents.has(scope.documentId)) return fail('UNKNOWN_DOCUMENT', '放弃范围的文档不存在');
    if (scope.objects || scope.objectId || !scope.paths?.length) return this.planDiscardObject(scope);
    const resets = [...this.documents.values()].flatMap(resetPatches), dirtyScopes = scopes(resets), objects = dirtySaveObjects(this.documents);
    const requested = (scope.paths?.length ? scope.paths : ['*']).map(path => ({ documentId: scope.documentId, path }));
    const selected = dirtyScopes.filter(item => intersects([item], requested));
    const add = (items: FieldScope[]) => { let changed = false; for (const item of items) if (!selected.some(value => value.documentId === item.documentId && value.path === item.path)) { selected.push(item); changed = true; } return changed; };
    const pending = this.operations.filter(operation => operation.state === 'applied' && operation.after?.some(value => value.revision > (this.documents.get(value.ref.id)?.savedRevision ?? 0)));
    const patches = (): Patch[] => resets.flatMap< Patch >(patch => patch.kind === 'json' ? [{ ...patch, changes: patch.changes.filter(change => intersects([{ documentId: patch.documentId, path: change.path }], selected)) }].filter(patch => patch.changes.length) : intersects(scopes([patch]), selected) ? [patch] : []);
    const available = (required: Ref, documents: ReadonlyMap<Id, WorkingDocument>, source?: DocumentReference): boolean =>
      required.kind === 'project' && required.id === this.projectId ||
      required.kind === 'document' && !!Object.keys(documents.get(required.id)?.files ?? {}).length ||
      !!this.resolveRequiredRef?.(required, documents, source);
    let changed = true, copy = clone(this.documents), references: DocumentReference[] = [];
    while (changed) {
      changed = false;
      for (const operation of pending) {
        const fields = scopes(operation.patches);
        if (intersects(fields, selected)) changed = add(dirtyScopes.filter(item => intersects([item], fields))) || changed;
      }
      for (const group of this.recoveredGroups) {
        const members = group.objects ? objects.filter(object => group.objects!.includes(object.key)).map(object => object.documentId) : group.members;
        if (selected.some(item => members.includes(item.documentId))) changed = add(dirtyScopes.filter(item => members.includes(item.documentId))) || changed;
      }
      copy = clone(this.documents);
      try { for (const patch of patches()) applyPatch(copy, patch); }
      catch (error) { return fail('DISCARD_CONFLICT', String(error), ['compare']); }
      for (const operation of pending) {
        if (intersects(scopes(operation.patches), selected)) continue;
        for (const required of operation.requiredRefs ?? []) {
          try { if (available(required, copy) || !available(required, this.documents)) continue; } catch (error) { return fail('REF_CHECK_FAILED', String(error)); }
          if (!add(dirtyScopes.filter(item => intersects([item], scopes(operation.patches))))) return fail('DISCARD_REF_CONFLICT', '放弃范围会影响保留内容的引用，请重新审阅关联修改', ['compare']);
          changed = true;
          break;
        }
        if (changed) break;
      }
      if (changed) continue;
      try {
        references = (this.requiredReferences?.(copy) ?? []).filter(reference =>
          intersects([reference], selected) || !available(reference.ref, copy, reference) && available(reference.ref, this.documents, reference));
        for (const reference of references) {
          if (available(reference.ref, copy, reference)) continue;
          let restored = false;
          for (const reset of resets) {
            const candidates = reset.kind === 'json' ? reset.changes.map(change => ({ ...reset, changes: [change] })) : [reset];
            for (const candidate of candidates) {
              if (intersects(scopes([candidate]), selected)) continue;
              const trial = clone(copy);
              applyPatch(trial, candidate);
              if (available(reference.ref, trial, reference)) { changed = add(scopes([candidate])) || changed; restored = true; break; }
            }
            if (restored) break;
          }
          if (!restored && !add(dirtyScopes.filter(item => intersects([item], [reference]))))
            return fail('DISCARD_REF_CONFLICT', `放弃范围无法恢复 ${reference.ref.kind} ${reference.ref.id} 的引用`, ['compare']);
          changed = true;
          break;
        }
      } catch (error) { return fail('REF_CHECK_FAILED', String(error), ['retry']); }
    }
    const edits = patches(), members = [...new Set(edits.map(patch => patch.documentId))], expected = versions(this.documents, this.documents.keys());
    const plan: DiscardPlan = { planId: createId([this.documents, this.operations]), scope: clone(scope), members, expected,
      expanded: members.map(documentId => ({ documentId, paths: selected.filter(item => item.documentId === documentId).map(item => item.path) })),
      preview: members.map(id => ({ ...clone(copy.get(id)!), savedFiles: clone(this.documents.get(id)!.files), savedRevision: this.documents.get(id)!.revision })) };
    this.discardPlans.set(plan.planId, { plan, references: clone(references), edit: { label: '放弃对象未保存修改', origin: 'batch', expected, patches: edits, preparedAssets: [], requiredRefs: references.map(reference => reference.ref) } });
    return ok(clone(plan));
  }

  private planDiscardObject(scope: DiscardScope): Result<DiscardPlan> {
    const all = dirtySaveObjects(this.documents), requested = all.filter(object => scope.objects
      ? scope.objects.some(ref => ref.documentId === object.documentId && ref.kind === object.kind && ref.objectId === object.objectId)
      : object.documentId === scope.documentId && (!scope.objectId || object.kind === 'asset' && object.objectId === scope.objectId));
    if (scope.objects && (!scope.expected || !sameVersions(this.documents, scope.expected) || requested.length !== scope.objects.length || requested.some(object => !scope.expected!.some(version => version.ref.id === object.documentId))))
      return fail('DISCARD_PLAN_STALE', '对象修改已变化，请刷新放弃范围', ['compare']);
    if (scope.objectId && !requested.length) return fail('DISCARD_PLAN_STALE', '对象修改已变化，请刷新放弃范围', ['compare']);
    const selected = new Set(requested.map(object => object.key));
    const reasons: NonNullable<DiscardPlan['reasons']> = [];
    const objects = () => all.filter(object => selected.has(object.key));
    const reversed = new Map([...this.documents].map(([id, document]) => [id, { ...clone(document), files: clone(document.savedFiles), savedFiles: clone(document.files) }]));
    const project = (extra: SaveObject[] = []) => savedProjection(reversed, [...objects(), ...extra]);
    const available = (required: Ref, documents: ReadonlyMap<Id, WorkingDocument>, source?: DocumentReference): boolean =>
      required.kind === 'project' && required.id === this.projectId || required.kind === 'document' && !!Object.keys(documents.get(required.id)?.files ?? {}).length || !!this.resolveRequiredRef?.(required, documents, source);
    let projected = project(), changed = true;
    try {
      while (changed) {
        changed = false;
        for (const group of this.recoveredGroups) {
          const keys = all.filter(object => group.objects ? group.objects.includes(object.key) : group.members.includes(object.documentId)).map(object => object.key);
          const requiredBy = keys.find(key => selected.has(key));
          if (requiredBy) for (const key of keys) if (!selected.has(key)) { selected.add(key); reasons.push({ objectKey: key, requiredBy, kind: 'recovered-edit' }); changed = true; }
        }
        projected = project();
        for (const reference of this.requiredReferences?.(projected) ?? []) {
          const source = sourceSaveObject(reference.documentId, reference.path, projected, all);
          if (available(reference.ref, projected, reference) ||
            !(source && selected.has(source.key)) && !available(reference.ref, this.documents, reference)) continue;
          const dependency = all.filter(object => !selected.has(object.key)).find(candidate => {
            const trial = project([candidate]);
            return available(reference.ref, trial, reference) || !(this.requiredReferences?.(trial) ?? []).some(item => item.documentId === reference.documentId && item.path === reference.path && equal(item.ref, reference.ref));
          });
          if (!dependency) return fail('DISCARD_REF_CONFLICT', `放弃范围无法恢复 ${reference.ref.kind} ${reference.ref.id} 的引用`, ['compare']);
          selected.add(dependency.key); reasons.push({ objectKey: dependency.key, requiredBy: source?.key ?? requested[0]?.key ?? dependency.key, kind: 'reference', ref: reference.ref }); changed = true;
          break;
        }
      }
    } catch (error) { return fail('REF_CHECK_FAILED', String(error), ['retry']); }
    const members = [...new Set(objects().map(object => object.documentId))], expected = versions(this.documents, this.documents.keys());
    const patches = members.flatMap(id => resetPatches({ ...clone(this.documents.get(id)!), savedFiles: projected.get(id)!.files }));
    const references = this.requiredReferences?.(projected) ?? [];
    const plan: DiscardPlan = { planId: createId([this.documents, this.operations]), scope: clone(scope), members, expected,
      requestedObjects: requested.map(object => object.key), objects: clone(objects()), reasons,
      expanded: members.map(documentId => ({ documentId, paths: [...new Set(scopes(patches).filter(item => item.documentId === documentId).map(item => item.path))] })),
      preview: members.map(id => ({ ...clone(projected.get(id)!), savedFiles: clone(this.documents.get(id)!.files), savedRevision: this.documents.get(id)!.revision })) };
    this.discardPlans.set(plan.planId, { plan, references: references.filter(reference => available(reference.ref, projected, reference)),
      edit: { label: '放弃对象未保存修改', origin: 'batch', expected, patches, preparedAssets: [], requiredRefs: [] } });
    return ok(clone(plan));
  }

  applyDiscard(planId: Id): Result<EditReceipt> {
    const capture = this.discardPlans.get(planId);
    if (!capture || !sameVersions(this.documents, capture.plan.expected) || capture.plan.expected.length !== this.documents.size) return fail('DISCARD_PLAN_STALE', '工作内容已变化，请重新审阅放弃范围', ['compare']);
    if (!capture.edit.patches.length) { this.discardPlans.delete(planId); return ok({ groupId: planId, operationId: planId, documents: [], dirty: this.dirtyIds(), assetIds: [] }); }
    const copy = clone(this.documents);
    try {
      for (const patch of capture.edit.patches) applyPatch(copy, patch);
      for (const reference of capture.references) {
        const required = reference.ref;
        if (required.kind === 'project' && required.id === this.projectId || required.kind === 'document' && Object.keys(copy.get(required.id)?.files ?? {}).length || this.resolveRequiredRef?.(required, copy, reference)) continue;
        return fail('DISCARD_REF_CONFLICT', `放弃范围的 ${required.kind} ${required.id} 引用已失效`, ['compare']);
      }
    } catch (error) { return fail('REF_CHECK_FAILED', String(error), ['retry']); }
    const planned = this.planEdit(capture.edit);
    if (!planned.ok) return planned;
    const result = this.applyEdit(planned.value.planId, capture.edit.expected);
    if (result.ok) this.discardPlans.delete(planId);
    return result;
  }

  planUndo(documentId: Id, operationId?: Id, paths?: string[]): Result<UndoPlan> {
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    const target = operationId
      ? this.operations.find(operation => operation.id === operationId && operation.state === 'applied' && operation.members.includes(documentId))
      : [...this.operations].reverse().find(operation => operation.state === 'applied' && operation.members.includes(documentId) && (!paths || intersects(scopes(operation.patches), paths.map(path => ({ documentId, path })))));
    if (!target) return fail('NOTHING_TO_UNDO', 'No applied edit affects this document');
    const selected = new Set<Id>([target.id]);
    const members = new Set<Id>(target.members);
    let changed = true;
    while (changed) {
      changed = false;
      for (const operation of this.operations) {
        if (operation.state !== 'applied' || operation.sequence <= target.sequence || selected.has(operation.id)) continue;
        if (intersects(scopes(operation.patches), this.operations.filter(item => selected.has(item.id)).flatMap(item => scopes(item.patches)))) {
          selected.add(operation.id);
          operation.members.forEach(id => members.add(id));
          changed = true;
        }
      }
    }
    const reverseOrder = this.operations.filter(operation => selected.has(operation.id)).reverse().map(operation => operation.id);
    const plan: UndoPlan = { planId: createId([this.documents, this.operations]), requestedOperationId: target.id, reverseOrder,
      members: [...members], expected: versions(this.documents, members), label: target.label,
      operations: this.operations.filter(operation => selected.has(operation.id)).map(operation => ({ operationId: operation.id, label: operation.label, members: operation.members })) };
    this.undoPlans.set(plan.planId, plan);
    return ok(plan);
  }

  planRedo(documentId: Id, paths?: string[]): Result<UndoPlan> {
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    const requested = (paths ?? ['*']).map(path => ({ documentId, path }));
    const candidates = [...this.undoPlans.values()].filter(plan => sameVersions(this.documents, plan.expected) &&
      plan.reverseOrder.every(id => this.operations.find(operation => operation.id === id)?.state === 'undone') &&
      intersects(scopes(this.operations.find(operation => operation.id === plan.requestedOperationId)!.patches), requested));
    candidates.sort((a, b) => this.operations.find(operation => operation.id === a.requestedOperationId)!.sequence - this.operations.find(operation => operation.id === b.requestedOperationId)!.sequence);
    return candidates[0] ? ok(clone(candidates[0])) : fail('NOTHING_TO_REDO', 'No undone edit affects this scope');
  }

  undo(planId: Id): Result<EditReceipt> {
    if (this.#directoryChanging) return fail('DIRECTORY_BUSY', '作品目录正在提交');
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    const plan = this.undoPlans.get(planId);
    if (!plan || !sameVersions(this.documents, plan.expected) || plan.reverseOrder.some(id => this.operations.find(operation => operation.id === id)?.state !== 'applied')) return fail('UNDO_CONFLICT', 'Undo plan is stale', ['compare']);
    const resumable = [...this.undoPlans.values()].filter(saved => saved !== plan && sameVersions(this.documents, saved.expected) && saved.reverseOrder.every(id => this.operations.find(op => op.id === id)?.state === 'undone'));
    const copy = clone(this.documents);
    try {
      for (const id of plan.reverseOrder) for (const patch of this.operations.find(op => op.id === id)!.inverse) applyPatch(copy, patch);
    } catch (error) { return fail('UNDO_CONFLICT', String(error), ['compare']); }
    this.documents.clear(); for (const [id, document] of copy) this.documents.set(id, document);
    for (const id of plan.reverseOrder) this.operations.find(op => op.id === id)!.state = 'undone';
    plan.expected = versions(this.documents, plan.members);
    for (const saved of resumable) saved.expected = versions(this.documents, saved.members);
    this.scheduleDraft();
    return ok({ groupId: planId, operationId: plan.requestedOperationId, documents: plan.expected, dirty: this.dirtyIds(), assetIds: [] });
  }

  redo(planId: Id): Result<EditReceipt> {
    if (this.#directoryChanging) return fail('DIRECTORY_BUSY', '作品目录正在提交');
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    const plan = this.undoPlans.get(planId);
    if (!plan || !sameVersions(this.documents, plan.expected) || plan.reverseOrder.some(id =>
      this.operations.find(op => op.id === id)?.state !== 'undone')) return fail('REDO_CONFLICT', 'Redo branch is unavailable', ['compare']);
    const resumable = [...this.undoPlans.values()].filter(saved => saved !== plan && sameVersions(this.documents, saved.expected) && saved.reverseOrder.every(id => this.operations.find(op => op.id === id)?.state === 'undone'));
    const restoring = plan.reverseOrder.map(id => this.operations.find(op => op.id === id)!);
    if (resumable.some(saved => saved.reverseOrder.some(id => {
      if (plan.reverseOrder.includes(id)) return false;
      const predecessor = this.operations.find(op => op.id === id)!;
      return restoring.some(operation => predecessor.sequence < operation.sequence &&
        intersects(scopes(predecessor.patches), scopes(operation.patches)));
    }))) return fail('REDO_CONFLICT', 'Restore earlier related edits first', ['compare']);
    const copy = clone(this.documents);
    try {
      for (const id of [...plan.reverseOrder].reverse()) for (const patch of this.operations.find(op => op.id === id)!.patches) applyPatch(copy, patch);
    } catch (error) { return fail('REDO_CONFLICT', String(error), ['compare']); }
    this.documents.clear(); for (const [id, document] of copy) this.documents.set(id, document);
    for (const id of plan.reverseOrder) this.operations.find(op => op.id === id)!.state = 'applied';
    this.undoPlans.delete(planId);
    for (const saved of resumable) if (saved.reverseOrder.every(id => this.operations.find(op => op.id === id)?.state === 'undone')) saved.expected = versions(this.documents, saved.members);
    this.scheduleDraft();
    return ok({ groupId: planId, operationId: plan.requestedOperationId,
      documents: versions(this.documents, plan.members), dirty: this.dirtyIds(), assetIds: [] });
  }

  planSave(scope: SaveScope): Result<SavePlan> {
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    if (this.#pendingRecovery) return fail('RECOVERY_UNRESOLVED', 'A recovery draft still needs a choice', ['compare']);
    const parsed = SaveScopeSchema.safeParse(scope);
    if (!parsed.success) return fail('INVALID_SAVE_SCOPE', parsed.error.message);
    if (scope.kind === 'current' && !this.documents.has(scope.documentId)) return fail('UNKNOWN_DOCUMENT', 'Save member is missing');
    if (scope.kind === 'objects' && (!sameVersions(this.documents, scope.expected) || scope.objects.some(object =>
      !scope.expected.some(version => version.ref.kind === 'document' && version.ref.id === object.documentId))))
      return fail('SAVE_PLAN_STALE', '工作内容已变化，请刷新保存范围', ['compare']);
    let availableObjects: SaveObject[];
    try { availableObjects = dirtySaveObjects(this.documents); }
    catch (error) { return fail('SAVE_PLAN_INVALID', String(error), ['compare']); }
    const requested = scope.kind === 'objects' ? scope.objects.map(saveObjectKey)
      : availableObjects.filter(object => scope.kind === 'all' || object.documentId === scope.documentId).map(object => object.key);
    if (requested.some(key => !availableObjects.some(object => object.key === key))) return fail('SAVE_PLAN_STALE', '保存对象已变化，请刷新保存范围', ['compare']);
    const selected = new Set(requested), reasons: SavePlan['reasons'] = [];
    const add = (objectKey: string, requiredBy: string, kind: 'associated-edit' | 'reference', reference?: Ref) => {
      if (objectKey !== requiredBy && !reasons.some(reason => reason.objectKey === objectKey && reason.requiredBy === requiredBy && reason.kind === kind))
        reasons.push({ objectKey, requiredBy, kind, ...(reference ? { ref: reference } : {}) });
      const added = !selected.has(objectKey); selected.add(objectKey); return added;
    };
    const objects = () => [...selected].map(key => availableObjects.find(object => object.key === key)!);
    const available = (required: Ref, documents: ReadonlyMap<Id, WorkingDocument>, source?: DocumentReference): boolean =>
      required.kind === 'project' && required.id === this.projectId ||
      required.kind === 'document' && !!Object.keys(documents.get(required.id)?.files ?? {}).length ||
      !!this.resolveRequiredRef?.(required, documents, source);
    const baseline = savedProjection(this.documents, []);
    let projected = baseline, changed = true;
    try {
      while (changed) {
        changed = false;
        for (const operation of this.operations) {
          const keys = this.operationSaveObjects(operation, availableObjects), sources = keys.filter(key => selected.has(key));
          for (const source of sources) for (const key of keys) changed = add(key, source, 'associated-edit') || changed;
        }
        for (const group of this.recoveredGroups) {
          const keys = availableObjects.filter(object => group.objects ? group.objects.includes(object.key) : group.members.includes(object.documentId)).map(object => object.key);
          for (const source of keys.filter(key => selected.has(key))) for (const key of keys) changed = add(key, source, 'associated-edit') || changed;
        }
        projected = savedProjection(this.documents, objects());
        for (const reference of this.requiredReferences?.(projected) ?? []) {
          if (available(reference.ref, projected, reference)) continue;
          const source = sourceSaveObject(reference.documentId, reference.path, projected, availableObjects);
          const wasAvailable = available(reference.ref, baseline, reference), workingAvailable = available(reference.ref, this.documents, reference);
          if (!wasAvailable && !workingAvailable) continue;
          let dependency: SaveObject | undefined;
          for (const candidate of availableObjects.filter(object => !selected.has(object.key))) {
            const trial = savedProjection(this.documents, [...objects(), candidate]);
            const remains = (this.requiredReferences?.(trial) ?? []).some(item => item.documentId === reference.documentId && item.path === reference.path && equal(item.ref, reference.ref));
            if (available(reference.ref, trial, reference) || !remains) { dependency = candidate; break; }
          }
          if (!dependency) return fail('SAVE_REF_CONFLICT', `保存组合无法保留 ${reference.ref.kind} ${reference.ref.id} 的引用`, ['compare']);
          const requiredBy = source && selected.has(source.key) ? source.key : objects().find(object => !available(reference.ref, savedProjection(this.documents, [object]), reference))?.key ?? objects()[0]?.key;
          if (requiredBy) { changed = add(dependency.key, requiredBy, 'reference', reference.ref) || changed; break; }
        }
      }
    } catch (error) { return fail('REF_CHECK_FAILED', String(error), ['retry']); }
    const actualObjects = objects(), members = [...new Set(actualObjects.map(object => object.documentId))];
    const preview = members.map(id => ({ ...clone(projected.get(id)!), savedFiles: clone(this.documents.get(id)!.savedFiles), savedRevision: this.documents.get(id)!.savedRevision, dirty: true }));
    const plan: SavePlan = { planId: createId([this.documents, this.operations]), members, versions: versions(this.documents, members),
      files: preview.flatMap(document => [...new Set([...Object.keys(document.files), ...Object.keys(document.savedFiles)])].map(path => ({ path, documentId: document.documentId,
        oldExists: document.savedFiles[path] !== undefined, newExists: document.files[path] !== undefined }))),
      extraDirtyMembers: members.filter(id => scope.kind === 'current' && id !== scope.documentId),
      objects: actualObjects, requestedObjects: [...new Set(requested)], reasons, preview };
    this.savePlans.set(plan.planId, clone(plan));
    this.saveExpected.set(plan.planId, versions(this.documents, this.documents.keys()));
    return ok(clone(plan));
  }

  async save(planId: Id): Promise<Result<SaveReceipt>> {
    if (this.#directoryChanging) return fail('DIRECTORY_BUSY', '作品目录正在提交');
    if (this.#readers) await this.#readersFinished;
    if (this.#directoryChanging) return fail('DIRECTORY_BUSY', '作品目录正在提交');
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    if (this.#pendingRecovery) return fail('RECOVERY_UNRESOLVED', 'A recovery draft still needs a choice', ['compare']);
    if (this.#saving) return fail('SAVE_BUSY', 'A save is already running');
    const plan = this.savePlans.get(planId);
    if (!plan) return fail('SAVE_PLAN_MISSING', 'Save plan is unavailable');
    const expected = this.saveExpected.get(planId);
    if (!expected || expected.length !== this.documents.size || !sameVersions(this.documents, expected)) return fail('SAVE_PLAN_STALE', 'Working revision changed before save', ['compare']);
    const selected = new Set(plan.objects.map(object => object.key)), objects = dirtySaveObjects(this.documents);
    const capture: SaveCapture = { plan, documents: new Map(plan.preview.map(document => [document.documentId, clone(document)])),
      operations: this.operations.map(operation => ({ operation, state: operation.state,
        objects: patchSaveObjects(operation.state === 'undone' ? operation.inverse : operation.patches, plan.objects) })),
      recoveredGroups: this.recoveredGroups.map(group => ({ group, remaining: objects.filter(object =>
        (group.objects ? group.objects.includes(object.key) : group.members.includes(object.documentId)) && !selected.has(object.key)).map(object => object.key) })) };
    this.#saving = true;
    let finishSave!: () => void; this.#saveFinished = new Promise(resolve => { finishSave = resolve; });
    try {
      const conflicts: Conflict[] = [];
      const changes: FileChange[] = [];
      for (const [id, document] of capture.documents) {
        for (const path of new Set([...Object.keys(document.files), ...Object.keys(document.savedFiles)])) {
          const disk = await readOptional(join(this.root, ...path.split('/')));
          const base = document.savedFiles[path] ?? null;
          const local = document.files[path] ?? null;
          if (disk !== base) conflicts.push({ path, base, local, disk });
          changes.push({ path, documentId: id, revision: document.revision, content: local });
        }
      }
      if (conflicts.length) {
        this.conflicts.set(planId, conflicts);
        return fail('EXTERNAL_CONFLICT', `External changes in ${conflicts.map(value => value.path).join(', ')}`, ['compare']);
      }
      const transactionId = changes.length ? await commitFiles(this.root, this.projectId, changes) : createId([this.documents, this.operations]);
      for (const [id, saved] of capture.documents) {
        const current = this.documents.get(id)!;
        current.savedFiles = clone(saved.files);
        current.savedRevision = saved.revision;
        current.dirty = dirty(current);
      }
      for (const { operation, state, objects } of capture.operations) for (const key of objects) {
        (operation.savedStates ??= {})[key] = state;
      }
      for (const { group, remaining } of capture.recoveredGroups) group.objects = remaining;
      this.savePlans.delete(planId);
      this.saveExpected.delete(planId);
      const receipt = { transactionId, saved: plan.versions, remainingDirty: this.dirtyIds() };
      try { await this.writeDraft(); return ok(receipt); }
      catch (error) {
        this.draftError = String(error);
        return { ok: true, value: receipt, warnings: [issue('DRAFT_UPDATE_FAILED', this.draftError, ['retry'])] };
      }
    } catch (error) { return fail('SAVE_FAILED', String(error), ['retry']); }
    finally { this.#saving = false; finishSave(); }
  }

  async withSavedSnapshot<T>(read: (documents: WorkingDocument[]) => Promise<T>): Promise<T> {
    while (this.#saving) await this.#saveFinished;
    if (this.#disposed || this.#directoryChanging) throw new Error('作品会话不可读取');
    if (!this.#readers++) this.#readersFinished = new Promise(resolve => { this.#finishReaders = resolve; });
    try { return await read([...this.documents.keys()].map(id => this.readDocument(id, 'saved')!).filter(document => Object.keys(document.files).length)); }
    finally { if (!--this.#readers) { this.#finishReaders?.(); this.#finishReaders = null; } }
  }

  async commitDirectoryChange<T>(expected: { working: VersionRef[]; saved: VersionRef[] }, commit: () => Promise<Result<T>>): Promise<Result<T>> {
    if (this.#saving || this.#readers || this.#directoryChanging || this.#disposed) return fail('DIRECTORY_BUSY', '作品会话正在使用');
    const working = versions(this.documents, this.documents.keys()), saved = [...this.documents.values()].map(document => ref(document.documentId, document.savedRevision));
    if (!sameVector(working, expected.working) || !sameVector(saved, expected.saved)) return fail('UPGRADE_SOURCE_CHANGED', '升级源工作或保存版本已变化', ['compare']);
    this.#directoryChanging = true;
    if (this.#draftTimer) clearTimeout(this.#draftTimer); this.#draftTimer = null;
    await this.#draftWrite;
    try {
      for (const document of this.documents.values()) for (const [path, content] of Object.entries(document.savedFiles)) {
        if (await readOptional(join(this.root, ...path.split('/'))) !== content) return fail('UPGRADE_SOURCE_CHANGED', `升级源磁盘文件已变化：${path}`, ['compare']);
      }
      const result = await commit(); if (result.ok) this.#disposed = true; return result;
    }
    finally { this.#directoryChanging = false; }
  }

  getConflict(planId: Id): Conflict[] { return clone(this.conflicts.get(planId) ?? []); }
  getRecoveryConflict(): Conflict[] { return clone(this.recoveryConflicts); }

  async resolveConflict(planId: Id, choice: 'local' | 'disk' | 'copy', copyPath?: string): Promise<Result<void>> {
    if (this.#directoryChanging || this.#disposed) return fail('DIRECTORY_BUSY', '作品会话正在提交目录');
    const conflicts = this.conflicts.get(planId);
    if (!conflicts) return fail('CONFLICT_MISSING', 'No conflict for this plan');
    const plan = this.savePlans.get(planId);
    if (!plan || !sameVersions(this.documents, plan.versions))
      return fail('CONFLICT_STALE', 'Working revision changed after conflict was detected', ['compare']);
    for (const conflict of conflicts) {
      const disk = await readOptional(join(this.root, ...conflict.path.split('/')));
      if (disk !== conflict.disk) {
        conflict.disk = disk;
        return fail('CONFLICT_STALE', 'Disk changed again after conflict was detected', ['compare']);
      }
    }
    if (choice === 'copy') {
      if (!copyPath) return fail('COPY_PATH_REQUIRED', 'Copy path is required');
      try {
        await copyProjectDirectory(this.root, copyPath, [...this.documents.values()].filter(document => document.dirty));
      } catch (error) { return fail('COPY_FAILED', String(error)); }
    } else for (const conflict of conflicts) {
      const id = plan.files.find(file => file.path === conflict.path)?.documentId;
      const document = id && this.documents.get(id);
      if (!document) continue;
      if (choice === 'disk') {
        if (conflict.disk === null) delete document.files[conflict.path]; else document.files[conflict.path] = conflict.disk;
        document.revision++;
      }
      if (conflict.disk === null) delete document.savedFiles[conflict.path]; else document.savedFiles[conflict.path] = conflict.disk;
      document.dirty = dirty(document);
    }
    this.conflicts.delete(planId);
    this.savePlans.delete(planId);
    return ok(undefined);
  }

  async writeDraft(): Promise<void> {
    if (this.#draftTimer) clearTimeout(this.#draftTimer);
    this.#draftTimer = null;
    this.#draftSince = 0;
    this.#draftWrite = this.#draftWrite.catch(() => undefined).then(() => this.writeDraftNow());
    return this.#draftWrite;
  }

  private async writeDraftNow(): Promise<void> {
    const dirtyDocuments = [...this.documents.values()].filter(document => document.dirty);
    const path = join(this.root, '.galcraft', 'recovery', 'draft.json');
    if (!dirtyDocuments.length) { await rm(path, { force: true }); return; }
    const objects = dirtySaveObjects(this.documents);
    const groups = [...this.recoveredGroups.map(group => ({ ...group, objects: objects.filter(object => group.objects ? group.objects.includes(object.key) : group.members.includes(object.documentId)).map(object => object.key) })),
      ...this.operations.map(operation => {
        return { id: operation.groupId, members: operation.members, objects: this.operationSaveObjects(operation, objects) };
      })].filter(group => group.objects.length);
    const value = { trackedEdits: this.trackedEdits, externalCalls: this.externalCalls, schemaVersion: 1, projectId: this.projectId, savedAt: new Date().toISOString(),
      documents: dirtyDocuments.map(document => ({ documentId: document.documentId, baseRevision: document.savedRevision,
        workingRevision: document.revision,
        raw: Object.keys(document.files).length ? document.files[documentPath(document, document.format)] : '',
        format: document.format, files: document.files, baseFiles: document.savedFiles })), groups };
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, JSON.stringify(value), 'utf8');
    await renameWithSharingRetry(temporary, path);
    this.draftError = null;
  }

  scheduleDraft(): void {
    if (this.#disposed) return;
    const now = Date.now();
    if (!this.#draftSince) this.#draftSince = now;
    if (this.#draftTimer) clearTimeout(this.#draftTimer);
    const delay = Math.max(0, Math.min(1000, this.#draftSince + 10000 - now));
    this.#draftTimer = setTimeout(() => {
      void this.writeDraft().catch(error => { this.draftError = String(error); });
    }, delay);
  }

  async listRecovery(): Promise<Result<Json | null>> {
    const raw = await readOptional(join(this.root, '.galcraft', 'recovery', 'draft.json'));
    return ok(raw ? JSON.parse(raw) as Json : null);
  }

  private async loadDraft(): Promise<Draft | null> {
    const raw = await readOptional(join(this.root, '.galcraft', 'recovery', 'draft.json'));
    return raw ? JSON.parse(raw) as Draft : null;
  }

  private async draftConflicts(draft: Draft): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    for (const item of draft.documents) {
      for (const path of new Set([...Object.keys(item.files), ...Object.keys(item.baseFiles)])) {
        RelativePathSchema.parse(path);
        const disk = await readOptional(join(this.root, ...path.split('/')));
        const base = item.baseFiles[path] ?? null;
        if (disk !== base) conflicts.push({ path, base, local: item.files[path] ?? null, disk });
      }
    }
    return conflicts;
  }

  private applyDraft(draft: Draft, useDisk: Set<string> = new Set()): Id[] {
    const restored: Id[] = [];
    for (const item of draft.documents) {
      let document = this.documents.get(item.documentId);
      if (!document) {
        document = { documentId: item.documentId, format: item.format, revision: 0, savedRevision: 0,
          files: {}, savedFiles: {}, dirty: false };
        this.documents.set(item.documentId, document);
      }
      const files = clone(item.files);
      for (const path of useDisk) {
        if (!Object.hasOwn(files, path) && !Object.hasOwn(item.baseFiles, path)) continue;
        const disk = document.savedFiles[path];
        if (disk === undefined) delete files[path]; else files[path] = disk;
      }
      document.files = files;
      document.revision = Math.max(document.revision + 1, item.workingRevision + 1);
      for (const [file, text] of Object.entries(document.files)) {
        if (!file.endsWith('.json')) continue;
        try {
          const value = JSON.parse(text);
          if (value?.documentId === item.documentId) {
            value.revision = document.revision;
            document.files[file] = JSON.stringify(value, null, 2) + '\n';
          }
        } catch { /* Preserve invalid raw source. */ }
      }
      document.dirty = dirty(document);
      restored.push(item.documentId);
    }
    this.externalCalls={...this.externalCalls,...draft.externalCalls};
    this.trackedEdits={...this.trackedEdits,...draft.trackedEdits};
    this.recoveredGroups.push(...clone(draft.groups ?? []));
    this.scheduleDraft();
    return restored;
  }

  async recover(choice: 'restore' | 'discard'): Promise<Result<Id[]>> {
    if (this.#directoryChanging || this.#disposed) return fail('DIRECTORY_BUSY', '作品会话正在提交目录');
    if (this.#disposed) return fail('SESSION_CLOSED', 'Project session is closed');
    const draft = await this.loadDraft();
    if (!draft) return ok([]);
    if (choice === 'discard') {
      await rm(join(this.root, '.galcraft', 'recovery', 'draft.json'), { force: true });
      this.recoveryConflicts = [];
      this.#pendingRecovery = false;
      return ok([]);
    }
    this.recoveryConflicts = await this.draftConflicts(draft);
    if (this.recoveryConflicts.length) return fail('RECOVERY_CONFLICT', 'Disk changed since the draft base', ['compare']);
    this.#pendingRecovery = false;
    return ok(this.applyDraft(draft));
  }

  async resolveRecoveryConflict(choice: 'local' | 'disk' | 'copy', copyPath?: string): Promise<Result<Id[]>> {
    if (this.#directoryChanging || this.#disposed) return fail('DIRECTORY_BUSY', '作品会话正在提交目录');
    const draft = await this.loadDraft();
    if (!draft || !this.recoveryConflicts.length) return fail('RECOVERY_CONFLICT_MISSING', 'No recovery conflict is pending');
    const current = await this.draftConflicts(draft);
    if (!equal(current, this.recoveryConflicts)) {
      this.recoveryConflicts = current;
      return fail('RECOVERY_CONFLICT_STALE', 'Disk changed again during recovery choice', ['compare']);
    }
    if (choice === 'copy') {
      if (!copyPath) return fail('COPY_PATH_REQUIRED', 'Copy path is required');
      try { await copyProjectDirectory(this.root, copyPath, draft.documents.map(item =>
        ({ files: item.files, savedFiles: item.baseFiles }))); }
      catch (error) { return fail('COPY_FAILED', String(error)); }
      await rm(join(this.root, '.galcraft', 'recovery', 'draft.json'), { force: true });
      this.recoveryConflicts = [];
      this.#pendingRecovery = false;
      return ok([]);
    }
    for (const item of draft.documents) {
      const document = this.documents.get(item.documentId);
      if (!document) continue;
      for (const conflict of current) {
        if (!Object.hasOwn(item.files, conflict.path) && !Object.hasOwn(item.baseFiles, conflict.path)) continue;
        if (conflict.disk === null) delete document.savedFiles[conflict.path];
        else document.savedFiles[conflict.path] = conflict.disk;
      }
    }
    const restored = this.applyDraft(draft, choice === 'disk' ? new Set(current.map(value => value.path)) : new Set());
    this.recoveryConflicts = [];
    this.#pendingRecovery = false;
    return ok(restored);
  }

  async dispose(choice: 'saved' | 'discard' | 'keep'): Promise<Result<void>> {
    if (this.#directoryChanging) return fail('DIRECTORY_BUSY', '作品会话正在提交目录');
    if (this.#saving) return fail('SAVE_BUSY', 'A save is still running');
    if (choice === 'saved' && this.dirtyIds().length) return fail('DIRTY_DOCUMENTS', 'Working documents remain unsaved');
    if (this.#draftTimer) clearTimeout(this.#draftTimer);
    this.#draftTimer = null;
    await this.#draftWrite.catch(() => undefined);
    if (choice === 'saved' && (this.#pendingRecovery || await this.loadDraft()))
      return fail('RECOVERY_UNRESOLVED', 'A recovery draft still needs a choice', ['compare']);
    if (choice === 'discard' || choice === 'saved')
      await rm(join(this.root, '.galcraft', 'recovery', 'draft.json'), { force: true });
    else if (this.dirtyIds().length) await this.writeDraft();
    this.#disposed = true;
    return ok(undefined);
  }
}

export async function openFromAccess(access: { getRoot(sessionId: Id): string | null }, sessionId: Id, projectId: Id,
  options: SessionOptions = {}): Promise<ProjectSession> {
  const root = access.getRoot(sessionId);
  if (!root) throw new Error('Project session is not attached');
  return ProjectSession.open(root, projectId, options);
}

export { commitFiles, recoverTransactions, renameWithSharingRetry } from './file-transaction.js';
