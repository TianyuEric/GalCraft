import type { Meta, StoryObj } from '@storybook/react-vite';
import { ShellHeader } from './shell-header.js';
import { ProjectTitle } from './ProjectTitle.js';
import './workbench/workbench.css';
import '../authoring/shell.css';
import '../authoring/refinements.css';

const meta = { title: 'Product/Studio/Workbench/Project title', component: ProjectTitle,
  decorators: [(Story, context) => <><div id="studio-portals" data-theme="light"/><div className="authoring-shell" data-theme="light" style={context.name === 'Header' ? undefined : { width: 180, padding: 16 }}><Story/></div></>],
  args: { name: '今晚，让春天亮起来 · 放映馆的最后一封信与我们的春日约定', dirty: true, unsavedLabel: '未保存' },
} satisfies Meta<typeof ProjectTitle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overflow: Story = {};
export const Short: Story = { args: { name: '春灯', dirty: false } };

export const Header: Story = { decorators: [], render: () => <div className="authoring-shell gc-workbench" data-theme="light"><header className="authoring-header gc-wb-header"><ShellHeader locale="zh-CN" theme="light" project="今晚，让春天亮起来 · 放映馆的最后一封信与我们的春日约定" dirty action={() => {}} preferences={() => {}} collapsed={false} toggleSidebar={() => {}} service={<button type="button">本机服务</button>}/></header></div> };
