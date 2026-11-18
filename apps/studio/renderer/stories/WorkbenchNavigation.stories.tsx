import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { mountAuthoring } from '../authoring/view.js';
import { studioFixture } from './studio-fixture.js';

function WorkbenchNavigation({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const mount = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!mount.current) return;
    const host = document.createElement('div');
    host.id = 'app';
    host.dataset.theme = theme;
    mount.current.append(host);
    const { services } = studioFixture('normal', 'zh-CN', theme);
    let active = true;
    let dispose: (() => void) | undefined;
    void mountAuthoring(host, services).then(workspace => {
      if (active) dispose = () => workspace.dispose();
      else workspace.dispose();
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; dispose?.(); host.remove(); };
  }, [theme]);
  return <><div ref={mount} className="product-story"/>{error && <p role="alert">{error}</p>}</>;
}

const meta = {
  id: 'review-studio-uxf06-workbench-navigation',
  title: 'Product/Studio/Workbench/Workbench Navigation',
  component: WorkbenchNavigation,
  parameters: { layout: 'fullscreen', docs: { description: { component:
    '真实 Studio 工作面、剧情目录、命令搜索和 Dock。内存夹具提供作品、布局偏好与页面内容。打开工作面菜单，从启动与主页进入页面搭建，使用命令搜索回到同一页面。在布局菜单切换侧栏并保存有名称的布局。' } } },
} satisfies Meta<typeof WorkbenchNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NavigationAndLayout: Story = {
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const workspaces = await canvas.findByRole('button', { name: '工作面' });
    await userEvent.click(workspaces);
    await waitFor(() => expect(body.getByRole('menuitem', { name: /^插件$/ })).toBeVisible());
    await waitFor(() => expect(body.getByRole('menuitem', { name: /^发布$/ })).toBeVisible());
    await expect(body.getAllByRole('menuitem', { name: /^页面搭建$/ })).toHaveLength(1);
    await userEvent.click(body.getByRole('menuitem', { name: '启动与主页' }));
    await waitFor(() => expect(canvasElement.querySelector('[data-view="startup"]')).toBeVisible());
    await userEvent.click(workspaces);
    await userEvent.click(await body.findByRole('menuitem', { name: /^页面搭建$/ }));
    await waitFor(() => expect(canvasElement.querySelector('[data-view="page:title"]')).toBeVisible());
    const pageTab = canvasElement.querySelector('[data-view="page:title"]');

    await userEvent.click(canvas.getByRole('button', { name: '搜索作品与命令' }));
    await userEvent.click(await body.findByRole('button', { name: /应用命令/ }));
    const search = await body.findByLabelText('搜索作品与命令', { selector: 'input' });
    await userEvent.type(search, '页面搭建');
    await waitFor(() => expect(body.getByRole('option', { name: /页面搭建/ })).toBeVisible());
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(body.queryByLabelText('搜索作品与命令', { selector: 'input' })).toBeNull());
    await expect(canvasElement.querySelector('[data-view="page:title"]')).toBe(pageTab);

    const layout = canvas.getByRole('button', { name: '布局' });
    await userEvent.click(layout);
    const left = await body.findByRole('menuitemcheckbox', { name: '左侧栏' });
    await expect(left).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(left);
    if (!body.queryByRole('menuitemcheckbox', { name: '左侧栏' })) await userEvent.click(layout);
    await expect(await body.findByRole('menuitemcheckbox', { name: '左侧栏' })).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(body.getByRole('menuitem', { name: '保存命名布局…' }));
    const name = await body.findByRole('textbox', { name: '布局名称' });
    await userEvent.type(name, '页面布局');
    const prompt = await body.findByRole('alertdialog', { name: '保存命名布局' });
    await userEvent.click(within(prompt).getByRole('button', { name: /^保存$/ }));
    await waitFor(() => expect(prompt).not.toBeVisible());
    await userEvent.click(layout);
    await waitFor(() => expect(body.getByRole('menuitem', { name: '页面布局' })).toBeVisible());
    await userEvent.click(body.getByRole('menuitem', { name: '页面布局' }));
    await expect(canvasElement.querySelector('[data-view="page:title"]')).toBeVisible();
    canvasElement.dataset.navigationReview = 'passed';
  },
};
export const Dusk: Story = { ...NavigationAndLayout, args: { theme: 'dark' } };
