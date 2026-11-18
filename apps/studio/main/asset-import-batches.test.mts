import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { Asset, Issue } from '@galcraft/contracts';
import { AssetImportBatches } from './asset-import-batches.mts';
import { fail, ok } from './result.mjs';
import { AssetTypeRegistry, createAssetIndex } from '@galcraft/assets';
import { ProjectSession } from '@galcraft/documents';
import { StudioAssets } from './asset-providers.mjs';

const root = resolve(import.meta.dirname, '../../../tmp/testing/asset-import-batches');
const source = (directory = 'first', projectId = 'Work01') => ({ root: join(root, directory), projectId, current: () => true });
const issue: Issue = { code: 'READ_FAILED', owner: 'M04', severity: 'error', message: '源文件暂时无法读取', related: [], actions: ['retry'], details: { file: 'voice.ogg' } };
const asset = (id = 'Asset1') => ({ id, name: '雨声' }) as Asset;
const failure = (path = '/input/voice.ogg') => ({ path, issue });
const recordPath = (id: string, directory = 'first') => join(root, directory, '.galcraft', 'asset-import-batches', `${id}.json`);
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it('returns the exact new batch identity on fatal failures of the same path', async () => {
  const batches = new AssetImportBatches();
  const run = async () => ({ ok: false as const, error: issue, issues: [issue] });
  const first = await batches.import(source(), ['/input/voice.ogg'], undefined, run);
  const second = await batches.import(source(), ['/input/voice.ogg'], undefined, run);
  expect(first.ok).toBe(false); expect(second.ok).toBe(false);
  expect(first.batch?.id).toBeTruthy(); expect(second.batch?.id).toBeTruthy();
  expect(second.batch?.id).not.toBe(first.batch?.id);
  expect(second.batch?.attemptId).not.toBe(first.batch?.attemptId);
  if (second.ok) throw new Error('Expected the original failure');
  expect(second.error).toBe(issue); expect(second.issues).toEqual([issue]);
  const stored = JSON.parse(await readFile(recordPath(second.batch!.id), 'utf8'));
  expect(stored.attempts[0].id).toBe(second.batch!.attemptId);
  expect(stored.failed).toEqual([failure()]);
});

it('retains success identities, structured failures and attempts when the source project is reopened', async () => {
  const batches = new AssetImportBatches();
  const first = await batches.import(source(), ['/input/rain.png', '/input/voice.ogg'], undefined,
    async () => ok({ succeeded: [asset()], failed: [failure()] }));
  expect(first.ok).toBe(true);
  if (!first.ok) throw first.error;
  const id = first.value.batch!.id;
  const reopened = await new AssetImportBatches().list(source());
  expect(reopened).toMatchObject({ ok: true, value: [{ id, projectId: 'Work01', revision: 1,
    succeeded: [{ id: 'Asset1', name: '雨声' }], failed: [failure()], attempts: [{ id: first.value.batch!.attemptId,
      succeeded: ['Asset1'], failed: [failure()] }] }] });
  const retry = await batches.import(source(), ['/input/rain.png', '/input/voice.ogg'], id, async paths => {
    expect(paths).toEqual(['/input/voice.ogg']);
    return ok({ succeeded: [asset('Asset2')], failed: [] });
  });
  expect(retry).toMatchObject({ ok: true, value: { failed: [], batch: { id, revision: 2 } } });
  if (!retry.ok) throw retry.error;
  expect(retry.value.batch!.attemptId).not.toBe(first.value.batch!.attemptId);
  expect(JSON.parse(await readFile(recordPath(id), 'utf8'))).toMatchObject({ succeeded: [{ id: 'Asset1' }, { id: 'Asset2' }],
    failed: [], attempts: [{ failed: [failure()] }, { succeeded: ['Asset2'], failed: [] }] });
});

it('serializes retries and removes recovered files before executing a stale queued retry', async () => {
  const batches = new AssetImportBatches();
  const initial = await batches.import(source(), ['/input/voice.ogg'], undefined, async () => ok({ succeeded: [], failed: [failure()] }));
  if (!initial.ok) throw initial.error;
  let release!: () => void, started!: () => void, runs = 0;
  const running = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const run = async (paths: string[]) => { runs++; expect(paths).toEqual(['/input/voice.ogg']); started(); await held; return ok({ succeeded: [asset()], failed: [] }); };
  const first = batches.import(source(), ['/input/voice.ogg'], initial.value.batch!.id, run);
  await running;
  const second = batches.import(source(), ['/input/voice.ogg'], initial.value.batch!.id, run);
  release();
  const results = await Promise.all([first, second]);
  expect(runs).toBe(1);
  expect(results).toMatchObject([{ ok: true, value: { batch: { revision: 2 }, succeeded: [{ id: 'Asset1' }] } },
    { ok: true, value: { batch: { revision: 2 }, succeeded: [], failed: [] } }]);
  const listed = await batches.list(source());
  expect(listed.ok && listed.value[0]!.attempts).toHaveLength(2);
});

