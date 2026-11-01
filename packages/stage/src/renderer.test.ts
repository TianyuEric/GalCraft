import { describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { NativeAnimationSchema, PresentationStateSchema } from '@galcraft/contracts';
import type { PresentationState, Result, StageObject, TransitionProcess } from '@galcraft/contracts';
import { FixtureEffects, FixtureIds, FixtureRuntimeState } from '@galcraft/contracts/fixtures';
import { scheduleAnimation, StageCameraId } from './animation.js';
import { StageCommandService } from './commands.js';
import { StageController, type VisualResource } from './renderer.js';

const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };
const token = { sessionId: FixtureIds.session, occurrence: 1, statementId: FixtureIds.statements[0]! };
const fade = { preset: 'fade' as const, durationMs: 100, resourceId: null,
  easing: { family: 'linear' as const, direction: 'in' as const }, direction: 'left' as const };
const object = (id: string, z: number, entranceOrder: number): StageObject => ({
  id, assetId: id, variantId: FixtureIds.variant, characterId: null, layer: 'figure', entranceOrder, station: 'center', backgroundFrame: null,
  current: { ...structuredClone(FixtureEffects), z } as StageObject['current'],
  defaults: { ...structuredClone(FixtureEffects), station: 'center' } as StageObject['defaults'],
  framing: { mode: 'full', scale: 1, offsetX: 0, offsetY: 0, crop: null }, transition: { enter: fade, exit: fade },
  processes: [], providerState: null, imageFace: null,
});
const transition = (from: StageObject, to: StageObject | null): TransitionProcess => ({
  id: crypto.randomUUID(), objectId: from.id, owner: token, kind: to ? 'replace' : 'exit', spec: fade, elapsedMs: 0, seed: 1, from, to,
});
function setup(objects: StageObject[], transitions: TransitionProcess[] = []) {
  const app = { stage: new Container(), render: vi.fn(), renderer: { render: vi.fn() }, destroy: vi.fn() };
  const stage = Reflect.construct(StageController, [app, { width: 320, height: 180 }, {}, []]) as StageController;
  const state = structuredClone(FixtureRuntimeState.presentation); state.objects = objects; state.transitions = transitions; state.effects = [];
  const texture = new Texture({ source: new TextureSource({ width: 32, height: 64 }) });
  const resource: VisualResource = { asset: { assetId: FixtureIds.background, variantId: FixtureIds.variant,
    kind: 'image', entry: 'figure.png', files: [], metadata: { width: 32, height: 64 }, canvas: null, provider: null },
    url: '', anchor: { x: .5, y: 1 } };
  const handle = (value: StageObject) => ({ object: value, sprite: new Sprite(texture), texture, instance: null, video: null,
    animated: null, filterKey: '', ownedTexture: false, resource, faceResources: new Map(), mask: null, cropKey: '', croppedTexture: null });
  const handles = new Map(objects.map(value => [value.id, handle(value)]));
  const transitionHandles = new Map(transitions.filter(value => value.from).map(value => [value.id, handle(value.from!)]));
  Object.assign(stage, { state, handles, transitionHandles });
  const redraw = () => Reflect.get(stage, 'redraw').call(stage);
  const dispose = () => { stage.dispose(); texture.destroy(true); };
  return { stage, state, handles, transitionHandles, layer: Reflect.get(stage, 'layers').figure as Container, redraw, dispose };
}

