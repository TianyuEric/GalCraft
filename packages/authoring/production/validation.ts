import type { CapabilityReport, Issue, Result } from '@galcraft/contracts';
import { enrichIssue, DiagnosticError } from '@galcraft/contracts';
import type { GenerationInput, TaskItem, WorkflowBinding } from './types.js';
import { isExtensionInput, validateOperationInput, validateOperationEdges } from './operations.js';
export const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export const issue = (code: string, message: string): Issue => enrichIssue({ code, message, severity: 'error', owner: 'M10', related: [], actions: ['edit', 'retry'] });
export const fail = <T = never>(code: string, message: string): Result<T> => { const error = issue(code, message); return { ok: false, error, issues: [error] }; };
export function requireValue<T>(result: Result<T>): T { if (!result.ok) throw new DiagnosticError(result.error); return result.value; }
export function topological<T extends { id: string; dependencies: { itemId: string }[] }>(items: T[]): T[] {
  const map = new Map(items.map(item => [item.id, item]));
  if (map.size !== items.length) throw new Error('Duplicate task identity');
  const visited = new Set<string>(), path: string[] = [], sorted: T[] = [];
  const visit = (id: string) => {
    if (path.includes(id)) throw new Error(`Dependency cycle: ${[...path.slice(path.indexOf(id)), id].join(' → ')}`);
    if (visited.has(id)) return;
    const item = map.get(id); if (!item) throw new Error(`Missing dependency: ${id}`);
    path.push(id); item.dependencies.forEach(edge => visit(edge.itemId)); path.pop(); visited.add(id); sorted.push(item);
  };
  items.forEach(item => visit(item.id)); return sorted;
}
import { validateInput, validateWorkflow, workflowSupportsPurpose } from '@galcraft/generation-services/validation';
export { validateInput, validateWorkflow } from '@galcraft/generation-services/validation';
export function validateItems(items: TaskItem[]): void {
  topological(items);
  validateOperationEdges(items);
  for (const item of items) {
    if (['assemble', 'audioProcess'].includes(item.purpose)) continue;
    const input = item.input as GenerationInput; validateInput(input);
    if (isExtensionInput(input)) {
      if (!item.operationSnapshot) throw new Error(`Missing operation definition snapshot: ${input.purpose}`);
      validateOperationInput(input, item.operationSnapshot, item.dependencies.map(edge => edge.output));
      if (!item.operationSnapshot.definition.textPreparationKey && item.operationSnapshot.definition.providerKey !== item.configSnapshot?.providerKey) throw new Error('The operation does not match its generation provider');
    }
    if (item.purpose !== input.purpose || !(item.configSnapshot?.purposes.includes(input.purpose) || item.operationSnapshot?.definition.connection && item.configSnapshot?.purposes.includes(item.operationSnapshot.definition.connection.purpose as import('@galcraft/contracts').Purpose))) throw new Error('The task and connection purposes differ');
    if (input.purpose === 'image' && input.usage !== item.target.usage) throw new Error('The image usages differ');
    if (item.configSnapshot.protocol === 'comfyUI') {
      if (!item.workflowSnapshot || !workflowSupportsPurpose(item.workflowSnapshot, input.purpose, input.purpose === 'image' ? input.usage : null)) throw new Error('A matching workflow purpose and image use are required');
      validateWorkflow(item.workflowSnapshot);
    }
  }
}
