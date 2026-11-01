import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConflictReview } from '../components/document-recovery.js';
import '../authoring/shell.css';
import '../styles/ui.css';
import '@fontsource-variable/geist';

const meta = { title: 'Product/Studio/Authoring/Document recovery', component: ConflictReview, decorators: [(Story, context) => <><div id="studio-portals" lang={context.args.locale}/><main id="app" className="authoring-shell" lang={context.args.locale} style={{ padding: 16, height: '100vh', overflow: 'auto' }}><Story/></main></>], args: {
  locale: 'zh-CN', conflicts: [{ path: 'scenes/春灯的最后一晚/script.gal', base: '上次保存的对白', local: '本次未保存的对白', disk: '外部编辑的对白' }],
  chooseDirectory: async () => ({ ok: true as const, value: 'D:/作品', warnings: [] }), onChange: () => {},
} } satisfies Meta<typeof ConflictReview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Chinese: Story = {};
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja' } };
