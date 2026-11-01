import type { Id, PlayerHost, Snapshot } from '@galcraft/contracts';
import { parseAnimationResource, type StageAssetLookup } from '@galcraft/stage';
import { fail } from './common.js';

export function animationResourceReader(snapshot: Snapshot, resources: PlayerHost['resources']): NonNullable<StageAssetLookup['animation']> {
  return async (assetId: Id, parameters) => {
    const asset = snapshot.assets.find(item => item.assetId === assetId);
    if (!asset || asset.kind !== 'animation') return fail('ANIMATION_RESOURCE', `Animation asset ${assetId} is unavailable in the locked snapshot`);
    const resolved = await resources.resolve(asset.assetId, asset.variantId);
    if (!resolved.ok) return resolved;
    try {
      const response = await fetch(resolved.value.uri);
      if (!response.ok) return fail('ANIMATION_RESOURCE_READ', `Animation ${assetId}/${asset.variantId}: HTTP ${response.status}`);
      const parsed = parseAnimationResource(await response.text(), parameters);
      if (!parsed.ok) return { ...parsed, error: { ...parsed.error, entity: { kind: 'asset', id: assetId } } };
      return parsed;
    } catch (error) { return fail('ANIMATION_RESOURCE_READ', `Animation ${assetId}/${asset.variantId}: ${String(error)}`); }
    finally { resolved.value.release(); }
  };
}
