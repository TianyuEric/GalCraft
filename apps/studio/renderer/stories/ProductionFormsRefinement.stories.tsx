import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DefaultTimeoutSecByPurpose, type CapabilityReport, type ConnectionConfig } from '@galcraft/contracts';
import { DomRegion } from './../authoring/workbench-host.js';
import { TooltipProvider } from './../components/ui/tooltip.js';
import { WorkbenchShell } from './../components/workbench/WorkbenchShell.js';
import { unwrap, workbenchBridge } from './../pages/Production/bridge.js';
import { Production } from './../pages/Production/Production.js';
import { ProductionSession } from './../pages/Production/session.js';
import { workflowFixture } from './../pages/Production/workflow-fixture.js';
import { ok, studioFixture } from './studio-fixture.js';
import '../authoring/shell.css';

const connectionName = '海道美术 · 本机 ComfyUI';
const positive = '落潮后的海边站台，列车窗映出一盏暖灯';
const failure = (message: string) => ({ ok: false as const, error: { code: 'STORY_PRODUCTION', severity: 'error' as const, owner: 'M10' as const, message, related: [], actions: [] }, issues: [] });
const submit = fn(async () => failure('服务暂时无法接收请求，请稍后重试。'));
const checkConnection = fn();
const saveConnection = fn();

