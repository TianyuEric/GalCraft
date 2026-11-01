import { ExprSchema } from '@galcraft/contracts';
import type { Id, Issue, Json, Patch, Result, Revision, RuntimeState, Source } from '@galcraft/contracts';
import { commandSpec, fieldSpec } from './catalog.js';
import { printExpression } from './expression.js';
import { presentationValue } from './presentation.js';
import { fieldAt, parse } from './parser.js';
import type { FieldNode, ParseResult, StatementNode, ValueNode } from './parser.js';
import type { CommandSpec } from '@galcraft/contracts';

export type FieldPatchInput = { documentId: Id; revision: Revision; statementIds: Id[]; changes: { field: string; op: 'set' | 'inherit'; value: Json }[] };
export type TextEdit = { start: number; end: number; text: string; oldText: string };
export type LocateResult = { documentId: Id; revision: Revision; statementId: Id | null; field: string | null; line: number; column: number; start: number; end: number };
export type FieldExplanation = { fieldPath: string; effective: Json; effectiveKnown: boolean;
  configured: { present: boolean; value: Json }; overridden: boolean;
  layers: { kind: 'template' | 'character' | 'command' | 'namedStyle' | 'state' | 'player'; label: string; value: Json; source: Source | null; styleId: Id | null }[];
  activeLayer: number | null; actions: ('inherit' | 'neutral' | 'locate')[] };

