import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectSession, commitFiles, recoverTransactions, type SessionOptions } from './index.js';

const root = resolve('../../tmp/testing/projects/a/documents');
const projectId = '00000000-0000-4000-8000-000000000001';
const sceneId = '00000000-0000-4000-8000-000000000101';
const roleId = '00000000-0000-4000-8000-000000000201';
const otherId = '00000000-0000-4000-8000-000000000102';
const presetId = '00000000-0000-4000-8000-000000000401';
const assetIndexId = '00000000-0000-4000-8000-000000000301';
const assetId = '00000000-0000-4000-8000-000000000302';
const sessions = new Set<ProjectSession>();
const envelope = (id: string, data: unknown, revision = 1) => JSON.stringify({ schemaVersion: 1, documentId: id, revision, data }, null, 2) + '\n';
const requireValue = <T>(result: { ok: boolean; value?: T }): T => {
  expect(result.ok).toBe(true);
  return result.value!;
};
async function fresh(): Promise<ProjectSession> {
  await rm(root, { recursive: true, force: true });
  const session = await ProjectSession.createProject(root, projectId, [
    { documentId: sceneId, revision: 1, format: 'dsl', files: {
      [`scenes/${sceneId}/scene.json`]: envelope(sceneId, { id: sceneId, name: 'S' }),
      [`scenes/${sceneId}/script.gal`]: 'S0',
    } },
    { documentId: roleId, revision: 1, format: 'json', files: { [`characters/${roleId}.json`]: envelope(roleId, { name: 'R0' }) } },
    { documentId: otherId, revision: 1, format: 'json', files: { [`scenes/${otherId}.json`]: envelope(otherId, { name: 'B0' }) } },
  ]);
  sessions.add(session);
  return session;
}
async function openSession(options?: Parameters<typeof ProjectSession.open>[2]): Promise<ProjectSession> {
  const session = await ProjectSession.open(root, projectId, options);
  sessions.add(session);
  return session;
}
it.each([[0, 1], [1, 2], [0, 1, 2], [0, 2]].map(selected => ({ selected })))('restores deleted text ranges in their original order: $selected', async ({ selected }) => {
  const session = await fresh();
  const lines = ['first\n', 'second\n', 'third\n', 'fourth\n'], original = lines.join('');
  const path = `scenes/${sceneId}/script.gal`;
  edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: original }] }]);
  const edits = selected.map(index => {
    const start = lines.slice(0, index).join('').length;
    return { start, end: start + lines[index]!.length, before: lines[index]!, after: '' };
  }).reverse();
  edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits }]);
  const remaining = lines.filter((_, index) => !selected.includes(index)).join('');
  expect(session.readDocument(sceneId)!.files[path]).toBe(remaining);
  const plan = requireValue(session.planUndo(sceneId));
  requireValue(session.undo(plan.planId));
  expect(session.readDocument(sceneId)!.files[path]).toBe(original);
  requireValue(session.redo(plan.planId));
  expect(session.readDocument(sceneId)!.files[path]).toBe(remaining);
  requireValue(session.undo(requireValue(session.planUndo(sceneId)).planId));
  expect(session.readDocument(sceneId)!.files[path]).toBe(original);
});
function edit(session: ProjectSession, ids: string[], patches: Parameters<ProjectSession['planEdit']>[0]['patches']) {
  const expected = ids.map(id => ({ ref: { kind: 'document' as const, id }, revision: session.readDocument(id)!.revision }));
  const plan = requireValue(session.planEdit({ label: 'edit', origin: 'field', expected, patches, preparedAssets: [], requiredRefs: [] }));
  return requireValue(session.applyEdit(plan.planId, expected));
}
afterEach(async () => {
  for (const session of sessions) await session.dispose('discard');
  sessions.clear();
  await rm(root, { recursive: true, force: true });
});

