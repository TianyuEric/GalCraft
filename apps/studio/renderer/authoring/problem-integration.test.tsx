// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AssetImportBatch, AuthoringInputDraft, Issue, Json, Result } from '@galcraft/contracts';
import type { ProductionProblemSnapshot } from '@galcraft/authoring/production';
import { FixtureIds, FixtureProject, fixtureId } from '@galcraft/contracts/fixtures';
import { studioFixture } from '../stories/studio-fixture.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({ languages: { getLanguages: () => [], register: vi.fn(), setMonarchTokensProvider: vi.fn() } }));

type Services = Parameters<typeof mountAuthoring>[1] & ReturnType<typeof studioFixture>['services'];
type Workspace = Awaited<ReturnType<typeof mountAuthoring>>;
const workspaces = new Set<Workspace>();
const importIssue: Issue = { code: 'INTEGRATION_IMPORT_READ', owner: 'M04', severity: 'error', message: 'The voice file is locked.', related: [], actions: ['retry'] };
const productionIssue: Issue = { code: 'INTEGRATION_PROVIDER_FAILED', owner: 'M10', severity: 'error', message: 'The provider retained the failed job.', related: [], actions: ['retry'] };
const createdAt = '2026-11-17T01:00:00.000Z';
const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const failure = (error: Issue): Extract<Result<never>, { ok: false }> => ({ ok: false, error, issues: [error] });
let originalScrollIntoView: PropertyDescriptor | undefined;

beforeEach(() => {
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: new DOMRect(0, 0, 1440, 900) } as ResizeObserverEntry], this); }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^\w-]/g, character => '\\' + character) });
  originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});

