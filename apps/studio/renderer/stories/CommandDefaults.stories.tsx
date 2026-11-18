import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { mountAuthoring } from '../authoring/view.js';
import { Button } from '../components/controls.js';
import { figureId, musicId } from './product-fixture.js';
import { commandDefaultsFixture, reviewAnchor, reviewExitAnchor, reviewIllustration, type CommandDefaultsScenario, type ReviewedCommand } from './command-defaults-fixture.js';

type Fixture = Awaited<ReturnType<typeof commandDefaultsFixture>>;
type Comparison = Awaited<ReturnType<Fixture['compare']>>;

function CommandDefaults({ scenario = 'visual', theme = 'light' }: { scenario?: CommandDefaultsScenario; theme?: 'light' | 'dark' }) {
  const host = useRef<HTMLDivElement>(null);
  const fixture = useRef<Fixture>(null);
  const [commands, setCommands] = useState<ReviewedCommand[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [iteration, setIteration] = useState(0);
  useEffect(() => {
    if (!host.current) return;
    host.current.closest('[data-command-defaults]')?.removeAttribute('data-result');
    let active = true;
    let mounted: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
    setReady(false);
    setError('');
    setComparison(null);
    setCommands([]);
    const app = document.createElement('div');
    app.id = 'app';
    app.dataset.theme = theme;
    app.dataset.locale = 'zh-CN';
    host.current.append(app);
    let portals = document.getElementById('studio-portals');
    const ownsPortals = !portals;
    if (!portals) {
      portals = document.createElement('div');
      portals.id = 'studio-portals';
      document.body.append(portals);
    }
    portals.dataset.theme = theme;
    portals.dataset.locale = 'zh-CN';
    void commandDefaultsFixture(scenario, theme, next => {
      if (active) { setCommands(next); setComparison(null); }
    }).then(async instance => {
      if (!active) return;
      mounted = await mountAuthoring(app, instance.services);
      if (!active) { mounted.dispose(); return; }
      fixture.current = instance;
      setReady(true);
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => {
      active = false;
      fixture.current = null;
      mounted?.dispose();
      app.remove();
      if (ownsPortals) portals.remove();
    };
  }, [scenario, theme, iteration]);

  return <section data-command-defaults={scenario} data-theme={theme} data-locale="zh-CN" data-ready={ready} data-commands={JSON.stringify(commands)}>
    {error && <p className="product-story-error" role="alert">{error}</p>}
    <div className="product-story" ref={host} />
    <details data-command-defaults-fixture style={{
      position: 'fixed', insetInlineEnd: 12, insetBlockEnd: 32, zIndex: 12, maxWidth: 'min(340px, calc(100vw - 24px))',
      maxHeight: '50vh', overflow: 'auto', background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '6px 10px',
    }}>
      <summary>夹具 · 作者接口</summary>
      <p>内存作品。比较使用本组的角色、素材和参数，读取作者接口生成的源码。</p>
      <div className="gc-actions">
        <Button disabled={!ready || !commands.length} onClick={() => {
          void fixture.current?.compare().then(setComparison).catch(reason => setError(String(reason)));
        }}>比较本组指令</Button>
        <Button tone="quiet" disabled={!ready} onClick={() => setIteration(value => value + 1)}>重新开始本组</Button>
      </div>
      {comparison && <div data-author-comparison data-missing-rejected={comparison.missingRejected} data-legacy-kept={comparison.legacyKept}>
        <p role="status">{comparison.results.filter(result => result.matches).length} / {comparison.results.length} 条指令参数一致。{comparison.missingRejected ? '空素材请求已被拒绝。' : '空素材请求通过。'}</p>
        <p>{comparison.legacyKept ? '旧场景沿用原编译结果，源码保留省略字段。' : '旧场景的源码或编译参数有变化。'}</p>
        <ul>{comparison.results.map(result => <li key={result.id} data-author-match={result.matches}>
          <code>{result.command}</code> · {result.matches ? '一致' : result.message ?? '参数有差异'}
        </li>)}</ul>
      </div>}
    </details>
  </section>;
}

const meta = {
  id: 'review-studio-uxf05-command-defaults',
  title: 'Product/Studio/Workbench/Command Defaults',
  component: CommandDefaults,
  args: { scenario: 'visual', theme: 'light' },
  parameters: { layout: 'fullscreen', docs: { description: { component:
    '真实 Studio 场景、指令选择器、属性、素材选择器、历史入口及舞台 Player 预览。重新开始本组后，从「工作面」打开「文稿与舞台」，再切换到「演出」。窄窗应用指令后，可用属性面板标题栏的「收回临时工具」继续操作场景。内存夹具准备作品、记录源码、重开本组，并使用同一 commands.insert 规划参数比较。磁盘、独立 Player 和人工听感由所属环境核对。可用 1440×900 和 900×768 比较两个主题。'
  } } },
} satisfies Meta<typeof CommandDefaults>;
export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = Parameters<NonNullable<Story['play']>>[0]['canvas'];
const timeout = { timeout: 15000 };
const panel = (element: HTMLElement) => element.querySelector<HTMLElement>('.authoring-command-draft')!;
const stage = (element: HTMLElement) => element.querySelector<HTMLElement>('.studio-mini-stage')!;
const field = (element: HTMLElement, key: string) => element.querySelector<HTMLElement>(`[data-field="${key}"]`)!;
const review = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-command-defaults]')!;
const written = (element: HTMLElement) => JSON.parse(review(element).dataset.commands ?? '[]') as ReviewedCommand[];

async function returnToScene(element: HTMLElement) {
  const inspector = element.querySelector<HTMLElement>('.gc-dock-content.is-temporary[data-view="studio-inspector"]');
  if (!inspector) return;
  const header = element.querySelector<HTMLElement>('.gc-dock-header[data-zone="right"]')!;
  await userEvent.click(within(header).getByRole('button', { name: '收回临时工具' }));
  await waitFor(() => expect(inspector).not.toHaveClass('is-temporary'), timeout);
}

async function setup(canvas: Canvas, element: HTMLElement) {
  await waitFor(() => expect(review(element)).toHaveAttribute('data-ready', 'true'), timeout);
  const body = within(element.ownerDocument.body);
  await userEvent.click(await canvas.findByRole('button', { name: '工作面' }, timeout));
  await userEvent.click(await body.findByRole('menuitem', { name: '文稿与舞台' }, timeout));
  await waitFor(() => expect(stage(element)).toBeVisible(), timeout);
  await userEvent.click(await canvas.findByRole('button', { name: '演出' }, timeout));
  await waitFor(() => expect(element.querySelector('[data-scene-view="cards"]')).toBeVisible(), timeout);
  await returnToScene(element);
}

async function selectStatement(element: HTMLElement, id: string) {
  const at = () => element.querySelector<HTMLElement>(`[data-scene-view="cards"] [data-statement-id="${id}"]`);
  await waitFor(() => expect(at()).toBeVisible(), timeout);
  await userEvent.click(at()!);
}

async function begin(element: HTMLElement, command: string, before = reviewAnchor) {
  await selectStatement(element, before);
  const actions = element.querySelector<HTMLElement>('[data-scene-view="cards"] .authoring-selection-tools')!;
  await userEvent.click(within(actions).getByRole('button', { name: '添加指令' }));
  const body = within(element.ownerDocument.body);
  const choices = await body.findByRole('dialog', { name: '添加指令' }, timeout);
  const picker = within(choices);
  await userEvent.type(picker.getByRole('combobox'), command);
  const option = () => choices.querySelector<HTMLElement>(`[data-key="${command}"]${command === 'changeFigure' ? '[data-asset-kind="image"]' : ''}`);
  await waitFor(() => expect(option()).toBeVisible(), timeout);
  await userEvent.click(option()!);
  await waitFor(() => expect(panel(element)).toBeVisible(), timeout);
}

async function chooseAsset(element: HTMLElement, id: string) {
  await userEvent.click(within(field(panel(element), 'assetId')).getByRole('button'));
  const body = within(element.ownerDocument.body);
  const picker = await body.findByRole('dialog', { name: /^选择素材/ }, timeout);
  const option = () => picker.querySelector<HTMLElement>(`[data-asset-option="${id}"]`);
  await waitFor(() => expect(option()).toBeVisible(), timeout);
  await userEvent.click(option()!);
  await userEvent.click(within(picker).getByRole('button', { name: '应用' }));
  await waitFor(() => expect(picker).not.toBeInTheDocument(), timeout);
}

async function chooseObject(element: HTMLElement, name: string) {
  await userEvent.click(within(field(panel(element), 'objectId')).getByRole('button'));
  const body = within(element.ownerDocument.body);
  const picker = await body.findByRole('dialog', { name: '动画执行目标' }, timeout);
  const target = await within(picker).findByText(name, { selector: '.animation-target-title > strong', exact: true }, timeout);
  await userEvent.click(target.closest<HTMLElement>('[role="option"]')!);
  await waitFor(() => expect(picker).not.toBeInTheDocument(), timeout);
}

async function apply(element: HTMLElement) {
  const prior = new Set(written(element).map(item => item.id));
  await userEvent.click(within(panel(element)).getByRole('button', { name: '应用' }));
  await waitFor(() => expect(panel(element)).not.toBeInTheDocument(), timeout);
  await waitFor(() => expect(written(element).some(item => !prior.has(item.id))).toBe(true), timeout);
  await returnToScene(element);
  return written(element).find(item => !prior.has(item.id))!;
}

async function inspect(element: HTMLElement, statementId: string) {
  await waitFor(() => {
    expect(stage(element)).toHaveAttribute('data-statement-id', statementId);
    expect(stage(element)).toHaveAttribute('data-stale', 'false');
    expect(stage(element)).toHaveAttribute('data-preview-mode', 'inspection');
    expect(stage(element).querySelector('.gc-stage canvas')).toBeVisible();
  }, timeout);
}

async function playCurrent(element: HTMLElement, statementId: string) {
  await userEvent.click(within(stage(element)).getByRole('button', { name: '播放当前演出' }));
  await waitFor(() => {
    expect(stage(element)).toHaveAttribute('data-statement-id', statementId);
    expect(stage(element)).toHaveAttribute('data-stale', 'false');
    expect(stage(element)).toHaveAttribute('data-preview-mode', 'current');
    expect(stage(element).querySelector('.gc-stage canvas')).toBeVisible();
  }, timeout);
}

async function compare(canvas: Canvas, element: HTMLElement, count: number) {
  const disclosure = element.querySelector<HTMLElement>('[data-command-defaults-fixture] > summary')!;
  await userEvent.click(disclosure);
  await userEvent.click(canvas.getByRole('button', { name: '比较本组指令' }));
  await waitFor(() => {
    expect(element.querySelector('[data-author-comparison]')).toHaveAttribute('data-missing-rejected', 'true');
    expect(element.querySelector('[data-author-comparison]')).toHaveAttribute('data-legacy-kept', 'true');
    expect(element.querySelectorAll('[data-author-match="true"]')).toHaveLength(count);
    expect(element.querySelectorAll('[data-author-match="false"]')).toHaveLength(0);
  }, timeout);
  await userEvent.click(disclosure);
}

export const VisualDefaults: Story = {
  parameters: { docs: { description: { story:
    '先尝试插入缺少素材的背景。选择「雨站 · 背景」后应用，查看居中铺满和 400ms 淡化。再添加「图片立绘」，选择林舟和「林舟 · 平静」，观察角色默认位置与缩放。添加「插图差分」并选择「插图」作为舞台目标，最后在第二句前选择林舟执行退场。选中对应指令，通过舞台播放入口观察转场。撤销后退场指令消失，恢复后回到原 ID。'
  } } },
  play: async ({ canvas, canvasElement }) => {
    await setup(canvas, canvasElement);
    await begin(canvasElement, 'changeBg');
    await userEvent.click(within(panel(canvasElement)).getByRole('button', { name: '应用' }));
    await waitFor(() => expect(field(panel(canvasElement), 'assetId').querySelector('.field-error')).toBeVisible(), timeout);
    await expect(written(canvasElement)).toHaveLength(0);
    await chooseAsset(canvasElement, FixtureIds.background);
    const background = await apply(canvasElement);
    await expect(background.args).toMatchObject({
      fit: 'cover', positionX: .5, positionY: .5,
      transition: { enter: { preset: 'fade', durationMs: 400 }, exit: { preset: 'fade', durationMs: 400 } },
    });
    await inspect(canvasElement, background.id);
    await playCurrent(canvasElement, background.id);

    await begin(canvasElement, 'changeFigure');
    await userEvent.selectOptions(within(field(panel(canvasElement), 'characterId')).getByRole('combobox'), FixtureIds.an);
    await chooseAsset(canvasElement, figureId);
    const figure = await apply(canvasElement);
    await expect(figure.args).toMatchObject({ transition: { enter: { durationMs: 300 }, exit: { durationMs: 250 } } });
    for (const key of ['framing', 'effects', 'model', 'z']) await expect(figure.args).not.toHaveProperty(key);
    await inspect(canvasElement, figure.id);

    await begin(canvasElement, 'changeIllustrationDiff');
    await chooseObject(canvasElement, '插图');
    await chooseAsset(canvasElement, figureId);
    const difference = await apply(canvasElement);
    await expect(difference.args).toMatchObject({ objectId: reviewIllustration, transition: { preset: 'fade', durationMs: 180 } });
    await inspect(canvasElement, difference.id);

    await begin(canvasElement, 'changeFigure', reviewExitAnchor);
    await userEvent.selectOptions(within(field(panel(canvasElement), 'op')).getByRole('combobox'), 'exit');
    await chooseObject(canvasElement, '林舟');
    const exit = await apply(canvasElement);
    await expect(exit.args).toMatchObject({ op: 'exit', objectId: figure.args.objectId, transition: { exit: { durationMs: 250 } } });
    await inspect(canvasElement, exit.id);
    await playCurrent(canvasElement, exit.id);

    await userEvent.click(canvas.getByRole('button', { name: /^撤销 ·/ }));
    await waitFor(() => expect(written(canvasElement).map(item => item.id)).not.toContain(exit.id), timeout);
    await userEvent.click(canvas.getByRole('button', { name: /^恢复 ·/ }));
    await waitFor(() => expect(written(canvasElement)).toContainEqual(exit), timeout);
    await compare(canvas, canvasElement, 4);
    await selectStatement(canvasElement, difference.id);
    await inspect(canvasElement, difference.id);
    review(canvasElement).dataset.result = 'passed';
  },
};

export const VisualDefaultsDusk: Story = { ...VisualDefaults, args: { theme: 'dark' } };

export const AudioAndWait: Story = {
  args: { scenario: 'audio' },
  parameters: { docs: { description: { story:
    '用「春日 · 站台」分别插入背景音乐、音效，查看音量 100%、音乐循环、音效单次播放。插入等待并保留 1000ms。再新建背景音乐，把音量改为 0、取消循环，另插一条 0ms 等待，输入后清空注释正文。每条指令都可在源码中检查参数；舞台预览初始静音，可使用舞台声音控制开启。'
  } } },
  play: async ({ canvas, canvasElement }) => {
    await setup(canvas, canvasElement);
    await begin(canvasElement, 'bgm');
    await chooseAsset(canvasElement, musicId);
    const music = await apply(canvasElement);
    await expect(music.args).toMatchObject({ volume: 100, loop: true });
    await inspect(canvasElement, music.id);

    await begin(canvasElement, 'playEffect');
    await chooseAsset(canvasElement, musicId);
    const sound = await apply(canvasElement);
    await expect(sound.args).toMatchObject({ volume: 100, loop: false });
    await inspect(canvasElement, sound.id);

    await begin(canvasElement, 'wait');
    await expect(within(field(panel(canvasElement), 'durationMs')).getByRole('spinbutton')).toHaveValue(1000);
    const timer = await apply(canvasElement);
    await expect(timer.args.durationMs).toBe(1000);
    await inspect(canvasElement, timer.id);
    await playCurrent(canvasElement, timer.id);

    await begin(canvasElement, 'bgm', reviewExitAnchor);
    await chooseAsset(canvasElement, musicId);
    await userEvent.click(within(panel(canvasElement)).getByText('高级数据', { selector: 'summary' }));
    const volume = within(field(panel(canvasElement), 'volume')).getByRole('spinbutton');
    await userEvent.clear(volume);
    await userEvent.type(volume, '0');
    await userEvent.click(within(field(panel(canvasElement), 'loop')).getByRole('checkbox'));
    await expect((await apply(canvasElement)).args).toMatchObject({ volume: 0, loop: false });

    await begin(canvasElement, 'wait', reviewExitAnchor);
    const delay = within(field(panel(canvasElement), 'durationMs')).getByRole('spinbutton');
    await userEvent.clear(delay);
    await userEvent.type(delay, '0');
    await expect((await apply(canvasElement)).args.durationMs).toBe(0);

    await begin(canvasElement, 'comment', reviewExitAnchor);
    const text = within(field(panel(canvasElement), 'text')).getByRole('textbox');
    await userEvent.type(text, 'x');
    await userEvent.tab();
    await userEvent.clear(text);
    await userEvent.tab();
    await expect((await apply(canvasElement)).args.text).toBe('');
    await compare(canvas, canvasElement, 6);
    await selectStatement(canvasElement, timer.id);
    await inspect(canvasElement, timer.id);
    review(canvasElement).dataset.result = 'passed';
  },
};

export const AudioAndWaitDusk: Story = { ...AudioAndWait, args: { scenario: 'audio', theme: 'dark' } };
