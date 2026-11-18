import { JsonSchema, type Asset, type WorkspaceResume } from '@galcraft/contracts';
import { FixtureAsset, FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import type { AssetQuery } from '../authoring/controller.js';
import type { mountAuthoring } from '../authoring/view.js';
import { emptyLayout, group } from '../components/workbench/zoned-layout.js';
import { problemsReviewFixture, type ReviewCalls } from './problems-fixture.js';
import { productAssets, productMedia, productSnapshot } from './product-fixture.js';
import { ok } from './studio-fixture.js';

export type AssetBrowserScenario = 'batch' | 'preview';
export const browserPrimaryId = fixtureId(0x6054), browserCheckedId = fixtureId(0x607e);
export const browserPreviewId = fixtureId(0x6053);
export const browserSceneTitle = productSnapshot().scenes[0]!.scene.name;
export const browserPrimaryVersion = fixtureId(0x6200);
export const browserQuery: AssetQuery = { kind: 'image', text: '站台', folder: ['场景', '站台'],
  sort: 'modified', direction: 'desc', offset: 40, limit: 40 };
export const browserFailurePaths = ['review-fixture/林舟-立绘.png', 'review-fixture/春日-音乐.opus'];
export type AssetBrowserMetrics = {
  imports: number; importPaths: string[]; importBatch: string; renames: number; applies: number; saves: number;
  query: AssetQuery | null; scopeIds: string[]; savedAssets: NonNullable<WorkspaceResume['workbench']>['assets'] | null;
};

/** The real renderer, Dock, selection and document transactions own the UI. This fixture controls service results only. */
export async function assetBrowserRefinementFixture(theme: 'light' | 'dark', scenario: AssetBrowserScenario,
  changed: (metrics: AssetBrowserMetrics) => void) {
  const metrics: AssetBrowserMetrics = { imports: 0, importPaths: [], importBatch: '', renames: 0, applies: 0, saves: 0,
    query: null, scopeIds: [], savedAssets: null };
  const emit = () => changed(structuredClone(metrics));
  const retained = problemsReviewFixture('import', 'zh-CN', theme, (calls: ReviewCalls) => {
    metrics.imports = calls.imports; metrics.saves = calls.saves; emit();
  });
  const services: Parameters<typeof mountAuthoring>[1] = retained.services;
  const originalAssets = productAssets();
  const gallery: Asset[] = Array.from({ length: 96 }, (_, index) => {
    const asset = structuredClone(FixtureAsset);
    asset.id = fixtureId(0x6020 + index); asset.name = `站台参考 ${String(index + 1).padStart(3, '0')}.png`;
    asset.folder = ['场景', '站台']; asset.characterId = null; asset.sceneIds = [];
    asset.activeVariantId = asset.originalVariantId = fixtureId(0x6300 + index); asset.variants[0]!.id = asset.activeVariantId;
    asset.modifiedAt = new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString();
    return asset;
  });
  const primary = gallery.find(asset => asset.id === browserPrimaryId)!;
  primary.variants.push({ ...structuredClone(primary.variants[0]!), id: browserPrimaryVersion });
  const assets = [...originalAssets, ...gallery], imageUri = '/practice/backgrounds/spring-station.png';
  const visibleAssets = () => {
    const imported = new Set(retained.batch().succeeded.map(asset => asset.id));
    return assets.filter(asset => gallery.includes(asset) || imported.has(asset.id));
  };
  const catalog = services.assetTypeCatalog!;
  services.assetTypeCatalog = async () => {
    const result = await catalog();
    return result.ok ? ok(result.value.map(entry => ({ ...entry, count: visibleAssets().filter(asset => asset.kind === entry.descriptor.key).length }))) : result;
  };
  // This is a deterministic service projection, including the provider's explicit ID range. It does not own browser state.
  services.queryAssets = async query => {
    metrics.query = structuredClone(query); metrics.scopeIds = [...query.assetIds ?? []]; emit();
    const ids = query.assetIds === undefined ? null : new Set(query.assetIds);
    const matching = visibleAssets().filter(asset => (!ids || ids.has(asset.id))
      && (!query.kind || asset.kind === query.kind) && (!query.text || asset.name.includes(query.text))
      && (!query.folder?.length || query.folder.every((part, index) => asset.folder[index] === part)));
    const direction = query.direction === 'desc' ? -1 : 1;
    matching.sort((a, b) => direction * (query.sort === 'modified' ? a.modifiedAt.localeCompare(b.modifiedAt)
      : query.sort === 'size' ? a.variants[0]!.files[0]!.bytes - b.variants[0]!.files[0]!.bytes : a.name.localeCompare(b.name)));
    return ok({ items: structuredClone(matching.slice(query.offset, query.offset + query.limit)), total: matching.length,
      indexRevision: retained.batch().revision });
  };
  services.getAsset = async id => ok(structuredClone(visibleAssets().find(asset => asset.id === id) ?? null));
  services.thumbnails = async requests => ok(requests.filter(request => assets.find(asset => asset.id === request.assetId)?.kind === 'image')
    .map(request => ({ ...request, variantId: request.variantId ?? assets.find(asset => asset.id === request.assetId)!.activeVariantId,
      uri: productMedia[request.assetId] ?? imageUri })));
  services.previewAsset = async id => ok({ uri: productMedia[id] ?? imageUri,
    mime: assets.find(asset => asset.id === id)?.variants[0]!.files[0]!.mime ?? 'image/png', playback: { loopStartSec: null, loopEndSec: null } });
  services.stopAssetPreview = async () => ok(undefined);
  services.runtimeAssets = { resolveRuntime: async (id, version) => {
    const variant = assets.find(asset => asset.id === id)?.variants.find(item => item.id === version);
    return ok({ leaseId: fixtureId(0x6400), uri: productMedia[id] ?? imageUri,
      mime: variant?.files[0]?.mime ?? 'image/png', bytes: variant?.files[0]?.bytes ?? 0 });
  }, releaseRuntime: async () => ok(undefined) };
  const read = services.read.bind(services);
  services.read = async documents => {
    const result = await read(documents);
    return result.ok ? ok({ ...result.value, assetFolders: [['场景'], ['场景', '站台']],
      references: [...result.value.references ?? [], ...gallery.map(asset => ({ kind: 'asset' as const, id: asset.id, name: asset.name }))] }) : result;
  };
  const importAssets = services.importAssets!;
  services.importAssets = async (paths, options) => {
    metrics.importPaths = [...paths]; metrics.importBatch = options?.batchId ?? ''; emit();
    return importAssets(paths, options);
  };
  const documents = services.bridge.documents, apply = documents.applyEdit.bind(documents);
  documents.applyEdit = async (...args) => { const result = await apply(...args); if (result.ok) { metrics.applies++; emit(); } return result; };
  services.renameAssets = async changes => { metrics.renames++; emit(); return services.bridge.assets!.rename(changes); };
  const preferences = services.bridge.authoringPreferences, writeWorkspace = preferences.writeWorkspace.bind(preferences);
  preferences.writeWorkspace = async record => {
    metrics.savedAssets = structuredClone(record.workbench?.assets ?? null); emit(); return writeWorkspace(record);
  };
  const sceneId = `scene:${FixtureIds.street}`, layout = emptyLayout();
  layout.tree = group('document', [sceneId]); layout.left = group('left', ['studio-asset-directory']);
  layout.right = group('right', ['studio-asset-inspector']); layout.bottom = group('bottom', ['studio-assets', 'studio-problems']);
  layout.hidden = { left: false, right: false, bottom: false }; layout.widths = { left: 248, right: 320 }; layout.bottomHeight = 340;
  await preferences.writeWorkspace({ schemaVersion: 1, projectId: FixtureIds.projectA, documentId: FixtureIds.streetDocument,
    sceneId: FixtureIds.street, documentRevision: 1, view: 'writing',
    caret: { statementId: null, field: null, offset: 0, documentOffset: 0 }, previousStatementId: null, nextStatementId: null,
    scroll: { statementId: null, offsetPx: 0, scrollLeft: 0 }, updatedAt: '2026-11-17T03:00:00.000Z',
    workbench: { documents: [{ id: sceneId, title: browserSceneTitle, kind: 'scene', objectId: FixtureIds.street }], active: sceneId,
      dockLayout: JsonSchema.parse(layout), assets: { query: structuredClone(browserQuery), selectionQuery: structuredClone(browserQuery),
        selectedIds: [browserCheckedId], selectionRevision: 1, primaryId: browserPrimaryId,
        primaryVersions: [{ assetId: browserPrimaryId, variantId: browserPrimaryVersion }], previewVersions: [],
        inspectorPin: scenario === 'batch' ? { assetId: browserPrimaryId, variantId: browserPrimaryVersion } : null, scroll: 224 } } });
  emit();
  return { services, metrics, batch: retained.batch, primary };
}
