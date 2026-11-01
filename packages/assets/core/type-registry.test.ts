import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AssetSchema, createId } from '@galcraft/contracts';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import type { Asset, AssetTypeData, Json, Result } from '@galcraft/contracts';
import type { AssetTypeDefinition, ResourceProvider } from '@galcraft/plugins/contracts';
import { AssetCatalog, assetFilePath, createAssetIndex } from './catalog.js';
import { AssetTypeRegistry } from './type-registry.js';
import { ImportCoordinator } from './import.js';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const provider = { id: 'org.test.polygon', version: '0.1.0' }, kind = 'org.test.polygon/shape' as const;
const definition: AssetTypeDefinition = { contractVersion: 1, key: kind, typeVersion: 1, title: 'Shape', description: '', icon: 'shape',
  schema: { type: 'object', additionalProperties: false, required: ['vertices', 'color', 'reference'], properties: {
    vertices: { type: 'array', minItems: 3, items: { type: 'number' } }, color: { type: 'string', pattern: '^#[0-9a-f]{6}$' }, reference: { type: ['string', 'null'] } } },
  fields: [{ path: 'color', label: 'Color', description: '', type: 'string', required: true, nullable: false, default: '#123456', unit: 'none', group: 'basic', summary: true, keywords: [] }], filterFields: ['color'], extensions: ['.shape.json'], targets: ['web', 'windows'], resourceProviderKey: provider.id + '/parser', capabilities: ['visual'],
  collectReferences: value => (value as { reference: string | null }).reference ? [{ kind: 'asset', id: (value as { reference: string }).reference }] : [],
  rewriteReferences: (value, mapping) => { const data = value as { reference: string | null }; return ok({ ...data, reference: data.reference ? mapping[data.reference] ?? data.reference : null }); },
  rewriteFile(path, bytes, mapping) { if (!path.endsWith('.shape.json')) return ok(bytes); const data = JSON.parse(new TextDecoder().decode(bytes));
    return ok(new TextEncoder().encode(JSON.stringify({ ...data, reference: mapping[data.reference] ?? data.reference }))); },
};
const types = () => new AssetTypeRegistry([{ definition, provider }]);
const data = (reference: string | null = null): AssetTypeData => ({ typeVersion: 1, provider, value: { vertices: [1, 2, 3], color: '#123456', reference } });
function asset(typeData = data()): Asset {
  const value = structuredClone(FixtureAsset); value.kind = kind;
  value.variants.forEach(variant => { variant.typeData = structuredClone(typeData); variant.targets = { web: 'direct', windows: 'direct' }; variant.groupCapabilities = null; });
  return value;
}
const roots: string[] = [];
it('associates a declared builtin kind and legacy resolver with one exact ordinary provider without rewriting old data', () => {
  const association: AssetTypeDefinition = { ...definition, builtinKind: 'live2d', resourceProviderAliases: ['legacy.example.model'] };
  const registry = new AssetTypeRegistry([{ definition: association, provider }]);
  expect(registry.list().filter(item => item.descriptor.key === 'live2d')).toHaveLength(1);
  expect(registry.definition('live2d')).toMatchObject({ ok: true, value: { provider } });
  expect(registry.resolveResourceProviderKey('legacy.example.model')).toBe(definition.resourceProviderKey);
  expect(registry.rewrite('live2d', undefined, {})).toEqual(ok(undefined));
  expect(() => registry.register({ definition: { ...association, key: 'org.other.model/model', resourceProviderKey: 'org.other.model/parser' }, provider: { id: 'org.other.model', version: '0.1.0' } })).toThrow('Duplicate builtin');
  expect(registry.definition('live2d', { ...data(), provider: { ...provider, version: '2.0.0' } }).ok).toBe(false);
});
it('uses the same extension identity, capability constraint, search and page totals for library and picker', () => {
  const assets = Array.from({ length: 45 }, (_, index) => ({ ...asset(), id: createId(), name: `Shape ${String(index).padStart(2, '0')}` }));
  const catalog = new AssetCatalog({ ...createAssetIndex(createId()), revision: 7, data: { assets } }, types());
  const query = { kind, allowedCapabilities: ['visual'], search: 'shape', folder: null, characterId: null, sceneId: null, locale: null, tags: [], reference: 'any' as const, review: 'any' as const, sort: 'name' as const, direction: 'asc' as const, offset: 40, limit: 40, indexRevision: 7 };
  const page = catalog.queryAssets(query), picked = catalog.queryPicker({ query, context: { projectId: createId(), allowedKinds: [kind], allowedCapabilities: ['visual'], characterId: null, sceneId: null, locale: null, currentAssetId: assets[0]!.id, currentVariantId: assets[0]!.activeVariantId, tab: 'all' } });
  expect(page.ok && [page.value.total, page.value.items.length]).toEqual([45, 5]); expect(picked.ok && picked.value.items).toEqual(page.ok && page.value.items);
  expect(catalog.queryAssets({ ...query, allowedCapabilities: ['audio'] })).toMatchObject({ ok: true, value: { total: 0 } });
  expect(catalog.queryAssets({ ...query, typeFields: { color: '#123456' } })).toMatchObject({ ok: true, value: { total: 45 } });
  expect(catalog.queryAssets({ ...query, typeFields: { color: '#ffffff' } })).toMatchObject({ ok: true, value: { total: 0 } });
  expect(catalog.queryAssets({ ...query, typeFields: { undeclared: 'x' } })).toMatchObject({ ok: false, error: { code: 'QUERY_TYPE_FIELDS' } });
  const missing = new AssetCatalog(catalog.snapshot()); expect(missing.queryAssets({ ...query, allowedCapabilities: undefined })).toMatchObject({ ok: true, value: { total: 45 } });
  expect(missing.queryAssets(query)).toMatchObject({ ok: true, value: { total: 0 } });
});
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it('preserves opaque unknown values on open, pins provider/data versions, and blocks interpretation', () => {
  const value = asset({ ...data(), typeVersion: 8, value: { future: { preserved: ['all', 'fields'] } } });
  const index = { ...createAssetIndex(createId()), data: { assets: [value] } };
  const catalog = new AssetCatalog(index, types());
  expect(catalog.snapshot()).toEqual(index);
  expect(AssetSchema.parse(value)).toEqual(value);
  const result = catalog.resolveAsset({ assetId: value.id, variantId: null, target: 'web', usage: 'stage' }, () => 'uri');
  expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('ASSET_TYPE_UNAVAILABLE');
  expect(types().validate(kind, { ...data(), provider: { ...provider, version: '1.1.0' } }).ok).toBe(false);
  expect(types().validate(kind, { ...data(), value: { vertices: [1], color: 'red', reference: null } }).ok).toBe(false);
  expect(new AssetTypeRegistry().validate('image').ok).toBe(true);
  expect(() => new AssetTypeRegistry([{ definition, provider }, { definition, provider }])).toThrow('Duplicate');
  expect(() => new AssetTypeRegistry([{ definition, provider: { ...provider, id: 'org.other.plugin' } }])).toThrow('ownership');
});

