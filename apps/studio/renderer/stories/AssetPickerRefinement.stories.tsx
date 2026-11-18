import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { openAssetPicker, type AssetPickerChoice } from '../authoring/asset-picker.js';
import { domButton } from '../components/dom-button.js';
import { assetPickerRefinementFixture, pickerImportFailure, pickerImportedId, pickerPinnedVersion, type PickerImportOutcome } from './asset-picker-refinement-fixture.js';
import '../authoring/shell.css';
import '../authoring/workspace.css';

function AssetPickerReview({ theme = 'light', scenario = 'import' }: { theme?: 'light' | 'dark'; scenario?: 'import' | 'failure' }) {
  const host = useRef<HTMLDivElement>(null), scope = useRef<HTMLDivElement>(null), [iteration, setIteration] = useState(0);
  useEffect(() => {
    if (!host.current || !scope.current) return;
    const fixture = assetPickerRefinementFixture(); let active = true, choice: AssetPickerChoice | null = null;
    const portals = document.createElement('div'); portals.id = 'studio-portals'; portals.dataset.theme = theme; portals.dataset.locale = 'zh-CN'; document.body.append(portals);
    const form = document.createElement('section'); form.dataset.view = 'character:picker-review';
    form.style.cssText = 'max-height:420px;overflow:auto;padding:16px;border:1px solid var(--border);border-radius:8px';
    const title = document.createElement('h2'); title.textContent = '林舟 · 人物资料'; title.style.cssText = 'font-size:18px;margin:0 0 16px';
    const label = document.createElement('label'); label.textContent = '创作设定';
    const draft = document.createElement('textarea'); draft.ariaLabel = '未应用的人物设定'; draft.value = '林舟正在寻找一封遗失的信。';
    draft.style.cssText = 'display:block;width:100%;min-height:112px;margin:8px 0 24px;padding:12px;background:var(--input);color:var(--foreground);border:1px solid var(--border);border-radius:6px'; label.append(draft);
    const field = document.createElement('section'); field.style.cssText = 'margin:0 0 24px';
    const fieldName = document.createElement('strong'); fieldName.textContent = '人物参考图';
    const reference = document.createElement('p'); reference.dataset.testid = 'picker-reference';
    const triggerHost = document.createElement('div'); field.append(fieldName, reference, triggerHost);
    const tail = document.createElement('p'); tail.textContent = '人物资料与当前素材引用由原字段持有；选择器内预览和导入后仍需明确应用。'; tail.style.cssText = 'min-height:160px;color:var(--muted-foreground)';
    form.append(title, label, field, tail); host.current.append(form);
    const metrics = document.createElement('output'); metrics.dataset.testid = 'picker-metrics'; metrics.style.cssText = 'display:block;margin-top:12px;color:var(--muted-foreground);font-size:12px'; host.current.append(metrics);
    const report = () => { if (active) { metrics.textContent = `夹具：选择文件 ${fixture.metrics.picks} 次 · 导入 ${fixture.metrics.imports} 次 · 字段应用 ${fixture.metrics.applied.length} 次`; scope.current!.dataset.imports = String(fixture.metrics.imports); scope.current!.dataset.applied = String(fixture.metrics.applied.length); } };
    const pickFiles = fixture.services.pickAssetFiles!, importAssets = fixture.services.importAssets!;
    fixture.services.pickAssetFiles = async () => { const result = await pickFiles(); report(); return result; };
    fixture.services.importAssets = async (...args) => { const result = await importAssets(...args); report(); return result; };
    const drawTrigger = () => {
      reference.textContent = choice ? choice.asset.name : `${fixture.original.name} · 固定引用版本`;
      reference.dataset.assetId = choice?.assetId ?? fixture.original.id; reference.dataset.variantId = choice?.variantId ?? (choice ? '' : pickerPinnedVersion);
      const trigger = domButton('选择参考图', () => {
        scope.current!.dataset.returnScroll = String(form.scrollTop);
        void openAssetPicker({ services: fixture.services, projectId: FixtureIds.projectA, allowedKinds: ['image'],
          characterId: FixtureIds.an, sceneId: FixtureIds.street, purpose: '人物参考图', scope: scope.current!, returnFocus: trigger,
          currentAssetId: choice?.assetId ?? fixture.original.id, currentVariantId: choice?.variantId ?? (choice ? null : pickerPinnedVersion),
          onApply: async next => { choice = next; drawTrigger(); return { ok: true, value: undefined, warnings: [] }; },
        }).then(() => { if (active) { report(); scope.current!.dataset.restoredScroll = String(form.scrollTop); } });
      });
      trigger.dataset.focusKey = 'character-reference-image'; triggerHost.replaceChildren(trigger);
    };
    const controls = document.createElement('div'); controls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:16px';
    for (const [outcome, label] of [['mixed', '夹具：混合导入'], ['cancel', '夹具：取消文件选择'], ['failure', '夹具：导入服务失败']] as [PickerImportOutcome, string][]) {
      const control = domButton(label, () => fixture.setOutcome(outcome)); controls.append(control);
    }
    host.current.append(controls); fixture.setOutcome(scenario === 'failure' ? 'cancel' : 'mixed'); drawTrigger(); report(); scope.current.dataset.ready = 'true';
    return () => {
      active = false; scope.current?.removeAttribute('data-ready'); host.current?.replaceChildren(); portals.removeAttribute('id');
      const dialogs = [...portals.querySelectorAll<HTMLDialogElement>('dialog')];
      if (!dialogs.length) portals.remove();
      else {
        let remaining = dialogs.length;
        for (const dialog of dialogs) { dialog.addEventListener('close', () => { if (!--remaining) portals.remove(); }, { once: true }); dialog.close(); }
      }
    };
  }, [iteration, scenario, theme]);
  return <div ref={scope} data-picker-refinement={scenario} data-theme={theme} data-locale="zh-CN" className="authoring-shell"
    style={{ display: 'block', padding: 24, minHeight: '100vh', height: 'auto', background: 'var(--background)' }}>
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>素材选择与返回字段</h1>
      <p style={{ color: 'var(--muted-foreground)', margin: '0 0 20px' }}>Review 候选 · 真实 AssetPicker 与字段回调；文件选择和导入使用内存替身，不写磁盘。</p>
      <div ref={host}/>
      <button type="button" style={{ marginTop: 16 }} onClick={() => setIteration(value => value + 1)}>夹具：重新开始本组</button>
    </div>
  </div>;
}

