import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { mountAuthoring } from '../authoring/view.js';
import { characterA, characterB, legacyDescriptionA, legacyNewCharacter, legacyNewDescription, legacyNewName } from './character-refinement-fixture.js';
import { characterRecoveryRefinementFixture, retainedScript, savedDescriptionB, type RecoveryScenario } from './character-recovery-refinement-fixture.js';

function CharacterRecovery({ theme = 'light', scenario = 'cold' }: { theme?: 'light' | 'dark'; scenario?: RecoveryScenario }) {
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
    void characterRecoveryRefinementFixture(theme, scenario, metrics => {
      if (!shell.current) return;
      for (const [key, value] of Object.entries(metrics)) shell.current.dataset[key] = Array.isArray(value) ? value.join(',') : String(value);
    }).then(async fixture => {
      if (!active) return;
      workspace = await mountAuthoring(app, fixture.services);
      if (!active) { workspace.dispose(); return; }
      if (shell.current) { shell.current.dataset.ready = 'true'; setInitialized(true); }
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; workspace?.dispose(); app.remove(); if (ownsPortals) portals?.remove(); };
  }, [theme, scenario, iteration]);
  return <div ref={shell} data-character-recovery={scenario} data-theme={theme} data-locale="zh-CN">
    {error && <p role="alert">{error}</p>}<div className="product-story" ref={host} />
    <button type="button" disabled={!initialized} style={{ position: 'fixed', insetBlockEnd: 4, insetInlineEnd: 20, zIndex: 20 }}
      title="仅用于 Story 夹具：重新建立初始内存作品与旧输入；不会写入磁盘。"
      onClick={() => { setError(''); setInitialized(false); setIteration(value => value + 1); }}>夹具：重新开始本组</button>
  </div>;
}

const meta = {
  id: 'review-studio-uxf03-character-recovery', title: 'Product/Studio/Workbench/Character Recovery', component: CharacterRecovery,
  args: { theme: 'light', scenario: 'cold' }, parameters: { layout: 'fullscreen', docs: { description: { component:
    '已接受的 UXF-03 后续恢复交互。场景装配真实 mountAuthoring、CharacterManager、人物目录和 Dock；编辑事务复用内存作品，authoringPreferences.readInputDraft 提供旧聚合记录。跨版本场景先在内存应用并保存友人，再以旧版本记录挂载全新 renderer。指标只统计挂载后的应用与保存。磁盘冷重开、原生进程与服务生命周期仍由实际宿主验证；本组作为已接受的 Product 流程回归保留。右下角夹具按钮仅重建初始状态。' } } },
} satisfies Meta<typeof CharacterRecovery>;
export default meta;
type Story = StoryObj<typeof meta>;

const state = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-character-recovery]')!;
const pane = (element: HTMLElement, id: string) => element.querySelector<HTMLElement>(`[data-view="character:${id}"]`);
const description = (element: HTMLElement, id: string) => within(pane(element, id)!).getByLabelText('角色简介与创作设定');
const ready = async (element: HTMLElement) => waitFor(() => expect(state(element)).toHaveAttribute('data-ready', 'true'), { timeout: 5000 });
const directoryButton = (element: HTMLElement) => within(element).getByLabelText('角色目录', { selector: 'button' });
const openDirectory = async (element: HTMLElement) => {
  const button = directoryButton(element);
  if (button.getAttribute('aria-pressed') !== 'true') await userEvent.click(button);
};
const replace = async (input: HTMLElement, value: string) => {
  await userEvent.click(input); await expect(input).toHaveFocus(); await userEvent.clear(input); await userEvent.type(input, value);
};
const untouched = async (element: HTMLElement) => {
  await expect(state(element)).toHaveAttribute('data-applies', '0');
  await expect(state(element)).toHaveAttribute('data-saves', '0');
  await expect(state(element)).toHaveAttribute('data-plans', '0');
};

export const ColdRestoreIndependentInput: Story = {
  parameters: { docs: { description: { story: '旧聚合记录只有林舟的未应用草稿，友人已在更新的内存版本中应用并保存。冷挂载应直接恢复林舟独立文档；作者可继续修改，不出现空的恢复输入页。切到友人核对已保存文字，再回林舟核对输入仍在。全程不应用或保存。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await waitFor(() => expect(pane(canvasElement, characterA)).toBeVisible(), { timeout: 5000 });
    await expect(canvas.queryByRole('tab', { name: /恢复的输入/ })).toBeNull();
    await expect(canvasElement.querySelector('.recovered-input')).toBeNull();
    await expect(description(canvasElement, characterA)).toHaveValue(legacyDescriptionA);
    await expect(Number(state(canvasElement).dataset.savedBRevision)).toBeGreaterThan(Number(state(canvasElement).dataset.priorBRevision));
    const entered = '冷恢复后继续编辑的林舟：那封信仍由他独自保管。';
    await replace(description(canvasElement, characterA), entered);
    await openDirectory(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /友人.*配角/ }));
    await waitFor(() => expect(description(canvasElement, characterB)).toHaveValue(savedDescriptionB), { timeout: 5000 });
    await userEvent.click(canvas.getByRole('tab', { name: /林舟/ }));
    await waitFor(() => expect(description(canvasElement, characterA)).toHaveValue(entered), { timeout: 5000 });
    await untouched(canvasElement);
    state(canvasElement).dataset.result = 'passed';
  },
};
export const ColdRestoreIndependentInputDusk: Story = { ...ColdRestoreIndependentInput, args: { theme: 'dark' } };

