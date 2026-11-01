import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectSession } from '@galcraft/documents';
import type { Asset, AssetReference, Id, ProductionItem } from '@galcraft/contracts';
import { AssetCatalog, createAssetIndex, indexEdit } from './catalog.js';
import { ImportCoordinator } from './import.js';
import { decodeSVGInImage, inspectSVG } from './svg.js';
import { UIAssetAdoptionCoordinator, type UIReplacementRef } from './ui-adoption.js';
import { createWorkOrder, exportWorkOrder, matchWorkReturn, prepareWorkReturnEdit, readWorkReturn } from './work-order.js';
import { planAssetCleanup } from './cleanup.js';
import type { ResourceProvider } from '@galcraft/plugins/contracts';

const root = resolve('tmp/testing/assets-core');
const project = join(root, 'project');
const ids = { project: randomUUID(), index: randomUUID(), asset: randomUUID(), variant: randomUUID(),
  old: randomUUID(), scene: randomUUID(), item: randomUUID() };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><path id="shape" d="M0 0"/></defs><use href="#shape"/></svg>';
const decode = async () => ({ ok: true as const, value: undefined, warnings: [] });
describe('插件资源普通导入', () => {
  it('passes actual source text and bytes to the parser, imports its exact collection, and releases its package handle', async () => {
    const directory = join(root, 'source-group'); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'scene.spark'), '{"texture":"pixels.bin"}'); await writeFile(join(directory, 'pixels.bin'), new Uint8Array([1, 2, 3]));
    await writeFile(join(directory, 'unrelated.txt'), 'leave out');
    let releases = 0;
    const provider: ResourceProvider = { key: 'test.resource/parser', extensions: ['.spark'], async inspect(rootFile, _files, source) {
      expect(rootFile).toBe('scene.spark'); expect(JSON.parse(await source!.readText(rootFile))).toEqual({ texture: 'pixels.bin' });
      expect([...await source!.readBytes('pixels.bin')]).toEqual([1, 2, 3]);
      return { ok: true, warnings: [], value: { files: [rootFile, 'pixels.bin'], metadata: {}, capabilities: { resolver: 'test.resource/parser', resolverVersion: '0.1.0',
        format: 'spark', formatVersion: '1', capabilities: ['play'], parameters: [], motions: [], expressions: [], missingFiles: [] } } };
    } };
    const index = createAssetIndex(ids.index), coordinator = new ImportCoordinator(project, '', () => index, undefined, decode,
      async () => ({ provider, release() { releases++; } }));
    const result = await coordinator.importBatch({ projectId: ids.project, files: [join(directory, 'scene.spark')], folder: [], conflict: 'ask', usage: null, targetBinding: null });
    expect(result[0]!.result.ok).toBe(true); expect(releases).toBe(1); if (!result[0]!.result.ok) return;
    const edit = coordinator.prepareIndexEdit([result[0]!.result.value.preparationId]); if (!edit.ok) throw new Error(edit.error.message);
    const assets = (edit.value.indexPatches[0] as any).changes[0].after as Asset[], variant = assets[0]!.variants[0]!;
    expect(assets[0]!.kind).toBe('effect'); expect(variant.role).toBe('group'); expect(variant.files.map(file => file.path)).toEqual(['scene.spark', 'pixels.bin']);
    expect(variant.groupCapabilities?.resolver).toBe(provider.key);
    expect([...await readFile(join(project, 'assets/files', assets[0]!.id, variant.id, 'pixels.bin'))]).toEqual([1, 2, 3]);
  });
});

