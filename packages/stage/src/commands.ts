import { createId, isId, NativeAnimationSchema } from '@galcraft/contracts';
import type { AnimatedImageMetadata, AssetKind, AudioState, Character, EffectInstance, EffectValues, ExecutionToken, Id, Json, NativeAnimation, PresentationDelta, Result, RuntimeState, Segment, StageObject, StageStation, Transition, TransitionPair } from '@galcraft/contracts';
import type { StageService } from '@galcraft/runtime';
import { copy, fail, ok, record } from './common.js';
import { animationFields, finishAnimations, sampleObjectAnimation, scheduleAnimation, stopAnimation, StageCameraId, type AnimationTarget } from './animation.js';
import type { ExecutableAnimation } from './animation-resource.js';
import { configureImageFace, imageFaceAssets } from './face.js';

export type StageAssetLookup = { asset(assetId: Id, variantId?: Id | null): Result<{ variantId: Id; kind: AssetKind; provider: string | null; providerVersion: string | null; imageAnimation?: AnimatedImageMetadata; loop?: {startSec:number;endSec:number;tail:'wrap'|'cut'} }>;
  character?(characterId: Id): Character | undefined;
  animation?(assetId: Id, parameters: Record<string, unknown>): Promise<Result<ExecutableAnimation>> };
const easing = { family: 'linear', direction: 'in' } as const;
const cut: Transition = { preset: 'cut', resourceId: null, durationMs: 0, easing, direction: 'left' };
export const defaultEffectValues: EffectValues = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, blur: 0,
  brightness: 1, contrast: 1, saturation: 1, gamma: 1, rgb: [255, 255, 255],
  bloom: { intensity: 0, brightness: 1, blur: 0, threshold: 0 },
  bevel: { opacity: 0, thickness: 0, rotationDeg: 0, softness: 0, rgb: [255, 255, 255] },
  filters: { oldFilm: false, dot: false, reflection: false, glitch: false, rgbSplit: false, godray: false },
  blend: 'normal', z: 0 };
const audioState = (args: Record<string, unknown>, assetId: Id | null, variantId: Id | null, stopped = false): AudioState => ({
  assetId, variantId, stopped, volume: Number(args.volume ?? 100) / 100,
  startSec: Number(args.startSec ?? 0), loop: Boolean(args.loop ?? false), loopStartSec: Number(args.loopStartSec ?? args.startSec ?? 0),
  loopEndSec: args.loopEndSec === undefined || args.loopEndSec === null ? null : Number(args.loopEndSec),
  fadeInMs: Number(args.fadeInMs ?? 0), fadeOutMs: Number(args.fadeOutMs ?? 0),
});
function pair(raw: unknown): TransitionPair {
  const input = record(raw);
  return { enter: { ...cut, ...record(input.enter) } as Transition, exit: { ...cut, ...record(input.exit) } as Transition };
}
const defaults = defaultEffectValues;
function effectValues(raw: unknown, base: EffectValues = defaults): EffectValues {
  const patch = record(raw);
  return { ...copy(base), ...patch,
    rgb: Array.isArray(patch.rgb) ? patch.rgb as EffectValues['rgb'] : [...base.rgb],
    bloom: { ...base.bloom, ...record(patch.bloom) }, bevel: { ...base.bevel, ...record(patch.bevel),
      rgb: Array.isArray(record(patch.bevel).rgb) ? record(patch.bevel).rgb as EffectValues['rgb'] : [...base.bevel.rgb] },
    filters: { ...base.filters, ...record(patch.filters) },
    ...(patch.shockwave || base.shockwave ? { shockwave: { time: 0, amplitude: 30, wavelength: 160, speed: 500, radius: -1, centerX: .5, centerY: .5, ...base.shockwave, ...record(patch.shockwave) } } : {}),
    ...(patch.circle || base.circle ? { circle: { radius: 2, softness: 0, centerX: .5, centerY: .5, invert: false, ...base.circle, ...record(patch.circle) } } : {}),
  } as EffectValues;
}
const delta = (): PresentationDelta => ({ objects: [], effects: [], audio: [] });
const id = (value: unknown): value is Id => typeof value === 'string' && isId(value);

