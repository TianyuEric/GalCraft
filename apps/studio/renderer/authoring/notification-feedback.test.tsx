// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthoringInputDraft, Issue, Json, Operation, Result, StudioBridge } from '@galcraft/contracts';
import { FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import { studioFixture } from '../stories/studio-fixture.js';
import { studioToasts } from '../components/toast.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({}));

type Services = Parameters<typeof mountAuthoring>[1];
type Workspace = Awaited<ReturnType<typeof mountAuthoring>>;
type ModelResult = Awaited<ReturnType<StudioBridge['assets']['prepareMattingModel']>>;
const workspaces: Workspace[] = [];

beforeEach(() => {
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: new DOMRect(0, 0, 1440, 900) } as ResizeObserverEntry], this); }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^\w-]/g, character => '\\' + character) });
});
afterEach(async () => {
  await act(async () => { for (const workspace of workspaces.splice(0)) workspace.dispose(); });
  cleanup(); document.getElementById('studio-portals')?.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

function failure<T>(issue: Issue): Result<T> { return { ok: false, error: issue, issues: [issue] }; }

async function mount(services: Services = studioFixture('normal', 'en', 'light').services) {
  const { container } = render(<div id="app" data-locale="en" data-theme="light" />);
  const app = container.firstElementChild as HTMLElement;
  let workspace!: Workspace;
  await act(async () => { workspace = await mountAuthoring(app, services); });
  workspaces.push(workspace);
  return { app, workspace, services };
}

function modelServices() {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const listeners = new Set<(event: Operation<Json>) => void>();
  const unsubscribe = vi.fn();
  const attempts: ((result: ModelResult) => void)[] = [];
  services.bridge.operations = {
    cancel: async () => ({ local: 'alreadyFinished', remote: 'notApplicable' }),
    subscribe: callback => { listeners.add(callback); return () => { listeners.delete(callback); unsubscribe(); }; },
  };
  services.prepareMattingModel = vi.fn(() => new Promise<ModelResult>(resolve => attempts.push(resolve)));
  const progress = (completed: number) => {
    for (const listener of listeners) listener({ operationId: fixtureId(0x1b00), state: 'running', phase: 'downloading', completed, total: 100 });
  };
  return { services, listeners, unsubscribe, attempts, progress };
}

async function openModelTools(app: HTMLElement, workspace: Workspace) {
  await act(async () => { await workspace.navigate('assets'); });
  await act(async () => { fireEvent.click(within(app).getByRole('button', { name: 'Local background removal' })); });
}
async function prepareModel(app: HTMLElement) {
  await act(async () => { fireEvent.click(within(app).getByRole('button', { name: 'Prepare background removal model' })); });
}
const message = () => document.querySelector<HTMLElement>('.studio-toast:not([data-ending-style])');
const problemsTool = (app: HTMLElement) => app.querySelector<HTMLElement>('[data-tool-view="studio-problems"]')!;
const problemRow = (app: HTMLElement, code: string) => app.querySelector<HTMLElement>(`.gc-workbench-problems [data-problem-id][data-issue-code="${code}"]`);
async function dismissMessage(target: HTMLElement) {
  await act(async () => { fireEvent.keyDown(window, { key: 'F6' }); });
  await act(async () => { fireEvent.click(within(target).getByRole('button', { name: 'Dismiss notification' })); });
}

it('updates one floating Message during preparation, retains input and keeps a dismissed attempt closed', async () => {
  const fixture = modelServices();
  const { app, workspace } = await mount(fixture.services);
  await openModelTools(app, workspace);
  const add = vi.spyOn(studioToasts, 'add');
  const update = vi.spyOn(studioToasts, 'update');
  await prepareModel(app);
  const first = message()!;
  expect(first.dataset.messageType).toBe('info');
  expect(app.contains(first)).toBe(false);
  expect(app.querySelector('.authoring-notice')).toBeNull();
  const assetSearch = () => within(app.querySelector<HTMLElement>('[data-view="studio-assets"]')!).getByRole('textbox', { name: 'Search' });
  await act(async () => { fireEvent.change(assetSearch(), { target: { value: 'retained filter' } }); });
  const search = assetSearch(); search.focus();
  await act(async () => { fixture.progress(25); });
  expect(message()).toBe(first);
  expect(first.textContent).toContain('Downloading model 25%');
  expect(document.activeElement).toBe(search);
  expect(add).toHaveBeenCalledOnce();
  expect(update).toHaveBeenCalled();
  await dismissMessage(first);
  await act(async () => { fixture.progress(70); await workspace.showAssets(); });
  expect(message()).toBeNull();
  expect(app.querySelector('.asset-model-status')?.textContent).toContain('Downloading model 70%');
  expect((within(app.querySelector<HTMLElement>('[data-view="studio-assets"]')!).getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('retained filter');
  await act(async () => { fixture.attempts[0]!({ ok: true, value: { bytes: 1024, inputName: 'image', outputName: 'mask' }, warnings: [] }); });
  expect(message()).toBeNull();
  expect(app.querySelector('.asset-model-status')?.textContent).toContain('Model ready');
  expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  await prepareModel(app);
  expect(message()?.dataset.messageType).toBe('info');
  expect(add).toHaveBeenCalledTimes(2);
  await act(async () => { fixture.attempts[1]!({ ok: true, value: { bytes: 1024, inputName: 'image', outputName: 'mask' }, warnings: [] }); });
  expect(message()?.dataset.messageType).toBe('success');
});

it('retains model preparation failure after dismissing Message and clears it after a successful retry', async () => {
  const fixture = modelServices();
  const { app, workspace } = await mount(fixture.services);
  await openModelTools(app, workspace);
  await prepareModel(app);
  const issue: Issue = { code: 'FIXTURE_MODEL_FAILED', severity: 'error', owner: 'M04', message: 'Model preparation was interrupted.', related: [], actions: ['retry'] };
  await act(async () => { fixture.attempts[0]!(failure(issue)); });
  expect(message()?.dataset.messageType).toBe('error');
  expect(within(message()!).getByRole('button', { name: 'View problems' })).toBeTruthy();
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  expect(problemsTool(app).getAttribute('aria-pressed')).toBe('false');
  expect(app.querySelector('.gc-studio-workbench-notice')).toBeNull();
  await dismissMessage(message()!);
  await act(async () => { await workspace.showAssets(); });
  expect(message()).toBeNull();
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  await act(async () => { fireEvent.click(problemsTool(app)); });
  const row = problemRow(app, issue.code)!;
  await act(async () => { fireEvent.click(within(row).getByRole('button', { name: /^Diagnostic details:/ })); });
  expect(row.querySelector('.gc-problem-details')?.textContent).toContain(issue.message);
  await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'Open local background removal' })); });
  expect(app.querySelector('.asset-model-status')?.textContent).toContain('Could not prepare the model');
  await prepareModel(app);
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  await act(async () => { fixture.attempts[1]!({ ok: true, value: { bytes: 1024, inputName: 'image', outputName: 'mask' }, warnings: [] }); });
  expect(message()?.dataset.messageType).toBe('success');
  expect(app.querySelector('.asset-model-status')?.textContent).toContain('Model ready');
  expect(problemsTool(app).textContent).toContain('Problems · 0');
  expect(problemRow(app, issue.code)).toBeNull();
});

