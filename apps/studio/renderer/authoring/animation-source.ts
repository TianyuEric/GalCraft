import { AnimationPathSchema, NativeAnimationSchema, SegmentSchema } from '@galcraft/contracts';
import type { AnimationLeaf, AnimationTrack, Json, NativeAnimation } from '@galcraft/contracts';
const sources = ['animation', 'segments', 'resourceId'] as const;
export function animationSourceChanges(args: Record<string, unknown>, field: string, value: Json) {
  return [{ field, op: 'set' as const, value }, ...sources.filter(key => key !== field && args[key] != null)
    .map(key => ({ field: key, op: 'inherit' as const, value: null }))];
}
/** Expand continuous absolute segments; preserve sources that need instantaneous jumps. */
export function segmentAnimation(value: unknown, baseline: unknown): NativeAnimation {
  const segments = SegmentSchema.array().min(1).parse(value);
  const flatten = (value: unknown, path = '', result: Record<string, AnimationLeaf> = {}) => {
    if (value !== null && typeof value === 'object') for (const [key, child] of Object.entries(value)) flatten(child, `${path}/${key}`, result);
    else if (AnimationPathSchema.safeParse(path).success && (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')) result[path] = value as AnimationLeaf;
    return result;
  };
  const start = flatten(baseline), patches = segments.map(item => flatten(item.effects));
  const paths = [...new Set(patches.flatMap(item => Object.keys(item)))];
  const tracks: AnimationTrack[] = paths.map(raw => {
    const path = AnimationPathSchema.parse(raw); let value = start[path];
    if (value === undefined) throw new Error('请先在当前指令舞台确认动画目标，再打开分段时间轴。');
    let timeMs = 0; const keyframes: AnimationTrack['keyframes'] = [{ timeMs, value, easing: { family: 'linear', direction: 'in' } }];
    segments.forEach((segment, index) => {
      timeMs += Math.max(0, segment.durationMs); value = patches[index]![path] ?? value;
      const frame = { timeMs, value, easing: segment.easing };
      if (keyframes.at(-1)!.timeMs === timeMs) {
        if (timeMs === 0) keyframes[0] = frame;
        else if (keyframes.at(-1)!.value !== value) throw new Error('该动画包含瞬时跳变，时间轴暂不支持无损转换。已保留原动画，请继续编辑分段属性。');
      } else keyframes.push(frame);
    });
    return { path, mode: 'absolute', keyframes };
  });
  return NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: segments.reduce((sum, item) => sum + Math.max(0, item.durationMs), 0), tracks });
}
