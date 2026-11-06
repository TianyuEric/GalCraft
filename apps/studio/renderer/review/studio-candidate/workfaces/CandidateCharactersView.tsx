import { useEffect, useRef, useState } from 'react';
import { Plus, Redo2, Trash2, Undo2, UserRound } from 'lucide-react';
import { createId, type ConnectionConfig, type Id } from '@galcraft/contracts';
import type { CharacterGuiDraft } from '../../../authoring/characters/CharacterManager.js';
import { characterDraft, characterEdit, mergeCharacterDraft, neutralCharacter, type CharacterDraft } from '../../../authoring/characters/model.js';
import { useCandidateState } from '../application/context.js';
import { CandidateButton, CandidateIconButton, CandidateInput, CandidateObjectRow, CandidateReviewDialog, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { CandidateAppearanceView } from './CandidateAppearanceView.js';
import { CandidateCharacterRelations } from './CandidateCharacterRelations.js';
import { CharacterProfile, CharacterRoute } from './character-profile.js';
import { CharacterDifferences, CharacterAfterstoryLayout } from './character-figures.js';
import { CharacterVoice } from './character-voice.js';
import { CharacterNumberDrafts, type CharacterNumberBuffers } from './character-number.js';
import { useDocumentVisibility } from './document-visibility.js';
import { pickWorkfaceAsset, resultValue, useFormalSource, useWorkfaceAssets, workfaceError, type CandidateWorkfaceProps } from './workface-helpers.js';
import '../styles/document-workfaces.css';
import '../styles/objects.css';
import '../styles/character-editor.css';

const modes = { profile: '资料', figures: '共同差分', composition: '组合外观', voice: '头像与声线', route: '个人路线', afterstory: '后日谈排布' } as const;
type CharacterMode = keyof typeof modes;
type CharacterProps = CandidateWorkfaceProps & { characterId?: string; viewId?: string };
type Resolution = 'draft' | 'current';

export function CandidateCharacterDirectory({ onNavigate }: CandidateWorkfaceProps) {
  const { store, source, error } = useFormalSource();
  const { activeView } = useCandidateState();
  const [filter, setFilter] = useState(() => store.viewState<string>('character-directory/filter') ?? '');
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState('');
  const characters = source?.characters ?? [];
  const matches = characters.filter(item => item.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  const create = async () => {
    if (busy || !source) return;
    setBusy(true); setFault('');
    try {
      const documents = store.host.list(), fresh = resultValue(await store.services.read(documents));
      const id = createId([documents]);
      let name = '新角色', index = 2;
      while (fresh.characters.some(item => item.name === name)) name = '新角色 ' + index++;
      const draft = characterDraft(neutralCharacter(id, name, fresh.project));
      resultValue(await store.applyEdit(characterEdit(fresh, documents, [draft])));
      setFilter(''); store.rememberViewState('character-directory/filter', '');
      onNavigate?.('character:' + id);
    } catch (reason) { setFault(workfaceError(reason)); } finally { setBusy(false); }
  };
  return <section className="candidate-object-sidebar" aria-label="角色目录">
    <header><h2>角色目录</h2><small>{characters.length}</small><CandidateIconButton label="新增角色" disabled={!source || busy} onClick={() => void create()}><Plus size={15}/></CandidateIconButton></header>
    <CandidateInput aria-label="搜索角色" placeholder="搜索角色" type="search" value={filter} onChange={event => {
      setFilter(event.target.value); store.rememberViewState('character-directory/filter', event.target.value);
    }}/>
    {(error || fault) && <p role="alert">{error || fault}</p>}
    {source && !characters.length && <p>新增角色后可配置资料和外观。</p>}
    {!!characters.length && !matches.length && <p role="status">没有匹配的角色。</p>}
    <nav aria-label="角色列表" className="candidate-object-list">
      {matches.map(character => {
        const id = 'character:' + character.id;
        return <CandidateObjectRow key={id} active={id === activeView} icon={<UserRound size={15}/>} title={character.name} onActivate={() => onNavigate?.(id)}/>;
      })}
    </nav>
    <CandidateCharacterRelations onNavigate={onNavigate}/>
  </section>;
}

export { CandidateStorySceneGraph } from './CandidateCharacterRelations.js';

export function CandidateCharactersView(props: CharacterProps) {
  if (!props.characterId) return <CandidateCharacterDirectory onNavigate={props.onNavigate}/>;
  return <CharacterObject key={props.viewId ?? props.characterId} {...props} characterId={props.characterId} viewId={props.viewId ?? 'character:' + props.characterId}/>;
}

function CharacterObject({ onNavigate, characterId, viewId }: CharacterProps & { characterId: Id; viewId: string }) {
  const { store, source, error } = useFormalSource();
  const { activeView, projectActive } = useCandidateState();
  const root = useRef<HTMLElement>(null);
  const visible = useDocumentVisibility(root, projectActive && !!source);
  const [mode, setMode] = useState<CharacterMode>(() => store.viewState<CharacterMode>(viewId + '/mode') ?? 'profile');
  const [draft, setDraft] = useState<CharacterDraft | undefined>(() => store.viewState<CharacterGuiDraft>(viewId)?.drafts[characterId]);
  const [numbers, setNumbers] = useState<CharacterNumberBuffers>(() => store.viewState<CharacterNumberBuffers>(viewId + '/numbers') ?? {});
  const base = useRef<CharacterDraft | undefined>(store.viewState<CharacterGuiDraft>(viewId)?.bases?.[characterId]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [connectionsError, setConnectionsError] = useState('');
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const { assets, error: catalogError } = useWorkfaceAssets(store.services, source?.assetIndexRevision);
  const bridge = store.tasks.production.bridge;
  const locale = store.controller.preferences.locale;
  const projectId = source?.project.projectId;
  const character = source?.characters.find(item => item.id === characterId);
  const current = draft ?? (character && characterDraft(character));
  const invalid = Object.values(numbers).some(value => value.invalid);
  const dirty = invalid || !!draft && JSON.stringify(draft) !== JSON.stringify(base.current);
  const selectedMode = mode === 'afterstory' && current?.narrativeRole !== 'main' ? 'route' : mode;
  const appearanceDocument = store.host.list().find(document => 'candidate/appearances.json' in document.files)?.documentId;
  const resolvedDocument = store.host.list().find(document => Object.hasOwn(document.files, "characters/" + characterId + ".json"));
  const lastDocumentId = useRef(store.viewState<string>(viewId + '/documentId') ?? characterId);
  const documentId = resolvedDocument?.documentId ?? lastDocumentId.current;
  const history = store.history(documentId);

  useEffect(() => {
    store.rememberViewState(viewId, {
      drafts: draft ? { [characterId]: draft } : {},
      bases: base.current ? { [characterId]: base.current } : {},
      selected: characterId, search: '',
    } satisfies CharacterGuiDraft);
    store.setViewPending(viewId, dirty);
  }, [store, viewId, characterId, draft, dirty]);
  useEffect(() => { lastDocumentId.current = documentId; store.rememberViewState(viewId + '/documentId', documentId); }, [store, viewId, documentId]);
  useEffect(() => store.rememberViewState(viewId + '/numbers', numbers), [store, viewId, numbers]);
  useEffect(() => store.rememberViewState(viewId + '/mode', mode), [store, viewId, mode]);
  useEffect(() => {
    if (activeView !== viewId) return;
    const target = selectedMode === 'composition' && appearanceDocument ? appearanceDocument : documentId;
    if (store.getSnapshot().commandTarget !== target) store.target(target);
  }, [activeView, selectedMode, viewId, appearanceDocument, documentId, store]);
  useEffect(() => {
    if (!projectId || !bridge.production) return;
    let active = true;
    void bridge.production.overview().then(result => {
      if (active) setConnections(resultValue(result).connections.filter(item => item.purposes.includes('speech')));
    }).catch(reason => { if (active) setConnectionsError(workfaceError(reason)); });
    return () => { active = false; };
  }, [bridge.production, projectId]);

  const change = (patch: Partial<CharacterDraft>) => {
    if (!current || busy) return;
    if (!draft) base.current = structuredClone(current);
    setDraft(previous => {
      const next = { ...(previous ?? current), ...patch };
      return JSON.stringify(next) === JSON.stringify(base.current) ? undefined : next;
    });
    setMessage(''); setStatus(''); setConflicts([]);
  };
  const reset = () => { base.current = undefined; setDraft(undefined); setNumbers({}); setMessage(''); setStatus(''); setConflicts([]); };
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setMessage(''); setStatus('');
    try { await task(); }
    catch (reason) { setMessage(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  const save = async (resolution?: Resolution) => {
    if (invalid) throw new Error('请修正角色表单中无效的数值输入。');
    if (!draft || !dirty) return true;
    const documents = store.host.list(), fresh = resultValue(await store.services.read(documents));
    const latest = fresh.characters.find(item => item.id === characterId);
    if (!latest) throw new Error('此角色已从作品移除。请撤销移除，或还原未应用输入。');
    const merged = base.current ? mergeCharacterDraft(base.current, draft, characterDraft(latest), resolution) : { value: draft, conflicts: [] };
    if (merged.conflicts.length && !resolution) { setConflicts(merged.conflicts); return false; }
    if (JSON.stringify(merged.value) !== JSON.stringify(characterDraft(latest))) {
      resultValue(await store.applyEdit(characterEdit(fresh, documents, [merged.value])));
      store.refreshFromHost();
    }
    reset(); setStatus('已应用到作品工作区。');
    return true;
  };
  const removeDifference = async (id: Id, replacementId?: Id) => {
    if (dirty) throw new Error('请先应用或还原角色输入，再处置差分引用。');
    resultValue(await store.authorOperation({ op: 'character.difference.remove', characterId, id, ...(replacementId ? { replacementId } : {}) }));
    store.refreshFromHost();
  };
  const openAsset = (id: Id) => onNavigate?.('assets:' + id);
  const resources = visible ? store.services.runtimeAssets : undefined;
  const notices = error || catalogError || message || (selectedMode === 'voice' ? connectionsError : '');
  const showForm = !!character && !!source && !!current;
  const pending = busy ? '正在处理…' : dirty ? '有未应用修改' : status;
  return <section ref={root} className="candidate-workface candidate-document-workface candidate-character-workface candidate-character-object" aria-label={character?.name ?? '角色'} aria-busy={busy}>
    <header className="candidate-character-heading">
      <div className="candidate-character-identity">
        <h2>{current?.name || (source ? '角色已移除' : '角色')}</h2>
        {showForm && <CandidateIconButton label="移除此角色" disabled={busy} onClick={() => setDeleting(true)}><Trash2 size={14}/></CandidateIconButton>}
      </div>
      {showForm && <CandidateToolbar label="角色工作内容" className="candidate-character-modes">
        {(Object.keys(modes) as CharacterMode[]).filter(key => key !== 'afterstory' || current.narrativeRole === 'main').map(key =>
          <CandidateButton key={key} aria-pressed={selectedMode === key} onClick={() => setMode(key)}>{modes[key]}</CandidateButton>)}
      </CandidateToolbar>}
    </header>
    {notices && <p className="candidate-workface-message" role="alert">{notices}</p>}
    {!source && !error && <CandidateState kind="loading" title="正在读取角色…"/>}
    {source && !showForm && <CandidateState kind="empty" title="此角色已从作品移除" description="可撤销移除或从目录打开其他角色。"
      action={<CandidateToolbar label="恢复角色"><CandidateButton disabled={!history.canUndo} onClick={() => void store.undo(documentId)}>撤销删除</CandidateButton><CandidateButton onClick={() => onNavigate?.('character-directory')}>角色目录</CandidateButton></CandidateToolbar>}/>}
    {showForm && <>
      {selectedMode !== 'composition' && <div className="candidate-document-scroll candidate-character-scroll">
        <CharacterNumberDrafts value={{ values: numbers, set: setNumbers }}><div className="candidate-character-fields">
          {selectedMode === 'profile' && <CharacterProfile current={current} assets={assets} locale={locale} disabled={busy} change={change}/>}
          {selectedMode === 'figures' && <CharacterDifferences current={current} original={character} assets={assets} resources={resources} locale={locale} disabled={busy} change={change} openAsset={openAsset} removeDifference={removeDifference}/>}
          {selectedMode === 'voice' && <CharacterVoice current={current} source={source} assets={assets} connections={connections} disabled={busy} change={change} openAsset={openAsset}
            chooseAvatar={() => pickWorkfaceAsset(store.services, root.current, { projectId: source.project.projectId, allowedKinds: ['image'], locale, characterId, currentAssetId: current.avatar ?? null, purpose: '角色默认阅读头像' })}
            inspect={bridge.connections?.test ? (connectionId, model) => bridge.connections.test({ connectionId, model, purpose: 'speech', imageUsage: null, workflowBindingId: null }) : undefined}
            createVoice={() => void store.tasks.openProduction('voice', { documentId, characterId }).catch(reason => setMessage(workfaceError(reason)))}/>}
          {selectedMode === 'route' && <CharacterRoute current={current} source={source} disabled={busy} change={change} previewScene={id => void run(async () => {
            if (await save()) { store.activateDocument(id); onNavigate?.('command-stage:' + id); }
          })}/>}
          {selectedMode === 'afterstory' && <CharacterAfterstoryLayout character={character} assets={assets} resources={resources} locale={locale} disabled={busy || dirty} commit={async presentation => {
            const documents = store.host.list(), fresh = resultValue(await store.services.read(documents));
            const owner = fresh.characters.find(item => item.id === characterId);
            if (!owner?.afterstory) throw new Error('请先配置角色后日谈。');
            const patch = { kind: 'json' as const, documentId, changes: [{ op: 'set' as const, path: '/data/afterstory', before: owner.afterstory, after: { ...owner.afterstory, presentation } }] };
            resultValue(await store.applyEdit({ label: '修改后日谈排布', origin: 'field',
              expected: [{ ref: { kind: 'document', id: documentId }, revision: documents.find(item => item.documentId === documentId)?.revision ?? 0 }],
              patches: [patch], preparedAssets: [], requiredRefs: [{ kind: 'asset', id: presentation.figure.assetId }] }));
            store.refreshFromHost();
          }}/>}
        </div></CharacterNumberDrafts>
      </div>}
      <div className="candidate-composition-slot" hidden={selectedMode !== 'composition'}><CandidateAppearanceView characterId={characterId} viewId={viewId} onOpen={id => onNavigate?.(id)}/></div>
    </>}
    {(showForm && selectedMode !== 'composition' || dirty) && <footer className="candidate-character-footer">
      <CandidateToolbar label="角色修改历史">
        <CandidateIconButton label="撤销" disabled={busy || dirty || !history.canUndo} onClick={() => void store.undo(documentId)}><Undo2 size={14}/></CandidateIconButton>
        <CandidateIconButton label="重做" disabled={busy || dirty || !history.canRedo} onClick={() => void store.redo(documentId)}><Redo2 size={14}/></CandidateIconButton>
      </CandidateToolbar>
      <span role="status">{pending}</span>
      {dirty && <CandidateButton disabled={busy} onClick={reset}>还原未应用输入</CandidateButton>}
      {showForm && <CandidateButton variant="primary" disabled={busy || !dirty} onClick={() => void run(async () => { await save(); })}>应用修改</CandidateButton>}
    </footer>}
    {!!conflicts.length && <CandidateReviewDialog open title="角色字段已变更" description="这些字段已由其他操作修改。请选择要应用的值。" onDismiss={() => { if (!busy) setConflicts([]); }}
      actions={<><CandidateButton disabled={busy} onClick={() => setConflicts([])}>继续编辑</CandidateButton><CandidateButton disabled={busy} onClick={() => void run(async () => { await save('current'); })}>采用当前冲突字段</CandidateButton><CandidateButton variant="primary" disabled={busy} onClick={() => void run(async () => { await save('draft'); })}>采用我的冲突字段</CandidateButton></>}>
      <ul>{conflicts.map(field => <li key={field}>{field}</li>)}</ul>
      {message && <p role="alert">{message}</p>}
    </CandidateReviewDialog>}
    {deleting && <CandidateReviewDialog open title="移除角色" description={'将从作品移除「' + character?.name + '」。如有其他对象引用此角色，请先解除引用。' + (dirty ? '移除成功后将清除此角色的未应用输入。' : '')}
      onDismiss={() => { if (!busy) setDeleting(false); }}
      actions={<><CandidateButton disabled={busy} onClick={() => setDeleting(false)}>取消</CandidateButton><CandidateButton variant="danger" disabled={busy} onClick={() => void run(async () => {
        resultValue(await store.authorOperation({ op: 'character.remove', id: characterId }));
        store.refreshFromHost(); reset(); setDeleting(false);
      })}>移除</CandidateButton></>}>{message && <p role="alert">{message}</p>}</CandidateReviewDialog>}
  </section>;
}
