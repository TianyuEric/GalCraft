/** Personal geometry only. Content, drafts and source bindings belong to CandidateSession. */
export type Zone = 'left' | 'right' | 'center' | 'bottom';
export type Group = { kind: 'group'; id: string; tabs: string[]; active: string };
export type Tree = Group | { kind: 'split'; id: string; axis: 'x' | 'y'; ratio: number; first: Tree; second: Tree };
export type Rect = { x: number; y: number; width: number; height: number };
export type Collapsed = Group & { zone: Zone; home?: unknown };
export type ZonedLayout = { version: 2; tree: Tree | null; left: Group; right: Group; bottom: Group;
  hidden: { left: boolean; right: boolean; bottom: boolean }; widths: { left: number; right: number }; bottomHeight: number;
  collapsed: Collapsed[]; kept: string[]; previews: string[]; activeGroup: string; stageSource?: string };
export const group = (id: string, tabs: string[]): Group => ({ kind: 'group', id, tabs, active: tabs[0] ?? '' });
export const groups = (tree: Tree | null): Group[] => !tree ? [] : tree.kind === 'group' ? [tree] : [...groups(tree.first), ...groups(tree.second)];
export const allGroups = (layout: ZonedLayout) => [...groups(layout.tree), layout.left, layout.right, layout.bottom, ...layout.collapsed];
export const openViews = (layout: ZonedLayout) => [...new Set(allGroups(layout).flatMap(g => g.tabs))];
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const sceneView = (id: string) => /^(writing|commands|source):(.+)$/.exec(id);
export function defaultZone(id: string): Zone {
  if (['outline', 'search', 'asset-directory', 'character-directory', 'page-directory', 'production-explorer'].includes(id)) return 'left';
  if (['inspector', 'asset-inspector', 'page-outline', 'page-inspector'].includes(id)) return 'right';
  if (['assets', 'problems', 'output', 'queue'].includes(id)) return 'bottom';
  return 'center';
}
/** Retired task facets resolve to the same task; explicit scene modes stay distinct. */
export function currentView(id: string) {
  if (id === 'production-inspector') return 'production';
  if (id === 'collaboration-inspector' || id === 'collaboration-explorer') return 'collaboration';
  if (id === 'plugin-package') return 'plugins';
  if (id === 'characters') return 'character-directory';
  if (id === 'pages') return 'page-directory';
  if (id === 'preferences') return 'overview';
  if (id.startsWith('command-stage:')) return 'stage';
  return id;
}
export function emptyLayout(): ZonedLayout {
  return { version: 2, tree: null, left: group('left', []), right: group('right', []), bottom: group('bottom', []),
    hidden: { left: false, right: false, bottom: true }, widths: { left: 320, right: 320 }, bottomHeight: 260,
    collapsed: [], kept: [], previews: [], activeGroup: 'document' };
}
export function change(tree: Tree, id: string, fn: (value: Tree) => Tree): Tree {
  if (tree.id === id) return fn(tree);
  return tree.kind === 'group' ? tree : { ...tree, first: change(tree.first, id, fn), second: change(tree.second, id, fn) };
}
export function removeGroup(tree: Tree | null, id: string): Tree | null {
  if (!tree || tree.id === id) return null;
  if (tree.kind === 'group') return tree;
  const first = removeGroup(tree.first, id), second = removeGroup(tree.second, id);
  return first && second ? { ...tree, first, second } : first ?? second;
}
export function normalize(layout: ZonedLayout): ZonedLayout {
  const seen = new Set<string>();
  for (const g of allGroups(layout)) {
    g.tabs = g.tabs.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
    if (!g.tabs.includes(g.active)) g.active = g.tabs[0] ?? '';
  }
  for (const g of groups(layout.tree)) if (!g.tabs.length) layout.tree = removeGroup(layout.tree, g.id);
  layout.collapsed = layout.collapsed.filter(g => g.tabs.length);
  if (!allGroups(layout).some(g => g.id === layout.activeGroup && g.tabs.length)) layout.activeGroup = groups(layout.tree)[0]?.id ?? 'left';
  layout.kept = layout.kept.filter(id => seen.has(id)); layout.previews = layout.previews.filter(id => seen.has(id) && !layout.kept.includes(id));
  return layout;
}
function validGroup(g: unknown): g is Group {
  if (!g || typeof g !== 'object') return false;
  const v = g as Group;
  return v.kind === 'group' && typeof v.id === 'string' && Array.isArray(v.tabs) && v.tabs.every(id => typeof id === 'string') && typeof v.active === 'string';
}
function validTree(t: unknown): t is Tree | null {
  if (t === null) return true;
  if (validGroup(t)) return true;
  if (!t || typeof t !== 'object') return false;
  const v = t as Exclude<Tree, Group>;
  return v.kind === 'split' && typeof v.id === 'string' && ['x', 'y'].includes(v.axis) && Number.isFinite(v.ratio) && v.ratio > 0 && v.ratio < 1 && !!v.first && !!v.second && validTree(v.first) && validTree(v.second);
}
export function validLayout(value: unknown): value is ZonedLayout {
  if (!value || typeof value !== 'object') return false;
  const v = value as ZonedLayout;
  return v.version === 2 && validTree(v.tree) && validGroup(v.left) && validGroup(v.right) && validGroup(v.bottom)
    && Array.isArray(v.collapsed) && v.collapsed.every(g => validGroup(g) && ['left', 'right', 'center', 'bottom'].includes(g.zone))
    && Array.isArray(v.kept) && v.kept.every(id => typeof id === 'string') && Array.isArray(v.previews) && v.previews.every(id => typeof id === 'string')
    && !!v.hidden && ['left', 'right', 'bottom'].every(z => typeof v.hidden[z as keyof typeof v.hidden] === 'boolean')
    && !!v.widths && v.widths.left >= 240 && v.widths.right >= 240 && Number.isFinite(v.widths.left) && Number.isFinite(v.widths.right)
    && Number.isFinite(v.bottomHeight) && v.bottomHeight >= 160 && typeof v.activeGroup === 'string';
}
export function migrateLegacy(value: unknown): ZonedLayout {
  if (!value || typeof value !== 'object') throw new Error('旧布局不是对象');
  const old = value as { tree: Tree | null; floats: Group[]; collapsed: (Group & { home?: unknown })[]; pinned: string[]; activeGroup: string };
  if (!validTree(old.tree) || !Array.isArray(old.floats) || !old.floats.every(validGroup) || !Array.isArray(old.collapsed) || !old.collapsed.every(validGroup) || !Array.isArray(old.pinned) || !old.pinned.every(id => typeof id === 'string')) throw new Error('旧布局结构损坏；原值仍可恢复');
  const next = emptyLayout(); next.hidden.bottom = false;
  const previousStage=[...groups(old.tree),...old.floats,...old.collapsed].flatMap(group=>group.tabs).find(id=>id.startsWith('command-stage:'));
  if(previousStage)next.stageSource=previousStage.slice(14);
  const transfer = (g: Group, collapsed = false, home?: unknown): Group | null => {
    const mapped = g.tabs.map(currentView), active = currentView(g.active);
    for (const zone of ['left', 'right', 'bottom'] as const) {
      const tabs = mapped.filter(id => defaultZone(id) === zone);
      if (!tabs.length) continue;
      if (collapsed) next.collapsed.push({ ...group(`${g.id}-${zone}`, tabs), active: tabs.includes(active) ? active : tabs[0]!, zone, home });
      else { next[zone].tabs.push(...tabs); if (tabs.includes(active)) next[zone].active = active; }
    }
    const tabs = mapped.filter(id => defaultZone(id) === 'center');
    if (!tabs.length) return null;
    const central = { ...group(g.id, tabs), active: tabs.includes(active) ? active : tabs[0]! };
    if (collapsed) { next.collapsed.push({ ...central, zone: 'center', home }); return null; }
    return central;
  };
  const visit = (t: Tree | null): Tree | null => {
    if (!t) return null;
    if (t.kind === 'group') return transfer(t);
    const first = visit(t.first), second = visit(t.second);
    return first && second ? { ...t, first, second } : first ?? second;
  };
  next.tree = visit(old.tree);
  for (const floating of old.floats) {
    const central = transfer(floating);
    if (central) next.tree = next.tree ? { kind: 'split', id: `migrated-${central.id}`, axis: 'x', ratio: .5, first: next.tree, second: central } : central;
  }
  for (const collapsed of old.collapsed) transfer(collapsed, true, collapsed.home);
  next.kept = old.pinned.map(currentView); next.activeGroup = old.activeGroup;
  for (const zone of ['left', 'right', 'bottom'] as const) next.hidden[zone] = !next[zone].tabs.length;
  return normalize(next);
}
export const layoutKeys = (storageKey: string) => ({ legacy: `galcraft-studio-candidate:${storageKey}:layout`, current: `galcraft-studio-candidate:${storageKey}:layout:v2`,
  legacyPresets: 'galcraft-studio-candidate:personal-layouts', presets: 'galcraft-studio-candidate:personal-layouts:v2' });
