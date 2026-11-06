import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Columns2, Maximize2, Minimize2, PanelBottom, PanelLeft, PanelRight, X } from 'lucide-react';
import { allGroups, change, clamp, currentView, defaultZone, emptyLayout, geometry, group, groups, layoutKeys, loadLayouts, minimum, normalize, openViews, removeGroup, sceneView, validLayout, type Group, type Rect, type Zone, type ZonedLayout } from '../application/zoned-layout.js';
import { CandidateActionMenu, CandidateButton, CandidateDockTab, CandidateDockTabList, CandidateIconButton, CandidateMenuButton } from './controls/index.js';
import '../styles/dock.css';
import '../styles/side-rails.css';

export type LayoutPreset = 'balanced' | 'writing' | 'source' | 'stage' | 'documents' | 'custom';
export type OpenOptions = { preview?: boolean; beside?: 'x' | 'y' };
export type DockHandle = { open(id: string, options?: OpenOptions): void; close(id: string): void; preset(name: LayoutPreset): void; listPresets(): string[]; savePreset(name?: string): void; restorePreset(name?: string): void; snapshot(): unknown };
export type CandidateDockWorkspaceProps = {
  ref?: Ref<DockHandle>; initial?: LayoutPreset; initialView?: string; sceneId: string; sceneIds: readonly string[]; viewIds: readonly string[]; storageKey: string;
  renderView(id: string): ReactNode; title(id: string): string; icon?(id: string): ReactNode; role?(id: string): string;
  zone?(id: string): Zone; minSize?(id: string): { width: number; height: number };
  status?(id: string): { dirty?: boolean; error?: string; running?: boolean }; onActivate(id: string): void; notice(message: string): void;
  onClose?(id: string): boolean | Promise<boolean>; onViewsChange?(ids: readonly string[]): void;
  onBeforeClose?(ids: readonly string[]): boolean | Promise<boolean>;
  onRestoreStageSource?(sceneId:string):void;
};
const uid = () => crypto.randomUUID(), gap = 5, header = 37, bottomRail = 28;
const sideRailWidth = { left: 49, right: 48 }, sideSashWidth = 1;
const defaultSize = () => ({ width: 480, height: 240 });
const side = (zone: Zone): zone is 'left' | 'right' => zone === 'left' || zone === 'right';
export function CandidateDockWorkspace(props: CandidateDockWorkspaceProps) {
  const tabNamespace = useId();
  const { ref, initial = 'balanced', initialView, sceneId, sceneIds, viewIds, storageKey, renderView, title, icon, status, onActivate, notice } = props;
  const zoneOf = props.zone ?? defaultZone, minSize = props.minSize ?? defaultSize, registered = new Set(viewIds), keys = layoutKeys(storageKey);
  function defaults(name: LayoutPreset) {
    const next = emptyLayout(); next.tree = group('document', [name === 'stage' ? 'stage' : `writing:${sceneId}`].filter(id => registered.has(id)));
    next.left = group('left', ['outline'].filter(id => registered.has(id))); next.right = group('right', ['inspector'].filter(id => registered.has(id)));
    next.bottom = group('bottom', ['assets', 'problems', 'output'].filter(id => registered.has(id)));
    if (name === 'source') next.tree = { kind: 'split', id: uid(), axis: 'y', ratio: .5, first: next.tree, second: group(uid(), [`source:${sceneId}`]) };
    if (name === 'documents') { const other = sceneIds.find(id => id !== sceneId); if (other) { next.tree = { kind: 'split', id: uid(), axis: 'x', ratio: .5, first: next.tree, second: group(uid(), [`writing:${other}`]) }; next.hidden.left = next.hidden.right = true; } }
    if (name === 'writing') next.hidden.right = true;
    next.kept = openViews(next); return next;
  }
  const [loaded] = useState(() => loadLayouts(localStorage, storageKey));
  const [layout, setLayout] = useState<ZonedLayout>(() => {
    const next = loaded.layout ?? defaults(initial);
    if (!loaded.layout && initialView) { const id = currentView(initialView), zone = zoneOf(id), g = zone === 'center' ? groups(next.tree)[0]! : next[zone]; if (!g.tabs.includes(id)) g.tabs.push(id); g.active = id; next.activeGroup = g.id; if (zone !== 'center') next.hidden[zone] = false; }
    return normalize(next);
  });
  const state = useRef(layout); state.current = layout; const callbacks = useRef(props); callbacks.current = props;
  const host = useRef<HTMLDivElement>(null), focus = useRef(new Map<string, HTMLElement>()), selections = useRef(new WeakMap<HTMLElement, Range>());
  const [mounted, setMounted] = useState(() => openViews(layout)), [size, setSize] = useState({ width: 1200, height: 720 });
  const [maximized, setMaximized] = useState<string | null>(null), [temporary, setTemporary] = useState<'left' | 'right' | 'bottom' | null>(null);
  const [menu, setMenu] = useState<{ view: string; anchor: HTMLElement; point?: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false), [migrationBlocked, setMigrationBlocked] = useState(!!loaded.error);
  const pending = useRef(Promise.resolve()), returnFocus = useRef<HTMLElement | null>(null), centralFocus = useRef<HTMLElement | null>(null);
  function commit(next: ZonedLayout) { normalize(next); state.current = next; setLayout(next); const ids = openViews(next); setMounted(old => [...new Set([...old, ...ids])]); callbacks.current.onViewsChange?.(ids); }
  const owner = (id: string, value = state.current) => allGroups(value).find(g => g.tabs.includes(id));
  const groupZone = (id: string): Zone => id === 'left' || id === 'right' || id === 'bottom' ? id : 'center';
  const central = groups(layout.tree), activeCenter = central.find(g => g.id === layout.activeGroup) ?? central[0], available = Math.max(0, size.width - sideRailWidth.left - sideRailWidth.right);
  let showLeft = !layout.hidden.left && !!layout.left.tabs.length, showRight = !layout.hidden.right && !!layout.right.tabs.length;
  if (available - (showLeft ? layout.widths.left + sideSashWidth : 0) - (showRight ? layout.widths.right + sideSashWidth : 0) < 480) showRight = false;
  if (available - (showLeft ? layout.widths.left + sideSashWidth : 0) < 480) showLeft = false;
  const leftWidth = showLeft ? layout.widths.left : 0, rightWidth = showRight ? layout.widths.right : 0;
  const leftInset = leftWidth + (showLeft ? sideSashWidth : 0), rightInset = rightWidth + (showRight ? sideSashWidth : 0);
  const centerRect: Rect = { x: sideRailWidth.left + leftInset, y: 0, width: available - leftInset - rightInset, height: size.height - bottomRail };
  const showBottom = !layout.hidden.bottom && !!layout.bottom.tabs.length && centerRect.height >= 405, bottomHeight = showBottom ? Math.min(layout.bottomHeight, centerRect.height - 245) : 0;
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
  function activate(id: string, tabOnly = false) { const next = structuredClone(state.current), g = owner(id, next); if (!g) return; g.active = id; next.activeGroup = g.id; commit(next); onActivate(id); setMenu(null); if (maximized && maximized !== g.id) setMaximized(null); restoreFocus(id, tabOnly); }
  function removeView(next: ZonedLayout, id: string) { const g = owner(id, next); if (g) g.tabs = g.tabs.filter(view => view !== id); next.previews = next.previews.filter(view => view !== id); next.kept = next.kept.filter(view => view !== id); }
  function splitView(next: ZonedLayout, id: string, target: string, axis: 'x' | 'y', before = false) {
    const rect = positions.result.get(target) ?? mainRect, destination = groups(next.tree).find(g => g.id === target);
    if (!destination || destination.tabs.length === 1 && destination.tabs[0] === id) { notice('请先在此组打开另一个对象或模式。'); return false; }
    if ((axis === 'x' ? rect.width : rect.height) < minimum(destination, axis, minSize) + Math.max(axis === 'x' ? 480 : 240, minSize(id)[axis === 'x' ? 'width' : 'height']) + gap) { notice(axis === 'x' ? '横向空间不足：可在同组切换、上下分屏，或收起侧栏后再试。' : '纵向空间不足：可在同组打开，或收起底栏后再试。'); return false; }
    removeView(next, id); const leaf = group(uid(), [id]);
    if (!next.tree) next.tree = leaf; else next.tree = change(next.tree, target, sibling => ({ kind: 'split', id: uid(), axis, ratio: .5, first: before ? leaf : sibling, second: before ? sibling : leaf }));
    next.activeGroup = leaf.id; return true;
  }
  function restoreCollapsed(id: string) { const next = structuredClone(state.current), item = next.collapsed.find(g => g.id === id); if (!item) return; next.collapsed = next.collapsed.filter(g => g !== item);
    if (item.zone === 'center') {
      const home = item.home as {siblingId?:string;axis?:'x'|'y';first?:boolean;ratio?:number}|undefined;
      const target = groups(next.tree).find(g=>g.id===home?.siblingId), axis=home?.axis;
      const restored={...group(item.id,item.tabs),active:item.active}, rect=target&&positions.result.get(target.id);
      if(target&&rect&&(axis==='x'||axis==='y')&&(axis==='x'?rect.width:rect.height)>=minimum(target,axis,minSize)+minimum(restored,axis,minSize)+gap){
        next.tree=change(next.tree!,target.id,sibling=>({kind:'split',id:uid(),axis,ratio:clamp(home?.ratio??.5,.1,.9),first:home?.first?restored:sibling,second:home?.first?sibling:restored}));next.activeGroup=restored.id;
      } else {const fallback=target??groups(next.tree)[0];if(fallback){fallback.tabs.push(...item.tabs);fallback.active=item.active;next.activeGroup=fallback.id;}else{next.tree=restored;next.activeGroup=restored.id;}}
    }
    else { const target = next[item.zone]; target.tabs.push(...item.tabs); target.active = item.active; next.hidden[item.zone] = false; next.activeGroup = target.id; }
    commit(next); onActivate(item.active); notice('已恢复收纳内容到可容纳的合法区域；原对象与草稿保留。'); restoreFocus(item.active);
  }
  function showTemporary(zone: 'left' | 'right' | 'bottom') { if (!temporary) returnFocus.current = centralFocus.current?.isConnected ? centralFocus.current : document.activeElement as HTMLElement; setTemporary(zone); }
  function dismissTemporary() { setTemporary(null); requestAnimationFrame(() => {const target=returnFocus.current;target?.focus({ preventScroll: true });const range=target&&selections.current.get(target);if(range?.startContainer.isConnected){const selection=document.getSelection();selection?.removeAllRanges();selection?.addRange(range);}}); }
  function open(raw: string, options: OpenOptions = {}) {
    const id = currentView(raw); if (!registered.has(id)) { notice('此对象暂不可用；已保存的恢复身份仍保留。'); return; }
    const next = structuredClone(state.current), collapsed = next.collapsed.find(g => g.tabs.includes(id)); if (collapsed) { restoreCollapsed(collapsed.id); return; }
    let g = owner(id, next);
    const zone = g ? groupZone(g.id) : zoneOf(id);
    if(options.beside&&g&&g.id!==next.activeGroup){activate(id);return;}
    if (options.beside && zone === 'center') { const destination = groups(next.tree).find(g => g.id === next.activeGroup) ?? groups(next.tree)[0]; if (destination && splitView(next, id, destination.id, options.beside)) { next.kept.push(id); commit(next); onActivate(id); restoreFocus(id); } return; }
    if (!g) {
      if (zone !== 'center') g = next[zone];
      else { const same = sceneView(id); g = same ? groups(next.tree).find(g => g.tabs.some(view => sceneView(view)?.[2] === same[2])) : undefined;
        if (g && same) { const previous = g.tabs.find(view => sceneView(view)?.[2] === same[2])!; g.tabs[g.tabs.indexOf(previous)] = id; next.kept = next.kept.map(view => view === previous ? id : view); }
        g ??= groups(next.tree).find(g => g.id === next.activeGroup) ?? groups(next.tree)[0]; if (!g) { g = group(uid(), []); next.tree = g; }
        if (options.preview) { const old = g.tabs.find(view => next.previews.includes(view)); if (old && !status?.(old)?.dirty) removeView(next, old); }
      }
      if (!g.tabs.includes(id)) g.tabs.push(id);
    }
    if (options.preview && !next.kept.includes(id)) next.previews.push(id); else if (!options.preview) { next.kept.push(id); next.previews = next.previews.filter(v => v !== id); }
    g.active = id; next.activeGroup = g.id;
    if (zone !== 'center') { const wasResponsive = !state.current.hidden[zone] && state.current[zone].tabs.length>0 && !positions.result.has(zone); if (wasResponsive) showTemporary(zone); else next.hidden[zone] = false; }
    commit(next); setMenu(null); if (maximized !== g.id) setMaximized(null); onActivate(id); restoreFocus(id);
  }
  function closeViews(ids: string[], batch = false) { const trigger=menu?.anchor??document.activeElement as HTMLElement;setMenu(null); pending.current = pending.current.then(async () => {
    const targets=ids.filter(id=>owner(id));
    const refused=(id?:string)=>{if(!batch&&targets.length===1&&id)activate(id);else requestAnimationFrame(()=>trigger?.isConnected&&trigger.focus());};
    if(callbacks.current.onBeforeClose&&!await callbacks.current.onBeforeClose(targets)){refused(targets[0]);return;}
    for (const id of targets) if(callbacks.current.onClose&&!await callbacks.current.onClose(id)){refused(id);return;}
    const next=structuredClone(state.current);for(const id of targets){removeView(next,id);focus.current.delete(id);}commit(next);setMounted(old=>old.filter(view=>!targets.includes(view)));
    const g = allGroups(state.current).find(g => g.id === state.current.activeGroup && g.tabs.length); if (g) { callbacks.current.onActivate(g.active); restoreFocus(g.active); }
  }).catch(error => notice(`关闭未完成：${String(error)}`)); }
  function move(id: string, destination: string, edge?: 'left' | 'right' | 'top' | 'bottom', beforeView?: string) {
    const next = structuredClone(state.current), from = owner(id, next), to = allGroups(next).find(g => g.id === destination); if (!from || !to) return; const a = groupZone(from.id), b = groupZone(to.id);
    if (!(a === 'center' && b === 'center' || side(a) && side(b) || a === 'bottom' && b === 'bottom')) { notice('此工具只能在所属区域调整。'); return; }
    if (edge) { if (a !== 'center' || !splitView(next, id, to.id, edge === 'left' || edge === 'right' ? 'x' : 'y', edge === 'left' || edge === 'top')) return; }
    else { from.tabs = from.tabs.filter(view => view !== id); const index = beforeView ? to.tabs.indexOf(beforeView) : -1; to.tabs.splice(index < 0 ? to.tabs.length : index, 0, id); to.active = id; next.activeGroup = to.id; if (side(b)) next.hidden[b] = false; }
    commit(next); setMenu(null); onActivate(id); restoreFocus(id);
  }
  function collapse(g: Group) { const next = structuredClone(state.current), zone = groupZone(g.id); if (zone !== 'center') next.hidden[zone] = true; else {
    const findHome=(tree:ZonedLayout['tree']):unknown=>{if(!tree||tree.kind==='group')return;const first=tree.first.id===g.id,second=tree.second.id===g.id;if(first||second)return {kind:'dock',siblingId:(first?tree.second:tree.first).id,axis:tree.axis,ratio:tree.ratio,first};return findHome(tree.first)??findHome(tree.second);};
    next.collapsed.push({ ...structuredClone(g), zone, home:findHome(next.tree) }); next.tree = removeGroup(next.tree, g.id);
  } commit(next); setMenu(null); setMaximized(null); }
  function preserve(next: ZonedLayout) { for (const id of openViews(state.current)) if (!openViews(next).includes(id)) { const z = zoneOf(id); if (z === 'center') { const g = groups(next.tree)[0]; if (g) g.tabs.push(id); else next.tree = group(uid(), [id]); } else next[z].tabs.push(id); } return next; }
  function readPresets(): Record<string, ZonedLayout> { try { const data: unknown = JSON.parse(localStorage.getItem(keys.presets) ?? '{}'); return data && typeof data === 'object' ? Object.fromEntries(Object.entries(data).filter(([, v]) => validLayout(v))) : {}; } catch { return {}; } }
  function portable(value: ZonedLayout, restore: boolean) { const next = structuredClone(value), slots = [sceneId, ...sceneIds.filter(id => id !== sceneId)];
    const map = (id: string) => { const match = /^(writing|source|commands|command-stage):(.+)$/.exec(id); if (!match) return id; const slot = match[2]!; const mapped = restore ? slot === '$current' ? sceneId : slots[Number(/^\$scene-(\d+)$/.exec(slot)?.[1]) - 1] ?? slot : slot === sceneId ? '$current' : slots.includes(slot) ? `$scene-${slots.indexOf(slot) + 1}` : slot; return `${match[1]}:${mapped}`; };
    for (const g of allGroups(next)) { g.tabs = g.tabs.map(map); g.active = map(g.active); } next.kept = next.kept.map(map); next.previews = next.previews.map(map); return next;
  }
  useImperativeHandle(ref, () => ({ open, close: id => closeViews([id]), snapshot: () => structuredClone(state.current), listPresets: () => Object.keys(readPresets()),
    preset: name => { commit(preserve(defaults(name))); setMaximized(null); setTemporary(null); notice('已重置摆放；打开对象、草稿和个人偏好保留。'); },
    savePreset: (name = '我的布局') => { if (!name.trim()) return; try { localStorage.setItem(keys.presets, JSON.stringify({ ...readPresets(), [name.trim()]: portable(state.current, false) })); notice(`已保存布局「${name.trim()}」`); } catch { notice('布局未能保存，当前会话保留。'); } },
    restorePreset: (name = '我的布局') => { const saved = readPresets()[name.trim()]; if (!saved) { notice('未找到此命名布局。'); return; } commit(preserve(portable(saved, true))); setMaximized(null); setTemporary(null); },
  }));
  useLayoutEffect(() => { const element = host.current!; const observer = new ResizeObserver(([entry]) => { if (entry?.contentRect.width) setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); }); observer.observe(element); callbacks.current.onViewsChange?.(openViews(state.current));if(state.current.stageSource)callbacks.current.onRestoreStageSource?.(state.current.stageSource); const g = allGroups(state.current).find(g => g.id === state.current.activeGroup); if (g?.active) callbacks.current.onActivate(g.active); if (loaded.error) callbacks.current.notice(loaded.error); return () => observer.disconnect(); }, []);
  useEffect(() => { if (migrationBlocked) return; try { localStorage.setItem(keys.current, JSON.stringify(layout)); } catch { notice('个人布局保存失败；作品内容未受影响。'); } }, [layout, keys.current, migrationBlocked]);
  useEffect(()=>{if(temporary&&(temporary==='left'?showLeft:temporary==='right'?showRight:showBottom))setTemporary(null);},[temporary,showLeft,showRight,showBottom]);
  useEffect(() => { const edited = layout.previews.filter(id => status?.(id)?.dirty); if (!edited.length) return; const next = structuredClone(layout); next.kept.push(...edited); next.previews = next.previews.filter(id => !edited.includes(id)); commit(next); });
  useEffect(() => { const root = host.current!; const remember = () => { const active = document.activeElement; if (!(active instanceof HTMLElement) || !root.contains(active)) return; const selection = document.getSelection(); if (active.isContentEditable && selection?.rangeCount && active.contains(selection.anchorNode)) selections.current.set(active, selection.getRangeAt(0).cloneRange()); }; document.addEventListener('selectionchange', remember); return () => document.removeEventListener('selectionchange', remember); }, []);
  function track(event: React.PointerEvent, update: (e: PointerEvent) => void, end?: () => void) { event.preventDefault(); const el = event.currentTarget; el.setPointerCapture(event.pointerId); let finished=false; const finish = (cancel=false) => { if(finished)return;finished=true;el.removeEventListener('pointermove', update as EventListener); el.removeEventListener('pointerup', pointerEnd); el.removeEventListener('lostpointercapture', pointerEnd);document.removeEventListener('keydown',key,true);if(cancel)setDragging(false);else end?.(); };const pointerEnd=()=>finish(),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(true);}};el.addEventListener('pointermove', update as EventListener); el.addEventListener('pointerup', pointerEnd); el.addEventListener('lostpointercapture', pointerEnd);document.addEventListener('keydown',key,true); }
  function drag(event: React.PointerEvent, id: string) {
    if (event.button !== 0 || event.pointerType === 'touch' || (event.target as HTMLElement).closest('button:not([role=tab])')) return; const start = { x: event.clientX, y: event.clientY }; let destination: { id: string; before?: string; edge?: 'left' | 'right' | 'top' | 'bottom' } | null = null, moved = false;
    track(event, e => { if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return; moved = true; setDragging(true); const rect = host.current!.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top, hit = [...positions.result].find(([, r]) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-dock-tab]');
      if (hit) { const [groupId, r] = hit; const edge = groupZone(groupId) !== 'center' || y < r.y + header ? undefined : x < r.x + r.width * .2 ? 'left' : x > r.x + r.width * .8 ? 'right' : y < r.y + r.height * .2 ? 'top' : y > r.y + r.height * .8 ? 'bottom' : undefined; destination = { id: groupId, before: over?.dataset.dockTab, edge }; }
      else destination = x < sideRailWidth.left ? { id: 'left' } : x >= size.width - sideRailWidth.right ? { id: 'right' } : null;
    }, () => { if (moved && destination) move(id, destination.id, destination.edge, destination.before); else if (!moved) activate(id); setDragging(false); });
  }
  const visible = [...central, layout.left, layout.right, layout.bottom].filter(g => positions.result.has(g.id)), menuGroup = menu && owner(menu.view);
  const toolIds = (zone: 'left' | 'right') => [...new Set([...layout[zone].tabs, ...viewIds.filter(id => zoneOf(id) === zone && !allGroups(layout).some(g => g.tabs.includes(id)))])];
  const actions = menu && menuGroup ? [
    { id: 'keep', label: '保留标签', run: () => { const next = structuredClone(layout); next.kept.push(menu.view); next.previews = next.previews.filter(id => id !== menu.view); commit(next); } },
    { id: 'close', label: '关闭标签', run: () => closeViews([menu.view]) }, { id: 'others', label: '关闭其他标签', run: () => closeViews(menuGroup.tabs.filter(id => id !== menu.view), true) }, { id: 'right', label: '关闭右侧标签', run: () => closeViews(menuGroup.tabs.slice(menuGroup.tabs.indexOf(menu.view) + 1), true) },
    ...(groupZone(menuGroup.id) === 'center' ? ([...(['left', 'right', 'top', 'bottom'] as const).map((edge, i) => ({ id: `split-${edge}`, label: ['向左分屏', '向右分屏', '向上分屏', '向下分屏'][i]!, run: () => move(menu.view, menuGroup.id, edge) })), ...central.filter(g => g !== menuGroup).map(g => ({ id: g.id, label: `移入「${title(g.active)}」组`, run: () => move(menu.view, g.id) }))]) : side(groupZone(menuGroup.id)) ? [{ id: 'side', label: `移到${menuGroup.id === 'left' ? '右' : '左'}侧栏`, run: () => move(menu.view, menuGroup.id === 'left' ? 'right' : 'left') }] : []),
    { id: 'collapse', label: '收起此标签组', run: () => collapse(menuGroup) },
  ] : [];
  return <div className="gc-candidate-dock" ref={host} data-testid="candidate-dock" data-layout-version="2" onKeyDown={e => { if (e.key === 'Escape' && temporary && !menu) { e.preventDefault(); dismissTemporary(); } }}>
    {(['left', 'right'] as const).map(zone => <nav key={zone} className={`candidate-zone-rail is-${zone}`} style={{ width: sideRailWidth[zone] }} aria-label={`${zone === 'left' ? '左' : '右'}侧工具`}>
      {toolIds(zone).map(id => <CandidateIconButton key={id} density="large" label={title(id)} aria-pressed={layout[zone].active === id && positions.result.has(zone)} onClick={() => {
        if (layout[zone].active !== id || !positions.result.has(zone)) open(id);
        else if (temporary === zone) dismissTemporary();
        else { const next = structuredClone(state.current); next.hidden[zone] = true; commit(next); }
      }}>{icon?.(id) ?? (zone === 'left' ? <PanelLeft aria-hidden="true"/> : <PanelRight aria-hidden="true"/>)}</CandidateIconButton>)}
      {layout.collapsed.filter(g => g.zone === zone).map(g => <CandidateIconButton key={g.id} density="large" label={`恢复已收纳内容 ${title(g.active)}`} onClick={() => restoreCollapsed(g.id)}><Columns2 aria-hidden="true"/></CandidateIconButton>)}
    </nav>)}
    {[...new Set([...mounted, ...openViews(layout)])].map(id => { const g = visible.find(g => g.active === id), rect = g && positions.result.get(g.id); return <section key={id} className={`gc-candidate-dock-content ${g && temporary === g.id ? 'is-temporary' : ''}`} id={`${tabNamespace}-panel-${id}`} data-view={id} data-maximized={Boolean(g && maximized === g.id)} aria-label={title(id)} hidden={!rect} style={rect ? { left: rect.x, top: rect.y + header, width: rect.width, height: Math.max(0, rect.height - header), zIndex: temporary === g?.id ? 15 : 1 } : undefined} onFocusCapture={e => { if(!(e.target as HTMLElement).closest('[aria-label="场景编辑模式"]')){focus.current.set(id, e.target);if(g&&groupZone(g.id)==='center')centralFocus.current=e.target;} if (g && state.current.activeGroup !== g.id) { const next = structuredClone(state.current); next.activeGroup = g.id; commit(next); onActivate(id); } }}>
      {registered.has(id) ? renderView(id) : <div className="candidate-missing-view" role="status"><strong>对象暂不可用</strong><p>{title(id)}</p><p>恢复身份已保留。请重新打开所属作品或恢复该对象。</p></div>}
    </section>; })}
    {visible.map(g => { const rect = positions.result.get(g.id)!, zone = groupZone(g.id); return <div key={g.id} data-group={g.id} data-zone={zone} className={`gc-candidate-dock-header ${layout.activeGroup === g.id ? 'is-active' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.width, height: header, zIndex: temporary === g.id ? 16 : 4 }}>
      <CandidateDockTabList activeView={g.active} views={g.tabs} onActivate={id => activate(id, true)}>
        {g.tabs.map(id => {
          const tabStatus = status?.(id);
          return <CandidateDockTab key={id} viewId={id} title={title(id)} tabId={`${tabNamespace}-tab-${id}`} controls={`${tabNamespace}-panel-${id}`}
            active={g.active === id} groupActive={layout.activeGroup === g.id} dirty={tabStatus?.dirty} error={tabStatus?.error}
            preview={layout.previews.includes(id)} icon={icon?.(id)}
            onActivate={() => activate(id, true)} onClose={() => closeViews([id])}
            menuOpen={menu?.view === id} onMenu={target => setMenu({ view: id, ...target })}
            onPointerDown={e => drag(e, id)} onKeep={() => {
              const next = structuredClone(state.current);
              next.kept.push(id);
              next.previews = next.previews.filter(view => view !== id);
              commit(next);
            }}/>;
        })}
      </CandidateDockTabList>
      <CandidateIconButton density="toolbar" label={maximized === g.id ? '还原工作面' : '局部最大化'} onClick={() => { setMaximized(maximized === g.id ? null : g.id); setTemporary(null); restoreFocus(g.active); }}>{maximized === g.id ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</CandidateIconButton>
      <CandidateIconButton density="toolbar" label={temporary === g.id ? '收回临时工具' : `收起 ${title(g.active)}`} onClick={() => temporary === g.id ? dismissTemporary() : collapse(g)}><X size={14}/></CandidateIconButton>
    </div>; })}
    {!maximized && !squeezed && positions.handles.map(({ node, rect }) => { const horizontal = node.axis === 'x', total = (horizontal ? rect.width : rect.height) - gap, offset = total * node.ratio;
      const ratio = (value: number) => { const next = structuredClone(state.current); if (next.tree) next.tree = change(next.tree, node.id, t => t.kind === 'split' ? { ...t, ratio: clamp(value, minimum(t.first, t.axis, minSize) / total, 1 - minimum(t.second, t.axis, minSize) / total) } : t); commit(next); };
      return <div key={node.id} role="separator" aria-label="调整中央分屏" aria-orientation={horizontal ? 'vertical' : 'horizontal'} aria-valuenow={Math.round(offset)} tabIndex={0} className={`gc-candidate-splitter ${horizontal ? 'horizontal' : 'vertical'}`} style={{ left: rect.x + (horizontal ? offset : 0), top: rect.y + (horizontal ? 0 : offset), width: horizontal ? gap : rect.width, height: horizontal ? rect.height : gap }} onPointerDown={e => { const origin = host.current!.getBoundingClientRect(); track(e, event => ratio(((horizontal ? event.clientX - origin.left - rect.x : event.clientY - origin.top - rect.y) - 2.5) / total)); }} onKeyDown={e => { if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); ratio(node.ratio + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -.02 : .02)); } }}/>;
    })}
    {!maximized && (['left', 'right'] as const).map(zone => {
      const left = zone === 'left', width = left ? leftWidth : rightWidth;
      if (!width) return null;
      const maxWidth = Math.max(240, available - (left ? rightInset : leftInset) - sideSashWidth - 480);
      const resize = (value: number) => {
        const next = structuredClone(state.current);
        next.widths[zone] = clamp(value, 240, maxWidth);
        commit(next);
      };
      return <div key={zone} role="separator" aria-orientation="vertical" aria-label={`调整${left ? '左' : '右'}侧栏宽度`}
        aria-valuenow={width} aria-valuemin={240} aria-valuemax={maxWidth} tabIndex={0} className="gc-candidate-splitter horizontal candidate-side-sash"
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
    {!maximized && showBottom && <div role="separator" aria-label="调整底栏高度" aria-valuenow={bottomHeight} tabIndex={0} className="gc-candidate-splitter vertical" style={{ left: centerRect.x, top: mainRect.height, width: centerRect.width, height: gap }} onPointerDown={e => { const origin = host.current!.getBoundingClientRect(); track(e, event => { const next = structuredClone(state.current); next.bottomHeight = clamp(size.height - bottomRail - (event.clientY - origin.top), 160, centerRect.height - 245); commit(next); }); }} onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const next = structuredClone(state.current); next.bottomHeight = clamp(next.bottomHeight + (e.key === 'ArrowUp' ? 16 : -16), 160, centerRect.height - 245); commit(next); } }}/>}
    <nav className="candidate-bottom-rail" style={{ left: centerRect.x, width: centerRect.width }} aria-label="辅助工具与收纳内容">
      {[...new Set([...layout.bottom.tabs, ...viewIds.filter(id => zoneOf(id) === 'bottom')])].map(id => <CandidateButton key={id} aria-pressed={layout.bottom.active === id && showBottom} onClick={() => open(id)}>{icon?.(id) ?? <PanelBottom size={14}/>}<span>{title(id)}</span></CandidateButton>)}
      {squeezed && central.length > 1 && <CandidateMenuButton label={`中央组 ${central.length}`} actions={central.map(g=>({id:g.id,label:title(g.active),run:()=>activate(g.active)}))}/>}
      {layout.collapsed.filter(g => g.zone === 'center' || g.zone === 'bottom').map(g => <CandidateButton key={g.id} onClick={() => restoreCollapsed(g.id)}>恢复已收纳内容 · {title(g.active)}</CandidateButton>)}
      {migrationBlocked && <CandidateButton onClick={() => { const result = loadLayouts(localStorage, storageKey); if (result.layout) { commit(result.layout); setMigrationBlocked(false); } else notice(result.error ?? '旧布局仍保留。'); }}>重试布局恢复</CandidateButton>}
    </nav>
    <CandidateActionMenu label={menu ? `标签操作 ${title(menu.view)}` : '标签操作'} target={menu} actions={actions} portal={host.current} onDismiss={() => setMenu(null)}/>
    {dragging && <div className="candidate-drop-hint" role="status">拖入同类区域合并；中央边缘分屏。松开后检查可用空间。</div>}
  </div>;
}
