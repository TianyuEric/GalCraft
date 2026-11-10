import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CircleAlert, FileText, Folder, Images, Layers, ListTree, MonitorPlay, Plus, Search, Settings, SlidersHorizontal, UsersRound, Network } from 'lucide-react';
import { TooltipProvider } from '../components/ui/tooltip.js';
import { Button } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { SceneExplorerTree } from './scene-explorer-tree.js';
import { ObjectTree, type WorkbenchTreeNode } from '../components/workbench/ObjectTree.js';
import { DockWorkspace, type DockHandle, type LayoutPreset } from '../components/workbench/DockWorkspace.js';
import { StudioChrome, type StudioChromeMenuItem, type StudioChromeProps } from '../components/workbench/StudioChrome.js';
import { allGroups, emptyLayout, group, normalize, validLayout, type Zone, type ZonedLayout } from '../components/workbench/zoned-layout.js';
import type { WorkbenchLayout } from '../components/workbench/WorkbenchShell.js';
import type { StudioPreferences, WorkspaceResume } from '@galcraft/contracts';
import { MessageBox } from '../components/workbench/MessageBox.js';
import type { AuthoringSource } from './controller.js';
import './workbench-production.css';

export type AuthorDocument = { id: string; title: string; kind: 'scene' | 'page' | 'asset' | 'project' | 'character' | 'characters' | 'scene-graph' | 'startup' | 'route'; objectId?: string; preview?: boolean; dirty?: boolean };
/** View state only. Authored contents and history remain owned by M02. */
export function openAuthorDocument(current: AuthorDocument[], next: AuthorDocument, groupTabs?: readonly string[]): AuthorDocument[] {
  const existing = current.find(document => document.id === next.id);
  if (existing) return current.map(document => document.id === next.id ? { ...document, ...next, preview: next.dirty ? false : next.preview === undefined ? document.preview : document.preview && next.preview } : document);
  return [...current.filter(document => !next.preview || !document.preview || document.dirty || groupTabs && !groupTabs.includes(document.id)), next];
}
/** Bridges existing owned DOM editors without React recreating their subtrees. */
export function DomRegion({ node, className = '' }: { node?: HTMLElement | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (!ref.current) return; if (!node) ref.current.replaceChildren(); else if (node.parentElement !== ref.current) ref.current.replaceChildren(node); });
  return <div ref={ref} className={`gc-wb-dom-region ${className}`}/>;
}
export type AuthorDocumentRegion = { node: HTMLElement; toolbar?: HTMLElement | null; interactive?: boolean };
export type AuthorSceneCompanion = { node: HTMLElement; title: string; activate(): void; close(): Promise<boolean> };
export type AuthoringWorkbenchProps = {
  source: AuthoringSource | null; characterExplorer?: HTMLElement; locale?: string; page: string; chrome: StudioChromeProps;
  assetDirectory?: HTMLElement | null; assetLibrary?: HTMLElement | null; assetInspector?: HTMLElement | null;
  openAssets?(): void | Promise<void>;
  openCharacterDifference?(id: string): Promise<void>;
  openWritingStage?(id: string): Promise<void>;
  characterTarget?: string;
  documentRegions?: ReadonlyMap<string, AuthorDocumentRegion>;
  outlineState?: { query: string; scrollTop: number };
  onOutlineState?(state: { query: string; scrollTop: number }): void;
  onViewFocus?(id: string | null): void;
  activateVisibleDocument?(id: string): boolean;
  contextInspector?: HTMLElement | null;
  contextSelected?: string[];
  documents: AuthorDocument[]; active: string; content: HTMLElement; toolbar?: HTMLElement | null; explorer?: HTMLElement | null; search?: HTMLElement | null; stage?: HTMLElement | null; inspector?: HTMLElement | null; problems?: HTMLElement | null; status: HTMLElement;
  activateScenePane?(): void;
  beside?: AuthorSceneCompanion;
  retainedCompanions?: ReadonlyMap<string, AuthorSceneCompanion>;
  notice?: ReactNode; layout: WorkbenchLayout; selected: string[];
  dock: RefObject<DockHandle | null>;
  dockLayout?: NonNullable<WorkspaceResume['workbench']>['dockLayout'];
  dockLayoutChange(layout: ZonedLayout): void;
  namedLayouts?: StudioPreferences['namedDockLayouts'];
  writeNamedLayouts(layouts: Record<string, ZonedLayout>): Promise<void>;
  dockNotice(message: string): void;
  inspectorShown?(): void;
  inspectorAvailable?: boolean;
  select(ids: string[]): void; open(document: AuthorDocument): void | Promise<void>; pin(id: string): void; close(id: string): boolean | Promise<boolean>;
  reorder(ids: string[]): void;
  rename(id: string, name: string): Promise<string | void>; move(ids: string[], parent: string | null, index?: number): Promise<void>;
  create(kind: 'chapter' | 'scene', parent?: string): Promise<void>;
  entryPresentation?(kind: 'chapter' | 'scene', id: string): void;
  sceneDecor?(id: string): void;
  pageNodes?: WorkbenchTreeNode[]; pageKey?: string; pageOpen?(id: string, pinned: boolean): void;
  preparePageDirectory?(): void;
  componentNodes?: WorkbenchTreeNode[]; componentSelect?(ids: string[]): void;
  pageOutline?: { key: string; title: string; selected: string[]; inspector: HTMLElement; tools: HTMLElement };
  componentMove?(ids:string[],parent:string):void;componentRename?(id:string,name:string):Promise<string|void>;
  confirm?: { title: string; description: ReactNode; cancelLabel?: string; actions: { label: string; tone?: 'primary' | 'danger'; run(): void | Promise<void> }[]; close(): void } | null;
};

