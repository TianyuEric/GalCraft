import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { mountAuthoring } from '../authoring/view.js';
import { musicId } from './product-fixture.js';
import { settingsRefinementFixture } from './settings-refinement-fixture.js';

function SettingsRefinement({ theme = 'light', scenario = 'project' }: {
  theme?: 'light' | 'dark'; scenario?: 'project' | 'startup' | 'home';
}) {
  const shell = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(''), [iteration, setIteration] = useState(0);
  useEffect(() => {
    const current = shell.current, mount = host.current;
    if (!current || !mount) return;
    delete current.dataset.ready;
    delete current.dataset.result;
    let active = true, workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
    const app = document.createElement('div');
    app.id = 'app'; app.dataset.locale = 'zh-CN'; app.dataset.theme = theme;
    mount.append(app);
    let portals = document.getElementById('studio-portals');
    const ownsPortals = !portals;
    if (!portals) { portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.locale = 'zh-CN'; portals.dataset.theme = theme;
    void settingsRefinementFixture(theme, metrics => {
      if (active) Object.assign(current.dataset, metrics);
    }).then(async ({ services }) => {
      if (!active) return;
      workspace = await mountAuthoring(app, services);
      if (!active) { workspace.dispose(); return; }
      await workspace.openDocument({ kind: scenario === 'project' ? 'project' : 'startup' });
      if (active && scenario === 'home') within(app).getByRole('button', { name: /^主页$/ }).click();
      if (active) current.dataset.ready = 'true';
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; workspace?.dispose(); app.remove(); if (ownsPortals) portals?.remove(); };
  }, [theme, scenario, iteration]);
  return <div ref={shell} data-settings-refinement={scenario} data-theme={theme} data-locale="zh-CN">
    {error && <p role="alert">{error}</p>}<div className="product-story" ref={host}/>
    <button type="button" style={{ position: 'fixed', insetBlockEnd: 4, insetInlineEnd: 20, zIndex: 20 }}
      title="重新建立内存作品与计数" onClick={() => { setError(''); setIteration(value => value + 1); }}>夹具：重新开始本组</button>
  </div>;
}

const meta = {
  id: 'review-studio-uxf06-settings', title: 'Product/Studio/Workbench/Project Settings and Startup', component: SettingsRefinement,
  args: { theme: 'light', scenario: 'project' },
  parameters: { layout: 'fullscreen', docs: { description: { component:
    '作品设置、开屏和主页。场景装配真实 Studio、资料表单、素材选择、Player 和现有保存审阅。原编辑事务提交到内存作品，保存夹具检查所选文档及实际序列化的修改。磁盘、原生媒体和独立宿主另行核对。' } } },
} satisfies Meta<typeof SettingsRefinement>;
export default meta;
type Story = StoryObj<typeof meta>;
type Canvas = ReturnType<typeof within>;

const state = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-settings-refinement]')!;
const mountedPlayer = (element: HTMLElement) => element.querySelector('.startup-preview.galcraft-player .gc-canvas');
const ready = async (element: HTMLElement) => waitFor(() => expect(state(element)).toHaveAttribute('data-ready', 'true'), { timeout: 10000 });
const replace = async (input: HTMLElement, value: string) => {
  await userEvent.click(input); await userEvent.clear(input); await userEvent.type(input, value);
};
const review = async (element: HTMLElement, confirm: boolean) => {
  const metrics = state(element).dataset;
  const body = within(element.ownerDocument.body);
  await userEvent.keyboard('{Control>}s{/Control}');
  const dialog = within(await body.findByRole('dialog', { name: '保存审阅' }, { timeout: 10000 }));
  await expect(dialog.getAllByRole('checkbox')).toHaveLength(1);
  await expect(dialog.getByRole('checkbox')).toBeChecked();
  await expect(metrics.members).toBe(metrics.projectDocument);
  await expect(metrics.saves).toBe('0');
  await userEvent.click(dialog.getByRole('button', { name: confirm ? '保存 1 个对象' : '取消' }));
  await waitFor(() => expect(body.queryByRole('dialog', { name: '保存审阅' })).toBeNull(), { timeout: 10000 });
  await expect(metrics.saves).toBe(confirm ? '1' : '0');
  await expect(metrics.projectDirty).toBe(confirm ? 'false' : 'true');
};
const revealInspector = async (canvas: Canvas, label: string) => {
  const summary = canvas.queryByText('当前文档工具', { selector: 'summary' });
  if (summary && !(summary.parentElement as HTMLDetailsElement).open) await userEvent.click(summary);
  await expect(await canvas.findByRole('region', { name: label })).toBeVisible();
};

export const ProjectSettings: Story = {
  parameters: { docs: { description: { story: '从同一作品设置修改姓名与正文语言，取消保存审阅并继续编辑，然后保存单一作品文件。切换到原作品资料入口展开舞台画布。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    const metrics = state(canvasElement).dataset;
    await expect(canvas.getByRole('heading', { name: '作品设置' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: '结构与变量' })).toBeVisible();
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: '姓名方式' }), 'fixed');
    const name = canvas.getByRole('textbox', { name: '默认姓名' }), language = canvas.getByRole('textbox', { name: /正文源语言/ });
    await replace(name, '春树'); await replace(language, 'ja');
    await review(canvasElement, false);
    await expect(name).toHaveValue('春树'); await expect(language).toHaveValue('ja');
    await expect(metrics.savedName).not.toBe('春树'); await expect(metrics.savedLanguage).not.toBe('ja');
    await replace(language, 'en'); await review(canvasElement, true);
    await expect(metrics.savedName).toBe('春树'); await expect(metrics.savedLanguage).toBe('en');
    await userEvent.click(canvas.getByRole('button', { name: '作品资料与玩家选项' }));
    await expect(await canvas.findByRole('heading', { name: '玩家选项' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '舞台画布' }));
    await expect(canvas.getByRole('spinbutton', { name: '宽度（像素）' })).toBeVisible();
    state(canvasElement).dataset.result = 'passed';
  },
};
export const ProjectSettingsDusk: Story = { ...ProjectSettings, args: { theme: 'dark' } };

