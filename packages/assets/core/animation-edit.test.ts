import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { NativeAnimationSchema, parseAnimationResource, type Result } from '@galcraft/contracts';
import { ProjectSession } from '@galcraft/documents';
import { createAssetIndex } from './catalog.js';
import { ImportCoordinator } from './import.js';

const root = resolve('tmp/testing/animation-edit'), projectId = randomUUID(), documentId = randomUUID();
const unwrap = <T>(result: Result<T>) => { if (!result.ok) throw Error(result.error.message); return result.value; };
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
it('writes real immutable gca files through an undoable M02 index transaction and saves their exact content', async () => {
  const index = createAssetIndex(documentId);
  const session = await ProjectSession.createProject(root, projectId, [{ documentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
  const readIndex = () => JSON.parse(session.readDocument(documentId)!.files['assets/index.json']!) as typeof index;
  const coordinator = new ImportCoordinator(root, '', readIndex);
  const animation = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 65000,
    tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 65000, value: 100 }] }] });
  const prepare = unwrap(await coordinator.prepareAnimation({ name: '长轨道', animation }));
  const apply = (preparationId: string) => { const edit = unwrap(coordinator.prepareIndexEdit([preparationId])); const plan = unwrap(session.planEdit({ label: 'animation', origin: 'batch', expected: edit.expected, patches: edit.indexPatches, preparedAssets: edit.preparedAssets, requiredRefs: [] })); const receipt = unwrap(session.applyEdit(plan.planId, edit.expected)); coordinator.confirm([preparationId]); return receipt; };
  apply(prepare.preparationId);
  const edited = unwrap(await coordinator.prepareAnimation({ name: '长轨道', assetId: prepare.assetId, expectedRevision: 1, animation: { ...animation, durationMs: 66000 } }));
  const receipt = apply(edited.preparationId);
  expect(readIndex().data.assets[0]!.variants).toHaveLength(2);
  const undo = unwrap(session.planUndo(documentId, receipt.operationId)); unwrap(session.undo(undo.planId));
  expect(readIndex().data.assets[0]!.activeVariantId).toBe(prepare.variantId);
  expect((await coordinator.prepareAnimation({ name: 'conflict', assetId: prepare.assetId, expectedRevision: 7, animation })).ok).toBe(false);
  const save = unwrap(session.planSave({ kind: 'all' })); unwrap(await session.save(save.planId));
  const path = join(root, 'assets', 'files', prepare.assetId, prepare.variantId, 'animation.gca');
  expect(unwrap(parseAnimationResource(await readFile(path, 'utf8')))).toEqual(animation);
  expect(JSON.parse(await readFile(join(root, 'assets', 'index.json'), 'utf8')).data.assets[0].activeVariantId).toBe(prepare.variantId);
  await session.dispose('discard');
});
