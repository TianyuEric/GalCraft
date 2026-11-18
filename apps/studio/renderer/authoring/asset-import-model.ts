import type { AssetImportBatch, AssetImportReceipt, Id, Issue } from '@galcraft/contracts';

export type AssetImportResult = {
  succeeded: number; succeededIds?: Id[];
  failed: { path: string; reason: string; issue?: Issue }[];
  batch?: AssetImportReceipt['batch'];
};
export function mergeAssetImportResult(receipt: AssetImportReceipt, previous?: AssetImportResult): AssetImportResult {
  if (receipt.batch && previous) {
    const previousBatch = previous.batch;
    if (!previousBatch || receipt.batch.id !== previousBatch.id) previous = undefined;
    else if (receipt.batch.revision <= previousBatch.revision) return previous;
  }
  const succeededIds = [...new Set([...(previous?.succeededIds ?? []), ...receipt.succeeded.map(asset => asset.id)])];
  const succeeded = receipt.batch
    ? (previous?.succeeded ?? 0) - (previous?.succeededIds?.length ?? 0) + succeededIds.length
    : (previous?.succeeded ?? 0) + receipt.succeeded.length;
  return { succeeded, succeededIds,
    failed: receipt.failed.map(item => ({ path: item.path, reason: item.issue.message, issue: item.issue })),
    ...(receipt.batch ? { batch: receipt.batch } : {}) };
}
export function assetImportBatchResult(batch: AssetImportBatch): AssetImportResult {
  const attempt = batch.attempts.at(-1);
  return { succeeded: batch.succeeded.length, succeededIds: batch.succeeded.map(asset => asset.id),
    failed: batch.failed.map(item => ({ path: item.path, reason: item.issue.message, issue: item.issue })),
    ...(attempt ? { batch: { id: batch.id, attemptId: attempt.id, revision: batch.revision } } : {}) };
}
export function failedAssetPaths(result: AssetImportResult): string[] { return [...new Set(result.failed.map(item => item.path))]; }
export function assetFileName(path: string): string { return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path; }