function asset(overrides: Partial<Asset> = {}): Asset {
  const date = '2026-09-23T00:00:00Z';
  return { id: ids.asset, revision: 1, name: 'same.svg', kind: 'image', folder: [], tags: [], locales: [],
    characterId: null, sceneIds: [], groupId: null, originalVariantId: ids.old, activeVariantId: ids.variant,
    variants: [{ id: ids.old, parentId: null, role: 'original', files: [{ path: 'old.svg', bytes: 10, mime: 'image/svg+xml', role: 'entry' }],
      entry: 'old.svg', metadata: { width: 24, height: 24 }, canvas: { width: 24, height: 24, offsetX: 0, offsetY: 0 },
      processing: null, targets: { web: 'direct', windows: 'direct' }, groupCapabilities: null },
    { id: ids.variant, parentId: ids.old, role: 'original', files: [{ path: 'new.svg', bytes: 11, mime: 'image/svg+xml', role: 'entry' }],
      entry: 'new.svg', metadata: { width: 24, height: 24 }, canvas: { width: 24, height: 24, offsetX: 0, offsetY: 0 },
      processing: null, targets: { web: 'direct', windows: 'direct' }, groupCapabilities: null }],
    sourceName: 'same.svg', source: { kind: 'import', description: 'input', usage: 'localReview' }, createdAt: date, modifiedAt: date,
    ...overrides };
}
function query() {
  return { kind: null, folder: null, characterId: null, sceneId: null, locale: null, search: '', tags: [],
    reference: 'any' as const, review: 'any' as const, sort: 'name' as const, direction: 'asc' as const,
    offset: 0, limit: 40, indexRevision: null };
}
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('M04 catalog and reference projection', () => {
  it('includes each approved UI purpose tag before the asset is referenced', () => {
    const approved = ['ui:icon', 'ui:frame', 'ui:background', 'ui:texture', 'ui:logo', 'ui:decoration'];
    const images = approved.map(tag => asset({ id: randomUUID(), name: tag, tags: [tag] }));
    const unrelated = asset({ id: randomUUID(), tags: ['ui:unknown', 'figure'] });
    const catalog = new AssetCatalog({ ...createAssetIndex(ids.index), data: { assets: [...images, unrelated] } });
    const result = catalog.queryPicker({ context: { projectId: ids.project, allowedKinds: ['image'], characterId: null,
      sceneId: null, locale: null, currentAssetId: null, currentVariantId: null, tab: 'all' },
      query: { ...query(), usage: 'ui', reference: 'unused' } });
    expect(result.ok).toBe(true);
    expect(result.ok && new Set(result.value.items.map(item => item.id))).toEqual(new Set(images.map(item => item.id)));
  });
  it('paginates picker filters while retaining a precise current binding and enforcing kinds on all tabs', () => {
    const role = randomUUID(), missing = randomUUID(), documentId = randomUUID();
    const images = Array.from({ length: 45 }, (_, i) => asset({ id: randomUUID(), name: `背景 ${String(i).padStart(2, '0')}`, characterId: role, tags: ['夜'] }));
    const sound = asset({ id: randomUUID(), kind: 'audio', name: '背景音' });
    const catalog = new AssetCatalog({ ...createAssetIndex(ids.index), revision: 7, data: { assets: [...images, sound] } });
    catalog.documentChanged(documentId, images.map(image => ({ assetId: image.id, owner: { kind: 'statement', id: randomUUID() },
      source: { documentId, revision: 1, field: 'assetId' }, usage: 'changeBg', required: true, variantId: null })), new Map(), ids.scene);
    const context = { projectId: ids.project, allowedKinds: ['image' as const], characterId: role, sceneId: ids.scene,
      locale: null, currentAssetId: images[0]!.id, currentVariantId: ids.old, tab: 'context' as const };
    const filtered = { ...query(), usage: 'background', tags: ['夜'], offset: 40, limit: 10 };
    const picked = catalog.queryPicker({ context, query: filtered });
    expect(picked.ok && picked.value.total).toBe(45);
    expect(picked.ok && picked.value.items).toHaveLength(5);
    expect(picked.ok && picked.value.current?.shownVariant?.id).toBe(ids.old);
    expect(picked.ok && picked.value.rows.every(row => row.shownVariant?.id === ids.variant)).toBe(true);
    const all = catalog.queryPicker({ context: { ...context, tab: 'all' }, query: { ...query(), kind: 'audio' } });
    expect(all.ok && all.value.items).toEqual([]);
    const recent = catalog.queryPicker({ context: { ...context, tab: 'recent' }, query: query() }, [images[2]!.id, sound.id, missing]);
    expect(recent.ok && recent.value.items.map(item => item.id)).toEqual([images[2]!.id]);
    expect(recent.ok && recent.value.missingRecentIds).toEqual([missing]);
    expect(catalog.queryPicker({ context, query: { ...query(), indexRevision: 6 } }).ok).toBe(false);
  });
  it('freezes full filtered IDs and keeps a precise old binding distinct from the active version', () => {
    const second = asset({ id: randomUUID(), name: 'same.svg' });
    const index = { ...createAssetIndex(ids.index), revision: 7, data: { assets: [asset(), second] } };
    const catalog = new AssetCatalog(index);
    const ref: AssetReference = { assetId: ids.asset, owner: { kind: 'scene', id: ids.scene }, usage: 'background', required: true, variantId: ids.old };
    catalog.documentChanged(ids.scene, [ref]);
    expect(catalog.queryAssets({ ...query(), reference: 'used' }).ok).toBe(true);
    const all = catalog.queryAssetIds({ ...query(), offset: 20, limit: 1 });
    expect(all.ok && all.value.ids).toHaveLength(2);
    const rows = catalog.describeAssetRows({ assetIds: [ids.asset, second.id], indexRevision: 7,
      currentAssetId: ids.asset, currentVariantId: ids.old });
    expect(rows.ok && rows.value.items[0]?.sameNameCount).toBe(2);
    expect(rows.ok && rows.value.items[0]?.shownVariant?.id).toBe(ids.old);
    expect(rows.ok && rows.value.items[0]?.shownVariant?.active).toBe(false);
    expect(catalog.describeAssetRows({ assetIds: [ids.asset], indexRevision: 6,
      currentAssetId: ids.asset, currentVariantId: ids.old }).ok).toBe(false);
    const collected = catalog.collectAssets([ref], 'web');
    expect(collected.assets[0]?.variantId).toBe(ids.old);
    expect(collected.files[0]?.path).toContain(ids.old);
  });
  it('locates required release assets at their saved source', () => {
    const source = { documentId: ids.scene, statementId: randomUUID(), revision: 3 };
    const catalog = new AssetCatalog({ ...createAssetIndex(ids.index), data: { assets: [asset()] } });
    const missing = catalog.collectAssets([{ assetId: randomUUID(), variantId: null, owner: { kind: 'scene', id: ids.scene },
      source, usage: 'release', required: true }], 'web');
    expect(missing.issues[0]).toMatchObject({ code: 'ASSET_MISSING', severity: 'error', source, entity: { kind: 'asset' } });
    const unverified = catalog.collectAssets([{ assetId: ids.asset, variantId: ids.variant, owner: { kind: 'scene', id: ids.scene },
      source, usage: 'release', required: true }], 'android');
    expect(unverified.issues[0]).toMatchObject({ code: 'TARGET_UNVERIFIED', source, entity: { kind: 'asset', id: ids.asset } });
  });
  it('keeps picker media restrictions while clearing character and language context', () => {
    const role = randomUUID();
    const chinese = asset({ id: randomUUID(), kind: 'audio', characterId: role, locales: ['zh-CN'], name: 'voice-cn.wav' });
    const japanese = asset({ id: randomUUID(), kind: 'audio', characterId: role, locales: ['ja'], name: 'voice-ja.wav' });
    const unknown = asset({ id: randomUUID(), kind: 'audio', characterId: role, locales: [], name: 'voice-unknown.wav' });
    const image = asset({ id: randomUUID(), name: 'portrait.png' });
    const catalog = new AssetCatalog({ ...createAssetIndex(ids.index), data: { assets: [chinese, japanese, unknown, image] } });
    const context = { projectId: ids.project, allowedKinds: ['audio' as const], characterId: role, sceneId: null,
      locale: 'ja', currentAssetId: randomUUID(), currentVariantId: null, tab: 'context' as const };
    expect(catalog.picker(context).items.map(value => value.id)).toEqual([japanese.id]);
    expect(catalog.picker(context).currentMissing).toBe(true);
    expect(catalog.picker({ ...context, tab: 'all' }).items.map(value => value.id)).toEqual([chinese.id, japanese.id, unknown.id]);
    expect(catalog.nextRecentIds([japanese.id, chinese.id], japanese.id)).toEqual([japanese.id, chinese.id]);
    const recent = catalog.picker({ ...context, tab: 'recent' }, [japanese.id, ids.old]);
    expect(recent.missingRecentIds).toEqual([ids.old]);
    expect(recent.recentEntries.map(value => [value.assetId, value.missing, value.removable]))
      .toEqual([[japanese.id, false, false], [ids.old, true, true]]);
    catalog.rebuildReferences(new Map([[ids.scene, { references: [], linkedLocales: new Map([[unknown.id, ['ja']]]) }]]));
    expect(catalog.picker(context).items.map(value => value.id)).toEqual([japanese.id, unknown.id]);
  });
});

