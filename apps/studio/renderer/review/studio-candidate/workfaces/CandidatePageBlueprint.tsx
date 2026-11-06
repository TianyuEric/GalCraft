import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import { CircleHelp, Database, Film, Flag, GitBranch, Image, Link2, PanelTop, Pause, Play, Plus, ScanLine, SkipForward, Square, Trash2, Zap } from 'lucide-react';
import { createId, type UIAnimation, type UIInteraction } from '@galcraft/contracts';
import { components, readTemplateDocuments } from '@galcraft/templates';
import { designerPageName } from '../../../authoring/designer-labels.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { CandidateButton, CandidateField, CandidateInput, CandidateNumberField, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateToolbar } from '../components/controls/index.js';
import { editPage } from './page-edit.js';
import { CandidateResourcePreview, type PageResourcePreviewInput } from './page-resource-preview.js';
import {
  addBlueprintNode, blueprintDefaultAnimation, blueprintDefaultDurationMs, blueprintDraftKey, blueprintMaxDurationMs, blueprintNodeSpecs, blueprintPortNames,
  completeBlueprintAnimation, connectBlueprint, createBlueprintDraft, deleteBlueprintNode, disconnectBlueprint,
  pauseBlueprint, restoreBlueprintEdges, reviewBlueprint, updateBlueprintNode, validBlueprintConnection,
  type BlueprintDraft, type BlueprintKind, type BlueprintNode, type BlueprintReviewContext, type BlueprintRun,
} from './page-blueprint-model.js';
import { workfaceError } from './workface-helpers.js';
import '@xyflow/react/dist/style.css';

type GraphNode = Node<{ node: BlueprintNode; detail: string; breakpoint: boolean; active: boolean }, 'candidate-review'>;
const icons = { trigger: Zap, flag: Database, branch: CircleHelp, action: PanelTop, end: Flag, animation: Film, scene: Image };
type EditableKind = Exclude<BlueprintKind, 'trigger'>;
const editableKinds = (Object.keys(blueprintNodeSpecs) as BlueprintKind[]).filter((kind): kind is EditableKind => kind !== 'trigger');
const nodeTitle = (node: BlueprintNode) => node.title.trim() || blueprintNodeSpecs[node.kind].title;
const portValue = (id: string, port: string) => id + '/' + port;

function BlueprintCard({ data, selected }: NodeProps<GraphNode>) {
  const { node, detail, breakpoint, active } = data;
  const Icon = icons[node.kind];
  const kind = blueprintNodeSpecs[node.kind].title;
  const title = nodeTitle(node);
  const renderPorts = (direction: 'inputs' | 'outputs') => blueprintNodeSpecs[node.kind][direction].map((id, index) => {
    const label = blueprintPortNames[id], input = direction === 'inputs';
    return <Handle key={id} id={id} type={input ? 'target' : 'source'} position={input ? Position.Left : Position.Right}
      className={id === 'bool' ? 'candidate-blueprint-data-port' : undefined}
      style={{ top: 42 + index * 18 }} title={label} aria-label={label}/>;
  });
  return <div className="candidate-blueprint-node" data-active={active} data-selected={selected}>
    <div className="candidate-blueprint-node-kind"><Icon size={14} aria-hidden="true"/>{kind}
      {breakpoint && <Pause size={12} aria-label="断点"/>}</div>
    {title !== kind && <strong title={title}>{title}</strong>}
    <small title={detail}>{detail}</small>
    {renderPorts('inputs')}{renderPorts('outputs')}
  </div>;
}
const nodeTypes = { 'candidate-review': BlueprintCard };

