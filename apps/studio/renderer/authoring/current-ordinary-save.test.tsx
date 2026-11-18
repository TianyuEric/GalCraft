// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createId, type Id, type SavePlan, type SaveScope } from '@galcraft/contracts';
import { studioFixture } from '../stories/studio-fixture.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({ languages: { getLanguages: () => [{ id: 'galcraft' }], register: vi.fn(), setMonarchTokensProvider: vi.fn() } }));
const { cancelReview } = vi.hoisted(() => ({ cancelReview: vi.fn() }));
vi.mock('../components/save-review.js', async importOriginal => ({ ...await importOriginal<typeof import('../components/save-review.js')>(), requestSaveReview: cancelReview }));
type Services = Parameters<typeof mountAuthoring>[1];
type Workspace = Awaited<ReturnType<typeof mountAuthoring>>;
const workspaces: Workspace[] = [];

beforeEach(() => {
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: new DOMRect(0, 0, 1440, 900) } as ResizeObserverEntry], this); }
    unobserve() {} disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^\w-]/g, character => '\\' + character) });
  cancelReview.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => { for (const workspace of workspaces.splice(0)) workspace.dispose(); });
  cleanup(); document.getElementById('studio-portals')?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

async function fixture() {
  const services: Services = studioFixture('normal', 'en', 'light').services, read = services.read;
  services.read = async provided => {
    const result = await read(provided), listed = provided ? { ok: true as const, value: provided } : await services.bridge.documents.list();
    if (!result.ok || !listed.ok) return result;
    return { ...result, value: { ...result.value,
      characterDocuments: Object.fromEntries(listed.value.flatMap(document => Object.entries(document.files)
        .filter(([path]) => path.startsWith('characters/') && path.endsWith('.json'))
        .map(([, raw]) => [JSON.parse(raw).data.id as Id, { documentId: document.documentId, dirty: document.dirty }]))),
      documentVersions: listed.value.map(document => ({ documentId: document.documentId, revision: document.revision })),
    } };
  };
  const initial = await services.read(); if (!initial.ok) throw new Error('Fixture source is unavailable.');
  const planSave = vi.spyOn(services.bridge.documents, 'planSave').mockImplementation(async (scope: SaveScope) => {
    const listed = await services.bridge.documents.list(); if (!listed.ok) return listed;
    const documents = listed.value.filter(document => document.dirty && (scope.kind === 'all'
      || scope.kind === 'current' && document.documentId === scope.documentId
      || scope.kind === 'objects' && scope.objects.some(object => object.documentId === document.documentId)));
    const objects = documents.map(document => ({ kind: 'document' as const, documentId: document.documentId, objectId: null,
      key: `${document.documentId}:document`, revision: document.revision, name: document.documentId, paths: Object.keys(document.files) }));
    const plan: SavePlan = { planId: createId(), members: documents.map(document => document.documentId),
      versions: documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
      files: documents.flatMap(document => Object.keys(document.files).map(path => ({ path, documentId: document.documentId, oldExists: true, newExists: true }))),
      objects, requestedObjects: objects.map(object => object.key), extraDirtyMembers: [], reasons: [], preview: documents };
    return { ok: true, value: plan, warnings: [] };
  });
  const realApplyEdit = services.bridge.documents.applyEdit.bind(services.bridge.documents);
  const planEdit = vi.spyOn(services.bridge.documents, 'planEdit'), applyEdit = vi.spyOn(services.bridge.documents, 'applyEdit'), diskSave = vi.spyOn(services.bridge.documents, 'save');
  const { container } = render(<div id="app" data-locale="en" data-theme="light" />), app = container.firstElementChild as HTMLElement;
  let workspace!: Workspace; await act(async () => { workspace = await mountAuthoring(app, services); }); workspaces.push(workspace);
  return { services, initial: initial.value, planSave, planEdit, applyEdit, realApplyEdit, diskSave, app, workspace };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function openProject(f: Fixture) { await act(async () => { await f.workspace.openDocument({ kind: 'project', title: 'Project options' }); }); }
async function openStartup(f: Fixture) { await act(async () => { await f.workspace.openDocument({ kind: 'startup', title: 'Startup options' }); }); }
function language(f: Fixture) { return within(f.app).getByRole<HTMLInputElement>('textbox', { name: /Source text language/ }); }
async function edit(input: HTMLElement, value: string, native = false) { await act(async () => { fireEvent[native ? 'input' : 'change'](input, { target: { value } }); }); }
async function saveCurrent(input: HTMLElement) { input.focus(); await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }); }); }
async function source(f: Fixture) { const result = await f.services.read(); if (!result.ok) throw new Error('Fixture source is unavailable.'); return result.value; }
async function expectProjectReview(f: Fixture) {
  await waitFor(() => expect(cancelReview).toHaveBeenCalled());
  expect(f.planSave).toHaveBeenCalledWith({ kind: 'current', documentId: f.initial.projectDocumentId });
  expect(f.diskSave).not.toHaveBeenCalled();
  const listed = await f.services.bridge.documents.list(); if (!listed.ok) throw new Error('Fixture documents are unavailable.');
  const project = listed.value.find(document => document.documentId === f.initial.projectDocumentId)!;
  expect(project.dirty).toBe(true); expect(JSON.parse(project.savedFiles['project.json']!).data).toEqual(f.initial.project);
}

