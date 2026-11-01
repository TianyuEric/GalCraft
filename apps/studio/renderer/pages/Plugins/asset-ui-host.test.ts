import { afterEach, expect, it, vi } from 'vitest';
import type { AssetEditorContribution, AssetPreviewContribution } from '@galcraft/plugins/contracts';
import type { AssetUiProvider, AssetPreviewInput } from './asset-ui-host.js';
import { AssetUiHost, validateAssetUi } from './asset-ui-host.js';
import { FixtureAsset } from '@galcraft/contracts/fixtures';

const kind = 'org.test.geometry/shape' as const, data = { typeVersion: 1, provider: { id: 'org.test.geometry', version: '0.1.0' }, value: { color: '#123456' } };
afterEach(() => vi.unstubAllGlobals());
function provider() {
  return { manifest: { id: data.provider.id, version: data.provider.version, contributions: [
    { kind: 'assetEditor', key: 'org.test.geometry/editor' }, { kind: 'assetPreview', key: 'org.test.geometry/preview' }] },
    definition: { assetTypes: [{ key: kind, typeVersion: 1, editorKey: 'org.test.geometry/editor', previewKey: 'org.test.geometry/preview' }] },
    contributions: { assetEditors: [{ key: 'org.test.geometry/editor', assetType: kind, contexts: ['asset'], mount: () => {} }],
      assetPreviews: [{ key: 'org.test.geometry/preview', assetType: kind, mount: () => {} }] }, context: {} } as unknown as AssetUiProvider;
}
const root = () => ({ replaceChildren: vi.fn(), setAttribute: vi.fn() }) as unknown as HTMLElement;
const previewInput = (): AssetPreviewInput => ({ source: { kind: 'asset', assetId: FixtureAsset.id }, kind, name: 'Shape',
  variant: { ...structuredClone(FixtureAsset.variants[0]!), typeData: data }, resource: { root: 'asset://read/', entry: 'shape.json', files: [], read: async () => new Uint8Array() } });

it('requires the exact provider, type version and declared context before mounting an editor', () => {
  const entry = provider(), mount = vi.fn(); entry.contributions.assetEditors![0]!.mount = mount;
  const host = new AssetUiHost(() => [entry], () => 'en'), commit = vi.fn(async () => ({ ok: true as const, value: undefined, warnings: [] }));
  const input = { kind, typeData: data, value: data.value, target: { kind: 'asset' as const, assetId: FixtureAsset.id, variantId: FixtureAsset.activeVariantId, expectedRevision: 1, readonly: false }, commit };
  expect(host.mountEditor(root(), { ...input, typeData: { ...data, provider: { ...data.provider, version: '2.0.0' } } })).toBeNull();
  expect(host.mountEditor(root(), { ...input, typeData: { ...data, typeVersion: 2 } })).toBeNull();
  expect(host.mountEditor(root(), { ...input, target: { kind: 'command', documentId: 'DocAAAA', statementId: 'LineAAA', expectedRevision: 1, readonly: false } })).toBeNull();
  expect(mount).not.toHaveBeenCalled();
});
it('preserves readonly and rejects a late commit after disposal', async () => {
  const entry = provider(); let context: Parameters<AssetEditorContribution['mount']>[1] | undefined;
  entry.contributions.assetEditors![0]!.mount = (_root, input) => { context = input; };
  const host = new AssetUiHost(() => [entry], () => 'en'), commit = vi.fn(async () => ({ ok: true as const, value: undefined, warnings: [] }));
  const input = { kind, typeData: data, value: data.value, target: { kind: 'asset' as const, assetId: FixtureAsset.id, variantId: FixtureAsset.activeVariantId, expectedRevision: 1, readonly: true }, commit };
  const dispose = host.mountEditor(root(), input)!; expect((await context!.commit({ color: '#ffffff' })).ok).toBe(false); dispose();
  expect(context!.signal.aborted).toBe(true); expect((await context!.commit(null)).ok).toBe(false); expect(commit).not.toHaveBeenCalled();
});
it('cancels an asynchronous preview and releases both early resources and a late mounted result exactly once', async () => {
  const entry = provider(), early = vi.fn(), late = vi.fn(); let complete!: () => void, context!: Parameters<AssetPreviewContribution['mount']>[1];
  entry.contributions.assetPreviews![0]!.mount = async (_root, input) => { context = input; input.onDispose(early); await new Promise<void>(resolve => { complete = resolve; }); return late; };
  const host = new AssetUiHost(() => [entry], () => 'ja'), abort = new AbortController(), mounting = host.mountPreview(root(), previewInput(), abort.signal);
  abort.abort(); expect(context.signal.aborted).toBe(true); complete(); const dispose = await mounting; dispose?.(); await Promise.resolve();
  expect(early).toHaveBeenCalledTimes(1); expect(late).toHaveBeenCalledTimes(1);
});
it('reload disposal releases all mounted preview resources', async () => {
  const entry = provider(), release = vi.fn(); entry.contributions.assetPreviews![0]!.mount = () => release;
  const host = new AssetUiHost(() => [entry], () => 'en'); await host.mountPreview(root(), previewInput(), new AbortController().signal);
  host.dispose(); host.dispose(); await Promise.resolve(); expect(release).toHaveBeenCalledTimes(1);
});
it('waits for host attachment, then aborts an editor when its Inspector is removed', () => {
  let mutation!: () => void;
  vi.stubGlobal('MutationObserver', class { constructor(callback: () => void) { mutation = callback; } observe() {} disconnect() {} });
  const container = { ...root(), isConnected: false, remove: vi.fn(), ownerDocument: null as unknown }, document = { body: {}, createElement: () => container }; container.ownerDocument = document;
  const parent = { ...root(), ownerDocument: document, append: vi.fn() } as unknown as HTMLElement;
  const entry = provider(), release = vi.fn(); let context!: Parameters<AssetEditorContribution['mount']>[1];
  entry.contributions.assetEditors![0]!.mount = (_root, value) => { context = value; return release; };
  const host = new AssetUiHost(() => [entry], () => 'en'); host.mountEditor(parent, { kind, typeData: data, value: data.value, target: { kind: 'asset', assetId: FixtureAsset.id, variantId: FixtureAsset.activeVariantId, expectedRevision: 1, readonly: false }, commit: vi.fn() });
  mutation(); expect(context.signal.aborted).toBe(false);
  container.isConnected = true; mutation(); container.isConnected = false; mutation(); expect(context.signal.aborted).toBe(true); expect(release).toHaveBeenCalledOnce();
});
it('rejects undeclared UI contributions and another type association', () => {
  const entry = provider(); expect(() => validateAssetUi(entry)).not.toThrow();
  entry.contributions.assetEditors![0]!.assetType = 'org.other.geometry/shape'; expect(() => validateAssetUi(entry)).toThrow('ownership');
  entry.contributions.assetEditors![0]!.assetType = kind; entry.contributions.assetPreviews!.push({ ...entry.contributions.assetPreviews![0]!, key: 'org.test.geometry/hidden' });
  expect(() => validateAssetUi(entry)).toThrow();
});
