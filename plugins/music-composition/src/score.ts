import type { Issue, Json, Result } from '@galcraft/contracts';
import { validateJsonData } from '@galcraft/contracts';

export const pluginId = 'org.galcraft.music-composition';
export const operationId = `${pluginId}/render` as const;
export const scoreDocumentKey = `${pluginId}/score`;
export type SoundBankId = string;
export type MusicNote = { id: string; pitch: number; startTick: number; durationTicks: number; velocity: number };
export type MusicTrack = { id: string; name: string; instrumentId: string; volume: number; pan: number;
  notes: MusicNote[]; controls: { tick: number; controller: number; value: number }[] };
export type MusicScore = { schemaVersion: 1; id: string; title: string; ppq: number; tempo: { tick: number; bpm: number }[];
  meter: { beats: number; unit: number }; durationTicks: number; loop: { startTick: number; endTick: number } | null;
  segments: { id: string; name: string; startTick: number; endTick: number }[];
  soundbank: { id: SoundBankId; version: '0.1.0' }; tracks: MusicTrack[];
  render: { sampleRate: 48000; channels: 2; gain: number; reverb: boolean; chorus: boolean; tailSeconds: number; loopTail: 'wrap' | 'cut' };
  origin: { kind: 'manual' | 'llm'; taskId?: string; candidateId?: string } };
