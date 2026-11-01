import { SpessaLog, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core';
import type { BasicSoundBank } from 'spessasynth_core';
import type { MusicScore } from './score.js';
import { compileMusicScore } from './events.js';
import type { MusicInstrument } from './catalog.js';
import { masterMusic } from './mastering.js';
export type RenderLoop = { startSec: number; endSec: number; tail: 'wrap' | 'cut' } | null;
/** The browser Worklet and Node core apply the same gain, tail and loop treatment. */
export function loopBoundaryScore(score: MusicScore): MusicScore | null {
  if (!score.loop || score.render.loopTail !== 'wrap' || score.loop.endTick === score.durationTicks) return null;
  const boundary = structuredClone(score), end = score.loop.endTick;
  boundary.durationTicks = end; boundary.loop = null; boundary.tempo = boundary.tempo.filter(event => event.tick < end);
  boundary.segments = boundary.segments.filter(segment => segment.startTick < end).map(segment => ({ ...segment, endTick: Math.min(segment.endTick, end) }));
  for (const track of boundary.tracks) { track.notes = track.notes.filter(note => note.startTick < end).map(note => ({ ...note, durationTicks: Math.min(note.durationTicks, end - note.startTick) })); track.controls = track.controls.filter(event => event.tick <= end); }
  return boundary;
}
export function finishRenderChannels(channels: readonly Float32Array[], score: MusicScore, durationSeconds: number, loop: RenderLoop, boundaryTail?: readonly Float32Array[]) {
  const rate = score.render.sampleRate;
  const completeFrames = Math.round(durationSeconds * rate);
  const start = loop ? Math.round(loop.startSec * rate) : 0;
  const end = loop ? Math.round(loop.endSec * rate) : channels[0]!.length;
  const result = channels.map(channel => channel.slice(0, loop ? Math.max(completeFrames, end) : channel.length));
  if (loop && loop.tail === 'wrap') {
    const length = end - start;
    const tail = loop.endSec === durationSeconds ? channels : boundaryTail;
    if (!tail) throw new Error('内部循环区需要按相同音源渲染实际边界尾音');
    for (let c = 0; c < result.length; c++) for (let frame = end; frame < tail[c]!.length; frame++)
      result[c]![start + (frame - end) % length]! += tail[c]![frame]!;
  }
  let peak = 0;
  for (const channel of result) for (let i = 0; i < channel.length; i++) { channel[i] = channel[i]! * score.render.gain; peak = Math.max(peak, Math.abs(channel[i]!)); }
  if (peak > 1) throw new Error(`渲染峰值 ${peak.toFixed(2)} 超出音频范围；请降低音轨音量或渲染增益后重新计划`);
  const mastering = masterMusic(result, rate);
  // Playback uses the same sample boundaries as the PCM cut and tail wrap; the score retains exact ticks.
  const renderedLoop: RenderLoop = loop ? { ...loop, startSec: start / rate, endSec: end / rate } : null;
  return { channels: result, peak: mastering.peak, mastering, durationSeconds: result[0]!.length / rate, loop: renderedLoop };
}
function synthesize(score: MusicScore, bank: BasicSoundBank, instruments: readonly MusicInstrument[], progress?: (completed: number, total: number) => void) {
  SpessaLog.setLogLevel(false, false, false);
  const compiled = compileMusicScore(score, instruments);
  const synth = new SpessaSynthProcessor(score.render.sampleRate, { eventsEnabled: false, effectsEnabled: true });
  synth.soundBankManager.addSoundBank(bank, score.soundbank.id);
  const sequencer = new SpessaSynthSequencer(synth); sequencer.skipToFirstNoteOn = false; sequencer.loopCount = 0;
  sequencer.loadNewSongList([compiled.midi]); sequencer.play();
  const frames = Math.ceil(score.render.sampleRate * (compiled.durationSeconds + score.render.tailSeconds));
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let offset = 0; offset < frames; offset += 128) {
    sequencer.processTick(); synth.process(left, right, offset, Math.min(128, frames - offset));
    if (offset % (128 * 512) === 0) progress?.(offset, frames);
  }
  progress?.(frames, frames);
  return { channels: [left, right], compiled };
}
export function renderMusicPCM(score: MusicScore, bank: BasicSoundBank, instruments: readonly MusicInstrument[], progress?: (completed: number, total: number) => void) {
  const full = synthesize(score, bank, instruments, progress), boundary = loopBoundaryScore(score);
  const tail = boundary ? synthesize(boundary, bank, instruments).channels : undefined;
  return { ...finishRenderChannels(full.channels, score, full.compiled.durationSeconds, full.compiled.loop, tail), events: full.compiled.events };
}
