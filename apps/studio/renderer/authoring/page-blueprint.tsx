import { useEffect, useMemo, useRef, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, useUpdateNodeInternals, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { Clock3, GitBranch, Play, Sparkles, Workflow } from 'lucide-react';
import { createId, UIEventSchema, type BlueprintNode, type BlueprintOutcome, type Id, type Json, type PageBlueprint, type UIInteraction } from '@galcraft/contracts';
import type { BlueprintRunResult, BlueprintStep } from '@galcraft/player-ui';
import { blueprintOutcomes, type BlueprintDiagnostic } from '@galcraft/templates';
import { Button } from '../components/controls.js';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from '../components/ui/flow-node.js';
import { actionEditor, conditionEditor, type PageFieldContext } from './page-data-fields.js';
import './page-blueprint.css';

export type BlueprintDraft = { pageId: Id; componentId: Id; bindingId: Id; event: UIInteraction['event']; graph: PageBlueprint };
type DebugState = { steps: BlueprintStep[]; paused?: Id; result?: BlueprintRunResult; revision?: number };
type BlueprintViewProps = {
  page: string; component: string; pageId: Id; componentId: Id; bindings: UIInteraction[]; context: PageFieldContext;
  animations: { id: Id; name: string }[]; drafts: BlueprintDraft[]; selected?: Id;
  conversionProblem(index: number): string | undefined;
  diagnostics(graph: PageBlueprint): BlueprintDiagnostic[];
  instances: { key: string; label: string }[];
  onSelect(id: Id): void; onNew(event: UIInteraction['event']): void;
  onDraft(draft: BlueprintDraft): void; onDiscard(id: Id): void;
  onConvert(index: number, binding: UIInteraction): Promise<void>;
  onApply(draft: BlueprintDraft): Promise<void>;
  onRun(bindingId: Id, draft: BlueprintDraft | undefined, options: {
    signal: AbortSignal; instance?: string; event?: { value: Json; checked: boolean };
    beforeNode(node: BlueprintNode, revision: number | null): void | Promise<void>; onStep(step: BlueprintStep): void;
  }): Promise<BlueprintRunResult>;
  onLocate(): void;
};
type GraphNode = Node<{
  label: string; detail: string; kind: BlueprintNode['kind']; paused: boolean; breakpoint: boolean;
  outcomes: { value: BlueprintOutcome; label: string }[];
  incoming: string[];
}, 'behavior'>;
const nodeIcons = { condition: GitBranch, action: Workflow, wait: Clock3, animation: Sparkles };
const nodeWidth = 184, nodeHeight = 82, portGap = 18;
const outcomes = ['success', 'unmet', 'failure'] as const;
const outcomeColor: Record<BlueprintOutcome, string> = { success: 'var(--primary)', unmet: 'var(--muted-foreground)', failure: 'var(--destructive)' };
const sourcePortTop = (index: number) => 25 + index * portGap;
const BehaviorNode = ({ id, data }: NodeProps<GraphNode>) => {
  const Icon = nodeIcons[data.kind];
  const updateNodeInternals = useUpdateNodeInternals();
  const outcomeOrder = data.outcomes.map(outcome => outcome.value).join(',');
  useEffect(() => { updateNodeInternals(id); }, [data.incoming, outcomeOrder, id, updateNodeInternals]);
  const spacing = Math.min(portGap, 54 / Math.max(1, data.incoming.length - 1));
  return <BaseNode className="gc-blueprint-node" tabIndex={-1} data-paused={data.paused} data-breakpoint={data.breakpoint}>
    {data.incoming.length ? data.incoming.map((edgeId, index) =>
      <Handle key={edgeId} id={edgeId} type="target" position={Position.Left}
        style={{ top: nodeHeight / 2 + (index - (data.incoming.length - 1) / 2) * spacing }}/>)
      : <Handle type="target" position={Position.Left}/>}
    <BaseNodeHeader><Icon size={15}/><BaseNodeHeaderTitle>{data.label}</BaseNodeHeaderTitle>{data.breakpoint && <span className="gc-blueprint-node-marker"/>}</BaseNodeHeader>
    <BaseNodeContent>{data.detail}</BaseNodeContent>
    {data.outcomes.map((outcome, index) => <Handle key={outcome.value} id={outcome.value} aria-label={outcome.label}
      title={outcome.label} type="source" position={Position.Right} style={{ top: sourcePortTop(index) }} data-outcome={outcome.value}/>)}
  </BaseNode>;
};
const nodeTypes = { behavior: BehaviorNode };

function graphLayout(graph: PageBlueprint) {
  const layout = new dagre.graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}))
    .setGraph({ rankdir: 'LR', ranksep: 136, nodesep: 44 });
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  for (const node of graph.nodes) layout.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  const links = graph.edges.filter(edge => byId.has(edge.from) && byId.has(edge.to))
    .sort((left, right) => outcomes.indexOf(left.outcome) - outcomes.indexOf(right.outcome));
  for (const edge of links) layout.setEdge(edge.from, edge.to, {}, edge.id);
  dagre.layout(layout);
  const positions = new Map(graph.nodes.map(node => {
    const { x, y } = layout.node(node.id);
    return [node.id, { x: x - nodeWidth / 2, y: y - nodeHeight / 2 }] as const;
  }));
  const outputs = new Map(graph.nodes.map(node => {
    const targets = new Map(links.filter(edge => edge.from === node.id)
      .map(edge => [edge.outcome, positions.get(edge.to)!.y]));
    return [node.id, [...blueprintOutcomes(node)].sort((left, right) => {
      const leftY = targets.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightY = targets.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftY - rightY || outcomes.indexOf(left) - outcomes.indexOf(right);
    })] as const;
  }));
  const startY = (edge: PageBlueprint['edges'][number]) => positions.get(edge.from)!.y
    + sourcePortTop(outputs.get(edge.from)!.indexOf(edge.outcome));
  const incoming = new Map(graph.nodes.map(node => [
    node.id, links.filter(edge => edge.to === node.id).sort((left, right) => startY(left) - startY(right)).map(edge => edge.id),
  ]));
  return { positions, incoming, outputs };
}

