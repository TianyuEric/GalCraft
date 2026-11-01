import type { AssetImportReceipt } from '@galcraft/contracts';

export type AssetImportResult = { succeeded: number; failed: { path: string; reason: string }[] };
export function mergeAssetImportResult(receipt: AssetImportReceipt, previous?: AssetImportResult): AssetImportResult {
  return { succeeded: (previous?.succeeded ?? 0) + receipt.succeeded.length,
    failed: receipt.failed.map(item => ({ path: item.path, reason: item.issue.message })) };
}
export function failedAssetPaths(result: AssetImportResult): string[] { return [...new Set(result.failed.map(item => item.path))]; }
export function assetFileName(path: string): string { return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path; }
