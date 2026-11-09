import { DockWorkspace, type DockWorkspaceProps, type LayoutPreset } from '../../../components/workbench/DockWorkspace.js';
import { emptyLayout, group, openViews, type ZonedLayout } from '../../../components/workbench/zoned-layout.js';
import { currentView, defaultZone, layoutKeys, loadLayouts, sceneView } from '../application/zoned-layout.js';

export type { DockHandle, LayoutPreset, OpenOptions } from '../../../components/workbench/DockWorkspace.js';

export type CandidateDockWorkspaceProps = Omit<DockWorkspaceProps, 'createDefaultLayout' | 'loadLayout' | 'saveLayout' | 'readPresets' | 'writePresets' | 'mapPresetView' | 'resolveViewId' | 'replaceView'> & {
  sceneId: string;
  sceneIds: readonly string[];
  storageKey: string;
  role?(id: string): string;
};

export function CandidateDockWorkspace({ sceneId, sceneIds, storageKey, role: _role, ...props }: CandidateDockWorkspaceProps) {
  const keys = layoutKeys(storageKey);
  const registered = new Set(props.viewIds);
  function defaults(name: LayoutPreset): ZonedLayout {
    const next = emptyLayout();
    next.tree = group('document', [name === 'stage' ? 'stage' : `writing:${sceneId}`].filter(id => registered.has(id)));
    next.left = group('left', ['outline'].filter(id => registered.has(id)));
    next.right = group('right', ['inspector'].filter(id => registered.has(id)));
    next.bottom = group('bottom', ['assets', 'problems', 'output'].filter(id => registered.has(id)));
    if (name === 'source') {
      next.tree = { kind: 'split', id: crypto.randomUUID(), axis: 'y', ratio: .5, first: next.tree, second: group(crypto.randomUUID(), [`source:${sceneId}`]) };
    }
    if (name === 'documents') {
      const other = sceneIds.find(id => id !== sceneId);
      if (other) next.tree = { kind: 'split', id: crypto.randomUUID(), axis: 'x', ratio: .5, first: next.tree, second: group(crypto.randomUUID(), [`writing:${other}`]) };
      next.hidden.left = next.hidden.right = true;
    }
    if (name === 'writing') next.hidden.right = true;
    next.kept = openViews(next);
    return next;
  }
  function mapPresetView(id: string, restore: boolean) {
    const match = /^(writing|source|commands|command-stage):(.+)$/.exec(id);
    if (!match) return id;
    const slot = match[2]!;
    const slots = [sceneId, ...sceneIds.filter(id => id !== sceneId)];
    const mapped = restore
      ? slot === '$current' ? sceneId : slots[Number(/^\$scene-(\d+)$/.exec(slot)?.[1]) - 1] ?? slot
      : slot === sceneId ? '$current' : slots.includes(slot) ? `$scene-${slots.indexOf(slot) + 1}` : slot;
    return `${match[1]}:${mapped}`;
  }
  return <DockWorkspace {...props} testId="candidate-dock" retainFocus={target => !target.closest('[aria-label="场景编辑模式"]')} zone={props.zone ?? defaultZone}
    createDefaultLayout={defaults} resolveViewId={currentView} mapPresetView={mapPresetView}
    replaceView={(existing, incoming) => {
      const scene = sceneView(incoming)?.[2];
      return Boolean(scene && sceneView(existing)?.[2] === scene);
    }}
    loadLayout={() => loadLayouts(localStorage, storageKey)}
    saveLayout={layout => localStorage.setItem(keys.current, JSON.stringify(layout))}
    readPresets={() => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(keys.presets) ?? '{}');
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, ZonedLayout> : {};
      } catch { return {}; }
    }}
    writePresets={presets => localStorage.setItem(keys.presets, JSON.stringify(presets))}/>;
}
