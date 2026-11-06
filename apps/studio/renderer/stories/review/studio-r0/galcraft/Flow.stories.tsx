import type { Meta, StoryObj } from '@storybook/react-vite';
import { StudioReview } from '../../../../studio-r0/StudioReview.js';
import { createReviewSeed, createReviewServices } from './fixtures.js';
const meta = {
  title: 'Review/Studio/R0/GalCraft R0/完整创作流程',
  render: args => <StudioReview key={args.preferenceKey} {...args} />,
  parameters: {
    layout: 'fullscreen',
    controls: {
      disable: true
    },
    docs: {
      description: {
        component: '共享会话作品：连续写作 → 句内事件 → 舞台检查 → 手改 → 撤销 → 切换返回。保存、PSD 和素材制作使用确定性服务；正式宿主沿后续批次接入。'
      }
    }
  }
} satisfies Meta<typeof StudioReview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Balanced: Story = {
  name: '文稿与舞台并重',
  args: {
    seed: createReviewSeed('inline'),
    services: () => createReviewServices(),
    preferenceKey: 'flow-balanced'
  }
};
export const Dark: Story = {
  name: '深色 · 同一作品',
  args: {
    seed: createReviewSeed('inline', 'dark'),
    services: () => createReviewServices(),
    preferenceKey: 'flow-dark'
  }
};
export const Recovery: Story = {
  name: '保存与制作失败后恢复',
  args: {
    seed: createReviewSeed(),
    services: () => createReviewServices({
      failSave: true,
      failFirstProduction: true
    }),
    preferenceKey: 'flow-recovery'
  }
};
