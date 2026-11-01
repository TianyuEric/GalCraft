import { useMemo, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createId } from '@galcraft/contracts';
import type { Issue, Result } from '@galcraft/contracts';
import type { PluginManifest } from '@galcraft/plugins';
import voiceStudioManifest from '../../../../../plugins/official-voicestudio/package/manifest.json';
import { studioFixture, ok } from '../../stories/studio-fixture.js';
import { productSnapshot } from '../../stories/product-fixture.js';
import { workbenchBridge } from '../Production/bridge.js';
import { Plugins } from './Plugins.js';
import type { StudioPluginHost } from './studio-host.js';
import '../Production/production.css';
import '../../authoring/shell.css';
import './plugins.css';

function Example({ theme = 'light', long = false, empty = false, duplicateRegistrations = false, diagnostics = false, locale='zh-CN', missing=false, defaultServices=false }: { locale?:string; missing?:boolean; theme?: 'light' | 'dark'; long?: boolean; empty?: boolean; duplicateRegistrations?: boolean; diagnostics?: boolean; defaultServices?: boolean }) {
  const bridge = useMemo(() => {
    const value = workbenchBridge(studioFixture('normal', 'zh-CN', theme).services.bridge), snapshot = productSnapshot();
    const manifest: PluginManifest = { schemaVersion: 1, id: 'org.galcraft.storybook', name: '角色关系与剧情资料扩展', description: '为当前作品提供角色关系和剧情资料管理。', author: 'GalCraft', license: 'MIT', homepage: null, version: '0.1.0',
      engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], entry: { runtime: null, editor: 'editor.js' }, files: [{ path: 'editor.js', size: 1 }], contributions: [], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
    manifest.localizations = {
      en: { name: 'Character Relationships', description: 'Manage character relationships and story notes for the current project.' },
      ja: { name: 'キャラクター関係', description: '現在の作品のキャラクター関係とシナリオ資料を管理します。' },
    };
    if (diagnostics) {
      manifest.entry.definition = 'definition.js'; manifest.entry.services = 'services.js'; manifest.entry.runtime = 'runtime.js';
      manifest.contributions = (['assetType', 'resource', 'stage', 'assetEditor', 'assetPreview', 'assetThumbnail'] as const).map((kind, index) => ({
        kind, key: `${manifest.id}/${['model', 'resource', 'stage', 'inspector', 'preview', 'thumbnail'][index]}`, targets: ['web', 'windows'], required: true,
      }));
      snapshot.lock.plugins = [{ kind: 'plugin', id: manifest.id, version: manifest.version, targets: ['web', 'windows'], required: true }];
    }
    const services: { manifest: PluginManifest; development: boolean; studioService: boolean }[] = [
      ['org.galcraft.generation-services', '常用生成服务', 'chatCompletions'],
      ['org.galcraft.comfyui', 'ComfyUI 执行能力', 'comfyUI'],
      ['org.galcraft.novelai', 'NovelAI 创作能力', 'novelAIText'],
    ].map(([id, name, key], index) => ({ manifest: { ...manifest, id: id!, name: name!, description: 'Studio 随应用提供的制作服务。',
      localizations: {
        en: { name: ['Common Generation Services', 'ComfyUI Execution', 'NovelAI Creative Tools'][index]!, description: 'Public service capabilities bundled with Studio' },
        ja: { name: ['汎用生成サービス', 'ComfyUI 実行機能', 'NovelAI 創作機能'][index]!, description: 'Studio に標準搭載された公開サービス機能' },
      },
      entry: { runtime: null, editor: null, services: 'services.js' },
      contributions: [{ kind: 'generationProvider' as const, key: `${id}/${key}`, targets: ['web' as const, 'windows' as const], required: true }] }, development: false, studioService: true }));
    services.push({ manifest: structuredClone(voiceStudioManifest) as PluginManifest, development: false, studioService: true });
    if (defaultServices) snapshot.lock.plugins = [{ kind: 'plugin', id: services[1]!.manifest.id, version: '0.1.0', targets: ['web', 'windows'], required: true }];
    let installAttempts = 0, changeAttempts = 0, developmentAttempts = 0, inspectAttempts = 0;
    const fail = (message: string): Result<never> => { const error: Issue = { code: 'STORY_RETRY', severity: 'error', owner: 'M09', message, related: [], actions: ['retry'] }; return { ok: false, error, issues: [error] }; };
    let listCalls = 0;
    value.plugins.list = async () => {
      const bundled = { manifest: { ...manifest, schemaVersion: 2 as const, description: '内置登记的包清单', contributions: [{ kind: 'command' as const, key: `${manifest.id}/bundledCommand`, targets: ['web' as const], required: false }] }, development: false };
      const installed = { manifest: { ...manifest, description: '本机安装的包清单', contributions: [{ kind: 'command' as const, key: `${manifest.id}/installedCommand`, targets: ['web' as const], required: false }] }, development: false };
      const other = { manifest: { ...manifest, id: 'org.galcraft.other', name: '另一插件' }, development: false };
      const duplicates = ++listCalls === 1 ? [bundled, other, installed] : [other, bundled, installed];
      return ok({ entries: empty ? [] : defaultServices ? [...services, { manifest, development: false }] : duplicateRegistrations ? duplicates : [{ manifest, development: false }], lock: missing ? { ...snapshot.lock, plugins:[{kind:'plugin', id:'org.galcraft.missing', version:'0.1.0', targets:['web'], required:true}] } : snapshot.lock });
    };
    value.plugins.inspectPackage = async () => ++inspectAttempts === 1 ? fail('插件包暂时无法读取，请检查路径后重试。') : ok({ manifest, installedVersion: null, compatible: true, issues: [] });
    value.plugins.install = async () => ++installAttempts === 1 ? fail('安装目录暂时不可写，请关闭占用文件后重试。') : ok({ manifest, issues: [], installedVersion: null, compatible: true });
    value.plugins.loadDevelopment = async () => ++developmentAttempts === 1 ? fail('开发入口暂时无法读取，请检查目录后重试。') : ok({ manifest, issues: [], installedVersion: null, compatible: true });
    value.plugins.planChange = async () => ok({ change: { planId: createId(), expected: [], preparedDirectory: '', targetLock: snapshot.lock,
      changes: Array.from({ length: long ? 12 : 1 }, (_, index) => ({ pluginId: index ? `${manifest.id}.related-${index}` : manifest.id, from: '0.1.0', to: '0.1.0', affected: [{ kind: 'document' as const, id: createId() }], savedData: ['document', 'progress', 'longTerm'], dependencies: [], conversions: [], issues: [] })) },
      edit: { planId: createId(), input: { label: '切换插件版本', origin: 'plugin', expected: [], patches: [], preparedAssets: [], requiredRefs: [] }, members: [], issues: [], before: {}, preview: [] } });
    value.documents.applyEdit = async () => ++changeAttempts === 1 ? fail('作品仍有待处理的关联修改，请重试当前变更。') : ok({ groupId: createId(), operationId: createId(), documents: [], dirty: [], assetIds: [] });
    return value;
  }, [theme, long, empty, duplicateRegistrations, diagnostics, missing, defaultServices]);
  const authorHost = diagnostics ? { inspect: () => ({ manifest: { id: 'org.galcraft.storybook', version: '0.1.0' }, definedKeys: ['org.galcraft.storybook/model'],
    activeKeys: ['inspector', 'preview', 'thumbnail'].map(key => `org.galcraft.storybook/${key}`), issues: [], loadError: '' }) } as unknown as StudioPluginHost : undefined;
  return <><div id="studio-portals" data-theme={theme} lang={locale}/><div id="app" className="authoring-shell" data-theme={theme} style={{ display: 'block', height: '100vh', overflow: 'hidden' }}>
    <Plugins bridge={bridge} locale={locale} projectId={productSnapshot().projectId} changed={async () => {}} authorHost={authorHost}/>
  </div></>;
}
const meta = { title: 'Product/Studio/Plugins/Plugin retry', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Retry: Story = {};
export const LongImpact: Story = { args: { long: true } };
export const Dark: Story = { args: { theme: 'dark', long: true } };
export const Empty: Story = { args: { empty: true } };
export const Workbench: Story = { play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole('treeitem', { name: /角色关系与剧情资料扩展/ }));
  await expect(canvas.getByRole('heading', { name: '角色关系与剧情资料扩展', level: 2 })).toBeVisible();
  await expect(canvas.getByRole('button', { name: '启用到作品…' })).toBeVisible();
} };
export const DuplicateRegistrations: Story = { args: { duplicateRegistrations: true } };

