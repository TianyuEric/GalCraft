import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CandidateStudio } from '../../../../../review/studio-candidate/CandidateStudio.js';
import { candidateFixture } from '../../../studio-candidate/fixtures.js';

const meta = { title: 'Review/Studio/R0/GalCraft R0/候选组件/工作面职责', component: CandidateStudio,
  args: { ...candidateFixture(), preferenceKey: 'panel-contract' }, parameters: { layout: 'fullscreen', controls: { disable: true } },
  render: args => <CandidateStudio key={args.preferenceKey} {...args}/> } satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Directory: Story = { name: '目录过滤与全局菜单返回', play: async ({ canvas }) => {
  const input = await canvas.findByRole('searchbox', { name: '查找章节或场景' });
  const directory = within(canvas.getByRole('complementary', { name: '剧情目录' }));
  await userEvent.click(directory.getByText('春灯之夜', { exact: true }));
  await userEvent.type(input, '店前');
  await expect(directory.getByRole('button', { name: '店前 · 把星星挂起来' })).toBeVisible();
  await userEvent.clear(input);
  const menu = canvas.getByText('工作面', { exact: true });
  await userEvent.click(menu);
  await userEvent.keyboard('{Escape}');
  await expect(menu.closest('details')).not.toHaveAttribute('open');
  await expect(menu).toHaveFocus();
} };
export const ProjectConfirmation: Story = { name: '项目确认的焦点与取消', args: { initialProjectState: 'center', preferenceKey: 'panel-confirmation' },
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('button', { name: '关闭作品' });
    await userEvent.click(trigger);
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: '关闭作品选择' });
    await expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus();
    await expect(canvas.getByRole('button', { name: '打开作品' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  } };