describe('M02 document session', () => {
  it('discards the explicit selected object collection without including other batch members', async () => {
    const session = await fresh();
    edit(session, [roleId, otherId], [roleId, otherId].map((documentId, index) => ({ kind: 'json', documentId, changes: [{ path: '/data/name', before: index ? 'B0' : 'R0', after: index ? 'B1' : 'R1', op: 'set' }] })));
    const scope = (ids: string[]) => ({ documentId: ids[0]!, objects: ids.map(documentId => ({ kind: 'document' as const, documentId, objectId: null })), expected: ids.map(id => ({ ref: { kind: 'document' as const, id }, revision: session.readDocument(id)!.revision })) });
    const single = requireValue(session.planDiscard(scope([roleId])));
    expect(single.members).toEqual([roleId]); expect(single.reasons).toEqual([]);
    const selected = requireValue(session.planDiscard(scope([roleId, otherId])));
    expect(new Set(selected.members)).toEqual(new Set([roleId, otherId]));
    const receipt = requireValue(session.applyDiscard(single.planId));
    expect(JSON.parse(Object.values(session.readDocument(otherId)!.files)[0]!).data.name).toBe('B1');
    expect(session.applyDiscard(selected.planId)).toMatchObject({ ok: false, error: { code: 'DISCARD_PLAN_STALE' } });
    requireValue(session.undo(requireValue(session.planUndo(roleId, receipt.operationId)).planId));
    requireValue(session.applyDiscard(requireValue(session.planDiscard(scope([roleId, otherId]))).planId));
    expect(session.dirtyIds()).toEqual([]);
  });
  it('keeps two-step scoped undo and redo through unrelated edits in the same document', async () => {
    const session = await fresh(), path = `characters/${roleId}.json`;
    const rename = (before: string, after: string) => edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before, after, op: 'set' }] }]);
    rename('R0', 'R1'); rename('R1', 'R2');
    for (let count = 0; count < 2; count++) requireValue(session.undo(requireValue(session.planUndo(roleId, undefined, ['/data/name'])).planId));
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/description', before: null, after: 'Independent', op: 'set' }] }]);
    expect(session.planUndo(otherId)).toMatchObject({ ok: false, error: { code: 'NOTHING_TO_UNDO' } });
    for (const name of ['R1', 'R2']) {
      requireValue(session.redo(requireValue(session.planRedo(roleId, ['/data/name'])).planId));
      expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data).toEqual({ name, description: 'Independent' });
    }
    expect(session.planRedo(otherId)).toMatchObject({ ok: false, error: { code: 'NOTHING_TO_REDO' } });
  });
  it('keeps consumed recovered groups out of explicit field discard after independent edits', async () => {
    let session = await fresh();
    const secondAssetId = '00000000-0000-4000-8000-000000000303', rolePath = `characters/${roleId}.json`;
    const assets = [{ id: assetId, name: 'A0' }, { id: secondAssetId, name: 'B0' }];
    edit(session, [], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets }) } } }]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    edit(session, [assetIndexId, roleId], [
      { kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: assets, after: [{ ...assets[0]!, name: 'A1' }, assets[1]!], op: 'set' }] },
      { kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] },
    ]);
    await session.dispose('keep'); session = await openSession(); requireValue(await session.recover('restore'));
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    const before = JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets;
    edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before,
      after: before.map((asset: { id: string; name: string }) => asset.id === secondAssetId ? { ...asset, name: 'B1' } : asset), op: 'set' }] }]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R1', after: 'R2', op: 'set' }] }]);
    const plan = requireValue(session.planDiscard({ documentId: roleId, paths: ['/data/name'] }));
    expect(plan.members).toEqual([roleId]);
    const receipt = requireValue(session.applyDiscard(plan.planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[rolePath]!).data.name).toBe('R1');
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets[1].name).toBe('B1');
    requireValue(session.undo(requireValue(session.planUndo(roleId, receipt.operationId)).planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[rolePath]!).data.name).toBe('R2');
  });
  it.each(['live', 'recovered'] as const)('consumes saved asset associations before later independent edits: %s', async source => {
    let session = await fresh();
    const secondAssetId = '00000000-0000-4000-8000-000000000303';
    edit(session, [], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets: [{ id: assetId, name: 'A0' }, { id: secondAssetId, name: 'B0' }] }) } } }]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    const names = () => JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name);
    const rename = (changes: Record<string, string>) => {
      const before = JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets;
      edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before,
        after: before.map((asset: { id: string }) => changes[asset.id] ? { ...asset, name: changes[asset.id] } : asset), op: 'set' }] }]);
    };
    const select = (id: string) => ({ kind: 'objects' as const, objects: [{ documentId: assetIndexId, kind: 'asset' as const, objectId: id }],
      expected: [{ ref: { kind: 'document' as const, id: assetIndexId }, revision: session.readDocument(assetIndexId)!.revision }] });
    rename({ [assetId]: 'A1', [secondAssetId]: 'B1' });
    if (source === 'recovered') {
      await session.dispose('keep'); session = await openSession(); requireValue(await session.recover('restore'));
    }
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    rename({ [assetId]: 'A2' }); requireValue(await session.save(requireValue(session.planSave(select(assetId))).planId));
    rename({ [secondAssetId]: 'B2' }); requireValue(await session.save(requireValue(session.planSave(select(secondAssetId))).planId));
    rename({ [assetId]: 'A3' }); rename({ [secondAssetId]: 'B3' });
    const save = requireValue(session.planSave(select(assetId)));
    expect(save.objects.map(object => object.objectId)).toEqual([assetId]);
    expect(save.reasons).toEqual([]);
    const discard = requireValue(session.planDiscard({ documentId: assetIndexId, objectId: assetId }));
    expect(JSON.parse(discard.preview[0]!.files['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A2', 'B3']);
    const discarded = requireValue(session.applyDiscard(discard.planId));
    expect(names()).toEqual(['A2', 'B3']);
    requireValue(session.undo(requireValue(session.planUndo(assetIndexId, discarded.operationId)).planId));
    expect(names()).toEqual(['A3', 'B3']);
    expect(requireValue(session.planSave(select(assetId))).objects.map(object => object.objectId)).toEqual([assetId]);
    await session.dispose('keep'); session = await openSession(); requireValue(await session.recover('restore'));
    expect(requireValue(session.planSave(select(assetId))).objects.map(object => object.objectId)).toEqual([assetId]);
    expect(JSON.parse(requireValue(session.planDiscard({ documentId: assetIndexId, objectId: assetId })).preview[0]!.files['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A2', 'B3']);
  });

  it('retains another pending asset group and a late edit when partially saving their shared index', async () => {
    let session = await fresh();
    const secondAssetId = '00000000-0000-4000-8000-000000000303', thirdAssetId = '00000000-0000-4000-8000-000000000304';
    const assets = [{ id: assetId, name: 'A0' }, { id: secondAssetId, name: 'B0' }, { id: thirdAssetId, name: 'C0' }];
    edit(session, [], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets }) } } }]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    const rename = (changes: Record<string, string>) => {
      const before = JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets;
      edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before,
        after: before.map((asset: { id: string }) => changes[asset.id] ? { ...asset, name: changes[asset.id] } : asset), op: 'set' }] }]);
    };
    const select = (id: string) => ({ kind: 'objects' as const, objects: [{ documentId: assetIndexId, kind: 'asset' as const, objectId: id }],
      expected: [{ ref: { kind: 'document' as const, id: assetIndexId }, revision: session.readDocument(assetIndexId)!.revision }] });
    rename({ [assetId]: 'A1' }); rename({ [secondAssetId]: 'B1', [thirdAssetId]: 'C1' });
    const saving = session.save(requireValue(session.planSave(select(assetId))).planId);
    rename({ [assetId]: 'A2' }); requireValue(await saving);
    for (const recovered of [false, true]) {
      if (recovered) { await session.dispose('keep'); session = await openSession(); requireValue(await session.recover('restore')); }
      expect(requireValue(session.planSave(select(assetId))).objects.map(object => object.objectId)).toEqual([assetId]);
      expect(requireValue(session.planSave(select(secondAssetId))).objects.map(object => object.objectId)).toEqual([secondAssetId, thirdAssetId]);
      const discarded = requireValue(session.planDiscard({ documentId: assetIndexId, objectId: secondAssetId }));
      expect(JSON.parse(discarded.preview[0]!.files['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A2', 'B0', recovered ? 'C0' : 'C1']);
    }
    expect(JSON.parse(await readFile(join(root, 'assets/index.json'), 'utf8')).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A1', 'B0', 'C0']);
  });

  it('freezes saved group state across undo and consumes it again when redo reaches that saved state', async () => {
    const session = await fresh(), secondAssetId = '00000000-0000-4000-8000-000000000303';
    const assets = [{ id: assetId, name: 'A0' }, { id: secondAssetId, name: 'B0' }];
    edit(session, [], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets }) } } }]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    const batch = edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: assets,
      after: assets.map(asset => ({ ...asset, name: `${asset.name} batch` })), op: 'set' }] }]);
    const select = () => ({ kind: 'objects' as const, objects: [{ documentId: assetIndexId, kind: 'asset' as const, objectId: assetId }],
      expected: [{ ref: { kind: 'document' as const, id: assetIndexId }, revision: session.readDocument(assetIndexId)!.revision }] });
    const saving = session.save(requireValue(session.planSave(select())).planId);
    const undo = requireValue(session.planUndo(assetIndexId, batch.operationId)); requireValue(session.undo(undo.planId));
    requireValue(await saving);
    expect(requireValue(session.planSave(select())).objects.map(object => object.objectId)).toEqual([assetId, secondAssetId]);
    requireValue(session.redo(undo.planId)); expect(session.dirtyIds()).toEqual([]);
    for (const id of [assetId, secondAssetId]) {
      const before = JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets;
      edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before,
        after: before.map((asset: { id: string; name: string }) => asset.id === id ? { ...asset, name: `${asset.name} independent` } : asset), op: 'set' }] }]);
    }
    expect(requireValue(session.planSave(select())).objects.map(object => object.objectId)).toEqual([assetId]);
  });

  it('saves one asset from a shared index and rebases the remaining work and recovery draft', async () => {
    const session = await fresh(), secondAssetId = '00000000-0000-4000-8000-000000000303';
    const assets = [{ id: assetId, name: 'A0' }, { id: secondAssetId, name: 'B0' }];
    edit(session, [sceneId], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets }) } } }]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    const rename = (id: string, name: string) => {
      const before = JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets;
      edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before,
        after: before.map((asset: { id: string }) => asset.id === id ? { ...asset, name } : asset), op: 'set' }] }]);
    };
    rename(assetId, 'A1'); rename(secondAssetId, 'B1');
    const selected = () => ({ kind: 'objects' as const, objects: [{ documentId: assetIndexId, kind: 'asset' as const, objectId: assetId }],
      expected: [{ ref: { kind: 'document' as const, id: assetIndexId }, revision: session.readDocument(assetIndexId)!.revision }] });
    const stale = requireValue(session.planSave(selected()));
    rename(assetId, 'A2');
    expect(await session.save(stale.planId)).toMatchObject({ ok: false, error: { code: 'SAVE_PLAN_STALE' } });
    const plan = requireValue(session.planSave(selected()));
    expect(plan.objects.map(object => object.objectId)).toEqual([assetId]);
    expect(JSON.parse(plan.preview[0]!.files['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A2', 'B0']);
    const saving = session.save(plan.planId); rename(assetId, 'A3');
    const saved = requireValue(await saving);
    expect(saved.remainingDirty).toContain(assetIndexId);
    expect(JSON.parse(await readFile(join(root, 'assets/index.json'), 'utf8')).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A2', 'B0']);
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A3', 'B1']);
    expect(requireValue(session.planSave({ kind: 'all' })).objects.map(object => object.objectId)).toEqual([assetId, secondAssetId]);
    requireValue(await session.save(requireValue(session.planSave(selected())).planId));
    expect(requireValue(session.planSave({ kind: 'all' })).objects.map(object => object.objectId)).toEqual([secondAssetId]);
    await session.dispose('keep');
    const reopened = await openSession(); requireValue(await reopened.recover('restore'));
    expect(requireValue(reopened.planSave({ kind: 'all' })).objects.map(object => object.objectId)).toEqual([secondAssetId]);
    expect(JSON.parse(reopened.readDocument(assetIndexId)!.savedFiles['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A3', 'B0']);
  });
  it('selects the exact newly referenced asset and variant while keeping unrelated index work unsaved', async () => {
    const session = await fresh(), secondAssetId = '00000000-0000-4000-8000-000000000303',variantId='00000000-0000-4000-8000-000000000304';
    edit(session, [sceneId], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets: [] }) } } }]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    const reopened = await openSession({ requiredReferences: documents => {
      const target = JSON.parse(documents.get(roleId)!.files[`characters/${roleId}.json`]!).data.assetId;
      return target ? [{ documentId: roleId, path: '/data/assetId', ref: { kind: 'asset', id: target } },{documentId:roleId,path:'/data/variantId',ref:{kind:'variant',id:variantId}}] : [];
    }, resolveRequiredRef: (ref, documents) => JSON.parse(documents.get(assetIndexId)!.files['assets/index.json']!).data.assets.some((asset: { id: string; variants:{id:string}[] }) => ref.kind==='asset'?asset.id === ref.id:asset.variants.some(variant=>variant.id===ref.id)) });
    let assets: { id: string; name: string;variants:{id:string}[] }[] = [];
    for (const id of [assetId, secondAssetId]) {
      const after = [...assets, { id, name: id,variants:id===assetId?[{id:variantId}]:[] }];
      edit(reopened, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: assets, after, op: 'set' }] }]); assets = after;
    }
    edit(reopened, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/assetId', before: null, after: assetId, op: 'set' }] }]);
    const plan = requireValue(reopened.planSave({ kind: 'current', documentId: roleId }));
    expect(plan.objects.map(object => object.objectId)).toEqual([null, assetId]);
    expect(plan.reasons).toContainEqual(expect.objectContaining({ kind: 'reference', ref: { kind: 'asset', id: assetId } }));
    requireValue(await reopened.save(plan.planId));
    expect(JSON.parse(await readFile(join(root, 'assets/index.json'), 'utf8')).data.assets.map((asset: { id: string }) => asset.id)).toEqual([assetId]);
  });
  it('saves an asset deletion with the referring object change and preserves another dirty asset', async () => {
    const initial = await fresh(), secondAssetId = '00000000-0000-4000-8000-000000000303';
    const assets = [{ id: assetId, name: 'A0' }, { id: secondAssetId, name: 'B0' }];
    edit(initial, [roleId], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets }) } } },
    { kind: 'json', documentId: roleId, changes: [{ path: '/data/assetId', before: null, after: assetId, op: 'set' }] }]);
    requireValue(await initial.save(requireValue(initial.planSave({ kind: 'all' })).planId));
    const session = await openSession({ requiredReferences: documents => {
      const id = JSON.parse(documents.get(roleId)!.files[`characters/${roleId}.json`]!).data.assetId;
      return id ? [{ documentId: roleId, path: '/data/assetId', ref: { kind: 'asset', id } }] : [];
    }, resolveRequiredRef: (ref, documents) => JSON.parse(documents.get(assetIndexId)!.files['assets/index.json']!).data.assets.some((asset: { id: string }) => asset.id === ref.id) });
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/assetId', before: assetId, after: null, op: 'set' }] }]);
    edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: assets, after: [assets[1]!], op: 'set' }] }]);
    edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: [assets[1]!], after: [{ ...assets[1]!, name: 'B1' }], op: 'set' }] }]);
    const plan = requireValue(session.planSave({ kind: 'objects', objects: [{ documentId: assetIndexId, kind: 'asset', objectId: assetId }],
      expected: [{ ref: { kind: 'document', id: assetIndexId }, revision: session.readDocument(assetIndexId)!.revision }] }));
    expect(plan.objects.map(object => object.objectId)).toEqual([assetId, null]);
    requireValue(await session.save(plan.planId));
    expect(JSON.parse(await readFile(join(root, 'assets/index.json'), 'utf8')).data.assets).toEqual([assets[1]]);
    expect(JSON.parse(await readFile(join(root, `characters/${roleId}.json`), 'utf8')).data.assetId).toBeNull();
    expect(requireValue(session.planSave({ kind: 'all' })).objects.map(object => object.objectId)).toEqual([secondAssetId]);
  });
  it('discards exactly one asset, leaves disk and another asset intact, and restores it with one undo', async () => {
    const session = await fresh(), secondAssetId = '00000000-0000-4000-8000-000000000303';
    const assets = [{ id: assetId, name: 'A0' }, { id: secondAssetId, name: 'B0' }];
    edit(session, [sceneId], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets }) } } }]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    let before = assets;
    for (const id of [assetId, secondAssetId]) {
      const after = before.map(asset => asset.id === id ? { ...asset, name: `${asset.name} changed` } : asset);
      edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before, after, op: 'set' }] }]); before = after;
    }
    const disk = await readFile(join(root, 'assets/index.json'), 'utf8');
    const stale = requireValue(session.planDiscard({ documentId: assetIndexId, objectId: assetId }));
    edit(session, [otherId], [{ kind: 'json', documentId: otherId, changes: [{ path: '/data/name', before: 'B0', after: 'B1', op: 'set' }] }]);
    expect(session.applyDiscard(stale.planId)).toMatchObject({ ok: false, error: { code: 'DISCARD_PLAN_STALE' } });
    const receipt = requireValue(session.applyDiscard(requireValue(session.planDiscard({ documentId: assetIndexId, objectId: assetId })).planId));
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A0', 'B0 changed']);
    expect(await readFile(join(root, 'assets/index.json'), 'utf8')).toBe(disk);
    requireValue(session.undo(requireValue(session.planUndo(assetIndexId, receipt.operationId)).planId));
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets.map((asset: { name: string }) => asset.name)).toEqual(['A0 changed', 'B0 changed']);
  });
  it('discards a document while retaining assets edited in the same batch', async () => {
    const session = await fresh(), secondAssetId = '00000000-0000-4000-8000-000000000303';
    edit(session, [sceneId], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets: [] }) } } }]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    const assets = [{ id: assetId, name: 'Associated' }], other = { id: secondAssetId, name: 'Independent' };
    edit(session, [sceneId, assetIndexId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] },
      { kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: [], after: assets, op: 'set' }] }]);
    edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: assets, after: [...assets, other], op: 'set' }] }]);
    const receipt = requireValue(session.applyDiscard(requireValue(session.planDiscard({ documentId: sceneId })).planId));
    expect(session.readRaw(sceneId)!.raw).toBe('S0');
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets).toEqual([...assets, other]);
    requireValue(session.undo(requireValue(session.planUndo(sceneId, receipt.operationId)).planId));
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets).toEqual([...assets, other]);
  });
  it('treats an empty discard path list as the whole document', async () => {
    const session = await fresh();
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] }]);
    const plan = requireValue(session.planDiscard({ documentId: roleId, paths: [] }));
    expect(plan.members).toEqual([roleId]);
    requireValue(session.applyDiscard(plan.planId));
    expect(JSON.parse(Object.values(session.readDocument(roleId)!.files)[0]!).data.name).toBe('R0');
  });
  it('discards a new asset with its retained asset and variant consumer while preserving another index entry', async () => {
    const initial = await fresh(), variantId = '00000000-0000-4000-8000-000000000304', secondAssetId = '00000000-0000-4000-8000-000000000303';
    edit(initial, [sceneId], [{ kind: 'document', documentId: assetIndexId, op: 'create', before: null,
      after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets: [] }) } } }]);
    requireValue(await initial.save(requireValue(initial.planSave({ kind: 'all' })).planId));
    const path = `characters/${roleId}.json`, session = await openSession({ requiredReferences: documents => {
      const figure = JSON.parse(documents.get(roleId)!.files[path]!).data.figure;
      return figure ? [{ documentId: roleId, path: '/data/figure/assetId', ref: { kind: 'asset', id: figure.assetId } },
        { documentId: roleId, path: '/data/figure/variantId', ref: { kind: 'variant', id: figure.variantId } }] : [];
    }, resolveRequiredRef: (ref, documents) => {
      const assets = JSON.parse(documents.get(assetIndexId)!.files['assets/index.json']!).data.assets as { id: string; variants: { id: string }[] }[];
      return ref.kind === 'asset' ? assets.some(asset => asset.id === ref.id) : assets.some(asset => asset.variants.some(variant => variant.id === ref.id));
    } });
    const asset = { id: assetId, variants: [{ id: variantId }] }, independent = { id: secondAssetId, variants: [] };
    edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: [], after: [asset], op: 'set' }] }]);
    edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: [asset], after: [asset, independent], op: 'set' }] }]);
    const figure = { assetId, variantId };
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/figure', before: null, after: figure, op: 'set' }] }]);
    const disk = await readFile(join(root, 'assets/index.json'), 'utf8'), plan = requireValue(session.planDiscard({ documentId: assetIndexId, objectId: assetId }));
    expect(new Set(plan.members)).toEqual(new Set([assetIndexId, roleId]));
    const receipt = requireValue(session.applyDiscard(plan.planId));
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets).toEqual([independent]);
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data.figure).toBeUndefined();
    expect(await readFile(join(root, 'assets/index.json'), 'utf8')).toBe(disk);
    requireValue(session.undo(requireValue(session.planUndo(assetIndexId, receipt.operationId)).planId));
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets).toEqual([asset, independent]);
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data.figure).toEqual(figure);
  });
  it('restores the deleted target required by a discarded saved source and preserves independent work', async () => {
    const initial = await fresh();
    await initial.dispose('saved');
    const session = await openSession({ requiredReferences: documents => documents.get(sceneId)!.files[`scenes/${sceneId}/script.gal`] === 'S0'
      ? [{ documentId: sceneId, path: '#source', ref: { kind: 'document', id: otherId } }] : [] });
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }]);
    const target = session.readDocument(otherId)!;
    edit(session, [otherId], [{ kind: 'document', documentId: otherId, op: 'delete', before: { format: target.format, files: target.files }, after: null }]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'Independent', op: 'set' }] }]);
    const plan = requireValue(session.planDiscard({ documentId: sceneId }));
    expect(plan.expanded).toContainEqual({ documentId: otherId, paths: ['*'] });
    expect(plan.members).not.toContain(roleId);
    const receipt = requireValue(session.applyDiscard(plan.planId));
    expect(session.readRaw(sceneId)!.raw).toBe('S0');
    const restored = session.readDocument(otherId)!;
    expect(Object.keys(restored.files)).toEqual(Object.keys(target.savedFiles));
    expect(JSON.parse(Object.values(restored.files)[0]!).data).toEqual({ name: 'B0' });
    expect(JSON.parse(session.readDocument(roleId)!.files[`characters/${roleId}.json`]!).data.name).toBe('Independent');
    requireValue(session.undo(requireValue(session.planUndo(sceneId, receipt.operationId)).planId));
    expect(session.readRaw(sceneId)!.raw).toBe('S1');
    expect(session.readDocument(otherId)!.files).toEqual({});
  });
  it('expands restored field references to the actual deleted index field and undoes the whole discard', async () => {
    const initial = await fresh(), path = `characters/${roleId}.json`;
    const assets = [{ id: assetId, variants: [] }];
    edit(initial, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display', before: null, after: { splash: assetId }, op: 'set' }] },
      { kind: 'document', documentId: assetIndexId, op: 'create', before: null, after: { format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets }) } } }]);
    await initial.save(requireValue(initial.planSave({ kind: 'all' })).planId);
    const options: SessionOptions = {
      requiredReferences: documents => {
        const data = JSON.parse(documents.get(roleId)!.files[path]!).data;
        return data.display.splash ? [{ documentId: roleId, path: '/data/display/splash', ref: { kind: 'asset', id: data.display.splash } }] : [];
      },
      resolveRequiredRef: (ref, documents) => JSON.parse(documents.get(assetIndexId)!.files['assets/index.json']!).data.assets.some((asset: { id: string }) => asset.id === ref.id),
    };
    const session = await openSession(options);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display/splash', before: assetId, after: null, op: 'set' }] }]);
    edit(session, [assetIndexId], [{ kind: 'json', documentId: assetIndexId, changes: [{ path: '/data/assets', before: assets, after: [], op: 'set' }] }]);
    edit(session, [roleId, otherId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'Independent', op: 'set' }] },
      { kind: 'json', documentId: otherId, changes: [{ path: '/data/name', before: 'B0', after: 'Independent other', op: 'set' }] }]);
    const disk = await readFile(join(root, 'assets/index.json'), 'utf8');
    const plan = requireValue(session.planDiscard({ documentId: roleId, paths: ['/data/display'] }));
    expect(new Set(plan.expanded.map(item => JSON.stringify(item)))).toEqual(new Set([{ documentId: roleId, paths: ['/data/display/splash'] }, { documentId: assetIndexId, paths: ['/data/assets'] }].map(item => JSON.stringify(item))));
    const receipt = requireValue(session.applyDiscard(plan.planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data).toEqual({ name: 'Independent', display: { splash: assetId } });
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets).toEqual(assets);
    expect(JSON.parse(Object.values(session.readDocument(otherId)!.files)[0]!).data.name).toBe('Independent other');
    expect(await readFile(join(root, 'assets/index.json'), 'utf8')).toBe(disk);
    requireValue(session.undo(requireValue(session.planUndo(roleId, receipt.operationId)).planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data.display.splash).toBeNull();
    expect(JSON.parse(session.readDocument(assetIndexId)!.files['assets/index.json']!).data.assets).toEqual([]);
  });
  it('rejects unavailable restored references atomically and leaves unrelated invalid references alone', async () => {
    const initial = await fresh(), path = `characters/${roleId}.json`;
    edit(initial, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display', before: null, after: { splash: assetId, title: 'Saved' }, op: 'set' }] }]);
    await initial.save(requireValue(initial.planSave({ kind: 'all' })).planId);
    let available = false;
    const session = await openSession({ resolveRequiredRef: () => available, requiredReferences: documents => {
      const data = JSON.parse(documents.get(roleId)!.files[path]!).data;
      return data.display.splash ? [{ documentId: roleId, path: '/data/display/splash', ref: { kind: 'asset', id: data.display.splash } }] : [];
    } });
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display/title', before: 'Saved', after: 'Working', op: 'set' }] }]);
    requireValue(session.applyDiscard(requireValue(session.planDiscard({ documentId: roleId, paths: ['/data/display/title'] })).planId));
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display/splash', before: assetId, after: null, op: 'set' }] }]);
    const before = structuredClone(session.documents), operations = session.operations.length;
    expect(session.planDiscard({ documentId: roleId, paths: ['/data/display/splash'] })).toMatchObject({ ok: false, error: { code: 'DISCARD_REF_CONFLICT' } });
    expect(session.documents).toEqual(before);
    expect(session.operations.length).toBe(operations);
    available = true;
    const plan = requireValue(session.planDiscard({ documentId: roleId, paths: ['/data/display/splash'] }));
    available = false;
    expect(session.applyDiscard(plan.planId)).toMatchObject({ ok: false, error: { code: 'DISCARD_REF_CONFLICT' } });
    expect(session.documents).toEqual(before);
    expect(session.operations.length).toBe(operations);
  });
  it('discards one JSON object, preserves independent fields and disk, and restores the discarded work through undo', async () => {
    const session = await fresh(), path = `characters/${roleId}.json`;
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display', before: null, after: { title: 'Saved', clips: [] }, op: 'set' }] }]);
    await session.save(requireValue(session.planSave({ kind: 'all' })).planId);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display', before: { title: 'Saved', clips: [] }, after: { title: 'Working', clips: [1] }, op: 'set' }] }]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'Independent', op: 'set' }] }]);
    const plan = requireValue(session.planDiscard({ documentId: roleId, paths: ['/data/display'] }));
    expect(plan.members).toEqual([roleId]);
    const receipt = requireValue(session.applyDiscard(plan.planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data).toEqual({ name: 'Independent', display: { title: 'Saved', clips: [] } });
    expect(JSON.parse(await readFile(join(root, path), 'utf8')).data.name).toBe('R0');
    requireValue(session.undo(requireValue(session.planUndo(roleId, receipt.operationId)).planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data).toEqual({ name: 'Independent', display: { title: 'Working', clips: [1] } });
  });
  it('keeps batch members independent and rejects a stale discard atomically', async () => {
    const session = await fresh();
    edit(session, [roleId, sceneId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] }, { kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }]);
    edit(session, [otherId], [{ kind: 'json', documentId: otherId, changes: [{ path: '/data/name', before: 'B0', after: 'B1', op: 'set' }] }]);
    const stale = requireValue(session.planDiscard({ documentId: roleId }));
    expect(stale.members).toEqual([roleId]);
    edit(session, [otherId], [{ kind: 'json', documentId: otherId, changes: [{ path: '/data/name', before: 'B1', after: 'B2', op: 'set' }] }]);
    expect(session.applyDiscard(stale.planId)).toMatchObject({ ok: false, error: { code: 'DISCARD_PLAN_STALE' } });
    expect(session.readRaw(sceneId)!.raw).toBe('S1');
    requireValue(session.applyDiscard(requireValue(session.planDiscard({ documentId: roleId })).planId));
    expect(session.readRaw(sceneId)!.raw).toBe('S1');
    expect(JSON.parse(Object.values(session.readDocument(otherId)!.files)[0]!).data.name).toBe('B2');
  });
  it('undoes the current object without undoing later independent fields in its document', async () => {
    const session = await fresh(), path = `characters/${roleId}.json`;
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display', before: null, after: { title: 'Saved' }, op: 'set' }] }]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/display', before: { title: 'Saved' }, after: { title: 'Working' }, op: 'set' }] }]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'Independent', op: 'set' }] }]);
    requireValue(session.undo(requireValue(session.planUndo(roleId, undefined, ['/data/display'])).planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data).toEqual({ name: 'Independent', display: { title: 'Saved' } });
  });
  it('selects independent field redo without restoring another field', async () => {
    const session = await fresh(), path = `characters/${roleId}.json`;
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] }]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/description', before: null, after: 'Description', op: 'set' }] }]);
    requireValue(session.undo(requireValue(session.planUndo(roleId, undefined, ['/data/description'])).planId));
    requireValue(session.undo(requireValue(session.planUndo(roleId, undefined, ['/data/name'])).planId));
    requireValue(session.redo(requireValue(session.planRedo(roleId, ['/data/description'])).planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data).toEqual({ name: 'R0', description: 'Description' });
    requireValue(session.redo(requireValue(session.planRedo(roleId, ['/data/name'])).planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[path]!).data).toEqual({ name: 'R1', description: 'Description' });
  });
  it('restores unrelated documents independently of their operation sequence', async () => {
    const session = await fresh();
    edit(session, [roleId], [{ kind: 'json', documentId: roleId,
      changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] }]);
    edit(session, [otherId], [{ kind: 'json', documentId: otherId,
      changes: [{ path: '/data/name', before: 'B0', after: 'B1', op: 'set' }] }]);
    const last = requireValue(session.planUndo(otherId));
    requireValue(session.undo(last.planId));
    const first = requireValue(session.planUndo(roleId));
    requireValue(session.undo(first.planId));

    requireValue(session.redo(last.planId));
    expect(JSON.parse(session.readDocument(otherId)!.files[`scenes/${otherId}.json`]!).data.name).toBe('B1');
    expect(JSON.parse(session.readDocument(roleId)!.files[`characters/${roleId}.json`]!).data.name).toBe('R0');
    requireValue(session.redo(first.planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[`characters/${roleId}.json`]!).data.name).toBe('R1');
  });
  it('restores a new branch after an edit invalidates older undone document operations', async () => {
    const session = await fresh();
    edit(session, [roleId], [{ kind: 'json', documentId: roleId,
      changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] }]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId,
      changes: [{ path: '/data/description', before: null, after: 'Description', op: 'set' }] }]);
    const last = requireValue(session.planUndo(roleId));
    requireValue(session.undo(last.planId));
    const first = requireValue(session.planUndo(roleId));
    requireValue(session.undo(first.planId));
    edit(session, [roleId], [{ kind: 'json', documentId: roleId,
      changes: [{ path: '/data/name', before: 'R0', after: 'R2', op: 'set' }] }]);
    const current = requireValue(session.planUndo(roleId));
    requireValue(session.undo(current.planId));

    expect(session.redo(first.planId)).toMatchObject({ ok: false, error: { code: 'REDO_CONFLICT' } });
    expect(requireValue(session.planRedo(roleId, ['/data/description'])).planId).toBe(last.planId);
    requireValue(session.redo(current.planId));
    expect(JSON.parse(session.readDocument(roleId)!.files[`characters/${roleId}.json`]!).data).toEqual({ name: 'R2' });
  });
  it('restores consecutive undos in order and invalidates the redo branch after a new edit', async () => {
    const session=await fresh();
    edit(session,[sceneId],[{kind:'text',documentId:sceneId,edits:[{start:0,end:2,before:'S0',after:'S1'}]}]);
    edit(session,[sceneId],[{kind:'text',documentId:sceneId,edits:[{start:0,end:2,before:'S1',after:'S2'}]}]);
    const last=requireValue(session.planUndo(sceneId));requireValue(session.undo(last.planId));
    const first=requireValue(session.planUndo(sceneId));requireValue(session.undo(first.planId));
    expect(session.readRaw(sceneId)?.raw).toBe('S0');
    requireValue(session.redo(first.planId));expect(session.readRaw(sceneId)?.raw).toBe('S1');
    requireValue(session.redo(last.planId));expect(session.readRaw(sceneId)?.raw).toBe('S2');
    const again=requireValue(session.planUndo(sceneId));requireValue(session.undo(again.planId));
    edit(session,[sceneId],[{kind:'text',documentId:sceneId,edits:[{start:0,end:2,before:'S1',after:'S3'}]}]);
    expect(session.redo(again.planId).ok).toBe(false);expect(session.readRaw(sceneId)?.raw).toBe('S3');
  });
  it('keeps an unexecuted undo plan stale after another history operation', async () => {
    const session=await fresh();edit(session,[sceneId],[{kind:'text',documentId:sceneId,edits:[{start:0,end:2,before:'S0',after:'S1'}]}]);
    const stale=requireValue(session.planUndo(sceneId)),current=requireValue(session.planUndo(sceneId));requireValue(session.undo(current.planId));
    expect(session.undo(stale.planId).ok).toBe(false);expect(session.readRaw(sceneId)?.raw).toBe('S0');
  });
  it('commits stylesheet source and compiled CSS as one reversible document group', async () => {
    const session = await fresh(), id = crypto.randomUUID();
    const source = `ui/styles/${id}.scss`, css = `ui/styles/${id}.css`, manifest = `ui/styles/${id}.json`;
    edit(session, [], [{ kind: 'document', documentId: id, op: 'create', before: null,
      after: { format: 'json', files: { [manifest]: envelope(id, { kind: 'style' }), [source]: '$ink: red;', [css]: 'color:red' } } }]);
    const receipt = edit(session, [id], [
      { kind: 'file', documentId: id, path: source, before: '$ink: red;', after: '$ink: blue;' },
      { kind: 'file', documentId: id, path: css, before: 'color:red', after: 'color:blue' },
    ]);
    const undo = requireValue(session.planUndo(id, receipt.operationId)); requireValue(session.undo(undo.planId));
    expect(session.readDocument(id)?.files[source]).toBe('$ink: red;');
    expect(session.readDocument(id)?.files[css]).toBe('color:red');
  });
  it('saves the associated latest versions while an unrelated dirty document stays in memory', async () => {
    const session = await fresh();
    edit(session, [sceneId, roleId], [
      { kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] },
      { kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] },
    ]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R1', after: 'R2', op: 'set' }] }]);
    edit(session, [otherId], [{ kind: 'json', documentId: otherId, changes: [{ path: '/data/name', before: 'B0', after: 'B1', op: 'set' }] }]);
    const plan = requireValue(session.planSave({ kind: 'current', documentId: sceneId }));
    expect(plan.members).toEqual([sceneId, roleId]);
    const saving = session.save(plan.planId);
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S1', after: 'S2' }] }]);
    const receipt = requireValue(await saving);
    expect(receipt.remainingDirty).toEqual([sceneId, otherId]);
    expect(session.readRaw(sceneId)?.raw).toBe('S2');
    expect(session.readRaw(sceneId, 'saved')?.raw).toBe('S1');
    expect((await openSession()).readRaw(sceneId)?.raw).toBe('S1');
    expect(JSON.parse(await readFile(join(root, 'characters', `${roleId}.json`), 'utf8')).data.name).toBe('R2');
    const all = requireValue(session.planSave({ kind: 'all' }));
    expect(all.members).toEqual([sceneId, otherId]);
    const allReceipt = requireValue(await session.save(all.planId));
    expect(allReceipt.remainingDirty).toEqual([]);
    const afterAllSave = await openSession();
    expect(afterAllSave.readRaw(sceneId)?.raw).toBe('S2');
    expect(JSON.parse(afterAllSave.readDocument(otherId)!.files[`scenes/${otherId}.json`]!).data.name).toBe('B1');
  });

  it('undoes the actual dependent closure and preserves an unrelated edit', async () => {
    const session = await fresh();
    const first = edit(session, [sceneId, roleId], [
      { kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] },
      { kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] },
    ]);
    edit(session, [roleId], [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R1', after: 'R2', op: 'set' }] }]);
    edit(session, [otherId], [{ kind: 'json', documentId: otherId, changes: [{ path: '/data/name', before: 'B0', after: 'B1', op: 'set' }] }]);
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S1', after: 'S2' }] }]);
    const plan = requireValue(session.planUndo(sceneId, first.operationId));
    expect(plan.reverseOrder).toHaveLength(3);
    requireValue(session.undo(plan.planId));
    expect(session.readRaw(sceneId)?.raw).toBe('S0');
    expect(JSON.parse(session.readDocument(roleId)!.files[`characters/${roleId}.json`]!).data.name).toBe('R0');
    expect(JSON.parse(session.readDocument(otherId)!.files[`scenes/${otherId}.json`]!).data.name).toBe('B1');
    requireValue(session.redo(plan.planId));
    expect(session.readRaw(sceneId)?.raw).toBe('S2');
  });

  it('reports base, local and disk without overwriting external source', async () => {
    const session = await fresh();
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }]);
    await writeFile(join(root, 'scenes', sceneId, 'script.gal'), 'S2');
    const plan = requireValue(session.planSave({ kind: 'current', documentId: sceneId }));
    expect((await session.save(plan.planId)).ok).toBe(false);
    expect(session.getConflict(plan.planId)).toContainEqual({ path: `scenes/${sceneId}/script.gal`, base: 'S0', local: 'S1', disk: 'S2' });
    expect(await readFile(join(root, 'scenes', sceneId, 'script.gal'), 'utf8')).toBe('S2');
    requireValue(await session.resolveConflict(plan.planId, 'local'));
    const retry = requireValue(session.planSave({ kind: 'current', documentId: sceneId }));
    requireValue(await session.save(retry.planId));
    expect(await readFile(join(root, 'scenes', sceneId, 'script.gal'), 'utf8')).toBe('S1');
  });

  it('keeps disk source when choosing a separate conflict copy and preserves invalid DSL verbatim', async () => {
    const session = await fresh();
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'assets', 'index.json'), '{"asset":"retained"}');
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: '{bad' }] }]);
    await writeFile(join(root, 'scenes', sceneId, 'script.gal'), 'S2');
    const plan = requireValue(session.planSave({ kind: 'current', documentId: sceneId }));
    expect((await session.save(plan.planId)).ok).toBe(false);
    const copy = `${root}-copy`;
    try {
      requireValue(await session.resolveConflict(plan.planId, 'copy', copy));
      expect(await readFile(join(copy, 'scenes', sceneId, 'script.gal'), 'utf8')).toBe('{bad');
      expect(await readFile(join(copy, 'assets', 'index.json'), 'utf8')).toBe('{"asset":"retained"}');
      expect(await readFile(join(copy, 'characters', `${roleId}.json`), 'utf8')).toContain('R0');
      expect(await readFile(join(root, 'scenes', sceneId, 'script.gal'), 'utf8')).toBe('S2');
      const second = requireValue(session.planSave({ kind: 'current', documentId: sceneId }));
      expect((await session.save(second.planId)).ok).toBe(false);
      requireValue(await session.resolveConflict(second.planId, 'disk'));
      expect(session.readRaw(sceneId)?.raw).toBe('S2');
    } finally { await rm(copy, { recursive: true, force: true }); }
  });

  it('restores both files of a dirty scene and its associated save group from a draft', async () => {
    const session = await fresh();
    edit(session, [sceneId, roleId], [
      { kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] },
      { kind: 'json', documentId: sceneId, changes: [{ path: '/data/name', before: 'S', after: 'S-new', op: 'set' }] },
      { kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] },
    ]);
    await session.writeDraft();
    const reopened = await openSession();
    expect(requireValue(await reopened.recover('restore'))).toEqual([sceneId, roleId]);
    expect(reopened.readRaw(sceneId)?.raw).toBe('S1');
    expect(JSON.parse(reopened.readDocument(sceneId)!.files[`scenes/${sceneId}/scene.json`]!).data.name).toBe('S-new');
    expect(requireValue(reopened.planSave({ kind: 'current', documentId: sceneId })).members).toEqual([sceneId, roleId]);
  });

  it('reverses two source edits with shifted positions', async () => {
    const session = await fresh();
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId,
      edits: [{ start: 0, end: 1, before: 'S', after: 'Scene' }, { start: 1, end: 2, before: '0', after: 'one' }] }]);
    expect(session.readRaw(sceneId)?.raw).toBe('Sceneone');
    const undo = requireValue(session.planUndo(sceneId));
    requireValue(session.undo(undo.planId));
    expect(session.readRaw(sceneId)?.raw).toBe('S0');
  });

  it('creates and deletes a document through a deterministic file image with undo and redo', async () => {
    const session = await fresh();
    const path = `presentation/presets/${presetId}.json`;
    const image = { format: 'json', files: { [path]: envelope(presetId, { name: 'Move' }) } };
    const plan = requireValue(session.planEdit({ label: 'preset', origin: 'preset', expected: [],
      patches: [{ kind: 'document', documentId: presetId, op: 'create', before: null, after: image }],
      preparedAssets: [], requiredRefs: [] }));
    const created = requireValue(session.applyEdit(plan.planId, []));
    const save = requireValue(session.planSave({ kind: 'current', documentId: presetId }));
    requireValue(await session.save(save.planId));
    expect((await openSession()).readDocument(presetId)).not.toBeNull();
    const undo = requireValue(session.planUndo(presetId, created.operationId));
    requireValue(session.undo(undo.planId));
    expect(requireValue(session.planSave({ kind: 'current', documentId: presetId })).files).toContainEqual({
      path, documentId: presetId, oldExists: true, newExists: false,
    });
    requireValue(session.redo(undo.planId));
    expect(session.readDocument(presetId)!.files[path]).toContain('Move');
  });

  it('deletes and restores every file of a scene document', async () => {
    const session = await fresh();
    const saved = session.readDocument(sceneId)!;
    const image = { format: 'dsl', files: saved.files };
    const expected = [{ ref: { kind: 'document' as const, id: sceneId }, revision: saved.revision }];
    const plan = requireValue(session.planEdit({ label: 'delete scene', origin: 'batch', expected,
      patches: [{ kind: 'document', documentId: sceneId, op: 'delete', before: image, after: null }],
      preparedAssets: [], requiredRefs: [] }));
    const receipt = requireValue(session.applyEdit(plan.planId, expected));
    expect(session.readRaw(sceneId)).toBeNull();
    const removal = requireValue(session.planSave({ kind: 'current', documentId: sceneId }));
    expect(removal.files).toHaveLength(2);
    expect(removal.files.every(file => !file.newExists)).toBe(true);
    const undo = requireValue(session.planUndo(sceneId, receipt.operationId));
    requireValue(session.undo(undo.planId));
    expect(session.readRaw(sceneId)?.raw).toBe('S0');
    requireValue(session.redo(undo.planId));
    expect(session.readRaw(sceneId)).toBeNull();
  });

  it('retains association when saving a group after undo', async () => {
    const session = await fresh();
    const applied = edit(session, [sceneId, roleId], [
      { kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] },
      { kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] },
    ]);
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId));
    requireValue(session.undo(requireValue(session.planUndo(sceneId, applied.operationId)).planId));
    expect(requireValue(session.planSave({ kind: 'current', documentId: sceneId })).members).toEqual([sceneId, roleId]);
  });

  it.each(['local', 'disk'] as const)('uses the newly confirmed disk baseline after a stale recovery choice: %s', async choice => {
    const session = await fresh(), path = `scenes/${sceneId}/script.gal`;
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }]);
    await session.writeDraft(); await session.dispose('keep');
    await writeFile(join(root, path), 'S2');
    const reopened = await openSession();
    expect(await reopened.recover('restore')).toMatchObject({ ok: false, error: { code: 'RECOVERY_CONFLICT' } });
    await writeFile(join(root, path), 'S3');
    expect(await reopened.resolveRecoveryConflict(choice)).toMatchObject({ ok: false, error: { code: 'RECOVERY_CONFLICT_STALE' } });
    expect(reopened.getRecoveryConflict()[0]?.disk).toBe('S3');
    requireValue(await reopened.resolveRecoveryConflict(choice));
    expect(reopened.readRaw(sceneId)?.raw).toBe(choice === 'local' ? 'S1' : 'S3');
    requireValue(await reopened.save(requireValue(reopened.planSave({ kind: 'all' })).planId));
    expect(await readFile(join(root, path), 'utf8')).toBe(choice === 'local' ? 'S1' : 'S3');
  });

  it('does not resolve an old conflict over a later local edit', async () => {
    const session = await fresh();
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }]);
    await writeFile(join(root, 'scenes', sceneId, 'script.gal'), 'S2');
    const save = requireValue(session.planSave({ kind: 'current', documentId: sceneId }));
    expect((await session.save(save.planId)).ok).toBe(false);
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S1', after: 'S3' }] }]);
    expect((await session.resolveConflict(save.planId, 'disk')).ok).toBe(false);
    expect(session.readRaw(sceneId)?.raw).toBe('S3');
    expect(await readFile(join(root, 'scenes', sceneId, 'script.gal'), 'utf8')).toBe('S2');
  });

  it('checks required references against the projected edit at apply time', async () => {
    const session = await fresh();
    const required = [{ kind: 'asset' as const, id: presetId }];
    const expected = [{ ref: { kind: 'document' as const, id: sceneId }, revision: 1 }];
    const input = { label: 'asset', origin: 'field' as const, expected,
      patches: [{ kind: 'text' as const, documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }],
      preparedAssets: [], requiredRefs: required };
    const plan = requireValue(session.planEdit(input));
    expect(session.applyEdit(plan.planId, expected).ok).toBe(false);
    expect(session.readRaw(sceneId)?.raw).toBe('S0');
    const withResolver = await openSession({ resolveRequiredRef: ref => ref.id === presetId });
    const approved = requireValue(withResolver.planEdit(input));
    requireValue(withResolver.applyEdit(approved.planId, expected));
    expect(withResolver.readRaw(sceneId)?.raw).toBe('S1');
  });

  it('keeps read-only source versions fixed in the edit plan', async () => {
    const session = await fresh();
    const expected = [
      { ref: { kind: 'document' as const, id: sceneId }, revision: 1 },
      { ref: { kind: 'document' as const, id: roleId }, revision: 1 },
    ];
    const plan = requireValue(session.planEdit({ label: 'change role from scene', origin: 'field', expected,
      patches: [{ kind: 'json', documentId: roleId, changes: [{ path: '/data/name', before: 'R0', after: 'R1', op: 'set' }] }],
      preparedAssets: [], requiredRefs: [] }));
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId,
      edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }]);
    const substituted = [
      { ref: { kind: 'document' as const, id: sceneId }, revision: 2 },
      { ref: { kind: 'document' as const, id: roleId }, revision: 1 },
    ];
    plan.input.expected = substituted;
    expect(session.applyEdit(plan.planId, substituted).ok).toBe(false);
    expect(JSON.parse(session.readDocument(roleId)!.files[`characters/${roleId}.json`]!).data.name).toBe('R0');
  });

  it('compares draft base to disk and routes external changes through conflict choice', async () => {
    const session = await fresh();
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }]);
    requireValue(await session.dispose('keep'));
    await writeFile(join(root, 'scenes', sceneId, 'script.gal'), 'S2');
    const reopened = await openSession();
    expect((await reopened.recover('restore')).ok).toBe(false);
    expect(reopened.getRecoveryConflict()).toContainEqual({ path: `scenes/${sceneId}/script.gal`,
      base: 'S0', local: 'S1', disk: 'S2' });
    expect(reopened.readRaw(sceneId)?.raw).toBe('S2');
    expect((await reopened.dispose('saved')).ok).toBe(false);
    requireValue(await reopened.resolveRecoveryConflict('local'));
    expect(reopened.readRaw(sceneId)?.raw).toBe('S1');
    requireValue(await reopened.save(requireValue(reopened.planSave({ kind: 'current', documentId: sceneId })).planId));
    expect(await readFile(join(root, 'scenes', sceneId, 'script.gal'), 'utf8')).toBe('S1');
  });

  it('stops pending draft writes when discarding a session', async () => {
    const session = await fresh();
    edit(session, [sceneId], [{ kind: 'text', documentId: sceneId, edits: [{ start: 0, end: 2, before: 'S0', after: 'S1' }] }]);
    expect((await session.dispose('saved')).ok).toBe(false);
    requireValue(await session.dispose('discard'));
    await new Promise(done => setTimeout(done, 1100));
    expect(requireValue(await session.listRecovery())).toBeNull();
    expect(session.planSave({ kind: 'all' }).ok).toBe(false);
  });
});

