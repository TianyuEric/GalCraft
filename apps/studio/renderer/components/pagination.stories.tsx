import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { Pagination } from './pagination.js';
import './controls.css';

function Example({ total = 763, theme = 'light' }: { total?: number; theme?: string }) {
  const [page, setPage] = useState(0);
  return <div className="authoring-shell" data-theme={theme} style={{ maxWidth: 240, padding: 12 }}><Pagination total={total} page={page} pageSize={25} onPageChange={setPage} locale="zh-CN" label="调用历史分页"/></div>;
}
const meta = { title: 'Components/Pagination', component: Example } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const History: Story = { play: async ({ canvas }) => { await userEvent.click(canvas.getByRole('button', { name: '末页' })); await expect(canvas.getByText('751–763 / 763')).toBeVisible(); await userEvent.click(canvas.getByRole('button', { name: '首页' })); await expect(canvas.getByText('1–25 / 763')).toBeVisible(); } };
export const Dark: Story = { args: { theme: 'dark' } };
export const SinglePage: Story = { args: { total: 12 } };
export const Empty: Story = { args: { total: 0 } };
