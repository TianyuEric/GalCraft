import { IdSchema } from '@galcraft/contracts';
import type { Id, Issue, Json, Source } from '@galcraft/contracts';
import { parseExpression } from './expression.js';

export type Token = { kind: 'identifier' | 'string' | 'number' | 'punctuation' | 'comment' | 'whitespace' | 'invalid'; text: string; start: number; end: number };
export type SyntaxNode = { kind: string; start: number; end: number; children: SyntaxNode[]; leadingTrivia: string; trailingTrivia: string };
export type ValueNode = SyntaxNode & { value: unknown; fields?: FieldNode[]; items?: ValueNode[] };
export type FieldNode = SyntaxNode & { key: string; keyStart: number; keyEnd: number; colon: number; valueNode: ValueNode; commaStart: number | null; commaEnd: number | null };
export type StatementNode = SyntaxNode & { command: string; commandStart: number; commandEnd: number; id: Id | null; idStart: number | null; object: ValueNode | null; fields: FieldNode[]; raw: string; valid: boolean };
export type ParseInput = { documentId: Id; revision: number; text: string };
export type ParsedStatement = { id: Id | null; command: string; args: Record<string, unknown>; source: Source };
export type ParseResult = { documentId: Id; revision: number; text: string; tokens: Token[]; cst: StatementNode[]; statements: ParsedStatement[]; issues: Issue[] };

const ident = /[A-Za-z_][A-Za-z0-9_-]*/y;
const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