function fail<T>(code: string, message: string, source?: Source): Result<T> {
  const error: Issue = { code, severity: 'error', message, owner: 'M03', ...(source ? { source } : {}), related: [], actions: ['edit', 'compare'] };
  return { ok: false, error, issues: [error] };
}
function ok<T>(value: T): Result<T> { return { ok: true, value, warnings: [] }; }
const own = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function mergeJson(left: Json, right: Json): Json {
  if (!own(left) || !own(right)) return right;
  const merged: Record<string, Json> = { ...left } as Record<string, Json>;
  for (const [key, value] of Object.entries(right)) merged[key] = key in merged ? mergeJson(merged[key]!, value as Json) : value as Json;
  return merged;
}
function scriptValue(value: Json): string {
  const expression = ExprSchema.safeParse(value);
  if (expression.success) return `expr(${JSON.stringify(printExpression(expression.data))})`;
  if (Array.isArray(value)) return `[${value.map(scriptValue).join(', ')}]`;
  if (own(value)) return `{${Object.entries(value).map(([key, entry]) => `${/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key)}:${scriptValue(entry as Json)}`).join(', ')}}`;
  return JSON.stringify(value);
}
function insertion(text: string, object: ValueNode, key: string, value: Json): TextEdit {
  const last = object.fields?.at(-1);
  const at = last?.end ?? object.start + 1;
  const raw = text.slice(object.start, object.end);
  const pretty = raw.includes('\n');
  const firstField = object.fields?.[0];
  const indent = firstField ? text.slice(text.lastIndexOf('\n', firstField.start - 1) + 1, firstField.start) : '  ';
  const content = `${last && last.commaEnd === null ? ',' : ''}${pretty ? `\n${indent}` : last ? ' ' : ''}${key}: ${scriptValue(value)}`;
  return { start: at, end: at, text: content, oldText: '' };
}
function deletion(text: string, object: ValueNode, field: FieldNode): TextEdit[] {
  const fields = object.fields ?? [];
  const index = fields.indexOf(field);
  const prev = fields[index - 1];
  const own = { start: field.start, end: field.end, text: '', oldText: text.slice(field.start, field.end) };
  return field.commaEnd !== null || prev?.commaStart === null || !prev ? [own] : [own, { start: prev.commaStart, end: prev.commaEnd!, text: '', oldText: text.slice(prev.commaStart, prev.commaEnd!) }];
}
export function patchFields(parsed: ParseResult, input: FieldPatchInput): Result<TextEdit[]> {
  if (parsed.documentId !== input.documentId || parsed.revision !== input.revision) return fail('PATCH_STALE', 'Document revision changed');
  const edits: TextEdit[] = [];
  const insertions = new Map<ValueNode, Record<string, Json>>();
  const addInsertion = (object: ValueNode, key: string, value: Json) => {
    const values = insertions.get(object) ?? {};
    values[key] = key in values ? mergeJson(values[key]!, value) : value;
    insertions.set(object, values);
  };
  for (const id of input.statementIds) {
    const node = parsed.cst.find(statement => statement.id === id);
    if (!node?.object || !node.valid) return fail('STATEMENT_MISSING', `Statement ${id} is unavailable`);
    for (const original of input.changes) {
      const change = { ...original, value: presentationValue(node.command, original.field, original.value) };
      const parts = change.field.split('.');
      let object = node.object;
      for (let index = 0; index < parts.length - 1; index++) {
        const part = parts[index]!;
        if (object.kind === 'array' && /^\d+$/.test(part)) {
          const item = object.items?.[Number(part)];
          if (!item) return fail('PATCH_PATH', `Array item ${change.field} is unavailable`);
          object = item;
          continue;
        }
        const nested = object.fields?.find(field => field.key === part);
        if (!nested) {
          if (change.op === 'inherit') { object = null as never; break; }
          const remaining = parts.slice(index);
          let value: Json = change.value;
          for (const name of remaining.slice(1).reverse()) value = { [name]: value };
          addInsertion(object, part, value);
          object = null as never; break;
        }
        if (nested.valueNode.kind !== 'object' && nested.valueNode.kind !== 'array') return fail('PATCH_PATH', `Cannot edit nested field ${change.field}`);
        object = nested.valueNode;
      }
      if (!object) continue;
      const key = parts.at(-1)!;
      if (object.kind === 'array' && /^\d+$/.test(key)) {
        const item = object.items?.[Number(key)];
        if (!item) return fail('PATCH_PATH', `Array item ${change.field} is unavailable`);
        if (change.op === 'set') edits.push({ start: item.start, end: item.end, text: scriptValue(change.value), oldText: parsed.text.slice(item.start, item.end) });
        else {
          const items = object.items!;
          const next = items[Number(key) + 1];
          const prev = items[Number(key) - 1];
          edits.push({ start: item.start, end: item.end, text: '', oldText: parsed.text.slice(item.start, item.end) });
          const gapStart = next ? item.end : prev?.end;
          const gapEnd = next?.start ?? item.start;
          const comma = gapStart === undefined ? -1 : parsed.text.slice(gapStart, gapEnd).indexOf(',');
          if (comma >= 0) edits.push({ start: gapStart! + comma, end: gapStart! + comma + 1, text: '', oldText: ',' });
        }
        continue;
      }
      const field = object.fields?.find(item => item.key === key);
      if (change.op === 'inherit') {
        if (field) edits.push(...deletion(parsed.text, object, field));
      } else if (field) edits.push({ start: field.valueNode.start, end: field.valueNode.end, text: scriptValue(change.value), oldText: parsed.text.slice(field.valueNode.start, field.valueNode.end) });
      else addInsertion(object, key, change.value);
    }
  }
  for (const [object, values] of insertions) {
    const entries = Object.entries(values);
    if (!entries.length) continue;
    const [key, value] = entries[0]!;
    const edit = insertion(parsed.text, object, key, value);
    const pretty = parsed.text.slice(object.start, object.end).includes('\n');
    const first = object.fields?.[0];
    const indent = first ? parsed.text.slice(parsed.text.lastIndexOf('\n', first.start - 1) + 1, first.start) : '  ';
    for (const [nextKey, nextValue] of entries.slice(1)) edit.text += `,${pretty ? `\n${indent}` : ' '}${nextKey}: ${scriptValue(nextValue)}`;
    edits.push(edit);
  }
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  for (let index = 1; index < edits.length; index++) if (edits[index]!.end > edits[index - 1]!.start) return fail('PATCH_OVERLAP', 'Field changes overlap');
  return ok(edits);
}
export function applyTextEdits(text: string, edits: TextEdit[]): string {
  return [...edits].sort((a, b) => b.start - a.start).reduce((value, edit) => value.slice(0, edit.start) + edit.text + value.slice(edit.end), text);
}
export function toDocumentPatch(documentId: Id, edits: TextEdit[]): Patch {
  return { kind: 'text', documentId, edits: edits.map(edit => ({ start: edit.start, end: edit.end, before: edit.oldText, after: edit.text })) };
}
export function locate(parsed: ParseResult, source: Source, fieldPath: string | null = null): LocateResult | null {
  if (parsed.documentId !== source.documentId && !source.statementId) return null;
  const statement = source.statementId ? parsed.cst.find(node => node.id === source.statementId) : null;
  const range = statement ? (fieldPath && statement.object ? fieldAt(statement.object, fieldPath.split('.'))?.valueNode : undefined) ?? statement :
    parsed.documentId === source.documentId ? source.statementId ? { start: 0, end: 0 } : source.revision === parsed.revision && source.range ? source.range : { start: 0, end: 0 } : null;
  if (!range) return null;
  const start = range.start; const end = range.end;
  const prefix = parsed.text.slice(0, start).split('\n');
  return { documentId: parsed.documentId, revision: parsed.revision, statementId: statement?.id ?? null, field: fieldPath,
    line: prefix.length, column: prefix.at(-1)!.length + 1, start, end };
}
export function explainField(parsed: ParseResult, source: Source, fieldPath: string, registry: ReadonlyMap<string, CommandSpec>, previewState: RuntimeState | null): Result<FieldExplanation> {
  const node = parsed.cst.find(item => item.id === source.statementId);
  if (!node?.object) return fail('STATEMENT_MISSING', 'Statement is unavailable');
  const spec = commandSpec(node.command, registry);
  const field = spec && fieldSpec(spec, fieldPath);
  if (!field) return fail('FIELD_UNKNOWN', `Field ${fieldPath} is unavailable`);
  const leaf = fieldAt(node.object, fieldPath.split('.'));
  const configured = leaf?.valueNode.value;
  const args = node.object.value;
  const replaceFigure = node.command === 'changeFigure' && own(args) && args.op === 'replace';
  const inherited = !leaf && (fieldPath.startsWith('effects.') || fieldPath.startsWith('model.') || field.default === null || replaceFigure && ['station', 'z'].includes(fieldPath));
  const configuredSource: Source | null = leaf ? { documentId: parsed.documentId, revision: parsed.revision, statementId: node.id ?? undefined, field: fieldPath, range: { start: leaf.valueNode.start, end: leaf.valueNode.end } } : null;
  const layers: FieldExplanation['layers'] = [];
  if (leaf) layers.push({ kind: 'command', label: spec!.name, value: configured as Json, source: configuredSource, styleId: null });
  let effective: Json = inherited ? null : leaf ? configured as Json : field.default;
  let effectiveKnown = !inherited;
  if (previewState) {
    const target = own(args) && own(args.target) ? args.target : null;
    const object = own(args) && typeof args.objectId === 'string' ? previewState.presentation.objects.find(item => item.id === args.objectId) :
      target?.kind === 'object' ? previewState.presentation.objects.find(item => item.id === target.id) :
      target?.kind === 'station' ? (() => { const matching = previewState.presentation.objects.filter(item => item.station === target.station); return matching.length === 1 ? matching[0] : undefined; })() : undefined;
    let value: unknown;
    if (fieldPath.startsWith('effects.')) {
      value = object?.current;
      for (const part of fieldPath.slice('effects.'.length).split('.')) value = own(value) ? value[part] : undefined;
    } else if (fieldPath === 'station') value = object?.station;
    else if (fieldPath === 'z') value = object?.current.z;
    else if (node.command === 'say' && fieldPath === 'avatar') value = previewState.presentation.text.avatarId;
    else if (node.command === 'say' && fieldPath === 'fontSize') value = previewState.presentation.text.fontSize;
    if (value !== undefined) { effective = value as Json; effectiveKnown = true; layers.push({ kind: 'state', label: '当前演出', value: effective, source: null, styleId: null }); }
  }
  return ok({ fieldPath, effective, effectiveKnown, configured: { present: Boolean(leaf), value: configured === undefined ? null : configured as Json },
    overridden: Boolean(leaf), layers, activeLayer: layers.length ? layers.length - 1 : null,
    actions: leaf ? ['inherit', 'neutral', 'locate'] : ['neutral'] });
}
export function outerQuotePatch(parsed: ParseResult, statementId: Id): Result<FieldPatchInput | null> {
  const node = parsed.cst.find(item => item.id === statementId && item.command === 'say');
  if (!node?.object) return fail('STATEMENT_MISSING', 'Dialogue is unavailable');
  const field = node.fields.find(item => item.key === 'text');
  const value = field?.valueNode.value;
  if (typeof value !== 'string' || !/^「[\s\S]*」$/.test(value)) return ok(null);
  return ok({ documentId: parsed.documentId, revision: parsed.revision, statementIds: [statementId], changes: [{ field: 'text', op: 'set', value: value.slice(1, -1) }] });
}

