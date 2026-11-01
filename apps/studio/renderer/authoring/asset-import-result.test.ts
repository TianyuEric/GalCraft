import { describe, expect, it } from 'vitest';
import type { Asset, AssetImportReceipt } from '@galcraft/contracts';
import { assetFileName, failedAssetPaths, mergeAssetImportResult } from './asset-import-model.js';

describe('asset import feedback', () => {
  it('retries only failed source paths and retains the successful total after retry', () => {
    const imported = { id: 'Success' } as Asset;
    const failure: AssetImportReceipt['failed'][number] = { path: 'D:\\素材\\夜雨.png', issue: { code: 'READ_FAILED', owner: 'M04', severity: 'error', message: '文件无法读取', related: [], actions: [] } };
    const first = mergeAssetImportResult({ succeeded: [imported], failed: [failure] });
    expect(first.failed).toEqual([{ path: failure.path, reason: failure.issue.message }]);
    expect(failedAssetPaths(first)).toEqual([failure.path]);
    const retried = mergeAssetImportResult({ succeeded: [imported], failed: [] }, first);
    expect(retried).toEqual({ succeeded: 2, failed: [] });
    expect(failedAssetPaths(retried)).toEqual([]);
  });
  it('keeps renewed per-file failures without recounting previous successes', () => {
    const receipt: AssetImportReceipt = { succeeded: [], failed: [{ path: '/assets/voice.ogg', issue: { code: 'READ_FAILED', owner: 'M04', severity: 'error', message: '文件仍被占用', related: [], actions: [] } }] };
    expect(mergeAssetImportResult(receipt, { succeeded: 3, failed: [{ path: receipt.failed[0]!.path, reason: '旧原因' }] }))
      .toEqual({ succeeded: 3, failed: [{ path: '/assets/voice.ogg', reason: '文件仍被占用' }] });
  });
  it('shows source file names for Windows and POSIX paths', () => {
    expect(assetFileName('D:\\素材\\旅人.model3.json')).toBe('旅人.model3.json');
    expect(assetFileName('/assets/背景/春日街角.png')).toBe('春日街角.png');
  });
});
