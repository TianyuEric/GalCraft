import type { DialoguePart, DialogueSegment, ReadingStyles, ReadingTextStyle } from '@galcraft/contracts';

export type ReadingRun = DialogueSegment & { fontId?: string | null };

/** Presentation defaults stay separate from the authored dialogue and its local emphasis. */
export function readingRuns(parts: readonly DialoguePart[], styles: ReadingStyles | undefined,
  readStatements: readonly string[], nvl = false, nameStyle: Omit<Partial<DialogueSegment>, 'text' | 'ruby'> = { bold: true },
  currentFontSize?: number | null): ReadingRun[] {
  const runs: ReadingRun[] = [];
  const read = new Set(readStatements);
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!, previous = parts[index - 1], next = parts[index + 1];
    const style: ReadingTextStyle = { ...styles?.[read.has(part.statementId) ? 'read' : 'unread'],
      ...(part.fontSize || index === parts.length - 1 && currentFontSize ? { fontSize: part.fontSize ?? currentFontSize! } : {}) };
    const same = (other: DialoguePart | undefined) => other?.speakerKind === part.speakerKind && other.characterId === part.characterId;
    if (nvl) {
      if (index) runs.push({ text: '\n\n' });
      if (part.speakerKind === 'character' && part.speakerName) runs.push({ text: `${part.speakerName}：`, ...nameStyle });
    } else if (!same(previous)) {
      if (index) runs.push({ text: '\n' });
      if (part.speakerKind === 'character') runs.push({ text: '「', ...style });
    }
    runs.push(...(part.segments ?? [{ text: part.body }]).map(segment => ({ ...style, ...segment })));
    if (!nvl && !same(next) && part.speakerKind === 'character') runs.push({ text: '」', ...style });
  }
  return runs;
}
