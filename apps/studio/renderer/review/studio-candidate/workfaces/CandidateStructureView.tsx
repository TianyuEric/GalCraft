import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Braces, FileText, Flag, Folder, Plus, Search } from 'lucide-react';
import type { DocumentView, EditReceipt, Project, Scene, Variable } from '@galcraft/contracts';
import { rebaseAuthoringOperation, type AuthorOperation, type AuthoringReference } from '@galcraft/documents/authoring';
import { useCandidate, useCandidateState } from '../application/context.js';
import { documentData } from '../application/documents.js';
import type { CandidateSession } from '../application/session.js';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateMenuButton,
  CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { StructureDeclarationFields, StructureNameField, StructureVariableFields } from './structure-fields.js';
import { compareStructureChanges, declarationOperation, draftKey, kindLabels, readScalar, restoreStructureState, sceneLabels, scenePath,
  StructureConflictDialog, structurePath, type DeclarationDraft, type RemovalTarget, type StructureDraft, type StructureKind, type StructureSelection,
  type StructureTarget, typeLabels } from './structure-operations.js';
import { StructureRemovalDialog } from './structure-removal.js';
import '../styles/structure.css';

export type { StructureTarget } from './structure-operations.js';
export function openStructureTarget(store: CandidateSession, target: StructureTarget) { store.rememberViewState('structure:targetRequest', target); }

type OperationInput = { operation: AuthorOperation; key?: string; baseline: DocumentView[] };
type Conflict = OperationInput & { fields: ReturnType<typeof compareStructureChanges>; compared: string };
type Copy = { source: 'chapter' | 'scene'; id: string; name: string; destination: string };
const icons = { chapter: Folder, scene: FileText, variable: Braces };
const collections = { chapter: '章节', scene: '场景', variable: '作品变量' };
const projectPath = 'project.json';

function structureDocuments(documents: DocumentView[]) {
  const scenes = documents.flatMap(document => Object.keys(document.files).filter(path => /^scenes\/[^/]+\/scene\.json$/.test(path))
    .map(path => documentData<Scene>([document], path)!));
  const variables = documents.flatMap(document => Object.keys(document.files).filter(path => /^variables\/[^/]+\.json$/.test(path))
    .map(path => documentData<Variable>([document], path)!));
  const project = documentData<Project>(documents, projectPath);
  return { project, scenes, variables };
}

function editBasis(documents: DocumentView[], selection: StructureSelection, group: string) {
  const path = group === 'entry' || group === 'move' ? projectPath : structurePath(selection);
  const document = documents.find(document => path in document.files);
  return document ? [{ ...document, files: { [path]: document.files[path]! }, savedFiles: {} }] : [];
}