export type ScoreDiagnostic = { path: string; message: string; trackId?: string; bar?: number };
export const controllerNames: Record<number, string> = { 1: '调制', 2: '呼吸 / 连续力度', 7: '音量', 10: '声像', 11: '表情', 64: '延音踏板', 91: '混响量', 93: '合唱量' };
const number = { type: 'number' }, integer = { type: 'integer', minimum: 0 }, text = { type: 'string', minLength: 1 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const ranged = (min: number, max: number) => ({ type: 'integer', minimum: min, maximum: max });
export const musicScoreSchema: Json = object({
  schemaVersion: { const: 1 }, id: text, title: text, ppq: ranged(24, 9600),
  tempo: { type: 'array', minItems: 1, items: object({ tick: integer, bpm: { ...number, minimum: 20, maximum: 300 } }) },
  meter: object({ beats: ranged(1, 16), unit: { enum: [1, 2, 4, 8, 16] } }), durationTicks: { type: 'integer', minimum: 1 },
  loop: { anyOf: [{ type: 'null' }, object({ startTick: integer, endTick: integer })] },
  segments: { type: 'array', minItems: 1, items: object({ id: text, name: text, startTick: integer, endTick: integer }) },
  soundbank: object({ id: text, version: { const: '0.1.0' } }),
  tracks: { type: 'array', minItems: 1, maxItems: 16, items: object({ id: text, name: text, instrumentId: text, volume: ranged(0, 127), pan: ranged(0, 127),
    notes: { type: 'array', items: object({ id: text, pitch: ranged(0, 127), startTick: integer, durationTicks: { type: 'integer', minimum: 1 }, velocity: ranged(1, 127) }) },
    controls: { type: 'array', items: object({ tick: integer, controller: { enum: [1, 2, 7, 10, 11, 64, 91, 93] }, value: ranged(0, 127) }) } }) },
  render: object({ sampleRate: { const: 48000 }, channels: { const: 2 }, gain: { ...number, minimum: 0.01, maximum: 1 },
    reverb: { type: 'boolean' }, chorus: { type: 'boolean' }, tailSeconds: { ...number, minimum: 0, maximum: 10 }, loopTail: { enum: ['wrap', 'cut'] } }),
  origin: object({ kind: { enum: ['manual', 'llm'] }, taskId: text, candidateId: text }, ['kind']),
}) as Json;

export function tickToSeconds(score: Pick<MusicScore, 'ppq' | 'tempo'>, tick: number): number {
  let seconds = 0, previous = 0, bpm = score.tempo[0]!.bpm;
  for (const change of score.tempo) {
    if (change.tick > tick) break;
    seconds += (change.tick - previous) * 60 / (bpm * score.ppq); previous = change.tick; bpm = change.bpm;
  }
  return seconds + (tick - previous) * 60 / (bpm * score.ppq);
}
export function scoreDiagnostics(value: unknown): ScoreDiagnostic[] {
  const issues: ScoreDiagnostic[] = [];
  const add = (path: string, message: string, track?: Record<string, unknown>, tick?: number) => issues.push({ path, message,
    ...(typeof track?.id === 'string' ? { trackId: track.id } : {}), ...(tick !== undefined && score ? { bar: Math.floor(tick / (score.ppq * score.meter.beats * 4 / score.meter.unit)) + 1 } : {}) });
  const record = (input: unknown): input is Record<string, unknown> => !!input && typeof input === 'object' && !Array.isArray(input);
  const int = (input: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof input === 'number' && Number.isSafeInteger(input) && input >= min && input <= max;
  const finite = (input: unknown, min: number, max: number) => typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max;
  const identity = (input: unknown) => typeof input === 'string' && input.trim().length > 0;
  let score: MusicScore | undefined;
  if (!record(value)) return [{ path: '$', message: 'The score must be a JSON object' }];
  if (value.schemaVersion !== 1) add('schemaVersion', 'Score schema version must be 1');
  for (const key of ['id', 'title']) if (!identity(value[key])) add(key, 'Enter a name or stable identity');
  if (!int(value.ppq, 24, 9600)) add('ppq', 'Ticks per beat must be an integer from 24 to 9600');
  if (!int(value.durationTicks, 1)) add('durationTicks', 'Full duration must be a positive integer in ticks');
  if (!record(value.meter) || !int(value.meter.beats, 1, 16) || ![1, 2, 4, 8, 16].includes(Number(value.meter.unit))) add('meter', 'Meter must have 1–16 beats and a unit of 1, 2, 4, 8 or 16');
  if (!Array.isArray(value.tempo) || !value.tempo.length || value.tempo.some((event, index, events) => !record(event) || !int(event.tick) || !finite(event.bpm, 20, 300)
    || index === 0 && event.tick !== 0 || index > 0 && Number(event.tick) <= Number(events[index - 1]?.tick))) add('tempo', 'Tempo must start at tick 0, use increasing positions and BPM 20–300');
  if (!record(value.soundbank) || !identity(value.soundbank.id) || value.soundbank.version !== '0.1.0') add('soundbank', 'Choose a soundbank with an explicit identity and exact version');
  if (value.loop !== null && (!record(value.loop) || !int(value.loop.startTick) || !int(value.loop.endTick, 1) || Number(value.loop.startTick) >= Number(value.loop.endTick)
    || Number(value.loop.endTick) > Number(value.durationTicks))) add('loop', 'Loop start must precede its end within the full duration');
  if (!record(value.render) || value.render.sampleRate !== 48000 || value.render.channels !== 2 || !finite(value.render.gain, 0.01, 1)
    || typeof value.render.reverb !== 'boolean' || typeof value.render.chorus !== 'boolean' || !finite(value.render.tailSeconds, 0, 10) || !['wrap', 'cut'].includes(String(value.render.loopTail))) add('render', 'Rendering requires 48 kHz stereo, gain 0.01–1, a 0–10 second tail and explicit effect/loop-tail settings');
  if (!record(value.origin) || !['manual', 'llm'].includes(String(value.origin.kind))) add('origin', 'Retain the manual or generated origin');
  if (!issues.length) score = value as unknown as MusicScore;
  if (!Array.isArray(value.segments) || !value.segments.length) add('segments', 'Create at least one section');
  else { const ids = new Set(); value.segments.forEach((segment, index) => {
    if (!record(segment) || !identity(segment.id) || ids.has(segment.id) || !identity(segment.name) || !int(segment.startTick) || !int(segment.endTick, 1)
      || Number(segment.startTick) >= Number(segment.endTick) || Number(segment.endTick) > Number(value.durationTicks)) add(`segments[${index}]`, 'Each section needs a unique identity, a name and a valid range within the full duration');
    else ids.add(segment.id);
  }); }
  if (!Array.isArray(value.tracks) || value.tracks.length < 1 || value.tracks.length > 16) add('tracks', 'Create 1–16 tracks');
  else { const ids = new Set(); value.tracks.forEach((track, index) => {
    const path = `tracks[${index}]`;
    if (!record(track)) { add(path, 'A track must be an object'); return; }
    if (!identity(track.id) || ids.has(track.id)) add(`${path}.id`, 'Track identities must be unique', track); ids.add(track.id);
    if (!identity(track.name) || !identity(track.instrumentId) || !int(track.volume, 0, 127) || !int(track.pan, 0, 127)) add(path, 'Each track needs a name, instrument identity and volume/pan from 0 to 127', track);
    if (!Array.isArray(track.notes)) add(`${path}.notes`, 'Provide a notes array', track);
    else { const noteIds = new Set(); track.notes.forEach((note, n) => {
      if (!record(note) || !identity(note.id) || noteIds.has(note.id) || !int(note.pitch, 0, 127) || !int(note.startTick) || !int(note.durationTicks, 1)
        || Number(note.startTick) + Number(note.durationTicks) > Number(value.durationTicks) || !int(note.velocity, 1, 127)) add(`${path}.notes[${n}]`, 'Notes need unique identities, pitch 0–127, positive integer durations, velocity 1–127 and must fit within the full duration', track, record(note) && typeof note.startTick === 'number' ? note.startTick : undefined);
      if (record(note)) noteIds.add(note.id);
    }); }
    if (!Array.isArray(track.controls)) add(`${path}.controls`, 'Provide a control events array', track);
    else track.controls.forEach((event, n) => { if (!record(event) || !int(event.tick) || Number(event.tick) > Number(value.durationTicks)
      || !Object.hasOwn(controllerNames, Number(event.controller)) || !int(event.value, 0, 127)) add(`${path}.controls[${n}]`, 'Control events must fit within the full duration and use supported controllers with values 0–127', track); });
  }); }
  return issues;
}
export function parseMusicScore(value: unknown): Result<MusicScore> {
  const diagnostics = scoreDiagnostics(value);
  const shape = validateJsonData(musicScoreSchema, value as Json);
  if (!diagnostics.length && shape.ok) return { ok: true, warnings: [], value: structuredClone(value) as MusicScore };
  const issues: Issue[] = diagnostics.map(item => ({ code: 'MUSIC_SCORE_INVALID', severity: 'error', owner: 'M10', related: [], actions: ['edit'],
    message: `${item.trackId ? `Track ${item.trackId} · ` : ''}${item.bar ? `Bar ${item.bar} · ` : ''}${item.path}：${item.message}` }));
  if (!shape.ok) issues.push(...shape.issues.map(issue => ({ ...issue, code: 'MUSIC_SCORE_SCHEMA', owner: 'M10' as const })));
  return { ok: false, error: issues[0]!, issues };
}
export function parseGeneratedMusicScore(raw: string): Result<MusicScore> {
  const source = raw.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```$/, '');
  try { return parseMusicScore(JSON.parse(source)); }
  catch { const error: Issue = { code: 'MUSIC_SCORE_JSON', severity: 'error', owner: 'M10', related: [], actions: ['edit'], message: 'The composition result is not complete JSON. The original text is retained; correct it manually or explicitly send a new request.' };
    return { ok: false, error, issues: [error] }; }
}
export function createMusicScore(): MusicScore {
  return { schemaVersion: 1, id: 'score-main', title: '新的配乐', ppq: 480, tempo: [{ tick: 0, bpm: 96 }], meter: { beats: 4, unit: 4 }, durationTicks: 7680,
    loop: { startTick: 0, endTick: 7680 }, segments: [{ id: 'section-a', name: '主题', startTick: 0, endTick: 7680 }], soundbank: { id: 'ms-basic', version: '0.1.0' },
    tracks: [{ id: 'track-piano', name: '钢琴', instrumentId: 'melodic:0:0:0', volume: 100, pan: 64,
      notes: [60, 64, 67, 72, 67, 64, 62, 60].map((pitch, index) => ({ id: `note-${index + 1}`, pitch, startTick: index * 960, durationTicks: 720, velocity: 88 })), controls: [] }],
    render: { sampleRate: 48000, channels: 2, gain: 0.75, reverb: true, chorus: false, tailSeconds: 2, loopTail: 'wrap' }, origin: { kind: 'manual' } };
}
