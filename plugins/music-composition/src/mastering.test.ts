import { expect, it } from 'vitest';
import { integratedLoudness, masterMusic } from './mastering.js';

const tone = (amplitude: number, seconds = 2) => Array.from({ length: 2 }, () => Float32Array.from({ length: seconds * 48000 }, (_, i) => amplitude * Math.sin(2 * Math.PI * 1000 * i / 48000)));
it('raises quiet stereo PCM with one gain while preserving dynamics and frame length', () => {
  const channels = tone(.01), before = channels[0]!.slice(), originalLength = before.length;
  const result = masterMusic(channels, 48000);
  expect(result.gainDb).toBeGreaterThan(10);
  expect(integratedLoudness(channels, 48000)).toBeCloseTo(-18, 3);
  expect(channels[0]!.length).toBe(originalLength);
  expect(channels[0]![12]! / before[12]!).toBeCloseTo(channels[0]![42]! / before[42]!, 5);
  expect(result.peakLimited).toBe(false);
});
it('keeps silence silent and limits a sparse transient using gain rather than clipping', () => {
  const silent = [new Float32Array(48000), new Float32Array(48000)];
  expect(masterMusic(silent, 48000).inputLufs).toBeNull();
  expect(silent[0]!.every(value => value === 0)).toBe(true);
  const channels = tone(.0001); channels[0]![24000] = 1;
  const result = masterMusic(channels, 48000);
  expect(result.peakLimited).toBe(true); expect(result.peak).toBeCloseTo(10 ** (-2 / 20), 5);
  expect(result.outputLufs).toBeLessThan(-18);
});
