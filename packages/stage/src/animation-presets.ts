import { NativeAnimationSchema, type AnimationTrack, type NativeAnimation, type StageStation } from '@galcraft/contracts';
import { stationX } from './geometry.js';

export const AnimationPresets = [
  { id: 'sway', group: 'reaction', title: ['左右轻晃', 'Sway', '左右に揺れる'], durationMs: 700, amplitude: 24, cycles: 2 },
  { id: 'shake', group: 'reaction', title: ['快速抖动', 'Shake', '素早く揺れる'], durationMs: 1000, amplitude: 100, cycles: 1 },
  { id: 'jump', group: 'reaction', title: ['上下跳跃', 'Jump', 'ジャンプ'], durationMs: 600, amplitude: 90, cycles: 1 },
  { id: 'vibrate', group: 'reaction', title: ['小幅震动', 'Vibrate', '小さく震える'], durationMs: 400, amplitude: 6, cycles: 4 },
  { id: 'breath', group: 'idle', title: ['轻微呼吸', 'Breathe', '呼吸'], durationMs: 2800, amplitude: .003, cycles: 1 },
  { id: 'moveLeftQuarter', group: 'move', title: ['移动到左四分之一', 'Move to left quarter', '左1/4へ移動'], durationMs: 500, amplitude: 0, cycles: 1 },
  { id: 'moveRightQuarter', group: 'move', title: ['移动到右四分之一', 'Move to right quarter', '右1/4へ移動'], durationMs: 500, amplitude: 0, cycles: 1 },
  { id: 'moveTo', group: 'move', title: ['移动到指定位置', 'Move to position', '指定位置へ移動'], durationMs: 500, amplitude: 0, cycles: 1 },
  { id: 'moveBy', group: 'move', title: ['相对移动', 'Move by offset', '相対移動'], durationMs: 500, amplitude: 120, cycles: 1 },
  { id: 'slideInLeft', group: 'entrance', title: ['从左滑入', 'Slide in from left', '左から登場'], durationMs: 500, amplitude: 50, cycles: 1 },
  { id: 'slideInRight', group: 'entrance', title: ['从右滑入', 'Slide in from right', '右から登場'], durationMs: 500, amplitude: 50, cycles: 1 },
  { id: 'slideOutLeft', group: 'exit', title: ['向左滑出', 'Slide out left', '左へ退場'], durationMs: 600, amplitude: 0, cycles: 1 },
  { id: 'slideOutRight', group: 'exit', title: ['向右滑出', 'Slide out right', '右へ退場'], durationMs: 600, amplitude: 0, cycles: 1 },
  { id: 'fadeIn', group: 'entrance', title: ['淡入', 'Fade in', 'フェードイン'], durationMs: 300, amplitude: 0, cycles: 1 },
  { id: 'fadeOut', group: 'exit', title: ['淡出', 'Fade out', 'フェードアウト'], durationMs: 300, amplitude: 0, cycles: 1 },
  { id: 'emphasize', group: 'emphasis', title: ['短暂放大', 'Emphasize', '一瞬拡大'], durationMs: 1000, amplitude: .15, cycles: 1 },
] as const;
export type AnimationPresetId = typeof AnimationPresets[number]['id'];
export type AnimationPresetParameters = { durationMs?: number; amplitude?: number; cycles?: number; targetX?: number; targetY?: number; offsetY?: number; stageWidth?: number; station?: StageStation };
export type AppliedAnimationPreset = { animation: NativeAnimation; keepFinal: boolean; loop: boolean; lifecycle: 'property' | 'show' | 'exit' };