it('retains failures outside a retry subset and gives each executed retry a new attempt identity', async () => {
  const batches = new AssetImportBatches();
  const initial = await batches.import(source(), ['first', 'second'], undefined,
    async () => ok({ succeeded: [], failed: [failure('first'), failure('second')] }));
  if (!initial.ok) throw initial.error;
  const retried = await batches.import(source(), ['first'], initial.value.batch!.id,
    async () => ok({ succeeded: [], failed: [{ path: 'first', issue: { ...issue, message: '仍无法读取' } }] }));
  if (!retried.ok) throw retried.error;
  expect(retried.value.failed).toEqual([failure('second'), { path: 'first', issue: { ...issue, message: '仍无法读取' } }]);
  expect(retried.value.batch!.attemptId).not.toBe(initial.value.batch!.attemptId);
});

it('keeps fatal import errors in the batch while preserving the original Result failure', async () => {
  const batches = new AssetImportBatches(), rejected = fail('TYPE_PROVIDER_MISSING', '请补齐素材类型插件', 'M04', ['supplyDependency']);
  expect(await batches.import(source(), ['voice'], undefined, async () => rejected)).toMatchObject(rejected);
  expect(await batches.list(source())).toMatchObject({ ok: true, value: [{ failed: [{ path: 'voice', issue: rejected.error }],
    attempts: [{ failed: [{ path: 'voice', issue: rejected.error }] }] }] });
});

it('writes late results to the captured project and rejects their delivery after a project switch', async () => {
  const batches = new AssetImportBatches();
  let current = true;
  const captured = { ...source(), current: () => current };
  const result = await batches.import(captured, ['rain'], undefined, async () => { current = false; return ok({ succeeded: [asset()], failed: [] }); });
  expect(result).toMatchObject({ ok: false, error: { code: 'PROJECT_STALE' } });
  expect(await new AssetImportBatches().list(source())).toMatchObject({ ok: true, value: [{ projectId: 'Work01', succeeded: [{ id: 'Asset1' }] }] });
  expect(await batches.list(source('second', 'Work02'))).toEqual(ok([]));
});

it('returns a read failure for corrupt or foreign records without running a retry', async () => {
  const batches = new AssetImportBatches();
  expect(await batches.list(source())).toEqual(ok([]));
  await mkdir(join(root, 'first', '.galcraft', 'asset-import-batches'), { recursive: true });
  await writeFile(recordPath('Batch1'), '{invalid');
  expect(await batches.list(source())).toMatchObject({ ok: false, error: { code: 'ASSET_IMPORT_BATCH_READ' } });
  let runs = 0;
  expect(await batches.import(source(), ['voice'], 'Batch1', async () => { runs++; return ok({ succeeded: [], failed: [] }); }))
    .toMatchObject({ ok: false, error: { code: 'ASSET_IMPORT_BATCH_READ' } });
  expect(runs).toBe(0);
  await rm(recordPath('Batch1'));
  const created = await batches.import(source(), ['voice'], undefined, async () => ok({ succeeded: [], failed: [failure('voice')] }));
  if (!created.ok) throw created.error;
  expect(await batches.list(source('first', 'Work02'))).toMatchObject({ ok: false, error: { code: 'ASSET_IMPORT_BATCH_READ' } });
});

it('recovers a failed receipt write without importing the recovered files again', async () => {
  const batches = new AssetImportBatches();
  const initial = await batches.import(source(), ['voice'], undefined, async () => ok({ succeeded: [], failed: [failure('voice')] }));
  if (!initial.ok) throw initial.error;
  const id = initial.value.batch!.id, path = recordPath(id);
  const written = await batches.import(source(), ['voice'], id, async () => {
    // A directory at the receipt path makes the final atomic rename fail on every platform.
    await rm(path); await mkdir(path);
    return ok({ succeeded: [asset()], failed: [] });
  });
  expect(written).toMatchObject({ ok: false, error: { code: 'ASSET_IMPORT_BATCH_WRITE' } });
  expect(await batches.list(source())).toMatchObject({ ok: false, error: { code: 'ASSET_IMPORT_BATCH_WRITE' } });
  await rm(path, { recursive: true });
  expect(await batches.list(source())).toMatchObject({ ok: true, value: [{ id, revision: 2, succeeded: [{ id: 'Asset1' }], failed: [] }] });
  let runs = 0;
  expect(await batches.import(source(), ['voice'], id, async () => { runs++; return ok({ succeeded: [], failed: [] }); }))
    .toMatchObject({ ok: true, value: { succeeded: [], failed: [], batch: { id, revision: 2 } } });
  expect(runs).toBe(0);
});

