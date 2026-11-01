import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ProjectSession } from '@galcraft/documents';
import type { ResourceProcessorContribution } from '@galcraft/plugins/contracts';
import { createAssetIndex, assetFilePath } from '../core/catalog.js';
import { ImportCoordinator } from '../core/import.js';
import { ok } from '../core/result.js';
import { PluginResourceProcessor } from './plugin.js';
import { planAssetCleanup } from '../core/cleanup.js';

const root = resolve('tmp/testing/plugin-resource-processing');
let session: ProjectSession | null = null;
afterEach(async () => { await session?.dispose('discard'); session = null; await rm(root, { recursive: true, force: true }); });
async function sourceAsset() {
  const index = createAssetIndex(randomUUID()), projectId = randomUUID(), source = join(root, 'source.svg');
  await mkdir(root, { recursive: true }); await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M0 0"/></svg>');
  const importer = new ImportCoordinator(root, '', () => index, undefined, async () => ok(undefined));
  const prepared = await importer.importBatch({ projectId, files: [source], folder: [], conflict: 'ask', usage: null, targetBinding: null });
  if (!prepared[0]!.result.ok) throw new Error(prepared[0]!.result.error.message);
  const edit = importer.prepareIndexEdit([prepared[0]!.result.value.preparationId]); if (!edit.ok) throw new Error(edit.error.message);
  index.data.assets = (edit.value.indexPatches[0] as any).changes[0].after;
  return { index, asset: index.data.assets[0]!, projectId };
}
const processor = (): ResourceProcessorContribution => ({ key: 'test.resource/resize', version: '0.1.0', inputKinds: ['image'], outputKinds: ['image'], supportsCancel: true,
  fields: [{ path: 'width', label: 'Width', description: 'Output width', type: 'integer', required: false, nullable: false, default: 24, unit: 'px', min: 1, group: 'basic', summary: true, keywords: [] }],
  async process({ source, outputDirectory }) {
    expect(Buffer.from(await source.readBytes(source.rootFile)).toString('utf8')).toBe(await source.readText(source.rootFile));
    const text = (await source.readText(source.rootFile)).replace('12 12', '24 24'), path = join(outputDirectory, 'result.svg');
    await writeFile(path, text); return ok({ rootFile: 'result.svg', files: [{ path: 'result.svg', bytes: Buffer.byteLength(text), mime: 'image/svg+xml' }], metadata: {} });
  } });
