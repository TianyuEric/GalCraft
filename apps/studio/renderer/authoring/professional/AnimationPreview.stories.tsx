import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createAnimationPreset } from '@galcraft/stage';
import { AnimationPreview } from './AnimationPreview.js';
import { AnimationPresetPicker } from './AnimationPresetPicker.js';
import '../shell.css';
import './professional-editors.css';
function Preview({ theme = 'light', locale = 'zh-CN' }: { theme?: string; locale?: string }) {
  const [animation, setAnimation] = useState(createAnimationPreset('jump').animation), [time, setTime] = useState(300);
  return <main data-theme={theme} className="authoring-shell pro-experience" style={{ display: 'block', height: 'auto' }}><div style={{ maxWidth: 1000, margin: 'auto' }}><AnimationPresetPicker locale={locale} apply={preset => { setAnimation(preset.animation); setTime(0); }}/><AnimationPreview animation={animation} timeMs={time} locale={locale}/><label>播放头 <input aria-label="播放头" type="range" min="0" max={animation.durationMs} value={time} onChange={event => setTime(Number(event.target.value))}/><output>{time} ms</output></label></div></main>;
}
const meta = { title: 'Product/Studio/Authoring/Animation Preview', component: Preview, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dark: Story = { args: { theme: 'dark', locale: 'ja' } };
