// @vitest-environment jsdom
import { act, fireEvent, render, within, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { JsonSchema, type StudioBridge } from '@galcraft/contracts';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { emptyLayout, group } from '../components/workbench/zoned-layout.js';
import { studioFixture } from '../stories/studio-fixture.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({}));

function stubBrowser() {
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: new DOMRect(0, 0, 1440, 900) } as ResizeObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^\w-]/g, character => '\\' + character) });
}

it('applies and routes commands to the pinned properties source until the central scene receives focus', async () => {
  stubBrowser();
  const { container, unmount } = render(<div id="app" data-locale="en" data-theme="light"/>);
  const app = container.firstElementChild as HTMLElement;
  const { services } = studioFixture('normal', 'en', 'light');
  const save = vi.spyOn(services.bridge.documents, 'planSave');
  const undo = vi.spyOn(services.bridge.documents, 'planUndo');
  let workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
  try {
    await act(async () => { workspace = await mountAuthoring(app, services); });
    fireEvent.click(within(app).getByRole('button', { name: 'Direction' }));
    fireEvent.click(app.querySelector<HTMLElement>(`.authoring-center [data-statement-id="${FixtureIds.statements[1]}"]`)!);
    fireEvent.click(within(app).getByRole('button', { name: 'Object properties' }));
    fireEvent.click(within(app).getByRole('button', { name: 'Pin properties source' }));
    await act(async () => { await workspace!.openDocument({ kind: 'scene', objectId: FixtureIds.bookshop }); });

    const inspector = app.querySelector<HTMLElement>('[data-view="studio-inspector"]')!;
    const speaker = inspector.querySelector<HTMLSelectElement>('[data-field="speaker"] select')!;
    await act(async () => { fireEvent.change(speaker, { target: { value: speaker.value ? '' : FixtureIds.an } }); });

    const documents = await services.bridge.documents.list();
    expect(documents.ok && documents.value.find(document => document.documentId === FixtureIds.streetDocument)?.revision).toBe(2);
    expect(documents.ok && documents.value.find(document => document.documentId === FixtureIds.bookshopDocument)?.revision).toBe(1);
    expect(app.querySelector('[data-view="scene:' + FixtureIds.bookshop + '"] .authoring-scene-views')?.getAttribute('data-scene-document')).toBe(FixtureIds.bookshopDocument);

    await act(async () => {
      inspector.querySelector<HTMLSelectElement>('[data-field="speaker"] select')!.focus();
      fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!);
    });
    expect(save).toHaveBeenLastCalledWith({ kind: 'current', documentId: FixtureIds.streetDocument });
    await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="undo"]')!); });
    expect(undo.mock.lastCall?.[0]).toBe(FixtureIds.streetDocument);

    await act(async () => {
      app.querySelector<HTMLElement>('[data-view="scene:' + FixtureIds.bookshop + '"]')!.focus();
      fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!);
    });
    expect(save).toHaveBeenLastCalledWith({ kind: 'current', documentId: FixtureIds.bookshopDocument });

    await act(async () => { await workspace!.openDocument({ kind: 'character', objectId: FixtureIds.an }); });
    expect(inspector.querySelector<HTMLElement>('[data-source-panel="inspector"]')?.dataset.sourceScene).toBe(FixtureIds.street);
    await act(async () => { fireEvent.click(within(inspector).getByRole('button', { name: 'Resume properties following' })); });
    expect(inspector.querySelector('[data-source-panel="inspector"] [role="status"]')?.textContent).toContain('Open a scene document');
    expect(inspector.querySelector('[data-field="speaker"]')).toBeNull();

    await act(async () => { fireEvent.click(within(app).getByRole('button', { name: 'Layout' })); });
    const showStage = await within(document.body).findByRole('menuitem', { name: 'Show stage' });
    await act(async () => { fireEvent.click(showStage); });
    const stage = app.querySelector<HTMLElement>('[data-view="studio-stage"]:not([hidden])')!;
    expect(within(stage).getByRole<HTMLButtonElement>('button', { name: 'Play current performance' }).disabled).toBe(true);
    expect(stage.querySelector('[data-source-panel="stage"] [role="status"]')?.textContent).toContain('Open a scene document');
    expect(within(stage).getAllByText(/Open a scene document/)).toHaveLength(1);
  } finally {
    await act(async () => { workspace?.dispose(); });
    unmount();
    vi.unstubAllGlobals();
  }
});

