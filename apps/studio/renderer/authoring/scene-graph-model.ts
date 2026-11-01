import { ExprSchema, type Id } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import { graphlib, layout } from '@dagrejs/dagre';
import type { AuthoringSource } from './controller.js';

export type SceneRelation = { id: string; from: Id; to: Id; statementId: Id; kind: 'change' | 'choice' | 'call' | 'label' | 'cancel' | 'end'; label: string };
export type SceneGraphNode = { id: Id; name: string; chapter: string; entry: boolean; missing: boolean; partial: boolean; returnsToTitle: boolean; position: { x: number; y: number } };
export type SceneGraphModel = { nodes: SceneGraphNode[]; edges: SceneRelation[] };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const words = {
  'zh-CN': { change: '跳转', choice: '选择', call: '调用', label: '场景内跳转', cancel: '取消输入', end: '结束后跳转', condition: '条件', visible: '显示', enabled: '可选', missing: '未找到场景', variable: '变量', input: '玩家输入' },
  en: { change: 'Jump', choice: 'Choice', call: 'Call', label: 'Local jump', cancel: 'Cancel input', end: 'Ending destination', condition: 'When', visible: 'Visible', enabled: 'Enabled', missing: 'Missing scene', variable: 'Variable', input: 'Player input' },
  ja: { change: '移動', choice: '選択', call: '呼び出し', label: 'シーン内移動', cancel: '入力取消', end: '終了後の移動', condition: '条件', visible: '表示', enabled: '選択可能', missing: 'シーンが見つかりません', variable: '変数', input: 'プレイヤー入力' },
};

export function sceneGraph(source: AuthoringSource, locale: string): SceneGraphModel {
  const w = words[locale === 'en' || locale === 'ja' ? locale : 'zh-CN'];
  const variableNames = new Map(source.variables?.map(variable => [variable.id, variable.name]) ?? []);
  const expression = (value: unknown): string => {
    const parsed = ExprSchema.safeParse(value);
    if (!parsed.success) return typeof value === 'string' ? value : '';
    const render = (expr: typeof parsed.data): string => {
      switch (expr.kind) {
        case 'literal': return typeof expr.value === 'string' ? `“${expr.value}”` : String(expr.value);
        case 'variable': return variableNames.get(expr.id) ?? w.variable;
        case 'input': return w.input;
        case 'unary': return `${expr.op}${render(expr.value)}`;
        case 'binary': return `(${render(expr.left)} ${expr.op} ${render(expr.right)})`;
        case 'call': return `${expr.name}(${expr.args.map(render).join(', ')})`;
      }
    };
    return render(parsed.data);
  };
  const parsed = source.scenes.map(scene => ({ scene, parsed: parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }) }));
  const nodes: SceneGraphNode[] = parsed.map(({ scene, parsed }) => ({ id: scene.sceneId, name: scene.name,
    chapter: source.project.chapters.find(chapter => chapter.id === scene.chapterId)?.name ?? '',
    entry: source.project.entry.sceneId === scene.sceneId, missing: false, partial: parsed.issues.some(issue => issue.severity === 'error'), returnsToTitle: false, position: { x: 0, y: 0 } }));
  const edges: SceneRelation[] = [];
  const add = (from: Id, to: unknown, statementId: Id, kind: SceneRelation['kind'], label: string, suffix = '') => {
    if (typeof to !== 'string' || !to) return;
    if (!nodes.some(node => node.id === to)) nodes.push({ id: to, name: w.missing, chapter: '', entry: false, missing: true, partial: false, returnsToTitle: false, position: { x: 0, y: 0 } });
    edges.push({ id: `${from}:${statementId}:${kind}:${to}:${suffix}`, from, to, statementId, kind, label });
  };
  for (const { scene, parsed: result } of parsed) for (const node of result.cst) {
    if (!node.valid || !node.id) continue;
    const args = record(node.object?.value), condition = expression(args.when);
    const label = (name: string) => condition ? `${name} · ${w.condition}: ${condition}` : name;
    if (node.command === 'changeScene' || node.command === 'callScene') {
      const kind = node.command === 'changeScene' ? 'change' : 'call';
      add(scene.sceneId, args.sceneId, node.id, kind, label(w[kind]));
    } else if (node.command === 'choose') {
      for (const [index, raw] of (Array.isArray(args.options) ? args.options : []).entries()) {
        const option = record(raw), target = record(option.target), visible = expression(option.visible), enabled = expression(option.enabled);
        const name = typeof option.text === 'string' && option.text ? option.text : w.choice;
        add(scene.sceneId, target.sceneId, node.id, 'choice', [label(name), visible ? `${w.visible}: ${visible}` : '', enabled ? `${w.enabled}: ${enabled}` : ''].filter(Boolean).join(' · '), String(index));
      }
    } else if (node.command === 'jumpLabel') {
      const target = result.cst.find(item => item.command === 'label' && record(item.object?.value).labelId === args.labelId);
      const name = record(target?.object?.value).name;
      add(scene.sceneId, scene.sceneId, node.id, 'label', label(typeof name === 'string' && name ? `${w.label}: ${name}` : w.label));
    } else if (node.command === 'getUserInput') add(scene.sceneId, record(args.cancelTarget).sceneId, node.id, 'cancel', label(w.cancel));
    else if (node.command === 'end') {
      const target = record(args.target);
      if (target.kind === 'scene') add(scene.sceneId, target.sceneId, node.id, 'end', label(w.end));
      else if (target.kind === 'title' || args.target === undefined) nodes.find(item => item.id === scene.sceneId)!.returnsToTitle = true;
    }
  }
  const graph = new graphlib.Graph({ multigraph: true }).setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 180, marginx: 24, marginy: 24 }).setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, { width: 224, height: 112 });
  for (const edge of edges) graph.setEdge(edge.from, edge.to, {}, edge.id);
  layout(graph);
  for (const node of nodes) { const position = graph.node(node.id); node.position = { x: position.x - 112, y: position.y - 56 }; }
  return { nodes, edges };
}
