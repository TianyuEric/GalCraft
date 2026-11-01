import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Folder, Layers, Plus, Settings, UsersRound, Network } from 'lucide-react';
import { TooltipProvider } from '../components/ui/tooltip.js';
import { Button } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { SceneExplorerTree } from './scene-explorer-tree.js';
import { ObjectTree, type WorkbenchTreeNode } from '../components/workbench/ObjectTree.js';
import { WorkbenchShell, DocumentTabs, type WorkbenchLayout } from '../components/workbench/WorkbenchShell.js';
import { MessageBox } from '../components/workbench/MessageBox.js';
import type { AuthoringSource } from './controller.js';
import './workbench-production.css';

export type AuthorDocument = { id: string; title: string; kind: 'scene' | 'page' | 'asset' | 'project' | 'characters' | 'scene-graph' | 'startup' | 'route'; objectId?: string; preview?: boolean; dirty?: boolean };
/** View state only. Authored contents and history remain owned by M02. */
export function openAuthorDocument(current: AuthorDocument[], next: AuthorDocument): AuthorDocument[] {
  const existing = current.find(document => document.id === next.id);
  if (existing) return current.map(document => document.id === next.id ? { ...document, ...next, preview: next.dirty ? false : next.preview === undefined ? document.preview : document.preview && next.preview } : document);
  return [...current.filter(document => !next.preview || !document.preview || document.dirty), next];
}
/** Bridges existing owned DOM editors without React recreating their subtrees. */
export function DomRegion({ node, className = '' }: { node?: HTMLElement | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (!ref.current) return; if (!node) ref.current.replaceChildren(); else if (node.parentElement !== ref.current) ref.current.replaceChildren(node); });
  return <div ref={ref} className={`gc-wb-dom-region ${className}`}/>;
}
export type AuthoringWorkbenchProps = {
  source: AuthoringSource | null; characterExplorer?: HTMLElement; locale?: string; page: string; header: HTMLElement; activity: HTMLElement;
  documents: AuthorDocument[]; active: string; content: HTMLElement; toolbar?: HTMLElement | null; explorer?: HTMLElement | null; inspector?: HTMLElement | null; problems?: HTMLElement | null; status: HTMLElement;
  notice?: ReactNode; layout: WorkbenchLayout; selected: string[]; layoutChange(layout: WorkbenchLayout): void;
  inspectorShown?(): void;
  inspectorAvailable?: boolean;
  select(ids: string[]): void; open(document: AuthorDocument): void; pin(id: string): void; close(id: string): void | Promise<boolean>;
  reorder(ids: string[]): void;
  rename(id: string, name: string): Promise<string | void>; move(ids: string[], parent: string | null, index?: number): Promise<void>;
  create(kind: 'chapter' | 'scene', parent?: string): Promise<void>;
  entryPresentation?(kind: 'chapter' | 'scene', id: string): void;
  pageNodes?: WorkbenchTreeNode[]; pageOpen?(id: string, pinned: boolean): void;
  componentNodes?: WorkbenchTreeNode[]; componentSelect?(ids: string[]): void;
  componentMove?(ids:string[],parent:string):void;componentRename?(id:string,name:string):Promise<string|void>;
  confirm?: { title: string; description: ReactNode; cancelLabel?: string; actions: { label: string; tone?: 'primary' | 'danger'; run(): void | Promise<void> }[]; close(): void } | null;
};
export function AuthoringWorkbench(props: AuthoringWorkbenchProps) {
  const t = (zh: string, en: string, ja: string) => props.locale === 'en' ? en : props.locale === 'ja' ? ja : zh;
  const [term, setTerm] = useState(''), [tab, setTab] = useState<'objects' | 'search'>('objects');
  const source = props.source;
  const characterActive = props.documents.some(document => document.id === props.active && document.kind === 'characters');
  const [browsingScenes, setBrowsingScenes] = useState(false);
  const explorerRef = useRef<HTMLDivElement>(null), explorerScroll = useRef<Record<string,number>>({});
  const explorerKey = characterActive && !browsingScenes ? 'characters' : props.page;
  useLayoutEffect(() => {
    const scroll = explorerRef.current?.closest('.gc-wb-pane-scroll'); if (!scroll) return;
    scroll.scrollTop = explorerScroll.current[explorerKey] ?? 0;
    const remember = () => { explorerScroll.current[explorerKey] = scroll.scrollTop; };
    scroll.addEventListener('scroll', remember); return () => scroll.removeEventListener('scroll', remember);
  }, [explorerKey]);
  useLayoutEffect(() => { if (characterActive) { setTab('objects'); setBrowsingScenes(false); } }, [characterActive]);
  const routeTitles:Record<string,string>={projects:t('作品库','Projects','作品一覧'),assets:t('素材','Assets','素材'),production:t('制作','Production','制作'),assistant:t('制作','Production','制作'),collaboration:t('协作','Collaborate','連携'),plugins:t('插件','Plugins','プラグイン'),publish:t('发布','Publish','配布')};
  const documentTitle=(document:AuthorDocument)=>document.kind==='page'?(props.pageNodes?.find(node=>node.id===(document.objectId??document.id.slice(5)))?.name??document.title)
    :document.kind==='characters'?t('角色与路线','Characters & routes','キャラクターとルート'):document.kind==='scene-graph'?t('场景关系图','Scene graph','シーン関係図'):document.kind==='startup'?t('启动与主页','Startup & home','起動とホーム')
    :document.kind==='route'?(document.id.startsWith('route:')?routeTitles[document.objectId??document.id.replace(/^route:/,'')]??document.title:document.title):document.kind==='project'?document.objectId==='preferences'?t('工作台偏好','Workbench preferences','ワークスペース設定'):t('作品设置','Project settings','作品設定'):document.title;
  const nodes: WorkbenchTreeNode[] = source?.project.chapters.map(chapter => ({ id: chapter.id, name: chapter.name, icon: <Folder/>, children: chapter.sceneIds.flatMap(id => {
    const scene = source.scenes.find(item => item.sceneId === id);
    return scene ? [{ id: scene.sceneId, name: scene.name, icon: <FileText/>, detail: scene.dirty ? '●' : undefined }] : [];
  }) })) ?? [];
  const openScene = (id: string, pinned: boolean) => { const scene = source?.scenes.find(item => item.sceneId === id); if (scene) props.open({ id: `scene:${id}`, kind: 'scene', objectId: id, title: scene.name, dirty: scene.dirty, preview: !pinned }); };
  const objectTools = <div className="gc-wb-tree-tools"><div className="gc-wb-tree-action-group"><Button tone="quiet" onClick={() => void props.create('chapter')}><Plus/>{t('章节','Chapter','チャプター')}</Button><Button tone="quiet" disabled={!source?.project.chapters.length} onClick={() => void props.create('scene', props.selected.find(id => source?.project.chapters.some(chapter => chapter.id === id)) ?? source?.scenes.find(scene => props.selected.includes(scene.sceneId))?.chapterId ?? source?.project.chapters[0]?.id)}><Plus/>{t('场景','Scene','シーン')}</Button>
    <Button tone="quiet" disabled={props.selected.length !== 1} onClick={() => { const selected = props.selected[0]; document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(selected)}"]`)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })); }}>{t('重命名','Rename','名前を変更')}</Button>
    {props.entryPresentation && <Button tone="quiet" disabled={props.selected.length !== 1} onClick={() => { const id = props.selected[0]; if (id) props.entryPresentation?.(source?.project.chapters.some(chapter => chapter.id === id) ? 'chapter' : 'scene', id); }}>{t('开场演出','Opening presentation','開始演出')}</Button>}
    </div><div className="gc-wb-tree-action-group"><select aria-label={t('移动所选对象到章节','Move selected objects to chapter','選択した項目をチャプターへ移動')} value="" disabled={!props.selected.length} onChange={event => { if (event.target.value) void props.move(props.selected, event.target.value); }}><option value="">{t('移动到章节…','Move to chapter…','チャプターへ移動…')}</option>{source?.project.chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></div><div className="gc-wb-tree-action-group">
    <Button tone="quiet" aria-pressed={props.active==='characters'} onClick={() => props.open({ id: 'characters', kind: 'characters', title: t('角色与路线','Characters & routes','キャラクターとルート') })}><UsersRound/>{t('角色','Characters','キャラクター')}</Button><Button tone="quiet" onClick={() => props.open({ id: 'scene-graph', kind: 'scene-graph', title: t('场景关系图','Scene graph','シーン関係図') })}><Network/>{t('关系图','Scene graph','関係図')}</Button><Button tone="quiet" aria-pressed={props.active==='project'} onClick={() => props.open({ id: 'project', kind: 'project', title: t('作品设置','Project settings','作品設定') })}><Settings/>{t('作品设置','Project settings','作品設定')}</Button>
  </div></div>;
  const explorer = props.page === 'editor' ? <><div className="gc-wb-explorer-switch"><Button tone="quiet" aria-pressed={tab === 'objects'} onClick={() => setTab('objects')}>{t('对象','Objects','オブジェクト')}</Button><Button tone="quiet" aria-pressed={tab === 'search'} onClick={() => setTab('search')}>{t('搜索 / 素材速取','Search / quick assets','検索 / 素材')}</Button></div><div hidden={tab !== 'objects'}>{characterActive && <div className="gc-wb-character-navigation"><Button tone="quiet" aria-pressed={!browsingScenes} onClick={() => setBrowsingScenes(false)}>{t('角色','Characters','キャラクター')}</Button><Button tone="quiet" aria-pressed={browsingScenes} onClick={() => setBrowsingScenes(true)}>{t('场景导航','Scenes','シーンへ')}</Button></div>}<div hidden={characterActive && !browsingScenes}><div className="gc-wb-tree-search"><Input aria-label={t('查找场景','Find scene','シーンを検索')} placeholder={t('查找场景','Find scene','シーンを検索')} value={term} onChange={event => setTerm(event.target.value)}/></div><SceneExplorerTree locale={props.locale} query={term} onClearSearch={() => setTerm('')} onMoveAt={props.move} label={t('作品对象','Project objects','作品のオブジェクト')} nodes={nodes} active={props.documents.find(document => document.id === props.active && document.kind === 'scene')?.objectId} selected={props.selected} onSelect={props.select} onOpen={openScene} onRename={props.rename} onMoveMany={(ids, parent) => void props.move(ids, parent)} menuGroups={(node, scope, hidden) => node.children ? [{ label: node.name, actions: [{ label: t('新建场景','New scene','シーンを追加'), run: () => void props.create('scene', node.id) }, { label: t('章节入场演出','Chapter entry presentation','チャプター開始演出'), run: () => props.entryPresentation?.('chapter', node.id) }] }] : [
    { label: node.name, actions: [{ label: t('打开场景','Open scene','シーンを開く'), run: () => openScene(node.id, true) }, { label: t('场景入场演出','Scene entry presentation','シーン開始演出'), run: () => props.entryPresentation?.('scene', node.id) }] },
    { label: scope.length > 1 ? t(`所选 ${scope.length} 项`,`${scope.length} selected`,`${scope.length} 件を選択`) + (hidden ? t(` · 隐藏 ${hidden} 项`,` · ${hidden} hidden`,`・${hidden} 件非表示`) : '') : '', actions: source?.project.chapters.map(chapter => ({ label: t(`移动到 ${chapter.name}`,`Move to ${chapter.name}`,`${chapter.name} へ移動`), disabled: scope.some(id => !source.scenes.some(scene => scene.sceneId === id)) ? t('选区包含章节，不能作为场景移动','Selection contains a chapter; select scenes to move','選択にチャプターが含まれています。シーンを選択してください') : undefined, run: () => void props.move(scope, chapter.id) })) ?? [] },
  ]}/>{objectTools}</div><section aria-label={t('角色列表','Characters','キャラクター一覧')} hidden={!characterActive || browsingScenes}><DomRegion node={props.characterExplorer}/></section></div><div hidden={tab !== 'search'}><DomRegion node={props.explorer}/></div></>
    : props.page === 'pages' && props.pageNodes ? <>
      <h3 className="gc-wb-tree-section-title">{t('启动与主页','Startup & home','起動とホーム')}</h3>
      <ObjectTree nodes={[{ id: 'startup', name: t('开屏序列与主页媒体','Startup sequence & home media','起動シーケンスとホームメディア'), icon: <Layers/> }]} selected={props.selected} label={t('启动与主页','Startup & home','起動とホーム')} onSelect={props.select} onOpen={(_id,pinned)=>props.open({id:'startup',kind:'startup',title:t('启动与主页','Startup & home','起動とホーム'),preview:!pinned})}/>
      <h3 className="gc-wb-tree-section-title">{t('页面','Pages','ページ')}</h3>
      <ObjectTree nodes={props.pageNodes.filter(node=>!node.id.startsWith('@')&&node.id!=='gallery-content')} selected={props.selected} label={t('Player 页面','Player pages','Player ページ')} onSelect={props.select} onOpen={(id,pinned)=>props.pageOpen?.(id,pinned)}/>
      {props.active !== 'startup' && props.componentNodes && <><h3 className="gc-wb-tree-section-title">{t('当前页组件','Current page components','現在のページの部品')}</h3><ObjectTree nodes={props.componentNodes} selected={props.selected} label={t('页面组件','Page components','ページのコンポーネント')} onSelect={ids => props.componentSelect?.(ids)} onOpen={id => props.componentSelect?.([id])} onMoveMany={props.componentMove} onRename={props.componentRename}/></>}
      <DomRegion node={props.explorer}/>
      <h3 className="gc-wb-tree-section-title">{t('共享样式与动画','Shared styles & animations','共有スタイルとアニメーション')}</h3>
      <ObjectTree nodes={props.pageNodes.filter(node=>node.id.startsWith('@style:')||node.id.startsWith('@draft:')||node.id==='@animations')} selected={props.selected} label={t('共享样式与动画','Shared styles & animations','共有スタイルとアニメーション')} onSelect={props.select} onOpen={(id,pinned)=>props.pageOpen?.(id,pinned)}/>
      <h3 className="gc-wb-tree-section-title">{t('鉴赏内容与模板','Gallery & templates','鑑賞コンテンツとテンプレート')}</h3>
      <ObjectTree nodes={props.pageNodes.filter(node=>node.id==='@templates'||node.id==='gallery-content')} selected={props.selected} label={t('鉴赏内容与模板','Gallery & templates','鑑賞コンテンツとテンプレート')} onSelect={props.select} onOpen={(id,pinned)=>props.pageOpen?.(id,pinned)}/>
    </>
    : <DomRegion node={props.explorer}/>;
  return <TooltipProvider><WorkbenchShell title={source?.project.name ?? 'GalCraft Studio'} inspectorAvailable={props.inspectorAvailable} onInspectorShown={props.inspectorShown} header={<DomRegion node={props.header} className="gc-wb-production-header"/>} activity={<DomRegion node={props.activity}/>}
    explorerTitle={characterActive ? t('角色','Characters','キャラクター') : ({ projects:t('作品库','Projects','作品一覧'), editor:t('作品','Project','作品'), assets:t('素材库','Assets','素材'), production:t('制作','Production','制作'), assistant:t('制作','Production','制作'), pages:t('Player 页面','Player pages','Player ページ'), collaboration:t('协作','Collaborate','連携'),plugins:t('插件','Plugins','プラグイン'), publish:t('发布','Publish','配布') } as Record<string,string>)[props.page] ?? t('工作区','Workspace','ワークスペース')} explorer={<div ref={explorerRef}>{explorer}</div>} inspectorTitle={t('属性','Inspector','プロパティ')} inspector={<DomRegion node={props.inspector}/>}
    documents={<DocumentTabs panelId="gc-workbench-editor" documents={props.documents.map(document => ({ ...document, title:documentTitle(document), icon: document.kind === 'page' ? <Layers/> : <FileText/> }))} active={props.active} onReorder={props.reorder} onSelect={id => { const document = props.documents.find(item => item.id === id); if (document) props.open(document); }} onPin={props.pin} onClose={props.close}/>}
    toolbar={<DomRegion node={props.toolbar}/>} notice={props.notice} panels={props.problems ? [{ id: 'problems', title: t('问题','Problems','問題'), content: <DomRegion node={props.problems}/> }] : []} status={<DomRegion node={props.status}/>} layout={props.layout} onLayoutChange={props.layoutChange}>
    <DomRegion node={props.content} className="gc-wb-document-content"/>
  </WorkbenchShell>{props.confirm && <MessageBox title={props.confirm.title} description={props.confirm.description} cancelLabel={props.confirm.cancelLabel} actions={props.confirm.actions} onClose={props.confirm.close}/>}</TooltipProvider>;
}
