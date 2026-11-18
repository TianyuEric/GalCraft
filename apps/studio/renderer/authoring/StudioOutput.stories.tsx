import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { StudioOutput } from './StudioOutput.js';

const meta = {
  title: 'Components/Workbench/Studio Output',
  component: StudioOutput,
  args: {
    locale: 'zh-CN', output: { scrollTop: 0 },
    openDocument: fn(), openPublish: fn(), openInstructions: fn(),
  },
} satisfies Meta<typeof StudioOutput>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const PreviousBuildAfterCancellation: Story = {
  args: {
    failure: { kind: 'build', id: 'Build2', cancelled: true },
    output: {
      scrollTop: 0,
      saved: { receipt: { transactionId: 'Save01', saved: [{ ref: { kind: 'document', id: 'Scene1' }, revision: 4 }], remainingDirty: [] }, source: 'scene:Scene1' },
      built: { planId: 'Build1', receipt: {
        projectId: 'Work01', releaseVersion: '0.1.1', target: 'web',
        outputDirectory: 'D:/作者验收/今晚让春天亮起来/最终候选版本/发布目录',
        entry: 'D:/作者验收/今晚让春天亮起来/最终候选版本/发布目录/index.html',
        instructionsPath: 'D:/作者验收/今晚让春天亮起来/最终候选版本/发布目录/README.html',
        handoff: { kind: 'directory', path: 'D:/作者验收/今晚让春天亮起来/最终候选版本/发布目录' },
        localTest: { result: 'notExecuted', evidencePaths: [] },
      } },
    },
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText('Build2')).toBeVisible();
    await expect(canvas.getByText(/Build1.*web.*0.1.1/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '返回保存来源' }));
    await expect(args.openDocument).toHaveBeenCalledWith('scene:Scene1');
  },
};
