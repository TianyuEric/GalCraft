import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { studioToasts } from '../components/toast.js';
import notifications from './Notifications.stories.js';

const meta = {
  id: 'review-studio-uxf06-workbench-messages',
  title: 'Product/Studio/Workbench/Workbench Messages',
  component: notifications.component,
  args: { scenario: 'history', locale: 'en', theme: 'light' },
  parameters: { layout: 'fullscreen', docs: { description: { component:
    '两条消息同时出现时，继续点击工作台撤销、重做和页签。通知留在顶部居中，避开命令和第一排文档页签。夹具提供历史失败和布局保存反馈，消息和工作台使用实际组件。',
  } } },
} satisfies Meta<typeof notifications.component>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StackedMessages: Story = {
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-notification-story-ready]')).toBeTruthy());
    const root = canvasElement.ownerDocument;
    const messages = () => [...root.querySelectorAll<HTMLElement>('.studio-toast:not([data-ending-style])')];
    const history = (action: string) => canvasElement.querySelector<HTMLElement>(`.gc-studio-chrome [data-action="${action}"]`)!;
    const dock = canvasElement.querySelector<HTMLElement>('.gc-dock')!;
    const before = dock.getBoundingClientRect().toJSON();
    await userEvent.click(history('undo'));
    await waitFor(() => expect(messages()).toHaveLength(1));
    studioToasts.add({ id: 'workbench-layout-fixture', type: 'success', title: 'Layout saved', timeout: 0 });
    await waitFor(() => expect(messages()).toHaveLength(2));
    await userEvent.click(history('redo'));
    await waitFor(() => expect(messages().some(message => message.dataset.messageType === 'error')).toBe(true));
    for (const control of [history('undo'), history('redo'), history('save'), ...canvas.getAllByRole('tab')]) {
      const bounds = control.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const hit = root.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect(hit?.closest('.studio-toast')).toBeFalsy();
    }
    await expect(dock.getBoundingClientRect().toJSON()).toEqual(before);
    await expect(getComputedStyle(messages()[0]!.querySelector('.studio-toast-content')!).userSelect).toBe('text');
    await userEvent.click(within(messages()[1]!).getByRole('button', { name: 'Dismiss notification' }));
  },
};
export const StackedMessagesDusk: Story = { ...StackedMessages, args: { theme: 'dark' } };
