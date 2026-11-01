import { graphlib, layout } from '@dagrejs/dagre';
import type { Json, Purpose, ProductionOperationSnapshot } from '@galcraft/contracts';
import type { ComfyGraph, WorkflowBinding } from '@galcraft/authoring/production';
import { workflowOperationPorts } from '@galcraft/generation-services/validation';

export const workflowPorts: Record<Exclude<Purpose, 'text'>, string[]> = {
  image: ['positive', 'negative', 'width', 'height', 'count', 'seed', 'references'],
  difference: ['reference', 'instruction', 'negative', 'width', 'height', 'count', 'seed'],
  speech: ['text', 'language', 'voiceId', 'referenceAudio', 'referenceText', 'referenceLanguage', 'emotion', 'speed'],
  music: ['prompt', 'durationSec', 'instrumental', 'lyrics', 'seed'],
  matting: ['reference'],
};
const numericPorts = new Set(['width', 'height', 'count', 'seed', 'speed', 'durationSec']);
export type WorkflowDraft = Omit<WorkflowBinding, 'purpose'> & { purpose: Purpose | null };
export type WorkflowPort = ReturnType<typeof workflowOperationPorts>[number] & { valueType: WorkflowBinding['inputs'][number]['valueType'] | null };
export function operationPorts(operation: ProductionOperationSnapshot): WorkflowPort[] {
  return workflowOperationPorts(operation).map(port => ({ ...port, valueType: port.valueTypes[0] ?? null }));
}
export function compatiblePorts(purpose: Purpose | null, value: Json, operation?: ProductionOperationSnapshot | null): string[] {
  if (operation) return operationPorts(operation).filter(port => port.valueTypes.some(type => type.endsWith('File') ? typeof value === 'string' : type === typeof value)).map(port => port.key);
  return (purpose === 'text' || purpose === null ? [] : workflowPorts[purpose] ?? []).filter(port =>
    typeof value === 'number' ? numericPorts.has(port) : typeof value === 'boolean' ? port === 'instrumental' :
      typeof value === 'string' && !numericPorts.has(port) && port !== 'instrumental');
}
export function validApiGraph(value: unknown): value is ComfyGraph {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(node =>
    node && typeof node.class_type === 'string' && node.inputs && typeof node.inputs === 'object' && !Array.isArray(node.inputs));
}
export function readWorkflow(text: string): WorkflowDraft | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.graphVersion === 'string'
      && (value.purpose === null || typeof value.purpose === 'string') && (value.operation === undefined || typeof value.operation === 'string')
      && validApiGraph(value.apiGraph) && Array.isArray(value.inputs) && value.inputs.every((input: Record<string, unknown>) => input && ['port', 'nodeId', 'classType', 'input', 'valueType'].every(key => typeof input[key] === 'string'))
      && Array.isArray(value.outputs) && value.outputs.every((output: Record<string, unknown>) => output && typeof output.nodeId === 'string' && typeof output.key === 'string')
      && Array.isArray(value.uploads) && value.uploads.every((upload: Record<string, unknown>) => upload && typeof upload.port === 'string' && typeof upload.method === 'string') ? value : null;
  } catch { return null; }
}
export function linkedInput(value: Json): { nodeId: string; slot: number } | null {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number'
    ? { nodeId: value[0], slot: value[1] } : null;
}
export type WorkflowInputRow = { id: string; nodeId: string; title: string; classType: string; input: string; value: Json; binding: WorkflowBinding['inputs'][number] | undefined };
export function workflowInputRows(binding: WorkflowDraft): WorkflowInputRow[] {
  const rows = Object.entries(binding.apiGraph).flatMap(([nodeId, node]) => Object.entries(node.inputs).map(([input, value]) => ({
    id: JSON.stringify([nodeId, input]), nodeId, title: node._meta?.title ?? node.class_type, classType: node.class_type, input, value,
    binding: binding.inputs.find(item => item.nodeId === nodeId && item.input === input),
  })));
  for (const item of binding.inputs) if (!rows.some(row => row.nodeId === item.nodeId && row.input === item.input)) rows.push({ id: JSON.stringify([item.nodeId, item.input]), nodeId: item.nodeId, title: item.nodeId, classType: item.classType, input: item.input, value: null, binding: item });
  return rows;
}
/** Only the selected semantic binding changes; graph values and custom mapping metadata stay intact. */
export function mapWorkflowInput<T extends WorkflowDraft>(binding: T, row: WorkflowInputRow, port: string, operation?: ProductionOperationSnapshot | null): T {
  if (port && (!['string', 'number', 'boolean'].includes(typeof row.value) || !compatiblePorts(binding.purpose, row.value, operation).includes(port))) return binding;
  const inputs = binding.inputs.filter(item => !(item.nodeId === row.nodeId && item.input === row.input));
  const valueType = operationPortsFor(operation, port, row.value) ?? (['reference', 'references'].includes(port) ? 'imageFile' : port === 'referenceAudio' ? 'audioFile' : typeof row.value as 'string' | 'number' | 'boolean');
  if (port) inputs.push({ ...row.binding, port, nodeId: row.nodeId, classType: row.classType, input: row.input,
    valueType,
    required: operation ? operationPorts(operation).find(item => item.key === port)?.required ?? false : row.binding?.required ?? true, transform: valueType === 'number' && row.binding?.valueType === 'number' ? row.binding.transform : 'identity' });
  const media = inputs.filter(item => ['imageFile', 'audioFile'].includes(item.valueType));
  const uploads = [...new Set(media.map(item => item.port))].map(port => binding.uploads.find(upload => upload.port === port) ?? {
    port, method: 'comfyImage' as const, subfolder: '', serverRoot: null,
  });
  return { ...binding, inputs, uploads };
}
const operationPortsFor = (operation: ProductionOperationSnapshot | null | undefined, key: string, value: Json) => operation ? operationPorts(operation).find(port => port.key === key)?.valueTypes.find(type => type.endsWith('File') || type === typeof value) : null;
export function workflowOutputDefault(purpose: Purpose | null, operation?: ProductionOperationSnapshot | null) {
  const audio = operation ? operation.definition.outputs.some(port => port.type === 'audio') : ['speech', 'music'].includes(purpose ?? '');
  return { key: audio ? 'audio' : 'images', kind: audio ? 'audio' as const : 'image' as const };
}
export function changeWorkflowOperation(binding: WorkflowDraft, purpose: Purpose | null, operation?: ProductionOperationSnapshot | null): WorkflowDraft {
  return { ...binding, purpose, operation: operation?.id, imageUsages: purpose === 'image' ? binding.imageUsages ?? [] : null,
    outputs: binding.outputs.map(output => output.source === 'automatic' ? { ...output, ...workflowOutputDefault(purpose, operation) } : output) };
}
export function replaceWorkflowGraph(binding: WorkflowDraft, graph: ComfyGraph): WorkflowDraft {
  return { ...binding, apiGraph: graph, graphVersion: String(Number(binding.graphVersion) + 1 || 1),
    outputs: binding.outputs.map(output => ({ ...output, classType: output.classType ?? binding.apiGraph[output.nodeId]?.class_type })),
    requiredNodes: [...new Set(Object.values(graph).map(node => node.class_type))].map(classType => ({ classType, versionNote: null })) };
}
export function workflowTopology(graph: ComfyGraph) {
  const edges = Object.entries(graph).flatMap(([target, node]) => Object.entries(node.inputs).flatMap(([input, value]) => {
    const link = linkedInput(value);
    return link && graph[link.nodeId] ? [{ id: JSON.stringify([target, input]), source: link.nodeId, target, input, slot: link.slot }] : [];
  }));
  const diagram = new graphlib.Graph({ multigraph: true }).setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 80 }).setDefaultEdgeLabel(() => ({}));
  Object.keys(graph).forEach(id => diagram.setNode(id, { width: 224, height: 92 }));
  edges.forEach(edge => diagram.setEdge(edge.source, edge.target, {}, edge.id));
  layout(diagram);
  return { nodes: Object.entries(graph).map(([id, node]) => ({ id, title: node._meta?.title ?? node.class_type, classType: node.class_type,
    position: { x: diagram.node(id).x - 112, y: diagram.node(id).y - 46 } })), edges };
}
