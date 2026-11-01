import type { AssetPreviewInput, AssetUiHost } from '../pages/Plugins/asset-ui-host.js';

/** Used by indexed assets and unadopted candidates; this helper never edits a project. */
export async function mountAssetTypePreview(root: HTMLElement, host: AssetUiHost | undefined, input: AssetPreviewInput,
  signal: AbortSignal, thumbnail = false): Promise<(() => void) | null> {
  if (signal.aborted) return null;
  return host?.mountPreview(root, input, signal, thumbnail) ?? null;
}

export function previewResource(uri: string, variant: AssetPreviewInput['variant'], signal: AbortSignal): AssetPreviewInput['resource'] {
  const suffix = variant.entry.split('/').map(encodeURIComponent).join('/'), base = uri.slice(0, -suffix.length);
  return { root: base, entry: variant.entry, files: structuredClone(variant.files), read: async path => {
    if (!variant.files.some(file => file.path === path)) throw new Error(`Undeclared asset file: ${path}`);
    const response = await fetch(base + path.split('/').map(encodeURIComponent).join('/'), { signal });
    if (!response.ok) throw new Error(`Asset file unavailable: ${path}`); return new Uint8Array(await response.arrayBuffer());
  } };
}
