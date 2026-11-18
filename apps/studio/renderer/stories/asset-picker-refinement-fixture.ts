import type { Asset, AssetImportReceipt, AssetListIdentity, AssetPickerPage, AssetPickerQuery, Result } from '@galcraft/contracts';
import { FixtureAsset, FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import type { AuthoringServices } from '../authoring/controller.js';

export type PickerImportOutcome = 'mixed' | 'cancel' | 'failure';
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export const pickerOriginalId = fixtureId(0xf41), pickerPinnedVersion = fixtureId(0xf42), pickerImportedId = fixtureId(0xf43);
export const pickerImportFailure = '图片文件不完整，请重新选择源文件。';
const imageUri = '/practice/backgrounds/spring-station.png';

export function assetPickerRefinementFixture() {
  const original = structuredClone(FixtureAsset); original.id = pickerOriginalId; original.name = '雨站 · 原引用';
  original.characterId = FixtureIds.an; original.sceneIds = [FixtureIds.street];
  const pinned = structuredClone(original.variants[0]!); pinned.id = pickerPinnedVersion;
  original.variants.push(pinned);
  const assets: Asset[] = [original, ...Array.from({ length: 15 }, (_, index) => {
    const asset = structuredClone(FixtureAsset); asset.id = fixtureId(0xf50 + index); asset.name = `场景参考 ${String(index + 1).padStart(2, '0')}`;
    asset.characterId = FixtureIds.an; asset.sceneIds = [FixtureIds.street]; return asset;
  })];
  const imported = structuredClone(FixtureAsset); imported.id = pickerImportedId; imported.name = '新导入 · 雨后站台';
  imported.characterId = null; imported.sceneIds = [];
  const audio = structuredClone(imported); audio.id = fixtureId(0xf44); audio.name = '新导入 · 站台环境音'; audio.kind = 'audio';
  let outcome: PickerImportOutcome = 'mixed';
  const metrics = { picks: 0, imports: 0, applied: [] as string[], queries: [] as AssetPickerQuery[] };
  const receipt: AssetImportReceipt = { succeeded: [imported, audio], failed: [{ path: 'D:/素材/未完成.png', issue: {
    code: 'ASSET_IMPORT', owner: 'M04', severity: 'error', message: pickerImportFailure, related: [], actions: ['retry'],
  } }], batch: { id: fixtureId(0xf45), attemptId: fixtureId(0xf46), revision: 1 } };
  const row = (asset: Asset, currentVariantId: string | null = null): AssetListIdentity => {
    const variant = asset.variants.find(item => item.id === (currentVariantId ?? asset.activeVariantId));
    return { assetId: asset.id, revision: asset.revision, name: asset.name, kind: asset.kind, folder: asset.folder,
      character: asset.characterId ? { id: asset.characterId, name: '林舟' } : null, sameNameCount: 1, sourceName: asset.sourceName,
      createdAt: asset.createdAt, shownVariant: variant ? { id: variant.id, role: variant.role, metadata: variant.metadata,
        active: variant.id === asset.activeVariantId, currentBinding: currentVariantId !== null } : null, currentBindingMissing: !variant };
  };
  const services = {
    read: async () => ok({ characters: [{ id: FixtureIds.an, name: '林舟' }], scenes: [{ sceneId: FixtureIds.street, name: '雨后站台' }] }),
    queryAssetPicker: async (input: AssetPickerQuery) => {
      metrics.queries.push(structuredClone(input));
      const { context, query } = input;
      const filtered = assets.filter(asset => context.allowedKinds.includes(asset.kind)
        && (!query.kind || asset.kind === query.kind) && (!query.search || asset.name.includes(query.search))
        && (context.tab !== 'context' || (!context.characterId || asset.characterId === context.characterId) && (!context.sceneId || asset.sceneIds.includes(context.sceneId))));
      const items = filtered.slice(query.offset, query.offset + query.limit);
      const current = assets.find(asset => asset.id === context.currentAssetId);
      return ok<AssetPickerPage>({ items, rows: items.map(asset => row(asset)), total: filtered.length, offset: query.offset, indexRevision: metrics.imports + 1,
        current: current ? row(current, context.currentVariantId) : null, currentMissing: !current, applied: [], recentEntries: [], missingRecentIds: [],
        empty: filtered.length ? null : assets.length ? 'filter' : 'library' });
    },
    getAsset: async (id: string) => { const asset = assets.find(item => item.id === id); return asset ? ok(asset) : { ok: false as const, error: receipt.failed[0]!.issue }; },
    pickAssetFiles: async () => { metrics.picks++; return ok(outcome === 'cancel' ? [] : ['D:/素材/站台.png', 'D:/素材/未完成.png']); },
    importAssets: async () => {
      metrics.imports++;
      if (outcome === 'failure') return { ok: false as const, error: { ...receipt.failed[0]!.issue, message: '素材服务暂不可用，请保留原引用后重试。' } };
      for (const asset of receipt.succeeded) if (!assets.some(item => item.id === asset.id)) assets.push(asset);
      return ok(structuredClone(receipt));
    },
    recordAssetUse: async ({ assetIds }: { assetIds: string[] }) => { metrics.applied.push(...assetIds); return ok(undefined); },
    thumbnails: async (requests: { assetId: string; variantId: string }[]) => ok(requests.map(request => ({ ...request, uri: imageUri }))),
    previewAsset: async () => ok({ uri: imageUri }), stopAssetPreview: async () => ok(undefined),
  } as unknown as AuthoringServices;
  return { services, original, imported, assets, receipt, metrics, setOutcome: (value: PickerImportOutcome) => { outcome = value; } };
}
