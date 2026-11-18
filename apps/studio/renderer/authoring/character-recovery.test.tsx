// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createId, type AuthoringInputDraft, type Character, type EditInput, type Id, type Json, type SavePlan, type SaveScope, type StudioBridge } from '@galcraft/contracts';
import { fixtureId } from '@galcraft/contracts/fixtures';
import { studioFixture } from '../stories/studio-fixture.js';
import { characterDraft, characterEdit } from './characters/model.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({ languages: { getLanguages: () => [{ id: 'galcraft' }], register: vi.fn(), setMonarchTokensProvider: vi.fn() } }));
const { reviewSave } = vi.hoisted(() => ({ reviewSave: vi.fn() }));
vi.mock('../components/save-review.js', async importOriginal => ({
  ...await importOriginal<typeof import('../components/save-review.js')>(), requestSaveReview: reviewSave,
}));

type Services = Parameters<typeof mountAuthoring>[1];
type Workspace = Awaited<ReturnType<typeof mountAuthoring>>;
type Mounted = { app: HTMLElement; workspace: Workspace; unmount(): void };
type RecoveryContent = { character?: { drafts?: Record<string, unknown>; bases?: Record<string, unknown> }; retained?: Json; scripts?: [string, string][] };
const mounted: Mounted[] = [];
const ok = <T,>(value: T) => ({ ok: true as const, value, warnings: [] });

