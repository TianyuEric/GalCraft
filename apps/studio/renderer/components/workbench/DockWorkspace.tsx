import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode, type Ref } from 'react';
import { ChevronDown, Columns2, Maximize2, Minimize2, PanelBottom, PanelLeft, PanelRight, X } from 'lucide-react';
import { allGroups, change, clamp, emptyLayout, geometry, group, groups, minimum, normalize, openViews, removeGroup, validLayout, type Group, type Rect, type Zone, type ZonedLayout } from './zoned-layout.js';
import { DockActionMenu, type DockMenuTarget } from './DockActionMenu.js';
import { DockTab, DockTabList } from './DockTabs.js';
import './dock-workspace.css';

export type LayoutPreset = 'balanced' | 'writing' | 'source' | 'stage' | 'documents' | 'custom';
export type OpenOptions = { preview?: boolean; beside?: 'x' | 'y'; focus?: boolean };
export type DockHandle = {
  open(id: string, options?: OpenOptions): void;
  activate(id: string, options?: { focus?: boolean }): void;
  split(id: string, axis?: 'x' | 'y'): void;
  toggle(zone: 'left' | 'right' | 'bottom'): void;
  close(id: string): void;
  preset(name: LayoutPreset): void;
  listPresets(): string[];
  savePreset(name?: string): Promise<void>;
  restorePreset(name?: string): void;
  snapshot(): ZonedLayout;
};
type LayoutLoad = { layout?: ZonedLayout; error?: string };
export type DockWorkspaceProps = {
  ref?: Ref<DockHandle>; initial?: LayoutPreset; initialView?: string;
  viewIds: readonly string[]; renderView(id: string): ReactNode; title(id: string): string; icon?(id: string): ReactNode;
  zone?(id: string): Zone;
  allowedZones?(id: string): readonly Zone[];
  minSize?(id: string): { width: number; height: number };
  status?(id: string): { dirty?: boolean; error?: string; running?: boolean }; onActivate?(id: string, reason?: 'tab'): void; notice(message: string): void;
  onClose?(id: string): boolean | Promise<boolean>; onViewsChange?(ids: readonly string[]): void;
  onBeforeClose?(ids: readonly string[]): boolean | Promise<boolean>;
  onKeep?(id: string): void;
  canCloseView?(id: string): boolean;
  canSplitView?(id: string): boolean;
  onRestoreStageSource?(sceneId: string): void;
  activeView?: string;
  documentViews?: readonly { id: string; preview?: boolean }[];
  companion?: { id: string; document: string; axis?: 'x' | 'y' };
  retainStowedView?(id: string): boolean;
  createDefaultLayout?(preset: LayoutPreset): ZonedLayout;
  initialLayout?: ZonedLayout;
  onLayoutChange?(layout: ZonedLayout): void;
  loadLayout?(): LayoutLoad;
  saveLayout?(layout: ZonedLayout): void;
  readPresets?(): Record<string, ZonedLayout>;
  writePresets?(presets: Record<string, ZonedLayout>): void | Promise<void>;
  mapPresetView?(id: string, restore: boolean): string;
  resolveViewId?(id: string): string;
  replaceView?(existing: string, incoming: string): boolean;
  locale?: string;
  leftRail?: ReactNode;
  retainFocus?(target: HTMLElement): boolean;
  testId?: string;
};

function DockButton({ className = '', ...props }: ComponentPropsWithoutRef<'button'>) {
  return <button type="button" data-slot="dock-button" className={`gc-dock-button ${className}`} {...props}/>;
}
function DockIconButton({ label, ...props }: ComponentPropsWithoutRef<'button'> & { label: string }) {
  return <DockButton aria-label={label} title={label} {...props}/>;
}

