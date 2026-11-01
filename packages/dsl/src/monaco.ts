import { createId } from '@galcraft/contracts';
import type { CommandSpec, FieldSpec, Id, Issue, Ref, Revision, Variable } from '@galcraft/contracts';
import { fieldSpec } from './catalog.js';
import type { FieldNode, ParseResult, StatementNode, ValueNode } from './parser.js';
import type { LanguageService } from './service.js';

export const languageId = 'galcraft';
export const monarchLanguage = {
  defaultToken: '',
  tokenizer: { root: [
    [/\/\/.*$/, 'comment'], [/\/\*/, 'comment', '@comment'],
    [/@(?:[A-Za-z0-9]{6}|[0-9a-f-]{36})(?![A-Za-z0-9-])/, 'annotation'], [/\bexpr(?=\s*\()/, 'keyword'],
    [/"(?:\\.|[^"\\])*"/, 'string'], [/\b(?:true|false|null)\b/, 'keyword'],
    [/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
    [/[A-Za-z_][A-Za-z0-9_-]*(?:[./][A-Za-z_][A-Za-z0-9_-]*)*(?=\s*\{)/, 'type.identifier'],
    [/[A-Za-z_][A-Za-z0-9_-]*(?=\s*:)/, 'attribute.name'],
    [/[{}\[\]():,;@]/, 'delimiter'],
  ], comment: [[/[^*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/\*/, 'comment']] },
} as const;
export type SemanticToken = { start: number; end: number; type: 'command' | 'unknownCommand' | 'reference' | 'invalidReference' | 'variableProgress' | 'variableLocal' | 'variableLongTerm' | 'expression'; revision: Revision };
export type Completion = { label: string; insertText: string; detail: string; start: number; end: number };
export type Hover = { title: string; description: string; type: string; unit: string; default: unknown; source: string; reference?: { id: string; kind: string; detail?: string; missing: boolean } };
export type Marker = { start: number; end: number; code: string; message: string; severity: Issue['severity']; revision: Revision };
export function markers(parsed: ParseResult, issues: readonly Issue[], revision: Revision): Marker[] {
  if (parsed.revision !== revision) return [];
  return issues.filter(issue => issue.source?.documentId === parsed.documentId && issue.source.revision === revision).map(issue => ({
    start: issue.source!.range?.start ?? 0, end: issue.source!.range?.end ?? 0, code: issue.code, message: issue.message, severity: issue.severity, revision,
  }));
}
export function semanticTokens(parsed: ParseResult, registry: ReadonlyMap<string, CommandSpec>, references: readonly Ref[], variables: readonly Variable[], revision: Revision): SemanticToken[] {
  if (parsed.revision !== revision) return [];
  const result: SemanticToken[] = [];
  for (const node of parsed.cst) {
    if (!node.command) continue;
    result.push({ start: node.commandStart, end: node.commandEnd, type: registry.has(node.command) ? 'command' : 'unknownCommand', revision });
    const variableTokens = (value: ValueNode): void => {
      const raw = parsed.text.slice(value.start, value.end);
      for (const match of raw.matchAll(/\b(progress|local|longTerm)(?=\s*\[)/g)) {
        const scope = match[1]!;
        result.push({ start: value.start + match.index, end: value.start + match.index + scope.length,
          type: scope === 'local' ? 'variableLocal' : scope === 'longTerm' ? 'variableLongTerm' : 'variableProgress', revision });
      }
    };
    const visit = (value: ValueNode, key = ''): void => {
      if (value.kind === 'expression') {
        result.push({ start: value.start, end: value.start + 4, type: 'expression', revision });
        variableTokens(value);
      } else if (node.command === 'say' && key === 'text' && value.kind === 'string') {
        const raw = parsed.text.slice(value.start, value.end);
        for (const match of raw.matchAll(/(?<!\\)\{\{[^}]+\}\}/g)) {
          const start = value.start + match.index;
          variableTokens({ ...value, start, end: start + match[0].length });
        }
      }
      if (typeof value.value === 'string' && /Id$|^voice$|^avatar$/.test(key)) result.push({ start: value.start, end: value.end,
        type: references.some(ref => ref.id === value.value) || variables.some(item => item.id === value.value) ? 'reference' : 'invalidReference', revision });
      for (const field of value.fields ?? []) visit(field.valueNode, field.key);
      for (const item of value.items ?? []) visit(item);
    };
    if (node.object) visit(node.object);
  }
  return result;
}
function statementAt(parsed: ParseResult, offset: number): StatementNode | undefined { return parsed.cst.find(node => offset >= node.start && offset <= node.end); }
function fieldAtOffset(node: ValueNode, offset: number, path: string[] = []): { field: FieldNode; path: string[] } | undefined {
  for (const field of node.fields ?? []) {
    if (offset < field.keyStart || offset > field.valueNode.end) continue;
    const fieldPath = [...path, field.key];
    if (offset >= field.valueNode.start) {
      const nested = fieldAtOffset(field.valueNode, offset, fieldPath);
      if (nested) return nested;
    }
    return { field, path: fieldPath };
  }
  for (const [index, item] of (node.items ?? []).entries()) {
    if (offset >= item.start && offset <= item.end) return fieldAtOffset(item, offset, [...path, String(index)]);
  }
  return undefined;
}
function objectAtOffset(node: ValueNode, offset: number, path: string[] = []): { node: ValueNode; path: string[] } | undefined {
  for (const field of node.fields ?? []) {
    const value = field.valueNode;
    if (offset >= value.start && offset <= value.end && (value.kind === 'object' || value.kind === 'array')) {
      return objectAtOffset(value, offset, [...path, field.key]) ?? (value.kind === 'object' ? { node: value, path: [...path, field.key] } : undefined);
    }
  }
  for (const [index, item] of (node.items ?? []).entries()) {
    if (offset >= item.start && offset <= item.end && (item.kind === 'object' || item.kind === 'array')) {
      return objectAtOffset(item, offset, [...path, String(index)]) ?? (item.kind === 'object' ? { node: item, path: [...path, String(index)] } : undefined);
    }
  }
  return node.kind === 'object' && offset >= node.start && offset <= node.end ? { node, path } : undefined;
}
export type ConditionMetadata = { key: string; fields: FieldSpec[] };
const conditionSignature = (condition: ConditionMetadata) => `${condition.key}(${condition.fields.map(field => `${field.path}: ${field.type === 'ref' || field.type === 'enum' ? 'string' : field.type}`).join(', ')}): boolean`;
export function completions(parsed: ParseResult, offset: number, registry: ReadonlyMap<string, CommandSpec>, references: readonly (Ref & { name: string })[], variables: readonly Variable[], newId: () => Id, pluginConditions: readonly ConditionMetadata[] = []): Completion[] {
  const statement = statementAt(parsed, offset);
  if (!statement || offset <= statement.commandEnd) return [...registry.values()].map(spec => ({ label: spec.name, insertText: `${spec.key} { ${spec.fields.filter(field => field.required).map(field => `${field.path}: ${field.type === 'string' ? '""' : field.type === 'array' ? '[]' : 'null'}`).join(', ')} } @${newId()};`, detail: spec.description, start: offset, end: offset }));
  const spec = registry.get(statement.command);
  if (!spec) return [];
  const container = statement.object && objectAtOffset(statement.object, offset);
  const preceding = parsed.text.slice(container?.node.start ?? statement.object?.start ?? statement.start, offset);
  const currentField = statement.object && fieldAtOffset(statement.object, offset);
  const expressionString = /\bexpr\s*\(\s*"(?:\\.|[^"\\])*$/.test(preceding);
  const expressionSuggestions = (): Completion[] => {
    const encode = (value: string) => expressionString ? value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') : value;
    const prefix = /[A-Za-z_][A-Za-z0-9_.\/-]*$/.exec(preceding)?.[0] ?? '';
    const start = offset - prefix.length;
    return [
      ...variables.map(variable => ({label:variable.name,insertText:encode(`${variable.scope}["${variable.id}"]`),detail:`${variable.scope} ${variable.type}`,start,end:offset})),
      ...['min','max','abs','round','floor','ceil','len','number','string','boolean'].map(name=>({label:name,insertText:`${name}()`,detail:'Pure function',start,end:offset})),
      ...pluginConditions.map(condition=>({label:condition.key,insertText:encode(`${condition.key}(${condition.fields.map(field=>JSON.stringify(field.default ?? (['string','ref','enum'].includes(field.type)?'':field.type==='boolean'?false:0))).join(', ')})`),detail:conditionSignature(condition),start,end:offset})),
    ];
  };
  if (expressionString || currentField?.field.valueNode.kind === 'expression' && offset >= currentField.field.valueNode.start) return expressionSuggestions();
  const fieldMatch = /([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(?:"[^"\n]*)?$/.exec(preceding);
  if (fieldMatch) {
    const field = fieldSpec(spec, [...(container?.path ?? []), fieldMatch[1]!].join('.'));
    if (field?.enumValues) return field.enumValues.map(value => ({ label: value, insertText: `"${value}"`, detail: field.description, start: offset, end: offset }));
    if (field?.refKind) return references.filter(ref => ref.kind === field.refKind).map(ref => ({ label: ref.name, insertText: `"${ref.id}"`, detail: `${ref.kind} ${ref.id}`, start: offset, end: offset }));
    if (field?.type === 'expression') return expressionSuggestions();
  }
  const parent = container?.path.length ? fieldSpec(spec, container.path.join('.')) : undefined;
  const fields = parent?.children ?? spec.fields;
  return fields.filter(field => !container?.node.fields?.some(item => item.key === field.path)).map(field => ({ label: field.path, insertText: `${field.path}: ${field.default === null ? 'null' : JSON.stringify(field.default)}`, detail: `${field.type} ${field.unit} — ${field.description}`, start: offset, end: offset }));
}
export function hover(parsed: ParseResult, offset: number, registry: ReadonlyMap<string, CommandSpec>, pluginConditions: readonly ConditionMetadata[] = [], references: readonly (Ref & { name: string; detail?: string })[] = [], locale = 'en'): Hover | null {
  const statement = statementAt(parsed, offset);
  if (!statement) return null;
  const spec = registry.get(statement.command);
  if (!spec) return null;
  if (statement.id && statement.idStart !== null && offset >= statement.idStart && offset <= statement.idStart + statement.id.length + 1) {
    return {title:spec.name,description:statement.raw.split('\n')[0]!.slice(0,180),type:'statement',unit:'none',default:null,source:spec.key,reference:{id:statement.id,kind:'statement',missing:false}};
  }
  const current = statement.object && fieldAtOffset(statement.object, offset);
  const prefix = current && parsed.text.slice(current.field.valueNode.start, offset);
  const inExpression = current?.field.valueNode.kind === 'expression' || current?.field.key === 'text' && prefix && prefix.lastIndexOf('{{') > prefix.lastIndexOf('}}');
  if (inExpression) for (const condition of pluginConditions) for (const match of parsed.text.slice(statement.start, statement.end).matchAll(new RegExp(condition.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s*\\()', 'g'))) {
    const start = statement.start + match.index;
    if (offset >= start && offset <= start + condition.key.length) return {title:condition.key,description:conditionSignature(condition),type:'boolean',unit:'none',default:Object.fromEntries(condition.fields.map(field=>[field.path,field.default])),source:condition.key.split('/')[0]!};
  }
  if (offset >= statement.commandStart && offset <= statement.commandEnd) return { title: spec.name, description: spec.description, type: 'command', unit: 'none', default: null, source: spec.executor };
  const field = statement.object && fieldAtOffset(statement.object, offset);
  const definition = field && fieldSpec(spec, field.path.join('.'));
  if (definition?.refKind && field && typeof field.field.valueNode.value === 'string' && offset >= field.field.valueNode.start && offset <= field.field.valueNode.end) {
    const id=field.field.valueNode.value, reference=references.find(item=>item.kind===definition.refKind&&item.id===id);
    const kinds: Record<string,[string,string,string]>={asset:['素材','Asset','素材'],character:['角色','Character','キャラクター'],scene:['场景','Scene','シーン'],object:['舞台对象','Stage object','舞台オブジェクト'],variable:['变量','Variable','変数'],label:['标签','Label','ラベル'],preset:['演出预设','Performance preset','演出プリセット']};
    const kind=kinds[definition.refKind]?.[locale==='zh-CN'?0:locale==='ja'?2:1]??definition.refKind;
    return { title:reference?.name??(locale==='zh-CN'?'引用不可用':locale==='ja'?'参照を利用できません':'Reference unavailable'),description:kind,type:'reference',unit:'none',default:null,source:spec.key,reference:{id,kind,detail:reference?.detail,missing:!reference}};
  }
  return definition ? { title: definition.label, description: definition.description, type: definition.type, unit: definition.unit, default: definition.default, source: spec.key } : null;
}

type Model = { getValue(): string; getOffsetAt(position: { lineNumber: number; column: number }): number;
  getPositionAt(offset: number): { lineNumber: number; column: number }; uri: unknown };
type Disposable = { dispose(): void };
type MonacoHost = { languages: {
  register(input: { id: string }): void;
  setMonarchTokensProvider(id: string, language: unknown): Disposable;
  registerCompletionItemProvider(id: string, provider: unknown): Disposable;
  registerHoverProvider(id: string, provider: unknown): Disposable;
  registerDefinitionProvider(id: string, provider: unknown): Disposable;
  registerDocumentSemanticTokensProvider(id: string, provider: unknown): Disposable;
}; editor: { setModelMarkers(model: Model, owner: string, markers: unknown[]): void } };
export type MonacoContext = { documentId: Id; revision: Revision; registry: ReadonlyMap<string, CommandSpec>; locale?: string;
  references: readonly (Ref & { name: string; detail?: string; definition?: { uri: unknown; range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } } })[];
  variables: readonly Variable[]; issues: readonly Issue[]; pluginConditions?: readonly ConditionMetadata[] };
export function connectMonaco(host: MonacoHost, service: LanguageService, context: (model: Model) => MonacoContext): { updateMarkers(model: Model): void; dispose(): void } {
  host.languages.register({ id: languageId });
  const read = (model: Model) => {
    const current = context(model);
    return { current, parsed: service.parse({ documentId: current.documentId, revision: current.revision, text: model.getValue() }) };
  };
  const span = (model: Model, start: number, end: number) => {
    const from = model.getPositionAt(start); const to = model.getPositionAt(end);
    return { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column };
  };
  const disposables = [
    host.languages.setMonarchTokensProvider(languageId, monarchLanguage),
    host.languages.registerCompletionItemProvider(languageId, { triggerCharacters: [' ', ':', '"', '.', '/'], provideCompletionItems(model: Model, position: { lineNumber: number; column: number }) {
      const { current, parsed } = read(model);
      const offset = model.getOffsetAt(position);
      return { suggestions: completions(parsed, offset, current.registry, current.references, current.variables, () => createId([parsed, current.references, current.variables]), current.pluginConditions).map(item => ({
        label: item.label, insertText: item.insertText, detail: item.detail, kind: 18, range: span(model, item.start, item.end),
      })) };
    } }),
    host.languages.registerHoverProvider(languageId, { provideHover(model: Model, position: { lineNumber: number; column: number }) {
      const { current, parsed } = read(model);
      const info = hover(parsed, model.getOffsetAt(position), current.registry, current.pluginConditions, current.references, current.locale);
      if(info?.reference){const escape=(value:string)=>value.replace(/[\\`*_{}\[\]<>]/g,'\\$&');const ref=info.reference;
        return {contents:[{value:`**${escape(info.title)}**\n\n${escape(info.description)}${ref.detail?`\n\n${escape(ref.detail)}`:''}\n\nID: \`${ref.id}\``}]};
      }
      return info ? { contents: [{ value: `**${info.title}** — ${info.type}\n\n${info.description}\n\nDefault: ${JSON.stringify(info.default)}; unit: ${info.unit}; source: ${info.source}` }] } : null;
    } }),
    host.languages.registerDefinitionProvider(languageId, { provideDefinition(model: Model, position: { lineNumber: number; column: number }) {
      const { current, parsed } = read(model);
      const offset = model.getOffsetAt(position);
      const node = statementAt(parsed, offset);
      const field = node?.object && fieldAtOffset(node.object, offset);
      const target = current.references.find(item => item.id === field?.field.valueNode.value)?.definition;
      return target ? { uri: target.uri, range: target.range } : null;
    } }),
    host.languages.registerDocumentSemanticTokensProvider(languageId, { getLegend: () => ({ tokenTypes: ['command', 'unknownCommand', 'reference', 'invalidReference', 'variableProgress', 'variableLocal', 'variableLongTerm', 'expression'], tokenModifiers: [] }),
      provideDocumentSemanticTokens(model: Model) {
        const { current, parsed } = read(model);
        const tokens = semanticTokens(parsed, current.registry, current.references, current.variables, current.revision)
          .map(token => ({ ...token, position: model.getPositionAt(token.start) }))
          .sort((a, b) => a.position.lineNumber - b.position.lineNumber || a.position.column - b.position.column);
        const types = ['command', 'unknownCommand', 'reference', 'invalidReference', 'variableProgress', 'variableLocal', 'variableLongTerm', 'expression'];
        const encoded: number[] = [];
        let line = 0; let column = 0;
        for (const token of tokens) {
          const nextLine = token.position.lineNumber - 1;
          const nextColumn = token.position.column - 1;
          encoded.push(nextLine - line, nextLine === line ? nextColumn - column : nextColumn, token.end - token.start, types.indexOf(token.type), 0);
          line = nextLine; column = nextColumn;
        }
        return { data: new Uint32Array(encoded) };
      }, releaseDocumentSemanticTokens() {},
    }),
  ];
  return { updateMarkers(model) {
    const { current, parsed } = read(model);
    host.editor.setModelMarkers(model, languageId, markers(parsed, current.issues, current.revision).map(marker => ({
      ...span(model, marker.start, marker.end), message: marker.message, code: marker.code,
      severity: marker.severity === 'error' ? 8 : marker.severity === 'warning' ? 4 : 2,
    })));
  }, dispose() { for (const disposable of disposables) disposable.dispose(); } };
}