beforeEach(() => {
  configure({ getElementError: message => new Error((message ?? 'Ambiguous element query').split('\n\n')[0]) });
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: new DOMRect(0, 0, 1440, 900) } as ResizeObserverEntry], this); }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^\w-]/g, character => '\\' + character) });
  reviewSave.mockReset().mockImplementation(async (options: Parameters<typeof import('../components/save-review.js').requestSaveReview>[0]) => { await options.save(options.initialPlan); });
});
afterEach(async () => {
  await act(async () => { for (const item of mounted.splice(0)) item.workspace.dispose(); });
  cleanup(); document.getElementById('studio-portals')?.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

async function fixture() {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const read = services.read;
  services.read = async provided => {
    const result = await read(provided), listed = provided ? ok(provided) : await services.bridge.documents.list();
    if (!result.ok || !listed.ok) return result;
    return ok({ ...result.value, documentVersions: listed.value.map(document => ({ documentId: document.documentId, revision: document.revision })),
      characterDocuments: Object.fromEntries(listed.value.flatMap(document => Object.entries(document.files)
        .filter(([path]) => path.startsWith('characters/') && path.endsWith('.json'))
        .map(([, raw]) => [JSON.parse(raw).data.id as Id, { documentId: document.documentId, dirty: document.dirty }]))),
    });
  };
  let input: AuthoringInputDraft | null = null;
  const preferences: StudioBridge['authoringPreferences'] = services.bridge.authoringPreferences;
  preferences.readInputDraft = async () => ok(input ? structuredClone(input) : null);
  preferences.writeInputDraft = async record => { input = structuredClone(record); return ok(undefined); };
  const planSave = vi.spyOn(services.bridge.documents, 'planSave').mockImplementation(async (scope: SaveScope) => {
    const listed = await services.bridge.documents.list(); if (!listed.ok) return listed;
    const documents = listed.value.filter(document => document.dirty && (scope.kind === 'all'
      || scope.kind === 'current' && document.documentId === scope.documentId
      || scope.kind === 'objects' && scope.objects.some(object => object.documentId === document.documentId)));
    const objects = documents.map(document => ({ kind: 'document' as const, documentId: document.documentId, objectId: null,
      key: `document:${document.documentId}`, revision: document.revision, name: document.documentId, paths: Object.keys(document.files) }));
    const plan: SavePlan = { planId: createId(), members: documents.map(document => document.documentId),
      versions: documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
      files: documents.flatMap(document => Object.keys(document.files).map(path => ({ path, documentId: document.documentId, oldExists: path in document.savedFiles, newExists: true }))),
      objects, requestedObjects: objects.map(object => object.key), extraDirtyMembers: [], reasons: [], preview: documents };
    return ok(plan);
  });
  const applyEdit = vi.spyOn(services.bridge.documents, 'applyEdit'), diskSave = vi.spyOn(services.bridge.documents, 'save');
  const source = await services.read(); if (!source.ok || source.value.characters.length < 2) throw new Error('Two fixture characters are required.');
  async function seed(overrides: Record<string, unknown>) {
    const current = await services.read(); if (!current.ok) throw new Error('Fixture source is unavailable.');
    const content = { version: 1, projectId: current.value.project.projectId, unapplied: true, otherUnapplied: true,
      versions: current.value.documentVersions, scripts: [], writing: [], forms: [], designer: null, publish: null, resourceProcessor: null,
      startup: null, language: null, playerName: null, production: null, character: null,
      projectCreate: { name: '', template: 'standard', width: 1920, height: 1080, engineVersion: '' },
      documents: [], active: 'empty', page: 'editor', sceneId: current.value.scenes[0]?.sceneId ?? null, view: 'writing', retained: null, ...overrides };
    input = { schemaVersion: 1, projectId: current.value.project.projectId, entry: 'browser', updatedAt: '2026-11-17T00:00:00Z', content: content as unknown as Json };
  }
  return { services, a: source.value.characters[0]!, b: source.value.characters[1]!, source: source.value, applyEdit, diskSave, planSave, seed,
    stored: () => input ? structuredClone(input.content) as unknown as RecoveryContent : null };
}
async function mount(services: Services): Promise<Mounted> {
  const result = render(<div id="app" data-locale="en" data-theme="light" />), app = result.container.firstElementChild as HTMLElement;
  let workspace!: Workspace;
  await act(async () => { workspace = await mountAuthoring(app, services); });
  const item = { app, workspace, unmount: result.unmount }; mounted.push(item); return item;
}
async function coldClose(item: Mounted) {
  await act(async () => { await item.workspace.flushInputDrafts(); item.workspace.dispose(); });
  item.unmount(); mounted.splice(mounted.indexOf(item), 1); document.getElementById('studio-portals')?.remove();
}
function pane(app: HTMLElement, id: Id) { return app.querySelector<HTMLElement>(`[data-view="character:${id}"]`)!; }
function notes(app: HTMLElement, id: Id) { return within(pane(app, id)).getByRole<HTMLTextAreaElement>('textbox', { name: 'Description and story notes' }); }
async function openCharacter(item: Mounted, id: Id) { await act(async () => { await item.workspace.openDocument({ kind: 'character', objectId: id }); }); }
async function editNotes(item: Mounted, id: Id, text: string) { await act(async () => { fireEvent.change(notes(item.app, id), { target: { value: text } }); }); }
async function apply(services: Services, edit: EditInput) {
  const plan = await services.bridge.documents.planEdit(edit); if (!plan.ok) throw new Error(plan.error.message);
  const result = await services.bridge.documents.applyEdit(plan.value.planId, edit.expected); if (!result.ok) throw new Error(result.error.message);
}
async function changeCharacter(services: Services, id: Id, patch: Partial<Character>) {
  const source = await services.read(), documents = await services.bridge.documents.list();
  if (!source.ok || !documents.ok) throw new Error('Fixture source is unavailable.');
  const original = source.value.characters.find(character => character.id === id)!;
  await apply(services, characterEdit(source.value, documents.value, [{ ...characterDraft(original), ...patch }]));
}

it.each(['apply', 'save'] as const)('restores A as an editable form after B %s and a cold renderer remount', async action => {
  const f = await fixture(), first = await mount(f.services);
  await openCharacter(first, f.a.id); await editNotes(first, f.a.id, 'A local notes survive B');
  await openCharacter(first, f.b.id); await editNotes(first, f.b.id, 'B current working notes');
  await act(async () => { fireEvent.click(within(pane(first.app, f.b.id)).getByRole('button', { name: action === 'save' ? 'Save current character' : 'Apply to workspace only' })); });
  await waitFor(() => expect(f.applyEdit).toHaveBeenCalledTimes(1));
  if (action === 'save') await waitFor(() => expect(f.diskSave).toHaveBeenCalledTimes(1));
  else expect(f.diskSave).not.toHaveBeenCalled();
  const documents = await f.services.bridge.documents.list();
  if (!documents.ok) throw new Error('Fixture documents are unavailable.');
  const b = documents.value.find(document => `characters/${f.b.id}.json` in document.files)!;
  expect(b.dirty).toBe(action === 'apply');
  if (action === 'save') expect(JSON.parse(b.savedFiles[`characters/${f.b.id}.json`]!).data.description).toBe('B current working notes');
  await coldClose(first);
  expect(f.stored()?.character?.drafts).toHaveProperty(f.a.id);
  expect(f.stored()?.character?.drafts).not.toHaveProperty(f.b.id);
  const second = await mount(f.services);
  await openCharacter(second, f.a.id);
  expect(notes(second.app, f.a.id).value).toBe('A local notes survive B');
  await editNotes(second, f.a.id, 'A continues after recovery');
  expect(notes(second.app, f.a.id).value).toBe('A continues after recovery');
  const current = await f.services.read();
  expect(current.ok && current.value.characters.find(character => character.id === f.a.id)?.description).toBe(f.a.description);
  expect(current.ok && current.value.characters.find(character => character.id === f.b.id)?.description).toBe('B current working notes');
  expect(f.applyEdit).toHaveBeenCalledTimes(1);
  await act(async () => { await second.workspace.flushInputDrafts(); });
  expect(f.stored()?.retained).toBeNull();
});

it('keeps changed-source script input in recovery while restoring the character form independently', async () => {
  const f = await fixture(), base = characterDraft(f.a), scene = f.source.scenes[0]!;
  const pendingScript = '@say { unfinished source';
  await f.seed({ character: { drafts: { [f.a.id]: { ...base, description: 'Character local notes' } }, bases: { [f.a.id]: base }, selected: f.a.id, search: '' },
    documents: [{ id: `character:${f.a.id}`, kind: 'character', objectId: f.a.id, title: f.a.name }], active: `character:${f.a.id}`, scripts: [[scene.sceneId, pendingScript]] });
  const currentText = `// Changed current source\n${scene.text}`;
  await apply(f.services, { label: 'Change script source', origin: 'script', expected: [{ ref: { kind: 'document', id: scene.documentId }, revision: scene.revision }],
    patches: [{ kind: 'text', documentId: scene.documentId, edits: [{ start: 0, end: scene.text.length, before: scene.text, after: currentText }] }], preparedAssets: [], requiredRefs: [] });
  const edits = f.applyEdit.mock.calls.length, item = await mount(f.services);
  expect(item.app.querySelector('.recovered-input')?.textContent).toContain(pendingScript);
  expect(f.applyEdit).toHaveBeenCalledTimes(edits);
  await openCharacter(item, f.a.id);
  expect(notes(item.app, f.a.id).value).toBe('Character local notes');
  const source = await f.services.read(); expect(source.ok && source.value.scenes[0]?.text).toBe(currentText);
  await act(async () => { await item.workspace.flushInputDrafts(); });
  expect(f.stored()?.retained).toMatchObject({ scripts: [[scene.sceneId, pendingScript]] });
  expect(f.stored()?.retained).not.toHaveProperty('character');
});

it('reopens a retained new character from the directory after keeping and closing its tab', async () => {
  const f = await fixture(), id = fixtureId(0xee10), name = 'Recovered new character';
  await f.seed({ character: { drafts: { [id]: { id, name, description: 'New character local notes', narrativeRole: 'supporting' } }, bases: {}, selected: id, search: '' },
    documents: [{ id: 'characters', kind: 'characters', title: 'Characters & routes' }], active: 'characters' });
  const item = await mount(f.services);
  await act(async () => { fireEvent.click(within(pane(item.app, id)).getByRole('button', { name: 'Continue recovering this character draft' })); });
  expect(notes(item.app, id).value).toBe('New character local notes');
  await editNotes(item, id, 'Still the same new character');
  await act(async () => { fireEvent.click(within(item.app).getByRole('button', { name: `Close ${name}` })); });
  await act(async () => { fireEvent.click(within(document.body).getByRole('button', { name: '保留修改并关闭' })); });
  expect(within(item.app).queryByRole('button', { name: `Close ${name}` })).toBeNull();
  await act(async () => { fireEvent.click(within(item.app).getAllByRole('button', { name: 'Character directory' })[0]!); });
  const directory = item.app.querySelector<HTMLElement>('.character-directory')!;
  await act(async () => { fireEvent.click(within(directory).getByRole('button', { name: new RegExp(name) })); });
  expect(notes(item.app, id).value).toBe('Still the same new character');
  expect(item.app.querySelectorAll(`[data-view="character:${id}"]`)).toHaveLength(1);
  expect(f.applyEdit).not.toHaveBeenCalled(); expect(f.diskSave).not.toHaveBeenCalled();
});

it('retains same-field conflicts against the local base and merges independent newer character fields', async () => {
  const f = await fixture(), first = await mount(f.services);
  await openCharacter(first, f.a.id); await editNotes(first, f.a.id, 'My retained description'); await coldClose(first);
  await changeCharacter(f.services, f.a.id, { description: 'Other author description', appearance: { notes: 'New independent appearance', referenceAssets: [] } });
  const edits = f.applyEdit.mock.calls.length, second = await mount(f.services);
  await openCharacter(second, f.a.id);
  expect(notes(second.app, f.a.id).value).toBe('My retained description');
  await act(async () => { fireEvent.click(within(pane(second.app, f.a.id)).getByRole('button', { name: 'Save current character' })); });
  expect(pane(second.app, f.a.id).textContent).toContain('The same fields changed elsewhere.');
  expect(f.applyEdit).toHaveBeenCalledTimes(edits); expect(f.planSave).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(within(pane(second.app, f.a.id)).getByRole('button', { name: 'Use my conflicting fields' })); });
  const current = await f.services.read();
  expect(current.ok && current.value.characters.find(character => character.id === f.a.id)).toMatchObject({ description: 'My retained description', appearance: { notes: 'New independent appearance' } });
  expect(f.applyEdit).toHaveBeenCalledTimes(edits + 1); expect(f.diskSave).not.toHaveBeenCalled();
});