export const RetainedNewCharacter: Story = {
  args: { scenario: 'new' },
  parameters: { docs: { description: { story: '没有来源和 base 的旧新人物使用原 ID 继续恢复。作者修改输入后选择保留修改并关闭，目录仍呈现该人物；从目录重开应恢复同一 ID、名称和修改后的文字。全程不应用或保存，因此 C 仍未加入作品来源。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await waitFor(() => expect(pane(canvasElement, legacyNewCharacter)).toHaveTextContent(legacyNewDescription), { timeout: 5000 });
    await userEvent.click(within(pane(canvasElement, legacyNewCharacter)!).getByRole('button', { name: '继续恢复此人物草稿' }));
    await waitFor(() => expect(description(canvasElement, legacyNewCharacter)).toHaveValue(legacyNewDescription), { timeout: 5000 });
    const entered = '访客保留的输入：雨停后，他会带着那枚旧车票再回来。';
    await replace(description(canvasElement, legacyNewCharacter), entered);
    await userEvent.click(canvas.getByRole('button', { name: `关闭 ${legacyNewName}` }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole('alertdialog', { name: '关闭未保存的文档？' }, { timeout: 5000 }));
    await userEvent.click(dialog.getByRole('button', { name: '保留修改并关闭' }));
    await waitFor(() => expect(canvas.queryByRole('tab', { name: new RegExp(legacyNewName) })).toBeNull(), { timeout: 5000 });
    await openDirectory(canvasElement);
    const directoryEntry = canvas.getByRole('button', { name: new RegExp(`${legacyNewName}.*配角`) });
    await expect(directoryEntry).toBeVisible();
    await userEvent.click(directoryEntry);
    await waitFor(() => expect(description(canvasElement, legacyNewCharacter)).toHaveValue(entered), { timeout: 5000 });
    await expect(within(pane(canvasElement, legacyNewCharacter)!).getByLabelText('角色名称')).toHaveValue(legacyNewName);
    await expect(canvasElement.querySelectorAll(`[data-view="character:${legacyNewCharacter}"]`)).toHaveLength(1);
    await expect(state(canvasElement)).toHaveAttribute('data-source-has-new', 'false');
    await untouched(canvasElement);
    state(canvasElement).dataset.result = 'passed';
  },
};
export const RetainedNewCharacterDusk: Story = { ...RetainedNewCharacter, args: { scenario: 'new', theme: 'dark' } };

export const OtherInputRecovery: Story = {
  args: { scenario: 'other' },
  parameters: { docs: { description: { story: '友人保存后旧聚合版本失效：人物输入按自身 base 独立恢复，剧本原文继续保留在可见恢复页。保留并关闭恢复页后继续编辑林舟，非人物文本仍在恢复记录中。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await expect(await canvas.findByText(retainedScript, { exact: true }, { timeout: 5000 })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '保留并关闭' }));
    await userEvent.click(canvas.getByRole('tab', { name: /林舟/ }));
    await waitFor(() => expect(description(canvasElement, characterA)).toHaveValue(legacyDescriptionA), { timeout: 5000 });
    await replace(description(canvasElement, characterA), '非人物原文保留时，林舟仍可独立继续编辑。');
    await waitFor(() => expect(state(canvasElement)).toHaveAttribute('data-retained', 'true'), { timeout: 5000 });
    await untouched(canvasElement);
    state(canvasElement).dataset.result = 'passed';
  },
};

export const EmptyLegacyDirectory: Story = {
  args: { scenario: 'empty' },
  parameters: { docs: { description: { story: '旧 characters 入口没有 selected、drafts 或 base 时，冷恢复激活人物目录。作者从目录打开林舟进入同一稳定 ID 文档；不生成空的旧聚合页或恢复输入页。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await expect(directoryButton(canvasElement)).toHaveAttribute('aria-pressed', 'true');
    const directoryEntry = canvas.getByRole('button', { name: /^林舟/ });
    await expect(directoryEntry).toBeVisible();
    await expect(canvasElement.querySelector('[data-view="characters"]')).toBeNull();
    await expect(canvasElement.querySelector('.recovered-input')).toBeNull();
    await userEvent.click(directoryEntry);
    await waitFor(() => expect(description(canvasElement, characterA)).toBeVisible(), { timeout: 5000 });
    await untouched(canvasElement);
    state(canvasElement).dataset.result = 'passed';
  },
};
