import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import { mountAuthoring } from '../authoring/view.js';
import { characterA, characterB, characterRefinementFixture, legacyDescriptionA, legacyDescriptionB, legacyNewCharacter, legacyNewDescription, legacyNewName, sampleAppearance, sampleDescription } from './character-refinement-fixture.js';

type Scenario = 'references' | 'profile' | 'save' | 'legacy';
function CharacterWorkflow({ theme = 'light', scenario = 'references' }: { theme?: 'light' | 'dark'; scenario?: Scenario }) {
  const host = useRef<HTMLDivElement>(null), shell = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(''), [iteration, setIteration] = useState(0), [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    setInitialized(false); shell.current?.removeAttribute('data-ready');
    let active = true, workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
    const app = document.createElement('div'); app.id = 'app'; app.dataset.locale = 'zh-CN'; app.dataset.theme = theme;
    host.current.append(app);
    let portals = document.getElementById('studio-portals');
    const ownsPortals = !portals;
    if (!portals) { portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.locale = 'zh-CN'; portals.dataset.theme = theme;
    void characterRefinementFixture(theme, scenario === 'legacy', metrics => {
      if (!shell.current) return;
      shell.current.dataset.savePlans = String(metrics.plans);
      shell.current.dataset.saveCalls = String(metrics.saves);
      shell.current.dataset.plannedCharacters = metrics.planned.join(',');
      shell.current.dataset.savedCharacters = metrics.saved.join(',');
      shell.current.dataset.pendingCharacters = metrics.pending.join(',');
    }, scenario === 'references' || scenario === 'profile').then(async fixture => {
      if (!active) return;
      workspace = await mountAuthoring(app, fixture.services);
      if (!active) { workspace.dispose(); return; }
      if (scenario === 'profile') await workspace.openDocument({ kind: 'character', objectId: characterA });
      if (scenario === 'save') {
        await workspace.openDocument({ kind: 'character', objectId: characterA });
        await workspace.openDocument({ kind: 'character', objectId: characterB });
        await workspace.openDocument({ kind: 'character', objectId: characterA });
      }
      if (active && shell.current) { shell.current.dataset.ready = 'true'; setInitialized(true); }
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; workspace?.dispose(); app.remove(); if (ownsPortals) portals?.remove(); };
  }, [scenario, theme, iteration]);
  return <div ref={shell} data-character-refinement={scenario} data-theme={theme} data-locale="zh-CN">
    {error && <p role="alert">{error}</p>}<div className="product-story" ref={host} />
    <button type="button" disabled={!initialized} style={{ position: 'fixed', insetBlockEnd: 4, insetInlineEnd: 20, zIndex: 20 }}
      title="仅用于 Story 夹具：重新建立初始内存作品，方便手动操作本组流程。"
      onClick={() => { setError(''); setInitialized(false); setIteration(value => value + 1); }}>夹具：重新开始本组</button>
  </div>;
}

const meta = {
  id: 'review-studio-uxf03-characters', title: 'Product/Studio/Workbench/Characters', component: CharacterWorkflow,
  args: { theme: 'light', scenario: 'references' }, parameters: { layout: 'fullscreen', docs: { description: { component:
    '已接受的 UXF-03 人物与当前保存流程，沿用已确认的稳定 Story ID。同一份 mountAuthoring、人物编辑器、当前保存入口和保存审阅；服务复用 studioFixture 的内存作品与编辑事务，独立夹具承接按目标保存的内存回执、调用计数和 readInputDraft 恢复。资料与引用场景通过既有编辑事务准备创作样例及授权教学参考图，交互计数从零开始。这里的保存不会写磁盘；真实宿主、磁盘冷重开及服务生命周期分别验收。' } } },
} satisfies Meta<typeof CharacterWorkflow>;
export default meta;
type Story = StoryObj<typeof meta>;

const characterPane = (element: HTMLElement, id: string) => element.querySelector<HTMLElement>(`[data-view="character:${id}"]`);
const storyState = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-character-refinement]')!;
const description = (element: HTMLElement, id: string) => within(characterPane(element, id)!).getByLabelText('角色简介与创作设定');
const replace = async (input: HTMLElement, value: string) => {
  await userEvent.click(input); await expect(input).toHaveFocus(); await userEvent.clear(input); if (value) await userEvent.type(input, value);
};
const ready = async (element: HTMLElement) => waitFor(() => expect(storyState(element)).toHaveAttribute('data-ready', 'true'), { timeout: 30000 });