export const ContributionDiagnostics: Story = { args: { diagnostics: true }, play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole('treeitem', { name: /角色关系与剧情资料扩展/ }));
  await expect(canvas.getByText('定义已读取', { exact: true })).toBeVisible();
  await expect(canvas.getByText('主进程服务 · 按需调用', { exact: true })).toBeVisible();
  await expect(canvas.getByText('演出运行时 · 按需加载', { exact: true })).toBeVisible();
  await expect(canvas.getAllByText('编辑端已加载', { exact: true })).toHaveLength(3);
  await expect(canvas.queryByText('Studio 未加载', { exact: true })).toBeNull();
} };
export const ContributionDiagnosticsDark: Story = { ...ContributionDiagnostics, args: { diagnostics: true, theme: 'dark' } };

export const English: Story = { args:{locale:"en"} };
export const Japanese: Story = { args:{locale:"ja",theme:"dark"} };
export const MissingDependency: Story = { args:{missing:true} };

export const DefaultServices: Story = { args: { defaultServices: true }, play: async ({ canvas }) => {
  const defaults = await canvas.findByRole('treeitem', { name: /Studio 默认装配/ });
  await expect(defaults).toHaveAttribute('aria-level', '1');
  await expect(canvas.getByRole('treeitem', { name: /本机已安装/ })).toHaveAttribute('aria-level', '1');
  for (const name of ['常用生成服务', 'ComfyUI 执行能力', 'NovelAI 创作能力', 'VoiceStudio']) {
    const row = canvas.getByRole('treeitem', { name: new RegExp(name) });
    await expect(row).toHaveAttribute('aria-level', '2');
    await expect(row).not.toHaveTextContent('未启用');
    await userEvent.click(row);
    await expect(canvas.getByRole('heading', { name, level: 2 })).toBeVisible();
    await expect(canvas.getByText('主进程服务 · 按需调用', { exact: true })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /启用到作品|停用此版本|切换到此版本/ })).toBeNull();
    await expect(canvas.queryByText('作品未启用', { exact: true })).toBeNull();
    await expect(canvas.queryByText('作品已启用', { exact: true })).toBeNull();
  }
  await userEvent.click(canvas.getByRole('treeitem', { name: /角色关系与剧情资料扩展/ }));
  await expect(canvas.getByRole('button', { name: '启用到作品…' })).toBeVisible();
} };
export const DefaultServicesDark: Story = { ...DefaultServices, args: { defaultServices: true, theme: 'dark' } };
export const DefaultServicesEnglish: Story = { args: { defaultServices: true, locale: 'en' } };
export const DefaultServicesJapanese: Story = { args: { defaultServices: true, locale: 'ja' } };