it('restores two scene groups and commits from the visible writing pane to its own scene', async () => {
  stubBrowser();
  const { container, unmount } = render(<div id="app" data-locale="en" data-theme="light"/>);
  const app = container.firstElementChild as HTMLElement;
  const { services } = studioFixture('normal', 'en', 'light');
  const street = 'scene:' + FixtureIds.street, bookshop = 'scene:' + FixtureIds.bookshop;
  const layout = emptyLayout();
  layout.tree = { kind: 'split', id: 'scenes', axis: 'y', ratio: .5, first: group('document', [street]), second: group('bookshop', [bookshop]) };
  const caret = { statementId: null, field: null, offset: 0, documentOffset: 0 };
  const scroll = { statementId: null, offsetPx: 0, scrollLeft: 0 };
  const preferences: StudioBridge['authoringPreferences'] = services.bridge.authoringPreferences;
  vi.spyOn(preferences, 'readWorkspace').mockResolvedValue({ ok: true, warnings: [], value: {
    schemaVersion: 1, projectId: FixtureIds.projectA, sceneId: FixtureIds.street, documentId: FixtureIds.streetDocument,
    documentRevision: 1, view: 'cards', caret, scroll, previousStatementId: null, nextStatementId: null, updatedAt: new Date().toISOString(),
    workbench: { active: street, documents: [
      { id: street, kind: 'scene', objectId: FixtureIds.street, title: 'Street' },
      { id: bookshop, kind: 'scene', objectId: FixtureIds.bookshop, title: 'Bookshop' },
    ], dockLayout: JsonSchema.parse(layout), sceneContexts: [{ sceneId: FixtureIds.bookshop, revision: 1, view: 'writing', caret, scroll, selection: null, beside: [] }] },
  } });
  let workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
  try {
    await act(async () => { workspace = await mountAuthoring(app, services); });
    const first = app.querySelector<HTMLElement>(`[data-view="${street}"]:not([hidden]) .authoring-scene-views`)!;
    const second = () => app.querySelector<HTMLElement>(`[data-view="${bookshop}"]:not([hidden]) .authoring-scene-views`)!;
    expect(first.dataset.sceneDocument).toBe(FixtureIds.streetDocument);
    expect(second().dataset.sceneDocument).toBe(FixtureIds.bookshopDocument);
    const writing = second().querySelector<HTMLTextAreaElement>('.authoring-writing-input')!;
    await act(async () => { fireEvent.pointerDown(writing); writing.focus(); });
    expect(second().querySelector('.authoring-writing-input')).toBe(writing);
    await act(async () => {
      fireEvent.input(writing, { target: { value: 'Edited in the visible bookshop' } });
      fireEvent.change(writing);
    });
    const result = await services.bridge.documents.list();
    expect(result.ok && result.value.find(document => document.documentId === FixtureIds.streetDocument)?.revision).toBe(1);
    expect(result.ok && result.value.find(document => document.documentId === FixtureIds.bookshopDocument)?.revision).toBe(2);
    expect(first.isConnected).toBe(true);
  } finally {
    await act(async () => { workspace?.dispose(); });
    unmount();
    vi.unstubAllGlobals();
  }
});

it('returns a character reference from pinned properties to the inspected scene and keeps that pin', async () => {
  stubBrowser();
  const { container, unmount } = render(<div id="app" data-locale="en" data-theme="light"/>);
  const app = container.firstElementChild as HTMLElement;
  const { services } = studioFixture('normal', 'en', 'light');
  let workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
  try {
    await act(async () => { workspace = await mountAuthoring(app, services); });
    fireEvent.click(within(app).getByRole('button', { name: 'Direction' }));
    fireEvent.click(app.querySelector<HTMLElement>(`.authoring-center [data-statement-id="${FixtureIds.statements[1]}"]`)!);
    fireEvent.click(within(app).getByRole('button', { name: 'Object properties' }));
    let inspector = app.querySelector<HTMLElement>('[data-view="studio-inspector"]')!;
    await act(async () => { fireEvent.change(inspector.querySelector<HTMLSelectElement>('[data-field="speaker"] select')!, { target: { value: FixtureIds.an } }); });
    fireEvent.click(within(app).getByRole('button', { name: 'Pin properties source' }));
    await act(async () => { await workspace!.openDocument({ kind: 'scene', objectId: FixtureIds.bookshop }); });
    inspector = app.querySelector<HTMLElement>('[data-view="studio-inspector"]')!;
    await act(async () => { fireEvent.click(inspector.querySelector<HTMLElement>(`[data-character-reference="${FixtureIds.an}"]`)!); });
    await waitFor(() => expect(app.querySelector(`[data-view="character:${FixtureIds.an}"] .character-manager`)).toBeTruthy());
    await act(async () => { fireEvent.click(within(app).getByRole('button', { name: 'Return to original line' })); });
    expect(app.querySelector(`[data-tab-view="scene:${FixtureIds.street}"]`)?.getAttribute('aria-selected')).toBe('true');
    expect(app.querySelector('[data-source-panel="inspector"]')?.getAttribute('data-source-scene')).toBe(FixtureIds.street);
    expect(app.querySelector(`.authoring-center [data-statement-id="${FixtureIds.statements[1]}"]`)?.classList.contains('selected')).toBe(true);
  } finally {
    await act(async () => { workspace?.dispose(); });
    unmount(); vi.unstubAllGlobals();
  }
});
