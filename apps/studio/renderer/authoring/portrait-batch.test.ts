import { afterEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { ProjectSession } from '@galcraft/documents';
import type { Json } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds, FixtureProject, FixtureRuntimeState, FixtureScenes, fixtureId } from '@galcraft/contracts/fixtures';
import { parse } from '@galcraft/dsl';
import { StageCommandService } from '../../../../packages/stage/src/commands.js';
import type { AuthoringSource } from './controller.js';
import { planPortraitBatch } from './portrait-batch.js';
import { defaultPortraitCrop } from './portrait-crop.js';

const workspace = resolve(import.meta.dirname, '../../../..');
const directory = resolve(workspace, 'tmp/testing/portrait-batch-ui');
if (!directory.startsWith(workspace + sep)) throw new Error('Batch test directory must remain inside the workspace');
const envelope = (id: string, data: unknown) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data });
const crop = { x: .12, y: .04, width: .3, height: .28 };
const command = (number: number, args: string, objectNumber = number) => `changeFigure {objectId:"${fixtureId(0xa00 + objectNumber)}", ${args}} @${fixtureId(0xb00 + number)};`;
let session: ProjectSession | null = null;
const source = (): AuthoringSource => ({ projectDocumentId: FixtureIds.projectA, projectRevision: 1, projectSavedRevision: 1, projectDirty: false,
  project: structuredClone(FixtureProject), characters: structuredClone(FixtureCharacters), scenes: FixtureScenes.map((scene, index) => {
    const doc = session!.readDocument(index ? FixtureIds.bookshopDocument : FixtureIds.streetDocument)!;
    return { sceneId: scene.id, documentId: doc.documentId, revision: doc.revision, savedRevision: doc.savedRevision, dirty: doc.dirty, name: scene.name,
      chapterId: scene.chapterId, text: doc.files[`scenes/${scene.id}/script.gal`]! };
  }) });

