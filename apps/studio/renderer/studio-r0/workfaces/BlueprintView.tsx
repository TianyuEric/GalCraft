import { useEffect, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, applyNodeChanges, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { ArrowDownRight, CircleHelp, Database, Film, GitBranch, Image, Link2, Pause, Play, Plus, ScanLine, Search, SkipForward, Square, Trash2, Zap } from 'lucide-react';
import { createId } from '@galcraft/contracts';
import { useReview, useReviewState } from '../context.js';
import type { GraphEdge, GraphNode } from '../model.js';
import { inputs, outputs, pauseGraph, portKind, portName, resumeGraph, startGraph, stopGraph } from './blueprint-runtime.js';
import { NumberField, PaneHeader, type WorkfaceProps } from './shared.js';
import './workfaces.css';

const glyphs = { click: Zap, fade: Film, condition: CircleHelp, variable: Database, scene: Image };
const names = { click: '点击事件', fade: '播放动画', condition: '布尔条件', variable: '读取变量', scene: '进入场景' };
type BlueprintNode = Node<{ node: GraphNode; breakpoint: boolean; running: boolean; finished: boolean; detail: string }, 'blueprint'>;

function BlueprintCard({ data, selected }: NodeProps<BlueprintNode>) {
  const { node, detail } = data, Icon = glyphs[node.kind];
  return <div className="gc-r0-flow-node" data-selected={selected} data-executing={data.running} data-kind={node.kind}>
    {data.breakpoint && <span className="gc-r0-flow-break"><Pause />断点</span>}
    <strong><Icon />{names[node.kind]}{data.finished && <span className="gc-r0-flow-complete">完成</span>}</strong>
    <div className="gc-r0-flow-content"><b title={node.label}>{node.label}</b><span title={detail}>{detail}</span></div>
    {inputs[node.kind].map((id, index) => <Handle key={id} id={id} type="target" position={Position.Left} style={{ top: 47 + index * 26 }} title={`输入 · ${portName(id)}`} className={`gc-r0-flow-port gc-r0-flow-port-${portKind(id)}`} />)}
    {outputs[node.kind].map((id, index) => <Handle key={id} id={id} type="source" position={Position.Right} style={{ top: 47 + index * 26 }} title={`输出 · ${portName(id)}`} className={`gc-r0-flow-port gc-r0-flow-port-${portKind(id)}`} />)}
    {node.kind === 'condition' && <div className="gc-r0-flow-port-caption"><span>是</span><span>否</span></div>}
  </div>;
}

const nodeTypes = { blueprint: BlueprintCard };
type Wire = { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };

export function BlueprintView({ onOpen }: WorkfaceProps = {}) {
  const store = useReview();
  const { project, ui } = useReviewState();
  const { page } = project, run = ui.graphRun;
  const click = page.nodes.find(node => node.kind === 'click');
  const trigger = page.objects.find(object => object.id === (click?.objectId ?? page.objects.find(object => object.kind === 'button')?.id));
  const node = page.nodes.find(node => node.id === (run.status === 'paused' ? run.currentId : ui.graphSelection)) ?? page.nodes.find(node => node.id === run.currentId) ?? click;
  const nodeId = node?.id;
  const [flow, setFlow] = useState<ReactFlowInstance<BlueprintNode, Edge> | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [addKind, setAddKind] = useState<GraphNode['kind']>('fade');
  const [wireSource, setWireSource] = useState('');
  const [wireTarget, setWireTarget] = useState('');
  const [showTrace, setShowTrace] = useState(true);
  const active = run.status === 'running' || run.status === 'paused';
  const detail = (item: GraphNode) => item.kind === 'click' ? trigger?.name ?? '页面对象未绑定' : item.kind === 'fade' ? `${(item.durationMs ?? 400) / 1000} s · 页面根` : item.kind === 'condition' ? `等于 ${item.value === false ? '否' : '是'}` : item.kind === 'variable' ? `当前值 · ${item.value ? '是' : '否'}` : project.scenes.find(scene => scene.id === item.sceneId)?.name ?? '场景未指定';
  const nodes: BlueprintNode[] = page.nodes.map(item => ({ id: item.id, type: 'blueprint', position: positions[item.id] ?? { x: item.x, y: item.y }, selected: item.id === nodeId, deletable: false, ariaLabel: item.label, data: { node: item, detail: detail(item), breakpoint: run.breakpointId === item.id, running: active && run.currentId === item.id, finished: run.trace.includes(item.label) } }));
  const edges: Edge[] = page.edges.map(edge => ({ ...edge, selected: selectedEdges.includes(edge.id), className: `gc-r0-flow-edge-${edge.kind}`, animated: active && edge.kind === 'execution' && (edge.target === run.currentId || edge.source === run.currentId) }));
  const match = query.trim() && page.nodes.find(entry => `${entry.label} ${names[entry.kind]}`.includes(query.trim()));
  const pick = (item: GraphNode) => {
    store.updateUi(state => { state.graphSelection = item.id; });
    if (item.kind === 'click' && trigger) store.select({ kind: 'page-object', documentId: page.id, id: trigger.id });
  };
  const isValid = ({ source, target, sourceHandle, targetHandle }: Wire) => {
    const a = page.nodes.find(item => item.id === source), b = page.nodes.find(item => item.id === target);
    return !!(a && b && a !== b && sourceHandle && targetHandle && outputs[a.kind].includes(sourceHandle) && inputs[b.kind].includes(targetHandle) && portKind(sourceHandle) === portKind(targetHandle));
  };
  const connect = (connection: Connection) => {
    const { source, target, sourceHandle, targetHandle } = connection;
    if (!sourceHandle || !targetHandle || !isValid(connection)) { store.notice('请选择不同节点上类型相同的输入和输出端口。'); return; }
    const kind = portKind(sourceHandle);
    store.edit('连接页面蓝图端口', project => {
      project.page.edges = project.page.edges.filter(edge => !(edge.source === source && edge.sourceHandle === sourceHandle) && !(kind === 'boolean' && edge.target === target && edge.targetHandle === targetHandle));
      project.page.edges.push({ id: createId(), source, target, sourceHandle, targetHandle, kind });
    });
  };
  const update = (id: string, patch: Partial<GraphNode>) => store.edit('编辑蓝图节点', project => { const item = project.page.nodes.find(item => item.id === id); if (item) Object.assign(item, patch); }, `graph:${id}:${Object.keys(patch)[0]}`);
  const locateObject = () => { if (click) pick(click); onOpen?.('page'); };
  const add = () => {
    const id = createId();
    const item: GraphNode = { id, kind: addKind, label: names[addKind], x: (page.nodes.length % 4) * 250 + 40, y: Math.floor(page.nodes.length / 4) * 150 + 40, ...(addKind === 'condition' || addKind === 'variable' ? { value: true } : {}), ...(addKind === 'scene' ? { sceneId: project.scenes[0]?.id } : {}) };
    store.edit('添加页面蓝图节点', project => { project.page.nodes.push(item); }); pick(item);
  };
  const remove = () => {
    if (!node || node.kind === 'click') return;
    store.edit('删除页面蓝图节点', project => { project.page.nodes = project.page.nodes.filter(item => item.id !== node.id); project.page.edges = project.page.edges.filter(edge => edge.source !== node.id && edge.target !== node.id); });
    store.updateUi(state => { state.graphSelection = click?.id ?? null; if (state.graphRun.breakpointId === node.id) state.graphRun.breakpointId = null; });
  };
  const keyboardConnect = () => {
    const [source, sourceHandle] = wireSource.split(':'); const [target, targetHandle] = wireTarget.split(':');
    if (source && target && sourceHandle && targetHandle) connect({ source, sourceHandle, target, targetHandle });
  };
  const runBadge = ({ idle: '就绪', running: '运行中', paused: '已暂停', finished: '已完成', failed: '运行失败' })[run.status];
  const inputValue = node?.kind === 'condition' ? page.nodes.find(variable => variable.id === page.edges.find(edge => edge.target === node.id && edge.kind === 'boolean')?.source) : undefined;
  useEffect(() => {
    if (!flow) return;
    const frame = requestAnimationFrame(() => { void flow.fitView({ padding: .13, duration: 0 }); });
    return () => cancelAnimationFrame(frame);
  }, [flow]);

  return <section className="gc-r0-wf gc-r0-wf-pane gc-r0-blueprint" aria-label="页面行为蓝图">
    <PaneHeader title="行为蓝图" icon={<GitBranch />}>
      <span className="gc-r0-wf-source"><Link2 />{page.name} / {trigger?.name ?? '点击事件'}</span>
      <span role="status" className="gc-r0-wf-badge" data-tone={run.status === 'paused' ? 'warning' : run.status === 'failed' ? 'danger' : run.status === 'finished' ? 'success' : undefined}>{runBadge}</span>
      <button type="button" data-primary onClick={() => startGraph(store)} disabled={active}><Play />运行</button>
      <button type="button" onClick={() => pauseGraph(store)} disabled={run.status !== 'running'}><Pause />暂停</button>
      <button type="button" onClick={() => resumeGraph(store)} disabled={run.status !== 'paused'}><SkipForward />继续检查</button>
      <button type="button" className="gc-r0-wf-icon" aria-label="停止运行" title="停止运行" onClick={() => stopGraph(store)} disabled={run.status === 'idle'}><Square /></button>
      {run.status === 'finished' && onOpen && <button type="button" onClick={() => onOpen('stage')}><ArrowDownRight />查看运行结果</button>}
    </PaneHeader>
    <div className="gc-r0-blueprint-grid">
      <div className="gc-r0-blueprint-main">
        <div className="gc-r0-wf-toolbar">
          <label className="gc-r0-wf-search"><Search /><input aria-label="搜索蓝图节点" placeholder="搜索节点" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && match) { pick(match); void flow?.setCenter(match.x + 98, match.y + 50, { zoom: 1, duration: 150 }); } }} /></label>
          {query && <button type="button" disabled={!match} onClick={() => { if (match) { pick(match); void flow?.setCenter(match.x + 98, match.y + 50, { zoom: 1, duration: 150 }); } }}><ScanLine />定位</button>}
          <span className="gc-r0-wf-spacer" />
          <select aria-label="新增节点类型" value={addKind} onChange={event => setAddKind(event.target.value as GraphNode['kind'])}>{Object.entries(names).filter(([kind]) => kind !== 'click').map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select>
          <button type="button" onClick={add} disabled={active}><Plus />添加节点</button>
        </div>
        <div className="gc-r0-blueprint-flow">
          <ReactFlow<BlueprintNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .13 }} minZoom={.2} maxZoom={1.8} onInit={setFlow} onNodeClick={(_, hit) => pick(hit.data.node)}
            onNodesChange={changes => {
              const moves = changes.filter(change => change.type === 'position'); if (!moves.length) return;
              const adjusted = applyNodeChanges(moves, nodes);
              setPositions(previous => ({ ...previous, ...Object.fromEntries(adjusted.filter(item => moves.some(move => move.id === item.id)).map(item => [item.id, item.position])) }));
            }}
            onNodeDragStop={(_, hit, moved) => {
              const entries = moved.length ? moved : [hit];
              store.edit('移动蓝图节点', project => { for (const model of project.page.nodes) { const entry = entries.find(entry => entry.id === model.id); if (entry) Object.assign(model, entry.position); } });
              setPositions({});
            }}
            onConnect={connect} isValidConnection={isValid}
            onEdgesChange={changes => { const selection = changes.filter(change => change.type === 'select'); if (selection.length) setSelectedEdges(previous => [...previous.filter(id => !selection.some(change => change.id === id)), ...selection.filter(change => change.selected).map(change => change.id)]); }}
            onEdgesDelete={removed => store.edit('断开页面蓝图连线', project => { project.page.edges = project.page.edges.filter(edge => !removed.some(item => item.id === edge.id)); })}
            nodesConnectable={!active} nodesDraggable={!active} edgesReconnectable={false} deleteKeyCode={active ? null : ['Delete', 'Backspace']} colorMode={ui.theme}>
            <Background gap={16} size={1} /><Controls showInteractive={false} />
          </ReactFlow>
          <div className="gc-r0-flow-legend"><span><i />执行</span><span><i />布尔</span><span><i />当前节点</span></div>
        </div>
      </div>
      <aside className="gc-r0-wf-inspector gc-r0-blueprint-side" aria-label="蓝图节点属性">
        <PaneHeader title={node ? `${names[node.kind]}属性` : '节点属性'} icon={<ArrowDownRight />} />
        {node && <div className="gc-r0-wf-fields" key={node.id}>
          <label className="gc-r0-wf-field"><span>节点名称</span><input value={node.label} onChange={event => update(node.id, { label: event.target.value })} disabled={active} onBlur={() => store.endEditGroup()} /></label>
          {(node.kind === 'condition' || node.kind === 'variable') && <label className="gc-r0-wf-field"><span>{node.kind === 'condition' ? '比较值' : '变量值'}</span><select aria-label={node.kind === 'condition' ? '比较值' : '变量值'} value={String(node.value ?? true)} onChange={event => update(node.id, { value: event.target.value === 'true' })} disabled={active}><option value="true">是</option><option value="false">否</option></select></label>}
          {node.kind === 'condition' && <p className="gc-r0-wf-source"><Database />{inputValue ? `${inputValue.label} · 当前值 ${inputValue.value ? '是' : '否'}` : '布尔输入未连接'}</p>}
          {node.kind === 'fade' && <NumberField label="动画时长" value={node.durationMs ?? 400} min={0} max={10000} unit="ms" onChange={durationMs => { if (!active) update(node.id, { durationMs }); }} />}
          {node.kind === 'scene' && <label className="gc-r0-wf-field"><span>目标场景</span><select value={node.sceneId ?? ''} onChange={event => update(node.id, { sceneId: event.target.value })} disabled={active}><option value="">选择场景</option>{project.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label>}
          <div className="gc-r0-wf-actions gc-r0-wf-wrap"><button type="button" aria-pressed={run.breakpointId === node.id} onClick={() => store.updateUi(ui => { ui.graphRun.breakpointId = ui.graphRun.breakpointId === node.id ? null : node.id; })}><Pause />{run.breakpointId === node.id ? '移除断点' : '设为断点'}</button><button type="button" onClick={locateObject}><Link2 />定位页面对象</button>{node.kind !== 'click' && <button type="button" className="gc-r0-wf-icon" aria-label="删除节点" title="删除节点" onClick={remove} disabled={active}><Trash2 /></button>}</div>
        </div>}
        <details className="gc-r0-wf-disclosure"><summary>端口连接</summary><div className="gc-r0-wf-fields">
          <select aria-label="输出端口" value={wireSource} onChange={event => setWireSource(event.target.value)}><option value="">选择输出端口</option>{page.nodes.flatMap(item => outputs[item.kind].map(handle => <option key={`${item.id}:${handle}`} value={`${item.id}:${handle}`}>{item.label} / {portName(handle)}</option>))}</select>
          <select aria-label="输入端口" value={wireTarget} onChange={event => setWireTarget(event.target.value)}><option value="">选择输入端口</option>{page.nodes.flatMap(item => inputs[item.kind].map(handle => <option key={`${item.id}:${handle}`} value={`${item.id}:${handle}`}>{item.label} / {portName(handle)}</option>))}</select>
          <button type="button" onClick={keyboardConnect} disabled={!wireSource || !wireTarget || active}><Link2 />连接端口</button>
          {page.edges.map((edge: GraphEdge) => <button type="button" key={edge.id} disabled={active} onClick={() => store.edit('断开页面蓝图连线', project => { project.page.edges = project.page.edges.filter(item => item.id !== edge.id); })}>断开 {page.nodes.find(node => node.id === edge.source)?.label} / {portName(edge.sourceHandle)}</button>)}
        </div></details>
        <div className="gc-r0-wf-disclosure"><button type="button" aria-expanded={showTrace} onClick={() => setShowTrace(!showTrace)}>运行记录 · {run.trace.length}</button>
          {showTrace && <div className="gc-r0-flow-trace" role="status"><p data-tone={run.status === 'failed' ? 'danger' : run.status === 'paused' ? 'warning' : undefined}>{run.message || '点击运行以检查事件链。'}</p>{run.trace.length > 0 && <ol>{run.trace.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>}</div>}
        </div>
      </aside>
    </div>
  </section>;
}
