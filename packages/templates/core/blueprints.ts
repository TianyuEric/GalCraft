import { blueprintReferenceIssues, blueprintTopologyIssues, createId, PageBlueprintSchema, type BlueprintDiagnostic, type BlueprintNode, type PageConfig, type RuntimeTemplate, type UIAction, type UICondition, type UIInteraction, type UIValueBinding } from '@galcraft/contracts';
import { components } from './editing.js';
import { UIBindingFields } from './bindings.js';

export { blueprintOutcomes, type BlueprintDiagnostic } from '@galcraft/contracts';

const officialKinds = new Set(['continue', 'openCg', 'preference', 'open', 'back', 'start', 'returnTitle']);

function actionProblem(action: UIAction): string | undefined {
  if (action.kind === 'plugin') return 'Plugin actions are unavailable in R3 blueprints.';
  if (action.kind !== 'official') return;
  const official = action.action;
  if (!officialKinds.has(official.kind)) return `Official action ${official.kind} is unavailable in R3 blueprints.`;
  const boundFields = Object.keys(action.bindings ?? {});
  const bindable = official.kind === 'openCg' ? 'entryId' : official.kind === 'preference' ? 'value' : null;
  if (boundFields.some(key => key !== bindable)) return 'This official action cannot bind the selected argument.';
  if (official.kind === 'preference') {
    const field = UIBindingFields.find(field => field.access === 'readWrite' && field.value === `preferences.${official.path}`);
    if (!field || (!action.bindings?.value && typeof official.value !== field.type)) return `Supply a value matching the public preference ${official.path}.`;
  }
}

export function validatePageBlueprint(input: unknown, page: PageConfig, template: RuntimeTemplate): BlueprintDiagnostic[] {
  const checked = PageBlueprintSchema.safeParse(input);
  if (!checked.success) return checked.error.issues.map(issue => ({ code: 'BLUEPRINT_FORMAT', message: `${issue.path.join('/')}: ${issue.message}` }));
  const graph = checked.data;
  const issues = [...blueprintTopologyIssues(graph), ...blueprintReferenceIssues(graph, page, template)];
  for (const node of graph.nodes) {
    if (node.kind === 'action') {
      const message = actionProblem(node.action);
      if (message) issues.push({ code: 'BLUEPRINT_ACTION', message, nodeId: node.id });
    }
  }
  return issues;
}

export function blueprintConversionProblem(binding: UIInteraction, following: readonly UIInteraction[] = [], preceding: readonly UIInteraction[] = []): string | undefined {
  if (binding.blueprint || !binding.actions.length) return 'Select a legacy binding with at least one action.';
  if (preceding.some(candidate => candidate.event === binding.event && (candidate.blueprint
    || candidate.actions.some(action => action.kind !== 'setLocal' && action.kind !== 'toggleLocal'))))
    return 'An earlier binding can change the current Player visit. Keep this event sequence in the inline editor.';
  const readsLiveValue = (value: UIValueBinding) => value.source === 'data' || value.source === 'variable';
  const hasLiveCondition = (condition: UICondition): boolean => {
    if (condition.op === 'not') return hasLiveCondition(condition.condition);
    if ('conditions' in condition) return condition.conditions.some(hasLiveCondition);
    return condition.op === 'truthy' ? readsLiveValue(condition.value) : readsLiveValue(condition.left) || readsLiveValue(condition.right);
  };
  if (binding.condition && hasLiveCondition(binding.condition))
    return 'This condition reads live Player data. Keep the legacy event snapshot semantics in the inline editor.';
  for (const [index, action] of binding.actions.entries()) {
    if (action.kind === 'toggleLocal' || action.kind === 'setLocal' && action.value.source === 'literal') continue;
    if (action.kind === 'open' || action.kind === 'official' && action.action.kind === 'open' && !Object.keys(action.bindings ?? {}).length) {
      if (index === binding.actions.length - 1 && !following.some(candidate => candidate.event === binding.event)) continue;
      return 'A page open must end the event sequence to preserve its observable order.';
    }
    return 'Conversion supports literal page-local writes, toggles and a final page open. Keep this binding in the inline editor.';
  }
}

export function convertPageBinding(binding: UIInteraction, following: readonly UIInteraction[], preceding: readonly UIInteraction[]): UIInteraction {
  const problem = blueprintConversionProblem(binding, following, preceding);
  if (problem) throw new Error(`BLUEPRINT_NOT_EQUIVALENT: ${problem}`);
  const nodes: BlueprintNode[] = binding.actions.map(action => ({ id: createId(), kind: 'action', action }));
  if (binding.condition) nodes.unshift({ id: createId(), kind: 'condition', condition: binding.condition });
  const edges = nodes.slice(1).map((node, index) => ({ id: createId(), from: nodes[index]!.id, outcome: 'success' as const, to: node.id }));
  return { id: binding.id ?? createId(), event: binding.event, actions: [], blueprint: { revision: 1, entry: nodes[0]!.id, nodes, edges } };
}

export function findPageBlueprint(template: RuntimeTemplate, address: { pageId: string; componentId: string; bindingId: string }) {
  const page = template.pages.find(page => page.id === address.pageId);
  const component = page && components(page.root).find(component => component.id === address.componentId);
  const binding = component?.interactions?.find(binding => binding.id === address.bindingId);
  return page && component && binding?.blueprint ? { page, component, binding, graph: binding.blueprint } : undefined;
}
