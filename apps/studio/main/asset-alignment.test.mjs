import { afterEach, expect, it } from 'vitest';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectSession } from '@galcraft/documents';
import { createId, validateJsonData } from '@galcraft/contracts';
import { FixtureAsset, FixtureProject } from '@galcraft/contracts/fixtures';
import { AssetTypeRegistry, assetFilePath, createAssetIndex } from '@galcraft/assets';
import { StudioAssets } from './asset-providers.mjs';
import { StudioCollaboration } from './collaboration-providers.mjs';
let root, project, owner;
afterEach(async () => { await owner?.close(); await project?.dispose('discard'); if (root) await rm(root, { recursive: true, force: true }); });
const value = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value; };
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
it('uses exact M04 contracts and checks the real reference closure before M12 adopts processing or type-data changes', async () => {
  root = await mkdtemp(join(tmpdir(), 'galcraft-ao2-assets-'));
  const index = createAssetIndex(createId()), projectDocumentId = createId(), svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M0 0"/></svg>';
  const asset = structuredClone(FixtureAsset); asset.id = createId(); asset.name = 'reference.svg';
  const variant = { id: createId(), parentId: null, role: 'original', files: [{ path: 'reference.svg', bytes: Buffer.byteLength(svg), mime: 'image/svg+xml', role: 'entry' }], entry: 'reference.svg',
    metadata: { width: 12, height: 12 }, canvas: { width: 12, height: 12, offsetX: 0, offsetY: 0 }, processing: null, targets: { web: 'direct', windows: 'direct' }, groupCapabilities: null,
    typeData: { provider: { id: 'test.artwork', version: '0.1.0' }, typeVersion: 1, value: { note: 'Original reference' } } };
  asset.variants = [variant]; asset.activeVariantId = asset.originalVariantId = variant.id; index.data.assets.push(asset);
  project = await ProjectSession.createProject(join(root, 'project'), FixtureProject.projectId, [{ documentId: index.documentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } },
    { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, { ...FixtureProject, display: { ...FixtureProject.display, titleBackground: asset.id } }) } }]);
  const path = join(root, 'project', ...assetFilePath(asset.id, variant.id, variant.entry).split('/')); await mkdir(dirname(path), { recursive: true }); await writeFile(path, svg);
  const field = { path: 'width', label: 'Width', description: 'Output width', type: 'integer', required: true, nullable: false, default: 24, unit: 'px', min: 1, group: 'basic', summary: true, keywords: [] };
  const type = { contractVersion: 1, key: 'test.artwork/image', builtinKind: 'image', typeVersion: 1, title: 'Artwork image', description: '', icon: 'image', schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'], additionalProperties: false }, fields: [], extensions: ['.svg'], targets: ['web', 'windows'], resourceProviderKey: null, capabilities: [], collectReferences: () => [], rewriteReferences: data => ({ ok: true, value: data, warnings: [] }) };
  let previewReleases = 0; const previewRecords = [];
  const projects = { currentSession: project, currentRoot: join(root, 'project'), currentSessionId: 'Write1' }, assets = new StudioAssets(projects, '', null, null, { register: input => { previewRecords.push(input); return { uri: `test://${input.assetId}/${input.variantId}/${input.relative}`, release() { previewReleases++; } }; } });
  assets.assetTypes = { acquire: async () => ({ types: new AssetTypeRegistry([{ provider: variant.typeData.provider, definition: type }]), release() {} }) };
  let processes = 0;
  const processor = { key: 'test.artwork/resize', version: '0.1.0', fields: [field], inputKinds: ['image'], outputKinds: ['image'], supportsCancel: true, async process({ source, outputDirectory }) {
    processes++; const output = (await source.readText(source.rootFile)).replace('12 12', '24 24'); await writeFile(join(outputDirectory, 'result.svg'), output);
    return { ok: true, warnings: [], value: { rootFile: 'result.svg', files: [{ path: 'result.svg', bytes: Buffer.byteLength(output), mime: 'image/svg+xml' }], metadata: {} } };
  } };
  assets.resourceProcessors = { list: async () => [{ ...processor, process: undefined, packageVersion: '0.1.0' }], acquire: async () => ({ processor, packageVersion: '0.1.0', release() {} }) };
  owner = new StudioCollaboration({ userData: join(root, 'user'), projects, production: {}, assets, plugins: { externalTools: async () => [] } }); await owner.ready;
  const scope = { documents: [index.documentId], createKinds: [], tools: ['galcraft_assets'], operations: [], connectionIds: [], models: [], workflowIds: [], maxGenerations: 0 };
  const collaboration = await owner.core.create({ projectId: project.projectId, writeSessionId: 'Write1', projectName: 'AO2 assets', goal: 'Process current artwork', harness: 'codex', scope });
  const invoke = async (input, callId, expected = 'completed') => { const record = await owner.core.invoke('galcraft_assets', input, collaboration.id, callId); expect(record.state, JSON.stringify(record)).toBe(expected); return record; };
  expect((await invoke({ action: 'typeContract', kind: 'image', provider: variant.typeData.provider }, 'type-contract')).result.descriptor.schema).toEqual(type.schema);
  const contract = (await invoke({ action: 'processorContract', processorKey: processor.key, packageVersion: '0.1.0' }, 'processor-contract')).result;
  expect(validateJsonData(contract.settingsSchema, { width: '24' }).ok).toBe(false);
  const invalid = await invoke({ action: 'processResource', processorKey: processor.key, packageVersion: '0.1.0', assetId: asset.id, sourceVariantId: variant.id, expectedRevision: asset.revision, settings: { width: '24' } }, 'invalid-settings', 'failed');
  expect(invalid.errorCode).toBe('PROCESSOR_SETTINGS'); expect(processes).toBe(0);
  const prepared = (await invoke({ action: 'processResource', processorKey: processor.key, packageVersion: '0.1.0', assetId: asset.id, sourceVariantId: variant.id, expectedRevision: asset.revision, settings: { width: 24 } }, 'process')).result.candidate;
  const detail = (await invoke({ action: 'resourceCandidate', preparationId: prepared.preparationId }, 'candidate-detail')).result.candidate;
  expect(detail.variant.processing).toMatchObject({ toolId: processor.key, inputVariantId: variant.id }); expect(detail.variant.typeData).toEqual(variant.typeData);
  const denied = await invoke({ action: 'confirmResource', preparationId: prepared.preparationId }, 'adopt-outside-scope', 'failed'); expect(denied.errorCode).toBe('DOCUMENT_SCOPE');
  expect(value(assets.get(asset.id)).variants).toHaveLength(1); expect(value(await assets.resourceCandidates())).toHaveLength(1);
  await owner.core.update({ id: collaboration.id, expectedRevision: 1, scope: { ...scope, documents: [index.documentId, projectDocumentId] } });
  const adopted = (await invoke({ action: 'confirmResource', preparationId: prepared.preparationId }, 'adopt')).result.receipt;
  expect(adopted.assetIds).toContain(asset.id); expect(value(assets.get(asset.id)).variants).toHaveLength(2); expect(processes).toBe(1);
  expect(await readFile(path, 'utf8')).toBe(svg);
  const changed = value(assets.get(asset.id)), typed = (await invoke({ action: 'editTypeData', assetId: changed.id, variantId: changed.activeVariantId, expectedRevision: changed.revision,
    typeData: { ...variant.typeData, value: { note: 'Updated reference note' } } }, 'edit-type-data')).result;
  expect(value(assets.get(asset.id)).variants.find(item => item.id === typed.variantId).typeData.value).toEqual({ note: 'Updated reference note' });
  const lookup = await project.lookupExternalCall({ projectId: project.projectId, writeSessionId: 'Write1', sessionId: collaboration.id, scopeRevision: 2, callId: 'edit-type-data', toolKey: 'galcraft_assets' });
  expect(lookup.ok).toBe(true); expect(lookup.value.operationId).toBe(typed.receipt.operationId); expect(owner.core.get(collaboration.id).generations).toBe(0);
  const preparedAsset = structuredClone(asset), preparedVariantId = createId(); preparedAsset.id = createId(); preparedAsset.variants[0].id = preparedVariantId;
  preparedAsset.originalVariantId = preparedAsset.activeVariantId = preparedVariantId;
  const preparedPath = join(projects.currentRoot, ...assetFilePath(preparedAsset.id, preparedVariantId, variant.entry).split('/')); await mkdir(dirname(preparedPath), { recursive: true }); await copyFile(path, preparedPath);
  const beforePreview = project.readDocument(index.documentId), preview = value(await assets.previewPreparedAssets([preparedAsset]));
  expect(preview.assets[0]).toMatchObject({ assetId: preparedAsset.id, variantId: preparedVariantId, typeData: variant.typeData, metadata: variant.metadata, canvas: variant.canvas });
  expect(previewRecords.at(-1).path).toBe(preparedPath); expect(preview.locations[0].uri).toBe(`test://${preparedAsset.id}/${preparedVariantId}/${variant.entry}`);
  expect(project.readDocument(index.documentId)).toEqual(beforePreview); expect(value(assets.get(preparedAsset.id))).toBeNull();
  for (const leaseId of preview.leaseIds) assets.releaseRuntime(leaseId); expect(previewReleases).toBe(1);
});
