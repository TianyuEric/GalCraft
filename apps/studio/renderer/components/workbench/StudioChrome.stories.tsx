import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { StudioChrome, type StudioChromeProps } from './StudioChrome.js';
import '../../authoring/shell.css';
import '../../authoring/refinements.css';
import './workbench.css';

const routes = [
  ['projects', '作品库', 'folder'], ['editor', '创作', 'edit'], ['assets', '素材', 'image'], ['pages', '页面', 'layout'],
  ['production', '制作', 'spark'], ['collaboration', '协作', 'collaboration'], ['plugins', '插件', 'package'], ['publish', '发布', 'publish'],
];

function ChromeExample({ initialTheme = 'light' }: { initialTheme?: StudioChromeProps['theme'] }) {
  const [theme, setTheme] = useState(initialTheme);
  const [locale, setLocale] = useState<StudioChromeProps['locale']>('zh-CN');
  const [route, setRoute] = useState('editor');
  const [command, setCommand] = useState('');
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  return <div id="app" className="authoring-shell" data-theme={theme} lang={locale} style={{ minHeight: '100vh', background: 'var(--workbench-editor)' }}>
    <div id="studio-portals" data-theme={theme} lang={locale} ref={setPortal}/>
    {portal && <StudioChrome locale={locale} theme={theme} project="雨夜的车站 · 放映馆的最后一封信与我们的春日约定" dirty
      items={routes.map(([key, label, icon]) => ({ key: key!, label: label!, icon: icon!, current: key === route }))}
      navigate={key => { setRoute(key); setCommand(`workface:${key}`); }} action={setCommand}
      preferences={next => { if (next.theme) setTheme(next.theme); if (next.locale) setLocale(next.locale); }}
      layout={[{ id: 'writing', label: '专注写作', run: () => setCommand('layout:writing') }]}
      preview={() => setCommand('preview')} service={<button type="button">本机服务</button>}/>}
    <output aria-label="已发出的命令" style={{ display: 'block', padding: 12 }}>{command}</output>
  </div>;
}

const meta = { title: 'Components/Studio/Workbench/Studio Chrome', component: ChromeExample, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof ChromeExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WorkbenchCommands: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const command = canvas.getByLabelText('已发出的命令');
    canvas.getByRole('button', { name: '工作面' }).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(await canvas.findByRole('menuitem', { name: '素材' }));
    await expect(command).toHaveTextContent('workface:assets');
    await userEvent.click(canvas.getByRole('button', { name: '布局' }));
    await userEvent.click(await canvas.findByRole('menuitem', { name: '专注写作' }));
    await expect(command).toHaveTextContent('layout:writing');
    await userEvent.click(canvas.getByRole('button', { name: '保存选项' }));
    await userEvent.click(await canvas.findByRole('menuitem', { name: /保存全部/ }));
    await expect(command).toHaveTextContent('saveAll');
    await userEvent.click(canvas.getByRole('button', { name: '运行预览' }));
    await expect(command).toHaveTextContent('preview');
  },
};

export const Dusk: Story = { args: { initialTheme: 'dark' } };