describe('M04 import and M02 ownership', () => {
  it('imports valid SVG, rejects another item, then commits, saves and undoes the index through M02', async () => {
    await mkdir(root, { recursive: true });
    const good = join(root, '图标.svg');
    const bad = join(root, 'bad.svg');
    const mislabeled = join(root, 'photo.png');
    await writeFile(good, svg);
    await writeFile(bad, '<svg viewBox="0 0 0 24"><script/></svg>');
    await writeFile(mislabeled, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const index = createAssetIndex(ids.index);
    const session = await ProjectSession.createProject(project, ids.project, [{ documentId: ids.index, revision: 1,
      format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
    const readIndex = () => JSON.parse(session.readDocument(ids.index)!.files['assets/index.json']!) as typeof index;
    const importer = new ImportCoordinator(project, join(root, 'tools'), readIndex, undefined, decode);
    const imported = await importer.importBatch({ projectId: ids.project, files: [good, bad, mislabeled], folder: ['UI'],
      conflict: 'ask', usage: 'image', targetBinding: null });
    expect(imported.map(item => item.result.ok)).toEqual([true, false, false]);
    expect(!imported[2]!.result.ok && imported[2]!.result.error.code).toBe('MEDIA_SIGNATURE');
    const preparationId = imported[0]!.result.ok ? imported[0]!.result.value.preparationId : ids.item;
    const edit = importer.prepareIndexEdit([preparationId]);
    expect(edit.ok).toBe(true);
    if (!edit.ok) throw new Error(edit.error.message);
    const plan = session.planEdit({ label: 'import', origin: 'batch', expected: edit.value.expected,
      patches: edit.value.indexPatches, preparedAssets: edit.value.preparedAssets, requiredRefs: [] });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.error.message);
    const receipt = session.applyEdit(plan.value.planId, edit.value.expected);
    expect(receipt.ok).toBe(true);
    const savedPlan = session.planSave({ kind: 'all' });
    if (!savedPlan.ok) throw new Error(savedPlan.error.message);
    expect((await session.save(savedPlan.value.planId)).ok).toBe(true);
    expect(JSON.parse(await readFile(join(project, 'assets', 'index.json'), 'utf8')).data.assets).toHaveLength(1);
    const undo = session.planUndo(ids.index, receipt.ok ? receipt.value.operationId : undefined);
    if (!undo.ok) throw new Error(undo.error.message);
    expect(session.undo(undo.value.planId).ok).toBe(true);
    expect(readIndex().data.assets).toHaveLength(0);
    await session.dispose('discard');
  });

  it('adopts only selected replacement versions and preserves later metadata edits', async () => {
    const first = join(root, 'one', 'same.svg');
    const second = join(root, 'two', 'same.svg');
    await mkdir(join(root, 'one'), { recursive: true });
    await mkdir(join(root, 'two'), { recursive: true });
    await writeFile(first, svg);
    await writeFile(second, svg.replace('M0 0', 'M1 1'));
    const index = { ...createAssetIndex(ids.index), data: { assets: [asset()] } };
    const importer = new ImportCoordinator(project, join(root, 'tools'), () => structuredClone(index), undefined, decode);
    const rows = await importer.importBatch({ projectId: ids.project, files: [first, second], folder: [],
      conflict: 'replace', usage: 'image', targetBinding: null });
    expect(rows.map(row => row.result.ok)).toEqual([true, true]);
    const firstId = rows[0]!.result.ok ? rows[0]!.result.value.preparationId : ids.item;
    const secondId = rows[1]!.result.ok ? rows[1]!.result.value.preparationId : ids.item;
    index.data.assets[0]!.name = 'renamed.svg';
    index.data.assets[0]!.tags = ['author'];
    index.data.assets[0]!.revision = 2;
    index.revision = 2;
    const selected = importer.prepareIndexEdit([secondId]);
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.error.message);
    const patch = selected.value.indexPatches[0];
    if (patch?.kind !== 'json') throw new Error('Missing index patch');
    const adopted = (patch.changes[0]!.after as Asset[])[0]!;
    expect(adopted.name).toBe('renamed.svg');
    expect(adopted.tags).toEqual(['author']);
    expect(adopted.variants).toHaveLength(3);
    expect(adopted.variants.at(-1)?.parentId).toBe(ids.variant);
    expect(adopted.activeVariantId).toBe(rows[1]!.result.ok && rows[1]!.result.value.variantId);
    const both = importer.prepareIndexEdit([firstId, secondId]);
    expect(both.ok && (both.value.indexPatches[0]?.kind === 'json' &&
      (both.value.indexPatches[0].changes[0]?.after as Asset[])[0]?.variants.length)).toBe(4);
    importer.confirm([secondId]);
    expect(importer.pendingVariants().map(value => value.variantId))
      .toEqual([rows[0]!.result.ok && rows[0]!.result.value.variantId]);
  });

  it('adopts the second same-name replacement alone when both files were prepared from an empty index', async () => {
    const first = join(root, 'one', 'same.svg');
    const second = join(root, 'two', 'same.svg');
    await mkdir(join(root, 'one'), { recursive: true });
    await mkdir(join(root, 'two'), { recursive: true });
    await writeFile(first, svg);
    await writeFile(second, svg.replace('M0 0', 'M1 1'));
    const importer = new ImportCoordinator(project, join(root, 'tools'), () => createAssetIndex(ids.index), undefined, decode);
    const rows = await importer.importBatch({ projectId: ids.project, files: [first, second], folder: [],
      conflict: 'replace', usage: 'image', targetBinding: null });
    expect(rows.map(row => row.result.ok)).toEqual([true, true]);
    const firstId = rows[0]!.result.ok ? rows[0]!.result.value.preparationId : ids.item;
    const secondId = rows[1]!.result.ok ? rows[1]!.result.value.preparationId : ids.item;
    const secondVariant = rows[1]!.result.ok ? rows[1]!.result.value.variantId : ids.variant;
    const selected = importer.prepareIndexEdit([secondId]);
    if (!selected.ok || selected.value.indexPatches[0]?.kind !== 'json') throw new Error('Expected selected index patch');
    const adopted = (selected.value.indexPatches[0].changes[0]!.after as Asset[])[0]!;
    expect(adopted.variants.map(variant => variant.id)).toEqual([secondVariant]);
    expect(adopted.originalVariantId).toBe(secondVariant);
    expect(adopted.variants[0]?.parentId).toBeNull();
    expect(adopted.source.description).toBe(second);
    const both = importer.prepareIndexEdit([firstId, secondId]);
    if (!both.ok || both.value.indexPatches[0]?.kind !== 'json') throw new Error('Expected combined index patch');
    const combined = (both.value.indexPatches[0].changes[0]!.after as Asset[])[0]!;
    expect(combined.variants).toHaveLength(2);
    expect(combined.variants[1]?.parentId).toBe(combined.variants[0]?.id);
    const reversed = importer.prepareIndexEdit([secondId, firstId]);
    if (!reversed.ok || reversed.value.indexPatches[0]?.kind !== 'json') throw new Error('Expected reverse selection index patch');
    const reverseAsset = (reversed.value.indexPatches[0].changes[0]!.after as Asset[])[0]!;
    expect(reverseAsset.variants.map(variant => variant.id)).toEqual(combined.variants.map(variant => variant.id));
    expect(reverseAsset.variants[1]?.parentId).toBe(combined.variants[0]?.id);
    expect(reverseAsset.originalVariantId).toBe(combined.originalVariantId);
    expect(reverseAsset.activeVariantId).toBe(combined.activeVariantId);
  });

  it('requires the ordinary resource provider before importing a model group', async () => {
    const directory = join(root, 'model');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'hero.model3.json'), JSON.stringify({ Version: 3, FileReferences: {
      Moc: 'hero.moc3', Textures: ['texture/0.png', 'texture/1.png'],
      MotionSync: [{ Name: 'Basic_CRI', File: 'motionsync/basic.motionsync3.json' }] } }));
    await writeFile(join(directory, 'hero.moc3'), 'moc');
    const importer = new ImportCoordinator(project, join(root, 'tools'), () => createAssetIndex(ids.index));
    const rows = await importer.importBatch({ projectId: ids.project, files: [directory], folder: [],
      conflict: 'ask', usage: 'live2d', targetBinding: null });
    const result = rows[0]!.result;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RESOURCE_PROVIDER_MISSING');
    }
  });

  it('passes a complete model group through the X ResourceProvider inspection contract', async () => {
    const directory = join(root, 'model');
    await mkdir(join(directory, 'motionsync'), { recursive: true });
    await writeFile(join(directory, 'hero.model3.json'), JSON.stringify({ Version: 3, FileReferences: {
      Moc: 'hero.moc3', MotionSync: [{ Name: 'Basic_CRI', File: 'motionsync/basic.motionsync3.json' }] } }));
    await writeFile(join(directory, 'hero.moc3'), 'moc');
    await writeFile(join(directory, 'motionsync', 'basic.motionsync3.json'), '{}');
    let inspected = 0;
    const provider = { key: 'live2d', extensions: ['.model3.json'], inspect: async (rootFile: string, files: string[]) => {
      inspected++;
      expect(rootFile).toBe('hero.model3.json');
      expect(files).toContain('motionsync/basic.motionsync3.json');
      return { ok: true as const, value: { files, metadata: {}, capabilities: { resolver: 'live2d',
        resolverVersion: '0.1.0', format: 'live2d', formatVersion: '3', capabilities: ['motionsync'],
        parameters: [], motions: [], expressions: [], missingFiles: [] } }, warnings: [] };
    } };
    const importer = new ImportCoordinator(project, join(root, 'tools'), () => createAssetIndex(ids.index), provider);
    const rows = await importer.importBatch({ projectId: ids.project, files: [directory], folder: [],
      conflict: 'ask', usage: 'live2d', targetBinding: null });
    expect(rows[0]?.result.ok).toBe(true);
    expect(inspected).toBe(1);
    const id = rows[0]!.result.ok ? rows[0]!.result.value.preparationId : ids.item;
    const edit = importer.prepareIndexEdit([id]);
    if (!edit.ok || edit.value.indexPatches[0]?.kind !== 'json') throw new Error('Missing model patch');
    expect((edit.value.indexPatches[0].changes[0]?.after as Asset[])[0]?.variants[0]?.files.map(file => file.path))
      .toContain('motionsync/basic.motionsync3.json');
  });

  it('preserves declared provider capabilities before target playback verification', async () => {
    const directory = join(root, 'model'); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'hero.model3.json'), '{}');
    const capabilities = { resolver: 'org.example.model/parser', resolverVersion: '0.1.0', format: 'model', formatVersion: '3',
      capabilities: ['physics', 'pose', 'amplitudeLip', 'motionSync'], parameters: [], motions: [], expressions: [], missingFiles: [] };
    const provider = { key: capabilities.resolver, kind: 'live2d' as const, extensions: ['.model3.json'], inspect: async (entry: string) => ({ ok: true as const, value: { files: [entry], metadata: {}, capabilities }, warnings: [] }) };
    const importer = new ImportCoordinator(project, join(root, 'tools'), () => createAssetIndex(ids.index), undefined, undefined, async () => ({ provider, release() {} }));
    const rows = await importer.importBatch({ projectId: ids.project, files: [directory], folder: [], conflict: 'ask', usage: 'live2d', targetBinding: null });
    const result = rows[0]!.result; if (!result.ok) throw new Error(result.error.message);
    const edit = importer.prepareIndexEdit([result.value.preparationId]);
    if (!edit.ok || edit.value.indexPatches[0]?.kind !== 'json') throw new Error('Missing model patch');
    expect((edit.value.indexPatches[0].changes[0]?.after as Asset[])[0]?.variants[0]?.groupCapabilities).toEqual(capabilities);
  });
});

