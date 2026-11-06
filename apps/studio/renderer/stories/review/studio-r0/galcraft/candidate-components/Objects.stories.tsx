import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CandidateContext, useCandidateState } from '../../../../../review/studio-candidate/application/context.js';
import { CandidateSession } from '../../../../../review/studio-candidate/application/session.js';
import { CandidateCharacterDirectory, CandidateCharactersView } from '../../../../../review/studio-candidate/workfaces/CandidateCharactersView.js';
import { CandidatePageDirectory, CandidatePageOutline, CandidatePagesView } from '../../../../../review/studio-candidate/workfaces/CandidatePagesView.js';
import { candidateFixture } from '../../../studio-candidate/fixtures.js';
import '../../../../../styles/studio-theme.css';
import '../../../../../review/studio-candidate/styles/studio.css';

function Objects({ workface = 'page', theme = 'light' }: { workface?: 'page' | 'character'; theme?: 'light' | 'dark' }) {
  const [session] = useState(() => {
    const { seed, createServices } = candidateFixture('balanced', theme);
    return new CandidateSession(seed, createServices);
  });
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    void session.open();
    return () => { queueMicrotask(() => { if (generation.current === current) session.dispose(); }); };
  }, [session]);
  return <CandidateContext value={session}><ObjectFixture key={workface} workface={workface} session={session} theme={theme}/></CandidateContext>;
}

function ObjectFixture({ workface, session, theme }: { workface: 'page' | 'character'; session: CandidateSession; theme: 'light' | 'dark' }) {
  const { ready, project } = useCandidateState();
  const [id, setId] = useState(workface === 'page' ? 'page:title' : 'character:' + project.characters[0]?.id);
  const [outline, setOutline] = useState(false);
  useEffect(() => { if (ready) session.activateView(id); }, [session, ready, id]);
  const navigate = (view: string) => {
    if (view === 'page-outline') setOutline(value => !value);
    else if (view.startsWith('page:') || view.startsWith('character:')) setId(view);
  };
  return <div className="gc-candidate authoring-shell" lang="zh-CN" data-theme={theme} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 260px) minmax(0, 1fr)', height: '100vh' }}>
    {!ready ? <p role="status">正在读取对象…</p> : <>
      <aside style={{ overflow: 'hidden' }}>{workface === 'page'
        ? outline ? <CandidatePageOutline viewId={id}/> : <CandidatePageDirectory onNavigate={navigate}/>
        : <CandidateCharacterDirectory onNavigate={navigate}/>}</aside>
      <main style={{ minHeight: 0, minWidth: 0 }}>{workface === 'page'
        ? <CandidatePagesView pageKey={id.slice(5)} viewId={id} onNavigate={navigate}/>
        : <CandidateCharactersView characterId={id.slice(10)} viewId={id} onNavigate={navigate}/>}</main>
    </>}
  </div>;
}