it('keeps the Result diagnostic, source recovery and writing after the Message is dismissed', async () => {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const issue: Issue = { code: 'FIXTURE_HISTORY_FAILED', severity: 'error', owner: 'M02', message: 'History is temporarily unavailable; writing is retained.',
    source: { documentId: fixtureId(0xe01), revision: 1, field: '/data/name' }, related: [], actions: ['locate'] };
  const undo = vi.spyOn(services.bridge.documents, 'planUndo').mockResolvedValue(failure(issue));
  const { app, workspace } = await mount(services);
  await act(async () => { fireEvent.click(within(app).getByRole('button', { name: 'Writing' })); });
  const writing = app.querySelector<HTMLTextAreaElement>('.authoring-writing-input')!;
  const text = `${writing.value} This author input must remain.`;
  await act(async () => { fireEvent.input(writing, { target: { value: text } }); fireEvent.change(writing); });
  writing.focus();
  expect(problemsTool(app).getAttribute('aria-pressed')).toBe('false');
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="undo"]')!); });
  expect(undo).toHaveBeenCalledOnce();
  const first = message()!;
  expect(first.dataset.messageType).toBe('error');
  expect(within(first).getByRole('button', { name: 'View problems' })).toBeTruthy();
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  expect(problemsTool(app).getAttribute('aria-pressed')).toBe('false');
  expect(document.activeElement).toBe(writing);
  expect(app.querySelector('.gc-studio-workbench-notice')).toBeNull();
  await dismissMessage(first);
  await act(async () => { await workspace.showAssets(); });
  expect(message()).toBeNull();
  expect(app.querySelector<HTMLTextAreaElement>('.authoring-writing-input')!.value).toBe(text);
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  await act(async () => { fireEvent.click(problemsTool(app)); });
  const search = within(app.querySelector<HTMLElement>('.gc-workbench-problems')!).getByRole('searchbox', { name: 'Search problems' });
  await act(async () => { fireEvent.change(search, { target: { value: issue.code } }); });
  const row = problemRow(app, issue.code)!;
  await act(async () => { fireEvent.click(within(row).getByRole('button', { name: /^Diagnostic details:/ })); });
  expect(row.querySelector('.gc-problem-details')?.textContent).toContain(issue.message);
  expect(row.dataset.selected).toBe('true');
  const list = app.querySelector<HTMLElement>('.gc-problems-list')!;
  await act(async () => { list.scrollTop = 72; fireEvent.scroll(list); });
  expect(app.querySelector('.authoring-problem-count')).toBeNull();
  expect(app.querySelector('.authoring-notice')).toBeNull();
  await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'Locate issue' })); });
  const project = app.querySelector<HTMLElement>('[data-view="project"]')!;
  expect(project.hidden).toBe(false);
  const back = within(app).getByRole('button', { name: 'Return to Problems' });
  expect(app.querySelector('.gc-studio-workbench-notice')).toBeNull();
  await act(async () => { fireEvent.click(back); });
  expect(app.querySelector<HTMLElement>('[data-view="studio-problems"]')!.hidden).toBe(false);
  expect(problemRow(app, issue.code)?.dataset.selected).toBe('true');
  expect((within(app.querySelector<HTMLElement>('.gc-workbench-problems')!).getByRole('searchbox', { name: 'Search problems' }) as HTMLInputElement).value).toBe(issue.code);
  expect(app.querySelector<HTMLElement>('.gc-problems-list')!.scrollTop).toBe(72);
  expect(app.querySelector<HTMLTextAreaElement>('.authoring-writing-input')!.value).toBe(text);
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="undo"]')!); });
  expect(message()?.dataset.messageType).toBe('error');
  expect(undo).toHaveBeenCalledTimes(2);
});