export function loadLayouts(storage: Pick<Storage, 'getItem' | 'setItem'>, storageKey: string): { layout?: ZonedLayout; error?: string } {
  const keys = layoutKeys(storageKey);
  try {
    // Both raw legacy values are preserved BEFORE parsing, migration, or registry lookup.
    for (const key of [keys.legacy, keys.legacyPresets]) {
      const raw = storage.getItem(key);
      if (raw !== null && storage.getItem(`${key}:legacy-backup`) === null) storage.setItem(`${key}:legacy-backup`, raw);
    }
    if (storage.getItem(keys.presets) === null && storage.getItem(keys.legacyPresets) !== null) {
      const old: unknown = JSON.parse(storage.getItem(keys.legacyPresets)!);
      if (!old || typeof old !== 'object' || Array.isArray(old)) throw new Error('旧命名布局无法读取');
      const migrated = Object.fromEntries(Object.entries(old).map(([name, value]) => [name, migrateLegacy(value)]));
      if (!Object.values(migrated).every(validLayout)) throw new Error('命名布局迁移校验失败');
      storage.setItem(keys.presets, JSON.stringify(migrated));
    }
    const current = storage.getItem(keys.current);
    if (current !== null) { const value: unknown = JSON.parse(current); if (!validLayout(value)) throw new Error('分区布局校验失败'); return { layout: value }; }
    const raw = storage.getItem(keys.legacy);
    if (raw === null) return {};
    const layout = migrateLegacy(JSON.parse(raw));
    if (!validLayout(layout)) throw new Error('布局迁移校验失败');
    storage.setItem(keys.current, JSON.stringify(layout));
    return { layout };
  } catch (error) {
    const message = `布局恢复未完成：${error instanceof Error ? error.message : String(error)}。旧值保留，可重试恢复。`;
    // A failed legacy preset migration must not hide a valid, independently saved v2 layout.
    try {
      const raw = storage.getItem(keys.current);
      const current: unknown = raw === null ? null : JSON.parse(raw);
      if (validLayout(current)) return { layout: current, error: message };
    } catch { /* Preserve every stored value and expose the original failure. */ }
    return { error: message };
  }
}
export function minimum(tree: Tree, axis: 'x' | 'y', minSize: (id: string) => { width: number; height: number }): number {
  if (tree.kind === 'group') return Math.max(axis === 'x' ? 480 : 240, ...tree.tabs.map(id => minSize(id)[axis === 'x' ? 'width' : 'height']));
  const a = minimum(tree.first, axis, minSize), b = minimum(tree.second, axis, minSize);
  return tree.axis === axis ? a + b + 5 : Math.max(a, b);
}
export function geometry(tree: Tree | null, rect: Rect, minSize: (id: string) => { width: number; height: number }, result = new Map<string, Rect>(), handles: { node: Exclude<Tree, Group>; rect: Rect }[] = []) {
  if (!tree) return { result, handles };
  if (tree.kind === 'group') result.set(tree.id, rect);
  else {
    const total = (tree.axis === 'x' ? rect.width : rect.height) - 5;
    const first = clamp(total * tree.ratio, minimum(tree.first, tree.axis, minSize), total - minimum(tree.second, tree.axis, minSize));
    const a = { ...rect, ...(tree.axis === 'x' ? { width: first } : { height: first }) };
    const b = { ...rect, ...(tree.axis === 'x' ? { x: rect.x + first + 5, width: total - first } : { y: rect.y + first + 5, height: total - first }) };
    handles.push({ node: { ...tree, ratio: first / total }, rect }); geometry(tree.first, a, minSize, result, handles); geometry(tree.second, b, minSize, result, handles);
  }
  return { result, handles };
}