it('applies language and protagonist input before Ctrl+S plans the current project and cancelling leaves both dirty', async () => {
  const f = await fixture(); await openProject(f);
  await edit(language(f), 'ja');
  await act(async () => { fireEvent.change(within(f.app).getByRole('combobox', { name: 'Name mode' }), { target: { value: 'fixed' } }); });
  const name = within(f.app).getByRole<HTMLInputElement>('textbox', { name: 'Default name' }); await edit(name, 'Haruki', true);
  await saveCurrent(name); await expectProjectReview(f);
  expect(f.applyEdit).toHaveBeenCalledTimes(2);
  expect(f.applyEdit.mock.invocationCallOrder.at(-1)!).toBeLessThan(f.planSave.mock.invocationCallOrder[0]!);
  expect(f.planEdit.mock.calls.flatMap(([input]) => input.patches.map(patch => patch.documentId))).toEqual([f.initial.projectDocumentId, f.initial.projectDocumentId]);
  const current = await source(f); expect(current.project.languages.textDefault).toBe('ja'); expect(current.project.player.name?.defaultName).toBe('Haruki');
});

it.each(['language', 'protagonist'] as const)('retains invalid %s input and stops before edit or save planning', async field => {
  const f = await fixture(); await openProject(f);
  let input: HTMLInputElement;
  if (field === 'language') input = language(f);
  else {
    await act(async () => { fireEvent.change(within(f.app).getByRole('combobox', { name: 'Name mode' }), { target: { value: 'fixed' } }); });
    input = within(f.app).getByRole<HTMLInputElement>('textbox', { name: 'Default name' });
  }
  await edit(input, '', field === 'protagonist'); await saveCurrent(input);
  expect(f.planEdit).not.toHaveBeenCalled(); expect(f.planSave).not.toHaveBeenCalled(); expect(cancelReview).not.toHaveBeenCalled(); expect(input.value).toBe('');
});

it('confirms a focused startup number and waits for its original edit queue before current-project review', async () => {
  const f = await fixture(); await openStartup(f);
  const hold = within(f.app).getByRole<HTMLInputElement>('spinbutton', { name: 'Hold duration · ms' }); await edit(hold, '4200');
  let release!: () => void;
  f.applyEdit.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return f.realApplyEdit(...args); });
  hold.focus(); await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }); });
  await waitFor(() => expect(f.applyEdit).toHaveBeenCalledTimes(1)); expect(f.planSave).not.toHaveBeenCalled();
  await act(async () => { release(); }); await expectProjectReview(f);
  expect((await source(f)).project.display.splashPlayback?.durationMs).toBe(4200);
});

