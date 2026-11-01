import type { Json } from '@galcraft/contracts';
import { CoreCommandSpecs } from './catalog.js';
import { parse, type ValueNode } from './parser.js';

const roots = new Set(['framing', 'illustrationFrame', 'effects', 'transition', 'portrait', 'segments', 'durationMs']);
const pixels = new Set(['x', 'y', 'width', 'height', 'offsetX', 'offsetY', 'blur', 'thickness', 'rotationDeg']);

/** Presentation precision applies to authored controls and context projections, never arbitrary expressions. */
export function presentationValue(command: string, path: string, value: Json): Json {
  const root = path.split('.')[0]!;
  if (!roots.has(root) || !CoreCommandSpecs.some(spec => spec.key === command && spec.fields.some(field => field.path === root))) return value;
  const visit = (item: Json, key: string): Json => {
    if (typeof item === 'number' && Number.isFinite(item)) {
      const digits = root === 'portrait' ? 4 : key.endsWith('Ms') ? 0 : pixels.has(key) ? 2 : 4;
      const rounded = Number(item.toFixed(digits));
      // Preserve very small positive scales and extents instead of turning them into zero.
      return rounded === 0 && item !== 0 && /^(?:scale|width|height)/.test(key) ? item : rounded;
    }
    if (Array.isArray(item)) return item.map(child => visit(child, key));
    if (item && typeof item === 'object') {
      if ('kind' in item) return item;
      return Object.fromEntries(Object.entries(item).map(([name, child]) => [name, visit(child, name)]));
    }
    return item;
  };
  return visit(value, path.split('.').at(-1)!);
}

export function presentationArgs(command: string, args: Record<string, Json>): Record<string, Json> {
  return Object.fromEntries(Object.entries(args).map(([path, value]) => [path, presentationValue(command, path, value)]));
}

/** Edit only numeric tokens in valid statements; preserve dialogue, comments, identity and source formatting. */
export function compactPresentationScript(text: string): string {
  const parsed = parse({ documentId: 'CtxDoc', revision: 0, text });
  const edits: { start: number; end: number; text: string }[] = [];
  for (const statement of parsed.cst) {
    if (!statement.valid || !statement.object) continue;
    const visit = (node: ValueNode, path: string) => {
      if (node.kind === 'expression') return;
      if (typeof node.value === 'number') {
        const next = presentationValue(statement.command, path, node.value);
        if (next !== node.value) edits.push({ start: node.start, end: node.end, text: String(next) });
      }
      for (const field of node.fields ?? []) visit(field.valueNode, path ? `${path}.${field.key}` : field.key);
      for (const item of node.items ?? []) visit(item, path);
    };
    visit(statement.object, '');
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}