export function CandidateStructureView({ onOpen }: { onOpen(view: string): void }) {
  const store = useCandidate(), { activeView, revision, ui } = useCandidateState();
  const documents = useMemo(() => store.host.list(), [store, revision]);
  const { project, scenes, variables } = useMemo(() => structureDocuments(documents), [documents]);
  const orderedScenes = useMemo(() => {
    const byId = new Map(scenes.map(scene => [scene.id, scene]));
    const ordered = project?.chapters.flatMap(chapter => chapter.sceneIds.flatMap(id => {
      const scene = byId.get(id);
      byId.delete(id);
      return scene ?? [];
    })) ?? [];
    return [...ordered, ...byId.values()];
  }, [project, scenes]);
  const [form, setForm] = useState(() => restoreStructureState(store.viewState('structure'), { kind: 'scene', id: ui.sceneId || scenes[0]?.id || '' }));
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false), running = useRef(false);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [removal, setRemoval] = useState<RemovalTarget | null>(null);
  const [copy, setCopy] = useState<Copy | null>(null);
  const [focusRequest, setFocusRequest] = useState<StructureTarget | null>(null);
  const root = useRef<HTMLElement>(null), nameInput = useRef<HTMLInputElement>(null);
  const selected = form.selection, { kind, id } = selected;
  const chapter = kind === 'chapter' ? project?.chapters.find(chapter => chapter.id === id) : undefined;
  const scene = kind === 'scene' ? scenes.find(scene => scene.id === id) : undefined;
  const variable = kind === 'variable' ? variables.find(variable => variable.id === id) : undefined;
  const entity = chapter ?? scene ?? variable;
  const sectionRows = kind === 'chapter' ? project?.chapters ?? [] : kind === 'scene' ? orderedScenes : variables;
  const visibleRows = sectionRows.filter(row => row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const drafts = form.drafts, pending = Object.keys(drafts).length;
  const objectDrafts = Object.keys(drafts).filter(key => key.startsWith(`${kind}:${id}:`));
  const readOnly = scene ? store.sourceReadOnly(scene.id) : false;
  const editing = !id || !!entity;
  const portal = root.current?.ownerDocument.getElementById('studio-portals') ?? null;
  const requested = store.viewState<StructureTarget>('structure:targetRequest');

  useEffect(() => {
    store.rememberViewState('structure', form);
    store.setViewPending('structure', pending > 0);
  }, [store, form, pending]);

  useLayoutEffect(() => {
    if (activeView !== 'structure' || !requested) return;
    store.rememberViewState('structure:targetRequest', undefined);
    const target: StructureSelection = requested.kind === 'local' ? { kind: 'scene', id: requested.sceneId } : requested;
    setForm(previous => ({ ...previous, selection: target, selected: { ...previous.selected, [target.kind]: target.id } }));
    setFocusRequest(requested);
    setQuery('');
    const doc = documents.find(document => structurePath(target) in document.files);
    if (doc) store.target(doc.documentId);
  }, [activeView, requested, documents, store]);

  useLayoutEffect(() => {
    if (!focusRequest) return;
    const target = focusRequest.kind === 'local'
      ? Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-structure-local]') ?? []).find(input => input.dataset.structureLocal === focusRequest.id)
      : nameInput.current;
    if (target && !target.matches(':disabled')) target.focus();
    else root.current?.querySelector<HTMLElement>('.candidate-structure-detail')?.focus();
    setFocusRequest(null);
  }, [focusRequest]);

  const draft = (group: string) => drafts[draftKey(selected, group)];
  const fields = (group: string) => draft(group)?.fields ?? {};
  const change = (group: string, values: Record<string, string>) => {
    const key = draftKey(selected, group);
    setForm(previous => {
      const existing = previous.drafts[key];
      return { ...previous, drafts: { ...previous.drafts, [key]: { baseline: existing?.baseline ?? editBasis(documents, selected, group),
        fields: { ...existing?.fields, ...values } } } };
    });
    setError(''); setMessage('');
  };
  const changeDeclarations = (value: DeclarationDraft) => {
    const key = draftKey(selected, 'declarations');
    setForm(previous => ({ ...previous, drafts: { ...previous.drafts,
      [key]: { baseline: previous.drafts[key]?.baseline ?? editBasis(documents, selected, 'declarations'), declarations: value } } }));
    setError(''); setMessage('');
  };
  const discard = (keys: string[]) => {
    setForm(previous => ({ ...previous, drafts: Object.fromEntries(Object.entries(previous.drafts).filter(([key]) => !keys.includes(key))) }));
    setError(''); setMessage('');
  };
  function select(next: StructureSelection, focus = false) {
    setForm(previous => ({ ...previous, selection: next, selected: { ...previous.selected, [next.kind]: next.id } }));
    if (focus) setFocusRequest(next);
    const doc = store.host.list().find(document => structurePath(next) in document.files);
    if (activeView === 'structure' && doc) store.target(doc.documentId);
    setError(''); setMessage('');
  }

  function finishCreated(operation: AuthorOperation, before: DocumentView[], receipt: EditReceipt) {
    if (!['chapter.create', 'chapter.duplicate', 'scene.create', 'scene.duplicate', 'variable.create'].includes(operation.op)) return;
    const changed = new Set(receipt.documents.map(version => version.ref.id));
    const previous = structureDocuments(before), latest = structureDocuments(store.host.list().filter(document => changed.has(document.documentId)));
    if (operation.op === 'chapter.create' || operation.op === 'chapter.duplicate') {
      const created = latest.project?.chapters.find(chapter => chapter.name === operation.name && !previous.project?.chapters.some(item => item.id === chapter.id));
      if (created) select({ kind: 'chapter', id: created.id });
    } else if (operation.op === 'scene.create' || operation.op === 'scene.duplicate') {
      const created = latest.scenes.find(scene => !previous.scenes.some(item => item.id === scene.id));
      if (created) select({ kind: 'scene', id: created.id });
    } else if (operation.op === 'variable.create') {
      const created = latest.variables.find(variable => !previous.variables.some(item => item.id === variable.id));
      if (created) select({ kind: 'variable', id: created.id });
    }
  }

  async function run(input: OperationInput, resolution?: 'draft' | 'current') {
    if (running.current) return;
    const latest = store.host.list(), { operation, baseline, key } = input;
    const conflicts = compareStructureChanges(baseline, latest, operation);
    const compared = JSON.stringify(conflicts);
    if (conflicts.length && (!resolution || compared !== conflict?.compared)) {
      setConflict({ ...input, fields: conflicts, compared }); setError(''); return;
    }
    running.current = true;
    setBusy(true); setMessage(''); setError('');
    try {
      const partial = operation.op === 'scene.update' || operation.op === 'variable.update';
      const merged = partial ? rebaseAuthoringOperation(baseline, latest, operation, resolution).operation : operation;
      const keepCurrent = resolution === 'current' && (partial ? (merged.op === 'scene.update' || merged.op === 'variable.update') && !Object.keys(merged.changes).length : conflicts.length > 0);
      if (!keepCurrent) {
        const result = await store.authorOperation(operation, baseline, resolution);
        if (!result.ok && result.error.code !== 'NO_CHANGE') throw new Error(result.error.message);
        if (result.ok) finishCreated(operation, latest, result.value);
      }
      if (key) discard([key]);
      setConflict(null);
      setRemoval(null);
      setCopy(null);
      setMessage(keepCurrent ? '已采用工作区当前值。' : '已应用到工作区，可从历史撤销。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { running.current = false; setBusy(false); }
  }

  function submit(operation: AuthorOperation, group?: string) {
    void run({ operation, key: group ? draftKey(selected, group) : undefined, baseline: (group ? draft(group)?.baseline : undefined) ?? store.host.list() });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (kind === 'variable') {
        const values = fields('variable'), type = (values.type ?? variable?.type ?? 'number') as Variable['type'];
        if (variable) {
          const changes = { ...(values.name !== undefined ? { name: values.name.trim() } : {}),
            ...(values.scope !== undefined ? { scope: values.scope as Variable['scope'] } : {}),
            ...(values.type !== undefined ? { type } : {}), ...(values.initial !== undefined ? { initial: readScalar(type, values.initial) } : {}) };
          if (changes.name === '') throw new Error('请填写变量名称。');
          submit({ op: 'variable.update', id, changes }, 'variable');
        } else {
          const name = values.name?.trim();
          if (!name) throw new Error('请填写变量名称。');
          submit({ op: 'variable.create', name, type, scope: (values.scope ?? 'progress') as 'progress' | 'longTerm',
            initial: readScalar(type, values.initial ?? '0') }, 'variable');
        }
      } else {
        const name = (fields('name').name ?? entity?.name)?.trim();
        if (!name) throw new Error('请填写名称。');
        if (kind === 'chapter') submit(chapter ? { op: 'chapter.rename', id, name } : { op: 'chapter.create', name }, 'name');
        else if (scene) submit({ op: 'scene.update', id, changes: { name } }, 'name');
        else {
          const chapterId = fields('name').chapter ?? project?.chapters[0]?.id;
          if (!chapterId) throw new Error('先新建章节，再添加场景。');
          submit({ op: 'scene.create', name, chapterId }, 'name');
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  function showRemoval(next: RemovalTarget) {
    if (next.kind === 'local' && draft('declarations')) {
      setError('先应用或还原当前声明草稿，再替换已提交的局部变量。');
      return;
    }
    setError(''); setRemoval(next);
  }
  function beginCopy() {
    if (!chapter && !scene) return;
    const destination = moveChapterId || scene?.chapterId || '';
    const used = new Set((chapter ? project?.chapters ?? [] : scenes.filter(item => item.chapterId === destination)).map(item => item.name));
    const base = `${(chapter ?? scene)!.name} 副本`;
    let name = base, suffix = 2;
    while (used.has(name)) name = `${base} ${suffix++}`;
    setError('');
    setCopy({ source: chapter ? 'chapter' : 'scene', id, destination, name });
  }
  function revealReference(ref: AuthoringReference) {
    const owner = scenes.find(scene => documents.some(document => document.documentId === ref.documentId && scenePath(scene.id) in document.files));
    if (!owner) return;
    setRemoval(null);
    if (ref.statementId) {
      onOpen(`${store.sourceReadOnly(owner.id) ? 'source' : 'commands'}:${owner.id}`);
      store.selectCommand(owner.id, ref.statementId);
    } else select({ kind: 'scene', id: owner.id }, true);
  }
  function openStartup() {
    store.rememberViewState('settings:section', 'startup');
    store.rememberViewState('settings:sectionRequest', { section: 'startup', serial: (store.viewState<{ serial: number }>('settings:sectionRequest')?.serial ?? 0) + 1 });
    onOpen('settings');
  }

  if (!project) return <CandidateState kind="loading" title="正在读取剧情结构"/>;
  const chapterIndex = chapter ? project.chapters.indexOf(chapter) : -1;
  const sceneChapter = project.chapters.find(chapter => chapter.id === scene?.chapterId);
  const sceneIndex = sceneChapter?.sceneIds.findIndex(id => id === scene?.id) ?? -1;
  const nameGroup = kind === 'variable' ? 'variable' : 'name';
  const mainDraft = draft(nameGroup);
  const moveChapterId = fields('move').chapter ?? scene?.chapterId ?? '';
  const isEntry = project.entry.sceneId === id;
  const entryLabel = fields('entry').label ?? (isEntry ? project.entry.labelId ?? '' : '');
  const removalGroup = removal?.kind === 'local' ? `remove-${removal.id}` : 'remove';
  const oldRemovalDrafts = objectDrafts.flatMap<{ key: string; target?: RemovalTarget; label: string }>(key => {
    const group = key.split(':')[2];
    if (group === 'remove') return [{ key, target: selected as RemovalTarget, label: entity?.name ?? id }];
    if (!group?.startsWith('remove-') || !scene) return [];
    const localId = group.slice('remove-'.length), local = scene.locals.find(local => local.id === localId);
    return [{ key, target: local ? { kind: 'local' as const, id: localId, sceneId: scene.id, name: local.name } : undefined, label: local?.name ?? localId }];
  });
  const staleDraftTargets = [...new Set(Object.keys(drafts).flatMap(key => {
    const [type, targetId] = key.split(':');
    return type === kind && targetId && !sectionRows.some(row => row.id === targetId) ? [targetId] : [];
  }))];
  const chapterOptions = project.chapters.map(item => <option key={item.id} value={item.id}>{item.name}</option>);
  const operationTools = (label: string, group: string, action: ReactNode) => <CandidateToolbar label={label}>
    {action}{draft(group) && <CandidateButton disabled={busy} onClick={() => discard([draftKey(selected, group)])}>还原输入</CandidateButton>}
  </CandidateToolbar>;

  return <section ref={root} className="candidate-workface candidate-structure-workface" aria-label="剧情结构与变量">
    <CandidateToolbar className="candidate-structure-header" label="剧情结构工具">
      <h2>剧情结构与变量</h2>
      {pending > 0 && <span className="candidate-structure-meta">{pending} 组未应用</span>}
      <CandidateButton onClick={openStartup}><Flag size={14} aria-hidden="true"/>启动与主页</CandidateButton>
      <CandidateButton onClick={() => onOpen('scene-graph')}>场景图</CandidateButton>
      {(error && !conflict && !removal && !copy) && <p role="alert" className="candidate-structure-error candidate-structure-feedback">{error}</p>}
      {message && <p role="status" className="candidate-structure-meta candidate-structure-feedback">{message}</p>}
    </CandidateToolbar>
    <div className="candidate-structure-layout">
      <aside className="candidate-structure-register" aria-label="结构对象">
        <CandidateToolbar label="对象类型" className="candidate-structure-kinds">
          {(Object.keys(collections) as StructureKind[]).map(type => <CandidateButton key={type} aria-pressed={kind === type} disabled={busy}
            variant={kind === type ? 'secondary' : 'ghost'} onClick={() => {
              if (type === kind) return;
              setQuery('');
              const rows = type === 'chapter' ? project.chapters : type === 'scene' ? orderedScenes : variables;
              const remembered = form.selected?.[type];
              const isAvailable = remembered === '' || rows.some(row => row.id === remembered)
                || Object.keys(drafts).some(key => key.startsWith(`${type}:${remembered}:`));
              select({ kind: type, id: isAvailable ? remembered! : rows[0]?.id ?? '' });
            }}>{collections[type]}</CandidateButton>)}
        </CandidateToolbar>
        <div className="candidate-structure-filter">
          <div><Search size={14} aria-hidden="true"/><CandidateInput density="compact" type="search" value={query} placeholder={`查找${kindLabels[kind]}`}
            aria-label={`查找${kindLabels[kind]}`} onChange={event => setQuery(event.target.value)}/></div>
          <CandidateIconButton label={`新建${kindLabels[kind]}`} disabled={busy}
            disabledReason={kind === 'scene' && !project.chapters.length ? '先创建章节。' : undefined}
            onClick={() => select({ kind, id: '' }, true)}><Plus size={15} aria-hidden="true"/></CandidateIconButton>
        </div>
        <div className="candidate-structure-rows">
          {visibleRows.map(row => {
            const Icon = icons[kind];
            const detail = 'sceneIds' in row ? `${row.sceneIds.length} 场景` : 'type' in row ? typeLabels[row.type] :
              project.entry.sceneId === row.id ? '起点' : project.chapters.find(chapter => chapter.id === row.chapterId)?.name;
            const dirty = Object.keys(drafts).some(key => key.startsWith(`${kind}:${row.id}:`));
            return <CandidateObjectRow key={row.id} title={row.name} icon={<Icon size={15}/>} active={row.id === id} metadata={dirty ? '未应用' : detail}
              onActivate={() => { if (!busy) select({ kind, id: row.id }); }} onRename={() => { if (!busy) select({ kind, id: row.id }, true); }}/>;
          })}
          {staleDraftTargets.map(id => <CandidateObjectRow key={id} title={`已移除的${kindLabels[kind]}`} metadata="未应用"
            active={id === selected.id} onActivate={() => { if (!busy) select({ kind, id }); }}/>)}
          {!visibleRows.length && !staleDraftTargets.length && <CandidateState kind="empty" title={query ? '没有匹配对象' : `暂无${kindLabels[kind]}`}/>}
        </div>
      </aside>
      <div className="candidate-structure-detail" tabIndex={-1} aria-label="当前结构对象">
        <CandidateSection title={entity?.name ?? (id ? '对象已移除' : `新建${kindLabels[kind]}`)} className="candidate-structure-object"
          actions={entity && <CandidateToolbar label={`${kindLabels[kind]}操作`}>
            {scene && <CandidateButton onClick={() => onOpen(`writing:${scene.id}`)}>打开文稿<ArrowUpRight size={14} aria-hidden="true"/></CandidateButton>}
            <CandidateMenuButton label={`${entity.name}的操作`} disabled={busy} actions={[
              ...(chapter || scene ? [{ id: 'copy', label: chapter ? '复制章节与场景' : '复制场景',
                disabledReason: readOnly || chapter?.sceneIds.some(sceneId => store.sourceReadOnly(sceneId)) ? '先修复相关场景的源码。' : undefined,
                run: beginCopy }] : []),
              { id: 'remove', label: '审阅移除影响', danger: true, disabledReason: readOnly ? '先修复此场景的源码。' : undefined, run: () => showRemoval(selected) },
            ]}>操作</CandidateMenuButton>
          </CandidateToolbar>}>
          {readOnly && scene && <CandidateState kind="error" title="场景结构只读" description={store.sourceRecoveryNotice(scene.id)}
            action={<CandidateButton onClick={() => onOpen(`source:${scene.id}`)}>打开源码</CandidateButton>}/>}
          {!editing ? <CandidateState kind="empty" title="此对象已不在工作区" description={objectDrafts.length ? '未应用的输入仍保留，可还原或从历史恢复对象。' : undefined}
            action={objectDrafts.length ? <CandidateButton onClick={() => discard(objectDrafts)}>还原该对象的输入</CandidateButton> : undefined}/>
            : <form className={kind === 'variable' || !entity ? 'candidate-structure-form' : 'candidate-structure-inline'} onSubmit={onSubmit}>
              <CandidateFieldGroup title={kind === 'variable' ? '变量定义' : undefined} disabled={busy || readOnly}>
                {kind === 'variable' ? <StructureVariableFields variable={variable} fields={fields('variable')} nameRef={nameInput}
                  onChange={values => change('variable', values)}/>
                  : <div className="candidate-structure-fields-grid">
                    <StructureNameField inputRef={nameInput} value={fields('name').name ?? entity?.name ?? ''} onChange={name => change('name', { name })}/>
                    {kind === 'scene' && !scene && <CandidateField label="所属章节">
                      <CandidateSelect value={fields('name').chapter ?? project.chapters[0]?.id ?? ''} required onValueChange={chapter => change('name', { chapter })}>{chapterOptions}</CandidateSelect>
                    </CandidateField>}
                  </div>}
              </CandidateFieldGroup>
              {operationTools('名称与定义操作', nameGroup,
                <CandidateButton type="submit" variant="primary" disabled={busy || readOnly || !mainDraft}>
                  {id ? kind === 'variable' ? '应用变量' : '应用名称' : `创建${kindLabels[kind]}`}
                </CandidateButton>)}
            </form>}
          {entity && !removal && oldRemovalDrafts.map(({ key, target, label }) => <CandidateToolbar key={key} label="未完成的移除审阅">
            <span className="candidate-structure-meta">{label} · 未应用的引用替换</span>
            {target && <CandidateButton disabled={readOnly} onClick={() => showRemoval(target)}>继续审阅</CandidateButton>}
            <CandidateButton onClick={() => discard([key])}>还原输入</CandidateButton>
          </CandidateToolbar>)}
        </CandidateSection>
        {(chapter || scene) && <CandidateSection title="目录位置" className="candidate-structure-position"
          actions={<CandidateToolbar label="调整目录顺序">
            <CandidateIconButton label="上移" disabled={busy || readOnly || (chapter ? chapterIndex : sceneIndex) < 1}
              onClick={() => submit(chapter ? { op: 'chapter.move', ids: [id], index: chapterIndex - 1 } :
                { op: 'scene.move', ids: [id], chapterId: scene!.chapterId, index: sceneIndex - 1 })}><ArrowUp size={15} aria-hidden="true"/></CandidateIconButton>
            <CandidateIconButton label="下移" disabled={busy || readOnly || (chapter ? chapterIndex >= project.chapters.length - 1 :
              !sceneChapter || sceneIndex >= sceneChapter.sceneIds.length - 1)}
              onClick={() => submit(chapter ? { op: 'chapter.move', ids: [id], index: chapterIndex + 1 } :
                { op: 'scene.move', ids: [id], chapterId: scene!.chapterId, index: sceneIndex + 2 })}><ArrowDown size={15} aria-hidden="true"/></CandidateIconButton>
          </CandidateToolbar>}>
          {chapter ? <p className="candidate-structure-meta">第 {chapterIndex + 1} 章 · {chapter.sceneIds.length} 个场景</p> : <>
            <div className="candidate-structure-inline">
            <CandidateFieldGroup disabled={busy || readOnly}>
              <CandidateField label="所属章节">
                <CandidateSelect value={moveChapterId} onValueChange={chapter => change('move', { chapter })}>{chapterOptions}</CandidateSelect>
              </CandidateField>
            </CandidateFieldGroup>
            {operationTools('场景移动操作', 'move', <CandidateButton disabled={busy || readOnly || !moveChapterId ||
              moveChapterId === scene!.chapterId && sceneIndex === (sceneChapter?.sceneIds.length ?? 0) - 1}
              onClick={() => submit({ op: 'scene.move', ids: [id], chapterId: moveChapterId }, 'move')}>移动到章节末尾</CandidateButton>)}
            </div>
            <p className="candidate-structure-meta">目录顺序用于组织内容。跳转和调用指令决定剧情顺序。</p>
          </>}
        </CandidateSection>}
        {scene && <>
          <CandidateSection title={isEntry ? '作品起点 · 当前场景' : '作品起点'} className="candidate-structure-entry">
            <div className="candidate-structure-inline">
            <CandidateFieldGroup disabled={busy || readOnly}>
              <CandidateField label="作品起点标签">
                <CandidateSelect value={entryLabel} onValueChange={label => change('entry', { label })}><option value="">场景开头</option>
                  {sceneLabels(documents, scene.id).map(label => <option key={label.id} value={label.id}>{label.name}</option>)}
                </CandidateSelect>
              </CandidateField>
            </CandidateFieldGroup>
            {operationTools('起点操作', 'entry', <CandidateButton disabled={busy || readOnly || isEntry && !draft('entry')}
              onClick={() => submit({ op: 'project.entry', sceneId: id, labelId: entryLabel || null }, 'entry')}>
              {isEntry ? '更新作品起点' : '设为作品起点'}</CandidateButton>)}
            </div>
          </CandidateSection>
          <StructureDeclarationFields scene={scene} documents={documents} draft={draft('declarations')} busy={busy} disabled={busy || readOnly}
            onChange={changeDeclarations} onDiscard={() => discard([draftKey(selected, 'declarations')])}
            onApply={() => {
              const declarations = draft('declarations')?.declarations;
              if (!declarations) return;
              try {
                if (declarations.locals.some(local => !local.name.trim())) throw new Error('请填写各局部变量名称。');
                submit(declarationOperation(scene.id, declarations), 'declarations');
              } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
            }}
            onReplace={(id, name) => showRemoval({ kind: 'local', id, name, sceneId: scene.id })}/>
        </>}
      </div>
    </div>
    {conflict && <StructureConflictDialog fields={conflict.fields} error={error} busy={busy} portal={portal}
      onDismiss={() => { setConflict(null); setError(''); }} onChoose={resolution => void run(conflict, resolution)}/>}
    {removal && <StructureRemovalDialog key={`${removal.kind}:${removal.id}`} store={store} documents={documents} project={project} scenes={scenes}
      variables={variables} target={removal} draft={draft(removalGroup)} busy={busy} error={error} portal={portal}
      onDismiss={() => { setRemoval(null); setError(''); }} onApply={operation => submit(operation, removalGroup)} onLocate={revealReference}/>}
    {copy && <CandidateReviewDialog open title={copy.source === 'chapter' ? '复制章节与场景' : '复制场景'}
      portal={portal} busy={busy} className="candidate-structure-review" onDismiss={() => { setCopy(null); setError(''); }}
      actions={<>
        <CandidateButton disabled={busy} onClick={() => { setCopy(null); setError(''); }}>取消</CandidateButton>
        <CandidateButton variant="primary" disabled={busy || !copy.name.trim() || copy.source === 'scene' && !copy.destination}
          onClick={() => submit(copy.source === 'chapter' ? { op: 'chapter.duplicate', id: copy.id, name: copy.name.trim() } :
            { op: 'scene.duplicate', id: copy.id, name: copy.name.trim(), chapterId: copy.destination })}>{busy ? '正在复制…' : '复制'}</CandidateButton>
      </>}>
      <CandidateFieldGroup disabled={busy}>
        <StructureNameField value={copy.name} onChange={name => setCopy({ ...copy, name })}/>
        {copy.source === 'scene' && <CandidateField label="复制到章节">
          <CandidateSelect value={copy.destination} onValueChange={destination => setCopy({ ...copy, destination })}>{chapterOptions}</CandidateSelect>
        </CandidateField>}
      </CandidateFieldGroup>
      {error && <p className="candidate-structure-error" role="alert">{error}</p>}
    </CandidateReviewDialog>}
  </section>;
}
