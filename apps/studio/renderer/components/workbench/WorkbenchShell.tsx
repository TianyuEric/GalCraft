import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs.js';
import { ScrollArea } from '@base-ui/react/scroll-area';
import { Toolbar, ToolbarButton, ToolbarGroup } from '../ui/toolbar.js';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2, MoreHorizontal, PanelLeft, PanelRight, X } from 'lucide-react';
import { ObjectMenu, isObjectMenuKey, type ObjectMenuOrigin } from './ObjectMenu.js';
import { Button } from '../controls.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js';
import './workbench.css';

export function IconAction({ label, children, onClick, pressed, disabled, toolbar = false, action }: { action?: string; toolbar?: boolean; label: string; children: ReactNode; onClick(): void; pressed?: boolean; disabled?: boolean }) {
  return <Tooltip><TooltipTrigger render={toolbar ? <ToolbarButton variant="ghost" size="icon" className="gc-wb-icon" aria-label={label} data-workbench-action={action} aria-pressed={pressed} disabled={disabled} onClick={onClick}/> : <Button tone="quiet" className="gc-wb-icon" aria-label={label} data-workbench-action={action} aria-pressed={pressed} disabled={disabled} onClick={onClick}/>}>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

export function ResizeHandle({ label, axis, value, min, max, onChange, onCommit }: { label: string; axis: 'x' | 'y'; value: number; min: number; max: number; onChange(value: number): void; onCommit?(value: number): void }) {
  const start = useRef<{ position: number; value: number } | null>(null);
  const current = useRef(value); current.current = value;
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return <div role="separator" tabIndex={0} aria-label={label} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    className={`gc-wb-resize gc-wb-resize-${axis}`} onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { position: axis === 'x' ? event.clientX : event.clientY, value };
    }} onPointerMove={event => {
      if (!start.current) return;
      const delta = (axis === 'x' ? event.clientX : event.clientY) - start.current.position;
      current.current = clamp(start.current.value + delta); onChange(current.current);
    }} onPointerUp={() => { if (start.current) onCommit?.(current.current); start.current = null; }} onPointerCancel={() => { if (start.current) onChange(start.current.value); start.current = null; }}
    onKeyDown={event => {
      const negative = axis === 'x' ? 'ArrowLeft' : 'ArrowUp', positive = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
      if (![negative, positive, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'Home' ? min : event.key === 'End' ? max : clamp(value + (event.key === negative ? -10 : 10)); onChange(next); onCommit?.(next);
    }}/>;
}

export function InspectorSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="gc-wb-inspector-section"><header><h3>{title}</h3>{action}</header>{children}</section>;
}

