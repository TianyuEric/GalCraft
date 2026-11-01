import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DefaultTimeoutSecByPurpose, type ConnectionConfig } from '@galcraft/contracts';
import { Button } from '../../components/controls.js';
import { WorkflowDialog } from './WorkflowDialog.js';
import { WorkflowEditor } from './WorkflowEditor.js';
import { ContextTable } from './ContextTable.js';
import { ServiceConnections } from './ServiceConnections.js';
import type { ProductionSession } from './session.js';
import { workflowFixture, contextFixture } from './workflow-fixture.js';
import './production.css';
import '../../authoring/shell.css';

function WorkflowStory({ theme = 'light', locale = 'zh-CN', empty = false, failSave = false }: { theme?: 'light' | 'dark'; locale?: string; empty?: boolean; failSave?: boolean }) {
  const [stored, setStored] = useState(JSON.stringify(empty ? { ...workflowFixture, name: '', purpose: null, imageUsages: null, usageGuidance: undefined, apiGraph: {}, inputs: [], outputs: [] } : workflowFixture, null, 2));
  const [open, setOpen] = useState(false);
  return <div id="app" data-theme={theme} className="authoring-shell production-story" lang={locale}><div id="studio-portals" data-theme={theme} lang={locale}/><Button onClick={() => setOpen(true)}>打开工作流</Button><p data-testid="saved-workflow-name">{JSON.parse(stored).name}</p>
    {open && <WorkflowDialog initialText={stored} locale={locale} close={() => setOpen(false)} save={async value => { if (failSave) throw new Error(locale === 'en' ? 'The workflow could not be saved. Please retry.' : '无法保存工作流，请重试。'); setStored(JSON.stringify(value, null, 2)); }}/>}</div>;
}
function InlineWorkflow({ theme = 'light', locale = 'zh-CN', unconfigured = false, long = false, importResult = 'success' }: { theme?: 'light' | 'dark'; locale?: string; unconfigured?: boolean; long?: boolean; importResult?: 'success' | 'cancel' | 'failure' }) {
  const initial = structuredClone(workflowFixture);
  if (unconfigured) { initial.imageUsages = []; delete initial.usageGuidance; }
  if (long) { initial.name = '黄昏海边与校园走廊的宽幅背景工作流及长名称说明'; initial.usageGuidance!.description = initial.usageGuidance!.description.repeat(5); }
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  return <div id="app" data-theme={theme} className="authoring-shell production-story" lang={locale}><div id="studio-portals" data-theme={theme} lang={locale}/><WorkflowEditor text={text} change={setText} locale={locale} chooseImport={async () => {
    if (importResult === 'failure') throw new Error('无法读取所选工作流，请重试。');
    return importResult === 'cancel' ? null : { path: 'D:/workflows/共享目录.json', text: JSON.stringify({ ...workflowFixture, name: '从共享选择器导入' }) };
  }}/></div>;
}
function ResumableWorkflow() {
  const initial = JSON.stringify(workflowFixture, null, 2);
  const [draft, setDraft] = useState({ text: initial, baseline: initial, paste: '', dirty: false, title: workflowFixture.name });
  const [away, setAway] = useState(false);
  return <div id="app" data-theme="light" className="authoring-shell production-story"><div id="studio-portals" data-theme="light"/>
    <Button onClick={() => setAway(value => !value)}>{away ? '返回源作品' : '切换作品'}</Button>
    {away ? <p>另一作品的独立工作区</p> : <WorkflowDialog inline initialText={draft.text} initialBaseline={draft.baseline} initialPaste={draft.paste} locale="zh-CN" onState={setDraft} close={() => {}} save={async () => {}}/>}
  </div>;
}
function ConfigurationDocument({ theme = 'light', conflict = false }: { theme?: 'light' | 'dark'; conflict?: boolean }) {
  const initial = { ...structuredClone(workflowFixture), name: '跨作品复用的黄昏与校园工作流配置', outputs: conflict ? workflowFixture.outputs : [] };
  const [draftSaves, setDraftSaves] = useState(0), [availableSaves, setAvailableSaves] = useState(0);
  return <div id="app" data-theme={theme} className="authoring-shell production-story" lang="zh-CN"><div id="studio-portals" data-theme={theme} lang="zh-CN"/>
    <WorkflowDialog inline initialText={JSON.stringify(initial, null, 2)} availableRevision={7} existingWorkflows={[{ ...workflowFixture, revision: 7 }]} locale="zh-CN" close={() => {}}
      chooseImport={async () => ({ path: 'workflow.json', text: JSON.stringify({ ...workflowFixture, revision: 3 }) })}
      saveDraft={async () => { setDraftSaves(value => value + 1); }} save={async workflow => { setAvailableSaves(value => value + 1); return { ...workflow, revision: 8 }; }}/>
    <output data-testid="configuration-save-counts">{draftSaves} / {availableSaves}</output>
  </div>;
}
function ContextStory({ theme = 'light', empty = false, locale='zh-CN', changed = false }: { theme?: 'light' | 'dark'; empty?: boolean; locale?:string; changed?:boolean }) {
  const [parts, setParts] = useState(() => { const parts = empty ? [] : structuredClone(contextFixture); if (changed && parts.length > 1) { parts[0].sourceText = 'Changed source text'; parts[1].sourceRemoved = true; } return parts; });
  return <div id="app" data-theme={theme} className="authoring-shell production-story"><div id="studio-portals" data-theme={theme} lang={locale}/><ContextTable parts={parts} change={setParts} locale={locale} removable/></div>;
}
function ConnectionsStory({ theme = 'light', locale = 'zh-CN' }: { theme?: 'light' | 'dark'; locale?: string }) {
  const [session] = useState(() => {
    const data = { connections: [{ id: 'ConnAA', revision: 1, name: '本机 ComfyUI · 背景与立绘', protocol: 'comfyUI', baseUrl: 'http://127.0.0.1:8188', auth: 'none', credentialId: null, apiKeyHeader: null, model: '', purposes: ['image'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: workflowFixture.id, serverFileRoot: null } as ConnectionConfig], workflows: [workflowFixture], defaults: { connections: {}, recipes: {} } };
    const ok = <T,>(value: T) => ({ ok: true, value, warnings: [] });
    return { data, connectionDirty: false, changed: () => {}, refresh: async () => {}, bridge: { connections: { save: async (value: ConnectionConfig) => { const index = data.connections.findIndex(item => item.id === value.id); if (index >= 0) data.connections[index] = value; else data.connections.push(value); return ok(value.id); }, test: async () => ok({ status: 'unavailable', issues: [{ message: 'Storybook 检查失败示例：未联系外部服务。' }], models: [] }) }, production: { saveDefaults: async (value: typeof data.defaults) => { data.defaults = value; return ok(value); } } } } as unknown as ProductionSession;
  });
  return <div id="app" data-theme={theme} className="authoring-shell production-story" lang={locale}><div id="studio-portals" data-theme={theme} lang={locale}/><ServiceConnections session={session} locale={locale} editWorkflow={() => {}}/></div>;
}
const meta = { title: 'Product/Studio/Production/WorkflowEditor', component: WorkflowStory, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof WorkflowStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Editable: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const Empty: Story = { args: { empty: true } };
export const SaveFailure: Story = { args: { failSave: true }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole('button', { name: '打开工作流' }));
  await userEvent.clear(body.getByLabelText('用途说明'));
  await userEvent.type(body.getByLabelText('用途说明'), '失败后保留的用途说明');
  await userEvent.click(body.getByRole('button', { name: /^(保存为可用|更新可用配置)$/ }));
  await expect(body.getByRole('alert')).toHaveFocus();
  await expect(body.getByLabelText('用途说明')).toHaveValue('失败后保留的用途说明');
} };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja', theme: 'dark' } };
export const GraphAndMappings: Story = { render: () => <InlineWorkflow/> };
export const ConfigurationDraft: Story = { render: () => <ConfigurationDocument/> };
export const ConfigurationDraftDark: Story = { render: () => <ConfigurationDocument theme="dark"/> };
export const ImportIdentityConflict: Story = { render: () => <ConfigurationDocument conflict/> };
export const SharedFileImport: Story = { render: () => <InlineWorkflow/>, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('导入或替换工作流', { exact: true }));
  await userEvent.click(await canvas.findByRole('button', { name: '导入 JSON 文件' }));
  await expect(canvas.getByLabelText('工作流名称')).toHaveValue('从共享选择器导入');
} };
export const SharedFileImportCancelled: Story = { render: () => <InlineWorkflow importResult="cancel"/>, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('导入或替换工作流', { exact: true }));
  await userEvent.type(canvas.getByLabelText('粘贴 JSON'), '本次未完成输入');
  await userEvent.click(await canvas.findByRole('button', { name: '导入 JSON 文件' }));
  await expect(canvas.getByLabelText('粘贴 JSON')).toHaveValue('本次未完成输入');
  await expect(canvas.getByLabelText('工作流名称')).toHaveValue(workflowFixture.name);
} };
export const SharedFileImportFailure: Story = { render: () => <InlineWorkflow importResult="failure"/>, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('导入或替换工作流', { exact: true }));
  await userEvent.click(await canvas.findByRole('button', { name: '导入 JSON 文件' }));
  await expect(canvas.getByRole('alert')).toHaveTextContent('无法读取所选工作流，请重试。');
  await expect(canvas.getByLabelText('工作流名称')).toHaveValue(workflowFixture.name);
} };
export const UsageGuidance: Story = { render: () => <InlineWorkflow/>, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('使用指导与示例', { exact: true }));
  await expect(canvas.getByLabelText('适用场景')).toHaveValue('黄昏海边的日常场景\n章节转换时的环境定格');
  await userEvent.clear(canvas.getByLabelText('示例说明 1'));
  await userEvent.type(canvas.getByLabelText('示例说明 1'), '检查字幕留白与光线。');
  await expect(canvas.getByLabelText('示例说明 1')).toHaveValue('检查字幕留白与光线。');
} };
export const UsageGuidanceDark: Story = { render: () => <InlineWorkflow theme="dark" long/>, play: async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByText('使用指导与示例', { exact: true }));
} };
export const UnconfiguredImageUses: Story = { render: () => <InlineWorkflow unconfigured/> };
export const RawApiPurposeSelection: Story = { render: () => <InlineWorkflow/>, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('导入或替换工作流', { exact: true }));
  const input = canvas.getByLabelText('粘贴 JSON');
  await userEvent.click(input);
  await userEvent.paste(JSON.stringify(workflowFixture.apiGraph));
  await userEvent.click(canvas.getByRole('button', { name: '识别并导入' }));
  await expect(canvas.getByLabelText('用途 / 公开操作', { exact: true })).toHaveTextContent('图像');
  await expect(canvas.getByLabelText('背景', { exact: true })).toBeChecked();
  await expect(canvas.getByLabelText('画布与数量 · width', { exact: true })).toHaveTextContent('宽度');
} };
export const ContextSelection: Story = { render: () => <ContextStory/> };
export const ContextDark: Story = { render: () => <ContextStory theme="dark"/> };
export const ContextEmpty: Story = { render: () => <ContextStory empty/> };
export const ServiceSheet: Story = { render: () => <ConnectionsStory/> };
export const ServiceSheetDark: Story = { render: () => <ConnectionsStory theme="dark"/> };

