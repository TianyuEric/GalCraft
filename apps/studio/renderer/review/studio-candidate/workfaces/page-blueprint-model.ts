import { createId } from '@galcraft/contracts';

export const blueprintNodeSpecs = {
  trigger: { title: '点击事件', inputs: [], outputs: ['out'] },
  flag: { title: '样例布尔值', inputs: [], outputs: ['bool'] },
  branch: { title: '布尔条件', inputs: ['in', 'bool'], outputs: ['yes', 'no'] },
  action: { title: '打开页面', inputs: ['in'], outputs: ['out'] },
  end: { title: '审核结束', inputs: ['in'], outputs: [] },
  animation: { title: '播放动画', inputs: ['in'], outputs: ['out'] },
  scene: { title: '进入场景', inputs: ['in'], outputs: [] },
} as const;
export const blueprintPortNames: Record<string, string> = { in: '执行输入', out: '执行输出', bool: '布尔值', yes: '是', no: '否' };
export const blueprintDefaultAnimation = 'candidate-page-fade';
export const blueprintDefaultDurationMs = 400;
export const blueprintMaxDurationMs = 10_000;

export type BlueprintKind = keyof typeof blueprintNodeSpecs;
export type BlueprintNode = {
  id: string; kind: BlueprintKind; title: string; position: { x: number; y: number };
  value?: boolean; pageKey?: string; animationId?: string; durationMs?: number; sceneId?: string;
};
export type BlueprintConnection = { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null };
export type BlueprintEdge = { id: string; source: string; sourceHandle: string; target: string; targetHandle: string; kind: 'execution' | 'boolean' };
export type BlueprintDraft = { nodes: BlueprintNode[]; edges: BlueprintEdge[]; selectedId: string; breakpointId: string };
export type BlueprintReviewContext = {
  pages: readonly { key: string; title: string }[];
  scenes: readonly { id: string; name: string }[];
  animations: readonly { id: string; name: string }[];
};
type BlueprintProgress = { at: string; visited: string[]; trace: string[] };
export type BlueprintRun = BlueprintProgress & {
  status: 'running' | 'paused' | 'done' | 'error';
  animation?: { id: string; durationMs: number; remainingMs: number; startedAt: number };
  sceneId?: string;
};

const ports = (node: BlueprintNode, direction: 'inputs' | 'outputs'): readonly string[] => blueprintNodeSpecs[node.kind][direction];
const wire = (source: string, sourceHandle: string, target: string, targetHandle: string): BlueprintEdge => ({
  id: [source, sourceHandle, target, targetHandle].join('/'), source, sourceHandle, target, targetHandle,
  kind: sourceHandle === 'bool' ? 'boolean' : 'execution',
});
const sampleEdges = () => [wire('trigger', 'out', 'branch', 'in'), wire('flag', 'bool', 'branch', 'bool'), wire('branch', 'yes', 'yes', 'in'), wire('branch', 'no', 'no', 'in')];

export const blueprintDraftKey = (projectId: string, pageId: string) => `blueprint:${projectId}/${pageId}`;
export function createBlueprintDraft(): BlueprintDraft {
  return {
    nodes: [
      { id: 'trigger', kind: 'trigger', title: '点击事件', position: { x: 0, y: 0 } },
      { id: 'flag', kind: 'flag', title: '样例布尔值', position: { x: 0, y: 125 }, value: true },
      { id: 'branch', kind: 'branch', title: '检查布尔值', position: { x: 195, y: 0 }, value: true },
      { id: 'yes', kind: 'action', title: '是 · 打开页面', position: { x: 400, y: 0 } },
      { id: 'no', kind: 'end', title: '否 · 结束审核', position: { x: 400, y: 125 } },
    ],
    edges: sampleEdges(), selectedId: 'branch', breakpointId: '',
  };
}

