import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Columns2, Ellipsis, Maximize2, Minimize2, Pin, X } from 'lucide-react';

type Group = { kind: 'group'; id: string; tabs: string[]; active: string };
type Split = { kind: 'split'; id: string; axis: 'x' | 'y'; ratio: number; first: Tree; second: Tree };
type Tree = Group | Split;
type Rect = { x: number; y: number; width: number; height: number };
type Floating = Group & { rect: Rect };
type DockHome = { kind: 'dock'; splitId: string; siblingId: string; axis: Split['axis']; ratio: number; first: boolean };
type Collapsed = Group & { home?: DockHome | { kind: 'float'; rect: Rect } };
type Layout = { tree: Tree | null; floats: Floating[]; collapsed: Collapsed[]; pinned: string[]; activeGroup: string };
type EditorSelection = { anchor: Node; anchorOffset: number; focus: Node; focusOffset: number };
type Edge = 'left' | 'right' | 'top' | 'bottom';
type Placement = 'center' | Edge | 'float';
export type LayoutPreset = 'balanced' | 'writing' | 'source' | 'stage' | 'documents' | 'custom' | 'page' | 'character' | 'production';
export type DockHandle = {
  open(id: string): void;
  preset(name: LayoutPreset): void;
  listPresets(): string[];
  savePreset(name?: string): void;
  restorePreset(name?: string): void;
  snapshot(): unknown;
};
const group = (id: string, tabs: string[]): Group => ({ kind: 'group', id, tabs, active: tabs[0]! });
const split = (id: string, axis: 'x' | 'y', ratio: number, first: Tree, second: Tree): Split => ({ kind: 'split', id, axis, ratio, first, second });
const idFor = (kind: string) => `${kind}-${crypto.randomUUID()}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function preset(name: LayoutPreset, scene: string): Layout {
  const writing = `writing:${scene}`, source = `source:${scene}`;
  const center = name === 'page' ? ['page', 'blueprint'] : name === 'character' ? ['character', 'psd'] : name === 'production' ? ['production'] : ['source', 'documents', 'custom'].includes(name) ? [writing] : [writing, source];
  const left = group('document', center), stage = group('stage', ['stage']), properties = group('properties', ['inspector', 'assets']);
  if (name === 'stage') {
    return { tree: split('main', 'x', .73, split('stage-writing', 'y', .66, stage, left), properties), floats: [], collapsed: [], pinned: [], activeGroup: 'stage' };
  }
  if (name === 'documents') {
    return { tree: split('main', 'x', .36, left, group('page-design', ['page', 'blueprint'])), floats: [], collapsed: [], pinned: [], activeGroup: 'page-design' };
  }
  if (name === 'custom') {
    const tools = split('aside', 'y', .57, stage, group('source', [source]));
    const tree = split('main', 'x', .2, group('properties', ['inspector']), split('workspace', 'x', .57, left, tools));
    const assets = { ...group('assets', ['assets']), rect: { x: 16, y: 470, width: 360, height: 360 } };
    return { tree, floats: [assets], collapsed: [], pinned: [], activeGroup: 'document' };
  }
  const tree = name === 'writing' ? split('main', 'x', .72, left, split('aside', 'y', .43, stage, properties))
    : name === 'source' ? split('main', 'x', .5, left, split('aside', 'y', .64, group('source', [source]), properties))
    : name === 'balanced' ? split('main', 'x', .51, left, split('aside', 'y', .58, stage, properties)) : left;
  return { tree, floats: [], collapsed: [], pinned: [], activeGroup: 'document' };
}
function groups(tree: Tree | null): Group[] {
  if (!tree) return [];
  return tree.kind === 'group' ? [tree] : [...groups(tree.first), ...groups(tree.second)];
}
function change(tree: Tree, id: string, fn: (tree: Tree) => Tree): Tree {
  if (tree.id === id) return fn(tree);
  return tree.kind === 'split' ? { ...tree, first: change(tree.first, id, fn), second: change(tree.second, id, fn) } : tree;
}
function removeGroup(tree: Tree | null, id: string): Tree | null {
  if (!tree || tree.id === id) return null;
  if (tree.kind === 'group') return tree;
  const first = removeGroup(tree.first, id), second = removeGroup(tree.second, id);
  return first && second ? { ...tree, first, second } : first ?? second;
}
function dockHome(tree: Tree | null, id: string): DockHome | undefined {
  if (tree?.kind !== 'split') return undefined;
  const first = tree.first.id === id;
  if (!first && tree.second.id !== id) return dockHome(tree.first, id) ?? dockHome(tree.second, id);
  return { kind: 'dock', splitId: tree.id, siblingId: (first ? tree.second : tree.first).id, axis: tree.axis, ratio: tree.ratio, first };
}
function includesNode(tree: Tree, id: string): boolean {
  return tree.id === id || (tree.kind === 'split' && (includesNode(tree.first, id) || includesNode(tree.second, id)));
}
function splitAt(tree: Tree | null, leaf: Group, destination: string, place: Edge): Tree {
  if (!tree) return leaf;
  const first = place === 'left' || place === 'top', axis = place === 'left' || place === 'right' ? 'x' : 'y';
  const target = includesNode(tree, destination) ? destination : tree.id;
  return change(tree, target, sibling => split(idFor('split'), axis, .5, first ? leaf : sibling, first ? sibling : leaf));
}
function allGroups(layout: Layout) { return [...groups(layout.tree), ...layout.floats, ...layout.collapsed]; }
function visibleGroups(layout: Layout) { return [...groups(layout.tree), ...layout.floats]; }
function ensureActive(layout: Layout) {
  const visible = visibleGroups(layout);
  if (!visible.some(g => g.id === layout.activeGroup)) layout.activeGroup = visible[0]?.id ?? '';
}
function removeEmptyGroup(layout: Layout, id: string) {
  layout.tree = removeGroup(layout.tree, id);
  layout.floats = layout.floats.filter(g => g.id !== id);
  layout.collapsed = layout.collapsed.filter(g => g.id !== id);
}
function geometry(tree: Tree | null, rect: Rect, result = new Map<string, Rect>(), handles: { node: Split; rect: Rect }[] = []) {
  if (!tree) return { result, handles };
  if (tree.kind === 'group') result.set(tree.id, rect);
  else {
    const size = tree.axis === 'x' ? rect.width : rect.height, gap = Math.min(5, size);
    const first = clamp(Math.round((size - gap) * tree.ratio), 0, size - gap);
    const a = { ...rect, ...(tree.axis === 'x' ? { width: first } : { height: first }) };
    const b = { ...rect, ...(tree.axis === 'x' ? { x: rect.x + first + gap, width: size - first - gap } : { y: rect.y + first + gap, height: size - first - gap }) };
    handles.push({ node: tree, rect }); geometry(tree.first, a, result, handles); geometry(tree.second, b, result, handles);
  }
  return { result, handles };
}
function fitFloat(rect: Rect, bounds: Pick<Rect, 'width' | 'height'>): Rect {
  const width = clamp(rect.width, Math.min(280, bounds.width), bounds.width);
  const height = clamp(rect.height, Math.min(160, bounds.height), bounds.height);
  return { x: clamp(rect.x, 0, bounds.width - width), y: clamp(rect.y, 0, bounds.height - height), width, height };
}
function validRect(rect: Rect | undefined): rect is Rect {
  return !!rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width >= 0 && rect.height >= 0;
}
function validLayout(value: unknown): value is Layout {
  if (!value || typeof value !== 'object') return false;
  const l = value as Layout;
  const validGroup = (g: Group) => g?.kind === 'group' && typeof g.id === 'string' && Array.isArray(g.tabs) && g.tabs.every(v => typeof v === 'string') && g.tabs.includes(g.active);
  const validAxis = (axis: Split['axis']) => axis === 'x' || axis === 'y';
  const validRatio = (ratio: number) => Number.isFinite(ratio) && ratio >= .05 && ratio <= .95;
  const validHome = (home: Collapsed['home']) => !home || (home.kind === 'float' ? validRect(home.rect) : home.kind === 'dock' && typeof home.splitId === 'string' && typeof home.siblingId === 'string' && validAxis(home.axis) && validRatio(home.ratio) && typeof home.first === 'boolean');
  const treeValid = (t: Tree): boolean => t?.kind === 'group' ? validGroup(t) : t?.kind === 'split' && typeof t.id === 'string' && validAxis(t.axis) && validRatio(t.ratio) && treeValid(t.first) && treeValid(t.second);
  return (l.tree === null || treeValid(l.tree)) && Array.isArray(l.floats) && l.floats.every(g => validGroup(g) && validRect(g.rect))
    && Array.isArray(l.collapsed) && l.collapsed.every(g => validGroup(g) && validHome(g.home))
    && Array.isArray(l.pinned) && l.pinned.every(view => typeof view === 'string') && typeof l.activeGroup === 'string';
}
const personalKey = 'galcraft-r0:personal-layouts';
const defaultName = '我的布局';
function readPresets(): Record<string, Layout> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(personalKey) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, layout]) => validLayout(layout))) : {};
  } catch { return {}; }
}
function readLayout(key: string): Layout | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (validLayout(value)) return value;
  } catch { /* A corrupt preference never blocks the work. */ }
}
function remapViews(layout: Layout, map: (view: string) => string | undefined): Layout {
  const next = structuredClone(layout);
  for (const group of allGroups(next)) {
    group.tabs = [...new Set(group.tabs.map(map).filter((view): view is string => !!view))];
    const active = map(group.active);
    group.active = active && group.tabs.includes(active) ? active : group.tabs[0] ?? '';
    if (!group.tabs.length) removeEmptyGroup(next, group.id);
  }
  next.pinned = next.pinned.map(map).filter((view): view is string => !!view);
  ensureActive(next);
  return next;
}
function mapDocument(view: string, map: (scene: string) => string | undefined) {
  const match = /^(writing|source):(.*)$/.exec(view);
  if (!match) return view;
  const id = map(match[2]!);
  return id && `${match[1]}:${id}`;
}
export function DockWorkspace({ ref, initial = 'balanced', initialView, sceneId, sceneIds, storageKey, renderView, title, onActivate, notice }: {
  ref?: Ref<DockHandle>; initial?: LayoutPreset; initialView?: string; sceneId: string; sceneIds: readonly string[]; storageKey: string; renderView(id: string): ReactNode; title(id: string): string; onActivate(id: string): void; notice(message: string): void;
}) {
  const layoutKey = `${storageKey}:layout`, legacyPresetKey = `${storageKey}:personal`;
  const keepScene = (id: string) => sceneIds.includes(id) ? id : undefined;
  const [layout, setLayout] = useState<Layout>(() => {
    const saved = readLayout(layoutKey);
    if (saved) return remapViews(saved, view => mapDocument(view, keepScene));
    const next = preset(initial, sceneId);
    if (initialView) {
      const docked = groups(next.tree);
      const destination = docked.find(g => g.tabs.includes(initialView)) ?? docked[0]!;
      if (!destination.tabs.includes(initialView)) destination.tabs.push(initialView);
      destination.active = initialView;
      next.activeGroup = destination.id;
    }
    return next;
  });
  const [mounted, setMounted] = useState(() => allGroups(layout).flatMap(g => g.tabs));
  const [size, setSize] = useState({ width: 1000, height: 650 });
  const [maximized, setMaximized] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; place: Placement; point?: Pick<Rect, 'x' | 'y'> } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null), focus = useRef(new Map<string, HTMLElement>());
  const selections = useRef(new WeakMap<HTMLElement, EditorSelection>());
  const state = useRef(layout); state.current = layout;
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const active = visibleGroups(state.current).find(g => g.id === state.current.activeGroup)?.active;
    if (active) onActivate(active);
    const resize = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  const currentTabs = allGroups(layout).flatMap(g => g.tabs);
  const views = [...new Set([...mounted, ...currentTabs])];
  useEffect(() => {
    try { localStorage.setItem(layoutKey, JSON.stringify(layout)); } catch { /* Session layout remains available when browser storage is full. */ }
    setMounted(old => currentTabs.every(view => old.includes(view)) ? old : [...new Set([...old, ...currentTabs])]);
  }, [layout, layoutKey]);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const remember = () => {
      const editor = doc.activeElement;
      if (!(editor instanceof HTMLElement) || !editor.isContentEditable || !root.contains(editor)) return;
      const selection = doc.getSelection();
      if (selection?.anchorNode && selection.focusNode && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
        selections.current.set(editor, { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset });
      }
    };
    doc.addEventListener('selectionchange', remember);
    return () => doc.removeEventListener('selectionchange', remember);
  }, []);
  const bounds = { x: 0, y: 0, width: size.width, height: Math.max(0, size.height - (layout.collapsed.length ? 30 : 0)) };
  const rects = geometry(layout.tree, bounds);
  const floats = [...layout.floats.filter(g => g.id !== layout.activeGroup), ...layout.floats.filter(g => g.id === layout.activeGroup)];
  for (const floating of floats) rects.result.set(floating.id, fitFloat(floating.rect, bounds));
  if (maximized) {
    rects.result.clear();
    rects.result.set(maximized, { x: 0, y: 0, ...size });
  }
  const floatingLayer = (id: string) => 20 + floats.findIndex(g => g.id === id) * 2;
  function commit(next: Layout) {
    state.current = next;
    setLayout(next);
  }
  function selectGroup(group: Group) {
    if (state.current.activeGroup === group.id) return;
    commit({ ...state.current, activeGroup: group.id });
    onActivate(group.active);
  }
  function restoreFocus(id: string, tabOnly = false) {
    requestAnimationFrame(() => {
      const root = host.current, escaped = CSS.escape(id);
      const tab = root?.querySelector<HTMLElement>(`[data-tab-view="${escaped}"]`);
      const section = root?.querySelector<HTMLElement>(`[data-view="${escaped}"]:not([hidden])`);
      if (!tabOnly && section?.contains(section.ownerDocument.activeElement)) return;
      const remembered = focus.current.get(id);
      const editor = section?.querySelector<HTMLElement>('[contenteditable="true"], .monaco-editor [role="textbox"]');
      const element = !tabOnly && (remembered?.getClientRects().length ? remembered : editor);
      const selection = element && selections.current.get(element);
      (element || tab)?.focus({ preventScroll: true });
      if (element && selection && element.contains(selection.anchor) && element.contains(selection.focus)) {
        const offset = (node: Node, value: number) => Math.min(value, node.nodeType === Node.TEXT_NODE ? node.textContent!.length : node.childNodes.length);
        element.ownerDocument.getSelection()?.setBaseAndExtent(selection.anchor, offset(selection.anchor, selection.anchorOffset), selection.focus, offset(selection.focus, selection.focusOffset));
      }
      if (!element) tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  function activate(view: string, tabOnly = false) {
    const next = structuredClone(state.current);
    let destination = allGroups(next).find(g => g.tabs.includes(view));
    const collapsed = next.collapsed.find(g => g.id === destination?.id);
    if (collapsed) {
      const { home, ...restored } = collapsed;
      next.collapsed = next.collapsed.filter(g => g.id !== collapsed.id);
      if (home?.kind === 'float') next.floats.push({ ...restored, rect: home.rect });
      else if (next.tree && home && includesNode(next.tree, home.siblingId)) {
        next.tree = change(next.tree, home.siblingId, sibling => split(home.splitId, home.axis, home.ratio, home.first ? restored : sibling, home.first ? sibling : restored));
      } else {
        next.tree = splitAt(next.tree, restored, home?.siblingId ?? '', home?.axis === 'y' ? (home.first ? 'top' : 'bottom') : (home?.first ? 'left' : 'right'));
      }
      destination = restored;
      if (home?.kind === 'float') destination = next.floats.at(-1)!;
    }
    if (!destination) {
      destination = visibleGroups(next).find(g => g.id === next.activeGroup) ?? visibleGroups(next)[0];
      if (destination) destination.tabs.push(view);
      else {
        destination = group(idFor('group'), [view]);
        next.tree = destination;
      }
    }
    destination.active = view;
    next.activeGroup = destination.id;
    commit(next);
    setMenu(null);
    if (maximized !== destination.id) setMaximized(null);
    onActivate(view);
    restoreFocus(view, tabOnly);
  }
  function applyPreset(next: Layout) {
    commit(next);
    setMaximized(null);
    setMenu(null);
    const active = visibleGroups(next).find(g => g.id === next.activeGroup)?.active;
    if (active) onActivate(active);
  }
  const sceneSlots = [sceneId, ...sceneIds.filter(id => id !== sceneId)];
  useImperativeHandle(ref, () => ({
    open: activate,
    preset: name => {
      applyPreset(preset(name, sceneId));
      notice('已应用布局预设；作品内容保持原样');
    },
    listPresets: () => {
      const names = Object.keys(readPresets());
      if (!names.includes(defaultName) && readLayout(legacyPresetKey)) names.push(defaultName);
      return names;
    },
    savePreset: (name = defaultName) => {
      const key = name.trim();
      if (!key) return;
      const portable = remapViews(state.current, view => mapDocument(view, id => {
        const index = sceneSlots.indexOf(id);
        return index < 0 ? undefined : index === 0 ? '$current' : `$scene-${index + 1}`;
      }));
      try {
        localStorage.setItem(personalKey, JSON.stringify({ ...readPresets(), [key]: portable }));
        notice(`已保存个人布局「${key}」`);
      } catch { notice('浏览器空间不足，个人布局未保存'); }
    },
    restorePreset: (name = defaultName) => {
      const presets = readPresets(), key = name.trim();
      const saved = Object.hasOwn(presets, key) ? presets[key] : undefined;
      const legacy = !saved && key === defaultName ? readLayout(legacyPresetKey) : undefined;
      if (saved) {
        let skipped = false;
        const next = remapViews(saved, view => mapDocument(view, slot => {
          const scene = slot === '$current' ? sceneId : sceneSlots[Number(/^\$scene-(\d+)$/.exec(slot)?.[1]) - 1];
          if (!scene) skipped = true;
          return scene;
        }));
        applyPreset(next);
        notice(skipped ? `已恢复「${key}」；已跳过当前作品没有对应场景的标签` : `已恢复个人布局「${key}」`);
      } else if (legacy) {
        applyPreset(remapViews(legacy, view => mapDocument(view, keepScene)));
        notice(`已恢复个人布局「${key}」`);
      } else notice('还没有保存该个人布局');
    },
    snapshot: () => structuredClone(state.current),
  }));
  function floatRect(point?: Pick<Rect, 'x' | 'y'>) {
    return fitFloat({ x: point ? point.x - 90 : bounds.width * .18, y: point ? point.y - 16 : 40, width: Math.min(700, bounds.width - 32), height: Math.min(520, bounds.height - 60) }, bounds);
  }
  function move(view: string, destination: string, place: Placement, point?: Pick<Rect, 'x' | 'y'>) {
    setMenu(null);
    const next = structuredClone(state.current), origin = visibleGroups(next).find(g => g.tabs.includes(view));
    if (!origin) return;
    const targetGroup = visibleGroups(next).find(g => g.id === destination);
    if (place === 'center' && origin === targetGroup) {
      activate(view);
      return;
    }
    const oldActive = visibleGroups(next).find(g => g.id === next.activeGroup)?.active;
    const home = dockHome(next.tree, origin.id);
    const floating = next.floats.find(g => g.id === origin.id);
    if (place === 'float' && floating?.tabs.length === 1) {
      if (point) floating.rect = fitFloat({ ...floating.rect, x: point.x - 90, y: point.y - 16 }, bounds);
      commit(next);
      restoreFocus(view);
      return;
    }
    origin.tabs = origin.tabs.filter(tab => tab !== view);
    if (origin.active === view) origin.active = origin.tabs[0] ?? '';
    if (!origin.tabs.length) removeEmptyGroup(next, origin.id);
    const leaf = group(origin.tabs.length ? idFor('group') : origin.id, [view]);
    if (place === 'float') {
      next.floats.push({ ...leaf, rect: floatRect(point) });
      next.activeGroup = leaf.id;
    } else if (place === 'center' && targetGroup) {
      targetGroup.tabs.push(view);
      targetGroup.active = view;
      next.activeGroup = targetGroup.id;
    } else {
      const anchor = origin === targetGroup && !origin.tabs.length ? home?.siblingId ?? '' : destination;
      next.tree = splitAt(next.tree, leaf, anchor, place === 'center' ? 'right' : place);
      next.activeGroup = leaf.id;
    }
    commit(next);
    setMaximized(null);
    if (oldActive !== view) onActivate(view);
    restoreFocus(view);
  }
  function pointerDrag(event: React.PointerEvent, view: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    const element = event.currentTarget as HTMLElement, start = { x: event.clientX, y: event.clientY };
    let moved = false, drop: typeof target = null;
    element.setPointerCapture(event.pointerId);
    const movePointer = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      moved = true;
      setDragging(view);
      const hostRect = host.current!.getBoundingClientRect();
      const x = e.clientX - hostRect.left, y = e.clientY - hostRect.top;
      const found = [...rects.result.entries()].reverse().find(([, r]) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height);
      if (e.altKey || x < 0 || y < 0 || x >= size.width || y >= size.height) drop = { id: '', place: 'float', point: { x, y } };
      else if (found) {
        const [id, r] = found, rx = (x - r.x) / r.width, ry = (y - r.y) / r.height;
        const place = floats.some(g => g.id === id) ? 'center' : rx < .22 ? 'left' : rx > .78 ? 'right' : ry < .24 ? 'top' : ry > .76 ? 'bottom' : 'center';
        drop = { id, place };
      } else drop = !layout.tree && y < bounds.height ? { id: '', place: 'center' } : null;
      setTarget(drop);
    };
    const cleanup = () => {
      element.removeEventListener('pointermove', movePointer);
      element.removeEventListener('pointerup', finish);
      element.removeEventListener('lostpointercapture', cleanup);
      setDragging(null);
      setTarget(null);
    };
    const finish = () => {
      if (moved && drop) move(view, drop.id, drop.place, drop.point);
      else if (!moved) activate(view);
      cleanup();
    };
    element.addEventListener('pointermove', movePointer);
    element.addEventListener('pointerup', finish);
    element.addEventListener('lostpointercapture', cleanup);
  }
  function setRatio(id: string, ratio: number) {
    setLayout(old => ({ ...old, tree: old.tree && change(old.tree, id, node => node.kind === 'split' ? { ...node, ratio: clamp(ratio, .12, .88) } : node) }));
  }
  function resize(event: React.PointerEvent, node: Split, rect: Rect) {
    if (event.button !== 0) return;
    event.preventDefault();
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const origin = host.current!.getBoundingClientRect();
    const movePointer = (e: PointerEvent) => {
      const span = node.axis === 'x' ? rect.width : rect.height;
      const coordinate = node.axis === 'x' ? e.clientX - origin.left - rect.x : e.clientY - origin.top - rect.y;
      setRatio(node.id, (coordinate - 2.5) / Math.max(1, span - 5));
    };
    const finish = () => {
      element.removeEventListener('pointermove', movePointer);
      element.removeEventListener('lostpointercapture', finish);
    };
    element.addEventListener('pointermove', movePointer);
    element.addEventListener('lostpointercapture', finish);
  }
  function floatDrag(event: React.PointerEvent, id: string, resizing = false) {
    if (event.button !== 0 || maximized || event.defaultPrevented || (!resizing && (event.target as HTMLElement).closest('[role=tab],button'))) return;
    const original = rects.result.get(id), floating = layout.floats.find(g => g.id === id);
    if (!original || !floating) return;
    event.preventDefault();
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY };
    selectGroup(floating);
    const track = (e: PointerEvent) => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      const rect = resizing ? {
        ...original,
        width: clamp(original.width + dx, Math.min(280, bounds.width - original.x), bounds.width - original.x),
        height: clamp(original.height + dy, Math.min(160, bounds.height - original.y), bounds.height - original.y),
      } : fitFloat({ ...original, x: original.x + dx, y: original.y + dy }, bounds);
      setLayout(old => ({ ...old, floats: old.floats.map(g => g.id === id ? { ...g, rect } : g) }));
    };
    const finish = () => {
      element.removeEventListener('pointermove', track);
      element.removeEventListener('lostpointercapture', finish);
    };
    element.addEventListener('pointermove', track);
    element.addEventListener('lostpointercapture', finish);
  }
  function close(view: string) {
    const next = structuredClone(state.current), found = visibleGroups(next).find(g => g.tabs.includes(view));
    if (!found || next.pinned.includes(view)) return;
    const wasActive = next.activeGroup === found.id && found.active === view;
    found.tabs = found.tabs.filter(tab => tab !== view);
    if (!found.tabs.length) {
      removeEmptyGroup(next, found.id);
      if (maximized === found.id) setMaximized(null);
      if (menu === found.id) setMenu(null);
    } else if (found.active === view) found.active = found.tabs[0]!;
    ensureActive(next);
    commit(next);
    if (wasActive) focusActive(next);
  }
  function collapse(id: string) {
    const next = structuredClone(state.current), found = visibleGroups(next).find(g => g.id === id);
    if (!found) return;
    const floating = next.floats.find(g => g.id === id);
    const home = floating ? { kind: 'float' as const, rect: floating.rect } : dockHome(next.tree, id);
    removeEmptyGroup(next, id);
    next.collapsed.push({ kind: 'group', id, tabs: found.tabs, active: found.active, home });
    const wasActive = next.activeGroup === id;
    ensureActive(next);
    commit(next);
    setMenu(null);
    setMaximized(null);
    if (wasActive) focusActive(next);
  }
  function focusActive(next: Layout) {
    const active = visibleGroups(next).find(g => g.id === next.activeGroup)?.active;
    if (!active) return;
    onActivate(active);
    restoreFocus(active);
  }
  const visible = visibleGroups(layout).filter(g => !maximized || g.id === maximized);
  return <div className={`gc-r0-dock ${dragging ? 'is-dragging' : ''}`} ref={host} data-testid="review-dock" style={{ isolation: 'isolate' }}>
    {!layout.tree && !maximized && <div className="gc-r0-empty" style={{ position: 'absolute', inset: 0, placeContent: 'center', pointerEvents: 'none' }}>
      从任务栏或对象树打开工作面，或将标签拖回此处。
    </div>}
    {views.map(view => {
      const g = visible.find(g => g.active === view), rect = g ? rects.result.get(g.id) : null;
      const floating = g && layout.floats.some(f => f.id === g.id);
      return <section key={view} className={`gc-r0-dock-content ${floating ? 'is-floating' : ''}`}
        aria-label={title(view)} data-view={view} hidden={!rect} style={rect && g ? {
          left: rect.x, top: rect.y + 33, width: rect.width, height: Math.max(0, rect.height - 33),
          zIndex: floating ? floatingLayer(g.id) : 1,
        } : undefined}
        onFocusCapture={e => {
          focus.current.set(view, e.target as HTMLElement);
          if (g) selectGroup(g);
        }}>{renderView(view)}</section>;
    })}
    {visible.map(g => {
      const rect = rects.result.get(g.id);
      if (!rect) return null;
      const floating = layout.floats.some(f => f.id === g.id);
      const hasDockPeer = groups(layout.tree).some(other => other.id !== g.id);
      const menuWidth = clamp(size.width - 4, 0, 200);
      const above = size.height - rect.y - 33 < 210 && rect.y > size.height - rect.y - 33;
      return <div className={`gc-r0-dock-header ${layout.activeGroup === g.id ? 'is-active' : ''} ${floating ? 'is-floating' : ''}`}
        key={g.id} data-group={g.id} style={{ left: rect.x, top: rect.y, width: rect.width, zIndex: floating ? floatingLayer(g.id) + 1 : menu === g.id ? 6 : 4 }}
        onPointerDown={e => { if (floating) floatDrag(e, g.id); }}>
        <div role="tablist" aria-label="工作面标签" className="gc-r0-dock-tabs">
          {g.tabs.map(view => <div key={view} role="tab" tabIndex={g.active === view ? 0 : -1}
            data-tab-view={view} aria-selected={g.active === view} aria-label={title(view)}
            className={`gc-r0-dock-tab ${g.active === view ? 'is-active' : ''}`}
            onPointerDown={e => pointerDrag(e, view)}
            onKeyDown={e => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate(view, true);
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                const delta = e.key === 'ArrowRight' ? 1 : -1;
                const index = e.key === 'Home' ? 0 : e.key === 'End' ? g.tabs.length - 1 : (g.tabs.indexOf(view) + delta + g.tabs.length) % g.tabs.length;
                activate(g.tabs[index]!, true);
              }
            }} title="拖动标签停靠；按住 Alt 拖动可浮动">
            {layout.pinned.includes(view) && <Pin size={11}/>}
            <span>{title(view)}</span>
            {!layout.pinned.includes(view) && <button aria-label={`关闭 ${title(view)}`} onClick={() => close(view)}><X size={12}/></button>}
          </div>)}
        </div>
        <button title={maximized ? '还原工作面' : '局部最大化'} aria-label={maximized ? '还原工作面' : '局部最大化'} onClick={() => {
          selectGroup(g);
          setMenu(null);
          setMaximized(maximized ? null : g.id);
        }}>
          {maximized ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}
        </button>
        <button title="工作面布局" aria-label={`布局 ${title(g.active)}`} aria-expanded={menu === g.id}
          onClick={() => { if (floating) selectGroup(g); setMenu(menu === g.id ? null : g.id); }}>
          <Ellipsis size={16}/>
        </button>
        {menu === g.id && <div className="gc-r0-dock-menu" role="menu" style={{
          minWidth: menuWidth, right: Math.min(2, rect.x + rect.width - menuWidth),
          top: above ? 'auto' : '100%', bottom: above ? '100%' : 'auto', maxHeight: above ? rect.y : size.height - rect.y - 33,
        }} onKeyDown={e => { if (e.key === 'Escape') setMenu(null); }}>
          <button role="menuitem" onClick={() => {
            setLayout(old => ({ ...old, pinned: old.pinned.includes(g.active) ? old.pinned.filter(view => view !== g.active) : [...old.pinned, g.active] }));
            setMenu(null);
          }}>{layout.pinned.includes(g.active) ? '取消文档标签固定' : '固定文档标签'}</button>
          {(['left', 'right', 'top', 'bottom'] as const).map((place, i) => <button key={place} role="menuitem"
            disabled={!hasDockPeer && (floating || g.tabs.length === 1)} onClick={() => move(g.active, g.id, place)}>
            {['向左分屏', '向右分屏', '向上分屏', '向下分屏'][i]}
          </button>)}
          {floating && <button role="menuitem" onClick={() => move(g.active, '', 'right')}>停靠到工作区</button>}
          {(!floating || g.tabs.length > 1) && <button role="menuitem" onClick={() => move(g.active, g.id, 'float')}>在窗口内浮动</button>}
          {visibleGroups(layout).filter(other => other.id !== g.id).map(other => <button key={other.id} role="menuitem"
            onClick={() => move(g.active, other.id, 'center')}>移入「{title(other.active)}」标签组</button>)}
          <button role="menuitem" onClick={() => collapse(g.id)}>收起此标签组</button>
          <button role="menuitem" onClick={() => setMenu(null)}>关闭菜单</button>
        </div>}
        {floating && !maximized && <div role="separator" aria-label="调整浮动窗口大小" className="gc-r0-float-resize" style={{ top: rect.height - 17 }}
          onPointerDown={e => floatDrag(e, g.id, true)}/>}
      </div>;
    })}
    {!maximized && rects.handles.map(({ node, rect }) => {
      const horizontal = node.axis === 'x', span = horizontal ? rect.width : rect.height;
      const gap = Math.min(5, span), offset = Math.round((span - gap) * node.ratio);
      return <div key={node.id} className={`gc-r0-splitter ${horizontal ? 'horizontal' : 'vertical'}`}
        role="separator" aria-orientation={horizontal ? 'vertical' : 'horizontal'} aria-valuemin={12} aria-valuemax={88} aria-valuenow={Math.round(node.ratio * 100)}
        aria-label="调整工作面大小" tabIndex={0}
        style={{ left: rect.x + (horizontal ? offset : 0), top: rect.y + (horizontal ? 0 : offset), width: horizontal ? gap : rect.width, height: horizontal ? rect.height : gap }}
        onPointerDown={e => resize(e, node, rect)} onKeyDown={e => {
          const [previous, next] = horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
          if (e.key !== previous && e.key !== next) return;
          e.preventDefault();
          setRatio(node.id, node.ratio + (e.key === previous ? -.03 : .03));
        }}/>;
    })}
    {layout.collapsed.length > 0 && !maximized && <div className="gc-r0-collapsed">
      {layout.collapsed.map(g => <button key={g.id} onClick={() => activate(g.active)}><Columns2 size={13}/>{title(g.active)}</button>)}
    </div>}
    {dragging && target && (() => {
      const place = target.place;
      const rect = place === 'float' ? floatRect(target.point) : rects.result.get(target.id) ?? bounds;
      const halfX = place === 'left' || place === 'right', halfY = place === 'top' || place === 'bottom';
      return <div className="gc-r0-drop-target" style={{
        left: rect.x + (place === 'right' ? rect.width / 2 : 0), top: rect.y + (place === 'bottom' ? rect.height / 2 : 0),
        width: halfX ? rect.width / 2 : rect.width, height: halfY ? rect.height / 2 : rect.height, zIndex: 24 + floats.length * 2,
      }}>{place === 'float' ? '窗口内浮动' : place === 'center' ? layout.tree ? '合并为标签组' : '停靠到工作区' : '分屏停靠'}</div>;
    })()}
  </div>;
}
