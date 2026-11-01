import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import type { StudioPreferences } from '@galcraft/contracts';
import { ProjectLanguageEditor } from './project-languages.js';
import './shell.css';
function Example({ locale = 'zh-CN', theme = 'light', failure = false }: { locale?: StudioPreferences['locale']; theme?: string; failure?: boolean }) {
  const [value, setValue] = useState({ ...structuredClone(FixtureProject.languages), voices: ['zh-CN'] });
  return <div id="app" data-theme={theme} className="authoring-shell" style={{ display: 'block' }}><ProjectLanguageEditor value={value} locale={locale} apply={async value => { if (failure) throw new Error(locale === 'en' ? 'Save failed. Your input is kept.' : locale === 'ja' ? '保存に失敗しました。入力を保持しています。' : '保存失败，输入已保留。'); setValue(value); }}/></div>;
}
const meta = { title: 'Product/Studio/Creation/Project languages', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { play: async ({ canvas }) => {
  await userEvent.clear(canvas.getByRole('textbox', { name: /正文源语言/ }));
  await userEvent.click(canvas.getByRole('button', { name: '应用语言设置' }));
  await expect(canvas.getByRole('alert')).toHaveTextContent('请填写正文源语言');
  await userEvent.click(canvas.getByRole('button', { name: '还原未应用输入' }));
  await expect(canvas.getByRole('textbox', { name: /正文源语言/ })).toHaveValue('zh-CN');
} };
export const Dark: Story = { args: { theme: 'dark' } };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja' } };
export const Failure: Story = { args: { failure: true } };
