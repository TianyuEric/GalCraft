import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import type { Asset, Id } from '@galcraft/contracts';
import type { AssetQuery } from '../../../authoring/controller.js';
import { watchCommandVisibility } from '../adapters/command-preview.js';
import { candidateAssets } from '../application/services.js';
import type { CandidateSession } from '../application/session.js';

export type AssetSelection = { activeId: Id | null; selectedIds: Id[]; rangeAnchor: Id | null };
export const emptyAssetSelection: AssetSelection = { activeId: null, selectedIds: [], rangeAnchor: null };
export const initialAssetQuery: AssetQuery = { kind: null, text: '', offset: 0, limit: 24, sort: 'name', direction: 'asc' };

export function replaceAssetSelection(ids: readonly Id[]): AssetSelection {
  const activeId = ids[0] ?? null;
  return { activeId, selectedIds: [...new Set(ids)], rangeAnchor: activeId };
}

export function selectAssetRow(selection: AssetSelection, id: Id, order: readonly Id[],
  { toggle = false, range = false, focusOnly = false } = {}): AssetSelection {
  if (focusOnly) return { ...selection, activeId: id };
  if (range) {
    const from = selection.rangeAnchor === null ? -1 : order.indexOf(selection.rangeAnchor);
    const to = order.indexOf(id);
    const anchor = from >= 0 && to >= 0 ? from : to;
    const included = to < 0 ? [id] : order.slice(Math.min(anchor, to), Math.max(anchor, to) + 1);
    return { activeId: id, selectedIds: [...new Set([...selection.selectedIds, ...included])], rangeAnchor: order[anchor] ?? id };
  }
  if (toggle) {
    const ids = selection.selectedIds;
    return { activeId: id, selectedIds: ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id], rangeAnchor: id };
  }
  return replaceAssetSelection([id]);
}

export type AssetReview = { kind: 'selection' | 'imported' | 'rename' | 'remove'; ids: Id[]; visibleIds: Id[] };

type AssetWorkspace = {
  selection: AssetSelection;
  query: AssetQuery;
  folderText: string;
  pinnedIds: Id[] | null;
  pinnedTitle: string | null;
  requestedVariants: Readonly<Record<Id, Id>>;
  locateId: Id | null;
  scrollTop: number;
  maximizedScrollTop: number | null;
  assetModes: Readonly<Record<Id, 'preview' | 'edit' | 'process'>>;
  referenceReturn: { view: string; name: string } | null;
  renameRequest: { assetId: Id } | null;
};

function createAssetWorkspace() {
  let state: AssetWorkspace = {
    selection: emptyAssetSelection, query: initialAssetQuery, folderText: '', pinnedIds: null, pinnedTitle: null,
    requestedVariants: {}, locateId: null, renameRequest: null, scrollTop: 0, maximizedScrollTop: null, assetModes: {}, referenceReturn: null,
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update: (changes: Partial<AssetWorkspace>) => {
      state = { ...state, ...changes };
      listeners.forEach(listener => listener());
    },
  };
}

const workspaces = new WeakMap<CandidateSession, ReturnType<typeof createAssetWorkspace>>();

export function useAssetWorkspace(session: CandidateSession) {
  let workspace = workspaces.get(session);
  if (!workspace) {
    workspace = createAssetWorkspace();
    workspaces.set(session, workspace);
  }
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  return [state, workspace.update, workspace.getSnapshot] as const;
}

const assetIndex = (session: CandidateSession) => session.host.getSnapshot().documents.find(document => 'assets/index.json' in document.files);
const indexes = new WeakMap<CandidateSession, { content: string; value: ReturnType<typeof readAssetIndex> }>();
const emptyIndex = readAssetIndex();

function readAssetIndex(document?: NonNullable<ReturnType<typeof assetIndex>>) {
  const assets = document ? candidateAssets([document]) : [];
  return { revision: document?.revision, documentId: document?.documentId, byId: new Map(assets.map(asset => [asset.id, asset])) };
}

export function useCandidateAssetIndex(session: CandidateSession) {
  return useSyncExternalStore(session.host.subscribe, () => {
    const document = assetIndex(session);
    if (!document) return emptyIndex;
    const content = document.files['assets/index.json']!;
    const previous = indexes.get(session);
    if (previous?.content === content && previous.value.revision === document.revision && previous.value.documentId === document.documentId) return previous.value;
    const value = readAssetIndex(document);
    indexes.set(session, { content, value });
    return value;
  });
}

export function useAssetDockVisible(root: RefObject<HTMLElement | null>, projectActive = true) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (root.current) return watchCommandVisibility(root.current, setVisible);
  }, [root]);
  return projectActive && visible;
}



export const candidateAssetDragType = 'application/x-galcraft-candidate-asset';
type AssetDrag = { projectId: Id; assetId: Id };
export function writeCandidateAssetDrag(data: DataTransfer, projectId: Id, asset: Asset) {
  data.effectAllowed = 'copy';
  data.setData(candidateAssetDragType, JSON.stringify({ projectId, assetId: asset.id }));
}
export function readCandidateAssetDrag(data: DataTransfer): AssetDrag | null {
  try {
    const value = JSON.parse(data.getData(candidateAssetDragType));
    return typeof value?.projectId === 'string' && typeof value?.assetId === 'string' ? value : null;
  } catch { return null; }
}

/** Only authorable asset/command combinations receive a drop target. */
export function droppedAssetCommand(kind: Asset['kind']) {
  return ({ image: 'changeBg', audio: 'bgm', animation: 'setComplexAnimation' } as const)[kind as 'image' | 'audio' | 'animation'];
}
