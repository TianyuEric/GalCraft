import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { mountAuthoring } from '../authoring/view.js';
import { reviewBatchId } from './problems-fixture.js';
import { figureId } from './product-fixture.js';
import { assetBrowserRefinementFixture, browserCheckedId, browserFailurePaths, browserPrimaryId, browserPrimaryVersion, browserPreviewId,
  browserQuery, browserSceneTitle, type AssetBrowserMetrics, type AssetBrowserScenario } from './asset-browser-refinement-fixture.js';

function AssetBrowserReview({ theme = 'light', scenario = 'batch' }: { theme?: 'light' | 'dark'; scenario?: AssetBrowserScenario }) {
  const host = useRef<HTMLDivElement>(null), scope = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(''), [iteration, setIteration] = useState(0), [ready, setReady] = useState(false);
  useEffect(() => {
    if (!host.current || !scope.current) return;
    let active = true, workspace: Awaited<ReturnType<typeof mountAuthoring>> | null = null;
    setReady(false); setError(''); scope.current.removeAttribute('data-ready'); scope.current.removeAttribute('data-result');
    const app = document.createElement('div'); app.id = 'app'; app.dataset.locale = 'zh-CN'; app.dataset.theme = theme; host.current.append(app);
    let portals = document.getElementById('studio-portals'); const ownsPortals = !portals;
    if (!portals) { portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.locale = 'zh-CN'; portals.dataset.theme = theme;
    void assetBrowserRefinementFixture(theme, scenario, (metrics: AssetBrowserMetrics) => {
      if (!active || !scope.current) return;
      for (const key of ['imports', 'renames', 'applies', 'saves'] as const) scope.current.dataset[key] = String(metrics[key]);
      scope.current.dataset.query = JSON.stringify(metrics.query); scope.current.dataset.scopeIds = metrics.scopeIds.join(',');
      scope.current.dataset.importPaths = JSON.stringify(metrics.importPaths); scope.current.dataset.importBatch = metrics.importBatch;
      scope.current.dataset.savedAssets = JSON.stringify(metrics.savedAssets);
    }).then(async fixture => {
      if (!active) return;
      workspace = await mountAuthoring(app, fixture.services);
      if (!active) { workspace.dispose(); return; }
      await workspace.showAssets();
      if (active && scope.current) { scope.current.dataset.ready = 'true'; setReady(true); }
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; workspace?.dispose(); app.remove(); if (ownsPortals) portals.remove(); };
  }, [theme, scenario, iteration]);
  return <div ref={scope} data-asset-browser-review={scenario} data-theme={theme} data-locale="zh-CN">
    {error && <p role="alert">{error}</p>}<div ref={host} className="product-story" />
    <button type="button" disabled={!ready} style={{ position: 'fixed', insetBlockEnd: 4, insetInlineEnd: 20, zIndex: 20 }}
      title="仅用于 Story 夹具：恢复初始内存素材、原混合导入回执与公开工作区恢复记录。"
      onClick={() => { setReady(false); setIteration(value => value + 1); }}>夹具：重新开始本组</button>
  </div>;
}

const meta = { id: 'review-studio-uxf04-asset-browser', title: 'Product/Studio/Workbench/Asset Browser', component: AssetBrowserReview,
  args: { theme: 'light', scenario: 'batch' }, parameters: { layout: 'fullscreen', docs: { description: { component:
    'UXF-04 素材浏览审核。装配真实 mountAuthoring、素材库、素材属性、中央素材预览、Dock 与选择事务；复用 UXF-02 原导入批次夹具。96 项素材目录和精确预览由确定性内存服务提供，初始查询、跨页勾选、主对象、版本、固定来源及滚动通过公开 authoringPreferences 工作区契约恢复。Story 不写磁盘、不发远端请求、不测试 IME；原生文件选择、磁盘导入与专业媒体解码仍由实际宿主验证。' } } },
} satisfies Meta<typeof AssetBrowserReview>;
export default meta;
type Story = StoryObj<typeof meta>;
const state = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-asset-browser-review]')!;
const library = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-view="studio-assets"] .authoring-assets')!;
const row = (element: HTMLElement, id: string) => library(element).querySelector<HTMLElement>(`[data-plugin-asset-id="${id}"]`)!;
const ready = async (element: HTMLElement) => {
  await waitFor(() => expect(state(element)).toHaveAttribute('data-ready', 'true'), { timeout: 30000 });
  await waitFor(() => expect(row(element, browserPrimaryId)).toBeVisible());
};
const receipt = (element: HTMLElement) => element.querySelector<HTMLElement>(`[data-import-batch="${reviewBatchId}"]`)!;
const selected = (element: HTMLElement) => within(library(element)).getByText('已选 1 项 · 本页 0 · 其他页或筛选外 1');
const revealInspector = async (element: HTMLElement) => {
  const inspector = element.querySelector<HTMLElement>('[data-view="studio-asset-inspector"]');
  if (inspector && !inspector.checkVisibility()) await userEvent.click(within(element).getByRole('button', { name: '素材属性' }));
};
const assertOrigin = async (element: HTMLElement, scroll: number) => {
  await waitFor(() => expect(JSON.parse(state(element).dataset.query!)).toEqual(browserQuery));
  await expect(within(library(element)).getByRole('textbox', { name: '搜索' })).toHaveValue('站台');
  await expect(within(library(element)).getByRole('combobox', { name: '排序方式' })).toHaveValue('modified');
  await expect(within(library(element)).getByRole('combobox', { name: '排序方向' })).toHaveValue('desc');
  await expect(within(library(element)).getByRole('button', { name: '第 2 页' })).toHaveAttribute('aria-current', 'page');
  await expect(selected(element)).toBeVisible(); await expect(row(element, browserPrimaryId)).toHaveClass('inspected');
  await revealInspector(element);
  await expect(element.querySelector(`[data-asset-inspector="${browserPrimaryId}"]`)).toBeVisible();
  await waitFor(() => {
    const images = element.querySelectorAll<HTMLImageElement>(`[data-asset-inspector="${browserPrimaryId}"] img`);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) { expect(image.src).not.toBe(''); expect(image.naturalWidth).toBeGreaterThan(0); }
  });
  await expect(within(element).getByRole('button', { name: '恢复跟随' })).toBeVisible();
  await waitFor(() => expect(library(element).scrollTop).toBe(scroll));
  await waitFor(() => {
    const saved = JSON.parse(state(element).dataset.savedAssets!);
    expect(saved.selectedIds).toEqual([browserCheckedId]); expect(saved.primaryId).toBe(browserPrimaryId);
    expect(saved.primaryVersions).toContainEqual({ assetId: browserPrimaryId, variantId: browserPrimaryVersion });
    expect(saved.inspectorPin).toEqual({ assetId: browserPrimaryId, variantId: browserPrimaryVersion });
  });
};
const assertBatch = async (element: HTMLElement, ids: string[]) => {
  await waitFor(() => expect(state(element).dataset.scopeIds?.split(',').sort()).toEqual([...ids].sort()));
  await waitFor(() => expect([...library(element).querySelectorAll<HTMLElement>('[data-plugin-asset-id]')].map(item => item.dataset.pluginAssetId).sort()).toEqual([...ids].sort()));
  await expect(selected(element)).toBeVisible();
  for (const checkbox of within(library(element)).getAllByRole('checkbox')) await expect(checkbox).not.toBeChecked();
};

