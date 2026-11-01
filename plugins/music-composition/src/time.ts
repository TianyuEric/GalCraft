import { TicksClass } from 'tone/build/esm/core/type/Ticks.js';
import type { BaseContext } from 'tone';
import type { MusicScore } from './score.js';
/** Tone converts musical units using the score's timing values. Spessa owns playback time. */
export function tickPosition(score: Pick<MusicScore, 'ppq' | 'tempo' | 'meter'>, tick: number): string {
  const context = { transport: { PPQ: score.ppq, bpm: { value: score.tempo[0]!.bpm }, timeSignature: score.meter.beats * 4 / score.meter.unit } } as unknown as BaseContext;
  return new TicksClass(context, tick, 'i').toBarsBeatsSixteenths();
}
