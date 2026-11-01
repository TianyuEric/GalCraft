import { afterEach, expect, it, vi } from 'vitest';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AssetTypeRegistry, createAssetIndex, assetFilePath } from '@galcraft/assets';
import { validatePluginData } from '@galcraft/plugins/contracts';
import { ProductionService, reviewProductionCandidates } from '@galcraft/authoring/production';
import { ProductionMediaImporter } from './production-media-importer.mjs';
const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const ok = value => ({ ok: true, value, warnings: [] });
async function fixture() {
  const parent = resolve(import.meta.dirname, '../../../tmp/testing/production-media-importer'); await mkdir(parent, { recursive: true }); const root = await mkdtemp(join(parent, 'run-')); roots.push(root);
  const kind = 'org.test.asset/shape', provider = { id: 'org.test.asset', version: '1.2.3' }, schema = { type: 'object', properties: { label: { type: 'string' } }, required: ['label'], additionalProperties: false };
  const definition = { contractVersion: 1, key: kind, typeVersion: 2, title: 'Shape', description: '', icon: 'shape', schema, fields: [], extensions: ['.shape.json'], targets: ['web', 'windows'], resourceProviderKey: 'org.test.asset/parser', capabilities: ['visual'], validate: value => validatePluginData(schema, value), collectReferences: () => [], rewriteReferences: value => ok(value) };
  const types = new AssetTypeRegistry([{ definition, provider }]), releaseTypes = vi.fn(async () => {}), releaseResource = vi.fn(async () => {}), inspect = vi.fn(async (rootFile, _files, source) => {
    const value = JSON.parse(await source.readText(rootFile)), checked = validatePluginData(schema, value); if (!checked.ok) return checked;
    return ok({ files: [rootFile], metadata: { width: 64, height: 32 }, typeData: { typeVersion: 2, provider, value }, capabilities: { resolver: 'org.test.asset/parser', resolverVersion: '1.2.3', format: 'shape', formatVersion: '2', capabilities: ['visual'], parameters: [], motions: [], expressions: [], missingFiles: [] } });
  });
  const assets = { toolDirectory: root, acquireTypes: vi.fn(async () => ({ types, release: releaseTypes })), resourceProviders: { resolve: vi.fn(async () => ({ provider: { key: 'org.test.asset/parser', kind, extensions: ['.shape.json'], inspect }, release: releaseResource })) } };
  const index = createAssetIndex('IndexA'), importer = new ProductionMediaImporter({ assets, project: { projectId: 'WorkAA' }, root, index: () => index });
  const path = join(root, 'candidate.shape.json'); await writeFile(path, JSON.stringify({ label: 'frozen shape' }));
  const input = { projectId: 'WorkAA', files: [path], fileSources: [{ kind: 'generation', description: 'original candidate', usage: 'localReview', taskId: 'TaskAA', candidateId: 'CandAA' }], folder: [], conflict: 'keepBoth', usage: null, targetBinding: null };
  return { root, input, assets, importer, releaseTypes, releaseResource, inspect, provider };
}
it('adopts frozen artifact typeData through M04 while keeping the older file as provenance', async () => {
  const f = await fixture(); await writeFile(f.input.files[0], JSON.stringify({ label: 'older file value' }));
  const frozen = { typeVersion: 2, provider: f.provider, value: { label: 'frozen shape' } };
  let prepared, edit;
  const review = await reviewProductionCandidates([{ id: 'CandAA', taskId: 'TaskAA', artifacts: [{ kind: 'org.test.asset/shape', role: 'primary', localPath: f.input.files[0], typeData: frozen }] }], [], {
    projectId: 'WorkAA', choices: {}, findItem: () => ({ target: { usage: 'background' } }),
    scriptSource: () => ({}), bindingSource: () => ({}), documents: () => [], assetNames: () => [],
    prepareMedia: async input => { const items = await f.importer.importBatch(input); expect(items[0].result.ok).toBe(true); prepared = items[0].result.value;
      edit = f.importer.prepareIndexEdit([prepared.preparationId]); expect(edit.ok).toBe(true); return { edit: edit.value, assetIds: [prepared.assetId] }; },
  });
  expect(review.ok).toBe(true);
  const asset = edit.value.indexPatches[0].changes[0].after[0];
  expect(asset.kind).toBe('org.test.asset/shape'); expect(asset.variants[0].typeData).toEqual({ typeVersion: 2, provider: f.provider, value: { label: 'frozen shape' } }); expect(asset.source.candidateId).toBe('CandAA');
  expect(f.importer.pendingVariants()).toEqual([{ assetId: asset.id, variantId: asset.activeVariantId }]);
  expect(f.releaseResource).toHaveBeenCalledOnce(); expect(f.releaseTypes).not.toHaveBeenCalled();
  await f.importer.confirm([prepared.preparationId]); expect(f.importer.pendingVariants()).toEqual([]); expect(f.releaseTypes).toHaveBeenCalledOnce(); expect(JSON.parse(await readFile(join(f.root, assetFilePath(asset.id, asset.activeVariantId, asset.variants[0].entry)), 'utf8'))).toEqual({ label: 'older file value' });
  await f.importer.close(); expect(f.releaseTypes).toHaveBeenCalledOnce();
});
it('rejects frozen data with a missing exact provider, type version or invalid schema', async () => {
  for (const change of [{ provider: { id: 'org.test.asset', version: '1.2.2' } }, { typeVersion: 1 }, { value: { label: 123 } }]) {
    const f = await fixture(); f.input.fileTypeData = [{ typeVersion: 2, provider: f.provider, value: { label: 'frozen shape' }, ...change }];
    expect((await f.importer.importBatch(f.input))[0].result.ok).toBe(false); expect(f.importer.pendingVariants()).toEqual([]);
    expect(f.releaseTypes).toHaveBeenCalledOnce(); expect(f.releaseResource).toHaveBeenCalledOnce();
  }
});
it('releases type/resource leases on rejected import, explicit discard and project close', async () => {
  const invalid = await fixture(); await writeFile(invalid.input.files[0], JSON.stringify({ label: 123 })); expect((await invalid.importer.importBatch(invalid.input))[0].result.ok).toBe(false); expect(invalid.releaseTypes).toHaveBeenCalledOnce(); expect(invalid.releaseResource).toHaveBeenCalledOnce();
  for (const close of [false, true]) { const f = await fixture(), items = await f.importer.importBatch(f.input), prepared = items[0].result.value; const edit = f.importer.prepareIndexEdit([prepared.preparationId]), asset = edit.value.indexPatches[0].changes[0].after[0];
    if (close) await f.importer.close(); else await f.importer.discard(prepared.preparationId);
    await expect(access(join(f.root, assetFilePath(asset.id, asset.activeVariantId, asset.variants[0].entry)))).rejects.toThrow(); expect(f.releaseTypes).toHaveBeenCalledOnce(); expect(f.releaseResource).toHaveBeenCalledOnce(); }
});
it('waits for an in-flight resource inspection and discards late preparations when closing', async () => {
  const f = await fixture(), entered = Promise.withResolvers(), gate = Promise.withResolvers();
  const inspect = f.inspect.getMockImplementation();
  f.inspect.mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return inspect(...args); });
  const importing = f.importer.importBatch(f.input); await entered.promise;
  let closed = false; const closing = f.importer.close(); void closing.then(() => { closed = true; });
  expect(f.importer.close()).toBe(closing);
  await Promise.resolve(); expect(closed).toBe(false); expect(f.releaseTypes).not.toHaveBeenCalled();
  expect((await f.importer.importBatch(f.input))[0].result).toMatchObject({ ok: false, error: { code: 'PROJECT_STALE' } });
  gate.resolve();
  const imported = await importing; await closing;
  expect(imported[0].result).toMatchObject({ ok: false, error: { code: 'PROJECT_STALE', message: expect.stringContaining('作品已关闭') } });
  expect(f.importer.pending.size).toBe(0); expect(f.importer.prepared.size).toBe(0); expect(f.importer.pendingVariants()).toEqual([]);
  expect((await readdir(join(f.root, 'assets'), { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())).toEqual([]);
  expect(f.assets.acquireTypes).toHaveBeenCalledOnce(); expect(f.inspect).toHaveBeenCalledOnce();
  expect(f.releaseResource).toHaveBeenCalledOnce(); expect(f.releaseTypes).toHaveBeenCalledOnce();
});
it('waits for an in-flight type acquisition and releases its lease without importing after close', async () => {
  const f = await fixture(), entered = Promise.withResolvers(), gate = Promise.withResolvers();
  const acquire = f.assets.acquireTypes.getMockImplementation();
  f.assets.acquireTypes.mockImplementation(async () => { entered.resolve(); await gate.promise; return acquire(); });
  const importing = f.importer.importBatch(f.input); await entered.promise;
  let closed = false; const closing = f.importer.close(); void closing.then(() => { closed = true; });
  await Promise.resolve(); expect(closed).toBe(false);
  expect((await f.importer.importBatch(f.input))[0].result).toMatchObject({ ok: false, error: { code: 'PROJECT_STALE' } });
  gate.resolve();
  expect((await importing)[0].result).toMatchObject({ ok: false, error: { code: 'PROJECT_STALE' } }); await closing;
  expect(f.importer.pending.size).toBe(0); expect(f.importer.prepared.size).toBe(0); expect(f.importer.pendingVariants()).toEqual([]);
  await expect(access(join(f.root, 'assets'))).rejects.toThrow();
  expect(f.assets.acquireTypes).toHaveBeenCalledOnce(); expect(f.assets.resourceProviders.resolve).not.toHaveBeenCalled();
  expect(f.releaseResource).not.toHaveBeenCalled(); expect(f.releaseTypes).toHaveBeenCalledOnce();
  await f.importer.close(); expect(f.releaseTypes).toHaveBeenCalledOnce();
});
it('rejects a late project selection before creating an adoption plan', async () => {
  const f = await fixture(), entered = Promise.withResolvers(), gate = Promise.withResolvers(), inspect = f.inspect.getMockImplementation();
  f.inspect.mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return inspect(...args); });
  const project = { projectId: 'WorkAA', documents: new Map(), readDocument: () => null, planEdit: vi.fn(() => ok({ planId: 'PlanAA' })) };
  const task = { schemaVersion: 1, id: 'TaskAA', projectId: project.projectId, createdAt: new Date().toISOString(), items: [{ id: 'ItemAA', state: 'review', candidateIds: ['CandAA'], sourceVersions: [], needsReview: false, target: { usage: 'background' } }] };
  const candidate = { id: 'CandAA', taskId: task.id, itemId: 'ItemAA', checks: [], partial: false, artifacts: [{ kind: 'org.test.asset/shape', role: 'primary', localPath: f.input.files[0] }] };
  const service = new ProductionService({ userData: join(f.root, 'userData'), project, adapter: () => { throw new Error('unused'); },
    review: (candidates, expected) => reviewProductionCandidates(candidates, expected, {
      projectId: project.projectId, choices: {}, findItem: () => task.items[0], scriptSource: () => ({}), bindingSource: () => ({}), documents: () => [], assetNames: () => [],
      prepareMedia: async input => {
        const imported = await f.importer.importBatch(input), preparations = imported.map(item => { if (!item.result.ok) throw new Error(item.result.error.message); return item.result.value; });
        const edit = f.importer.prepareIndexEdit(preparations.map(item => item.preparationId)); if (!edit.ok) throw new Error(edit.error.message);
        return { edit: edit.value, assetIds: preparations.map(item => item.assetId) };
      },
    }),
  });
  try {
    await service.store.saveTask(task); await service.store.saveCandidate(candidate); await service.open();
    const selecting = service.selectCandidates({ taskId: task.id, selections: [{ itemId: 'ItemAA', candidateId: candidate.id }], target: 'project', expected: [] });
    const rejected = expect(selecting).rejects.toThrow('作品已关闭'); await entered.promise;
    await service.close(); const closing = f.importer.close(); gate.resolve(); await rejected; await closing;
    expect(project.planEdit).not.toHaveBeenCalled(); expect(f.importer.pending.size).toBe(0); expect(f.importer.pendingVariants()).toEqual([]);
    expect((await readdir(join(f.root, 'assets'), { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())).toEqual([]);
    expect(f.releaseResource).toHaveBeenCalledOnce(); expect(f.releaseTypes).toHaveBeenCalledOnce();
  } finally { gate.resolve(); await service.close(); await f.importer.close(); }
});
