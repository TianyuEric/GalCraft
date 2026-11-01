import type { Expr, Id, Scalar, Variable } from '@galcraft/contracts';
import { isId } from '@galcraft/contracts';

type ExpressionResult = { ok: true; expr: Expr } | { ok: false; message: string };
type Piece = { text: string; start: number; end: number; kind: 'name' | 'number' | 'string' | 'operator' };
const pattern = /\s+|(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\/[A-Za-z_][A-Za-z0-9_]*)?|==|!=|<=|>=|&&|\|\||[()[\],!+*/%<>-]/gy;
const priority: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

function tokenize(text: string): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < text.length;) {
    pattern.lastIndex = i;
    const match = pattern.exec(text);
    if (!match || match.index !== i) throw new Error(`Unexpected character at ${i}`);
    const word = match[0];
    if (!/^\s+$/.test(word)) pieces.push({ text: word, start: i, end: pattern.lastIndex,
      kind: word.startsWith('"') ? 'string' : /^\d/.test(word) ? 'number' : /^[A-Za-z_]/.test(word) ? 'name' : 'operator' });
    i = pattern.lastIndex;
  }
  return pieces;
}

class ExpressionReader {
  index = 0;
  constructor(readonly pieces: Piece[]) {}
  peek(): Piece | undefined { return this.pieces[this.index]; }
  take(): Piece | undefined { return this.pieces[this.index++]; }
  expect(text: string): void { if (this.take()?.text !== text) throw new Error(`Expected ${text}`); }
  atom(): Expr {
    const token = this.take();
    if (!token) throw new Error('Expected expression');
    if (token.text === '(') { const value = this.expression(0); this.expect(')'); return value; }
    if (token.text === '!' || token.text === '-' || token.text === '+') return { kind: 'unary', op: token.text, value: this.expression(7) };
    if (token.kind === 'number') return { kind: 'literal', value: Number(token.text) };
    if (token.kind === 'string') {
      try { return { kind: 'literal', value: JSON.parse(token.text) as string }; }
      catch { throw new Error('Invalid string'); }
    }
    if (token.text === 'true' || token.text === 'false') return { kind: 'literal', value: token.text === 'true' };
    if (token.text === 'input') return { kind: 'input' };
    if (token.kind === 'name') {
      if (['progress', 'local', 'longTerm'].includes(token.text) && this.peek()?.text === '[') {
        this.take();
        const key = this.take();
        if (!key || key.kind !== 'string') throw new Error('Variable reference needs a quoted ID');
        let id: string;
        try { id = JSON.parse(key.text) as string; } catch { throw new Error('Invalid variable ID'); }
        if (!isId(id!)) throw new Error('Invalid variable ID');
        this.expect(']');
        return { kind: 'variable', scope: token.text as 'progress' | 'local' | 'longTerm', id: id! };
      }
      if (this.peek()?.text === '(') {
        this.take();
        const args: Expr[] = [];
        while (this.peek() && this.peek()!.text !== ')') {
          args.push(this.expression(0));
          if (this.peek()?.text !== ')') this.expect(',');
        }
        this.expect(')');
        return { kind: 'call', name: token.text, args };
      }
    }
    throw new Error(`Unexpected ${token.text}`);
  }
  expression(min: number): Expr {
    let left = this.atom();
    while (this.peek() && (priority[this.peek()!.text] ?? 0) > min) {
      const operator = this.take()!.text as Extract<Expr, { kind: 'binary' }>['op'];
      const right = this.expression(priority[operator]!);
      left = { kind: 'binary', op: operator, left, right };
    }
    return left;
  }
}

export function parseExpression(text: string): ExpressionResult {
  try {
    const reader = new ExpressionReader(tokenize(text));
    const expr = reader.expression(0);
    if (reader.peek()) throw new Error(`Unexpected ${reader.peek()!.text}`);
    return { ok: true, expr };
  } catch (error) { return { ok: false, message: String((error as Error).message) }; }
}
export function printExpression(expr: Expr): string {
  switch (expr.kind) {
    case 'literal': return JSON.stringify(expr.value);
    case 'input': return 'input';
    case 'variable': return `${expr.scope}[${JSON.stringify(expr.id)}]`;
    case 'unary': return `${expr.op}(${printExpression(expr.value)})`;
    case 'binary': return `(${printExpression(expr.left)} ${expr.op} ${printExpression(expr.right)})`;
    case 'call': return `${expr.name}(${expr.args.map(printExpression).join(', ')})`;
  }
}

