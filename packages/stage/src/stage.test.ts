import { describe, expect, it, vi } from 'vitest';
import { FixtureEffects, FixtureIds, FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import type { AudioState, LongTerm, Result, Segment, StageObject, TransitionProcess } from '@galcraft/contracts';
import { SessionController, type RuntimePorts } from '@galcraft/runtime';
import { advanceAnimations, finishAnimations, scheduleAnimation } from './animation.js';
import { AudioMixer } from './audio.js';
import { StageCommandService } from './commands.js';
import { backgroundGeometry, canvasPlacement, pointerInDesign, stationX } from './geometry.js';
import { advanceImageFace, configureImageFace, imageFaceAsset } from './face.js';
import { advanceIntro } from './intro.js';
import { StageController } from './renderer.js';
import { VideoController } from './video.js';
import { advanceTransitions } from './transition.js';
import { Graphics } from 'pixi.js';

const id = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };
const token = { sessionId: FixtureIds.session, occurrence: 1, statementId: FixtureIds.statements[0]! };
const linear = { family: 'linear' as const, direction: 'in' as const };
function object(): StageObject {
  return { id: id(0x1001), characterId: FixtureIds.an, assetId: FixtureIds.background, variantId: FixtureIds.variant,
    layer: 'figure', entranceOrder: 0, backgroundFrame: null, station: 'center',
    current: structuredClone(FixtureEffects) as StageObject['current'],
    defaults: { ...structuredClone(FixtureEffects), station: 'center' } as StageObject['defaults'],
    framing: { mode: 'full', scale: 1, offsetX: 0, offsetY: 0, crop: null },
    transition: { enter: { preset: 'cut', resourceId: null, durationMs: 0, easing: linear, direction: 'left' },
      exit: { preset: 'cut', resourceId: null, durationMs: 0, easing: linear, direction: 'left' } },
    processes: [], providerState: null, imageFace: null };
}
const segment = (effects: Segment['effects'], durationMs: number): Segment => ({ effects, durationMs, easing: linear });

