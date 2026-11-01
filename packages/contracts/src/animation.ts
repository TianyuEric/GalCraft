import { z } from 'zod';

export const NativeEasingSchema = z.strictObject({
  family: z.enum(['linear', 'sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce']),
  direction: z.enum(['in', 'out', 'inOut']),
});
export const AnimationPathSchema = z.enum([
  '/x', '/y', '/scaleX', '/scaleY', '/rotationDeg', '/opacity', '/blur', '/brightness', '/contrast', '/saturation', '/gamma', '/z',
  '/rgb/0', '/rgb/1', '/rgb/2', '/bloom/intensity', '/bloom/brightness', '/bloom/blur', '/bloom/threshold',
  '/bevel/opacity', '/bevel/thickness', '/bevel/rotationDeg', '/bevel/softness', '/bevel/rgb/0', '/bevel/rgb/1', '/bevel/rgb/2',
  '/filters/oldFilm', '/filters/dot', '/filters/reflection', '/filters/glitch', '/filters/rgbSplit', '/filters/godray', '/blend', '/station',
  '/shockwave/time', '/shockwave/amplitude', '/shockwave/wavelength', '/shockwave/speed', '/shockwave/radius', '/shockwave/centerX', '/shockwave/centerY',
  '/circle/radius', '/circle/softness', '/circle/centerX', '/circle/centerY', '/circle/invert',
]);
export type AnimationPath = z.infer<typeof AnimationPathSchema>;
export const AnimationLeafSchema = z.union([z.number().finite(), z.boolean(), z.enum([
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add',
  'left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right',
])]);
export type AnimationLeaf = z.infer<typeof AnimationLeafSchema>;
export const AnimationTrackSchema = z.strictObject({
  path: AnimationPathSchema,
  mode: z.enum(['absolute', 'add', 'multiply']).default('absolute'),
  keyframes: z.array(z.strictObject({ timeMs: z.number().finite().nonnegative(), value: AnimationLeafSchema,
    easing: NativeEasingSchema.default({ family: 'linear', direction: 'in' }) })).min(1),
});
export type AnimationTrack = z.infer<typeof AnimationTrackSchema>;
export const NativeAnimationSchema = z.strictObject({
  type: z.literal('galcraft.animation'), version: z.literal(1), durationMs: z.number().finite().nonnegative(), tracks: z.array(AnimationTrackSchema).min(1),
}).superRefine((animation, context) => {
  const paths = new Set<string>();
  animation.tracks.forEach((track, index) => {
    if (paths.has(track.path)) context.addIssue({ code: 'custom', path: ['tracks', index, 'path'], message: 'Duplicate animation property track' });
    paths.add(track.path);
    const discrete = track.path === '/station' || track.path === '/blend' || track.path === '/circle/invert' || track.path.startsWith('/filters/');
    track.keyframes.forEach((keyframe, keyIndex) => {
      const path = ['tracks', index, 'keyframes', keyIndex];
      if (keyframe.timeMs > animation.durationMs || keyIndex > 0 && keyframe.timeMs <= track.keyframes[keyIndex - 1]!.timeMs)
        context.addIssue({ code: 'custom', path: [...path, 'timeMs'], message: 'Keyframe times must increase within the animation duration' });
      const valid = track.path.startsWith('/filters/') || track.path === '/circle/invert' ? typeof keyframe.value === 'boolean' : track.path === '/station' ?
        ['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'].includes(String(keyframe.value)) : track.path === '/blend' ?
          ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add'].includes(String(keyframe.value)) : typeof keyframe.value === 'number';
      if (!valid || discrete && track.mode !== 'absolute')
        context.addIssue({ code: 'custom', path: [...path, 'value'], message: 'Keyframe value or relative mode does not match its property' });
    });
  });
});
export type NativeAnimation = z.infer<typeof NativeAnimationSchema>;
