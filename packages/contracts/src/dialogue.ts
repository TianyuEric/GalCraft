import { z } from 'zod';
import { IdSchema, RevisionSchema } from './common.js';
import { dialogueInterpolations } from './dialogue-interpolation.js';
export { dialogueInterpolations, type DialogueInterpolation } from './dialogue-interpolation.js';

/** Author-controlled text only. Strings are always literal text, including angle brackets. */
export const DialogueSegmentSchema = z.strictObject({
  text: z.string(), ruby: z.string().min(1).optional(),
  color: z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i).optional(),
  fontSize: z.number().finite().positive().optional(), bold: z.boolean().optional(), italic: z.boolean().optional(),
});
export type DialogueSegment = z.infer<typeof DialogueSegmentSchema>;
export const DialogueContentSchema = z.union([z.string(), z.strictObject({ segments: z.array(DialogueSegmentSchema).min(1) })]);
export type DialogueContent = z.infer<typeof DialogueContentSchema>;
export function dialogueSegments(content: DialogueContent): DialogueSegment[] {
  return typeof content === 'string' ? [{ text: content }] : content.segments;
}
export function dialoguePlainText(content: DialogueContent): string { return dialogueSegments(content).map(segment => segment.text).join(''); }
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const boundaries = (text: string) => new Set([0, ...Array.from(graphemes.segment(text), segment => segment.index + segment.segment.length)]);

const anchor = { id: IdSchema, offset: RevisionSchema };
const waitEvent = z.strictObject({ ...anchor, kind: z.literal('wait'), durationMs: z.number().int().positive().nullable(),
  autoWaitMs: z.number().int().nonnegative().optional().describe('Automatic release duration in milliseconds. Valid only when durationMs is null. Omit to use the player setting.'),
}).refine(event => event.durationMs === null || event.autoWaitMs === undefined, {
  path: ['autoWaitMs'], message: 'Automatic release duration is available on click waits only',
});
const soundEvent = z.strictObject({ ...anchor, kind: z.literal('sound'), assetId: IdSchema, variantId: IdSchema.nullable().optional(),
  volume: z.number().finite().min(0).max(100).optional() });
const expressionEvent = z.strictObject({ ...anchor, kind: z.literal('expression'), objectId: IdSchema, characterId: IdSchema, differenceId: IdSchema });
const live2dExpressionEvent = z.strictObject({ ...anchor, kind: z.literal('live2dExpression'), objectId: IdSchema,
  assetId: IdSchema, variantId: IdSchema.nullable().optional(), expressionName: z.string().regex(/\S/).describe('Exact expression name declared by the selected Live2D model version.') });
export const DialogueEventSchema = z.discriminatedUnion('kind', [waitEvent, soundEvent, expressionEvent, live2dExpressionEvent]);
export type DialogueEvent = z.infer<typeof DialogueEventSchema>;
export const CompiledDialogueEventSchema = z.discriminatedUnion('kind', [
  waitEvent, soundEvent.extend({ variantId: IdSchema }), expressionEvent.extend({ assetId: IdSchema, variantId: IdSchema }),
  live2dExpressionEvent.extend({ variantId: IdSchema }),
]);
export type CompiledDialogueEvent = z.infer<typeof CompiledDialogueEventSchema>;

/** Decoded UTF-16 edges between graphemes, outside interpolation tokens and ruby bases. */
export function dialogueAnchorOffsets(content: DialogueContent): Set<number> {
  const edges = boundaries(dialoguePlainText(content));
  let offset = 0;
  for (const segment of dialogueSegments(content)) {
    const atoms = segment.ruby ? [{ start: 0, end: segment.text.length }] : dialogueInterpolations(segment.text);
    for (const atom of atoms) for (let index = atom.start + 1; index < atom.end; index++) edges.delete(offset + index);
    offset += segment.text.length;
  }
  return edges;
}

