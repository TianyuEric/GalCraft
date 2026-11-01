import type { AuthoringServices } from './controller.js';
import type { AnimationPreviewResource } from './professional/AnimationPreview.js';
/** Selection acquires only a runtime lease. It never edits an asset or GCA dependency. */
export async function chooseAnimationPreviewTarget(services: AuthoringServices, locale: string): Promise<AnimationPreviewResource | null> {
  const source = await services.read(); if (!source.ok) throw new Error(source.error.message);
  const { openAssetPicker } = await import('./asset-picker.js');
  const choice = await openAssetPicker({ services, projectId: source.value.project.projectId, allowedKinds: ['image'], locale, remember: false,
    purpose: locale === 'en' ? 'Temporary animation preview target' : locale === 'ja' ? '一時的なアニメーション対象' : '临时动画预览目标',
    onApply: async () => ({ ok: true, value: undefined, warnings: [] }) });
  if (!choice) return null;
  const version = choice.variantId ?? choice.asset.activeVariantId;
  const lease = await services.runtimeAssets?.resolveRuntime(choice.assetId, version);
  if (!lease?.ok) throw new Error(lease && !lease.ok ? lease.error.message : 'Animation preview resource service unavailable');
  return { asset: { ...choice.asset, activeVariantId: version }, uri: lease.value.uri, release: () => { void services.runtimeAssets?.releaseRuntime(lease.value.leaseId); } };
}