it.each([false, true])('validates the focused startup input before planning (native sequence: %s)', async sequence => {
  const f = await fixture(); await openStartup(f);
  if (sequence) await act(async () => { fireEvent.click(within(f.app).getByRole('button', { name: 'Create native startup sequence' })); });
  f.planEdit.mockClear(); f.applyEdit.mockClear();
  const label = sequence ? 'Clip hold · ms' : 'Hold duration · ms';
  let input = within(f.app).getByRole<HTMLInputElement>('spinbutton', { name: label });
  await edit(input, ''); await saveCurrent(input);
  expect(f.planSave).not.toHaveBeenCalled(); expect(f.planEdit).not.toHaveBeenCalled(); expect(cancelReview).not.toHaveBeenCalled();
  input = within(f.app).getByRole<HTMLInputElement>('spinbutton', { name: label }); expect(input.value).toBe('');
  await edit(input, '3200'); await saveCurrent(input); await expectProjectReview(f);
  const current = await source(f);
  expect(sequence ? current.project.display.startupSequence?.clips[0]?.holdMs : current.project.display.splashPlayback?.durationMs).toBe(3200);
});

it('keeps character, startup and release input outside the current project input application', async () => {
  const f = await fixture(), a = f.initial.characters[0]!;
  await act(async () => { await f.workspace.openDocument({ kind: 'character', objectId: a.id }); });
  await edit(within(f.app).getByRole('textbox', { name: 'Description and story notes' }), 'A remains local');
  await openStartup(f); await edit(within(f.app).getByRole('spinbutton', { name: 'Hold duration · ms' }), '');
  await act(async () => { await f.workspace.navigate('publish'); }); await edit(within(f.app).getByRole('textbox', { name: 'Release version' }), '9.8.7');
  await openProject(f); await edit(language(f), 'ja'); await saveCurrent(language(f)); await expectProjectReview(f);
  expect(f.planEdit.mock.calls.flatMap(([input]) => input.patches.map(patch => patch.documentId))).toEqual([f.initial.projectDocumentId]);
  const current = await source(f); expect(current.characters.find(item => item.id === a.id)?.description).toBe(a.description);
  expect(current.project.display).toEqual(f.initial.project.display); expect(current.project.releaseVersion).toBe(f.initial.project.releaseVersion);
  await openStartup(f); expect(within(f.app).getByRole<HTMLInputElement>('spinbutton', { name: 'Hold duration · ms' }).value).toBe('');
  await act(async () => { await f.workspace.navigate('publish'); }); expect(within(f.app).getByRole<HTMLInputElement>('textbox', { name: 'Release version' }).value).toBe('9.8.7');
  await act(async () => { await f.workspace.openDocument({ kind: 'character', objectId: a.id }); });
  expect(within(f.app).getByRole<HTMLTextAreaElement>('textbox', { name: 'Description and story notes' }).value).toBe('A remains local');
});

it('uses the explicitly closed project target while a different character remains active and unapplied', async () => {
  const f = await fixture(), b = f.initial.characters[1]!;
  await openProject(f); await edit(language(f), 'ja');
  await act(async () => { await f.workspace.openDocument({ kind: 'character', objectId: b.id }); });
  await edit(within(f.app).getByRole('textbox', { name: 'Description and story notes' }), 'B remains active');
  await act(async () => { fireEvent.click(within(f.app).getByRole('button', { name: 'Close Project settings' })); });
  await act(async () => { fireEvent.click(within(document.body).getByRole('button', { name: '保存并关闭' })); });
  await expectProjectReview(f);
  expect(f.planEdit.mock.calls.flatMap(([input]) => input.patches.map(patch => patch.documentId))).toEqual([f.initial.projectDocumentId]);
  expect((await source(f)).characters.find(item => item.id === b.id)?.description).toBe(b.description);
  await act(async () => { await f.workspace.openDocument({ kind: 'character', objectId: b.id }); });
  expect(within(f.app).getByRole<HTMLTextAreaElement>('textbox', { name: 'Description and story notes' }).value).toBe('B remains active');
});