it('keeps original files and review candidates across reopen, then adopts and saves through one M02 transaction', async () => {
  const { index, asset, projectId } = await sourceAsset(), projectRoot = join(root, 'project'), relativeSource = assetFilePath(asset.id, asset.originalVariantId, 'source.svg');
  session = await ProjectSession.createProject(projectRoot, projectId, [{ documentId: index.documentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
  const sourcePath = join(projectRoot, ...relativeSource.split('/')); await mkdir(dirname(sourcePath), { recursive: true }); await copyFile(join(root, ...relativeSource.split('/')), sourcePath);
  const current = () => { const document = session!.readDocument(index.documentId)!; return { ...JSON.parse(document.files['assets/index.json']!), revision: document.revision }; };
  const processing = new PluginResourceProcessor(projectRoot, '', current);
  const prepared = await processing.prepare({ assetId: asset.id, sourceVariantId: asset.originalVariantId, settings: { width: 24 } }, processor(), '1.4.0');
  expect(prepared.ok).toBe(true); if (!prepared.ok) return;
  expect(current().data.assets[0].variants).toHaveLength(1); expect(await readFile(sourcePath, 'utf8')).toContain('12 12');
  const cleanup = await planAssetCleanup(projectRoot, current(), [], false); if (!cleanup.ok) throw new Error(cleanup.error.message);
  expect(cleanup.value.directories).toEqual([]); expect(cleanup.value.retained).toEqual([{ assetId: asset.id, variantId: prepared.value.variant.id }]);
  const reopened = new PluginResourceProcessor(projectRoot, '', current); await reopened.open(); expect(reopened.candidates()).toHaveLength(1);
  const edit = reopened.prepareIndexEdit(prepared.value.preparationId); if (!edit.ok) throw new Error(edit.error.message);
  const planned = session.planEdit({ label: '采用处理候选', origin: 'candidate', expected: edit.value.expected, patches: edit.value.indexPatches, preparedAssets: edit.value.preparedAssets, requiredRefs: [] });
  if (!planned.ok) throw new Error(planned.error.message);
  const applied = session.applyEdit(planned.value.planId, edit.value.expected); expect(applied.ok).toBe(true); await reopened.confirm(prepared.value.preparationId);
  const saving = session.planSave({ kind: 'all' }); if (!saving.ok) throw new Error(saving.error.message); expect((await session.save(saving.value.planId)).ok).toBe(true);
  expect(current().data.assets[0].variants).toHaveLength(2); expect(current().data.assets[0].originalVariantId).toBe(asset.originalVariantId);
  expect(current().data.assets[0].variants[1].processing).toEqual({ toolId: 'test.resource/resize', toolVersion: '1.4.0', inputVariantId: asset.originalVariantId, settings: { kind: 'plugin', settings: { width: 24 } } });
  expect(await readFile(sourcePath, 'utf8')).toContain('12 12'); const saved = JSON.parse(await readFile(join(projectRoot, 'assets/index.json'), 'utf8')); expect(saved.data.assets[0].variants).toHaveLength(2);
});
it('preserves the active version after output failure, and cancellation discards late results when the processor cannot stop', async () => {
  const { index, asset } = await sourceAsset(), processing = new PluginResourceProcessor(root, '', () => index);
  const broken = { ...processor(), async process({ outputDirectory }: any) { await writeFile(join(outputDirectory, 'bad.svg'), 'invalid'); return ok({ rootFile: 'bad.svg', files: [{ path: 'bad.svg', bytes: 7, mime: 'image/svg+xml' }], metadata: {} }); } };
  expect((await processing.prepare({ assetId: asset.id, sourceVariantId: asset.originalVariantId, settings: {} }, broken, '0.1.0')).ok).toBe(false);
  expect(index.data.assets[0]!.activeVariantId).toBe(asset.originalVariantId); expect(processing.candidates()).toHaveLength(0);
  const controller = new AbortController(); let finish!: () => void, begin!: () => void;
  const started = new Promise<void>(resolve => { begin = resolve; }), done = new Promise<void>(resolve => { finish = resolve; });
  const late = { ...processor(), supportsCancel: false, async process(input: any, signal: AbortSignal) { begin(); await done; expect(signal.aborted).toBe(false); return processor().process(input, signal); } };
  const pending = processing.prepare({ assetId: asset.id, sourceVariantId: asset.originalVariantId, settings: {} }, late, '0.1.0', controller.signal);
  await started; controller.abort(); finish(); const result = await pending; expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('CANCELLED');
  expect(processing.candidates()).toHaveLength(0); expect(index.data.assets[0]!.variants).toHaveLength(1);
});
it('rejects changed source identity before candidate adoption and retains the prepared result for review', async () => {
  const { index, asset } = await sourceAsset(), processing = new PluginResourceProcessor(root, '', () => index);
  const prepared = await processing.prepare({ assetId: asset.id, sourceVariantId: asset.originalVariantId, settings: {} }, processor(), '0.1.0'); if (!prepared.ok) throw new Error(prepared.error.message);
  asset.revision++; const adopted = processing.prepareIndexEdit(prepared.value.preparationId); expect(adopted.ok).toBe(false);
  if (!adopted.ok) expect(adopted.error.code).toBe('RESOURCE_SOURCE_CHANGED'); expect(processing.candidates()).toHaveLength(1);
  await processing.discard(prepared.value.preparationId); expect(processing.candidates()).toHaveLength(0);
});
it('rejects invalid settings and a stale source revision before invoking the real processor', async () => {
  const { index, asset } = await sourceAsset(), processing = new PluginResourceProcessor(root, '', () => index);
  let sends = 0;
  const implementation = { ...processor(), process: async (...args: Parameters<ResourceProcessorContribution['process']>) => { sends++; return processor().process(...args); } };
  const invalid = await processing.prepare({ assetId: asset.id, sourceVariantId: asset.activeVariantId, settings: { width: '24' } }, implementation, '0.1.0');
  expect(invalid).toMatchObject({ ok: false, error: { code: 'PROCESSOR_SETTINGS', owner: 'M04' } });
  expect(await processing.prepare({ assetId: asset.id, sourceVariantId: asset.activeVariantId, expectedRevision: asset.revision + 1, settings: { width: 24 } }, implementation, '0.1.0')).toMatchObject({ ok: false, error: { code: 'RESOURCE_SOURCE_CHANGED' } });
  expect(sends).toBe(0); expect(processing.candidates()).toEqual([]); expect(asset.variants).toHaveLength(1);
});
