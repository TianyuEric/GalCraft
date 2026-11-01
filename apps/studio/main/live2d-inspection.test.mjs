import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AssetTypeRegistry, createAssetIndex } from '@galcraft/assets';
import { FixtureLock, fixtureId } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { createPlugin } from '../../../plugins/official-live2d/src/services.ts';
import { modelType } from '../../../plugins/official-live2d/src/definition.ts';
import { StudioAssets } from './asset-providers.mjs';

const pluginId = 'org.galcraft.live2d', projectId = fixtureId(0xf01), indexId = fixtureId(0xf02), lockId = fixtureId(0xf03);
const lock = { sdkRelease: '5-r.4', coreVersion: '5.1.00', motionSyncCoreVersion: null, sourceUrl: 'https://www.live2d.com/sdk/download/web/', instructions: 'Import R4' };
const envelope = (id, data) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data });
let root, session;
beforeEach(async () => { const testing = resolve(import.meta.dirname, '../../../tmp/testing'); await mkdir(testing, { recursive: true }); root = await mkdtemp(join(testing, 'live2d-services-'));
  await mkdir(join(root, 'runtime/core'), { recursive: true });
  // This deterministic Node service fixture tests the port and transactions, not the real Cubism Core.
  await writeFile(join(root, 'runtime/core/live2dcubismcore.js'), `var Live2DCubismCore={Version:{csmGetVersion:()=>0x05010000,csmGetMocVersion:()=>5},Moc:{fromArrayBuffer:bytes=>({...JSON.parse(new TextDecoder().decode(bytes)),_release(){}})},Model:{fromMoc:moc=>({parameters:{ids:[moc.id],minimumValues:[moc.min],maximumValues:[moc.max],defaultValues:[moc.default]},parts:{ids:['PartBody']},release(){}})}};`);
});
afterEach(async () => { await session?.dispose('discard'); session = null; await rm(root, { recursive: true, force: true }); });
async function model(directory, name, parameter) { await mkdir(directory, { recursive: true });
  const path = join(directory, name); await writeFile(path, JSON.stringify({ Version: 3, FileReferences: { Moc: 'same.moc3' }, Groups: [{ Target: 'Parameter', Name: 'LipSync', Ids: [parameter.id] }] }));
  await writeFile(join(directory, 'same.moc3'), JSON.stringify(parameter)); return path;
}
async function assets(expected = lock) {
  session = await ProjectSession.createProject(join(root, 'project'), projectId, [
    { documentId: indexId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(createAssetIndex(indexId)) } },
    { documentId: lockId, revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(lockId, { ...FixtureLock, live2dRuntime: expected }) } },
  ]);
  const service = new StudioAssets({ currentSession: session, currentRoot: join(root, 'project') }, '', null, null, null, '');
  service.assetTypes = { acquire: async () => ({ types: new AssetTypeRegistry([{ definition: modelType, provider: { id: pluginId, version: '0.1.0' } }]), release: async () => {} }) };
  service.resourceProviders = { resolve: async () => { const plugin = createPlugin(); const contributions = await plugin.activate({ pluginId, runtimeDependencies: { resolve: async () => expected ? { ok: true, value: { url: pathToFileURL(join(root, 'runtime/adapter.mjs')).href, expected }, warnings: [] } : { ok: false, error: { message: '缺少锁定 Core' } } }, assets: {}, documents: {}, pages: {}, log() {} });
    return { provider: contributions.resources[0], release: () => plugin.deactivate() }; } };
  return service;
}
it('routes grouped imports and parameter refresh through the ordinary resource service and M02', async () => {
  const a = { id: 'ParamCustomA', min: -12.5, max: 44, default: 3.25 }, b = { id: 'ParamCustomB', min: 4, max: 8, default: 6 };
  const sources = [await model(join(root, 'a'), 'a.model3.json', a), await model(join(root, 'b'), 'b.model3.json', b)];
  const service = await assets(), imported = await service.import(sources);
  expect(imported.ok).toBe(true); expect(imported.value.failed).toEqual([]);
  expect(imported.value.succeeded.map(asset => asset.variants[0].groupCapabilities.parameters)).toEqual([[a], [b]]);
  const asset = imported.value.succeeded[0]; expect(asset.variants[0].typeData.provider).toEqual({ id: pluginId, version: '0.1.0' });
  const refreshed = await service.inspectModel(asset.id); expect(refreshed.ok).toBe(true); expect(refreshed.value.id).toBe(asset.id); expect(refreshed.value.activeVariantId).toBe(asset.activeVariantId);
  expect(service.current().index.revision).toBe(2);
});
it.each([null, { ...lock, coreVersion: '5.0.04' }])('rejects missing or mismatched Core without writing asset state (%j)', async expected => {
  const source = await model(join(root, 'source'), 'bad.model3.json', { id: 'Param', min: -1, max: 1, default: 0 });
  const service = await assets(expected), imported = await service.import([source]);
  expect(imported.ok).toBe(true); expect(imported.value.succeeded).toEqual([]); expect(imported.value.failed[0].issue.code).toBe('LIVE2D_MODEL_INSPECTION');
  expect(service.current().index.revision).toBe(1); expect(service.current().index.data.assets).toEqual([]);
});