describe('M06 geometry and animation', () => {
  it('finishes looping and queued visual animations once while preserving final defaults',()=>{
    const state=structuredClone(FixtureRuntimeState.presentation),item=object();state.objects=[item];
    unwrap(scheduleAnimation(item,{owner:token,segments:[segment({x:100},100),segment({opacity:.2},100)],loop:true}));
    unwrap(scheduleAnimation(item,{owner:token,segments:[segment({opacity:.8},100)],writeDefault:true}));
    const finished=finishAnimations(state);expect(finished.state.objects[0]!.current.x).toBe(100);expect(finished.state.objects[0]!.processes).toEqual([]);expect(finished.completions).toHaveLength(2);expect(finished.state.objects[0]!.current.opacity).toBe(.8);expect(finished.state.objects[0]!.defaults.opacity).toBe(.8);expect(state.objects[0]!.processes).toHaveLength(2);
  });
  it('keeps each image face clock and voice target separate with explicit combinations', () => {
    const combinations = { closedOpen: id(201), halfOpen: id(202), openOpen: id(203),
      closedClosed: id(204), halfClosed: id(205), openClosed: id(206) };
    const configured = unwrap(configureImageFace({ imageMouth: { enabled: true, closed: id(1), half: id(2), open: id(3) },
      imageBlink: { enabled: true, open: id(4), closed: id(5), intervalMs: 100, randomMs: 0, closeMs: 20, holdMs: 40, openMs: 20 },
      imageFaceCombinations: combinations }))!;
    const a = advanceImageFace(configured, 110, .4, true);
    const b = advanceImageFace(configured, 50, .4, false);
    expect(a).toMatchObject({ mouthShape: 'open', eyeClosed: true, elapsedMs: 110 });
    expect(unwrap(imageFaceAsset(a))).toBe(combinations.openClosed);
    expect(b).toMatchObject({ mouthShape: 'closed', eyeClosed: false, elapsedMs: 50 });
    expect(unwrap(imageFaceAsset(b))).toBe(combinations.closedOpen);
    const silent = advanceImageFace(a, 0, 0, false);
    expect(silent.mouthShape).toBe('closed');
    const missing = configureImageFace({ imageMouth: { enabled: true, closed: id(1), open: id(3) },
      imageBlink: { enabled: true, open: id(4), closed: id(5) }, imageFaceCombinations: { closedOpen: id(201) } });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('IMAGE_FACE_COMBINATION_MISSING');
  });
  it('projects image face DSL configuration and rejects a missing declared image', async () => {
    const service = new StageCommandService({ asset: assetId => assetId === id(299) ?
      { ok: false, error: { code: 'ASSET_MISSING', message: 'missing', severity: 'error', owner: 'M04', related: [], actions: [] }, issues: [] } :
      { ok: true, value: { variantId: FixtureIds.variant, kind: 'image', provider: null, providerVersion: null }, warnings: [] } });
    const input = { state: FixtureRuntimeState, token, opcode: 'changeFigure', args: {
      op: 'show', objectId: id(300), characterId: FixtureIds.an, assetId: FixtureIds.background,
      model: { imageMouth: { enabled: true, closed: id(301), half: null, open: id(302) } },
    } };
    const shown = unwrap(await service.prepare(input));
    expect(shown.state.presentation.objects[0]?.imageFace).toMatchObject({ mouth: { closed: id(301), half: null, open: id(302) },
      mouthShape: 'closed', eyeClosed: false, elapsedMs: 0 });
    const missing = await service.prepare({ ...input, args: { ...input.args,
      model: { imageMouth: { enabled: true, closed: id(299), half: null, open: id(302) } } } });
    expect(missing.ok).toBe(false); if (!missing.ok) expect(missing.error.code).toBe('ASSET_MISSING');
  });
  it('reuses a captured model instance when its state is synchronized before the next prepare', async () => {
    const modelObject = object(); modelObject.providerState = { provider: 'galcraft.live2d', version: '0.1.0', state: { motionElapsedMs: 0 } };
    const state = structuredClone(FixtureRuntimeState.presentation); state.objects = [modelObject];
    const handle = { object: structuredClone(modelObject), instance: { capture: () => ({ ok: true as const,
      value: { motionElapsedMs: 120 }, warnings: [] }) } };
    const create = vi.fn();
    const stage = Object.create(StageController.prototype) as StageController;
    Object.assign(stage, { state, handles: new Map([[modelObject.id, handle]]), transitionHandles: new Map(),
      prepared: new Map(), weather: { capture: () => [] }, createHandle: create });
    const captured = unwrap(stage.capture());
    expect(captured.objects[0]?.providerState?.state).toEqual({ motionElapsedMs: 120 });
    const prepared = await stage.prepareStage(FixtureIds.session, captured);
    expect(prepared.ok).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
  it('prepares provider commands on a fresh instance and preserves the active instance on failure', async () => {
    const stageObject = object(); stageObject.providerState = {provider:'example.resource/effect',version:'0.1.0',state:{count:7}};
    const state = structuredClone(FixtureRuntimeState.presentation); state.objects = [stageObject];
    const oldDispose = vi.fn(), oldInstance = {capture:()=>({ok:true as const,value:{count:9},warnings:[]}),dispose:oldDispose};
    const resource = {asset:{provider:'example.resource/effect'},providerVersion:'0.1.0'};
    const old = {object:structuredClone(stageObject),instance:oldInstance,resource,sprite:{mask:null},mask:null};
    const stage = Object.create(StageController.prototype) as StageController;
    const create = vi.fn(async (initial: StageObject) => {
      let business=structuredClone(initial.providerState!.state) as {count:number};
      const instance={set:vi.fn((command:any)=>command.reject?{ok:false as const,error:{code:'SET_REJECTED',severity:'error' as const,owner:'M06' as const,message:'Rejected',related:[],actions:[]},issues:[]}:(business={count:command.count},{ok:true as const,value:undefined,warnings:[]})),capture:()=>({ok:true as const,value:business,warnings:[]}),pause:vi.fn(),dispose:vi.fn()};
      return {ok:true as const,value:{object:structuredClone(initial),instance,resource,sprite:{mask:null},mask:null},warnings:[]};
    });
    Object.assign(stage,{sessionId:FixtureIds.session,state,handles:new Map([[stageObject.id,old]]),transitionHandles:new Map(),prepared:new Map(),retired:new Map(),weather:{capture:()=>[],sync(){},container:{}},
      layers:Object.fromEntries(['background','figure','effect','overlay'].map(key=>[key,{removeChildren(){},addChild(){}}])),createHandle:create,redraw(){},release:(handle:any)=>handle.instance.dispose()});
    const prepared=unwrap(await stage.prepareStage(FixtureIds.session,state,null,null,[{objectId:stageObject.id,command:{count:10}}]));
    expect(create.mock.calls[0]?.[0].providerState?.state).toEqual({count:9});
    expect(prepared.state.objects[0]?.providerState?.state).toEqual({count:10});
    expect(stage.capture().ok).toBe(true);expect(oldDispose).not.toHaveBeenCalled();
    unwrap(stage.commitStage(prepared.id,token));expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(unwrap(stage.capture()).objects[0]?.providerState?.state).toEqual({count:10});
    const rejected=await stage.prepareStage(FixtureIds.session,unwrap(stage.capture()),null,null,[{objectId:stageObject.id,command:{reject:true}}]);
    expect(rejected.ok).toBe(false);expect(unwrap(stage.capture()).objects[0]?.providerState?.state).toEqual({count:10});
    const last=await create.mock.results.at(-1)!.value;expect(last.value.instance.dispose).toHaveBeenCalledTimes(1);
  });
  it('sends voice RMS only to the targeted active Live2D instance', () => {
    const first = object(), second = { ...object(), id: id(0x1002) };
    const state = structuredClone(FixtureRuntimeState.presentation); state.objects = [first, second];
    state.voice = { assetId: FixtureIds.voices[0]!, variantId: FixtureIds.variant, volume: 1,
      targetObjectId: first.id, statementId: token.statementId };
    const activeUpdate = vi.fn(), otherUpdate = vi.fn(), leavingUpdate = vi.fn();
    const handle = (update: typeof activeUpdate) => ({ instance: { update }, texture: { source: { update() {} } } });
    const stage = Object.create(StageController.prototype) as StageController;
    Object.assign(stage, { state, paused: false, listener: null,
      handles: new Map([[first.id, handle(activeUpdate)], [second.id, handle(otherUpdate)]]),
      transitionHandles: new Map([[id(0x1003), handle(leavingUpdate)]]),
      weather: { tick() {}, sync() {}, capture: () => [] }, redraw() {} });
    const pcm = { sourceId: id(0x1004), samples: new Float32Array([.2, .4]), sampleRate: 48000 as const };
    stage.tick(16, .4, pcm);
    expect(activeUpdate).toHaveBeenCalledWith(16, .4, pcm);
    expect(otherUpdate).toHaveBeenCalledWith(16, 0, null);
    expect(leavingUpdate).toHaveBeenCalledWith(16, 0, null);
  });
  it('advances automatic intro paragraphs and completes a manual intro once', () => {
    const base = { paragraphs: ['甲乙', '结束'], index: 0, shown: 0, held: false, backgroundColor: '#000000',
      backgroundImage: null, textColor: '#ffffff', fontSize: null, animation: 'typewriter' as const,
      durationMs: 100, elapsedMs: 0, holdMs: 50, holdRemainingMs: 50, manual: false, keepFinal: false };
    const midway = advanceIntro(base, 50);
    expect(midway.state).toMatchObject({ index: 0, shown: 1, held: false });
    const next = advanceIntro(midway.state!, 100);
    expect(next.state).toMatchObject({ index: 1, shown: 0 });
    expect(advanceIntro(next.state!, 150)).toMatchObject({ state: null, completed: true });
    const manual = { ...base, manual: true };
    const revealed = advanceIntro(manual, 100);
    expect(revealed.state).toMatchObject({ index: 0, held: true, shown: 2 });
    const second = advanceIntro(revealed.state!, 0, true);
    expect(second.state).toMatchObject({ index: 1, held: false });
    const final = advanceIntro(advanceIntro(second.state!, 0, true).state!, 0, true);
    expect(final).toMatchObject({ state: null, completed: true });
  });
  it('releases a real M05 intro wait through StageController completion', async () => {
    const snapshot = structuredClone(FixtureSnapshot), statementId = id(0xb10);
    snapshot.scenes[0]!.instructions.unshift({ statementId, opcode: 'intro', specVersion: '0.1.0',
      condition: null, continuation: 'wait', skippable: true,
      args: { op: 'show', paragraphs: ['序章'], durationMs: 0, holdMs: 0, manual: true },
      source: { documentId: FixtureIds.streetDocument, statementId, revision: 1 } });
    let longTerm: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [],
      flowEntries: {}, variables: {}, plugins: {} };
    const service = new StageCommandService({ asset: () => { throw new Error('unused asset lookup'); } });
    const ports: RuntimePorts = { contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [] },
      stage: service, longTerm: { current: () => structuredClone(longTerm), prepareFlowUnlocks: input => ({ ok: true,
        value: { sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId, sequence: input.sequence,
          expectedLongTermRevision: input.longTermAfter.revision, entries: [] }, warnings: [] }),
        commitRuntimeLongTerm: async input => { longTerm = structuredClone({ ...input.next, revision: input.next.revision + 1 });
          return { ok: true, value: { revision: longTerm.revision }, warnings: [] }; } } };
    const runtime = new SessionController(ports);
    const scenario = { schemaVersion: 1 as const, id: id(0xb11), name: '开场等待', projectId: snapshot.projectId,
      entry: { sceneId: snapshot.scenes[0]!.scene.id, statementId }, target: { sceneId: snapshot.scenes[0]!.scene.id, statementId },
      initialProgress: {}, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate' as const,
      engineVersion: snapshot.engineVersion, pluginVersions: [] };
    const prepared = unwrap(await runtime.prepareSession({ snapshot, domain: { projectId: snapshot.projectId,
      kind: 'playtest', instance: 'intro-wait-test' }, source: { kind: 'entry', scenario }, target: null }));
    unwrap(runtime.activate(prepared.id));
    const waiting = unwrap(await runtime.start());
    expect(waiting.state.wait).toEqual({ kind: 'animation', processIds: [] });
    const completions: { token: typeof token; outcome: string }[] = [];
    const stage = Object.create(StageController.prototype) as StageController;
    Object.assign(stage, { state: structuredClone(waiting.state.presentation), introToken: waiting.token,
      introCompleted: false, listener: (completion: { token: typeof token; outcome: string }) => completions.push(completion), redraw() {} });
    expect(stage.advanceIntro()).toBe(true);
    expect(completions).toHaveLength(0);
    expect(stage.advanceIntro()).toBe(true);
    expect(completions).toMatchObject([{ token: waiting.token, outcome: 'completed' }]);
    expect(stage.advanceIntro()).toBe(false);
    const continued = unwrap(await runtime.dispatch({ kind: 'animation', token: completions[0]!.token }));
    expect(continued.state.wait?.kind).toBe('say');
  });
  it('keeps a restored final intro frame inert until an intro wait token is bound', () => {
    const state = structuredClone(FixtureRuntimeState.presentation);
    state.intro = { paragraphs: ['终章'], index: 0, shown: 2, held: true, backgroundColor: '#000000',
      backgroundImage: null, textColor: '#ffffff', fontSize: null, animation: 'fade', durationMs: 100,
      elapsedMs: 100, holdMs: 0, holdRemainingMs: 0, manual: true, keepFinal: true };
    const key = { requestId: id(0xb12), sessionId: FixtureIds.session, snapshotId: FixtureIds.snapshot };
    const preparedId = id(0xb13), completions: string[] = [];
    const layer = () => ({ removeChildren() {}, addChild() {} });
    const stage = Object.create(StageController.prototype) as StageController;
    Object.assign(stage, { prepared: new Map([[preparedId, { descriptor: { id: preparedId, sessionId: key.sessionId,
      restoreKey: key, state, voiceBinding: null, resources: [] }, handles: new Map(), transitionHandles: new Map() }]]),
      retired: new Map(), handles: new Map(), transitionHandles: new Map(),
      layers: { background: layer(), figure: layer(), effect: layer(), overlay: layer() },
      weather: { container: {}, sync() {} }, clearMask() {}, redraw() {},
      listener: (completion: { token: typeof token }) => completions.push(completion.token.statementId) });
    expect(stage.commitStage(preparedId, key).ok).toBe(true);
    expect(stage.advanceIntro()).toBe(false);
    expect(completions).toEqual([]);
    stage.bindIntroToken(token);
    expect(stage.advanceIntro()).toBe(true);
    expect(completions).toEqual([token.statementId]);
  });
  it('keeps the former stage instance until restore publication releases it', () => {
    const previousDispose = vi.fn(), nextDispose = vi.fn();
    const oldHandle = { instance: { dispose: previousDispose, pause() {} } },
      nextHandle = { instance: { dispose: nextDispose, pause() {} } };
    const preparedId = id(0xe01), requestId = id(0xe02);
    const key = { requestId, sessionId: FixtureIds.session, snapshotId: FixtureIds.snapshot };
    const state = structuredClone(FixtureRuntimeState.presentation);
    const stage = Object.create(StageController.prototype) as StageController;
    const layer = () => ({ removeChildren() {}, addChild() {} });
    Object.assign(stage, {
      prepared: new Map([[preparedId, { descriptor: { id: preparedId, sessionId: key.sessionId,
        restoreKey: key, state, voiceBinding: null, resources: [] },
        handles: new Map([[id(0xe03), nextHandle]]), transitionHandles: new Map() }]]),
      retired: new Map(), handles: new Map([[id(0xe03), oldHandle]]), transitionHandles: new Map(),
      layers: { background: layer(), figure: layer(), effect: layer(), overlay: layer() },
      weather: { container: {}, sync() {} }, clearMask() {}, redraw() {},
      release(handle: typeof oldHandle) { handle.instance.dispose(); },
    });
    expect(stage.commitStage(preparedId, key).ok).toBe(true);
    expect(previousDispose).not.toHaveBeenCalled();
    expect(nextDispose).not.toHaveBeenCalled();
    stage.disposeRetiredStage(requestId);
    expect(previousDispose).toHaveBeenCalledOnce();
    expect(nextDispose).not.toHaveBeenCalled();
    stage.disposeRetiredStage(requestId);
    expect(previousDispose).toHaveBeenCalledOnce();
  });
  it('keeps source aspect and source crop under canvas fitting', () => {
    const centered = backgroundGeometry({ width: 1920, height: 1080 }, { width: 1440, height: 1080 },
      { fit: 'cover', positionX: 0.5, positionY: 0.5 });
    expect(centered.scale).toBe(1); expect(centered.draw.x).toBe(-240); expect(centered.visibleSource).toEqual({ x: 240, y: 0, width: 1440, height: 1080 });
    const left = backgroundGeometry({ width: 1920, height: 1080 }, { width: 1440, height: 1080 }, { fit: 'cover', positionX: 0, positionY: 0.5 });
    expect(left.visibleSource.x).toBe(0);
    const contain = backgroundGeometry({ width: 800, height: 600 }, { width: 1600, height: 900 }, { fit: 'contain', positionX: 0.5, positionY: 0.5 });
    expect(contain.draw.width / contain.draw.height).toBeCloseTo(4 / 3);
    const native = backgroundGeometry({ width: 800, height: 600 }, { width: 1600, height: 900 }, { fit: 'native', positionX: 0.5, positionY: 0.5 });
    expect(native.scale).toBe(1);
    const placement = canvasPlacement({ width: 1440, height: 1080 }, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(placement).toMatchObject({ x: 240, width: 1440 });
    expect(pointerInDesign({ x: 960, y: 540 }, placement)).toEqual({ x: 720, y: 540 });
    expect(['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'].map(value => stationX(value as StageObject['station'], 600)))
      .toEqual([100, 150, 200, 300, 400, 450, 500]);
  });
  it('only relinquishes the leaf owned by a new parallel animation', () => {
    const stage = structuredClone(FixtureRuntimeState.presentation), target = object(); stage.objects.push(target);
    const old = unwrap(scheduleAnimation(target, { owner: token,
      segments: [segment({ x: 100, opacity: 0 }, 2000)], keepFinal: false }));
    let advanced = advanceAnimations(stage, 1000); expect(advanced.state.objects[0]!.current.x).toBe(50);
    const newer = unwrap(scheduleAnimation(advanced.state.objects[0]!, { owner: { ...token, occurrence: 2 },
      segments: [segment({ x: 200 }, 1000)], parallel: true }));
    expect(advanced.state.objects[0]!.processes.find(value => value.id === old.id)?.fields).toEqual(['/opacity']);
    advanced = advanceAnimations(advanced.state, 1000);
    expect(advanced.state.objects[0]!.current.x).toBe(200);
    expect(advanced.state.objects[0]!.current.opacity).toBe(1);
    expect(advanced.completions.map(value => value.processId)).toContain(newer.id);
  });
  it('reports a fully replaced process once so its wait can be released', () => {
    const state = structuredClone(FixtureRuntimeState.presentation), target = object(); state.objects.push(target);
    const old = unwrap(scheduleAnimation(target, { owner: token, segments: [segment({ x: 100 }, 2000)] }));
    const halfway = advanceAnimations(state, 500).state;
    unwrap(scheduleAnimation(halfway.objects[0]!, { owner: { ...token, occurrence: 2 }, parallel: true,
      segments: [segment({ x: 200 }, 1000)] }));
    const displaced = advanceAnimations(halfway, 0);
    expect(displaced.completions).toEqual([{ token, processId: old.id, outcome: 'skipped' }]);
    expect(advanceAnimations(displaced.state, 0).completions).toEqual([]);
  });
  it.each([2000, 0])('delivers a %ims process completion through the real M05 animation wait', async durationMs => {
    const snapshot = structuredClone(FixtureSnapshot);
    const statementId = id(0xa10);
    snapshot.scenes[0]!.instructions.unshift({ statementId, opcode: 'setTransform', specVersion: '0.1.0',
      condition: null, continuation: 'wait', skippable: true,
      args: { target: { kind: 'object', id: id(0x1001) }, effects: { x: 100 }, durationMs },
      source: { documentId: FixtureIds.streetDocument, statementId, revision: 1 } });
    let longTerm: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [],
      flowEntries: {}, variables: {}, plugins: {} };
    const service = new StageCommandService({ asset: () => { throw new Error('unused asset lookup'); } });
    const ports: RuntimePorts = { contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [] },
      stage: { prepare: input => {
        const state = structuredClone(input.state); state.presentation.objects.push(object());
        return service.prepare({ ...input, state });
      } },
      longTerm: { current: () => structuredClone(longTerm), prepareFlowUnlocks: input => ({ ok: true,
        value: { sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId, sequence: input.sequence,
          expectedLongTermRevision: input.longTermAfter.revision, entries: [] }, warnings: [] }),
        commitRuntimeLongTerm: async input => { longTerm = structuredClone({ ...input.next, revision: input.next.revision + 1 });
          return { ok: true, value: { revision: longTerm.revision }, warnings: [] }; } } };
    const controller = new SessionController(ports);
    const scenario = { schemaVersion: 1 as const, id: id(0xa11), name: '动画等待', projectId: snapshot.projectId,
      entry: { sceneId: snapshot.scenes[0]!.scene.id, statementId }, target: { sceneId: snapshot.scenes[0]!.scene.id, statementId },
      initialProgress: {}, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate' as const,
      engineVersion: snapshot.engineVersion, pluginVersions: [] };
    const prepared = unwrap(await controller.prepareSession({ snapshot, domain: { projectId: snapshot.projectId,
      kind: 'playtest', instance: 'stage-wait-test' }, source: { kind: 'entry', scenario }, target: null }));
    unwrap(controller.activate(prepared.id));
    const waiting = unwrap(await controller.start());
    expect(waiting.state.wait?.kind).toBe('animation');
    const stage = structuredClone(waiting.state.presentation), old = stage.objects[0]!.processes[0]!;
    if (durationMs) unwrap(scheduleAnimation(stage.objects[0]!, { owner: { ...waiting.token!, occurrence: waiting.token!.occurrence + 1 },
      parallel: true, segments: [segment({ x: 200 }, 1000)] }));
    const completions = advanceAnimations(stage, 0).completions;
    expect(completions).toEqual([{ token: waiting.token, processId: old.id, outcome: durationMs ? 'skipped' : 'completed' }]);
    const continued = unwrap(await controller.dispatch({ kind: 'animation', token: completions[0]!.token }));
    expect(continued.state.wait?.kind).toBe('say');
  });
  it('restores boolean, enum and numeric leaves after save and keeps a newly owned leaf', () => {
    const state = structuredClone(FixtureRuntimeState.presentation), target = object();
    target.current.bloom.intensity = 0.2; state.objects.push(target);
    unwrap(scheduleAnimation(target, { owner: token, keepFinal: false, segments: [segment({
      bloom: { intensity: 0.8 }, filters: { oldFilm: true }, blend: 'add', station: 'left', rgb: [255, 0, 0],
    }, 2000)] }));
    const saved = advanceAnimations(state, 800).state;
    expect(saved.objects[0]!.current.filters.oldFilm).toBe(true); expect(saved.objects[0]!.station).toBe('left');
    unwrap(scheduleAnimation(saved.objects[0]!, { owner: { ...token, occurrence: 2 }, parallel: true,
      segments: [segment({ bloom: { intensity: 0.5 } }, 1200)] }));
    const restored = advanceAnimations(structuredClone(saved), 1200);
    expect(restored.state.objects[0]!.current.bloom.intensity).toBe(0.5);
    expect(restored.state.objects[0]!.current.filters.oldFilm).toBe(false);
    expect(restored.state.objects[0]!.current.blend).toBe('normal');
    expect(restored.state.objects[0]!.station).toBe('center');
    expect(restored.state.objects[0]!.current.rgb).toEqual([255, 255, 255]);
  });
  it('maps accepted commands into the same runtime presentation', async () => {
    const service = new StageCommandService({ asset: assetId => assetId === FixtureIds.background || assetId === FixtureIds.voices[0] ?
      { ok: true, value: { variantId: FixtureIds.variant, kind: assetId === FixtureIds.background ? 'image' : 'audio', provider: null, providerVersion: null }, warnings: [] } :
      { ok: false, error: { code: 'MISSING', severity: 'error', message: '', owner: 'M04', related: [], actions: [] }, issues: [] } });
    const changed = unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'changeBg',
      args: { assetId: FixtureIds.background, fit: 'cover', positionX: 0.5, positionY: 0.5 } }));
    expect(changed.state.presentation.objects[0]?.variantId).toBe(FixtureIds.variant);
    expect(changed.delta?.objects[0]?.op).toBe('show');
    const missing = await service.prepare({ state: changed.state, token, opcode: 'changeFigure', args: { objectId: id(2), assetId: id(3) } });
    expect(missing.ok).toBe(false); expect(changed.state.presentation.objects).toHaveLength(1);
    const music = unwrap(await service.prepare({ state: changed.state, token, opcode: 'bgm', args: { assetId: FixtureIds.voices[0]!, startSec: 30 } }));
    expect(music.state.presentation.bgm.startSec).toBe(30);
  });
  it('keeps both transition snapshots until elapsed time completes', async () => {
    const service = new StageCommandService({ asset: () => ({ ok: true,
      value: { variantId: FixtureIds.variant, kind: 'image', provider: null, providerVersion: null }, warnings: [] }) });
    const fade = { preset: 'fade' as const, resourceId: null, durationMs: 2000, easing: linear, direction: 'left' as const };
    const first = unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'changeBg',
      args: { assetId: FixtureIds.background, transition: { enter: fade, exit: fade } } }));
    expect(first.state.presentation.transitions[0]).toMatchObject({ kind: 'enter', from: null, elapsedMs: 0 });
    const second = unwrap(await service.prepare({ state: first.state, token, opcode: 'changeBg',
      args: { assetId: id(15), transition: { enter: fade, exit: fade } } }));
    expect(second.state.presentation.transitions[0]?.from?.assetId).toBe(FixtureIds.background);
    expect(second.state.presentation.transitions[0]?.to?.assetId).toBe(id(15));
    const midway = advanceTransitions(second.state.presentation, 800);
    expect(midway.state.transitions).toHaveLength(1);
    expect(midway.state.transitions[0]?.elapsedMs).toBe(800);
    const ended = advanceTransitions(midway.state, 1200);
    expect(ended.state.transitions).toHaveLength(0);
    expect(ended.finished).toHaveLength(1);
    expect(ended.state.objects[0]?.assetId).toBe(id(15));
  });
  it('renders blinds as twelve directional strips and resumes their elapsed progress', async () => {
    const service = new StageCommandService({ asset: () => ({ ok: true,
      value: { variantId: FixtureIds.variant, kind: 'image', provider: null, providerVersion: null }, warnings: [] }) });
    const blinds = { preset: 'blinds' as const, resourceId: null, durationMs: 500, easing: linear, direction: 'right' as const };
    const prepared = unwrap(await service.prepare({ state: FixtureRuntimeState, token, opcode: 'changeBg',
      args: { assetId: FixtureIds.background, transition: { enter: blinds } } }));
    const midway = advanceTransitions(prepared.state.presentation, 250);
    const process = midway.state.transitions[0]!;
    const stage = Object.create(StageController.prototype) as StageController;
    Object.assign(stage, { design: { width: 120, height: 60 } });
    const mask = new Graphics(), handle = { sprite: { alpha: 1, x: 0, y: 0 }, mask };
    const draw = (stage as unknown as { drawTransition(handle: unknown, process: TransitionProcess, entering: boolean): void }).drawTransition.bind(stage);
    draw(handle, process, true);
    expect(mask.containsPoint({ x: 2, y: 30 })).toBe(true);
    expect(mask.containsPoint({ x: 7, y: 30 })).toBe(false);
    expect(mask.containsPoint({ x: 12, y: 30 })).toBe(true);
    process.spec.direction = 'up';
    draw(handle, process, true);
    expect(mask.containsPoint({ x: 60, y: 1 })).toBe(false);
    expect(mask.containsPoint({ x: 60, y: 4 })).toBe(true);
    const restored = advanceTransitions(structuredClone(midway.state), 250);
    expect(restored.state.transitions).toHaveLength(0);
    expect(restored.state.objects[0]?.assetId).toBe(FixtureIds.background);
    mask.destroy();
  });
});

