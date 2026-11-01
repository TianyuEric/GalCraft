import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { NativeAnimationSchema, type NativeAnimation } from '@galcraft/contracts';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import { Button } from '../../components/controls.js';
import { DocumentTabs, type WorkbenchDocument } from '../../components/workbench/WorkbenchShell.js';
import { FileText } from 'lucide-react';
import { AnimationWorkbench } from './AnimationWorkbench.js';
import { AnimationTimeline } from '../animation-timeline.js';
import { AudioLoopWorkbench } from './AudioLoopWorkbench.js';
import { SceneGraph } from '../scene-graph.js';
import type { AuthoringSource } from '../controller.js';
import type { PreviewPlayback } from '../audio-preview.js';
import '../shell.css';
import '../workspace.css';

const initial = (long = false) => NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: long ? 65000 : 4000,
  tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 0, value: -160 }, { timeMs: 1000, value: 0, easing: { family: 'cubic', direction: 'out' } }, { timeMs: long ? 65000 : 4000, value: 160 }] },
    { path: '/opacity', mode: 'absolute', keyframes: [{ timeMs: 0, value: .1 }, { timeMs: 1000, value: 1 }] },
    { path: '/rotationDeg', mode: 'absolute', keyframes: [{ timeMs: 0, value: -8 }, { timeMs: 2000, value: 0 }] }] });

