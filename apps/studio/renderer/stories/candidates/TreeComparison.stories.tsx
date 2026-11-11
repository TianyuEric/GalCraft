import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { TreeComparison } from './TreeComparison.js';

const meta = { id: 'product-studio-component-comparison-batch-2', title: 'Review/History/Component Comparison/Batch 2', component: TreeComparison, parameters: { layout: 'fullscreen', docs: { description: { component: '历史对象树方案对照；保留原实现与候选用于比较，不代表当前 Studio 的完整界面。' } } } } satisfies Meta<typeof TreeComparison>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TryCandidates: Story = { name: '第二批 · 开始体验', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { name: '作品对象 · 第二批比较' })).toBeVisible();
  const filter = canvas.getByRole('textbox', { name: '筛选章节与场景' });
  await userEvent.type(filter, '站台');
  await expect(canvas.getByText('，1 项不在结果中')).toBeVisible();
  await userEvent.click(canvas.getByRole('button', { name: '清除筛选' }));
  await expect(filter).toHaveValue('');
} };
export const Baseline: Story = { name: '第二批 · 原实现', args: { initialKind: 'baseline' } };
export const Dusk: Story = { name: '第二批 · 深色', args: { initialTheme: 'dark' } };
export const Large: Story = { name: '第二批 · 合成大树', args: { initialMode: 'large' } };
export const Empty: Story = { args: { initialMode: 'empty' } };
export const Readonly: Story = { args: { initialMode: 'readonly' } };
export const RenameFailure: Story = { args: { initialFailure: true } };
