import { createId, DialogueContentSchema, dialoguePlainText, dialogueSegments, type DialogueContent, type DialogueSegment } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import type { SceneSource } from '../../../authoring/controller.js';
import type { Scene } from '../../../studio-r0/model.js';
export type TextPoint = { lineId: string; offset: number };
export type TextSpan = { start: TextPoint; end: TextPoint };
export type TextContents = Record<string, DialogueContent>;
function slice(content: DialogueContent, start: number, end: number): DialogueSegment[] {
  let offset = 0;
  return dialogueSegments(content).flatMap(segment => {
    const from = Math.max(0, start - offset), to = Math.min(segment.text.length, end - offset); offset += segment.text.length;
    if (from >= to) return [];
    const selected = { ...segment, text: segment.text.slice(from, to) };
    if (from || to < segment.text.length) delete selected.ruby;
    return [selected];
  });
}
/** Structural editing receives exact coordinates; repeated characters cannot substitute for ranges. */
export function replaceSceneRange(scene: Scene, source: SceneSource, span: TextSpan, text: string): { point: TextPoint; contents: TextContents } {
  const first = scene.lines.findIndex(line => line.id === span.start.lineId), last = scene.lines.findIndex(line => line.id === span.end.lineId);
  if (first < 0 || last < first) throw new Error('原文选择已变化，请重新选择。');
  const parsed = parse({ documentId: source.documentId, revision: source.revision, text: source.text });
  const lead = scene.lines[first]!, tail = scene.lines[last]!;
  const leadIndex = parsed.cst.findIndex(node => node.id === lead.id), tailIndex = parsed.cst.findIndex(node => node.id === tail.id);
  if (parsed.cst.slice(leadIndex + 1, tailIndex).some(node => node.valid && node.command !== 'say')) throw new Error('这段选择跨过了演出指令，请在源码中调整指令位置后再合并。');
  const before = DialogueContentSchema.parse((parsed.cst[leadIndex]!.object!.value as Record<string, unknown>).text);
  const after = DialogueContentSchema.parse((parsed.cst[tailIndex]!.object!.value as Record<string, unknown>).text);
  const chunks = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n'), contents: TextContents = {};
  const prefix = slice(before, 0, span.start.offset), suffix = slice(after, span.end.offset, tail.text.length);
  const lines = chunks.map((chunk, index) => {
    const id = index === 0 ? lead.id : createId();
    const segments = [...(index === 0 ? prefix : []), ...(chunk ? [{ text: chunk }] : []), ...(index === chunks.length - 1 ? suffix : [])];
    const content: DialogueContent = segments.length && segments.some(segment => Object.keys(segment).length > 1) ? { segments } : segments.map(segment => segment.text).join('');
    contents[id] = content;
    return { id, speakerId: index === 0 ? lead.speakerId : tail.speakerId, text: dialoguePlainText(content), events: [] as Scene['lines'][number]['events'] };
  });
  const start = lines[0]!, end = lines.at(-1)!;
  start.events = lead.events.filter(event => event.offset < span.start.offset || first !== last && span.start.offset === lead.text.length && event.offset === span.start.offset);
  const offset = (chunks.length === 1 ? span.start.offset : 0) + chunks.at(-1)!.length;
  end.events.push(...tail.events.filter(event => event.offset >= span.end.offset).map(event => ({ ...event, offset: offset + event.offset - span.end.offset })));
  if (first === last && chunks.length === 1) {
    // Text deletion does not delete independent event objects at the same boundary.
    end.events = lead.events.map(event => ({ ...event, offset: event.offset >= span.end.offset
      ? offset + event.offset - span.end.offset : event.offset >= span.start.offset ? span.start.offset : event.offset }));
  }
  scene.lines.splice(first, last - first + 1, ...lines);
  return { point: { lineId: end.id, offset }, contents };
}