const meta = { title: 'Review/Studio/R0/GalCraft R0/候选组件/页面与角色', component: Objects,
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  render: args => <Objects key={args.workface + ':' + args.theme} {...args}/> } satisfies Meta<typeof Objects>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PageModes: Story = {
  name: '独立页面与真实预览',
  play: async ({ canvas }) => {
    const modes = within(await canvas.findByRole('group', { name: '页面模式' }));
    await userEvent.click(modes.getByRole('button', { name: '预览' }));
    await expect(modes.getByRole('button', { name: '预览' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.queryByRole('button', { name: 'AI 辅助' })).not.toBeInTheDocument();
    const directory = within(canvas.getByRole('navigation', { name: '页面列表' }));
    await userEvent.click(directory.getAllByRole('button')[1]!);
    await expect(await canvas.findByRole('button', { name: '布局', pressed: true })).toBeVisible();
    await userEvent.click(directory.getAllByRole('button')[0]!);
    await expect(await canvas.findByRole('button', { name: '预览', pressed: true })).toBeVisible();
  },
};

async function chooseOption(control: HTMLElement, value: string) {
  await userEvent.click(control);
  const list = control.ownerDocument.getElementById(control.getAttribute('aria-controls')!);
  await expect(list).toBeVisible();
  const option = within(list!).getAllByRole('option').find(option => option.getAttribute('data-value') === value);
  await expect(option).toBeDefined();
  await userEvent.click(option!);
  await expect(control).toHaveTextContent(option!.textContent!);
}

export const BlueprintReview: Story = {
  name: '蓝图临时连线、断点与分支',
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '行为' }));
    await userEvent.click(canvas.getByRole('button', { name: '打开蓝图审核' }));
    const graph = within(canvas.getByRole('region', { name: '页面行为蓝图' }));
    await userEvent.click(graph.getByText('连接端口', { selector: 'summary' }));
    await chooseOption(graph.getByRole('combobox', { name: '输出端口' }), 'flag/bool');
    await chooseOption(graph.getByRole('combobox', { name: '输入端口' }), 'branch/in');
    await userEvent.click(graph.getByRole('button', { name: '连接端口' }));
    await expect(graph.getByText('请选择不同节点上类型相同的输入和输出端口。')).toBeVisible();
    await chooseOption(graph.getByRole('combobox', { name: '输入端口' }), 'branch/bool');
    await userEvent.click(graph.getByRole('button', { name: '连接端口' }));
    await expect(graph.getByText('端口已连接。')).toBeVisible();
    await userEvent.click(graph.getByRole('button', { name: '断点' }));
    await userEvent.click(graph.getByRole('button', { name: '运行审核' }));
    await expect(graph.getByText('已暂停 · 检查布尔值')).toBeVisible();
    await userEvent.click(graph.getByRole('button', { name: '继续检查' }));
    await expect(graph.getByText('条件走「是」分支')).toBeVisible();
    await chooseOption(graph.getByRole('combobox', { name: '样例布尔值' }), 'false');
    await userEvent.click(graph.getByRole('button', { name: '断点' }));
    await userEvent.click(graph.getByRole('button', { name: '运行审核' }));
    await expect(graph.getByText('条件走「否」分支')).toBeVisible();
  },
};

export const PsdReview: Story = {
  name: 'PSD 自动映射与重导入审核',
  args: { workface: 'character', theme: 'dark' },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: '组合外观' }));
    await userEvent.click(canvas.getByRole('button', { name: /^导入 PSD$/ }));
    const initial = within(await canvas.findByRole('dialog', { name: /^导入 PSD$/ }));
    await userEvent.click(initial.getByRole('button', { name: '选择教学 PSD' }));
    await expect(initial.getByRole('button', { name: /^导入$/ })).toBeDisabled();
    await expect(initial.getByRole('region', { name: '排除的图层' })).toHaveTextContent('定位线');
    await userEvent.click(initial.getByRole('button', { name: '向下合并' }));
    await expect(initial.getByRole('region', { name: '自动图层映射' })).toHaveTextContent('光景');
    await userEvent.click(initial.getByRole('button', { name: /^导入$/ }));
    await userEvent.click(await canvas.findByRole('button', { name: /^重导入 PSD$/ }));
    const revised = within(await canvas.findByRole('dialog', { name: /^重导入 PSD$/ }));
    await userEvent.click(revised.getByRole('button', { name: '选择教学 PSD' }));
    await userEvent.click(revised.getByRole('button', { name: '向下合并' }));
    await expect(revised.getByRole('region', { name: '需要处理的图层' })).toHaveTextContent('青蓝');
    await expect(revised.getByRole('region', { name: '本次写入' })).toHaveTextContent('刷新版本');
    await userEvent.click(revised.getByRole('button', { name: /^取消$/ }));
    await expect(canvas.getByRole('button', { name: /^重导入 PSD$/ })).toBeVisible();
  },
};
