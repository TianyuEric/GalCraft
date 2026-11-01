import { ExprSchema, type CommandSpec, type Expr, type FieldSpec, type Id } from '@galcraft/contracts';
import { createCommandRegistry } from './catalog.js';
import { applyTextEdits, type TextEdit } from './editing.js';
import { parse, type ParseInput, type ValueNode } from './parser.js';
import { parseExpression, printExpression } from './expression.js';
import { dialogueInterpolations } from './interpolation.js';

export function rewriteExpressionIds(expression: Expr, mapping: Record<Id, Id>, scopes: Record<Id, 'progress'|'local'|'longTerm'> = {}): Expr {
  switch (expression.kind) {
    case 'variable': return { ...expression, id: mapping[expression.id] ?? expression.id, scope: scopes[expression.id] ?? expression.scope };
    case 'unary': return { ...expression, value: rewriteExpressionIds(expression.value, mapping,scopes) };
    case 'binary': return { ...expression, left: rewriteExpressionIds(expression.left, mapping,scopes), right: rewriteExpressionIds(expression.right, mapping,scopes) };
    case 'call': return { ...expression, args: expression.args.map(value => rewriteExpressionIds(value, mapping,scopes)) };
    default: return expression;
  }
}
export function scriptOwnedIds(input: ParseInput): Id[] {
  const parsed = parse(input); if (parsed.issues.some(issue => issue.severity === 'error')) throw new Error('脚本语法无效，无法枚举身份');
  return [...new Set(parsed.cst.flatMap(node => {
    const args = node.object!.value as Record<string, any>;
    const definitions = commandOwnedIds(node.command, args);
    return [node.id!, ...definitions.filter(Boolean)];
  }))];
}
export function commandOwnedIds(command: string, args: Record<string, any>): Id[] {
  return (command === 'label' ? [args.labelId] : ['changeBg', 'changeFigure', 'changeIllustration'].includes(command) && (!args.op || args.op === 'show') ? [args.objectId]
    : ['setAnimation', 'setComplexAnimation'].includes(command) ? [args.animationId]
    : command === 'pixi' ? [args.effectId] : command === 'playEffect' && args.op !== 'stop' ? [args.soundId]
      : command === 'choose' ? (args.options ?? []).map((option: any) => option.id) : []).filter((value: unknown): value is Id => typeof value === 'string');
}
export function rewriteFieldReferences(args: Record<string, any>, fields: FieldSpec[], mapping: Record<Id, Id>): Record<string, any> {
  const visit = (value: any, field: FieldSpec): any => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'object' && typeof value.binding === 'string') return value;
    if (field.type === 'ref' && typeof value === 'string') return mapping[value] ?? value;
    if (field.type === 'expression') return rewriteExpressionIds(ExprSchema.parse(value), mapping);
    if (field.type === 'array' && field.item) return value.map((item: any) => visit(item, field.item!));
    if (field.type === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => { const child = field.children?.find(child => child.path === key); return [key, child ? visit(item, child) : item]; }));
    return value;
  };
  return Object.fromEntries(Object.entries(args).map(([key, value]) => { const field = fields.find(field => field.path === key); return [key, field ? visit(value, field) : value]; }));
}
export function rewriteCommandReferences(command: string, args: Record<string, any>, mapping: Record<Id, Id>, registry: ReadonlyMap<string, CommandSpec>): Record<string, any> {
  const spec = registry.get(command); if (!spec) throw new Error(`缺少指令引用描述：${command}`);
  const result = rewriteFieldReferences(args, spec.fields, mapping);
  if (command === 'characterDifference' && typeof args.differenceId === 'string') result.differenceId = mapping[args.differenceId] ?? args.differenceId;
  if (command === 'say' && args.voiceByLocale) result.voiceByLocale = Object.fromEntries(Object.entries(args.voiceByLocale).map(([locale, id]) => [locale, typeof id === 'string' ? mapping[id] ?? id : id]));
  if (command === 'callScene' && args.parameters) result.parameters = Object.fromEntries(Object.entries(args.parameters).map(([key, value]) => [mapping[key] ?? key, ExprSchema.safeParse(value).success ? rewriteExpressionIds(value as Expr, mapping) : value]));
  return result;
}
export function rewriteScriptReferences(input: ParseInput, mapping: Record<Id, Id>, engineVersion: string, plugins: CommandSpec[] = [], scopes: Record<Id,'progress'|'local'|'longTerm'> = {}): string {
  const parsed = parse(input), registry = createCommandRegistry(engineVersion, plugins), edits: TextEdit[] = [];
  const replace = (node: ValueNode, text: string) => { if (text !== input.text.slice(node.start, node.end)) edits.push({ start: node.start, end: node.end, oldText: input.text.slice(node.start, node.end), text }); };
  const visit = (node: ValueNode, spec: FieldSpec) => {
    if (spec.type === 'ref' && typeof node.value === 'string' && mapping[node.value]) replace(node, JSON.stringify(mapping[node.value]));
    else if (node.kind === 'expression' || spec.type === 'expression' && ExprSchema.safeParse(node.value).success) replace(node, `expr(${JSON.stringify(printExpression(rewriteExpressionIds(node.value as Expr, mapping,scopes)))})`);
    else if (spec.type === 'array' && spec.item) for (const item of node.items ?? []) visit(item, spec.item);
    else if (spec.type === 'object') for (const field of node.fields ?? []) { const child = spec.children?.find(value => value.path === field.key); if (child) visit(field.valueNode, child); }
  };
  for (const node of parsed.cst) {
    if (!node.valid || !node.object) continue;
    const spec = registry.get(node.command);
    if (!spec) {
      const contains = (value:unknown):boolean => typeof value==='string'?Boolean(mapping[value]):Array.isArray(value)?value.some(contains):Boolean(value&&typeof value==='object'&&Object.values(value).some(contains));
      if(contains(node.object.value))throw new Error(`Missing reference contract for ${node.command}`);continue;
    }
    if (node.id && mapping[node.id]) edits.push({ start: node.idStart!, end: node.idStart! + node.id.length, oldText: node.id, text: mapping[node.id]! });
    for (const field of node.fields) {
      const args=node.object?.value as Record<string,any>;
      if(field.key==='scope'&&typeof args.variableId==='string'&&scopes[args.variableId])replace(field.valueNode,JSON.stringify(scopes[args.variableId]));
      if(field.key==='receiver') {const receiver=args.receiver;if(receiver&&typeof receiver.variableId==='string'&&scopes[receiver.variableId]){const scope=field.valueNode.fields?.find(field=>field.key==='scope');if(scope)replace(scope.valueNode,JSON.stringify(scopes[receiver.variableId]));}}
      if (node.command === 'say' && field.key === 'text') {
        const rewriteText = (value: ValueNode): void => {
          if (typeof value.value === 'string') {
            let rewritten = '', offset = 0;
            for (const match of dialogueInterpolations(value.value)) {
              rewritten += value.value.slice(offset, match.start); offset = match.end;
              const original = value.value.slice(match.start, match.end);
              if (match.source === null || !match.closed) { rewritten += original; continue; }
              const parsedExpression = parseExpression(match.source); if (!parsedExpression.ok) { rewritten += original; continue; }
              const next = rewriteExpressionIds(parsedExpression.expr,mapping,scopes);
              rewritten += JSON.stringify(next) === JSON.stringify(parsedExpression.expr) ? original : `{{${printExpression(next)}}}`;
            }
            rewritten += value.value.slice(offset);
            if (rewritten !== value.value) replace(value,JSON.stringify(rewritten));
          } else { for (const child of value.fields ?? []) rewriteText(child.valueNode); for (const child of value.items ?? []) rewriteText(child); }
        }; rewriteText(field.valueNode);
      }
      const description = spec.fields.find(value => value.path === field.key); if (description) visit(field.valueNode, description);
      if (node.command === 'characterDifference' && field.key === 'differenceId' && typeof field.valueNode.value === 'string' && mapping[field.valueNode.value]) replace(field.valueNode, JSON.stringify(mapping[field.valueNode.value]));
      if (node.command === 'say' && field.key === 'voiceByLocale') for (const voice of field.valueNode.fields ?? []) {
        if (typeof voice.valueNode.value === 'string' && mapping[voice.valueNode.value]) replace(voice.valueNode, JSON.stringify(mapping[voice.valueNode.value]));
      }
      if (node.command === 'callScene' && field.key === 'parameters') for (const parameter of field.valueNode.fields ?? []) {
        if (mapping[parameter.key]) edits.push({ start: parameter.keyStart, end: parameter.keyEnd, oldText: input.text.slice(parameter.keyStart, parameter.keyEnd), text: JSON.stringify(mapping[parameter.key]) });
        if (parameter.valueNode.kind === 'expression') replace(parameter.valueNode, `expr(${JSON.stringify(printExpression(rewriteExpressionIds(parameter.valueNode.value as Expr, mapping,scopes)))})`);
      }
    }
  }
  return applyTextEdits(input.text, edits);
}
