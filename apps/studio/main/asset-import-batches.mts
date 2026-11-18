import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { createId, IdSchema, IssueSchema, UtcTimeSchema, type AssetImportBatch, type AssetImportReceipt, type Id, type Result } from '@galcraft/contracts';
import { fail, fromError, ok } from './result.mjs';

const failureSchema = z.strictObject({ path: z.string(), issue: IssueSchema });
const batchSchema = z.strictObject({
  id: IdSchema, projectId: IdSchema, revision: z.number().int().positive().safe(),
  createdAt: UtcTimeSchema, updatedAt: UtcTimeSchema,
  succeeded: z.array(z.strictObject({ id: IdSchema, name: z.string() })), failed: z.array(failureSchema),
  attempts: z.array(z.strictObject({ id: IdSchema, createdAt: UtcTimeSchema,
    succeeded: z.array(IdSchema), failed: z.array(failureSchema) })).min(1),
});

type ImportSource = { root: string; projectId: Id; current(): boolean };
type ImportRun = (paths: string[]) => Promise<Result<AssetImportReceipt>>;
type ImportResponse = Result<AssetImportReceipt> & { batch?: AssetImportReceipt['batch'] };
const batchIdentity = (batch: AssetImportBatch) => ({ id: batch.id, attemptId: batch.attempts.at(-1)!.id, revision: batch.revision });

/** M04 receipts for ordinary Studio imports; collaboration retains its own receipts. */
export class AssetImportBatches {
  private readonly queues = new Map<string, Promise<unknown>>();
  // A failed receipt write must not make an in-process retry import successful files again.
  private readonly pending = new Map<string, AssetImportBatch>();

  private projectKey(source: ImportSource) { return JSON.stringify([resolve(source.root), source.projectId]) + ':'; }
  private key(source: ImportSource, batchId: Id) { return this.projectKey(source) + batchId; }
  private directory(source: ImportSource) { return join(source.root, '.galcraft', 'asset-import-batches'); }
  private path(source: ImportSource, batchId: Id) { return join(this.directory(source), `${IdSchema.parse(batchId)}.json`); }
  private stale() { return fail('PROJECT_STALE', '作品已切换，请返回原作品后查看或重试本批导入。', 'M04'); }

  private async enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
    const operation = (this.queues.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    this.queues.set(key, operation);
    try { return await operation; }
    finally { if (this.queues.get(key) === operation) this.queues.delete(key); }
  }

  private async write(source: ImportSource, batch: AssetImportBatch): Promise<void> {
    const path = this.path(source, batch.id), staged = `${path}.${createId()}.tmp`;
    await mkdir(this.directory(source), { recursive: true });
    try {
      await writeFile(staged, JSON.stringify(batch), 'utf8');
      await rename(staged, path);
    } finally { await rm(staged, { force: true }); }
  }

  private async read(source: ImportSource, batchId: Id): Promise<AssetImportBatch> {
    const batch = batchSchema.parse(JSON.parse(await readFile(this.path(source, batchId), 'utf8')));
    if (batch.id !== batchId || batch.projectId !== source.projectId) throw new Error('导入批次不属于当前作品。');
    return batch;
  }

  async list(source: ImportSource): Promise<Result<AssetImportBatch[]>> {
    if (!source.current()) return this.stale();
    for (const key of [...this.pending.keys()].filter(key => key.startsWith(this.projectKey(source)))) {
      try { await this.enqueue(key, async () => {
        const batch = this.pending.get(key);
        if (batch) { await this.write(source, batch); this.pending.delete(key); }
      }); }
      catch (error) { return fail('ASSET_IMPORT_BATCH_WRITE', `素材导入结果仍未能保存：${String(error)}`, 'M04'); }
    }
    try {
      let files: string[];
      try { files = await readdir(this.directory(source)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        files = [];
      }
      const batches = await Promise.all(files.filter(file => file.endsWith('.json')).map(file => this.read(source, file.slice(0, -5))));
      if (!source.current()) return this.stale();
      return ok(batches.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)));
    } catch (error) { return fail('ASSET_IMPORT_BATCH_READ', `无法读取素材导入批次：${String(error)}`, 'M04'); }
  }

  async import(source: ImportSource, paths: string[], batchId: Id | undefined, run: ImportRun): Promise<ImportResponse> {
    const id = batchId ?? createId();
    if (!IdSchema.safeParse(id).success) return fail('ASSET_IMPORT_BATCH_MISSING', '素材导入批次无效。', 'M04');
    return this.enqueue(this.key(source, id), () => this.attempt(source, [...new Set(paths)], id, batchId !== undefined, run));
  }

  private async attempt(source: ImportSource, paths: string[], id: Id, retry: boolean, run: ImportRun): Promise<ImportResponse> {
    if (!source.current()) return this.stale();
    const key = this.key(source, id);
    let previous: AssetImportBatch | undefined;
    const pending = this.pending.get(key);
    if (pending) {
      try { await this.write(source, pending); this.pending.delete(key); }
      catch (error) { return { ...fail('ASSET_IMPORT_BATCH_WRITE', `素材导入结果仍未能保存：${String(error)}`, 'M04'), batch: batchIdentity(pending) }; }
    }
    try {
      if (retry) previous = await this.read(source, id);
    } catch (error) { return fail('ASSET_IMPORT_BATCH_READ', `无法恢复素材导入批次：${String(error)}`, 'M04'); }
    if (!source.current()) return this.stale();
    const remaining = previous && new Set(previous.failed.map(item => item.path));
    const attempted = remaining ? paths.filter(path => remaining.has(path)) : paths;
    // A queued retry may reach the batch after the preceding retry has recovered these files.
    if (!attempted.length && previous) return ok({ succeeded: [], failed: previous.failed,
      batch: { id, attemptId: previous.attempts.at(-1)!.id, revision: previous.revision } });

    const createdAt = new Date().toISOString(), attemptId = createId();
    let result: Result<AssetImportReceipt>;
    try { result = await run(attempted); }
    catch (error) { result = fromError(error, 'M04'); }
    let receipt: AssetImportReceipt;
    if (result.ok) receipt = result.value;
    else { const issue = result.error; receipt = { succeeded: [], failed: attempted.map(path => ({ path, issue })) }; }
    const attemptedPaths = new Set(attempted);
    const succeeded = new Map((previous?.succeeded ?? []).map(asset => [asset.id, asset]));
    for (const asset of receipt.succeeded) succeeded.set(asset.id, { id: asset.id, name: asset.name });
    const failed = [...(previous?.failed ?? []).filter(item => !attemptedPaths.has(item.path)), ...receipt.failed];
    const batch: AssetImportBatch = { id, projectId: source.projectId, revision: (previous?.revision ?? 0) + 1,
      createdAt: previous?.createdAt ?? createdAt, updatedAt: new Date().toISOString(), succeeded: [...succeeded.values()], failed,
      attempts: [...(previous?.attempts ?? []), { id: attemptId, createdAt, succeeded: receipt.succeeded.map(asset => asset.id), failed: receipt.failed }] };
    this.pending.set(key, batch);
    try { await this.write(source, batch); this.pending.delete(key); }
    catch (error) { return { ...fail('ASSET_IMPORT_BATCH_WRITE', `素材导入结果未能保存：${String(error)}`, 'M04'), batch: batchIdentity(batch) }; }
    if (!source.current()) return { ...this.stale(), batch: batchIdentity(batch) };
    return result.ok ? { ...result, value: { ...receipt, failed, batch: batchIdentity(batch) } } : { ...result, batch: batchIdentity(batch) };
  }
}
