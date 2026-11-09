/** Personal geometry and view identities. Workspaces own document content and drafts. */
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
export function validGroup(g: unknown): g is Group {
  if (!g || typeof g !== 'object') return false;
  const v = g as Group;
  return v.kind === 'group' && typeof v.id === 'string' && Array.isArray(v.tabs) && v.tabs.every(id => typeof id === 'string') && typeof v.active === 'string';
}
export function validTree(t: unknown): t is Tree | null {
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