function animationPreview(template: ReturnType<typeof readTemplateDocuments>, pageKey: string, node: BlueprintNode): PageResourcePreviewInput | undefined {
  const preview = structuredClone(template);
  const page = preview.pages.find(item => item.key === pageKey);
  if (!page) return;
  const duration = node.durationMs ?? blueprintDefaultDurationMs;
  const selected = node.animationId && node.animationId !== blueprintDefaultAnimation ? preview.animations.find(item => item.id === node.animationId) : undefined;
  if (!selected && node.animationId && node.animationId !== blueprintDefaultAnimation) return;
  let animation: UIAnimation;
  if (selected) {
    const total = selected.segments.reduce((sum, segment) => sum + segment.durationMs, 0);
    animation = { ...selected, segments: selected.segments.map((segment, index) => ({ ...segment,
      durationMs: total > 0 ? segment.durationMs * duration / total : index === selected.segments.length - 1 ? duration : 0 })) };
    preview.animations = preview.animations.map(item => item.id === animation.id ? animation : item);
  } else {
    animation = { id: createId(preview), name: '页面淡入', version: 1, reduced: 'finish',
      segments: [{ durationMs: 0, opacity: 0, easing: { family: 'linear', direction: 'in' } },
        { durationMs: duration, opacity: 1, easing: { family: 'sine', direction: 'out' } }] };
    preview.animations.push(animation);
  }
  page.root.animations.enter = animation.id;
  return { template: preview, page: pageKey, animation: 'enter' };
}