describe('M04 SVG and UI adoption', () => {
  it('accepts internal vector references and identifies blocked features', () => {
    const checked = inspectSVG({ source: svg });
    expect(checked.ok && checked.value.intrinsic.width).toBe(24);
    const rejected = inspectSVG({ source: '<svg viewBox="0 0 24 24"><use href="https://x"/><text>Hi</text><script/></svg>' });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.issues.map(value => value.code)).toEqual(expect.arrayContaining(['SVG_ELEMENT', 'SVG_EXTERNAL']));
  });

  it('requires a real image decode capability before accepting SVG', async () => {
    const unavailable = await decodeSVGInImage(svg);
    expect(!unavailable.ok && unavailable.error.code).toBe('SVG_DECODE_UNAVAILABLE');
    await mkdir(root, { recursive: true });
    const candidate = join(root, 'icon.svg');
    await writeFile(candidate, svg);
    const importer = new ImportCoordinator(project, join(root, 'tools'), () => createAssetIndex(ids.index));
    const rows = await importer.importBatch({ projectId: ids.project, files: [candidate], folder: [],
      conflict: 'ask', usage: 'image', targetBinding: null });
    expect(!rows[0]!.result.ok && rows[0]!.result.error.code).toBe('SVG_DECODE_UNAVAILABLE');
  });

  it('requires a full reference set for all and preserves old active version for selected replacements', async () => {
    await mkdir(root, { recursive: true });
    const candidate = join(root, 'candidate.svg');
    await writeFile(candidate, svg);
    const index = { ...createAssetIndex(ids.index), data: { assets: [asset()] } };
    const ref: UIReplacementRef = { assetId: ids.asset, variantId: ids.old,
      owner: { kind: 'page', id: ids.scene }, source: { documentId: ids.scene, field: '/visual/icon', revision: 2 },
      usage: 'icon', required: true };
    const coordinator = new UIAssetAdoptionCoordinator(project, join(root, 'tools'), () => index, () => [ref], undefined, decode);
    const base = { projectId: ids.project, candidate: { taskId: ids.item, candidateId: randomUUID(),
      artifactIndex: 0, path: candidate, name: 'new.svg' },
      expected: [{ ref: { kind: 'document' as const, id: ids.scene }, revision: 2 },
        { ref: { kind: 'document' as const, id: ids.index }, revision: index.revision }] };
    const stale = await coordinator.prepareUIAssetAdoption({ ...base,
      expected: [{ ref: { kind: 'document', id: ids.index }, revision: index.revision + 1 }],
      choice: { key: 'stale', source: { assetId: ids.asset, variantId: ids.variant }, destination: 'newVariant',
        replace: { mode: 'none', refs: [] } } });
    expect(!stale.ok && stale.error.code).toBe('UI_INDEX_CHANGED');
    const incomplete = await coordinator.prepareUIAssetAdoption({ ...base, choice: { key: 'icon',
      source: { assetId: ids.asset, variantId: ids.variant }, destination: 'newVariant',
      replace: { mode: 'all', refs: [] } } });
    expect(incomplete.ok).toBe(false);
    const roundTrippedRef: UIReplacementRef = { ...ref, owner: { id: ref.owner.id, kind: ref.owner.kind },
      source: { revision: ref.source.revision, field: ref.source.field, documentId: ref.source.documentId } };
    const selected = await coordinator.prepareUIAssetAdoption({ ...base, choice: { key: 'icon',
      source: { assetId: ids.asset, variantId: ids.variant }, destination: 'newVariant',
      replace: { mode: 'selected', refs: [roundTrippedRef] } } });
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      const next = selected.value.indexPatches[0];
      expect(next?.kind === 'json' && (next.changes[0]?.after as Asset[])[0]?.activeVariantId).toBe(ids.variant);
      expect(selected.value.replacementRefs).toEqual([ref]);
      if (next?.kind === 'json') {
        const generated = (next.changes[0]!.after as Asset[])[0]!.variants.find(variant => variant.id === selected.value.variantId)!;
        expect(generated.entry).toBe('new_界面_001.svg');
        expect(await readFile(join(project, 'assets', 'files', selected.value.assetId, selected.value.variantId, generated.entry!), 'utf8')).toBe(svg);
      }
    }
    const all = await new UIAssetAdoptionCoordinator(project, join(root, 'tools'), () => index, async () => [ref],
      () => [{ ref: { kind: 'document', id: ids.scene }, revision: 2 }], decode).prepareUIAssetAdoption({ ...base,
        choice: { key: 'icon-all', source: { assetId: ids.asset, variantId: ids.variant },
          destination: 'newVariant', replace: { mode: 'all', refs: [roundTrippedRef] } } });
    expect(all.ok).toBe(true);
    if (all.ok) {
      const patch = all.value.indexPatches[0];
      expect(patch?.kind === 'json' && (patch.changes[0]?.after as Asset[])[0]?.activeVariantId).toBe(all.value.variantId);
    }
  });
});