export type WorkbenchDocument = { id: string; title: string; icon: ReactNode; preview?: boolean; dirty?: boolean; closable?: boolean };
export function DocumentTabs({ documents, active, onSelect, onPin, onClose, onCloseMany, onReorder, panelId }: {
  panelId?: string; documents: WorkbenchDocument[]; active: string; onSelect(id: string): void; onPin(id: string): void;
  onClose(id: string): void | Promise<boolean | void>; onCloseMany?(ids: string[]): void; onReorder?(ids: string[]): void;
}) {
  const t=(zh:string,en:string,ja:string)=>document.getElementById('studio-portals')?.lang==='en'?en:document.getElementById('studio-portals')?.lang==='ja'?ja:zh;
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(active), [menu, setMenu] = useState<(ObjectMenuOrigin & { id: string }) | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const drag = useRef<{ id: string; start: number; x: number; moved: boolean; frame: number } | null>(null);
  const dropRef = useRef(drop); dropRef.current = drop;
  const suppressClick = useRef(false), previousIds = useRef(documents.map(doc => doc.id));
  const focus = (id: string) => { setFocused(id); root.current?.querySelector<HTMLElement>(`[data-document-id="${CSS.escape(id)}"] [role="tab"]`)?.focus({ preventScroll: true }); };
  const reorder = (id: string, to: number) => { const ids = documents.map(doc => doc.id); ids.splice(ids.indexOf(id), 1); ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id); onReorder?.(ids); };
  const stopDrag = () => { if (drag.current) cancelAnimationFrame(drag.current.frame); drag.current = null; setDrop(null); };
  useEffect(() => () => { if (drag.current) cancelAnimationFrame(drag.current.frame); }, []);
  useLayoutEffect(() => {
    const old = previousIds.current, ids = documents.map(doc => doc.id);
    if (!ids.includes(focused)) { const index = Math.max(0, old.indexOf(focused)); const next = ids[Math.min(index, ids.length - 1)]; if (next) focus(next); }
    previousIds.current = ids;
  }, [documents]);
  useEffect(() => {
    const strip = root.current; if (!strip) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const before = strip.scrollLeft;
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 24 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? strip.clientWidth : 1;
      strip.scrollLeft += event.deltaY * unit;
      if (strip.scrollLeft !== before) event.preventDefault();
    };
    strip.addEventListener('wheel', wheel, { passive: false });
    return () => strip.removeEventListener('wheel', wheel);
  }, []);
  useLayoutEffect(() => { const strip = root.current, tab = strip?.querySelector<HTMLElement>('[data-active="true"]'); if (!strip || !tab) return; const viewport = strip.getBoundingClientRect(), bounds = tab.getBoundingClientRect(); if (bounds.left < viewport.left) strip.scrollLeft -= viewport.left - bounds.left; else if (bounds.right > viewport.right) strip.scrollLeft += bounds.right - viewport.right; }, [active]);
  const closeMany = async (ids: string[]) => { ids = ids.filter(id => documents.find(doc => doc.id === id)?.closable !== false); if (onCloseMany) return onCloseMany(ids); for (const id of ids) if (await onClose(id) === false) break; };
  const menuDoc = documents.find(doc => doc.id === menu?.id), menuIndex = documents.findIndex(doc => doc.id === menu?.id);
  return <Tabs value={active} onValueChange={value => onSelect(String(value))} className="gc-wb-document-tabs"><ScrollArea.Root className="gc-wb-document-scroll"><ScrollArea.Viewport ref={root} className="gc-wb-documents"><ScrollArea.Content><TabsList className="gc-wb-document-list" activateOnFocus={false} loopFocus aria-label={t('打开的文档','Open documents','開いている文書')} onKeyDown={event => {
    if(event.key==='Escape' && drag.current){event.preventDefault();suppressClick.current=true;stopDrag();}
  }}>{documents.map(doc => <div className="gc-wb-document" data-document-id={doc.id} data-active={doc.id === active} data-drop={drop?.id === doc.id ? drop.after ? 'after' : 'before' : undefined} key={doc.id}
    onContextMenu={event => { event.preventDefault(); if (doc.closable === false) return; setMenu({ id: doc.id, element: event.currentTarget.querySelector<HTMLElement>('[role="tab"]')!, x: event.clientX, y: event.clientY }); }}>
    <TabsTrigger value={doc.id} title={doc.title} id={`gc-document-tab-${doc.id}`} aria-controls={panelId} aria-selected={active === doc.id} aria-label={`${doc.title}${doc.dirty ? t('，未保存',', unsaved','、未保存') : ''}${doc.preview ? t('，预览标签',', preview tab','、プレビュータブ') : ''}`}
      className={doc.preview ? 'is-preview' : ''} onFocus={() => setFocused(doc.id)} onKeyDown={event => { if (doc.closable !== false && isObjectMenuKey(event)) { event.preventDefault(); event.stopPropagation(); setMenu({ id: doc.id, element: event.currentTarget }); } }}
      onPointerDown={event => { if (!onReorder || event.button !== 0) return; suppressClick.current = false; drag.current = { id: doc.id, start: event.clientX, x: event.clientX, moved: false, frame: 0 }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => {
        const current = drag.current, strip = root.current; if (!current || !strip) return; current.x = event.clientX;
        if (!current.moved && Math.abs(current.x - current.start) < 5) return;
        if (current.moved) return; current.moved = true;
        const tick = () => {
          if (drag.current !== current) return;
          const box = strip.getBoundingClientRect(); strip.scrollLeft += current.x < box.left + 30 ? -10 : current.x > box.right - 30 ? 10 : 0;
          const tabs = [...strip.querySelectorAll<HTMLElement>('[data-document-id]')];
          const target = tabs.find(tab => current.x < tab.getBoundingClientRect().right) ?? tabs.at(-1);
          if (target) { const bounds = target.getBoundingClientRect(); const next = { id: target.dataset.documentId!, after: current.x > (bounds.left + bounds.right) / 2 }; dropRef.current = next; setDrop(next); }
          current.frame = requestAnimationFrame(tick);
        }; tick();
      }} onPointerUp={() => { const current = drag.current, target = dropRef.current; if (current?.moved) { suppressClick.current = true; if (target && current.id !== target.id) { const ids = documents.filter(item => item.id !== current.id).map(item => item.id); reorder(current.id, ids.indexOf(target.id) + Number(target.after)); } } stopDrag(); }} onPointerCancel={stopDrag}
      onClick={event => { if (suppressClick.current) { suppressClick.current=false;event.preventDefault(); } }} onDoubleClick={() => onPin(doc.id)}>{doc.icon}<span>{doc.title}</span>{doc.dirty && <span className="gc-wb-dirty" aria-hidden="true">●</span>}</TabsTrigger>
    <Button tone="quiet" className="gc-wb-tab-more" aria-label={t(`${doc.title}的文档菜单`,`Document menu for ${doc.title}`,`${doc.title}の文書メニュー`)} onClick={event => setMenu({ id: doc.id, element: event.currentTarget })}><MoreHorizontal/></Button>
    {doc.closable !== false && <IconAction label={t(`关闭${doc.title}`,`Close ${doc.title}`,`${doc.title}を閉じる`)} onClick={() => onClose(doc.id)}><X/></IconAction>}
  </div>)}</TabsList></ScrollArea.Content></ScrollArea.Viewport><ScrollArea.Scrollbar orientation="horizontal" className="gc-wb-document-scrollbar"><ScrollArea.Thumb className="gc-wb-document-thumb"/></ScrollArea.Scrollbar></ScrollArea.Root>{menu && menuDoc && <ObjectMenu origin={menu} close={() => setMenu(null)} groups={[{ label: menuDoc.title, actions: [
    { label: t('关闭','Close','閉じる'), run: () => void onClose(menuDoc.id) },
    { label: t('关闭其他','Close others','他を閉じる'), run: () => void closeMany(documents.filter(doc => doc.id !== menuDoc.id).map(doc => doc.id)) },
    { label: t('关闭右侧','Close to the right','右側を閉じる'), disabled: menuIndex === documents.length - 1 ? t('右侧没有文档','No documents to the right','右側に文書がありません') : undefined, run: () => void closeMany(documents.slice(menuIndex + 1).map(doc => doc.id)) },
    { label: t('固定','Pin','固定'), disabled: !menuDoc.preview ? t('文档已固定','Document is pinned','文書は固定済みです') : undefined, run: () => onPin(menuDoc.id) },
    ...(onReorder ? [{ label: t('向左移动','Move left','左へ移動'), disabled: menuIndex === 0 ? t('已在最左侧','Already at the left edge','左端です') : undefined, run: () => reorder(menuDoc.id, menuIndex - 1) }, { label: t('向右移动','Move right','右へ移動'), disabled: menuIndex === documents.length - 1 ? t('已在最右侧','Already at the right edge','右端です') : undefined, run: () => reorder(menuDoc.id, menuIndex + 1) }] : []),
  ] }]}/>}</Tabs>;
}

