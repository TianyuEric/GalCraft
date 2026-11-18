import { describe, expect, it, vi } from 'vitest';
import type { AssetImportBatch, Issue } from '@galcraft/contracts';
import type { ProductionProblemSnapshot } from '@galcraft/authoring/production';
import { importBatchProblems, mergeProductionProblems, productionTaskProblems } from './problem-sources.js';

const issue = (message: string, severity: Issue['severity'] = 'error'): Issue => ({
  code: 'PROVIDER_READ', severity, message, owner: 'M04', related: [], actions: ['retry'], details: { provider: 'actual-provider', requestId: 'request-1' },
});
const batch = (): AssetImportBatch => ({
  id: 'batch-1', projectId: 'project-1', revision: 2, createdAt: '2026-11-17T01:00:00.000Z', updatedAt: '2026-11-17T01:01:00.000Z',
  succeeded: [{ id: 'image-1', name: '雨景' }],
  failed: [{ path: 'D:/素材/voice.ogg', issue: issue('The voice file is locked.') }, { path: 'D:/素材/forest.png', issue: issue('The image is not readable.', 'warning') }],
  attempts: [{ id: 'attempt-1', createdAt: '2026-11-17T01:00:00.000Z', succeeded: ['image-1'], failed: [] },
    { id: 'attempt-2', createdAt: '2026-11-17T01:01:00.000Z', succeeded: [], failed: [] }],
});
const snapshot = (): ProductionProblemSnapshot => ({ projectId: 'project-1', tasks: [{
  id: 'task-1', name: 'Opening scene voices', revision: 3,
  failures: [
    { itemId: 'item-1', attemptId: 'attempt-1', issues: [issue('Rate limited.', 'warning')] },
    { itemId: 'item-2', attemptId: 'attempt-2', issues: [issue('Job failed.'), issue('Provider retained the remote job.', 'info')] },
    { itemId: 'item-3', attemptId: 'attempt-3', issues: [issue('Waiting for provider.', 'info')] },
  ],
}] });
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe('import batch problem projection', () => {
  it('aggregates actionable files under a readable scope and preserves the actual cause, all failures and navigation', () => {
    const receipt = freeze(batch()), before = structuredClone(receipt), open = vi.fn();
    const rows = importBatchProblems([receipt], new Set(), 'zh-CN', open);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({ id: 'import:batch-1', summary: '本批 2 项未导入', attemptKeys: ['import:batch-1:attempt-2'], ignored: false,
      issue: { code: 'PROVIDER_READ', message: 'The voice file is locked.', severity: 'error', actions: ['retry'],
        details: { originalIssue: receipt.failed[0]!.issue, projectId: 'project-1', batchId: 'batch-1', revision: 2, attemptId: 'attempt-2', failures: receipt.failed } },
      action: { label: '查看导入结果' } });
    expect(row.group).toContain('资源导入 · ');
    expect(row.group).not.toContain(receipt.id);
    expect(open).not.toHaveBeenCalled();
    row.action!.run();
    expect(open).toHaveBeenCalledExactlyOnceWith('batch-1');
    expect(receipt).toEqual(before);
    row.issue.message = 'Edited projection';
    expect(receipt.failed[0]!.issue.message).toBe('The voice file is locked.');
  });

  it('keeps the same ignore key across remount and revision changes, and resurfaces a new attempt', () => {
    const receipt = batch(), ignored = freeze(new Set(['import:batch-1:attempt-2']));
    expect(importBatchProblems([receipt], ignored, 'en', vi.fn())[0]?.ignored).toBe(true);
    const remounted = structuredClone(receipt); remounted.revision++;
    expect(importBatchProblems([remounted], ignored, 'en', vi.fn())[0]).toMatchObject({ attemptKeys: ['import:batch-1:attempt-2'], ignored: true });
    remounted.attempts.push({ id: 'attempt-3', createdAt: '2026-11-17T01:02:00.000Z', succeeded: [], failed: remounted.failed });
    expect(importBatchProblems([remounted], ignored, 'en', vi.fn())[0]).toMatchObject({ id: 'import:batch-1', attemptKeys: ['import:batch-1:attempt-3'], ignored: false });
    expect([...ignored]).toEqual(['import:batch-1:attempt-2']);
  });

  it('uses the batch identity only when no attempts exist and clears successfully resolved batches', () => {
    const receipt = batch(); receipt.attempts = [];
    expect(importBatchProblems([receipt], new Set(['import:batch-1:batch-1']), 'en', vi.fn())[0])
      .toMatchObject({ attemptKeys: ['import:batch-1:batch-1'], ignored: true, issue: { details: { attemptId: 'batch-1' } } });
    expect(importBatchProblems([{ ...receipt, failed: [] }], new Set(), 'en', vi.fn())).toEqual([]);
  });

  it('excludes information-only failures from actionable rows and counts while retaining complete details', () => {
    const receipt = batch(); receipt.failed = [{ path: '/image.png', issue: issue('Skipped by request.', 'info') }];
    expect(importBatchProblems([receipt], new Set(), 'en', vi.fn())).toEqual([]);
    receipt.failed.push({ path: '/voice.ogg', issue: issue('Cannot read voice.', 'warning') });
    expect(importBatchProblems([receipt], new Set(), 'en', vi.fn())[0]).toMatchObject({ summary: '1 item was not imported in this batch',
      issue: { severity: 'warning', message: 'Cannot read voice.', details: { failures: receipt.failed } } });
  });

  it.each([
    ['en-GB', '2 items were not imported in this batch', 'Open import results', 'Asset import'],
    ['ja-JP', '今回の 2 件をインポートできませんでした', 'インポート結果を開く', '素材インポート'],
  ])('localizes the summary, source scope and action in %s', (locale, summary, action, group) => {
    const row = importBatchProblems([batch()], new Set(), locale, vi.fn())[0]!;
    expect(row.summary).toBe(summary); expect(row.action?.label).toBe(action); expect(row.group).toContain(group);
  });
});

