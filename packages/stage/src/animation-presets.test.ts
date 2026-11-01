import { expect, it } from 'vitest';
import { EffectValuesSchema, NativeAnimationSchema } from '@galcraft/contracts';
import { FixtureEffects } from '@galcraft/contracts/fixtures';
import { AnimationPresets, createAnimationPreset } from './animation-presets.js';
import { sampleObjectAnimation } from './animation.js';
import { stationX } from './geometry.js';
const target = () => ({ id: 'Object', station: 'rightThird' as const, current: { ...EffectValuesSchema.parse(FixtureEffects), x: 77, scaleX: .8, scaleY: .8 }, defaults: EffectValuesSchema.parse(FixtureEffects), processes: [] });
it('produces valid GCA tracks for every shipped preset and declares object lifecycle separately', () => {
  for (const preset of AnimationPresets) expect(NativeAnimationSchema.safeParse(createAnimationPreset(preset.id).animation).success).toBe(true);
  expect(createAnimationPreset('fadeOut').lifecycle).toBe('exit');
  expect(createAnimationPreset('slideInLeft').lifecycle).toBe('show');
});
it('returns every reaction to the actual baseline without accumulating drift', () => {
  for (const id of ['sway', 'shake', 'jump', 'vibrate', 'breath', 'emphasize'] as const) {
    const preset = createAnimationPreset(id), first = sampleObjectAnimation(target(), preset.animation, preset.animation.durationMs);
    const second = sampleObjectAnimation(first, preset.animation, preset.animation.durationMs);
    expect(second.current).toEqual(target().current); expect(preset.keepFinal).toBe(false);
  }
});
it('compensates station offset so quarter movement reaches its continuous numeric endpoint', () => {
  for (const id of ['moveLeftQuarter', 'moveRightQuarter'] as const) {
    const preset = createAnimationPreset(id, { stageWidth: 1600, station: 'rightThird' });
    const final = sampleObjectAnimation(target(), preset.animation, preset.animation.durationMs);
    expect(stationX(final.station ?? 'center', 1600) + final.current.x).toBeCloseTo(id === 'moveLeftQuarter' ? 400 : 1200);
    const middle = sampleObjectAnimation(target(), preset.animation, preset.animation.durationMs / 2);
    expect(middle.current.x).not.toBe(final.current.x); expect(final.station).toBe('rightThird'); expect(preset.keepFinal).toBe(true);
  }
});
it('keeps upper-body breathing subtle and completes default movement within half a second', () => {
  const breath=createAnimationPreset('breath'), base=target();
  const peak=sampleObjectAnimation(base,breath.animation,breath.animation.durationMs/2);
  const upperBodyHeight=1080*.95/.6;
  expect((peak.current.scaleY/base.current.scaleY-1)*upperBodyHeight).toBeLessThan(6);
  expect(breath.loop).toBe(true);
  const move=createAnimationPreset('moveBy');
  expect(sampleObjectAnimation(base,move.animation,500).current.x).toBe(base.current.x+120);
  expect(createAnimationPreset('moveBy',{durationMs:1000}).animation.durationMs).toBe(1000);
});
it('samples shake timing and segment easing at intermediate points', () => {
  const preset = createAnimationPreset('shake'), base = target();
  expect(preset.animation.durationMs).toBe(1000);
  expect(sampleObjectAnimation(base, preset.animation, 125).current.x).toBeCloseTo(base.current.x - 75);
  expect(sampleObjectAnimation(base, preset.animation, 250).current.x).toBe(base.current.x - 100);
  expect(sampleObjectAnimation(base, preset.animation, 750).current.x).toBe(base.current.x + 100);
  expect(sampleObjectAnimation(base, preset.animation, 1000).current.x).toBe(base.current.x);
});
it('combines a 50px entrance, fade and additive blur without changing the authored baseline', () => {
  for (const id of ['slideInLeft', 'slideInRight'] as const) {
    const preset = createAnimationPreset(id), base = target(), sign = id === 'slideInLeft' ? -1 : 1;
    const start = sampleObjectAnimation(base, preset.animation, 0), middle = sampleObjectAnimation(base, preset.animation, 125);
    expect(start.current.x).toBe(base.current.x + sign * 50); expect(start.current.opacity).toBe(0); expect(start.current.blur).toBe(5);
    expect(middle.current.x).toBeCloseTo(base.current.x + sign * 43.75); expect(middle.current.opacity).toBeCloseTo(.125);
    expect(sampleObjectAnimation(base, preset.animation, 500).current).toEqual(base.current);
  }
  expect(createAnimationPreset('fadeIn').animation.durationMs).toBe(300);
  const emphasis = createAnimationPreset('emphasize');
  expect(sampleObjectAnimation(target(), emphasis.animation, 500).current.scaleX).toBeCloseTo(.8 * 1.15);
});
