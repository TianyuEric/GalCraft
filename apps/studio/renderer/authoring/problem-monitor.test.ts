import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetImportBatch, Issue, Result } from '@galcraft/contracts';
import type { ProductionProblemSnapshot } from '@galcraft/authoring/production';
import { ProblemMonitor } from './problem-monitor.js';

afterEach(() => vi.useRealTimers());

const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const issue = (message: string): Issue => ({ code: 'SOURCE_UNAVAILABLE', severity: 'error', owner: 'M04', message, related: [], actions: ['retry'] });
const failure = <T,>(error: Issue): Result<T> => ({ ok: false, error, issues: [error] });
const batch = (revision = 2, id = 'batch-1', projectId = 'project-1'): AssetImportBatch => ({
  id, projectId, revision, createdAt: '2026-11-17T01:00:00Z', updatedAt: '2026-11-17T01:01:00Z', succeeded: [],
  failed: [{ path: '/voice.ogg', issue: issue('Cannot read voice.') }],
  attempts: [{ id: 'attempt-1', createdAt: '2026-11-17T01:00:00Z', succeeded: [], failed: [] }],
});
const production = (revision = 3, projectId = 'project-1'): ProductionProblemSnapshot => ({ projectId, tasks: [{
  id: 'task-1', name: 'Opening voices', revision,
  failures: [{ itemId: 'item-1', attemptId: 'attempt-1', issues: [issue('Provider job failed.')] }],
}] });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let index = 0; index < 4; index++) await Promise.resolve(); };