export const authoringDockTools = {
  outline: 'studio-outline', search: 'studio-search', inspector: 'studio-inspector', problems: 'studio-problems',
  stage: 'studio-stage', empty: 'studio-empty', assetDirectory: 'studio-asset-directory',
  assetInspector: 'studio-asset-inspector', assets: 'studio-assets', characters: 'studio-character-directory',
  pageDirectory: 'studio-page-directory', pageOutline: 'studio-page-outline',
} as const;
const dockTools = authoringDockTools;
const sceneCompanionId = (documentId: string) => `studio-beside:${documentId}`;
const editorZones = ['center'] as const;
const sidebarZones = ['left', 'right'] as const;
const problemZones = ['bottom'] as const;
const centralViewId = (active: string) => active && active !== 'empty' ? active : dockTools.empty;

function initialDock(props: AuthoringWorkbenchProps, preset: LayoutPreset): ZonedLayout {
  const layout = emptyLayout();
  const active = centralViewId(props.active);
  const ids = props.documents.map(document => document.id);
  if (!ids.includes(active)) ids.push(active);
  const document = group('document', ids);
  document.active = active;
  const stage = props.stage && preset === 'stage' ? group('stage', [dockTools.stage]) : null;
  layout.tree = stage ? { kind: 'split', id: 'stage-beside', axis: 'y', ratio: .52, first: stage, second: document } : document;
  layout.left = group('left', props.source ? [dockTools.outline] : []);
  layout.right = group('right', [dockTools.inspector]);
  layout.bottom = group('bottom', [dockTools.problems]);
  layout.widths = { left: Math.max(240, props.layout.left), right: Math.max(240, props.layout.right) };
  layout.bottomHeight = Math.max(160, props.layout.bottom);
  layout.hidden = { left: !props.source, right: !props.source || preset === 'writing', bottom: preset === 'writing' || !props.source || !props.layout.diagnosticsVisible };
  layout.previews = props.documents.filter(document => document.preview).map(document => document.id);
  return layout;
}

