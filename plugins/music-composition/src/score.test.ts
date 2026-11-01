import { describe, expect, it } from 'vitest';
import { createMusicScore, parseGeneratedMusicScore, parseMusicScore, scoreDiagnostics, tickToSeconds } from './score.js';
import { validateScoreInstruments } from './catalog.js';
import type { MusicInstrument } from './catalog.js';
import { compileMusicScore } from './events.js';
import { tickPosition } from './time.js';
import { finishRenderChannels, loopBoundaryScore } from './render-core.js';
import { audioToWav } from 'spessasynth_core';
const piano: MusicInstrument = { id: 'melodic:0:0:0', name: 'Piano', bankMSB: 0, bankLSB: 0, program: 0, drum: false, minPitch: 21, maxPitch: 108, controllers: [1, 7, 10, 11, 64, 91, 93] };
describe('editable composition contract', () => {
  it('retains a valid hand-written score and locates malformed generated notes by track and bar', () => {
    const score = createMusicScore(); expect(parseGeneratedMusicScore(JSON.stringify(score)).ok).toBe(true);
    score.tracks[0]!.notes[4]!.velocity = 140;
    expect(scoreDiagnostics(score)).toContainEqual(expect.objectContaining({ path: 'tracks[0].notes[4]', trackId: 'track-piano', bar: 3 }));
    expect(parseMusicScore(score).ok).toBe(false); expect(parseGeneratedMusicScore('some arbitrary JavaScript').ok).toBe(false);
    expect(parseMusicScore({ ...createMusicScore(), origin: { kind: 'llm', taskId: { invalid: true } } }).ok).toBe(false);
    expect(parseMusicScore({ ...createMusicScore(), hiddenScript: 'arbitrary source' }).ok).toBe(false);
  });
  it('derives seconds from the same tempo map and uses Tone solely to describe musical position', () => {
    const score = createMusicScore(); score.tempo = [{ tick: 0, bpm: 120 }, { tick: 1920, bpm: 60 }];
    expect(tickToSeconds(score, 2880)).toBe(4); expect(tickPosition(score, 1920)).toBe('1:0:0');
    const compiled = compileMusicScore(score, [piano]); expect(compiled.durationSeconds).toBe(tickToSeconds(score, score.durationTicks));
    expect(() => structuredClone(compiled.midi)).not.toThrow();
    expect(compiled.events.filter(event => event.kind === 'noteOn')).toHaveLength(score.tracks[0]!.notes.length);
  });
  it('rejects unknown exact instruments and unsupported expression rather than replacing the patch', () => {
    const score = createMusicScore(); score.tracks[0]!.instrumentId = 'melodic:4:0:0';
    expect(() => compileMusicScore(score, [piano])).toThrow('remap');
    score.tracks[0]!.instrumentId = piano.id; score.tracks[0]!.controls = [{ tick: 0, controller: 2, value: 90 }];
    expect(validateScoreInstruments(score, [piano])[0]).toContain('CC2');
  });
  it('wraps the actual rendered tail into the loop and keeps non-loop endings', () => {
    const score = createMusicScore(); score.render.gain = 1;
    const channel = Float32Array.of(.1, .2, .3, .4, .05, .06);
    const rate = 48000, duration = 4 / rate;
    const wrapped = finishRenderChannels([channel, channel], score, duration, { startSec: 1 / rate, endSec: duration, tail: 'wrap' });
    expect(wrapped.channels[0]!.length).toBe(4); expect(wrapped.channels[0]![1]).toBeCloseTo(.25); expect(wrapped.channels[0]![2]).toBeCloseTo(.36);
    expect(finishRenderChannels([channel, channel], score, duration, null).channels[0]!.length).toBe(6);
    expect(finishRenderChannels([channel, channel], score, duration, { startSec: 0, endSec: duration, tail: 'cut' }).channels[0]![1]).toBeCloseTo(.2);
  });
  it.each([84, 84.5])('writes frame-aligned loop metadata for %s BPM that fits the encoded PCM', bpm => {
    const score = createMusicScore(); score.tempo = [{ tick: 0, bpm }]; score.loop!.startTick = 1;
    const original = structuredClone(score), compiled = compileMusicScore(score, [piano]), rate = score.render.sampleRate;
    const channel = new Float32Array(Math.ceil((compiled.durationSeconds + score.render.tailSeconds) * rate));
    const rendered = finishRenderChannels([channel, channel], score, compiled.durationSeconds, compiled.loop);
    const wave = new DataView(audioToWav(rendered.channels, rate, { normalizeAudio: false }));
    let blockAlign = 0, frames = 0;
    for (let offset = 12; offset < wave.byteLength;) {
      const kind = String.fromCharCode(...new Uint8Array(wave.buffer, offset, 4)), bytes = wave.getUint32(offset + 4, true);
      if (kind === 'fmt ') blockAlign = wave.getUint16(offset + 20, true);
      if (kind === 'data') frames = bytes / blockAlign;
      offset += 8 + bytes + bytes % 2;
    }
    expect(frames).toBe(rendered.channels[0]!.length);
    expect(rendered.loop).toEqual({ startSec: Math.round(compiled.loop!.startSec * rate) / rate, endSec: frames / rate, tail: 'wrap' });
    expect(rendered.loop!.endSec).toBeLessThanOrEqual(rendered.durationSeconds);
    expect(score).toEqual(original);
    expect(compiled.loop!.endSec).toBe(tickToSeconds(score, score.loop!.endTick));
  });
  it('isolates inner loop tails from later outro notes while preserving the full source', () => {
    const score = createMusicScore(); score.loop = { startTick: 960, endTick: 3840 };
    const boundary = loopBoundaryScore(score)!; expect(boundary.durationTicks).toBe(3840); expect(boundary.loop).toBeNull();
    expect(boundary.tracks[0]!.notes.every(note => note.startTick + note.durationTicks <= 3840)).toBe(true);
    expect(score.tracks[0]!.notes.at(-1)!.startTick).toBeGreaterThan(3840);
  });
});
