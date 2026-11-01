import type { Framing } from '@galcraft/contracts';

export const framingPresets = ['upper', 'far', 'medium', 'near', 'full'] as const;
export type FramingPreset = typeof framingPresets[number];

/** Keep the top margin consistent while fitting the chosen part of the source portrait. */
export function portraitFraming(preset: FramingPreset, sourceHeight: number, canvasHeight: number): Framing {
  const visible = { upper: .6, far: 1, medium: .75, near: .4, full: 1 }[preset];
  const height = canvasHeight * (preset === 'far' ? .72 : .95);
  const scale = Number((height / (sourceHeight * visible)).toFixed(4));
  return { mode: preset === 'far' || preset === 'full' ? 'full' : 'upper', scale, offsetX: 0,
    offsetY: visible === 1 ? 0 : Number((sourceHeight * scale - canvasHeight * .95).toFixed(2)), crop: null };
}