export function AuthoringWorkbench(props: AuthoringWorkbenchProps) {
  const t = (zh: string, en: string, ja: string) => props.locale === 'en' ? en : props.locale === 'ja' ? ja : zh;
  const explorerKey = props.source?.project.projectId ?? '';
  const [search, setSearch] = useState({ key: explorerKey, query: props.outlineState?.query ?? '' });
  const term = search.key === explorerKey ? search.query : props.outlineState?.query ?? '';
  const [namingLayout, setNamingLayout] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const source = props.source;
  const outlineState = useRef({ key: explorerKey, query: term, scrollTop: props.outlineState?.scrollTop ?? 0 });
  if (outlineState.current.key !== explorerKey) outlineState.current = { key: explorerKey, query: term, scrollTop: props.outlineState?.scrollTop ?? 0 };
  const persistOutline = useRef(props.onOutlineState);
  persistOutline.current = props.onOutlineState;
  const changeTerm = (query: string) => {
    setSearch({ key: explorerKey, query });
    outlineState.current = { ...outlineState.current, query };
    persistOutline.current?.(outlineState.current);
  };
  const bindOutlineScroll = useCallback((node: HTMLDivElement | null) => {
    const scroll = node?.closest('.gc-wb-pane-scroll, [data-view]'); if (!scroll) return;
    scroll.scrollTop = outlineState.current.scrollTop;
    const remember = () => {
      if (outlineState.current.key !== explorerKey || scroll.closest('[hidden]')) return;
      outlineState.current = { ...outlineState.current, scrollTop: scroll.scrollTop };
      persistOutline.current?.(outlineState.current);
    };
    const visibility = new MutationObserver(() => { if (!scroll.closest('[hidden]')) scroll.scrollTop = outlineState.current.scrollTop; });
    visibility.observe(scroll, { attributes: true, attributeFilter: ['hidden'] });
    scroll.addEventListener('scroll', remember);
    return () => { visibility.disconnect(); scroll.removeEventListener('scroll', remember); };
  }, [explorerKey]);
  const routeTitles:Record<string,string>={projects:t('作品库','Projects','作品一覧'),assets:t('素材','Assets','素材'),production:t('制作','Production','制作'),assistant:t('制作','Production','制作'),collaboration:t('协作','Collaborate','連携'),plugins:t('插件','Plugins','プラグイン'),publish:t('发布','Publish','配布')};
  const documentTitle=(document:AuthorDocument)=>document.kind==='page'?(props.pageNodes?.find(node=>node.id===(document.objectId??document.id.slice(5)))?.name??document.title)
    :document.kind==='characters'?t('角色与路线','Characters & routes','キャラクターとルート'):document.kind==='scene-graph'?t('场景关系图','Scene graph','シーン関係図'):document.kind==='startup'?t('启动与主页','Startup & home','起動とホーム')
    :document.kind==='route'?(document.id.startsWith('route:')?routeTitles[document.objectId??document.id.replace(/^route:/,'')]??document.title:document.title):document.kind==='project'?document.objectId==='preferences'?t('工作台偏好','Workbench preferences','ワークスペース設定'):t('作品设置','Project settings','作品設定'):document.title;
  const nodes: WorkbenchTreeNode[] = source?.project.chapters.map(chapter => ({ id: chapter.id, name: chapter.name, icon: <Folder/>, children: chapter.sceneIds.flatMap(id => {
    const scene = source.scenes.find(item => item.sceneId === id);
    return scene ? [{ id: scene.sceneId, name: scene.name, icon: <FileText/>, detail: scene.dirty
      ? <span className="gc-unsaved-dot" role="img" aria-label={t('未保存','Unsaved','未保存')}/> : undefined }] : [];
  }) })) ?? [];
  const openScene = (id: string, pinned: boolean) => { const scene = source?.scenes.find(item => item.sceneId === id); if (scene) props.open({ id: `scene:${id}`, kind: 'scene', objectId: id, title: scene.name, dirty: scene.dirty, preview: !pinned }); };
  const objectTools = <div className="gc-wb-tree-tools"><div className="gc-wb-tree-action-group"><Button tone="quiet" onClick={() => void props.create('chapter')}><Plus/>{t('章节','Chapter','チャプター')}</Button><Button tone="quiet" disabled={!source?.project.chapters.length} onClick={() => void props.create('scene', props.selected.find(id => source?.project.chapters.some(chapter => chapter.id === id)) ?? source?.scenes.find(scene => props.selected.includes(scene.sceneId))?.chapterId ?? source?.project.chapters[0]?.id)}><Plus/>{t('场景','Scene','シーン')}</Button>
    <Button tone="quiet" disabled={props.selected.length !== 1} onClick={() => { const selected = props.selected[0]; document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(selected)}"]`)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })); }}>{t('重命名','Rename','名前を変更')}</Button>
    {props.entryPresentation && <Button tone="quiet" disabled={props.selected.length !== 1} onClick={() => { const id = props.selected[0]; if (id) props.entryPresentation?.(source?.project.chapters.some(chapter => chapter.id === id) ? 'chapter' : 'scene', id); }}>{t('开场演出','Opening presentation','開始演出')}</Button>}
    </div><div className="gc-wb-tree-action-group"><select aria-label={t('移动所选对象到章节','Move selected objects to chapter','選択した項目をチャプターへ移動')} value="" disabled={!props.selected.length} onChange={event => { if (event.target.value) void props.move(props.selected, event.target.value); }}><option value="">{t('移动到章节…','Move to chapter…','チャプターへ移動…')}</option>{source?.project.chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></div><div className="gc-wb-tree-action-group">
    <Button tone="quiet" onClick={() => props.dock.current?.open(dockTools.characters)}><UsersRound/>{t('角色目录','Character directory','キャラクター一覧')}</Button><Button tone="quiet" onClick={() => props.open({ id: 'scene-graph', kind: 'scene-graph', title: t('场景关系图','Scene graph','シーン関係図') })}><Network/>{t('关系图','Scene graph','関係図')}</Button><Button tone="quiet" aria-pressed={props.active==='project'} onClick={() => props.open({ id: 'project', kind: 'project', title: t('作品设置','Project settings','作品設定') })}><Settings/>{t('作品设置','Project settings','作品設定')}</Button>
  </div></div>;
  const explorer = <><div><div className="gc-wb-tree-search"><Input data-dock-focus aria-label={t('查找场景','Find scene','シーンを検索')} placeholder={t('查找场景','Find scene','シーンを検索')} value={term} onChange={event => changeTerm(event.target.value)}/></div><SceneExplorerTree locale={props.locale} query={term} onClearSearch={() => changeTerm('')} onMoveAt={props.move} label={t('作品对象','Project objects','作品のオブジェクト')} nodes={nodes} active={props.documents.find(document => document.id === props.active && document.kind === 'scene')?.objectId} selected={props.selected} onSelect={props.select} onOpen={openScene} onRename={props.rename} onMoveMany={(ids, parent) => void props.move(ids, parent)} menuGroups={(node, scope, hidden) => node.children ? [{ label: node.name, actions: [{ label: t('新建场景','New scene','シーンを追加'), run: () => void props.create('scene', node.id) }, { label: t('章节入场演出','Chapter entry presentation','チャプター開始演出'), run: () => props.entryPresentation?.('chapter', node.id) }] }] : [
    { label: node.name, actions: [{ label: t('打开场景','Open scene','シーンを開く'), run: () => openScene(node.id, true) }, { label: t('场景入场演出','Scene entry presentation','シーン開始演出'), run: () => props.entryPresentation?.('scene', node.id) }, ...(props.sceneDecor ? [{ label: t('场景布景', 'Scene decor', 'シーンの背景レイヤー'), run: () => props.sceneDecor?.(node.id) }] : [])] },
    { label: scope.length > 1 ? t(`所选 ${scope.length} 项`,`${scope.length} selected`,`${scope.length} 件を選択`) + (hidden ? t(` · 隐藏 ${hidden} 项`,` · ${hidden} hidden`,`・${hidden} 件非表示`) : '') : '', actions: source?.project.chapters.map(chapter => ({ label: t(`移动到 ${chapter.name}`,`Move to ${chapter.name}`,`${chapter.name} へ移動`), disabled: scope.some(id => !source.scenes.some(scene => scene.sceneId === id)) ? t('选区包含章节，不能作为场景移动','Selection contains a chapter; select scenes to move','選択にチャプターが含まれています。シーンを選択してください') : undefined, run: () => void props.move(scope, chapter.id) })) ?? [] },
  ]}/>{objectTools}</div></>
  const localSelected = props.contextSelected ?? [];
  const pageDirectory = props.pageNodes ? <div className="gc-page-directory">
      <h3 className="gc-wb-tree-section-title">{t('启动与主页','Startup & home','起動とホーム')}</h3>
      <ObjectTree nodes={[{ id: 'startup', name: t('开屏序列与主页媒体','Startup sequence & home media','起動シーケンスとホームメディア'), icon: <Layers/> }]} selected={localSelected} label={t('启动与主页','Startup & home','起動とホーム')} onSelect={() => {}} onOpen={(_id,pinned)=>props.open({id:'startup',kind:'startup',title:t('启动与主页','Startup & home','起動とホーム'),preview:!pinned})}/>
      <h3 className="gc-wb-tree-section-title">{t('页面','Pages','ページ')}</h3>
      <ObjectTree nodes={props.pageNodes.filter(node=>!node.id.startsWith('@')&&node.id!=='gallery-content')} selected={props.pageKey ? [props.pageKey] : []} active={props.pageKey} label={t('Player 页面','Player pages','Player ページ')} onSelect={() => {}} onOpen={(id,pinned)=>props.pageOpen?.(id,pinned)}/>
      <h3 className="gc-wb-tree-section-title">{t('共享样式与动画','Shared styles & animations','共有スタイルとアニメーション')}</h3>
      <ObjectTree nodes={props.pageNodes.filter(node=>node.id.startsWith('@style:')||node.id.startsWith('@draft:')||node.id==='@animations')} selected={localSelected} label={t('共享样式与动画','Shared styles & animations','共有スタイルとアニメーション')} onSelect={() => {}} onOpen={(id,pinned)=>props.pageOpen?.(id,pinned)}/>
      <h3 className="gc-wb-tree-section-title">{t('鉴赏内容与模板','Gallery & templates','鑑賞コンテンツとテンプレート')}</h3>
      <ObjectTree nodes={props.pageNodes.filter(node=>node.id==='@templates'||node.id==='gallery-content')} selected={localSelected} label={t('鉴赏内容与模板','Gallery & templates','鑑賞コンテンツとテンプレート')} onSelect={() => {}} onOpen={(id,pinned)=>props.pageOpen?.(id,pinned)}/>
    </div> : <p className="gc-dock-missing-view" role="status">{t('正在读取作品页面…','Reading project pages…','作品のページを読み込んでいます…')}</p>;
  const pageOutline = props.pageOutline ? <div className="gc-page-outline" data-page-outline={props.pageOutline.key}>
      <h3 className="gc-wb-tree-section-title" title={props.pageOutline.title}>{props.pageOutline.title}</h3>
      <ObjectTree key={props.pageOutline.key} nodes={props.componentNodes ?? []} selected={props.pageOutline.selected} label={t('页面组件','Page components','ページのコンポーネント')} onSelect={ids => props.componentSelect?.(ids)} onOpen={id => props.componentSelect?.([id])} onMoveMany={props.componentMove} onRename={props.componentRename}/>
      <DomRegion node={props.pageOutline.tools}/>
      <DomRegion node={props.pageOutline.inspector}/>
    </div> : <p className="gc-dock-missing-view" role="status">{t('打开一个页面以查看组件与属性。','Open a page to see its components and properties.','ページを開くと、部品とプロパティが表示されます。')}</p>;
  const contextNavigation = props.explorer ? <DomRegion node={props.explorer}/> : null;
  const explorerTitle = t('剧情目录','Plot outline','プロット一覧');
  const waitingForAssets = <p className="gc-dock-missing-view" role="status">{t('正在准备作品素材…','Preparing project assets…','作品素材を準備しています…')}</p>;
  const tools = {
    [dockTools.outline]: { title: explorerTitle, icon: <ListTree/>, zone: 'left', allowedZones: sidebarZones, content: <div ref={bindOutlineScroll}>{explorer}</div> },
    [dockTools.search]: { title: t('语义查找','Semantic search','セマンティック検索'), icon: <Search/>, zone: 'left', allowedZones: sidebarZones, content: props.search ? <DomRegion node={props.search} className="gc-studio-dock-search"/> : <p className="gc-dock-missing-view">{t('打开场景工作区以查找正文或引用。','Open the scene workspace to find dialogue or references.','シーンの作業スペースで本文や参照を検索できます。')}</p> },
    [dockTools.inspector]: { title: t('属性','Inspector','プロパティ'), icon: <SlidersHorizontal/>, zone: 'right', allowedZones: sidebarZones, content: <DomRegion node={props.inspectorAvailable === false ? null : props.inspector}/> },
    [dockTools.problems]: { title: t('问题','Problems','問題'), icon: <CircleAlert/>, zone: 'bottom', allowedZones: problemZones, content: <DomRegion node={props.problems}/> },
    [dockTools.stage]: { title: t('舞台','Stage','ステージ'), icon: <MonitorPlay/>, zone: 'center', allowedZones: editorZones, content: <DomRegion node={props.stage}/> },
    [dockTools.assetDirectory]: { title: t('素材目录','Asset directory','素材一覧'), icon: <Folder/>, zone: 'left', allowedZones: sidebarZones, content: props.assetDirectory ? <DomRegion node={props.assetDirectory}/> : waitingForAssets },
    [dockTools.assetInspector]: { title: t('素材属性','Asset properties','素材プロパティ'), icon: <SlidersHorizontal/>, zone: 'right', allowedZones: sidebarZones, content: props.assetInspector ? <DomRegion node={props.assetInspector}/> : waitingForAssets },
    [dockTools.assets]: { title: t('素材库','Asset library','素材ライブラリ'), icon: <Images/>, zone: 'bottom', allowedZones: problemZones, content: props.assetLibrary ? <DomRegion node={props.assetLibrary}/> : waitingForAssets },
    [dockTools.characters]: { title: t('角色目录','Character directory','キャラクター一覧'), icon: <UsersRound/>, zone: 'left', allowedZones: sidebarZones, content: <DomRegion node={props.characterExplorer}/> },
    [dockTools.pageDirectory]: { title: t('页面目录','Page directory','ページ一覧'), icon: <Layers/>, zone: 'left', allowedZones: sidebarZones, content: pageDirectory },
    [dockTools.pageOutline]: { title: t('页面大纲','Page outline','ページ構成'), icon: <ListTree/>, zone: 'right', allowedZones: sidebarZones, content: pageOutline },
  } satisfies Record<string, { title: string; icon: ReactNode; zone: Zone; allowedZones: readonly Zone[]; content: ReactNode }>;
  const tool = (id: string) => tools[id as keyof typeof tools];
  const active = centralViewId(props.active);
  const besideId = props.beside ? sceneCompanionId(active) : undefined;
  const companionView = (id: string) => id === besideId ? props.beside : props.retainedCompanions?.get(id);
  const retainStowedView = (id: string) => Boolean(companionView(id)) || props.documents.some(doc => doc.kind === 'scene' && doc.id !== active && sceneCompanionId(doc.id) === id);
  const documentViews = props.documents.some(doc => doc.id === active) ? props.documents : [...props.documents, { id: active }];
  const projectTools: readonly string[] = [dockTools.search, dockTools.assetDirectory, dockTools.assetInspector, dockTools.assets, dockTools.characters, dockTools.pageDirectory, dockTools.pageOutline];
  const viewIds = [...new Set([...documentViews.map(doc => doc.id), ...Object.keys(tools).filter(id => source || !projectTools.includes(id)), ...(props.retainedCompanions?.keys() ?? []), ...(besideId ? [besideId] : [])])];
  const otherDocuments = documentViews.filter(doc => doc.id !== active).map(doc => doc.id);
  const toPresetView = (id: string, restoring: boolean) => {
    if (tool(id) || !id) return id;
    if (restoring) {
      if (id === '$document') return active;
      if (id === '$companion') return besideId ?? '';
      return otherDocuments[Number(/^\$document-(\d+)$/.exec(id)?.[1]) - 1] ?? '';
    }
    if (id === active) return '$document';
    if (id === besideId) return '$companion';
    const index = otherDocuments.indexOf(id);
    return index === -1 ? '' : `$document-${index + 1}`;
  };
  const prune = (layout: ZonedLayout) => {
    const next = structuredClone(layout);
    const transient = new Set(next.previews);
    for (const pane of allGroups(next)) pane.tabs = pane.tabs.map(id => id === 'empty' ? dockTools.empty : id)
      .filter(id => id !== 'route:assets' && !transient.has(id));
    next.previews = [];
    return normalize(next);
  };
  const namedLayouts = Object.fromEntries(Object.entries(props.namedLayouts ?? {}).filter((item): item is [string, ZonedLayout & typeof item[1]] => validLayout(item[1])));
  const invoke = (run: () => void | Promise<void>) => { void Promise.resolve().then(run).catch(error => props.dockNotice(String(error))); };
  const sceneTarget = props.documents.find(document => document.id === active && document.kind === 'scene')?.objectId
    ?? props.selected.find(id => source?.scenes.some(scene => scene.sceneId === id));
  const combinations: StudioChromeMenuItem[] = [
    { id: 'writing-stage', label: t('文稿与舞台','Writing and stage','原稿とステージ'), disabled: !source, run: () => {
      props.dock.current?.openCombination([dockTools.outline, dockTools.inspector], sceneTarget ? {} : { focusOrder: [dockTools.outline, dockTools.inspector] });
      if (sceneTarget && props.openWritingStage) invoke(() => props.openWritingStage!(sceneTarget));
    } },
    { id: 'manage-assets', label: t('素材管理','Asset management','素材管理'), disabled: !source, run: () => { if (props.openAssets) invoke(props.openAssets); } },
    { id: 'character-difference', label: t('角色差分','Character differences','キャラクター差分'), disabled: !source, run: () => {
      const tools = [dockTools.characters, dockTools.assets, dockTools.assetInspector];
      const target = props.characterTarget;
      props.dock.current?.openCombination(tools, target ? {} : { focusOrder: tools });
      if (target && props.openCharacterDifference) invoke(() => props.openCharacterDifference!(target));
    } },
    { id: 'build-pages', label: t('页面搭建','Page building','ページ制作'), disabled: !source, run: () => {
      props.preparePageDirectory?.();
      const tools = [dockTools.pageDirectory, dockTools.pageOutline];
      props.dock.current?.openCombination(tools, props.pageOutline ? {} : { focusOrder: tools });
    } },
  ];
  const presets: StudioChromeMenuItem[] = [
    { id: 'balanced', label: t('平衡布局','Balanced layout','標準レイアウト'), run: () => props.dock.current?.preset('balanced') },
    { id: 'writing', label: t('专注写作','Focus on writing','執筆に集中'), run: () => props.dock.current?.preset('writing') },
    { id: 'show-search', label: t('显示语义查找','Show semantic search','セマンティック検索を表示'), disabled: !props.search, run: () => props.dock.current?.open(dockTools.search), separatorBefore: true },
    { id: 'show-inspector', label: t('显示属性','Show inspector','プロパティを表示'), disabled: props.inspectorAvailable === false, run: () => props.dock.current?.open(dockTools.inspector) },
    { id: 'show-stage', label: t('显示舞台','Show stage','ステージを表示'), disabled: !props.stage, run: () => props.dock.current?.open(dockTools.stage) },
    { id: 'show-problems', label: t('显示问题','Show problems','問題を表示'), disabled: !props.problems, run: () => props.dock.current?.open(dockTools.problems) },
    { id: 'show-asset-directory', label: t('显示素材目录','Show asset directory','素材一覧を表示'), disabled: !source, run: () => props.dock.current?.open(dockTools.assetDirectory) },
    { id: 'show-assets', label: t('显示素材库','Show asset library','素材ライブラリを表示'), disabled: !source, run: () => props.dock.current?.open(dockTools.assets) },
    { id: 'show-asset-inspector', label: t('显示素材属性','Show asset properties','素材プロパティを表示'), disabled: !source, run: () => props.dock.current?.open(dockTools.assetInspector) },
    { id: 'show-characters', label: t('显示角色目录','Show character directory','キャラクター一覧を表示'), disabled: !source, run: () => props.dock.current?.open(dockTools.characters) },
    { id: 'show-page-directory', label: t('显示页面目录','Show page directory','ページ一覧を表示'), disabled: !source, run: () => { props.preparePageDirectory?.(); props.dock.current?.open(dockTools.pageDirectory); } },
    { id: 'show-page-outline', label: t('显示页面大纲','Show page outline','ページ構成を表示'), disabled: !source, run: () => props.dock.current?.open(dockTools.pageOutline) },
    { id: 'save-layout', label: t('保存命名布局…','Save named layout…','レイアウトに名前を付けて保存…'), disabled: !source, separatorBefore: true, run: () => { setLayoutName(''); setNamingLayout(true); } },
    ...Object.keys(namedLayouts).flatMap(name => [
      { id: `layout:${name}`, label: name, disabled: !source, run: () => props.dock.current?.restorePreset(name) },
      { id: `update-layout:${name}`, label: t(`更新「${name}」`,`Update “${name}”`,`「${name}」を更新`), disabled: !source, run: () => props.dock.current?.savePreset(name) },
    ]),
  ];
  return <TooltipProvider>
    <div className="gc-workbench gc-studio-workbench" data-workbench="zoned">
      <StudioChrome {...props.chrome} layout={presets} combinations={combinations}/>
      {props.notice && <div className="gc-studio-workbench-notice">{props.notice}</div>}
      <DockWorkspace key={source?.project.projectId ?? 'library'} ref={props.dock} locale={props.locale} initial="writing"
        activeView={active} documentViews={documentViews} viewIds={viewIds}
        companion={besideId ? { id: besideId, document: active, preserveSidebars: active.startsWith('page:') } : undefined}
        retainStowedView={retainStowedView}
        createDefaultLayout={preset => initialDock(props, preset)}
        initialLayout={validLayout(props.dockLayout) ? prune(props.dockLayout) : undefined}
        onLayoutChange={props.dockLayoutChange}
        readPresets={() => namedLayouts} writePresets={props.writeNamedLayouts}
        mapPresetView={toPresetView}
        title={id => {
          const document = props.documents.find(item => item.id === id);
          return tool(id)?.title ?? companionView(id)?.title ?? (document ? documentTitle(document) : id);
        }}
        icon={id => tool(id)?.icon ?? (props.documents.find(document => document.id === id)?.kind === 'page' ? <Layers/> : <FileText/>)}
        zone={id => tool(id)?.zone ?? 'center'}
        allowedZones={id => tool(id)?.allowedZones ?? editorZones}
        minSize={id => ({ width: /^(studio-beside:)?page:/.test(id) ? 360 : 480, height: 240 })}
        canCloseView={id => id !== dockTools.empty}
        canSplitView={id => Boolean(companionView(id)) || id === dockTools.stage || props.documents.some(document => document.id === id && ['scene', 'asset', 'character'].includes(document.kind))}
        isPlaceholder={id => id === dockTools.empty}
        onViewFocus={props.onViewFocus}
        status={id => ({ dirty: props.documents.find(document => document.id === id)?.dirty })}
        onActivate={(id, reason) => {
          if (id === dockTools.inspector) props.inspectorShown?.();
          if (id === dockTools.pageDirectory && !props.pageNodes) props.preparePageDirectory?.();
          companionView(id)?.activate();
          if (id === active && reason === 'tab') props.activateScenePane?.();
          const document = props.documents.find(item => item.id === id);
          if (document && id !== active && (reason === 'tab' || !props.activateVisibleDocument?.(id))) invoke(() => props.open(document));
        }}
        onClose={id => companionView(id)?.close() ?? (tool(id) ? true : props.close(id))}
        onKeep={props.pin}
        onViewsChange={ids => {
          const order = ids.filter(id => props.documents.some(document => document.id === id));
          if (order.length === props.documents.length && order.some((id, index) => id !== props.documents[index]?.id)) props.reorder(order);
        }}
        notice={props.dockNotice}
        renderView={id => {
          if (tool(id)) return tool(id).content;
          const companion = companionView(id);
          if (companion) return <div className="gc-studio-document-body" onPointerDownCapture={event => {
            if (id === besideId || props.activateVisibleDocument?.(id.replace(/^studio-beside:/, ''))) return;
            event.preventDefault(); event.stopPropagation(); companion.activate();
          }}><DomRegion node={companion.node} className="gc-studio-dock-beside"/></div>;
          const document = props.documents.find(item => item.id === id);
          const current = id === active;
          const region = current ? { node: props.content, toolbar: props.toolbar } : props.documentRegions?.get(id);
          const interactive = current || region?.interactive;
          return <div className="gc-studio-dock-document" onPointerDownCapture={event => {
            if (current || !interactive || props.activateVisibleDocument?.(id)) return;
            event.preventDefault(); event.stopPropagation(); props.dock.current?.open(id);
          }}>
            {!interactive && document && <Button tone="quiet" data-dock-focus onClick={() => props.dock.current?.open(id)}>{t(`编辑 ${documentTitle(document)}`, `Edit ${documentTitle(document)}`, `${documentTitle(document)}を編集`)}</Button>}
            {current && (contextNavigation || props.contextInspector) && <details className="gc-studio-document-tools">
              <summary>{t('当前文档工具','Document tools','文書ツール')}</summary>
              {contextNavigation}{props.contextInspector && <DomRegion node={props.contextInspector}/>}
            </details>}
            {region && <div className="gc-studio-dock-document gc-studio-document-body" inert={!interactive || undefined}>
              {region.toolbar && <DomRegion node={region.toolbar}/>}
              <DomRegion node={region.node} className="gc-wb-document-content"/>
            </div>}
          </div>;
        }}
      />
      <DomRegion node={props.status}/>
    </div>
    {namingLayout && <MessageBox title={t('保存命名布局','Save named layout','レイアウトを保存')} description={
      <><Input autoFocus aria-label={t('布局名称','Layout name','レイアウト名')} value={layoutName} maxLength={80} onChange={event => setLayoutName(event.target.value)}/>
      {Object.hasOwn(namedLayouts, layoutName.trim()) && <p role="status">{t('此布局已存在，请使用更新布局操作。','This layout exists. Use its update action.','既存のレイアウトは更新操作を使用してください。')}</p>}</>
    } actions={[{ label: t('保存','Save','保存'), tone: 'primary', run: () => {
      const name = layoutName.trim();
      if (name && !Object.hasOwn(namedLayouts, name)) { props.dock.current?.savePreset(name); setNamingLayout(false); }
    } }]} onClose={() => setNamingLayout(false)}/>}
    {props.confirm && <MessageBox title={props.confirm.title} description={props.confirm.description} cancelLabel={props.confirm.cancelLabel} actions={props.confirm.actions} onClose={props.confirm.close}/>}
  </TooltipProvider>;
}
