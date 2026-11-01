import { OfficialActionSchema } from '@galcraft/contracts';
import type { Json, OfficialAction, Scalar, UIAction, UICondition, UIValueBinding } from '@galcraft/contracts';
export type UIVariableValues = Record<'progress' | 'local' | 'longTerm', Record<string, Scalar>>;
export type UIValueContext = { data: Record<string, unknown>; local: Record<string, Json>; variables?: UIVariableValues; item?: unknown; event?: Record<string, unknown>; instance?: string };
export function readUIPath(value: unknown, path: string): unknown {
  for (const key of path.split(/[/.]/).filter(Boolean)) {
    if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
export function readUIValue(binding: UIValueBinding, context: UIValueContext): unknown {
  if (binding.source === 'literal') return binding.value;
  if (binding.source === 'variable') return context.variables?.[binding.scope][binding.variableId];
  return readUIPath(context[binding.source], binding.path);
}
export function evaluateUICondition(condition: UICondition | undefined, context: UIValueContext): boolean {
  if (!condition) return true;
  if (condition.op === 'not') return !evaluateUICondition(condition.condition, context);
  if ('conditions' in condition) return condition.op === 'all' ? condition.conditions.every(item => evaluateUICondition(item, context)) : condition.conditions.some(item => evaluateUICondition(item, context));
  if (condition.op === 'truthy') return Boolean(readUIValue(condition.value, context));
  const left = readUIValue(condition.left, context), right = readUIValue(condition.right, context);
  if (condition.op === 'equals') return left === right;
  if (condition.op === 'notEquals') return left !== right;
  return typeof left === 'number' && typeof right === 'number' && (condition.op === 'greater' ? left > right : left < right);
}
export function resolveUIOfficialAction(action: Extract<UIAction, { kind: 'official' }>, context: UIValueContext): OfficialAction {
  return OfficialActionSchema.parse({ ...action.action, ...Object.fromEntries(Object.entries(action.bindings ?? {}).map(([key, binding]) => [key, readUIValue(binding, context)])) });
}
