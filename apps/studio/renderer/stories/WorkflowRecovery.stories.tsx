import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Issue } from '@galcraft/contracts';
import { mountAuthoring } from '../authoring/view.js';
import type { WorkbenchBridge } from '../pages/Production/bridge.js';
import { problemsReviewFixture, type ReviewCalls } from './problems-fixture.js';

const failureMessage = '配置草稿暂时无法写入；工作流名称、模型族与待导入原文已保留。';
const retainedName = '雨站背景 · 待完成映射';
const retainedFamily = '雨站模型族';
const retainedPaste = '{ "unfinished": "保留这段尚未完成的导入原文"';

function WorkflowRecovery({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [calls, setCalls] = useState<ReviewCalls | null>(null), [workflowSaves, setWorkflowSaves] = useState(0);
  useEffect(() => {
    if (!host.current) return;
    let active = true;
    setReady(false); setError(''); setWorkflowSaves(0);
    const fixture = problemsReviewFixture('build', 'zh-CN', theme, next => { if (active) setCalls(next); });
    const bridge = fixture.services.bridge as unknown as WorkbenchBridge;
    const issue: Issue = { code: 'WORKFLOW_DRAFT_WRITE_FAILED', message: failureMessage,
      severity: 'error', owner: 'M10', related: [], actions: ['retry'], details: { retained: 'workflow configuration draft' } };
    bridge.production.saveWorkflowDraft = async () => {
      if (active) setWorkflowSaves(count => count + 1);
      return { ok: false, error: issue, issues: [issue] };
    };
    const container = document.createElement('div'); container.id = 'app'; container.dataset.locale = 'zh-CN'; container.dataset.theme = theme;
    host.current.append(container);
    let portals = document.getElementById('studio-portals'); const ownsPortals = !portals;
    if (!portals) { portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.theme = theme; portals.lang = 'zh-CN';
    let mounted: Awaited<ReturnType<typeof mountAuthoring>> | null = null;
    void mountAuthoring(container, fixture.services).then(async workspace => {
      mounted = workspace;
      if (!active) { workspace.dispose(); return; }
      await workspace.navigate('connections');
      if (active) setReady(true);
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; mounted?.dispose(); container.remove(); if (ownsPortals) portals.remove(); else portals.replaceChildren(); };
  }, [theme]);
  return <div data-theme={theme} data-review-ready={ready} data-review-workflow-save-calls={workflowSaves}
    data-review-import-calls={calls?.imports ?? 0} data-review-prepare-calls={calls?.prepares ?? 0}
    data-review-submit-calls={calls?.submits ?? 0} data-review-save-calls={calls?.saves ?? 0} data-review-build-calls={calls?.builds ?? 0}>
    {error && <p role="alert" className="product-story-error">{error}</p>}
    <div ref={host} className="product-story"/>
  </div>;
}

const meta = {
  id: 'review-studio-ux-refinement-workflow-recovery',
  title: 'Product/Studio/Workbench/Workflow Recovery', component: WorkflowRecovery,
  args: { theme: 'light' },
  parameters: { layout: 'fullscreen', docs: { description: { component: '已接受的 UXF-02 连接与工作流恢复。真实 mountAuthoring、ProductionSession、工作流编辑器与问题工作面；仅草稿保存服务返回受控失败。play 经实际编辑和保存产生原回执，转到制作后从问题返回原工作流。检查原 Issue 只显示一次、未保存名称／模型族／导入原文保持、查看回执不再次保存或生成。沿用已确认的稳定 Story ID；原生磁盘与外部服务不在此夹具范围。' } } },
} satisfies Meta<typeof WorkflowRecovery>;
export default meta;
type Story = StoryObj<typeof meta>;

const recoveryPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body);
  const fixture = canvasElement.querySelector<HTMLElement>('[data-review-ready]')!;
  await waitFor(() => expect(fixture).toHaveAttribute('data-review-ready', 'true'), { timeout: 30000 });
  await userEvent.click(await canvas.findByRole('button', { name: '添加工作流' }));
  await userEvent.type(await canvas.findByLabelText('工作流名称'), retainedName);
  await userEvent.type(canvas.getByLabelText('模型族'), retainedFamily);
  await userEvent.click(canvas.getByText('导入或替换工作流', { exact: true }));
  await userEvent.click(canvas.getByLabelText('粘贴 JSON'));
  await userEvent.paste(retainedPaste);
  await userEvent.click(canvas.getByRole('button', { name: '保存配置草稿' }));
  await waitFor(() => expect(fixture).toHaveAttribute('data-review-workflow-save-calls', '1'));
  const editor = canvasElement.querySelector<HTMLElement>('.workflow-configuration-document')!;
  await expect(await within(editor).findByText(failureMessage, { exact: true })).toBeVisible();
  await userEvent.click(canvas.getByRole('button', { name: '工作面' }));
  await userEvent.click(await body.findByRole('menuitem', { name: '制作' }));
  await waitFor(() => expect(editor).not.toBeVisible());
  await userEvent.click(canvas.getByRole('button', { name: '布局' }));
  await userEvent.click(await body.findByRole('menuitem', { name: '显示问题' }));
  const row = () => canvasElement.querySelector<HTMLElement>('[data-problem-id^="production-feedback:production:saveWorkflowDraft:"]');
  await waitFor(() => expect(row()).toBeVisible());
  await userEvent.click(within(row()!).getByRole('button', { name: '查看连接与工作流' }));
  await expect(await canvas.findByLabelText('工作流名称')).toHaveValue(retainedName);
  await expect(canvas.getByLabelText('模型族')).toHaveValue(retainedFamily);
  if (!canvas.getByLabelText('粘贴 JSON').checkVisibility()) await userEvent.click(canvas.getByText('导入或替换工作流', { exact: true }));
  await expect(canvas.getByLabelText('粘贴 JSON')).toHaveValue(retainedPaste);
  const returnedEditor = canvasElement.querySelector<HTMLElement>('.workflow-configuration-document')!;
  await expect(within(returnedEditor).getAllByText(failureMessage, { exact: true })).toHaveLength(1);
  await expect(within(returnedEditor).getByRole('alert')).toBeVisible();
  await userEvent.click(within(returnedEditor).getByText('诊断详情', { exact: true }));
  await expect(returnedEditor).toHaveTextContent('WORKFLOW_DRAFT_WRITE_FAILED');
  await userEvent.click(within(returnedEditor).getByText('诊断详情', { exact: true }));
  await expect(fixture).toHaveAttribute('data-review-workflow-save-calls', '1');
  for (const key of ['import', 'prepare', 'submit', 'save', 'build']) await expect(fixture).toHaveAttribute(`data-review-${key}-calls`, '0');
  fixture.dataset.reviewPlay = 'passed';
};

export const RetainedWorkflow: Story = { play: recoveryPlay };
export const RetainedWorkflowDark: Story = { args: { theme: 'dark' }, play: recoveryPlay };