it('uses warning for a nonmodal Result and info for a no-change save', async () => {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const issue: Issue = { code: 'FIXTURE_HISTORY_BUSY', severity: 'warning', owner: 'M02', message: 'History is busy; try again.', related: [], actions: ['retry'] };
  vi.spyOn(services.bridge.documents, 'planUndo').mockResolvedValue(failure(issue));
  const { app } = await mount(services);
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="undo"]')!); });
  expect(message()?.dataset.messageType).toBe('warning');
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  expect(problemsTool(app).getAttribute('aria-pressed')).toBe('false');
  expect(app.querySelector('.gc-studio-workbench-notice')).toBeNull();
  await dismissMessage(message()!);
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!); });
  expect(message()?.dataset.messageType).toBe('info');
  expect(message()?.textContent).toContain('No changes to save in this document');
  expect(app.querySelector('.authoring-notice')).toBeNull();
});

it('clears a transient save-list failure when retry confirms the unchanged scene has no files to save', async () => {
  const { app, services } = await mount();
  const issue: Issue = { code: 'FIXTURE_SAVE_LIST_FAILED', severity: 'error', owner: 'M02', message: 'Could not list the save documents.', related: [], actions: ['retry'] };
  const list = vi.spyOn(services.bridge.documents, 'list').mockResolvedValueOnce(failure(issue));
  const planSave = vi.spyOn(services.bridge.documents, 'planSave');
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!); });
  expect(list).toHaveBeenCalledOnce();
  expect(planSave).not.toHaveBeenCalled();
  expect(message()?.dataset.messageType).toBe('error');
  expect(within(message()!).getByRole('button', { name: 'View problems' })).toBeTruthy();
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  await dismissMessage(message()!);
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!); });
  expect(planSave).toHaveBeenCalledOnce();
  expect(planSave.mock.lastCall?.[0]).toMatchObject({ kind: 'current', documentId: FixtureIds.streetDocument });
  expect(message()?.textContent).toContain('No changes to save in this document');
  expect(problemsTool(app).textContent).toContain('Problems · 0');
});

