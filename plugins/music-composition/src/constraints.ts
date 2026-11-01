import { validateJsonData } from '@galcraft/contracts';
import type { Json } from '@galcraft/contracts';
import type { MusicInstrument } from './catalog.js';
import { tickToSeconds, type MusicScore } from './score.js';

export type MusicConstraints = {
  fixedBpm?: number; meter?: MusicScore['meter']; bars?: number;
  bodySeconds?: number; totalSeconds?: number; toleranceSeconds?: number;
  loop?: { enabled: boolean; startTick?: number; endTick?: number };
  requiredInstruments?: string[]; allowedInstruments?: string[]; excludedInstruments?: string[];
};
const positive = { type: 'number', exclusiveMinimum: 0 }, tick = { type: 'integer', minimum: 0 };
const identities = { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } };
export const musicConstraintsSchema: Json = { type: 'object', additionalProperties: false, properties: {
  fixedBpm: { type: 'number', minimum: 20, maximum: 300 }, meter: { type: 'object', additionalProperties: false, required: ['beats', 'unit'], properties: { beats: { type: 'integer', minimum: 1, maximum: 16 }, unit: { enum: [1, 2, 4, 8, 16] } } },
  bars: { type: 'integer', minimum: 1 }, bodySeconds: positive, totalSeconds: positive, toleranceSeconds: { type: 'number', minimum: 0 },
  loop: { type: 'object', additionalProperties: false, required: ['enabled'], properties: { enabled: { type: 'boolean' }, startTick: tick, endTick: { type: 'integer', minimum: 1 } } },
  requiredInstruments: identities, allowedInstruments: identities, excludedInstruments: identities,
} };
export function parseMusicConstraints(value: Json | undefined): MusicConstraints {
  if (value === undefined) return {};
  const checked = validateJsonData(musicConstraintsSchema, value);
  if (!checked.ok) throw new Error(`musicConstraints: ${checked.issues.map(issue => issue.message).join('; ')}`);
  return value as MusicConstraints;
}
export function scoreDurations(score: MusicScore) {
  const bodySeconds = tickToSeconds(score, score.durationTicks), rate = score.render.sampleRate;
  // finishRenderChannels preserves the full composition and crops only its post-body tail for loops.
  const totalSeconds = (score.loop ? Math.round(bodySeconds * rate) : Math.ceil((bodySeconds + score.render.tailSeconds) * rate)) / rate;
  const loopSeconds = score.loop ? (Math.round(tickToSeconds(score, score.loop.endTick) * rate) - Math.round(tickToSeconds(score, score.loop.startTick) * rate)) / rate : null;
  return { bodySeconds, totalSeconds, loopSeconds };
}
export function musicConstraintConflicts(constraints: MusicConstraints, instruments: readonly MusicInstrument[], render: MusicScore['render'], ppq = 480): string[] {
  const errors: string[] = [], add = (path: string, message: string) => errors.push(`musicConstraints.${path}: ${message}`);
  for (const key of ['requiredInstruments', 'allowedInstruments', 'excludedInstruments'] as const)
    for (const id of constraints[key] ?? []) if (!instruments.some(item => item.id === id)) add(key, `${id} is absent from the selected real soundbank; query soundbankInfo and choose an actual instrument identity.`);
  for (const id of constraints.requiredInstruments ?? []) {
    if (constraints.excludedInstruments?.includes(id)) add('requiredInstruments', `${id} is also excluded. Remove one conflicting requirement.`);
    if (constraints.allowedInstruments && !constraints.allowedInstruments.includes(id)) add('requiredInstruments', `${id} is outside allowedInstruments. Include it or remove the requirement.`);
  }
  if (constraints.allowedInstruments && !constraints.allowedInstruments.some(id => !constraints.excludedInstruments?.includes(id))) add('allowedInstruments', 'No usable instrument remains after exclusions.');
  const loop = constraints.loop;
  if (loop && (loop.startTick !== undefined || loop.endTick !== undefined) && (!loop.enabled || loop.startTick === undefined || loop.endTick === undefined || loop.startTick >= loop.endTick!)) add('loop', 'An explicit loop range requires enabled=true and startTick < endTick.');
  const barsSeconds = constraints.bars !== undefined && constraints.meter && constraints.fixedBpm ? constraints.bars * constraints.meter.beats * 4 / constraints.meter.unit * 60 / constraints.fixedBpm : undefined;
  const precision = constraints.fixedBpm ? 60 / constraints.fixedBpm / ppq / 2 : 0;
  const tolerance = constraints.toleranceSeconds ?? 0;
  if (barsSeconds !== undefined && constraints.bodySeconds !== undefined && Math.abs(barsSeconds - constraints.bodySeconds) > tolerance + precision) add('bodySeconds', `Conflicts with bars, meter and fixedBpm (${barsSeconds} body seconds).`);
  const body = constraints.bodySeconds ?? barsSeconds;
  if (body !== undefined && constraints.totalSeconds !== undefined) {
    const totals = loop ? [body + (loop.enabled ? 0 : render.tailSeconds)] : [body, body + render.tailSeconds];
    if (totals.every(total => Math.abs(total - constraints.totalSeconds!) > tolerance * (constraints.bodySeconds === undefined ? 1 : 2) + precision + 1 / render.sampleRate)) add('totalSeconds', `Conflicts with body length, loop and retained tail (${totals.join(' or ')} total seconds).`);
  }
  if (constraints.bars !== undefined && constraints.meter && loop?.endTick !== undefined && loop.endTick > constraints.bars * constraints.meter.beats * 4 / constraints.meter.unit * ppq) add('loop.endTick', 'The requested range extends beyond the required number of bars.');
  return errors;
}
export function musicConstraintViolations(score: MusicScore, constraints: MusicConstraints): string[] {
  const errors: string[] = [], add = (path: string, actual: unknown, expected: unknown) => errors.push(`musicConstraints.${path}: received ${JSON.stringify(actual)}; required ${JSON.stringify(expected)}. Correct the score and reprocess locally, or prepare a specific correction request.`);
  if (constraints.fixedBpm !== undefined && score.tempo.some(event => event.bpm !== constraints.fixedBpm)) add('fixedBpm', score.tempo, constraints.fixedBpm);
  if (constraints.meter && (score.meter.beats !== constraints.meter.beats || score.meter.unit !== constraints.meter.unit)) add('meter', score.meter, constraints.meter);
  if (constraints.bars !== undefined && score.durationTicks !== constraints.bars * score.ppq * score.meter.beats * 4 / score.meter.unit) add('bars', score.durationTicks / (score.ppq * score.meter.beats * 4 / score.meter.unit), constraints.bars);
  const durations = scoreDurations(score), tolerance = constraints.toleranceSeconds ?? 0;
  const finalBpm = [...score.tempo].reverse().find(event => event.tick <= score.durationTicks)?.bpm ?? score.tempo[0]!.bpm;
  const tickPrecision = 60 / finalBpm / score.ppq / 2;
  if (constraints.bodySeconds !== undefined && Math.abs(durations.bodySeconds - constraints.bodySeconds) > tolerance + tickPrecision) add('bodySeconds', durations.bodySeconds, constraints.bodySeconds);
  if (constraints.totalSeconds !== undefined && Math.abs(durations.totalSeconds - constraints.totalSeconds) > tolerance + tickPrecision + 1 / score.render.sampleRate) add('totalSeconds', durations.totalSeconds, constraints.totalSeconds);
  if (constraints.loop) {
    if (!!score.loop !== constraints.loop.enabled) add('loop.enabled', !!score.loop, constraints.loop.enabled);
    else if (constraints.loop.enabled) {
      const range = constraints.loop.startTick === undefined ? { startTick: 0, endTick: score.durationTicks } : { startTick: constraints.loop.startTick, endTick: constraints.loop.endTick };
      if (score.loop?.startTick !== range.startTick || score.loop.endTick !== range.endTick) add('loop', score.loop, range);
    }
  }
  const used = new Set(score.tracks.filter(track => track.notes.length).map(track => track.instrumentId));
  for (const id of constraints.requiredInstruments ?? []) if (!used.has(id)) add('requiredInstruments', [...used], id);
  for (const track of score.tracks) {
    if (constraints.allowedInstruments && !constraints.allowedInstruments.includes(track.instrumentId)) add('allowedInstruments', track.instrumentId, constraints.allowedInstruments);
    if (constraints.excludedInstruments?.includes(track.instrumentId)) add('excludedInstruments', track.instrumentId, constraints.excludedInstruments);
  }
  return errors;
}