export const VoiceStudioDefaultService: Story = { args: { defaultServices: true, theme: 'light' }, play: async ({ canvas }) => {
  const row = await canvas.findByRole('treeitem', { name: /VoiceStudio/ });
  await userEvent.click(row);
  await expect(row).toHaveAttribute('aria-level', '2');
  await expect(canvas.getByRole('heading', { name: 'VoiceStudio', level: 2 })).toBeVisible();
  const overview = within(canvas.getByRole('region', { name: '插件用途与作品状态' }));
  await expect(overview.getByText(voiceStudioManifest.description, { exact: true })).toBeVisible();
  await expect(canvas.getByText('Studio 随应用提供此服务，制作时按需加载。在“制作 → 服务连接”中配置连接。', { exact: true })).toBeVisible();
  await expect(canvas.queryByRole('button', { name: /启用到作品|停用此版本|切换到此版本/ })).toBeNull();
  const identities = canvas.getAllByText('贡献标识', { exact: true });
  await expect(identities).toHaveLength(voiceStudioManifest.contributions.length);
  await userEvent.click(identities[0]!);
  await expect(canvas.getByText('org.galcraft.voicestudio/voiceStudio', { exact: true })).toBeVisible();
} };

function LocaleSwitchExample() {
  const [locale, setLocale] = useState('zh-CN');
  return <><nav aria-label="Preview language"><button onClick={() => setLocale('en')}>English</button><button onClick={() => setLocale('ja')}>日本語</button><button onClick={() => setLocale('zh-CN')}>简体中文</button></nav><Example locale={locale}/></>;
}
export const Localization: Story = { render: () => <LocaleSwitchExample/>, play: async ({ canvas }) => {
  await userEvent.click(await canvas.findByRole('treeitem', { name: /角色关系与剧情资料扩展/ }));
  for (const [button, name, description] of [
    ['English', 'Character Relationships', 'Manage character relationships and story notes for the current project.'],
    ['日本語', 'キャラクター関係', '現在の作品のキャラクター関係とシナリオ資料を管理します。'],
    ['简体中文', '角色关系与剧情资料扩展', '为当前作品提供角色关系和剧情资料管理。'],
  ]) {
    await userEvent.click(canvas.getByRole('button', { name: button }));
    await expect(canvas.getByRole('heading', { name, level: 2 })).toBeVisible();
    await expect(canvas.getByRole('treeitem', { name: new RegExp(name!) })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getAllByText(description!, { exact: true })).toHaveLength(2);
  }
  await userEvent.click(canvas.getByRole('button', { name: '插件属性' }));
} };
