import { createId } from '@galcraft/contracts';
import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ConnectionConfig } from '@galcraft/contracts';
import { operations as voiceStudioOperations, pluginId as voiceStudioId, providerKey as voiceStudioProvider } from '@galcraft/official-voicestudio/definition';
import { studioFixture } from '../../stories/studio-fixture.js';
import { Production } from './Production.js';
import { ProductionSession } from './session.js';
import { OfficialRecipes } from '@galcraft/authoring/recipes/official';
import { unwrap, type WorkbenchBridge } from './bridge.js';
import '../../authoring/shell.css';
import { WorkbenchShell } from '../../components/workbench/WorkbenchShell.js';
import { TooltipProvider } from '../../components/ui/tooltip.js';
import { DomRegion } from '../../authoring/workbench-host.js';
import { workflowFixture } from './workflow-fixture.js';

function WorkbenchExample({ theme = 'light', many = false, saveReview = false, locale='zh-CN', workbench = false, draft = false, empty = false, reviews = false, extendedPlan = false, adoptedRefreshFailure = false, voiceStudio = false }: { theme?: 'light' | 'dark'; many?: boolean; saveReview?: boolean; locale?:'zh-CN'|'en'|'ja'; workbench?: boolean; draft?: boolean; empty?: boolean; reviews?: boolean; extendedPlan?: boolean; adoptedRefreshFailure?: boolean; voiceStudio?: boolean }) {
  const [model, setModel] = useState<{ session: ProductionSession; services: ReturnType<typeof studioFixture>['services'] } | null>(null);
  const [explorer] = useState(() => document.createElement('div'));
  const [inspector] = useState(() => document.createElement('div'));
  useEffect(() => {
    let active = true;
    const { services } = studioFixture('normal', locale, theme), bridge = services.bridge as unknown as WorkbenchBridge;
    const ok = <T,>(value: T) => ({ ok: true as const, value, warnings: [] });
    void bridge.production.overview().then(async result => {
      const data = unwrap(result), defaults = { connections: {} as Record<string, string>, recipes: {} as Record<string, string> };
      const projectId = data.tasks[0]!.projectId;
      const connection: ConnectionConfig = { id: createId(), revision: 1, name: '我的文字服务', protocol: 'chatCompletions', baseUrl: 'https://example.invalid', model: 'story-model', auth: 'bearer', credentialId: createId(), apiKeyHeader: null, purposes: ['text'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: { stream: true }, workflowBindingId: null, serverFileRoot: null };
      data.connections = [connection, { ...connection, id: createId(), name: '本机图像工具', protocol: 'comfyUI', baseUrl: 'http://127.0.0.1:8188', model: '', auth: 'none', credentialId: null, purposes: ['image'] }];
      if (voiceStudio) {
        data.operations = voiceStudioOperations.map(definition => ({ id: definition.id, version: definition.version, provider: { id: voiceStudioId, version: '0.1.0' }, definition }));
        data.connections.push({ ...connection, id: createId(), name: 'VoiceStudio（离线夹具）', protocol: 'voiceStudio', providerKey: voiceStudioProvider, baseUrl: 'http://voicestudio.example.invalid', model: 'omnivoice', auth: 'none', credentialId: null, purposes: ['speech'] });
      }
      data.defaults = defaults;
      data.recipes = structuredClone([...OfficialRecipes]);
      data.workflows = [structuredClone(workflowFixture), { ...structuredClone(workflowFixture), id: 'FlowBB', name: '角色立绘 · 图像流程', imageUsages: ['figure'] }];
      bridge.production.saveWorkflow = async ({ workflow, expectedRevision }) => {
        if (workflow.name.includes('保存失败')) return { ok: false, error: { code: 'TEST_SAVE', severity: 'error', owner: 'M10', message: '无法保存工作流，请重试', related: [], actions: [] }, issues: [] };
        const existing = data.workflows.find(item => item.id === workflow.id);
        if ((existing?.revision ?? null) !== expectedRevision) throw new Error('工作流版本已变化');
        data.workflows = [...data.workflows.filter(item => item.id !== workflow.id), workflow]; return ok(workflow);
      };
      if (empty) { data.recipes = []; data.connections = []; data.workflows = []; data.tasks = []; data.drafts = []; data.candidates = []; }
      if (many) data.tasks = Array.from({ length: 87 }, (_, i) => ({ ...structuredClone(data.tasks[i % 3]!), id: createId(), name: `第 ${i + 1} 项 · 雨夜车站的告别与尚未寄出的长信剧情制作` }));
      bridge.production.overview = async () => ok(structuredClone(data));
      bridge.production.saveDefaults = async input => { Object.assign(defaults, input); return ok(input); };
      bridge.production.removeConnection = async id => { data.connections = data.connections.filter(c => c.id !== id); return ok(undefined); };
      bridge.connections = { save: async config => { data.connections = [...data.connections.filter(c => c.id !== config.id), config]; return ok(config.id); }, test: async input => ok({ connectionId: input.connectionId, connectionRevision: 1, checkedAt: new Date().toISOString(), serviceVersion: null, purpose: input.purpose, status: 'unverified', inputs: [], output: 'text', models: ['story-model', 'writing-model'], promptFormat: null, textVision: null, remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [] }) };
      if (saveReview) {
        const documents = unwrap(await bridge.documents.list());
        const character = documents.find(document => Object.keys(document.files).some(path => path.startsWith('characters/')))!;
        const path = Object.keys(character.files).find(path => path.startsWith('characters/'))!;
        const current = JSON.parse(character.files[path]!);
        current.data.name = '夏川澪 · 雨夜造型';
        character.files[path] = JSON.stringify(current);
        // A changed revision can have no remaining difference after restoring its contents.
        const restored = documents.find(document => 'project.json' in document.files)!;
        for (const document of [character, restored]) { document.revision++; document.dirty = true; }
        bridge.documents.list = async () => ok(structuredClone(documents));
        bridge.documents.planSave = async () => ok({ planId: createId(), members: [character.documentId, restored.documentId], versions: [character, restored].map(document => ({ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision })), files: [character, restored].flatMap(document => Object.keys(document.files).map(path => ({ documentId: document.documentId, path, oldExists: true, newExists: true }))), extraDirtyMembers: [], objects: [{documentId:character.documentId,kind:'document' as const,objectId:null,key:`${character.documentId}:document`,revision:character.revision,name:current.data.name,paths:[path]}],requestedObjects:[`${character.documentId}:document`],reasons:[],preview:[character] });
        const save = bridge.documents.save;
        bridge.documents.save = async planId => { const result = await save(planId); if (result.ok) for (const document of documents) { document.savedFiles = structuredClone(document.files); document.savedRevision = document.revision; document.dirty = false; } return result; };
      }
      if (reviews || adoptedRefreshFailure) {
        const candidate = data.candidates[0]!.candidate, draft = data.drafts[0]!;
        candidate.operation = 'uiPlan'; candidate.editedText = JSON.stringify({ summary: '调整标题页', steps: extendedPlan ? ['patch','svg','raster'].map((kind,index)=>({key:`step-${index}`,kind,description:['调整标题排版','制作矢量装饰','制作背景图片'][index],instruction:'保留作品现有叙事风格，改善标题的阅读层级。',dependsOn:index?[`step-${index-1}`]:[],recipe:null,fields:{},reuseAssets:[],assetKeys:[]})) : [] });
        draft.activeUse = 'ui'; draft.variants.ui = { ...structuredClone(draft.variants.script!), target: { ...draft.variants.script!.target, usage: 'ui', uiScope: { pageIds: [data.pages[0]!.id], componentIds: [] } } };
        data.tasks[1]!.sourceDraftId = draft.id; draft.submittedTaskId = data.tasks[1]!.id;
        bridge.production.select = async () => ok({ planId: 'AdoptA', input: { origin: 'candidate', label: '采用候选', expected: data.versions, patches: [], preparedAssets: [], requiredRefs: [] }, members: [], issues: [], before: {}, preview: [{ ref: { kind: 'document', id: 'SceneA' }, description: '追加两条对白' }] });
        bridge.production.discardAdoption = async () => ok(undefined);
        bridge.production.apply = async () => { throw new Error('来源已变化，请重新审阅；范围保留。'); };
        if (adoptedRefreshFailure) bridge.production.apply = async () => {
          data.candidates[0]!.adoption = 'adopted';
          return ok({ operationId: 'ApplyA', groupId: 'GroupA', documents: [], dirty: [], assetIds: [] });
        };
        bridge.files = { ...bridge.files, pickRecipes: async () => ok(['fixture.json']) };
        bridge.production.planRecipeImport = async () => ok({ planId: 'ImportA', recipes: [{ ...structuredClone(OfficialRecipes[0]!), scope: 'project', projectId }], destination: 'project', projectId, expected: data.versions, issues: [] });
        bridge.production.applyRecipeImport = async () => { throw new Error('导入暂时失败，审阅内容保留。'); };
      }
      const session = new ProductionSession(bridge, projectId); session.data = data;
      session.taskId = many ? data.tasks[0]?.id ?? null : data.tasks[1]?.id ?? null;
      if (draft) await session.startQuick('background');
      if (active) setModel({ session, services });
    });
    return () => { active = false; };
  }, [theme, many, saveReview, locale, draft, empty, reviews, extendedPlan, adoptedRefreshFailure, voiceStudio]);
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const content = model && <Production session={model.session} services={model.services} locale={locale} navigate={() => {}} changed={async () => { if (adoptedRefreshFailure && refreshAttempts === 0) { setRefreshAttempts(1); throw new Error('示例工作区刷新失败'); } }} explorerContainer={workbench ? explorer : undefined} inspectorContainer={workbench ? inspector : undefined}/>;
  return <div data-theme={theme} lang={locale}><div id="studio-portals" lang={locale} data-theme={theme}/><div id="app" className="authoring-shell" data-theme={theme} style={{ height: '100vh', overflow: 'hidden', display: workbench ? 'block' : 'flex' }}>{workbench ? <TooltipProvider><WorkbenchShell title="制作工作台" activity={null} explorerTitle="工作区" explorer={<DomRegion node={explorer} className="production-explorer-host"/>} inspector={<DomRegion node={inspector} className="production-inspector-host"/>} documents={null} toolbar={null} panels={[]} initialPanelOpen={false} status="Storybook · 本地内存夹具"><div style={{ height: '100%', minHeight: 0, display: 'flex' }}>{content}</div></WorkbenchShell></TooltipProvider> : content}</div></div>;
}
const meta = { title: 'Product/Studio/Production/Production workflow', component: WorkbenchExample, args: { locale: 'zh-CN', theme: 'light' }, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof WorkbenchExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ContinuingStory: Story = {};
export const AdoptedRefreshFailure: Story = { args: { workbench: true, adoptedRefreshFailure: true } };
export const ManyTasks: Story = { args: { many: true, workbench: true } };
export const ModifiedSaveReview: Story = { args: { saveReview: true } };
export const DarkConnections: Story = { args: { theme: 'dark' } };
export const English: Story = {args:{locale:'en'}};
export const Japanese: Story = {args:{locale:'ja'}};
export const WorkbenchSections: Story = { args: { workbench: true, draft: true }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await waitFor(() => expect(canvas.getByRole('tab', { name: '方案库' })).toBeVisible());
  await userEvent.click(canvas.getByRole('tab', { name: '方案库' }));
  await waitFor(() => expect(canvasElement.querySelector('.production-library-list')).toBeVisible());
  await expect(canvasElement.querySelector('.production-layout')).not.toBeVisible();
  await expect(canvasElement.querySelector('.production-inspector')).not.toBeVisible();
  await expect(canvasElement.querySelector('.production-library-list')?.closest('.gc-wb-explorer')).not.toBeNull();
  await userEvent.click(canvas.getByRole('tab', { name: '连接与工具' }));
  await waitFor(() => expect(canvasElement.querySelector('.connection-workspace-list')).toBeVisible());
  await expect(canvasElement.querySelector('.production-library-list')).not.toBeVisible();
  await expect(canvasElement.querySelector('.connection-workspace-list')?.closest('.gc-wb-explorer')).not.toBeNull();
  await userEvent.click(canvas.getByRole('tab', { name: '制作与候选' }));
  await waitFor(() => expect(canvasElement.querySelector('.production-layout')).toBeVisible());
  await expect(canvasElement.querySelector('.connection-workspace-list')).not.toBeVisible();
} };
export const WorkbenchDark: Story = { args: { workbench: true, draft: true, theme: 'dark', locale: 'en' } };
export const WorkbenchEmpty: Story = { args: { workbench: true, empty: true } };
export const Round2Workflows: Story = { args: { workbench: true, draft: true } };

export const Round2Reviews: Story = { args: { workbench: true, reviews: true } };

export const Stage5PlanReview: Story = { args: { workbench:true,reviews:true,extendedPlan:true } };

export const VoiceStudioCreate: Story = { args: { workbench: true, voiceStudio: true }, play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole('button', { name: '新建制作' }));
  await userEvent.type(canvas.getByRole('combobox', { name: '搜索制作类型' }), 'VoiceStudio');
  await expect(canvas.getAllByRole('option', { name: /VoiceStudio/ })).toHaveLength(4);
  await userEvent.click(canvas.getByRole('option', { name: /VoiceStudio · Speech/ }));
  await expect(await canvas.findByRole('textbox', { name: '制作名称' })).toHaveValue('VoiceStudio · Speech');
  await expect(await canvas.findByText('草稿已保存', { exact: true })).toBeVisible();
} };
