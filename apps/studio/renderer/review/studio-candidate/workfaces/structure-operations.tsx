import { createId, type DocumentView, type Project, type Scalar, type Scene, type Variable } from '@galcraft/contracts';
import { authoringReferences, rebaseAuthoringOperation, type AuthorOperation, type AuthoringReference } from '@galcraft/documents/authoring';
import { commandOwnedIds, parse } from '@galcraft/dsl';
import { documentData } from '../application/documents.js';
import { CandidateButton, CandidateReviewDialog } from '../components/controls/index.js';

export type StructureKind = 'chapter' | 'scene' | 'variable';
export type StructureSelection = { kind: StructureKind; id: string };
export type StructureTarget = StructureSelection | { kind: 'local'; id: string; sceneId: string; name: string };
export type DeclarationOperation = Extract<AuthorOperation, { op: 'scene.declarations' }>;
export type LocalDraft = {
  id: string;
  name: string;
  type: Variable['type'];
  initial: string;
  parameter: 'local' | 'required' | 'default';
  // Existing documents can carry a required flag independently of whether they declare a default.
  parameterRequired?: boolean;
  defaultValue: string;
};
export type DeclarationDraft = { locals: LocalDraft[]; returns: Scene['returns'] };
export type StructureDraft = { baseline: DocumentView[]; fields?: Record<string, string>; declarations?: DeclarationDraft };
export type Drafts = Record<string, StructureDraft>;
export type StructureState = { selection: StructureSelection; selected?: Partial<Record<StructureKind, string>>; drafts: Drafts };
type OldDeclaration = Omit<DeclarationOperation, 'op' | 'id'>;
type OldStructureState = {
  documents: DocumentView[];
  section: 'chapters' | 'scenes' | 'variables';
  selected: Partial<Record<StructureKind, string>>;
  fields: Record<string, string>;
  declarations: Record<string, OldDeclaration>;
  bases: Record<string, DocumentView[]>;
};

export const kindLabels: Record<StructureKind, string> = { chapter: '章节', scene: '场景', variable: '作品变量' };
export const typeLabels: Record<Variable['type'], string> = { number: '数字', boolean: '布尔', string: '文字' };
export const draftKey = (target: StructureSelection, group: string) => `${target.kind}:${target.id}:${group}`;
export const scenePath = (id: string) => `scenes/${id}/scene.json`;
export const variablePath = (id: string) => `variables/${id}.json`;
export const structurePath = ({ kind, id }: StructureSelection) => kind === 'scene' ? scenePath(id) : kind === 'variable' ? variablePath(id) : 'project.json';

export function restoreStructureState(saved: StructureState | OldStructureState | undefined, fallback: StructureSelection): StructureState {
  if (!saved) return { selection: fallback, selected: { [fallback.kind]: fallback.id }, drafts: {} };
  if ('drafts' in saved) return saved;
  const kind = saved.section === 'chapters' ? 'chapter' : saved.section === 'variables' ? 'variable' : 'scene';
  const drafts: Drafts = {};
  for (const [key, value] of Object.entries(saved.fields)) {
    const [section, id, field] = key.split(':');
    if (id === undefined || !field) continue;
    const target = { kind: section === 'chapters' ? 'chapter' : section === 'variables' ? 'variable' : 'scene', id } as const;
    const localId = /^(?:local|arguments)-(.+)$/.exec(field)?.[1];
    const group = field === 'chapter' && id ? 'move' : field === 'label' ? 'entry' :
      localId ? `remove-${localId}` : field === 'destination' || field === 'replacement' ? 'remove' :
      target.kind === 'variable' ? 'variable' : 'name';
    const newKey = draftKey(target, group);
    const draft = drafts[newKey] ??= { baseline: saved.bases[key] ?? saved.documents, fields: {} };
    draft.fields![field] = value;
  }
  for (const [id, draft] of Object.entries(saved.declarations)) {
    drafts[draftKey({ kind: 'scene', id }, 'declarations')] = {
      baseline: saved.bases[`declarations:${id}`] ?? saved.documents,
      declarations: { returns: draft.returns, locals: draft.locals.map(local => ({
        id: local.id ?? createId([saved.documents]), name: local.name, type: local.type, initial: String(local.initial),
        parameter: local.parameter ? local.parameter.defaultValue == null ? 'required' : 'default' : 'local',
        parameterRequired: local.parameter?.required,
        defaultValue: String(local.parameter?.defaultValue ?? local.initial),
      })) },
    };
  }
  return { selection: { kind, id: saved.selected[kind] ?? (kind === fallback.kind ? fallback.id : '') }, selected: saved.selected, drafts };
}