describe('M04 production handoff and cleanup', () => {
  it('exports ID based orders and separates duplicate, changed and unmatched returns', () => {
    const item: ProductionItem = { id: ids.item, sceneId: ids.scene, statementId: randomUUID(), characterId: null,
      usage: 'voice', locale: 'ja', specification: '', sourceVersions: [{ ref: { kind: 'statement', id: ids.scene }, revision: 1 }],
      state: 'notStarted', selectedAssetId: null, selectedCandidateId: null, taskId: null, spokenText: 'spoken', voicePresetId: null };
    const silent: ProductionItem = { ...item, id: randomUUID(), state: 'intentionalEmpty' };
    const order = createWorkOrder({ projectId: ids.project, items: [item, silent], textByItem: new Map([[ids.item, 'display']]) });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.text).toBe('display');
    expect(order.items[0]?.spokenText).toBe('spoken');
    const archive = exportWorkOrder(order);
    const normalized = readWorkReturn(archive);
    expect(normalized.ok && normalized.value.manifest?.workOrderId).toBe(order.id);
    const matched = matchWorkReturn(order, null, [`${ids.item}_voice.wav`, `${ids.item}_voice2.wav`, 'unknown.wav'],
      new Map([[ids.item, [{ ref: { kind: 'statement', id: ids.scene }, revision: 2 }]]]));
    expect(matched.duplicates).toHaveLength(1);
    expect(matched.unmatched).toEqual(['unknown.wav']);
    const wrong = matchWorkReturn(order, { workOrderId: randomUUID(), projectId: ids.project, items: [] },
      [`${ids.item}_voice.wav`], new Map([[ids.item, item.sourceVersions]]));
    expect(wrong.identityMatches).toBe(false);
    expect(wrong.matched).toEqual([]);
    const edit = indexEdit(createAssetIndex(ids.index), []);
    if (!edit.ok) throw new Error(edit.error.message);
    const blocked = prepareWorkReturnEdit({ index: edit.value, references: [], referencePatches: [], expected: [],
      acceptedItemIds: [], matches: wrong, currentVersions: new Map(), confirmedChanges: [] });
    expect(!blocked.ok && blocked.error.code).toBe('WORK_ORDER_MISMATCH');
    const changed = matchWorkReturn(order, null, [`${ids.item}_voice.wav`],
      new Map([[ids.item, [{ ref: { kind: 'statement', id: ids.scene }, revision: 2 }]]]));
    const current = new Map([[ids.item, changed.matched[0]!.observedVersions]]);
    const draft = { index: edit.value, references: [], referencePatches: [], expected: [], acceptedItemIds: [ids.item],
      matches: changed, currentVersions: current };
    expect(prepareWorkReturnEdit({ ...draft, confirmedChanges: [] }).ok).toBe(false);
    expect(prepareWorkReturnEdit({ ...draft, confirmedChanges: [{ itemId: ids.item,
      changedInputs: changed.matched[0]!.changedInputs }] }).ok).toBe(true);
  });

  it('keeps indexed and externally held variants out of the cleanup plan', async () => {
    const held = randomUUID();
    const orphan = randomUUID();
    await mkdir(join(project, 'assets', 'files', ids.asset, ids.variant), { recursive: true });
    await mkdir(join(project, 'assets', 'files', ids.asset, held), { recursive: true });
    await mkdir(join(project, 'assets', 'files', ids.asset, orphan), { recursive: true });
    const index = { ...createAssetIndex(ids.index), data: { assets: [asset()] } };
    const result = await planAssetCleanup(project, index, [{ assetId: ids.asset, variantId: held }], false);
    expect(result.ok && result.value.directories).toEqual([`assets/files/${ids.asset}/${orphan}`]);
  });
});