describe('M02-T04 real process termination', () => {
  const identity = [
    { path: `scenes/${sceneId}/scene.json`, documentId: sceneId, old: envelope(sceneId, { id: sceneId, name: 'S0' }), new: envelope(sceneId, { id: sceneId, name: 'S1' }, 2) },
    { path: `scenes/${sceneId}/script.gal`, documentId: sceneId, old: 'S0', new: 'S1' },
    { path: `characters/${roleId}.json`, documentId: roleId, old: envelope(roleId, { name: 'R0' }), new: envelope(roleId, { name: 'R1' }, 2) },
    { path: 'assets/index.json', documentId: assetIndexId,
      old: envelope(assetIndexId, { assets: [{ id: assetId, name: 'A0' }] }),
      new: envelope(assetIndexId, { assets: [{ id: assetId, name: 'A1' }] }, 2) },
  ];
  for (const [phase, expected] of [
    ['prepared', 'old'], ['secondInstalled', 'old'], ['beforeCommitted', 'old'], ['committed', 'new'],
  ] as const) {
    it(`recovers ${expected} complete group after killing child at ${phase}`, async () => {
      await rm(root, { recursive: true, force: true });
      await mkdir(root, { recursive: true });
      for (const member of identity) {
        await mkdir(dirname(join(root, member.path)), { recursive: true });
        await writeFile(join(root, member.path), member.old);
      }
      const inputFile = join(root, 'tx-input.json');
      await writeFile(inputFile, JSON.stringify(identity.map(member => ({ path: member.path,
        documentId: member.documentId, revision: 2, content: member.new }))));
      const child = spawn(process.execPath, [resolve('src/child-tx.mjs'), root, projectId, phase, inputFile], { stdio: ['ignore', 'pipe', 'pipe'] });
      await new Promise<void>((done, reject) => {
        let output = '';
        const timeout = setTimeout(() => reject(new Error(`Child did not reach ${phase}: ${output}`)), 10000);
        child.stdout.on('data', chunk => {
          output += String(chunk);
          if (output.includes(`READY:${phase}`)) { clearTimeout(timeout); done(); }
        });
        child.on('exit', code => { clearTimeout(timeout); reject(new Error(`Child exited early: ${code}`)); });
      });
      const records = await import('node:fs/promises').then(fs => fs.readdir(join(root, '.galcraft', 'transactions')));
      expect(records).toHaveLength(1);
      const record = JSON.parse(await readFile(join(root, '.galcraft', 'transactions', records[0]!, 'record.json'), 'utf8'));
      expect(record.members.map((member: { path: string; documentId: string; revision: number }) =>
        ({ path: member.path, documentId: member.documentId, revision: member.revision })))
        .toEqual(identity.map(member => ({ path: member.path, documentId: member.documentId, revision: 2 })));
      expect(child.kill('SIGKILL')).toBe(true);
      await new Promise<void>(done => child.once('exit', () => done()));
      expect(await recoverTransactions(root)).toBe('ready');
      const contents = await Promise.all(identity.map(member => readFile(join(root, member.path), 'utf8')));
      expect(contents).toEqual(identity.map(member => expected === 'old' ? member.old : member.new));
    });
  }

  it.skipIf(process.platform !== 'win32')('keeps recovery pending while an old target is locked, then retries', async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    for (const member of identity) {
      await mkdir(dirname(join(root, member.path)), { recursive: true });
      await writeFile(join(root, member.path), member.old);
    }
    const inputFile = join(root, 'tx-input.json');
    await writeFile(inputFile, JSON.stringify(identity.map(member => ({ path: member.path,
      documentId: member.documentId, revision: 2, content: member.new }))));
    const transaction = spawn(process.execPath, [resolve('src/child-tx.mjs'), root, projectId, 'secondInstalled', inputFile],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise<void>((done, reject) => {
      const timeout = setTimeout(() => reject(new Error('Transaction did not install second file')), 10000);
      transaction.stdout.once('data', data => {
        clearTimeout(timeout);
        String(data).includes('READY:secondInstalled') ? done() : reject(new Error(String(data)));
      });
    });
    const target = join(root, identity[0]!.path).replaceAll("'", "''");
    const lockScript = `$stream = [System.IO.File]::Open('${target}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); [Console]::Out.WriteLine('LOCKED'); [Console]::ReadLine() | Out-Null; $stream.Dispose()`;
    const locker = spawn('powershell.exe', ['-NoProfile', '-Command', lockScript], { stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      await new Promise<void>((done, reject) => {
        const timeout = setTimeout(() => reject(new Error('File lock did not start')), 10000);
        locker.stdout.once('data', data => {
          clearTimeout(timeout);
          String(data).includes('LOCKED') ? done() : reject(new Error(String(data)));
        });
      });
      const transactionExited = new Promise<void>(done => transaction.once('exit', () => done()));
      expect(transaction.kill('SIGKILL')).toBe(true);
      await transactionExited;
      expect(await recoverTransactions(root)).toBe('recoveryPending');
    } finally {
      if (locker.exitCode === null && locker.signalCode === null) {
        const lockerExited = new Promise<void>(done => locker.once('exit', () => done()));
        locker.kill('SIGKILL');
        await lockerExited;
      }
      if (transaction.exitCode === null && transaction.signalCode === null) transaction.kill('SIGKILL');
    }
    expect(await recoverTransactions(root)).toBe('ready');
    const contents = await Promise.all(identity.map(member => readFile(join(root, member.path), 'utf8')));
    expect(contents).toEqual(identity.map(member => member.old));
  }, 15000);

  it.skipIf(process.platform !== 'win32')('keeps a committed group when journal cleanup is blocked', async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    for (const member of identity) {
      await mkdir(dirname(join(root, member.path)), { recursive: true });
      await writeFile(join(root, member.path), member.old);
    }
    const base = join(root, '.galcraft', 'transactions');
    const locker: { current: ReturnType<typeof spawn> | null } = { current: null };
    try {
      await commitFiles(root, projectId, identity.map(member => ({ path: member.path,
        documentId: member.documentId, revision: 2, content: member.new })), async phase => {
        if (phase !== 'committed') return;
        const [transactionId] = await readdir(base);
        const record = join(base, transactionId!, 'record.json').replaceAll("'", "''");
        const lockScript = `$stream = [System.IO.File]::Open('${record}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); [Console]::Out.WriteLine('LOCKED'); [Console]::ReadLine() | Out-Null; $stream.Dispose()`;
        const lockerProcess = spawn('powershell.exe', ['-NoProfile', '-Command', lockScript], { stdio: ['pipe', 'pipe', 'pipe'] });
        locker.current = lockerProcess;
        await new Promise<void>((done, reject) => {
          const timeout = setTimeout(() => reject(new Error('Journal lock did not start')), 10000);
          lockerProcess.stdout!.once('data', data => {
            clearTimeout(timeout);
            String(data).includes('LOCKED') ? done() : reject(new Error(String(data)));
          });
        });
      });
      expect(await readdir(base)).toHaveLength(1);
      const contents = await Promise.all(identity.map(member => readFile(join(root, member.path), 'utf8')));
      expect(contents).toEqual(identity.map(member => member.new));
    } finally {
      const active = locker.current;
      if (active && active.exitCode === null && active.signalCode === null) {
        const exited = new Promise<void>(done => active.once('exit', () => done()));
        active.kill('SIGKILL');
        await exited;
      }
    }
    expect(await recoverTransactions(root)).toBe('ready');
    expect(await readdir(base)).toHaveLength(0);
  }, 15000);
});
