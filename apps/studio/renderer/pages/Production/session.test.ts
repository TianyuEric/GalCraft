import { afterEach, expect, it, vi } from "vitest";
import { ProductionSession } from "./session.js";
import type { Overview, WorkbenchBridge } from "./bridge.js";
import type { ProductionFormDraft } from '@galcraft/authoring/production';
import { OfficialRecipes } from '@galcraft/authoring/recipes';
import { resolveProductionFields } from '@galcraft/authoring/production/draft';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
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