describe('generated asset adoption names', () => {
  it('writes readable filenames and resolves collisions within one prepared batch', async () => {
    await mkdir(root,{recursive:true}); const source=join(root,`${randomUUID()}.svg`);await writeFile(source,svg);
    const index=createAssetIndex(ids.index), coordinator=new ImportCoordinator(project,'',()=>index,undefined,decode);
    const items=await coordinator.importBatch({projectId:ids.project,files:[source,source],fileNames:['雨站_界面_001.svg','雨站_界面_001.svg'],folder:[],conflict:'keepBoth',usage:null,targetBinding:null});
    expect(items.every(item=>item.result.ok)).toBe(true);
    const prepared=items.map(item=>item.result.ok?item.result.value.preparationId:'');
    const edit=coordinator.prepareIndexEdit(prepared);expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    const patch=edit.value.indexPatches[0];if(!patch||patch.kind!=='json')throw new Error('expected asset index');
    const adopted=patch.changes.find(change=>change.path==='/data/assets')!.after as Asset[];
    expect(adopted.map(asset=>asset.name)).toEqual(['雨站_界面_001.svg','雨站_界面_002.svg']);
    for(const asset of adopted){const variant=asset.variants[0]!;expect(variant.entry).toBe(asset.name);expect(await readFile(join(project,'assets/files',asset.id,variant.id,variant.entry),'utf8')).toBe(svg);}
    await Promise.all(prepared.map(id=>coordinator.discard(id)));
  });
});
