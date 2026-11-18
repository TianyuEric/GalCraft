import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DefaultTimeoutSecByPurpose, type CapabilityReport, type ConnectionConfig } from '@galcraft/contracts';
import type { WorkflowConfigurationDraft } from '@galcraft/authoring/production';
import { studioFixture, ok } from '../../stories/studio-fixture.js';
import { productSnapshot } from '../../stories/product-fixture.js';
import { ConnectionWorkbench } from './ConnectionWorkbench.js';
import { ProductionSession } from './session.js';
import { workbenchBridge } from './bridge.js';
import { workflowFixture } from './workflow-fixture.js';
import '../../authoring/shell.css';

const projectId = productSnapshot().projectId;
const connectionName = '本机 ComfyUI · 黄昏海岸与校园场景';
const draftName = '黄昏背景 · 尚未应用的映射';
function Example({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const [checks, setChecks] = useState(0);
  const [saves, setSaves] = useState(0);
  const [returned, setReturned] = useState(false);
  const [session] = useState(() => {
    const bridge = workbenchBridge(studioFixture('normal', 'zh-CN', theme).services.bridge);
    const overview = bridge.production.overview;
    const connection: ConnectionConfig = {
      id: 'ConnAA', revision: 2, name: connectionName, protocol: 'comfyUI', baseUrl: 'http://127.0.0.1:8188',
      auth: 'none', credentialId: null, apiKeyHeader: null, model: '', purposes: ['image'],
      timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {},
      workflowBindingId: workflowFixture.id, serverFileRoot: null,
    };
    const workflowDraft: WorkflowConfigurationDraft = {
      schemaVersion: 1, id: workflowFixture.id, revision: 4, name: draftName,
      workflow: { ...workflowFixture, name: draftName }, paste: '', availableRevision: workflowFixture.revision,
      updatedAt: '2026-11-10T10:00:00Z',
    };
    bridge.production.overview = async input => {
      const result = await overview(input);
      return result.ok ? ok({ ...result.value, connections: [connection], workflows: [workflowFixture], workflowDrafts: [workflowDraft] }) : result;
    };
    bridge.connections = {
      save: async () => { setSaves(count => count + 1); return ok(connection.id); },
      test: async selection => {
        setChecks(count => count + 1);
        return ok<CapabilityReport>({
          connectionId: selection.connectionId, connectionRevision: connection.revision, checkedAt: '2026-11-10T10:00:00Z',
          serviceVersion: 'Storybook', purpose: selection.purpose, status: 'verified', inputs: [], output: 'image',
          models: [], promptFormat: null, textVision: null, remote: { query: true, cancelQueued: true, cancelRunning: 'none' }, issues: [],
        });
      },
    };
    return new ProductionSession(bridge, projectId);
  });
  return <div id="app" data-theme={theme} className="authoring-shell" style={{ display: 'block', height: '100vh' }}>
    <div id="studio-portals" data-theme={theme} lang="zh-CN"/>
    {returned ? <p role="status">已返回制作任务</p> : <ConnectionWorkbench session={session} onReturn={() => setReturned(true)}/>}
    <output aria-label="检查与配置保存次数" style={{ position: 'absolute', insetInlineEnd: 8, bottom: 8 }}>{checks} / {saves}</output>
  </div>;
}

const meta = { title: 'Product/Studio/Connections/Workbench', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SavedConnection: Story = { play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole('treeitem', { name: connectionName }));
  await userEvent.click(canvas.getByRole('button', { name: '检查连接' }));
  await expect(await canvas.findByRole('heading', { name: '服务已响应' })).toBeVisible();
  await expect(canvas.getByLabelText('检查与配置保存次数')).toHaveTextContent('1 / 0');
  await userEvent.click(canvas.getByRole('button', { name: '返回制作任务' }));
  await expect(canvas.getByText('已返回制作任务')).toBeVisible();
} };

export const SavedAndDraftRevisions: Story = { args: { theme: 'dark' }, play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole('treeitem', { name: workflowFixture.name }));
  await expect(await canvas.findByRole('heading', { name: workflowFixture.name })).toBeVisible();
  await userEvent.click(canvas.getByRole('treeitem', { name: new RegExp(draftName) }));
  const draft = within(await canvas.findByRole('region', { name: draftName }));
  await expect(draft.getByRole('heading', { name: draftName })).toBeVisible();
  await expect(draft.getByText(/当前可用版本 3/)).toBeVisible();
  await expect(draft.getByText('配置草稿版本 4')).toBeVisible();
  await expect(canvas.getByRole('treeitem', { name: new RegExp(draftName) })).toHaveAttribute('aria-selected', 'true');
  await userEvent.click(canvas.getByRole('treeitem', { name: workflowFixture.name }));
  await expect(canvas.getByRole('heading', { name: workflowFixture.name })).toBeVisible();
} };