/** Move anchors across a single decoded body replacement, preserving their execution order at a collapsed boundary. */
export function reanchorDialogueEvents(before: DialogueContent, after: DialogueContent, events: DialogueEvent[]): DialogueEvent[] {
  const oldBody = dialoguePlainText(before), body = dialoguePlainText(after);
  if (oldBody === body && JSON.stringify(before) === JSON.stringify(after)) return events;
  const oldEdges = dialogueAnchorOffsets(before), edges = dialogueAnchorOffsets(after);
  let start = 0, suffix = 0;
  const limit = Math.min(oldBody.length, body.length);
  while (start < limit && oldBody[start] === body[start]) start++;
  while (start > 0 && (!oldEdges.has(start) || !edges.has(start))) start--;
  while (suffix < limit - start && oldBody[oldBody.length - 1 - suffix] === body[body.length - 1 - suffix]) suffix++;
  while (suffix > 0 && (!oldEdges.has(oldBody.length - suffix) || !edges.has(body.length - suffix))) suffix--;
  const moved = events.map(event => {
    let offset = event.offset <= start ? event.offset : event.offset < oldBody.length - suffix ? body.length - suffix : event.offset + body.length - oldBody.length;
    while (offset <= body.length && !edges.has(offset)) offset++;
    return { ...event, offset };
  });
  const atOffset = new Map<number, number[]>();
  for (const [index, event] of moved.entries()) {
    const group = atOffset.get(event.offset) ?? [];
    group.push(index);
    atOffset.set(event.offset, group);
  }
  const ordered = [...moved];
  for (const group of atOffset.values()) {
    const byPriorOffset = [...group].sort((a, b) => events[a]!.offset - events[b]!.offset);
    for (const [index, position] of group.entries()) ordered[position] = moved[byPriorOffset[index]!]!;
  }
  return ordered;
}

/** Take a decoded source range while preserving its segment formatting. */
export function sliceDialogueContent(content: DialogueContent, start: number, end: number): DialogueContent {
  if (typeof content === 'string') return content.slice(start, end);
  let offset = 0;
  const segments = content.segments.flatMap(segment => {
    const left = Math.max(0, start - offset), right = Math.min(segment.text.length, end - offset);
    offset += segment.text.length;
    if (left >= right) return [];
    const next = { ...segment, text: segment.text.slice(left, right) };
    if (left || right < segment.text.length) delete next.ruby;
    return [next];
  });
  return segments.length ? { segments } : '';
}
export function styleDialogueRange(content: DialogueContent, start: number, end: number, style: Omit<Partial<DialogueSegment>, 'text'>): DialogueContent {
  const body = dialoguePlainText(content), edges = dialogueAnchorOffsets(content);
  while (start > 0 && !edges.has(start)) start--;
  while (end < body.length && !edges.has(end)) end++;
  let offset = 0; const segments: DialogueSegment[] = [];
  for (const segment of dialogueSegments(content)) {
    const from = Math.max(0, start - offset), to = Math.min(segment.text.length, end - offset);
    if (from >= to) segments.push(segment);
    else {
      const base = { ...segment };
      if (from || to < segment.text.length) delete base.ruby;
      if (from) segments.push({ ...base, text: segment.text.slice(0, from) });
      const next = { ...base, ...style, text: segment.text.slice(from, to) };
      for (const key of Object.keys(next) as (keyof DialogueSegment)[]) if (next[key] === undefined) delete next[key];
      segments.push(next);
      if (to < segment.text.length) segments.push({ ...base, text: segment.text.slice(to) });
    }
    offset += segment.text.length;
  }
  return { segments };
}
/** Plain writing preserves styles outside the edited range; changed bases lose their old reading. */
export function replaceDialogueText(content: DialogueContent, text: string): DialogueContent {
  if (!text) return '';
  if (typeof content === 'string') return text;
  const before = dialoguePlainText(content); if (before === text) return content;
  let start = 0, suffix = 0;
  while (start < Math.min(before.length, text.length) && before[start] === text[start]) start++;
  while (suffix < Math.min(before.length, text.length) - start && before[before.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
  const oldEdges = boundaries(before), newEdges = boundaries(text);
  while (start > 0 && (!oldEdges.has(start) || !newEdges.has(start))) start--;
  while (suffix > 0 && (!oldEdges.has(before.length - suffix) || !newEdges.has(text.length - suffix))) suffix--;
  return { segments: [...dialogueSegments(sliceDialogueContent(content, 0, start)), { text: text.slice(start, text.length - suffix) },
    ...dialogueSegments(sliceDialogueContent(content, before.length - suffix, before.length))].filter(segment => segment.text.length) };
}
export const AvatarSelectionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('auto') }), z.strictObject({ mode: z.literal('hidden') }),
  z.strictObject({ mode: z.literal('image'), assetId: IdSchema }),
]);
export type AvatarSelection = z.infer<typeof AvatarSelectionSchema>;