export type WorkbenchPanel = { id: string; title: string; count?: number; content: ReactNode };
export type WorkbenchLayout = { left: number; right: number; bottom: number; diagnosticsVisible: boolean };
export function WorkbenchShell({ title, header, headerActions, activity, explorerTitle, explorerActions, explorer, inspectorTitle = 'Inspector', inspectorActions, inspector, documents, toolbar, notice, children, panels, status, initialPanelOpen = true, initialFocus = false, layout, onLayoutChange, onInspectorShown, inspectorAvailable = true }: {
  header?: ReactNode; layout?: WorkbenchLayout; onLayoutChange?(layout: WorkbenchLayout): void;
  onInspectorShown?(): void;
  inspectorAvailable?: boolean;
  title: ReactNode; headerActions?: ReactNode; activity: ReactNode; explorerTitle: string; explorerActions?: ReactNode; explorer: ReactNode;
  inspectorTitle?: string; inspectorActions?: ReactNode; inspector: ReactNode; documents: ReactNode; toolbar: ReactNode; children: ReactNode;
  notice?: ReactNode; panels: WorkbenchPanel[]; status: ReactNode; initialPanelOpen?: boolean; initialFocus?: boolean;
}) {
  const t=(zh:string,en:string,ja:string)=>document.getElementById('studio-portals')?.lang==='en'?en:document.getElementById('studio-portals')?.lang==='ja'?ja:zh;
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1440), [leftWidth, setLeftWidth] = useState(layout?.left ?? 232), [rightWidth, setRightWidth] = useState(layout?.right ?? 280);
  const [left, setLeft] = useState(true), [right, setRight] = useState(true), [priority, setPriority] = useState<'left' | 'right'>('left');
  const [focused, setFocused] = useState(initialFocus), [panelOpen, setPanelOpen] = useState(layout?.diagnosticsVisible ?? initialPanelOpen), [maximized, setMaximized] = useState(false);
  const [panelId, setPanelId] = useState(panels[0]?.id), [panelSize, setPanelSize] = useState(layout?.bottom ?? 158);
  useEffect(() => { if (layout) { setLeftWidth(layout.left); setRightWidth(layout.right); setPanelSize(layout.bottom); setPanelOpen(layout.diagnosticsVisible); } }, [layout?.left, layout?.right, layout?.bottom, layout?.diagnosticsVisible]);
  const commitLayout = (patch: Partial<WorkbenchLayout>) => onLayoutChange?.({ left: leftWidth, right: rightWidth, bottom: panelSize, diagnosticsVisible: panelOpen, ...patch });
  useEffect(() => { if (!root.current) return; const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(root.current); return () => observer.disconnect(); }, []);
  const narrow = width < 1100, showLeft = !focused && left && (!narrow || priority === 'left' || !right || !inspectorAvailable), showRight = inspectorAvailable && !focused && right && (!narrow || priority === 'right' || !left);
  useEffect(() => { if (showRight) onInspectorShown?.(); }, [showRight, onInspectorShown]);
  const currentPanel = panels.find(panel => panel.id === panelId) ?? panels[0];
  const style: CSSProperties = { gridTemplateColumns: `48px ${showLeft ? `${leftWidth}px var(--workbench-resize-width,5px) ` : ''}minmax(0,1fr)${showRight ? ` var(--workbench-resize-width,5px) ${rightWidth}px` : ''}` };
  return <div ref={root} className="gc-workbench" data-focused={focused} data-inspector-visible={showRight}>
    {header ?? <header className="gc-wb-header"><div className="gc-wb-brand">{title}</div><div className="gc-wb-header-actions">{headerActions}</div></header>}
    <div className="gc-wb-grid" style={style}>
      <nav className="gc-wb-activity" aria-label={t('工作区','Workspace','ワークスペース')}>{activity}</nav>
      {showLeft && <><aside className="gc-wb-explorer" aria-label="Explorer"><header className="gc-wb-pane-heading"><h2>{explorerTitle}</h2>{explorerActions}</header><div className="gc-wb-pane-scroll">{explorer}</div></aside>
        <ResizeHandle label={t('Explorer宽度','Explorer width','Explorer の幅')} axis="x" value={leftWidth} min={190} max={360} onChange={setLeftWidth} onCommit={left => commitLayout({ left })}/></>}
      <main className="gc-wb-central">
        {documents}
        <Toolbar className="gc-wb-toolbar" aria-label={t('文档工具','Document tools','文書ツール')}><ToolbarGroup className="gc-wb-object-tools">{toolbar}</ToolbarGroup><ToolbarGroup className="gc-wb-layout-tools">
          <IconAction toolbar action="explorer" label={t('显示或隐藏Explorer','Show or hide Explorer','Explorer を表示・非表示')} pressed={showLeft} onClick={() => { setFocused(false); setLeft(!showLeft); setPriority('left'); }}><PanelLeft/></IconAction>
          <IconAction toolbar action="inspector" label={t('显示或隐藏Inspector','Show or hide Inspector','プロパティを表示・非表示')} pressed={showRight} disabled={!inspectorAvailable} onClick={() => { setFocused(false); setRight(!showRight); setPriority('right'); }}><PanelRight/></IconAction>
          <IconAction toolbar label={focused ? t('退出聚焦','Exit focus','フォーカス表示を終了') : t('聚焦编辑','Focus editor','編集に集中')} pressed={focused} onClick={() => setFocused(!focused)}>{focused ? <Minimize2/> : <Maximize2/>}</IconAction>
        </ToolbarGroup></Toolbar>
        {notice && <div className="gc-wb-notice">{notice}</div>}
        <div id="gc-workbench-editor" role="tabpanel" aria-label={t('当前文档','Current document','現在の文書')} className="gc-wb-editor" hidden={!!currentPanel && maximized && panelOpen}>{children}</div>
        {currentPanel && <section className="gc-wb-bottom" aria-label={t('中央底栏','Document panel','文書パネル')} data-maximized={maximized && panelOpen}>
          {panelOpen && !maximized && <ResizeHandle label={t('中央编辑区与底栏分隔','Resize document panel','文書パネルのサイズを変更')} axis="y" value={-panelSize} min={-400} max={-100} onChange={next => setPanelSize(-next)} onCommit={next => commitLayout({ bottom: -next })}/>}
          <Tabs value={currentPanel?.id} className="gc-wb-panel-navigation" onValueChange={value => {setPanelId(String(value));setPanelOpen(true);}}><TabsList className="gc-wb-panel-tabs" aria-label={t('底栏内容','Panel contents','パネルの内容')}>{panels.map(panel => <TabsTrigger key={panel.id} value={panel.id} onClick={() => setPanelOpen(true)}>{panel.title}{panel.count !== undefined && <span>{panel.count}</span>}</TabsTrigger>)}
            <span className="gc-wb-spacer"/><IconAction label={maximized ? t('恢复底栏高度','Restore panel height','パネルの高さを戻す') : t('最大化中央底栏','Maximize document panel','文書パネルを最大化')} onClick={() => { setMaximized(!maximized); setPanelOpen(true); }}>{maximized ? <Minimize2/> : <Maximize2/>}</IconAction>
            <IconAction label={panelOpen ? t('收起底栏','Collapse panel','パネルを閉じる') : t('展开底栏','Expand panel','パネルを開く')} onClick={() => { setPanelOpen(!panelOpen); commitLayout({ diagnosticsVisible: !panelOpen }); setMaximized(false); }}>{panelOpen ? <ChevronDown/> : <ChevronUp/>}</IconAction>
          </TabsList>
          {panelOpen && currentPanel && <TabsContent value={currentPanel.id} className="gc-wb-panel-content" aria-label={currentPanel.title} style={{ height: maximized ? undefined : panelSize }}>{currentPanel.content}</TabsContent>}</Tabs>
        </section>}
      </main>
      {showRight && <><ResizeHandle label={t('Inspector左边界','Inspector width','プロパティの幅')} axis="x" value={-rightWidth} min={-520} max={-248} onChange={next => setRightWidth(-next)} onCommit={next => commitLayout({ right: -next })}/>
        <aside className="gc-wb-inspector" aria-label="Inspector"><header className="gc-wb-pane-heading"><h2>{inspectorTitle}</h2>{inspectorActions}</header><div className="gc-wb-pane-scroll">{inspector}</div></aside></>}
    </div>
    <footer className="gc-wb-status" role="status">{status}</footer>
  </div>;
}
