// @vitest-environment jsdom
import { act, fireEvent, render, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { studioFixture } from '../stories/studio-fixture.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({}));

it('writes to the pinned properties source after opening another scene', async () => {
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: new DOMRect(0, 0, 1440, 900) } as ResizeObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  const { container, unmount } = render(<div id="app" data-locale="en" data-theme="light"/>);
  const app = container.firstElementChild as HTMLElement;
  const { services } = studioFixture('normal', 'en', 'light');
  let workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
  try {
    await act(async () => { workspace = await mountAuthoring(app, services); });
    fireEvent.click(within(app).getByRole('button', { name: 'Direction' }));
    fireEvent.click(app.querySelector<HTMLElement>(`.authoring-center [data-statement-id="${FixtureIds.statements[1]}"]`)!);
    fireEvent.click(within(app).getByRole('button', { name: 'Pin properties source' }));
    await act(async () => { await workspace!.openDocument({ kind: 'scene', objectId: FixtureIds.bookshop }); });

    const inspector = app.querySelector<HTMLElement>('[data-view="studio-inspector"]')!;
    const speaker = inspector.querySelector<HTMLSelectElement>('[data-field="speaker"] select')!;
    await act(async () => { fireEvent.change(speaker, { target: { value: speaker.value ? '' : FixtureIds.an } }); });

    const documents = await services.bridge.documents.list();
    expect(documents.ok && documents.value.find(document => document.documentId === FixtureIds.streetDocument)?.revision).toBe(2);
    expect(documents.ok && documents.value.find(document => document.documentId === FixtureIds.bookshopDocument)?.revision).toBe(1);
    expect(app.querySelector('.authoring-scene-views')?.getAttribute('data-scene-document')).toBe(FixtureIds.bookshopDocument);
  } finally {
    await act(async () => { workspace?.dispose(); });
    unmount();
    vi.unstubAllGlobals();
  }
});
