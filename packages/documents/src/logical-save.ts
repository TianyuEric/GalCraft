import type { DocumentView, Id, Patch, SaveObject, SaveObjectRef } from '@galcraft/contracts';

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const clone = <T>(value: T): T => structuredClone(value);
type AssetEntry = { id: Id; name?: string; variants?: { id: Id }[] };
const indexPath = 'assets/index.json';
export const saveObjectKey = (object: Pick<SaveObjectRef, 'documentId' | 'kind' | 'objectId'>) =>
  `${object.documentId}:${object.kind}${object.objectId ? `:${object.objectId}` : ''}`;
const index = (files: Record<string, string>): { data: { assets: AssetEntry[] }; revision: number } | null => {
  if (!files[indexPath]) return null;
  const value = JSON.parse(files[indexPath]);
  return Array.isArray(value?.data?.assets) ? value : null;
};

/** Stable author objects, independent of the physical file that contains them. */
export function dirtySaveObjects(documents: ReadonlyMap<Id, DocumentView>): SaveObject[] {
  const objects: SaveObject[] = [];
  for (const document of documents.values()) {
    if (!document.dirty) continue;
    const paths = [...new Set([...Object.keys(document.savedFiles), ...Object.keys(document.files)])];
    const before = index(document.savedFiles), after = index(document.files);
    if (after && (before || after.data.assets.length)) {
      const old = new Map((before?.data.assets ?? []).map(asset => [asset.id, asset]));
      const current = new Map((after?.data.assets ?? []).map(asset => [asset.id, asset]));
      for (const id of new Set([...old.keys(), ...current.keys()])) {
        if (same(old.get(id), current.get(id))) continue;
        const identity = { documentId: document.documentId, kind: 'asset' as const, objectId: id };
        objects.push({ ...identity, key: saveObjectKey(identity), revision: document.revision,
          name: current.get(id)?.name ?? old.get(id)?.name ?? id, paths });
      }
      continue;
    }
    let name = paths[0] ?? document.documentId;
    for (const [path, raw] of Object.entries({ ...document.savedFiles, ...document.files })) {
      if (!path.endsWith('.json')) continue;
      try { name = JSON.parse(raw).data?.name ?? name; } catch { /* Preserve authored raw content. */ }
    }
    const identity = { documentId: document.documentId, kind: 'document' as const, objectId: null };
    objects.push({ ...identity, key: saveObjectKey(identity), revision: document.revision, name, paths });
  }
  return objects;
}

/** Apply only selected net changes to the last saved snapshot. */
export function savedProjection(documents: ReadonlyMap<Id, DocumentView>, objects: readonly SaveObject[]): Map<Id, DocumentView> {
  const projected = new Map([...documents].map(([id, document]) => [id, { ...clone(document),
    files: clone(document.savedFiles), revision: document.savedRevision, dirty: false }]));
  for (const object of objects) {
    const working = documents.get(object.documentId)!, target = projected.get(object.documentId)!;
    target.revision = working.revision;
    if (object.kind === 'document') { target.files = clone(working.files); continue; }
    const current = index(working.files), saved = index(target.files);
    const envelope = clone(saved ?? current)!;
    if (!saved) envelope.data.assets = [];
    const replacement = current?.data.assets.find(asset => asset.id === object.objectId);
    const position = envelope.data.assets.findIndex(asset => asset.id === object.objectId);
    if (position >= 0) {
      if (replacement) envelope.data.assets[position] = clone(replacement);
      else envelope.data.assets.splice(position, 1);
    } else if (replacement) envelope.data.assets.push(clone(replacement));
    envelope.revision = working.revision;
    target.files[indexPath] = JSON.stringify(envelope, null, 2) + '\n';
  }
  return projected;
}

/** A whole index-array patch associates only the entries it actually changed. */
export function patchSaveObjects(patches: readonly Patch[], objects: readonly SaveObject[], documents?: ReadonlyMap<Id, DocumentView>): string[] {
  const keys = new Set<string>();
  for (const patch of patches) {
    const candidates = objects.filter(object => object.documentId === patch.documentId);
    for (const object of candidates) {
      if (object.kind === 'document') { keys.add(object.key); continue; }
      if (patch.kind === 'document') {
        const afterFiles = patch.after && typeof patch.after === 'object' && !Array.isArray(patch.after) ? patch.after.files as Record<string, string> : {};
        const after = index(afterFiles ?? {})?.data.assets.find(asset => asset.id === object.objectId);
        const saved = documents && index(documents.get(object.documentId)!.savedFiles)?.data.assets.find(asset => asset.id === object.objectId);
        if (!documents || !same(after, saved)) keys.add(object.key);
        continue;
      }
      if (patch.kind !== 'json') { keys.add(object.key); continue; }
      for (const change of patch.changes) {
        if (change.path === '/data/assets' && Array.isArray(change.before) && Array.isArray(change.after)) {
          const find = (entries: unknown[]) => entries.find(entry => !!entry && typeof entry === 'object' && (entry as AssetEntry).id === object.objectId);
          if (!same(find(change.before), find(change.after)) && (!documents || !same(find(change.after), index(documents.get(object.documentId)!.savedFiles)?.data.assets.find(asset => asset.id === object.objectId)))) keys.add(object.key);
        } else if (change.path.startsWith('/data/assets/')) keys.add(object.key);
      }
    }
  }
  return [...keys];
}

export function sourceSaveObject(documentId: Id, path: string, documents: ReadonlyMap<Id, DocumentView>, objects: readonly SaveObject[]): SaveObject | undefined {
  const candidates = objects.filter(object => object.documentId === documentId);
  if (candidates[0]?.kind !== 'asset') return candidates[0];
  const match = /^\/data\/assets\/(\d+)(?:\/|$)/.exec(path);
  const assetId = match ? index(documents.get(documentId)!.files)?.data.assets[Number(match[1])]?.id : null;
  return candidates.find(object => object.objectId === assetId);
}
