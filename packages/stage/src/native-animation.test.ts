import { describe, expect, it } from 'vitest';
import { NativeAnimationSchema, PresentationStateSchema, parseAnimationResource } from '@galcraft/contracts';
import type { Result, StageObject } from '@galcraft/contracts';
import { FixtureEffects, FixtureIds, FixtureRuntimeState } from '@galcraft/contracts/fixtures';
import { advanceAnimations, finishAnimations, sampleObjectAnimation, scheduleAnimation, stopAnimation, StageCameraId, type AnimationTarget } from './animation.js';
import { sampleAnimation } from './sampling.js';
import { StageCommandService } from './commands.js';
import { advanceTransitions } from './transition.js';
import { createAnimationPreset } from './animation-presets.js';
import { inspectionPresentation } from './presentation-time.js';

const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };
const token = { sessionId: FixtureIds.session, occurrence: 1, statementId: FixtureIds.statements[0]! };
const linear = { family: 'linear', direction: 'in' } as const;
function object(): StageObject {
  return { id: FixtureIds.an, characterId: FixtureIds.an, assetId: FixtureIds.background, variantId: FixtureIds.variant,
    layer: 'figure', entranceOrder: 0, backgroundFrame: null, station: 'center', current: { ...structuredClone(FixtureEffects), x: 300 } as StageObject['current'],
    defaults: { ...structuredClone(FixtureEffects), station: 'center' } as StageObject['defaults'],
    framing: { mode: 'full', scale: 1, offsetX: 0, offsetY: 0, crop: null },
    transition: { enter: { preset: 'cut', resourceId: null, durationMs: 0, easing: linear, direction: 'left' },
      exit: { preset: 'cut', resourceId: null, durationMs: 0, easing: linear, direction: 'left' } },
    processes: [], providerState: null, imageFace: null };
}
const definition = (mode: 'absolute' | 'add' | 'multiply' = 'add', value = 100) => NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 100,
  tracks: [{ path: '/x', mode, keyframes: [{ timeMs: 100, value }] }] });
const stateWith = (item: StageObject) => ({ ...structuredClone(FixtureRuntimeState.presentation), objects: [item] });

