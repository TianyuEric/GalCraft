import { expect, it } from 'vitest';
import { EffectValuesSchema, SegmentSchema } from '@galcraft/contracts';
import { FixtureEffects } from '@galcraft/contracts/fixtures';
import { sampleObjectAnimation } from '@galcraft/stage';
import { animationSourceChanges, segmentAnimation } from './animation-source.js';
const easing = { family: 'linear', direction: 'in' } as const;
const target = () => ({ id: 'Object1', current: EffectValuesSchema.parse({ ...FixtureEffects, x: 0, y: 0 }), defaults: EffectValuesSchema.parse(FixtureEffects), processes: [] });
it('replaces an inline source with an asset without retaining a second executable source', () => {
  expect(animationSourceChanges({ animation: { tracks: [] }, target: { kind: 'stage' } }, 'resourceId', 'Asset1')).toEqual([
    { field: 'resourceId', op: 'set', value: 'Asset1' }, { field: 'animation', op: 'inherit', value: null },
  ]);
});
it('expands continuous segment holds using the real target baseline', () => {
  const result = segmentAnimation([{ durationMs: 100, effects: { y: 10 }, easing }, { durationMs: 200, effects: { x: 50 }, easing }], { x: 25, y: 0 });
  expect(result.durationMs).toBe(300);
  expect(result.tracks.find(item => item.path === '/x')!.keyframes.map(item => [item.timeMs, item.value])).toEqual([[0, 25], [100, 25], [300, 50]]);
  expect(() => segmentAnimation([{ durationMs: 100, effects: { x: 50 }, easing }], null)).toThrow('舞台');
});
it.each([false, true])('retains a source with an instantaneous jump after elapsed time (following segment: %s)', following => {
  const segments = SegmentSchema.array().parse([{ durationMs: 1000, effects: { x: 100 }, easing }, { durationMs: 0, effects: { x: 200 }, easing },
    ...(following ? [{ durationMs: 1000, effects: { x: 300 }, easing }] : [])]);
  const before = structuredClone(segments), object = target();
  expect(() => segmentAnimation(segments, object.current)).toThrow('瞬时跳变');
  expect(segments).toEqual(before);
  for (const [time, expected] of [[500, 50], [999, 99.9], [1000, 200], [1250, following ? 225 : 200]])
    expect(sampleObjectAnimation(object, segments, time!).current.x).toBeCloseTo(expected!);
});
it('preserves sampling for leading instant segments and zero-duration holds with different easing', () => {
  const object = target(), segments = SegmentSchema.array().parse([
    { durationMs: 0, effects: { x: 10 }, easing }, { durationMs: 0, effects: { x: 20 }, easing },
    { durationMs: 1000, effects: { x: 100 }, easing },
    { durationMs: 0, effects: { x: 100 }, easing: { family: 'quad', direction: 'in' } },
    { durationMs: 1000, effects: { x: 300 }, easing },
  ]);
  const converted = segmentAnimation(segments, object.current);
  for (const time of [0, 250, 500, 999, 1000, 1250, 2000])
    expect(sampleObjectAnimation(object, converted, time).current.x).toBeCloseTo(sampleObjectAnimation(object, segments, time).current.x);
});