/** Core GCA presets share the stage's coordinates and pure property-track schema. */
export function createAnimationPreset(id: AnimationPresetId, parameters: AnimationPresetParameters = {}): AppliedAnimationPreset {
  const preset = AnimationPresets.find(item => item.id === id);
  if (!preset) throw new Error(`Unknown animation preset ${id}`);
  const durationMs = parameters.durationMs ?? preset.durationMs, amplitude = parameters.amplitude ?? preset.amplitude;
  const cycles = parameters.cycles ?? preset.cycles, width = parameters.stageWidth ?? 1920;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(amplitude) || !Number.isSafeInteger(cycles) || cycles < 1 || cycles > 32 || !Number.isFinite(width) || width <= 0)
    throw new RangeError('Use a positive duration and stage width, finite amplitude, and 1–32 cycles');
  const tracks: AnimationTrack[] = [];
  const track = (path: AnimationTrack['path'], mode: AnimationTrack['mode'], values: number[], family: 'sine' | 'linear' | 'quad' = 'sine') => tracks.push({ path, mode,
    keyframes: values.map((value, index) => ({ timeMs: index * durationMs / (values.length - 1), value, easing: { family, direction: 'inOut' } })) });
  const pulse = (peak: number, origin = 0) => [origin, ...Array.from({ length: cycles }, () => [peak, origin]).flat()];
  if (id === 'shake') {
    tracks.push({ path: '/x', mode: 'add', keyframes: [{ timeMs: 0, value: 0, easing: { family: 'quad', direction: 'inOut' } },
      ...Array.from({ length: cycles }, (_, cycle) => [
        { timeMs: durationMs * (cycle + .25) / cycles, value: -amplitude, easing: { family: 'quad' as const, direction: 'out' as const } },
        { timeMs: durationMs * (cycle + .75) / cycles, value: amplitude, easing: { family: 'quad' as const, direction: 'inOut' as const } },
        { timeMs: durationMs * (cycle + 1) / cycles, value: 0, easing: { family: 'quad' as const, direction: 'in' as const } },
      ]).flat()] });
  } else if (id === 'sway' || id === 'vibrate') {
    track('/x', 'add', [0, ...Array.from({ length: cycles }, () => [-amplitude, amplitude]).flat(), 0], id === 'sway' ? 'sine' : 'linear');
    if (id === 'vibrate') track('/y', 'add', [0, ...Array.from({ length: cycles }, () => [amplitude / 2, -amplitude / 2]).flat(), 0], 'linear');
  } else if (id === 'jump') track('/y', 'add', pulse(-Math.abs(amplitude)));
  else if (id === 'breath' || id === 'emphasize') {
    track('/scaleX', 'multiply', pulse(1 + amplitude, 1), id === 'emphasize' ? 'quad' : 'sine'); track('/scaleY', 'multiply', pulse(1 + amplitude, 1), id === 'emphasize' ? 'quad' : 'sine');
  } else if (id === 'moveBy') {
    track('/x', 'add', [0, amplitude]); track('/y', 'add', [0, parameters.offsetY ?? 0]);
  } else if (preset.group === 'move') {
    const x = id === 'moveLeftQuarter' ? width * .25 : id === 'moveRightQuarter' ? width * .75 : parameters.targetX ?? width / 2;
    tracks.push({ path: '/x', mode: 'absolute', keyframes: [{ timeMs: durationMs, value: x - stationX(parameters.station ?? 'center', width), easing: { family: 'sine', direction: 'inOut' } }] });
    if (parameters.targetY !== undefined) tracks.push({ path: '/y', mode: 'absolute', keyframes: [{ timeMs: durationMs, value: parameters.targetY, easing: { family: 'sine', direction: 'inOut' } }] });
  } else if (id === 'fadeIn' || id === 'fadeOut') track('/opacity', 'multiply', id === 'fadeIn' ? [0, 1] : [1, 0], 'quad');
  else if (id === 'slideInLeft' || id === 'slideInRight') {
    track('/x', 'add', [id === 'slideInLeft' ? -amplitude : amplitude, 0], 'quad');
    track('/opacity', 'multiply', [0, 1], 'quad'); track('/blur', 'add', [5, 0], 'quad');
  }
  else track('/x', 'add', id === 'slideOutLeft' ? [0, -width] : [0, width]);
  return { animation: NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs, tracks }), keepFinal: !['reaction', 'idle', 'emphasis'].includes(preset.group),
    loop: id === 'breath', lifecycle: preset.group === 'entrance' ? 'show' : preset.group === 'exit' ? 'exit' : 'property' };
}
