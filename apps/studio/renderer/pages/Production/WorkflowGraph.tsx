import { memo, useMemo, useRef, useState } from 'react';
import { Background, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { Expand, Focus, GitBranch, List, LocateFixed, Minimize2, Minus, Plus } from 'lucide-react';
import type { WorkflowBinding } from '@galcraft/authoring/production';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from '../../components/ui/flow-node.js';
import { Toolbar, ToolbarButton, ToolbarSeparator } from '../../components/ui/toolbar.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/controls.js';
import { workflowTopology } from './workflow-model.js';
import '@xyflow/react/dist/style.css';
import './workflow.css';

type FlowNode = Node<{ title: string; classType: string; summary: string }, 'workflow'>;
const WorkflowNode = memo(({ data }: NodeProps<FlowNode>) => <BaseNode className="workflow-node" tabIndex={-1}>
  <Handle type="target" position={Position.Left}/><BaseNodeHeader><GitBranch size={15}/><BaseNodeHeaderTitle title={data.title}>{data.title}</BaseNodeHeaderTitle></BaseNodeHeader>
  <BaseNodeContent><span title={data.classType}>{data.classType}</span><span>{data.summary}</span></BaseNodeContent><Handle type="source" position={Position.Right}/>
</BaseNode>);
const nodeTypes = { workflow: WorkflowNode };
export function WorkflowGraph({ binding, locale, selected, select, expanded, onExpand }: {
  binding: Pick<WorkflowBinding, 'apiGraph' | 'inputs' | 'outputs'>; locale: string; selected: string | null; select(id: string): void; expanded?: boolean; onExpand?(): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const topology = useMemo(() => workflowTopology(binding.apiGraph), [binding.apiGraph]);
  const flow = useRef<ReactFlowInstance<FlowNode> | null>(null);
  const [search, setSearch] = useState(''), [list, setList] = useState(false);
  const matches = topology.nodes.filter(node => `${node.title} ${node.classType} ${node.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const locate = (id: string) => { select(id); void flow.current?.fitView({ nodes: [{ id }], padding: .7, maxZoom: 1 }); };
  const nodes: FlowNode[] = topology.nodes.map(node => ({ id: node.id, type: 'workflow', position: node.position, selected: node.id === selected, width: 224, height: 92,
    ariaLabel: node.title, data: { title: node.title, classType: node.classType, summary: `${binding.inputs.filter(item => item.nodeId === node.id).length} ${t('个输入绑定', 'input bindings', '入力設定')} · ${binding.outputs.filter(item => item.nodeId === node.id).length} ${t('个输出', 'outputs', '出力')}` } }));
  return <section className="workflow-graph" aria-label={t('工作流拓扑', 'Workflow topology', 'ワークフロー構造')}>
    <Toolbar aria-label={t('工作流图工具', 'Workflow graph tools', 'グラフツール')}>
      <ToolbarButton size="sm" onClick={() => void flow.current?.zoomOut()} aria-label={t('缩小', 'Zoom out', '縮小')}><Minus/></ToolbarButton>
      <ToolbarButton size="sm" onClick={() => void flow.current?.zoomIn()} aria-label={t('放大', 'Zoom in', '拡大')}><Plus/></ToolbarButton>
      <ToolbarButton size="sm" onClick={() => void flow.current?.fitView({ padding: .2 })}><Focus/>{t('全图', 'Fit all', '全体')}</ToolbarButton>
      <ToolbarButton size="sm" disabled={!selected} onClick={() => selected && locate(selected)}><LocateFixed/>{t('当前节点', 'Current node', '現在のノード')}</ToolbarButton>
      <ToolbarSeparator/><ToolbarButton size="sm" aria-pressed={list} onClick={() => setList(!list)}><List/>{t('节点列表', 'Node list', 'ノード一覧')}</ToolbarButton>
      {onExpand && <ToolbarButton size="sm" onClick={onExpand}>{expanded ? <Minimize2/> : <Expand/>}{expanded ? t('还原窗口', 'Restore window', '元のサイズ') : t('放大窗口', 'Expand window', 'ウィンドウを拡大')}</ToolbarButton>}
    </Toolbar>
    <Input aria-label={t('搜索节点', 'Search nodes', 'ノードを検索')} placeholder={t('搜索节点名称或类型…', 'Search node name or type…', 'ノード名・種類を検索…')} value={search} onChange={e => setSearch(e.target.value)}/>
    {(list || search) && <div className="workflow-node-list">{matches.map(node => <Button key={node.id} aria-pressed={selected === node.id} onClick={() => locate(node.id)}>{node.title}<small>{node.classType}</small></Button>)}{!matches.length && <p>{t('没有匹配的节点', 'No matching nodes', '一致するノードはありません')}</p>}</div>}
    <div className="workflow-canvas" onKeyDownCapture={event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const id = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__node')?.dataset.id;
      if (id) { event.preventDefault(); event.stopPropagation(); select(id); }
    }}>
      <ReactFlow<FlowNode> nodes={nodes} edges={topology.edges.map(edge => ({ ...edge, type: 'smoothstep', label: edge.input, markerEnd: { type: MarkerType.ArrowClosed } }))} nodeTypes={nodeTypes}
        fitView minZoom={.15} maxZoom={2} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
        onInit={instance => { flow.current = instance; }} onNodeClick={(_, node) => select(node.id)}
        ariaLabelConfig={{ 'node.a11yDescription.default': t('按 Enter 或空格查看节点输入。', 'Press Enter or Space to inspect node inputs.', 'Enter またはスペースで入力を確認します。') }}>
        <Background gap={24}/>
      </ReactFlow>
    </div>
  </section>;
}
