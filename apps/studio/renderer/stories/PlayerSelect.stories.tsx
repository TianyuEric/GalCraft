import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlayerSelect } from '@galcraft/player-ui';
import '@galcraft/player-ui/player.css';

function Specimen({ dark = false, long = false, scaled = false }) {
  const [value, setValue] = useState(long ? '0' : 'read');
  const options = long ? Array.from({ length: 60 }, (_, index) => ({ value: String(index), label: `Chapter ${index + 1} · The next station after the rain` }))
    : [{ value: 'read', label: '仅跳过已读文字' }, { value: 'all', label: '跳过全部文字' }, { value: 'locked', label: '不可用选项', disabled: true }];
  return <div className="galcraft-player" style={{ position: 'relative', width: 960, height: 540, '--gc-bg': dark ? '#172238' : '#f8f3e8', '--gc-ink': dark ? '#f0e8dc' : '#29354a', '--gc-accent': dark ? '#ebbf78' : '#845b28', '--gc-line': dark ? '#607087' : '#b4a998' } as React.CSSProperties}>
    <div className="gc-canvas" style={{ width: 1920, height: 1080, color: 'var(--gc-ink)', background: 'var(--gc-bg)', transform: `scale(${scaled ? .4 : .5})` }}>
      <main data-gc-page="settings" style={{ padding: 48, fontSize: 24 }}><h1>阅读与显示</h1><label style={{ display: 'grid', gap: 12, width: 540 }}>快进范围
        <PlayerSelect aria-label="快进范围" value={value} options={options} onValueChange={setValue}/></label>
        <label style={{ display: 'grid', gap: 12, width: 540, marginTop: 32 }}>菜单语言<PlayerSelect aria-label="菜单语言" value="ja" disabled options={[{value:'ja',label:'日本語'}]} onValueChange={()=>{}}/></label>
      </main>
    </div>
  </div>;
}
const meta = { title: 'Product/Player/Select', component: Specimen, parameters: { layout: 'centered' } } satisfies Meta<typeof Specimen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Dark: Story = { args: { dark: true } };
export const LongList: Story = { args: { long: true, dark: true } };
export const ScaledCanvas: Story = { args: { scaled: true } };