export const ContextEnglish: Story = { render: () => <ContextStory locale="en"/> };
export const ContextJapaneseDusk: Story = { render: () => <ContextStory locale="ja" theme="dark"/> };

export const ContextSourcesChanged: Story = { render: () => <ContextStory changed/> };
export const DraftRemount: Story = {
  render: () => <ResumableWorkflow/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText('工作流名称'));
    await userEvent.type(canvas.getByLabelText('工作流名称'), '源作品未保存工作流');
    await userEvent.type(canvas.getByLabelText('模型族'), 'local-family-A');
    await userEvent.click(canvas.getByText('导入或替换工作流'));
    await userEvent.type(canvas.getByLabelText('粘贴 JSON'), '未完成的 JSON 原文');
    await userEvent.click(canvas.getByRole('button', { name: /^切换作品$/ }));
    await expect(canvas.queryByLabelText('工作流名称')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: /^返回源作品$/ }));
    await expect(canvas.getByLabelText('工作流名称')).toHaveValue('源作品未保存工作流');
    await expect(canvas.getByLabelText('模型族')).toHaveValue('local-family-A');
    await userEvent.click(canvas.getByText('导入或替换工作流'));
    await expect(canvas.getByLabelText('粘贴 JSON')).toHaveValue('未完成的 JSON 原文');
    await expect(canvas.getByText('有未保存修改', { exact: true })).toBeVisible();
  },
};
