import { afterEach, expect, it, vi } from 'vitest';
import { FixtureAsset, FixtureLock, FixtureProject, fixtureId } from '@galcraft/contracts/fixtures';
import { prepareStageTarget, exercisePluginStage, stageResource } from './asset-stage-targets.mjs';
import { EnginePreview } from './engine-preview.mjs';

const pluginId = 'org.example.complete', resourceKey = `${pluginId}/plainGroup`, stageKey = `${pluginId}/canvas`;
const ok = value => ({ ok: true, value, warnings: [] });
const manifest = { schemaVersion: 1, id: pluginId, name: 'Example', version: '0.1.0', description: '', author: 'Example', license: 'UNLICENSED', homepage: null,
  engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], entry: { runtime: 'runtime.js', editor: null }, files: [{ path: 'runtime.js', size: 1 }],
  contributions: [{ kind: 'resource', key: resourceKey, targets: ['web', 'windows'], required: true }, { kind: 'stage', key: stageKey, targets: ['web', 'windows'], required: true }],
  stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
const asset = { ...FixtureAsset, kind: 'effect', activeVariantId: FixtureAsset.variants[0].id,
  variants: [{ ...FixtureAsset.variants[0], entry: 'custom stage.txt', files: [{ path: 'custom stage.txt', bytes: 4, mime: 'text/plain', role: 'entry' }],
    groupCapabilities: { resolver: resourceKey, resolverVersion: '0.1.0', format: 'plain', formatVersion: '1', capabilities: [], parameters: [], motions: [], expressions: [], missingFiles: [] } }] };
const lock = { ...FixtureLock, plugins: [{ kind: 'plugin', id: pluginId, version: '0.1.0', targets: ['web', 'windows'], required: true }] };
const documents = new Map([
  ['project', { files: { 'project.json': JSON.stringify({ data: FixtureProject }) } }],
  ['lock', { files: { 'dependencies.lock.json': JSON.stringify({ data: lock }) } }],
  ['settings', { documentId: fixtureId(0xf01), revision: 7, files: { [`plugins/${pluginId}/settings/${fixtureId(0xf01)}.json`]: JSON.stringify({ pluginDocument: { pluginId, contributionKey: `${pluginId}/settings`, name: 'settings', stateVersion: 1 }, data: { title: 'Actual config' } }) } }],
]);
afterEach(() => { vi.unstubAllGlobals(); });

it('resolves the requested engine target while existing preview callers use the Web runtime', async () => {
  const catalog = { resolveProjectEngine: vi.fn(async () => ok({ directory: 'D:/engine', manifest: { version: FixtureProject.engineVersion, entries: { preview: 'preview/index.js' }, files: [{ path: 'preview/index.js' }] } })) };
  const resources = { register: vi.fn(() => ({ uri: 'galcraft-resource://engine/preview/index.js', release: vi.fn() })) };
  const preview = new EnginePreview(catalog, resources), snapshot = { project: FixtureProject, lock, engineVersion: FixtureProject.engineVersion, assets: [] };
  const defaultBinding = await preview.resolvePreview(snapshot); expect(defaultBinding.ok).toBe(true);
  const windowsBinding = await preview.resolvePreview(snapshot, 'windows'); expect(windowsBinding.ok).toBe(true);
  expect(catalog.resolveProjectEngine.mock.calls.map(([, , target]) => target)).toEqual(['web', 'windows']);
  preview.releasePreview(defaultBinding.value.handleId); preview.releasePreview(windowsBinding.value.handleId); expect(preview.handles.size).toBe(0);
});

function services() {
  return { plugins: { resolve: vi.fn(async () => ok({ handleId: 'plugin-lease', packages: [{ manifest, runtimeUrl: 'runtime-exact.js' }] })), release: vi.fn(async () => ok()),
    acquireDefinitions: vi.fn(async () => ok({ documents: [{ key: `${pluginId}/settings`, configMapping: { purpose: 'runtime', mode: 'multiple', required: true } }], release: vi.fn() })) },
    engines: { resolvePreview: vi.fn(async () => ok({ handleId: 'engine-lease', url: 'engine-exact.js' })), releasePreview: vi.fn() } };
}
it('leases exact target runtime and uses M03 configuration mapping with each document identity', async () => {
  const ports = services(), prepared = await prepareStageTarget({ projectId: FixtureProject.projectId, documents }, [asset], 'web', ports);
  expect(ports.engines.resolvePreview).toHaveBeenCalledWith(expect.objectContaining({ lock, project: FixtureProject, assets: expect.any(Array) }), 'web');
  expect(prepared.binding.table.byKey[stageKey].provider).toEqual({ id: pluginId, version: '0.1.0' });
  expect(prepared.binding.assets[0]).toEqual(stageResource(asset, asset.variants[0]));
  expect(prepared.binding.pluginDocuments[pluginId]).toMatchObject({ schemaVersion: 1, documents: [{ contribution: `${pluginId}/settings`, documentId: fixtureId(0xf01), revision: 7, purpose: 'runtime', data: { title: 'Actual config' } }] });
  await prepared.release(); expect(ports.plugins.release).toHaveBeenCalledWith('plugin-lease'); expect(ports.engines.releasePreview).toHaveBeenCalledWith('engine-lease');
});
it('releases the package lease when a required target or exact version is missing', async () => {
  const ports = services(); ports.plugins.resolve.mockResolvedValue(ok({ handleId: 'plugin-lease', packages: [{ manifest: { ...manifest, version: '2.0.0' }, runtimeUrl: 'wrong-version.js' }] }));
  await expect(prepareStageTarget({ projectId: FixtureProject.projectId, documents }, [asset], 'web', ports)).rejects.toThrow('锁定插件');
  expect(ports.plugins.release).toHaveBeenCalledOnce(); expect(ports.engines.resolvePreview).not.toHaveBeenCalled();
});

