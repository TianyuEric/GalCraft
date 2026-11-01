import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createAssetIndex, assetFilePath } from '@galcraft/assets';
import { FixtureAsset, FixtureLock, FixtureProject, fixtureId } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { StudioAssets } from './asset-providers.mjs';
import { verifyAssetPlayback } from './asset-targets.mjs';

vi.mock('./asset-targets.mjs', () => ({ verifyAssetPlayback: vi.fn() }));
const root = resolve(import.meta.dirname, '../../../tmp/testing/plugin-development/target-verification-unit');
const pluginId = 'org.example.target', resourceKey = `${pluginId}/plainGroup`, stageKey = `${pluginId}/canvas`;
const ok = value => ({ ok: true, value, warnings: [] });
const indexId = fixtureId(0xf20), projectDocumentId = fixtureId(0xf21), lockDocumentId = fixtureId(0xf22);
let session;
afterEach(async () => { await session?.dispose('discard'); session = null; await rm(root, { force: true, recursive: true }); vi.clearAllMocks(); });

async function fixture() {
  const asset = { ...FixtureAsset, kind: 'effect', name: 'custom-stage.txt', activeVariantId: FixtureAsset.variants[0].id,
    variants: [{ ...FixtureAsset.variants[0], entry: 'custom-stage.txt', files: [{ path: 'custom-stage.txt', bytes: 4, mime: 'text/plain', role: 'entry' }],
      targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: { resolver: resourceKey, resolverVersion: '0.1.0', format: 'plain', formatVersion: '1', capabilities: [], parameters: [], motions: [], expressions: [], missingFiles: [] } }] };
  const index = createAssetIndex(indexId); index.data.assets.push(asset);
  const lock = { ...FixtureLock, plugins: [{ kind: 'plugin', id: pluginId, version: '0.1.0', targets: ['web', 'windows'], required: true }] };
  const document = (documentId, path, data) => ({ documentId, revision: 1, format: 'json', files: { [path]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }) } });
  session = await ProjectSession.createProject(root, FixtureProject.projectId, [document(indexId, 'assets/index.json', index.data), document(projectDocumentId, 'project.json', FixtureProject), document(lockDocumentId, 'dependencies.lock.json', lock)]);
  const source = join(root, ...assetFilePath(asset.id, asset.activeVariantId, 'custom-stage.txt').split('/')); await mkdir(resolve(source, '..'), { recursive: true }); await writeFile(source, 'real');
  const release = vi.fn(), resources = { register: () => ({ uri: 'galcraft-resource://actual/custom-stage.txt', release }) };
  const service = new StudioAssets({ currentRoot: root, currentSession: session }, '', null, null, resources);
  service.verifyAssetPlayback = verifyAssetPlayback;
  const manifest = { schemaVersion: 1, id: pluginId, name: 'Example', version: '0.1.0', description: '', author: 'Example', license: 'UNLICENSED', homepage: null,
    engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], entry: { runtime: 'runtime.js', editor: null }, files: [{ path: 'runtime.js', size: 1 }],
    contributions: [{ kind: 'resource', key: resourceKey, targets: ['web', 'windows'], required: true }, { kind: 'stage', key: stageKey, targets: ['web', 'windows'], required: true }], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
  service.targetValidation = { plugins: { resolve: vi.fn(async () => ok({ handleId: 'plugins', packages: [{ manifest, runtimeUrl: 'galcraft-resource://actual/runtime.js' }] })),
    release: vi.fn(async () => ok()), acquireDefinitions: async () => ok({ documents: [], release: async () => {} }) },
    engines: { resolvePreview: vi.fn(async () => ok({ handleId: 'engine', url: 'galcraft-resource://actual/preview.js' })), releasePreview: vi.fn() } };
  return { service, release, asset, read: () => JSON.parse(session.readDocument(indexId).files['assets/index.json']).data.assets[0] };
}
it('records successful stage playback through a real M02 edit receipt and releases every lease', async () => {
  const current = await fixture(); verifyAssetPlayback.mockResolvedValue({ ok: true });
  const verified = await current.service.verifyTarget('web'); expect(verified.ok).toBe(true); expect(verified.value.issues).toEqual([]);
  expect(verified.value.edit.documents).toContainEqual({ ref: { kind: 'document', id: indexId }, revision: 2 });
  expect(current.read().variants[0].targets).toEqual({ web: 'direct', windows: 'unverified' });
  expect(session.dirtyIds()).toEqual([indexId]);
  expect(verifyAssetPlayback).toHaveBeenCalledWith(expect.objectContaining({ kind: 'effect' }), 'galcraft-resource://actual/custom-stage.txt', null,
    expect.objectContaining({ target: 'web', resource: expect.objectContaining({ assetId: current.asset.id, provider: resourceKey, entry: 'custom-stage.txt', files: [{ path: 'custom-stage.txt', bytes: 4, mime: 'text/plain' }] }), baseUri: 'galcraft-resource://actual/' }));
  expect(current.release).toHaveBeenCalledOnce(); expect(current.service.targetValidation.plugins.release).toHaveBeenCalledWith('plugins'); expect(current.service.targetValidation.engines.releasePreview).toHaveBeenCalledWith('engine');
});
it('keeps a failed stage unverified with an asset diagnostic and clears an earlier successful target receipt', async () => {
  const current = await fixture(); verifyAssetPlayback.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, reason: 'Stage update failed' });
  await current.service.verifyTarget('windows'); expect(current.read().variants[0].targets.windows).toBe('direct');
  const failed = await current.service.verifyTarget('windows'); expect(failed.ok).toBe(true); expect(current.read().variants[0].targets.windows).toBe('unverified');
  expect(failed.value.issues).toEqual([expect.objectContaining({ code: 'ASSET_STAGE_TARGET', related: [{ kind: 'asset', id: current.asset.id }], actions: ['supplyDependency', 'retry'] })]);
});
it('verifies an older fixed reference as well as the new active variant after a type edit', async () => {
  const current = await fixture(), old = current.asset.activeVariantId, next = fixtureId(0xf23), value = current.read();
  value.variants.push({ ...structuredClone(value.variants[0]), id: next, parentId: old }); value.activeVariantId = next;
  const plan = session.planEdit({ label: 'New immutable type variant', origin: 'field', expected: [{ ref: { kind: 'document', id: indexId }, revision: 1 }],
    patches: [{ kind: 'json', documentId: indexId, changes: [{ path: '/data/assets', before: [current.asset], after: [value], op: 'set' }] }], preparedAssets: [], requiredRefs: [] });
  expect(plan.ok).toBe(true); await session.applyEdit(plan.value.planId, plan.value.input.expected);
  const file = join(root, ...assetFilePath(value.id, next, 'custom-stage.txt').split('/')); await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, 'real');
  current.service.pluginReferences = async () => [{ assetId: value.id, variantId: old, owner: { kind: 'document', id: projectDocumentId }, usage: 'fixed' }];
  verifyAssetPlayback.mockResolvedValue({ ok: true }); const checked = await current.service.verifyTarget('web');
  expect(checked.ok && checked.value.issues).toEqual([]); expect(verifyAssetPlayback).toHaveBeenCalledTimes(2);
  expect(current.read().variants.map(variant => variant.targets.web)).toEqual(['direct', 'direct']); expect(current.read().activeVariantId).toBe(next);
});
it('retains unverified and reports the missing consumer when target validation is not assembled', async () => {
  const current = await fixture(); current.service.targetValidation = null;
  const failed = await current.service.verifyTarget('web'); expect(failed.ok).toBe(true); expect(current.read().variants[0].targets.web).toBe('unverified');
  expect(failed.value.issues).toEqual([expect.objectContaining({ code: 'ASSET_RUNTIME', related: [{ kind: 'asset', id: current.asset.id }] })]); expect(verifyAssetPlayback).not.toHaveBeenCalled();
});
