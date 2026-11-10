// @vitest-environment jsdom
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Snapshot } from '@galcraft/contracts';
import { components, readTemplateDocuments } from '@galcraft/templates';
import { componentSceneRequest } from '../stories/page-component-fixture.js';
import { productSnapshot } from '../stories/product-fixture.js';
import { studioFixture } from '../stories/studio-fixture.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({}));
vi.mock('./player-preview.js', () => ({ openPlayerPreview: async (root: HTMLElement, _services: unknown, initial: Snapshot) => {
  let snapshot = initial;
  const page = (key: string) => {
    const config = snapshot.template.pages.find(item => item.key === key)!;
    root.replaceChildren();
    const viewport = document.createElement('div'); viewport.dataset.gcPage = key;
    for (const component of components(config.root)) {
      const element = document.createElement('button'); element.dataset.gcComponent = component.id;
      element.textContent = component.name ?? component.part; viewport.append(element);
    }
    root.append(viewport);
  };
  return {
    updatePreview: (next: Snapshot) => { snapshot = next; return { ok: true }; },
    data: { current: () => ({ preferences: { menuLocale: snapshot.project.languages.menuDefault } }) },
    session: { inspect: () => null }, setPreviewMuted() {}, dispose() {},
    view: { navigation: { replace: page }, render() {}, stopBlueprints() {}, stageElement: document.createElement('canvas') },
  };
} }));

it('switches page outlines and canvas with independent selection, mode, edits and save scope', async () => {
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: new DOMRect(0, 0, 1440, 900) } as ResizeObserverEntry], this); }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^\w-]/g, character => '\\' + character) });
  Object.defineProperty(document, 'fonts', { configurable: true, value: new EventTarget() });
  const { container, unmount } = render(<div id="app" data-locale="zh-CN" data-theme="light"/>);
  const app = container.firstElementChild as HTMLElement;
  const { services } = studioFixture('normal', 'zh-CN', 'light');
  const save = vi.spyOn(services.bridge.documents, 'planSave');
  const fixture = await services.bridge.templates.preparePageEdit(componentSceneRequest(productSnapshot()));
  if (!fixture.ok) throw new Error(fixture.error.message);
  const plan = await services.bridge.documents.planEdit(fixture.value.edit);
  if (!plan.ok) throw new Error(plan.error.message);
  const applied = await services.bridge.documents.applyEdit(plan.value.planId, fixture.value.edit.expected);
  if (!applied.ok) throw new Error(applied.error.message);
  const read = async () => {
    const listed = await services.bridge.documents.list();
    if (!listed.ok) throw new Error(listed.error.message);
    return readTemplateDocuments(listed.value);
  };
  const template = await read();
  const a = template.pages.find(page => page.key === 'component-workspace')!;
  const b = template.pages.find(page => page.key === 'character-intro')!;
  const target = components(a.root).find(component => component.name === '标题页导航')!;
  const view = (key: string) => app.querySelector<HTMLElement>(`[data-view="page:${key}"]:not([hidden])`);
  const outline = (key: string) => app.querySelector<HTMLElement>(`[data-page-outline="${key}"]`);
  const shownCanvas = (key: string) => view(key)?.querySelector(`[data-gc-page="${key}"]`);
  let workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
  try {
    await act(async () => { workspace = await mountAuthoring(app, services); });
    await act(async () => { await workspace!.navigate('pages'); await workspace!.openDocument({ kind: 'page', objectId: a.key }); });
    await waitFor(() => expect(shownCanvas(a.key)).toBeTruthy());
    const canvasTarget = shownCanvas(a.key)!.querySelector<HTMLElement>(`[data-gc-component="${target.id}"]`)!;
    const canvas = canvasTarget.closest<HTMLElement>('.designer-canvas')!;
    Object.assign(canvas, { setPointerCapture() {}, hasPointerCapture: () => false });
    await act(async () => { fireEvent.pointerDown(canvasTarget, { button: 0, pointerId: 1 }); fireEvent.pointerUp(canvas, { pointerId: 1 }); });
    await waitFor(() => expect(outline(a.key)?.querySelector(`[data-node-id="${target.id}"]`)?.getAttribute('aria-selected')).toBe('true'));
    const name = within(outline(a.key)!).getByRole('textbox', { name: '实例名称' });
    await act(async () => { fireEvent.change(name, { target: { value: 'R3 页面 A 独立写入' } }); });
    await waitFor(async () => expect(components((await read()).pages.find(page => page.id === a.id)!.root).find(component => component.id === target.id)?.name).toBe('R3 页面 A 独立写入'));
    await act(async () => { fireEvent.click(within(view(a.key)!).getByRole('button', { name: '导航预览' })); });

    await act(async () => { await workspace!.openDocument({ kind: 'page', objectId: b.key }); });
    await waitFor(() => expect(shownCanvas(b.key)).toBeTruthy());
    expect(outline(a.key)).toBeNull();
    expect(outline(b.key)?.querySelector(`[data-node-id="${target.id}"]`)).toBeNull();
    expect(view(b.key)?.querySelector('[data-mode="layout"]')?.getAttribute('aria-pressed')).toBe('true');
    expect((await read()).pages.find(page => page.id === b.id)).toEqual(b);
    await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!); });
    expect(save).toHaveBeenLastCalledWith({ kind: 'current', documentId: b.id });

    await act(async () => { await workspace!.openDocument({ kind: 'page', objectId: a.key }); });
    await waitFor(() => expect(shownCanvas(a.key)).toBeTruthy());
    expect(outline(a.key)?.querySelector(`[data-node-id="${target.id}"]`)?.getAttribute('aria-selected')).toBe('true');
    expect(view(a.key)?.querySelector('[data-mode="preview"]')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { fireEvent.click(app.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!); });
    expect(save).toHaveBeenLastCalledWith({ kind: 'current', documentId: a.id });
  } finally {
    await act(async () => workspace?.dispose());
    unmount(); vi.unstubAllGlobals(); Reflect.deleteProperty(document, 'fonts');
  }
});
