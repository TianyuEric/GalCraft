import type { Meta, StoryObj } from '@storybook/react-vite';
import { StudioReview } from '../../../../studio-r0/StudioReview.js';
import { createReviewSeed, createReviewServices } from './fixtures.js';
const meta = {
  title: 'Review/Studio/R0/GalCraft R0/独立工作面',
  render: args => <StudioReview key={args.preferenceKey} {...args} />,
  args: {
    initialExplorer: false
  },
  parameters: {
    layout: 'fullscreen',
    controls: {
      disable: true
    }
  }
} satisfies Meta<typeof StudioReview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Stage: Story = {
  name: '舞台主导演出',
  args: {
    seed: createReviewSeed('inline'),
    services: () => createReviewServices(),
    initialLayout: 'stage',
    preferenceKey: 'stage'
  }
};
export const ProjectSettings: Story = {
  name: '作品设置',
  args: {
    seed: createReviewSeed(),
    services: () => createReviewServices(),
    initialLayout: 'page',
    initialView: 'project-settings',
    preferenceKey: 'project-settings'
  }
};
export const Connections: Story = {
  name: '插件与连接',
  args: {
    seed: createReviewSeed(),
    services: () => createReviewServices(),
    initialLayout: 'page',
    initialView: 'connections',
    preferenceKey: 'connections'
  }
};
export const Backups: Story = {
  name: '会话备份与恢复',
  args: {
    seed: createReviewSeed(),
    services: () => createReviewServices(),
    initialLayout: 'page',
    initialView: 'backups',
    preferenceKey: 'backups'
  }
};
export const Build: Story = {
  name: '审核构建与成果',
  args: {
    seed: createReviewSeed(),
    services: () => createReviewServices(),
    initialLayout: 'page',
    initialView: 'build',
    preferenceKey: 'build'
  }
};
export const Writing: Story = {
  name: '专注连续写作',
  args: {
    seed: createReviewSeed('writing'),
    services: () => createReviewServices(),
    initialLayout: 'writing',
    preferenceKey: 'writing'
  }
};
export const Source: Story = {
  name: '同场景文稿与源码',
  args: {
    seed: createReviewSeed('source'),
    services: () => createReviewServices(),
    initialLayout: 'source',
    preferenceKey: 'source'
  }
};
export const Page: Story = {
  name: '页面布局与对象',
  args: {
    seed: createReviewSeed('page'),
    services: () => createReviewServices(),
    initialLayout: 'page',
    preferenceKey: 'page'
  }
};
export const Blueprint: Story = {
  name: '页面行为蓝图',
  args: {
    seed: createReviewSeed('blueprint'),
    services: () => createReviewServices(),
    initialLayout: 'page',
    initialView: 'blueprint',
    preferenceKey: 'blueprint'
  }
};
export const Character: Story = {
  name: '角色组合与外观轴',
  args: {
    seed: createReviewSeed('character'),
    services: () => createReviewServices(),
    initialLayout: 'character',
    initialView: 'character',
    preferenceKey: 'character'
  }
};
export const Psd: Story = {
  name: 'PSD 图层映射三步',
  args: {
    seed: createReviewSeed('psd'),
    services: () => createReviewServices(),
    initialLayout: 'character',
    initialView: 'psd',
    preferenceKey: 'psd'
  }
};
export const Production: Story = {
  name: '素材制作与成果采用',
  args: {
    seed: createReviewSeed('production'),
    services: () => createReviewServices(),
    initialLayout: 'production',
    preferenceKey: 'production'
  }
};
export const Assets: Story = {
  name: '素材浏览与选择',
  args: {
    seed: createReviewSeed(),
    services: () => createReviewServices(),
    initialView: 'assets',
    preferenceKey: 'assets'
  }
};
export const Settings: Story = {
  name: '全局设置与审核服务',
  args: {
    seed: createReviewSeed('settings'),
    services: () => createReviewServices(),
    initialView: 'settings',
    preferenceKey: 'settings'
  }
};