export function defaultScalar(type: Variable['type']) { return type === 'number' ? '0' : type === 'boolean' ? 'false' : ''; }
export function readScalar(type: Variable['type'], text: string): Scalar {
  if (type === 'boolean') return text === 'true';
  if (type === 'string') return text;
  const value = Number(text);
  if (!text.trim() || !Number.isFinite(value)) throw new Error('请输入有效的有限数字。');
  return value;
}

export function declarationsOf(scene: Scene): DeclarationDraft {
  return { returns: scene.returns, locals: scene.locals.map(local => {
    const parameter = scene.parameters.find(item => item.variableId === local.id);
    return {
      id: local.id, name: local.name, type: local.type, initial: String(local.initial),
      parameter: parameter ? parameter.defaultValue === null ? 'required' : 'default' : 'local',
      parameterRequired: parameter?.required,
      defaultValue: String(parameter?.defaultValue ?? local.initial),
    };
  }) };
}

export function declarationOperation(id: string, draft: DeclarationDraft): DeclarationOperation {
  return { op: 'scene.declarations', id, returns: draft.returns, locals: draft.locals.map(local => ({
    id: local.id, name: local.name, type: local.type, initial: readScalar(local.type, local.initial),
    ...(local.parameter === 'local' ? {} : { parameter: {
      required: local.parameterRequired ?? local.parameter === 'required',
      ...(local.parameter === 'default' ? { defaultValue: readScalar(local.type, local.defaultValue) } : {}),
    } }),
  })) };
}

function scriptNodes(documents: DocumentView[], id: string) {
  const path = `scenes/${id}/script.gal`, doc = documents.find(item => path in item.files);
  return doc ? parse({ documentId: doc.documentId, revision: doc.revision, text: doc.files[path]! }).cst : [];
}

export function sceneLabels(documents: DocumentView[], id: string) {
  return scriptNodes(documents, id).flatMap(node => {
    if (!node.valid || node.command !== 'label') return [];
    const args = node.object?.value as { labelId?: string; name?: string };
    return args?.labelId && args.name ? [{ id: args.labelId, name: args.name }] : [];
  });
}

type ConflictField = { label: string; baseline: unknown; current: unknown; input: unknown };
const fieldLabels: Record<string, string> = { name: '名称', type: '类型', scope: '作用域', initial: '初值' };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function compareStructureChanges(baseline: DocumentView[], current: DocumentView[], operation: AuthorOperation): ConflictField[] {
  const projectOf = (documents: DocumentView[]) => documentData<Project>(documents, 'project.json');
  const compare = (label: string, read: (documents: DocumentView[]) => unknown, input: unknown) => {
    const before = read(baseline), latest = read(current);
    return !same(before, latest) && !same(latest, input) ? [{ label, baseline: before, current: latest, input }] : [];
  };
  switch (operation.op) {
    case 'scene.update':
    case 'variable.update': {
      const path = operation.op === 'scene.update' ? scenePath(operation.id) : variablePath(operation.id);
      return rebaseAuthoringOperation(baseline, current, operation).conflicts.map(field => ({
        label: fieldLabels[field] ?? '对象',
        baseline: documentData<Record<string, unknown>>(baseline, path)?.[field],
        current: documentData<Record<string, unknown>>(current, path)?.[field],
        input: (operation.changes as Record<string, unknown>)[field],
      }));
    }
    case 'chapter.rename':
      return compare('名称', documents => projectOf(documents)?.chapters.find(chapter => chapter.id === operation.id)?.name, operation.name);
    case 'project.entry':
      return compare('作品起点', documents => projectOf(documents)?.entry, { sceneId: operation.sceneId, labelId: operation.labelId });
    case 'scene.move':
      return compare('场景目录顺序', documents => projectOf(documents)?.chapters
        .filter(chapter => chapter.id === operation.chapterId || chapter.sceneIds.some(id => operation.ids.includes(id)))
        .map(chapter => ({ name: chapter.name, scenes: chapter.sceneIds })), operation.chapterId);
    case 'scene.declarations':
      return compare('局部变量、参数与返回值', documents => {
        const scene = documentData<Scene>(documents, scenePath(operation.id));
        return scene && declarationOperation(scene.id, declarationsOf(scene));
      }, operation);
    default:
      return [];
  }
}

