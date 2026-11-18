// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/react';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { createAssetPicker, openAssetPicker, type AssetPickerOptions } from './asset-picker.js';
import { assetPickerRefinementFixture, pickerImportFailure, pickerImportedId, pickerOriginalId, pickerPinnedVersion } from '../stories/asset-picker-refinement-fixture.js';

vi.mock('../components/motion.js', () => ({ prepareNativeDialog: (dialog: HTMLDialogElement) => {
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event('close')); };
} }));
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const ok = () => ({ ok: true as const, value: undefined, warnings: [] });
function setup(overrides: Partial<AssetPickerOptions> = {}) {
  const fixture = assetPickerRefinementFixture(), apply = vi.fn(async () => ok()), finish = vi.fn();
  const options: AssetPickerOptions = { services: fixture.services, projectId: FixtureIds.projectA, allowedKinds: ['image'],
    characterId: FixtureIds.an, sceneId: FixtureIds.street, currentAssetId: pickerOriginalId, currentVariantId: pickerPinnedVersion,
    purpose: '人物参考图', onApply: apply, ...overrides };
  const picker = createAssetPicker(options, finish); document.body.append(picker.root);
  return { ...fixture, options, apply, finish, picker, ui: within(picker.root) };
}
async function loaded(root: HTMLElement) { await waitFor(() => expect(root.querySelectorAll('.asset-picker-results [role="option"]').length).toBeGreaterThan(0)); }
const choose = (root: HTMLElement, id: string) => root.querySelector<HTMLButtonElement>(`.asset-picker-results [data-asset-option="${id}"]`)!;

it('imports from populated results, locates only applicable receipt assets and preserves the original query, page, selection and precise reference', async () => {
  const value = setup(); const { picker, ui, apply, finish, metrics } = value; await loaded(picker.root);
  expect(ui.getByRole('heading').textContent).toContain('人物参考图');
  fireEvent.click(ui.getByRole('button', { name: '最近使用' })); await loaded(picker.root);
  fireEvent.click(ui.getByRole('button', { name: '下一页' }));
  await waitFor(() => expect(metrics.queries.at(-1)?.query.offset).toBe(12));
  const before = metrics.queries.at(-1)!;
  const prior = picker.root.querySelector<HTMLButtonElement>('.asset-picker-results [role="option"]')!; fireEvent.click(prior);
  const selectedId = prior.dataset.assetOption;
  const results = picker.root.querySelector<HTMLElement>('.asset-picker-results')!; results.scrollTop = 97;
  fireEvent.click(ui.getByRole('button', { name: '导入素材' }));
  await waitFor(() => expect(choose(picker.root, pickerImportedId)).not.toBeNull());
  expect(apply).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled(); expect(metrics.applied).toEqual([]);
  expect(picker.root.querySelectorAll('.asset-picker-results [role="option"]')).toHaveLength(1);
  expect(choose(picker.root, pickerImportedId).getAttribute('aria-selected')).toBe('false');
  expect(document.activeElement).toBe(choose(picker.root, pickerImportedId));
  expect(metrics.queries.at(-1)?.context).toEqual(before.context);
  expect(metrics.queries.at(-1)?.query.offset).toBe(12);
  expect(picker.root.querySelector('.asset-picker-current [data-variant]')?.getAttribute('data-variant')).toBe(pickerPinnedVersion);
  expect(picker.root.querySelector('[data-batch-id]')?.getAttribute('data-attempt-id')).toBe(value.receipt.batch!.attemptId);
  fireEvent.click(ui.getByText('查看未导入原因')); expect(ui.getByText(new RegExp(pickerImportFailure))).toBeTruthy();
  await picker.refresh(); expect(ui.getByText(new RegExp(pickerImportFailure))).toBeTruthy();
  fireEvent.click(ui.getByRole('button', { name: '返回原素材结果' }));
  expect(results.scrollTop).toBe(97);
  expect(choose(picker.root, selectedId!).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(ui.getByRole('button', { name: '查看本批' }));
  fireEvent.click(choose(picker.root, pickerImportedId)); fireEvent.click(ui.getByRole('button', { name: '应用' }));
  await waitFor(() => expect(finish).toHaveBeenCalledOnce());
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({ assetId: pickerImportedId, variantId: null }));
  expect(metrics.applied).toEqual([pickerImportedId]); picker.dispose();
});

it('keeps cancellation and whole-import failure on the original selection without applying or clearing an input reference', async () => {
  const { picker, ui, apply, finish, metrics, setOutcome } = setup(); await loaded(picker.root);
  const current = picker.root.querySelector<HTMLButtonElement>('.asset-picker-current [role="option"]')!; fireEvent.click(current);
  setOutcome('cancel'); fireEvent.click(ui.getByRole('button', { name: '导入素材' }));
  await waitFor(() => expect(metrics.picks).toBe(1)); await waitFor(() => expect(ui.getByRole<HTMLButtonElement>('button', { name: '导入素材' }).disabled).toBe(false));
  expect(metrics.imports).toBe(0); expect(current.getAttribute('aria-selected')).toBe('true');
  setOutcome('failure'); fireEvent.click(ui.getByRole('button', { name: '导入素材' }));
  await waitFor(() => expect(ui.getByRole('alert').textContent).toContain('素材服务暂不可用'));
  await picker.refresh(); expect(ui.getByRole('alert').textContent).toContain('素材服务暂不可用');
  expect(picker.root.querySelector('.asset-picker-current [role="option"]')?.getAttribute('aria-selected')).toBe('true');
  expect(apply).not.toHaveBeenCalled(); fireEvent.click(ui.getByRole('button', { name: '取消' })); expect(finish).toHaveBeenCalledWith(null);
  expect(metrics.applied).toEqual([]); picker.dispose();
});

