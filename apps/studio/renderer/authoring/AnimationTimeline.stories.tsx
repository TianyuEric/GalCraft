import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { NativeAnimationSchema, type NativeAnimation } from '@galcraft/contracts';
import { AnimationTimeline } from './animation-timeline.js';

function TimelineStory({ dark = false, fail = false }: { dark?: boolean; fail?: boolean }) {
  const [animation, setAnimation] = useState<NativeAnimation>(() => NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 65000,
    tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 1000, value: 100 }, { timeMs: 65000, value: 300 }] },
      { path: '/opacity', keyframes: [{ timeMs: 500, value: .3 }, { timeMs: 1500, value: 1 }] }] }));
  const [count, setCount] = useState(0);
  return <div id="app" className="authoring-shell" data-theme={dark ? 'dark' : 'light'} style={{ minHeight: '100vh', padding: 16, background: 'var(--workbench-editor)', color: 'var(--foreground)' }}><div id="studio-portals" data-theme={dark ? 'dark' : 'light'}/>
    <p>组件事务夹具 · 已提交 <output aria-label="提交次数">{count}</output> 次；实际 M02 与舞台在宿主验收。</p>
    <AnimationTimeline animation={animation} onChange={async next => { if (fail) throw Error('示例提交失败，草稿保留'); setAnimation(next); setCount(value => value + 1); }} onSave={async () => '示例入库回调'}/>
  </div>;
}
const meta = { title: 'Product/Studio/Authoring/AnimationTimeline', component: TimelineStory, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof TimelineStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LongSparseTracks: Story = { play: async ({ canvas }) => {
  const frame = canvas.getByRole('button', { name: 'X 1000 ms' }); frame.focus(); await userEvent.keyboard('{ArrowRight}');
  await expect(canvas.getByRole('button', { name: 'X 1010 ms' })).toBeVisible();
  await expect(canvas.getByLabelText('提交次数')).toHaveTextContent('1');
} };
export const Dark: Story = { args: { dark: true } };
export const ApplyFailure: Story = { args: { fail: true } };
