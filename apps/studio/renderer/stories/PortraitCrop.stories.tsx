import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Asset, DialoguePortrait } from '@galcraft/contracts';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import { dialoguePortraitField } from '../authoring/dialogue-portrait-field.js';

function PortraitCrop({ locale = 'zh-CN', kind = 'image', width = 400 }: { locale?: 'zh-CN' | 'en' | 'ja'; kind?: 'image' | 'live2d'; width?: number }) {
  const root = useRef<HTMLDivElement>(null), [applied, setApplied] = useState<DialoguePortrait | null>(null);
  useEffect(() => {
    const asset = { ...structuredClone(FixtureAsset), kind, name: '杏 · 默认立绘' } as Asset;
    const editor = dialoguePortraitField({ enabled: true }, asset, locale, value => { setApplied(value as unknown as DialoguePortrait); });
    const image = editor.querySelector('img'); if (image) image.src = '/practice/figures/chatgpt-neutral.png';
    root.current?.replaceChildren(editor); setApplied(null);
    return () => editor.remove();
  }, [locale, kind]);
  return <section style={{ width, maxWidth: '100%', padding: 24, boxSizing: 'border-box', margin: '0 auto' }}><div ref={root} />{applied && <output data-portrait-applied style={{display: 'block', marginTop: 16, fontSize: 11, overflowWrap: 'anywhere'}}>{JSON.stringify(applied)}</output>}</section>;
}
const meta = { title: 'Product/Studio/Authoring/Portrait crop', component: PortraitCrop, args: { locale: 'zh-CN', kind: 'image', width: 400 },
  argTypes: { locale: { control: 'select', options: ['zh-CN', 'en', 'ja'] }, kind: { control: 'select', options: ['image', 'live2d'] }, width: { control: {type:'range',min:280,max:640,step:20} } }, parameters: {layout:'fullscreen'} } satisfies Meta<typeof PortraitCrop>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Image: Story = {};
export const Narrow: Story = { args: { width: 300 } };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja' } };
export const Live2D: Story = { args: { kind: 'live2d' } };
