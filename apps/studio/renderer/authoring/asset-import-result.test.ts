import { describe, expect, it } from 'vitest';
import type { Asset, AssetImportBatch, AssetImportReceipt } from '@galcraft/contracts';
import { assetFileName, assetImportBatchResult, failedAssetPaths, mergeAssetImportResult } from './asset-import-model.js';

describe('asset import feedback', () => {
  it('retries only failed source paths and retains the successful total after retry', () => {
    const imported = { id: 'Success' } as Asset;
    const failure: AssetImportReceipt['failed'][number] = { path: 'D:\\素材\\夜雨.png', issue: { code: 'READ_FAILED', owner: 'M04', severity: 'error', message: '文件无法读取', related: [], actions: [] } };
    const first = mergeAssetImportResult({ succeeded: [imported], failed: [failure] });
    expect(first.failed).toEqual([{ path: failure.path, reason: failure.issue.message, issue: failure.issue }]);
    expect(first.succeededIds).toEqual(['Success']);
    expect(failedAssetPaths(first)).toEqual([failure.path]);
    const retried = mergeAssetImportResult({ succeeded: [imported], failed: [] }, first);
    expect(retried).toEqual({ succeeded: 2, succeededIds: ['Success'], failed: [] });
    expect(failedAssetPaths(retried)).toEqual([]);
  });
  it('keeps renewed per-file failures without recounting previous successes', () => {
    const receipt: AssetImportReceipt = { succeeded: [], failed: [{ path: '/assets/voice.ogg', issue: { code: 'READ_FAILED', owner: 'M04', severity: 'error', message: '文件仍被占用', related: [], actions: [] } }] };
    expect(mergeAssetImportResult(receipt, { succeeded: 3, failed: [{ path: receipt.failed[0]!.path, reason: '旧原因' }] }))
      .toEqual({ succeeded: 3, succeededIds: [], failed: [{ path: '/assets/voice.ogg', reason: '文件仍被占用', issue: receipt.failed[0]!.issue }] });
  });
  it('restores retained batch identities and rejects duplicate or older attempt results', () => {
    const issue = { code: 'READ_FAILED', owner: 'M04', severity: 'error', message: '文件无法读取', related: [], actions: ['retry'], details: { path: 'voice' } } as const;
    const batch: AssetImportBatch = { id: 'Batch1', projectId: 'Work01', revision: 2, createdAt: '2026-11-17T00:00:00.000Z', updatedAt: '2026-11-17T00:01:00.000Z',
      succeeded: [{ id: 'Asset1', name: '雨景' }], failed: [{ path: 'voice', issue: { ...issue, related: [], actions: ['retry'] } }],
      attempts: [{ id: 'Try001', createdAt: '2026-11-17T00:00:00.000Z', succeeded: ['Asset1'], failed: [] },
        { id: 'Try002', createdAt: '2026-11-17T00:01:00.000Z', succeeded: [], failed: [] }] };
    const restored = assetImportBatchResult(batch);
    expect(restored).toMatchObject({ succeeded: 1, succeededIds: ['Asset1'], failed: [{ issue }], batch: { id: 'Batch1', attemptId: 'Try002', revision: 2 } });
    const old: AssetImportReceipt = { succeeded: [{ id: 'Asset2' } as Asset], failed: [], batch: { id: 'Batch1', attemptId: 'Try001', revision: 1 } };
    expect(mergeAssetImportResult(old, restored)).toBe(restored);
    expect(mergeAssetImportResult({ ...old, batch: restored.batch }, restored)).toBe(restored);
    const retry = mergeAssetImportResult({ ...old, batch: { id: 'Batch1', attemptId: 'Try003', revision: 3 } }, restored);
    expect(retry).toMatchObject({ succeeded: 2, succeededIds: ['Asset1', 'Asset2'], failed: [], batch: { revision: 3 } });
  });
  it('starts a different batch without carrying the previous batch count', () => {
    const next: AssetImportReceipt = { succeeded: [{ id: 'Asset2' } as Asset], failed: [], batch: { id: 'Batch2', attemptId: 'Try002', revision: 1 } };
    expect(mergeAssetImportResult(next, { succeeded: 3, succeededIds: ['Asset1'], failed: [], batch: { id: 'Batch1', attemptId: 'Try001', revision: 1 } }))
      .toMatchObject({ succeeded: 1, succeededIds: ['Asset2'], batch: next.batch });
    expect(mergeAssetImportResult(next, { succeeded: 3, failed: [] })).toMatchObject({ succeeded: 1, succeededIds: ['Asset2'] });
  });
  it('shows source file names for Windows and POSIX paths', () => {
    expect(assetFileName('D:\\素材\\旅人.model3.json')).toBe('旅人.model3.json');
    expect(assetFileName('/assets/背景/春日街角.png')).toBe('春日街角.png');
  });
});
