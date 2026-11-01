import { afterEach, expect, it, vi } from 'vitest';
import type { Asset, AssetTypeCatalogEntry } from '@galcraft/contracts';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import type { AssetEditorInput } from '../pages/Plugins/asset-ui-host.js';
import type { AuthoringServices } from './controller.js';
import { createAssetInspector, disposeAssetInspector } from './asset-inspector.js';

vi.mock('../components/action-icon.js', () => ({ actionIcon: () => document.createElement('span') }));
vi.mock('./asset-details.js', () => ({ createAssetDetails: () => ({
  querySelector: () => document.createElement('section'), querySelectorAll: () => [],
}) }));

afterEach(() => vi.unstubAllGlobals());
function documentFixture() {
  vi.stubGlobal('document', { createElement: () => ({ dataset: {}, append() {}, prepend() {}, setAttribute() {} }) });
}
function catalogEntry(kind: Asset['kind'], typeVersion = 1, provider: AssetTypeCatalogEntry['provider'] = { id: 'org.test.model', version: '0.1.0' }): AssetTypeCatalogEntry {
  return { descriptor: { contractVersion: 1, key: kind, typeVersion, title: 'Model', description: '', icon: 'image',
    schema: true, fields: [], extensions: [], targets: ['web', 'windows'], resourceProviderKey: 'org.test.model/resource',
    editorKey: 'org.test.model/editor', capabilities: [] }, provider };
}
function setup(kind: Asset['kind'] = 'live2d') {
  documentFixture();
  const asset = structuredClone(FixtureAsset); asset.kind = kind;
  for (const variant of asset.variants) delete variant.typeData;
  const mount = vi.fn((_root: HTMLElement, _input: AssetEditorInput) => vi.fn());
  const catalog = vi.fn(async () => ({ ok: true as const, value: [catalogEntry(kind)], warnings: [] }));
  const edit = vi.fn(async () => ({ ok: true as const, value: asset, warnings: [] }));
  const services = { assetUi: { has: () => false, mountEditor: mount }, assetTypeCatalog: catalog, editAssetTypeData: edit } as unknown as AuthoringServices;
  const options = { locale: 'en', services, rename: vi.fn(), preview: vi.fn(), reveal: vi.fn(), transparent: vi.fn(), changed: vi.fn() };
  return { asset, mount, catalog, edit, options };
}

it.each(['live2d', 'texture'] as const)('mounts catalog-backed legacy %s information read-only without creating type data', async kind => {
  const { asset, mount, edit, options } = setup(kind), original = JSON.stringify(asset);
  const root = createAssetInspector(asset, options);
  await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  const context = mount.mock.calls[0]![1];
  expect(context.typeData).toEqual({ typeVersion: 1, provider: catalogEntry(kind).provider, value: {} });
  expect(context.target).toMatchObject({ kind: 'asset', readonly: true });
  expect(context.resource).toEqual({ assetId: asset.id, variant: asset.variants[0] });
  await expect(context.commit({ changed: true })).rejects.toThrow('read-only');
  expect(edit).not.toHaveBeenCalled(); expect(JSON.stringify(asset)).toBe(original);
  disposeAssetInspector(root); expect(mount.mock.results[0]!.value).toHaveBeenCalledOnce();
});

it.each(['no provider', 'newer type version'] as const)('keeps legacy data without mounting when the catalog has %s', async reason => {
  const { asset, mount, catalog, options } = setup();
  catalog.mockResolvedValue({ ok: true, value: [catalogEntry(asset.kind, reason === 'newer type version' ? 2 : 1, reason === 'no provider' ? null : catalogEntry(asset.kind).provider)], warnings: [] });
  const original = JSON.stringify(asset), root = createAssetInspector(asset, options);
  await catalog.mock.results[0]!.value; await Promise.resolve();
  expect(mount).not.toHaveBeenCalled(); expect(JSON.stringify(asset)).toBe(original); disposeAssetInspector(root);
});

it('does not mount a late catalog result after the Inspector is disposed', async () => {
  const { asset, mount, catalog, options } = setup();
  let complete!: (result: Awaited<ReturnType<typeof catalog>>) => void;
  catalog.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const root = createAssetInspector(asset, options); disposeAssetInspector(root);
  complete({ ok: true, value: [catalogEntry(asset.kind)], warnings: [] });
  await catalog.mock.results[0]!.value; await Promise.resolve(); expect(mount).not.toHaveBeenCalled();
});

it('keeps an existing envelope on its exact editable path and retains fixed-reference readonly', async () => {
  const { asset, mount, catalog, edit, options } = setup();
  const data = { typeVersion: 2, provider: { id: 'org.test.exact', version: '2.0.0' }, value: { color: 'blue' } };
  asset.variants[0]!.typeData = data;
  const root = createAssetInspector(asset, options), context = mount.mock.calls[0]![1];
  expect(catalog).toHaveBeenCalledOnce(); expect(context.typeData).toBe(data); expect(context.target.readonly).toBe(false);
  expect((await context.commit({ color: 'green' })).ok).toBe(true);
  expect(edit).toHaveBeenCalledWith({ assetId: asset.id, variantId: asset.activeVariantId, expectedRevision: asset.revision, typeData: { ...data, value: { color: 'green' } } });
  expect(data.value).toEqual({ color: 'blue' }); disposeAssetInspector(root);
  const reference = createAssetInspector(asset, { ...options, reference: { variantId: asset.activeVariantId } });
  expect(mount.mock.calls[1]![1].target.readonly).toBe(true);
  await expect(mount.mock.calls[1]![1].commit({ color: 'red' })).rejects.toThrow('read-only');
  expect(edit).toHaveBeenCalledOnce(); disposeAssetInspector(reference);
});
