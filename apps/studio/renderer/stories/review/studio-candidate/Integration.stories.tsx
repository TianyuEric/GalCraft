import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CandidateStudio } from '../../../review/studio-candidate/CandidateStudio.js';
import { candidateFixture } from './fixtures.js';
const meta = { title: 'Review/Studio/候选 Studio/集成状态', component: CandidateStudio, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Wiring: Story = { name: '接线与保存恢复', args: { ...candidateFixture(), preferenceKey: 'integration', showIntegration: true, hostOptions: { saveDelayMs: 900 } } };
export const Long: Story = { name: '长中文与会话保持', args: { ...candidateFixture('long'), preferenceKey: 'long', initialLayout: 'writing' } };
export const Isolated: Story = { name: '两个独立 Story 与作品会话', args: { ...candidateFixture(), preferenceKey: 'isolation' }, render: () => <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',height:'100vh'}}>{['writing','dark'].map(name=><iframe key={name} title={`独立候选 ${name}`} style={{width:'100%',height:'100%',border:0}} src={`./iframe.html?id=review-studio-候选-studio-完整流程--${name}&viewMode=story`}/>)}</div> };
export const AssetImportRetry: Story = {
  name: '素材导入部分失败与重试',
  args: {
    ...candidateFixture('balanced', 'light', {
      importPaths: ['/practice/backgrounds/spring-station.png', '/practice/backgrounds/spring-town.png'],
      failImportOnce: ['/practice/backgrounds/spring-town.png'],
    }),
    preferenceKey: 'asset-import-retry', initialView: 'assets',
  },
  play: async ({ canvas }) => {
    const file=new File(['<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>'],'本地图片.svg',{type:'image/svg+xml'});
    const rejected=new File(['invalid'],'暂不可用.txt',{type:'text/plain'});
    await userEvent.upload(await canvas.findByLabelText('选择素材文件'),[file,rejected],{applyAccept:false});
    const result = within(await canvas.findByRole('region', { name: '素材导入结果' }));
    await expect(result.getByRole('status')).toHaveTextContent('已导入 1 项 · 未导入 1 项');
    await expect(result.getByRole('list', { name: '未导入文件' })).toHaveTextContent('暂不可用.txt');
  },
};
