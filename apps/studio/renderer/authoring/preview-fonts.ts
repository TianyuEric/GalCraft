import type { PlayerHost, Snapshot } from '@galcraft/contracts';
import { collectTemplateAssets } from '@galcraft/templates';

export const previewFontFamily = (assetId: string, variantId: string) => `GalCraftPreview_${assetId}_${variantId}`;
export function previewFontAssets(snapshot: Snapshot) {
  const referenced = new Set(collectTemplateAssets(snapshot.template));
  return snapshot.assets.filter(asset => asset.kind === 'font' && referenced.has(asset.assetId));
}

/** The Studio adapter registers exact work font bytes before the shared Player measures text. */
export async function preparePreviewFonts(root: HTMLElement, resources: PlayerHost['resources'], snapshot: Snapshot) {
  const loaded: FontFace[] = [], properties = new Map<string, string>();
  const release = () => {
    for (const face of loaded) document.fonts.delete(face);
    for (const [property, before] of properties) { if (before) root.style.setProperty(property, before); else root.style.removeProperty(property); }
  };
  try {
    for (const asset of previewFontAssets(snapshot)) {
      const resolved = await resources.resolve(asset.assetId, asset.variantId);
      if (!resolved.ok) throw new Error(resolved.error.message);
      try {
        const family = previewFontFamily(asset.assetId, asset.variantId);
        const face = await new FontFace(family, `url(${JSON.stringify(resolved.value.uri)})`).load();
        document.fonts.add(face); loaded.push(face);
        const property = `--gc-font-${asset.assetId}`; properties.set(property, root.style.getPropertyValue(property));
        root.style.setProperty(property, JSON.stringify(family));
      } finally { resolved.value.release(); }
    }
    return release;
  } catch (error) { release(); throw error; }
}
