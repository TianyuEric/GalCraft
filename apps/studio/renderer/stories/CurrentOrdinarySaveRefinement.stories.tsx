import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { mountAuthoring } from '../authoring/view.js';
import { currentOrdinarySaveRefinementFixture } from './current-ordinary-save-refinement-fixture.js';

type OrdinaryScenario = 'project' | 'startup';
function CurrentOrdinarySave({ theme = 'light', scenario = 'project', noViewpoint = false }: { theme?: 'light' | 'dark'; scenario?: OrdinaryScenario; noViewpoint?: boolean }) {
  const host = useRef<HTMLDivElement>(null), shell = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(''), [iteration, setIteration] = useState(0), [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    setInitialized(false); shell.current?.removeAttribute('data-ready'); shell.current?.removeAttribute('data-result');
    let active = true, workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
    const app = document.createElement('div'); app.id = 'app'; app.dataset.locale = 'zh-CN'; app.dataset.theme = theme;
    host.current.append(app);
    let portals = document.getElementById('studio-portals');
    const ownsPortals = !portals;
    if (!portals) { portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.locale = 'zh-CN'; portals.dataset.theme = theme;
    void currentOrdinarySaveRefinementFixture(theme, metrics => {
      if (!shell.current) return;
      for (const [key, value] of Object.entries(metrics)) shell.current.dataset[key] = Array.isArray(value) ? value.join(',') : String(value);
    }, noViewpoint).then(async fixture => {
      if (!active) return;
      workspace = await mountAuthoring(app, fixture.services);
      if (!active) { workspace.dispose(); return; }
      await workspace.openDocument(scenario === 'project' ? { kind: 'project' } : { kind: 'startup' });
      if (shell.current) { shell.current.dataset.ready = 'true'; setInitialized(true); }
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; workspace?.dispose(); app.remove(); if (ownsPortals) portals?.remove(); };
  }, [theme, scenario, noViewpoint, iteration]);
  return <div ref={shell} data-current-ordinary-save={scenario} data-theme={theme} data-locale="zh-CN">
    {error && <p role="alert">{error}</p>}<div className="product-story" ref={host} />
    <button type="button" disabled={!initialized} style={{ position: 'fixed', insetBlockEnd: 4, insetInlineEnd: 20, zIndex: 20 }}
      title="仅用于 Story 夹具：重建初始内存作品与保存调用计数，不会写入磁盘。"
      onClick={() => { setError(''); setInitialized(false); setIteration(value => value + 1); }}>夹具：重新开始本组</button>
  </div>;
}

const meta = {
  id: 'review-studio-uxf03-current-ordinary-save', title: 'Product/Studio/Workbench/Current Ordinary Save', component: CurrentOrdinarySave,
  args: { theme: 'light', scenario: 'project' }, parameters: { layout: 'fullscreen', docs: { description: { component:
    '已接受的普通资料当前保存流程。真实 mountAuthoring、作品语言、主角姓名、启动编辑器及原保存审阅共用实际编辑事务；内存保存夹具记录应用、planSave 和 save 调用及目标范围。非法输入应留在原字段并阻止规划，合法 Ctrl+S 先应用当前输入，再进入原 M02 保存审阅；取消保留工作区修改。本组不测试 IME，不写磁盘，作为已接受的 Product 流程回归保留。右下角夹具按钮恢复初始状态。' } } },
} satisfies Meta<typeof CurrentOrdinarySave>;
export default meta;
type Story = StoryObj<typeof meta>;

const state = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-current-ordinary-save]')!;
const ready = async (element: HTMLElement) => waitFor(() => expect(state(element)).toHaveAttribute('data-ready', 'true'), { timeout: 5000 });
const replace = async (input: HTMLElement, value: string) => {
  await userEvent.click(input); await expect(input).toHaveFocus(); await userEvent.clear(input); if (value) await userEvent.type(input, value);
};
const invalidStopsSave = async (element: HTMLElement, input: HTMLElement, message?: string) => {
  const plans = state(element).dataset.plans, applies = state(element).dataset.applies;
  await userEvent.keyboard('{Control>}s{/Control}');
  if (message) await expect(await within(element).findByText(message, { exact: true }, { timeout: 5000 })).toBeVisible();
  await waitFor(() => expect(input).toHaveFocus(), { timeout: 5000 });
  await expect(within(element.ownerDocument.body).queryByRole('dialog', { name: '保存审阅' })).toBeNull();
  await expect(state(element)).toHaveAttribute('data-plans', plans!);
  await expect(state(element)).toHaveAttribute('data-applies', applies!);
  await expect(state(element)).toHaveAttribute('data-saves', '0');
};
const reviewAndCancel = async (element: HTMLElement) => {
  const plans = Number(state(element).dataset.plans);
  await userEvent.keyboard('{Control>}s{/Control}');
  const body = within(element.ownerDocument.body), dialog = within(await body.findByRole('dialog', { name: '保存审阅' }, { timeout: 5000 }));
  await expect(dialog.getAllByRole('checkbox')).toHaveLength(1);
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  await expect(state(element)).toHaveAttribute('data-members', state(element).dataset.projectDocument!);
  await expect(state(element)).toHaveAttribute('data-plans', String(plans + 1));
  await expect(state(element)).toHaveAttribute('data-saves', '0');
  await userEvent.click(dialog.getByRole('button', { name: '取消' }));
  await waitFor(() => expect(body.queryByRole('dialog', { name: '保存审阅' })).toBeNull(), { timeout: 5000 });
  await expect(state(element)).toHaveAttribute('data-project-dirty', 'true');
};

