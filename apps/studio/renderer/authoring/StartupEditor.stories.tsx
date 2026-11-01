import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createId, StartupClipSchema, StartupSequenceSchema, type Project } from '@galcraft/contracts';
import { FixtureAsset, FixtureProject, FixtureVoiceAssets } from '@galcraft/contracts/fixtures';
import { StartupEditor } from './startup-editor.js';

function StartupStory({ theme = 'light', locale = 'zh-CN', failApply = false, sequence = false }: { theme?: 'light' | 'dark'; locale?: string; failApply?: boolean; sequence?: boolean }) {
  const [project, setProject] = useState<Project>(() => ({ ...structuredClone(FixtureProject), display: { ...FixtureProject.display, splash: FixtureAsset.id, titleMusic: FixtureVoiceAssets[0]!.id,
    ...(sequence ? { startupSequence: StartupSequenceSchema.parse({ clips: [StartupClipSchema.parse({ id: createId(), kind: 'text', name: '独立说明文字 · 长时序', text: { 'zh-CN': '白字说明，图片与文字可独立重叠。' }, holdMs: 60000 }), StartupClipSchema.parse({ id: createId(), kind: 'image', name: '重叠图片', assetId: FixtureAsset.id, startMs: 1000, holdMs: 3000 })] }) } : {}) } }));
  const current = useRef(project); current.current = project;
  const past = useRef<Project['display'][]>([]), future = useRef<Project['display'][]>([]), [commits, setCommits] = useState(0);
  return <div id="app" className="authoring-shell" data-theme={theme} data-startup-commits={commits} style={{ height: '100vh', padding: 16, overflow: 'auto' }}><div id="studio-portals" data-theme={theme} lang={locale}/>
    <p>组件状态夹具：应用回调保存在内存；真实 M02 保存与 Player 媒体预览另做宿主验收。</p>
    <StartupEditor project={project} locale={locale} assets={[FixtureAsset, ...FixtureVoiceAssets]}
      chooseAsset={async field => field === 'titleMusic' ? FixtureVoiceAssets[0]!.id : FixtureAsset.id}
      onChange={async display => { if (failApply) throw Error('示例应用失败：输入保留，可重试。'); past.current.push(current.current.display); future.current = []; setCommits(value => value + 1); setProject(previous => ({ ...previous, display })); }}
      history={async action => { const from = action === 'undo' ? past : future, to = action === 'undo' ? future : past, display = from.current.pop(); if (display) { to.current.push(current.current.display); setProject(previous => ({ ...previous, display })); } }}
      preview={async () => { throw Error('此组件夹具未挂载 Player；请在正式启动与主页文档预览。'); }}/>
  </div>;
}
const meta = { title: 'Product/Studio/Authoring/StartupAndHome', component: StartupStory, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof StartupStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const ApplyFailure: Story = { args: { failApply: true } };
export const Japanese: Story = { args: { locale: 'ja', theme: 'dark' } };
export const LongSequence: Story = { args: { sequence: true } };
export const LongSequenceDark: Story = { args: { sequence: true, theme: 'dark' } };

export const SequenceApplyFailure: Story = { args: { sequence:true,failApply:true } };
export const LongSequenceEnglish: Story = { args: { sequence:true,locale:'en' } };
export const LongSequenceJapaneseDusk: Story = { args: { sequence:true,locale:'ja',theme:'dark' } };
