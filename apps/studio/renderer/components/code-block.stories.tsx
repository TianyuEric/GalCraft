import type { Meta, StoryObj } from '@storybook/react-vite';
import { CodeBlock } from './code-block.js';
import './controls.css';
import '../styles/studio-theme.css';

const index = Array.from({ length: 95 }, (_, i) => ({ id: `Asset${i}`, name: `角色立绘_${i + 1}.png`, kind: 'image', revision: 1, variants: Array.from({ length: 6 }, (_, v) => ({ id: `Variant${i}_${v}`, path: `assets/files/Asset${i}/Variant${v}/image.png`, width: 1024, height: 1536 })) }));
const code = JSON.stringify([{ kind: 'json', documentId: 'IndexA', changes: [{ path: '/data/assets', before: index, after: [...index, { id: 'NewOne', name: '新采用的立绘.png' }] }] }], null, 2);
function Details({ theme = 'light', singleLine = false, copyOnly = false }: { theme?: string; singleLine?: boolean; copyOnly?: boolean }) {
  return <div id="app" className="authoring-shell" data-theme={theme} style={{ padding: 16 }}><CodeBlock code={singleLine ? JSON.stringify(index) : code} copyOnly={copyOnly}/></div>;
}
const meta = { title: 'Components/Code details', component: Details } satisfies Meta<typeof Details>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LongIndex: Story = {};
export const ReadOnly: Story = { args: { copyOnly: true } };
export const Dusk: Story = { args: { theme: 'dark' } };
export const LongLine: Story = { args: { singleLine: true } };