export function duplicateStatements(parsed: ParseResult, statementIds: Id[], mapping: Record<Id, Id>): Result<string> {
  const nodes = statementIds.map(id => parsed.cst.find(node => node.id === id));
  if (nodes.some(node => !node?.valid)) return fail('STATEMENT_MISSING', 'Selection contains an invalid statement');
  const slices: string[] = [];
  for (const node of nodes as StatementNode[]) {
    if (!mapping[node.id!]) return fail('COPY_ID', `Missing new ID for ${node.id}`);
    const changes: TextEdit[] = [];
    const idStart = node.idStart!;
    changes.push({ start: idStart - node.start, end: idStart - node.start + node.id!.length, text: mapping[node.id!]!, oldText: node.id! });
    const visit = (value: ValueNode, path: string[]): void => {
      for (const field of value.fields ?? []) {
        const childPath = [...path, field.key];
        const oldId = field.valueNode.value;
        const allowed = ['labelId', 'statementId', 'sceneId', 'variableId', 'objectId', 'effectId', 'soundId'].includes(field.key) || field.key === 'id' && path.includes('options');
        if (typeof oldId === 'string' && mapping[oldId]) {
          if (!allowed || node.command.includes('/')) throw new Error('PLUGIN_REWRITE_REQUIRED');
          changes.push({ start: field.valueNode.start - node.start, end: field.valueNode.end - node.start, text: JSON.stringify(mapping[oldId]), oldText: parsed.text.slice(field.valueNode.start, field.valueNode.end) });
        }
        visit(field.valueNode, childPath);
        field.valueNode.items?.forEach(item => visit(item, childPath));
      }
    };
    try { if (node.object) visit(node.object, []); }
    catch { return fail('PLUGIN_REWRITE_REQUIRED', `Contributor must rewrite internal references in ${node.command}`); }
    slices.push(applyTextEdits(node.raw, changes));
  }
  return ok(slices.join('\n'));
}
