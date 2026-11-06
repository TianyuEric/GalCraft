import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Asset, Id, Result } from '@galcraft/contracts';
import type { AssetPickerOptions } from '../../../authoring/asset-picker.js';
import { openCandidateAssetPicker } from '../components/CandidateAssetPicker.js';
import type { AuthoringServices, AuthoringSource } from '../../../authoring/controller.js';
import { useCandidate } from '../application/context.js';

export type CandidateWorkfaceProps = { onNavigate?(viewId: string): void };
export const resultValue = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};
export const workfaceError = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

export function useFormalSource() {
  const store = useCandidate();
  const snapshot = useSyncExternalStore(store.host.subscribe, store.host.getSnapshot, store.host.getSnapshot);
  const [source, setSource] = useState<AuthoringSource | null>(store.controller.source);
  const [error, setError] = useState('');
  const versions = snapshot.documents.map(document => `${document.documentId}/${document.revision}/${document.savedRevision}`).join('|');
  useEffect(() => {
    let active = true;
    void store.services.read().then(result => {
      if (active) { setSource(resultValue(result)); setError(''); }
    }).catch(reason => { if (active) setError(workfaceError(reason)); });
    return () => { active = false; };
  }, [store, versions]);
  return { store, source, error, versions };
}

export function useWorkfaceAssets(services: AuthoringServices, revision: number | null | undefined) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const read = async () => {
      const items: Asset[] = [];
      let offset = 0;
      let pageRevision: number | undefined;
      do {
        const page = resultValue(await services.queryAssets({ kind: null, text: '', offset, limit: 100, ...(pageRevision===undefined?{}:{indexRevision:pageRevision}) }));
        if (!active) return;
        pageRevision = page.indexRevision;
        items.push(...page.items); offset += page.items.length;
        if (!page.items.length || offset >= page.total) break;
      } while (active);
      if (active) { setAssets(items); setError(''); }
    };
    void read().catch(reason => { if (active) setError(workfaceError(reason)); });
    return () => { active = false; };
  }, [services, revision]);
  return { assets, error };
}

export async function pickWorkfaceAsset(services: AuthoringServices, scope: HTMLElement | null, options: Pick<AssetPickerOptions,
  'projectId' | 'allowedKinds' | 'locale' | 'currentAssetId' | 'characterId' | 'purpose' | 'sceneId' | 'currentName' | 'returnFocus'>): Promise<Id | undefined> {
  const selected = await openCandidateAssetPicker({ ...options, services, scope: scope ?? undefined, mode: 'compact', remember: false, chooseVersion: false,
    onApply: async () => ({ ok: true, value: undefined, warnings: [] }) });
  return selected?.assetId;
}