function NodeFields({ node, graph, context, animations, onNode, onGraph, label, outcomeLabel, disabled }: {
  node: BlueprintNode; graph: PageBlueprint; context: PageFieldContext; animations: BlueprintViewProps['animations'];
  onNode(node: BlueprintNode): void; onGraph(graph: PageBlueprint): void; label(node: BlueprintNode): string;
  outcomeLabel(value: BlueprintOutcome): string; disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onNode, context }); callbacks.current = { onNode, context };
  const { t } = context;
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.replaceChildren();
    if (node.kind === 'condition') conditionEditor(root, structuredClone(node.condition), callbacks.current.context,
      condition => callbacks.current.onNode({ ...node, condition: condition ?? { op: 'truthy', value: { source: 'literal', value: true } } }));
    if (node.kind === 'action') actionEditor(root, node.action, callbacks.current.context, action => callbacks.current.onNode({ ...node, action }));
  }, [node.id, node.kind, graph.revision]);
  return <fieldset className="gc-blueprint-fields designer-data-fields" disabled={disabled}>
    <legend>{label(node)}</legend>
    <div ref={host}/>
    {node.kind === 'wait' && <label>{t('等待毫秒数', 'Wait in milliseconds', '待機時間（ミリ秒）')}
      <input type="number" min={0} max={30000} value={node.milliseconds} onChange={event => onNode({ ...node, milliseconds: Number(event.target.value) })}/></label>}
    {node.kind === 'animation' && <label>{t('界面动画', 'Interface animation', 'UIアニメーション')}
      <select value={node.animationId} onChange={event => onNode({ ...node, animationId: event.target.value })}>
        <option value="">{t('选择动画', 'Choose an animation', 'アニメーションを選択')}</option>
        {animations.map(animation => <option key={animation.id} value={animation.id}>{animation.name}</option>)}
      </select></label>}
    <div className="gc-blueprint-branches">
      {blueprintOutcomes(node).map(outcome => {
        const edge = graph.edges.find(item => item.from === node.id && item.outcome === outcome);
        return <label key={outcome}>{outcomeLabel(outcome)}
          <select value={edge?.to ?? ''} onChange={event => {
            const next = event.target.value;
            const edges = graph.edges.filter(item => item !== edge);
            if (next) edges.push({ id: edge?.id ?? createId(graph), from: node.id, outcome, to: next });
            onGraph({ ...graph, edges });
          }}>
            <option value="">{t('结束此分支', 'End this branch', 'この分岐を終了')}</option>
            {graph.nodes.filter(other => other.id !== node.id).map(other => <option key={other.id} value={other.id}>{label(other)} · {other.id}</option>)}
          </select>
        </label>;
      })}
    </div>
  </fieldset>;
}