describe('production task problem projection', () => {
  it('aggregates each task by failed item with the worst actual issue and keeps the immutable provider projection', () => {
    const source = freeze(snapshot()), before = structuredClone(source), open = vi.fn();
    const rows = productionTaskProblems(source, new Set(), 'zh-CN', open);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({ id: 'production:task-1', group: 'Opening scene voices', summary: '2 项制作未完成', ignored: false,
      attemptKeys: ['production:task-1:item-1:attempt-1', 'production:task-1:item-2:attempt-2'],
      issue: { message: 'Job failed.', severity: 'error', details: { originalIssue: source.tasks[0]!.failures[1]!.issues[0],
        projectId: 'project-1', taskId: 'task-1', revision: 3, failures: source.tasks[0]!.failures.slice(0, 2) } }, action: { label: '查看制作任务' } });
    expect(open).not.toHaveBeenCalled(); row.action!.run(); expect(open).toHaveBeenCalledExactlyOnceWith('task-1');
    expect(source).toEqual(before);
    row.issue.message = 'Edited projection'; expect(source.tasks[0]!.failures[1]!.issues[0]!.message).toBe('Job failed.');
  });

  it('partitions ignored and active items into one summary each with their own severity, details and attempt keys', () => {
    const source = snapshot(), ignored = new Set(['production:task-1:item-2:attempt-2']);
    const rows = productionTaskProblems(source, ignored, 'en', vi.fn());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'production:task-1', summary: '1 production item is incomplete', ignored: false,
      attemptKeys: ['production:task-1:item-1:attempt-1'], issue: { message: 'Rate limited.', severity: 'warning', details: { failures: [source.tasks[0]!.failures[0]] } } });
    expect(rows[1]).toMatchObject({ id: 'production:task-1:ignored', summary: '1 production item is incomplete', ignored: true,
      attemptKeys: ['production:task-1:item-2:attempt-2'], issue: { message: 'Job failed.', severity: 'error', details: { failures: [source.tasks[0]!.failures[1]] } } });
    rows.forEach(row => { expect(row.action?.label).toBe('Open task'); });
  });

  it('keeps ignored attempts on remount and exposes a renewed attempt beside the remaining ignored subset', () => {
    const source = snapshot(), ignored = new Set(['production:task-1:item-1:attempt-1', 'production:task-1:item-2:attempt-2']);
    expect(productionTaskProblems(structuredClone(source), ignored, 'en', vi.fn())).toMatchObject([
      { id: 'production:task-1:ignored', ignored: true, summary: '2 production items are incomplete' },
    ]);
    source.tasks[0]!.failures[1]!.attemptId = 'attempt-4'; source.tasks[0]!.revision++;
    expect(productionTaskProblems(source, ignored, 'en', vi.fn())).toMatchObject([
      { id: 'production:task-1', ignored: false, attemptKeys: ['production:task-1:item-2:attempt-4'] },
      { id: 'production:task-1:ignored', ignored: true, attemptKeys: ['production:task-1:item-1:attempt-1'] },
    ]);
  });

  it('consumes only actionable provider failures and creates no fallback state errors', () => {
    expect(productionTaskProblems(null, new Set(), 'en', vi.fn())).toEqual([]);
    const source = snapshot(); source.tasks[0]!.failures = [{ itemId: 'item-1', attemptId: 'attempt-1', issues: [issue('Only information.', 'info')] },
      { itemId: 'item-2', attemptId: 'attempt-2', issues: [] }];
    expect(productionTaskProblems(source, new Set(), 'en', vi.fn())).toEqual([]);
    source.tasks[0]!.failures = [];
    expect(productionTaskProblems(source, new Set(), 'en', vi.fn())).toEqual([]);
  });

  it('keeps tasks separate and localizes Japanese navigation and summaries', () => {
    const source = snapshot(); source.tasks.push({ id: 'task-2', name: 'Ending theme', revision: 1,
      failures: [{ itemId: 'music', attemptId: 'attempt-1', issues: [issue('Audio provider unavailable.')] }] });
    const rows = productionTaskProblems(source, new Set(), 'ja-JP', vi.fn());
    expect(rows.map(row => ({ group: row.group, summary: row.summary, action: row.action?.label }))).toEqual([
      { group: 'Opening scene voices', summary: '2 件の制作が未完了です', action: '制作タスクを開く' },
      { group: 'Ending theme', summary: '1 件の制作が未完了です', action: '制作タスクを開く' },
    ]);
  });
});

