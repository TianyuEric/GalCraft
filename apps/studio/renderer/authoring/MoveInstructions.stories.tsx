import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from './controller.js';
import { Button } from '../components/controls.js';
import { MoveInstructionsDialog, mountMoveInstructionsDialog } from './move-instructions-dialog.js';
import { buildMoveInstructionsModel } from './move-instructions-model.js';
import './workspace.css';

const source: AuthoringSource = { projectDocumentId: 'PrjDoc', projectRevision: 1, projectSavedRevision: 1, projectDirty: false,
  project: FixtureProject, characters: [], scenes: [
    { sceneId: 'SceneA', documentId: 'DocAAA', name: '春日街角', text: 'say {speaker:{kind:"narrator"},text:"风穿过街角，书店的灯亮了。"} @StmtAA;\nwait {durationMs:300} @StmtBB;\nsay {speaker:{kind:"narrator"},text:"我们把未完的故事留给了明天。"} @StmtCC;' },
    { sceneId: 'SceneB', documentId: 'DocBBB', name: '书店午后', text: 'say {speaker:{kind:"narrator"},text:"书页停在上次离开的地方。"} @TargAA;\nsay {speaker:{kind:"narrator"},text:"有人在门外轻轻敲了两下。"} @TargBB;' },
    { sceneId: 'SceneC', documentId: 'DocCCC', name: '新建场景', text: '' },
    { sceneId: 'SceneD', documentId: 'DocDDD', name: '未完成的源码', text: 'say {' },
  ].map(scene => ({ ...scene, chapterId: FixtureProject.chapters[0]!.id, revision: 1, savedRevision: 1, dirty: false })) };

function DialogStory({ theme = 'light', locale = 'zh-CN', state = 'normal', initiallyOpen = true, popover = false }: {
  theme?: 'light' | 'dark'; locale?: string; state?: 'normal' | 'empty' | 'long' | 'readonly' | 'many'; initiallyOpen?: boolean; popover?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen), [result, setResult] = useState('');
  useEffect(() => {
    let portals = document.getElementById('studio-portals'); const owns = !portals;
    if (!portals) { portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    portals.lang = locale; portals.dataset.theme = theme;
    return () => { if (owns) portals.remove(); };
  }, [theme, locale]);
  const content = structuredClone(source);
  if (state === 'empty') content.scenes = content.scenes.slice(0, 1);
  if (state === 'long') { content.scenes[0]!.name = '春日街角 · ' + '等待下一次重逢的故事'.repeat(6); content.scenes[1]!.name = '书店午后 · ' + '一封迟到的信'.repeat(10); }
  if (state === 'readonly') content.scenes[0]!.text += '\nsay {';
  if (state === 'many') content.scenes.push(...Array.from({ length: 15 }, (_, index) => ({ ...content.scenes[1]!, sceneId: `Scene${index + 10}`, documentId: `Doc${index + 10}`, name: `第 ${index + 1} 个目的场景` })));
  const model = buildMoveInstructionsModel(content, 'SceneA', ['StmtAA', 'StmtBB', 'StmtCC'], locale);
  return <div data-theme={theme}><div className="authoring-shell" style={{ minHeight: '100vh', padding: 24, display: 'block', boxSizing: 'border-box' }}>
    <p>已选 3 条 · 春日街角</p><Button onClick={() => { setResult(''); if(popover) mountMoveInstructionsDialog({model,locale,moved(){},move:async(sceneId,position)=>{setResult(`3 条指令 → ${model.scenes.find(scene=>scene.id===sceneId)?.name} · ${position}`);return null;}}); else setOpen(true); }}>移动所选指令…</Button>
    {result && <p role="status">{result}</p>}
    {open && <MoveInstructionsDialog model={model} locale={locale} close={() => setOpen(false)} move={async (sceneId, position, beforeId) => {
      setResult(`3 条指令 → ${model.scenes.find(scene => scene.id === sceneId)?.name} · ${position}${beforeId ? ' · 已指定位置' : ''}`); setOpen(false); return null;
    }}/>}
  </div></div>;
}
const meta = { title: 'Product/Studio/Authoring/MoveInstructions', component: DialogStory, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof DialogStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const LongNames: Story = { args: { state: 'long' } };
export const NoOtherScene: Story = { args: { state: 'empty' } };
export const SourceReadOnly: Story = { args: { state: 'readonly' } };
export const SearchTargets: Story = { args: { state: 'many' } };
export const KeyboardReturn: Story = { args: { initiallyOpen: false } };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja', theme: 'dark' } };

export const Round2Search: Story = { args: { initiallyOpen: false, popover: true, state: 'many' } };