export function PageBlueprintEditor(props: BlueprintViewProps) {
  const { t } = props.context;
  const [event, setEvent] = useState<UIInteraction['event']>('click');
  const [nodeId, setNodeId] = useState<Id>();
  const [instance, setInstance] = useState('');
  const [eventValue, setEventValue] = useState('');
  const [breakpoints, setBreakpoints] = useState<Id[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState<DebugState>({ steps: [] });
  const control = useRef<{ abort: AbortController; release?: () => void; step: boolean } | null>(null);
  useEffect(() => () => control.current?.abort.abort(), []);
  const draft = props.drafts.find(item => item.bindingId === props.selected);
  const binding = props.bindings.find(item => item.id === props.selected && item.blueprint);
  const graph = draft?.graph ?? binding?.blueprint;
  const inputEvent = ['change', 'input', 'submit'].includes(draft?.event ?? binding?.event ?? '');
  const diagnostics = draft ? props.diagnostics(draft.graph) : [];
  const layout = useMemo(() => graph && graphLayout(graph), [graph]);
  const picked = graph?.nodes.find(node => node.id === nodeId) ?? graph?.nodes.find(node => node.id === graph.entry);
  const eventLabel = (value: UIInteraction['event']) => ({ click: t('点击', 'Click', 'クリック'), change: t('值改变', 'Change', '値の変更'), input: t('输入', 'Input', '入力'), submit: t('提交', 'Submit', '送信'), focus: t('获得焦点', 'Focus', 'フォーカス'), blur: t('失去焦点', 'Blur', 'フォーカス解除'), pointerEnter: t('指针进入', 'Pointer enter', 'ポインター進入'), pointerLeave: t('指针离开', 'Pointer leave', 'ポインター退出') })[value];
  const kindLabel = (kind: BlueprintNode['kind']) => ({ condition: t('条件', 'Condition', '条件'), action: t('动作', 'Action', 'アクション'), wait: t('等待', 'Wait', '待機'), animation: t('播放动画', 'Play animation', 'アニメーション再生') })[kind];
  const label = (node: BlueprintNode) => `${kindLabel(node.kind)}${graph?.entry === node.id ? ` · ${t('入口', 'Entry', '開始')}` : ''}`;
  const outcomeLabel = (outcome: BlueprintOutcome) => ({ success: t('成功', 'Success', '成功'), unmet: t('条件不满足', 'Unmet', '条件不成立'), failure: t('失败', 'Failure', '失敗') })[outcome];
  const onGraph = (next: PageBlueprint) => {
    if (draft) props.onDraft({ ...draft, graph: next });
    else if (binding?.id) props.onDraft({ pageId: props.pageId, componentId: props.componentId, bindingId: binding.id, event: binding.event, graph: next });
  };
  const connect = ({ source, sourceHandle, target }: Connection) => {
    if (!graph || !sourceHandle || !outcomes.includes(sourceHandle as BlueprintOutcome)) return;
    const outcome = sourceHandle as BlueprintOutcome;
    const previous = graph.edges.find(edge => edge.from === source && edge.outcome === outcome);
    onGraph({ ...graph, edges: [...graph.edges.filter(edge => edge !== previous), { id: previous?.id ?? createId(graph), from: source, to: target, outcome }] });
  };
  const addNode = (kind: BlueprintNode['kind']) => {
    if (!graph) return;
    const id = createId(graph);
    const node: BlueprintNode = kind === 'condition' ? { id, kind, condition: { op: 'truthy', value: { source: 'literal', value: true } } }
      : kind === 'action' ? { id, kind, action: { kind: 'open', page: props.context.pages[0]?.value ?? 'title' } }
        : kind === 'wait' ? { id, kind, milliseconds: 250 } : { id, kind, animationId: props.animations[0]?.id ?? '' };
    onGraph({ ...graph, entry: graph.entry || id, nodes: [...graph.nodes, node] });
    setNodeId(id);
  };
  const perform = async (run: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await run(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const run = () => {
    if (!props.selected) return;
    const session = { abort: new AbortController(), step: false } as NonNullable<typeof control.current>;
    control.current = session;
    setDebug({ steps: [] });
    void perform(async () => {
      try {
        let value: Json = eventValue;
        if (eventValue) { try { value = JSON.parse(eventValue) as Json; } catch { /* Plain text is valid input. */ } }
        const result = await props.onRun(props.selected!, draft, {
          signal: session.abort.signal, instance: instance || undefined, event: inputEvent ? { value, checked: Boolean(value) } : undefined,
          beforeNode: (node, revision) => {
            if (!session.step && !breakpoints.includes(node.id)) return;
            setNodeId(node.id);
            setDebug(current => ({ ...current, paused: node.id, revision: revision ?? undefined }));
            return new Promise<void>(resolve => {
              session.release = () => { session.abort.signal.removeEventListener('abort', session.release!); session.release = undefined; resolve(); };
              session.abort.signal.addEventListener('abort', session.release, { once: true });
            });
          },
          onStep: step => setDebug(current => ({ ...current, paused: undefined, steps: [...current.steps, step] })),
        });
        if (control.current === session) setDebug({ steps: result.steps, result, revision: result.revision ?? undefined });
      } finally { if (control.current === session) control.current = null; }
    });
  };
  const resume = (step: boolean) => { if (!control.current) return; control.current.step = step; control.current.release?.(); setDebug(current => ({ ...current, paused: undefined })); };
  const nodes: GraphNode[] = graph?.nodes.map(node => ({ id: node.id, type: 'behavior', position: layout!.positions.get(node.id)!, width: nodeWidth, height: nodeHeight,
    selected: node.id === picked?.id, ariaLabel: label(node), data: { kind: node.kind, label: label(node),
      detail: node.kind === 'condition' ? node.condition.op : node.kind === 'action' ? node.action.kind === 'official' ? node.action.action.kind : node.action.kind
        : node.kind === 'wait' ? `${node.milliseconds} ms` : props.animations.find(item => item.id === node.animationId)?.name ?? node.animationId,
      paused: debug.paused === node.id, breakpoint: breakpoints.includes(node.id), incoming: layout!.incoming.get(node.id)!,
      outcomes: layout!.outputs.get(node.id)!.map(value => ({ value, label: outcomeLabel(value) })) } })) ?? [];
  const edges: Edge[] = graph?.edges.map(edge => {
    const traversed = debug.steps.some(step => step.nodeId === edge.from && step.nextNodeId === edge.to && step.outcome === edge.outcome);
    const color = outcomeColor[edge.outcome];
    return {
      id: edge.id, source: edge.from, target: edge.to, sourceHandle: edge.outcome, targetHandle: edge.id,
      label: outcomeLabel(edge.outcome), markerEnd: { type: MarkerType.ArrowClosed, color }, type: 'default',
      className: `gc-blueprint-edge gc-blueprint-edge-${edge.outcome}${traversed ? ' is-traversed' : ''}`,
      style: { stroke: color }, labelStyle: { fill: 'var(--foreground)' }, labelBgStyle: { fill: 'var(--workbench-inspector)' },
      labelBgPadding: [4, 2],
    };
  }) ?? [];
  return <section className="gc-page-blueprint" aria-label={t('页面行为蓝图', 'Page behavior blueprint', 'ページ動作ブループリント')}>
    <header className="gc-blueprint-header"><div><strong>{props.page}</strong><span title={props.component}>{props.component}</span></div>
      <Button tone="quiet" onClick={props.onLocate}>{t('定位画布组件', 'Locate component on canvas', 'キャンバスで部品を表示')}</Button></header>
    <div className="gc-blueprint-bindings">
      {props.bindings.map((item, index) => item.blueprint && item.id ? <Button key={item.id} tone="quiet" aria-pressed={item.id === props.selected} disabled={busy}
        onClick={() => { props.onSelect(item.id!); setNodeId(undefined); setDebug({ steps: [] }); }}>{eventLabel(item.event)} · {index + 1}</Button>
        : <Button key={index} tone="quiet" disabled={busy} onClick={() => {
          const problem = props.conversionProblem(index);
          if (problem) { setMessage(problem); return; }
          void perform(() => props.onConvert(index, item));
        }}>{t('转为蓝图', 'Convert to blueprint', 'ブループリントへ変換')} · {eventLabel(item.event)} {index + 1}</Button>)}
      {props.drafts.filter(item => item.graph.revision === 0).map(item => <Button key={item.bindingId} tone="quiet" disabled={busy} aria-pressed={item.bindingId === props.selected}
        onClick={() => props.onSelect(item.bindingId)}>{eventLabel(item.event)} · {t('新草稿', 'New draft', '新しい下書き')}</Button>)}
      <label><span>{t('新事件', 'New event', '新しいイベント')}</span><select value={event} disabled={busy} onChange={value => setEvent(value.target.value as typeof event)}>
        {UIEventSchema.options.map(value => <option value={value} key={value}>{eventLabel(value)}</option>)}
      </select></label>
      <Button tone="quiet" disabled={busy} onClick={() => props.onNew(event)}>{t('新建蓝图', 'New blueprint', 'ブループリントを作成')}</Button>
    </div>
    {graph && <>
      <div className="gc-blueprint-toolbar" role="group" aria-label={t('蓝图工具', 'Blueprint tools', 'ブループリントツール')}>
        {(['condition', 'action', 'wait', 'animation'] as const).map(kind => <Button key={kind} disabled={busy || graph.nodes.length >= 100} tone="quiet"
          onClick={() => addNode(kind)}>{t('添加', 'Add ', '追加：')}{kindLabel(kind)}</Button>)}
        <Button disabled={!draft || busy || !graph.nodes.length} onClick={() => draft && void perform(() => props.onApply(draft))}>{t('应用蓝图', 'Apply blueprint', 'ブループリントを適用')}</Button>
        {draft && <Button tone="quiet" disabled={busy} onClick={() => props.onDiscard(draft.bindingId)}>{t('放弃草稿', 'Discard draft', '下書きを破棄')}</Button>}
        <span>{draft ? t('未应用草稿', 'Unapplied draft', '未適用の下書き') : `${t('已应用', 'Applied', '適用済み')} · r${graph.revision}`}</span>
      </div>
      {draft && graph.nodes.length > 0 && diagnostics.length > 0 && <ul className="gc-blueprint-diagnostics" aria-label={t('蓝图校验', 'Blueprint validation', 'ブループリントの検証')}>
        {diagnostics.map((issue, index) => <li key={`${issue.code}:${index}`}>{issue.nodeId ? <button type="button" onClick={() => setNodeId(issue.nodeId)}>{issue.message}</button> : issue.message}</li>)}
      </ul>}
      <div className="gc-blueprint-canvas" onKeyDownCapture={event => {
        if (!['Enter', ' '].includes(event.key)) return;
        const id = (event.target as HTMLElement).closest<HTMLElement>('.react-flow__node')?.dataset.id;
        if (id) { event.preventDefault(); setNodeId(id); }
      }}>
        <ReactFlow<GraphNode> key={props.selected} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .22, maxZoom: 1 }}
          nodesDraggable={false} nodesConnectable={!busy} edgesReconnectable={false} deleteKeyCode={null} minZoom={.2}
          onNodeClick={(_event, node) => setNodeId(node.id)} onConnect={connect}>
          <Background gap={22}/><Controls showInteractive={false}/>
        </ReactFlow>
        {!nodes.length && <p className="gc-blueprint-empty">{t('添加一个节点作为流程入口。','Add a node to start the flow.','開始ノードを追加してください。')}</p>}
      </div>
      {picked && <div className="gc-blueprint-properties">
        <div className="gc-blueprint-toolbar">
          <Button tone="quiet" disabled={busy || picked.id === graph.entry} onClick={() => onGraph({ ...graph, entry: picked.id })}>{t('设为入口', 'Set entry', '開始ノードに設定')}</Button>
          <Button tone="quiet" disabled={busy} aria-pressed={breakpoints.includes(picked.id)} onClick={() => setBreakpoints(current => current.includes(picked.id) ? current.filter(id => id !== picked.id) : [...current, picked.id])}>{t('断点', 'Breakpoint', 'ブレークポイント')}</Button>
          <Button tone="quiet" disabled={busy} onClick={() => {
            const nodes = graph.nodes.filter(node => node.id !== picked.id);
            onGraph({ ...graph, entry: graph.entry === picked.id ? nodes[0]?.id ?? '' : graph.entry, nodes, edges: graph.edges.filter(edge => edge.from !== picked.id && edge.to !== picked.id) });
          }}>{t('删除节点', 'Remove node', 'ノードを削除')}</Button>
        </div>
        <NodeFields key={props.selected} node={picked} graph={graph} context={props.context} animations={props.animations} label={label} outcomeLabel={outcomeLabel} disabled={busy}
          onGraph={onGraph} onNode={node => onGraph({ ...graph, nodes: graph.nodes.map(item => item.id === node.id ? node : item) })}/>
      </div>}
      <section className="gc-blueprint-debug" aria-label={t('蓝图调试', 'Blueprint debugging', 'ブループリントのデバッグ')}>
        <div className="gc-blueprint-toolbar">
          {props.instances.length > 1 && <label>{t('重复项', 'Repeated item', '繰り返し項目')} <select value={instance} disabled={busy} onChange={event => setInstance(event.target.value)}>
            <option value="">{t('选择实例', 'Choose an instance', 'インスタンスを選択')}</option>
            {props.instances.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select></label>}
          {inputEvent && <label>{t('事件输入', 'Event value', 'イベント値')} <input value={eventValue} disabled={busy} onChange={event => setEventValue(event.target.value)}/></label>}
          <Button tone="quiet" disabled={busy || !graph.nodes.length || props.instances.length > 1 && !props.instances.some(item => item.key === instance)} onClick={run}><Play size={14}/>{draft ? t('试跑有效草稿', 'Run validated draft', '検証した下書きを実行') : t('调试已应用版本', 'Debug applied graph', '適用済みグラフをデバッグ')}</Button>
          {control.current && <Button tone="quiet" onClick={() => control.current?.abort.abort()}>{t('停止', 'Stop', '停止')}</Button>}
          {debug.paused && <><Button tone="quiet" onClick={() => resume(true)}>{t('单步', 'Step', 'ステップ')}</Button><Button tone="quiet" onClick={() => resume(false)}>{t('继续', 'Resume', '再開')}</Button></>}
        </div>
        {(debug.result || debug.paused) && <p role="status">{debug.paused ? t('已暂停', 'Paused', '一時停止') : debug.result?.status} · r{debug.revision}{debug.result?.issue && ` · ${debug.result.issue.message}`}</p>}
        {!!debug.steps.length && <ol>{debug.steps.map((step, index) => <li key={`${index}:${step.nodeId}`}>
          <button type="button" onClick={() => setNodeId(step.nodeId)}>{step.nodeId} · {outcomeLabel(step.outcome)}{step.value !== undefined ? ` · ${JSON.stringify(step.value)}` : ''}{step.issue ? ` · ${step.issue.message}` : ''}</button>
        </li>)}</ol>}
      </section>
    </>}
    {!graph && <p className="gc-blueprint-empty">{t('选择已有事件、转换旧绑定，或为当前组件新建蓝图。', 'Select an event, convert a legacy binding, or create a blueprint for this component.', 'イベントを選択するか、既存のバインディングを変換するか、部品のブループリントを作成してください。')}</p>}
    {message && <p className="gc-blueprint-message" role="alert">{message}</p>}
  </section>;
}