const uid = () => crypto.randomUUID(), gap = 5, header = 37, bottomRail = 28;
const sideRailWidth = { left: 49, right: 48 }, sideSashWidth = 1;
const defaultSize = () => ({ width: 480, height: 240 });
const side = (zone: Zone): zone is 'left' | 'right' => zone === 'left' || zone === 'right';
const sideZones = ['left', 'right'] as const;
const groupZone = (id: string): Zone => id === 'left' || id === 'right' || id === 'bottom' ? id : 'center';
export function DockWorkspace(props: DockWorkspaceProps) {
  const tabNamespace = useId();
  const { ref, initial = 'balanced', initialView, activeView, documentViews, companion, viewIds, renderView, title, icon, status, onActivate, notice } = props;
  const t = (zh: string, en: string, ja: string) => props.locale === 'en' ? en : props.locale === 'ja' ? ja : zh;
  const zoneOf = props.zone ?? (() => 'center' as const), minSize = props.minSize ?? defaultSize, registered = new Set(viewIds);
  const allows = (id: string, destination: Zone) => {
    const home = zoneOf(id);
    return (props.allowedZones?.(id) ?? (side(home) ? sideZones : [home])).includes(destination);
  };
  const resolveViewId = (id: string) => props.resolveViewId?.(id) ?? id;
  const defaults = (name: LayoutPreset) => props.createDefaultLayout?.(name) ?? emptyLayout();
  function placeInAllowedZones(next: ZonedLayout) {
    const misplaced = new Set<string>();
    for (const g of allGroups(next)) {
      const zone = next.collapsed.find(item => item === g)?.zone ?? groupZone(g.id);
      g.tabs = g.tabs.filter(id => {
        if (!registered.has(id) || allows(id, zone)) return true;
        misplaced.add(id);
        return false;
      });
    }
    for (const id of misplaced) {
      const zone = zoneOf(id);
      if (zone === 'center' && !next.tree) next.tree = group('document', []);
      (zone === 'center' ? groups(next.tree)[0]! : next[zone]).tabs.push(id);
    }
    return next;
  }
  const [loaded] = useState<LayoutLoad>(() => props.initialLayout ? { layout: props.initialLayout } : props.loadLayout?.() ?? {});
  const [layout, setLayout] = useState<ZonedLayout>(() => {
    const next = structuredClone(loaded.layout ?? defaults(initial));
    if (!loaded.layout && initialView) {
      const id = resolveViewId(initialView), zone = zoneOf(id);
      if (zone === 'center' && !next.tree) next.tree = group('document', []);
      const target = zone === 'center' ? groups(next.tree)[0]! : next[zone];
      if (!target.tabs.includes(id)) target.tabs.push(id);
      target.active = id;
      next.activeGroup = target.id;
      if (zone !== 'center') next.hidden[zone] = false;
    }
    return normalize(placeInAllowedZones(next));
  });
  const state = useRef(layout); state.current = layout; const callbacks = useRef(props); callbacks.current = props;
  const host = useRef<HTMLDivElement>(null), focus = useRef(new Map<string, HTMLElement>()), selections = useRef(new WeakMap<HTMLElement, Range>());
  const [mounted, setMounted] = useState(() => openViews(layout)), [size, setSize] = useState({ width: 1200, height: 720 });
  const [maximized, setMaximized] = useState<string | null>(null), [temporary, setTemporary] = useState<'left' | 'right' | 'bottom' | null>(null);
  const [menu, setMenu] = useState<{ view: string; anchor: HTMLElement; point?: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false), [migrationBlocked, setMigrationBlocked] = useState(!!loaded.error);
  const pending = useRef(Promise.resolve()), returnFocus = useRef<HTMLElement | null>(null), centralFocus = useRef<HTMLElement | null>(null);
  function commit(next: ZonedLayout) {
    normalize(next);
    const previousIds = openViews(state.current);
    const ids = openViews(next);
    state.current = next;
    setLayout(next);
    if (ids.length !== previousIds.length || ids.some((id, index) => id !== previousIds[index])) {
      setMounted(old => [...new Set([...old, ...ids])]);
      callbacks.current.onViewsChange?.(ids);
    }
    callbacks.current.onLayoutChange?.(next);
  }
  const owner = (id: string, value = state.current) => allGroups(value).find(g => g.tabs.includes(id));
  const central = groups(layout.tree), activeCenter = central.find(g => g.id === layout.activeGroup) ?? central[0], available = Math.max(0, size.width - sideRailWidth.left - sideRailWidth.right);
  const keepCenter = layout.tree && companion && groups(layout.tree).some(g => g.tabs.includes(companion.id))
    ? minimum(layout.tree, 'x', minSize) : 480;
  const centerWidth = keepCenter <= available ? keepCenter : 480;
  let showLeft = !layout.hidden.left && !!layout.left.tabs.length, showRight = !layout.hidden.right && !!layout.right.tabs.length;
  if (available - (showLeft ? layout.widths.left + sideSashWidth : 0) - (showRight ? layout.widths.right + sideSashWidth : 0) < centerWidth) showRight = false;
  if (available - (showLeft ? layout.widths.left + sideSashWidth : 0) < centerWidth) showLeft = false;
  const leftWidth = showLeft ? layout.widths.left : 0, rightWidth = showRight ? layout.widths.right : 0;
  const leftInset = leftWidth + (showLeft ? sideSashWidth : 0), rightInset = rightWidth + (showRight ? sideSashWidth : 0);
  const centerRect: Rect = { x: sideRailWidth.left + leftInset, y: 0, width: Math.max(0, available - leftInset - rightInset), height: Math.max(0, size.height - bottomRail) };
  const keepHeight = layout.tree && companion && groups(layout.tree).some(g => g.tabs.includes(companion.id))
    ? minimum(layout.tree, 'y', minSize) : 240;
  const centerHeight = keepHeight <= centerRect.height ? keepHeight : 240;
  const showBottom = !layout.hidden.bottom && !!layout.bottom.tabs.length && centerRect.height >= centerHeight + 160 + gap;
  const bottomHeight = showBottom ? Math.min(layout.bottomHeight, centerRect.height - centerHeight - gap) : 0;
  const mainRect = { ...centerRect, height: centerRect.height - (showBottom ? bottomHeight + gap : 0) };
  const squeezed = !!layout.tree && (minimum(layout.tree, 'x', minSize) > mainRect.width || minimum(layout.tree, 'y', minSize) > mainRect.height);
  const positions = geometry(squeezed ? activeCenter ?? null : layout.tree, mainRect, minSize);
  if (showLeft) positions.result.set('left', { x: sideRailWidth.left, y: 0, width: leftWidth, height: size.height });
  if (showRight) positions.result.set('right', { x: size.width - sideRailWidth.right - rightWidth, y: 0, width: rightWidth, height: size.height });
  if (showBottom) positions.result.set('bottom', { ...centerRect, y: mainRect.height + gap, height: bottomHeight });
  if (temporary) positions.result.set(temporary, temporary === 'bottom' ? { ...centerRect, y: Math.max(0, size.height - 360), height: Math.min(332, size.height - bottomRail) } : { x: temporary === 'left' ? sideRailWidth.left : size.width - sideRailWidth.right - Math.min(320, available), y: 0, width: Math.min(320, available), height: size.height - bottomRail });
  if (maximized) { positions.result.clear(); positions.result.set(maximized, { x: sideRailWidth.left, y: 0, width: available, height: size.height - bottomRail }); }
  function restoreFocus(id: string, tabOnly = false) { requestAnimationFrame(() => {
    const section = host.current?.querySelector<HTMLElement>(`[data-view="${CSS.escape(id)}"]:not([hidden])`), remembered = focus.current.get(id);
    const target = !tabOnly && remembered?.isConnected && section?.contains(remembered) ? remembered : host.current?.querySelector<HTMLElement>(`[data-tab-view="${CSS.escape(id)}"]`);
    target?.focus({ preventScroll: true }); const range = target && selections.current.get(target); if (range?.startContainer.isConnected) { const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
  }); }
  const pendingTabFocus = useRef<string | null>(null);
  const controlled = (id: string) => documentViews?.some(view => view.id === id) ?? false;
  function activate(id: string, tabOnly = false, moveFocus = true) {
    const next = structuredClone(state.current), g = owner(id, next);
    if (!g) return;
    if (next.collapsed.some(item => item.id === g.id)) { restoreCollapsed(g.id, moveFocus, id); return; }
    if (controlled(id) && activeView !== id) {
      pendingTabFocus.current = tabOnly && moveFocus ? id : null;
      onActivate?.(id, tabOnly ? 'tab' : undefined);
      return;
    }
    g.active = id;
    next.activeGroup = g.id;
    commit(next);
    onActivate?.(id, tabOnly ? 'tab' : undefined);
    setMenu(null);
    if (maximized && maximized !== g.id) setMaximized(null);
    if (moveFocus) restoreFocus(id, tabOnly);
  }
  function removeView(next: ZonedLayout, id: string) { const g = owner(id, next); if (g) g.tabs = g.tabs.filter(view => view !== id); next.previews = next.previews.filter(view => view !== id); next.kept = next.kept.filter(view => view !== id); }
  function splitView(next: ZonedLayout, id: string, target: string, axis: 'x' | 'y', before = false) {
    if (props.canSplitView?.(id) === false) {
      notice(t('此工作面使用独立的编辑区。', 'This work surface uses its own editor area.', 'この作業面には専用の編集領域があります。'));
      return false;
    }
    const rect = positions.result.get(target) ?? mainRect, destination = groups(next.tree).find(g => g.id === target);
    if (!destination || destination.tabs.length === 1 && destination.tabs[0] === id) { notice(t('请先在此组打开另一个对象或模式。', 'Open another item or mode in this group first.', '先にこのグループで別の項目やモードを開いてください。')); return false; }
    if ((axis === 'x' ? rect.width : rect.height) < minimum(destination, axis, minSize) + Math.max(axis === 'x' ? 480 : 240, minSize(id)[axis === 'x' ? 'width' : 'height']) + gap) { notice(axis === 'x' ? t('横向空间不足：可在同组切换、上下分屏，或收起侧栏后再试。', 'For more width, switch within this group, split vertically, or hide a sidebar.', '同じグループで切り替えるか、上下に分割するか、サイドバーを閉じてください。') : t('纵向空间不足：可在同组打开，或收起底栏后再试。', 'For more height, open in this group or hide the bottom panel.', '同じグループで開くか、下部パネルを閉じてください。')); return false; }
    removeView(next, id); const leaf = group(uid(), [id]);
    if (!next.tree) next.tree = leaf; else next.tree = change(next.tree, target, sibling => ({ kind: 'split', id: uid(), axis, ratio: .5, first: before ? leaf : sibling, second: before ? sibling : leaf }));
    next.activeGroup = leaf.id; return true;
  }
  function restoreCollapsed(id: string, moveFocus = true, viewId?: string) { const next = structuredClone(state.current), item = next.collapsed.find(g => g.id === id); if (!item) return; next.collapsed = next.collapsed.filter(g => g !== item);
    if (viewId && item.tabs.includes(viewId)) item.active = viewId;
    if (item.zone === 'center') {
      const home = item.home as {siblingId?:string;axis?:'x'|'y';first?:boolean;ratio?:number}|undefined;
      const target = groups(next.tree).find(g=>g.id===home?.siblingId), axis=home?.axis;
      const restored={...group(item.id,item.tabs),active:item.active}, rect=target&&positions.result.get(target.id);
      if(target&&rect&&(axis==='x'||axis==='y')&&(axis==='x'?rect.width:rect.height)>=minimum(target,axis,minSize)+minimum(restored,axis,minSize)+gap){
        next.tree=change(next.tree!,target.id,sibling=>({kind:'split',id:uid(),axis,ratio:clamp(home?.ratio??.5,.1,.9),first:home?.first?restored:sibling,second:home?.first?sibling:restored}));next.activeGroup=restored.id;
      } else {const fallback=target??groups(next.tree)[0];if(fallback){fallback.tabs.push(...item.tabs);fallback.active=item.active;next.activeGroup=fallback.id;}else{next.tree=restored;next.activeGroup=restored.id;}}
    }
    else { const target = next[item.zone]; target.tabs.push(...item.tabs); target.active = item.active; next.hidden[item.zone] = false; next.activeGroup = target.id; }
    placeCompanion(next);
    commit(next); onActivate?.(item.active); notice(t('已恢复收纳内容到可容纳的合法区域；原对象与草稿保留。', 'Stowed items and their drafts were restored to an available area.', '収納した項目と下書きを利用可能な領域に戻しました。')); if (moveFocus) restoreFocus(item.active);
  }
  function showTemporary(zone: 'left' | 'right' | 'bottom') { if (!temporary) returnFocus.current = centralFocus.current?.isConnected ? centralFocus.current : document.activeElement as HTMLElement; setTemporary(zone); }
  function dismissTemporary() { setTemporary(null); requestAnimationFrame(() => {const target=returnFocus.current;target?.focus({ preventScroll: true });const range=target&&selections.current.get(target);if(range?.startContainer.isConnected){const selection=document.getSelection();selection?.removeAllRanges();selection?.addRange(range);}}); }
  function open(raw: string, options: OpenOptions = {}) {
    const id = resolveViewId(raw); if (!registered.has(id)) { notice(t('此对象暂不可用；已保存的恢复身份仍保留。', 'This item is unavailable. Its saved identity is retained.', 'この項目は利用できません。保存された識別情報は保持されます。')); return; }
    const next = structuredClone(state.current), collapsed = next.collapsed.find(g => g.tabs.includes(id)); if (collapsed) { restoreCollapsed(collapsed.id, options.focus !== false, id); return; }
    let g = owner(id, next);
    const zone = g ? groupZone(g.id) : zoneOf(id);
    if (g && controlled(id) && !options.beside) { activate(id, false, options.focus !== false); return; }
    if(options.beside&&g&&g.id!==next.activeGroup){activate(id, false, options.focus !== false);return;}
    if (options.beside && zone === 'center') {
      const destination = groups(next.tree).find(g => g.id === next.activeGroup) ?? groups(next.tree)[0];
      if (destination) {
        if (splitView(next, id, destination.id, options.beside)) {
          next.kept.push(id);
          commit(next);
          onActivate?.(id);
          if (options.focus !== false) restoreFocus(id);
        }
        return;
      }
    }
    if (!g) {
      if (zone !== 'center') g = next[zone];
      else {
        g = groups(next.tree).find(g => g.tabs.some(view => props.replaceView?.(view, id)));
        if (g) {
          const previous = g.tabs.find(view => props.replaceView?.(view, id))!;
          g.tabs[g.tabs.indexOf(previous)] = id;
          next.kept = next.kept.map(view => view === previous ? id : view);
          next.previews = next.previews.map(view => view === previous ? id : view);
        }
        g ??= groups(next.tree).find(g => g.id === next.activeGroup) ?? groups(next.tree)[0]; if (!g) { g = group(uid(), []); next.tree = g; }
        if (options.preview) { const old = g.tabs.find(view => next.previews.includes(view)); if (old && !status?.(old)?.dirty) removeView(next, old); }
      }
      if (!g.tabs.includes(id)) g.tabs.push(id);
    }
    if (options.preview && !next.kept.includes(id)) next.previews.push(id); else if (!options.preview) { next.kept.push(id); next.previews = next.previews.filter(v => v !== id); }
    g.active = id; next.activeGroup = g.id;
    if (zone !== 'center') { const wasResponsive = !state.current.hidden[zone] && state.current[zone].tabs.length>0 && !positions.result.has(zone); if (wasResponsive) showTemporary(zone); else next.hidden[zone] = false; }
    commit(next); setMenu(null); if (maximized !== g.id) setMaximized(null); onActivate?.(id); if (options.focus !== false) restoreFocus(id);
  }
  function closeViews(ids: string[], batch = false) { const trigger=menu?.anchor??document.activeElement as HTMLElement;setMenu(null); pending.current = pending.current.then(async () => {
    const targets = ids.filter(id => owner(id) && callbacks.current.canCloseView?.(id) !== false);
    if (!targets.length) return;
    const refused=(id?:string)=>{if(!batch&&targets.length===1&&id)activate(id);else requestAnimationFrame(()=>trigger?.isConnected&&trigger.focus());};
    if(callbacks.current.onBeforeClose&&!await callbacks.current.onBeforeClose(targets)){refused(targets[0]);return;}
    for (const id of targets) if(callbacks.current.onClose&&!await callbacks.current.onClose(id)){refused(id);return;}
    const next=structuredClone(state.current);for(const id of targets){removeView(next,id);focus.current.delete(id);}commit(next);setMounted(old=>old.filter(view=>!targets.includes(view)));
    const g = allGroups(state.current).find(g => g.id === state.current.activeGroup && g.tabs.length); if (g) { callbacks.current.onActivate?.(g.active); restoreFocus(g.active); }
  }).catch(error => notice(t(`关闭未完成：${String(error)}`, `Could not close: ${String(error)}`, `閉じられませんでした：${String(error)}`))); }
  function move(id: string, destination: string, edge?: 'left' | 'right' | 'top' | 'bottom', beforeView?: string) {
    const next = structuredClone(state.current), from = owner(id, next), to = allGroups(next).find(g => g.id === destination); if (!from || !to) return; const a = groupZone(from.id), b = groupZone(to.id);
    if (a === 'center' && b === 'center' && from !== to && controlled(id) && props.canSplitView?.(id) === false) return;
    if (!edge && companion && (id === companion.id && to.tabs.includes(companion.document) || id === companion.document && to.tabs.includes(companion.id))) {
      notice(t('并排视图使用不同标签组。', 'Companion views use separate tab groups.', '並べて表示するビューは別のタブグループを使います。'));
      return;
    }
    if (!allows(id, b)) { notice(t('此工具只能在所属区域调整。', 'Move this tool within its assigned area.', 'このツールは所属する領域内で移動できます。')); return; }
    if (edge) {
      const retained = next.kept.includes(id), preview = next.previews.includes(id);
      if (a !== 'center' || !splitView(next, id, to.id, edge === 'left' || edge === 'right' ? 'x' : 'y', edge === 'left' || edge === 'top')) return;
      if (retained) next.kept.push(id);
      if (preview) next.previews.push(id);
    }
    else {
      from.tabs = from.tabs.filter(view => view !== id);
      const index = beforeView ? to.tabs.indexOf(beforeView) : -1;
      to.tabs.splice(index < 0 ? to.tabs.length : index, 0, id);
      if (!controlled(id) || activeView === id) {
        to.active = id;
        next.activeGroup = to.id;
      }
      if (side(b)) next.hidden[b] = false;
    }
    commit(next);
    setMenu(null);
    if (!controlled(id) || activeView === id) {
      onActivate?.(id);
      restoreFocus(id);
    }
  }
  function collapse(g: Group) { const next = structuredClone(state.current), zone = groupZone(g.id); if (zone !== 'center') next.hidden[zone] = true; else {
    const findHome=(tree:ZonedLayout['tree']):unknown=>{if(!tree||tree.kind==='group')return;const first=tree.first.id===g.id,second=tree.second.id===g.id;if(first||second)return {kind:'dock',siblingId:(first?tree.second:tree.first).id,axis:tree.axis,ratio:tree.ratio,first};return findHome(tree.first)??findHome(tree.second);};
    next.collapsed.push({ ...structuredClone(g), zone, home:findHome(next.tree) }); next.tree = removeGroup(next.tree, g.id);
  } commit(next); setMenu(null); setMaximized(null); }
  function placeCompanion(next: ZonedLayout): boolean {
    if (!companion || !next.tree) return false;
    const primary = groups(next.tree).find(g => g.tabs.includes(companion.document));
    if (!primary) return false;
    const existing = owner(companion.id, next);
    if (existing && existing !== primary) return false;
    if (existing) removeView(next, companion.id);

    const companionGroup = group(uid(), [companion.id]);
    const splitId = uid();
    const split = (axis: 'x' | 'y') => change(next.tree!, primary.id, first => ({
      kind: 'split', id: splitId, axis, ratio: .5, first, second: companionGroup,
    }));
    const width = host.current?.clientWidth || size.width;
    const horizontal = split('x');
    const horizontalFits = minimum(horizontal, 'x', minSize) <= width - sideRailWidth.left - sideRailWidth.right;
    next.tree = companion.axis ? split(companion.axis) : horizontalFits ? horizontal : split('y');
    next.kept.push(companion.id);
    return true;
  }
  function preserve(next: ZonedLayout) {
    for (const stowed of state.current.collapsed) {
      const tabs = stowed.tabs.filter(id => !openViews(next).includes(id));
      if (tabs.length) next.collapsed.push({ ...stowed, tabs });
    }
    for (const id of openViews(state.current)) {
      if (id === companion?.id || openViews(next).includes(id)) continue;
      const zone = zoneOf(id);
      if (zone !== 'center') next[zone].tabs.push(id);
      else {
        const g = groups(next.tree)[0];
        if (g) g.tabs.push(id);
        else next.tree = group(uid(), [id]);
      }
    }
    placeCompanion(next);
    return next;
  }
  function keep(id: string) {
    const next = structuredClone(state.current);
    next.kept.push(id);
    next.previews = next.previews.filter(view => view !== id);
    commit(next);
    props.onKeep?.(id);
  }
  function toggle(zone: 'left' | 'right' | 'bottom') {
    if (temporary === zone) { dismissTemporary(); return; }
    const next = structuredClone(state.current);
    const id = next[zone].active;
    if (!id) return;
    if (positions.result.has(zone)) {
      next.hidden[zone] = true;
      commit(next);
    } else {
      open(id, { focus: false });
    }
  }
  function readPresets() {
    return Object.fromEntries(Object.entries(props.readPresets?.() ?? {}).filter(([, layout]) => validLayout(layout)));
  }
  function portable(value: ZonedLayout, restore: boolean) {
    const next = structuredClone(value);
    const map = (id: string) => props.mapPresetView?.(id, restore) ?? id;
    for (const g of allGroups(next)) { g.tabs = g.tabs.map(map).filter(Boolean); g.active = map(g.active); }
    next.kept = next.kept.map(map).filter(Boolean);
    next.previews = next.previews.map(map).filter(Boolean);
    return next;
  }
  const defaultPresetName = t('我的布局', 'My layout', 'マイレイアウト');
  useImperativeHandle(ref, () => ({
    open,
    activate: (id, options) => activate(id, false, options?.focus !== false),
    split: (id, axis = 'x') => open(id, { beside: axis }),
    toggle,
    close: id => closeViews([id]),
    snapshot: () => structuredClone(state.current),
    listPresets: () => Object.keys(readPresets()),
    preset: name => {
      commit(preserve(defaults(name)));
      setMaximized(null);
      setTemporary(null);
      notice(t('已重置摆放；打开对象、草稿和个人偏好保留。', 'Layout reset. Open items, drafts and preferences are retained.', '配置をリセットしました。開いている項目、下書き、設定は保持されます。'));
    },
    savePreset: async (name = defaultPresetName) => {
      const key = name.trim();
      if (!key || !props.writePresets) return;
      try {
        await props.writePresets({ ...readPresets(), [key]: portable(state.current, false) });
        notice(t(`已保存布局「${key}」`, `Saved layout “${key}”`, `レイアウト「${key}」を保存しました`));
      } catch {
        notice(t('布局未能保存，当前会话保留。', 'The layout could not be saved. The current session is retained.', 'レイアウトを保存できませんでした。現在のセッションは保持されます。'));
      }
    },
    restorePreset: (name = defaultPresetName) => {
      const saved = readPresets()[name.trim()];
      if (!saved) { notice(t('未找到此命名布局。', 'This named layout was not found.', '名前付きレイアウトが見つかりません。')); return; }
      commit(preserve(placeInAllowedZones(portable(saved, true))));
      setMaximized(null);
      setTemporary(null);
    },
  }));
  useLayoutEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    callbacks.current.onViewsChange?.(openViews(state.current));
    if (state.current.stageSource) callbacks.current.onRestoreStageSource?.(state.current.stageSource);
    const g = allGroups(state.current).find(g => g.id === state.current.activeGroup);
    if (g?.active && !callbacks.current.activeView) callbacks.current.onActivate?.(g.active);
    if (loaded.error) callbacks.current.notice(loaded.error);
    return () => observer.disconnect();
  }, []);

  const previousDocuments = useRef(new Map<string, boolean>());
  const previousCompanion = useRef(companion);
  const documentSignature = JSON.stringify(documentViews?.map(({ id, preview }) => [id, Boolean(preview)]) ?? []);
  useLayoutEffect(() => {
    const next = structuredClone(state.current);
    const previous = previousDocuments.current;
    const documents = new Map((callbacks.current.documentViews ?? []).map(view => [view.id, Boolean(view.preview)]));
    previousDocuments.current = documents;
    const before = openViews(next);
    let changed = false;
    const priorCompanion = previousCompanion.current;
    previousCompanion.current = companion;
    const priorGroup = priorCompanion && owner(priorCompanion.id, next);
    const keepStowedCompanion = priorCompanion && callbacks.current.retainStowedView?.(priorCompanion.id)
      && next.collapsed.some(group => group.tabs.length === 1 && group.tabs[0] === priorCompanion.id);
    if (priorCompanion && priorCompanion.id !== companion?.id && priorGroup && !keepStowedCompanion) {
      removeView(next, priorCompanion.id);
      changed = true;
    }
    if (callbacks.current.retainStowedView) for (const stowed of next.collapsed) {
      for (const id of stowed.tabs) {
        if (registered.has(id) || callbacks.current.retainStowedView(id)) continue;
        removeView(next, id);
        changed = true;
      }
    }
    for (const id of previous.keys()) {
      if (documents.has(id)) continue;
      removeView(next, id);
      changed = true;
    }
    for (const [id, preview] of documents) {
      if (!owner(id, next)) {
        const centralGroups = groups(next.tree);
        const destination = centralGroups.find(g => activeView && g.tabs.includes(activeView))
          ?? centralGroups.find(g => g.tabs.some(view => previous.has(view)))
          ?? centralGroups.find(g => g.id === next.activeGroup)
          ?? centralGroups[0];
        if (destination) destination.tabs.push(id);
        else next.tree = group('document', [id]);
        changed = true;
      }
      if (previous.get(id) !== preview) {
        next.kept = next.kept.filter(view => view !== id);
        next.previews = next.previews.filter(view => view !== id);
        (preview ? next.previews : next.kept).push(id);
        changed = true;
      }
    }
    const order = [...documents.keys()];
    const previousOrder = [...previous.keys()];
    if (order.length !== previousOrder.length || order.some((id, index) => id !== previousOrder[index])) {
      for (const g of groups(next.tree)) {
        const ordered = order.filter(id => g.tabs.includes(id));
        let index = 0;
        const tabs = g.tabs.map(id => documents.has(id) ? ordered[index++]! : id);
        if (tabs.some((id, index) => id !== g.tabs[index])) {
          g.tabs = tabs;
          changed = true;
        }
      }
    }
    if (placeCompanion(next)) { setMaximized(null); changed = true; }
    const active = activeView && allGroups(next).find(g => g.tabs.includes(activeView));
    if (active && activeView && (active.active !== activeView || next.activeGroup !== active.id)) {
      if (maximized && maximized !== active.id) setMaximized(null);
      active.active = activeView;
      next.activeGroup = active.id;
      changed = true;
    }
    if (activeView && pendingTabFocus.current === activeView) {
      pendingTabFocus.current = null;
      restoreFocus(activeView, true);
    }
    if (changed) {
      commit(next);
      const closed = before.filter(id => !owner(id, next));
      if (closed.length) {
        for (const id of closed) focus.current.delete(id);
        setMounted(old => old.filter(id => !closed.includes(id)));
      }
    }
  }, [documentSignature, activeView, companion?.id, companion?.document, companion?.axis]);

  useEffect(() => {
    if (migrationBlocked || !callbacks.current.saveLayout) return;
    try { callbacks.current.saveLayout(layout); }
    catch { callbacks.current.notice(t('个人布局保存失败；作品内容未受影响。', 'The personal layout could not be saved. Project content is intact.', '個人レイアウトを保存できませんでした。作品の内容は保持されています。')); }
  }, [layout, migrationBlocked]);
  useEffect(()=>{if(temporary&&(temporary==='left'?showLeft:temporary==='right'?showRight:showBottom))setTemporary(null);},[temporary,showLeft,showRight,showBottom]);
  useEffect(() => { const edited = layout.previews.filter(id => status?.(id)?.dirty); if (!edited.length) return; const next = structuredClone(layout); next.kept.push(...edited); next.previews = next.previews.filter(id => !edited.includes(id)); commit(next); });
  useEffect(() => { const root = host.current!; const remember = () => { const active = document.activeElement; if (!(active instanceof HTMLElement) || !root.contains(active)) return; const selection = document.getSelection(); if (active.isContentEditable && selection?.rangeCount && active.contains(selection.anchorNode)) selections.current.set(active, selection.getRangeAt(0).cloneRange()); }; document.addEventListener('selectionchange', remember); return () => document.removeEventListener('selectionchange', remember); }, []);
  function track(event: React.PointerEvent, update: (e: PointerEvent) => void, end?: () => void, element = event.currentTarget) {
    if (!event.isTrusted) return;
    event.preventDefault();
    const { pointerId } = event;
    element.setPointerCapture(pointerId);
    let finished = false;
    function finish(cancel = false) {
      if (finished) return;
      finished = true;
      element.removeEventListener('pointermove', update as EventListener);
      element.removeEventListener('pointerup', pointerEnd);
      element.removeEventListener('pointercancel', pointerCancel);
      element.removeEventListener('lostpointercapture', pointerCancel);
      document.removeEventListener('keydown', key, true);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      if (cancel) setDragging(false);
      else end?.();
    }
    const pointerEnd = () => finish();
    const pointerCancel = () => finish(true);
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    }
    element.addEventListener('pointermove', update as EventListener);
    element.addEventListener('pointerup', pointerEnd);
    element.addEventListener('pointercancel', pointerCancel);
    element.addEventListener('lostpointercapture', pointerCancel);
    document.addEventListener('keydown', key, true);
  }
  const draggedTab = useRef<string | null>(null);
  function drag(event: React.PointerEvent, id: string) {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[role=tab]');
    if (event.button !== 0 || event.pointerType === 'touch' || !tab) return;
    draggedTab.current = null;
    const start = { x: event.clientX, y: event.clientY };
    let destination: { id: string; before?: string; edge?: 'left' | 'right' | 'top' | 'bottom' } | null = null;
    track(event, e => {
      if (draggedTab.current !== id && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      draggedTab.current = id;
      setDragging(true);
      const rect = host.current!.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const hit = [...positions.result].find(([, r]) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-dock-tab]');
      if (hit) {
        const [groupId, r] = hit;
        const edge = groupZone(groupId) !== 'center' || y < r.y + header ? undefined
          : x < r.x + r.width * .2 ? 'left' : x > r.x + r.width * .8 ? 'right'
            : y < r.y + r.height * .2 ? 'top' : y > r.y + r.height * .8 ? 'bottom' : undefined;
        destination = { id: groupId, before: over?.dataset.dockTab, edge };
      } else {
        destination = x < sideRailWidth.left ? { id: 'left' } : x >= size.width - sideRailWidth.right ? { id: 'right' } : null;
      }
    }, () => {
      if (draggedTab.current === id && destination) move(id, destination.id, destination.edge, destination.before);
      setDragging(false);
    }, tab);
  }
  const visible = [...central, layout.left, layout.right, layout.bottom].filter(g => positions.result.has(g.id)), menuGroup = menu && owner(menu.view);
  const toolIds = (zone: 'left' | 'right') => [...new Set([...layout[zone].tabs, ...viewIds.filter(id => zoneOf(id) === zone && !allGroups(layout).some(g => g.tabs.includes(id)))])];
  const closable = (id: string) => props.canCloseView?.(id) !== false;
  const actions = menu && menuGroup ? [
    ...(groupZone(menuGroup.id) === 'center' ? [{ id: 'keep', label: t('保留标签', 'Keep tab', 'タブを保持'), run: () => keep(menu.view) }] : []),
    ...(closable(menu.view) ? [{ id: 'close', label: t('关闭标签', 'Close tab', 'タブを閉じる'), run: () => closeViews([menu.view]) }] : []),
    ...(menuGroup.tabs.some(closable) ? [
      { id: 'others', label: t('关闭其他标签', 'Close other tabs', '他のタブを閉じる'), run: () => closeViews(menuGroup.tabs.filter(id => id !== menu.view), true) },
      { id: 'right', label: t('关闭右侧标签', 'Close tabs to the right', '右側のタブを閉じる'), run: () => closeViews(menuGroup.tabs.slice(menuGroup.tabs.indexOf(menu.view) + 1), true) },
    ] : []),
    ...(groupZone(menuGroup.id) === 'center' ? [
      ...(props.canSplitView?.(menu.view) !== false ? (['left', 'right', 'top', 'bottom'] as const).map((edge, i) => ({
        id: `split-${edge}`,
        label: [
          t('向左分屏', 'Split left', '左に分割'), t('向右分屏', 'Split right', '右に分割'),
          t('向上分屏', 'Split up', '上に分割'), t('向下分屏', 'Split down', '下に分割'),
        ][i]!,
        run: () => move(menu.view, menuGroup.id, edge),
      })) : []),
      ...central.filter(g => g.id !== menuGroup.id && (!controlled(menu.view) || props.canSplitView?.(menu.view) !== false)).map(g => ({
        id: g.id, label: t(`移入「${title(g.active)}」组`, `Move to “${title(g.active)}” group`, `「${title(g.active)}」グループに移動`), run: () => move(menu.view, g.id),
      })),
    ] : side(groupZone(menuGroup.id)) && allows(menu.view, menuGroup.id === 'left' ? 'right' : 'left') ? [{
      id: 'side',
      label: menuGroup.id === 'left' ? t('移到右侧栏', 'Move to the right sidebar', '右サイドバーに移動') : t('移到左侧栏', 'Move to the left sidebar', '左サイドバーに移動'),
      run: () => move(menu.view, menuGroup.id === 'left' ? 'right' : 'left'),
    }] : []),
    { id: 'collapse', label: t('收起此标签组', 'Stow this group', 'このタブグループを収納'), run: () => collapse(menuGroup) },
  ] : menu?.view === '' ? central.map(g => ({ id: g.id, label: title(g.active), run: () => activate(g.active) })) : [];
  return <div className="gc-dock" data-dragging={dragging || undefined} ref={host} data-testid={props.testId} data-layout-version="2" onKeyDown={e => { if (e.key === 'Escape' && temporary && !menu) { e.preventDefault(); dismissTemporary(); } }}>
    {(['left', 'right'] as const).map(zone => <nav key={zone} className={`gc-dock-zone-rail is-${zone}`} style={{ width: sideRailWidth[zone] }} aria-label={zone === 'left' ? t('左侧工具', 'Left tools', '左側ツール') : t('右侧工具', 'Right tools', '右側ツール')}>
      {zone === 'left' && props.leftRail}
      {toolIds(zone).map(id => <DockIconButton key={id} label={title(id)} aria-pressed={layout[zone].active === id && positions.result.has(zone)} onClick={() => {
        if (layout[zone].active !== id || !positions.result.has(zone)) open(id);
        else if (temporary === zone) dismissTemporary();
        else { const next = structuredClone(state.current); next.hidden[zone] = true; commit(next); }
      }}>{icon?.(id) ?? (zone === 'left' ? <PanelLeft aria-hidden="true"/> : <PanelRight aria-hidden="true"/>)}</DockIconButton>)}
      {layout.collapsed.filter(g => g.zone === zone).map(g => <DockIconButton key={g.id} label={t(`恢复已收纳内容 ${title(g.active)}`, `Restore stowed ${title(g.active)}`, `収納した ${title(g.active)} を復元`)} onClick={() => restoreCollapsed(g.id)}><Columns2 aria-hidden="true"/></DockIconButton>)}
    </nav>)}
    {[...new Set([...mounted, ...openViews(layout)])].map(id => { const g = visible.find(g => g.active === id), rect = g && positions.result.get(g.id); return <section key={id} className={`gc-dock-content ${g && temporary === g.id ? 'is-temporary' : ''}`} id={`${tabNamespace}-panel-${id}`} data-view={id} data-zone={g && groupZone(g.id)} data-maximized={Boolean(g && maximized === g.id)} aria-label={title(id)} hidden={!rect} style={rect ? { left: rect.x, top: rect.y + header, width: rect.width, height: Math.max(0, rect.height - header), zIndex: temporary === g?.id ? 15 : 1 } : undefined} onFocusCapture={e => { if (props.retainFocus?.(e.target) !== false){focus.current.set(id, e.target);if(g&&groupZone(g.id)==='center')centralFocus.current=e.target;} if (g && state.current.activeGroup !== g.id) { const next = structuredClone(state.current); next.activeGroup = g.id; commit(next); onActivate?.(id); } }}>
      {registered.has(id) ? renderView(id) : <div className="gc-dock-missing-view" role="status"><strong>{t('对象暂不可用', 'Item unavailable', '項目を利用できません')}</strong><p>{title(id)}</p><p>{t('恢复身份已保留。请重新打开所属作品或恢复该对象。', 'Reopen its project or restore the item to use this saved view.', '保存した表示を使用するには、作品を再度開くか項目を復元してください。')}</p></div>}
    </section>; })}
    {visible.map(g => { const rect = positions.result.get(g.id)!, zone = groupZone(g.id); return <div key={g.id} data-group={g.id} data-zone={zone} className={`gc-dock-header ${layout.activeGroup === g.id ? 'is-active' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.width, height: header, zIndex: temporary === g.id ? 16 : 4 }}>
      <DockTabList label={t('工作面标签', 'Work surface tabs', '作業面のタブ')} activeView={g.active} views={g.tabs} onActivate={id => activate(id, true)}>
        {g.tabs.map(id => {
          const tabStatus = status?.(id);
          return <DockTab key={id} viewId={id} title={title(id)} tabId={`${tabNamespace}-tab-${id}`} controls={`${tabNamespace}-panel-${id}`}
            closeLabel={t(`关闭 ${title(id)}`, `Close ${title(id)}`, `${title(id)}を閉じる`)}
            description={tabStatus?.error ?? (tabStatus?.dirty ? t('有未保存或未应用的修改', 'Unsaved or unapplied changes', '未保存または未適用の変更があります') : undefined)}
            active={g.active === id} groupActive={layout.activeGroup === g.id} dirty={tabStatus?.dirty} error={tabStatus?.error}
            preview={layout.previews.includes(id)} icon={icon?.(id)}
            onActivate={event => { if (event.detail === 0 || draggedTab.current !== id) activate(id, true); }} onClose={props.canCloseView?.(id) === false ? undefined : () => closeViews([id])}
            menuOpen={menu?.view === id} onMenu={target => setMenu({ view: id, ...target })}
            onPointerDown={e => drag(e, id)} onKeep={() => keep(id)}/>;
        })}
      </DockTabList>
      <DockIconButton className="gc-dock-header-button" label={maximized === g.id ? t('还原工作面', 'Restore work surface', '作業面を元に戻す') : t('局部最大化', 'Maximize group', 'グループを最大化')} onClick={() => { setMaximized(maximized === g.id ? null : g.id); setTemporary(null); restoreFocus(g.active); }}>{maximized === g.id ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</DockIconButton>
      <DockIconButton className="gc-dock-header-button" label={temporary === g.id ? t('收回临时工具', 'Dismiss temporary tool', '一時ツールを閉じる') : t(`收起 ${title(g.active)}`, `Stow ${title(g.active)}`, `${title(g.active)}を収納`)} onClick={() => temporary === g.id ? dismissTemporary() : collapse(g)}><X size={14}/></DockIconButton>
    </div>; })}
    {!maximized && !squeezed && positions.handles.map(({ node, rect }) => { const horizontal = node.axis === 'x', total = (horizontal ? rect.width : rect.height) - gap, offset = total * node.ratio;
      const ratio = (value: number) => { const next = structuredClone(state.current); if (next.tree) next.tree = change(next.tree, node.id, t => t.kind === 'split' ? { ...t, ratio: clamp(value, minimum(t.first, t.axis, minSize) / total, 1 - minimum(t.second, t.axis, minSize) / total) } : t); commit(next); };
      return <div key={node.id} role="separator" aria-label={t('调整中央分屏', 'Resize editor split', '編集分割のサイズを変更')} aria-orientation={horizontal ? 'vertical' : 'horizontal'} aria-valuenow={Math.round(offset)} tabIndex={0} className={`gc-dock-splitter ${horizontal ? 'horizontal' : 'vertical'}`} style={{ left: rect.x + (horizontal ? offset : 0), top: rect.y + (horizontal ? 0 : offset), width: horizontal ? gap : rect.width, height: horizontal ? rect.height : gap }} onPointerDown={e => { const origin = host.current!.getBoundingClientRect(); track(e, event => ratio(((horizontal ? event.clientX - origin.left - rect.x : event.clientY - origin.top - rect.y) - 2.5) / total)); }} onKeyDown={e => { if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); ratio(node.ratio + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -.02 : .02)); } }}/>;
    })}
    {!maximized && (['left', 'right'] as const).map(zone => {
      const left = zone === 'left', width = left ? leftWidth : rightWidth;
      if (!width) return null;
      const maxWidth = Math.max(240, available - (left ? rightInset : leftInset) - sideSashWidth - centerWidth);
      const resize = (value: number) => {
        const next = structuredClone(state.current);
        next.widths[zone] = clamp(value, 240, maxWidth);
        commit(next);
      };
      return <div key={zone} role="separator" aria-orientation="vertical" aria-label={left ? t('调整左侧栏宽度', 'Resize left sidebar', '左サイドバーの幅を変更') : t('调整右侧栏宽度', 'Resize right sidebar', '右サイドバーの幅を変更')}
        aria-valuenow={width} aria-valuemin={240} aria-valuemax={maxWidth} tabIndex={0} className="gc-dock-splitter horizontal gc-dock-side-sash"
        style={{ left: left ? sideRailWidth.left + width : size.width - sideRailWidth.right - width - sideSashWidth, top: 0, width: sideSashWidth, height: size.height }}
        onPointerDown={e => {
          if (e.button !== 0) return;
          const startX = e.clientX;
          track(e, event => resize(width + (event.clientX - startX) * (left ? 1 : -1)));
        }}
        onKeyDown={e => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          resize(width + (e.key === 'ArrowRight' ? 16 : -16) * (left ? 1 : -1));
        }}
      />;
    })}
    {!maximized && showBottom && <div role="separator" aria-label={t('调整底栏高度', 'Resize bottom panel', '下部パネルの高さを変更')} aria-orientation="horizontal" aria-valuenow={bottomHeight} tabIndex={0} className="gc-dock-splitter vertical" style={{ left: centerRect.x, top: mainRect.height, width: centerRect.width, height: gap }} onPointerDown={e => { const origin = host.current!.getBoundingClientRect(); track(e, event => { const next = structuredClone(state.current); next.bottomHeight = clamp(size.height - bottomRail - (event.clientY - origin.top), 160, centerRect.height - centerHeight - gap); commit(next); }); }} onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const next = structuredClone(state.current); next.bottomHeight = clamp(next.bottomHeight + (e.key === 'ArrowUp' ? 16 : -16), 160, centerRect.height - centerHeight - gap); commit(next); } }}/>}
    <nav className="gc-dock-bottom-rail" style={{ left: centerRect.x, width: centerRect.width }} aria-label={t('辅助工具与收纳内容', 'Tools and stowed items', '補助ツールと収納した項目')}>
      {[...new Set([...layout.bottom.tabs, ...viewIds.filter(id => zoneOf(id) === 'bottom')])].map(id => <DockButton key={id} aria-pressed={layout.bottom.active === id && showBottom} onClick={() => open(id)}>{icon?.(id) ?? <PanelBottom size={14}/>}<span>{title(id)}</span></DockButton>)}
      {squeezed && central.length > 1 && <DockButton aria-haspopup="menu" aria-expanded={menu?.view === ''} onClick={event => setMenu({ view: '', anchor: event.currentTarget })}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setMenu({ view: '', anchor: event.currentTarget }); } }}>{t(`中央组 ${central.length}`, `Editor groups ${central.length}`, `編集グループ ${central.length}`)}<ChevronDown size={12}/></DockButton>}
      {layout.collapsed.filter(g => (g.zone === 'center' || g.zone === 'bottom') && registered.has(g.active)).map(g => <DockButton key={g.id} onClick={() => restoreCollapsed(g.id)}>{t(`恢复已收纳内容 · ${title(g.active)}`, `Restore stowed · ${title(g.active)}`, `収納から復元 · ${title(g.active)}`)}</DockButton>)}
      {migrationBlocked && <DockButton onClick={() => { const result = props.loadLayout?.() ?? {}; if (result.layout) { commit(result.layout); setMigrationBlocked(false); } else notice(result.error ?? t('旧布局仍保留。', 'The previous layout is retained.', '以前のレイアウトは保持されています。')); }}>{t('重试布局恢复', 'Retry layout recovery', 'レイアウトの復元を再試行')}</DockButton>}
    </nav>
    <DockActionMenu label={menu?.view ? t(`标签操作 ${title(menu.view)}`, `Tab actions for ${title(menu.view)}`, `${title(menu.view)}のタブ操作`) : t('工作面操作', 'Work surface actions', '作業面の操作')} target={menu} actions={actions} portal={host.current} onDismiss={() => setMenu(null)}/>
    {dragging && <div className="gc-dock-drop-hint" role="status">{t('拖入同类区域合并；中央边缘分屏。松开后检查可用空间。', 'Drop in a matching zone to merge, or at an editor edge to split.', '同じ種類の領域で結合し、編集領域の端で分割します。')}</div>}
  </div>;
}