export const ReferenceReturn: Story = {
  args: { scenario: 'references' },
  parameters: { docs: { description: { story: '从已有对白与立绘指令分别编辑林舟，复用同一 character:<id> 文档，再返回原场景语句。资料通过真实鼠标聚焦编辑并仅应用到内存工作区。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '写作' }));
    for (const [index, statementId] of [FixtureIds.statements[0]!, fixtureId(0xf13)].entries()) {
      const row = () => canvasElement.querySelector<HTMLElement>(`[data-scene-view="writing"] [data-statement-id="${statementId}"]`)!;
      await waitFor(() => expect(row()).toBeVisible());
      const edit = within(row()).getByRole('button', { name: '编辑林舟' });
      if (index === 0) await userEvent.click(edit);
      else { edit.focus(); await expect(edit).toHaveFocus(); await userEvent.keyboard('{Enter}'); }
      await waitFor(() => expect(characterPane(canvasElement, characterA)).toBeVisible());
      await expect(canvasElement.querySelectorAll(`[data-view="character:${characterA}"]`)).toHaveLength(1);
      if (index === 0) {
        await replace(description(canvasElement, characterA), '林舟随身带着一封尚未寄出的信。');
        await userEvent.click(within(characterPane(canvasElement, characterA)!).getByRole('button', { name: '仅应用到工作区' }));
        await waitFor(() => expect(characterPane(canvasElement, characterA)).toHaveTextContent('已应用'));
      }
      await userEvent.click(canvas.getByRole('button', { name: '返回原句' }));
      await waitFor(() => expect(row()).toBeVisible());
      await expect(row()).toHaveClass('selected');
      if (index === 1) await expect(within(row()).getByRole('button', { name: '编辑林舟' })).toHaveFocus();
    }
    storyState(canvasElement).dataset.referenceReturn = 'passed';
  },
};
export const ReferenceReturnDusk: Story = { ...ReferenceReturn, args: { scenario: 'references', theme: 'dark' } };

export const ProfileOrganization: Story = {
  args: { scenario: 'profile' },
  parameters: { docs: { description: { story: '资料文档优先呈现简介、外观和参考图；默认演出保持收纳，展开后仍由原字段和事务管理。共同差分、头像与声音、路线与结局继续可达。' } } },
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await waitFor(() => expect(characterPane(canvasElement, characterA)).toBeVisible());
    const pane = characterPane(canvasElement, characterA)!;
    await expect(description(canvasElement, characterA)).toHaveValue(sampleDescription);
    await expect(within(pane).getByLabelText('外观说明')).toHaveValue(sampleAppearance);
    await expect(within(pane).getByText('人设参考图', { exact: true })).toBeVisible();
    await expect(within(pane).getByText('林舟 · 平静', { exact: true, selector: '.character-asset-row > span' })).toBeVisible();
    await expect(storyState(canvasElement)).toHaveAttribute('data-save-calls', '0');
    const defaults = within(pane).getByText('默认演出', { exact: true });
    await userEvent.click(defaults);
    await expect(within(pane).getByText('出场继承这些效果；本次指令填写的值覆盖对应字段。')).toBeVisible();
    await userEvent.click(defaults);
    await expect(within(pane).getByText('出场继承这些效果；本次指令填写的值覆盖对应字段。')).not.toBeVisible();
    for (const name of ['共同差分', '头像与声音', '路线与结局', '资料']) {
      await userEvent.click(within(pane).getByRole('button', { name }));
    }
    storyState(canvasElement).dataset.profileOrganization = 'passed';
  },
};
export const ProfileOrganizationDusk: Story = { ...ProfileOrganization, args: { scenario: 'profile', theme: 'dark' } };

export const CurrentSaveScope: Story = {
  args: { scenario: 'save' },
  parameters: { docs: { description: { story: '林舟留下未应用输入，友人通过 Ctrl+S 校验并应用当前输入后进入原保存审阅。取消保留工作修改；次级仅应用不会保存。友人自身无效输入停止保存；修正后只保存友人，林舟草稿继续保留。保存服务计数只用于观察夹具边界。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await waitFor(() => expect(characterPane(canvasElement, characterA)).toBeVisible());
    const body = within(canvasElement.ownerDocument.body), state = storyState(canvasElement);
    const select = async (name: string, id: string) => {
      await userEvent.click(canvas.getByRole('tab', { name: new RegExp(name) }));
      await waitFor(() => expect(description(canvasElement, id)).toBeVisible());
    };
    await replace(description(canvasElement, characterA), 'A 的未应用草稿：留在林舟，不参与友人的保存。');
    await select('友人', characterB);
    await replace(description(canvasElement, characterB), 'B 的当前输入：先应用，再由作者审阅保存范围。');
    await userEvent.keyboard('{Control>}s{/Control}');
    let dialog = within(await body.findByRole('dialog', { name: '保存审阅' }));
    await expect(dialog.getByRole('checkbox', { name: '保存 友人' })).toBeChecked();
    await expect(dialog.queryByRole('checkbox', { name: '保存 林舟' })).toBeNull();
    await expect(state).toHaveAttribute('data-save-calls', '0');
    await userEvent.click(dialog.getByRole('button', { name: '取消' }));
    await expect(description(canvasElement, characterB)).toHaveValue('B 的当前输入：先应用，再由作者审阅保存范围。');
    await expect(characterPane(canvasElement, characterB)).toHaveTextContent('已应用');
    await replace(description(canvasElement, characterB), 'B 的次级操作：只应用到工作区。');
    await userEvent.click(within(characterPane(canvasElement, characterB)!).getByRole('button', { name: '仅应用到工作区' }));
    await waitFor(() => expect(characterPane(canvasElement, characterB)).toHaveTextContent('已应用'));
    await expect(state).toHaveAttribute('data-save-calls', '0');
    const plans = state.dataset.savePlans;
    await replace(within(characterPane(canvasElement, characterB)!).getByLabelText('角色名称'), '');
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(within(characterPane(canvasElement, characterB)!).getByRole('alert')).toBeVisible());
    await expect(body.queryByRole('dialog', { name: '保存审阅' })).toBeNull();
    await expect(state).toHaveAttribute('data-save-plans', plans);
    await expect(within(characterPane(canvasElement, characterB)!).getByLabelText('角色名称')).toHaveValue('');
    await replace(within(characterPane(canvasElement, characterB)!).getByLabelText('角色名称'), '友人');
    await userEvent.keyboard('{Control>}s{/Control}');
    dialog = within(await body.findByRole('dialog', { name: '保存审阅' }));
    await userEvent.click(dialog.getByRole('button', { name: '保存 1 个对象' }));
    await waitFor(() => expect(state).toHaveAttribute('data-save-calls', '1'));
    await waitFor(() => expect(body.queryByRole('dialog', { name: '保存审阅' })).toBeNull());
    await expect(state).toHaveAttribute('data-saved-characters', characterB);
    await select('林舟', characterA);
    await expect(description(canvasElement, characterA)).toHaveValue('A 的未应用草稿：留在林舟，不参与友人的保存。');
    await expect(characterPane(canvasElement, characterA)).toHaveTextContent('待应用');
    await select('友人', characterB);
    state.dataset.currentSaveScope = 'passed';
  },
};
export const CurrentSaveScopeDusk: Story = { ...CurrentSaveScope, args: { scenario: 'save', theme: 'dark' } };

export const LegacyDraftRecovery: Story = {
  args: { scenario: 'legacy' },
  parameters: { docs: { description: { story: 'authoringPreferences.readInputDraft 提供旧 characters 文档的 A/B 未应用草稿及一位没有来源、没有 bases 的旧新增人物。真实恢复逻辑承接独立 character:<id> 文档；作者明确继续恢复新人物，在同一编辑器中按原 ID 应用创建，B 草稿继续保留。夹具不会通过私有字段注入输入，也不会保存到磁盘。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    await waitFor(() => expect(characterPane(canvasElement, characterA)).toBeVisible());
    await expect(description(canvasElement, characterA)).toHaveValue(legacyDescriptionA);
    await expect(canvasElement.querySelector('[data-view="characters"]')).toBeNull();
    await userEvent.click(within(characterPane(canvasElement, characterA)!).getByRole('button', { name: '仅应用到工作区' }));
    await waitFor(() => expect(characterPane(canvasElement, characterA)).toHaveTextContent('已应用'));
    await userEvent.click(canvas.getByRole('tab', { name: /友人/ }));
    await waitFor(() => expect(description(canvasElement, characterB)).toHaveValue(legacyDescriptionB));
    await expect(characterPane(canvasElement, characterB)).toHaveTextContent('待应用');
    await waitFor(() => expect(storyState(canvasElement).dataset.pendingCharacters?.split(',').sort()).toEqual([characterB, legacyNewCharacter].sort()));
    await userEvent.click(canvas.getByRole('tab', { name: new RegExp(legacyNewName) }));
    await waitFor(() => expect(characterPane(canvasElement, legacyNewCharacter)).toHaveTextContent(legacyNewDescription));
    await userEvent.click(within(characterPane(canvasElement, legacyNewCharacter)!).getByRole('button', { name: '继续恢复此人物草稿' }));
    await waitFor(() => expect(within(characterPane(canvasElement, legacyNewCharacter)!).getByLabelText('角色名称')).toHaveValue(legacyNewName));
    await expect(description(canvasElement, legacyNewCharacter)).toHaveValue(legacyNewDescription);
    await userEvent.click(within(characterPane(canvasElement, legacyNewCharacter)!).getByRole('button', { name: '仅应用到工作区' }));
    await waitFor(() => expect(characterPane(canvasElement, legacyNewCharacter)).toHaveTextContent('已应用'));
    await expect(within(characterPane(canvasElement, legacyNewCharacter)!).getByLabelText('角色名称')).toHaveValue(legacyNewName);
    await expect(description(canvasElement, legacyNewCharacter)).toHaveValue(legacyNewDescription);
    await expect(within(characterPane(canvasElement, legacyNewCharacter)!).queryByRole('button', { name: '继续恢复此人物草稿' })).toBeNull();
    await waitFor(() => expect(storyState(canvasElement)).toHaveAttribute('data-pending-characters', characterB));
    await expect(storyState(canvasElement)).toHaveAttribute('data-save-calls', '0');
    storyState(canvasElement).dataset.legacyDraftRecovery = 'passed';
  },
};
export const LegacyDraftRecoveryDusk: Story = { ...LegacyDraftRecovery, args: { scenario: 'legacy', theme: 'dark' } };
