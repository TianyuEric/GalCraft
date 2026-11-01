import { z } from 'zod';
import { IdSchema } from './common.js';

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
const boundaries = (text: string) => new Set([0, ...Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), segment => segment.index + segment.segment.length)]);
export function styleDialogueRange(content: DialogueContent, start: number, end: number, style: Omit<Partial<DialogueSegment>, 'text'>): DialogueContent {
  const body = dialoguePlainText(content), edges = boundaries(body);
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
  const take = (from: number, to: number) => { let offset = 0; return content.segments.flatMap(segment => {
    const left = Math.max(0, from - offset), right = Math.min(segment.text.length, to - offset); offset += segment.text.length;
    if (left >= right) return [];
    const next = { ...segment, text: segment.text.slice(left, right) };
    if (left || right < segment.text.length) delete next.ruby;
    return [next];
  }); };
  return { segments: [...take(0, start), { text: text.slice(start, text.length - suffix) }, ...take(before.length - suffix, before.length)].filter(segment => segment.text.length) };
}
export const AvatarSelectionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('auto') }), z.strictObject({ mode: z.literal('hidden') }),
  z.strictObject({ mode: z.literal('image'), assetId: IdSchema }),
]);
export type AvatarSelection = z.infer<typeof AvatarSelectionSchema>;
