import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { mountAuthoring } from '../authoring/view.js';
import { problemsReviewFixture, reviewBatchId } from './problems-fixture.js';

function ReadRecovery({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const host = useRef<HTMLDivElement>(null), fail = useRef<(value: boolean) => void>(() => {});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!host.current) return;
    let failed = false, active = true, workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
    const fixture = problemsReviewFixture('import', 'zh-CN', theme, () => {}), services = fixture.services;
    const read = services.bridge.assets!.listImportBatches;
    services.bridge.assets!.listImportBatches = async projectId => {
      if (!failed) return read(projectId);
      const issue = { code: 'ASSET_IMPORT_BATCH_READ', message: '夹具：批次回执暂时无法读取；原批次和失败项仍保留。', owner: 'M04' as const, severity: 'error' as const, related: [], actions: ['retry' as const] };
      return { ok: false, error: issue, issues: [issue] };
    };
    fail.current = value => { failed = value; };
    const app = document.createElement('div'); app.id = 'app'; app.dataset.locale = 'zh-CN'; app.dataset.theme = theme;
    host.current.append(app);
    const ownsPortals = !document.getElementById('studio-portals');
    if (ownsPortals) { const portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    void mountAuthoring(app, services).then(mounted => { workspace = mounted; if (!active) mounted.dispose(); })
      .catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; workspace?.dispose(); app.remove(); if (ownsPortals) document.getElementById('studio-portals')?.remove(); };
  }, [theme]);
  return <div data-theme={theme} data-locale="zh-CN" data-read-recovery="true">
    {error && <p role="alert">{error}</p>}<div ref={host} className="product-story" />
    <div style={{ position: 'fixed', insetBlockEnd: 4, insetInlineEnd: 20, zIndex: 20 }}>
      <button type="button" onClick={() => fail.current(true)}>夹具：使批次读取失败</button>
      <button type="button" onClick={() => fail.current(false)}>夹具：恢复批次读取</button>
    </div>
  </div>;
}
const meta = {
  id: 'review-studio-uxf02-read-recovery', title: 'Product/Studio/Workbench/Read Recovery', component: ReadRecovery,
  args: { theme: 'light' }, parameters: { layout: 'fullscreen', docs: { description: { component: '已接受的来源读取恢复流程：读取失败时保留原批次并标明需要重新检查。只有右下角两个夹具按钮控制服务返回；工作台、问题和重新检查均为同源实现。恢复读取后点击重新检查，旧批次继续显示，待复查标记和读取错误消失；不会执行导入或重试。沿用已确认的稳定 Story ID。' } } },
} satisfies Meta<typeof ReadRecovery>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FailedReads: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body);
  await waitFor(() => expect(canvasElement.querySelector(`[data-problem-id="import:${reviewBatchId}"]`)).toBeTruthy(), { timeout: 20000 });
  await userEvent.click(canvas.getByRole('button', { name: /^布局$/ }));
  await userEvent.click(await body.findByRole('menuitem', { name: /^显示问题$/ }));
  await userEvent.click(canvas.getByRole('button', { name: '夹具：使批次读取失败' }));
  await userEvent.click(canvasElement.querySelector<HTMLElement>('.gc-problems-recheck')!);
  await waitFor(() => expect(canvasElement.querySelector(`[data-problem-id="import:${reviewBatchId}"]`)).toHaveTextContent('需要重新检查'));
  await expect(canvas.getByText('检查尚未完成，已保留上次结果。')).toBeVisible();
  await expect(canvas.queryByText('当前没有问题。')).toBeNull();
  canvasElement.querySelector<HTMLElement>('[data-read-recovery]')!.dataset.followupPlay = 'passed';
} };
export const FailedReadsDark: Story = { ...FailedReads, args: { theme: 'dark' } };
