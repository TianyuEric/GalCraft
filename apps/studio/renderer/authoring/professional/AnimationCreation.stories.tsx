import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import type { Candidate } from '@galcraft/authoring/production';
import type { AnimationGenerationRequest } from '@galcraft/contracts';
import { createAnimationPreset } from '@galcraft/stage';
import { AnimationWorkbench } from './AnimationWorkbench.js';
import { AnimationCandidatePreview } from '../../pages/Production/AnimationCandidatePreview.js';
import { studioFixture } from '../../stories/studio-fixture.js';
import '../shell.css';
import './professional-editors.css';

const original = createAnimationPreset('jump', { durationMs: 1000, amplitude: 60 }).animation;
const generated = createAnimationPreset('jump', { durationMs: 1000, amplitude: 120 }).animation;
const candidate: Candidate = { schemaVersion: 1, id: 'GcaCan', taskId: 'GcaTsk', itemId: 'GcaItm', createdAt: '2026-10-20T02:00:00.000Z',
  artifacts: [{ kind: 'animation', typeVersion: 1, port: 'animation', localPath: 'candidate.gca', mime: 'application/json', bytes: 1000, groupId: 'GcaGrp', role: 'primary', background: null,
    metadata: { originalAnimation: original, animationChanges: [{ path: '/y', change: 'modified', startMs: 0, endMs: 1000 }] } }],
  partial: false, backgroundPreview: null, parentCandidateIds: [], input: {},
  provenance: { connectionName: 'Storybook fixture', protocol: 'chatCompletions', model: 'fixture', workflowVersion: null, seed: null, usage: null, serviceRequestId: null },
  editedText: null, sourceVersions: [], recipeSnapshot: null, uiCompositionId: null, checks: [], adoption: [] };

function Creation({ theme = 'light', locale = 'zh-CN', surface = 'editor' }: { theme?: 'light' | 'dark'; locale?: 'zh-CN' | 'en' | 'ja'; surface?: 'editor' | 'candidate' }) {
  const [animation, setAnimation] = useState(original), [request, setRequest] = useState<AnimationGenerationRequest | null>(null), [edits, setEdits] = useState(0);
  const [services] = useState(() => studioFixture('normal', locale, theme).services);
  return <main id="app" data-theme={theme} className="authoring-shell pro-experience" style={{ display: 'block' }}><div style={{ maxWidth: 1100, margin: 'auto' }}>
    {surface === 'editor' ? <AnimationWorkbench animation={animation} locale={locale} targetLabel="林舟 · 中性预览 / 1000 ms" onChange={async next => setAnimation(next)} onGenerate={async next => setRequest(next)}/>
      : <AnimationCandidatePreview candidate={candidate} uri={`data:application/json,${encodeURIComponent(JSON.stringify(generated))}`} services={services} locale={locale} edit={async () => setEdits(value => value + 1)}/>}
    <p className="pro-note">Storybook：草稿和候选使用内存夹具；此页面不发送生成请求。</p>
    {request && <output aria-label="准备结果">{request.mode} · {request.paths.join(', ')} · {request.instruction} · {request.preserveDuration ? '保持时长' : '新时长'}</output>}
    {edits > 0 && <output aria-label="手调候选次数">{edits}</output>}
  </div></main>;
}
const meta = { title: 'Product/Studio/Authoring/Animation Creation', component: Creation, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Creation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PrepareLocalEdit: Story = { play: async ({ canvas }) => {
  await userEvent.click(canvas.getByText('用自然语言制作动画'));
  await userEvent.type(canvas.getByLabelText('动画要求'), '跳得更高，时长不变');
  await userEvent.click(canvas.getByRole('button', { name: '准备制作候选' }));
  await expect(canvas.getByLabelText('准备结果')).toHaveTextContent('patch · /y · 跳得更高，时长不变 · 保持时长');
  await expect(canvas.getByLabelText('实际采样')).toHaveTextContent('Y: 0');
} };
export const JapaneseDark: Story = { args: { theme: 'dark', locale: 'ja' } };
export const CompareCandidate: Story = { args: { surface: 'candidate' }, play: async ({ canvas }) => {
  await expect(canvas.getByLabelText('动画变化')).toHaveTextContent('修改 · /y · 0–1000 ms');
  await userEvent.click(canvas.getByRole('button', { name: '原动画' }));
  await expect(canvas.getByRole('button', { name: '原动画' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(canvas.getByRole('button', { name: '候选动画' }));
  await userEvent.click(canvas.getByRole('button', { name: '手调关键帧' }));
  await expect(canvas.getByRole('region', { name: '动画编辑器' })).toBeVisible();
} };