describe('stage visible surface ordering', () => {
  it('releases a fully replaced loop while reduced motion preserves its replacement', () => {
    const item = object(FixtureIds.an, 0, 0), native = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 100,
      tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 100, value: 100 }] }] });
    const old = unwrap(scheduleAnimation(item, { owner: token, animationId: 'OldLop', native, loop: true }));
    const replacement = unwrap(scheduleAnimation(item, { owner: { ...token, occurrence: 2 }, animationId: 'NewLop', native, loop: true, parallel: true }));
    const current = setup([item]), completed = vi.fn();
    current.stage.onCompletion(completed); current.stage.setVisualPreferences(true, true); current.stage.tick(10);
    expect(unwrap(current.stage.capture()).objects[0]!.processes).toMatchObject([{ id: replacement.id, elapsedMs: 0 }]);
    expect(completed.mock.calls).toEqual([[{ token, processId: old.id, outcome: 'skipped' }]]);
    current.dispose();
  });
  it.each([
    { label: 'reduced motion', effects: true, reduced: true },
    { label: 'disabled visual effects', effects: false, reduced: false },
  ])('retains stoppable saved loops and completes finite waits with $label', async ({ effects, reduced }) => {
    const item = object(FixtureIds.an, 0, 0), native = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 100,
      tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 100, value: 100 }] }] });
    const camera = { id: StageCameraId, current: structuredClone(item.current), defaults: structuredClone(item.current), processes: [] };
    const loop = unwrap(scheduleAnimation(item, { owner: token, animationId: 'Breath', native, loop: true, cross: true, keepFinal: false }));
    unwrap(scheduleAnimation(camera, { owner: token, animationId: 'Camera', native, loop: true, cross: true, keepFinal: false }));
    const finiteOwner = { ...token, occurrence: 2 };
    const finite = unwrap(scheduleAnimation(item, { owner: finiteOwner, animationId: 'Fade01', parallel: true,
      native: NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 100,
        tracks: [{ path: '/opacity', keyframes: [{ timeMs: 100, value: .5 }] }] }) }));
    const current = setup([item]), completed = vi.fn();
    current.state.camera = { current: camera.current, defaults: camera.defaults, processes: camera.processes };
    current.state.logicalTimeMs = 1000;
    current.state.text.textboxTransition = { from: 1, to: 0, durationMs: 1000, elapsedMs: 0 };
    current.state.film = { enabled: true, top: 0, bottom: 0,
      transition: { fromTop: 0, toTop: .2, fromBottom: 0, toBottom: .1, enabled: true, durationMs: 1000, elapsedMs: 0 } };
    current.stage.onCompletion(completed); current.stage.tick(40);
    current.stage.setVisualPreferences(effects, reduced); current.stage.tick(10); current.stage.tick(20);
    const saved = PresentationStateSchema.parse(JSON.parse(JSON.stringify(unwrap(current.stage.capture()))));
    expect(saved.logicalTimeMs).toBe(1070);
    expect(saved.objects[0]!.current).toMatchObject({ x: 40, opacity: .5 });
    expect(saved.objects[0]!.processes).toMatchObject([{ id: loop.id, animationId: 'Breath', elapsedMs: 40, before: { '/x': 0 } }]);
    expect(saved.camera!.processes).toMatchObject([{ animationId: 'Camera', elapsedMs: 40 }]);
    expect(saved.text.textboxVisible).toBe(false); expect(saved.text.textboxTransition).toBeUndefined();
    expect(saved.film).toEqual({ enabled: true, top: .2, bottom: .1 });
    expect(completed.mock.calls).toEqual([[{ token: finiteOwner, processId: finite.id, outcome: 'completed' }]]);
    current.stage.setVisualPreferences(true, false); current.stage.tick(10);
    expect(unwrap(current.stage.capture()).objects[0]!.current.x).toBe(50);
    const service = new StageCommandService({ asset: () => { throw new Error('unused'); } });
    const stopped = unwrap(await service.prepare({ state: { ...structuredClone(FixtureRuntimeState), presentation: saved }, token,
      opcode: 'stopAnimation', args: { target: { kind: 'object', id: item.id }, animationId: 'Breath' } })).state;
    expect(stopped.presentation.objects[0]!.current.x).toBe(0); expect(stopped.presentation.objects[0]!.processes).toEqual([]);
    expect(stopped.presentation.camera!.processes).toHaveLength(1);
    const cameraStopped = unwrap(await service.prepare({ state: stopped, token, opcode: 'stopAnimation',
      args: { target: { kind: 'stage' }, animationId: 'Camera' } })).state;
    expect(cameraStopped.presentation.camera!.current.x).toBe(0); expect(cameraStopped.presentation.camera!.processes).toEqual([]);
    current.dispose();
  });
  it.each(['z', 'entranceOrder'] as const)('keeps an exiting foreground surface above live objects by %s until completion', order => {
    const back = object('back', 0, 0), front = object('front', order === 'z' ? 1 : 0, 1);
    const exit = transition(front, null), current = setup([back], [exit]);
    const leaving = current.transitionHandles.get(exit.id)!.sprite;
    current.redraw(); current.stage.tick(50);
    expect(current.layer.children.at(-1)).toBe(leaving); expect(leaving.alpha).toBe(.5);
    current.stage.tick(50);
    expect(leaving.destroyed).toBe(true); expect(current.layer.children).toEqual([current.handles.get(back.id)!.sprite]);
    current.dispose();
  });
  it('places replacement fade surfaces between lower and higher objects on every frame', () => {
    const back = object('back', 0, 0), front = object('front', 2, 2), from = object('middle', 1, 1), to = { ...from, assetId: 'replacement' };
    const replace = transition(from, to), current = setup([front, to, back], [replace]);
    current.redraw(); current.stage.tick(50);
    const mix = Reflect.get(current.stage, 'crossfades').get(replace.id).sprite as Sprite;
    const backSprite = current.handles.get(back.id)!.sprite, frontSprite = current.handles.get(front.id)!.sprite;
    expect(current.layer.getChildIndex(mix)).toBeGreaterThan(current.layer.getChildIndex(backSprite));
    expect(current.layer.getChildIndex(mix)).toBeLessThan(current.layer.getChildIndex(frontSprite));
    current.stage.tick(50);
    expect(mix.destroyed).toBe(true); expect(current.layer.children).toEqual([backSprite, current.handles.get(to.id)!.sprite, frontSprite]);
    current.dispose();
  });
  it('switches both weather layers while retaining instances and their paused clock', () => {
    const current = setup([]), weather = Reflect.get(current.stage, 'weather');
    current.state.effects = ['front', 'back'].map((layer, index) => ({ id: `weather${index}`, type: 'snow', target: 'stage',
      enabled: true, resourceId: null, parameters: { density: 1 }, seed: index, elapsedMs: 0, layer })) as PresentationState['effects'];
    weather.sync(current.state.effects); const front = weather.container.children[0], back = weather.backContainer.children[0];
    current.stage.setVisualPreferences(false, false);
    expect(weather.container.visible).toBe(false); expect(weather.backContainer.visible).toBe(false);
    current.stage.pause(true); current.stage.tick(50);
    expect(weather.capture().map((effect: { elapsedMs: number }) => effect.elapsedMs)).toEqual([0, 0]);
    current.stage.setVisualPreferences(true, false); current.stage.pause(false); current.stage.tick(50);
    expect(weather.container.visible).toBe(true); expect(weather.backContainer.visible).toBe(true);
    expect(weather.container.children[0]).toBe(front); expect(weather.backContainer.children[0]).toBe(back);
    expect(weather.capture().map((effect: { elapsedMs: number }) => effect.elapsedMs)).toEqual([50, 50]);
    current.dispose();
  });
});