it('collects referenced assets recursively, includes their files, and reports missing references', () => {
  const texture = structuredClone(FixtureAsset); texture.id = createId(); texture.variants.forEach(variant => { variant.targets = { web: 'direct', windows: 'direct' }; });
  const shape = asset(data(texture.id)), index = { ...createAssetIndex(createId()), data: { assets: [shape, texture] } };
  const collected = new AssetCatalog(index, types()).collectAssets([{ assetId: shape.id, variantId: null, required: true, owner: { kind: 'document', id: index.documentId }, usage: 'test' }], 'web');
  expect(collected.issues).toEqual([]); expect(collected.assets.map(value => value.assetId)).toEqual([shape.id, texture.id]);
  expect(collected.assets[0]!.typeData).toEqual(data(texture.id)); expect(collected.references.some(value => value.assetId === texture.id)).toBe(true);
  const missing = new AssetCatalog({ ...index, data: { assets: [shape] } }, types()).collectAssets([], 'web', { includeUnused: true });
  expect(missing.issues.some(value => value.code === 'ASSET_TYPE_REFERENCE_MISSING')).toBe(true);
});

it('imports real custom files, saves index losslessly, creates immutable edited variants, and rewrites copied files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-e1-')); roots.push(root);
  const source = join(root, 'input.shape.json'); await writeFile(source, JSON.stringify(data().value));
  let index = createAssetIndex(createId());
  const resource: ResourceProvider = { key: provider.id + '/parser', kind, extensions: ['.shape.json'], inspect: async (entry, _files, source) => ok({ files: [entry], metadata: {},
    typeData: { ...data(), value: JSON.parse(await source!.readText(entry)) as Json }, capabilities: { resolver: provider.id + '/parser', resolverVersion: provider.version, format: 'shape', formatVersion: '1', capabilities: [], parameters: [], expressions: [], motions: [], missingFiles: [] } }) };
  const coordinator = new ImportCoordinator(root, '', () => index, undefined, undefined, async () => ({ provider: resource, release() {} }), types());
  const result = (await coordinator.importBatch({ projectId: createId(), files: [source], folder: [], conflict: 'ask', usage: null, targetBinding: null }))[0]!.result;
  if (!result.ok) throw new Error(result.error.message);
  const accept = (preparationId: string) => { const edit = coordinator.prepareIndexEdit([preparationId]); if (!edit.ok) throw new Error(edit.error.message);
    const patch = edit.value.indexPatches[0]!; if (patch.kind !== 'json') throw new Error('JSON edit expected'); index = { ...index, revision: index.revision + 1, data: { assets: patch.changes[0]!.after as Asset[] } }; coordinator.confirm([preparationId]); };
  accept(result.value.preparationId);
  await writeFile(join(root, 'index.json'), JSON.stringify(index)); expect(new AssetCatalog(JSON.parse(await readFile(join(root, 'index.json'), 'utf8')), types()).snapshot()).toEqual(index);
  const original = structuredClone(index.data.assets[0]!); const next = { ...data(), value: { vertices: [3, 4, 5], color: '#aabbcc', reference: original.id } };
  const edited = await coordinator.prepareTypeData({ assetId: original.id, variantId: original.activeVariantId, expectedRevision: original.revision, typeData: next });
  if (!edited.ok) throw new Error(edited.error.message); accept(edited.value.preparationId);
  const current = index.data.assets[0]!;
  expect(current.variants[0]).toEqual(original.variants[0]); expect(current.variants.at(-1)!.typeData).toEqual(next);
  expect((await coordinator.prepareTypeData({ assetId: original.id, variantId: original.activeVariantId, expectedRevision: original.revision, typeData: next })).ok).toBe(false);
  const copied = await coordinator.copyAsset(current.id); if (!copied.ok) throw new Error(copied.error.message); accept(copied.value.preparationId);
  const copy = index.data.assets.at(-1)!; expect((copy.variants.at(-1)!.typeData!.value as { reference: string }).reference).toBe(copy.id);
  for (const variant of copy.variants) for (const file of variant.files) expect((await readFile(join(root, assetFilePath(copy.id, variant.id, file.path)))).length).toBe(file.bytes);
  const absent = new ImportCoordinator(root, '', () => index); const rejected = await absent.copyAsset(current.id); expect(rejected.ok).toBe(false);
});
