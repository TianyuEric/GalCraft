import { emptyLayout, group, groups, normalize, validGroup, validLayout, validTree, type Group, type Zone, type Tree, type ZonedLayout } from '../../../components/workbench/zoned-layout.js';

export { emptyLayout, groups, minimum, openViews } from '../../../components/workbench/zoned-layout.js';
export type { Zone } from '../../../components/workbench/zoned-layout.js';

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
