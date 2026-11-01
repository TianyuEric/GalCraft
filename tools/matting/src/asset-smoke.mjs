import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createAssetIndex } from '../../../packages/assets/dist/core/catalog.js';
import { ImageVariantProcessor } from '../../../packages/assets/dist/processing/index.js';
import { removeBackground } from './matting.mjs';

const [sourcePath, projectRoot, modelDirectory] = process.argv.slice(-3).map(path => resolve(path));
if (!sourcePath || !projectRoot || !modelDirectory) throw new Error('Usage: node asset-smoke.mjs source.png project-root model-directory');
const assetId = randomUUID();
const variantId = randomUUID();
const index = createAssetIndex(randomUUID());
const source = join(projectRoot, 'assets', 'files', assetId, variantId, 'source.png');
await mkdir(join(projectRoot, 'assets', 'files', assetId, variantId), { recursive: true });
await copyFile(sourcePath, source);
const original = await readFile(source);
const now = new Date().toISOString();
index.data.assets.push({ id: assetId, revision: 1, name: '白底立绘.png', kind: 'image', folder: [], tags: [], locales: [],
  characterId: null, sceneIds: [], groupId: null, originalVariantId: variantId, activeVariantId: variantId,
  variants: [{ id: variantId, parentId: null, role: 'original', files: [{ path: 'source.png', bytes: original.length, mime: 'image/png', role: 'entry' }],
    entry: 'source.png', metadata: { width: 512, height: 1024, hasAlpha: false },
    canvas: { width: 512, height: 1024, offsetX: 0, offsetY: 0 }, processing: null,
    targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null }],
  sourceName: '白底立绘.png', source: { kind: 'import', description: sourcePath, usage: 'localReview' },
  createdAt: now, modifiedAt: now });
const processor = new ImageVariantProcessor(projectRoot, () => index);
const result = await processor.prepareMatting(assetId, variantId,
  { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null }, 'unchanged',
  async (input, signal) => {
    const value = await removeBackground(input.inputPath, input.outputDirectory, modelDirectory, { signal });
    return { ok: true, value, warnings: [] };
  });
if (!result.ok || !result.value.prepared) throw new Error(JSON.stringify(result));
const patch = processor.prepareIndexEdit(result.value.prepared.preparationId, true);
if (!patch.ok) throw new Error(JSON.stringify(patch));
const report = { assetId, sourceVariantId: variantId,
  maskVariantId: result.value.prepared.maskVariantId, transparentVariantId: result.value.prepared.transparentVariantId,
  sourcePreserved: original.equals(await readFile(source)), indexedBeforeCommit: index.data.assets[0].variants.length,
  preparedFiles: [result.value.prepared.mask.files[0], result.value.prepared.transparent.files[0]],
  indexPatchCount: patch.value.indexPatches.length, targetState: result.value.prepared.transparent.targets,
  processing: result.value.prepared.transparent.processing };
await writeFile(join(projectRoot, 'asset-smoke.json'), JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report)}\n`);