export function addBlueprintNode(draft: BlueprintDraft, kind: Exclude<BlueprintKind, 'trigger'>): BlueprintDraft {
  const columns = [0, 195, 400];
  let position = { x: 0, y: 0 };
  for (let index = 0; ; index++) {
    position = { x: columns[index % columns.length]!, y: Math.floor(index / columns.length) * 125 };
    if (!draft.nodes.some(item => Math.abs(item.position.x - position.x) < 150 && Math.abs(item.position.y - position.y) < 100)) break;
  }
  const node: BlueprintNode = { id: createId(draft.nodes), kind, title: blueprintNodeSpecs[kind].title, position };
  if (kind === 'flag' || kind === 'branch') node.value = true;
  if (kind === 'animation') { node.animationId = blueprintDefaultAnimation; node.durationMs = blueprintDefaultDurationMs; }
  return { ...draft, nodes: [...draft.nodes, node], selectedId: node.id };
}

export function deleteBlueprintNode(draft: BlueprintDraft, id: string): BlueprintDraft {
  const node = draft.nodes.find(item => item.id === id);
  if (!node || node.kind === 'trigger') return draft;
  return {
    nodes: draft.nodes.filter(item => item.id !== id),
    edges: draft.edges.filter(edge => edge.source !== id && edge.target !== id),
    selectedId: draft.selectedId === id ? draft.nodes.find(item => item.kind === 'trigger')?.id ?? '' : draft.selectedId,
    breakpointId: draft.breakpointId === id ? '' : draft.breakpointId,
  };
}

export function updateBlueprintNode(draft: BlueprintDraft, id: string, patch: Partial<Omit<BlueprintNode, 'id' | 'kind'>>): BlueprintDraft {
  const { durationMs } = patch;
  if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > blueprintMaxDurationMs)) return draft;
  return { ...draft, nodes: draft.nodes.map(item => item.id === id ? { ...item, ...patch } : item) };
}

export function validBlueprintConnection(draft: BlueprintDraft, { source, sourceHandle, target, targetHandle }: BlueprintConnection): boolean {
  const from = draft.nodes.find(item => item.id === source), to = draft.nodes.find(item => item.id === target);
  return !!(from && to && from !== to && sourceHandle && targetHandle && ports(from, 'outputs').includes(sourceHandle)
    && ports(to, 'inputs').includes(targetHandle) && (sourceHandle === 'bool') === (targetHandle === 'bool'));
}

export function connectBlueprint(draft: BlueprintDraft, connection: BlueprintConnection): BlueprintDraft {
  const { source, sourceHandle, target, targetHandle } = connection;
  if (!sourceHandle || !targetHandle || !validBlueprintConnection(draft, connection)) return draft;
  const edges = draft.edges.filter(edge => !(edge.source === source && edge.sourceHandle === sourceHandle)
    && !(targetHandle === 'bool' && edge.target === target && edge.targetHandle === targetHandle));
  return { ...draft, edges: [...edges, wire(source, sourceHandle, target, targetHandle)] };
}

export function disconnectBlueprint(draft: BlueprintDraft, edgeId: string): BlueprintDraft {
  return { ...draft, edges: draft.edges.filter(edge => edge.id !== edgeId) };
}

export function restoreBlueprintEdges(draft: BlueprintDraft): BlueprintDraft {
  return sampleEdges().reduce((next, edge) => connectBlueprint(next, edge), draft);
}

const animationName = (context: BlueprintReviewContext, id: string) => id === blueprintDefaultAnimation ? '页面淡入' : context.animations.find(item => item.id === id)?.name;
const failure = ({ at, visited, trace }: BlueprintProgress, message: string): BlueprintRun => ({ at, visited, trace: [...trace, message], status: 'error' });

