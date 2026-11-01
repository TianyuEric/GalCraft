import { useEffect, useRef, useState } from 'react';
import { SceneTree as ArboristTree, type SceneTreeContext } from '../../components/workbench/SceneTree.js';
import { FileText, Folder, Moon, RotateCcw, Search, Sun, Undo2 } from 'lucide-react';
import { Button } from '../../components/controls.js';
import { ObjectTree, type WorkbenchTreeNode } from '../../components/workbench/ObjectTree.js';
import { canMove, filterTree, flattenTree, moveTree, renameTree, treeFixture, type SceneNode } from './tree-data.js';
import '../../components/workbench/workbench.css';
import '../../authoring/pilot.css';
import './comparison.css';
import './tree-comparison.css';

type Kind = 'candidate' | 'baseline';
type Mode = 'normal' | 'large' | 'empty' | 'readonly';
type TreeContextValue = SceneTreeContext;

const baselineNodes = (nodes: SceneNode[]): WorkbenchTreeNode[] => nodes.map(n => ({ ...n, icon: n.kind === 'chapter' ? <Folder size={14} /> : <FileText size={14} />, detail: n.children ? String(n.children.length) : undefined, children: n.children ? baselineNodes(n.children) : undefined }));

export function TreeComparison({ initialKind = 'candidate', initialTheme = 'light', initialMode = 'normal', initialFailure = false }: { initialKind?: Kind; initialTheme?: 'light' | 'dark'; initialMode?: Mode; initialFailure?: boolean }) {
  const [kind, setKind] = useState(initialKind), [theme, setTheme] = useState(initialTheme), [mode, setMode] = useState(initialMode);
  const [data, setData] = useState(() => initialMode === 'empty' ? [] : treeFixture(initialMode === 'large'));
  const [selected, setSelected] = useState<string[]>(initialMode === 'empty' || initialMode === 'large' ? [] : ['s2']);
  const [active, setActive] = useState(initialMode === 'empty' ? '' : initialMode === 'large' ? 'scene-0-0' : 's2'), [pinned, setPinned] = useState(false);
  const [query, setQuery] = useState(''), [history, setHistory] = useState<SceneNode[][]>([]), [status, setStatus] = useState('从左侧选择场景，开始体验。');
  const [failRename, setFailRename] = useState(initialFailure), [epoch, setEpoch] = useState(0), [clearToken, setClearToken] = useState(0);
  const viewport = useRef<HTMLDivElement>(null), [height, setHeight] = useState(480);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => { if (entry) setHeight(Math.max(100, Math.floor(entry.contentRect.height))); }); if (viewport.current) observer.observe(viewport.current); return () => observer.disconnect(); }, [mode]);
  const visible = filterTree(data, query), all = flattenTree(data), visibleIds = new Set(flattenTree(visible).map(n => n.id));
  const hidden = selected.filter(id => !visibleIds.has(id)).length;
  const current = all.find(n => n.id === active), primary = all.find(n => n.id === selected.at(-1));
  const commit = (next: SceneNode[], message: string) => { if (next === data) { setStatus('位置与内容未改变。'); return; } setHistory(items => [...items, data]); setData(next); setStatus(message); };
  const reset = (nextMode: Mode = mode) => { const next = nextMode === 'empty' ? [] : treeFixture(nextMode === 'large'); setData(next); setMode(nextMode); setSelected(nextMode === 'normal' || nextMode === 'readonly' ? ['s2'] : []); setActive(nextMode === 'large' ? 'scene-0-0' : nextMode === 'empty' ? '' : 's2'); setQuery(''); setHistory([]); setPinned(false); setEpoch(v => v + 1); setStatus('已恢复相同起点。'); };
  const move = (ids: string[], parent: string | null, index: number) => { if (mode === 'readonly' || query) return; if (!canMove(data, ids, parent)) { setStatus('章节保持顶层；场景只能移入章节。'); return; } commit(moveTree(data, ids, parent, index), `已移动 ${ids.length} 项，可撤销。`); };
  const rename = async (id: string, name: string): Promise<string | void> => {
    if (mode === 'readonly') return '当前为只读。';
    await new Promise(resolve => setTimeout(resolve, 220));
    if (failRename) { setFailRename(false); return '保存失败，输入已保留。请按 Enter 重试。'; }
    const result = renameTree(data, id, name); if (result.error) return result.error;
    commit(result.nodes, '名称已更新，可撤销。');
  };
  const open = (id: string, pin: boolean) => { setActive(id); setPinned(pin); };
  const ctx: TreeContextValue = { active, selected, hidden, readonly: mode === 'readonly', query, data, rename, select: setSelected, open, move };
  const moveSingle = (offset: -1 | 1) => {
    const id = selected[0]; if (!id) return;
    const parent = data.find(n => n.children?.some(c => c.id === id));
    const siblings = parent?.children ?? data, index = siblings.findIndex(n => n.id === id);
    move([id], parent?.id ?? null, index + (offset === 1 ? 2 : -1));
  };
  return <div id="app" className="authoring-shell authoring-pilot-scope candidate-lab tree-lab" data-authoring-pilot="true" data-theme={theme}>
    <div id="studio-portals" data-authoring-pilot="true" data-theme={theme} lang="zh-CN" />
    <header className="candidate-lab-header"><div><h1>作品对象 · 第二批比较</h1><p>定位场景 → 重命名 → 多选与移动 → 过滤后恢复选区</p></div><div className="candidate-lab-actions"><Button aria-label="切换明暗主题" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</Button><Button onClick={() => reset()}><RotateCcw size={16} />重置场景</Button></div></header>
    <div className="candidate-comparison-bar"><div className="candidate-version" role="group" aria-label="对象树方案"><span>对象树</span><Button aria-pressed={kind === 'baseline'} onClick={() => { setKind('baseline'); setEpoch(v => v + 1); }}>现有 ObjectTree</Button><Button aria-pressed={kind === 'candidate'} onClick={() => { setKind('candidate'); setEpoch(v => v + 1); }}>React Arborist</Button></div><span className="candidate-hint">切换方案保留当前数据与选区 · Kibo 仅作视觉参考</span></div>
    <div className="tree-workspace"><aside className="tree-explorer" aria-label="作品对象区域"><header><strong>雨站来信</strong><span>章节与场景</span></header>
      <div className="tree-search"><Search size={14} /><input data-slot="studio-tree-control" aria-label="筛选章节与场景" placeholder="筛选章节与场景" value={query} onChange={e => setQuery(e.target.value)} />{query && <button data-slot="studio-tree-control" aria-label="清除筛选" onClick={() => setQuery('')}>×</button>}</div>
      <div className="tree-selection-info"><span>已选 {selected.length} 项{hidden > 0 && <strong>，{hidden} 项不在结果中</strong>}</span>{selected.length > 0 && <button data-slot="studio-tree-control" onClick={() => { setSelected([]); setClearToken(v => v + 1); }}>清空选区</button>}</div>
      <div className="tree-viewport" ref={viewport} data-testid="tree-viewport" key={`${mode}`}>
        {data.length === 0 ? <div className="tree-empty"><Folder size={24} /><strong>还没有章节</strong><p>载入示例后体验展开、选择与移动。</p><Button onClick={() => reset('normal')}>载入示例</Button></div> : <div key={`${kind}-${epoch}`} className="tree-instance">
          {kind === 'candidate' ? <ArboristTree ctx={ctx} height={height} clearToken={clearToken} /> : <ObjectTree nodes={baselineNodes(visible)} selected={selected} active={active} onSelect={setSelected} onOpen={open} onRename={mode === 'readonly' ? undefined : rename} onMoveMany={mode === 'readonly' || query ? undefined : (ids, parent) => move(ids, parent, data.find(n => n.id === parent)?.children?.length ?? 0)} menuGroups={(node, scope) => node.children ? [] : [
            { label: node.name, actions: [{ label: '打开场景', run: () => open(node.id, true) }] },
            { label: `所选 ${scope.length} 项${hidden ? ` · 隐藏 ${hidden} 项` : ''}`, actions: data.map(chapter => ({ label: `移动到 ${chapter.name}`, disabled: mode === 'readonly' ? '当前为只读' : query ? '请先清除筛选' : !canMove(data, scope, chapter.id) ? '选区包含章节，不能作为场景移动' : undefined, run: () => move(scope, chapter.id, chapter.children!.length) })) },
          ]} />}
          {kind === 'candidate' && !visible.length && <p className="tree-no-results">没有匹配对象。<button data-slot="studio-tree-control" onClick={() => setQuery('')}>清除筛选</button></p>}
        </div>}
      </div>
      <footer className="tree-explorer-footer">{mode === 'readonly' ? '只读：可浏览和打开场景。' : query ? '筛选时暂停拖动；清除筛选后可移动。' : kind === 'baseline' ? '现有：拖到章节末尾；没有插入位置。' : '拖到章节中移动；行间标线调整顺序。'}</footer>
    </aside><main className="tree-document"><header className="candidate-document"><FileText size={14} /><strong data-testid="active-scene">{current?.name ?? '选择一个场景'}</strong><span>{pinned ? '已固定' : '预览'}</span></header>
      <div className="tree-document-body"><div className="tree-context"><span>当前文档</span><h2>{current?.name ?? '雨站来信'}</h2><p>章节组织场景；播放顺序由场景内容定义。</p></div>
        <div className="tree-scene-preview"><img src="/practice/backgrounds/spring-station.png" alt="场景示意：雨后的站台" /><div><strong>林舟</strong><p>雨停了。那封信，还在你手里吗？</p></div></div>
        <div className="tree-inspect"><div><span>当前选区</span><strong>{selected.length > 1 ? `${selected.length} 个对象` : primary?.name ?? '未选择对象'}</strong></div><div className="tree-order-buttons"><Button disabled={kind === 'baseline' || mode === 'readonly' || !!query || selected.length !== 1} onClick={() => moveSingle(-1)}>上移</Button><Button disabled={kind === 'baseline' || mode === 'readonly' || !!query || selected.length !== 1} onClick={() => moveSingle(1)}>下移</Button></div></div>
        <details className="candidate-guide" open><summary>体验任务</summary><ol><li>折叠第一章再展开。点击“街角”，用 ↑ ↓ 移动焦点；按 Enter 打开。</li><li>按 F2 改名，Esc 取消；再次改名并确认，再撤销。试试空名称和“站台”。</li><li>Ctrl 多选两个场景，Shift 连选。拖至第二章；再尝试行间排序和拖动中按 Esc。</li><li>选中“街角”后搜索“站台”，观察隐藏选区；清除筛选后检查选中项。</li><li>切换现有实现与候选，比较键盘、操作菜单、长名称和拖动落点。</li></ol></details>
        <details className="candidate-guide"><summary>数据场景与验证边界</summary><div className="tree-fixture-options"><label>数据场景<select data-slot="studio-tree-control" aria-label="数据场景" value={mode} onChange={e => reset(e.target.value as Mode)}><option value="normal">正常 · 9 节点</option><option value="large">合成大树 · 5,100 节点</option><option value="empty">空作品</option><option value="readonly">只读示例</option></select></label><label><input data-slot="studio-tree-control" type="checkbox" checked={failRename} onChange={e => setFailRename(e.target.checked)} />下一次改名模拟保存失败</label></div><p>相同数据、两层结构、240 px 对象区。改名和移动只写本页内存，撤销用于比较交互；磁盘事务、M02 接入与实际播放器留待选型后验证。</p><p>当前 {all.length.toLocaleString()} 节点 · 深度 {data.length ? 2 : 0}{mode === 'large' ? ' · 合成：100 章，每章 50 场景' : ' · 示例作品'}。</p><pre data-testid="tree-state">{JSON.stringify({ selected, active, order: data.slice(0, 3).map(n => ({ id: n.id, children: n.children?.map(c => c.id) })) })}</pre></details>
      </div></main></div>
    <footer className="candidate-status"><span role="status" data-testid="tree-status">{status}</span><span data-testid="history-count">{history.length} 次修改</span><Button disabled={!history.length} onClick={() => { setData(history.at(-1)!); setHistory(items => items.slice(0, -1)); setStatus('已撤销上一次修改。'); }}><Undo2 size={14} />撤销</Button></footer>
  </div>;
}
