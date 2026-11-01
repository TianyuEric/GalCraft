import { expect, it } from 'vitest';
import { musicRenderOperation } from './definition.js';
import { parseMusicScore } from './score.js';
it('offers three independently editable valid starting scores through the public operation', () => {
  expect(musicRenderOperation.presets).toHaveLength(3);
  for (const preset of musicRenderOperation.presets!) expect(parseMusicScore(preset.defaults.score).ok).toBe(true);
  const [first, second] = musicRenderOperation.presets!;
  expect(first!.defaults.score).not.toBe(second!.defaults.score);
});