function browserFixture(options = {}) {
  const calls = [];
  class Canvas { width = 320; height = 180; toDataURL() { calls.push('pixels'); return 'data:image/png,'; } }
  vi.stubGlobal('HTMLCanvasElement', Canvas); vi.stubGlobal('document', { body: { append: () => calls.push('surface') } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: !options.missingFile, arrayBuffer: async () => new ArrayBuffer(4) })));
  const instance = { pause: paused => calls.push(`pause:${paused}`), renderSurface: () => new Canvas(), update: () => calls.push('update'),
    capture: () => { calls.push('capture'); return ok(options.invalidState ? { invalid: undefined } : { value: 1 }); },
    dispose: () => { calls.push('dispose'); if (options.failedDispose) throw new Error('Dispose failed'); } };
  const create = vi.fn(async resource => { calls.push('create'); expect(resource).toEqual(stageResource(asset, asset.variants[0])); return ok(instance); });
  const binding = { engineUrl: 'engine-exact.js', packages: [{ manifest, runtimeUrl: 'runtime-exact.js' }], target: 'windows',
    table: { loadOrder: [{ id: pluginId, version: '0.1.0' }], byKey: { [resourceKey]: { kind: 'resource', provider: { id: pluginId, version: '0.1.0' } }, [stageKey]: { kind: 'stage', provider: { id: pluginId, version: '0.1.0' } } } },
    pluginDocuments: { [pluginId]: { title: 'Actual config' } }, assets: [], domain: { projectId: FixtureProject.projectId, kind: 'sample', instance: 'target' }, resource: stageResource(asset, asset.variants[0]), baseUri: 'galcraft-resource://actual/' };
  const loadModule = vi.fn(async url => url === binding.engineUrl ? { installPluginRuntimes() { calls.push('shared-runtime'); vi.stubGlobal('__GalCraftPixi__', { Texture: { from: () => ({ source: { update: () => calls.push('texture-update') }, destroy: () => calls.push('texture-dispose') }) } }); } }
    : { createPlugin: () => ({ activate: async context => { calls.push('activate'); expect(context.target).toBe('windows'); expect(context.config).toEqual(binding.pluginDocuments[pluginId]); expect((await context.assets.resolve({ kind: 'asset', id: asset.id })).value).toEqual(binding.resource); context.onDispose(() => calls.push('context-dispose')); return { stages: options.noStage ? [] : [{ key: stageKey, resourceProviderKey: resourceKey, create }] }; }, deactivate: async () => calls.push('deactivate') }) });
  return { binding, loadModule, calls, create };
}
it('uses the selected stage, real source lease and shared Pixi through the full lifecycle before returning success', async () => {
  const fixture = browserFixture(); expect(await exercisePluginStage(fixture.binding, fixture.loadModule)).toEqual({ provider: stageKey, width: 320, height: 180 });
  expect(fetch).toHaveBeenCalledWith('galcraft-resource://actual/custom%20stage.txt');
  expect(fixture.loadModule.mock.calls.map(([url]) => url)).toEqual(['engine-exact.js', 'runtime-exact.js']);
  expect(fixture.calls).toEqual(['shared-runtime', 'activate', 'create', 'pause:true', 'surface', 'pause:false', 'update', 'capture', 'update', 'capture', 'pause:true', 'texture-update', 'pixels', 'dispose', 'texture-dispose', 'deactivate', 'context-dispose']);
});
it('reports a locked preview that does not expose the shared runtime without importing plugin code', async () => {
  const fixture = browserFixture(); fixture.loadModule.mockResolvedValue({});
  await expect(exercisePluginStage(fixture.binding, fixture.loadModule)).rejects.toThrow('锁定引擎预览缺少插件共享运行入口');
  expect(fixture.loadModule).toHaveBeenCalledOnce(); expect(fixture.create).not.toHaveBeenCalled();
});
it.each([{ noStage: true }, { missingFile: true }, { invalidState: true }, { failedDispose: true }])('fails the actual stage or source check and still deactivates the plugin (%j)', async options => {
  const fixture = browserFixture(options); await expect(exercisePluginStage(fixture.binding, fixture.loadModule)).rejects.toThrow();
  expect(fixture.calls.slice(-2)).toEqual(['deactivate', 'context-dispose']);
  if (options.noStage || options.missingFile) expect(fixture.create).not.toHaveBeenCalled();
  else expect(fixture.calls).toContain('dispose');
});
