import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateObjectRow, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { useEffect, useState, type FormEvent } from 'react';
import { Braces, FilePlus2, FileText, Flag, Folder, FolderPlus, Network, Search, Settings2 } from 'lucide-react';
import type { Scene, Variable } from '@galcraft/contracts';
import type { AuthorOperation } from '@galcraft/documents/authoring';
import { useCandidate, useCandidateState } from '../application/context.js';
import { authoringSource, documentData } from '../application/documents.js';
import { openStructureTarget, type StructureTarget } from './CandidateStructureView.js';
import '../styles/navigation.css';

type Creation = { kind: 'chapter' | 'global' } | { kind: 'scene' | 'local'; parentId: string };
type Destination = { view: string; structure?: StructureTarget };
const names = { chapter: '新建章节', scene: '新建场景', global: '新建作品变量', local: '新建局部变量' } as const;

export function CandidateOutlineView({ onOpen }: { onOpen(id: string): void }) {
  const store = useCandidate(), { project, ui } = useCandidateState();
  const [query, setQuery] = useState(() => store.viewState<string>('outline:query') ?? '');
  const [creation, setCreation] = useState<Creation | null>(null), [name, setName] = useState('');
  const [type, setType] = useState<Variable['type']>('number'), [scope, setScope] = useState<'progress' | 'longTerm'>('progress');
  const [initial, setInitial] = useState('0'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [destination, setDestination] = useState<Destination | null>(null);
  const chapters = store.controller.source?.project.chapters ?? [];
  const assigned = new Set(chapters.flatMap(chapter => chapter.sceneIds));
  const unassigned = project.scenes.filter(scene => !assigned.has(scene.id));
  const groups = [...chapters, ...(unassigned.length ? [{ id: '', name: '未分章场景', sceneIds: unassigned.map(scene => scene.id) }] : [])];
  const needle = query.trim().toLocaleLowerCase();
  const filtered = groups.flatMap(chapter => {
    const titleMatches = chapter.name.toLocaleLowerCase().includes(needle);
    const scenes = chapter.sceneIds.flatMap(id => {
      const scene = project.scenes.find(item => item.id === id);
      return scene && (titleMatches || scene.name.toLocaleLowerCase().includes(needle)) ? [scene] : [];
    });
    return titleMatches || scenes.length ? [{ ...chapter, scenes }] : [];
  });

  useEffect(() => {
    if (!destination) return;
    if (destination.structure) openStructureTarget(store, destination.structure);
    onOpen(destination.view);
    setDestination(null);
  }, [destination, onOpen, store]);

  function begin(next: Creation) {
    setCreation(next); setName(''); setType('number'); setScope('progress'); setInitial('0'); setError('');
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creation || busy || !name.trim()) return;
    const title = name.trim(), currentDocs = store.host.list(), before = authoringSource(currentDocs);
    const initialValue = type === 'number' ? Number(initial) : type === 'boolean' ? initial === 'true' : initial;
    let operation: AuthorOperation;
    if (creation.kind === 'chapter') operation = { op: 'chapter.create', name: title };
    else if (creation.kind === 'scene' && 'parentId' in creation) operation = { op: 'scene.create', chapterId: creation.parentId, name: title };
    else if (creation.kind === 'global') operation = { op: 'variable.create', name: title, type, scope, initial: initialValue };
    else if (creation.kind === 'local' && 'parentId' in creation) {
      const parent = documentData<Scene>(currentDocs, `scenes/${creation.parentId}/scene.json`);
      if (!parent) { setError('场景已移除，请重新选择。'); return; }
      if (parent.locals.some(local => local.name === title)) { setError('此场景已有同名局部变量。'); return; }
      operation = { op: 'scene.declarations', id: parent.id, returns: parent.returns, locals: [
        ...parent.locals.map(({ id, name, type, initial }) => {
          const parameter = parent.parameters.find(item => item.variableId === id);
          return { id, name, type, initial, ...(parameter ? { parameter: { required: parameter.required, defaultValue: parameter.defaultValue } } : {}) };
        }), { name: title, type, initial: initialValue },
      ] };
    } else return;
    setBusy(true); setError('');
    try {
      const result = await store.authorOperation(operation);
      if (!result.ok) { setError(result.error.message); return; }
      const after = authoringSource(store.host.list());
      if (operation.op === 'chapter.create') {
        const id = after.project.chapters.find(item => item.name === title && !before.project.chapters.some(prior => prior.id === item.id))?.id;
        if (id) setDestination({ view: 'structure', structure: { kind: 'chapter', id } });
      } else if (operation.op === 'scene.create') {
        const id = after.scenes.find(item => item.name === title && item.chapterId === operation.chapterId && !before.scenes.some(prior => prior.sceneId === item.sceneId))?.sceneId;
        if (id) setDestination({ view: `writing:${id}` });
      } else if (operation.op === 'variable.create' || operation.op === 'scene.declarations') {
        const id = after.variables?.find(item => item.name === title && item.declaringSceneId === (operation.op === 'scene.declarations' ? operation.id : null) && !before.variables?.some(prior => prior.id === item.id))?.id;
        if (id) setDestination({ view: 'structure', structure: operation.op === 'scene.declarations' ? { kind: 'local', id, sceneId: operation.id, name: title } : { kind: 'variable', id } });
      }
      setCreation(null); setQuery(''); store.rememberViewState('outline:query', '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  const openStartup = () => {
    store.rememberViewState('settings:section', 'startup');
    store.rememberViewState('settings:sectionRequest', { section: 'startup', serial: (store.viewState<{ serial: number }>('settings:sectionRequest')?.serial ?? 0) + 1 });
    onOpen('settings');
  };
  const form = creation && <form className="candidate-outline-create" aria-label={names[creation.kind]} onSubmit={event => void create(event)}>
    <CandidateFieldGroup disabled={busy} title={names[creation.kind]}>
      <CandidateField label="名称"><CandidateInput autoFocus required value={name} onChange={event => setName(event.target.value)}/></CandidateField>
      {(creation.kind === 'global' || creation.kind === 'local') && <>
        {creation.kind === 'global' && <CandidateField label="作用域"><CandidateSelect value={scope} onValueChange={value => setScope(value as typeof scope)}><option value="progress">进度变量</option><option value="longTerm">长期变量</option></CandidateSelect></CandidateField>}
        <CandidateField label="类型"><CandidateSelect value={type} onValueChange={value => { const next = value as Variable['type']; setType(next); setInitial(next === 'number' ? '0' : next === 'boolean' ? 'false' : ''); }}><option value="number">数字</option><option value="boolean">布尔</option><option value="string">文字</option></CandidateSelect></CandidateField>
        <CandidateField label="初值">{type === 'boolean' ? <CandidateSelect value={initial} onValueChange={value => setInitial(value)}><option value="false">否</option><option value="true">是</option></CandidateSelect> : <CandidateInput type={type === 'number' ? 'number' : 'text'} required={type === 'number'} step={type === 'number' ? 'any' : undefined} value={initial} onChange={event => setInitial(event.target.value)}/>}</CandidateField>
      </>}
      {error && <p role="alert">{error}</p>}
      <CandidateToolbar label="创建操作"><CandidateButton variant="primary" type="submit" disabled={!name.trim()}>{busy ? '正在创建…' : '创建'}</CandidateButton><CandidateButton type="button" onClick={() => setCreation(null)}>取消</CandidateButton></CandidateToolbar>
    </CandidateFieldGroup>
  </form>;

  return <aside className="candidate-explorer candidate-story-outline" aria-label="剧情目录">
    <CandidateToolbar className="candidate-outline-actions" label="剧情目录操作">
      <span>{project.scenes.length} 个场景</span>
      <CandidateIconButton disabled={busy} label="新建章节" onClick={() => begin({ kind: 'chapter' })}><FolderPlus size={15}/></CandidateIconButton>
      <CandidateIconButton disabled={busy} label="新建作品变量" onClick={() => begin({ kind: 'global' })}><Braces size={15}/></CandidateIconButton>
    </CandidateToolbar>
    <CandidateInput density="compact" type="search" aria-label="查找章节或场景" placeholder="查找章节或场景" value={query} onChange={event => { setQuery(event.target.value); store.rememberViewState('outline:query', event.target.value); }}/>
    {(creation?.kind === 'chapter' || creation?.kind === 'global') && form}
    <nav aria-label="章节与场景" className="candidate-outline-tree">{filtered.map(chapter => <CandidateSection
      key={`${chapter.id}:${needle ? 'search' : 'browse'}`} className="candidate-outline-chapter" collapsible
      title={<><Folder size={14} aria-hidden="true"/><span>{chapter.name}</span><small>{chapter.scenes.length}</small></>}>
      {chapter.scenes.map(scene => <div key={scene.id} className="candidate-outline-scene">
        <CandidateObjectRow title={scene.name} icon={<FileText size={15}/>} metadata={`${scene.lines.length} 句`}
          active={scene.id === ui.sceneId} onActivate={() => onOpen(`writing:${scene.id}`)}
          actions={<CandidateIconButton disabled={busy} label={`${scene.name}：新建局部变量`} title="新建局部变量"
            onClick={() => begin({ kind: 'local', parentId: scene.id })}><Braces size={14}/></CandidateIconButton>}/>
        {creation?.kind === 'local' && 'parentId' in creation && creation.parentId === scene.id && form}
      </div>)}
      {!!chapter.id && <CandidateButton className="candidate-outline-new-scene" disabled={busy} aria-label={`${chapter.name}：新建场景`}
        onClick={() => begin({ kind: 'scene', parentId: chapter.id })}><FilePlus2 size={14}/>新建场景</CandidateButton>}
      {creation?.kind === 'scene' && 'parentId' in creation && creation.parentId === chapter.id && form}
    </CandidateSection>)}</nav>
    {!filtered.length && <CandidateState kind="empty" title={needle ? '没有匹配的章节或场景' : '先新建章节，再添加场景'}/>}
    <CandidateToolbar label="剧情工具" className="candidate-outline-tools">
      <CandidateButton onClick={() => onOpen('structure')}><Settings2 size={14}/>剧情结构与变量</CandidateButton>
      <CandidateButton onClick={openStartup}><Flag size={14}/>启动与主页</CandidateButton>
      <CandidateButton onClick={() => onOpen('scene-graph')}><Network size={14}/>故事场景图</CandidateButton>
      <CandidateButton onClick={() => onOpen('search')}><Search size={14}/>语义查找</CandidateButton>
    </CandidateToolbar>
  </aside>;
}