afterEach(async () => { await session?.dispose('discard'); session = null; await rm(directory, { recursive: true, force: true }); });
describe('batch speaking portraits over actual M02 documents', () => {
  it('commits both scenes together, keeps explicit crops and restores both through undo', async () => {
    await rm(directory, { recursive: true, force: true });
    const scripts = [
      [command(1, 'op:"show"'), command(2, `op:"replace", portrait:${JSON.stringify({ enabled: false, crop })}`), command(3, 'op:"exit"')].join('\n'),
      [command(4, `op:"show", portrait:${JSON.stringify({ enabled: true, crop })}`), command(5, 'op:"show"')].join('\n'),
    ];
    session = await ProjectSession.createProject(directory, FixtureIds.projectA, [
      { documentId: FixtureIds.projectA, revision: 1, format: 'json', files: { 'project.json': envelope(FixtureIds.projectA, FixtureProject) } },
      ...FixtureScenes.map((scene, index) => ({ documentId: index ? FixtureIds.bookshopDocument : FixtureIds.streetDocument, revision: 1, format: 'dsl' as const,
        files: { [`scenes/${scene.id}/scene.json`]: envelope(index ? FixtureIds.bookshopDocument : FixtureIds.streetDocument, scene), [`scenes/${scene.id}/script.gal`]: scripts[index]! } })),
    ]);
    const batch = planPortraitBatch(source()); expect(batch.ok).toBe(true); if (!batch.ok) return;
    expect(batch.value.count).toBe(3); expect(batch.value.edit.patches).toHaveLength(2);
    const planned = session.planEdit(batch.value.edit); expect(planned.ok).toBe(true); if (!planned.ok) return;
    const applied = await session.applyEdit(planned.value.planId, batch.value.edit.expected); expect(applied.ok).toBe(true); if (!applied.ok) return;
    const current = source();
    const statements = current.scenes.flatMap(scene => parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).statements);
    expect(statements.filter(item => item.args.op !== 'exit').every(item => (item.args.portrait as {enabled: boolean}).enabled)).toBe(true);
    expect(statements[1]!.args.portrait).toEqual({ enabled: true, crop }); expect(statements[2]!.args.portrait).toBeUndefined();
    expect(statements[3]!.args.portrait).toEqual({ enabled: true, crop });
    const again = planPortraitBatch(current); expect(again.ok && again.value.count).toBe(0);
    const undo = session.planUndo(FixtureIds.streetDocument, applied.value.operationId); expect(undo.ok).toBe(true); if (!undo.ok) return;
    expect((await session.undo(undo.value.planId)).ok).toBe(true); expect(source().scenes.map(scene => scene.text)).toEqual(scripts);
  });
  it('returns a located issue when a scene script cannot be parsed', () => {
    const invalid: AuthoringSource = { projectDocumentId: FixtureIds.projectA, projectRevision: 1, projectSavedRevision: 1, projectDirty: false,
      project: FixtureProject, characters: [], scenes: [{sceneId:FixtureIds.street,documentId:FixtureIds.streetDocument,revision:1,savedRevision:1,dirty:false,name:'街角',chapterId:FixtureIds.chapter,text:'changeFigure {'}] };
    const result = planPortraitBatch(invalid); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.source?.documentId).toBe(FixtureIds.streetDocument);
  });
  it('keeps inherited replacement crops and enables reset commands through the actual stage service', async () => {
    const args = `assetId:"${FixtureIds.background}"`;
    const script = [
      command(5, `op:"replace", ${args}`),
      command(1, `op:"show", ${args}, portrait:${JSON.stringify({ enabled: true, crop })}`),
      command(2, `op:"replace", ${args}`, 1),
      command(3, `op:"replace", ${args}, reset:true`, 1),
      command(4, `op:"replace", ${args}`, 1),
    ].join('\n');
    session = await ProjectSession.createProject(directory, FixtureIds.projectA, [
      { documentId: FixtureIds.projectA, revision: 1, format: 'json', files: { 'project.json': envelope(FixtureIds.projectA, FixtureProject) } },
      ...FixtureScenes.map((scene, index) => ({ documentId: index ? FixtureIds.bookshopDocument : FixtureIds.streetDocument, revision: 1, format: 'dsl' as const,
        files: { [`scenes/${scene.id}/scene.json`]: envelope(index ? FixtureIds.bookshopDocument : FixtureIds.streetDocument, scene), [`scenes/${scene.id}/script.gal`]: index ? '' : script } })),
    ]);
    const batch = planPortraitBatch(source()); expect(batch.ok).toBe(true); if (!batch.ok) return;
    expect(batch.value.count).toBe(1);
    const planned = session.planEdit(batch.value.edit); expect(planned.ok).toBe(true); if (!planned.ok) return;
    const applied = await session.applyEdit(planned.value.planId, batch.value.edit.expected); expect(applied.ok).toBe(true); if (!applied.ok) return;
    const scene = source().scenes[0]!;
    const statements = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).statements;
    expect(statements.map(statement => statement.args.portrait)).toEqual([
      undefined, { enabled: true, crop }, undefined, { enabled: true, crop: defaultPortraitCrop }, undefined,
    ]);
    const service = new StageCommandService({ asset: () => ({ ok: true,
      value: { variantId: FixtureIds.variant, kind: 'image', provider: null, providerVersion: null }, warnings: [] }) });
    let state = structuredClone(FixtureRuntimeState);
    const portraits = [];
    for (const statement of statements) {
      const result = await service.prepare({ state, token: { sessionId: FixtureIds.session, occurrence: 1, statementId: statement.id! },
        opcode: statement.command, args: statement.args as Json });
      expect(result.ok).toBe(true); if (!result.ok) return;
      state = result.value.state;
      portraits.push(state.presentation.objects.find(object => object.id === statement.args.objectId)?.portrait);
    }
    expect(portraits).toEqual([undefined, { enabled: true, crop }, { enabled: true, crop },
      { enabled: true, crop: defaultPortraitCrop }, { enabled: true, crop: defaultPortraitCrop }]);
  });
});
