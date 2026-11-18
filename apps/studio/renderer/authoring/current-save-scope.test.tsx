// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createId, type Id, type SavePlan, type SaveScope } from '@galcraft/contracts';
import { studioFixture } from '../stories/studio-fixture.js';
import type { WorkbenchBridge } from '../pages/Production/bridge.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({ languages: { getLanguages: () => [{ id: 'galcraft' }], register: vi.fn(), setMonarchTokensProvider: vi.fn() } }));
const { cancelReview } = vi.hoisted(() => ({ cancelReview: vi.fn() }));
vi.mock('../components/save-review.js', async importOriginal => ({
  ...await importOriginal<typeof import('../components/save-review.js')>(),
  requestSaveReview: cancelReview,
}));

type Services = Parameters<typeof mountAuthoring>[1];
type Workspace = Awaited<ReturnType<typeof mountAuthoring>>;
const workspaces: Workspace[] = [];

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
  cancelReview.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => { for (const workspace of workspaces.splice(0)) workspace.dispose(); });
  cleanup(); document.getElementById('studio-portals')?.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

async function fixture() {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const read = services.read;
  // Add the real bridge's ownership metadata without changing the shared fixture.
  services.read = async provided => {
    const result = await read(provided);
    const listed = provided ? { ok: true as const, value: provided } : await services.bridge.documents.list();
    if (!result.ok || !listed.ok) return result;
    return { ...result, value: { ...result.value,
      characterDocuments: Object.fromEntries(listed.value.flatMap(document => Object.entries(document.files)
        .filter(([path]) => path.startsWith('characters/') && path.endsWith('.json'))
        .map(([, raw]) => [JSON.parse(raw).data.id as Id, { documentId: document.documentId, dirty: document.dirty }]))),
      documentVersions: listed.value.map(document => ({ documentId: document.documentId, revision: document.revision })),
    } };
  };
  const source = await services.read();
  if (!source.ok || source.value.characters.length < 2) throw new Error('Two fixture characters are required.');
  const [a, b] = source.value.characters;
  const planSave = vi.spyOn(services.bridge.documents, 'planSave').mockImplementation(async (scope: SaveScope) => {
    const listed = await services.bridge.documents.list();
    if (!listed.ok) return listed;
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
  const applyEdit = vi.spyOn(services.bridge.documents, 'applyEdit');
  const planEdit = vi.spyOn(services.bridge.documents, 'planEdit');
  const diskSave = vi.spyOn(services.bridge.documents, 'save');
  return { services, a: a!, b: b!, planSave, applyEdit, planEdit, diskSave };
}

async function mount(services: Services) {
  const { container } = render(<div id="app" data-locale="en" data-theme="light" />);
  const app = container.firstElementChild as HTMLElement;
  let workspace!: Workspace;
  await act(async () => { workspace = await mountAuthoring(app, services); });
  workspaces.push(workspace);
  return { app, workspace };
}
function pane(app: HTMLElement, id: Id) { return app.querySelector<HTMLElement>(`[data-view="character:${id}"]`)!; }
function notes(app: HTMLElement, id: Id) { return within(pane(app, id)).getByRole<HTMLTextAreaElement>('textbox', { name: 'Description and story notes' }); }
async function openCharacter(workspace: Workspace, id: Id) {
  await act(async () => { await workspace.openDocument({ kind: 'character', objectId: id }); });
}
async function editNotes(app: HTMLElement, id: Id, value: string) {
  await act(async () => { fireEvent.change(notes(app, id), { target: { value } }); });
}
async function saveCurrent(app: HTMLElement, id: Id, entry: 'window' | 'root' | 'topbar') {
  notes(app, id).focus();
  await act(async () => {
    if (entry === 'topbar') fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!);
    else fireEvent.keyDown(entry === 'window' ? window : app, { key: 's', ctrlKey: true });
  });
}
async function characterDocument(services: Services, id: Id) {
  const listed = await services.bridge.documents.list();
  if (!listed.ok) throw new Error('Fixture documents are unavailable.');
  const document = listed.value.find(document => `characters/${id}.json` in document.files)!;
  return { document, character: JSON.parse(document.files[`characters/${id}.json`]!).data };
}

it.each(['window', 'root', 'topbar'] as const)('saves only B through %s while A keeps its unapplied notes', async entry => {
  const f = await fixture(), { app, workspace } = await mount(f.services);
  await openCharacter(workspace, f.a.id); await editNotes(app, f.a.id, 'A remains a local draft');
  await openCharacter(workspace, f.b.id); await editNotes(app, f.b.id, 'B enters the save review');
  await saveCurrent(app, f.b.id, entry);
  await waitFor(() => expect(f.planSave).toHaveBeenCalledWith({ kind: 'current', documentId: f.b.id }));
  expect(f.applyEdit).toHaveBeenCalledTimes(1);
  expect(f.planEdit.mock.calls.flatMap(([input]) => input.patches.map(patch => patch.documentId))).toEqual([f.b.id]);
  expect((await characterDocument(f.services, f.a.id)).character.description).toBe(f.a.description);
  expect((await characterDocument(f.services, f.b.id)).character.description).toBe('B enters the save review');
  expect(f.diskSave).not.toHaveBeenCalled();
  await openCharacter(workspace, f.a.id);
  expect(notes(app, f.a.id).value).toBe('A remains a local draft');
});

it('keeps invalid B input and does not apply or plan a save from either save entry', async () => {
  const f = await fixture(), { app, workspace } = await mount(f.services);
  await openCharacter(workspace, f.b.id);
  await act(async () => { fireEvent.change(within(pane(app, f.b.id)).getByRole('textbox', { name: 'Character name' }), { target: { value: '' } }); });
  await saveCurrent(app, f.b.id, 'window'); await saveCurrent(app, f.b.id, 'topbar');
  expect(f.planEdit).not.toHaveBeenCalled(); expect(f.planSave).not.toHaveBeenCalled();
  expect(within(pane(app, f.b.id)).getByRole<HTMLInputElement>('textbox', { name: 'Character name' }).value).toBe('');
  expect(pane(app, f.b.id).textContent).toContain('Enter a character name.');
});

it('keeps the applied edit dirty and undoable when the author cancels the save review', async () => {
  const f = await fixture(), { app, workspace } = await mount(f.services);
  await openCharacter(workspace, f.b.id); await editNotes(app, f.b.id, 'Applied before cancelling review');
  await saveCurrent(app, f.b.id, 'topbar');
  expect(cancelReview).toHaveBeenCalledOnce(); expect(f.diskSave).not.toHaveBeenCalled();
  expect((await characterDocument(f.services, f.b.id)).document.dirty).toBe(true);
  expect(notes(app, f.b.id).value).toBe('Applied before cancelling review');
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="undo"]')!); });
  expect((await characterDocument(f.services, f.b.id)).character.description).toBe(f.b.description);
  expect(notes(app, f.b.id).value).toBe(f.b.description);
});

