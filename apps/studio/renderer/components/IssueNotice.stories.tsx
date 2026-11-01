import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { IssueNotice } from './issue-notice.js';

const meta = { title: 'Components/诊断', component: IssueNotice, parameters: { layout: 'fullscreen' }, decorators: [(Story, context) => <main id="app" className="authoring-shell" data-theme={context.parameters.studioTheme ?? 'light'} style={{ padding:16, minHeight:'100vh', background:'var(--background)', color:'var(--foreground)' }}><div style={{ maxWidth:context.parameters.noticeWidth ?? 720 }}><Story/></div></main>], args: { locale: 'zh-CN', issue: { code: 'PROJECT_INVALID', message: 'project.json: expected chapters array', severity: 'error', owner: 'M02', related: [], actions: ['retry'] } } } satisfies Meta<typeof IssueNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Failure: Story = { play: async ({ canvas }) => {
  await userEvent.click(canvas.getByText('诊断详情'));
  await expect(canvas.getByText('project.json: expected chapters array', { exact: true })).toBeVisible();
} };
export const ProviderWarning: Story = { args: { issue: { code: 'GALLERY_ENDING_REQUIRED', message: '鉴赏页面需要至少一个带结局标识的 end', severity: 'warning' } } };
export const ProviderInfo: Story = { args: { locale: 'en', issue: { code: 'PROVIDER_NOTE', message: 'This provider exports uncompressed audio.', severity: 'info' } } };
export const Japanese: Story = { args: { locale: 'ja' } };

export const Dark: Story = { parameters: { studioTheme: 'dark' } };
export const Narrow: Story = { parameters: { noticeWidth: 360 } };