type Props = { surface?: 'animation' | 'before' | 'audio' | 'graph' | 'tabs' | 'empty'; theme?: 'light' | 'dark'; locale?: string; fail?: boolean; missing?: boolean; long?: boolean; delay?: number; readonly?: boolean };
function Experience({ surface = 'animation', theme = 'light', locale = 'zh-CN', fail = false, missing = false, long = false, delay = 0, readonly = false }: Props) {
  const [failure, setFailure] = useState(fail), [history, setHistory] = useState<NativeAnimation[]>([initial(long)]), [cursor, setCursor] = useState(0), [count, setCount] = useState(0);
  const [loop, setLoop] = useState<PreviewPlayback>({ loopStartSec: 4, loopEndSec: 8 }), [loopHistory, setLoopHistory] = useState<PreviewPlayback[]>([]), [restoreSource, setRestoreSource] = useState(false);
  const [selected, select] = useState('Sc0000'), [statement, setStatement] = useState<string | undefined>();
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [documents, setDocuments] = useState<WorkbenchDocument[]>(Array.from({ length: 12 }, (_, index) => ({ id: `doc${index}`, title: index === 0 ? '雨站来信 · 尚未寄出的最后一封信与共同回忆' : `场景 ${index + 1}`, icon: <FileText/>, dirty: index === 0, preview: index === 11 })));
  const [active, setActive] = useState('doc0');
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  useEffect(() => { const portal = document.getElementById('studio-portals'), owns = !portal, node = portal ?? document.createElement('div'); node.id = 'studio-portals'; node.dataset.theme = theme; node.lang = locale; if (owns) document.body.append(node); setReady(true); return () => { if (owns) node.remove(); }; }, [theme, locale]);
  const graphSource: AuthoringSource = { projectDocumentId: 'PrjDoc', projectRevision: 1, projectSavedRevision: 1, projectDirty: false, project: { ...structuredClone(FixtureProject), entry: { sceneId: 'Sc0000', labelId: null } }, characters: [], scenes: Array.from({ length: long ? 60 : 6 }, (_, index) => ({ sceneId: `Sc${String(index).padStart(4, '0')}`, name: index === 0 ? '清晨 · 雨停后的站台与尚未寄出的来信' : `第 ${index + 1} 场 · ${['车站', '书店', '共同回忆'][index % 3]}`, text: missing && index === 0 ? 'changeScene {sceneId:"GoneAA"} @St0000;\nchoose {' : index === (long ? 59 : 5) ? 'end {target:{kind:"title"}} @EndAAA;' : `changeScene {sceneId:"Sc${String(index + 1).padStart(4, '0')}"} @St${String(index).padStart(4, '0')};`, documentId: `Dc${String(index).padStart(4, '0')}`, chapterId: FixtureProject.chapters[0]!.id, revision: 1, savedRevision: 1, dirty: false })) };
  if (!ready) return <p role="status">{t('正在准备体验', 'Preparing experience', '体験を準備中')}</p>;
  return <div id="app" data-theme={theme} className="pro-experience authoring-shell" style={{ display: 'block' }}>
    <header><h1>{t('第三批组件体验', 'Batch 3 component experience', '第3組コンポーネント体験')}</h1><p>{t('组件使用正式源码；提交与撤销为内存夹具。', 'Production component source; apply and undo use memory fixtures.', '正式ソース・適用と履歴はメモリ内の例です。')}</p></header>
    {surface === 'animation' && <AnimationWorkbench animation={history[cursor]!} locale={locale} onDraftChange={setDirty} targetLabel={t('林舟 · 平静 / 入场演出', 'Lin Zhou · Calm / Entrance', '林舟・平静 / 登場')} image="/practice/figures/deepseek-neutral.png" onChange={async next => { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); if (failure) throw new Error(t('示例提交失败。草稿保留，可关闭失败模拟后重试。', 'Example apply failed. Draft retained; turn off failure and retry.', '適用失敗の例。入力を保持。失敗の再現を解除して再試行できます。')); setHistory(old => [...old.slice(0, cursor + 1), next]); setCursor(cursor + 1); setCount(value => value + 1); }}/ >}
    {surface === 'before' && <AnimationTimeline animation={history[cursor]!} locale={locale} targetLabel="林舟 · 平静 / 入场演出" onChange={async next => { setHistory(old => [...old.slice(0, cursor + 1), next]); setCursor(cursor + 1); setCount(value => value + 1); }}/>}
    {surface === 'audio' && <AudioLoopWorkbench name="春日 · 站台 / spring-01.opus" src={missing && !restoreSource ? '/practice/missing-audio.opus' : '/practice/music/spring-01.opus'} value={loop} locale={locale} onDraftChange={setDirty} readonly={readonly} onChange={async next => { if (failure) throw new Error('示例提交失败，循环草稿已保留。'); setLoopHistory(old => [...old, loop]); setLoop(next); setCount(value => value + 1); }}/ >}
    {surface === 'empty' && <AudioLoopWorkbench name="" value={loop} onChange={async () => {}}/>}
    {surface === 'graph' && <><div className="pro-graph"><SceneGraph source={graphSource} activeSceneId={selected} locale={locale} onNavigate={(scene, statement) => { select(scene); setStatement(statement); }}/></div><output aria-label="图导航目标">{selected}{statement ? ` / ${statement}` : ''}</output></>}
    {surface === 'tabs' && <><DocumentTabs documents={documents} active={active} panelId="batch3-panel" onSelect={setActive} onPin={id => setDocuments(old => old.map(doc => doc.id === id ? { ...doc, preview: false } : doc))} onClose={id => { setDocuments(old => old.filter(doc => doc.id !== id)); if (active === id) setActive(documents.find(doc => doc.id !== id)?.id ?? ''); }} onReorder={ids => setDocuments(old => ids.map(id => old.find(doc => doc.id === id)!))}/><div id="batch3-panel" role="tabpanel" aria-labelledby={`gc-document-tab-${active}`}><p>当前文档：<output aria-label="当前文档">{active || '所有文档已关闭'}</output></p><p>文档菜单支持固定、移动、关闭；拖动中 Esc 取消。此夹具没有磁盘保存。</p></div></>}
    {(surface === 'animation' || surface === 'audio') && <div className="pro-harness">
      <label><input type="checkbox" checked={failure} onChange={event => setFailure(event.target.checked)}/>{t('模拟提交失败', 'Simulate apply failure', '適用失敗を再現')}</label>
      <Button disabled={surface === 'animation' ? cursor === 0 : loopHistory.length === 0} onClick={() => { if (surface === 'animation') setCursor(value => value - 1); else { setLoop(loopHistory.at(-1)!); setLoopHistory(old => old.slice(0, -1)); } }}>{t('撤销夹具修改', 'Undo fixture edit', '例の編集を戻す')}</Button>
      {surface === 'animation' && <Button disabled={cursor === history.length - 1} onClick={() => setCursor(value => value + 1)}>{t('重做夹具修改', 'Redo fixture edit', '例の編集をやり直す')}</Button>}
      {missing && <Button onClick={() => setRestoreSource(true)}>恢复声音来源</Button>}
      <output aria-label="未提交输入">{dirty ? 'dirty' : 'clean'}</output><span>{t('已提交', 'Applied', '適用済み')} <output aria-label="提交次数">{count}</output> {t('次', 'times', '回')}</span>
    </div>}
  </div>;
}
const meta = { title: 'Product/Studio/Authoring/Professional editors', component: Experience, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Experience>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Animation: Story = {};
export const BeforeAnimation: Story = { args: { surface: 'before' } };
export const AnimationDark: Story = { args: { theme: 'dark' } };
export const AnimationEnglish: Story = { args: { locale: 'en' } };
export const AnimationJapanese: Story = { args: { locale: 'ja', theme: 'dark' } };
export const AnimationFailure: Story = { args: { fail: true } };
export const AnimationPending: Story = { args: { delay: 1500 } };
export const AnimationLong: Story = { args: { long: true } };
export const Audio: Story = { args: { surface: 'audio' } };
export const AudioDark: Story = { args: { surface: 'audio', theme: 'dark' } };
export const AudioEnglish: Story = { args: { surface: 'audio', locale: 'en' } };
export const AudioJapanese: Story = { args: { surface: 'audio', locale: 'ja', theme: 'dark' } };
export const AudioReadonly: Story = { args: { surface: 'audio', readonly: true } };
export const AudioMissing: Story = { args: { surface: 'audio', missing: true } };
export const NoSelection: Story = { args: { surface: 'empty' } };
export const GraphSix: Story = { args: { surface: 'graph' } };
export const GraphLong: Story = { args: { surface: 'graph', long: true, theme: 'dark' } };
export const GraphMissing: Story = { args: { surface: 'graph', missing: true } };
export const DocumentOverflow: Story = { args: { surface: 'tabs' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement), tab = await canvas.findByRole('tab', { name: '场景 3' });
  await userEvent.click(tab);
  const item = tab.parentElement!, list = item.parentElement!, close = canvas.getByRole('button', { name: '关闭场景 3' });
  const background = getComputedStyle(item).backgroundColor;
  await expect(list.querySelector('.gc-tabs-indicator')).not.toBeVisible();
  await expect(tab.getBoundingClientRect().height).toBe(item.getBoundingClientRect().height);
  await expect(getComputedStyle(tab).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  await expect(getComputedStyle(tab).borderRadius).toBe('0px');
  await expect(getComputedStyle(close).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  const next = canvas.getByRole('tab', { name: '场景 4' });
  await userEvent.click(tab); await userEvent.keyboard('{ArrowRight}');
  await expect(next).toHaveFocus();
  await expect(next).toHaveAttribute('aria-selected', 'false');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(getComputedStyle(item).backgroundColor).toBe(background);
} };
export const DocumentOverflowDark: Story = { ...DocumentOverflow, args: { surface: 'tabs', theme: 'dark' } };
