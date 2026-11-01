import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FieldSpec, Json } from '@galcraft/contracts';
import { Button } from '../../components/controls.js';
import { PluginFields } from './plugin-fields.js';
import '../../authoring/shell.css';
import '../../authoring/workspace.css';
import './studio-plugins.css';

const item: FieldSpec = { path: 'item', label: '配置', description: '', type: 'object', required: true, nullable: false, default: {}, unit: 'none', group: 'basic', summary: false, keywords: [] };
const fields: FieldSpec[] = [
  { ...item, path: 'items', label: 'JSON配置', type: 'array', default: [], item },
  { ...item, path: 'note', label: '备注', type: 'string', default: '' },
  { ...item, path: 'count', label: '可空数量', type: 'number', nullable: true, default: 10 },
  { ...item, path: 'character', label: '可空角色', type: 'ref', refKind: 'character', nullable: true, default: 'CharAA' },
];
const initial = (): Record<string, Json> => ({ items: [{ name: 'A', enabled: true }, { name: 'B', enabled: false }], note: '', count: 10, character: 'CharAA' });
function Example({ theme = 'light' }: { theme?: string }) {
  const [value, setValue] = useState(initial);
  return <div data-theme={theme}><div id="studio-portals" data-theme={theme} lang="zh-CN"/><main className="authoring-shell" data-theme={theme} style={{ display: 'block', minHeight: '100vh', height: 'auto', padding: 24, background: 'var(--background)', overflow: 'auto' }}>
    <PluginFields fields={fields} value={value} change={setValue} locale="zh-CN" references={[{ kind: 'character', id: 'CharAA', name: '杏' }]}/>
    <div className="gc-actions">
      <Button onClick={() => setValue(initial())}>恢复两项配置</Button>
      <Button onClick={() => setValue({ items: [{ name: '外部配置', enabled: true }], note: '' })}>载入外部配置</Button>
    </div>
    <output aria-label="业务字段值">{JSON.stringify(value)}</output>
  </main></div>;
}
const meta = { title: 'Product/Studio/Plugins/Plugin fields', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const JsonArray: Story = {};
export const JsonArrayDark: Story = { args: { theme: 'dark' } };