class FakeSource {
  buffer: AudioBuffer | null = null; loop = false; loopStart = 0; loopEnd = 0; onended: (() => void) | null = null;
  started = 0; stopped = false;
  connect() {} disconnect() {} start(_when: number, offset: number) { this.started = offset; } stop() { this.stopped = true; }
}
class FakeGain { gain = { value: 1 }; connect() {} disconnect() {} }
class FakeAnalyser { fftSize = 1024; level = 0; connect() {} disconnect() {}
  getFloatTimeDomainData(samples: Float32Array) { samples.fill(this.level); } }
class FakeContext {
  state: AudioContextState = 'running'; currentTime = 0; destination = {};
  denyResume = false;
  sources: FakeSource[] = [];
  analyser = new FakeAnalyser();
  createGain() { return new FakeGain(); }
  createAnalyser() { return this.analyser; }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  async resume() { if (this.denyResume) throw new Error('gesture required'); this.state = 'running'; }
}
const audioState: AudioState = { assetId: FixtureIds.voices[0]!, variantId: id(0xd01), stopped: false,
  volume: 0.8, startSec: 30, loop: false, loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 };
describe('M06 media instances', () => {
  it('seeks a looping source at its endpoint back into the loop without ending or resuming a user pause',async()=>{
    const context=new FakeContext(),mixer=new AudioMixer(context as unknown as AudioContext,async()=>({duration:300} as AudioBuffer));
    const source=unwrap(await mixer.play({sessionId:FixtureIds.session,bus:'bgm',state:{...audioState,loop:true}}));
    mixer.seek(source,300);expect(unwrap(mixer.inspect({sessionId:FixtureIds.session,source:{kind:'instance',id:source}}))).toMatchObject({status:'playing',positionSec:0});
    mixer.setSourcePaused(source,true);mixer.seek(source,300);expect(unwrap(mixer.inspect({sessionId:FixtureIds.session,source:{kind:'instance',id:source}}))).toMatchObject({status:'paused',positionSec:0,userPaused:true});mixer.dispose();
  });
  it('reads current voice PCM RMS and returns silence while paused', async () => {
    const context = new FakeContext();
    const mixer = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 100 }) as AudioBuffer);
    expect(mixer.voiceLevel()).toBe(0);
    const binding = { token, resolution: { id: id(4), source: { documentId: id(5), statementId: token.statementId, revision: 1 },
      requestedLocale: 'zh-CN', defaultLocale: 'zh-CN', attempts: [],
      selected: { assetId: audioState.assetId!, variantId: audioState.variantId!, locale: 'zh-CN', via: 'requestedLocale' as const } } };
    unwrap(await mixer.play({ sessionId: FixtureIds.session, bus: 'voice', state: audioState, token, binding }));
    context.analyser.level = 0.4; expect(mixer.voiceLevel()).toBeCloseTo(0.4);
    context.analyser.level = 1.5; expect(mixer.voiceLevel()).toBe(1);
    mixer.setPause('focus', true); expect(mixer.voiceLevel()).toBe(0);
    mixer.setPause('focus', false); expect(mixer.voiceLevel()).toBe(1);
    mixer.dispose(); expect(mixer.voiceLevel()).toBe(0);
  });
  it('resamples only newly played voice PCM and does not advance it while paused', async () => {
    const context = new FakeContext(), samples = new Float32Array(24000).fill(.5);
    const mixer = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 1, sampleRate: 24000,
      numberOfChannels: 1, getChannelData: () => samples }) as unknown as AudioBuffer);
    const binding = { token, resolution: { id: id(4), source: { documentId: id(5), statementId: token.statementId, revision: 1 },
      requestedLocale: 'zh-CN', defaultLocale: 'zh-CN', attempts: [],
      selected: { assetId: audioState.assetId!, variantId: audioState.variantId!, locale: 'zh-CN', via: 'requestedLocale' as const } } };
    unwrap(await mixer.play({ sessionId: FixtureIds.session, bus: 'voice', state: { ...audioState, startSec: 0 }, token, binding }));
    context.currentTime = .02;
    const first = mixer.voicePCM(20)!; expect(first.sampleRate).toBe(48000); expect(first.samples).toHaveLength(960);
    expect(first.samples.every(value => value === .5)).toBe(true);
    expect(mixer.voicePCM(20)!.samples).toHaveLength(0);
    mixer.setPause('focus', true); expect(mixer.voicePCM(20)).toBeNull();
    mixer.setPause('focus', false); context.currentTime = .04; expect(mixer.voicePCM(20)!.samples).toHaveLength(960);
    mixer.dispose();
  });
  it('resumes same session cursor and restarts at DSL start after a new load', async () => {
    const context = new FakeContext();
    const mixer = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 100 }) as AudioBuffer);
    const first = unwrap(await mixer.play({ sessionId: FixtureIds.session, bus: 'bgm', state: audioState }));
    expect(context.sources.at(-1)?.started).toBe(30);
    context.currentTime = 43; mixer.setPause('gallery', true);
    expect(unwrap(mixer.inspect({ sessionId: FixtureIds.session, source: { kind: 'instance', id: first } })).status).toBe('paused');
    mixer.setPause('gallery', false); expect(context.sources.at(-1)?.started).toBe(73);
    mixer.disposeSession(FixtureIds.session);
    unwrap(await mixer.play({ sessionId: FixtureIds.session, bus: 'bgm', state: audioState }));
    expect(context.sources.at(-1)?.started).toBe(30);
    mixer.dispose();
  });
  it('keeps source binding and reports zero gains without replacing it on mismatch', async () => {
    const context = new FakeContext();
    const mixer = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 100 }) as AudioBuffer);
    const binding = { token, resolution: { id: id(4), source: { documentId: id(5), statementId: token.statementId, revision: 1 },
      requestedLocale: 'zh-CN', defaultLocale: 'zh-CN', attempts: [],
      selected: { assetId: audioState.assetId!, variantId: audioState.variantId!, locale: 'zh-CN', via: 'requestedLocale' as const } } };
    const first = unwrap(await mixer.play({ sessionId: FixtureIds.session, bus: 'voice', state: audioState, token, binding }));
    const mismatch = await mixer.play({ sessionId: FixtureIds.session, bus: 'voice', state: audioState,
      token: { ...token, occurrence: 2 }, binding });
    expect(mismatch.ok).toBe(false);
    mixer.setLevels(0, { voice: 0 });
    const inspection = unwrap(mixer.inspect({ sessionId: FixtureIds.session, source: { kind: 'instance', id: first } }));
    expect(inspection.voiceResolution?.selected?.locale).toBe('zh-CN');
    expect(inspection.problems).toEqual(['CATEGORY_ZERO', 'MASTER_ZERO']);
    mixer.dispose();
  });
  it('keeps preview output muted across preference changes without pausing the media instance', async () => {
    const context = new FakeContext();
    const mixer = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 100 }) as AudioBuffer);
    const instance = unwrap(await mixer.play({ sessionId: FixtureIds.session, bus: 'bgm', state: audioState }));
    const inspect = () => unwrap(mixer.inspect({ sessionId: FixtureIds.session, source: { kind: 'instance', id: instance } }));
    mixer.setOutputMuted(true); mixer.setLevels(.7, { bgm: .4 });
    expect(inspect().status).toBe('playing'); expect(inspect().gains.effective).toBe(0);
    mixer.setOutputMuted(false); expect(inspect().gains.effective).toBeCloseTo(audioState.volume * .7 * .4);
    mixer.dispose();
  });
  it('ducks BGM only for voice, preserves old source during an autoplay block and resumes by source ID', async () => {
    const context = new FakeContext();
    const mixer = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 100 }) as AudioBuffer);
    const bgm = unwrap(await mixer.play({ sessionId: FixtureIds.session, bus: 'bgm', state: audioState }));
    mixer.setLevels(0.5, { bgm: 0.6 });
    const binding = { token, resolution: { id: id(4), source: { documentId: id(5), statementId: token.statementId, revision: 1 },
      requestedLocale: 'zh-CN', defaultLocale: 'zh-CN', attempts: [],
      selected: { assetId: audioState.assetId!, variantId: audioState.variantId!, locale: 'zh-CN', via: 'requestedLocale' as const } } };
    unwrap(await mixer.play({ sessionId: FixtureIds.session, bus: 'voice', state: audioState, token, binding }));
    mixer.tick(100);
    expect(unwrap(mixer.inspect({ sessionId: FixtureIds.session, source: { kind: 'instance', id: bgm } })).gains.effective).toBeCloseTo(0.8 * 0.6 * 0.5 * 0.35);
    context.state = 'suspended'; context.denyResume = true;
    const blocked = await mixer.play({ sessionId: FixtureIds.session, bus: 'voice', state: audioState,
      token: { ...token, occurrence: 2 }, binding: { ...binding, token: { ...token, occurrence: 2 } } });
    const blockedId = unwrap(blocked);
    if (blocked.ok) expect(blocked.warnings[0]?.code).toBe('AUTOPLAY_BLOCKED');
    expect(unwrap(mixer.inspect({ sessionId: FixtureIds.session, source: { kind: 'dialogue', token } })).status).toBe('playing');
    context.denyResume = false;
    expect((await mixer.resumeBlocked(blockedId)).ok).toBe(true);
    expect(unwrap(mixer.inspect({ sessionId: FixtureIds.session, source: { kind: 'dialogue', token } })).status).toBe('stopped');
    mixer.dispose();
  });
  it('does not let an older delayed BGM decode replace a newer source', async () => {
    const context = new FakeContext();
    const pending: ((buffer: AudioBuffer) => void)[] = [];
    const mixer = new AudioMixer(context as unknown as AudioContext,
      async () => new Promise<AudioBuffer>(resolve => pending.push(resolve)));
    const first = mixer.play({ sessionId: FixtureIds.session, bus: 'bgm', state: audioState });
    const second = mixer.play({ sessionId: FixtureIds.session, bus: 'bgm', state: audioState });
    pending[1]!({ duration: 100 } as AudioBuffer);
    const latest = unwrap(await second);
    pending[0]!({ duration: 100 } as AudioBuffer);
    const stale = await first;
    expect(stale.ok).toBe(false); if (!stale.ok) expect(stale.error.code).toBe('AUDIO_STALE');
    expect(unwrap(mixer.inspect({ sessionId: FixtureIds.session, source: { kind: 'instance', id: latest } })).status).toBe('playing');
    expect(context.sources).toHaveLength(1);
    mixer.dispose();
  });
  it('completes an Esc-skipped video once and ignores a second skip or old end event', async () => {
    const completions: string[] = [];
    const video = { src: '', currentTime: 0, style: { opacity: '1' }, onended: null as null | (() => void),
      onerror: null as null | (() => void), pause() {}, async play() {}, removeAttribute() {}, load() {} };
    const controller = new VideoController(video as unknown as HTMLVideoElement, value => completions.push(value.outcome));
    unwrap(await controller.start({ token, url: 'op.mp4', skipFadeMs: 0 }));
    const oldEnd = video.onended;
    expect(controller.input('physicalEsc')).toBe(true);
    expect(controller.input('mouseRight')).toBe(false);
    oldEnd?.(); expect(controller.input('mouseRight')).toBe(false);
    expect(completions).toEqual(['skipped']);
    controller.dispose();
  });
  it('keeps the waiting video process identity across a playback retry', async () => {
    const completions: string[] = [];
    let failPlayback = false;
    const video = { src: '', currentTime: 0, style: { opacity: '1' }, onended: null as null | (() => void),
      onerror: null as null | (() => void), pause() {}, async play() { if (failPlayback) throw new Error('decode'); },
      removeAttribute() {}, load() {} };
    const controller = new VideoController(video as unknown as HTMLVideoElement, value => completions.push(value.processId));
    const processId = unwrap(await controller.start({ token, url: 'op.mp4', skipFadeMs: 0 }));
    video.onerror?.(); failPlayback = true;
    expect((await controller.retry()).ok).toBe(false);
    failPlayback = false;
    expect(unwrap(await controller.retry())).toBe(processId);
    video.onended?.(); expect(completions).toEqual([processId]);
    controller.dispose();
  });
});
