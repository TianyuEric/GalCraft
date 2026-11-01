import { createId } from '@galcraft/contracts';
import type { DialoguePart, DialogueSegment, ExecutionToken, Id, Instruction, RuntimeState, Snapshot, VoicePlaybackBinding, VoiceResolution } from '@galcraft/contracts';
import { graphemes } from './expression.js';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function formatDialogue(parts: readonly DialoguePart[]): string {
  const groups: { speakerKind: DialoguePart['speakerKind']; characterId: Id | null; body: string }[] = [];
  for (const part of parts) {
    const last = groups.at(-1);
    if (last && last.speakerKind === part.speakerKind && last.characterId === part.characterId) last.body += part.body;
    else groups.push({ speakerKind: part.speakerKind, characterId: part.characterId, body: part.body });
  }
  return groups.map(group => group.speakerKind === 'character' ? `「${group.body}」` : group.body).join('\n');
}
/** Formatting and partial reveal share these runs, so ruby never consumes a second text position. */
export function dialogueRuns(parts: readonly DialoguePart[]): DialogueSegment[] {
  const runs: DialogueSegment[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!, previous = parts[index - 1], next = parts[index + 1];
    const same = (other: DialoguePart | undefined) => other?.speakerKind === part.speakerKind && other.characterId === part.characterId;
    if (!same(previous)) { if (index) runs.push({ text: '\n' }); if (part.speakerKind === 'character') runs.push({ text: '「' }); }
    runs.push(...(part.segments ?? [{ text: part.body }]));
    if (!same(next) && part.speakerKind === 'character') runs.push({ text: '」' });
  }
  return runs;
}
export function nvlRuns(parts: readonly DialoguePart[], nameStyle: Omit<Partial<DialogueSegment>, 'text' | 'ruby'> = { bold: true }): DialogueSegment[] {
  return parts.flatMap((part, index) => [
    ...(index ? [{ text: '\n\n' }] : []),
    ...(part.speakerKind === 'character' && part.speakerName ? [{ text: `${part.speakerName}：`, ...nameStyle }] : []),
    ...(part.segments ?? [{ text: part.body }]),
  ]);
}
export function sliceDialogueRuns(runs: readonly DialogueSegment[], start: number, end = Infinity): DialogueSegment[] {
  let offset = 0; const result: DialogueSegment[] = [];
  for (const segment of runs) {
    const body = graphemes(segment.text), from = Math.max(0, start - offset), to = Math.min(body.length, end - offset);
    if (from < to) result.push({ ...segment, ...(from ? { ruby: undefined } : {}), text: body.slice(from, to).join('') });
    offset += body.length;
  }
  return result;
}
export function chooseVoice(snapshot: Snapshot, instruction: Instruction, requestedLocale: string, token: ExecutionToken): { resolution: VoiceResolution; binding: VoicePlaybackBinding | null } {
  const args = object(instruction.args); const configured = object(args.voiceByLocale);
  const defaultLocale = snapshot.project.languages.voiceDefault;
  const attempts: VoiceResolution['attempts'] = [];
  const candidates: { via: VoiceResolution['attempts'][number]['via']; locale: string; assetId: Id | null }[] = [
    { via: 'requestedLocale', locale: requestedLocale, assetId: typeof configured[requestedLocale] === 'string' ? configured[requestedLocale] as Id : null },
    ...(requestedLocale === defaultLocale ? [] : [{ via: 'projectDefault' as const, locale: defaultLocale, assetId: typeof configured[defaultLocale] === 'string' ? configured[defaultLocale] as Id : null }]),
    { via: 'legacyVoice', locale: defaultLocale, assetId: typeof args.voice === 'string' ? args.voice as Id : null },
  ];
  let selected: VoiceResolution['selected'] = null;
  for (const candidate of candidates) {
    attempts.push(candidate);
    if (candidate.assetId) {
      selected = { ...candidate, assetId: candidate.assetId,
        variantId: snapshot.assets.find(asset => asset.assetId === candidate.assetId)?.variantId ?? null };
      break;
    }
  }
  const resolution: VoiceResolution = { id: createId(), source: instruction.source,
    requestedLocale, defaultLocale, attempts, selected };
  return { resolution, binding: selected?.variantId ? { token, resolution } : null };
}
export function applyDialogue(state: RuntimeState, snapshot: Snapshot, instruction: Instruction, body: string,
  previousReading: { textShown: number; textAnchor: number } | null = null, segments?: DialogueSegment[]): void {
  const args = object(instruction.args), speaker = object(args.speaker);
  const characterId = speaker.kind === 'character' && typeof speaker.id === 'string' ? speaker.id : null;
  const part: DialoguePart = { statementId: instruction.statementId, speakerKind: characterId ? 'character' : 'narrator', characterId,
    body, ...(segments ? { segments } : {}), ...(typeof args.fontSize === 'number' ? { fontSize: args.fontSize } : {}),
    locale: typeof args.textLocale === 'string' ? args.textLocale : snapshot.project.languages.textDefault };
  const previous = state.presentation.text;
  const nvl = previous.reading?.mode === 'nvl';
  const parts = nvl || args.append === true ? [...previous.parts, part] : [part];
  const name = snapshot.project.player.name;
  const customName = name?.allowCustom && name.variableId ? state.progress[name.variableId] : null;
  const speakerName = name?.characterId === characterId
    ? typeof customName === 'string' && customName.trim() ? customName : name.defaultName
    : snapshot.characters.find(item => item.id === characterId)?.name ?? '';
  part.speakerName = characterId && args.keepName !== false ? speakerName : '';
  const text = nvl ? nvlRuns(parts).map(run => run.text).join('') : formatDialogue(parts);
  const prefix = graphemes(previous.text), next = graphemes(text);
  let shared = 0; while (shared < prefix.length && prefix[shared] === next[shared]) shared++;
  const target = object(args.target);
  const bound = target.kind === 'object' ? state.presentation.objects.find(item => item.id === target.id) :
    target.kind === 'station' ? state.presentation.objects.filter(item => item.station === target.station && item.characterId === characterId)
      .sort((a, b) => b.entranceOrder - a.entranceOrder)[0] : null;
  state.presentation.text = { ...previous, parts, text, append: args.append === true,
    speakerId: characterId, speakerName: characterId && args.keepName !== false ? speakerName : '',
    portraitObjectId: characterId && bound?.characterId === characterId ? bound.id : null,
    avatarId: typeof args.avatar === 'string' ? args.avatar : null,
    avatarSelection: args.avatarMode === 'hidden' ? { mode: 'hidden' } : args.avatarMode === 'auto' ? { mode: 'auto' } :
      typeof args.avatar === 'string' ? { mode: 'image', assetId: args.avatar } : args.avatar === null ? { mode: 'hidden' } : { mode: 'auto' },
    fontSize: typeof args.fontSize === 'number' ? args.fontSize : null };
  if (nvl) state.presentation.text.reading = { ...previous.reading!, end: null };
  const reading = previousReading ?? (state.wait?.kind === 'say' ? state.wait : null);
  state.wait = { kind: 'say', textShown: nvl ? prefix.length : args.append === true ? Math.min(reading?.textShown ?? 0, shared) : 0,
    textComplete: false, textAnchor: nvl ? previous.reading!.start : args.append === true ? Math.min(reading?.textAnchor ?? 0, shared) : 0 };
}
