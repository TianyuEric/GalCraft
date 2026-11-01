import type { Meta, StoryObj } from '@storybook/react-vite';
import entry from '../../../player-web/index.html?raw';

function FileOpenHelp({ locale = 'zh-CN' }: { locale?: 'zh-CN' | 'en' | 'ja' }) {
  // Render the actual classic HTML fallback; Storybook itself is served using HTTP.
  const html = entry.replace('location.protocol === \'file:\'', 'true').replaceAll('navigator.language', JSON.stringify(locale))
    .replace(/<script type="module"[^>]*><\/script>/, '');
  return <iframe title="Web 文件打开提示" srcDoc={html} style={{ width: '100%', height: '100vh', border: 0 }} />;
}
const meta = { title: 'Product/Player/Web file open', component: FileOpenHelp, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof FileOpenHelp>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Chinese: Story = {};
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja' } };
