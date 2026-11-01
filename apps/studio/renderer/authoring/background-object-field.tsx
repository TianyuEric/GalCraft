import { editorText as translate } from '../components/editor-fields/editor-text.js';
import { useEffect, useState } from 'react';
import type { Asset, AssetPickerPage } from '@galcraft/contracts';
import { ProjectObjectPicker, objectKey, type ProjectObject } from '../components/editor-fields/ProjectObjectPicker.js';
import { Button } from '../components/controls.js';
import type { AuthoringServices } from './controller.js';
import { openAssetPicker, recordAssetsPicked } from './asset-picker.js';
import { loadVisibleAssetThumbnails } from './asset-picker-thumbnails.js';

export function BackgroundObjectField({ services, projectId, sceneId, asset: initialAsset, currentAssetId, variantId, locale, disabled, commit }: {
  services: AuthoringServices; projectId: string; sceneId: string; currentAssetId: string | null; asset: Asset | null; variantId: string | null; locale: string; disabled: boolean;
  commit(asset: Asset, variantId: string | null): Promise<void>;
}) {
  const t = (text: string) => translate(text, locale);
  const [asset, setAsset] = useState(initialAsset);
  useEffect(() => { let current = true; setAsset(initialAsset); if (!initialAsset && currentAssetId) void services.getAsset?.(currentAssetId).then(result => { if (current && result.ok) setAsset(result.value); }); return () => { current = false; }; }, [currentAssetId, initialAsset]);
  const [query, setQuery] = useState(''), [retry, setRetry] = useState(0), [page, setPage] = useState<AssetPickerPage | null>(null);
  const [status, setStatus] = useState<'ready'|'loading'|'error'>('loading'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => { void (async () => {
      setStatus('loading');
      try {
        if (!services.queryAssetPicker) throw new Error(t("素材选择服务不可用"));
        const result = await services.queryAssetPicker({ context: { projectId, allowedKinds: ['image', 'video'], characterId: null, sceneId, locale: null, currentAssetId: currentAssetId, currentVariantId: variantId, tab: 'all' },
          query: { kind: null, allowedKinds: ['image', 'video'], folder: null, characterId: null, sceneId: null, locale: null, search: query, tags: [], reference: 'any', review: 'any', sort: 'name', direction: 'asc', offset: 0, limit: 100, indexRevision: null } });
        if (!current) return;
        if (!result.ok) throw new Error(result.error.message);
        setPage(result.value); setStatus('ready'); setError('');
      } catch (reason) { if (current) { setStatus('error'); setError(String(reason instanceof Error ? reason.message : reason)); } }
    })(); }, 120);
    return () => { current = false; clearTimeout(timer); };
  }, [query, retry, projectId, sceneId, asset?.id, variantId]);
  const project = (item: Asset, exact = item.activeVariantId): ProjectObject => ({ id: item.id, variantId: exact, revision: item.revision, name: item.name, path: item.folder.join('/') || item.sourceName, type: item.kind, thumbnail: null, ownedThumbnail: item.kind === 'image',
    unavailable: item.variants.some(v => v.id === exact) ? undefined : t("精确版本不可用") });
  const selected = asset ? project(asset, variantId ?? asset.activeVariantId) : null;
  const items = (page?.items ?? []).map(item => project(item));
  if (selected && !items.some(item => objectKey(item) === objectKey(selected))) items.unshift(selected);
  const apply = async (next: Asset, exact: string | null) => {
    setBusy(true); setError('');
    try { await commit(next, exact); await recordAssetsPicked(services, projectId, [next.id]); }
    catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); throw reason; }
    finally { setBusy(false); }
  };
  return <div className="background-object-field">
    <ProjectObjectPicker locale={locale} value={selected ? objectKey(selected) : ''} current={selected} items={items} status={status} disabled={disabled || busy} onSearch={setQuery}
      refreshThumbnails={() => { void loadVisibleAssetThumbnails(services); }} retry={() => setRetry(value => value + 1)}
      onChange={key => { const next = items.find(item => objectKey(item) === key), source = page?.items.find(item => item.id === next?.id) ?? asset; if (next && source) void apply(source, next.variantId).catch(() => {}); }}/>
    {currentAssetId && !asset && <p className="candidate-hint">{t('当前素材引用尚未载入')} · {currentAssetId}</p>}
    {error && <p role="alert" className="candidate-error">{error}</p>}
    {page && page.total > 100 && <p className="candidate-hint">{t("显示前100项，请搜索缩小范围或打开完整素材库。")}</p>}
    <Button tone="quiet" disabled={disabled || busy} onClick={() => { void openAssetPicker({ services, projectId, sceneId, allowedKinds: ['image', 'video'], currentAssetId: currentAssetId, currentVariantId: variantId, locale, mode: 'full', remember: false,
      onApply: async choice => { try { await apply(choice.asset, choice.variantId); return { ok: true, value: undefined, warnings: [] }; } catch (reason) { const issue = { code: 'BACKGROUND_APPLY', message: String(reason), severity: 'error' as const, owner: 'M01' as const, related: [], actions: [] }; return { ok: false, error: issue, issues: [issue] }; } } }); }}>{t("浏览与导入素材")}</Button>
  </div>;
}
