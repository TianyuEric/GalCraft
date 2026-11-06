import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateStudio } from '../../../review/studio-candidate/CandidateStudio.js';
import { candidateFixture, templateMappingFixture } from './fixtures.js';
const meta = { title: 'Review/Studio/候选 Studio/完整流程', component: CandidateStudio, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Complete: Story = { name: '完整候选 Studio', args: { ...candidateFixture(), preferenceKey: 'complete' } };
export const Writing: Story = { name: '写作主链', args: { ...candidateFixture(), preferenceKey: 'writing' } };
export const Source: Story = { name: '同场景文稿与源码', args: { ...candidateFixture(), preferenceKey: 'source', initialLayout: 'source' } };
export const Documents: Story = { name: '两个文档并排', args: { ...candidateFixture(), preferenceKey: 'documents', initialLayout: 'documents' } };
export const Dark: Story = { name: '深色写作主链', args: { ...candidateFixture('balanced', 'dark'), preferenceKey: 'dark' } };
export const Projects: Story = { name:'作品库与作品切换',args:{...candidateFixture(),preferenceKey:'projects',initialProjectState:'center'} };
export const Empty: Story = { name:'新建作品',args:{...candidateFixture(),preferenceKey:'empty',initialProjectState:'empty'} };
export const OpenFailure: Story = { name:'打开失败与重试',args:{...candidateFixture(),preferenceKey:'open-failure',initialProjectState:'failed'} };
export const Recovery: Story = { name:'作品备份与恢复',args:{...candidateFixture(),preferenceKey:'recovery',initialProjectState:'recovery'} };
export const Commands: Story = { name:'完整指令与运行舞台',args:{...candidateFixture(),preferenceKey:'commands',initialView:`commands:${candidateFixture().seed.ui.sceneId}`} };
export const Production: Story = { name:'制作与结果采纳',args:{...candidateFixture(),preferenceKey:'production',initialView:'production'} };
export const Collaboration: Story = { name:'协作与作用范围',args:{...candidateFixture(),preferenceKey:'collaboration',initialView:'collaboration'} };
export const Assets: Story = { name:'素材与派生版本',args:{...candidateFixture(),preferenceKey:'assets',initialView:'assets'} };
export const Pages: Story = { name:'页面与组件',args:{...candidateFixture(),preferenceKey:'pages',initialView:'pages'} };
export const TemplateMapping: Story = {
  name: '模板外部引用映射',
  args: { ...templateMappingFixture(), preferenceKey: 'template-mapping', initialView: 'page:@templates' },
};
