import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Field } from '../controls.js';
import { Textarea } from './textarea.js';
import '../../styles/studio-theme.css';

function NotesEditor({ theme = 'light', disabledState = 'false', readOnly = false }: {
  theme?: 'light' | 'dark'; disabledState?: 'omitted' | 'false' | 'true'; readOnly?: boolean;
}) {
  const [notes, setNotes] = useState('澜汐习惯在开口前先看向窗外。\n她知道那封信的来历，却还没准备好告诉同行的人。');
  const [busy, setBusy] = useState(false), [composing, setComposing] = useState(false), [selected, setSelected] = useState(0);
  const disabledProps = busy || disabledState === 'true' ? { disabled: true } : disabledState === 'false' ? { disabled: false } : {};
  return <div id="app" className="authoring-shell" data-theme={theme} style={{ boxSizing: 'border-box', minHeight: '100vh', padding: 24 }}>
    <section aria-label="人物资料输入" style={{ maxWidth: 680, display: 'grid', gap: 16 }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500 }}>澜汐 · 人物资料</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--foreground-secondary)', fontSize: 12, lineHeight: '16px' }}>文本交互夹具：修改只留在本场景内。</p>
      </header>
      <Field label="角色简介与创作设定" help={readOnly ? '只读内容可选择和复制。' : '可用鼠标聚焦、选字，或用中文输入法继续填写。'}>
        <Textarea {...disabledProps} readOnly={readOnly} rows={5} value={notes}
          onChange={event => setNotes(event.target.value)}
          onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
          onSelect={event => setSelected(event.currentTarget.selectionEnd - event.currentTarget.selectionStart)} />
      </Field>
      <div className="gc-actions">
        <Button disabled={composing || readOnly || disabledState === 'true'} aria-pressed={busy} onClick={() => setBusy(value => !value)}>{busy ? '恢复编辑' : '切换为忙碌状态'}</Button>
        <output aria-live="polite" style={{ color: 'var(--foreground-secondary)', fontSize: 12, lineHeight: '16px' }}>{busy ? '忙碌中 · 输入保留' : readOnly ? '只读' : disabledState === 'true' ? '已禁用' : composing ? '正在组合输入' : '可编辑'}{!readOnly && !busy && ` · 已选择 ${selected} 字`}</output>
      </div>
    </section>
  </div>;
}

const meta = {
  title: 'Components/Textarea', component: NotesEditor,
  args: { theme: 'light', disabledState: 'false', readOnly: false },
  argTypes: {
    theme: { control: 'select', options: ['light', 'dark'] },
    disabledState: { control: 'select', options: ['omitted', 'false', 'true'] },
  },
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Shared Textarea with local character notes. Disabled states, typing, selection, busy recovery and composition events are operable. This fixture does not apply changes or write to disk; operating-system IME requires manual verification.' } } },
} satisfies Meta<typeof NotesEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Editing: Story = {};
export const Dusk: Story = { args: { theme: 'dark' } };
export const Omitted: Story = { args: { disabledState: 'omitted' } };
export const Disabled: Story = { args: { disabledState: 'true' } };
export const ReadOnly: Story = { args: { readOnly: true } };
