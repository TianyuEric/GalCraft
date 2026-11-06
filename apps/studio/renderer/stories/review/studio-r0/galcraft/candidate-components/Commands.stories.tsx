import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CandidateStudio } from '../../../../../review/studio-candidate/CandidateStudio.js';
import { createEmptyCandidateSeed } from '../../../../../review/studio-candidate/application/documents.js';
import { candidateFixture } from '../../../studio-candidate/fixtures.js';

const fixture=candidateFixture();
const meta={title:'Review/Studio/R0/GalCraft R0/候选组件/完整指令',component:CandidateStudio,
  args:{...fixture,preferenceKey:'component-commands',initialView:`commands:${fixture.seed.ui.sceneId}`},
  parameters:{layout:'fullscreen',controls:{disable:true}},render:args=><CandidateStudio key={args.preferenceKey} {...args}/> } satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Ready:Story={name:'全部指令与活动选择'};
export const Dark:Story={name:'深色与浮层',args:{...candidateFixture('balanced','dark'),preferenceKey:'component-commands-dark'}};
export const KeyboardEditing: Story = {
  name: '键盘排序、间隙插入与撤销',
  args: { preferenceKey: 'component-commands-keyboard' },
  play: async ({ canvas, canvasElement }) => {
    const list = within(await canvas.findByRole('listbox', { name: '场景指令' }));
    const ids = () => list.getAllByRole('option').map(row => row.dataset.statementId);
    const before = ids();
    await userEvent.click(list.getAllByRole('option')[0]!);
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await waitFor(() => expect(ids().slice(0, 2)).toEqual([before[1], before[0]]));
    await userEvent.click(canvas.getByRole('button', { name: '撤销当前目标' }));
    await waitFor(() => expect(ids()).toEqual(before));
    await expect(list.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(list.getAllByRole('option')[0]!);
    await userEvent.keyboard('{Insert}');
    const picker = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: '插入指令' });
    await expect(within(picker).getByText('第 1 条指令之前')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    await expect(ids()).toEqual(before);
  },
};
export const Pending:Story={name:'待配置指令与保存保护',args:{preferenceKey:'component-commands-pending'},play:async({canvas,canvasElement})=>{
  await userEvent.click(await canvas.findByRole('button',{name:/^插入指令$/}));
  const page=within(canvasElement.ownerDocument.body);
  const picker=await page.findByRole('dialog',{name:'插入指令'});
  await userEvent.type(await within(picker).findByRole('combobox'),'等待');
  await userEvent.click(within(picker).getByRole('option',{name:/等待/}));
  await expect(await page.findByRole('form',{name:'待配置指令'})).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:/^保存全部$/}));
  await expect(canvas.getByText('工作面有未应用的修改，请先应用或恢复输入后保存。')).toBeVisible();
}};
const empty=createEmptyCandidateSeed(fixture.seed,'空指令审核');
export const Empty:Story={name:'空场景与插入入口',args:{...fixture,seed:empty,initialView:`commands:${empty.ui.sceneId}`,preferenceKey:'component-commands-empty'}};
const invalid=candidateFixture();invalid.seed.ui.sourceDrafts[invalid.seed.ui.sceneId]='%%%';invalid.seed.ui.sourceErrors[invalid.seed.ui.sceneId]='Expected command';
export const InvalidSource: Story = {
  name: '源码草稿错误时禁用语义修改',
  args: { ...invalid, preferenceKey: 'component-commands-invalid' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: '插入指令' })).toBeDisabled();
    const list = await canvas.findByRole('listbox', { name: '场景指令' });
    await expect(within(list).getAllByRole('option')[0]).toBeVisible();
    await expect(list.querySelector('[data-draggable=true]')).toBeNull();
    await expect(list.querySelector('[data-insert-before]')).toBeNull();
  },
};