export function reviewBlueprint(draft: BlueprintDraft, context: BlueprintReviewContext, previous?: BlueprintRun, now = Date.now()): BlueprintRun {
  if (previous?.status === 'paused') {
    if (previous.animation) {
      if (animationName(context, previous.animation.id) === undefined) return failure(previous, '动画已不存在，请重新选择。');
      return { ...previous, status: 'running', animation: { ...previous.animation, startedAt: now } };
    }
    return advance(draft, context, previous, now, true);
  }
  const entry = draft.nodes.find(item => item.kind === 'trigger');
  return advance(draft, context, { at: entry?.id ?? '', visited: [], trace: [] }, now);
}

export function pauseBlueprint(run: BlueprintRun, now = Date.now()): BlueprintRun {
  if (run.status !== 'running' || !run.animation) return run;
  const elapsed = Math.max(0, now - run.animation.startedAt);
  return { ...run, status: 'paused', animation: { ...run.animation, remainingMs: Math.max(0, run.animation.remainingMs - elapsed) } };
}

export function completeBlueprintAnimation(draft: BlueprintDraft, context: BlueprintReviewContext, run: BlueprintRun, now = Date.now()): BlueprintRun {
  if (run.status !== 'running' || !run.animation) return run;
  return advance(draft, context, run, now, true, run.animation);
}

function advance(draft: BlueprintDraft, context: BlueprintReviewContext, progress: BlueprintProgress, now: number, skipBreakpoint = false, finishedAnimation?: BlueprintRun['animation']): BlueprintRun {
  let { at } = progress;
  const visited = [...progress.visited], trace = [...progress.trace];
  while (true) {
    const current = draft.nodes.find(item => item.id === at);
    if (!current || visited.includes(at)) return failure({ at, visited, trace }, '连接无效或形成循环。');
    if (!skipBreakpoint && at === draft.breakpointId) return { at, visited, trace, status: 'paused' };
    skipBreakpoint = false;
    if (current.kind === 'animation') {
      const id = finishedAnimation?.id ?? current.animationId ?? blueprintDefaultAnimation;
      const name = animationName(context, id);
      if (name === undefined) return failure({ at, visited, trace }, '动画已不存在，请重新选择。');
      const durationMs = finishedAnimation?.durationMs ?? current.durationMs ?? blueprintDefaultDurationMs;
      if (!finishedAnimation) return { at, visited, trace, status: 'running', animation: { id, durationMs, remainingMs: durationMs, startedAt: now } };
      trace.push(`播放动画 · ${name} · ${durationMs} ms`);
    }
    finishedAnimation = undefined;
    visited.push(at);
    let port = 'out';
    switch (current.kind) {
      case 'branch': {
        const input = draft.edges.find(edge => edge.target === at && edge.targetHandle === 'bool');
        const flag = draft.nodes.find(item => item.id === input?.source && item.kind === 'flag');
        if (!flag) return failure({ at, visited, trace }, '条件缺少布尔输入。');
        port = (flag.value ?? true) === (current.value ?? true) ? 'yes' : 'no';
        trace.push('条件走「' + blueprintPortNames[port] + '」分支');
        break;
      }
      case 'action': {
        const destination = context.pages.find(item => item.key === current.pageKey);
        trace.push(destination ? '样例将打开「' + destination.title + '」' : '样例到达打开页面动作（目标未设置）');
        break;
      }
      case 'scene': {
        const destination = context.scenes.find(item => item.id === current.sceneId);
        if (!destination) return failure({ at, visited, trace }, '跳转目标不存在，请重新设置场景。');
        trace.push('进入场景 · ' + destination.name);
        return { at, visited, trace, status: 'done', sceneId: destination.id };
      }
      case 'animation': break;
      default: trace.push(current.title);
    }
    const edge = draft.edges.find(item => item.source === at && item.sourceHandle === port);
    if (!edge) {
      return current.kind === 'branch' || current.kind === 'trigger' || current.kind === 'animation'
        ? failure({ at, visited, trace }, '执行输出未连接。') : { at, visited, trace, status: 'done' };
    }
    at = edge.target;
  }
}
