import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { mountAuthoring } from '../authoring/view.js';
import { problemsReviewFixture, reviewBatchId, reviewTaskId, reviewBuildPlanId, type ProblemsScenario, type ReviewCalls } from './problems-fixture.js';

function ProblemsReview({ scenario = 'import', locale = 'zh-CN', theme = 'light' }: {
  scenario?: ProblemsScenario; locale?: 'zh-CN' | 'en'; theme?: 'light' | 'dark';
}) {
  const host = useRef<HTMLDivElement>(null), reopen = useRef<(() => Promise<void>) | null>(null);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [calls, setCalls] = useState<ReviewCalls | null>(null);
  useEffect(() => {
    if (!host.current) return;
    let active = true, reopening = false;
    setReady(false); setError('');
    const fixture = problemsReviewFixture(scenario, locale, theme, next => { if (active) setCalls(next); });
    const container = document.createElement('div'); container.id = 'app'; container.dataset.locale = locale; container.dataset.theme = theme;
    host.current.append(container);
    let portals = document.getElementById('studio-portals'); const ownsPortals = !portals;
    if (!portals) { portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.locale = locale; portals.dataset.theme = theme;
    let mounted: Awaited<ReturnType<typeof mountAuthoring>> | null = null;
    void mountAuthoring(container, fixture.services).then(async workspace => {
      mounted = workspace;
      if (!active) { workspace.dispose(); return; }
      if (scenario === 'build') await workspace.navigate('publish');
      if (!active) return;
      setReady(true);
      reopen.current = async () => {
        if (!mounted || reopening) return;
        reopening = true; setReady(false);
        try {
          await mounted.flushInputDrafts(); mounted.dispose(); container.replaceChildren();
          mounted = await mountAuthoring(container, fixture.services);
          if (!active) mounted.dispose(); else setReady(true);
        } finally { reopening = false; }
      };
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => {
      active = false; reopen.current = null; mounted?.dispose(); container.remove();
      if (ownsPortals) portals.remove(); else portals.replaceChildren();
    };
  }, [scenario, locale, theme]);
  return <div data-theme={theme} data-locale={locale} data-review-ready={ready}
    data-review-import-reads={calls?.importReads ?? 0} data-review-production-reads={calls?.productionReads ?? 0}
    data-review-overview-reads={calls?.overviewReads ?? 0} data-review-import-calls={calls?.imports ?? 0}
    data-review-prepare-calls={calls?.prepares ?? 0} data-review-submit-calls={calls?.submits ?? 0}
    data-review-save-calls={calls?.saves ?? 0} data-review-build-calls={calls?.builds ?? 0} data-review-workspace-reads={calls?.workspaceReads ?? 0}>
    {error && <p role="alert" className="product-story-error">{error}</p>}
    <div ref={host} className="product-story" />
    <button type="button" disabled={!ready} style={{ position: 'fixed', insetBlockEnd: 4, insetInlineEnd: 20, zIndex: 20 }}
      title={locale === 'en' ? 'Story fixture only: preserve the in-memory receipts and personal workspace while remounting.' : '仅用于 Story 夹具：重挂载真实工作台，保留内存回执与个人工作区。'}
      onClick={() => void reopen.current?.().catch(reason => setError(String(reason)))}>
      {locale === 'en' ? 'Fixture: reopen workspace' : '夹具：重新打开工作台'}
    </button>
  </div>;
}

const meta = {
  id: 'review-studio-ux-refinement-problems', title: 'Product/Studio/Workbench/Problems', component: ProblemsReview,
  args: { scenario: 'import', locale: 'zh-CN', theme: 'light' },
  argTypes: { scenario: { control: 'select', options: ['import', 'production', 'build'] }, locale: { control: 'select', options: ['zh-CN', 'en'] }, theme: { control: 'select', options: ['light', 'dark'] } },
  parameters: { layout: 'fullscreen', docs: { description: { component: '已接受的 UXF-02 正式流程 Story。真实 mountAuthoring 与问题、导入、制作、发布、输出工作面；仅服务边界使用内存回执。后台刷新和“重新检查”只读既有状态，不会发起导入、制作、保存或构建。右下角“夹具”按钮仅供重开与忽略状态保留检查，不属于产品。沿用已确认的稳定 Story ID；原生文件选择、磁盘、外部服务和真实构建仍由所属宿主验证。' } } },
} satisfies Meta<typeof ProblemsReview>;
export default meta;
type Story = StoryObj<typeof meta>;

const openProblems = async (canvas: ReturnType<typeof within>, body: ReturnType<typeof within>, english: boolean) => {
  await userEvent.click(canvas.getByRole('button', { name: english ? 'Layout' : '布局' }));
  await userEvent.click(await body.findByRole('menuitem', { name: english ? 'Show problems' : '显示问题' }));
};
const ready = async (element: HTMLElement) => {
  const fixture = element.querySelector<HTMLElement>('[data-review-ready]')!;
  await waitFor(() => expect(fixture).toHaveAttribute('data-review-ready', 'true'), { timeout: 30000 });
  return fixture;
};
const noMutations = async (fixture: HTMLElement) => {
  for (const key of ['import', 'prepare', 'submit', 'save', 'build']) await expect(fixture).toHaveAttribute(`data-review-${key}-calls`, '0');
};
const importPlay: Story['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body), english = args.locale === 'en';
  const fixture = await ready(canvasElement);
  await openProblems(canvas, body, english);
  const row = () => canvasElement.querySelector<HTMLElement>(`[data-problem-id="import:${reviewBatchId}"]`);
  await waitFor(() => expect(row()).toBeVisible());
  await expect(row()).toHaveTextContent(english ? '2 items were not imported in this batch' : '本批 2 项未导入');
  await userEvent.click(within(row()!).getByRole('button', { name: english ? 'Ignore this attempt' : '忽略本次' }));
  await waitFor(() => expect(row()).toBeNull());
  await userEvent.click(canvas.getByRole('button', { name: english ? /^Ignored \(1\)/ : /^已忽略 \(1\)/ }));
  await waitFor(() => expect(row()).toBeVisible());
  await userEvent.click(within(row()!).getByRole('button', { name: english ? 'Bring back' : '重新关注' }));
  await userEvent.click(canvas.getByRole('button', { name: english ? /^Ignored \(0\)/ : /^已忽略 \(0\)/ }));
  await waitFor(() => expect(row()).toBeVisible());
  const before = Number(fixture.dataset.reviewImportReads);
  await userEvent.click(canvas.getByRole('button', { name: english ? 'Recheck' : '重新检查' }));
  await waitFor(() => expect(Number(fixture.dataset.reviewImportReads)).toBeGreaterThan(before));
  await noMutations(fixture);
  await userEvent.click(within(row()!).getByRole('button', { name: english ? 'Open import results' : '查看导入结果' }));
  const result = () => canvasElement.querySelector<HTMLElement>(`[data-import-batch="${reviewBatchId}"]`);
  await waitFor(() => expect(result()).toBeVisible());
  await expect(result()).toHaveTextContent(english ? '1 imported · 2 failed' : '已导入 1 项 · 未导入 2 项');
  await expect(within(result()!).getByRole('button', { name: english ? 'Retry failed files' : '重试未导入项' })).toBeEnabled();
  fixture.dataset.reviewPlay = 'passed';
};
const productionPlay: Story['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body), english = args.locale === 'en';
  const fixture = await ready(canvasElement);
  await openProblems(canvas, body, english);
  const row = () => canvasElement.querySelector<HTMLElement>(`[data-problem-id="production:${reviewTaskId}"]`);
  await waitFor(() => expect(row()).toBeVisible());
  await expect(row()).toHaveTextContent(english ? '2 production items are incomplete' : '2 项制作未完成');
  const before = Number(fixture.dataset.reviewProductionReads);
  await userEvent.click(canvas.getByRole('button', { name: english ? 'Recheck' : '重新检查' }));
  await waitFor(() => expect(Number(fixture.dataset.reviewProductionReads)).toBeGreaterThan(before));
  await noMutations(fixture);
  await userEvent.click(within(row()!).getByRole('button', { name: english ? 'Open task' : '查看制作任务' }));
  const steps = await canvas.findByText(english ? 'Execution steps and sources' : '执行步骤与来源');
  await userEvent.click(steps);
  await waitFor(() => expect(canvas.getAllByRole('button', { name: english ? 'Retry with new request' : '新增请求重试' })).toHaveLength(2));
  await expect(fixture).toHaveAttribute('data-review-prepare-calls', '0');
  fixture.dataset.reviewPlay = 'passed';
};
const buildPlay: Story['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body), english = args.locale === 'en';
  const fixture = await ready(canvasElement);
  const check = await canvas.findByRole('button', { name: english ? 'Check and build' : '检查并构建' });
  await waitFor(() => expect(check).toBeEnabled());
  await userEvent.clear(canvas.getByLabelText(english ? 'Output directory' : '输出目录'));
  await userEvent.type(canvas.getByLabelText(english ? 'Output directory' : '输出目录'), 'D:/review-fixture/windows-output');
  await userEvent.click(canvas.getByRole('button', { name: /^Windows/ }));
  await userEvent.click(check);
  await waitFor(() => expect(fixture).toHaveAttribute('data-review-build-calls', '1'));
  await userEvent.click(canvas.getByRole('button', { name: /^Web/ }));
  await openProblems(canvas, body, english);
  const row = () => canvasElement.querySelector<HTMLElement>('[data-problem-id="build:windows"]');
  await waitFor(() => expect(row()).toBeVisible());
  await userEvent.click(within(row()!).getByRole('button', { name: english ? 'Open build receipt' : '查看构建回执' }));
  const receipt = () => canvasElement.querySelector<HTMLElement>('[data-output="failure"]');
  await waitFor(() => expect(receipt()).toBeVisible());
  await expect(receipt()).toHaveTextContent(reviewBuildPlanId); await expect(receipt()).toHaveTextContent('windows');
  await expect(canvas.getByRole('button', { name: /^Web/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(fixture).toHaveAttribute('data-review-save-calls', '0');
  fixture.dataset.reviewPlay = 'passed';
};

export const ImportRecovery: Story = { args: { scenario: 'import' }, play: importPlay,
  parameters: { docs: { description: { story: '初始批次为 1 成功、2 失败。play 只检查忽略／重新关注、只读重检与原批次定位，保留全部恢复按钮供审核。手动点击“重试未导入项”：第一次变为 2 成功、1 失败；再次重试后全部成功、摘要消失。忽略后用“夹具：重新打开工作台”核对重开保留。' } } } };
export const ImportRecoveryDark: Story = { ...ImportRecovery, args: { scenario: 'import', theme: 'dark' } };
export const ProductionRecovery: Story = { args: { scenario: 'production' }, play: productionPlay,
  parameters: { docs: { description: { story: '同一任务两项失败，原 Issue、请求与任务身份保持。play 只读重检并打开同一任务，不消耗重试。手动展开原失败项，点“新增请求重试”→“准备计划”：首次产生可保留的请求失败；再次准备恢复。确认发送后出现新尝试失败，旧项由已提交的关联新任务替代；后续重试返回文本候选。' } } } };
export const ProductionRecoveryDark: Story = { ...ProductionRecovery, args: { scenario: 'production', theme: 'dark' } };
export const BuildRecovery: Story = { args: { scenario: 'build' }, play: buildPlay,
  parameters: { docs: { description: { story: '真实发布工作面在内存服务边界收到 Windows 构建失败。随后将当前目标切为 Web，再从问题打开原 Windows planId 回执；当前发布草稿仍为 Web。没有磁盘写入。' } } } };
export const BuildRecoveryDark: Story = { ...BuildRecovery, args: { scenario: 'build', theme: 'dark' } };