function Workface({ theme = 'light', mode = 'draft' }: { theme?: 'light' | 'dark'; mode?: 'draft' | 'ui-plan' | 'connections' }) {
  const [model, setModel] = useState<{ session: ProductionSession; services: ReturnType<typeof studioFixture>['services'] }>();
  const [explorer] = useState(() => document.createElement('div'));
  const [inspector] = useState(() => document.createElement('div'));
  useEffect(() => {
    let mounted = true;
    const { services } = studioFixture('normal', 'zh-CN', theme), bridge = workbenchBridge(services.bridge);
    const overview = bridge.production.overview;
    void overview().then(result => {
      const data = unwrap(result);
      const projectId = data.tasks[0]!.projectId;
      let connection: ConnectionConfig = {
        id: 'ConnAA', revision: 2, name: connectionName, protocol: 'comfyUI', baseUrl: 'http://127.0.0.1:8188',
        auth: 'none', credentialId: null, apiKeyHeader: null, model: '', purposes: ['image'],
        timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: workflowFixture.id, serverFileRoot: null,
      };
      if (mode === 'ui-plan') {
        const candidate = data.candidates[0]!.candidate;
        candidate.operation = 'uiPlan';
        candidate.editedText = JSON.stringify({
          summary: '调整海边篇标题页',
          steps: [
            { key: 'step-title', kind: 'patch', description: '调整标题排版', instruction: '让标题与副标题保持清晰层级。', dependsOn: [], recipe: null, fields: {}, reuseAssets: [], assetKeys: [] },
            { key: 'step-background', kind: 'raster', description: '制作背景图', instruction: '保留标题左侧留白。', dependsOn: ['step-title'], recipe: null, fields: {}, reuseAssets: [], assetKeys: [] },
          ],
        });
        const draft = data.drafts[0]!;
        draft.activeUse = 'ui';
        draft.variants.ui = { ...structuredClone(draft.variants.script!), target: { ...draft.variants.script!.target, usage: 'ui', uiScope: { pageIds: [data.pages[0]!.id], componentIds: [] } } };
        data.tasks[1]!.sourceDraftId = draft.id;
        draft.submittedTaskId = data.tasks[1]!.id;
        bridge.production.prepareUIPlan = async () => failure('计划准备失败。检查连接后重试。');
      }
      bridge.production.overview = async () => {
        const fresh = unwrap(await overview());
        return ok({
          ...fresh, ...(mode === 'ui-plan' ? { tasks: data.tasks, drafts: data.drafts, candidates: data.candidates } : {}),
          connections: [structuredClone(connection)], workflows: [structuredClone(workflowFixture)],
          defaults: { connections: { background: connection.id }, recipes: {} },
        });
      };
      let latestDraft: Parameters<typeof bridge.production.saveDraft>[0]['draft'] | null = null;
      const saveDraft = bridge.production.saveDraft;
      bridge.production.saveDraft = async input => {
        const result = await saveDraft(input);
        if (result.ok) latestDraft = result.value;
        return result;
      };
      bridge.production.plan = async input => {
        const item = structuredClone(data.tasks[1]!.items[0]!);
        const variant = latestDraft?.variants.background;
        const instruction = String(variant?.fields.positive ?? '');
        item.purpose = 'image';
        item.input = { purpose: 'image', positive: instruction, negative: '', references: [] };
        item.configSnapshot = structuredClone(connection);
        if (variant) item.target = variant.target;
        return ok({
          planId: 'SendPlanA', expected: [], issues: [],
          task: { ...data.tasks[1]!, name: input.name, items: [item] },
          sendSummary: [{ itemId: item.id, destination: connection.baseUrl, model: workflowFixture.name, textCharacters: Array.from(instruction).length, media: [], requests: 1, price: null }],
        });
      };
      bridge.production.submit = submit;
      bridge.production.saveWorkflow = async () => failure('工作流保存失败。编辑内容已保留。');
      bridge.connections = {
        save: async value => { saveConnection(value); connection = structuredClone(value); return ok(value.id); },
        test: async selection => {
          checkConnection(selection);
          return ok<CapabilityReport>({
            connectionId: selection.connectionId, connectionRevision: connection.revision, checkedAt: '2026-11-18T08:00:00Z',
            serviceVersion: 'Storybook', purpose: selection.purpose, status: 'verified', inputs: [], output: 'image', models: [],
            promptFormat: null, textVision: null, remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [],
          });
        },
      };
      const session = new ProductionSession(bridge, projectId);
      session.taskId = mode === 'ui-plan' ? data.tasks[1]!.id : null;
      if (mounted) setModel({ session, services });
    });
    return () => { mounted = false; };
  }, [theme, mode]);
  return <div id="app" className="authoring-shell" data-theme={theme} lang="zh-CN" style={{ display: 'block', height: '100vh', overflow: 'hidden' }}>
    <div id="studio-portals" data-theme={theme} lang="zh-CN"/>
    <TooltipProvider>
      <WorkbenchShell title="制作工作台" activity={null} explorerTitle="工作区"
        explorer={<DomRegion node={explorer} className="production-explorer-host"/>}
        inspector={<DomRegion node={inspector} className="production-inspector-host"/>}
        documents={null} toolbar={null} panels={[]} initialPanelOpen={false} status="Storybook · 本地内存夹具">
        <div style={{ height: '100%', minHeight: 0, display: 'flex' }}>
          {model && <Production session={model.session} services={model.services} locale="zh-CN" navigate={() => {}} changed={async () => {}} explorerContainer={explorer} inspectorContainer={inspector}/>}
        </div>
      </WorkbenchShell>
    </TooltipProvider>
  </div>;
}