describe('problem source monitor reads', () => {
  it('coalesces concurrent refreshes and publishes each independent source before all reads finish', async () => {
    const imported = deferred<Result<AssetImportBatch[]>>(), produced = deferred<Result<ProductionProblemSnapshot>>();
    const imports = vi.fn(() => imported.promise), readProduction = vi.fn(() => produced.promise), changed = vi.fn();
    const monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, changed);
    const first = monitor.refresh(), second = monitor.refresh();
    expect(second).toBe(first); expect(monitor.loading).toBe(true);
    await flush();
    expect(imports).toHaveBeenCalledOnce(); expect(readProduction).toHaveBeenCalledOnce();
    imported.resolve(ok([batch()])); await flush();
    expect(monitor.imports).toEqual([batch()]); expect(monitor.production).toBeNull(); expect(monitor.loading).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    produced.resolve(ok(production())); await first;
    expect(monitor.production).toEqual(production()); expect(monitor.loading).toBe(false);
    expect(monitor.importIssue).toBeNull(); expect(monitor.productionIssue).toBeNull(); expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0]).toEqual([]);
  });

  it('retains both caches with their actual read issues on source failures and clears issues after recovery', async () => {
    const importError = issue('Import history unavailable.'), productionError = { ...issue('Task history unavailable.'), owner: 'M10' as const };
    const imports = vi.fn().mockResolvedValueOnce(ok([batch()])).mockResolvedValueOnce(failure(importError)).mockResolvedValueOnce(ok([]));
    const readProduction = vi.fn().mockResolvedValueOnce(ok(production())).mockResolvedValueOnce(failure(productionError)).mockResolvedValueOnce(ok({ projectId: 'project-1', tasks: [] }));
    const monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, vi.fn());
    await monitor.refresh(); const oldImports = monitor.imports, oldProduction = monitor.production;
    await monitor.refresh();
    expect(monitor.imports).toBe(oldImports); expect(monitor.production).toBe(oldProduction);
    expect(monitor.importIssue).toBe(importError); expect(monitor.productionIssue).toBe(productionError); expect(monitor.loading).toBe(false);
    await monitor.refresh();
    expect(monitor.imports).toEqual([]); expect(monitor.production).toEqual({ projectId: 'project-1', tasks: [] });
    expect(monitor.importIssue).toBeNull(); expect(monitor.productionIssue).toBeNull();
  });

  it('converts rejected reads into source-owned issues and keeps the other source current', async () => {
    const imports = vi.fn().mockResolvedValueOnce(ok([batch()])).mockRejectedValueOnce(new Error('Disk is busy.'));
    const readProduction = vi.fn().mockResolvedValueOnce(ok(production())).mockResolvedValueOnce(ok(production(4)));
    const monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, vi.fn());
    await monitor.refresh(); await monitor.refresh();
    expect(monitor.imports[0]?.revision).toBe(2);
    expect(monitor.importIssue).toMatchObject({ message: 'Disk is busy.', owner: 'M04', severity: 'error' });
    expect(monitor.production?.tasks[0]?.revision).toBe(4); expect(monitor.productionIssue).toBeNull();
    const throwing = new ProblemMonitor('project-1', { production: () => { throw new Error('Service disconnected.'); } }, vi.fn());
    await expect(throwing.refresh()).resolves.toBeUndefined();
    expect(throwing.productionIssue).toMatchObject({ message: 'Service disconnected.', owner: 'M10', severity: 'error' });
  });

  it('rejects a wrong-project snapshot or any mixed import list without replacing retained results', async () => {
    const imports = vi.fn().mockResolvedValueOnce(ok([batch()])).mockResolvedValueOnce(ok([batch(3), batch(1, 'foreign-batch', 'project-2')]));
    const readProduction = vi.fn().mockResolvedValueOnce(ok(production())).mockResolvedValueOnce(ok(production(4, 'project-2')));
    const monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, vi.fn());
    await monitor.refresh(); const oldImports = monitor.imports, oldProduction = monitor.production;
    await monitor.refresh();
    expect(monitor.imports).toBe(oldImports); expect(monitor.production).toBe(oldProduction);
    expect(monitor.importIssue).toMatchObject({ code: 'IMPORT_PROBLEMS_PROJECT_MISMATCH', severity: 'error',
      details: { expectedProjectId: 'project-1', receivedProjectIds: ['project-1', 'project-2'] } });
    expect(monitor.productionIssue).toMatchObject({ code: 'PRODUCTION_PROBLEMS_PROJECT_MISMATCH', severity: 'error',
      details: { expectedProjectId: 'project-1', receivedProjectId: 'project-2' } });
  });

  it('keeps newer import records on regressing reads while the full list remains authoritative for deletion', async () => {
    const kept = batch(4), deleted = batch(2, 'deleted-batch');
    const imports = vi.fn().mockResolvedValueOnce(ok([kept, deleted])).mockResolvedValueOnce(ok([batch(3), batch(1, 'new-batch')]))
      .mockResolvedValueOnce(ok([{ ...batch(4), failed: [] }])).mockResolvedValueOnce(ok([]));
    const monitor = new ProblemMonitor('project-1', { imports }, vi.fn());
    await monitor.refresh(); await monitor.refresh();
    expect(monitor.imports).toEqual([kept, batch(1, 'new-batch')]); expect(monitor.imports[0]).toBe(kept);
    await monitor.refresh(); expect(monitor.imports).toEqual([kept]);
    await monitor.refresh(); expect(monitor.imports).toEqual([]);
  });

  it('retains a higher task revision and accepts equal-revision derived projection changes', async () => {
    const current = production(4), derived = production(4); derived.tasks[0]!.failures = [];
    const readProduction = vi.fn().mockResolvedValueOnce(ok(current)).mockResolvedValueOnce(ok(production(3))).mockResolvedValueOnce(ok(derived))
      .mockResolvedValueOnce(ok({ projectId: 'project-1', tasks: [] }));
    const monitor = new ProblemMonitor('project-1', { production: readProduction }, vi.fn());
    await monitor.refresh(); await monitor.refresh(); expect(monitor.production?.tasks[0]).toBe(current.tasks[0]);
    await monitor.refresh(); expect(monitor.production?.tasks[0]).toBe(derived.tasks[0]); expect(monitor.production?.tasks[0]?.failures).toEqual([]);
    await monitor.refresh(); expect(monitor.production?.tasks).toEqual([]);
  });

  it('publishes initial completion once and preserves references without notifying for unchanged content or loading flips', async () => {
    const later = deferred<Result<AssetImportBatch[]>>(), changed = vi.fn();
    const imports = vi.fn().mockResolvedValueOnce(ok([batch()])).mockImplementationOnce(() => later.promise);
    const readProduction = vi.fn(async () => ok(production()));
    const monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, changed);
    await monitor.refresh(); const oldImports = monitor.imports, oldProduction = monitor.production;
    expect(changed).toHaveBeenCalledOnce();
    const pending = monitor.refresh(); await flush();
    expect(monitor.loading).toBe(true); expect(changed).toHaveBeenCalledOnce();
    later.resolve(ok(structuredClone([batch()]))); await pending;
    expect(monitor.loading).toBe(false); expect(changed).toHaveBeenCalledOnce();
    expect(monitor.imports).toBe(oldImports); expect(monitor.production).toBe(oldProduction);
    const emptyChanged = vi.fn(), empty = new ProblemMonitor('project-1', { imports: async () => ok([]) }, emptyChanged);
    await empty.refresh(); await empty.refresh(); expect(emptyChanged).toHaveBeenCalledOnce();
  });

  it('notifies only when an error changes or recovers, and when equal-revision task failure content changes', async () => {
    const error = issue('Import history unavailable.'), changed = vi.fn();
    const imports = vi.fn().mockResolvedValueOnce(ok([batch()])).mockResolvedValueOnce(failure(error))
      .mockResolvedValueOnce(failure(structuredClone(error))).mockResolvedValueOnce(ok([batch()]));
    const current = production(), derived = production(); derived.tasks[0]!.failures = [];
    const readProduction = vi.fn().mockResolvedValueOnce(ok(current)).mockResolvedValueOnce(ok(structuredClone(current)))
      .mockResolvedValueOnce(ok(structuredClone(current))).mockResolvedValueOnce(ok(structuredClone(current))).mockResolvedValueOnce(ok(derived));
    const monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, changed);
    await monitor.refresh(); expect(changed).toHaveBeenCalledOnce();
    await monitor.refresh(); expect(changed).toHaveBeenCalledTimes(2);
    await monitor.refresh(); expect(changed).toHaveBeenCalledTimes(2);
    await monitor.refresh(); expect(changed).toHaveBeenCalledTimes(3);
    imports.mockResolvedValue(ok([batch()]));
    await monitor.refresh(); expect(changed).toHaveBeenCalledTimes(4);
    expect(monitor.production?.tasks[0]?.failures).toEqual([]);
  });

  it('coalesces changes from both sources into one callback after loading ends', async () => {
    const imported = deferred<Result<AssetImportBatch[]>>(), produced = deferred<Result<ProductionProblemSnapshot>>();
    const loadingAtNotification: boolean[] = [];
    const imports = vi.fn().mockResolvedValueOnce(ok([batch()])).mockImplementationOnce(() => imported.promise);
    const readProduction = vi.fn().mockResolvedValueOnce(ok(production())).mockImplementationOnce(() => produced.promise);
    const monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, () => loadingAtNotification.push(monitor.loading));
    await monitor.refresh();
    const pending = monitor.refresh(); await flush();
    imported.resolve(ok([batch(3)])); await flush();
    expect(monitor.imports[0]?.revision).toBe(3); expect(monitor.loading).toBe(true); expect(loadingAtNotification).toEqual([false]);
    produced.resolve(ok(production(4))); await pending;
    expect(monitor.production?.tasks[0]?.revision).toBe(4); expect(loadingAtNotification).toEqual([false, false]);
  });
});

