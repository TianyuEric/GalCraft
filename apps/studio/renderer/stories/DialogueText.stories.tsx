import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent } from 'storybook/test';
import { dialogueTextField } from '../authoring/dialogue-text-field.js';
import type { DialogueContent, Json } from '@galcraft/contracts';
import '../authoring/workspace.css';
import '../styles/studio-theme.css';

function Editor({ dark = false, locale = 'zh-CN', styled = false }: { dark?: boolean; locale?: string; styled?: boolean }) {
  const root = useRef<HTMLDivElement>(null), [saved, setSaved] = useState<Json>(styled?{segments:[{text:'星空',ruby:'ほしぞら',bold:true}]}:'星空 hello 👩‍🚀 <b>literal</b>');
  useEffect(() => { const field = dialogueTextField(saved, locale, value => { setSaved(value); }); root.current!.replaceChildren(field); }, [locale]);
  return <div data-theme={dark ? 'dark' : 'light'}><section className="authoring-shell" style={{ display: 'block', padding: 24, minHeight: '100vh', maxWidth: 900 }}><h2>对白片段与注音</h2><div ref={root}/><output aria-label="Saved text">{JSON.stringify(saved)}</output></section></div>;
}
const meta = { title: 'Product/Studio/Player preview/Dialogue Text', component: Editor, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Editor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SelectionAndRuby: Story = { play: async ({ canvas }) => {
  const text = canvas.getByLabelText('正文与片段选择') as HTMLTextAreaElement; text.focus(); text.setSelectionRange(0, 2); fireEvent.select(text);
  fireEvent.input(canvas.getByLabelText('注音'), { target: { value: 'ほしぞら' } }); fireEvent.click(canvas.getByLabelText('粗体'));
  fireEvent.click(canvas.getByRole('button', { name: '应用到所选片段' }));
  await expect(canvas.getByLabelText('Saved text')).toHaveTextContent('ほしぞら');
  await expect(canvas.getByLabelText('文字样式预览').querySelector('ruby')).toHaveTextContent('星空ほしぞら');
} };
export const Dark: Story = { args: { dark: true } };
export const English: Story = { args: { locale: 'en' } };
export const EmptySelection: Story = { play: async ({ canvas }) => { fireEvent.click(canvas.getByRole('button', { name: '应用到所选片段' })); await expect(canvas.getByRole('alert')).toHaveTextContent('请先在正文中选择片段'); } };

export const ClearStyledText: Story = { args:{styled:true}, play:async({canvas})=>{ const text=canvas.getByLabelText('正文与片段选择');fireEvent.input(text,{target:{value:''}});fireEvent.change(text);await expect(canvas.getByLabelText('Saved text')).toHaveTextContent('\"\"'); } };
