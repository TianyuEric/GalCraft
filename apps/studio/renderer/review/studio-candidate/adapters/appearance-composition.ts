import type { Asset, DocumentView } from '@galcraft/contracts';
import type { Appearance } from '../../../studio-r0/model.js';
import { documentData } from '../application/documents.js';
import { appearanceAxisSelection, visibleAppearanceParts, type CandidateAppearance } from '../workfaces/psd-import-model.js';

export const appearancePath = 'candidate/appearances.json';
export const assetIndexPath = 'assets/index.json';
export const resourceLocationsPath = 'candidate/resources.json';

export type AppearanceResources = { assets: readonly Asset[]; locations: Readonly<Record<string, string>> };
export type CandidateCompositionLayer = {
  id: string;
  name?: string;
  image: string;
  assetId?: string;
  variantId?: string | null;
  sizedVariantId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CandidateSceneComposition = {
  width: number;
  height: number;
  selection: Record<string, string>;
  layers: CandidateCompositionLayer[];
};
export type CandidateSceneCast = Appearance & { composition?: CandidateSceneComposition };

const portraitCanvas = { width: 1024, height: 1536 };
const teachingArtwork = 'GalCraft 教学作品 · 春灯';

export function readAppearanceResources(documents: readonly DocumentView[]): AppearanceResources {
  return {
    assets: documentData<{ assets: Asset[] }>(documents, assetIndexPath)?.assets ?? [],
    locations: documentData<{ locations: Record<string, string> }>(documents, resourceLocationsPath)?.locations ?? {},
  };
}

export function appearanceAsset(assetId: string, pinned: string | null | undefined, { assets, locations }: AppearanceResources) {
  const asset = assets.find(item => item.id === assetId);
  const variant = asset?.variants.find(item => item.id === (pinned ?? asset.activeVariantId));
  const image = variant && (locations[`${assetId}/${variant.id}`]
    ?? (asset?.originalVariantId === variant.id ? locations[assetId] : undefined));
  return { asset, variant, image };
}

export function selectedAppearanceAxes(appearance: CandidateAppearance, overrides: Record<string, string> = {}) {
  const proposed = { ...appearance, compositionSelection: { ...appearance.compositionSelection, ...overrides } };
  return Object.fromEntries((appearance.compositionAxes ?? []).map(axis => [axis.id, appearanceAxisSelection(proposed, axis)]));
}

export function appearanceParts(appearance: CandidateAppearance) {
  return appearance.parts.filter(part => !appearance.psdSource || part.source !== teachingArtwork);
}

export function appearanceComposition(
  appearance: CandidateAppearance, selection: Record<string, string>, resources: AppearanceResources,
): CandidateSceneComposition {
  const parts = visibleAppearanceParts({ ...appearance, parts: appearanceParts(appearance), compositionSelection: selection });
  const frame = appearance.parts.find(part => part.compositionFrame)?.compositionFrame;
  const width = appearance.psdSource?.width ?? frame?.canvasWidth ?? portraitCanvas.width;
  const height = appearance.psdSource?.height ?? frame?.canvasHeight ?? portraitCanvas.height;
  const layers = parts.map(part => {
    const assetId = part.source.startsWith('asset:') ? part.source.slice(6) : undefined;
    const variant = assetId ? appearanceAsset(assetId, part.compositionVariantId, resources).variant : undefined;
    const width = part.compositionFrame?.width ?? variant?.metadata.width ?? portraitCanvas.width;
    const height = part.compositionFrame?.height ?? variant?.metadata.height ?? portraitCanvas.height;
    return {
      id: part.id, name: part.name, image: assetId ? '' : part.image, x: part.x, y: part.y, width, height,
      ...(assetId ? { assetId, variantId: part.compositionVariantId ?? null } : {}),
      ...(variant ? { sizedVariantId: part.compositionSizedVariantId ?? variant.id } : {}),
    };
  });
  return { width, height, selection, layers };
}

export function resolveCompositionLayer(layer: CandidateCompositionLayer, resources: AppearanceResources): CandidateCompositionLayer {
  if (!layer.assetId) return layer;
  const { asset, image, variant } = appearanceAsset(layer.assetId, layer.variantId, resources);
  const changed = variant && layer.sizedVariantId !== variant.id;
  const originalCanvas = changed && asset?.variants.find(item => item.id === layer.sizedVariantId)?.canvas;
  const activeCanvas = variant?.canvas;
  return {
    ...layer, image: image ?? '',
    x: originalCanvas && activeCanvas ? layer.x + activeCanvas.offsetX - originalCanvas.offsetX : layer.x,
    y: originalCanvas && activeCanvas ? layer.y + activeCanvas.offsetY - originalCanvas.offsetY : layer.y,
    width: (changed && variant.metadata.width) || layer.width,
    height: (changed && variant.metadata.height) || layer.height,
  };
}

export function createCandidateCompositionCompositor() {
  const cache = new Map<string, Promise<{ key: string; url: string; width: number; height: number }>>();
  return async (composition: CandidateSceneComposition, resources: AppearanceResources) => {
    if (!composition.layers.length) return null;
    const { width, height } = composition;
    const layers = composition.layers.map(layer => resolveCompositionLayer(layer, resources));
    const missing = layers.find(layer => !layer.image);
    if (missing) throw new Error(`组合图层 ${missing.name ?? missing.id} 的素材无法读取。`);
    const key = JSON.stringify([width, height, layers]);
    const cached = cache.get(key);
    if (cached) return cached;
    const pending = (async () => {
      const decoded = await Promise.all(layers.map(async layer => {
        const image = new Image();
        image.src = layer.image;
        try { await image.decode(); }
        catch { throw new Error(`组合图层 ${layer.name ?? layer.id} 的图像无法读取。`); }
        return image;
      }));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法建立组合预览画布。');
      for (const [index, layer] of layers.entries()) {
        context.drawImage(decoded[index]!, layer.x, layer.y, layer.width, layer.height);
      }
      return { key, url: canvas.toDataURL('image/png'), width, height };
    })();
    cache.set(key, pending);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
    try { return await pending; }
    catch (error) { cache.delete(key); throw error; }
  };
}
