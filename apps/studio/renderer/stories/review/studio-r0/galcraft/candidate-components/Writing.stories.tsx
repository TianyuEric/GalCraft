import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CandidateStudio } from '../../../../../review/studio-candidate/CandidateStudio.js';
import { candidateFixture } from '../../../studio-candidate/fixtures.js';

const meta = {
  title: 'Review/Studio/R0/GalCraft R0/候选组件/文稿与句内事件',
  component: CandidateStudio,
  args: { ...candidateFixture('inline'), initialLayout: 'writing', preferenceKey: 'candidate-component-writing' },
  render: args => <CandidateStudio key={args.preferenceKey} {...args}/>,
  parameters: { layout: 'fullscreen', controls: { disable: true } },
} satisfies Meta<typeof CandidateStudio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditInlineEvent: Story = {
  name: '插入停顿并修改推进方式',
  play: async ({ canvas }) => {
    await canvas.findByRole('textbox', { name: /文稿正文/ });
    const tools = within(canvas.getByRole('group', { name: '插入句内事件' }));
    await userEvent.click(tools.getByRole('button', { name: /^停顿$/ }));
    const mode = await canvas.findByRole('combobox', { name: '推进方式' });
    await expect(mode).toHaveTextContent('定时停顿');
    await userEvent.click(mode);
    await userEvent.click(canvas.getByRole('option', { name: '等待点击' }));
    await expect(mode).toHaveTextContent('等待点击');
    await expect(canvas.getByRole('group', { name: '舞台来源' })).toHaveAccessibleDescription('跟随编辑位置');
  },
};

export const IndependentSources: Story = {
  name: '舞台恢复跟随时保留属性固定',
  args: { ...candidateFixture('pinned'), preferenceKey: 'candidate-component-writing-pinned' },
  play: async ({ canvas }) => {
    const stage = await canvas.findByRole('group', { name: '舞台来源' });
    const inspector = canvas.getByRole('group', { name: '属性来源' });
    await expect(stage).toHaveTextContent('第 24 句');
    await expect(inspector).toHaveTextContent('第 24 句');
    await userEvent.click(within(stage).getByRole('button', { name: '恢复跟随' }));
    await expect(stage).toHaveTextContent('第 26 句');
    await expect(inspector).toHaveTextContent('第 24 句');
    await expect(within(inspector).getByRole('button', { name: '恢复跟随' })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Dark: Story = { name: '深色 · 同一文稿', args: { ...candidateFixture('inline', 'dark'), preferenceKey: 'candidate-component-writing-dark' } };
export const Empty: Story = { name: '空文稿', args: { ...candidateFixture('empty'), preferenceKey: 'candidate-component-writing-empty' } };
