import { expressionNames, type InlineEvent, type Project } from '../model.js';

export const eventNames = { expression: '表情', pause: '停顿', sound: '音效' } as const;

export function eventLabel(event: InlineEvent) {
  if (event.kind === 'pause') return event.durationMs ? `${event.durationMs / 1000}s` : '等待点击';
  if (event.kind === 'expression') return expressionNames[event.value as keyof typeof expressionNames] ?? '表情';
  return event.value || '音效';
}

export function speakerName(project: Project, id: string | null) {
  return project.characters.find(character => character.id === id)?.name ?? '旁白';
}

export function imageForExpression(project: Project, id: string | undefined, expression: string) {
  const character = project.characters.find(item => item.id === id);
  const part = character?.parts.find(item => item.axis === 'expression' && item.value === expression && item.visible);
  return part?.image ?? project.assets.find(asset => asset.characterId === id && asset.expression === expression && asset.kind === 'image')?.url
    ?? (character ? `/practice/figures/${character.prefix}-${expression}.png` : undefined);
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

export function textBoundary(text: string, requested: number) {
  if (requested <= 0) return 0;
  if (requested >= text.length) return text.length;
  return segmenter.segment(text).containing(requested)?.index ?? requested;
}

export function textProgressOffsets(text: string) {
  return [0, ...Array.from(segmenter.segment(text), ({ index, segment }) => index + segment.length)];
}
