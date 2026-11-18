// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/react';
import type { DocumentView, RuntimeTemplate, Snapshot } from '@galcraft/contracts';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { components, readTemplateDocuments } from '@galcraft/templates';
import type { AuthoringServices } from './controller.js';
import { studioFixture } from '../stories/studio-fixture.js';
import { assetPickerRefinementFixture, pickerOriginalId } from '../stories/asset-picker-refinement-fixture.js';

vi.mock('monaco-editor', () => ({}));
vi.mock('../components/monaco-workers.js', () => ({ configureMonacoWorkers: () => {} }));
vi.mock('./player-preview.js', () => ({ openPlayerPreview: vi.fn() }));
vi.mock('../components/motion.js', () => ({ prepareNativeDialog: (dialog: HTMLDialogElement) => {
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event('close')); };
} }));
import { PageDesigner } from './page-designer.js';

type Harness = {
  root: HTMLElement; template: RuntimeTemplate; snapshot: Snapshot; documents: DocumentView[]; inspector: HTMLElement;
  page: string; selected: Set<string>; state: string; inspectorGroups: Set<string>; drawInspector(): void;
};
async function setup() {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
  const host = studioFixture('normal', 'zh-CN', 'light'), assets = assetPickerRefinementFixture();
  const services = { ...host.services, ...assets.services, compilePreview: undefined } as AuthoringServices;
  const designer = new PageDesigner(services, async () => {}) as unknown as Harness;
  const listed = await services.bridge.documents.list(); if (!listed.ok) throw new Error(listed.error.message);
  Object.assign(designer, { documents: listed.value, template: readTemplateDocuments(listed.value), snapshot: structuredClone(FixtureSnapshot),
    drawTree: vi.fn(), preview: vi.fn(async () => {}), colorField: vi.fn(), numberField: vi.fn(),
    animationInspector: vi.fn(), interactionInspector: vi.fn(), instanceLayout: vi.fn(), displayText: vi.fn(), basicContent: vi.fn() });
  designer.root.append(designer.inspector); document.body.append(designer.root); designer.drawInspector();
  return designer;
}
async function applyImage(designer: Harness, trigger: HTMLButtonElement) {
  trigger.focus(); fireEvent.click(trigger);
  const dialog = designer.root.querySelector<HTMLDialogElement>('dialog')!;
  await waitFor(() => expect(dialog.querySelector(`[data-asset-option="${pickerOriginalId}"]`)).not.toBeNull());
  fireEvent.click(dialog.querySelector<HTMLButtonElement>(`.asset-picker-results [data-asset-option="${pickerOriginalId}"]`)!);
  fireEvent.click(within(dialog).getByRole('button', { name: '应用' }));
  await waitFor(() => expect(dialog.isConnected).toBe(false));
}
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('returns to the real page background field after its first selection changes the trigger label', async () => {
  const designer = await setup(), page = designer.template.pages.find(page => page.key === 'title')!;
  const trigger = within(designer.inspector).getByRole<HTMLButtonElement>('button', { name: '选择背景素材' });
  designer.inspector.scrollTop = 84;
  await applyImage(designer, trigger);
  const replacement = within(designer.inspector).getByRole<HTMLButtonElement>('button', { name: '更换背景图片' });
  expect(trigger.isConnected).toBe(false); expect(document.activeElement).toBe(replacement);
  expect(designer.inspector.scrollTop).toBe(84);
  expect(designer.template.pages.find(item => item.id === page.id)!.background.imageId).toBe(pickerOriginalId);
  expect(designer.template.pages.filter(item => item.id !== page.id).every(item => item.background.imageId === null)).toBe(true);

  const titleField = replacement.dataset.focusKey;
  designer.page = 'settings'; designer.drawInspector();
  expect(within(designer.inspector).getByRole<HTMLButtonElement>('button', { name: '选择背景素材' }).dataset.focusKey).not.toBe(titleField);
});

it('keeps a component image picker attached to its component and visual state after redraw', async () => {
  const designer = await setup(), page = designer.template.pages.find(page => page.key === 'title')!;
  const buttons = components(page.root).filter(component => component.part.startsWith('title.menu.'));
  const component = buttons[0]!;
  designer.selected = new Set([component.id]); designer.state = 'hover'; designer.inspectorGroups.add('details'); designer.drawInspector();
  const trigger = within(designer.inspector).getByRole<HTMLButtonElement>('button', { name: '作品图片' });
  await applyImage(designer, trigger);
  const replacement = within(designer.inspector).getByRole<HTMLButtonElement>('button', { name: '作品图片' });
  expect(document.activeElement).toBe(replacement); expect(trigger.isConnected).toBe(false);
  const updated = components(designer.template.pages.find(item => item.id === page.id)!.root).find(item => item.id === component.id)!;
  expect(updated.states.hover?.images?.icon?.assetId).toBe(pickerOriginalId);
  expect(updated.normal.images?.icon?.assetId).not.toBe(pickerOriginalId);

  const hoverField = replacement.dataset.focusKey;
  designer.state = 'normal'; designer.drawInspector();
  const normalField = within(designer.inspector).getByRole<HTMLButtonElement>('button', { name: '作品图片' }).dataset.focusKey;
  expect(normalField).not.toBe(hoverField);
  designer.selected = new Set([buttons[1]!.id]); designer.drawInspector();
  expect(within(designer.inspector).getByRole<HTMLButtonElement>('button', { name: '作品图片' }).dataset.focusKey).not.toBe(normalField);
});
