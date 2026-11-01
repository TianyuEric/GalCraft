import { useEffect, useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { BuildInputSchema, createId } from '@galcraft/contracts';
import type { BuildInput, BuildReceipt, Issue } from '@galcraft/contracts';
import type { AuthoringSource } from '../../authoring/controller.js';
import { studioFixture, ok } from '../../stories/studio-fixture.js';
import { productSnapshot } from '../../stories/product-fixture.js';
import { workbenchBridge, unwrap } from '../Production/bridge.js';
import { Publish } from './Publish.js';
import '../Production/production.css';
import '../../authoring/shell.css';
import './publish.css';

function Example({ theme = 'light', locale = 'zh-CN', blocked = false, localTest = 'passed', longHistory = false, empty = false, longResults = false, checkFailure = false, outputBlocked = false, pendingSigning = false, providerDiagnostics = false }: {
  theme?: 'light' | 'dark'; locale?: 'zh-CN' | 'en' | 'ja'; blocked?: boolean;
  localTest?: BuildReceipt['localTest']['result']; longHistory?: boolean; empty?: boolean;
  longResults?: boolean; checkFailure?: boolean; outputBlocked?: boolean; pendingSigning?: boolean; providerDiagnostics?: boolean;
}) {
  const services = useMemo(() => {
    const fixture = studioFixture(empty ? 'empty' : 'normal', locale, theme).services;
    const bridge = workbenchBridge(fixture.bridge);
    let input: BuildInput | null = null;
    const receipt = (result: BuildReceipt['localTest']['result']): BuildReceipt => ({ projectId: input!.projectId, releaseVersion: input!.releaseVersion,
      target: input!.target, outputDirectory: input!.outputDirectory, entry: 'index.html', handoff: { path: `${input!.outputDirectory}/雨站来信`, kind: 'directory' },
      instructionsPath: `${input!.outputDirectory}/交付说明.html`, localTest: { result, evidencePaths: [] } });
    bridge.projects.chooseDirectory = async () => ok('D:/发行/雨站来信');
    Object.assign(bridge, { files: { openBuild: async () => ok(undefined) }, assets: { verifyTarget: async () => ok({ issues: [] }) } });
    bridge.builds = { targets:async()=>ok([]),detectToolchain:async()=>ok({directory:""}),prepareToolchain:async()=>ok({directory:""}),cancelToolchain:async()=>ok({cancelled:false}),
      signingCertificates: async () => ok([]),
      status: async () => ok({ ready: true }), chooseOldSaves: async () => ok(['D:/旧档/雨站来信-0.1.0.json']),
      planBuild: async value => {
        input = BuildInputSchema.parse(value);
        if (outputBlocked) return { ok: false, error: { code: 'BUILD_OUTPUT_NOT_RELEASE', severity: 'error', owner: 'M11', message: '输出目录非空，且没有有效的发行清单。请选择新的空目录，或同一作品、同一目标的已有发行目录', related: [], actions: ['locate'] }, issues: [] };
        if (checkFailure) throw new Error(Array.from({ length: 70 }, (_, index) => `发布检查暂时失败：素材 ${index + 1} 的目标文件无法读取。请确认文件可用后重新检查。`).join('\n'));
        const issues: Issue[] = longResults ? Array.from({ length: 92 }, (_, index) => ({ code: `BUILD_ASSET_NOTE_${index + 1}`, message: `雨站来信 · 第 ${index + 1} 幅场景素材：${index % 3 ? '该素材在当前平台采用转换后的发行版本，请在构建后检查显示效果。' : '该素材在当前剧情中尚未被引用，可在高级发布设置中选择额外保留。'}`, severity: index % 3 ? 'warning' : 'info', owner: 'M11', related: [], actions: [] })) : [];
        if (providerDiagnostics) issues.push({ code: 'GALLERY_ENDING_REQUIRED', message: '鉴赏页面需要至少一个带结局标识的 end', severity: 'warning', owner: 'M11', related: [], actions: ['edit'] }, { code: 'STEAM_APP_ID', message: '请在作品平台设置中填写有效的 Steam AppID，并保存后重新检查。', severity: 'warning', owner: 'M09', related: [], actions: ['edit'] }, { code: 'PROVIDER_NOTE', message: 'This provider exports uncompressed audio.', severity: 'info', owner: 'M09', related: [], actions: [] });
        if (blocked && input.font.mode === 'full') issues.push({ code: 'BUILD_FONT_FALLBACK', message: '请为动态文字选择完整回退字体，然后重新检查。', severity: 'error', owner: 'M11', related: [], actions: ['edit'] });
        return ok({ planId: createId(), input, issues, capabilityResults: longResults ? Array.from({ length: 92 }, (_, index) => ({ provider: 'org.galcraft.assets', feature: `asset-${index + 1}`, target: input!.target, treatment: index % 3 ? 'converted' as const : 'native' as const, reason: `雨站来信 · 第 ${index + 1} 幅场景素材已完成目标平台检查。`, sources: [], required: false })) : [] });
      },
      build: async () => ok(receipt('notExecuted')), test: async () => ok(receipt(localTest)), cancel: async () => ok(undefined),
      compatibility: async () => ok(null), instructions: async () => ok(undefined),
    };
    bridge.upgrades.list = async () => ok([{ version: '0.1.0', targets: ['web', 'windows'], conversions: [] }]);
    bridge.upgrades.history = async () => ok(Array.from({ length: longHistory ? 16 : 0 }, (_, index) => ({ id: createId(), from: `1.0.${index}`, to: `1.1.${index}`, originalCopy: `D:/作品备份/雨站来信-引擎切换前-${index}/内容与素材`, state: 'committed' })));
    // Match production's saved-snapshot choice while all data stays in this story's memory.
    fixture.compilePreview = async () => {
      const docs = unwrap(await bridge.documents.list()), saved = docs.find(document => document.savedFiles['project.json'])!;
      const snapshot = productSnapshot(); snapshot.project = JSON.parse(saved.savedFiles['project.json']!).data;
      return ok({ snapshot, lastValid: null, current: true, issues: [] });
    };
    return fixture;
  }, [theme, locale, blocked, localTest, longHistory, empty, longResults, checkFailure, outputBlocked, providerDiagnostics]);
  const [source, setSource] = useState<AuthoringSource | null>(null);
  const [unapplied, setUnapplied] = useState(false);
  const refresh = async () => setSource(unwrap(await services.read()));
  useEffect(() => { void refresh(); }, [services]);
  return <><div id="studio-portals" data-theme={theme} lang={locale}/><div id="app" className="authoring-shell" data-theme={theme} data-release-unapplied={unapplied ? 'true' : 'false'} style={{ display: 'block', height: '100vh', overflow: 'hidden' }}>
    {source && <Publish source={source} services={services} changed={refresh} onUnappliedChange={setUnapplied} locale={locale} guiDraft={pendingSigning?{target:'windows',output:'D:/发行/雨站来信',windowsSigning:'certificate',certificate:'local-certificate'} as import('./Publish.js').PublishGuiDraft:undefined} saveAll={async () => {
      const bridge = workbenchBridge(services.bridge);
      const plan = unwrap(await bridge.documents.planSave({kind: 'all'}));
      unwrap(await bridge.documents.save(plan.planId));
    }}/>}
  </div></>;
}
const meta = { title: 'Product/Studio/Publish/Publish workflow', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SavedRelease: Story = {};
export const PendingSigning: Story = {args:{pendingSigning:true}};
export const WorkIdentity: Story = { play: async ({ canvas, canvasElement }) => {
  await userEvent.click(await canvas.findByText('作品名称、图标与 Windows 身份'));
  const name = canvas.getByLabelText('作品名称');
  await userEvent.clear(name); await userEvent.type(name, '星海来信');
  const executable = canvas.getByLabelText('可执行文件名');
  await userEvent.clear(executable); await userEvent.type(executable, 'Letters.exe');
  const publisher = canvas.getByLabelText('发行者');
  await userEvent.type(publisher, '星海制作组');
  await expect(canvasElement.querySelector('#app')).toHaveAttribute('data-release-unapplied', 'true');
  const version = canvas.getByLabelText('发行版本');
  await userEvent.clear(version); await userEvent.type(version, '1.0.1');
  await userEvent.click(canvas.getByRole('button', { name: '应用版本修改' }));
  await expect(canvas.getByLabelText('作品名称')).toHaveValue('星海来信');
  await expect(canvasElement.querySelector('#app')).toHaveAttribute('data-release-unapplied', 'true');
  await expect(canvas.getByLabelText('可执行文件名')).toHaveValue('Letters.exe');
  await expect(canvas.getByLabelText('发行者')).toHaveValue('星海制作组');
  await userEvent.click(canvas.getByRole('button', { name: '应用作品身份' }));
  await expect(canvas.getByText('有未保存修改')).toBeVisible();
  await expect(canvas.getByLabelText('作品名称')).toHaveValue('星海来信');
  await expect(canvasElement.querySelector('#app')).toHaveAttribute('data-release-unapplied', 'false');
  canvasElement.dataset.identityVerified = 'true';
} };
export const WorkIdentityDark: Story = { ...WorkIdentity, args: { theme: 'dark' } };
export const BlockedCheck: Story = { args: { blocked: true } };
export const FailedPlaytest: Story = { args: { localTest: 'failed' } };
export const LongEngineHistory: Story = { args: { longHistory: true } };
export const Dark: Story = { args: { theme: 'dark' } };
export const EmptyAssets: Story = { args: { empty: true } };
export const English: Story = { args: { locale: 'en' } };
export const ProviderDiagnostics: Story = { args: { providerDiagnostics: true, locale: 'en' } };
export const CurrentEngineCheck: Story = { play: async ({ canvas, canvasElement }) => {
  await userEvent.click(await canvas.findByRole('treeitem', { name: /^引擎版本与历史/ }));
  await userEvent.click(canvas.getByRole('combobox', { name: '目标引擎' }));
  await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('option', { name: /0.1.0.*检查当前版本/ }));
  await expect(await canvas.findByRole('button', { name: '准备副本并检查' })).toBeEnabled();
  await expect(canvas.getByText(/作品与依赖版本保持不变/)).toBeVisible();
} };
export const Workbench: Story = { play: async ({ canvas }) => {
  const explorer = canvas.queryByRole('button', { name: '发行导航' });
  if (explorer) await userEvent.click(explorer);
  await userEvent.click(await canvas.findByRole('treeitem', { name: '素材与字体' }));
  await expect(canvas.getByRole('combobox', { name: '字体处理' })).toBeVisible();
  await userEvent.click(canvas.getByRole('treeitem', { name: '检查与构建' }));
  await expect(canvas.getByRole('button', { name: '检查已保存版本' })).toBeVisible();
} };
export const LongResults: Story = {
  args: { longResults: true, blocked: true },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '选择目录' }));
    await userEvent.click(canvas.getByRole('button', { name: '检查已保存版本' }));
    await expect(await canvas.findByText('诊断：1 项阻塞 · 61 项警告 · 31 项提示')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '构建 Web' })).toBeDisabled();
  },
};
export const LongResultsDark: Story = { ...LongResults, args: { ...LongResults.args, theme: 'dark' } };
export const LongResultsEnglish: Story = { args: { longResults: true, blocked: true, locale: 'en' } };
export const LongResultsJapanese: Story = { args: { longResults: true, blocked: true, locale: 'ja', theme: 'dark' } };
export const LongCheckFailure: Story = {
  args: { checkFailure: true },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '选择目录' }));
    await userEvent.click(canvas.getByRole('button', { name: '检查已保存版本' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('素材 70');
  },
};

export const OutputDirectoryBlocked: Story = { args: { outputBlocked: true }, play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole('button', { name: '选择目录' }));
  await userEvent.click(canvas.getByRole('button', { name: '检查已保存版本' }));
  await expect(await canvas.findByRole('alert')).toHaveTextContent('输出目录非空');
  await expect(canvas.queryByText('检查完成，可以构建', { exact: true })).toBeNull();
} };
