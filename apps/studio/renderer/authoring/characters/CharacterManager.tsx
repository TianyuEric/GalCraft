import type { AuthorOperation } from '@galcraft/documents/authoring';
import { createId } from '@galcraft/contracts';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Asset, Character, Id, Result } from '@galcraft/contracts';
import { Plus, Redo2, Search, Trash2, Undo2, UsersRound } from 'lucide-react';
import { Button, Field, Modal } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { MessageBox } from '../../components/workbench/MessageBox.js';
import { Textarea } from '../../components/ui/textarea.js';
import { tr } from '../../pages/Production/Production.js';
import type { AuthoringSource, StudioLocale } from '../controller.js';
import { characterDraft, endingOptions, mergeCharacterDraft, neutralCharacter, normalizeCharacterVoicePresets, type CharacterDraft } from './model.js';
import { VoicePresetEditor } from './VoicePresetEditor.js';
import { SharedDifferencesEditor, type DifferenceResources } from './SharedDifferencesEditor.js';
import { CharacterFigureGallery } from './CharacterFigureGallery.js';
import { AfterstoryEditor } from './AfterstoryEditor.js';
import { CharacterAppearanceEditor } from './CharacterAppearanceEditor.js';
import './characters.css';

export type CharacterGuiDraft = { drafts: Record<Id, CharacterDraft>; bases?: Record<Id, CharacterDraft>; selected: Id | null; search: string };
export type CharacterManagerProps = {
  source: AuthoringSource; locale: StudioLocale; close(): void;
  authorOperation?(operation:AuthorOperation):Promise<Result<AuthoringSource>>;
  apply(drafts: CharacterDraft[]): Promise<Result<AuthoringSource>>;
  remove(id: Id): Promise<Result<AuthoringSource>>;
  history(action: 'undo' | 'redo'): Promise<Result<AuthoringSource>>;
  embedded?: boolean; pendingChanged?(dirty: boolean): void;
  guiDraft?: CharacterGuiDraft | null; onGuiDraftChange?(draft: CharacterGuiDraft): void;
  discardDraft?: { characterId: string; request: number };
  explorerContainer?: HTMLElement; selectedId?: Id; selectCharacter?(id: Id, name: string): void;
  voiceConnections?: import('@galcraft/contracts').ConnectionConfig[];
  inspectVoiceConnection?(connectionId: string, model: string): Promise<Result<import('@galcraft/contracts').CapabilityReport>>;
  runtimeAssets?: DifferenceResources; previewScene?(sceneId: Id, entryId?: Id): void;
  assets?: Asset[]; inspectAsset?(id: Id): void; previewAsset?(id: Id): void;
  chooseAvatar?(characterId: Id, currentId: Id | null): Promise<Id | undefined>;
};
function CharacterFrame({ embedded, title, close, children }: { embedded?: boolean; title: string; close(): void; children: ReactNode }) {
  return embedded ? <section className="character-document-editor" aria-label={title}>{children}</section> : <Modal title={title} wide close={close}>{children}</Modal>;
}
export function CharacterManager({ source: initialSource, locale, close, apply, remove, history, authorOperation, embedded, pendingChanged, guiDraft, onGuiDraftChange, discardDraft, explorerContainer, selectedId, selectCharacter, assets = [], inspectAsset, previewAsset, chooseAvatar, voiceConnections = [], inspectVoiceConnection, runtimeAssets, previewScene }: CharacterManagerProps) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const [source, setSource] = useState(initialSource), [drafts, setDrafts] = useState<Record<Id, CharacterDraft>>(guiDraft?.drafts ?? {});
  const bases = useRef<Record<Id, CharacterDraft>>(guiDraft?.bases ?? Object.fromEntries(initialSource.characters.map(character => [character.id, characterDraft(character)])));
  const [selected, setSelected] = useState<Id | null>(guiDraft?.selected ?? initialSource.characters[0]?.id ?? null), [search, setSearch] = useState(guiDraft?.search ?? '');
  useEffect(() => { onGuiDraftChange?.({ drafts, bases: bases.current, selected, search }); }, [drafts, selected, search, onGuiDraftChange]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [closing, setClosing] = useState(false), [deleting, setDeleting] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(false), [canRedo, setCanRedo] = useState(false);
  const characters = [...source.characters.map(character => drafts[character.id] ?? characterDraft(character)),
    ...Object.values(drafts).filter(draft => !source.characters.some(character => character.id === draft.id))];
  const dirty = Object.values(drafts).filter(draft => { const original = source.characters.find(character => character.id === draft.id); return !original || JSON.stringify(characterDraft(original)) !== JSON.stringify(draft); });
  useEffect(() => { pendingChanged?.(dirty.length > 0); }, [dirty.length > 0]);
  useEffect(() => { setSource(initialSource); }, [initialSource]);
  useEffect(() => { if (selectedId) setSelected(selectedId); }, [selectedId]);
  useEffect(() => { if (discardDraft) setDrafts(previous => { const next = { ...previous }; delete next[discardDraft.characterId]; return next; }); }, [discardDraft?.request]);
  const current = characters.find(character => character.id === selected) ?? null;
  const original = source.characters.find(character => character.id === selected);
  const [section, setSection] = useState('basics');
  const choose = (id: Id, name: string) => { setSelected(id); selectCharacter?.(id, name); };
  const endings = useMemo(() => endingOptions(source), [source]);
  const roleName = (role: Character['narrativeRole']) => role === 'viewpoint' ? t('玩家视角', 'Viewpoint', 'プレイヤー視点')
    : role === 'main' ? t('主角色', 'Main character', 'メインキャラクター') : role === 'supporting' ? t('配角', 'Supporting', 'サブキャラクター') : t('未分类', 'Unclassified', '未分類');
  const change = (patch: Partial<CharacterDraft>) => { if (current) { if (!drafts[current.id]) bases.current[current.id] = structuredClone(current); setDrafts(previous => ({ ...previous, [current.id]: { ...current, ...patch } })); setSaved(false); setError(''); setConflicts([]); } };
  const add = () => {
    const id = createId([source, drafts]), base = t('新角色', 'New character', '新しいキャラクター');
    let name = base, suffix = 2; while (characters.some(character => character.name === name)) name = `${base} ${suffix++}`;
    setDrafts(previous => ({ ...previous, [id]: { id, name, description: '', narrativeRole: 'supporting' } })); choose(id,name); setSearch(''); setSaved(false);
  };
  const accept = (result: Result<AuthoringSource>) => { if (!result.ok) { setError(result.error.message); return false; } setSource(result.value); return true; };
  const save = async (thenClose = false, propagate = false, resolution?: 'draft' | 'current') => {
    setBusy(true); setError('');
    try {
      const merged = dirty.map(draft => { const latest = initialSource.characters.find(character => character.id === draft.id), base = bases.current[draft.id];
        return latest && base ? mergeCharacterDraft(base, draft, characterDraft(latest), resolution) : { value: draft, conflicts: [] }; });
      const fields = merged.flatMap((result, index) => result.conflicts.map(field => `${dirty[index]!.name}: ${field}`));
      if (fields.length && !resolution) { setConflicts(fields); throw new Error(t('相同字段已由其他操作修改。保留了你的输入，请选择采用哪一份。', 'The same fields changed elsewhere. Your input is retained; choose which values to apply.', '同じ項目が別の操作で変更されました。入力を保持しています。適用する値を選択してください。')); }
      const result = await apply(merged.map(result => result.value)); if (!result.ok) throw new Error(result.error.message); accept(result); setDrafts({}); bases.current = Object.fromEntries(result.value.characters.map(character => [character.id, characterDraft(character)])); setConflicts([]); setSaved(true); setCanUndo(true); setCanRedo(false); setClosing(false); if (thenClose) close(); }
    catch (reason) { if (propagate) throw reason; setError(String(reason)); } finally { setBusy(false); }
  };
  const removeCurrent = async () => {
    if (!current) return;
    setBusy(true); setError('');
    try {
      const existing = source.characters.some(character => character.id === current.id);
      if (existing) { const result = await remove(current.id); if (!result.ok) throw new Error(result.error.message); accept(result); }
      setDrafts(previous => { const next = { ...previous }; delete next[current.id]; return next; });
      setSelected(characters.find(character => character.id !== current.id)?.id ?? null); setDeleting(false);
      if (existing) { setCanUndo(true); setCanRedo(false); }
    } finally { setBusy(false); }
  };
  const replay = async (action: 'undo' | 'redo') => {
    setBusy(true); setError('');
    try { if (accept(await history(action))) { setDrafts({}); setSaved(false); setCanUndo(action === 'redo'); setCanRedo(action === 'undo'); } }
    catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  const selectedScenes = current?.personalRoute?.sceneIds ?? [], selectedEndings = current?.personalRoute?.endingIds ?? [];
  const routeIncomplete = current?.narrativeRole === 'main' && (!selectedScenes.length || !selectedEndings.length
    || selectedScenes.some(id => !source.scenes.some(scene => scene.sceneId === id)) || selectedEndings.some(id => !endings.some(ending => ending.id === id)));
  const checkScene = (id: Id, checked: boolean) => change({ personalRoute: { sceneIds: checked ? [...selectedScenes, id] : selectedScenes.filter(item => item !== id), endingIds: selectedEndings } });
  const checkEnding = (id: string, checked: boolean) => change({ personalRoute: { sceneIds: selectedScenes, endingIds: checked ? [...selectedEndings, id] : selectedEndings.filter(item => item !== id) } });
  const list = <aside className="character-manager-list"><div className="character-list-heading"><strong><UsersRound size={16} />{t('角色', 'Characters', 'キャラクター')} <small>{characters.length}</small></strong>
        <Button aria-label={t('新增角色', 'Add character', 'キャラクターを追加')} title={t('新增角色', 'Add character', 'キャラクターを追加')} disabled={busy} onClick={add}><Plus size={16} /></Button></div>
        <label className="character-search"><Search size={15} /><Input aria-label={t('搜索角色', 'Search characters', 'キャラクターを検索')} placeholder={t('搜索角色', 'Search characters', 'キャラクターを検索')} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <nav aria-label={t('角色列表', 'Character list', 'キャラクター一覧')}>{characters.filter(character => character.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(character =>
          <button key={character.id} aria-current={selected === character.id ? 'true' : undefined} className={selected === character.id ? 'selected' : ''} onClick={() => choose(character.id,character.name)} disabled={busy}>
            <span className="character-monogram" aria-hidden="true">{character.name.slice(0, 1) || '·'}</span><span><strong>{character.name || t('未命名', 'Untitled', '名称未設定')}</strong><small>{roleName(character.narrativeRole)}</small></span>
            {dirty.some(draft => draft.id === character.id) && <i title={t('待应用', 'Pending changes', '未適用')} />}</button>)}</nav>
        {!characters.length ? <p>{t('添加你的第一位角色。', 'Add your first character.', '最初のキャラクターを追加しましょう。')}</p> : !characters.some(character => character.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p role="status">{t('没有匹配的角色', 'No matching characters', '一致するキャラクターがありません')} <button type="button" onClick={() => setSearch('')}>{t('清除搜索', 'Clear search', '検索を解除')}</button></p>}
      </aside>;
  return <><CharacterFrame embedded={embedded} title={t('全局角色管理', 'Project characters', '作品のキャラクター')} close={() => !busy && (dirty.length ? setClosing(true) : close())}>
    <div className="character-manager" data-explorer-external={!!explorerContainer}>
      {explorerContainer ? createPortal(list, explorerContainer) : list}
      <section className="character-manager-detail">
        <p className="character-manager-intro">{t('这里的身份分类用于整个作品，包括对白、AI 创作资料和后日谈资格。', 'These roles apply throughout the project, including dialogue, AI context and afterstory eligibility.', '分類はセリフ、AI の創作資料、後日談の対象を含む作品全体に適用されます。')}</p>
        {error && <p role="alert" className="character-error">{error}</p>}
        {!!conflicts.length && <section><p>{conflicts.join(' · ')}</p><div className="gc-actions"><Button disabled={busy} onClick={()=>void save(false,false,'draft')}>{t('采用我的冲突字段','Use my conflicting fields','自分の入力を採用')}</Button><Button disabled={busy} onClick={()=>void save(false,false,'current')}>{t('采用当前冲突字段','Use current conflicting fields','現在の値を採用')}</Button></div></section>}
        {saved && <p role="status" className="character-saved">{t('已应用到工作区，可撤销。保存全部后写入磁盘。', 'Applied to the workspace. You can undo this; Save all writes it to disk.', 'ワークスペースに適用しました。取り消し可能です。「すべて保存」でディスクに保存します。')}</p>}
        {current ? <>
          <header className="character-document-heading"><h2>{current.name || t('未命名','Untitled','名称未設定')}</h2><span>{roleName(current.narrativeRole)} · {dirty.some(item=>item.id===current.id)?t('待应用','Pending','未適用'):t('已应用','Applied','適用済み')}</span></header>
          <div className="character-section-tabs" role="group" aria-label={t('角色设置分组','Character sections','キャラクター設定')}>
            {(['basics','figures','voice','route'] as const).map((key,index)=><Button key={key} tone="quiet" aria-pressed={section===key} onClick={()=>setSection(key)}>{[t('基础信息','Basics','基本情報'),t('形象与差分','Figures','立ち絵・差分'),t('头像与声音','Avatar & voice','アバター・音声'),t('路线与结局','Route & endings','ルート・結末')][index]}</Button>)}
          </div>
          <div hidden={section!=='basics'}>
          <Field label={t('角色名称', 'Character name', 'キャラクター名')} required><Input value={current.name} disabled={busy} onChange={event => change({ name: event.target.value })} /></Field>
          <fieldset className="character-role-field"><legend>{t('全局身份', 'Role in the project', '作品での役割')}</legend>
            <div className="character-role-options">{([['viewpoint', t('玩家代入的视角，不自动拥有后日谈。', 'The player’s viewpoint; no automatic afterstory.', 'プレイヤーが代入する視点。後日談の自動対象外。')],
              ['main', t('可配置个人路线、结局与后日谈。', 'Optional personal route, endings and afterstory.', '個別ルート・結末・後日談を任意で設定。')],
              ['supporting', t('没有个人路线的配角。', 'A supporting role without a personal route.', '個別ルートを持たないサブキャラクター。')]] as const).map(([role, detail]) =>
              <label key={role} className={current.narrativeRole === role ? 'selected' : ''}><input type="radio" name="character-role" value={role} checked={current.narrativeRole === role} disabled={busy}
                onChange={() => change({ narrativeRole: role, ...(role === 'main' ? { personalRoute: current.personalRoute ?? { sceneIds: [], endingIds: [] } } : { personalRoute: undefined }) })} /><strong>{roleName(role)}</strong><small>{detail}</small></label>)}</div>
          </fieldset>
          {current.narrativeRole === 'character' && <p className="character-warning">{t('此角色来自旧作品，尚未分类。请选择上方身份；系统不会推断它是否有个人路线。', 'This older character is unclassified. Choose a role above; personal routes are not inferred.', '既存のキャラクターは未分類です。上から役割を選択してください。個別ルートは自動判定しません。')}</p>}
          <Field label={t('角色简介与创作设定', 'Description and story notes', '人物像・創作設定')} help={t('AI 按当前场景筛选角色时会参考这份资料。', 'AI uses these notes when the character is relevant to the scene.', 'このキャラクターがシーンに関係する場合、AI が参照します。')}><Textarea value={current.description} disabled={busy} rows={4} onChange={event => change({ description: event.target.value })} /></Field>
          <CharacterAppearanceEditor key={current.id} character={current} assets={assets} locale={locale} disabled={busy} change={change}/>
          </div>
          <section hidden={section!=='figures'} className="character-asset-section"><h3>{t('形象与差分','Figures & variants','立ち絵・差分')}</h3>{(original?.groups??[]).map(group=><section key={group.id}><h4>{group.name}</h4><CharacterFigureGallery ids={group.assetIds} assets={assets} resources={section==='figures'?runtimeAssets:undefined} locale={locale} inspect={inspectAsset} preview={previewAsset}/></section>)}<CharacterFigureGallery key={current.id} ids={assets.filter(asset=>asset.characterId===current.id&&!original?.groups.some(group=>group.assetIds.includes(asset.id))).map(asset=>asset.id)} assets={assets} resources={section==='figures'?runtimeAssets:undefined} locale={locale} inspect={inspectAsset} preview={previewAsset}/>{!assets.some(asset=>asset.characterId===current.id)&&!original?.groups.length&&<p>{t('暂无关联形象。导入素材时关联角色，或在指令属性中选择素材与取景。','No figures yet. Associate imported assets or select a figure and framing in command properties.','関連立ち絵はありません。読み込み時に関連付けるか、命令の属性で素材と構図を選びます。')}</p>}</section>
          <section hidden={section!=='voice'}><Field label={t('默认参与配音', 'Include in batch voicing by default', '一括音声作成の既定対象')} help={t('只影响批量默认勾选；可以手动选入，已有音频继续播放。', 'Controls the initial batch selection. Manual selection and existing audio remain available.', '一括選択の初期値です。手動選択と既存音声の再生は利用できます。')}><input type="checkbox" checked={(current.defaultVoicing ?? (current.narrativeRole==='viewpoint'?'intentionalSilent':'required'))==='required'} disabled={busy} onChange={event=>change({defaultVoicing:event.target.checked?'required':'intentionalSilent'})}/></Field><h3>{t('头像与声音','Avatar & voice','アバター・音声')}</h3>
            <Field label={t('角色默认阅读头像','Default reading portrait','標準会話アバター')}><select aria-label={t('角色默认阅读头像','Default reading portrait','標準会話アバター')} value={current.avatar??''} disabled={busy} onChange={event=>change({avatar:event.target.value||null})}><option value="">{t('自动使用舞台裁剪','Use stage crop','舞台の切り抜き')}</option>{assets.filter(asset=>asset.kind==='image').map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}{current.avatar&&!assets.some(asset=>asset.id===current.avatar)&&<option value={current.avatar}>{t('头像素材未载入','Portrait asset not loaded','アバター未読込')}</option>}</select></Field>
            {chooseAvatar&&<Button disabled={busy} onClick={()=>{void chooseAvatar(current.id,current.avatar??null).then(id=>{if(id!==undefined)change({avatar:id});}).catch(reason=>setError(String(reason)));}}>{t('选择头像图片','Choose portrait image','アバター画像を選択')}</Button>}
            {current.avatar&&<Button onClick={()=>inspectAsset?.(current.avatar!)}>{t('查看头像','Inspect avatar','アバターを表示')}</Button>}<p>{t('逐句头像、当前角色的独立头像和舞台裁剪可在指令属性中编辑。','Edit sentence portraits, current-character portraits and stage cropping in command properties.','命令の属性で各台詞・現在の話者のアバターと切り抜きを設定します。')}</p><Button disabled={busy} onClick={()=>{try{change({voicePresets:normalizeCharacterVoicePresets({...neutralCharacter(current.id,current.name,source.project,current.narrativeRole),...current},source.project.languages).voicePresets});}catch(reason){setError(String(reason));}}}>{t('对齐作品配音语言','Align project voice languages','作品の音声言語に揃える')}</Button><VoicePresetEditor value={current.voicePresets ?? {}} change={voicePresets => change({ voicePresets })} assets={assets} connections={voiceConnections} inspectConnection={inspectVoiceConnection} locale={locale} disabled={busy} preview={previewAsset} languages={source.project.languages.voices}/></section>
          {section==='route'&&current.narrativeRole!=='main'&&<p>{t('只有主角色配置个人路线。','Personal routes apply to main characters.','個別ルートはメインキャラクターに設定します。')}</p>}
          {section === 'figures' && <SharedDifferencesEditor value={current.differences ?? []} initialId={current.initialDifferenceId ?? null} change={(differences, initialDifferenceId) => change({ differences, initialDifferenceId })} assets={assets} locale={locale} disabled={busy} resources={runtimeAssets} previewAsset={previewAsset} removeDifference={authorOperation?async(id,replacementId)=>{
            if(dirty.length)throw new Error(t('先应用或还原角色表单，再处置差分引用；当前输入已保留。','Apply or reset character input before replacing difference consumers. Your draft is retained.','差分参照の置換前にキャラクターの入力を適用または戻してください。入力は保持しています。'));
            const result=await authorOperation({op:'character.difference.remove',characterId:current.id,id,...(replacementId?{replacementId}:{})});if(!accept(result)&&!result.ok)throw new Error(result.error.message);
          }:undefined}/>}
          {current.narrativeRole === 'main' && <section hidden={section!=='route'} className="character-route"><h3>{t('个人路线', 'Personal route', '個別ルート')}</h3>
            {routeIncomplete && <p className="character-warning">{t('路线还未配置完整。可以先应用为草稿，稍后补充场景与结局。', 'This route is incomplete. Apply the draft now and add scenes and endings later.', 'ルートは未完成です。下書きとして適用し、後でシーンと結末を追加できます。')}</p>}
            <div className="character-route-columns"><fieldset><legend>{t('路线场景', 'Route scenes', 'ルートのシーン')}</legend>
              {source.scenes.map(scene => <label className="character-check" key={scene.sceneId}><input type="checkbox" checked={selectedScenes.includes(scene.sceneId)} disabled={busy} onChange={event => checkScene(scene.sceneId, event.target.checked)} /><span>{scene.name}</span></label>)}
              {selectedScenes.filter(id => !source.scenes.some(scene => scene.sceneId === id)).map(id => <label key={id} className="character-check character-warning"><input type="checkbox" checked disabled={busy} onChange={() => checkScene(id, false)} /><span>{t('已失效的场景', 'Missing scene', '見つからないシーン')} · {id}</span></label>)}
              {!source.scenes.length && <p>{t('先在创作页添加场景。', 'Add scenes in the editor first.', '創作画面でシーンを追加してください。')}</p>}</fieldset>
              <fieldset><legend>{t('个人线结局', 'Route endings', '個別ルートの結末')}</legend>{endings.map(ending => <label className="character-check" key={ending.id}><input type="checkbox" checked={selectedEndings.includes(ending.id)} disabled={busy} onChange={event => checkEnding(ending.id, event.target.checked)} /><span><strong>{ending.id}</strong><small>{ending.scenes.join(' · ')}</small></span></label>)}
                {selectedEndings.filter(id => !endings.some(ending => ending.id === id)).map(id => <label key={id} className="character-check character-warning"><input type="checkbox" checked disabled={busy} onChange={() => checkEnding(id, false)} /><span>{t('未找到的结局', 'Missing ending', '見つからない結末')} · {id}</span></label>)}
                {!endings.length && <p>{t('为场景添加“结束”指令并填写结局标识后，可在这里关联。', 'Add an End command with an ending ID to a scene, then link it here.', 'シーンに「終了」命令と結末 ID を追加すると、ここで関連付けできます。')}</p>}</fieldset></div>
          </section>}
          {current.narrativeRole === 'main' && section === 'route' && <AfterstoryEditor value={current.afterstory ?? null} change={afterstory => change({ afterstory })} assets={assets} scenes={source.scenes} variables={source.variables} endingIds={current.personalRoute?.endingIds ?? []} locale={locale} disabled={busy} previewScene={previewScene?((sceneId,entryId)=>{void (async()=>{try{if(dirty.length)await save(false,true);previewScene(sceneId,entryId);}catch(reason){setError(String(reason));}})();}):undefined}/>}
          <div className="character-remove"><Button tone="quiet" disabled={busy} onClick={() => setDeleting(true)}><Trash2 size={15} />{t('移除此角色', 'Remove character', 'このキャラクターを削除')}</Button><small>{t('使用中的角色需要先解除引用。', 'Remove references before deleting an in-use character.', '使用中のキャラクターは参照の解除が必要です。')}</small></div>
        </> : <div className="character-no-selection"><UsersRound size={34} /><p>{t('从左侧选择角色，或新建一位。', 'Choose a character or add a new one.', '左から選択するか、新しく追加してください。')}</p><Button onClick={add}><Plus size={15} />{t('新增角色', 'Add character', 'キャラクターを追加')}</Button></div>}
      </section>
    </div>
    <footer className="character-manager-footer"><div className="character-history"><Button disabled={busy || !!dirty.length || !canUndo} onClick={() => void replay('undo')}><Undo2 size={15} />{t('撤销', 'Undo', '元に戻す')}</Button><Button disabled={busy || !!dirty.length || !canRedo} onClick={() => void replay('redo')}><Redo2 size={15} />{t('重做', 'Redo', 'やり直す')}</Button></div>
      <Button disabled={busy} onClick={() => dirty.length ? setClosing(true) : close()}>{t('关闭', 'Close', '閉じる')}</Button><Button tone="primary" disabled={busy || !dirty.length} onClick={() => void save()}>{t('应用修改', 'Apply changes', '変更を適用')}{dirty.length > 0 && ` (${dirty.length})`}</Button></footer>
  </CharacterFrame>
    {closing && <MessageBox title={t('还有未应用的角色修改', 'Character changes are pending', '未適用の変更があります')} description={t('应用后进入作品工作区，可以撤销。', 'Apply to the workspace; the change can be undone.', '適用後は元に戻す操作で取り消せます。')} cancelLabel={t('继续编辑', 'Keep editing', '編集を続ける')} onClose={() => setClosing(false)} actions={[
      { label: t('放弃并关闭', 'Discard & close', '破棄して閉じる'), run: () => { setDrafts({}); close(); } },
      { label: t('应用并关闭', 'Apply & close', '適用して閉じる'), tone: 'primary', run: () => save(true, true) },
    ]}/>}
    {deleting && <MessageBox title={t('移除角色', 'Remove character', 'キャラクターを削除')} description={t(`移除“${current?.name}”？应用过的角色可通过撤销恢复。`, `Remove “${current?.name}”? Applied characters can be restored with Undo.`, `「${current?.name}」を削除しますか？適用済みのキャラクターは「元に戻す」で復元できます。`)} cancelLabel={t('取消', 'Cancel', 'キャンセル')} onClose={() => setDeleting(false)} actions={[{ label: t('移除角色', 'Remove character', 'キャラクターを削除'), tone: 'danger', run: removeCurrent }]}/>}
  </>;
}