it('retains the exact asset save source when listing fails and clears a no-change retry', async () => {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const listed = await services.bridge.documents.list();
  if (!listed.ok) throw new Error('The fixture documents must be available.');
  const assetIndex = listed.value.find(document => 'assets/index.json' in document.files)!;
  const read = services.read;
  services.read = async documents => {
    const result = await read(documents);
    return result.ok ? { ...result, value: { ...result.value, assetIndexDocumentId: assetIndex.documentId, assetIndexRevision: assetIndex.revision } } : result;
  };
  const { app, workspace } = await mount(services);
  await act(async () => { await workspace.openDocument({ kind: 'asset', objectId: FixtureIds.background }); });
  const issue: Issue = { code: 'FIXTURE_ASSET_SAVE_LIST_FAILED', severity: 'error', owner: 'M02', message: 'Could not prepare this asset save.', related: [], actions: ['retry'] };
  const list = vi.spyOn(services.bridge.documents, 'list').mockResolvedValueOnce(failure(issue));
  const planSave = vi.spyOn(services.bridge.documents, 'planSave');
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!); });
  expect(list).toHaveBeenCalledOnce();
  expect(planSave).not.toHaveBeenCalled();
  expect(message()?.dataset.messageType).toBe('error');
  expect(within(message()!).getByRole('button', { name: 'View problems' })).toBeTruthy();
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  await act(async () => { await workspace.openDocument({ kind: 'scene', objectId: FixtureIds.street }); });
  await act(async () => { fireEvent.click(within(message()!).getByRole('button', { name: 'View problems' })); });
  const row = problemRow(app, issue.code)!;
  expect(row).toBeTruthy();
  await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'Open save source' })); });
  expect(app.querySelector<HTMLElement>(`[data-view="asset:${FixtureIds.background}"]`)!.hidden).toBe(false);
  expect(app.querySelector('[data-view="project"]:not([hidden])')).toBeNull();
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!); });
  expect(planSave).toHaveBeenCalledOnce();
  expect(planSave.mock.lastCall?.[0]).toMatchObject({ kind: 'objects' });
  expect(message()?.textContent).toContain('No changes to save for this asset');
  expect(problemsTool(app).textContent).toContain('Problems · 0');
});

it('opens the character document that owned the failed save', async () => {
  const { app, workspace, services } = await mount();
  await act(async () => { await workspace.openDocument({ kind: 'character', objectId: FixtureIds.an }); });
  const issue: Issue = { code: 'FIXTURE_CHARACTER_SAVE_FAILED', severity: 'error', owner: 'M02', message: 'Could not prepare this character save.', related: [], actions: ['retry'] };
  const planSave = vi.spyOn(services.bridge.documents, 'planSave').mockResolvedValueOnce(failure(issue));
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!); });
  expect(planSave).toHaveBeenCalledOnce();
  expect(planSave.mock.lastCall?.[0]).toMatchObject({ kind: 'current', documentId: FixtureIds.an });
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  await act(async () => { await workspace.openDocument({ kind: 'scene', objectId: FixtureIds.street }); });
  await act(async () => { fireEvent.click(within(message()!).getByRole('button', { name: 'View problems' })); });
  const row = problemRow(app, issue.code)!;
  expect(row).toBeTruthy();
  await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'Open save source' })); });
  expect(app.querySelector<HTMLElement>(`[data-view="character:${FixtureIds.an}"]`)!.hidden).toBe(false);
  expect(app.querySelector('[data-view="project"]:not([hidden])')).toBeNull();
});