it.each([true, false])('routes an empty legacy character workspace to the directory without mounting the global manager (input record: %s)', async hasInput => {
  const f = await fixture(), listed = await f.services.bridge.documents.list(); if (!listed.ok) throw new Error('Fixture documents are unavailable.');
  const characters = listed.value.filter(document => Object.keys(document.files).some(path => path.startsWith('characters/')));
  await apply(f.services, { label: 'Prepare empty character collection', origin: 'field', expected: characters.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
    patches: characters.map(document => ({ kind: 'document' as const, documentId: document.documentId, op: 'delete' as const, before: { format: document.format, files: document.files }, after: null })), preparedAssets: [], requiredRefs: [] });
  await f.seed({ unapplied: false, otherUnapplied: false, character: hasInput ? { drafts: {}, bases: {}, selected: null, search: '' } : null,
    documents: [{ id: 'characters', kind: 'characters', title: 'Characters & routes' }], active: 'characters' });
  const item = await mount(f.services);
  expect(item.app.querySelector('[data-view="studio-character-directory"]:not([hidden]) .character-directory')?.textContent).toContain('Add a character to edit its profile');
  expect(item.app.querySelector('[data-view="characters"]')).toBeNull();
  expect(item.app.querySelector('.character-manager')).toBeNull();
});
