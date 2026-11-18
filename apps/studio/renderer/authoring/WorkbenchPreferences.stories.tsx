import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DefaultStudioPreferences, type StudioPreferences } from '@galcraft/contracts';
import { WorkbenchPreferences } from './WorkbenchPreferences.js';
import './shell.css';

function PreferencesExample({ theme = 'light', locale = 'en' }: { theme?: StudioPreferences['theme']; locale?: StudioPreferences['locale'] }) {
  const [preferences, setPreferences] = useState({ ...DefaultStudioPreferences, theme, locale });
  const [reset, setReset] = useState(0);
  return <div id="app" data-theme={preferences.theme} className="authoring-shell" style={{ display: 'block', height: '100vh', overflow: 'auto', background: 'var(--background)', color: 'var(--foreground)' }}>
    <div id="studio-portals" lang={preferences.locale} data-theme={preferences.theme}/>
    <WorkbenchPreferences preferences={preferences} onChange={async update => { setPreferences(update); return { ok: true, value: undefined, warnings: [] }; }}
      onResetLayout={() => setReset(count => count + 1)}/>
    <p data-testid="editor-preview" style={{ fontFamily: preferences.editor.fontFamily, fontSize: preferences.editor.fontSize, whiteSpace: preferences.editor.wordWrap ? 'pre-wrap' : 'pre' }}>The station at dawn</p>
    <output data-testid="layout-reset-count">{reset}</output>
  </div>;
}

const meta = { title: 'Product/Studio/Preferences/Workbench preferences', component: PreferencesExample, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof PreferencesExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const EditorAndLayout: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const family = canvas.getByRole('textbox', { name: 'Editor font' });
  const size = canvas.getByRole('spinbutton', { name: 'Editor font size (px)' });
  await userEvent.clear(family);
  await userEvent.type(family, 'Georgia');
  await userEvent.clear(size);
  await userEvent.type(size, '20');
  await userEvent.click(canvas.getByRole('checkbox', { name: 'Wrap source lines' }));
  await userEvent.click(canvas.getByRole('button', { name: 'Apply editor preferences' }));
  await expect(canvas.getByTestId('editor-preview')).toHaveStyle({ fontFamily: 'Georgia', fontSize: '20px', whiteSpace: 'pre' });
  await userEvent.click(canvas.getByRole('button', { name: 'Apply balanced layout' }));
  await expect(canvas.getByTestId('layout-reset-count')).toHaveTextContent('1');
} };
export const DarkChinese: Story = { args: { theme: 'dark', locale: 'zh-CN' } };