describe('production problem snapshot merging', () => {
  it('keeps a newer individual task projection while accepting other new tasks and newer revisions', () => {
    const previous = freeze(snapshot()), next = snapshot(); next.tasks[0]!.revision = 2; next.tasks[0]!.failures = [];
    next.tasks.push({ id: 'task-2', name: 'New task', revision: 1, failures: [] });
    const merged = mergeProductionProblems(previous, freeze(next));
    expect(merged.tasks).toEqual([previous.tasks[0], next.tasks[1]]);
    const newer = snapshot(); newer.tasks[0]!.revision = 4; newer.tasks[0]!.failures = [];
    expect(mergeProductionProblems(merged, newer).tasks).toEqual(newer.tasks);
  });

  it('accepts equal-revision derived changes so confirmed retries can clear predecessor failures', () => {
    const previous = freeze(snapshot()), next = snapshot(); next.tasks[0]!.failures = [];
    expect(mergeProductionProblems(previous, freeze(next)).tasks[0]).toBe(next.tasks[0]);
    expect(mergeProductionProblems(previous, next).tasks[0]!.failures).toEqual([]);
  });

  it('treats the complete next list as authoritative membership and isolates project changes', () => {
    const previous = freeze(snapshot());
    expect(mergeProductionProblems(previous, { projectId: 'project-1', tasks: [] })).toEqual({ projectId: 'project-1', tasks: [] });
    const other = snapshot(); other.projectId = 'project-2'; other.tasks[0]!.revision = 1; other.tasks[0]!.failures = [];
    expect(mergeProductionProblems(previous, other)).toBe(other);
    expect(mergeProductionProblems(null, other)).toBe(other);
  });
});
