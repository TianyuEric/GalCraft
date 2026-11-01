import type { AnimationLeaf, AnimationPath, NativeAnimation, Segment } from '@galcraft/contracts';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
function bounce(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + .75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + .9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + .984375;
}
export function ease(progress: number, family: Segment['easing']['family'], direction: Segment['easing']['direction']): number {
  const base = (t: number) => {
    switch (family) {
      case 'sine': return 1 - Math.cos(t * Math.PI / 2);
      case 'quad': return t ** 2;
      case 'cubic': return t ** 3;
      case 'quart': return t ** 4;
      case 'quint': return t ** 5;
      case 'expo': return t === 0 ? 0 : 2 ** (10 * (t - 1));
      case 'circ': return 1 - Math.sqrt(1 - t * t);
      case 'back': return 2.70158 * t ** 3 - 1.70158 * t ** 2;
      case 'elastic': return t === 0 || t === 1 ? t : -(2 ** (10 * (t - 1))) * Math.sin((t - 1.075) * 2 * Math.PI / .3);
      case 'bounce': return 1 - bounce(1 - t);
      default: return t;
    }
  };
  const t = clamp(progress);
  return direction === 'out' ? 1 - base(1 - t) : direction === 'inOut' ?
    t < .5 ? base(t * 2) / 2 : 1 - base((1 - t) * 2) / 2 : base(t);
}

/** Samples only declared leaves. Relative values always use the frozen execution baseline. */
export function sampleAnimation(animation: NativeAnimation, timeMs: number,
  baseline: Partial<Record<AnimationPath, AnimationLeaf>>): Partial<Record<AnimationPath, AnimationLeaf>> {
  const result: Partial<Record<AnimationPath, AnimationLeaf>> = {};
  const time = Math.max(0, Math.min(animation.durationMs, timeMs));
  for (const track of animation.tracks) {
    const base = baseline[track.path];
    if (base === undefined) continue;
    const resolve = (value: AnimationLeaf): AnimationLeaf => typeof value === 'number' && typeof base === 'number' ?
      track.mode === 'add' ? base + value : track.mode === 'multiply' ? base * value : value : value;
    let fromTime = 0, from = base;
    let sampled = from;
    for (const frame of track.keyframes) {
      const to = resolve(frame.value);
      if (time >= frame.timeMs) { from = sampled = to; fromTime = frame.timeMs; continue; }
      if (typeof from === 'number' && typeof to === 'number') {
        const factor = ease((time - fromTime) / (frame.timeMs - fromTime), frame.easing.family, frame.easing.direction);
        sampled = from + (to - from) * factor;
      }
      break;
    }
    result[track.path] = sampled;
  }
  return result;
}