it('applies only the chosen character through the secondary workspace action without planning disk saving', async () => {
  const f = await fixture(), { app, workspace } = await mount(f.services);
  await openCharacter(workspace, f.a.id); await editNotes(app, f.a.id, 'A is not included');
  await openCharacter(workspace, f.b.id); await editNotes(app, f.b.id, 'B workspace edit');
  await act(async () => { fireEvent.click(within(pane(app, f.b.id)).getByRole('button', { name: 'Apply to workspace only' })); });
  expect(f.applyEdit).toHaveBeenCalledOnce(); expect(f.planSave).not.toHaveBeenCalled(); expect(cancelReview).not.toHaveBeenCalled();
  expect((await characterDocument(f.services, f.a.id)).character.description).toBe(f.a.description);
  expect((await characterDocument(f.services, f.b.id)).document.dirty).toBe(true);
});

it('does not apply a character while its IME composition is active, including a menu save', async () => {
  const f = await fixture(), { app, workspace } = await mount(f.services);
  await openCharacter(workspace, f.b.id); await editNotes(app, f.b.id, '中文组合输入');
  await act(async () => { fireEvent.compositionStart(notes(app, f.b.id)); });
  await act(async () => { fireEvent.click(within(app).getByRole('menuitem', { name: 'File' })); });
  const saveMenu = await within(document.body).findByRole('menuitem', { name: /^Save document/ });
  await act(async () => { fireEvent.click(saveMenu); });
  expect(f.planEdit).not.toHaveBeenCalled(); expect(f.planSave).not.toHaveBeenCalled();
  expect(notes(app, f.b.id).value).toBe('中文组合输入');
  await act(async () => { fireEvent.compositionEnd(notes(app, f.b.id)); });
  await saveCurrent(app, f.b.id, 'topbar');
  expect(f.planSave).toHaveBeenCalledWith({ kind: 'current', documentId: f.b.id });
});

