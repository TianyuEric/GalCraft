import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReadingStyles } from '@galcraft/contracts';
import { createOfficialTemplate } from '@galcraft/templates';
import { ReadingStylesEditor } from './ReadingStylesEditor.js';
import './shell.css';
import './workspace.css';

function Editor({ locale = 'zh-CN', theme = 'light', fail = false }: { locale?: string; theme?: string; fail?: boolean }) {
  const [value, setValue] = useState<ReadingStyles>({ read: { color: '#756B61', bold: false } });
  return <div data-theme={theme}><div className="authoring-shell" style={{ display: 'block', padding: 16, width: 344, height: 'auto', minHeight: '100vh', overflow: 'visible', background: 'var(--workbench-inspector)' }}>
    <ReadingStylesEditor value={value} base={createOfficialTemplate().defaultVisual} fonts={[]} locale={locale}
      commit={async next => { if (fail) throw new Error(locale === 'en' ? 'The project is read-only. Choose a writable copy and retry.' : locale === 'ja' ? '作品は読み取り専用です。書き込み可能なコピーで再試行してください。' : '作品为只读，请在可写副本中重试。'); setValue(next); }}/>
  </div></div>;
}
export default { title: 'Product/Studio/Authoring/Reading Styles', component: Editor, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Editor>;
type Story = StoryObj<typeof Editor>;
export const InheritedAndRead: Story = {};
export const Dusk: Story = { args: { theme: 'dark' } };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja' } };
export const FailedWrite: Story = { args: { fail: true } };