afterEach(async () => {
  await act(async () => { for (const workspace of workspaces) workspace.dispose(); workspaces.clear(); });
  cleanup(); document.getElementById('studio-portals')?.remove();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

async function mount(services: Services) {
  const { container, unmount } = render(<div data-locale="en" data-theme="light" />);
  const app = container.firstElementChild as HTMLElement;
  let workspace!: Workspace;
  await act(async () => { workspace = await mountAuthoring(app, services); });
  workspaces.add(workspace);
  return { app, workspace, unmount };
}

function problemServices() {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const batch: AssetImportBatch = { id: fixtureId(0x1c01), projectId: FixtureProject.projectId, revision: 1, createdAt, updatedAt: createdAt,
    succeeded: [{ id: fixtureId(0x1c02), name: 'Imported rain' }], failed: [{ path: 'D:/source/voice.ogg', issue: importIssue }],
    attempts: [{ id: fixtureId(0x1c03), createdAt, succeeded: [fixtureId(0x1c02)], failed: [{ path: 'D:/source/voice.ogg', issue: importIssue }] }] };
  const state = { batches: [batch], production: { projectId: FixtureProject.projectId, tasks: [{ id: fixtureId(0x1c04), name: 'Opening voices', revision: 1,
    failures: [{ itemId: fixtureId(0x1c05), attemptId: fixtureId(0x1c06), issues: [productionIssue] }] }] } satisfies ProductionProblemSnapshot };
  const imports = vi.spyOn(services.bridge.assets, 'listImportBatches').mockImplementation(async () => ok(structuredClone(state.batches)));
  const production = vi.spyOn(services.bridge.production, 'problemSnapshot').mockImplementation(async () => ok(structuredClone(state.production)));
  return { services, state, imports, production };
}

const tool = (app: HTMLElement) => app.querySelector<HTMLElement>('[data-tool-view="studio-problems"]')!;
const pane = (app: HTMLElement) => app.querySelector<HTMLElement>('.gc-workbench-problems')!;
const row = (app: HTMLElement, code: string) => app.querySelector<HTMLElement>(`.gc-workbench-problems [data-problem-id][data-issue-code="${code}"]`);
async function openProblems(app: HTMLElement) { await act(async () => { fireEvent.click(tool(app)); }); }
async function recheck(app: HTMLElement) {
  const button = () => within(pane(app).querySelector<HTMLElement>('.gc-problems-toolbar')!).getByRole('button', { name: 'Recheck' });
  await act(async () => { fireEvent.click(button()); });
  await waitFor(() => expect(button().getAttribute('aria-busy')).toBe('false'));
}

it('opens an all-failed import as an empty exact batch and returns without editing or saving', async () => {
  const fixture = problemServices(), batch = fixture.state.batches[0]!;
  batch.succeeded = []; batch.attempts[0]!.succeeded = [];
  const originalQuery = fixture.services.queryAssets;
  const queried = vi.spyOn(fixture.services, 'queryAssets').mockImplementation(input => input.assetIds
    ? Promise.resolve(ok({ items: [], total: 0, indexRevision: 1 })) : originalQuery(input));
  const edit = vi.spyOn(fixture.services.bridge.documents, 'planEdit'), save = vi.spyOn(fixture.services.bridge.documents, 'planSave');
  const { app } = await mount(fixture.services); await openProblems(app);
  await waitFor(() => expect(row(app, importIssue.code)).toBeTruthy());
  await act(async () => { fireEvent.click(within(row(app, importIssue.code)!).getByRole('button', { name: 'Open import results' })); });
  const library = () => app.querySelector<HTMLElement>('[data-view="studio-assets"] .authoring-assets')!;
  await waitFor(() => expect(library().textContent).toContain('No available assets in this batch'));
  expect(queried.mock.calls.at(-1)?.[0].assetIds).toEqual([]);
  await act(async () => { fireEvent.click(within(library()).getByRole('button', { name: 'Return to asset browsing' })); });
  expect(queried.mock.calls.at(-1)?.[0].assetIds).toBeUndefined();
  expect(edit).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  expect(row(app, importIssue.code)).toBeTruthy();
});

it.each(['return', 'clear'] as const)('ignores a late batch select-all after %s changes the selection intent', async action => {
  const fixture = problemServices(), originalQuery = fixture.services.queryAssets;
  const initial = await originalQuery({ kind: null, text: '', offset: 0, limit: 40 });
  if (!initial.ok || initial.value.items.length < 2) throw new Error('Two fixture assets are required.');
  const originalId = initial.value.items[0]!.id, batchId = initial.value.items[1]!.id;
  fixture.state.batches[0]!.succeeded = [{ id: batchId, name: 'Batch asset' }];
  fixture.services.queryAssets = async input => {
    const result = await originalQuery({ ...input, offset: 0, limit: 100 }); if (!result.ok) return result;
    const items = input.assetIds ? result.value.items.filter(asset => input.assetIds!.includes(asset.id)) : result.value.items;
    return ok({ ...result.value, items, total: items.length });
  };
  let finish!: (value: Result<{ ids: string[]; indexRevision: number }>) => void;
  fixture.services.allAssetIds = vi.fn(() => new Promise<Result<{ ids: string[]; indexRevision: number }>>(resolve => { finish = resolve; }));
  const { app, workspace } = await mount(fixture.services);
  workspace.selectedAssets.add(originalId);
  await openProblems(app); await waitFor(() => expect(row(app, importIssue.code)).toBeTruthy());
  await act(async () => { fireEvent.click(within(row(app, importIssue.code)!).getByRole('button', { name: 'Open import results' })); });
  const library = () => app.querySelector<HTMLElement>('[data-view="studio-assets"] .authoring-assets')!;
  await waitFor(() => expect(library().querySelectorAll('.authoring-asset')).toHaveLength(1));
  await act(async () => { fireEvent.click(library().querySelector('.asset-bulk-actions summary')!); });
  await act(async () => { fireEvent.click(within(library()).getByRole('button', { name: 'Select all results' })); });
  await waitFor(() => expect(fixture.services.allAssetIds).toHaveBeenCalled());
  await act(async () => { fireEvent.click(within(library()).getByRole('button', { name: action === 'return' ? 'Return to asset browsing' : 'Clear selection' })); });
  await act(async () => { finish(ok({ ids: [batchId], indexRevision: 1 })); });
  expect([...workspace.selectedAssets]).toEqual(action === 'return' ? [originalId] : []);
});

it('loads import and production failures with their workspaces hidden and keeps the row after Message dismissal', async () => {
  const fixture = problemServices(), overview = vi.spyOn(fixture.services.bridge.production, 'overview');
  const { app } = await mount(fixture.services);
  await waitFor(() => expect(tool(app).textContent).toContain('Problems · 2'));
  expect(tool(app).getAttribute('aria-pressed')).toBe('false');
  expect(app.querySelector('[data-view="route:production"]:not([hidden])')).toBeNull();
  expect(app.querySelector('[data-view="studio-assets"]:not([hidden])')).toBeNull();
  expect(overview).not.toHaveBeenCalled();
  expect(fixture.imports).toHaveBeenCalledWith(FixtureProject.projectId);
  expect(fixture.production).toHaveBeenCalled();
  const message = document.querySelector<HTMLElement>('.studio-toast:not([data-ending-style])')!;
  expect(message).toBeTruthy();
  await act(async () => { fireEvent.keyDown(window, { key: 'F6' }); });
  await act(async () => { fireEvent.click(within(message).getByRole('button', { name: 'Dismiss notification' })); });
  await openProblems(app);
  expect(row(app, importIssue.code)).toBeTruthy();
  expect(row(app, productionIssue.code)).toBeTruthy();
  expect(tool(app).textContent).toContain('Problems · 2');
  await act(async () => { fireEvent.click(within(row(app, importIssue.code)!).getByRole('button', { name: 'Open import results' })); });
  await waitFor(() => expect(app.querySelector(`[data-import-batch="${fixture.state.batches[0]!.id}"]`)?.textContent).toContain('voice.ogg'));
  expect(app.querySelector('[data-view="studio-assets"]:not([hidden])')).toBeTruthy();
});

it('persists an ignored import attempt through the real workspace store and reveals a later attempt without changing the receipt', async () => {
  const fixture = problemServices(); fixture.state.production.tasks = [];
  const original = structuredClone(fixture.state.batches[0]!);
  const write = vi.spyOn(fixture.services.bridge.authoringPreferences, 'writeWorkspace');
  const first = await mount(fixture.services);
  await waitFor(() => expect(tool(first.app).textContent).toContain('Problems · 1'));
  await openProblems(first.app);
  await act(async () => { fireEvent.click(within(row(first.app, importIssue.code)!).getByRole('button', { name: 'Ignore this attempt' })); });
  await act(async () => { await first.workspace.controller.flushResume(); });
  const stored = await fixture.services.bridge.authoringPreferences.readWorkspace(FixtureProject.projectId);
  const ignoredKey = `import:${original.id}:${original.attempts[0]!.id}`;
  expect(stored.ok && stored.value?.workbench?.problems?.ignoredAttempts).toContain(ignoredKey);
  expect(write).toHaveBeenCalled();
  expect(fixture.state.batches[0]).toEqual(original);
  await act(async () => { first.workspace.dispose(); workspaces.delete(first.workspace); first.unmount(); });
  const second = await mount(fixture.services);
  await waitFor(() => expect(tool(second.app).textContent).toContain('Problems · 0'));
  if (tool(second.app).getAttribute('aria-pressed') !== 'true') await openProblems(second.app);
  expect(row(second.app, importIssue.code)).toBeNull();
  expect(pane(second.app).textContent).toContain('No pending problems. 1 ignored.');
  const batch = fixture.state.batches[0]!;
  batch.revision++; batch.updatedAt = '2026-11-17T01:01:00.000Z';
  batch.attempts.push({ id: fixtureId(0x1c07), createdAt: batch.updatedAt, succeeded: [], failed: structuredClone(batch.failed) });
  await recheck(second.app);
  expect(row(second.app, importIssue.code)).toBeTruthy();
  expect(tool(second.app).textContent).toContain('Problems · 1');
  expect(fixture.state.batches[0]!.attempts[0]).toEqual(original.attempts[0]);
});

it('rechecks only read ports and keeps unapplied character input and its draft intact', async () => {
  const fixture = problemServices();
  const loaded = await fixture.services.read();
  if (!loaded.ok) throw loaded.error;
  const source = loaded.value, character = source.characters.find(character => character.id === FixtureIds.an)!;
  const text = 'Unapplied character input remains here.';
  let draft: AuthoringInputDraft | null = { schemaVersion: 1, projectId: source.project.projectId, entry: 'browser', updatedAt: createdAt,
    content: { version: 1, projectId: source.project.projectId, unapplied: true, otherUnapplied: true,
      versions: [{ documentId: source.projectDocumentId, revision: source.projectRevision }], scripts: [], writing: [], forms: [],
      character: { drafts: { [character.id]: { ...character, description: text } }, selected: character.id, search: '' },
      documents: [{ id: `character:${character.id}`, kind: 'character', objectId: character.id, title: character.name }],
      active: `character:${character.id}`, page: 'editor', sceneId: source.scenes[0]!.sceneId, view: 'writing',
    } as Json };
  fixture.services.bridge.authoringPreferences.readInputDraft = async () => ok(draft);
  const writeDraft = vi.fn(async (value: AuthoringInputDraft) => { draft = structuredClone(value); return ok(undefined); });
  fixture.services.bridge.authoringPreferences.writeInputDraft = writeDraft;
  const { app, workspace } = await mount(fixture.services);
  await waitFor(() => expect(tool(app).textContent).toContain('Problems · 2'));
  await act(async () => { await workspace.flushInputDrafts(); });
  const before = structuredClone(draft);
  expect(JSON.stringify(before)).toContain(text);
  await openProblems(app);
  const read = vi.spyOn(fixture.services, 'read'), compile = vi.spyOn(fixture.services, 'compilePreview');
  const queryRemote = vi.fn(), refetch = vi.fn();
  Object.assign(fixture.services.bridge.production, { queryRemote, refetch });
  const forbidden = [vi.spyOn(fixture.services.bridge.assets, 'import'), vi.spyOn(fixture.services.bridge.production, 'submit'),
    vi.spyOn(fixture.services.bridge.production, 'retry'), vi.spyOn(fixture.services.bridge.production, 'resume'),
    vi.spyOn(fixture.services.bridge.production, 'apply'), vi.spyOn(fixture.services.bridge.production, 'saveDraft'),
    vi.spyOn(fixture.services.bridge.documents, 'save'), vi.spyOn(fixture.services.bridge.documents, 'applyEdit'),
    vi.spyOn(fixture.services.bridge.builds!, 'build'), queryRemote, refetch];
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  fixture.imports.mockClear(); fixture.production.mockClear(); writeDraft.mockClear();
  await recheck(app);
  expect(read).toHaveBeenCalledOnce(); expect(compile).toHaveBeenCalled();
  expect(fixture.imports).toHaveBeenCalledExactlyOnceWith(FixtureProject.projectId); expect(fixture.production).toHaveBeenCalledOnce();
  forbidden.forEach(call => expect(call).not.toHaveBeenCalled()); expect(fetch).not.toHaveBeenCalled();
  await act(async () => { await workspace.flushInputDrafts(); });
  expect(writeDraft).not.toHaveBeenCalled(); expect(draft).toEqual(before);
  expect([...app.querySelectorAll<HTMLTextAreaElement>('textarea')].some(input => input.value === text)).toBe(true);
});

it('retains both prior sources when recheck reads fail and clears them only after valid empty snapshots', async () => {
  const fixture = problemServices(), { app } = await mount(fixture.services);
  await waitFor(() => expect(tool(app).textContent).toContain('Problems · 2'));
  await openProblems(app);
  const importRead = { ...importIssue, code: 'INTEGRATION_IMPORT_STORE', message: 'Import receipts cannot be read.' };
  const productionRead = { ...productionIssue, code: 'INTEGRATION_PRODUCTION_STORE', message: 'Production receipts cannot be read.' };
  fixture.imports.mockResolvedValue(failure(importRead)); fixture.production.mockResolvedValue(failure(productionRead));
  await recheck(app);
  expect(row(app, importIssue.code)).toBeTruthy(); expect(row(app, productionIssue.code)).toBeTruthy();
  expect(row(app, importRead.code)).toBeTruthy(); expect(row(app, productionRead.code)).toBeTruthy();
  expect(row(app, importIssue.code)?.textContent).toContain('Needs recheck');
  expect(row(app, productionIssue.code)?.textContent).toContain('Needs recheck');
  expect(pane(app).textContent).toContain('Check incomplete. Previous results are kept.');
  expect(pane(app).textContent).not.toContain('No current problems.');
  expect(tool(app).textContent).toContain('Problems · 4');
  fixture.imports.mockResolvedValue(ok([])); fixture.production.mockResolvedValue(ok({ projectId: FixtureProject.projectId, tasks: [] }));
  await recheck(app);
  expect(tool(app).textContent).toContain('Problems · 0');
  expect(pane(app).textContent).toContain('No current problems.');
});

it('opens the exact production task from a background problem without submitting or retrying it', async () => {
  const fixture = problemServices(); fixture.state.batches = [];
  const initial = await fixture.services.bridge.production.overview();
  if (!initial.ok || !initial.value.tasks[0]) throw new Error('The fixture must expose a production task.');
  const task = initial.value.tasks[0];
  fixture.state.production.tasks[0] = { ...fixture.state.production.tasks[0]!, id: task.id, name: task.name };
  const overview = vi.spyOn(fixture.services.bridge.production, 'overview');
  const submit = vi.spyOn(fixture.services.bridge.production, 'submit'), retry = vi.spyOn(fixture.services.bridge.production, 'retry');
  const { app } = await mount(fixture.services);
  await waitFor(() => expect(tool(app).textContent).toContain('Problems · 1'));
  expect(overview).not.toHaveBeenCalled();
  await openProblems(app);
  await act(async () => { fireEvent.click(within(row(app, productionIssue.code)!).getByRole('button', { name: 'Open task' })); });
  await waitFor(() => expect(overview).toHaveBeenCalledWith({ taskId: task.id }));
  expect(app.querySelector('[data-view="route:production"]:not([hidden])')).toBeTruthy();
  expect(submit).not.toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
});

it('shows one owned engine blocker when compilation reports the same cause and clears it only after health recovers', async () => {
  const fixture = problemServices(); fixture.state.batches = []; fixture.state.production.tasks = [];
  const issue: Issue = { code: 'ENGINE_INVALID', owner: 'M11', severity: 'error', message: 'Engine 0.1.1 manifest is not JSON', related: [], actions: ['supplyDependency'] };
  Object.assign(fixture.services.bridge.engines, { health: async () => ok({ version: '0.1.1', issues: [issue] }) });
  fixture.services.compilePreview = async () => failure(issue);
  const { app } = await mount(fixture.services);
  await waitFor(() => expect(tool(app).textContent).toContain('Problems · 1'));
  await openProblems(app);
  expect(app.querySelectorAll('[data-issue-code="ENGINE_INVALID"]')).toHaveLength(1);
  expect(row(app, issue.code)?.textContent).toContain('Engine and dependencies');
  expect(app.querySelector('.studio-readonly')).toBeTruthy();
  Object.assign(fixture.services.bridge.engines, { health: async () => ok({ version: '0.1.1', issues: [] }) });
  fixture.services.compilePreview = async () => ok({ snapshot: null, lastValid: null, current: true, issues: [] });
  await recheck(app);
  expect(tool(app).textContent).toContain('Problems · 0'); expect(app.querySelector('.studio-readonly')).toBeNull();
});

it('reveals the original build attempt and target without replacing the latest output failure', async () => {
  const fixture = problemServices(); fixture.state.batches = []; fixture.state.production.tasks = [];
  const first = await mount(fixture.services);
  const issue: Issue = { code: 'BUILD_LOCKED', owner: 'M11', severity: 'error', message: 'The Windows destination is locked.', related: [], actions: ['retry'] };
  first.workspace.controller.rememberWorkbench({ documents: [], active: '', problems: {
    query: '', severity: 'all', selected: null, scrollTop: 0, ignoredAttempts: [],
    operations: [{ id: 'build:windows', attemptId: 'windows-attempt', issue, group: 'Build · windows', source: { kind: 'build', planId: 'original-windows-plan', target: 'windows' } }],
    outputFailure: { kind: 'save', id: 'latest-save-plan', issue: importIssue, cancelled: false },
  } });
  await act(async () => { await first.workspace.controller.flushResume(); first.workspace.dispose(); });
  workspaces.delete(first.workspace); first.unmount();
  const second = await mount(fixture.services); await openProblems(second.app);
  await act(async () => { fireEvent.click(within(row(second.app, issue.code)!).getByRole('button', { name: 'Open build receipt' })); });
  const receipt = () => second.app.querySelector<HTMLElement>('[data-output="failure"]')!;
  await waitFor(() => expect(receipt().textContent).toContain('original-windows-plan · windows'));
  expect(receipt().textContent).toContain(issue.message);
  expect(within(receipt()).getByRole('button', { name: 'Open Publish' })).toBeTruthy();
  expect(second.workspace.controller.workbench?.problems?.outputFailure?.id).toBe('latest-save-plan');
  await act(async () => { fireEvent.click(within(receipt()).getByRole('button', { name: 'Return to latest output' })); });
  expect(receipt().textContent).toContain('latest-save-plan');
  expect(receipt().textContent).not.toContain('original-windows-plan');
});
