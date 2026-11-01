import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { UtilityTasks } from '../../../apps/studio/main/utility-tasks.mjs';
import { createAssetIndex } from '../../../packages/assets/dist/core/catalog.js';
import { ImageVariantProcessor, commitPreparedAsset, inspectAlpha } from '../../../packages/assets/dist/processing/index.js';
import { ProjectSession } from '../../../packages/documents/dist/index.js';

const require = createRequire(new URL('../../../apps/studio/package.json', import.meta.url));
const { app, utilityProcess, MessageChannelMain } = require('electron');
app.disableHardwareAcceleration();
const [inputPath, outputRoot, modelDirectory] = process.argv.slice(-3).map(path => resolve(path));
if (!inputPath || !outputRoot || !modelDirectory)
  throw new Error('Usage: electron utility-smoke.mjs input.png output-directory model-directory');
const userData = join(outputRoot, 'electron-user-data');
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);

app.whenReady().then(async () => {
  const tasks = new UtilityTasks({ utilityProcess, MessageChannelMain });
  const script = join(import.meta.dirname, 'worker.mjs');
  const operationId = '44444444-4444-4444-8444-444444444441';
  const finished = await tasks.start({ operationId, owner: 'M04', script, input: { inputPath, modelDirectory },
    outputDirectory: join(outputRoot, 'utility-result') });
  const cancelledId = '44444444-4444-4444-8444-444444444442';
  const running = tasks.start({ operationId: cancelledId, owner: 'M04', script, input: { inputPath, modelDirectory },
    outputDirectory: join(outputRoot, 'cancelled-result') });
  const began = Date.now();
  const cancellation = await tasks.cancel(cancelledId);
  const cancelled = await running;
  const cancelElapsedMs = Date.now() - began;
  const project = join(outputRoot, 'm02-project');
  const projectId = randomUUID();
  const documentId = randomUUID();
  const assetId = randomUUID();
  const variantId = randomUUID();
  const index = createAssetIndex(documentId);
  const sourceDirectory = join(project, 'assets', 'files', assetId, variantId);
  const now = new Date().toISOString();
  const measured = await inspectAlpha(inputPath);
  const inputBytes = (await readFile(inputPath)).length;
  index.data.assets.push({ id: assetId, revision: 1, name: '白底立绘.png', kind: 'image', folder: [], tags: [], locales: [],
    characterId: null, sceneIds: [], groupId: null, originalVariantId: variantId, activeVariantId: variantId,
    variants: [{ id: variantId, parentId: null, role: 'original', files: [{ path: 'source.png', bytes: inputBytes, mime: 'image/png', role: 'entry' }],
      entry: 'source.png', metadata: { width: measured.width, height: measured.height, hasAlpha: measured.hasAlpha },
      canvas: { width: measured.width, height: measured.height, offsetX: 0, offsetY: 0 }, processing: null,
      targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null }],
    sourceName: '白底立绘.png', source: { kind: 'import', description: inputPath, usage: 'localReview' },
    createdAt: now, modifiedAt: now });
  const session = await ProjectSession.createProject(project, projectId, [{ documentId, revision: 1,
    format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
  await mkdir(sourceDirectory, { recursive: true });
  const originalPath = join(sourceDirectory, 'source.png');
  await copyFile(inputPath, originalPath);
  const original = await readFile(originalPath);
  const readIndex = () => JSON.parse(session.readDocument(documentId).files['assets/index.json']);
  const processor = new ImageVariantProcessor(project, readIndex);
  const prepared = await processor.prepareMatting(assetId, variantId,
    { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null }, 'unchanged',
    input => tasks.start({ operationId: input.operationId, owner: 'M04', script,
      input: { inputPath: input.inputPath, modelDirectory }, outputDirectory: input.outputDirectory }));
  if (!prepared.ok || !prepared.value.prepared) throw new Error(`M04 preparation failed: ${JSON.stringify(prepared)}`);
  const edit = processor.prepareIndexEdit(prepared.value.prepared.preparationId, true);
  if (!edit.ok) throw new Error(`M04 index edit failed: ${JSON.stringify(edit)}`);
  const committed = await commitPreparedAsset(session, edit.value, {
    label: '透明化立绘', onApplied: () => processor.confirm(prepared.value.prepared.preparationId),
    onRejected: () => processor.discard(prepared.value.prepared.preparationId),
  });
  if (!committed.ok) throw new Error(`M02 commit failed: ${JSON.stringify(committed)}`);
  await session.dispose('saved');
  const reopened = await ProjectSession.open(project, projectId);
  const savedIndex = JSON.parse(reopened.readDocument(documentId).files['assets/index.json']);
  const m02 = { saved: committed.value.save.saved, reopenedVariants: savedIndex.data.assets[0].variants.length,
    activeVariantId: savedIndex.data.assets[0].activeVariantId,
    maskVariantId: prepared.value.prepared.maskVariantId, transparentVariantId: prepared.value.prepared.transparentVariantId,
    sourcePreserved: original.equals(await readFile(originalPath)),
    result: savedIndex.data.assets[0].variants.find(value => value.id === prepared.value.prepared.transparentVariantId)?.processing };
  await reopened.dispose('saved');
  const report = { finished, cancellation, cancelled, cancelElapsedMs, m02 };
  await writeFile(join(outputRoot, 'utility-smoke.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
  app.quit();
}).catch(error => { process.stderr.write(`${error.stack ?? error}\n`); app.exit(1); });
