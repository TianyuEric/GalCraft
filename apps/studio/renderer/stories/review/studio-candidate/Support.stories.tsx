import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateStudio } from '../../../review/studio-candidate/CandidateStudio.js';
import { candidateFixture } from './fixtures.js';

const meta = {
  title: 'Review/Studio/候选 Studio/支持工作面', component: CandidateStudio, parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Collaboration: Story = { name: '协作轮次与回执', args: { ...candidateFixture(), preferenceKey: 'support-collaboration', initialView: 'collaboration' } };
export const Plugins: Story = { name: '插件包与真实文档', args: { ...candidateFixture(), preferenceKey: 'support-plugins', initialView: 'plugins' } };
export const Publish: Story = { name: '发布检查与构建回执', args: { ...candidateFixture(), preferenceKey: 'support-publish', initialView: 'publish' } };
