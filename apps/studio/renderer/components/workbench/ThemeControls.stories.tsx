import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, FolderOpen, GripVertical, Image, MessageSquare, Music, Settings, Trash2, UserRound } from 'lucide-react';
import { Button, Choice, Field } from '../controls.js';
import { DocumentTabs, IconAction, InspectorSection, WorkbenchShell } from './WorkbenchShell.js';
import { ObjectTree } from './ObjectTree.js';
import '../../authoring/workspace.css';
import '../../authoring/shell.css';
import '../../authoring/refinements.css';
import '../../authoring/creation-refinements.css';
import '../../authoring/workbench-production.css';

const portrait = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="300" viewBox="0 0 120 300"><circle cx="60" cy="35" r="26" fill="#e5b796"/><path d="M30 68h60l18 130H12z" fill="#668bbc"/><path d="M32 198h22v85H32zm34 0h22v85H66z" fill="#465772"/><path d="M26 280h30v15H20zm38 0h30l6 15H64z" fill="#9d7358"/></svg>')}`;

function ThemeControls({ theme = 'light', panelAvailable = true }: { theme?: 'light' | 'dark'; panelAvailable?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [active, setActive] = useState('document-0'), [selected, setSelected] = useState('figure'), [choice, setChoice] = useState('upper'), [search, setSearch] = useState('voice-2');
  const [documents, setDocuments] = useState(Array.from({ length: 12 }, (_, index) => ({ id: `document-${index}`, title: index === 0 ? '雨夜的车站' : `第 ${index + 1} 幕 · 往返切换与长标题文档`, icon: <FileText/>, dirty: index === 1, preview: index === 11 })));
  return <div id="app" data-theme={theme}>
    <div id="studio-portals" data-theme={theme} lang="zh-CN"/>
    <div className="authoring-shell" data-theme={theme}>
      {ready && <WorkbenchShell title={<strong>GalCraft · 主题与共享控件</strong>}
        activity={<><IconAction label="创作" pressed onClick={() => {}}><FileText/></IconAction><IconAction label="素材" onClick={() => {}}><Image/></IconAction><span className="gc-wb-spacer"/><IconAction label="设置" onClick={() => {}}><Settings/></IconAction></>}
        explorerTitle="作品" explorer={<ObjectTree nodes={[{ id: 'chapter', name: '第一章 · 夜行列车', icon: <FolderOpen/>, children: [{ id: 'scene', name: '雨夜的车站', icon: <FileText/> }] }]} selected={['scene']} onSelect={() => {}} onOpen={() => {}}/>}
        documents={<DocumentTabs documents={documents} active={active} onReorder={ids => setDocuments(items => ids.map(id => items.find(item => item.id === id)!))} onSelect={setActive} onPin={id => setDocuments(items => items.map(item => item.id === id ? { ...item, preview: false } : item))} onClose={id => setDocuments(items => { const next = items.filter(item => item.id !== id); if (id === active) setActive(next[0]?.id ?? ''); return next; })}/>}
        toolbar={<><Button tone="quiet">写作</Button><Button tone="quiet" aria-pressed>演出</Button><Button tone="quiet">源码</Button></>}
        inspectorTitle="指令属性" inspector={<InspectorSection title="立绘取景"><Field label="取景"><Choice label="取景" value={choice} onChange={setChoice} options={[{ value: 'upper', label: '上半身' }, { value: 'full', label: '完整立绘' }, { value: 'close', label: '近景' }]}/></Field><Field label="配音连接"><Choice label="配音连接" value={search} onChange={setSearch} options={Array.from({ length: 14 }, (_, index) => ({ value: `voice-${index}`, label: `配音连接 ${index + 1} · 多语言长名称` }))}/></Field><p className="gc-wb-muted">素材缩略图完整显示原图；取景控制舞台中的实际构图。</p></InspectorSection>}
        panels={panelAvailable ? [{ id: 'issues', title: '问题', count: 0, content: <p className="gc-wb-muted">当前场景没有问题。</p> }] : []} status={<><span>已保存</span><span>正式共享组件 · 示例数据</span></>}>
        <section className="authoring-center"><div className="authoring-card-list">
          {[{ id: 'dialogue', kind: 'say', label: '小雨', text: '列车即将抵达。窗外的雨声渐渐轻了下来，我们终于又见面了。', icon: <MessageSquare/> }, { id: 'figure', kind: 'changeFigure', label: '立绘', text: '小雨 · 常服 · 完整透明立绘', icon: <UserRound/> }, { id: 'music', kind: 'bgm', label: '背景音乐', text: '雨夜钢琴 · 淡入 1.5 秒', icon: <Music/> }].map(card => <article key={card.id} tabIndex={0} className={`authoring-card ${selected === card.id ? 'selected' : ''}`} data-view="cards" data-command={card.kind} onClick={() => setSelected(card.id)}>
            <button type="button" className="authoring-grip" aria-label={`移动${card.label}`}><GripVertical size={16}/></button><span className="authoring-command-icon" data-command-kind={card.kind}>{card.icon}</span><strong>{card.label}</strong>
            {card.id === 'figure' && <button type="button" className="authoring-direction-preview" aria-label="预览完整立绘"><img className="authoring-direction-thumbnail" src={portrait} alt="从头到脚的立绘比例样例"/></button>}
            <span className="authoring-card-summary">{card.text}</span><button type="button" className="authoring-card-delete"><Trash2 size={14}/>删除指令</button>
          </article>)}
        </div></section>
      </WorkbenchShell>}
    </div>
  </div>;
}

const meta = { title: 'Product/Studio/Workbench/Workbench theme and controls', component: ThemeControls, parameters: { layout: 'fullscreen', docs: { description: { component: '正式主题、工作台、Select 与指令卡片样式。示例文档与立绘比例用于验证外观、滚动和键盘；不包含 M02 编辑或真实媒体预览。' } } }, args: { theme: 'light' }, argTypes: { theme: { control: 'select', options: ['light', 'dark'] } } } satisfies Meta<typeof ThemeControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dusk: Story = { args: { theme: 'dark' } };
export const NoAuxiliaryPanel: Story = { args: { panelAvailable: false } };