export function CandidatePageBlueprint({ pageKey, selection, versions, active = true, onNavigate }: {
  pageKey: string; selection: string[]; versions: string; active?: boolean; onNavigate?: (id: string) => void;
}) {
  const store = useCandidate();
  const { project, ui } = useCandidateState();
  const template = useMemo(() => readTemplateDocuments(store.host.list()), [store, versions]);
  const page = template.pages.find(item => item.key === pageKey);
  const draftKey = blueprintDraftKey(project.id, page?.id ?? pageKey);
  const [draft, setDraft] = useState(() => store.viewState<BlueprintDraft>(draftKey) ?? createBlueprintDraft());
  const draftRef = useRef(draft);
  const flow = useRef<ReactFlowInstance<GraphNode, Edge> | null>(null);
  const [run, setRun] = useState<BlueprintRun>();
  const [kind, setKind] = useState<EditableKind>('animation');
  const [query, setQuery] = useState('');
  const [output, setOutput] = useState(''), [input, setInput] = useState('');
  const [eventIndex, setEventIndex] = useState('new'), [projected, setProjected] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PageResourcePreviewInput>();
  const component = page && components(page.root).find(item => item.id === selection[0]);
  const interactions = component?.interactions ?? [];
  const locale = store.controller.preferences.locale;
  const context = useMemo<BlueprintReviewContext>(() => ({
    pages: template.pages.map(item => ({ key: item.key, title: template.locales[locale]?.[item.titleKey]
      ?? (!['page.' + item.key, item.key].includes(item.titleKey) ? item.titleKey : designerPageName(item.key, locale, template.locales)) })),
    scenes: project.scenes.map(({ id, name }) => ({ id, name })),
    animations: template.animations.map(({ id, name }) => ({ id, name })),
  }), [template, locale, project.scenes]);
  const selectedNode = draft.nodes.find(node => node.id === draft.selectedId);
  const actions = draft.nodes.filter(node => node.kind === 'action');
  const actionNode = actions.find(node => node.id === projected) ?? actions[0];
  const target = actionNode?.pageKey ?? '';
  const paused = run?.status === 'paused';
  const running = run?.status === 'running';
  const locked = paused || running;
  const match = query.trim() ? draft.nodes.find(node => (nodeTitle(node) + ' ' + blueprintNodeSpecs[node.kind].title).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : undefined;
  const seedFlag = draft.nodes.find(node => node.id === 'flag');
  const resultScene = run?.sceneId && context.scenes.find(scene => scene.id === run.sceneId);
  const animationLabel = (id?: string) => !id || id === blueprintDefaultAnimation ? '页面淡入' : context.animations.find(item => item.id === id)?.name ?? '动画已移除';
  const unavailableAnimation = !!selectedNode?.animationId && selectedNode.animationId !== blueprintDefaultAnimation && !context.animations.some(item => item.id === selectedNode.animationId);
  const unavailableScene = !!selectedNode?.sceneId && !context.scenes.some(item => item.id === selectedNode.sceneId);
  const describe = (node: BlueprintNode) => {
    switch (node.kind) {
      case 'trigger': return component?.name || component?.part || '页面对象未绑定';
      case 'flag': return node.value === false ? '样例值 · 否' : '样例值 · 是';
      case 'branch': return node.value === false ? '等于否' : '等于是';
      case 'animation': return animationLabel(node.animationId) + ' · ' + (node.durationMs ?? blueprintDefaultDurationMs) + ' ms';
      case 'scene': return context.scenes.find(item => item.id === node.sceneId)?.name ?? (node.sceneId ? '场景已移除' : '场景未指定');
      case 'action': return context.pages.find(item => item.key === node.pageKey)?.title ?? '页面未指定';
      case 'end': return '终止当前审核';
    }
  };

  useEffect(() => { setEventIndex('new'); }, [component?.id]);
  useEffect(() => { if (!active) { setRun(undefined); setPreview(undefined); } }, [active]);
  useEffect(() => {
    if (!active || run?.status !== 'running' || !run.animation) return;
    const delay = Math.max(0, run.animation.remainingMs - (Date.now() - run.animation.startedAt));
    const timer = setTimeout(() => setRun(current => current === run ? completeBlueprintAnimation(draft, context, run) : current), delay);
    return () => clearTimeout(timer);
  }, [active, run, draft, context]);

  function commit(next: BlueprintDraft) {
    if (next === draftRef.current) return;
    draftRef.current = next;
    store.rememberViewState(draftKey, next);
    setDraft(next);
  }

  function change(next: BlueprintDraft) {
    if (locked || next === draftRef.current) return;
    commit(next);
    setRun(undefined);
    setMessage('');
  }

  function select(node: BlueprintNode) {
    if (draftRef.current.selectedId !== node.id) commit({ ...draftRef.current, selectedId: node.id });
    if (node.kind === 'action') setProjected(node.id);
  }

  function locate(node: BlueprintNode) {
    select(node);
    void flow.current?.fitView({ nodes: [{ id: node.id }], maxZoom: 1, padding: .7, duration: 120 });
  }

  function add() {
    const next = addBlueprintNode(draftRef.current, kind);
    change(next);
    const id = next.selectedId;
    requestAnimationFrame(() => { void flow.current?.fitView({ nodes: [{ id }], maxZoom: 1, padding: .7 }); });
  }

  function remove(node: BlueprintNode | undefined) {
    if (!node || node.kind === 'trigger' || locked) return;
    change(deleteBlueprintNode(draftRef.current, node.id));
    if (output.startsWith(node.id + '/')) setOutput('');
    if (input.startsWith(node.id + '/')) setInput('');
    setMessage('已删除节点及其关联连线。');
  }

  function connect(connection: Connection) {
    if (locked) return;
    if (!validBlueprintConnection(draftRef.current, connection)) {
      setMessage('请选择不同节点上类型相同的输入和输出端口。');
      return;
    }
    change(connectBlueprint(draftRef.current, connection));
    setMessage('端口已连接。');
  }

  const update = (node: BlueprintNode, patch: Parameters<typeof updateBlueprintNode>[2]) =>
    change(updateBlueprintNode(draftRef.current, node.id, patch));

  async function apply() {
    if (!page || !component || !target || busy || locked) return;
    setBusy(true);
    setMessage('');
    try {
      const latest = readTemplateDocuments(store.host.list());
      const currentPage = latest.pages.find(item => item.id === page.id);
      const current = currentPage && components(currentPage.root).find(item => item.id === component.id);
      if (!current || current.locked || !latest.pages.some(item => item.key === target)
        || JSON.stringify(current.interactions ?? []) !== JSON.stringify(interactions)) throw new Error('组件、事件或目标页已变化。请检查最新配置后重试。');
      const next: UIInteraction[] = structuredClone(interactions);
      const action = { kind: 'open', page: target } as const;
      if (eventIndex === 'new') next.push({ event: 'click', actions: [action] });
      else {
        const interaction = next[Number(eventIndex)];
        if (!interaction) throw new Error('指定的事件已不存在。');
        interaction.actions.push(action);
      }
      await editPage(store, '配置组件交互', [{ kind: 'component.update', pageId: page.id, componentId: component.id, changes: { interactions: next } }]);
      setMessage('已应用到页面事件。可在手工行为中查看，或使用页面历史撤销。');
    } catch (reason) { setMessage(workfaceError(reason)); }
    finally { setBusy(false); }
  }

  const flowNodes: GraphNode[] = draft.nodes.map(node => ({
    id: node.id, type: 'candidate-review', position: node.position, selected: node.id === draft.selectedId, deletable: false,
    ariaLabel: nodeTitle(node), data: { node, detail: describe(node), breakpoint: node.id === draft.breakpointId, active: node.id === run?.at },
  }));
  const flowEdges: Edge[] = draft.edges.map(edge => ({ ...edge,
    className: edge.kind === 'boolean' ? 'candidate-blueprint-data-wire' : undefined,
    animated: running && edge.kind === 'execution' && edge.source === run.at,
  }));
  return <section className="candidate-blueprint candidate-page-blueprint" aria-label="页面行为蓝图">
    <header className="candidate-page-blueprint-header">
      <GitBranch size={16} aria-hidden="true"/><h3>页面行为蓝图</h3>
      <small title={component?.name || component?.part}>{component?.name || component?.part || '页面审核草稿'}</small>
    </header>
    <CandidateToolbar className="candidate-page-blueprint-tools" label="审核运行">
      <CandidateButton variant="primary" disabled={locked} onClick={() => { setMessage(''); setRun(reviewBlueprint(draft, context)); }}><Play size={14}/>运行审核</CandidateButton>
      <CandidateButton disabled={!running} onClick={() => setRun(current => current && pauseBlueprint(current))}><Pause size={14}/>暂停审核</CandidateButton>
      <CandidateButton disabled={!paused} onClick={() => setRun(reviewBlueprint(draft, context, run))}><SkipForward size={14}/>继续检查</CandidateButton>
      <CandidateButton disabled={!run} onClick={() => setRun(undefined)}><Square size={14}/>停止审核</CandidateButton>
      {seedFlag && <CandidateField label="样例布尔值" layout="row"><CandidateSelect density="compact" aria-label="样例布尔值" disabled={locked} value={String(seedFlag.value !== false)} onValueChange={value => update(seedFlag, { value: value === 'true' })}><option value="true">是</option><option value="false">否</option></CandidateSelect></CandidateField>}
    </CandidateToolbar>
    <div className="candidate-page-blueprint-body">
      <div className="candidate-page-blueprint-main">
        <CandidateToolbar className="candidate-blueprint-edit-tools" label="蓝图节点工具">
          <CandidateInput type="search" density="compact" aria-label="搜索蓝图节点" placeholder="搜索节点" value={query} onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && match) locate(match); }}/>
          {query.trim() && <CandidateButton disabled={!match} onClick={() => match && locate(match)}><ScanLine size={14}/>定位</CandidateButton>}
          <CandidateSelect density="compact" aria-label="新增节点类型" disabled={locked} value={kind} onValueChange={value => setKind(value as EditableKind)}>
            {editableKinds.map(item => <option key={item} value={item}>{blueprintNodeSpecs[item].title}</option>)}
          </CandidateSelect>
          <CandidateButton variant="outline" disabled={locked} onClick={add}><Plus size={14}/>添加节点</CandidateButton>
        </CandidateToolbar>
        <div className="candidate-blueprint-flow" onKeyDown={event => {
          if (locked || !['Delete', 'Backspace'].includes(event.key)) return;
          const target = event.target as HTMLElement;
          const node = draft.nodes.find(item => item.id === target.closest<HTMLElement>('.react-flow__node')?.dataset.id);
          const edge = target.closest<HTMLElement>('.react-flow__edge')?.dataset.id;
          if (node && node.kind !== 'trigger') { event.preventDefault(); remove(node); }
          else if (edge) { event.preventDefault(); change(disconnectBlueprint(draftRef.current, edge)); }
        }}>
          <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView minZoom={.25} maxZoom={1.75} deleteKeyCode={null}
            colorMode={ui.theme} onInit={instance => { flow.current = instance; }} nodesConnectable={!locked} nodesDraggable={!locked}
            onNodeClick={(_, item) => select(item.data.node)} onNodesChange={changes => {
              const positions = new Map<string, BlueprintNode['position']>();
              for (const item of changes) {
                if (item.type === 'select' && item.selected) {
                  const node = draftRef.current.nodes.find(node => node.id === item.id);
                  if (node) select(node);
                }
                if (item.type === 'position' && item.position) positions.set(item.id, item.position);
              }
              if (locked || !positions.size) return;
              const current = draftRef.current;
              commit({ ...current, nodes: current.nodes.map(item => {
                const position = positions.get(item.id);
                return position ? { ...item, position } : item;
              }) });
            }}
            isValidConnection={connection => validBlueprintConnection(draftRef.current, connection)} onConnect={connect}>
            <Background gap={16}/><Controls showInteractive={false}/>
          </ReactFlow>
        </div>
      </div>
      <aside className="candidate-blueprint-options" aria-label="蓝图节点属性与审核">
        {selectedNode && <CandidateSection title={blueprintNodeSpecs[selectedNode.kind].title + '属性'}>
          <CandidateField label="节点名称"><CandidateInput value={selectedNode.title} disabled={locked} onChange={event => update(selectedNode, { title: event.target.value })}/></CandidateField>
          {(selectedNode.kind === 'flag' || selectedNode.kind === 'branch') && <CandidateField label={selectedNode.kind === 'flag' ? '布尔值' : '比较值'}><CandidateSelect value={String(selectedNode.value !== false)} disabled={locked} onValueChange={value => update(selectedNode, { value: value === 'true' })}><option value="true">是</option><option value="false">否</option></CandidateSelect></CandidateField>}
          {selectedNode.kind === 'animation' && <>
            <CandidateField label="动画"><CandidateSelect value={selectedNode.animationId ?? blueprintDefaultAnimation} disabled={locked} onValueChange={value => update(selectedNode, { animationId: value })}>
              {unavailableAnimation && <option value={selectedNode.animationId} disabled>动画已移除</option>}
              <option value={blueprintDefaultAnimation}>页面淡入</option>{context.animations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </CandidateSelect></CandidateField>
            <CandidateNumberField key={selectedNode.id} label="动画时长" value={selectedNode.durationMs ?? blueprintDefaultDurationMs} min={0} max={blueprintMaxDurationMs} step={1} unit="ms" locale={locale}
              disabled={locked} onCommit={value => update(selectedNode, { durationMs: value })}/>
            <CandidateButton disabled={locked || !page || unavailableAnimation}
              onClick={() => setPreview(animationPreview(template, pageKey, selectedNode))}>预览动画</CandidateButton>
          </>}
          {selectedNode.kind === 'scene' && <CandidateField label="目标场景"><CandidateSelect value={selectedNode.sceneId ?? ''} disabled={locked} onValueChange={value => update(selectedNode, { sceneId: value })}>
            {unavailableScene && <option value={selectedNode.sceneId} disabled>场景已移除</option>}
            <option value="">选择场景</option>{context.scenes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </CandidateSelect></CandidateField>}
          <CandidateToolbar label="节点操作">
            <CandidateButton disabled={locked} aria-pressed={draft.breakpointId === selectedNode.id}
              onClick={() => change({ ...draftRef.current, breakpointId: draft.breakpointId === selectedNode.id ? '' : selectedNode.id })}><Pause size={14}/>断点</CandidateButton>
            {selectedNode.kind === 'trigger' && <CandidateButton onClick={() => onNavigate?.('page-outline')}><Link2 size={14}/>定位页面对象</CandidateButton>}
            {selectedNode.kind !== 'trigger' && <CandidateButton variant="danger" disabled={locked} onClick={() => remove(selectedNode)}><Trash2 size={14}/>删除节点</CandidateButton>}
          </CandidateToolbar>
        </CandidateSection>}
        {run && <CandidateSection title="审核轨迹">
          <strong role="status">{running ? '执行中 · ' + (draft.nodes.find(node => node.id === run.at)?.title ?? '') : paused ? '已暂停 · ' + (draft.nodes.find(node => node.id === run.at)?.title ?? '') : run.status === 'done' ? '审核完成' : '审核无法继续'}</strong>
          <ol className="candidate-blueprint-trace">{run.trace.map((item, index) => <li key={index}>{item}</li>)}</ol>
          {resultScene && onNavigate && <CandidateButton onClick={() => onNavigate('writing:' + resultScene.id)}>定位目标场景</CandidateButton>}
        </CandidateSection>}
        <CandidateSection title="连接端口" collapsible initiallyOpen={false}>
          <CandidateField label="输出端口"><CandidateSelect aria-label="输出端口" disabled={locked} value={output} onValueChange={setOutput}><option value="">选择输出</option>
            {draft.nodes.flatMap(node => blueprintNodeSpecs[node.kind].outputs.map(port => <option key={portValue(node.id, port)} value={portValue(node.id, port)}>{nodeTitle(node)} · {blueprintPortNames[port]}</option>))}</CandidateSelect></CandidateField>
          <CandidateField label="输入端口"><CandidateSelect aria-label="输入端口" disabled={locked} value={input} onValueChange={setInput}><option value="">选择输入</option>
            {draft.nodes.flatMap(node => blueprintNodeSpecs[node.kind].inputs.map(port => <option key={portValue(node.id, port)} value={portValue(node.id, port)}>{nodeTitle(node)} · {blueprintPortNames[port]}</option>))}</CandidateSelect></CandidateField>
          <CandidateToolbar label="连线操作">
            <CandidateButton disabled={!output || !input || locked} onClick={() => {
              const [source, sourceHandle] = output.split('/'), [destination, targetHandle] = input.split('/');
              if (source && destination) connect({ source, sourceHandle: sourceHandle ?? null, target: destination, targetHandle: targetHandle ?? null });
            }}>连接端口</CandidateButton>
            <CandidateButton disabled={locked} onClick={() => { change(restoreBlueprintEdges(draftRef.current)); setMessage('已恢复仍有对应节点的样例连线。'); }}>恢复样例连线</CandidateButton>
          </CandidateToolbar>
          <ul className="candidate-blueprint-edges" aria-label="已有连线">{draft.edges.map(edge => <li key={edge.id}>
            <CandidateButton disabled={locked} onClick={() => change(disconnectBlueprint(draftRef.current, edge.id))}>
              断开 {nodeTitle(draft.nodes.find(node => node.id === edge.source)!)} · {blueprintPortNames[edge.sourceHandle]}
            </CandidateButton>
          </li>)}</ul>
        </CandidateSection>
        <CandidateSection title="应用到页面事件">
          <p className="candidate-page-hint">{component ? (component.name || component.part) : '先从组件大纲选择要绑定的组件。'}</p>
          <p className="candidate-page-hint">打开页面动作可写入页面事件。动画、场景跳转和连线用于审核。</p>
          {actionNode && <>
            {actions.length > 1 && <CandidateField label="打开页面节点"><CandidateSelect value={actionNode.id} disabled={locked} onValueChange={value => {
              const node = actions.find(item => item.id === value); if (node) select(node);
            }}>{actions.map(node => <option key={node.id} value={node.id}>{nodeTitle(node)}</option>)}</CandidateSelect></CandidateField>}
            <CandidateField label="目标页面"><CandidateSelect aria-label="目标页面" value={target} disabled={locked || busy} onValueChange={value => update(actionNode, { pageKey: value })}><option value="">选择目标页面</option>
              {context.pages.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</CandidateSelect></CandidateField>
            <CandidateField label="页面事件"><CandidateSelect aria-label="页面事件" value={eventIndex} disabled={locked || busy} onValueChange={setEventIndex}><option value="new">添加点击事件</option>
              {interactions.map((item, index) => <option key={index} value={String(index)}>事件 {index + 1} · {item.event}（{item.actions.length} 个动作）</option>)}</CandidateSelect></CandidateField>
            <CandidateButton disabled={!component || component.locked || !target || busy || locked || !context.pages.some(item => item.key === target)} onClick={() => void apply()}>应用到页面事件</CandidateButton>
          </>}
        </CandidateSection>
        {message && <p role="status" className="candidate-page-hint candidate-blueprint-message">{message}</p>}
      </aside>
    </div>
    <CandidateReviewDialog title="预览动画" description="使用页面副本和当前节点时长。" open={!!preview} onDismiss={() => setPreview(undefined)}>
      {preview && <CandidateResourcePreview store={store} input={preview} active={active}/>}
    </CandidateReviewDialog>
  </section>;
}