export class StageCommandService implements StageService {
  constructor(private readonly assets: StageAssetLookup) {}
  private async prepareTransition(spec: Transition): Promise<Result<{ spec: Transition; custom?: ExecutableAnimation }>> {
    if (spec.preset !== 'custom') return ok({ spec });
    if (spec.animation) {
      if (spec.resourceId) return fail('ANIMATION_RESOURCE', 'Custom transition must select one animation source');
      const parsed = NativeAnimationSchema.safeParse(spec.animation);
      if (!parsed.success) return fail('ANIMATION_RESOURCE', parsed.error.message);
      return ok({ spec: { ...spec, durationMs: spec.durationMs || parsed.data.durationMs }, custom: parsed.data });
    }
    if (!spec.resourceId || !this.assets.animation) return fail('ANIMATION_RESOURCE', 'Custom transition animation is unavailable', ['supplyDependency']);
    const resolved = await this.assets.animation(spec.resourceId, {}); if (!resolved.ok) return resolved;
    const duration = Array.isArray(resolved.value) ? resolved.value.reduce((sum, segment) => sum + segment.durationMs, 0) : resolved.value.durationMs;
    return ok({ spec: { ...spec, durationMs: spec.durationMs || duration }, custom: copy(resolved.value) });
  }

  async prepare(input: { state: RuntimeState; token: ExecutionToken; opcode: string; args: Json }): Promise<Result<{ state: RuntimeState; delta: PresentationDelta | null }>> {
    const state = copy(input.state), presentation = state.presentation, args = record(input.args), change = delta();
    switch (input.opcode) {
      case 'characterDifference': {
        const characterId = String(args.characterId), character = this.assets.character?.(characterId);
        if (!character) return fail('CHARACTER_MISSING', '共同差分所属角色不可用', ['locate']);
        const states = presentation.characterDifferences ??= {}, previous = states[characterId];
        const difference = character.differences?.find(item => item.id === (args.differenceId ?? previous?.differenceId ?? character.initialDifferenceId)) ?? (args.differenceId ? undefined : character.differences?.[0]);
        if (!difference) return fail('CHARACTER_DIFFERENCE_MISSING', '角色共同差分不可用', ['locate']);
        const figure = this.assets.asset(difference.figure.assetId, difference.figure.variantId); if (!figure.ok) return figure;
        const mapped = difference.avatar?.kind === 'image' ? this.assets.asset(difference.avatar.assetId, difference.avatar.variantId) : null;
        if (mapped && !mapped.ok) return mapped;
        const durationMs = Number(record(args.transition).durationMs ?? 180);
        states[characterId] = { differenceId: difference.id, changedAtMs: presentation.logicalTimeMs ?? 0,
          figure: { assetId: difference.figure.assetId, variantId: figure.value.variantId },
          avatar: difference.avatar?.kind === 'image' && mapped?.ok ? { kind: 'image', assetId: difference.avatar.assetId, variantId: mapped.value.variantId } : difference.avatar?.kind === 'crop' ? difference.avatar : null,
          previous: previous?.avatar && previous.avatarVisible ? { assetId: previous.avatar.kind === 'image' ? previous.avatar.assetId : previous.figure.assetId,
            variantId: previous.avatar?.kind === 'image' ? previous.avatar.variantId : previous.figure.variantId,
            crop: previous.avatar?.kind === 'crop' ? previous.avatar.crop : null } : null,
          elapsedMs: 0, durationMs, figureVisible: typeof args.figureVisible === 'boolean' ? args.figureVisible : previous?.figureVisible ?? true,
          avatarVisible: typeof args.avatarVisible === 'boolean' ? args.avatarVisible : previous?.avatarVisible ?? true };
        let updated = state;
        for (const object of presentation.objects.filter(item => item.differenceCharacterId === characterId)) {
          const replaced = await this.prepare({ ...input, state: updated, opcode: 'changeFigure', args: { op: 'replace', objectId: object.id,
            characterId, assetId: difference.figure.assetId, variantId: figure.value.variantId,
            transition: { enter: { ...cut, preset: 'fade', durationMs, ...record(args.transition) }, exit: object.transition.exit } } });
          if (!replaced.ok) return replaced; updated = replaced.value.state;
          updated.presentation.objects.find(item => item.id === object.id)!.visible = states[characterId]!.figureVisible;
          change.objects.push(...(replaced.value.delta?.objects ?? []));
        }
        updated.presentation.characterDifferences = states;
        change.transitions = copy(updated.presentation.transitions);
        return ok({ state: updated, delta: change });
      }
      case '$finishAnimationWait': {
        const finished = finishAnimations(presentation, input.token);
        state.presentation = finished.state;
        for (const object of finished.state.objects) if (object.imagePlayback?.owner?.sessionId === input.token.sessionId &&
          object.imagePlayback.owner.occurrence === input.token.occurrence && object.imagePlayback.mode === 'once') {
          object.imagePlayback.elapsedMs = object.imagePlayback.frameDurationsMs.reduce((sum, value) => sum + value, 0);
          object.imagePlayback.completed = true;
        }
        change.objects = finished.state.objects.map(value => ({ op: 'update', id: value.id, value: copy(value) }));
        change.camera = copy(finished.state.camera);
        break;
      }
      case 'changeBg': case 'changeFigure': case 'changeIllustration': case 'changeIllustrationDiff': {
        const background = input.opcode === 'changeBg';
        const illustration = input.opcode === 'changeIllustration' || input.opcode === 'changeIllustrationDiff';
        const difference = input.opcode === 'changeIllustrationDiff';
        const previousBackground = background ? presentation.objects.find(object => object.layer === 'background') : undefined;
        const objectId = background ? args.objectId ?? previousBackground?.id ?? createId() : args.objectId;
        if (!id(objectId)) return fail('OBJECT_ID', '舞台对象缺少有效身份');
        const previous = presentation.objects.find(object => object.id === objectId);
        if (background && previous && previous.layer !== 'background') return fail('OBJECT_PURPOSE', '背景身份已用于其他舞台对象', ['chooseTarget']);
        if (background && previousBackground && previousBackground.id !== objectId && args.op !== 'clear') {
          presentation.objects = presentation.objects.filter(object => object.id !== previousBackground.id);
          presentation.transitions = presentation.transitions.filter(process => process.objectId !== previousBackground.id);
          change.objects.push({ op: 'exit', id: previousBackground.id, value: null });
        }
        if (previous && !background && (previous.purpose === 'illustration') !== illustration)
          return fail('OBJECT_PURPOSE', 'The object has a different presentation purpose');
        if (difference) {
          if (!previous) return fail('OBJECT_MISSING', 'Illustration object is unavailable');
          args.assetId = args.stateName ? previous.illustrationStates?.[String(args.stateName)] : args.assetId;
          if (!id(args.assetId)) return fail('ILLUSTRATION_STATE_MISSING', 'The illustration state is unavailable');
          args.op = 'replace';
        }
        const diffTransition = difference && record(args.transition).preset !== undefined && record(args.transition).preset !== 'cut';
        if (!difference || diffTransition) presentation.transitions = presentation.transitions.filter(process => process.objectId !== objectId);
        if (args.op === 'clear' || args.op === 'exit') {
          if (previous) { presentation.objects = presentation.objects.filter(object => object.id !== objectId);
            change.objects.push({ op: 'exit', id: objectId, value: null }); }
          const exit = previous ? await this.prepareTransition({ ...previous.transition.exit, ...record(record(args.transition).exit) } as Transition) : null;
          if (exit && !exit.ok) return exit;
          if (previous && exit?.ok && exit.value.spec.preset !== 'cut' && exit.value.spec.durationMs > 0)
            presentation.transitions.push({ id: createId(), owner: input.token, objectId, kind: 'exit',
              ...exit.value, elapsedMs: 0, seed: Math.floor(Math.random() * 0x100000000),
              from: { ...copy(previous), processes: [] }, to: null });
          change.transitions = copy(presentation.transitions);
          if (background) { presentation.backgroundVideo = null; change.backgroundVideo = null; }
          break;
        }
        const shared = !background && !illustration && id(args.characterId) ? presentation.characterDifferences?.[args.characterId] : undefined;
        if (shared && (args.difference === true || args.assetId === undefined)) { args.assetId = shared.figure.assetId; args.variantId = shared.figure.variantId; }
        if (!id(args.assetId)) return fail('ASSET_ID', '舞台对象缺少素材身份');
        const resolved = this.assets.asset(args.assetId, id(args.variantId) ? args.variantId : null); if (!resolved.ok) return resolved;
        if (background ? !['image', 'video'].includes(resolved.value.kind) : !['image', 'live2d'].includes(resolved.value.kind))
          return fail('ASSET_KIND', '舞台素材类型与对象不匹配');
        let imageFace: StageObject['imageFace'] = null;
        if (!background && resolved.value.kind === 'image') {
          if (args.model === undefined && !args.reset) imageFace = previous?.imageFace ?? null;
          else {
            const configured = configureImageFace(args.model); if (!configured.ok) return configured;
            imageFace = configured.value;
          }
          if (imageFace) for (const faceAssetId of imageFaceAssets(imageFace)) {
            const faceAsset = this.assets.asset(faceAssetId); if (!faceAsset.ok) return faceAsset;
            if (faceAsset.value.kind !== 'image') return fail('IMAGE_FACE_RESOURCE_KIND', `口眼资源 ${faceAssetId} 不是图片`);
          }
        }
        const station = background ? 'center' : args.station as StageStation ?? previous?.station ?? 'center';
        const characterId = !background && !illustration && id(args.characterId) ? args.characterId : previous?.characterId;
        const characterDefaults = characterId ? this.assets.character?.(characterId)?.defaultEffects : undefined;
        const inherited = characterDefaults ? effectValues(characterDefaults) : defaults;
        const values = effectValues(args.effects, args.reset ? inherited : previous?.current ?? inherited);
        if (!background && typeof args.z === 'number') values.z = args.z;
        const framing = record(args.framing), playback = record(args.playback);
        if (playback.wait === true && playback.mode !== 'once') return fail('IMAGE_INFINITE_WAIT', 'A looping image cannot wait for its final frame', ['locate']);
        if (playback.wait === true && !resolved.value.imageAnimation) return fail('IMAGE_WAIT_STATIC', 'Image completion waiting requires an animated image', ['locate']);
        const object: StageObject = { id: objectId, characterId: background ? null : id(args.characterId) ? args.characterId : previous?.characterId ?? null,
          ...(shared && args.difference === true ? { differenceCharacterId: String(args.characterId), visible: shared.figureVisible } : previous?.differenceCharacterId && args.difference!==false && (!args.characterId||args.characterId===previous.differenceCharacterId) ? { differenceCharacterId: previous.differenceCharacterId, visible: previous.visible } : {}),
          assetId: args.assetId, variantId: resolved.value.variantId, layer: background ? 'background' : 'figure',
          ...(!background ? { purpose: illustration ? 'illustration' as const : 'figure' as const } : {}),
          ...(illustration ? {
            illustrationFrame: { widthRatio: .5, heightRatio: .5, fit: 'contain' as const,
              ...previous?.illustrationFrame, ...record(args.illustrationFrame) },
            illustrationStates: Array.isArray(args.states) ? Object.fromEntries(args.states.map(value => {
              const state = record(value); return [String(state.name), String(state.assetId)];
            })) : previous?.illustrationStates ?? {},
            ...(typeof args.stateName === 'string' ? { illustrationState: args.stateName } : {}),
          } : {}),
          entranceOrder: previous?.entranceOrder ?? presentation.nextEntranceOrder++,
          backgroundFrame: background ? { fit: args.fit as 'cover' | 'contain' | 'native' ?? 'cover', positionX: Number(args.positionX ?? 0.5), positionY: Number(args.positionY ?? 0.5) } : null,
          station, current: values, defaults: { ...copy(values), station },
          framing: background ? { mode: 'full', scale: 1, offsetX: 0, offsetY: 0, crop: null } : {
            mode: framing.mode as StageObject['framing']['mode'] ?? previous?.framing.mode ?? 'full',
            scale: Number(framing.scale ?? previous?.framing.scale ?? 1), offsetX: Number(framing.offsetX ?? previous?.framing.offsetX ?? 0),
            offsetY: Number(framing.offsetY ?? previous?.framing.offsetY ?? 0), crop: framing.crop as StageObject['framing']['crop'] ?? previous?.framing.crop ?? null },
          transition: difference ? previous!.transition : args.transition ? pair(args.transition) : previous?.transition ?? pair(null),
          processes: previous?.processes ?? [], imageFace,
          imagePlayback: resolved.value.imageAnimation ? { mode: playback.mode === 'once' ? 'once' : 'loop', elapsedMs: 0,
            completed: false, frameDurationsMs: copy(resolved.value.imageAnimation.frameDurationsMs), owner: playback.wait === true ? input.token : null } : undefined,
          portrait: background ? undefined : args.portrait ? {
            enabled: record(args.portrait).enabled === true,
            crop: { x: .25, y: 0, width: .5, height: .35, ...record(record(args.portrait).crop) },
          } : args.reset ? undefined : previous?.portrait,
          providerState: resolved.value.provider ? {
            provider: resolved.value.provider, version: resolved.value.providerVersion ?? '0.1.0',
            state: (args.model === undefined && !args.reset && previous?.assetId === args.assetId &&
              previous.variantId === resolved.value.variantId && previous.providerState?.provider === resolved.value.provider
              ? previous.providerState.state : args.model ?? {}) as Json } : null };
        if (previous) presentation.objects = presentation.objects.map(item => item.id === objectId ? object : item);
        else presentation.objects.push(object);
        const entering = diffTransition ? { ...cut, ...record(args.transition) } as Transition : object.transition.enter;
        const enter: Result<{ spec: Transition; custom?: ExecutableAnimation }> = !difference || diffTransition ? await this.prepareTransition(entering) : ok({ spec: entering });
        if (!enter.ok) return enter;
        if (enter.value.custom) {
          const fields = animationFields(enter.value.custom);
          for (const process of object.processes) if (process.status !== 'queued') process.fields = process.fields.filter(path => !fields.includes(path));
          if (enter.value.spec.durationMs === 0) Object.assign(object, sampleObjectAnimation(object, enter.value.custom, 0));
        }
        if ((!difference || diffTransition) && enter.value.spec.preset !== 'cut' && enter.value.spec.durationMs > 0)
          presentation.transitions.push({ id: createId(), owner: input.token, objectId,
            kind: previous ? 'replace' : 'enter', ...enter.value, elapsedMs: 0,
            seed: Math.floor(Math.random() * 0x100000000), from: previous ? copy(previous) : null, to: copy(object) });
        if (difference && !diffTransition) for (const process of presentation.transitions)
          if (process.objectId === objectId && process.to) process.to = copy(object);
        change.objects.push({ op: previous ? 'replace' : 'show', id: objectId, value: copy(object) });
        change.transitions = copy(presentation.transitions);
        if (background) {
          presentation.backgroundVideo = resolved.value.kind === 'video' ? { assetId: args.assetId, volume: 0, muted: true, loop: true } : null;
          change.backgroundVideo = copy(presentation.backgroundVideo);
        }
        break;
      }
      case 'bgm': {
        const asset = id(args.assetId) && args.op !== 'stop' ? this.assets.asset(args.assetId) : null;
        if (asset && !asset.ok) return asset;
        if (asset?.ok && asset.value.kind !== 'audio') return fail('ASSET_KIND', '背景音乐需要音频素材');
        const next = audioState(args, id(args.assetId) ? args.assetId : null, asset?.ok ? asset.value.variantId : null, args.op === 'stop');
        if (asset?.ok && asset.value.loop) {
          if (args.loop === undefined) next.loop = true;
          if (args.loopStartSec === undefined) next.loopStartSec = asset.value.loop.startSec;
          if (args.loopEndSec === undefined) next.loopEndSec = asset.value.loop.endSec;
        }
        if (!next.stopped && !next.assetId) return fail('ASSET_ID', '背景音乐缺少素材身份');
        presentation.bgm = next; change.audio.push({ bus: 'bgm', id: next.assetId, state: next }); break;
      }
      case 'playEffect': {
        if (!id(args.soundId) && !(args.op === 'stop' && args.all === true)) return fail('SOUND_ID', '音效缺少身份');
        const soundId = id(args.soundId) ? args.soundId : null;
        if (args.op === 'stop') {
          const stopped = args.all ? presentation.currentSfx : presentation.currentSfx.filter(item => item.soundId === soundId);
          for (const entry of stopped) change.audio.push({ bus: 'sfx', id: entry.soundId, state: { ...entry.audio, stopped: true } });
          presentation.currentSfx = args.all ? [] : presentation.currentSfx.filter(item => item.soundId !== soundId);
          for (const [entryId, state] of Object.entries(presentation.ambience)) if (args.all || entryId === soundId) {
            change.audio.push({ bus: 'sfx', id: entryId, state: { ...state, stopped: true } }); delete presentation.ambience[entryId];
          }
        }
        else {
          if (!id(args.assetId)) return fail('ASSET_ID', '音效缺少素材身份');
          const asset = this.assets.asset(args.assetId); if (!asset.ok) return asset;
          if (asset.value.kind !== 'audio') return fail('ASSET_KIND', '音效需要音频素材');
          const next = audioState(args, args.assetId, asset.value.variantId);
          if (!soundId) return fail('SOUND_ID', '音效缺少身份');
          if (next.loop) presentation.ambience[soundId] = next;
          else presentation.currentSfx.push({ soundId, audio: next, statementId: input.token.statementId });
          change.audio.push({ bus: 'sfx', id: soundId, state: next });
        }
        break;
      }
      case 'video': {
        if (!id(args.assetId)) return fail('ASSET_ID', '视频缺少素材身份');
        const asset = this.assets.asset(args.assetId); if (!asset.ok) return asset;
        if (asset.value.kind !== 'video') return fail('ASSET_KIND', '视频命令需要视频素材');
        const next = audioState(args, args.assetId, asset.value.variantId); change.audio.push({ bus: 'video', id: args.assetId, state: next }); break;
      }
      case 'stopAnimation': {
        if (!id(args.animationId)) return fail('ANIMATION_ID', 'Stopping an animation requires its authored instance ID', ['locate']);
        const target = record(args.target);
        const matches = presentation.objects.filter(item => target.kind === 'station' ? item.station === target.station : item.id === target.id);
        if (matches.length > 1) return fail('OBJECT_AMBIGUOUS', '站位匹配多个对象，请指定对象身份', ['chooseTarget']);
        const object: AnimationTarget | undefined = target.kind === 'stage' && presentation.camera ? { id: StageCameraId, ...presentation.camera } : matches[0];
        if (!object) return fail('OBJECT_MISSING', '动画目标对象不存在', ['locate']);
        const stopped = stopAnimation(object, args.animationId); if (!stopped.ok) return stopped;
        if (target.kind === 'stage') { presentation.camera!.processes = object.processes; change.camera = copy(presentation.camera); }
        else change.objects.push({ op: 'update', id: object.id, value: copy(object as StageObject) });
        break;
      }
      case 'setTransform': case 'setComplexAnimation': case 'setTempAnimation': case 'setAnimation': {
        const target = record(args.target);
        const matches = presentation.objects.filter(item => target.kind === 'station' ? item.station === target.station : item.id === target.id);
        if (matches.length > 1) return fail('OBJECT_AMBIGUOUS', '站位匹配多个对象，请指定对象身份', ['chooseTarget']);
        if (target.kind === 'stage') presentation.camera ??= { current: copy(defaults), defaults: copy(defaults), processes: [] };
        const object: AnimationTarget | undefined = target.kind === 'stage' ? { id: StageCameraId, ...presentation.camera! } : matches[0];
        if (!object) return fail('OBJECT_MISSING', '动画目标对象不存在', ['locate']);
        let segments: Segment[] = input.opcode === 'setTransform' ? [{ effects: args.effects as Segment['effects'], durationMs: Number(args.durationMs ?? 0),
          easing: args.easing as Segment['easing'] ?? easing }] : Array.isArray(args.segments) ? args.segments as Segment[] : [];
        let native: NativeAnimation | undefined;
        if (args.animation !== undefined) {
          const checked = NativeAnimationSchema.safeParse(args.animation);
          if (!checked.success) return fail('ANIMATION_TRACK', checked.error.message, ['locate']);
          native = checked.data;
        }
        if ((input.opcode === 'setAnimation' || input.opcode === 'setComplexAnimation' && args.resourceId) && !segments.length && !native) {
          const resourceId = input.opcode === 'setAnimation' ? args.presetId : args.resourceId;
          if (!id(resourceId) || !this.assets.animation) return fail('ANIMATION_RESOURCE', '动画资源不可读取', ['supplyDependency']);
          const loaded = await this.assets.animation(resourceId, record(args.parameters)); if (!loaded.ok) return loaded;
          if (Array.isArray(loaded.value)) segments = loaded.value; else native = loaded.value;
        }
        if (!segments.length && !native) return fail('ANIMATION_RESOURCE', '动画段或预设尚未解析', ['supplyDependency']);
        if (native && input.opcode === 'setAnimation' && (typeof args.durationMs === 'number' || args.easing)) {
          const duration = typeof args.durationMs === 'number' ? args.durationMs : native.durationMs;
          native = { ...native, durationMs: duration, tracks: native.tracks.map(track => ({ ...track, keyframes: (duration === 0 ? [track.keyframes.at(-1)!] : track.keyframes).map(frame => ({ ...frame,
            timeMs: native!.durationMs === 0 ? 0 : frame.timeMs * duration / native!.durationMs,
            easing: args.easing as Segment['easing'] ?? frame.easing })) })) };
        }
        if (input.opcode === 'setAnimation' && (typeof args.durationMs === 'number' || args.easing)) segments = segments.map(segment => ({ ...segment,
          durationMs: typeof args.durationMs === 'number' ? args.durationMs : segment.durationMs,
          easing: args.easing as Segment['easing'] ?? segment.easing }));
        if (args.inherit === false && !native) segments = [{ ...segments[0]!, effects: {
          ...copy(object.defaults), ...segments[0]!.effects, bloom: { ...object.defaults.bloom, ...segments[0]!.effects.bloom },
          bevel: { ...object.defaults.bevel, ...segments[0]!.effects.bevel }, filters: { ...object.defaults.filters, ...segments[0]!.effects.filters },
          station: object.defaults.station } }, ...segments.slice(1)];
        if (args.animationId !== undefined && !id(args.animationId)) return fail('ANIMATION_ID', 'Animation instance ID is invalid', ['locate']);
        const scheduled = scheduleAnimation(object, { owner: input.token, segments: segments as Segment[], native, repeat: Number(args.repeat ?? 1),
          ...(id(args.animationId) ? { animationId: args.animationId } : {}),
          loop: Boolean(args.loop), cross: Boolean(args.cross), parallel: Boolean(args.parallel),
          keepFinal: Boolean(args.keepFinal ?? true),
          writeDefault: Boolean(args.writeDefault ?? args.completeDefaults ?? false) });
        if (!scheduled.ok) return scheduled;
        if (target.kind === 'stage') { presentation.camera!.processes = object.processes; change.camera = copy(presentation.camera); }
        else change.objects.push({ op: 'update', id: object.id, value: copy(state.presentation.objects.find(item => item.id === object.id)!) }); break;
      }
      case 'setTransition': {
        const target = record(args.target), object = presentation.objects.find(item => item.id === target.id);
        if (!object) return fail('OBJECT_MISSING', '转场对象不存在', ['locate']);
        object.transition = { enter: { ...cut, ...record(args.enter) } as Transition, exit: { ...cut, ...record(args.exit) } as Transition };
        change.objects.push({ op: 'update', id: object.id, value: copy(object) }); break;
      }
      case 'pixi': {
        if (!id(args.effectId)) return fail('EFFECT_ID', '特效缺少身份');
        const target = record(args.target);
        const targetObject = target.kind === 'station' ? presentation.objects.filter(object => object.station === target.station) : [];
        if (targetObject.length > 1) return fail('OBJECT_AMBIGUOUS', '站位匹配多个对象，请指定对象身份', ['chooseTarget']);
        if (target.kind === 'station' && !targetObject.length || target.kind === 'object' && !presentation.objects.some(object => object.id === target.id))
          return fail('OBJECT_MISSING', '特效目标对象不存在', ['locate']);
        const prior = presentation.effects.find(item => item.id === args.effectId);
        const effect: EffectInstance = { id: args.effectId, type: String(args.type),
          target: target.kind === 'station' ? { kind: 'object', id: targetObject[0]!.id } : target.kind === 'object' && id(target.id) ? { kind: 'object', id: target.id } : 'stage',
          layer: args.layer === 'back' ? 'back' : 'front',
          enabled: Boolean(args.enabled ?? prior?.enabled ?? true), resourceId: id(args.resourceId) ? args.resourceId : null,
          parameters: { ...record(args.parameters), density: Number(args.density ?? 100), speed: Number(args.speed ?? 100), directionDeg: Number(args.directionDeg ?? 90) } as EffectInstance['parameters'],
          elapsedMs: prior?.elapsedMs ?? 0, seed: prior?.seed ?? Math.floor(Math.random() * 0x100000000) };
        const index = presentation.effects.findIndex(item => item.id === effect.id);
        if (index >= 0) presentation.effects[index] = { ...effect, elapsedMs: presentation.effects[index]!.elapsedMs, seed: presentation.effects[index]!.seed };
        else presentation.effects.push(effect);
        change.effects = copy(presentation.effects); break;
      }
      case 'pixiInit': {
        const target = record(args.target);
        const targetIds = target.kind === 'station' ? presentation.objects.filter(object => object.station === target.station).map(object => object.id) : [target.id];
        const selected = (item: EffectInstance) => args.scope === 'all' || (args.scope === 'target' ? target.kind === 'stage' ? item.target === 'stage' : item.target !== 'stage' && targetIds.includes(item.target.id) : item.id === args.effectId);
        const durationMs = Number(args.fadeOutMs ?? 0);
        if (durationMs > 0) for (const effect of presentation.effects.filter(selected)) effect.fade = { elapsedMs: 0, durationMs };
        else presentation.effects = presentation.effects.filter(item => !selected(item));
        change.effects = copy(presentation.effects); break;
      }
      case 'intro': {
        presentation.intro = args.op === 'clear' ? null : { paragraphs: Array.isArray(args.paragraphs) ? args.paragraphs.map(String) : [],
          index: 0, shown: 0, held: false, backgroundColor: String(args.backgroundColor ?? '#000000'),
          backgroundImage: id(args.backgroundImage) ? args.backgroundImage : null, textColor: String(args.textColor ?? '#ffffff'),
          fontSize: typeof args.fontSize === 'number' ? args.fontSize : null, animation: args.animation as NonNullable<typeof presentation.intro>['animation'] ?? 'fade',
          durationMs: Number(args.durationMs ?? 300), elapsedMs: 0, holdMs: Number(args.holdMs ?? 1500),
          holdRemainingMs: Number(args.holdMs ?? 1500), manual: Boolean(args.manual ?? true), keepFinal: Boolean(args.keepFinal ?? false) };
        change.intro = copy(presentation.intro); break;
      }
      case 'miniAvatar': {
        const characterId = id(args.characterId) ? args.characterId : presentation.text.speakerId;
        if (!characterId) return fail('AVATAR_SPEAKER_MISSING', '当前没有说话角色，请明确选择头像所属角色');
        const selection = args.op === 'clear' ? { mode: 'hidden' as const } : args.op === 'auto' ? { mode: 'auto' as const } :
          id(args.assetId) ? { mode: 'image' as const, assetId: args.assetId } : null;
        if (!selection) return fail('AVATAR_ASSET_MISSING', '请选择当前角色的独立头像图片');
        presentation.text.characterAvatars = { ...presentation.text.characterAvatars, [characterId]: selection };
        change.text = copy(presentation.text); break;
      }
      case 'setTextbox': {
        const visible = Boolean(args.visible ?? true), durationMs = Number(args.durationMs ?? 0), from = presentation.text.textboxOpacity ?? (presentation.text.textboxVisible ? 1 : 0);
        presentation.text.textboxOpacity = durationMs > 0 ? from : visible ? 1 : 0;
        presentation.text.textboxVisible = durationMs > 0 || visible;
        presentation.text.textboxTransition = durationMs > 0 ? { from, to: visible ? 1 : 0, elapsedMs: 0, durationMs } : undefined;
        change.text = copy(presentation.text); break;
      }
      case 'filmMode': {
        const enabled = Boolean(args.enabled ?? true), durationMs = Number(args.durationMs ?? 300),
          top = enabled ? Number(args.top ?? .1) : 0, bottom = enabled ? Number(args.bottom ?? .1) : 0;
        const fromTop = presentation.film.enabled ? presentation.film.top : 0, fromBottom = presentation.film.enabled ? presentation.film.bottom : 0;
        presentation.film = durationMs > 0 ? { enabled: true, top: fromTop, bottom: fromBottom,
          transition: { fromTop, fromBottom, toTop: top, toBottom: bottom, enabled, elapsedMs: 0, durationMs } } : { enabled, top, bottom };
        change.film = copy(presentation.film); break;
      }
      case 'applyStyle': {
        const target = record(args.target);
        if (!id(target.id)) return fail('STYLE_TARGET', '样式目标缺少身份');
        if (args.op === 'reset') delete presentation.styles[target.id];
        else if (id(args.styleId)) presentation.styles[target.id] = args.styleId;
        else return fail('STYLE_ID', '样式缺少身份');
        change.styles = copy(presentation.styles); break;
      }
      default: return fail('STAGE_OPCODE', `舞台不支持 ${input.opcode}`);
    }
    return ok({ state, delta: change });
  }
}