export type ExprType = 'number' | 'boolean' | 'string';
export type ExpressionEnvironment = { variables: readonly Variable[]; locals?: readonly Variable[]; input?: boolean; conditions?: Record<string, { args: ExprType[]; returns: ExprType }> };
export function expressionType(expr: Expr, environment: ExpressionEnvironment): ExprType {
  switch (expr.kind) {
    case 'literal': return typeof expr.value as ExprType;
    case 'input': if (!environment.input) throw new Error('input is only valid in input validation'); return 'string';
    case 'variable': {
      const value = [...environment.variables, ...(environment.locals ?? [])].find(item => item.id === expr.id && item.scope === expr.scope);
      if (!value) throw new Error(`Unknown ${expr.scope} variable ${expr.id}`);
      return value.type;
    }
    case 'unary': {
      const operand = expressionType(expr.value, environment);
      if (expr.op === '!') { if (operand !== 'boolean') throw new Error('! requires boolean'); return 'boolean'; }
      if (operand !== 'number') throw new Error(`${expr.op} requires number`);
      return 'number';
    }
    case 'binary': {
      const left = expressionType(expr.left, environment);
      const right = expressionType(expr.right, environment);
      if (['&&', '||'].includes(expr.op)) { if (left !== 'boolean' || right !== 'boolean') throw new Error(`${expr.op} requires boolean`); return 'boolean'; }
      if (['==', '!='].includes(expr.op)) { if (left !== right) throw new Error('Equality requires the same type'); return 'boolean'; }
      if (['<', '<=', '>', '>='].includes(expr.op)) { if (left !== 'number' || right !== 'number') throw new Error('Comparison requires numbers'); return 'boolean'; }
      if (expr.op === '+' && left === 'string' && right === 'string') return 'string';
      if (left !== 'number' || right !== 'number') throw new Error(`${expr.op} requires numbers`);
      return 'number';
    }
    case 'call': {
      const values = expr.args.map(value => expressionType(value, environment));
      if (expr.name === 'number' || expr.name === 'string' || expr.name === 'boolean') {
        if (values.length !== 1) throw new Error(`${expr.name} requires one argument`);
        return expr.name;
      }
      if (expr.name === 'len') { if (values.length !== 1 || values[0] !== 'string') throw new Error('len requires a string'); return 'number'; }
      if (['min', 'max', 'abs', 'round', 'floor', 'ceil'].includes(expr.name)) {
        if ((['min', 'max'].includes(expr.name) ? values.length < 1 : values.length !== 1) || values.some(value => value !== 'number')) throw new Error(`${expr.name} requires numbers`);
        return 'number';
      }
      const plugin = environment.conditions?.[expr.name];
      if (!plugin || plugin.args.length !== values.length || plugin.args.some((type, index) => type !== values[index])) throw new Error(`Unknown or mismatched pure condition ${expr.name}`);
      return plugin.returns;
    }
  }
}

export function evaluateExpression(expr: Expr, values: { progress?: Record<Id, Scalar>; local?: Record<Id, Scalar>; longTerm?: Record<Id, Scalar>; input?: string }): Scalar {
  switch (expr.kind) {
    case 'literal': return expr.value;
    case 'input': if (values.input === undefined) throw new Error('input is unavailable'); return values.input;
    case 'variable': { const value = values[expr.scope]?.[expr.id]; if (value === undefined) throw new Error(`Unknown variable ${expr.id}`); return value; }
    case 'unary': { const value = evaluateExpression(expr.value, values); if (expr.op === '!') { if (typeof value !== 'boolean') throw new Error('Expected boolean'); return !value; } if (typeof value !== 'number') throw new Error('Expected number'); return expr.op === '-' ? -value : value; }
    case 'binary': {
      const left = evaluateExpression(expr.left, values);
      if (expr.op === '&&' && left === false) return false;
      if (expr.op === '||' && left === true) return true;
      const right = evaluateExpression(expr.right, values);
      if (['&&', '||'].includes(expr.op) && (typeof left !== 'boolean' || typeof right !== 'boolean')) throw new Error('Logical operation requires booleans');
      if (['==', '!='].includes(expr.op) && typeof left !== typeof right) throw new Error('Equality requires the same type');
      if (['<', '<=', '>', '>=', '-', '*', '/', '%'].includes(expr.op) && (typeof left !== 'number' || typeof right !== 'number')) throw new Error('Numeric operation requires numbers');
      if (expr.op === '+' && !(typeof left === 'number' && typeof right === 'number' || typeof left === 'string' && typeof right === 'string')) throw new Error('+ requires two numbers or two strings');
      let result: Scalar;
      switch (expr.op) {
        case '&&': result = Boolean(left && right); break;
        case '||': result = Boolean(left || right); break;
        case '==': result = left === right; break;
        case '!=': result = left !== right; break;
        case '+': result = typeof left === 'string' && typeof right === 'string' ? left + right : Number(left) + Number(right); break;
        case '-': result = Number(left) - Number(right); break;
        case '*': result = Number(left) * Number(right); break;
        case '/': if (right === 0) throw new Error('Division by zero'); result = Number(left) / Number(right); break;
        case '%': if (right === 0) throw new Error('Division by zero'); result = Number(left) % Number(right); break;
        case '<': result = Number(left) < Number(right); break;
        case '<=': result = Number(left) <= Number(right); break;
        case '>': result = Number(left) > Number(right); break;
        case '>=': result = Number(left) >= Number(right); break;
      }
      if (typeof result === 'number' && !Number.isFinite(result)) throw new Error('Non-finite expression result');
      return result;
    }
    case 'call': {
      const args = expr.args.map(value => evaluateExpression(value, values));
      const [first] = args;
      switch (expr.name) {
        case 'number': { const value = typeof first === 'boolean' ? Number(first) : Number(first); if (!Number.isFinite(value) || (typeof first === 'string' && !first.trim())) throw new Error('Cannot convert to number'); return value; }
        case 'string': return String(first);
        case 'boolean': if (typeof first === 'string') { if (first !== 'true' && first !== 'false') throw new Error('Cannot convert to boolean'); return first === 'true'; } return Boolean(first);
        case 'len': return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(first))].length;
        case 'min': return Math.min(...args.map(Number));
        case 'max': return Math.max(...args.map(Number));
        case 'abs': return Math.abs(Number(first));
        case 'round': return Math.round(Number(first));
        case 'floor': return Math.floor(Number(first));
        case 'ceil': return Math.ceil(Number(first));
        default: throw new Error(`Condition ${expr.name} requires its plugin`);
      }
    }
  }
}

export function variableReads(expr: Expr): Extract<Expr, { kind: 'variable' }>[] {
  switch (expr.kind) {
    case 'variable': return [expr];
    case 'unary': return variableReads(expr.value);
    case 'binary': return [...variableReads(expr.left), ...variableReads(expr.right)];
    case 'call': return expr.args.flatMap(variableReads);
    default: return [];
  }
}
