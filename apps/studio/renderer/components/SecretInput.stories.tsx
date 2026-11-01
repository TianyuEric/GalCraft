import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Field } from './controls.js';
import { SecretInput } from './secret-input.js';

function Example({ theme = 'light', locale = 'zh-CN' }: { theme?: 'light' | 'dark'; locale?: string }) {
  const [value, setValue] = useState('');
  return <div id="app" className="authoring-shell" data-theme={theme} style={{ padding:24, width:440 }}><div id="studio-portals" lang={locale} data-theme={theme}/><Field label="API Key"><SecretInput resetKey="new" locale={locale} value={value} onChange={event => setValue(event.target.value)}/></Field></div>;
}
const meta = { title:'Components/Secret input', component:Example, parameters:{ layout:'centered' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dark: Story = { args:{ theme:'dark', locale:'en' } };
export const KeyboardToggle: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement), input = canvas.getByLabelText('API Key');
  await expect(input).toHaveAttribute('type', 'password');
  await userEvent.type(input, 'storybook-placeholder');
  canvas.getByRole('button', { name:'显示密钥' }).focus();
  await userEvent.keyboard('{Enter}');
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue('storybook-placeholder');
  await userEvent.keyboard(' ');
  await expect(input).toHaveAttribute('type', 'password');
  await userEvent.clear(input);
} };