it('supports receipt-returning custom import and keeps existing void import consumers working', async () => {
  const fixture = assetPickerRefinementFixture(), onImport = vi.fn(async () => structuredClone(fixture.receipt));
  const first = setup({ onImport }); await loaded(first.picker.root);
  fireEvent.click(first.ui.getByRole('button', { name: '导入素材' }));
  await waitFor(() => expect(choose(first.picker.root, pickerImportedId)).not.toBeNull());
  expect(first.metrics.picks).toBe(0); expect(onImport).toHaveBeenCalledOnce(); first.picker.dispose(); first.picker.root.remove();
  const legacy = setup({ onImport: async () => undefined }); await loaded(legacy.picker.root);
  const count = legacy.metrics.queries.length; fireEvent.click(legacy.ui.getByRole('button', { name: '导入素材' }));
  await waitFor(() => expect(legacy.metrics.queries.length).toBeGreaterThan(count));
  expect(legacy.apply).not.toHaveBeenCalled(); legacy.picker.dispose();
});

it('offers the same import action for an empty library and never applies imported assets implicitly', async () => {
  const value = setup(); value.assets.length = 0;
  await waitFor(() => expect(value.ui.getByText('素材库为空，先导入素材。')).toBeTruthy());
  expect(value.ui.getAllByRole('button', { name: '导入素材' })).toHaveLength(1);
  fireEvent.click(value.ui.getByRole('button', { name: '导入素材' }));
  await waitFor(() => expect(choose(value.picker.root, pickerImportedId)).not.toBeNull());
  expect(value.apply).not.toHaveBeenCalled(); expect(value.metrics.applied).toEqual([]); value.picker.dispose();
});

it('retains partial failure detail when the imported types cannot be used in the field', async () => {
  const fixture = assetPickerRefinementFixture(); const receipt = { ...fixture.receipt, succeeded: [fixture.receipt.succeeded[1]!] };
  const { picker, ui, apply } = setup({ onImport: async () => receipt }); await loaded(picker.root);
  fireEvent.click(ui.getByRole('button', { name: '导入素材' }));
  await waitFor(() => expect(ui.getByText('本批没有适用于此字段的素材，原引用保持不变。')).toBeTruthy());
  expect(picker.root.querySelectorAll('.asset-picker-results [role="option"]')).toHaveLength(0);
  await picker.refresh(); expect(ui.getByRole('alert').textContent).toContain('1 项未导入');
  expect(apply).not.toHaveBeenCalled(); picker.dispose();
});

it('prevents duplicate import and applying while an import is pending', async () => {
  let complete!: () => void; const onImport = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
  const { picker, ui, apply } = setup({ onImport }); await loaded(picker.root);
  fireEvent.click(picker.root.querySelector<HTMLButtonElement>('.asset-picker-current [role="option"]')!);
  const action = ui.getByRole('button', { name: '导入素材' }); fireEvent.click(action); fireEvent.click(action);
  fireEvent.click(ui.getByRole('button', { name: '应用' }));
  expect(onImport).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled();
  complete(); await waitFor(() => expect(ui.getByRole<HTMLButtonElement>('button', { name: '应用' }).disabled).toBe(false)); picker.dispose();
});

it('restores a replaced field trigger in its original pane using its focus key and scroll position', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
  const fixture = assetPickerRefinementFixture();
  const scope = document.createElement('div'), pane = document.createElement('section'), other = document.createElement('section');
  pane.dataset.view = 'character:source'; other.dataset.view = 'character:other'; scope.append(pane, other); document.body.append(scope);
  const trigger = document.createElement('button'); trigger.dataset.focusKey = 'reference-image'; pane.append(trigger); trigger.focus(); pane.scrollTop = 82;
  const duplicate = trigger.cloneNode(true) as HTMLButtonElement; other.append(duplicate);
  let replacement!: HTMLButtonElement;
  const pending = openAssetPicker({ services: fixture.services, projectId: FixtureIds.projectA, allowedKinds: ['image'], scope, returnFocus: trigger,
    onApply: async () => { replacement = trigger.cloneNode(true) as HTMLButtonElement; trigger.replaceWith(replacement); pane.scrollTop = 0; return ok(); } });
  const dialog = scope.querySelector('dialog')!; await loaded(dialog);
  fireEvent.click(choose(dialog, pickerOriginalId)); fireEvent.click(within(dialog).getByRole('button', { name: '应用' }));
  await expect(pending).resolves.toMatchObject({ assetId: pickerOriginalId });
  expect(document.activeElement).toBe(replacement); expect(document.activeElement).not.toBe(duplicate); expect(pane.scrollTop).toBe(82);
});
