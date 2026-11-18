import { afterEach, expect, it, vi } from "vitest";
import { ProductionSession, type ProductionFeedback } from "./session.js";
import type { Overview, WorkbenchBridge } from "./bridge.js";
import type { ProductionFormDraft } from '@galcraft/authoring/production';
import { OfficialRecipes } from '@galcraft/authoring/recipes';
import { resolveProductionFields } from '@galcraft/authoring/production/draft';
import type { Issue } from '@galcraft/contracts';

const productionFailure = (code: string) => {
  const error: Issue = { code, message: code, owner: 'M10', severity: 'error', related: [], actions: ['retry'] };
  return { ok: false as const, error, issues: [error] };
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('retains RPC failures by method and target until that same RPC succeeds, with a new identity for each request attempt', async () => {
  const retry = vi.fn().mockResolvedValueOnce(productionFailure('RETRY_FAILED')).mockResolvedValueOnce({ ok: true, value: {}, warnings: [] }).mockResolvedValueOnce(productionFailure('RETRY_FAILED'));
  const resume = vi.fn(async () => ({ ok: true, value: {}, warnings: [] }));
  const session = new ProductionSession({ production: { retry, resume } } as unknown as WorkbenchBridge, 'WorkAA');
  session.taskId = 'TaskAA';
  await session.bridge.production.retry({ taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true });
  const first = session.feedback[0]!;
  expect(first).toMatchObject({ key: 'production:retry:task:TaskAA:item:ItemAA', kind: 'request', issue: { code: 'RETRY_FAILED' }, target: { kind: 'task', id: 'TaskAA' } });
  await session.bridge.production.resume('TaskBB');
  expect(session.feedback).toEqual([first]); expect(session.diagnostic?.code).toBe('RETRY_FAILED');
  await session.bridge.production.retry({ taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true });
  expect(session.feedback).toEqual([]); expect(session.error).toBe(''); expect(session.diagnostic).toBeNull();
  await session.bridge.production.retry({ taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true });
  expect(session.feedback[0]!.attemptId).not.toBe(first.attemptId);
});
it('clears a recovered background overview failure without clearing an unrelated request diagnostic or creating new read episodes', async () => {
  vi.useFakeTimers();
  const overview = vi.fn().mockResolvedValueOnce(productionFailure('OVERVIEW_FAILED')).mockResolvedValueOnce(productionFailure('OVERVIEW_FAILED'))
    .mockImplementation(async () => ({ ok: true, value: session.data, warnings: [] }));
  const retry = vi.fn(async () => productionFailure('RETRY_FAILED'));
  const session = new ProductionSession({ production: { overview, retry } } as unknown as WorkbenchBridge, 'WorkAA');
  session.taskId = 'TaskAA'; session.start(); await vi.advanceTimersByTimeAsync(0);
  const first = session.feedback[0]!;
  expect(first.kind).toBe('read'); expect(session.error).toBe('OVERVIEW_FAILED');
  await vi.advanceTimersByTimeAsync(1800); expect(session.feedback[0]!.attemptId).toBe(first.attemptId);
  await session.bridge.production.retry({ taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true });
  await vi.advanceTimersByTimeAsync(1800);
  expect(session.feedback).toHaveLength(1); expect(session.feedback[0]!.key).toBe('production:retry:task:TaskAA:item:ItemAA');
  expect(session.diagnostic?.code).toBe('RETRY_FAILED'); expect(retry).toHaveBeenCalledTimes(1);
  session.stop();
});
it('clears its displayed overview diagnostic after a successful background poll', async () => {
  vi.useFakeTimers();
  const overview = vi.fn().mockResolvedValueOnce(productionFailure('OVERVIEW_FAILED'))
    .mockImplementation(async () => ({ ok: true, value: session.data, warnings: [] }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.start(); await vi.advanceTimersByTimeAsync(0); expect(session.feedback).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1800);
  expect(session.feedback).toEqual([]); expect(session.error).toBe(''); expect(session.diagnostic).toBeNull(); session.stop();
});
it('keeps identical diagnostics from separate request scopes independent', async () => {
  const retry = vi.fn().mockResolvedValueOnce(productionFailure('CONNECTION_UNAVAILABLE')).mockResolvedValueOnce({ ok: true, value: {}, warnings: [] });
  const resume = vi.fn(async () => productionFailure('CONNECTION_UNAVAILABLE'));
  const session = new ProductionSession({ production: { retry, resume } } as unknown as WorkbenchBridge, 'WorkAA');
  const input = { taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true };
  await session.bridge.production.retry(input); await session.bridge.production.resume('TaskBB');
  await session.bridge.production.retry(input);
  expect(session.feedback).toHaveLength(1); expect(session.feedback[0]!.key).toBe('production:resume:task:TaskBB');
  expect(session.diagnostic?.code).toBe('CONNECTION_UNAVAILABLE'); expect(session.error).toBe('CONNECTION_UNAVAILABLE');
});
it('keeps failed retries for different items in the same task independent', async () => {
  const retry = vi.fn().mockResolvedValueOnce(productionFailure('FIRST_ITEM_FAILED')).mockResolvedValueOnce({ ok: true, value: {}, warnings: [] })
    .mockResolvedValueOnce(productionFailure('SECOND_ITEM_FAILED')).mockResolvedValueOnce({ ok: true, value: {}, warnings: [] });
  const session = new ProductionSession({ production: { retry } } as unknown as WorkbenchBridge, 'WorkAA');
  const firstInput = { taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true }, secondInput = { ...firstInput, itemId: 'ItemBB' };
  await session.bridge.production.retry(firstInput); const first = session.feedback[0]!;
  await session.bridge.production.retry(secondInput);
  expect(session.feedback).toEqual([first]); expect(session.diagnostic?.code).toBe('FIRST_ITEM_FAILED');
  await session.bridge.production.retry(secondInput); const second = session.feedback[1]!;
  expect(second.target).toEqual({ kind: 'task', id: 'TaskAA' }); expect(second.key).not.toBe(first.key);
  await session.bridge.production.retry(firstInput);
  expect(session.feedback).toEqual([second]); expect(session.diagnostic?.code).toBe('SECOND_ITEM_FAILED'); session.stop();
});
it('keeps candidate operations and selection subsets independent while treating reordered selections as the same scope', async () => {
  const planContinuation = vi.fn().mockResolvedValueOnce(productionFailure('CONTINUATION_FAILED')).mockResolvedValueOnce({ ok: true, value: {}, warnings: [] });
  const select = vi.fn().mockResolvedValueOnce(productionFailure('SELECTION_FAILED')).mockResolvedValueOnce({ ok: true, value: {}, warnings: [] })
    .mockResolvedValueOnce({ ok: true, value: {}, warnings: [] });
  const session = new ProductionSession({ production: { planContinuation, select } } as unknown as WorkbenchBridge, 'WorkAA');
  const continuation = { taskId: 'TaskAA', candidateId: 'CandidateA', instruction: 'Keep the opening', mode: 'write' as const };
  await session.bridge.production.planContinuation(continuation); const failedCandidate = session.feedback[0]!;
  await session.bridge.production.planContinuation({ ...continuation, candidateId: 'CandidateB' });
  expect(session.feedback).toEqual([failedCandidate]); expect(failedCandidate.key).toContain(':candidate:CandidateA');
  const selections = [{ itemId: 'ItemAA', candidateId: 'CandidateA' }, { itemId: 'ItemBB', candidateId: 'CandidateB' }];
  const input = { taskId: 'TaskAA', selections, target: 'taskOnly' as const, expected: [] };
  await session.bridge.production.select(input); const failedSelection = session.feedback[1]!;
  await session.bridge.production.select({ ...input, selections: [selections[0]!] });
  expect(session.feedback).toEqual([failedCandidate, failedSelection]);
  await session.bridge.production.select({ ...input, selections: [...selections].reverse() });
  expect(session.feedback).toEqual([failedCandidate]);
  expect(selections.map(item => item.itemId)).toEqual(['ItemAA', 'ItemBB']); session.stop();
});
it('ignores a stale failed poll after a newer successful response and a failed poll after the project stops', async () => {
  let older!: (value: unknown) => void, stopped!: (value: unknown) => void;
  const overview = vi.fn().mockImplementationOnce(() => new Promise(resolve => { older = resolve; }))
    .mockImplementationOnce(async () => ({ ok: true, value: session.data, warnings: [] }))
    .mockImplementationOnce(() => new Promise(resolve => { stopped = resolve; }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  const first = session.refresh(); await session.refresh();
  older(productionFailure('STALE_FAILURE')); await first;
  expect(session.feedback).toEqual([]); expect(session.error).toBe('');
  const last = session.refresh(); session.stop(); stopped(productionFailure('STOPPED_FAILURE')); await last;
  expect(session.feedback).toEqual([]); expect(session.error).toBe('');
});
it('keeps the newest request failure when an older request succeeds and ignores failures arriving after stop', async () => {
  let older!: (value: unknown) => void, stopped!: (value: unknown) => void;
  const retry = vi.fn().mockImplementationOnce(() => new Promise(resolve => { older = resolve; }))
    .mockResolvedValueOnce(productionFailure('NEW_FAILURE')).mockImplementationOnce(() => new Promise(resolve => { stopped = resolve; }));
  const session = new ProductionSession({ production: { retry } } as unknown as WorkbenchBridge, 'WorkAA');
  const input = { taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true };
  const first = session.bridge.production.retry(input); await session.bridge.production.retry(input);
  const current = session.feedback[0]!;
  older({ ok: true, value: {}, warnings: [] }); await first;
  expect(session.feedback).toEqual([current]);
  const last = session.bridge.production.retry(input); session.stop(); stopped(productionFailure('STOPPED_FAILURE')); await last;
  expect(session.feedback).toEqual([current]);
});
it('restores a failed attempt identity without issuing requests and clears it only through its matching scope', async () => {
  const retry = vi.fn(async () => ({ ok: true, value: {}, warnings: [] }));
  const session = new ProductionSession({ production: { retry } } as unknown as WorkbenchBridge, 'WorkAA');
  const restored = { key: 'production:retry:task:TaskAA:item:ItemAA', attemptId: 'TryAAA', kind: 'request' as const, issue: productionFailure('RETRY_FAILED').error, target: { kind: 'task' as const, id: 'TaskAA' } };
  session.restoreFeedback([restored]);
  expect(session.feedback).toEqual([restored]); expect(retry).not.toHaveBeenCalled();
  await session.bridge.production.retry({ taskId: 'TaskBB', itemId: 'ItemBB', confirmNewRequest: true }); expect(session.feedback).toEqual([restored]);
  await session.bridge.production.retry({ taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true }); expect(session.feedback).toEqual([]);
});
it('binds a draft save failure to its actual draft and keeps shared configuration feedback outside the selected task', async () => {
  const saveDraft = vi.fn(async () => productionFailure('DRAFT_SAVE'));
  const saveWorkflowDraft = vi.fn(async () => productionFailure('WORKFLOW_SAVE'));
  const session = new ProductionSession({ production: { saveDraft, saveWorkflowDraft } } as unknown as WorkbenchBridge, 'WorkAA');
  session.newDraft(); session.taskId = 'TaskAA';
  await session.bridge.production.saveDraft({ draft: session.draft!, expectedRevision: null });
  expect(session.feedback[0]!.target).toEqual({ kind: 'draft', id: session.draft!.id });
  await session.bridge.production.saveWorkflowDraft({ draft: { id: 'FlowAA' } as never, expectedRevision: null });
  expect(session.feedback[1]!.target).toBeNull(); expect(session.feedback[1]!.key).toBe('production:saveWorkflowDraft:workspace:workflow-draft:FlowAA');
});
it.each([
  { method: 'removeConnection' as const, input: 'ObjectAA', identity: ':connection:ObjectAA', kind: 'request' },
  { method: 'saveWorkflow' as const, input: { workflow: { id: 'ObjectAA' }, expectedRevision: 1 }, identity: ':workflow:ObjectAA', kind: 'request' },
  { method: 'saveWorkflowDraft' as const, input: { draft: { id: 'ObjectAA' }, expectedRevision: 1 }, identity: ':workflow-draft:ObjectAA', kind: 'request' },
  { method: 'discoverWorkflowOutputs' as const, input: { workflow: { id: 'ObjectAA' }, connectionId: 'ConnectA' }, identity: ':workflow:ObjectAA:connection:ConnectA', kind: 'read' },
  { method: 'listWorkflowDrafts' as const, input: undefined, identity: '', kind: 'read' },
])('returns $method feedback to connections without changing its request scope or read kind', async ({ method, input, identity, kind }) => {
  const operation = vi.fn(async () => productionFailure('WORKFLOW_FAILED'));
  const session = new ProductionSession({ production: { [method]: operation } } as unknown as WorkbenchBridge, 'WorkAA');
  session.taskId = 'TaskAA';
  await (session.bridge.production[method] as (input: unknown) => Promise<unknown>)(input);
  expect(session.feedback[0]).toMatchObject({ key: `production:${method}:workspace${identity}`, kind, target: null, surface: 'connections' });
  expect(session.revealedFeedback).toBeNull();
});
it('infers the connections owner for legacy retained workflow failures without changing their identity or assigning shared defaults and recipes', () => {
  const methods = ['removeConnection', 'saveWorkflow', 'saveWorkflowDraft', 'listWorkflowDrafts', 'discoverWorkflowOutputs', 'saveDefaults', 'saveRecipe', 'connections', 'providers', 'defaults'];
  const records: ProductionFeedback[] = methods.map((method, index) => ({ key: `production:${method}:workspace`, attemptId: `TryAA${index}`, kind: 'request', issue: productionFailure('RETAINED_FAILED').error, target: null }));
  const production = Object.fromEntries(methods.map(method => [method, vi.fn()]));
  const session = new ProductionSession({ production } as unknown as WorkbenchBridge, 'WorkAA');
  session.restoreFeedback(records);
  expect(session.feedback).toEqual(records.map((record, index) => index < 5 ? { ...record, surface: 'connections' } : record));
  expect(records.every(record => !('surface' in record))).toBe(true);
  expect(Object.values(production).every(operation => operation.mock.calls.length === 0)).toBe(true);
  expect(session.revealedFeedback).toBeNull();
});
it('exposes connections feedback only after explicit reveal and retires that notice through its matching recovery scope', async () => {
  const saveWorkflowDraft = vi.fn().mockResolvedValueOnce(productionFailure('WORKFLOW_SAVE'))
    .mockResolvedValueOnce(productionFailure('WORKFLOW_SAVE')).mockResolvedValueOnce({ ok: true, value: {}, warnings: [] });
  const removeConnection = vi.fn(async () => ({ ok: true, value: {}, warnings: [] }));
  const session = new ProductionSession({ production: { saveWorkflowDraft, removeConnection } } as unknown as WorkbenchBridge, 'WorkAA');
  const input = { draft: { id: 'FlowAA' } as never, expectedRevision: null };
  await session.bridge.production.saveWorkflowDraft(input);
  const record = session.feedback[0]!;
  expect(session.revealedFeedback).toBeNull();
  expect(session.revealFeedback(record.key)).toBe(true); expect(session.revealedFeedback).toEqual(record);
  await session.bridge.production.removeConnection('ConnectA'); expect(session.revealedFeedback).toEqual(record);
  await session.bridge.production.saveWorkflowDraft(input); expect(session.revealedFeedback).toBeNull();
  session.revealFeedback(record.key);
  await session.bridge.production.saveWorkflowDraft(input); expect(session.revealedFeedback).toBeNull(); expect(session.feedback).toEqual([]);
});
it('captures the exact editor at request initiation without leaking that context while promises are pending or changing service input', async () => {
  let finishOlder!: (value: unknown) => void;
  const saveWorkflowDraft = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishOlder = resolve; }))
    .mockResolvedValueOnce(productionFailure('UNSCOPED_FAILED')).mockResolvedValueOnce(productionFailure('NEWER_EDITOR_FAILED'));
  const session = new ProductionSession({ production: { saveWorkflowDraft } } as unknown as WorkbenchBridge, 'WorkAA');
  const input = { draft: { id: 'FlowAA' } as never, expectedRevision: null };
  const older = session.withFeedbackEditor('workflow-draft:FlowAA', () => session.bridge.production.saveWorkflowDraft(input));
  await session.bridge.production.saveWorkflowDraft({ ...input, draft: { id: 'FlowBB' } as never });
  expect(session.feedback[0]).not.toHaveProperty('editorId');
  await session.withFeedbackEditor('FlowAA', () => session.bridge.production.saveWorkflowDraft(input));
  const current = session.feedback.find(record => record.key.endsWith('workflow-draft:FlowAA'))!;
  expect(current).toMatchObject({ editorId: 'FlowAA', issue: { code: 'NEWER_EDITOR_FAILED' } });
  finishOlder(productionFailure('OLDER_EDITOR_FAILED')); await older;
  expect(session.feedback.find(record => record.key === current.key)).toEqual(current);
  expect(saveWorkflowDraft.mock.calls[0]).toEqual([input]); expect(saveWorkflowDraft.mock.calls[2]).toEqual([input]);
  expect(input).not.toHaveProperty('editorId');
  const restored = new ProductionSession({ production: {} } as unknown as WorkbenchBridge, 'WorkAA');
  restored.restoreFeedback(session.feedback);
  expect(restored.feedback.find(record => record.key === current.key)?.editorId).toBe('FlowAA');
});
it.each([
  { method: 'removeConnection' as const, first: 'ObjectAA', other: 'ObjectBB', identity: 'connection:ObjectAA' },
  { method: 'saveWorkflowDraft' as const, first: { draft: { id: 'ObjectAA' }, expectedRevision: 1 }, other: { draft: { id: 'ObjectBB' }, expectedRevision: 1 }, identity: 'workflow-draft:ObjectAA' },
  { method: 'saveRecipe' as const, first: { recipe: { id: 'ObjectAA', scope: 'personal', projectId: null }, expectedRevision: 1 },
    other: { recipe: { id: 'ObjectAA', scope: 'project', projectId: 'WorkAA' }, expectedRevision: 1 }, identity: 'recipe:personal:global:ObjectAA' },
])('isolates object-scoped workspace feedback for $method without changing its navigation target', async ({ method, first, other, identity }) => {
  const operation = vi.fn().mockResolvedValueOnce(productionFailure('OBJECT_FAILED')).mockResolvedValueOnce({ ok: true, value: {}, warnings: [] })
    .mockResolvedValueOnce({ ok: true, value: {}, warnings: [] });
  const session = new ProductionSession({ production: { [method]: operation } } as unknown as WorkbenchBridge, 'WorkAA');
  session.taskId = 'TaskAA';
  const call = session.bridge.production[method] as (input: unknown) => Promise<unknown>;
  await call(first); const receipt = session.feedback[0]!;
  expect(receipt).toMatchObject({ key: `production:${method}:workspace:${identity}`, target: null });
  await call(other); expect(session.feedback).toEqual([receipt]); expect(session.diagnostic?.code).toBe('OBJECT_FAILED');
  await call(first); expect(session.feedback).toEqual([]); expect(session.diagnostic).toBeNull(); session.stop();
});
it('reveals the exact restored diagnostic in the current locale without an RPC and clears only its matching recovery scope', async () => {
  const retry = vi.fn(async () => ({ ok: true, value: {}, warnings: [] }));
  let locale = 'zh-CN';
  const session = new ProductionSession({ production: { retry } } as unknown as WorkbenchBridge, 'WorkAA', () => locale);
  const restored = { key: 'production:retry:task:TaskAA:item:ItemAA', attemptId: 'TryAAA', kind: 'request' as const, issue: productionFailure('CONNECTION_UNAVAILABLE').error, target: { kind: 'task' as const, id: 'TaskAA' } };
  session.restoreFeedback([restored]);
  expect(session.error).toBe(''); expect(session.diagnostic).toBeNull();
  locale = 'en';
  expect(session.revealFeedback('missing')).toBe(false); expect(session.revealFeedback(restored.key)).toBe(true);
  expect(session.diagnostic).toEqual(restored.issue); expect(session.error).toContain('The generation service connection was interrupted.');
  expect(retry).not.toHaveBeenCalled();
  await session.bridge.production.retry({ taskId: 'TaskBB', itemId: 'ItemBB', confirmNewRequest: true });
  expect(session.diagnostic).toEqual(restored.issue); expect(session.error).toContain('The generation service connection was interrupted.');
  await session.bridge.production.retry({ taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true });
  expect(session.error).toBe(''); expect(session.diagnostic).toBeNull(); expect(session.feedback).toEqual([]);
});
it('suspends overview polling while the renderer document is hidden', async () => {
  vi.useFakeTimers(); const visibility = { hidden: true }; vi.stubGlobal('document', visibility);
  const overview = vi.fn(async () => ({ ok: true, value: session.data, warnings: [] }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.start(); await vi.advanceTimersByTimeAsync(3600); expect(overview).not.toHaveBeenCalled();
  visibility.hidden = false; await vi.advanceTimersByTimeAsync(1800); expect(overview).toHaveBeenCalledTimes(1); session.stop();
});
it('polls only the visible production workspace and asks for the selected task', async () => {
  vi.useFakeTimers();
  const overview = vi.fn(async () => ({ ok: true, value: session.data, warnings: [] }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.taskId = 'Task01'; session.setVisible(false); session.start();
  await vi.advanceTimersByTimeAsync(5400); expect(overview).not.toHaveBeenCalled();
  session.setVisible(true); await Promise.resolve(); expect(overview).toHaveBeenCalledWith({ taskId: 'Task01' });
  session.setVisible(false); const count = overview.mock.calls.length;
  await vi.advanceTimersByTimeAsync(5400); expect(overview).toHaveBeenCalledTimes(count); session.stop();
});
it('discards a response for a task that is no longer selected', async () => {
  let finish!: (value: unknown) => void;
  const overview = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.taskId = 'Task01'; const original = session.data, pending = session.refresh(); session.taskId = 'Task02';
  finish({ ok: true, value: { ...original, canvas: { width: 800, height: 600 } }, warnings: [] }); await pending;
  expect(session.data).toBe(original); expect(session.taskId).toBe('Task02');
});
it('restores the selected task by ID and retains the ID when its details are unavailable', async () => {
  const overview = vi.fn(async () => ({ ok: true, value: session.data, warnings: [] }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.restoreRecord({ kind: 'task', id: 'TaskAA' });
  expect(session.unavailableRecord).toBeNull();
  await session.refresh();
  expect(overview).toHaveBeenCalledWith({ taskId: 'TaskAA' });
  expect(session.unavailableRecord).toEqual({ kind: 'task', id: 'TaskAA' });
  session.data.tasks = [{ id: 'TaskBB' }] as Overview['tasks'];
  await session.openTask('TaskBB');
  expect(session.selectedRecord).toEqual({ kind: 'task', id: 'TaskBB' });
  expect(session.unavailableRecord).toBeNull();
});
it('restores the exact saved draft instead of choosing the first unsubmitted draft', async () => {
  const overview = vi.fn(async () => ({ ok: true, value: structuredClone(session.data), warnings: [] }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.newDraft();
  const other = structuredClone(session.draft!);
  const desired = { ...other, id: 'DraftB' };
  session.draft = null;
  session.data.drafts = [other, desired];
  session.restoreRecord({ kind: 'draft', id: desired.id });
  await session.refresh();
  expect(session.draft).toMatchObject({ id: desired.id });
  expect(session.unavailableRecord).toBeNull();
});
it('returns to a first-save failure in the current dirty draft without another save or overview read', async () => {
  vi.useFakeTimers();
  const saveDraft = vi.fn(async () => productionFailure('FIRST_SAVE_FAILED')), overview = vi.fn();
  const session = new ProductionSession({ production: { saveDraft, overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.newDraft('ui'); session.field('instruction', 'Keep this unsaved input');
  await expect(session.saveDraft(true)).rejects.toThrow('FIRST_SAVE_FAILED');
  const receipt = session.feedback[0]!, input = structuredClone(session.draft);
  expect(session.data.drafts).toEqual([]);
  await expect(session.revealProblemRecord(receipt.target)).resolves.toBe(true);
  expect(session.selectedRecord).toEqual({ kind: 'draft', id: input!.id }); expect(session.draft).toEqual(input); expect(session.draftDirty).toBe(true);
  expect(session.feedback).toEqual([receipt]); expect(session.revealFeedback(receipt.key)).toBe(true);
  expect(saveDraft).toHaveBeenCalledOnce(); expect(overview).not.toHaveBeenCalled(); session.stop();
});
it('preserves an unrelated dirty draft and the available receipt when returning to another task or draft problem', async () => {
  vi.useFakeTimers();
  const saveDraft = vi.fn(), overview = vi.fn(), session = new ProductionSession({ production: { saveDraft, overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.newDraft('ui'); session.field('instruction', 'Unrelated author input');
  const input = structuredClone(session.draft);
  const receipt = { key: 'production:retry:task:TaskAA:item:ItemAA', attemptId: 'TryAAA', kind: 'request' as const,
    target: { kind: 'task' as const, id: 'TaskAA' }, issue: productionFailure('RETRY_FAILED').error };
  session.restoreFeedback([receipt]);
  await expect(session.revealProblemRecord(receipt.target)).resolves.toBe(false);
  await expect(session.revealProblemRecord({ kind: 'draft', id: 'OtherDraft' })).resolves.toBe(false);
  expect(session.draft).toEqual(input); expect(session.draftDirty).toBe(true); expect(session.selectedRecord).toEqual({ kind: 'draft', id: input!.id });
  expect(session.feedback).toEqual([receipt]); expect(session.revealFeedback(receipt.key)).toBe(true);
  expect(session.diagnostic).toEqual(receipt.issue); expect(saveDraft).not.toHaveBeenCalled(); expect(overview).not.toHaveBeenCalled(); session.stop();
});
it('reveals exact clean task and draft records through overview reads without saving', async () => {
  const saveDraft = vi.fn(), overview = vi.fn(async () => ({ ok: true as const, value: structuredClone(session.data), warnings: [] }));
  const session = new ProductionSession({ production: { saveDraft, overview } } as unknown as WorkbenchBridge, 'WorkAA');
  session.newDraft('ui'); const first = structuredClone({ ...session.draft!, revision: 1 }), desired = { ...structuredClone(first), id: 'DraftBB' };
  session.data.drafts = [first, desired]; session.data.tasks = [{ id: 'TaskAA' }] as Overview['tasks'];
  await expect(session.revealProblemRecord({ kind: 'task', id: 'TaskAA' })).resolves.toBe(true);
  expect(session.selectedRecord).toEqual({ kind: 'task', id: 'TaskAA' }); expect(overview).toHaveBeenLastCalledWith({ taskId: 'TaskAA' });
  await expect(session.revealProblemRecord({ kind: 'draft', id: desired.id })).resolves.toBe(true);
  expect(session.draft).toEqual(desired); expect(session.selectedRecord).toEqual({ kind: 'draft', id: desired.id });
  expect(overview).toHaveBeenLastCalledWith({ taskId: null }); expect(saveDraft).not.toHaveBeenCalled(); session.stop();
});
it('returns false for an unavailable or unreadable exact record while its original feedback remains revealable', async () => {
  const saveDraft = vi.fn(), overview = vi.fn().mockImplementationOnce(async () => ({ ok: true, value: structuredClone(session.data), warnings: [] }))
    .mockResolvedValueOnce(productionFailure('RECORD_READ_FAILED'));
  const session = new ProductionSession({ production: { saveDraft, overview } } as unknown as WorkbenchBridge, 'WorkAA');
  const receipt = { key: 'production:saveDraft:draft:MissingDraft', attemptId: 'TryAAA', kind: 'request' as const,
    target: { kind: 'draft' as const, id: 'MissingDraft' }, issue: productionFailure('SAVE_FAILED').error };
  session.restoreFeedback([receipt]);
  await expect(session.revealProblemRecord(receipt.target)).resolves.toBe(false);
  expect(session.unavailableRecord).toEqual(receipt.target); expect(session.revealFeedback(receipt.key)).toBe(true);
  await expect(session.revealProblemRecord({ kind: 'task', id: 'MissingTask' })).resolves.toBe(false);
  expect(session.feedback).toContainEqual(receipt); expect(session.revealFeedback(receipt.key)).toBe(true); expect(session.diagnostic).toEqual(receipt.issue);
  expect(saveDraft).not.toHaveBeenCalled(); session.stop();
});
it('retires only the discarded or abandoned draft feedback while retaining other drafts and task receipts', async () => {
  const saveDraft = vi.fn().mockResolvedValueOnce(productionFailure('FIRST_DRAFT_FAILED')).mockResolvedValueOnce(productionFailure('SECOND_DRAFT_FAILED'));
  const discardDraft = vi.fn(async () => ({ ok: true, value: undefined, warnings: [] })), retry = vi.fn(async () => productionFailure('TASK_RETRY_FAILED'));
  const session = new ProductionSession({ production: { saveDraft, discardDraft, retry } } as unknown as WorkbenchBridge, 'WorkAA');
  session.newDraft('ui'); const first = structuredClone({ ...session.draft!, revision: 1 }); session.data.drafts = [first];
  await session.bridge.production.saveDraft({ draft: first, expectedRevision: 1 });
  session.newDraft('voice'); const second = structuredClone(session.draft!);
  await session.bridge.production.saveDraft({ draft: second, expectedRevision: null }); const secondReceipt = session.feedback[1]!;
  await session.discardDraft(first.id);
  expect(session.feedback).toEqual([secondReceipt]); expect(session.draft?.id).toBe(second.id); expect(session.diagnostic?.code).toBe('SECOND_DRAFT_FAILED');
  await session.bridge.production.retry({ taskId: 'TaskAA', itemId: 'ItemAA', confirmNewRequest: true }); const taskReceipt = session.feedback[1]!;
  await session.abandonDraftChanges();
  expect(session.feedback).toEqual([taskReceipt]); expect(session.diagnostic?.code).toBe('TASK_RETRY_FAILED'); expect(session.error).toBe('TASK_RETRY_FAILED');
  expect(session.draft).toBeNull(); expect(discardDraft).toHaveBeenCalledExactlyOnceWith(first.id); session.stop();
});
it('keeps a discarded draft failure retired when its pending operation responds later', async () => {
  let finish!: (value: unknown) => void;
  const prepareUIPlan = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const session = new ProductionSession({ production: { prepareUIPlan } } as unknown as WorkbenchBridge, 'WorkAA');
  session.newDraft('ui');
  const pending = session.bridge.production.prepareUIPlan({ draft: session.draft!, candidateId: 'CandidateA', proposal: { summary: '', steps: [] }, expected: [], scope: { pageIds: [], componentIds: [] }, selectedAssets: [] });
  await session.discardDraft(); finish(productionFailure('LATE_DRAFT_FAILURE')); await pending;
  expect(session.feedback).toEqual([]); expect(session.diagnostic).toBeNull(); session.stop();
});
it('keeps a queued source-project save local after stop and resumes its autosave when restored',async()=>{
  vi.useFakeTimers();
  let finish!:(value:unknown)=>void;
  const saveDraft=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockImplementation(async({draft})=>({ok:true,value:{...draft,revision:draft.revision+1},warnings:[]}));
  const session=new ProductionSession({production:{saveDraft,overview:async()=>({ok:true,value:session.data,warnings:[]})}} as unknown as WorkbenchBridge,'WorkAA');
  session.newDraft('script');session.update({fields:{instruction:'第一次输入'}});
  const first=session.saveDraft();await Promise.resolve();await Promise.resolve();
  session.update({fields:{instruction:'切换前最后输入'}});const queued=session.saveDraft();
  session.stop();
  const saved=structuredClone(saveDraft.mock.calls[0]![0].draft);saved.revision=1;
  finish({ok:true,value:saved,warnings:[]});await first;await queued;
  expect(saveDraft).toHaveBeenCalledTimes(1);expect(session.variant!.fields.instruction).toBe('切换前最后输入');expect(session.draftDirty).toBe(true);
  session.start();await vi.advanceTimersByTimeAsync(1000);
  expect(saveDraft).toHaveBeenCalledTimes(2);expect(saveDraft.mock.calls[1]![0]).toMatchObject({draft:{projectId:'WorkAA',variants:{script:{fields:{instruction:'切换前最后输入'}}}},expectedRevision:1});
  session.stop();
});
it('retains the source-project draft when a polling response arrives after the workspace switches',async()=>{
  let finish!:(value:unknown)=>void;
  const overview=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
  const session=new ProductionSession({production:{overview}} as unknown as WorkbenchBridge,'WorkAA');
  const retained=session.data,pending=session.refresh();session.stop();
  const other=structuredClone(retained);other.canvas={width:800,height:600};
  finish({ok:true,value:other,warnings:[]});await pending;
  expect(session.data).toBe(retained);expect(session.data.canvas).toEqual({width:1920,height:1080});
  await session.refresh();expect(overview).toHaveBeenCalledTimes(1);
});
it('keeps the newest overview when an older polling request completes after the adoption refresh', async () => {
  let older!: (value: unknown) => void, newer!: (value: unknown) => void;
  const overview = vi.fn().mockImplementationOnce(() => new Promise(resolve => { older = resolve; })).mockImplementationOnce(() => new Promise(resolve => { newer = resolve; }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  const oldData = structuredClone(session.data), newData = structuredClone(session.data);
  const first = session.refresh(), second = session.refresh();
  newer({ ok: true, value: newData, warnings: [] }); await second;
  const revision = session.snapshot();
  older({ ok: true, value: oldData, warnings: [] }); await first;
  expect(session.data).toBe(newData); expect(session.snapshot()).toBe(revision);
});
it('publishes a completed overview while the next slow polling request is still pending', async () => {
  let first!: (value: unknown) => void, second!: (value: unknown) => void;
  const overview = vi.fn().mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
  const session = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  const firstData = structuredClone(session.data), nextData = structuredClone(session.data);
  const a = session.refresh(), b = session.refresh();
  first({ ok: true, value: firstData, warnings: [] }); await a; expect(session.data).toBe(firstData);
  second({ ok: true, value: nextData, warnings: [] }); await b; expect(session.data).toBe(nextData);
});
it('retains unsent continuation input by task across task changes and a production view restart', async () => {
  const saveDraft = vi.fn();
  const session = new ProductionSession({ production: { saveDraft } } as unknown as WorkbenchBridge, crypto.randomUUID());
  const taskA = crypto.randomUUID(), taskB = crypto.randomUUID();
  session.data.tasks = [{ id: taskA }, { id: taskB }] as Overview['tasks'];
  session.bridge.production.overview = vi.fn(async () => ({ ok: true as const, value: structuredClone(session.data), warnings: [] }));
  const changed = vi.fn(); session.subscribe(changed);
  session.taskId = taskA;
  session.updateContinuation(taskA, { sourceId: 'Version A', mode: 'discuss', instruction: '保留第一段，修改结尾', summary: '作者已确认的会话事实' });
  const inputA = session.continuationView(taskA);
  session.taskId = taskB;
  expect(session.continuationView(taskB)).toEqual({ sourceId: '', mode: 'write', instruction: '', summary: '' });
  session.updateContinuation(taskB, { sourceId: 'Version B', mode: 'performance', instruction: '仅补演出', summary: 'B 的摘要' });
  session.taskId = taskA;
  expect(session.continuationView(taskA)).toBe(inputA);
  expect(session.continuationView(taskA)).toEqual({ sourceId: 'Version A', mode: 'discuss', instruction: '保留第一段，修改结尾', summary: '作者已确认的会话事实' });
  session.stop(); await session.refresh();
  expect(changed).toHaveBeenCalledTimes(2);
  session.start(); await Promise.resolve(); await Promise.resolve(); session.stop();
  expect(session.continuationView(taskA)).toBe(inputA);
  expect(session.continuationView(taskB)).toEqual({ sourceId: 'Version B', mode: 'performance', instruction: '仅补演出', summary: 'B 的摘要' });
  expect(changed).toHaveBeenCalledTimes(3);
  expect(saveDraft).not.toHaveBeenCalled(); expect(session.draftDirty).toBe(false);
});

it('replaces the continuation input snapshot on each edit and clears only the submitted task input', () => {
  const session = new ProductionSession({ production: {} } as unknown as WorkbenchBridge, crypto.randomUUID());
  session.updateContinuation('Task A', { sourceId: 'First version', mode: 'performance', instruction: 'first', summary: 'facts' });
  session.updateContinuation('Task B', { instruction: 'B input' });
  const taskB = session.continuationView('Task B');
  for (const patch of [{ instruction: 'updated' }, { summary: 'new facts' }, { sourceId: 'Second version' }, { mode: 'discuss' as const }]) {
    const preparedInput = session.continuationView('Task A');
    session.updateContinuation('Task A', patch);
    expect(session.continuationView('Task A')).not.toBe(preparedInput);
    expect(session.continuationView('Task A')).toMatchObject(patch);
    expect(session.continuationView('Task B')).toBe(taskB);
  }
  session.updateContinuation('Task A', { sourceId: '', instruction: '', summary: '' });
  expect(session.continuationView('Task A')).toEqual({ sourceId: '', mode: 'discuss', instruction: '', summary: '' });
  expect(session.continuationView('Task B').instruction).toBe('B input');
});

it('starts direct background generation with formal context and no text request, retaining the figure route', async () => {
  const background = crypto.randomUUID(), figure = crypto.randomUUID(), connectionId = crypto.randomUUID(), sceneId = crypto.randomUUID();
  const context = vi.fn(async input => ({ ok: true, value: [{ id: crypto.randomUUID(), kind: 'script', label: 'selected', included: true, source: null, text: input.sceneId, media: null, attachment: null, authorEdited: false }], warnings: [] }));
  const data = { canvas: { width: 1280, height: 720 }, tasks: [], drafts: [], candidates: [], scenes: [{ id: sceneId, name: 'Scene', statements: [] }], pages: [], characters: [], assets: [], recipes: OfficialRecipes,
    connections: [{ id: connectionId, name: 'Comfy', model: 'local', purposes: ['image'], protocol: 'comfyUI', workflowBindingId: figure }],
    workflows: [{ id: background, purpose: 'image', imageUsages: ['background'] }, { id: figure, purpose: 'image', imageUsages: ['figure'] }], imageRoutes: { background: { connectionId, workflowBindingId: background, model: 'background-model' }, figure: { connectionId, workflowBindingId: figure, model: 'figure-model' } }, versions: [] };
  const s = new ProductionSession({ production: { overview: async () => ({ ok: true, value: data, warnings: [] }), context } } as unknown as WorkbenchBridge, crypto.randomUUID());
  await s.startQuick('background', { sceneId });
  expect(s.variant).toMatchObject({ connectionId, workflowBindingId: background, model: 'background-model', operation: 'image', recipe: null, promptPreparation: null });
  expect(context).toHaveBeenCalledWith(expect.objectContaining({ sceneId, usage: 'background' }));
  expect(s.variant!.target.sceneId).toBeNull();
  expect(s.origin?.sceneId).toBe(sceneId);
  expect(s.matchingWorkflows().map(workflow => workflow.id)).toEqual([background]);
  s.setUsage('figure');
  expect(s.variant!.workflowBindingId).toBe(figure);
  s.setUsage('background');
  expect(s.variant!.workflowBindingId).toBe(background);
  s.stop();
});
it('starts a stage request with the selected replacement range and the official stage recipe', async () => {
  const sceneId = crypto.randomUUID(), statementId = crypto.randomUUID();
  const data = { canvas: { width: 1280, height: 720 }, tasks: [], drafts: [], candidates: [], scenes: [], pages: [], characters: [], assets: [], recipes: OfficialRecipes, connections: [], workflows: [], versions: [] };
  const context = vi.fn(async () => ({ ok: true, value: [], warnings: [] }));
  const s = new ProductionSession({ production: { overview: async () => ({ ok: true, value: data, warnings: [] }), context } } as unknown as WorkbenchBridge, crypto.randomUUID());
  await s.startQuick('stage', { sceneId, statementId, statementIds: [statementId], textRange: { start: 4, end: 24 } });
  expect(s.variant!.target.replaceStatementIds).toEqual([statementId]);
  expect(s.variant!.recipe!.recipeId).toBe(OfficialRecipes.find(recipe => recipe.name === '剧情演出')!.id);
  expect(context).toHaveBeenCalledWith(expect.objectContaining({ statementIds: [statementId], textRange: { start: 4, end: 24 } }));
  expect(s.quickOpen).toBe(true); s.stop();
});
it('copies readable overview dialogue into selected speech lines without changing frozen tasks or requesting generation', async () => {
  const sceneId = crypto.randomUUID(), statementId = crypto.randomUUID(), characterId = crypto.randomUUID();
  const text = '星空 hello <b>literal</b>', context = vi.fn(), submit = vi.fn();
  const data = { canvas: { width: 1920, height: 1080 }, tasks: [{ id: crypto.randomUUID(), items: [{ input: { purpose: 'speech', text: 'Frozen earlier speech' } }] }], drafts: [], candidates: [],
    scenes: [{ id: sceneId, documentId: crypto.randomUUID(), revision: 2, name: 'Controlled dialogue', statements: [{ id: statementId, command: 'say', label: text, characterId, silent: false }] }],
    pages: [], characters: [{ id: characterId, name: '星' }], assets: [], recipes: OfficialRecipes, connections: [], workflows: [], versions: [] };
  const frozen = structuredClone(data.tasks);
  const s = new ProductionSession({ production: { overview: async () => ({ ok: true, value: data, warnings: [] }), context, submit } } as unknown as WorkbenchBridge, crypto.randomUUID());
  await s.startQuick('voice', { sceneId, statementId, statementIds: [statementId] });
  expect(s.variant!.fields.speechLines).toEqual([expect.objectContaining({ original: text, text, sceneId, statementId, characterId, selected: true })]);
  expect(s.data.tasks).toEqual(frozen); expect(context).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  s.stop();
});
it('keeps writing before the terminal command and staging over the full scene after changing scenes', async () => {
  const sceneA = crypto.randomUUID(), sceneB = crypto.randomUUID(), first = crypto.randomUUID(), transfer = crypto.randomUUID();
  const data = { canvas: { width: 1280, height: 720 }, tasks: [], drafts: [], candidates: [], scenes: [{ id: sceneA, name: 'A', statements: [] }, { id: sceneB, name: 'B', statements: [{ id: first, command: 'say' }, { id: transfer, command: 'changeScene' }] }], pages: [], characters: [], assets: [], recipes: OfficialRecipes, connections: [], workflows: [], versions: [] };
  const context = vi.fn(async () => ({ ok: true, value: [], warnings: [] }));
  const s = new ProductionSession({ production: { overview: async () => ({ ok: true, value: data, warnings: [] }), context } } as unknown as WorkbenchBridge, crypto.randomUUID());
  await s.startQuick('script', { sceneId: sceneA });
  await s.setQuickScene(sceneB);
  expect(s.variant!.target).toMatchObject({ sceneId: sceneB, statementId: transfer, replaceStatementIds: [] });
  expect(context).toHaveBeenLastCalledWith(expect.objectContaining({ sceneId: sceneB, statementId: transfer }));
  s.draftDirty = false;
  await s.startQuick('stage', { sceneId: sceneA });
  await s.setQuickScene(sceneB);
  expect(s.variant!.target).toMatchObject({ sceneId: sceneB, statementId: null, replaceStatementIds: [first, transfer] });
  expect(context).toHaveBeenLastCalledWith(expect.objectContaining({ sceneId: sceneB, statementIds: [first, transfer] }));
  s.stop();
});
it("autosaves the first meaningful edit and retains revisions across later context edits", async () => {
  vi.useFakeTimers();
  const saved: any[] = [];
  const bridge = {
    production: {
      saveDraft: vi.fn(async ({ draft, expectedRevision }) => {
        saved.push({ draft, expectedRevision });
        return {
          ok: true,
          value: { ...draft, revision: (expectedRevision ?? 0) + 1 },
          warnings: [],
        };
      }),
    },
  } as unknown as WorkbenchBridge;
  const session = new ProductionSession(bridge, crypto.randomUUID());
  session.newDraft("ui");
  session.field("instruction", "partial");
  await vi.advanceTimersByTimeAsync(500);
  session.field("instruction", "complete");
  await vi.advanceTimersByTimeAsync(999);
  expect(saved).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(saved).toHaveLength(1);
  await session.saveDraft();
  expect(saved).toHaveLength(1);
  expect(saved[0].draft.variants.ui.fields.instruction).toBe("complete");
  session.update({
    context: [
      {
        id: crypto.randomUUID(),
        kind: "ui",
        label: "page",
        included: false,
        source: null,
        text: "author text",
        media: null,
        attachment: null,
        authorEdited: true,
      },
    ],
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(saved[1].expectedRevision).toBe(1);
  expect(saved[1].draft.variants.ui.context[0]).toMatchObject({
    included: false,
    text: "author text",
  });
  session.stop();
});

it("discarding a new draft never invokes persistence", async () => {
 const saveDraft=vi.fn(), discardDraft=vi.fn();
 const session=new ProductionSession({production:{saveDraft,discardDraft}} as unknown as WorkbenchBridge,crypto.randomUUID());
 session.newDraft(); session.field('instruction','unsaved'); await session.discardDraft();
 expect(saveDraft).not.toHaveBeenCalled(); expect(discardDraft).not.toHaveBeenCalled(); expect(session.draft).toBeNull(); session.stop();
});
it("retains edits made while an explicit save is in flight", async()=>{
 let release!:(v:unknown)=>void;
 const saveDraft=vi.fn(()=>new Promise(resolve=>{release=resolve;}));
 const session=new ProductionSession({production:{saveDraft}} as unknown as WorkbenchBridge,crypto.randomUUID());
 session.newDraft(); session.field('instruction','first');
 const operation=session.saveDraft(true); await vi.waitFor(()=>expect(saveDraft).toHaveBeenCalled());
 session.field('instruction','latest');
 release({ok:true,value:{...session.draft,revision:1},warnings:[]}); await operation;
 expect(session.variant!.fields.instruction).toBe('latest'); expect(session.draftDirty).toBe(true); session.stop();
});

it('abandons only the unsaved delta after a failed autosave, restoring the complete last successful in-flight snapshot', async () => {
  vi.useFakeTimers();
  let release!: (value: unknown) => void;
  let persisted: ProductionFormDraft | null = null;
  const failure = { ok: false, error: { message: 'disk full' } };
  const saveDraft = vi.fn()
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValue(failure);
  const discardDraft = vi.fn();
  const session = new ProductionSession({ production: { saveDraft, discardDraft } } as unknown as WorkbenchBridge, crypto.randomUUID());
  const task = { id: crypto.randomUUID() } as Overview['tasks'][number];
  const candidate = { candidate: { id: crypto.randomUUID(), taskId: task.id }, adoption: 'unadopted' } as Overview['candidates'][number];
  session.data.tasks = [task]; session.data.candidates = [candidate]; session.taskId = task.id;
  session.bridge.production.overview = vi.fn(async () => ({ ok: true as const, value: { ...session.data, drafts: persisted ? [structuredClone(persisted)] : [] }, warnings: [] }));
  session.newDraft('ui');
  session.origin = { page: 'pages', sceneId: null, statementId: null, pageIds: ['Page'], componentIds: [] };
  session.draft!.origin = structuredClone(session.origin);
  session.field('instruction', 'saved input');
  await vi.advanceTimersByTimeAsync(1000);
  const captured = structuredClone(saveDraft.mock.calls[0][0].draft) as ProductionFormDraft;
  session.field('instruction', 'edit made during save');
  session.setUsage('voice'); session.field('spokenText', 'new unsaved voice');
  persisted = { ...captured, revision: 1, updatedAt: '2026-10-13T00:00:00.000Z' };
  release({ ok: true, value: structuredClone(persisted), warnings: [] });
  await vi.advanceTimersByTimeAsync(0);
  expect(session.draftDirty).toBe(true);
  expect(session.draftSaving).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(session.error).toContain('disk full');
  expect(session.variant!.fields.spokenText).toBe('new unsaved voice');
  session.field('spokenText', 'queued unsaved voice');
  session.plan = { planId: 'Stale' } as NonNullable<ProductionSession['plan']>;
  await session.abandonDraftChanges();
  expect(session.draft).toEqual(persisted);
  expect(session.draft!.activeUse).toBe('ui');
  expect(session.draft!.variants.voice).toBeUndefined();
  expect(session.origin).toEqual(persisted!.origin);
  expect(session.draftDirty).toBe(false); expect(session.draftSaving).toBe(false);
  expect(session.plan).toBeNull(); expect(session.error).toBe('');
  expect(session.data.tasks).toEqual([task]); expect(session.data.candidates).toEqual([candidate]); expect(session.taskId).toBe(task.id);
  expect(discardDraft).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(saveDraft).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  session.field('instruction', 'another edit');
  await session.abandonDraftChanges();
  expect(session.draft).toEqual(persisted); session.stop();
});

it('abandons a first-save failure without deleting another persisted draft or the task and candidate records', async () => {
  vi.useFakeTimers();
  const saveDraft = vi.fn(async () => ({ ok: false, error: { message: 'read-only disk' } })), discardDraft = vi.fn(), overview = vi.fn();
  const session = new ProductionSession({ production: { saveDraft, discardDraft, overview } } as unknown as WorkbenchBridge, crypto.randomUUID());
  session.newDraft('background');
  const otherDraft = structuredClone({ ...session.draft!, revision: 4 });
  session.data.drafts = [otherDraft];
  const records = { tasks: [{ id: 'Task' }], candidates: [{ candidate: { id: 'Candidate', taskId: 'Task' }, adoption: 'unadopted' }] } as Pick<Overview, 'tasks' | 'candidates'>;
  session.data.tasks = records.tasks; session.data.candidates = records.candidates; session.taskId = 'Task';
  session.newDraft('voice'); session.quickIntent = 'voice'; session.quickOpen = true;
  session.field('spokenText', 'never saved');
  await vi.advanceTimersByTimeAsync(1000);
  expect(session.draft!.revision).toBe(0); expect(session.draftDirty).toBe(true);
  expect(session.draftSaving).toBe(false); expect(session.variant!.fields.spokenText).toBe('never saved');
  session.field('spokenText', 'queued retry input');
  await session.abandonDraftChanges();
  expect(session.draft).toBeNull(); expect(session.draftDirty).toBe(false); expect(session.draftSaving).toBe(false);
  expect(session.quickIntent).toBeNull(); expect(session.quickOpen).toBe(false); expect(session.origin).toBeNull(); expect(session.error).toBe('');
  expect(session.data.drafts).toEqual([otherDraft]); expect(session.data.tasks).toEqual(records.tasks); expect(session.data.candidates).toEqual(records.candidates); expect(session.taskId).toBe('Task');
  expect(discardDraft).not.toHaveBeenCalled(); expect(overview).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(saveDraft).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0); session.stop();
});

it('waits for the pending failed save before abandoning input and cancels the scheduled follow-up save', async () => {
  vi.useFakeTimers();
  let release!: (value: unknown) => void;
  const saveDraft = vi.fn(() => new Promise(resolve => { release = resolve; })), discardDraft = vi.fn();
  const session = new ProductionSession({ production: { saveDraft, discardDraft } } as unknown as WorkbenchBridge, crypto.randomUUID());
  session.newDraft(); session.field('instruction', 'first');
  const operation = session.saveDraft(true).catch(reason => reason);
  await vi.advanceTimersByTimeAsync(0);
  session.field('instruction', 'latest');
  let settled = false;
  const abandon = session.abandonDraftChanges().then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false); expect(session.draftSaving).toBe(true); expect(session.variant!.fields.instruction).toBe('latest');
  release({ ok: false, error: { message: 'save failed' } });
  expect(await operation).toBeInstanceOf(Error); await abandon;
  expect(session.draft).toBeNull(); expect(session.draftDirty).toBe(false); expect(session.draftSaving).toBe(false);
  await vi.advanceTimersByTimeAsync(2000);
  expect(saveDraft).toHaveBeenCalledTimes(1); expect(discardDraft).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); session.stop();
});

it('restores a reopened persisted draft after a save failure without mutating the overview copy', async () => {
  vi.useFakeTimers();
  const saveDraft = vi.fn(async () => ({ ok: false, error: { message: 'disk unavailable' } })), discardDraft = vi.fn();
  const session = new ProductionSession({ production: { saveDraft, discardDraft } } as unknown as WorkbenchBridge, crypto.randomUUID());
  session.newDraft('ui');
  const saved = structuredClone({ ...session.draft!, revision: 3 }); saved.variants.ui!.fields.instruction = 'persisted';
  const overview = { ...session.data, drafts: [saved] };
  session.draft = null;
  session.bridge.production.overview = vi.fn(async () => ({ ok: true as const, value: structuredClone(overview), warnings: [] }));
  await session.refresh();
  session.field('instruction', 'unsaved');
  expect(session.data.drafts[0]).toEqual(saved);
  await expect(session.saveDraft()).rejects.toThrow('disk unavailable');
  await session.abandonDraftChanges();
  expect(session.draft).toEqual(saved); expect(discardDraft).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); session.stop();
});

it('reads the current persisted version when abandoning a conflict and restores its origin without waiting for polling', async () => {
  vi.useFakeTimers();
  let persisted: ProductionFormDraft | null = null;
  const saveDraft = vi.fn(async ({ draft, expectedRevision }) => {
    if ((persisted?.revision ?? null) !== expectedRevision) return { ok: false, error: { message: 'draft conflict' } };
    persisted = structuredClone({ ...draft, revision: (expectedRevision ?? 0) + 1 });
    return { ok: true, value: structuredClone(persisted), warnings: [] };
  });
  const discardDraft = vi.fn();
  const session = new ProductionSession({ production: { saveDraft, discardDraft } } as unknown as WorkbenchBridge, crypto.randomUUID());
  const overview = vi.fn(async () => ({ ok: true as const, value: { ...session.data, drafts: persisted ? [structuredClone(persisted)] : [] }, warnings: [] }));
  session.bridge.production.overview = overview;
  session.newDraft('ui');
  session.draft!.origin = { page: 'pages', sceneId: null, statementId: null, pageIds: ['OriginalPage'], componentIds: [] };
  session.field('instruction', 'revision one'); await session.saveDraft();
  const external = structuredClone({ ...persisted!, revision: 2 });
  external.variants.ui!.fields.instruction = 'revision two from another saved operation';
  external.origin = { page: 'pages', sceneId: null, statementId: null, pageIds: ['CurrentPage'], componentIds: ['CurrentComponent'] };
  persisted = external;
  session.field('instruction', 'unsaved local input');
  await expect(session.saveDraft()).rejects.toThrow('draft conflict');
  expect(session.variant!.fields.instruction).toBe('unsaved local input'); expect(session.draftDirty).toBe(true);
  expect(overview).not.toHaveBeenCalled();
  await session.abandonDraftChanges();
  expect(overview).toHaveBeenCalledTimes(1);
  expect(session.draft).toEqual(external); expect(session.origin).toEqual(external.origin);
  expect(session.draftDirty).toBe(false); expect(session.draftSaving).toBe(false);
  expect(persisted).toEqual(external); expect(saveDraft).toHaveBeenCalledTimes(2); expect(discardDraft).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); session.stop();
});

it('keeps unsaved input and the return origin when reading persisted data fails, then permits an explicit retry', async () => {
  vi.useFakeTimers();
  let persisted: ProductionFormDraft | null = null;
  const saveDraft = vi.fn(async ({ draft }) => {
    persisted = structuredClone({ ...draft, revision: 1 });
    return { ok: true, value: structuredClone(persisted), warnings: [] };
  }), discardDraft = vi.fn();
  const session = new ProductionSession({ production: { saveDraft, discardDraft } } as unknown as WorkbenchBridge, crypto.randomUUID());
  const overview = vi.fn()
    .mockResolvedValueOnce({ ok: false, error: { message: 'draft read failed' } })
    .mockImplementation(async () => ({ ok: true, value: { ...session.data, drafts: [structuredClone(persisted!)] }, warnings: [] }));
  session.bridge.production.overview = overview;
  session.newDraft('ui');
  session.draft!.origin = { page: 'pages', sceneId: null, statementId: null, pageIds: ['SavedPage'], componentIds: [] };
  session.field('instruction', 'saved input'); await session.saveDraft();
  session.origin = { page: 'editor', sceneId: 'CurrentScene', statementId: 'CurrentStatement', pageIds: [], componentIds: [] };
  session.field('instruction', 'unsaved input'); session.error = 'save conflict';
  const input = structuredClone(session.draft), origin = structuredClone(session.origin), data = session.data;
  const plan = { planId: 'Current' } as NonNullable<ProductionSession['plan']>; session.plan = plan;
  await expect(session.abandonDraftChanges()).rejects.toThrow('draft read failed');
  expect(session.draft).toEqual(input); expect(session.origin).toEqual(origin); expect(session.data).toBe(data);
  expect(session.draftDirty).toBe(true); expect(session.draftSaving).toBe(false); expect(session.plan).toBe(plan); expect(session.error).toBe('save conflict');
  expect(saveDraft).toHaveBeenCalledTimes(1); expect(discardDraft).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  await session.abandonDraftChanges();
  expect(overview).toHaveBeenCalledTimes(2); expect(session.draft).toEqual(persisted); expect(session.origin).toEqual(persisted!.origin); expect(session.draftDirty).toBe(false); session.stop();
});

it('opens speech through the same draft path and captures only selected read values without general context', async () => {
  const sceneId = crypto.randomUUID(), selected = crypto.randomUUID(), other = crypto.randomUUID();
  const context = vi.fn();
  const data = { canvas: { width: 1920, height: 1080 }, tasks: [], drafts: [], candidates: [], recipes: OfficialRecipes, connections: [], workflows: [], pages: [], characters: [], assets: [], versions: [], scenes: [{ id: sceneId, name: '来源', statements: [{ id: selected, command: 'say', label: '已选朗读' }, { id: other, command: 'say', label: '未选正文' }] }] };
  const session = new ProductionSession({ production: { overview: async () => ({ ok: true, value: data, warnings: [] }), context } } as unknown as WorkbenchBridge, crypto.randomUUID());
  await session.startQuick('voice', { sceneId, statementIds: [selected] });
  expect(session.purpose).toBe('speech'); expect(context).not.toHaveBeenCalled();
  expect(session.variant!.fields.speechLines).toMatchObject([{ statementId: selected, text: '已选朗读' }]);
  expect(JSON.stringify(session.variant!.fields.speechLines)).not.toContain('未选正文');
  session.update({ target: { ...session.variant!.target, sceneId: null } });
  expect(context).not.toHaveBeenCalled(); session.stop();
});

it('retains the execution semantics and all variants of legacy prompt drafts', async () => {
  const session = new ProductionSession({ production: {} } as unknown as WorkbenchBridge, crypto.randomUUID());
  session.newDraft('voice'); session.variant!.recipe = { recipeId: crypto.randomUUID(), purpose: 'speechText', scope: 'personal', usage: 'voice', parameterValues: { style: 'old' } };
  delete session.variant!.operation;
  expect(session.purpose).toBe('text');
  session.variant!.fields.speed = 1.2;
  session.setUsage('background'); session.variant!.fields.positive = 'old image';
  session.setUsage('voice');
  expect(session.variant!.fields.speed).toBe(1.2); expect(session.variant!.recipe!.parameterValues.style).toBe('old');
  expect(session.draft!.variants.background!.fields.positive).toBe('old image'); session.stop();
});

it('keeps an authored context projection and offers the changed source without overwriting the input', async () => {
  const sourceId = crypto.randomUUID();
  const context = vi.fn(async () => ({ ok: true, value: [{ id: crypto.randomUUID(), kind: 'script', label: '选定正文', included: true, source: { ref: { kind: 'document', id: sourceId }, revision: 2 }, text: '新的来源正文', media: null, attachment: null, authorEdited: false }], warnings: [] }));
  const session = new ProductionSession({ production: { context } } as unknown as WorkbenchBridge, crypto.randomUUID());
  session.newDraft('script'); session.variant!.context = [{ id: crypto.randomUUID(), kind: 'script', label: '选定正文', included: true, source: { ref: { kind: 'document', id: sourceId }, revision: 1 }, text: '本次手改投影', media: null, attachment: null, authorEdited: true }];
  await session.captureContext();
  expect(session.variant!.context[0]).toMatchObject({ text: '本次手改投影', sourceText: '新的来源正文', authorEdited: true, included: true }); session.stop();
});

it('restoring one parameter removes its override and follows subsequent preset values', () => {
  const session = new ProductionSession({ production: {} } as unknown as WorkbenchBridge, crypto.randomUUID());
  session.newDraft('voice'); session.variant!.parameterPresetId = 'Preset';
  session.resetParameter('speed', 1);
  const scheme = OfficialRecipes.find(recipe => recipe.production?.operation === 'speech')!;
  const preset = { ...scheme, production: undefined, parameterPreset: { recipeId: scheme.id, recipeScope: scheme.scope, recipeRevision: scheme.revision, values: { speed: 1.4 } } };
  expect(resolveProductionFields(session.variant!, scheme, preset).speed).toBe(1.4);
  expect(session.variant!.parameterOverrides).not.toHaveProperty('speed');
  expect(session.variant!.parameterPresetId).toBe('Preset'); session.stop();
});