function* lexSteps(text: string): Generator<void, Token[]> {
  const tokens: Token[] = [];
  for (let i = 0; i < text.length;) {
    if (tokens.length && tokens.length % 512 === 0) yield;
    const start = i;
    let kind: Token['kind'];
    if (/\s/.test(text[i]!)) { while (i < text.length && /\s/.test(text[i]!)) i++; kind = 'whitespace'; }
    else if (text.startsWith('//', i)) { i = text.indexOf('\n', i); if (i < 0) i = text.length; kind = 'comment'; }
    else if (text.startsWith('/*', i)) { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; kind = end < 0 ? 'invalid' : 'comment'; }
    else if (text[i] === '"') {
      i++;
      let closed = false;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i++] === '"') { closed = true; break; }
      }
      kind = closed ? 'string' : 'invalid';
    } else {
      ident.lastIndex = i;
      number.lastIndex = i;
      const word = ident.exec(text);
      const numeric = number.exec(text);
      if (word) { i = ident.lastIndex; kind = 'identifier'; }
      else if (numeric) { i = number.lastIndex; kind = 'number'; }
      else if ('{}[]:,.@;()/+-*%!<>=&|'.includes(text[i]!)) { i++; kind = 'punctuation'; }
      else { i++; kind = 'invalid'; }
    }
    tokens.push({ kind, text: text.slice(start, i), start, end: i });
  }
  return tokens;
}
export function lex(text: string): Token[] {
  const steps = lexSteps(text);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

function issue(code: string, message: string, input: ParseInput, start: number, end: number, statementId?: Id): Issue {
  return { code, severity: 'error', message, owner: 'M03', source: { documentId: input.documentId, revision: input.revision, statementId, range: { start, end } }, related: [], actions: ['edit'] };
}
class Reader {
  index = 0;
  readonly issues: Issue[] = [];
  constructor(readonly input: ParseInput, readonly tokens: Token[]) {}
  peek(): Token | undefined { let i = this.index; while (this.tokens[i] && ['whitespace', 'comment'].includes(this.tokens[i]!.kind)) i++; return this.tokens[i]; }
  take(): Token | undefined { while (this.tokens[this.index] && ['whitespace', 'comment'].includes(this.tokens[this.index]!.kind)) this.index++; return this.tokens[this.index++]; }
  accept(text: string): Token | undefined { if (this.peek()?.text === text) return this.take(); return undefined; }
  expect(text: string): Token { const token = this.accept(text); if (token) return token; const found = this.peek(); throw { start: found?.start ?? this.input.text.length, end: found?.end ?? this.input.text.length, message: `Expected ${text}` }; }
  fail(message: string, token?: Token): never { throw { start: token?.start ?? this.input.text.length, end: token?.end ?? this.input.text.length, message }; }
  parseValue(): ValueNode {
    const token = this.take();
    if (!token) return this.fail('Expected value');
    const base = { start: token.start, end: token.end, children: [] as SyntaxNode[], leadingTrivia: '', trailingTrivia: '' };
    if (token.text === '{') {
      const fields: FieldNode[] = [];
      while (this.peek() && this.peek()!.text !== '}') {
        const key = this.take()!;
        if (key.kind !== 'identifier' && key.kind !== 'string') this.fail('Expected object key', key);
        let name: string;
        try { name = key.kind === 'string' ? JSON.parse(key.text) as string : key.text; }
        catch { this.fail('Invalid object key', key); }
        const colon = this.expect(':');
        const valueNode = this.parseValue();
        const comma = this.accept(',');
        const field: FieldNode = { ...base, kind: 'field', start: key.start, end: comma?.end ?? valueNode.end, children: [valueNode], key: name!, keyStart: key.start, keyEnd: key.end, colon: colon.start, valueNode, commaStart: comma?.start ?? null, commaEnd: comma?.end ?? null };
        fields.push(field);
        if (!comma && this.peek()?.text !== '}') this.fail('Expected comma or }', this.peek());
      }
      const close = this.expect('}');
      const value: Record<string, unknown> = {};
      for (const field of fields) {
        if (Object.hasOwn(value, field.key)) this.issues.push(issue('FIELD_DUPLICATE', `Duplicate field ${field.key}`, this.input, field.keyStart, field.keyEnd));
        value[field.key] = field.valueNode.value;
      }
      return { ...base, kind: 'object', end: close.end, children: fields, fields, value };
    }
    if (token.text === '[') {
      const items: ValueNode[] = [];
      while (this.peek() && this.peek()!.text !== ']') {
        items.push(this.parseValue());
        if (!this.accept(',') && this.peek()?.text !== ']') this.fail('Expected comma or ]', this.peek());
      }
      const close = this.expect(']');
      return { ...base, kind: 'array', end: close.end, children: items, items, value: items.map(item => item.value) };
    }
    if (token.kind === 'string') {
      try { return { ...base, kind: 'string', value: JSON.parse(token.text) as string }; }
      catch { this.fail('Invalid string escape', token); }
    }
    if (token.kind === 'number') {
      const value = Number(token.text);
      if (!Number.isFinite(value)) this.fail('Number must be finite', token);
      return { ...base, kind: 'number', value };
    }
    if (token.text === 'true' || token.text === 'false' || token.text === 'null') return { ...base, kind: 'literal', value: token.text === 'null' ? null : token.text === 'true' };
    if (token.text === 'expr') {
      this.expect('(');
      const body = this.take();
      if (!body || body.kind !== 'string') this.fail('Expected expression string', body);
      const close = this.expect(')');
      let expression: string;
      try { expression = JSON.parse(body.text) as string; } catch { this.fail('Invalid expression string', body); }
      const parsed = parseExpression(expression!);
      if (!parsed.ok) this.issues.push(issue('EXPR_SYNTAX', parsed.message, this.input, body.start, body.end));
      return { ...base, kind: 'expression', end: close.end, value: parsed.ok ? parsed.expr : null };
    }
    return this.fail('Expected value', token);
  }
  parseStatement(): StatementNode {
    const first = this.take();
    if (!first || first.kind !== 'identifier') this.fail('Expected command', first);
    let command = first!.text;
    let commandEnd = first!.end;
    while (this.peek()?.text === '.' || this.peek()?.text === '/') {
      const separator = this.take()!;
      const part = this.take();
      if (!part || part.kind !== 'identifier') this.fail('Expected command segment', part);
      command += separator.text + part!.text;
      commandEnd = part!.end;
    }
    const object = this.parseValue();
    if (object.kind !== 'object') this.fail('Expected command object', { text: '', kind: 'invalid', start: object.start, end: object.end });
    this.expect('@');
    const idStart = this.peek()?.start ?? null;
    const idParts: string[] = [];
    let idEnd = idStart ?? this.input.text.length;
    while (this.peek() && this.peek()!.text !== ';') {
      const part = this.take()!;
      idParts.push(part.text);
      idEnd = part.end;
    }
    if (!this.peek()) this.fail('Expected statement ID and semicolon');
    const rawId = idParts.join('');
    let id: Id | null = null;
    if (IdSchema.safeParse(rawId).success) id = rawId;
    else this.issues.push(issue('STATEMENT_ID', rawId ? 'Invalid statement ID' : 'Missing statement ID', this.input, idStart ?? idEnd, idEnd));
    const semi = this.expect(';');
    return { kind: 'statement', start: first!.start, end: semi.end, children: [object], leadingTrivia: '', trailingTrivia: '', command, commandStart: first!.start, commandEnd, id, idStart, object, fields: object.fields ?? [], raw: this.input.text.slice(first!.start, semi.end), valid: id !== null };
  }
}

export function* parseSteps(input: ParseInput): Generator<void, ParseResult> {
  const tokens = yield* lexSteps(input.text);
  const reader = new Reader(input, tokens);
  const cst: StatementNode[] = [];
  while (reader.peek()) {
    if (cst.length && cst.length % 32 === 0) yield;
    const startIndex = reader.index;
    const start = reader.peek()!.start;
    try {
      const node = reader.parseStatement();
      node.leadingTrivia = input.text.slice(tokens[startIndex]?.start ?? 0, node.start);
      cst.push(node);
    } catch (error) {
      const failure = error as { start?: number; end?: number; message?: string };
      const at = Math.max(start, failure.start ?? start);
      reader.issues.push(issue('DSL_SYNTAX', failure.message ?? 'Invalid statement', input, at, failure.end ?? at));
      // A semicolon remains the recovery boundary even when braces are unfinished.
      let end = input.text.length;
      while (reader.peek()) {
        const token = reader.take()!;
        if (token.text === ';') { end = token.end; break; }
      }
      cst.push({ kind: 'unknown', start, end, children: [], leadingTrivia: '', trailingTrivia: '', command: '', commandStart: start, commandEnd: start, id: null, idStart: null, object: null, fields: [], raw: input.text.slice(start, end), valid: false });
    }
  }
  const ids = new Map<Id, StatementNode>();
  for (const node of cst) if (node.id) {
    const previous = ids.get(node.id);
    if (previous) {
      reader.issues.push(issue('STATEMENT_DUPLICATE', 'Duplicate statement ID', input, previous.idStart ?? previous.start, previous.end, node.id));
      reader.issues.push(issue('STATEMENT_DUPLICATE', 'Duplicate statement ID', input, node.idStart ?? node.start, node.end, node.id));
      previous.valid = false; node.valid = false;
    } else ids.set(node.id, node);
  }
  for (let index = 0; index < cst.length; index++) cst[index]!.trailingTrivia = input.text.slice(cst[index]!.end, cst[index + 1]?.start ?? input.text.length);
  return { ...input, tokens, cst, statements: cst.filter(node => node.object).map(node => ({ id: node.id, command: node.command, args: node.object!.value as Record<string, unknown>, source: { documentId: input.documentId, revision: input.revision, ...(node.id ? { statementId: node.id } : {}), range: { start: node.start, end: node.end } } })), issues: reader.issues };
}
export function parse(input: ParseInput): ParseResult {
  const steps = parseSteps(input);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

export function fieldAt(node: ValueNode, path: string[]): FieldNode | undefined {
  const [head, ...rest] = path;
  if (head === undefined) return undefined;
  if (node.kind === 'array' && /^\d+$/.test(head)) return fieldAt(node.items?.[Number(head)] ?? node, rest);
  const field = node.fields?.find(item => item.key === head);
  if (!field) return undefined;
  return rest.length ? fieldAt(field.valueNode, rest) : field;
}

export function jsonValue(value: unknown): value is Json {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(jsonValue);
  return typeof value === 'object' && value !== null && Object.values(value).every(jsonValue);
}