export const ProjectDetails: Story = {
  parameters: { docs: { description: { story: '在作品设置内将正文源语言留空后 Ctrl+S，校验应定位原字段且不规划保存；改为 ja 后进入保存审阅，取消仍保留已应用修改。随后将主角姓名设为固定姓名，空姓名再次阻止规划；填写春树后进入同一作品文档的审阅，再取消。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    const source = canvas.getByRole('textbox', { name: /正文源语言/ });
    await replace(source, ''); await invalidStopsSave(canvasElement, source, '请填写正文源语言，例如 zh-CN。'); await expect(source).toHaveValue('');
    await replace(source, 'ja'); await reviewAndCancel(canvasElement);
    await expect(source).toHaveValue('ja'); await expect(state(canvasElement)).toHaveAttribute('data-source-language', 'ja');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: '姓名方式' }), 'fixed');
    const name = canvas.getByRole('textbox', { name: '默认姓名' });
    await replace(name, ''); await invalidStopsSave(canvasElement, name); await expect(name).toHaveValue('');
    await expect(name).toBeInvalid();
    await replace(name, '春树'); await reviewAndCancel(canvasElement);
    await expect(canvas.getByRole('textbox', { name: '默认姓名' })).toHaveValue('春树');
    await expect(state(canvasElement)).toHaveAttribute('data-default-name', '春树');
    await expect(state(canvasElement)).toHaveAttribute('data-saves', '0');
    state(canvasElement).dataset.result = 'passed';
  },
};
export const ProjectDetailsDusk: Story = { ...ProjectDetails, args: { theme: 'dark' } };

export const StartupInput: Story = {
  args: { scenario: 'startup' },
  parameters: { docs: { description: { story: '启动图片停留时长留空时 Ctrl+S 保留字段且不规划；4200 ms 的合法输入应应用并进入作品保存审阅，取消保留 dirty。随后由真实入口编排文字开屏序列，片段停留空值同样阻止保存；3200 ms 合法输入与 600 ms 揭示主页一起进入现有审阅，取消仍可继续编辑。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await userEvent.click(canvas.getByText('当前文档工具', { selector: 'summary' }));
    const hold = canvas.getByRole('spinbutton', { name: '停留时长 · ms' });
    await expect(hold).toBeVisible();
    await replace(hold, ''); await invalidStopsSave(canvasElement, hold, '请填写有效范围内的数值。'); await expect(hold).toHaveValue(null);
    await replace(hold, '4200'); await reviewAndCancel(canvasElement);
    await expect(state(canvasElement)).toHaveAttribute('data-splash-duration', '4200');
    await userEvent.click(canvas.getByRole('button', { name: '编排原生开屏序列' }));
    const clip = await canvas.findByRole('spinbutton', { name: '片段停留 · ms' }, { timeout: 5000 });
    await replace(clip, ''); await invalidStopsSave(canvasElement, clip, '请填写非负有效数值。当前草稿和有效预览已保留。'); await expect(clip).toHaveValue(null);
    await replace(clip, '3200');
    await replace(canvas.getByRole('spinbutton', { name: '揭示主页 · ms' }), '600');
    await reviewAndCancel(canvasElement);
    await expect(state(canvasElement)).toHaveAttribute('data-clip-hold', '3200');
    await expect(state(canvasElement)).toHaveAttribute('data-reveal', '600');
    await expect(state(canvasElement)).toHaveAttribute('data-saves', '0');
    state(canvasElement).dataset.result = 'passed';
  },
};
export const StartupInputDusk: Story = { ...StartupInput, args: { scenario: 'startup', theme: 'dark' } };

export const ViewpointSetup: Story = {
  args: { noViewpoint: true },
  parameters: { docs: { description: { story: '夹具通过真实 characterEdit 将原玩家视角角色改为配角并内存保存，计数从准备之后开始。当前作品没有视角角色时，主角姓名的新指引与“创建或设置视角角色”打开真实角色目录；作者选择“我”进入原 ID 的独立资料文档。本场景不修改、应用或保存人物。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await expect(canvas.getByText(/先在.*角色目录.*玩家视角/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '创建或设置视角角色' }));
    await waitFor(() => expect(canvas.getByLabelText('角色目录', { selector: 'button' })).toHaveAttribute('aria-pressed', 'true'), { timeout: 5000 });
    await userEvent.click(canvas.getByRole('button', { name: /^我.*配角/ }));
    const character = () => canvasElement.querySelector<HTMLElement>(`[data-view="character:${FixtureIds.protagonist}"]`);
    await waitFor(() => expect(character()).toBeVisible(), { timeout: 5000 });
    await expect(within(character()!).getByLabelText('角色名称')).toHaveValue('我');
    await expect(canvasElement.querySelectorAll(`[data-view="character:${FixtureIds.protagonist}"]`)).toHaveLength(1);
    await expect(state(canvasElement)).toHaveAttribute('data-applies', '0');
    await expect(state(canvasElement)).toHaveAttribute('data-plans', '0');
    await expect(state(canvasElement)).toHaveAttribute('data-saves', '0');
    state(canvasElement).dataset.result = 'passed';
  },
};