const meta = { id: 'review-studio-uxf04-asset-picker', title: 'Product/Studio/Workbench/Asset Picker', component: AssetPickerReview, args: { theme: 'light', scenario: 'import' },
  parameters: { layout: 'fullscreen', docs: { description: { component: '已接受的 UXF-04 选择器流程。装配真实 createAssetPicker/openAssetPicker、原字段 onApply 与精确固定版本；独立内存夹具提供成功素材、原 M04 回执身份和结构化失败。批次浏览保留原查询与原选择，不代替素材库的真实批次范围或磁盘导入验收。' } } },
} satisfies Meta<typeof AssetPickerReview>;
export default meta;
type Story = StoryObj<typeof meta>;
const state = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-picker-refinement]')!;
const ready = (element: HTMLElement) => waitFor(() => expect(state(element)).toHaveAttribute('data-ready', 'true'));

export const ExistingResultsImport: Story = {
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    const draft = canvas.getByLabelText('未应用的人物设定'); await userEvent.click(draft); await userEvent.type(draft, ' 保留这段未应用输入。');
    await userEvent.click(canvas.getByRole('button', { name: '选择参考图' }));
    const screen = within(canvasElement.ownerDocument.body), dialog = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(within(dialog.getByRole('listbox')).getAllByRole('option').length).toBeGreaterThan(1));
    await userEvent.click(dialog.getByRole('button', { name: '导入素材' }));
    await waitFor(() => expect(dialog.getByRole('button', { name: '返回原素材结果' })).toBeVisible());
    await expect(canvas.getByTestId('picker-reference')).toHaveAttribute('data-variant-id', pickerPinnedVersion);
    await expect(state(canvasElement)).toHaveAttribute('data-applied', '0');
    await expect(dialog.getByRole('alert')).toHaveTextContent('1 项未导入');
    await userEvent.click(dialog.getByText('查看未导入原因')); await expect(dialog.getByText(new RegExp(pickerImportFailure))).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: '返回原素材结果' }));
    await expect(dialog.getByRole('button', { name: '当前上下文' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(dialog.getByRole('button', { name: '查看本批' }));
    await userEvent.click(dialog.getByRole('option', { name: /新导入 · 雨后站台/ }));
    await userEvent.click(dialog.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(canvas.getByTestId('picker-reference')).toHaveAttribute('data-asset-id', pickerImportedId);
    await expect(canvas.getByRole('button', { name: '选择参考图' })).toHaveFocus();
    await expect(draft).toHaveValue('林舟正在寻找一封遗失的信。 保留这段未应用输入。');
    await expect(state(canvasElement).dataset.restoredScroll).toBe(state(canvasElement).dataset.returnScroll);
  },
};
export const ExistingResultsImportDusk: Story = { ...ExistingResultsImport, args: { theme: 'dark' } };
export const CancelledAndFailedImport: Story = {
  args: { scenario: 'failure' },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement); await userEvent.click(canvas.getByRole('button', { name: '选择参考图' }));
    const screen = within(canvasElement.ownerDocument.body); let dialog = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(within(dialog.getByRole('listbox')).getAllByRole('option').length).toBeGreaterThan(1));
    await userEvent.click(dialog.getByRole('button', { name: '导入素材' }));
    await expect(state(canvasElement)).toHaveAttribute('data-imports', '0');
    await userEvent.click(dialog.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(canvas.getByRole('button', { name: '选择参考图' })).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: '夹具：导入服务失败' }));
    await userEvent.click(canvas.getByRole('button', { name: '选择参考图' })); dialog = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(within(dialog.getByRole('listbox')).getAllByRole('option').length).toBeGreaterThan(1));
    await userEvent.click(dialog.getByRole('button', { name: '导入素材' }));
    await expect(await dialog.findByRole('alert')).toHaveTextContent('素材服务暂不可用');
    await userEvent.click(dialog.getByRole('button', { name: '最近使用' }));
    await expect(dialog.getByRole('alert')).toHaveTextContent('素材服务暂不可用');
    await expect(canvas.getByTestId('picker-reference')).toHaveAttribute('data-variant-id', pickerPinnedVersion);
    await expect(state(canvasElement)).toHaveAttribute('data-applied', '0');
  },
};
export const CancelledAndFailedImportDusk: Story = { ...CancelledAndFailedImport, args: { scenario: 'failure', theme: 'dark' } };
