import { memo, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { Expand, Focus, GitBranch, LocateFixed, Minimize2 } from 'lucide-react';
import type { Id } from '@galcraft/contracts';
import { Button, Modal } from '../components/controls.js';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from '../components/ui/flow-node.js';
import { Toolbar, ToolbarButton, ToolbarSeparator } from '../components/ui/toolbar.js';
import { exitDialog } from '../components/motion.js';
import type { AuthoringSource } from './controller.js';
import { sceneGraph, type SceneGraphNode } from './scene-graph-model.js';
import './scene-graph.css';

type SceneNode = Node<SceneGraphNode & { active: boolean; entryLabel: string; partialLabel: string; titleEndingLabel: string }, 'scene'>;
const GraphNode = memo(({ data }: NodeProps<SceneNode>) => <BaseNode className={`scene-relation-node ${data.active ? 'is-current' : ''} ${data.missing ? 'is-missing' : ''}`} tabIndex={-1}>
  <Handle type="target" position={Position.Left} id="in"/>
  <Handle type="target" position={Position.Top} id="loop"/>
  <BaseNodeHeader><GitBranch size={16}/><BaseNodeHeaderTitle>{data.name}</BaseNodeHeaderTitle></BaseNodeHeader>
  <BaseNodeContent><span className="scene-relation-chapter">{data.chapter || (data.entry ? data.entryLabel : '')}</span>{data.partial && <span>{data.partialLabel}</span>}{data.returnsToTitle && <span className="scene-relation-ending">{data.titleEndingLabel}</span>}</BaseNodeContent>
  <Handle type="source" position={Position.Right} id="out"/>
</BaseNode>);
const nodeTypes = { scene: GraphNode };

export function SceneGraph({ source, activeSceneId, locale, onNavigate, expanded = false, onExpand }: {
  source: AuthoringSource; activeSceneId: Id | null; locale: string;
  onNavigate(sceneId: Id, statementId?: Id): void; expanded?: boolean; onExpand?(): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const model = useMemo(() => sceneGraph(source, locale), [source, locale]);
  const flow = useRef<ReactFlowInstance<SceneNode> | null>(null);
  const [current, setCurrent] = useState(activeSceneId);
  const [showList, setShowList] = useState(false);
  const nodes: SceneNode[] = model.nodes.map(node => ({ id: node.id, type: 'scene', position: node.position,
    data: { ...node, active: node.id === current, entryLabel: t('作品起点', 'Work entry', '作品の開始地点'), partialLabel: t('源码有错误', 'Source has errors', 'ソースにエラーがあります'), titleEndingLabel: t('返回标题', 'Return to title', 'タイトルへ戻る') },
    ariaLabel: node.name, width: 224, height: 112 }));
  const edges = model.edges.map(edge => ({ id: edge.id, source: edge.from, target: edge.to, type: 'smoothstep',
    sourceHandle: 'out', targetHandle: edge.from === edge.to ? 'loop' : 'in', label: edge.label,
    markerEnd: { type: MarkerType.ArrowClosed }, data: edge,
    style: { strokeDasharray: edge.kind === 'call' ? '6 4' : undefined },
    ariaLabel: edge.label, labelBgPadding: [6, 4] as [number, number] }));
  const locate = () => { if (current) void flow.current?.fitView({ nodes: [{ id: current }], padding: 1.1, maxZoom: 1 }); };
  const partial = model.nodes.some(node => node.partial || node.missing);
  return <section className="scene-relations" aria-label={t('场景关系图', 'Scene relationships', 'シーン関係図')}>
    <Toolbar aria-label={t('关系图工具', 'Graph tools', '関係図ツール')}>
      <ToolbarButton size="sm" onClick={locate} disabled={!current}><LocateFixed/>{t('当前场景', 'Current scene', '現在のシーン')}</ToolbarButton>
      <ToolbarButton size="sm" onClick={() => { void flow.current?.fitView({ padding: .2 }); }}><Focus/>{t('查看全部', 'Fit all', '全体表示')}</ToolbarButton>
      <ToolbarSeparator/>
      <ToolbarButton size="sm" aria-pressed={showList} onClick={() => setShowList(!showList)}>{t('关系列表', 'Connections', '接続一覧')}</ToolbarButton>
      {onExpand && <ToolbarButton size="sm" onClick={onExpand}>{expanded ? <Minimize2/> : <Expand/>}{expanded ? t('还原窗口', 'Restore window', '元のサイズ') : t('放大窗口', 'Expand window', 'ウィンドウを拡大')}</ToolbarButton>}
    </Toolbar>
    <p className="gc-help">{t('点击场景进入编辑，点击连线定位指令。此图展示脚本引用，虚线表示调用。节点的“返回标题”标记表示含有对应结束指令；条件决定实际路线。',
      'Click a scene to edit it or a connection to locate its instruction. Connections show script references; dashed lines are calls. A “Return to title” badge marks a scene containing that ending instruction. Conditions determine the actual route.',
      'シーンをクリックして編集、接続をクリックして命令へ移動します。接続はスクリプト参照、破線は呼び出しです。「タイトルへ戻る」は該当する終了命令を含むシーンを示します。条件が実際のルートを決定します。')}</p>
    {partial && <p role="status" className="scene-relations-warning">{t('部分源码有错误或目标已移除；关系图保留可解析的引用。', 'Some source is invalid or a target is missing. Parseable references remain visible.', '一部のソースにエラー、または移動先の削除があります。解析可能な参照を表示します。')}</p>}
    <div className="scene-relations-canvas" onKeyDownCapture={event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const element = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__node');
      const node = nodes.find(item => item.id === element?.dataset.id);
      if (node && !node.data.missing) {
        event.preventDefault(); event.stopPropagation(); setCurrent(node.id); onNavigate(node.id); return;
      }
      const edgeElement = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__edge');
      const relation = model.edges.find(item => item.id === edgeElement?.dataset.id);
      if (relation) { event.preventDefault(); event.stopPropagation(); onNavigate(relation.from, relation.statementId); }
    }}>
      <ReactFlow<SceneNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={.15} maxZoom={2}
        ariaLabelConfig={{
          'node.a11yDescription.default': t('按 Enter 或空格进入场景编辑。', 'Press Enter or Space to edit this scene.', 'Enter またはスペースでシーンを編集します。'),
          'node.a11yDescription.keyboardDisabled': t('按 Enter 或空格进入场景编辑。', 'Press Enter or Space to edit this scene.', 'Enter またはスペースでシーンを編集します。'),
          'edge.a11yDescription.default': t('按 Enter 或空格定位关联指令。', 'Press Enter or Space to locate its instruction.', 'Enter またはスペースで命令へ移動します。'),
          'controls.ariaLabel': t('缩放与定位', 'Zoom and position', 'ズームと位置'),
          'controls.zoomIn.ariaLabel': t('放大', 'Zoom in', '拡大'),
          'controls.zoomOut.ariaLabel': t('缩小', 'Zoom out', '縮小'),
          'controls.fitView.ariaLabel': t('查看全部', 'Fit all', '全体表示'),
        }}
        nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
        onInit={instance => { flow.current = instance; }}
        onNodeClick={(_, node) => { if (!node.data.missing) { setCurrent(node.id); onNavigate(node.id); } }}
        onEdgeClick={(_, edge) => { const relation = model.edges.find(item => item.id === edge.id); if (relation) onNavigate(relation.from, relation.statementId); }}>
        <Background gap={24}/><Controls showInteractive={false}/>
      </ReactFlow>
    </div>
    {showList && <div className="scene-relations-list">{model.edges.length ? model.edges.map(edge => <Button key={edge.id}
      onClick={() => onNavigate(edge.from, edge.statementId)}>{model.nodes.find(node => node.id === edge.from)?.name} → {model.nodes.find(node => node.id === edge.to)?.name} · {edge.label}</Button>) :
      <p>{t('场景之间尚无跳转或调用。', 'No scene jumps or calls yet.', 'シーン間の移動・呼び出しはまだありません。')}</p>}</div>}
  </section>;
}

export function mountSceneGraphDialog(options: { source: AuthoringSource; activeSceneId: Id | null; locale: string; onNavigate(sceneId: Id, statementId?: Id): void | Promise<void> }) {
  const origin = document.activeElement as HTMLElement | null;
  const node = document.createElement('div'); (document.getElementById('studio-portals') ?? document.body).append(node);
  const root = createRoot(node); let closing = false, disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; root.unmount(); node.remove(); if (origin?.isConnected) origin.focus({ preventScroll: true }); };
  const close = async () => { if (closing) return; closing = true; await exitDialog(node.querySelector('[data-slot="dialog-content"]')); dispose(); };
  function GraphDialog() {
    const [expanded, setExpanded] = useState(false);
    return <Modal title={options.locale === 'en' ? 'Scene relationships' : options.locale === 'ja' ? 'シーン関係図' : '场景关系图'}
      size={expanded ? 'full' : 'wide'} className="scene-relations-dialog" close={() => { void close(); }}>
      <SceneGraph {...options} expanded={expanded} onExpand={() => setExpanded(!expanded)} onNavigate={(sceneId, statementId) => {
        void Promise.resolve(options.onNavigate(sceneId, statementId)).then(close);
      }}/>
    </Modal>;
  }
  root.render(<GraphDialog/>); return { dispose };
}
