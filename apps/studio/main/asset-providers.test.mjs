import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AssetTypeRegistry, createAssetIndex, assetFilePath } from '@galcraft/assets';
import { fixtureId, FixtureAsset, FixtureVoiceAssets } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { backgroundReferences, selectedReferencePatches, StudioAssets } from './asset-providers.mjs';

const requireAssets = createRequire(new URL('../../../packages/assets/package.json', import.meta.url));
const sharp = requireAssets('sharp');
const root = resolve(import.meta.dirname, '../../../tmp/testing/projects/studio-background-adoption');
const projectId = fixtureId(0xb01);
const sceneId = fixtureId(0xb02);
const sceneDocumentId = fixtureId(0xb03);
const statementId = fixtureId(0xb04);
const otherStatementId = fixtureId(0xb08);
const projectDocumentId = fixtureId(0xb09);
const characterId = fixtureId(0xb0a);
const characterDocumentId = fixtureId(0xb0b);
const pageId = fixtureId(0xb0c);
const pageDocumentId = fixtureId(0xb0d);
const indexDocumentId = fixtureId(0xb05);
const assetId = fixtureId(0xb06);
const sourceVariantId = fixtureId(0xb07);
const sourcePath = join(root, ...assetFilePath(assetId, sourceVariantId, 'source.png').split('/'));
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n';
let session;
it('discards real prepared files when the final scope check rejects an import, and retains files after M02 accepts it',async()=>{
  session=await ProjectSession.createProject(root,projectId,[{documentId:indexDocumentId,revision:1,format:'json',files:{'assets/index.json':JSON.stringify(createAssetIndex(indexDocumentId))}}]);
  const image=join(root,'source.png');await sharp({create:{width:4,height:4,channels:4,background:'#f00'}}).png().toFile(image);
  const service=new StudioAssets({currentSession:session,currentRoot:root},resolve(import.meta.dirname,'../../../tools/media/runtime/bin'),null,null,null);let releases=0;
  service.assetTypes={acquire:async()=>({types:new AssetTypeRegistry(),release:async()=>{releases++;}})};
  const variantFiles=async()=>(await readdir(join(root,'assets'),{recursive:true})).filter(path=>path.endsWith('.png'));
  await expect(service.import([image],{beforeCommit(){throw new Error('协作已暂停');}})).rejects.toThrow('协作已暂停');
  expect(await variantFiles()).toEqual([]);expect(service.current().index.data.assets).toHaveLength(0);expect(session.operations).toHaveLength(0);expect(releases).toBe(1);
  const original=session.applyExternalEdit.bind(session),context={sessionId:'Collab01',callId:'Import01',scopeRevision:1,projectId,writeSessionId:'Write1'};
  session.applyExternalEdit=async(...args)=>{await original(...args);throw new Error('receipt response lost');};
  await expect(service.import([image,join(root,'missing.png')],{collaboration:context})).rejects.toThrow('receipt response lost');expect(await variantFiles()).toHaveLength(1);expect(service.current().index.data.assets).toHaveLength(1);expect(releases).toBe(2);
  expect((await session.lookupExternalCall(context)).ok).toBe(true);const batch=await service.lookupImport(context);expect(batch.succeeded).toHaveLength(1);expect(batch.succeeded[0].id).toBe(service.current().index.data.assets[0].id);expect(batch.failed).toHaveLength(1);expect(batch.failed[0].path).toBe(join(root,'missing.png'));expect(session.operations).toHaveLength(1);
});
it('protects formal references declared by a custom type when deleting assets', async () => {
  const asset = { ...structuredClone(FixtureAsset), id: assetId }, shape = { ...structuredClone(FixtureAsset), id: fixtureId(0xc40), kind: 'org.test.geometry/shape' };
  shape.variants[0].id = fixtureId(0xc41); shape.activeVariantId = shape.originalVariantId = shape.variants[0].id;
  shape.variants[0].typeData = { typeVersion: 1, provider: { id: 'org.test.geometry', version: '0.1.0' }, value: { texture: asset.id } };
  const index = { ...createAssetIndex(indexDocumentId), data: { assets: [asset, shape] } };
  session = await ProjectSession.createProject(root, projectId, [{ documentId: indexDocumentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
  const types = new AssetTypeRegistry([{ provider: shape.variants[0].typeData.provider, definition: { contractVersion: 1, key: shape.kind, typeVersion: 1, title: 'Geometry', description: '', icon: 'geometry', schema: true,
    fields: [], extensions: ['.shape.json'], targets: ['web', 'windows'], resourceProviderKey: 'org.test.geometry/parser', capabilities: [],
    collectReferences: value => [{ kind: 'asset', id: value.texture }], rewriteReferences: value => ({ ok: true, value, warnings: [] }) } }]);
  const service = new StudioAssets({ currentSession: session, currentRoot: root }, '', null, null, null);
  service.assetTypes = { acquire: async () => ({ types, release: async () => {} }) };
  expect((await service.typeCatalog()).value.find(entry => entry.descriptor.key === shape.kind)).toMatchObject({ count: 1, provider: shape.variants[0].typeData.provider });
  const references = await service.references(asset.id); expect(references.value[0].owner).toEqual({ kind: 'variant', id: shape.activeVariantId });
  expect((await service.remove([asset.id])).error.code).toBe('ASSET_REFERENCED');
  service.assetTypes = { acquire: async () => ({ types: new AssetTypeRegistry(), release: async () => {} }) };
  expect((await service.typeCatalog()).value.find(entry => entry.descriptor.key === shape.kind)).toMatchObject({ count: 1, unavailable: true });
  expect((await service.remove([asset.id])).error.code).toBe('ASSET_TYPE_UNAVAILABLE');
  expect(session.dirtyIds()).toEqual([]);
});
it('uses projected plugin document references for catalog filters, deletion, and replacement preparation without guessing field positions', async () => {
  const index = { ...createAssetIndex(indexDocumentId), data: { assets: [{ ...FixtureAsset, id: assetId }] } }, pluginDocumentId = fixtureId(0xc31);
  session = await ProjectSession.createProject(root, projectId, [
    { documentId: indexDocumentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } },
    { documentId: pluginDocumentId, revision: 1, format: 'json', files: { 'plugins/test/document.json': envelope(pluginDocumentId, { artwork: assetId }) } },
  ]);
  const service = new StudioAssets({ currentSession: session, currentRoot: root }, '', null, null, null);
  const reference = { assetId, owner: { kind: 'document', id: pluginDocumentId }, source: { documentId: pluginDocumentId, revision: 1 }, usage: 'pluginDocument', required: true, variantId: null, label: '插件文档 · artwork' };
  service.pluginReferences = async (_session, selected) => selected === null || selected === assetId ? [reference] : [];
  const query = { kind: null, folder: null, characterId: null, sceneId: null, locale: null, search: '', tags: [], reference: 'used', review: 'any', sort: 'name', direction: 'asc', offset: 0, limit: 40, indexRevision: null };
  expect((await service.query(query)).value.items.map(asset => asset.id)).toEqual([assetId]);
  expect((await service.query({ ...query, reference: 'unused' })).value.items).toEqual([]);
  expect((await service.allIds(query)).value.ids).toEqual([assetId]);
  expect((await service.references(assetId)).value).toEqual([reference]);
  const removed = await service.remove([assetId]); expect(removed.ok).toBe(false); expect(removed.error.code).toBe('ASSET_REFERENCED');
  const replaced = selectedReferencePatches(session, [reference], [{ after: { assetId: fixtureId(0xc32), variantId: null } }]);
  expect(replaced.ok).toBe(false); expect(replaced.error.code).toBe('REFERENCE_LOCATION');
  expect(selectedReferencePatches(session, [reference], [{ after: { assetId, variantId: fixtureId(0xc33) } }]).value).toEqual([]);
  expect(session.dirtyIds()).toEqual([]);
});
it('dispatches a plugin resource processor, retains its review candidate after view cleanup, and adopts through M02', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M0 0"/></svg>', index = createAssetIndex(indexDocumentId);
  const source = { ...FixtureAsset, id: assetId, revision: 1, kind: 'image', name: 'source.svg', originalVariantId: sourceVariantId, activeVariantId: sourceVariantId,
    variants: [{ id: sourceVariantId, parentId: null, role: 'original', files: [{ path: 'source.svg', bytes: Buffer.byteLength(svg), mime: 'image/svg+xml', role: 'entry' }],
      entry: 'source.svg', metadata: { width: 12, height: 12 }, canvas: { width: 12, height: 12, offsetX: 0, offsetY: 0 }, processing: null, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null }] };
  index.data.assets.push(source);
  session = await ProjectSession.createProject(root, projectId, [{ documentId: indexDocumentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
  const path = join(root, ...assetFilePath(assetId, sourceVariantId, 'source.svg').split('/')); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, svg);
  let previewRelease = 0;
  const resources = { register() { return { uri: 'galcraft-test://processor/result.svg', release() { previewRelease++; } }; } };
  const service = new StudioAssets({ currentSession: session, currentRoot: root }, '', null, null, resources); let release = 0;
  service.resourceProcessors = { async acquire(key) {
    expect(key).toBe('test.resource/resize'); return { packageVersion: '1.2.0', release() { release++; }, processor: { key, version: '0.1.0', fields: [], inputKinds: ['image'], outputKinds: ['image'], supportsCancel: true,
      async process({ source, outputDirectory }) { const text = (await source.readText(source.rootFile)).replace('12 12', '24 24'); await writeFile(join(outputDirectory, 'result.svg'), text);
        return { ok: true, warnings: [], value: { rootFile: 'result.svg', files: [{ path: 'result.svg', bytes: Buffer.byteLength(text), mime: 'image/svg+xml' }], metadata: {} } }; } } };
  } };
  const candidate = await service.processResource({ processorKey: 'test.resource/resize', assetId, sourceVariantId, settings: {} });
  expect(candidate.ok).toBe(true); expect(release).toBe(1);
  const preview = await service.previewResource(candidate.value.preparationId); expect(preview.value).toMatchObject({ mime: 'image/svg+xml', uri: 'galcraft-test://processor/result.svg' });
  service.releaseRuntime(preview.value.leaseId); expect(previewRelease).toBe(1);
  await service.discardPending(projectId); expect((await service.resourceCandidates()).value).toHaveLength(1);
  expect(service.get(assetId).value.variants).toHaveLength(1);
  const pluginDocumentId = fixtureId(0xc34), pluginPath = 'plugins/test/documents/artwork.json';
  const edit = session.planEdit({ label: '加入插件素材引用', origin: 'plugin', expected: [], preparedAssets: [], requiredRefs: [], patches: [{ kind: 'document', documentId: pluginDocumentId,
    op: 'create', before: null, after: { format: 'json', files: { [pluginPath]: envelope(pluginDocumentId, { artwork: assetId }) } } }] });
  expect(edit.ok).toBe(true); expect(session.applyEdit(edit.value.planId, []).ok).toBe(true);
  service.pluginReferences = async current => {
    const document = current.readDocument(pluginDocumentId), artwork = JSON.parse(document.files[pluginPath]).data.artwork;
    return [{ assetId: artwork, owner: { kind: 'document', id: pluginDocumentId }, source: { documentId: pluginDocumentId, revision: document.revision },
      usage: 'pluginDocument', required: true, variantId: null, label: 'artwork' }];
  };
  const stale = await service.confirmResource({ preparationId: candidate.value.preparationId }); expect(stale.ok).toBe(false); expect(stale.error.code).toBe('REPLACEMENT_SCOPE_STALE');
  const applied = await service.confirmResource({ preparationId: candidate.value.preparationId, activate: false }); expect(applied.ok).toBe(true);
  expect(service.get(assetId).value.variants).toHaveLength(2); expect(service.get(assetId).value.originalVariantId).toBe(sourceVariantId);
  expect(service.get(assetId).value.activeVariantId).toBe(sourceVariantId);
  expect(await readFile(path, 'utf8')).toBe(svg); expect((await service.resourceCandidates()).value).toHaveLength(0);
});

it('projects DSL model frames and transition assets without treating other UUID fields as assets', async () => {
  const images = Array.from({ length: 14 }, (_, index) => ({ ...FixtureAsset, id: fixtureId(0xd00 + index), sceneIds: [] }));
  const [figure, closed, half, open, blinkOpen, blinkClosed, closedOpen, halfOpen, openOpen,
    closedClosed, halfClosed, openClosed, transition, unused] = images;
  const args = { op: 'show', objectId: unused.id, assetId: figure.id,
    model: { imageMouth: { enabled: true, closed: closed.id, half: half.id, open: open.id },
      imageBlink: { enabled: true, open: blinkOpen.id, closed: blinkClosed.id },
      imageFaceCombinations: { closedOpen: closedOpen.id, halfOpen: halfOpen.id, openOpen: openOpen.id,
        closedClosed: closedClosed.id, halfClosed: halfClosed.id, openClosed: openClosed.id },
      expression: { name: unused.id } }, transition: { enter: { resourceId: transition.id } } };
  const index = { ...createAssetIndex(indexDocumentId), data: { assets: images } };
  const documents = new Map([[indexDocumentId, { documentId: indexDocumentId, revision: 1, files: { 'assets/index.json': JSON.stringify(index) } }],
    [sceneDocumentId, { documentId: sceneDocumentId, revision: 1, files: {
      [`scenes/${sceneId}/scene.json`]: envelope(sceneDocumentId, { id: sceneId, name: '表情场景' }),
      [`scenes/${sceneId}/script.gal`]: `changeFigure ${JSON.stringify(args)} @${statementId};`,
    } }]]);
  const currentSession = { projectId, documents };
  const refs = backgroundReferences(currentSession);
  expect(refs).toHaveLength(images.length - 1);
  expect(new Set(refs.map(ref => ref.assetId))).toEqual(new Set(images.slice(0, -1).map(image => image.id)));
  expect(refs.find(ref => ref.assetId === half.id).source.field).toBe('model.imageMouth.half');
  expect(backgroundReferences(currentSession, openClosed.id)).toHaveLength(1);
  const service = new StudioAssets({ currentSession, currentRoot: root }, '', null, null, null);
  const query = { kind: 'image', folder: null, characterId: null, sceneId, locale: null, search: '', tags: [],
    reference: 'used', review: 'any', sort: 'name', direction: 'asc', offset: 0, limit: 40, indexRevision: null };
  const used = await service.query(query);
  expect(used.ok).toBe(true);
  expect(new Set(used.value.items.map(image => image.id))).toEqual(new Set(images.slice(0, -1).map(image => image.id)));
  const unreferenced = await service.query({ ...query, sceneId: null, reference: 'unused' });
  expect(unreferenced.ok && unreferenced.value.items.map(image => image.id)).toEqual([unused.id]);
  documents.set(projectDocumentId, { documentId: projectDocumentId, revision: 1, files: {
    'presets/face.json': envelope(projectDocumentId, { statements: [{ command: 'changeFigure', args }] }),
  } });
  const presetRefs = backgroundReferences(currentSession, halfClosed.id).filter(ref => ref.source.documentId === projectDocumentId);
  expect(presetRefs).toHaveLength(1);
  expect(presetRefs[0].source.field).toBe('/data/statements/0/args/model/imageFaceCombinations/halfClosed');
});

it('projects current scene references and voice language into the paginated picker', async () => {
  const background = { ...FixtureAsset, sceneIds: [] }, voice = { ...FixtureVoiceAssets[0], sceneIds: [], locales: [] };
  const index = { ...createAssetIndex(indexDocumentId), data: { assets: [background, voice] } };
  const documents = new Map([[indexDocumentId, { documentId: indexDocumentId, revision: 1, files: { 'assets/index.json': JSON.stringify(index) } }],
    [sceneDocumentId, { documentId: sceneDocumentId, revision: 1, files: {
      [`scenes/${sceneId}/scene.json`]: envelope(sceneDocumentId, { id: sceneId, name: '开始' }),
      [`scenes/${sceneId}/script.gal`]: `changeBg {op:"show",assetId:"${background.id}"} @${statementId};\nsay {speaker:{kind:"narrator"},text:"你好",voiceByLocale:{ja:"${voice.id}"}} @${otherStatementId};`,
    } }]]);
  const service = new StudioAssets({ currentSession: { projectId, documents }, currentRoot: root }, '', null, null, null);
  const context = { projectId, allowedKinds: ['audio'], characterId: null, sceneId, locale: 'ja', currentAssetId: null, currentVariantId: null, tab: 'context' };
  const query = { kind: null, folder: null, characterId: null, sceneId: null, locale: null, search: '', tags: [], reference: 'any', review: 'any',
    sort: 'name', direction: 'asc', offset: 0, limit: 12, indexRevision: null };
  const picked = await service.picker({ context, query: { ...query, usage: 'voice' } });
  expect(picked.ok).toBe(true); expect(picked.value.items.map(item => item.id)).toEqual([voice.id]);
  const backgrounds = await service.query({ ...query, kind: 'image', sceneId, usage: 'background' });
  expect(backgrounds.ok).toBe(true); expect(backgrounds.value.items.map(item => item.id)).toEqual([background.id]);
  expect((await service.picker({ context: { ...context, projectId: fixtureId(0xc99) }, query })).error.code).toBe('PROJECT_STALE');
});

it('keeps simultaneous runtime assets alive when the asset browser changes its preview', () => {
  const released = [], variant = { id: sourceVariantId, entry: 'source.png', files: [{ path: 'source.png', mime: 'image/png', bytes: 1 }] };
  const currentSession = { projectId, documents: new Map([['index', { files: { 'assets/index.json': JSON.stringify({ data: { assets: [
    { id: assetId, kind: 'image', activeVariantId: sourceVariantId, variants: [variant] },
  ] } }) } }]]) };
  let next = 0;
  const resources = { register: () => { const id = ++next; return { uri: `galcraft-resource://${id}`, release: () => released.push(id) }; } };
  const assets = new StudioAssets({ currentSession, currentRoot: root }, '', null, null, resources);
  const a = assets.resolveRuntime(assetId, sourceVariantId), b = assets.resolveRuntime(assetId, sourceVariantId);
  expect(a.ok && b.ok).toBe(true);
  assets.preview(assetId); assets.stopPreview(); expect(released).toEqual([3]);
  assets.releaseRuntime(a.value.leaseId); expect(released).toEqual([3, 1]);
  assets.releaseRuntime(b.value.leaseId); expect(released).toEqual([3, 1, 2]);
});

afterEach(async () => {
  if (session) await session.dispose('discard');
  session = null;
  await rm(root, { recursive: true, force: true });
});

it('keeps the visible image thumbnail batch alive until replacement or explicit release', () => {
  const secondAssetId = fixtureId(0xb20), secondVariantId = fixtureId(0xb21);
  const image = (id, variantId) => ({ id, kind: 'image', activeVariantId: variantId,
    variants: [{ id: variantId, entry: 'source.png', files: [{ path: 'source.png', mime: 'image/png' }] }] });
  const index = { data: { assets: [image(assetId, sourceVariantId), image(secondAssetId, secondVariantId)] } };
  const documents = { currentSession: { projectId, documents: new Map([[indexDocumentId,
    { files: { 'assets/index.json': JSON.stringify(index) } }]]) }, currentRoot: root };
  const released = [];
  const resources = { register(input) { return { uri: `galcraft-test://${input.assetId}/${input.variantId}`,
    release: () => released.push(`${input.assetId}/${input.variantId}`) }; } };
  const service = new StudioAssets(documents, '', null, null, resources, '');
  const first = service.thumbnails([{ assetId }, { assetId: secondAssetId }, { assetId }]);
  expect(first.ok).toBe(true);
  expect(first.value).toHaveLength(2);
  expect(released).toHaveLength(0);
  const second = service.thumbnails([{ assetId: secondAssetId }]);
  expect(second.ok).toBe(true);
  expect(second.value).toHaveLength(1);
  expect(released).toEqual([`${assetId}/${sourceVariantId}`, `${secondAssetId}/${secondVariantId}`]);
  service.clearThumbnails();
  expect(released).toHaveLength(3);
});

it('adopts a prepared transparent image for one selected reference in the same saved document group', async () => {
  await rm(root, { recursive: true, force: true });
  const originalPixels = Buffer.from([255, 255, 255, 255, 20, 30, 40, 255]);
  const image = await sharp(originalPixels, { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
  const now = new Date().toISOString();
  const asset = { id: assetId, revision: 1, name: '立绘', kind: 'image', folder: [], tags: [], locales: [],
    characterId: null, sceneIds: [], groupId: null, originalVariantId: sourceVariantId, activeVariantId: sourceVariantId,
    variants: [{ id: sourceVariantId, parentId: null, role: 'original',
      files: [{ path: 'source.png', bytes: image.length, mime: 'image/png', role: 'entry' }], entry: 'source.png',
      metadata: { width: 2, height: 1, hasAlpha: true }, canvas: { width: 2, height: 1, offsetX: 0, offsetY: 0 },
      processing: null, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null }],
    sourceName: 'source.png', source: { kind: 'import', description: 'test', usage: 'localReview' },
    createdAt: now, modifiedAt: now };
  const index = createAssetIndex(indexDocumentId);
  index.data.assets.push(asset);
  const script = `changeBg {op:"show",assetId:"${assetId}"} @${statementId};\nchangeBg {op:"show",assetId:"${assetId}"} @${otherStatementId};`;
  session = await ProjectSession.createProject(root, projectId, [
    { documentId: indexDocumentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } },
    { documentId: projectDocumentId, revision: 1, format: 'json', files: {
      'project.json': envelope(projectDocumentId, { display: { titleBackground: assetId }, dynamicAssets: [assetId] }),
    } },
    { documentId: characterDocumentId, revision: 1, format: 'json', files: {
      [`characters/${characterId}.json`]: envelope(characterDocumentId,
        { id: characterId, avatar: assetId, appearance: { referenceAssets: [assetId] } }),
    } },
    { documentId: pageDocumentId, revision: 1, format: 'json', files: {
      [`ui/pages/${pageId}.json`]: envelope(pageDocumentId, { id: pageId, background: { imageId: assetId } }),
    } },
    { documentId: sceneDocumentId, revision: 1, format: 'dsl', files: {
      [`scenes/${sceneId}/scene.json`]: envelope(sceneDocumentId, { id: sceneId, name: '开始' }),
      [`scenes/${sceneId}/script.gal`]: script,
    } },
  ]);
  await mkdir(resolve(sourcePath, '..'), { recursive: true });
  await sharp(originalPixels, { raw: { width: 2, height: 1, channels: 4 } }).png().toFile(sourcePath);
  const projectDocuments = { currentSession: session, currentRoot: root };
  let operationCount = 0;
  const operations = { async start({ outputDirectory }) {
    operationCount++;
    await mkdir(outputDirectory, { recursive: true });
    const imagePath = join(outputDirectory, 'transparent.png');
    await sharp(Buffer.from([255, 255, 255, 0, 20, 30, 40, 255]),
      { raw: { width: 2, height: 1, channels: 4 } }).png().toFile(imagePath);
    return { ok: true, value: { imagePath, maskPath: null, width: 2, height: 1,
      result: { declared: 'removed', hasAlpha: true, hasTransparency: true },
      provider: 'node', providerVersion: '0.1.0', modelVersion: 'v1' }, warnings: [] };
  } };
  const resources = { register() { return { uri: 'galcraft-test://transparent', release() {} }; } };
  const service = new StudioAssets(projectDocuments, '', null, operations, resources, '');
  const prepared = await service.removeBackground({ assetId, sourceVariantId,
    choice: { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null }, declared: 'unchanged' });
  expect(prepared.ok).toBe(true);
  expect(prepared.value.references).toHaveLength(7);
  const selectedSources = prepared.value.references.filter(reference =>
    reference.source.statementId !== otherStatementId).map(reference => reference.source);
  const selected = await service.confirmBackground(prepared.value.preparationId,
    { kind: 'newAssetSelectedRefs', sources: selectedSources });
  expect(selected.ok).toBe(true);
  expect(selected.value.assetId).not.toBe(assetId);
  expect(selected.value.save.remainingDirty).toEqual([]);
  const reused = await service.removeBackground({ assetId: selected.value.assetId,
    sourceVariantId: selected.value.transparentVariantId,
    choice: { enabled: true, provider: 'comfy', connectionId: null, workflowBindingId: null }, declared: 'removed' });
  expect(reused.ok).toBe(true);
  expect(reused.value.status).toBe('reused');
  expect(operationCount).toBe(1);
  const pending = await service.removeBackground({ assetId, sourceVariantId,
    choice: { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null }, declared: 'unchanged' });
  expect(pending.ok).toBe(true);
  const pendingPath = join(root, ...assetFilePath(assetId, pending.value.transparentVariantId, 'transparent.png').split('/'));
  expect((await readFile(pendingPath)).length).toBeGreaterThan(0);
  expect((await service.discardPending(projectId)).ok).toBe(true);
  await expect(readFile(pendingPath)).rejects.toMatchObject({ code: 'ENOENT' });
  const reopened = await ProjectSession.open(root, projectId);
  try {
    const nextIndex = JSON.parse(reopened.readDocument(indexDocumentId).files['assets/index.json']);
    expect(nextIndex.data.assets).toHaveLength(2);
    expect(nextIndex.data.assets.find(value => value.id === assetId).activeVariantId).toBe(sourceVariantId);
    const nextScript = reopened.readRaw(sceneDocumentId).raw;
    expect(nextScript).toContain(selected.value.assetId);
    expect(nextScript).toContain(assetId);
    const nextProject = JSON.parse(reopened.readDocument(projectDocumentId).files['project.json']);
    expect(nextProject.data.display.titleBackground).toBe(selected.value.assetId);
    expect(nextProject.data.dynamicAssets).toEqual([selected.value.assetId]);
    const nextCharacter = JSON.parse(reopened.readDocument(characterDocumentId).files[`characters/${characterId}.json`]);
    expect(nextCharacter.data.avatar).toBe(selected.value.assetId);
    expect(nextCharacter.data.appearance.referenceAssets).toEqual([selected.value.assetId]);
    const nextPage = JSON.parse(reopened.readDocument(pageDocumentId).files[`ui/pages/${pageId}.json`]);
    expect(nextPage.data.background.imageId).toBe(selected.value.assetId);
    expect(await readFile(sourcePath)).toEqual(image);
    const derived = join(root, ...assetFilePath(selected.value.assetId, selected.value.transparentVariantId, 'transparent.png').split('/'));
    expect((await readFile(derived)).length).toBeGreaterThan(0);
  } finally { await reopened.dispose('discard'); }
});