it('keeps retained character input and its client record while applying M02 recovery', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const initial = await services.read();
  if (!initial.ok) throw new Error('The fixture source must be available.');
  const source = initial.value, text = '冷重开保留输入';
  const character = source.characters.find(item => item.id === FixtureIds.an)!;
  const original: AuthoringInputDraft = {
    schemaVersion: 1, projectId: source.project.projectId, entry: 'browser', updatedAt: '2026-11-17T01:00:00.000Z',
    content: { version: 1, projectId: source.project.projectId, unapplied: true, otherUnapplied: true,
      versions: [{ documentId: source.projectDocumentId, revision: 2 }], scripts: [], writing: [], forms: [],
      character: { drafts: { [character.id]: { ...character, description: text } }, selected: character.id, search: '' },
      documents: [{ id: `character:${character.id}`, kind: 'character', objectId: character.id, title: character.name }],
      active: `character:${character.id}`, page: 'editor', sceneId: source.scenes[0]!.sceneId, view: 'writing',
    } as Json,
  };
  let own: AuthoringInputDraft | null = null, revision = 1, recovered = false;
  services.bridge.authoringPreferences.readInputDraft = async () => ({ ok: true, value: structuredClone(own ?? original), warnings: [] });
  services.bridge.authoringPreferences.writeInputDraft = async draft => { own = structuredClone(draft); return { ok: true, value: undefined, warnings: [] }; };
  const read = services.read;
  services.read = async documents => {
    const result = await read(documents);
    return result.ok ? { ...result, value: { ...result.value, projectRevision: revision } } : result;
  };
  services.bridge.documents.listRecovery = async () => ({ ok: true, value: recovered ? null : { documents: [] }, warnings: [] });
  const recover = vi.fn(async () => { recovered = true; revision = 3; return { ok: true as const, value: [], warnings: [] }; });
  services.bridge.documents.recover = recover;
  // A real host can take longer than the M01 debounce while releasing previews.
  // The reconstructed workspace must not persist cleared state during that wait.
  services.stopAssetPreview = async () => { await new Promise(resolve => setTimeout(resolve, 220)); return { ok: true, value: undefined, warnings: [] }; };
  const { app, workspace } = await mount(services);
  await waitFor(() => expect(within(document.body).getByRole('button', { name: 'Apply recovery choice' })).toBeTruthy());
  await act(async () => { await workspace.flushInputDrafts(); });
  expect(JSON.stringify(own)).toContain(text);
  await act(async () => { fireEvent.click(within(document.body).getByRole('button', { name: 'Apply recovery choice' })); });
  await waitFor(() => expect(recover).toHaveBeenCalledOnce());
  await waitFor(() => expect(within(document.body).queryByRole('button', { name: 'Apply recovery choice' })).toBeNull());
  await act(async () => { await workspace.flushInputDrafts(); });
  expect(JSON.stringify(own)).toContain(text);
  const restored = app.querySelector<HTMLElement>(`[data-view="character:${character.id}"]`)!;
  expect((within(restored).getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement).value).toBe(text);
  // The restored input is editable on its original character and remains unapplied.
  const current = await services.read();
  if (!current.ok) throw new Error('The recovered fixture source must be available.');
  expect(current.value.characters.find(item => item.id === character.id)?.description).not.toBe(text);
});

