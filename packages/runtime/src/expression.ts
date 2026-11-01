import type { Expr, Issue, Scalar } from '@galcraft/contracts';
import { printExpression } from '@galcraft/dsl';
import type { ConditionNode, ExpressionContext } from './types.js';

const issue = (code: string, message: string): Issue => ({ code, severity: 'error', message, owner: 'M05', related: [], actions: ['edit', 'returnTitle'] });
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const graphemes = (value: string): string[] => [...segmenter.segment(value)].map(item => item.segment);
function variableValue(expr: Extract<Expr, { kind: 'variable' }>, context: ExpressionContext): Scalar {
  const value = expr.scope === 'progress' ? context.state.progress[expr.id]
    : expr.scope === 'local' ? context.state.frames.at(-1)?.locals[expr.id]
      : context.longTerm.variables[expr.id]?.value ?? context.variables?.find(item => item.id === expr.id && item.scope === 'longTerm')?.initial;
  if (value === undefined) throw issue('VARIABLE_MISSING', `Variable ${expr.id} is unavailable`);
  return value;
}
function expect(value: Scalar, type: string): void { if (typeof value !== type) throw issue('EXPR_TYPE', `Expected ${type}, received ${typeof value}`); }
function builtIn(name: string, args: Scalar[]): Scalar {
  const first = args[0];
  if (name === 'number') { const value = Number(first); if (args.length !== 1 || !Number.isFinite(value) || first === '') throw issue('EXPR_TYPE', 'Cannot convert to number'); return value; }
  if (name === 'string') { if (args.length !== 1) throw issue('EXPR_TYPE', 'string expects one argument'); return String(first); }
  if (name === 'boolean') { if (args.length !== 1 || typeof first === 'string' && first !== 'true' && first !== 'false') throw issue('EXPR_TYPE', 'Cannot convert to boolean'); return first === 'true' || first === true || typeof first === 'number' && first !== 0; }
  if (name === 'len') { if (args.length !== 1) throw issue('EXPR_TYPE', 'len expects one argument'); expect(first!, 'string'); return graphemes(String(first)).length; }
  if (['min', 'max', 'abs', 'round', 'floor', 'ceil'].includes(name)) {
    if (!args.length || !['min', 'max'].includes(name) && args.length !== 1) throw issue('EXPR_TYPE', `${name} received the wrong argument count`);
    args.forEach(value => expect(value, 'number'));
    switch (name) { case 'min': return Math.min(...args.map(Number)); case 'max': return Math.max(...args.map(Number));
      case 'abs': return Math.abs(Number(first)); case 'round': return Math.round(Number(first));
      case 'floor': return Math.floor(Number(first)); default: return Math.ceil(Number(first)); }
  }
  throw issue('CONDITION_MISSING', `Pure condition ${name} is unavailable`);
}
function resultOf(expr: Expr, children: ConditionNode[], context: ExpressionContext): Scalar {
  const value = (index: number): Scalar => children[index]!.value!;
  switch (expr.kind) {
    case 'literal': return expr.value;
    case 'input': if (context.input === undefined) throw issue('EXPR_INPUT', 'Input is unavailable'); return context.input;
    case 'variable': return variableValue(expr, context);
    case 'unary': { const operand = value(0); if (expr.op === '!') { expect(operand, 'boolean'); return !operand; }
      expect(operand, 'number'); return expr.op === '-' ? -Number(operand) : Number(operand); }
    case 'binary': {
      const left = value(0); if (expr.op === '&&' && left === false) return false; if (expr.op === '||' && left === true) return true;
      const right = value(1); let result: Scalar;
      if (expr.op === '&&' || expr.op === '||') { expect(left, 'boolean'); expect(right, 'boolean'); return expr.op === '&&' ? Boolean(left && right) : Boolean(left || right); }
      if (expr.op === '==' || expr.op === '!=') { if (typeof left !== typeof right) throw issue('EXPR_TYPE', 'Equality needs matching types'); return expr.op === '==' ? left === right : left !== right; }
      if (expr.op === '+' && typeof left === 'string' && typeof right === 'string') return left + right;
      expect(left, 'number'); expect(right, 'number');
      switch (expr.op) {
        case '+': result = Number(left) + Number(right); break; case '-': result = Number(left) - Number(right); break;
        case '*': result = Number(left) * Number(right); break;
        case '/': case '%': if (right === 0) throw issue('EXPR_DIV_ZERO', 'Division by zero'); result = expr.op === '/' ? Number(left) / Number(right) : Number(left) % Number(right); break;
        case '<': return left < right; case '<=': return left <= right; case '>': return left > right; case '>=': return left >= right;
      }
      if (!Number.isFinite(result)) throw issue('EXPR_NONFINITE', 'Expression result is not finite'); return result;
    }
    case 'call': { const args = children.map(child => child.value!);
      const plugin = context.functions?.[expr.name]; if (plugin) { const result = plugin(args); if (!result.ok) throw result.error; return result.value; }
      return builtIn(expr.name, args);
    }
  }
}
function skipped(expr: Expr, path: string, status: ConditionNode['status']): ConditionNode {
  const sub = expr.kind === 'binary' ? [['/left', expr.left], ['/right', expr.right]] as const
    : expr.kind === 'unary' ? [['/value', expr.value]] as const
      : expr.kind === 'call' ? expr.args.map((arg, index) => [`/args/${index}`, arg] as const) : [];
  return { path, expression: printExpression(expr), status, value: null, variable: null, issue: null,
    children: sub.map(([suffix, child]) => skipped(child, path + suffix, status)) };
}
export function evaluateTree(expr: Expr, context: ExpressionContext, path = ''): ConditionNode {
  const children: ConditionNode[] = [];
  const frame = context.state.frames.at(-1);
  const node: ConditionNode = { path, expression: printExpression(expr), status: 'evaluated', value: null,
    variable: expr.kind === 'variable' ? { id: expr.id, scope: expr.scope, frameId: expr.scope === 'local' ? frame?.id ?? null : null } : null,
    issue: null, children };
  try {
    if (expr.kind === 'unary') children.push(evaluateTree(expr.value, context, path + '/value'));
    if (expr.kind === 'binary') {
      children.push(evaluateTree(expr.left, context, path + '/left'));
      if (children[0]!.status === 'error') children.push(skipped(expr.right, path + '/right', 'notReached'));
      else if (expr.op === '&&' && children[0]!.value === false || expr.op === '||' && children[0]!.value === true)
        children.push(skipped(expr.right, path + '/right', 'shortCircuited'));
      else children.push(evaluateTree(expr.right, context, path + '/right'));
    }
    if (expr.kind === 'call') for (const [index, arg] of expr.args.entries()) {
      if (children.some(child => child.status === 'error')) children.push(skipped(arg, `${path}/args/${index}`, 'notReached'));
      else children.push(evaluateTree(arg, context, `${path}/args/${index}`));
    }
    const error = children.find(child => child.status === 'error'); if (error) throw error.issue!;
    node.value = resultOf(expr, children, context);
  } catch (error) {
    node.status = 'error'; node.issue = error && typeof error === 'object' && 'code' in error ? error as Issue : issue('EXPR_ERROR', String(error));
  }
  return node;
}
export function evaluate(expr: Expr, context: ExpressionContext): Scalar { const node = evaluateTree(expr, context); if (node.status === 'error') throw node.issue!; return node.value!; }
export function evaluateBoolean(expr: Expr, context: ExpressionContext): { value: boolean; root: ConditionNode } {
  const root = evaluateTree(expr, context); if (root.status === 'error') throw root.issue!;
  if (typeof root.value !== 'boolean') throw issue('EXPR_TYPE', 'Condition must be boolean'); return { value: root.value, root };
}
