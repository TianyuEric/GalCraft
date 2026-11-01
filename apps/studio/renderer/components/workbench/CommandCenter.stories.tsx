import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import './workbench.css';
import { CommandCenter, type CommandMode } from './CommandCenter.js';
function Example({ locale = 'zh-CN' }: { locale?: string }) {
  const [mode, setMode] = useState<CommandMode | null>(null), [result, setResult] = useState('');
  return <div id="app" className="authoring-shell" data-theme="light" style={{minHeight:'100vh',padding:16}}><div id="studio-portals" data-theme="light" lang="zh-CN"/><input aria-label="原编辑位置" defaultValue="保留的输入"/><button onClick={() => setMode('objects')}>打开命令中心</button><output>{result}</output>
    {mode && <CommandCenter mode={mode} locale={locale} load={async (query, scope) => [
      ...(scope === 'objects' ? [{ id: 'scene', group: '场景', label: '雨夜书店 · 很长的章节名称', run() {} }, { id: 'character', group: '角色', label: '林夏', run() {} }] : [{ id: 'save', group: '应用命令', label: '保存全部', shortcut: 'Ctrl+Shift+S', run() {} }, { id: 'delete', group: '应用命令', label: '删除所选素材', disabled: '请先选择素材', run() {} }, { id: 'plugin', group: '插件命令', label: '检查剧情引用', run() {} }]),
    ].filter(item => item.label.includes(query))} close={() => setMode(null)} choose={entry => { setResult(entry.label); setMode(null); }}/>}</div>;
}
const meta = { title: 'Product/Studio/Workbench/Command Center', component: Example, parameters: { layout: 'padded' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SearchAndCommands: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText('打开命令中心'));
  const popup = within(document.body); await userEvent.click(await popup.findByRole('button', { name: /应用命令/ }));
  await expect(await popup.findByRole('option', { name: /删除所选素材/ })).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(popup.getByRole('option', { name: /检查剧情引用/ })); await expect(canvas.getByText('检查剧情引用')).toBeVisible();
} };