describe('native animation model, sampling and execution', () => {
  it('inspects the finite movement result while preserving a concurrent looping process', () => {
    const item = object(), loop = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 1000,
      tracks: [{ path: '/scaleY', mode: 'multiply', keyframes: [{ timeMs: 1000, value: 1.1 }] }] });
    unwrap(scheduleAnimation(item, { owner: token, animationId: 'Breath', native: loop, loop: true, parallel: true, keepFinal: false }));
    unwrap(scheduleAnimation(item, { owner: { ...token, occurrence: 2 }, animationId: 'Move', native: definition('absolute', 900), parallel: true, keepFinal: true }));
    const source=stateWith(item), inspected=inspectionPresentation(source);
    expect(inspected.objects[0]!.current.x).toBe(900);expect(source.objects[0]!.current.x).toBe(300);
    expect(inspected.objects[0]!.processes.map(process=>process.animationId)).toEqual(['Breath']);
    expect(inspected.objects[0]!.processes[0]!.elapsedMs).toBe(0);
  });
  it('retains the complete inline entrance through runtime state and restore without resource lookup', async () => {
    const item = object(), preset = createAnimationPreset('slideInLeft');
    const service = new StageCommandService({ asset: () => ({ ok: true, value: { variantId: item.variantId, kind: 'image', provider: null, providerVersion: null }, warnings: [] }) });
    const started = unwrap(await service.prepare({ state: structuredClone(FixtureRuntimeState), token, opcode: 'changeFigure', args: {
      op: 'show', objectId: item.id, characterId: item.characterId, assetId: item.assetId,
      transition: { enter: { preset: 'custom', resourceId: null, animation: preset.animation, durationMs: 500, easing: linear, direction: 'left' } },
    } }));
    const restored = PresentationStateSchema.parse(JSON.parse(JSON.stringify(started.state.presentation)));
    expect(restored.transitions[0]!.custom).toEqual(preset.animation);
    expect(restored.transitions[0]!.spec.easing).toEqual(linear);
    const base = restored.transitions[0]!.to!;
    const sampled = sampleObjectAnimation(base, restored.transitions[0]!.custom!, 125);
    expect(sampled.current.x).toBeCloseTo(base.current.x - 43.75);
    expect(sampled.current.opacity).toBeCloseTo(base.current.opacity * .125);
    expect(advanceTransitions(restored, 500).state.transitions).toEqual([]);
  });
  it('restores a saved temporary instance while preserving newer owners and other processes', () => {
    const item = object();
    const breathing = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 100, tracks: [
      { path: '/x', mode: 'add', keyframes: [{ timeMs: 100, value: 20 }] },
      { path: '/scaleY', mode: 'multiply', keyframes: [{ timeMs: 100, value: 1.1 }] },
    ] });
    unwrap(scheduleAnimation(item, { owner: token, animationId: 'Breath', native: breathing, loop: true, cross: true, parallel: true, keepFinal: false }));
    let state = advanceAnimations(stateWith(item), 50).state;
    unwrap(scheduleAnimation(state.objects[0]!, { owner: { ...token, occurrence: 2 }, animationId: 'Move01', native: definition('absolute', 900), cross: true, parallel: true }));
    state = PresentationStateSchema.parse(JSON.parse(JSON.stringify(advanceAnimations(state, 25).state)));
    const target = state.objects[0]!, currentX = target.current.x;
    expect(target.current.scaleY).toBeCloseTo(1.075);
    unwrap(stopAnimation(target, 'Breath'));
    expect(target.current.scaleY).toBe(1); expect(target.current.x).toBe(currentX);
    expect(target.processes.map(process => process.animationId)).toEqual(['Move01']);
    expect(stopAnimation(target, 'Breath').ok).toBe(false);
    expect(advanceAnimations(state, 75).state.objects[0]!.current.x).toBe(900);
  });
  it('keeps interrupted movement and does not apply writeDefault while stopping', () => {
    const item = object();
    unwrap(scheduleAnimation(item, { owner: token, animationId: 'Move01', native: definition(), loop: true, cross: true, keepFinal: true, writeDefault: true }));
    expect(scheduleAnimation(item, { owner: token, animationId: 'Move01', native: definition() }).ok).toBe(false);
    const target = advanceAnimations(stateWith(item), 40).state.objects[0]!;
    unwrap(stopAnimation(target, 'Move01'));
    expect(target.current.x).toBe(340); expect(target.defaults.x).toBe(0); expect(target.processes).toEqual([]);
  });
  it('stops the addressed camera instance through the public command', async () => {
    const service = new StageCommandService({ asset: () => { throw new Error('unused'); } });
    const started = unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'setComplexAnimation', args: {
      target: { kind: 'stage' }, animationId: 'Camera', animation: definition(), loop: true, cross: true, keepFinal: false,
    } }));
    started.state.presentation = advanceAnimations(started.state.presentation, 40).state;
    const stopped = unwrap(await service.prepare({ state: started.state, token, opcode: 'stopAnimation', args: { target: { kind: 'stage' }, animationId: 'Camera' } }));
    expect(stopped.state.presentation.camera!.current.x).toBe(0);
    expect(stopped.delta!.camera!.processes).toEqual([]);
    expect(started.state.presentation.camera!.processes).toHaveLength(1);
  });
  it('uses an explicit exit transition and releases the display object and all its animation instances', async () => {
    const service = new StageCommandService({ asset: () => { throw new Error('unused'); } });
    const item = object(); unwrap(scheduleAnimation(item, { owner: token, animationId: 'Breath', native: definition(), loop: true, cross: true, keepFinal: false }));
    const state = { ...structuredClone(FixtureRuntimeState), presentation: stateWith(item) };
    const exited = unwrap(await service.prepare({ state, token, opcode: 'changeFigure', args: { op: 'exit', objectId: item.id, transition: { exit: { preset: 'fade', durationMs: 500 } } } }));
    expect(exited.state.presentation.objects).toEqual([]); expect(exited.state.presentation.transitions[0]!.spec.durationMs).toBe(500);
    expect(exited.state.presentation.transitions[0]!.from!.processes).toEqual([]);
    expect(advanceTransitions(exited.state.presentation, 500).state.transitions).toEqual([]);
  });
  it('addresses a real background independently from the camera and preserves its identity across resource changes', async () => {
    const service = new StageCommandService({ asset: () => ({ ok: true, value: { kind: 'image', variantId: FixtureIds.variant, provider: null, providerVersion: null }, warnings: [] }) });
    const shown = unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'changeBg', args: { op: 'show', objectId: 'BgMain', assetId: FixtureIds.background } }));
    const started = unwrap(await service.prepare({ state: shown.state, token, opcode: 'setComplexAnimation', args: { animationId: 'BgMove', target: { kind: 'object', id: 'BgMain' }, animation: definition(), cross: true } }));
    started.state.presentation = advanceAnimations(started.state.presentation, 50).state;
    const replaced = unwrap(await service.prepare({ state: started.state, token, opcode: 'changeBg', args: { op: 'show', assetId: FixtureIds.background } }));
    expect(replaced.state.presentation.objects[0]!.id).toBe('BgMain'); expect(replaced.state.presentation.objects[0]!.processes[0]!.animationId).toBe('BgMove');
    const finished = advanceAnimations(replaced.state.presentation, 50).state;
    expect(finished.objects[0]!.current.x).toBe(100); expect(finished.camera).toBeUndefined();
    const next = unwrap(await service.prepare({ state: { ...replaced.state, presentation: finished }, token, opcode: 'changeBg', args: { op: 'show', objectId: 'BgNext', assetId: FixtureIds.background } }));
    expect(next.state.presentation.objects.filter(object => object.layer === 'background').map(object => object.id)).toEqual(['BgNext']);
  });
  it('uses the same optional-leaf baselines when an editor samples the whole-stage camera', () => {
    const camera: AnimationTarget = { id: StageCameraId, current: structuredClone(FixtureEffects) as StageObject['current'], defaults: structuredClone(FixtureEffects) as StageObject['current'], processes: [] };
    const animation = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 100, tracks: [{ path: '/circle/radius', keyframes: [{ timeMs: 100, value: .5 }] }] });
    expect(sampleObjectAnimation(camera, animation, 50).current.circle?.radius).toBe(1.25);
    expect(camera.current.circle).toBeUndefined();
  });
  it('samples independent sparse tracks and leaves undeclared fields alone', () => {
    const native = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 200, tracks: [
      { path: '/x', mode: 'add', keyframes: [{ timeMs: 100, value: 100 }, { timeMs: 200, value: 50 }] },
      { path: '/opacity', keyframes: [{ timeMs: 50, value: .5 }, { timeMs: 150, value: 1 }] },
    ] });
    expect(sampleAnimation(native, 100, { '/x': 300, '/opacity': 1, '/y': 42 })).toEqual({ '/x': 400, '/opacity': .75 });
    expect(sampleAnimation(definition('multiply', 2), 100, { '/x': 0 })).toEqual({ '/x': 0 });
  });
  it('freezes each real execution baseline and resumes a saved cursor without adding twice', () => {
    const item = object(); unwrap(scheduleAnimation(item, { owner: token, native: definition() }));
    let state = advanceAnimations(stateWith(item), 50).state;
    expect(state.objects[0]!.current.x).toBe(350);
    state = PresentationStateSchema.parse(JSON.parse(JSON.stringify(state)));
    state = advanceAnimations(state, 50).state;
    expect(state.objects[0]!.current.x).toBe(400);
    unwrap(scheduleAnimation(state.objects[0]!, { owner: { ...token, occurrence: 2 }, native: definition() }));
    expect(advanceAnimations(state, 100).state.objects[0]!.current.x).toBe(500);
  });
  it('takes a queued baseline at actual start and restores only owned leaves', () => {
    const item = object();
    unwrap(scheduleAnimation(item, { owner: token, native: definition() }));
    unwrap(scheduleAnimation(item, { owner: { ...token, occurrence: 2 }, native: definition() }));
    let state = advanceAnimations(stateWith(item), 100).state;
    expect(state.objects[0]!.processes[0]!.before['/x']).toBe(400);
    state = advanceAnimations(state, 100).state;
    expect(state.objects[0]!.current.x).toBe(500);
    unwrap(scheduleAnimation(state.objects[0]!, { owner: token, native: definition(), keepFinal: false }));
    state = advanceAnimations(state, 50).state;
    unwrap(scheduleAnimation(state.objects[0]!, { owner: { ...token, occurrence: 3 }, native: definition('absolute', 900), parallel: true }));
    const completed = advanceAnimations(state, 100);
    expect(completed.state.objects[0]!.current.x).toBe(900);
    expect(completed.completions.map(value => value.outcome)).toEqual(['skipped', 'completed']);
  });
  it('advances a newly started queued animation only by the unused part of the tick', () => {
    const item = object();
    unwrap(scheduleAnimation(item, { owner: token, native: definition() }));
    unwrap(scheduleAnimation(item, { owner: { ...token, occurrence: 2 }, native: definition() }));
    const advanced = advanceAnimations(stateWith(item), 150).state;
    expect(advanced.objects[0]!.current.x).toBe(450);
    expect(advanced.objects[0]!.processes[0]!.before['/x']).toBe(400);
    expect(advanced.objects[0]!.processes[0]!.elapsedMs).toBe(50);
  });
  it('rejects duplicate paths, invalid times and relative discrete tracks', () => {
    expect(NativeAnimationSchema.safeParse({ ...definition(), tracks: [...definition().tracks, ...definition().tracks] }).success).toBe(false);
    expect(NativeAnimationSchema.safeParse({ ...definition(), tracks: [{ path: '/blend', mode: 'add', keyframes: [{ timeMs: 100, value: 'screen' }] }] }).success).toBe(false);
    expect(NativeAnimationSchema.safeParse({ ...definition(), tracks: [{ path: '/x', keyframes: [{ timeMs: 101, value: 4 }] }] }).success).toBe(false);
  });
  it('resolves data parameters and rejects malformed resources without changing a live state', async () => {
    const raw = { ...definition(), parameters: { distance: 25 }, tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 100, value: { parameter: 'distance' } }] }] };
    const native = unwrap(parseAnimationResource(JSON.stringify(raw), { distance: 100 }));
    expect(Array.isArray(native)).toBe(false);
    expect(parseAnimationResource({ ...definition(), version: 2 }).ok).toBe(false);
    const state = structuredClone(FixtureRuntimeState);
    const service = new StageCommandService({ asset: () => { throw new Error('unused'); }, animation: async () => parseAnimationResource('{') });
    const failed = await service.prepare({ state, token, opcode: 'setAnimation', args: { target: { kind: 'stage' }, presetId: FixtureIds.background } });
    expect(failed.ok).toBe(false); expect(state.presentation.camera).toBeUndefined();
  });
  it('uses the same native process for a whole-stage camera and finishes only the skipped owner', async () => {
    const service = new StageCommandService({ asset: () => { throw new Error('unused'); } });
    const prepared = unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'setComplexAnimation', args: {
      target: { kind: 'stage' }, animation: definition('absolute', 100),
    } }));
    const state = advanceAnimations(prepared.state.presentation, 50).state;
    expect(state.camera!.current.x).toBe(50);
    const finished = finishAnimations(state, token);
    expect(finished.state.camera!.current.x).toBe(100);
    expect(finished.state.camera!.processes).toEqual([]); expect(finished.completions).toHaveLength(1);
  });
  it('persists a custom entrance terminal while newer animations retain their own leaves', async () => {
    const service = new StageCommandService({ asset: () => ({ ok: true, warnings: [], value: { kind: 'image', variantId: FixtureIds.variant, provider: null, providerVersion: null } }),
      animation: async () => ({ ok: true, warnings: [], value: definition('absolute', 700) }) });
    const entered = unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'changeIllustration', args: {
      objectId: FixtureIds.an, assetId: FixtureIds.background, transition: { enter: { preset: 'custom', resourceId: FixtureIds.background, durationMs: 100 } },
    } })).state.presentation;
    expect(advanceTransitions(entered, 100).state.objects[0]!.current.x).toBe(700);
    unwrap(scheduleAnimation(entered.objects[0]!, { owner: { ...token, occurrence: 2 }, native: definition('absolute', 900), parallel: true }));
    const advanced = advanceAnimations(entered, 50).state;
    expect(advanceTransitions(advanced, 100).state.objects[0]!.current.x).toBe(450);
  });
});
