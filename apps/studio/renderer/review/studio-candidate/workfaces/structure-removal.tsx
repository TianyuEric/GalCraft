import { useEffect, useState } from 'react';
import { ArrowUpRight, FileText } from 'lucide-react';
import type { CommandSpec, DocumentView, Project, Scene, Variable } from '@galcraft/contracts';
import { prepareAuthoringEdit, type AuthorOperation, type AuthoringReference } from '@galcraft/documents/authoring';
import type { CandidateSession } from '../application/session.js';
import { documentData } from '../application/documents.js';
import { extendCandidateAuthoringEdit } from '../application/authoring-extensions.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateReviewDialog, CandidateSelect, CandidateState } from '../components/controls/index.js';
import { removalReferences, scenePath, type RemovalTarget, type StructureDraft, typeLabels, variablePath } from './structure-operations.js';

export function StructureRemovalDialog({ store, documents, project, scenes, variables, target, draft, busy, error, portal, onDismiss, onApply, onLocate }: {
  store: CandidateSession;
  documents: DocumentView[];
  project: Project;
  scenes: Scene[];
  variables: Variable[];
  target: RemovalTarget;
  draft?: StructureDraft;
  busy: boolean;
  error: string;
  portal: HTMLElement | null;
  onDismiss(): void;
  onApply(operation: AuthorOperation): void;
  onLocate(ref: AuthoringReference): void;
}) {
  const [specs, setSpecs] = useState<CommandSpec[] | null>(null), [specError, setSpecError] = useState('');
  const [selection, setSelection] = useState(() => draft?.fields?.[target.kind === 'local' ? `local-${target.id}` :
    target.kind === 'chapter' ? 'destination' : 'replacement'] ?? '');
  const [removeArguments, setRemoveArguments] = useState(() => draft?.fields?.[`arguments-${target.id}`] === 'remove');
  const [versionChanged, setVersionChanged] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await store.services.bridge.plugins.commandSpecs?.();
        if (!active) return;
        if (result && !result.ok) setSpecError(result.error.message);
        else setSpecs(result?.value ?? []);
      } catch (cause) { if (active) setSpecError(cause instanceof Error ? cause.message : String(cause)); }
    }
    void load();
    return () => { active = false; };
  }, [store]);
  const chapter = target.kind === 'chapter' ? project.chapters.find(chapter => chapter.id === target.id) : undefined;
  const owner = target.kind === 'local' ? scenes.find(scene => scene.id === target.sceneId) : undefined;
  const sourceScene = target.kind === 'scene' ? scenes.find(scene => scene.id === target.id) : undefined;
  const name = chapter?.name ?? sourceScene?.name ?? owner?.locals.find(local => local.id === target.id)?.name ??
    variables.find(variable => variable.id === target.id)?.name ?? target.id;
  const needsDestination = Boolean(chapter?.sceneIds.length);
  const isParameter = owner?.parameters.some(parameter => parameter.variableId === target.id);
  const operation: AuthorOperation | null = target.kind === 'chapter'
    ? !needsDestination || selection ? { op: 'chapter.remove', id: target.id, ...(selection ? { destinationChapterId: selection } : {}) } : null
    : target.kind === 'scene' ? { op: 'scene.remove', id: target.id, ...(selection ? { replacementId: selection } : {}) }
    : selection ? { op: 'variable.replace', id: target.id, replacementId: selection, ...(removeArguments ? { parameterArguments: 'remove' } : {}) }
    : target.kind === 'variable' ? { op: 'variable.remove', id: target.id } : null;
  const plan = (docs: DocumentView[]) => {
    if (!operation || !specs) return null;
    const prepared = prepareAuthoringEdit(docs.filter(document => !Object.keys(document.files).some(path => path.startsWith('candidate/'))), operation, specs);
    return prepared.ok ? extendCandidateAuthoringEdit(docs, operation, prepared.value) : prepared;
  };
  const planned = plan(documents), patchIds = new Set(planned?.ok ? planned.value.patches.map(patch => patch.documentId) : []);
  const { direct, owned } = removalReferences(documents, target);
  const refs = [...direct, ...owned];
  const invalid = [...patchIds].some(id => store.host.sourceIsInvalid(id));
  const canApply = !!planned?.ok && !invalid && !busy;
  const refScenes = new Map(documents.flatMap(document => scenes.flatMap(scene =>
    scenePath(scene.id) in document.files ? [[document.documentId, scene] as const] : [])));
  const summary = needsDestination ? chapter?.sceneIds.map(id => scenes.find(scene => scene.id === id)?.name ?? id).join('、') : '';
  const affected = documents.filter(document => patchIds.has(document.documentId)).map(document => {
    const path = Object.keys(document.files)[0];
    if (path === 'project.json') return '作品';
    const scene = refScenes.get(document.documentId);
    if (scene) return scene.name;
    const variable = variables.find(item => variablePath(item.id) === path);
    if (variable) return variable.name;
    const sidecar = /^candidate\/scenes\/(.+)\.json$/.exec(path ?? '')?.[1];
    return sidecar ? `${scenes.find(scene => scene.id === sidecar)?.name ?? sidecar} · 场景附属数据` : path;
  });

  function confirm() {
    if (!canApply || !planned?.ok || !operation) return;
    const fresh = plan(store.host.list());
    if (!fresh?.ok || JSON.stringify(fresh.value.expected) !== JSON.stringify(planned.value.expected)) {
      setVersionChanged(true);
      return;
    }
    onApply(operation);
  }

  return <CandidateReviewDialog open title={`移除「${name}」`} portal={portal} busy={busy} onDismiss={onDismiss}
    className="candidate-structure-review" description={selection ? '工作区会在同一事务中移除原对象并更新对应引用。' : '查看移除后受影响的对象及引用。'}
    actions={<><CandidateButton disabled={busy} onClick={onDismiss}>取消</CandidateButton>
      <CandidateButton variant="danger" disabledReason={!canApply && !busy ? '请先处理审阅中列出的影响。' : undefined} disabled={busy}
        onClick={confirm}>{busy ? '正在应用…' : selection && target.kind !== 'chapter' ? '替换引用并移除' : '确认移除'}</CandidateButton></>}>
    <CandidateFieldGroup disabled={busy}>
      {needsDestination && <CandidateField label="现有场景移入" hint={summary}>
        <CandidateSelect value={selection} onValueChange={setSelection}><option value="">选择去向</option>
          {project.chapters.filter(item => item.id !== target.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </CandidateSelect>
      </CandidateField>}
      {target.kind === 'scene' && <CandidateField label="引用替换为">
        <CandidateSelect value={selection} onValueChange={setSelection}><option value="">无替代</option>
          {scenes.filter(item => item.id !== target.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </CandidateSelect>
      </CandidateField>}
      {(target.kind === 'variable' || target.kind === 'local') && <CandidateField label="引用替换为">
        <CandidateSelect value={selection} onValueChange={setSelection}><option value="">{target.kind === 'local' ? '选择替换变量' : '无替代'}</option>
          {variables.filter(item => item.id !== target.id).map(item => <option key={item.id} value={item.id}>{item.name} · {typeLabels[item.type]}</option>)}
          {scenes.flatMap(scene => scene.locals.filter(item => item.id !== target.id).map(item =>
            <option key={item.id} value={item.id}>{item.name} · {typeLabels[item.type]} · {scene.name}</option>))}
        </CandidateSelect>
      </CandidateField>}
      {isParameter && <label className="candidate-structure-checkbox">
        <CandidateCheckbox checked={removeArguments} onChange={event => setRemoveArguments(event.target.checked)}/>同时移除各调用方的对应实参
      </label>}
    </CandidateFieldGroup>
    {!specs && !specError && <CandidateState kind="loading" title="正在核对引用与受影响文档"/>}
    {needsDestination && !selection && <p>先选择接收场景的章节。</p>}
    {target.kind === 'local' && !selection && <p>请选择替换变量。直接编辑局部声明可从场景的声明组进入。</p>}
    {!!refs.length && <div className="candidate-structure-impact">
      <h3>相关引用 <small>{refs.length}</small></h3>
      {!!owned.length && <p>场景内部身份被外部引用。先处理这些来源，再移除场景。</p>}
      <ul>{refs.map((ref, index) => {
        const scene = refScenes.get(ref.documentId);
        return <li key={`${ref.documentId}:${ref.field}:${index}`}>
          <FileText size={14} aria-hidden="true"/><span><strong>{scene?.name ?? ref.path}</strong><small>{ref.field}</small></span>
          {scene && <CandidateButton disabled={busy} onClick={() => onLocate(ref)}>定位<ArrowUpRight size={13} aria-hidden="true"/></CandidateButton>}
        </li>;
      })}</ul>
    </div>}
    {!!affected.length && <div className="candidate-structure-impact"><h3>本次更新</h3><ul>{affected.map((label, index) =>
      <li key={`${label}:${index}`}><FileText size={14} aria-hidden="true"/>{label}</li>)}</ul></div>}
    {(!planned?.ok && planned?.error || invalid || versionChanged || error || specError) &&
      <p role="alert" className="candidate-structure-error">{error || specError || (versionChanged ? '工作区有更新，请重新审阅当前影响。' :
        invalid ? '受影响的场景含无效源码。请先在源码中修复。' : !planned?.ok ? planned?.error.message : '')}</p>}
  </CandidateReviewDialog>;
}
