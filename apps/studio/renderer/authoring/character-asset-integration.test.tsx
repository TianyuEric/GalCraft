// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { userEvent } from 'storybook/test';
import type { Character } from '@galcraft/contracts';
import { fixtureId } from '@galcraft/contracts/fixtures';
import { studioFixture } from '../stories/studio-fixture.js';
import { assetPickerRefinementFixture, pickerPinnedVersion } from '../stories/asset-picker-refinement-fixture.js';
import { differenceVersionLabel } from './characters/model.js';
import { figureId, figureVariantId } from '../stories/product-fixture.js';
import { mountAuthoring } from './view.js';

vi.mock('monaco-editor', () => ({ languages: { getLanguages: () => [{ id: 'galcraft' }], register: vi.fn(), setMonarchTokensProvider: vi.fn() } }));
vi.mock('../components/motion.js', async importOriginal => ({ ...await importOriginal<typeof import('../components/motion.js')>(), prepareNativeDialog: (dialog: HTMLDialogElement) => {
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event('close')); };
} }));
const mounted: Awaited<ReturnType<typeof mountAuthoring>>[] = [];
type Services = Parameters<typeof mountAuthoring>[1];
const ok = <T,>(value: T) => ({ ok: true as const, value, warnings: [] });
beforeEach(() => {
  configure({ getElementError: message => new Error((message ?? 'Element query failed').split('\n\n')[0]) });
  vi.stubGlobal('ResizeObserver', class { constructor(private callback: ResizeObserverCallback) {} observe(target: Element) { this.callback([{ target, contentRect: new DOMRect(0, 0, 1440, 900) } as ResizeObserverEntry], this); } unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^\w-]/g, character => '\\' + character) });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(async () => {
  await act(async () => { for (const workspace of mounted.splice(0)) workspace.dispose(); });
  cleanup(); document.getElementById('studio-portals')?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

it.each(['reference', 'shared'] as const)('refreshes real character %s fields when the Picker applies an asset outside the renderer cache', async kind => {
  const services: Services = studioFixture('normal', 'en', 'light').services;
  const picker = assetPickerRefinementFixture();
  const read = services.read;
  let characterId = '';
  services.read = async documents => {
    const result = await read(documents); if (!result.ok) return result;
    characterId = result.value.characters[0]!.id;
    const character = result.value.characters[0]!;
    const patch: Partial<Character> = kind === 'reference' ? { appearance: { notes: 'Retained appearance notes', referenceAssets: [] } }
      : { differences: [{ id: fixtureId(0xf490), name: 'Cache boundary', figure: { assetId: figureId, variantId: figureVariantId }, avatar: null }], initialDifferenceId: fixtureId(0xf490) };
    return ok({ ...result.value, characters: [{ ...character, ...patch }, ...result.value.characters.slice(1)] });
  };
  services.queryAssetPicker = picker.services.queryAssetPicker;
  const getAsset = services.getAsset!;
  services.getAsset = id => picker.assets.some(asset => asset.id === id) ? picker.services.getAsset!(id) : getAsset(id);
  services.thumbnails = picker.services.thumbnails;
  services.recordAssetUse = picker.services.recordAssetUse;
  services.previewAsset = async () => ok({ uri: '/selected-figure.png', mime: 'image/png', playback: { loopStartSec: null, loopEndSec: null } });
  const result = render(<div id="app" data-locale="en" data-theme="light" />), app = result.container.firstElementChild as HTMLElement;
  let workspace!: Awaited<ReturnType<typeof mountAuthoring>>;
  await act(async () => { workspace = await mountAuthoring(app, services); }); mounted.push(workspace);
  await act(async () => { await workspace.openDocument({ kind: 'character', objectId: characterId }); });
  const pane = () => app.querySelector<HTMLElement>(`[data-view="character:${characterId}"]`)!;
  const ui = () => within(pane());
  if (kind === 'shared') await act(async () => { fireEvent.click(ui().getByRole('button', { name: 'Shared differences' })); });
  const trigger = ui().getByRole('button', { name: kind === 'reference' ? 'Choose or import reference image' : 'Choose or import figure' });
  trigger.focus(); await act(async () => { fireEvent.click(trigger); });
  const dialog = await within(document.body).findByRole('dialog');
  const selector = `.asset-picker-results [data-asset-option="${picker.original.id}"]`;
  await waitFor(() => expect(dialog.querySelector(selector)).not.toBeNull());
  await act(async () => { fireEvent.click(dialog.querySelector<HTMLButtonElement>(selector)!); fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' })); });
  await waitFor(() => expect(dialog.isConnected).toBe(false));
  await waitFor(() => expect(ui().getByText(picker.original.name, { selector: '.character-asset-row span' })).toBeTruthy());
  expect(ui().queryByText(kind === 'reference' ? 'Reference image not loaded' : 'Original image missing')).toBeNull();
  if (kind === 'reference') expect(ui().getByRole<HTMLTextAreaElement>('textbox', { name: 'Appearance notes' }).value).toBe('Retained appearance notes');
  else {
    const version = ui().getByRole('combobox', { name: 'Figure version' });
    expect(version.textContent).toContain('Follow active version');
    await act(async () => { await userEvent.click(version); });
    const pinned = within(document.body).getByRole('option', { name: differenceVersionLabel(picker.original, pickerPinnedVersion, 'en') });
    await act(async () => { await userEvent.click(pinned); });
    await waitFor(() => expect(ui().getByRole('combobox', { name: 'Figure version' }).textContent).toContain(differenceVersionLabel(picker.original, pickerPinnedVersion, 'en')));
    const view = ui().getByRole<HTMLButtonElement>('button', { name: 'View source' }); expect(view.disabled).toBe(false);
    await act(async () => { fireEvent.click(view); });
    const preview = await waitFor(() => { const element = app.querySelector<HTMLElement>(`[data-asset-preview="${picker.original.id}"]`); expect(element).not.toBeNull(); return element!; });
    expect(preview.dataset.previewVariant).toBe(pickerPinnedVersion);
    expect(within(preview).getByRole('heading', { name: picker.original.name })).toBeTruthy();
    expect(preview.textContent).toContain('Version 2 · Fixed version');
    expect(within(preview).getByRole<HTMLButtonElement>('button', { name: 'Actual size' }).disabled).toBe(false);
  }
});
