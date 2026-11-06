import type { Meta, StoryObj } from '@storybook/react-vite';
import { StudioReview } from '../../../../studio-r0/StudioReview.js';
import { createReviewSeed, createReviewServices } from './fixtures.js';
const meta = {
  title: 'Review/Studio/R0/GalCraft R0/关键状态',
  render: args => <StudioReview key={args.preferenceKey} {...args} />,
  parameters: {
    layout: 'fullscreen',
    controls: {
      disable: true
    }
  }
} satisfies Meta<typeof StudioReview>;
export default meta;
type Story = StoryObj<typeof meta>;
const following = createReviewSeed('inline');
following.ui.lineId = 'l26';
following.ui.selected = {
  kind: 'event',
  documentId: 'street',
  id: 'expression26',
  lineId: 'l26'
};
following.ui.selection = {
  lineId: 'l26',
  start: 6,
  end: 6
};
following.ui.preview = {
  ...following.ui.preview,
  lineId: 'l26',
  offset: 6
};
const commands = createReviewSeed('inline');
commands.ui.commandOpen = true;
const custom = createReviewSeed('inline');
custom.ui.pins.assets = {
  kind: 'character',
  documentId: 'qibai',
  id: 'qibai'
};
const documents = createReviewSeed('inline');
documents.ui.selected = {
  kind: 'page-object',
  documentId: 'start-page',
  id: 'start'
};
export const Follow: Story = {
  name: '面板来源跟随',
  args: {
    seed: following,
    services: () => createReviewServices(),
    preferenceKey: 'follow'
  }
};
export const Commands: Story = {
  name: '全局入口与键盘焦点',
  args: {
    seed: commands,
    services: () => createReviewServices(),
    preferenceKey: 'commands'
  }
};
export const Docking: Story = {
  name: '自定义停靠与窗口内浮动',
  args: {
    seed: custom,
    services: () => createReviewServices(),
    initialLayout: 'custom',
    initialExplorer: false,
    preferenceKey: 'docking'
  }
};
export const Documents: Story = {
  name: '不同文档并排',
  args: {
    seed: documents,
    services: () => createReviewServices(),
    initialLayout: 'documents',
    initialExplorer: false,
    preferenceKey: 'documents'
  }
};
export const Inline: Story = {
  name: '句内事件与选区',
  args: {
    seed: createReviewSeed('inline'),
    services: () => createReviewServices(),
    preferenceKey: 'inline'
  }
};
export const Pinned: Story = {
  name: '面板独立固定来源',
  args: {
    seed: createReviewSeed('pinned'),
    services: () => createReviewServices(),
    preferenceKey: 'pinned'
  }
};
export const Long: Story = {
  name: '中文长文与滚动',
  args: {
    seed: createReviewSeed('long'),
    services: () => createReviewServices(),
    initialLayout: 'writing',
    preferenceKey: 'long'
  }
};
export const Empty: Story = {
  name: '空文稿与素材',
  args: {
    seed: createReviewSeed('empty'),
    services: () => createReviewServices(),
    preferenceKey: 'empty'
  }
};
export const Running: Story = {
  name: '制作运行中与取消',
  args: {
    seed: createReviewSeed('running'),
    services: () => createReviewServices(),
    initialLayout: 'production',
    preferenceKey: 'running',
    startProduction: true
  }
};
export const Failure: Story = {
  name: '制作失败与重试',
  args: {
    seed: createReviewSeed('failure'),
    services: () => createReviewServices(),
    initialLayout: 'production',
    preferenceKey: 'failure'
  }
};