it('uses the explicitly closed B document rather than active A for save and close', { timeout: 15000 }, async () => {
  const f = await fixture(), { app, workspace } = await mount(f.services);
  await openCharacter(workspace, f.b.id); await editNotes(app, f.b.id, 'B close-save target');
  await openCharacter(workspace, f.a.id); await editNotes(app, f.a.id, 'A stays active and pending');
  await act(async () => { fireEvent.click(within(app).getByRole('button', { name: `Close ${f.b.name}` })); });
  await act(async () => { fireEvent.click(within(document.body).getByRole('button', { name: '保存并关闭' })); });
  await waitFor(() => expect(f.planSave).toHaveBeenCalledWith({ kind: 'current', documentId: f.b.id }));
  expect(f.planEdit.mock.calls.flatMap(([input]) => input.patches.map(patch => patch.documentId))).toEqual([f.b.id]);
  expect((await characterDocument(f.services, f.a.id)).character.description).toBe(f.a.description);
  await openCharacter(workspace, f.a.id);
  expect(notes(app, f.a.id).value).toBe('A stays active and pending');
  expect(f.diskSave).not.toHaveBeenCalled();
});

it('keeps unrelated release settings pending while saving the current character', async () => {
  const f = await fixture(), { app, workspace } = await mount(f.services);
  const initial = await f.services.read();
  if (!initial.ok) throw new Error('Fixture source is unavailable.');
  await act(async () => { await workspace.navigate('publish'); });
  const version = await within(app).findByRole<HTMLInputElement>('textbox', { name: 'Release version' });
  await act(async () => { fireEvent.change(version, { target: { value: '9.8.7' } }); });
  await openCharacter(workspace, f.b.id); await editNotes(app, f.b.id, 'Character save beside release input');
  await saveCurrent(app, f.b.id, 'window');
  expect(f.planSave).toHaveBeenCalledWith({ kind: 'current', documentId: f.b.id });
  expect(f.planEdit.mock.calls.flatMap(([input]) => input.patches.map(patch => patch.documentId))).toEqual([f.b.id]);
  const current = await f.services.read();
  expect(current.ok && current.value.project.releaseVersion).toBe(initial.value.project.releaseVersion);
  await act(async () => { await workspace.navigate('publish'); });
  expect(within(app).getByRole<HTMLInputElement>('textbox', { name: 'Release version' }).value).toBe('9.8.7');
  expect(f.diskSave).not.toHaveBeenCalled();
});

it('does not send an unrelated production draft when saving the current character', async () => {
  const f = await fixture(), { app, workspace } = await mount(f.services);
  const production = (f.services.bridge as unknown as WorkbenchBridge).production;
  const submit = vi.spyOn(production, 'submit'), plan = vi.spyOn(production, 'plan'), adopt = vi.spyOn(production, 'apply');
  await act(async () => { await workspace.navigate('production'); });
  await act(async () => { fireEvent.click(within(app).getByRole('button', { name: 'Open production records' })); });
  await waitFor(() => expect(app.querySelector('[data-draft-id]')).toBeTruthy());
  await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('[data-draft-id]')!); });
  const request = await within(document.body).findByRole<HTMLTextAreaElement>('textbox', { name: /^(Your request|This round’s request)$/ });
  await act(async () => { fireEvent.change(request, { target: { value: 'Unsent production request remains local' } }); });
  await openCharacter(workspace, f.b.id); await editNotes(app, f.b.id, 'Character save beside production input');
  await saveCurrent(app, f.b.id, 'root');
  expect(f.planSave).toHaveBeenCalledWith({ kind: 'current', documentId: f.b.id });
  expect(f.planEdit.mock.calls.flatMap(([input]) => input.patches.map(patch => patch.documentId))).toEqual([f.b.id]);
  expect(submit).not.toHaveBeenCalled(); expect(plan).not.toHaveBeenCalled(); expect(adopt).not.toHaveBeenCalled();
  const overview = await production.overview();
  expect(overview.ok && overview.value.drafts.some(draft => !draft.submittedTaskId
    && draft.variants.script?.fields.instruction === 'Unsent production request remains local')).toBe(true);
});