const meta = { id: 'review-studio-uxf-06-production-forms', title: 'Product/Studio/Workbench/Production Forms', component: Workface, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Workface>;
export default meta;
type Story = StoryObj<typeof meta>;

async function reviewRequest(canvas: ReturnType<typeof within>) {
  await userEvent.click(await canvas.findByRole('button', { name: '新建制作' }));
  await userEvent.click(await canvas.findByRole('option', { name: '生成背景' }));
  const prompt = await canvas.findByRole('textbox', { name: '正向提示' });
  const review = canvas.getByRole('button', { name: '查看发送计划' });
  await userEvent.click(review);
  await waitFor(() => expect(prompt).toHaveFocus());
  await userEvent.type(prompt, positive);
  await userEvent.click(review);
  const heading = await canvas.findByRole('heading', { name: '发送计划' });
  const frozen = canvas.getByRole('region', { name: '发送计划' });
  await waitFor(() => expect(heading).toHaveFocus());
  await expect(frozen).toHaveTextContent(positive);
  await expect(canvas.queryByRole('textbox', { name: '制作名称' })).not.toBeInTheDocument();
  await expect(submit).not.toHaveBeenCalled();
  await userEvent.click(canvas.getByRole('button', { name: '返回修改' }));
  await expect(await canvas.findByRole('textbox', { name: '正向提示' })).toHaveValue(positive);
  await waitFor(() => expect(review).toHaveFocus());
  await userEvent.click(review);
  await expect(await canvas.findByRole('heading', { name: '发送计划' })).toBeVisible();
}

export const RequestPlan: Story = {
  beforeEach: () => { submit.mockClear(); },
  play: async ({ canvasElement }) => reviewRequest(within(canvasElement)),
};

export const RequestFailureDusk: Story = {
  args: { theme: 'dark' },
  beforeEach: () => { submit.mockClear(); },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await reviewRequest(canvas);
    await userEvent.click(canvas.getByRole('button', { name: '开始生成' }));
    await expect(await canvas.findByText('服务暂时无法接收请求，请稍后重试。')).toBeVisible();
    await expect(canvas.getByRole('region', { name: '发送计划' })).toHaveTextContent(positive);
    await expect(submit).toHaveBeenCalledTimes(1);
  },
};

export const PlanSteps: Story = {
  args: { mode: 'ui-plan' },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '审阅 UI 计划' }));
    await expect(canvas.queryByRole('button', { name: '新建制作' })).not.toBeInTheDocument();
    const outline = within(canvas.getByRole('navigation', { name: '计划步骤' }));
    const step = outline.getByRole('button', { name: /制作背景图.*调整标题排版/ });
    await userEvent.click(step);
    const article = canvas.getByRole('heading', { name: '制作背景图' }).closest('article');
    await expect(article).toHaveFocus();
    const objective = canvas.getByRole('textbox', { name: '计划目标' });
    await userEvent.clear(objective);
    await userEvent.type(objective, '保留标题留白，确认背景图来源');
    await userEvent.click(canvas.getByRole('button', { name: '准备计划' }));
    await expect(await canvas.findByText('计划准备失败。检查连接后重试。')).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: '制作工作台' }));
    await userEvent.click(canvas.getByRole('tab', { name: /UI 计划与请求/ }));
    await expect(canvas.getByRole('textbox', { name: '计划目标' })).toHaveValue('保留标题留白，确认背景图来源');
  },
};

export const ConnectionAndWorkflowDusk: Story = {
  args: { mode: 'connections', theme: 'dark' },
  beforeEach: () => { checkConnection.mockClear(); saveConnection.mockClear(); },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('tab', { name: '连接与工具' }));
    await userEvent.click(await canvas.findByRole('treeitem', { name: connectionName }));
    const address = canvas.getByRole('textbox', { name: /服务地址/ });
    await userEvent.clear(address);
    await userEvent.type(address, 'invalid service address');
    await userEvent.click(canvas.getByRole('button', { name: '保存连接' }));
    await expect(await canvas.findByText('服务地址需使用 http 或 https')).toBeVisible();
    await expect(address).toHaveValue('invalid service address');
    await expect(saveConnection).not.toHaveBeenCalled();
    await userEvent.clear(address);
    await userEvent.type(address, 'http://127.0.0.1:8189');
    await userEvent.click(canvas.getByRole('button', { name: '保存并检查连接' }));
    const result = await canvas.findByRole('heading', { name: '服务已响应' });
    await expect(result).toHaveFocus();
    await expect(checkConnection).toHaveBeenCalledTimes(1);
    await userEvent.click(await canvas.findByRole('treeitem', { name: workflowFixture.name }));
    const workName = canvas.getByRole('textbox', { name: '工作流名称' });
    await userEvent.clear(workName);
    await userEvent.type(workName, '海边站台 · 等待保存的执行图');
    await userEvent.click(canvas.getByRole('button', { name: '更新可用配置' }));
    await waitFor(() => expect(canvas.getByText('工作流保存失败。编辑内容已保留。')).toBeVisible());
    await expect(workName).toHaveValue('海边站台 · 等待保存的执行图');
  },
};