it('wraps the real M02 import transaction and keeps its batches across provider recreation', async () => {
  const { root: projectRoot } = source();
  const index = createAssetIndex('Index1');
  const session = await ProjectSession.createProject(projectRoot, 'Work01', [{ documentId: 'Index1', revision: index.revision,
    format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
  try {
    const documents = { currentSession: session, currentRoot: projectRoot };
    const studioAssets = () => new StudioAssets(documents, '', null, null, null);
    const valid = join(projectRoot, 'rain.svg'), missing = join(projectRoot, 'voice.svg');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12"><path d="M0 0h12v12H0z"/></svg>';
    await writeFile(valid, svg);
    const service = studioAssets();
    const result = await service.importBatch([valid, missing]);
    expect(result).toMatchObject({ ok: true, value: { succeeded: [{ name: 'rain.svg' }], failed: [{ path: missing }], batch: { revision: 1 } } });
    if (!result.ok) throw result.error;
    expect(session.operations).toHaveLength(1);
    const id = result.value.batch!.id;
    expect(await studioAssets().listImportBatches()).toMatchObject({ ok: true, value: [{ id,
      succeeded: [{ id: result.value.succeeded[0]!.id }], failed: [{ path: missing }] }] });
    await writeFile(missing, svg);
    const retry = await service.importBatch([valid, missing], id);
    expect(retry).toMatchObject({ ok: true, value: { succeeded: [{ name: 'voice.svg' }], failed: [], batch: { id, revision: 2 } } });
    expect(service.current()!.index.data.assets).toHaveLength(2);
    expect(session.operations).toHaveLength(2);
    const retained = await studioAssets().listImportBatches();
    expect(retained).toMatchObject({ ok: true, value: [{ succeeded: [{ id: result.value.succeeded[0]!.id }, { name: 'voice.svg' }], failed: [] }] });
  } finally { await session.dispose('discard'); }
});

it('does not commit a prepared ordinary import after the source session changes', async () => {
  const { root: projectRoot } = source();
  const index = createAssetIndex('Index1');
  const session = await ProjectSession.createProject(projectRoot, 'Work01', [{ documentId: 'Index1', revision: index.revision,
    format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
  try {
    const documents: { currentSession: ProjectSession | null; currentRoot: string } = { currentSession: session, currentRoot: projectRoot };
    const service = new StudioAssets(documents, '', null, null, null), valid = join(projectRoot, 'rain.svg');
    await writeFile(valid, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M0 0h12v12H0z"/></svg>');
    let started!: () => void, release!: () => void;
    const acquired = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    service.assetTypes = { acquire: async () => { started(); await held; return { types: new AssetTypeRegistry(), release: async () => {} }; } };
    const imported = service.importBatch([valid]);
    await acquired;
    documents.currentSession = null;
    release();
    expect(await imported).toMatchObject({ ok: false, error: { code: 'PROJECT_STALE' } });
    expect(session.operations).toHaveLength(0);
    expect(JSON.parse(session.readDocument('Index1')!.files['assets/index.json']!).data.assets).toEqual([]);
    documents.currentSession = session;
    expect(await service.listImportBatches()).toMatchObject({ ok: true, value: [{ projectId: 'Work01', succeeded: [],
      failed: [{ path: valid, issue: { code: 'PROJECT_STALE' } }] }] });
  } finally { await session.dispose('discard'); }
});

it('rejects requests from a prior project before creating a foreign batch or importing files', async () => {
  const { root: projectRoot } = source();
  const index = createAssetIndex('Index1');
  const session = await ProjectSession.createProject(projectRoot, 'Work01', [{ documentId: 'Index1', revision: index.revision,
    format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
  try {
    const service = new StudioAssets({ currentSession: session, currentRoot: projectRoot }, '', null, null, null);
    expect(await service.importBatch(['/old-project/rain.svg'], undefined, 'Work02')).toMatchObject({ ok: false, error: { code: 'PROJECT_STALE' } });
    expect(await service.listImportBatches('Work02')).toMatchObject({ ok: false, error: { code: 'PROJECT_STALE' } });
    expect(session.operations).toHaveLength(0);
    expect(await service.listImportBatches('Work01')).toEqual(ok([]));
    await expect(readdir(join(projectRoot, '.galcraft', 'asset-import-batches'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await session.dispose('discard'); }
});
