import { memo, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { Focus, GitBranch, LocateFixed } from 'lucide-react';
import type { Id } from '@galcraft/contracts';
import type { AuthoringSource } from '../../../authoring/controller.js';
import { sceneGraph, type SceneGraphNode, type SceneRelation } from '../../../authoring/scene-graph-model.js';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from '../../../components/ui/flow-node.js';
import { CandidateButton, CandidateObjectRow, CandidateToolbar } from './controls/index.js';
import '../../../authoring/scene-graph.css';
import '../styles/scene-graph.css';

type SceneNode = Node<SceneGraphNode & {
  active: boolean;
  entryLabel: string;
  partialLabel: string;
  titleEndingLabel: string;
}, 'scene'>;
type RelationEdge = Edge<SceneRelation>;

const GraphNode = memo(({ data }: NodeProps<SceneNode>) => (
  <BaseNode className={`scene-relation-node ${data.active ? 'is-current' : ''} ${data.missing ? 'is-missing' : ''}`} tabIndex={-1}>
    <Handle type="target" position={Position.Left} id="in"/>
    <Handle type="target" position={Position.Top} id="loop"/>
    <BaseNodeHeader><GitBranch size={16} aria-hidden="true"/><BaseNodeHeaderTitle>{data.name}</BaseNodeHeaderTitle></BaseNodeHeader>
    <BaseNodeContent>
      <span className="scene-relation-chapter">{data.chapter || (data.entry ? data.entryLabel : '')}</span>
      {data.partial && <span>{data.partialLabel}</span>}
      {data.returnsToTitle && <span className="scene-relation-ending">{data.titleEndingLabel}</span>}
    </BaseNodeContent>
    <Handle type="source" position={Position.Right} id="out"/>
  </BaseNode>
));
const nodeTypes = { scene: GraphNode };

export function CandidateSceneGraph({ source, activeSceneId, locale, onNavigate }: {
  source: AuthoringSource;
  activeSceneId: Id | null;
  locale: string;
  onNavigate(sceneId: Id, statementId?: Id): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const model = useMemo(() => sceneGraph(source, locale), [source, locale]);
  const nodeById = useMemo(() => new Map(model.nodes.map(node => [node.id, node])), [model]);
  const flow = useRef<ReactFlowInstance<SceneNode, RelationEdge> | null>(null);
  const [showList, setShowList] = useState(false);
  const nodes: SceneNode[] = model.nodes.map(node => ({
    id: node.id, type: 'scene', position: node.position, width: 224, height: 112, ariaLabel: node.name,
    data: {
      ...node, active: node.id === activeSceneId,
      entryLabel: t('作品起点', 'Work entry', '作品の開始地点'),
      partialLabel: t('源码有错误', 'Source has errors', 'ソースにエラーがあります'),
      titleEndingLabel: t('返回标题', 'Return to title', 'タイトルへ戻る'),
    },
  }));
  const edges: RelationEdge[] = model.edges.map(edge => ({
    id: edge.id, source: edge.from, target: edge.to, type: 'smoothstep',
    sourceHandle: 'out', targetHandle: edge.from === edge.to ? 'loop' : 'in',
    label: edge.label, ariaLabel: edge.label, labelBgPadding: [6, 4],
    markerEnd: { type: MarkerType.ArrowClosed }, data: edge,
    style: { strokeDasharray: edge.kind === 'call' ? '6 4' : undefined },
  }));
  const fitAll = t('查看全部', 'Fit all', '全体表示');
  const connections = t('关系列表', 'Connections', '接続一覧');
  const navigateEdge = (relation: SceneRelation) => onNavigate(relation.from, relation.statementId);
  const locate = () => { if (activeSceneId) void flow.current?.fitView({ nodes: [{ id: activeSceneId }], padding: 1.1, maxZoom: 1 }); };

  return <section className="scene-relations candidate-scene-graph" aria-label={t('场景关系图', 'Scene relationships', 'シーン関係図')}>
    <CandidateToolbar className="candidate-workface-tools" label={t('关系图工具', 'Graph tools', '関係図ツール')}>
      <CandidateButton onClick={locate} disabled={!activeSceneId}><LocateFixed size={14} aria-hidden="true"/>{t('当前场景', 'Current scene', '現在のシーン')}</CandidateButton>
      <CandidateButton onClick={() => { void flow.current?.fitView({ padding: .2 }); }}><Focus size={14} aria-hidden="true"/>{fitAll}</CandidateButton>
      <CandidateButton aria-pressed={showList} onClick={() => setShowList(visible => !visible)}>{connections}</CandidateButton>
    </CandidateToolbar>
    <p className="candidate-workface-message">{t('点击场景进入编辑，点击连线定位指令。连线表示脚本引用，虚线表示调用。条件决定实际路线。',
      'Open a scene to edit it or a connection to locate its instruction. Connections show script references and dashed lines are calls. Conditions determine the actual route.',
      'シーンを開くと編集画面へ、接続を開くと命令へ移動します。接続はスクリプト参照、破線は呼び出しです。条件が実際のルートを決定します。')}</p>
    {model.nodes.some(node => node.partial || node.missing) && <p role="status" className="candidate-workface-message scene-relations-warning">{t(
      '部分源码有错误或目标已移除。关系图保留可解析的引用。',
      'Some source is invalid or a target is missing. Parseable references remain visible.',
      '一部のソースにエラー、または移動先の削除があります。解析可能な参照を表示します。')}</p>}
    <div className="scene-relations-canvas" onKeyDownCapture={event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target as HTMLElement;
      const nodeId = target.closest<HTMLElement>('.react-flow__node')?.dataset.id;
      const node = nodeId ? nodeById.get(nodeId) : undefined;
      const edgeId = target.closest<HTMLElement>('.react-flow__edge')?.dataset.id;
      const relation = edgeId ? model.edges.find(edge => edge.id === edgeId) : undefined;
      if ((!node || node.missing) && !relation) return;
      event.preventDefault();
      event.stopPropagation();
      if (relation) navigateEdge(relation);
      else if (node) onNavigate(node.id);
    }}>
      <ReactFlow<SceneNode, RelationEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={.15} maxZoom={2}
        ariaLabelConfig={{
          'node.a11yDescription.default': t('按 Enter 或空格进入场景编辑。', 'Press Enter or Space to edit this scene.', 'Enter またはスペースでシーンを編集します。'),
          'node.a11yDescription.keyboardDisabled': t('按 Enter 或空格进入场景编辑。', 'Press Enter or Space to edit this scene.', 'Enter またはスペースでシーンを編集します。'),
          'edge.a11yDescription.default': t('按 Enter 或空格定位关联指令。', 'Press Enter or Space to locate its instruction.', 'Enter またはスペースで命令へ移動します。'),
          'controls.ariaLabel': t('缩放与定位', 'Zoom and position', 'ズームと位置'),
          'controls.zoomIn.ariaLabel': t('放大', 'Zoom in', '拡大'),
          'controls.zoomOut.ariaLabel': t('缩小', 'Zoom out', '縮小'),
          'controls.fitView.ariaLabel': fitAll,
        }}
        nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
        onInit={instance => { flow.current = instance; }}
        onNodeClick={(_, node) => { if (!node.data.missing) onNavigate(node.id); }}
        onEdgeClick={(_, edge) => { if (edge.data) navigateEdge(edge.data); }}>
        <Background gap={24}/><Controls showInteractive={false}/>
      </ReactFlow>
    </div>
    {showList && <div className="candidate-scene-connections" role="region" aria-label={connections}>
      {model.edges.length ? model.edges.map(edge => {
        const title = `${nodeById.get(edge.from)?.name ?? edge.from} → ${nodeById.get(edge.to)?.name ?? edge.to}`;
        return <CandidateObjectRow key={edge.id} title={title} description={edge.label} activationLabel={`${title} · ${edge.label}`} onActivate={() => navigateEdge(edge)}/>;
      }) : <p className="candidate-workface-message">{t('场景之间尚无跳转或调用。', 'No scene jumps or calls yet.', 'シーン間の移動・呼び出しはまだありません。')}</p>}
    </div>}
  </section>;
}
