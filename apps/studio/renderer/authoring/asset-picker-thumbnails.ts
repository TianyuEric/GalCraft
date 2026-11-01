import type { Result } from '@galcraft/contracts';
import type { AuthoringServices } from './controller.js';
import { mountAssetTypePreview, previewResource } from './asset-type-preview.js';

const pending = new WeakMap<AuthoringServices, Promise<Result<void>>>();
const pluginThumbnails = new WeakMap<AuthoringServices, Map<HTMLElement, { abort: AbortController; release(): void }>>();

async function loadPluginThumbnails(services: AuthoringServices) {
  let active = pluginThumbnails.get(services);
  if (!active) {
    active = new Map(); pluginThumbnails.set(services, active);
    const observer = new MutationObserver(() => { for (const [root, entry] of active!) if (!root.isConnected) { entry.release(); active!.delete(root); } });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  const roots = [...document.querySelectorAll<HTMLElement>('[data-asset-thumbnail][data-variant-id]')].filter(root => root.isConnected);
  await Promise.all(roots.map(async root => {
    if (active!.has(root)) return;
    const abort = new AbortController(); let cleanup: (() => void) | null = null, lease: string | null = null;
    const entry = { abort, release: () => { abort.abort(); cleanup?.(); if (lease) { void services.runtimeAssets?.releaseRuntime(lease); lease = null; } } };
    active!.set(root, entry);
    try {
      const found = await services.getAsset?.(root.dataset.assetThumbnail!); if (!found?.ok || !found.value || abort.signal.aborted) return;
      const asset = found.value, variant = asset.variants.find(item => item.id === root.dataset.variantId); if (!variant) return;
      const resolved = await services.runtimeAssets?.resolveRuntime(asset.id, variant.id); if (!resolved?.ok) return;
      if (abort.signal.aborted) { void services.runtimeAssets?.releaseRuntime(resolved.value.leaseId); return; } lease = resolved.value.leaseId;
      root.replaceChildren(); cleanup = await mountAssetTypePreview(root, services.assetUi, { source: { kind: 'asset', assetId: asset.id },
        kind: asset.kind, name: asset.name, variant, resource: previewResource(resolved.value.uri, variant, abort.signal) }, abort.signal, true);
      if (abort.signal.aborted) cleanup?.();
    } catch (error) { if (!abort.signal.aborted) { root.textContent = '◇'; root.title = String(error); } }
  }));
}

/** A desktop thumbnail batch replaces its leases, so visible consumers share the batch. */
export function loadVisibleAssetThumbnails(services: AuthoringServices): Promise<Result<void>> {
  const previous = pending.get(services);
  const run = async (): Promise<Result<void>> => {
    await loadPluginThumbnails(services);
    if (!services.thumbnails) return { ok: true, value: undefined, warnings: [] };
    const images = [...document.querySelectorAll<HTMLImageElement>(
      '.authoring-shell img[data-asset-id][data-variant-id], .asset-picker img[data-asset-id][data-variant-id], #studio-portals img[data-asset-id][data-variant-id]')]
      .filter(image => image.isConnected && image.getClientRects().length > 0);
    const requests = [...new Map(images.map(image => [`${image.dataset.assetId}/${image.dataset.variantId}`,
      { assetId: image.dataset.assetId!, variantId: image.dataset.variantId! }])).values()];
    const resolved = await services.thumbnails(requests);
    if (!resolved.ok) return resolved;
    for (const image of images) {
      if (!image.isConnected) continue;
      const value = resolved.value.find(item => item.assetId === image.dataset.assetId && item.variantId === image.dataset.variantId);
      const unavailable = () => { image.hidden = true; if (!image.parentElement?.querySelector('[data-thumbnail-missing]')) { const label = document.createElement('span'); label.dataset.thumbnailMissing = ''; const locale = image.closest('[lang]')?.getAttribute('lang') ?? document.documentElement.lang; label.textContent = locale === 'en' ? 'Version file unavailable' : locale === 'ja' ? 'バージョンのファイルがありません' : '版本文件不可用'; image.after(label); } };
      image.onerror = unavailable;
      image.onload = () => { image.hidden = false; image.parentElement?.querySelector('[data-thumbnail-missing]')?.remove(); };
      if (value) image.src = value.uri; else unavailable();
    }
    return { ok: true, value: undefined, warnings: resolved.warnings };
  };
  const result = previous ? previous.then(run, run) : run();
  pending.set(services, result);
  void result.finally(() => { if (pending.get(services) === result) pending.delete(services); }).catch(() => undefined);
  return result;
}