export type RemovalTarget = StructureSelection | Extract<StructureTarget, { kind: 'local' }>;
export type RemovalReferences = { direct: AuthoringReference[]; owned: AuthoringReference[] };
export function removalReferences(documents: DocumentView[], target: RemovalTarget): RemovalReferences {
  const source = documents.find(document => (target.kind === 'scene' ? scenePath(target.id) :
    target.kind === 'local' ? scenePath(target.sceneId) : variablePath(target.id)) in document.files);
  const candidates = documents.filter(document => !Object.keys(document.files).some(path => path.startsWith('candidate/')));
  if (target.kind === 'chapter') return { direct: [], owned: [] };
  const direct = authoringReferences(candidates, { kind: target.kind === 'scene' ? 'scene' : 'variable', id: target.id })
    .filter(ref => target.kind === 'scene' ? ref.documentId !== source?.documentId && !/^\/chapters\/\d+\/sceneIds\//.test(ref.field)
      : target.kind !== 'local' || ref.documentId !== source?.documentId || !ref.field.startsWith('/parameters/'));
  const owned = target.kind === 'scene' ? [
    ...(documentData<Scene>(documents, scenePath(target.id))?.locals.map(local => local.id) ?? []),
    ...scriptNodes(documents, target.id).flatMap(node => node.valid && node.id
      ? [node.id, ...commandOwnedIds(node.command, node.object!.value as Record<string, unknown>)] : []),
  ].flatMap(id => authoringReferences(candidates, { kind: 'label', id }).filter(ref => ref.documentId !== source?.documentId)) : [];
  return { direct, owned };
}

export function StructureConflictDialog({ fields, busy, error, onChoose, onDismiss, portal }: {
  fields: ConflictField[];
  busy: boolean;
  error: string;
  onChoose(resolution: 'draft' | 'current'): void;
  onDismiss(): void;
  portal: HTMLElement | null;
}) {
  const display = (value: unknown) => value === undefined ? '无值' : value === '' ? '空文本' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return <CandidateReviewDialog open title="审阅冲突字段" description="工作区中有更新。选择冲突字段的取值，其他修改会继续应用。"
    busy={busy} onDismiss={onDismiss} portal={portal} className="candidate-structure-review"
    actions={<><CandidateButton disabled={busy} onClick={onDismiss}>继续编辑</CandidateButton>
      <CandidateButton disabled={busy} onClick={() => onChoose('current')}>采用工作区值</CandidateButton>
      <CandidateButton disabled={busy} variant="primary" onClick={() => onChoose('draft')}>采用我的输入</CandidateButton></>}>
    {fields.map(field => <section className="candidate-structure-conflict" key={field.label}>
      <h3>{field.label}</h3><dl>{([['原依据', field.baseline], ['工作区当前值', field.current], ['我的输入', field.input]] as const).map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd tabIndex={0}>{display(value)}</dd></div>)}</dl>
    </section>)}
    {error && <p role="alert" className="candidate-structure-error">{error}</p>}
  </CandidateReviewDialog>;
}