describe('problem monitor lifecycle', () => {
  it('polls every 1800 ms, starts only once and stops scheduling further reads', async () => {
    vi.useFakeTimers();
    const imports = vi.fn(async () => ok([batch()])), readProduction = vi.fn(async () => ok(production()));
    const changed = vi.fn(), monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, changed);
    monitor.start(); monitor.start(); await vi.advanceTimersByTimeAsync(0);
    expect(imports).toHaveBeenCalledOnce(); expect(readProduction).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1799); expect(imports).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(imports).toHaveBeenCalledTimes(2); expect(readProduction).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledOnce();
    monitor.stop(); await vi.advanceTimersByTimeAsync(3600);
    expect(imports).toHaveBeenCalledTimes(2); expect(monitor.loading).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it('coalesces polling ticks with a pending manual read', async () => {
    vi.useFakeTimers();
    const result = deferred<Result<AssetImportBatch[]>>(), imports = vi.fn(() => result.promise);
    const monitor = new ProblemMonitor('project-1', { imports }, vi.fn());
    const request = monitor.refresh(); monitor.start(); await vi.advanceTimersByTimeAsync(5400);
    expect(imports).toHaveBeenCalledOnce(); expect(monitor.refresh()).toBe(request);
    result.resolve(ok([batch()])); await request; monitor.stop();
  });

  it('ignores late successful and failed responses after stop without notifying or dropping retained caches', async () => {
    const imported = deferred<Result<AssetImportBatch[]>>(), produced = deferred<Result<ProductionProblemSnapshot>>();
    const imports = vi.fn().mockResolvedValueOnce(ok([batch()])).mockImplementationOnce(() => imported.promise);
    const readProduction = vi.fn().mockResolvedValueOnce(ok(production())).mockImplementationOnce(() => produced.promise), changed = vi.fn();
    const monitor = new ProblemMonitor('project-1', { imports, production: readProduction }, changed);
    await monitor.refresh(); const oldImports = monitor.imports, oldProduction = monitor.production;
    const pending = monitor.refresh(); await flush(); monitor.stop(); const notifications = changed.mock.calls.length;
    imported.resolve(ok([])); produced.resolve(failure(issue('Late read failure.'))); await pending;
    expect(monitor.imports).toBe(oldImports); expect(monitor.production).toBe(oldProduction);
    expect(monitor.importIssue).toBeNull(); expect(monitor.productionIssue).toBeNull(); expect(monitor.loading).toBe(false);
    expect(changed).toHaveBeenCalledTimes(notifications);
  });

  it('allows a new refresh after stop and keeps an old completion from finishing the newer loading state', async () => {
    const old = deferred<Result<AssetImportBatch[]>>(), current = deferred<Result<AssetImportBatch[]>>();
    const imports = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise), changed = vi.fn();
    const monitor = new ProblemMonitor('project-1', { imports }, changed);
    const oldRead = monitor.refresh(); await flush(); monitor.stop();
    const newRead = monitor.refresh(); await flush(); const notifications = changed.mock.calls.length;
    old.resolve(ok([batch(8)])); await oldRead;
    expect(monitor.loading).toBe(true); expect(monitor.imports).toEqual([]); expect(changed).toHaveBeenCalledTimes(notifications);
    expect(monitor.refresh()).toBe(newRead);
    current.resolve(ok([batch(2)])); await newRead;
    expect(monitor.loading).toBe(false); expect(monitor.imports).toEqual([batch(2)]);
  });

  it('does not dispatch a read that was invalidated before its refresh started', async () => {
    const imports = vi.fn(async () => ok([batch()])), changed = vi.fn();
    const monitor = new ProblemMonitor('project-1', { imports }, changed);
    const request = monitor.refresh(); monitor.stop(); const notifications = changed.mock.calls.length; await request;
    expect(imports).not.toHaveBeenCalled(); expect(monitor.loading).toBe(false); expect(changed).toHaveBeenCalledTimes(notifications);
  });

  it('does not poll or report failures when no read methods are available', async () => {
    vi.useFakeTimers(); const changed = vi.fn(), monitor = new ProblemMonitor('project-1', {}, changed);
    monitor.start(); await monitor.refresh(); await vi.advanceTimersByTimeAsync(5400);
    expect(vi.getTimerCount()).toBe(0); expect(changed).not.toHaveBeenCalled(); expect(monitor.loading).toBe(false);
    expect(monitor.importIssue).toBeNull(); expect(monitor.productionIssue).toBeNull(); monitor.stop();
  });
});
