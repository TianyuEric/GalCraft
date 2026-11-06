import type { GraphEdge, GraphNode, PageDocument, ReviewStore } from '../model.js';

export const inputs: Record<GraphNode['kind'], string[]> = { click: [], fade: ['in'], condition: ['in', 'value'], variable: [], scene: ['in'] };
export const outputs: Record<GraphNode['kind'], string[]> = { click: ['out'], fade: ['out'], condition: ['yes', 'no'], variable: ['value'], scene: [] };
export const portKind = (handle: string): GraphEdge['kind'] => handle === 'value' ? 'boolean' : 'execution';
export const portName = (handle: string) => ({ in: '执行', out: '完成', yes: '是', no: '否', value: '布尔' })[handle] ?? handle;

type GraphSession = { page: PageDocument; next: string; visited: Set<string>; timer?: ReturnType<typeof setTimeout> };
const sessions = new WeakMap<ReviewStore, GraphSession>();

export function stopGraph(store: ReviewStore) {
  const active = sessions.get(store);
  clearTimeout(active?.timer); sessions.delete(store);
  store.updateUi(ui => { Object.assign(ui.graphRun, { status: 'idle', currentId: null, trace: [], message: '已停止运行' }); });
}

export function startGraph(store: ReviewStore) {
  stopGraph(store);
  const page = store.getSnapshot().project.page;
  const entry = page.nodes.find(node => node.kind === 'click');
  if (!entry) { store.updateUi(ui => { ui.graphRun.status = 'failed'; ui.graphRun.message = '没有可运行的点击事件。'; }); return; }
  const session = { page, next: entry.id, visited: new Set<string>() };
  sessions.set(store, session);
  advance(store, session);
}

export function resumeGraph(store: ReviewStore) {
  const session = sessions.get(store);
  if (session && store.getSnapshot().ui.graphRun.status === 'paused') advance(store, session, true);
  else startGraph(store);
}

export function pauseGraph(store: ReviewStore) {
  const session = sessions.get(store);
  if (!session || store.getSnapshot().ui.graphRun.status !== 'running') return;
  clearTimeout(session.timer);
  store.updateUi(ui => { ui.graphRun.status = 'paused'; ui.graphRun.message = '手动暂停 · 继续后执行当前节点'; });
}

function advance(store: ReviewStore, session: GraphSession, skipBreakpoint = false) {
  if (sessions.get(store) !== session) return;
  const node = session.page.nodes.find(node => node.id === session.next);
  const fail = (message: string) => {
    sessions.delete(store);
    store.updateUi(ui => { ui.graphRun.status = 'failed'; ui.graphRun.message = message; });
  };
  if (!node) { fail('目标节点已不存在。'); return; }
  if (session.visited.has(node.id)) { fail(`检测到循环连接：${node.label}`); return; }
  const breakpoint = !skipBreakpoint && store.getSnapshot().ui.graphRun.breakpointId === node.id;
  store.updateUi(ui => { ui.graphRun.status = breakpoint ? 'paused' : 'running'; ui.graphRun.currentId = node.id; ui.graphRun.message = breakpoint ? `已暂停 · ${node.label}` : `执行 · ${node.label}`; });
  if (breakpoint) return;

  const step = () => {
    if (sessions.get(store) !== session) return;
    session.visited.add(node.id);
    let handle = 'out', detail = node.label;
    if (node.kind === 'condition') {
      const wire = session.page.edges.find(edge => edge.target === node.id && edge.kind === 'boolean');
      const variable = session.page.nodes.find(entry => entry.id === wire?.source && entry.kind === 'variable');
      if (!variable) { fail('条件缺少布尔输入，请连接读取变量。'); return; }
      const pass = Boolean(variable.value) === (node.value ?? true);
      handle = pass ? 'yes' : 'no';
      detail = `${variable.label}：${variable.value ? '是' : '否'} · 条件走「${portName(handle)}」分支`;
    }
    if (node.kind === 'scene') {
      const target = store.getSnapshot().project.scenes.find(scene => scene.id === node.sceneId);
      if (!target) { fail('跳转目标不存在，请重新设置场景。'); return; }
      sessions.delete(store);
      store.updateUi(ui => {
        const lineId = target.lines[0]?.id ?? '';
        ui.sceneId = target.id; ui.lineId = lineId;
        ui.preview = { status: 'paused', sceneId: target.id, lineId, offset: 0, temporaryCandidateId: null };
        ui.graphRun.status = 'finished';
        ui.graphRun.trace.push(`进入场景 · ${target.name}`);
        ui.graphRun.message = `完成 · 进入 ${target.name}`;
      });
      return;
    }
    store.updateUi(ui => { ui.graphRun.trace.push(detail); });
    const edge = session.page.edges.find(edge => edge.kind === 'execution' && edge.source === node.id && (edge.sourceHandle === handle || (handle === 'out' && ['click', 'done', 'next', 'exec'].includes(edge.sourceHandle))));
    if (!edge) { fail(`「${node.label}」的 ${portName(handle)} 端口未连接。`); return; }
    session.next = edge.target;
    advance(store, session);
  };
  if (node.kind === 'fade') session.timer = setTimeout(step, Math.max(0, node.durationMs ?? 400));
  else step();
}
