import type { BlueprintNode, BlueprintOutcome, PageBlueprint } from './ui.js';
import type { PageConfig, RuntimeTemplate } from './template.js';

export type BlueprintDiagnostic = { code: string; message: string; nodeId?: string; edgeId?: string };

export function blueprintOutcomes(node: BlueprintNode): readonly BlueprintOutcome[] {
  if (node.kind === 'condition') return ['success', 'unmet'];
  if (node.kind === 'action') return ['success', 'unmet', 'failure'];
  return node.kind === 'animation' ? ['success', 'failure'] : ['success'];
}

export function blueprintTopologyIssues(graph: PageBlueprint): BlueprintDiagnostic[] {
  const issues: BlueprintDiagnostic[] = [];
  const nodes = new Map<string, BlueprintNode>();
  for (const node of graph.nodes) {
    if (nodes.has(node.id)) issues.push({ code: 'BLUEPRINT_NODE_DUPLICATE', message: 'Node identity is duplicated.', nodeId: node.id });
    nodes.set(node.id, node);
  }
  if (!nodes.has(graph.entry)) issues.push({ code: 'BLUEPRINT_ENTRY_MISSING', message: 'Connect an existing entry node.', nodeId: graph.entry });
  const edgeIds = new Set<string>(), ports = new Set<string>(), destinations = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const source = nodes.get(edge.from);
    const port = `${edge.from}/${edge.outcome}`;
    if (edgeIds.has(edge.id) || ports.has(port) || !source || !nodes.has(edge.to) || !blueprintOutcomes(source).includes(edge.outcome)) {
      issues.push({ code: 'BLUEPRINT_EDGE', message: 'Connect existing nodes using one edge per available output port.', edgeId: edge.id });
      continue;
    }
    edgeIds.add(edge.id);
    ports.add(port);
    destinations.set(edge.from, [...destinations.get(edge.from) ?? [], edge.to]);
  }
  const visited = new Set<string>(), active = new Set<string>();
  const visit = (nodeId: string) => {
    if (active.has(nodeId)) { issues.push({ code: 'BLUEPRINT_CYCLE', message: 'Remove the cycle in the execution path.', nodeId }); return; }
    if (visited.has(nodeId) || !nodes.has(nodeId)) return;
    visited.add(nodeId);
    active.add(nodeId);
    destinations.get(nodeId)?.forEach(visit);
    active.delete(nodeId);
  };
  visit(graph.entry);
  for (const nodeId of nodes.keys()) if (!visited.has(nodeId)) issues.push({ code: 'BLUEPRINT_UNREACHABLE', message: 'Connect this node to the entry path.', nodeId });
  return issues;
}

export function blueprintReferenceIssues(graph: PageBlueprint, page: PageConfig, template: RuntimeTemplate): BlueprintDiagnostic[] {
  const issues: BlueprintDiagnostic[] = [];
  for (const node of graph.nodes) {
    if (node.kind === 'animation' && !template.animations.some(animation => animation.id === node.animationId))
      issues.push({ code: 'BLUEPRINT_ANIMATION_MISSING', message: `Animation ${node.animationId} is unavailable.`, nodeId: node.id });
    if (node.kind !== 'action') continue;
    const { action } = node;
    const destination = action.kind === 'open' ? action.page : action.kind === 'official' && action.action.kind === 'open' ? action.action.page : null;
    if (destination && !template.pages.some(candidate => candidate.key === destination))
      issues.push({ code: 'BLUEPRINT_PAGE_MISSING', message: `Page ${destination} is unavailable.`, nodeId: node.id });
    if ((action.kind === 'setLocal' || action.kind === 'toggleLocal') && !Object.hasOwn(page.localState ?? {}, action.key))
      issues.push({ code: 'BLUEPRINT_LOCAL_MISSING', message: `Declare the page local value ${action.key} before using it.`, nodeId: node.id });
  }
  return issues;
}
