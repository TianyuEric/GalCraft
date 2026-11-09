import type { CompiledDialogueEvent, Id, Instruction, RuntimeState, Snapshot, Source } from '@galcraft/contracts';
import { CompiledDialogueEventSchema } from '@galcraft/contracts';
import { graphemes } from './expression.js';

type SayWait = Extract<NonNullable<RuntimeState['wait']>, { kind: 'say' }>;
export type InlineProgress = NonNullable<SayWait['inline']>;

export function dialogueEvents(instruction: Instruction): CompiledDialogueEvent[] {
  const events = (instruction.args as { events?: unknown } | null)?.events;
  return events === undefined ? [] : CompiledDialogueEventSchema.array().parse(events);
}

export function dialogueSourceKey(instruction: Instruction, events: readonly CompiledDialogueEvent[]): string {
  const { text, speaker, append, keepName, textLocale } = instruction.args as Record<string, unknown>;
  return JSON.stringify([text, speaker, append, keepName, textLocale, instruction.continuation, events]);
}

export function dialogueEventSource(snapshot: Snapshot, instruction: Instruction, id: Id): Source {
  return snapshot.sourceMap.find(entry => entry.statementId === instruction.statementId && entry.source.eventId === id)?.source
    ?? { ...instruction.source, eventId: id };
}

/** Translate body offsets into the reading surface, including generated names, quotes and separators. */
export function dialogueEventPositions(state: RuntimeState, body: string, offsets: readonly number[]): number[] {
  const { text, parts, reading } = state.presentation.text;
  const closingQuote = reading?.mode !== 'nvl' && parts.at(-1)?.speakerKind === 'character' ? 1 : 0;
  const prefix = text.length - body.length - closingQuote;
  const clusters = graphemes(text);
  let shown = 0, offset = 0;
  return offsets.map(bodyOffset => {
    // Interpolation can join a combining sequence across the authored boundary.
    while (shown < clusters.length && offset < prefix + bodyOffset) offset += clusters[shown++]!.length;
    return shown;
  });
}

export function compatibleDialogueProgress(instruction: Instruction, wait: SayWait, text: string): boolean {
  if (instruction.opcode !== 'say') return false;
  const events = dialogueEvents(instruction), progress = wait.inline;
  if (!progress) return events.length === 0;
  const total = graphemes(text).length;
  if (progress.sourceKey !== dialogueSourceKey(instruction, events) || progress.positions.length !== events.length ||
    progress.cursor > events.length || wait.textShown > total ||
    progress.positions.some((position, index) => position > total || position < (progress.positions[index - 1] ?? 0) ||
      (index < progress.cursor ? position > wait.textShown : position < wait.textShown))) return false;
  if (!progress.waiting) return !wait.textComplete || (progress.positions[progress.cursor] ?? Infinity) > wait.textShown;
  const event = events[progress.cursor - 1];
  return !wait.textComplete && event?.kind === 'wait' && event.id === progress.waiting.eventId &&
    progress.positions[progress.cursor - 1] === wait.textShown && (event.durationMs === null ? progress.waiting.remainingMs === null :
      progress.waiting.remainingMs !== null && progress.waiting.remainingMs <= event.durationMs);
}