it('keeps Undo and Redo failures isolated and clears only the successful history source', async () => {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const undoIssue: Issue = { code: 'FIXTURE_UNDO_BUSY', severity: 'warning', owner: 'M02', message: 'Undo is busy.', related: [], actions: ['retry'] };
  const redoIssue: Issue = { code: 'FIXTURE_REDO_FAILED', severity: 'error', owner: 'M02', message: 'Redo failed.', related: [], actions: ['retry'] };
  const successfulUndo = services.bridge.documents.planUndo;
  const undo = vi.spyOn(services.bridge.documents, 'planUndo').mockResolvedValueOnce(failure(undoIssue)).mockImplementation(successfulUndo);
  vi.spyOn(services.bridge.documents, 'planRedo').mockResolvedValue(failure(redoIssue));
  const { app, workspace } = await mount(services);
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="undo"]')!); });
  await dismissMessage(message()!);
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="redo"]')!); });
  expect(message()?.dataset.messageType).toBe('error');
  expect(problemsTool(app).textContent).toContain('Problems · 2');
  expect(problemsTool(app).getAttribute('aria-pressed')).toBe('false');
  await act(async () => { fireEvent.click(within(message()!).getByRole('button', { name: 'View problems' })); });
  expect(app.querySelector<HTMLElement>('[data-view="studio-problems"]')!.hidden).toBe(false);
  expect(problemRow(app, undoIssue.code)?.textContent).toContain(undoIssue.message);
  const redoRow = problemRow(app, redoIssue.code)!;
  await act(async () => { fireEvent.click(within(redoRow).getByRole('button', { name: /^Diagnostic details:/ })); });
  expect(redoRow.querySelector('.gc-problem-details')?.textContent).toContain(redoIssue.message);
  await act(async () => { await workspace.showAssets(); });
  expect(problemsTool(app).textContent).toContain('Problems · 2');
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="undo"]')!); });
  expect(undo).toHaveBeenCalledTimes(2);
  expect(problemsTool(app).textContent).toContain('Problems · 1');
  expect(problemRow(app, undoIssue.code)).toBeNull();
  expect(problemRow(app, redoIssue.code)?.dataset.severity).toBe('error');
});

it('releases preparation when the author opens another project and ignores its late result', async () => {
  const fixture = modelServices();
  const read = fixture.services.read;
  let switched = false;
  fixture.services.read = async documents => {
    const result = await read(documents);
    return result.ok && switched ? { ...result, value: { ...result.value, project: { ...result.value.project, projectId: FixtureIds.projectB } } } : result;
  };
  fixture.services.chooseDirectory = async () => ({ ok: true, value: 'D:\\GalCraft\\FixtureNext', warnings: [] });
  const switchProject = vi.spyOn(fixture.services.bridge.projects, 'switch').mockImplementation(async () => {
    switched = true;
    return { ok: true, value: { projectId: FixtureIds.projectB, sessionId: fixtureId(0x1b01) }, warnings: [] };
  });
  const { app, workspace } = await mount(fixture.services);
  await openModelTools(app, workspace);
  await prepareModel(app);
  const original = message()!.dataset.messageId!;
  await act(async () => { await workspace.navigate('projects'); });
  await act(async () => { fireEvent.click(within(app).getByRole('button', { name: 'Open project folder' })); });
  expect(switchProject).toHaveBeenCalledOnce();
  expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  expect(fixture.listeners.size).toBe(0);
  const add = vi.spyOn(studioToasts, 'add');
  await act(async () => {
    fixture.progress(90);
    fixture.attempts[0]!({ ok: true, value: { bytes: 1024, inputName: 'image', outputName: 'mask' }, warnings: [] });
  });
  expect(add).not.toHaveBeenCalled();
  expect(document.querySelector(`[data-message-id="${original}"]:not([data-ending-style])`)).toBeNull();
  expect(app.querySelector('.asset-model-status')?.textContent ?? '').not.toContain('Model ready');
});

it('releases preparation progress on disposal and closes only its own reminder', async () => {
  const fixture = modelServices();
  const { app, workspace } = await mount(fixture.services);
  await openModelTools(app, workspace);
  await prepareModel(app);
  const add = vi.spyOn(studioToasts, 'add');
  const close = vi.spyOn(studioToasts, 'close');
  await act(async () => { studioToasts.add({ id: 'another-owner', title: 'Other work is kept', type: 'info', timeout: 0 }); });
  await act(async () => { workspace.dispose(); });
  expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  expect(fixture.listeners.size).toBe(0);
  expect(close).toHaveBeenCalledWith(expect.stringMatching(/^authoring-message:/));
  expect(close).not.toHaveBeenCalledWith('another-owner');
  await act(async () => {
    fixture.progress(90);
    fixture.attempts[0]!({ ok: true, value: { bytes: 1024, inputName: 'image', outputName: 'mask' }, warnings: [] });
  });
  expect(add).toHaveBeenCalledOnce();
});
