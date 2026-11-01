import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { TaskItem } from '@galcraft/authoring/production';
import type { ResourceSnapshot } from '@galcraft/contracts';
import { productionRecords } from '../../stories/production-fixture.js';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { TaskItemFeedback } from './TaskItemFeedback.js';
import '../../authoring/shell.css';
const item = structuredClone(productionRecords(FixtureSnapshot).tasks[0]!.items[0]!);
item.state = 'running'; item.progress = { phase: 'executing', completed: 12, total: 30, scope: 'sampling', nodeId: '42', nodeName: 'KSampler', elapsedMs: 32000, updatedAt: '2026-10-23T04:00:00Z' };
item.configSnapshot = { ...item.configSnapshot!, protocol: 'comfyUI' };
const snapshot: ResourceSnapshot = { serviceUrl: 'http://127.0.0.1:8188', checkedAt: '2026-10-23T04:00:00Z', queue: { running: [], pending: [] }, system: { ramTotal: 32 * 1024 ** 3, ramFree: 12 * 1024 ** 3 }, devices: [{ name: 'Local GPU', type: 'cuda', index: 0, vramTotal: 12 * 1024 ** 3, vramFree: 8 * 1024 ** 3, torchVramTotal: null, torchVramFree: null }], hostCommit: { usedBytes: 24 * 1024 ** 3, limitBytes: 48 * 1024 ** 3, checkedAt: '2026-10-23T04:00:00Z' }, issues: [] };
const bridge = { inspectTaskResources: async () => ({ ok: true as const, value: snapshot, warnings: [] }), releaseTaskResources: async () => ({ ok: true as const, value: { status: 'unverified' as const, requestedAt: snapshot.checkedAt, before: snapshot, after: snapshot, issues: [] }, warnings: [] }) };
function Example({ locale = 'zh-CN', theme = 'light', unknown = false, failed = false }: { locale?: string; theme?: string; unknown?: boolean; failed?: boolean }) {
  const current: TaskItem = structuredClone(item);
  if (unknown) current.progress = { phase: 'running', completed: null, total: null, scope: 'unknown', elapsedMs: 40000 };
  if (failed) { current.state = 'failed'; current.progress = { phase: 'failed', completed: null, total: null, scope: 'unknown' }; current.issues = [{ code: 'COMFY_EXECUTION', message: '原始服务错误：custom node unavailable', owner: 'M10', severity: 'error', related: [], actions: ['edit', 'retry'] }]; current.remoteError = { promptId: 'original-prompt', nodeId: '42', nodeType: 'CustomSpeech', exceptionType: 'RuntimeError', message: 'Original provider error: model missing', traceback: ['Traceback (most recent call last):', 'RuntimeError: model missing'], observedAt: snapshot.checkedAt }; }
  return <div className="authoring-shell" data-theme={theme} style={{ padding: 16, maxWidth: 760 }}><TaskItemFeedback taskId="TaskAA" item={current} bridge={bridge} locale={locale}/></div>;
}
const meta = { title: 'Product/Studio/Production/Production task feedback', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Sampling: Story = { play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(c.getByText(/当前采样节点 12 \/ 30/)).toBeVisible(); await userEvent.click(c.getByText('实例资源与释放')); await userEvent.click(c.getByRole('button', { name: '检查资源' })); await expect(await c.findByText('本机 Windows 提交量 / 上限')).toBeVisible(); await userEvent.click(c.getByRole('button', { name: '释放实例资源' })); await userEvent.click(c.getByRole('button', { name: '确认释放' })); await expect(await c.findByText('已接收请求，释放尚未核实')).toBeVisible(); } };
export const Unknown: Story = { args: { unknown: true, locale: 'en' } };
export const Failure: Story = { args: { failed: true } };
export const JapaneseDark: Story = { args: { failed: true, theme: 'dark', locale: 'ja' } };