export const BatchReturn: Story = {
  parameters: { docs: { description: { story: '从第 2 页、图片/站台目录/名称筛选、修改时间降序、跨页勾选和固定旧版本开始。先由原回执查看本批并单击成功素材，再返回原现场；随后由问题打开同批，只重试原未导入路径，核对成功范围累计而选区保持，再返回原查询、页码、主对象、固定版本和滚动。原中央场景始终保留。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement); await expect(selected(canvasElement)).toBeVisible();
    await userEvent.click(canvas.getByText(/^导入回执 · /, { selector: 'summary' }));
    const viewBatch = within(receipt(canvasElement)).getByRole('button', { name: '查看本批' });
    viewBatch.focus({ preventScroll: true });
    library(canvasElement).scrollTop = 224; library(canvasElement).dispatchEvent(new Event('scroll'));
    const scroll = library(canvasElement).scrollTop; await expect(scroll).toBeGreaterThan(0);
    await userEvent.keyboard('{Enter}');
    await assertBatch(canvasElement, [FixtureIds.background]);
    await userEvent.click(within(row(canvasElement, FixtureIds.background)).getByText('雨站 · 背景'));
    await expect(row(canvasElement, FixtureIds.background)).toHaveClass('inspected');
    await expect(state(canvasElement)).toHaveAttribute('data-imports', '0'); await expect(state(canvasElement)).toHaveAttribute('data-applies', '0');
    await userEvent.click(canvas.getByRole('button', { name: '返回素材浏览' })); await assertOrigin(canvasElement, scroll);
    await userEvent.click(canvas.getByRole('button', { name: '布局' }));
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('menuitem', { name: '显示问题' }));
    const problem = canvasElement.querySelector<HTMLElement>(`[data-problem-id="import:${reviewBatchId}"]`)!;
    await userEvent.click(within(problem).getByRole('button', { name: '查看导入结果' }));
    await assertBatch(canvasElement, [FixtureIds.background]);
    await userEvent.click(within(receipt(canvasElement)).getByRole('button', { name: '重试未导入项' }));
    await waitFor(() => expect(state(canvasElement)).toHaveAttribute('data-imports', '1'));
    await expect(JSON.parse(state(canvasElement).dataset.importPaths!)).toEqual(browserFailurePaths);
    await expect(state(canvasElement)).toHaveAttribute('data-import-batch', reviewBatchId);
    await assertBatch(canvasElement, [FixtureIds.background, figureId]);
    await expect(receipt(canvasElement)).toHaveTextContent('已导入 2 项 · 未导入 1 项');
    await userEvent.click(canvas.getByRole('button', { name: '返回素材浏览' })); await assertOrigin(canvasElement, scroll);
    await expect(state(canvasElement)).toHaveAttribute('data-applies', '0'); await expect(state(canvasElement)).toHaveAttribute('data-saves', '0');
    await expect(canvasElement.querySelector(`[data-view="scene:${FixtureIds.street}"]`)).toBeVisible();
    state(canvasElement).dataset.result = 'passed';
  },
};
export const BatchReturnDusk: Story = { ...BatchReturn, args: { theme: 'dark' } };

export const PreviewAndFocus: Story = {
  args: { scenario: 'preview' }, parameters: { docs: { description: { story: '在原场景的真实对白字段留下未保存输入，单击素材只切换主对象。双击行名称打开同一 asset:<id> 中央文档，重复双击复用稳定文档；F2 开始改名并以 Esc 取消。聚焦浏览使用 Dock 原最大化状态，恢复后原中央场景、输入和跨页勾选继续保留。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    const scene = () => canvasElement.querySelector<HTMLElement>(`[data-view="scene:${FixtureIds.street}"]`)!;
    const dialogue = within(scene()).getAllByRole('textbox', { name: '对白正文' })[0] as HTMLTextAreaElement;
    const draft = `${dialogue.value} 保留这句雨后的对白。`;
    await userEvent.click(dialogue); await userEvent.clear(dialogue); await userEvent.type(dialogue, draft);
    await userEvent.click(within(row(canvasElement, browserPreviewId)).getByText('站台参考 052.png'));
    await waitFor(() => expect(row(canvasElement, browserPreviewId)).toHaveClass('inspected'));
    await waitFor(() => expect(state(canvasElement)).toHaveAttribute('data-applies', '1'));
    await revealInspector(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector(`[data-asset-inspector="${browserPreviewId}"]`)).toBeVisible());
    await expect(row(canvasElement, browserPrimaryId)).not.toHaveClass('inspected');
    await expect(canvasElement.querySelector(`[data-view="asset:${browserPreviewId}"]`)).toBeNull();
    await expect(scene()).toBeVisible(); await expect(selected(canvasElement)).toBeVisible();
    row(canvasElement, browserPreviewId).focus(); await userEvent.keyboard('{F2}');
    const name = await canvas.findByRole('textbox', { name: '素材名称' });
    await expect(name).toHaveAttribute('data-asset-name', browserPreviewId);
    await waitFor(() => expect(name).not.toHaveAttribute('readonly')); await userEvent.clear(name); await userEvent.type(name, '尚未确认的素材名称');
    await userEvent.keyboard('{Escape}'); await expect(name).toHaveValue('站台参考 052.png');
    await expect(state(canvasElement)).toHaveAttribute('data-renames', '0');
    await userEvent.dblClick(within(row(canvasElement, browserPreviewId)).getByText('站台参考 052.png'));
    await waitFor(() => expect(canvasElement.querySelector(`[data-view="asset:${browserPreviewId}"]`)).toBeVisible());
    await userEvent.dblClick(within(row(canvasElement, browserPreviewId)).getByText('站台参考 052.png'));
    await expect(canvasElement.querySelectorAll(`[data-view="asset:${browserPreviewId}"]`)).toHaveLength(1);
    await expect(state(canvasElement)).toHaveAttribute('data-renames', '0');
    const applies = state(canvasElement).dataset.applies!;
    await userEvent.click(canvas.getByRole('button', { name: '聚焦浏览' }));
    await expect(canvas.getByRole('button', { name: '还原浏览' })).toBeVisible();
    await expect(selected(canvasElement)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '还原浏览' }));
    await userEvent.click(canvas.getByRole('tab', { name: browserSceneTitle }));
    await waitFor(() => expect(scene()).toBeVisible());
    await expect(within(scene()).getAllByRole('textbox', { name: '对白正文' })[0]).toHaveValue(draft);
    await expect(selected(canvasElement)).toBeVisible(); await expect(state(canvasElement)).toHaveAttribute('data-applies', applies);
    await expect(state(canvasElement)).toHaveAttribute('data-imports', '0'); await expect(state(canvasElement)).toHaveAttribute('data-saves', '0');
    state(canvasElement).dataset.result = 'passed';
  },
};
export const PreviewAndFocusDusk: Story = { ...PreviewAndFocus, args: { scenario: 'preview', theme: 'dark' } };