export const StartupSequence: Story = {
  args: { scenario: 'startup' },
  parameters: { docs: { description: { story: '浏览基本开屏及其高级字段，编排文字片段。开屏与主页切换保留片段草稿，保存当前时定位无效输入。取消保存后继续编辑，再保存并核对作品文件。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    const metrics = state(canvasElement).dataset;
    await expect(mountedPlayer(canvasElement)).toBeNull();
    await revealInspector(canvas, '开屏图片或视频');
    await userEvent.click(canvas.getByText('播放与显示细节', { selector: 'summary' }));
    const fade = canvas.getByRole<HTMLInputElement>('spinbutton', { name: '淡入 · ms' });
    await expect(fade).toBeVisible();
    const originalFade = fade.value;
    await userEvent.click(fade); await userEvent.clear(fade);
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(fade).toHaveFocus());
    await expect(fade).toHaveValue(null); await expect(metrics.plans).toBe('0');
    await replace(fade, originalFade);
    await userEvent.click(canvas.getByRole('button', { name: '编排原生开屏序列' }));
    const hold = await canvas.findByRole('spinbutton', { name: '片段停留 · ms' }, { timeout: 10000 });
    const home = canvas.getByRole('button', { name: /^主页$/ }), splash = canvas.getByRole('button', { name: /^开屏$/ });
    await userEvent.clear(hold);
    await userEvent.click(home);
    await expect(home).toHaveAttribute('aria-pressed', 'true');
    await expect(hold).not.toBeVisible();
    await userEvent.click(splash);
    await expect(hold).toBeVisible();
    await expect(hold).toHaveValue(null);
    await userEvent.click(home);
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(hold).toHaveFocus());
    await expect(splash).toHaveAttribute('aria-pressed', 'true');
    await expect(hold).toHaveValue(null);
    await expect(metrics.plans).toBe('0');
    await replace(hold, '3200'); await replace(canvas.getByRole('spinbutton', { name: '揭示主页 · ms' }), '600');
    await review(canvasElement, false);
    await expect(hold).toHaveValue(3200); await expect(metrics.savedClipHold).toBe('');
    await replace(hold, '3400'); await review(canvasElement, true);
    await expect(metrics.savedClipHold).toBe('3400'); await expect(metrics.savedReveal).toBe('600');
    await expect(mountedPlayer(canvasElement)).toBeNull();
    state(canvasElement).dataset.result = 'passed';
  },
};
export const StartupSequenceDusk: Story = { ...StartupSequence, args: { scenario: 'startup', theme: 'dark' } };

export const HomeMedia: Story = {
  args: { scenario: 'home' },
  parameters: { docs: { description: { story: '打开主页音乐选择器，明确应用素材并确认编辑时未启动 Player。通过预览主页、停止试听运行原预览路由；取消和再次确认保存后核对作品文件里的原素材 ID。' } } },
  play: async ({ canvas, canvasElement }) => {
    await ready(canvasElement);
    const metrics = state(canvasElement).dataset;
    await revealInspector(canvas, '主页音乐');
    const music = within(canvas.getByRole('region', { name: '主页音乐' }));
    await userEvent.click(music.getByRole('button', { name: '选择素材' }));
    const body = within(canvasElement.ownerDocument.body);
    const picker = within(await body.findByRole('dialog', { name: /选择素材/ }, { timeout: 10000 }));
    await userEvent.click(await picker.findByText('春日 · 站台', { exact: true }));
    await userEvent.click(picker.getByRole('button', { name: /^应用$/ }));
    await revealInspector(canvas, '主页音乐');
    await expect(await music.findByText('春日 · 站台', { exact: true })).toBeVisible();
    await expect(mountedPlayer(canvasElement)).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '预览主页' }));
    const stop = canvas.getByRole('button', { name: '停止试听' });
    await waitFor(() => expect(stop).toBeEnabled(), { timeout: 10000 });
    await expect(mountedPlayer(canvasElement)).toBeVisible();
    await userEvent.click(stop); await expect(stop).toBeDisabled(); await expect(mountedPlayer(canvasElement)).toBeNull();
    await review(canvasElement, false);
    await revealInspector(canvas, '主页音乐');
    await expect(music.getByText('春日 · 站台', { exact: true })).toBeVisible();
    await expect(metrics.savedHomeMusic).not.toBe(musicId);
    await review(canvasElement, true);
    await expect(metrics.savedHomeMusic).toBe(musicId);
    state(canvasElement).dataset.result = 'passed';
  },
};
export const HomeMediaDusk: Story = { ...HomeMedia, args: { scenario: 'home', theme: 'dark' } };
