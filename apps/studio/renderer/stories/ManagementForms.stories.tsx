import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import projects from './../pages/Projects/Projects.stories.js';
import plugins from './../pages/Plugins/Plugins.stories.js';
import pluginServices from './../pages/Plugins/PluginServices.stories.js';
import collaboration from './../pages/Collaboration/Collaboration.stories.js';
import publish from './../pages/Publish/Publish.stories.js';
import mobile from './../pages/Publish/MobileTargetOptions.stories.js';

const ProjectCenter = projects.component;
const Plugins = plugins.component;
const PluginServices = pluginServices.component;
const Collaboration = collaboration.component;
const Publish = publish.component;
const Mobile = mobile.component;

type Surface = 'create' | 'createFailure' | 'plugin' | 'resource' | 'scope' | 'assistant' | 'android' | 'signing';

function ManagementForms({ surface = 'create', theme = 'light' }: { surface?: Surface; theme?: 'light' | 'dark' }) {
  switch (surface) {
    case 'create':
    case 'createFailure':
      return <ProjectCenter theme={theme} workbench createError={surface === 'createFailure'}/>;
    case 'plugin':
      return <Plugins theme={theme}/>;
    case 'resource':
      return <PluginServices theme={theme} structured/>;
    case 'scope':
      return <Collaboration theme={theme} scenario="empty" document="new"/>;
    case 'assistant':
      return <Collaboration theme={theme} scenario="empty" document="configuration"/>;
    case 'android':
      return <Mobile theme={theme}/>;
    case 'signing':
      return <Publish theme={theme} pendingSigning/>;
  }
}

const meta = {
  id: 'review-studio-uxf06-management-forms',
  title: 'Product/Studio/Workbench/Management Forms',
  component: ManagementForms,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: '真实 Studio 表单使用 Product Story 的内存服务夹具。磁盘、引擎、插件包、MCP、Android 工具和 Windows 证书均由夹具提供。' } },
  },
} satisfies Meta<typeof ManagementForms>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectCreation: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '新建作品' }));
    const form = within(await canvas.findByRole('region', { name: '新建作品' }));
    await expect(form.getByRole('textbox', { name: '作品名称' })).toHaveFocus();
    await expect(form.getAllByRole('radio')).toHaveLength(4);
  },
};

export const ProjectCreateFailureDusk: Story = {
  args: { surface: 'createFailure', theme: 'dark' },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '新建作品' }));
    const form = within(await canvas.findByRole('region', { name: '新建作品' }));
    const name = form.getByRole('textbox', { name: '作品名称' });
    await userEvent.type(name, '星海来信');
    const submit = form.getByRole('button', { name: '选择目录并创建' });
    await userEvent.click(submit);
    await expect(await form.findByRole('alert')).toHaveTextContent('请更换目录后重试');
    await expect(name).toHaveValue('星海来信');
    await expect(submit).toBeEnabled();
  },
};

export const PluginInstall: Story = {
  args: { surface: 'plugin' },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '安装插件' }));
    const form = within(await canvas.findByRole('region', { name: '安装插件包' }));
    const inspect = form.getByRole('button', { name: '检查' });
    await expect(inspect).toBeDisabled();
    const path = form.getByRole('textbox', { name: '本机路径' });
    await userEvent.type(path, 'D:/插件/角色关系.galplugin');
    await userEvent.click(inspect);
    await expect(await form.findByRole('alert')).toHaveTextContent('检查路径后重试');
    await expect(path).toHaveValue('D:/插件/角色关系.galplugin');
    await userEvent.click(inspect);
    await expect(await form.findByRole('button', { name: '确认安装' })).toBeEnabled();
  },
};

export const PluginDevelopmentDusk: Story = {
  args: { surface: 'plugin', theme: 'dark' },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '开发目录' }));
    const form = within(await canvas.findByRole('region', { name: '加载开发目录' }));
    const path = form.getByRole('textbox', { name: '本机路径' });
    await userEvent.type(path, 'D:/插件/开发目录');
    await userEvent.click(form.getByRole('button', { name: '加载开发目录' }));
    await expect(await form.findByRole('alert')).toHaveTextContent('检查目录后重试');
    await expect(path).toHaveValue('D:/插件/开发目录');
  },
};

export const PluginResourceFields: Story = {
  args: { surface: 'resource' },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '处理所选素材' }));
    const input = await canvas.findByRole('textbox', { name: '色彩校正参数' });
    await userEvent.clear(input);
    await userEvent.type(input, 'invalid JSON');
    await userEvent.click(canvas.getByRole('button', { name: '生成处理候选' }));
    await expect(input).toHaveValue('invalid JSON');
    await expect(input).toHaveFocus();
    await expect(input).toHaveAccessibleDescription(/SyntaxError/);
    await expect(canvas.getAllByRole('alert')).toHaveLength(1);
    await expect(canvas.getByLabelText('夹具处理请求')).toHaveTextContent('0');
  },
};

export const CollaborationScope: Story = {
  args: { surface: 'scope' },
  play: async ({ canvas }) => {
    const goal = await canvas.findByRole('textbox', { name: '创作目标' });
    await userEvent.click(canvas.getByRole('button', { name: '确认范围并建立协作' }));
    await expect(goal).toHaveFocus();
    await expect(await canvas.findByText('请填写本轮希望助手完成的创作目标。')).toBeVisible();
  },
};

export const AssistantSetupDusk: Story = {
  args: { surface: 'assistant', theme: 'dark' },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '前往本机服务' }));
    await userEvent.click(await canvas.findByRole('button', { name: '开启服务' }));
    await expect(await canvas.findByText('服务运行中', { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '配置助手' }));
    await userEvent.click(await canvas.findByRole('combobox', { name: '助手客户端' }));
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('option', { name: 'Codex' }));
    await expect(canvas.queryByRole('combobox', { name: '配置位置' })).toBeNull();
    await expect(await canvas.findByRole('button', { name: '选择工作区目录' })).toBeEnabled();
    await expect(await canvas.findByRole('button', { name: '安装 / 更新 MCP 配置' })).toBeEnabled();
  },
};

export const AndroidPreparation: Story = {
  args: { surface: 'android' },
  play: async ({ canvas }) => {
    const prepare = await canvas.findByRole('button', { name: '准备环境' });
    await expect(prepare).toBeDisabled();
    await expect(prepare).toHaveAccessibleDescription(/先选择工具目录/);
    await userEvent.click(canvas.getByRole('button', { name: '选择工具目录' }));
    await expect(canvas.getByRole('button', { name: '检测环境' })).toBeEnabled();
    await expect(prepare).toHaveAccessibleDescription(/同意 Android SDK 许可条款/);
  },
};

export const WindowsSigningDusk: Story = {
  args: { surface: 'signing', theme: 'dark' },
  play: async ({ canvas }) => {
    const certificate = await canvas.findByRole('combobox', { name: '本次发行证书' });
    await expect(certificate).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '读取本机签名证书' }));
    await expect(await canvas.findByText(/本机没有可用于此发行的签名证书/)).toBeVisible();
    await expect(certificate).toBeDisabled();
  },
};
