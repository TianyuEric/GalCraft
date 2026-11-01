import { createId, JsonSchema } from '@galcraft/contracts';
import 'pixi.js/advanced-blend-modes';
import { Application, Assets, BlurFilter, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, VideoSource, type Filter, type ApplicationOptions, type AccessibilitySystemOptions } from 'pixi.js';
import { AdjustmentFilter, AdvancedBloomFilter, DotFilter, GlitchFilter, GodrayFilter, OldFilmFilter, ReflectionFilter, RGBSplitFilter } from 'pixi-filters';
import type { EffectInstance, EffectValues, ExecutionToken, Id, PresentationState, ResolvedAsset, RestoreKey, Result, StageObject, VoicePlaybackBinding } from '@galcraft/contracts';
import type { StageInstance, StageProvider, VoicePCM } from '@galcraft/plugins/contracts';
import { advanceAnimations, finishAnimations, ease, sampleObjectAnimation, type AnimationCompletion } from './animation.js';
import { copy, fail, ok } from './common.js';
import { advanceImageFace, imageFaceAsset, imageFaceAssets } from './face.js';
import { backgroundGeometry, canvasPlacement, illustrationGeometry, portraitPlacement, type Rect } from './geometry.js';
import { advanceIntro } from './intro.js';
import { WeatherLayer, isWeatherEffect } from './weather.js';
import { advanceTransitions, transitionProgress } from './transition.js';
import { dialoguePortrait, portraitSourceRect, stageObjectVisible } from './portrait.js';
import { advanceImagePlayback, animatedImageFrame, decodeAnimatedImage, type AnimatedImage } from './animated-image.js';
import { FadedFilter, SurfaceShockwaveFilter, surfaceFilter } from './surface-filter.js';
import { advancePresentationTime } from './presentation-time.js';
import { paintGridTransition } from './grid-transition.js';
import { defaultEffectValues } from './commands.js';
import type { ExecutableAnimation } from './animation-resource.js';

export type VisualResource = { asset: ResolvedAsset; url: string; anchor: { x: number; y: number }; providerVersion?: string };
export type StageResourcePort = { resolve(assetId: Id, variantId: Id): Promise<Result<VisualResource>>;
  resolveAsset?(assetId: Id): Promise<Result<VisualResource>> };
type Handle = { object: StageObject; sprite: Sprite; texture: Texture; instance: StageInstance | null; video: HTMLVideoElement | null; filterKey: string;
  animated: AnimatedImage | null;
  ownedTexture: boolean; resource: VisualResource; faceResources: Map<Id, { resource: VisualResource; texture: Texture }>;
  mask: Graphics | null; cropKey: string; croppedTexture: Texture | null };
export type PreparedStage = { id: Id; sessionId: Id; restoreKey: RestoreKey | null; state: PresentationState;
  voiceBinding: VoicePlaybackBinding | null; resources: Id[] };
type PreparedInternal = { descriptor: PreparedStage; handles: Map<Id, Handle>; transitionHandles: Map<Id, Handle>; weatherTextures: Map<Id, Texture> };
const sameOwner = (a: ExecutionToken | RestoreKey, b: ExecutionToken | RestoreKey) =>
  'sessionId' in a && 'sessionId' in b && a.sessionId === b.sessionId &&
  ('occurrence' in a && 'occurrence' in b ? a.occurrence === b.occurrence && a.statementId === b.statementId :
    'requestId' in a && 'requestId' in b && a.requestId === b.requestId && a.snapshotId === b.snapshotId);
const faceConfig = (value: StageObject['imageFace']) => JSON.stringify(value && {
  mouth: value.mouth, blink: value.blink, combinations: value.combinations,
});

function glitchFilter(seed: number): GlitchFilter {
  const filter = new GlitchFilter({ seed: (seed >>> 0) / 0x100000000 });
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  const sizes = Array.from({ length: filter.slices }, () => .1 + random());
  const total = sizes.reduce((sum, value) => sum + value, 0);
  filter.sizes = new Float32Array(sizes.map(value => value / total));
  filter.offsets = new Float32Array(sizes.map(() => random() * 2 - 1));
  filter.redraw();
  return filter;
}
function filters(values: EffectValues): Filter[] {
  const result: Filter[] = [];
  if (values.rgb.some(value => value !== 255) || [values.brightness, values.contrast, values.saturation, values.gamma].some(value => value !== 1))
    result.push(new AdjustmentFilter({ red: values.rgb[0] / 255, green: values.rgb[1] / 255, blue: values.rgb[2] / 255,
      brightness: values.brightness, contrast: values.contrast, saturation: values.saturation, gamma: values.gamma }));
  if (values.blur > 0) result.push(new BlurFilter({ strength: values.blur }));
  if (values.bloom.intensity > 0) result.push(new AdvancedBloomFilter({ bloomScale: values.bloom.intensity,
    brightness: values.bloom.brightness, blur: values.bloom.blur, threshold: values.bloom.threshold }));
  if (values.circle || values.bevel.opacity > 0 && values.bevel.thickness > 0) result.push(surfaceFilter(values));
  if (values.shockwave) result.push(new SurfaceShockwaveFilter(values.shockwave));
  if (values.filters.oldFilm) result.push(new OldFilmFilter());
  if (values.filters.dot) result.push(new DotFilter());
  if (values.filters.reflection) result.push(new ReflectionFilter());
  if (values.filters.glitch) result.push(glitchFilter(0));
  if (values.filters.rgbSplit) result.push(new RGBSplitFilter());
  if (values.filters.godray) result.push(new GodrayFilter());
  return result;
}
function effectFilter(effect: EffectInstance): Filter | null {
  const seed = (effect.seed >>> 0) / 0x100000000;
  switch (effect.type) {
    case 'oldFilm': return new OldFilmFilter({ seed });
    case 'dot': return new DotFilter();
    case 'reflection': return new ReflectionFilter({ time: effect.elapsedMs / 1000 });
    case 'glitch': return glitchFilter(effect.seed);
    case 'rgbSplit': return new RGBSplitFilter();
    case 'godray': return new GodrayFilter({ time: effect.elapsedMs / 1000 });
    default: return null;
  }
}
function effectFilters(effects: EffectInstance[]): Filter[] {
  return effects.filter(effect => effect.enabled).map(effect => {
    const filter = effectFilter(effect);
    return filter && effect.fade ? new FadedFilter(filter, Math.max(0, 1 - effect.fade.elapsedMs / effect.fade.durationMs)) : filter;
  }).filter((filter): filter is Filter => filter !== null);
}
function updateEffectTimes(filters: readonly Filter[], effects: EffectInstance[]) {
  const active = effects.filter(effect => effect.enabled && effectFilterNames.has(effect.type));
  const tail = filters.slice(-active.length);
  active.forEach((effect, index) => {
    const selected = tail[index], filter = selected instanceof FadedFilter ? selected.inner : selected;
    if (filter instanceof ReflectionFilter || filter instanceof GodrayFilter) filter.time = effect.elapsedMs / 1000;
  });
}
const effectFilterNames = new Set(['oldFilm', 'dot', 'reflection', 'glitch', 'rgbSplit', 'godray']);
const layerOrder = { background: 0, figure: 1, effect: 2, overlay: 3 } as const;

export class StageController {
  private readonly layers: Record<StageObject['layer'], Container> = {
    background: new Container(), figure: new Container(), effect: new Container(), overlay: new Container(),
  };
  private readonly prepared = new Map<Id, PreparedInternal>();
  private readonly retired = new Map<Id, Set<Handle>>();
  private handles = new Map<Id, Handle>();
  private transitionHandles = new Map<Id, Handle>();
  private crossfades = new Map<Id, { texture: RenderTexture; sprite: Sprite; container: Container }>();
  private gridSurfaces = new Map<string, { source: HTMLCanvasElement; canvas: HTMLCanvasElement; texture: Texture }>();
  private state: PresentationState | null = null;
  private sessionId: Id | null = null;
  private owner: ExecutionToken | RestoreKey | null = null;
  private paused = false;
  private visualEffects=true;
  private reducedMotion=false;
  private viewport: Rect;
  private listener: ((completion: AnimationCompletion) => void) | null = null;
  private introToken: ExecutionToken | null = null;
  private introCompleted = false;
  private readonly weather: WeatherLayer;
  private stageFilterKey = '';
  private constructor(private readonly app: Application, private readonly design: { width: number; height: number },
    private readonly resources: StageResourcePort, private readonly providers: readonly StageProvider[]) {
    for (const layer of ['background', 'figure', 'effect', 'overlay'] as const) app.stage.addChild(this.layers[layer]);
    this.weather = new WeatherLayer(design.width, design.height);
    app.stage.addChildAt(this.weather.backContainer, 1);
    this.layers.effect.addChild(this.weather.container);
    this.viewport = { x: 0, y: 0, width: design.width, height: design.height };
  }
  static async create(target: HTMLElement, design: { width: number; height: number; color: string }, resources: StageResourcePort,
    providers: readonly StageProvider[] = []): Promise<StageController> {
    const app = new Application(); const options: Partial<ApplicationOptions> & AccessibilitySystemOptions = { width: design.width, height: design.height, backgroundColor: design.color,
      preference: 'webgl', antialias: true, autoStart: false, useBackBuffer: true,
      // Interactive controls live in the Player DOM. Pixi 8.12's Tab activation leaks listeners across disposal.
      accessibilityOptions: { activateOnTab: false } }; await app.init(options); target.appendChild(app.canvas);
    return new StageController(app, design, resources, providers);
  }
  get canvas(): HTMLCanvasElement { return this.app.canvas; }
  /** Copy a freshly rendered frame before WebGL releases its drawing buffer. */
  captureFrame(): HTMLCanvasElement {
    this.app.render();
    const frame = document.createElement('canvas'); frame.width = this.app.canvas.width; frame.height = this.app.canvas.height;
    frame.getContext('2d')!.drawImage(this.app.canvas, 0, 0);
    return frame;
  }
  /** An isolated surface uses the same animation sampler and filters as stage objects. */
  createSurfaceAnimation(source: HTMLCanvasElement) {
    const texture = Texture.from(source), sprite = new Sprite(texture), container = new Container();
    const target = RenderTexture.create({ width: source.width, height: source.height });
    const base = { id: createId(), current: copy(defaultEffectValues), defaults: copy(defaultEffectValues), processes: [] };
    container.addChild(sprite); let filterKey = '';
    return {
      render: (animation: ExecutableAnimation, timeMs: number): HTMLCanvasElement => {
        const values = sampleObjectAnimation(base, animation, timeMs).current;
        sprite.position.set(values.x, values.y); sprite.scale.set(values.scaleX, values.scaleY);
        sprite.rotation = values.rotationDeg * Math.PI / 180; sprite.alpha = values.opacity; sprite.blendMode = values.blend;
        const key = JSON.stringify({ ...values, x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, z: 0 });
        if (key !== filterKey) { for (const filter of sprite.filters ?? []) filter.destroy(); sprite.filters = filters(values); filterKey = key; }
        this.app.renderer.render({ container, target, clear: true });
        return this.app.renderer.extract.canvas({ target }) as HTMLCanvasElement;
      },
      dispose: () => { for (const filter of sprite.filters ?? []) filter.destroy(); sprite.filters = []; container.destroy({ children: true }); texture.destroy(true); target.destroy(true); },
    };
  }
  objectBounds(id: Id): Rect | null {
    const sprite=this.handles.get(id)?.sprite;if(!sprite?.visible)return null;
    const bounds=sprite.getBounds();return {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};
  }
  /** Reads the existing image/Live2D surface; never creates a second provider instance. */
  drawPortrait(canvas: HTMLCanvasElement, text: PresentationState['text']): boolean {
    const context = canvas.getContext('2d'); if (!context) return false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const object = dialoguePortrait(this.state?.objects ?? [], text);
    if (!object) return false;
    const handle = this.handles.get(object.id); if (!handle) return false;
    const selected = object.imageFace ? imageFaceAsset(object.imageFace) : null;
    const face = selected?.ok ? handle.faceResources.get(selected.value) : null;
    const texture = face?.texture ?? (object.imagePlayback ? handle.animated?.textures[animatedImageFrame(object.imagePlayback)] : null) ?? handle.texture, resource = face?.resource ?? handle.resource;
    const source = handle.instance?.renderSurface() ?? texture.source.resource as CanvasImageSource;
    const rect = portraitSourceRect(object, resource.asset.canvas ?? { width: texture.width, height: texture.height }, texture);
    if (!source || rect.width <= 0 || rect.height <= 0) return false;
    const reference=resource.asset.canvas??{width:texture.width,height:texture.height};
    const width=object.portrait!.crop.width*reference.width, height=object.portrait!.crop.height*reference.height;
    const scale=Math.min(canvas.width/width,canvas.height/height), dw=width*scale, dh=height*scale;
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height,
      (canvas.width-dw)/2+rect.offsetX*dw, (canvas.height-dh)/2+rect.offsetY*dh, rect.scaleX*dw, rect.scaleY*dh);
    return true;
  }
  onCompletion(listener: ((completion: AnimationCompletion) => void) | null) { this.listener = listener; }
  setViewport(viewport: Rect) {
    this.viewport = viewport; const place = canvasPlacement(this.design, viewport);
    this.app.canvas.style.width = `${place.width}px`; this.app.canvas.style.height = `${place.height}px`;
    this.app.canvas.style.left = `${place.x}px`; this.app.canvas.style.top = `${place.y}px`;
  }
  pointer(client: { x: number; y: number }) {
    const place = canvasPlacement(this.design, this.viewport);
    return { x: (client.x - place.x) / place.scale, y: (client.y - place.y) / place.scale };
  }
  private async createHandle(object: StageObject): Promise<Result<Handle>> {
    const resolved = await this.resources.resolve(object.assetId, object.variantId);
    if (!resolved.ok) return resolved;
    const resource = resolved.value;
    if (resource.asset.typeData && resource.providerVersion !== resource.asset.typeData.provider.version)
      return fail('STAGE_PROVIDER_VERSION', `素材需要 ${resource.asset.typeData.provider.id}@${resource.asset.typeData.provider.version}`, ['supplyDependency']);
    let video: HTMLVideoElement | null = null, videoSource: VideoSource | null = null, instance: StageInstance | null = null, animated: AnimatedImage | null = null;
    const cleanup = () => { animated?.dispose(); instance?.dispose(); videoSource?.destroy(); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } };
    try {
      let texture: Texture, ownedTexture = false;
      const provider = this.providers.find(item => (item.resourceProviderKey ?? item.key) === resource.asset.provider || item.resourceProviderAliases?.includes(resource.asset.provider ?? ''));
      if (provider) {
        const created = await provider.create(resource.asset, object.providerState?.state ?? {});
        if (!created.ok) return created;
        instance = created.value; instance.pause(true); texture = Texture.from(instance.renderSurface()); ownedTexture = true;
      } else if (resource.asset.kind === 'live2d' || resource.asset.typeData || resource.asset.kind.includes('/') || object.providerState) return fail('STAGE_PROVIDER_MISSING', `缺少演出提供者 ${resource.asset.provider ?? ''}`, ['supplyDependency']);
      else if (resource.asset.kind === 'video') {
        video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.src = resource.url; video.muted = true; video.loop = true;
        video.preload = 'auto'; await new Promise<void>((resolve, reject) => {
          video!.onloadedmetadata = () => resolve(); video!.onerror = () => reject(new Error(`视频无法装载 ${resource.url}`));
          video!.load();
        });
        videoSource = new VideoSource({ resource: video, autoLoad: false, autoPlay: false });
        // Finish Pixi's asynchronous video initialization before the handle can be retired.
        await videoSource.load();
        texture = new Texture({ source: videoSource }); video.pause(); ownedTexture = true;
      } else if (resource.asset.metadata.imageAnimation) {
        animated = await decodeAnimatedImage(resource.url, resource.asset.metadata.imageAnimation);
        texture = animated.textures[object.imagePlayback ? animatedImageFrame(object.imagePlayback) : 0]!;
      } else texture = await Assets.load<Texture>(resource.url);
      const faceResources = new Map<Id, { resource: VisualResource; texture: Texture }>();
      if (object.imageFace) {
        if (!this.resources.resolveAsset) { cleanup(); return fail('IMAGE_FACE_RESOLVER', '舞台缺少图片口眼资源解析器', ['supplyDependency']); }
        const selected = imageFaceAsset(object.imageFace); if (!selected.ok) { cleanup(); return selected; }
        for (const assetId of imageFaceAssets(object.imageFace)) {
          const found = await this.resources.resolveAsset(assetId); if (!found.ok) { cleanup(); return found; }
          if (found.value.asset.kind !== 'image') { cleanup(); return fail('IMAGE_FACE_RESOURCE_KIND', `口眼资源 ${assetId} 不是图片`); }
          faceResources.set(assetId, { resource: found.value, texture: await Assets.load<Texture>(found.value.url) });
        }
        if (!faceResources.has(selected.value)) { cleanup(); return fail('IMAGE_FACE_RESOURCE', `口眼资源 ${selected.value} 未准备`); }
      }
      return ok({ object: copy(object), sprite: new Sprite(texture), texture, instance, video, animated, ownedTexture, resource, faceResources,
        filterKey: '', mask: null, cropKey: '', croppedTexture: null });
    } catch (error) {
      cleanup();
      return fail('STAGE_RESOURCE', String(error), ['locate']);
    }
  }
  async prepareStage(sessionId: Id, state: PresentationState, restoreKey: RestoreKey | null = null,
    voiceBinding: VoicePlaybackBinding | null = null, providerCommands: NonNullable<import('@galcraft/contracts').PresentationDelta['providerCommands']> = []): Promise<Result<PreparedStage>> {
    if (state.voice && (!voiceBinding || voiceBinding.token.sessionId !== sessionId ||
      voiceBinding.token.statementId !== state.voice.statementId ||
      voiceBinding.resolution.selected?.assetId !== state.voice.assetId ||
      voiceBinding.resolution.selected.variantId !== state.voice.variantId))
      return fail('VOICE_BINDING', '舞台准备的配音解析与当前声音不一致');
    const weatherTextures = new Map<Id, Texture>();
    for (const effect of state.effects.filter(effect => effect.enabled && isWeatherEffect(effect) && effect.resourceId)) {
      if (!this.resources.resolveAsset) return fail('WEATHER_RESOLVER', '粒子纹理缺少素材解析器');
      const resource = await this.resources.resolveAsset(effect.resourceId!); if (!resource.ok) return resource;
      if (resource.value.asset.kind !== 'image') return fail('WEATHER_IMAGE', '粒子纹理需要图片素材');
      try { weatherTextures.set(effect.resourceId!, await Assets.load<Texture>(resource.value.url)); }
      catch (error) { return fail('WEATHER_TEXTURE', String(error), ['locate']); }
    }
    const handles = new Map<Id, Handle>();
    if (providerCommands.some(command => !state.objects.some(object => object.id === command.objectId))) return fail('STAGE_PROVIDER_OBJECT', '提供者命令指向不可用对象');
    for (const object of state.objects) {
      const current = this.handles.get(object.id);
      const commands = providerCommands.filter(command => command.objectId === object.id);
      if (current && !(restoreKey && current.video) && current.object.assetId === object.assetId && current.object.variantId === object.variantId &&
        JSON.stringify(current.object.providerState ?? null) === JSON.stringify(object.providerState ?? null) &&
        faceConfig(current.object.imageFace) === faceConfig(object.imageFace) && !commands.length) {
        handles.set(object.id, current); continue;
      }
      const initial = copy(object);
      if (commands.length && this.sessionId === sessionId && current?.instance && current.object.assetId === object.assetId && current.object.variantId === object.variantId) {
        const captured = current.instance.capture(); if (!captured.ok) { this.releasePrepared(handles); return captured; }
        const checked = JsonSchema.safeParse(captured.value); if (!checked.success) { this.releasePrepared(handles); return fail('STAGE_PROVIDER_STATE', checked.error.message); }
        initial.providerState = { provider: current.resource.asset.provider ?? '', version: current.resource.providerVersion ?? '0.1.0', state: checked.data };
      }
      const created = await this.createHandle(initial);
      if (!created.ok) { this.releasePrepared(handles); return created; }
      handles.set(object.id, created.value);
      if (commands.length) {
        const instance = created.value.instance;
        if (!instance) { this.releasePrepared(handles); return fail('STAGE_PROVIDER_MISSING', '对象没有可接受命令的演出提供者'); }
        try {
          for (const command of commands) { const applied = instance.set(copy(command.command)); if (!applied.ok) { this.releasePrepared(handles); return applied; } }
          const captured = instance.capture(); if (!captured.ok) { this.releasePrepared(handles); return captured; }
          const checked = JsonSchema.safeParse(captured.value); if (!checked.success) { this.releasePrepared(handles); return fail('STAGE_PROVIDER_STATE', checked.error.message); }
          created.value.object.providerState = { provider: created.value.resource.asset.provider ?? '', version: created.value.resource.providerVersion ?? '0.1.0', state: checked.data };
        } catch (error) { this.releasePrepared(handles); return fail('STAGE_PROVIDER_COMMAND', String(error)); }
      }
    }
    const transitionHandles = new Map<Id, Handle>();
    for (const process of state.transitions) {
      if (!process.from) continue;
      const current = this.handles.get(process.objectId);
      if (current && !(restoreKey && current.video) && current.object.assetId === process.from.assetId && current.object.variantId === process.from.variantId &&
        handles.get(process.objectId) !== current) { transitionHandles.set(process.id, current); continue; }
      const created = await this.createHandle(process.from);
      if (!created.ok) { this.releasePrepared(handles); this.releasePrepared(transitionHandles); return created; }
      transitionHandles.set(process.id, created.value);
    }
    const preparedState = copy(state);
    for (const object of preparedState.objects) {
      const handle = handles.get(object.id)!;
      if (providerCommands.some(command => command.objectId === object.id)) object.providerState = copy(handle.object.providerState);
      if (handle.instance && !object.providerState) object.providerState = {
        provider: handle.resource.asset.provider ?? '', version: handle.resource.providerVersion ?? '0.1.0', state: {},
      };
    }
    const descriptor: PreparedStage = { id: createId(), sessionId, restoreKey, state: preparedState,
      voiceBinding: voiceBinding ? copy(voiceBinding) : null,
      resources: [...new Set([...state.objects.map(item => item.assetId), ...state.objects.flatMap(item => item.imageFace ? imageFaceAssets(item.imageFace) : []),
        ...state.transitions.flatMap(item => item.from ? [item.from.assetId] : []), ...weatherTextures.keys()])] };
    this.prepared.set(descriptor.id, { descriptor, handles, transitionHandles, weatherTextures });
    return ok(descriptor);
  }
  commitStage(preparedId: Id, owner: ExecutionToken | RestoreKey): Result<void> {
    const prepared = this.prepared.get(preparedId); if (!prepared) return fail('STAGE_PREPARED_MISSING', '舞台准备句柄已失效');
    if (prepared.descriptor.restoreKey && !sameOwner(prepared.descriptor.restoreKey, owner)) return fail('RESTORE_KEY', '舞台恢复身份不匹配');
    if (!prepared.descriptor.restoreKey && 'requestId' in owner) return fail('STAGE_OWNER', '普通演出需要指令令牌');
    const previous = this.handles, previousTransitions = this.transitionHandles;
    const previousIntro = this.state?.intro, completedIntro = this.introCompleted;
    this.handles = prepared.handles; this.transitionHandles = prepared.transitionHandles;
    this.state = copy(prepared.descriptor.state); this.sessionId = prepared.descriptor.sessionId; this.owner = owner;
    this.introToken = 'occurrence' in owner ? owner : null;
    this.introCompleted = Boolean(completedIntro && previousIntro && this.state.intro &&
      JSON.stringify(previousIntro) === JSON.stringify(this.state.intro));
    if ('requestId' in owner && this.state.intro?.keepFinal) this.introCompleted = true;
    this.prepared.delete(preparedId);
    const active = new Set([...this.handles.values(), ...this.transitionHandles.values()]);
    const replaced = new Set([...previous.values(), ...previousTransitions.values()].filter(handle => !active.has(handle)));
    if ('requestId' in owner) this.retired.set(owner.requestId, replaced);
    else for (const handle of replaced) this.release(handle);
    for (const handle of active) this.clearMask(handle);
    for (const layer of Object.values(this.layers)) layer.removeChildren();
    this.layers.effect.addChild(this.weather.container); this.weather.sync(this.state.effects, prepared.weatherTextures);
    this.redraw();
    for (const handle of active) { handle.instance?.pause(this.paused);
      if (handle.video && !this.paused) void handle.video.play().catch(() => {}); }
    return ok(undefined);
  }
  discardPrepared(preparedId: Id) { const value = this.prepared.get(preparedId); if (!value) return;
    this.releasePrepared(value.handles); this.releasePrepared(value.transitionHandles); this.prepared.delete(preparedId); }
  disposeRetiredStage(requestId: Id) {
    const retired = this.retired.get(requestId); if (!retired) return;
    const active = new Set([...this.handles.values(), ...this.transitionHandles.values()]);
    for (const handle of retired) if (!active.has(handle)) this.release(handle);
    this.retired.delete(requestId);
  }
  private releasePrepared(handles: Map<Id, Handle>) { const active = new Set([...this.handles.values(), ...this.transitionHandles.values()]);
    for (const handle of handles.values()) if (!active.has(handle)) this.release(handle); }
  private clearMask(handle: Handle) { handle.sprite.mask = null; handle.mask?.destroy(); handle.mask = null; }
  private release(handle: Handle) { this.clearMask(handle); handle.sprite.removeFromParent();
    for (const filter of handle.sprite.filters ?? []) filter.destroy();
    handle.sprite.filters = []; handle.sprite.destroy();
    handle.croppedTexture?.destroy(false); handle.instance?.dispose();
    handle.animated?.dispose();
    if (handle.ownedTexture) handle.texture.destroy(true);
    if (handle.video) { handle.video.pause(); handle.video.removeAttribute('src'); handle.video.load(); } }
  private drawObject(object: StageObject, handle: Handle) {
    handle.object = copy(object); const sprite = handle.sprite;
    const faceId = object.imageFace ? imageFaceAsset(object.imageFace) : null;
    if (faceId && !faceId.ok) throw new Error(faceId.error.message);
    const face = faceId?.ok ? handle.faceResources.get(faceId.value) : null;
    if (faceId?.ok && !face) throw new Error(`口眼资源 ${faceId.value} 未准备`);
    const renderTexture = face?.texture ?? (object.imagePlayback ? handle.animated?.textures[animatedImageFrame(object.imagePlayback)] : null) ?? handle.texture;
    const renderResource = face?.resource ?? handle.resource;
    if (sprite.parent !== this.layers[object.layer]) this.layers[object.layer].addChild(sprite);
    const values = object.current;
    sprite.alpha = values.opacity; sprite.rotation = values.rotationDeg * Math.PI / 180;
    sprite.blendMode = values.blend;
    const objectEffects = (this.visualEffects?this.state!.effects:[]).filter(effect => effect.target !== 'stage' && effect.target.id === object.id && effect.enabled && effectFilterNames.has(effect.type));
    const filterKey = JSON.stringify({ enabled:this.visualEffects, values: { ...values, x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, z: 0 },
      effects: objectEffects.map(({ id, type, parameters, seed, fade }) => ({ id, type, parameters, seed, fade })) });
    if (filterKey !== handle.filterKey) { for (const filter of sprite.filters ?? []) filter.destroy();
      sprite.filters = this.visualEffects ? [...filters(values), ...effectFilters(objectEffects)] : []; handle.filterKey = filterKey; }
    updateEffectTimes(sprite.filters ?? [], objectEffects);
    const source = renderResource.asset.canvas;
    if (object.layer === 'background') {
      sprite.texture = renderTexture;
      sprite.visible = true;
      const geometry = backgroundGeometry({ width: handle.resource.asset.metadata.width ?? sprite.texture.width,
        height: handle.resource.asset.metadata.height ?? sprite.texture.height }, this.design, object.backgroundFrame ?? { fit: 'cover', positionX: 0.5, positionY: 0.5 });
      sprite.anchor.set(0, 0); sprite.position.set(geometry.draw.x + values.x, geometry.draw.y + values.y);
      sprite.scale.set(geometry.scale * values.scaleX, geometry.scale * values.scaleY);
    } else {
      const offsetX = source?.offsetX ?? 0, offsetY = source?.offsetY ?? 0;
      const sourceWidth = source?.width ?? renderTexture.width, sourceHeight = source?.height ?? renderTexture.height;
      const illustration = object.purpose === 'illustration' ? illustrationGeometry({ width: sourceWidth, height: sourceHeight }, this.design,
        object.illustrationFrame ?? { widthRatio: .5, heightRatio: .5, fit: 'contain' }) : null;
      const crop = illustration?.crop ?? object.framing.crop;
      const left = crop ? Math.max(crop.x, offsetX) : offsetX;
      const top = crop ? Math.max(crop.y, offsetY) : offsetY;
      const right = crop ? Math.min(crop.x + crop.width, offsetX + renderTexture.width) : offsetX + renderTexture.width;
      const bottom = crop ? Math.min(crop.y + crop.height, offsetY + renderTexture.height) : offsetY + renderTexture.height;
      sprite.visible = right > left && bottom > top;
      const cropKey = `${faceId?.ok ? faceId.value : object.assetId}:${object.imagePlayback ? animatedImageFrame(object.imagePlayback) : ''}:${sprite.visible && crop ? `${left}:${top}:${right}:${bottom}` : ''}`;
      if (cropKey !== handle.cropKey) {
        handle.croppedTexture?.destroy(false); handle.croppedTexture = sprite.visible && crop ? new Texture({ source: renderTexture.source,
          frame: new Rectangle(left - offsetX, top - offsetY, right - left, bottom - top) }) : null;
        sprite.texture = handle.croppedTexture ?? renderTexture; handle.cropKey = cropKey;
      }
      sprite.texture = handle.croppedTexture ?? renderTexture;
      const placement = illustration ? { x: 0, y: 0, scaleX: illustration.scale * values.scaleX, scaleY: illustration.scale * values.scaleY } : portraitPlacement({ station: object.station, design: this.design,
        source: { width: sourceWidth, height: sourceHeight, offsetX: left, offsetY: top }, anchor: renderResource.anchor,
        framing: object.framing, transform: values });
      const anchorX = (illustration ? .5 : renderResource.anchor.x) * sourceWidth - left;
      const anchorY = (illustration ? .5 : renderResource.anchor.y) * sourceHeight - top;
      sprite.anchor.set(anchorX / sprite.texture.width, anchorY / sprite.texture.height);
      sprite.position.set(illustration ? this.design.width / 2 + values.x : placement.x + anchorX * placement.scaleX,
        illustration ? this.design.height / 2 + values.y : placement.y + anchorY * placement.scaleY);
      sprite.scale.set(placement.scaleX, placement.scaleY);
    }
  }
  private drawTransition(handle: Handle, process: PresentationState['transitions'][number], entering: boolean) {
    if (process.spec.preset === 'custom' && process.custom && (entering || !process.to)) {
      const base = entering ? process.to : process.from;
      if (base) {
        const duration = Array.isArray(process.custom) ? process.custom.reduce((sum, segment) => sum + segment.durationMs, 0) : process.custom.durationMs;
        const current = entering ? this.state?.objects.find(object => object.id === process.objectId) ?? base : base;
        const progress = Math.max(0, Math.min(1, ease(transitionProgress(process), process.spec.easing.family, process.spec.easing.direction)));
        const animated = sampleObjectAnimation(base, process.custom, progress * duration, current);
        animated.imagePlayback = handle.object.imagePlayback;
        this.drawObject(animated, handle);
      }
      return;
    }
    const sprite = handle.sprite;
    if (process.spec.preset === 'gridFlip' || process.spec.preset === 'diagonalReveal') {
      const key = `${process.id}/${entering}`, frame = sprite.texture.frame;
      let surface = this.gridSurfaces.get(key);
      if (!surface) {
        const source = document.createElement('canvas'), canvas = document.createElement('canvas');
        source.width = canvas.width = frame.width; source.height = canvas.height = frame.height;
        surface = { source, canvas, texture: Texture.from(canvas) }; this.gridSurfaces.set(key, surface);
      }
      const source = handle.instance?.renderSurface() ?? sprite.texture.source.resource as CanvasImageSource;
      const context = surface.source.getContext('2d')!, painted = surface.canvas.getContext('2d')!;
      context.clearRect(0,0,surface.source.width,surface.source.height);
      context.drawImage(source,frame.x,frame.y,frame.width,frame.height,0,0,surface.source.width,surface.source.height);
      painted.clearRect(0,0,surface.canvas.width,surface.canvas.height);
      paintGridTransition(painted,surface.source,surface.canvas,process.spec,transitionProgress(process),entering);
      surface.texture.source.update(); sprite.texture = surface.texture;
      return;
    }
    const raw = transitionProgress(process);
    const progress = Math.max(0, Math.min(1, ease(raw, process.spec.easing.family, process.spec.easing.direction)));
    const amount = entering ? progress : 1 - progress;
    if (process.spec.preset === 'fade') sprite.alpha *= amount;
    if (process.spec.preset === 'slide') {
      const distance = process.spec.direction === 'left' || process.spec.direction === 'right' ? this.design.width : this.design.height;
      const sign = process.spec.direction === 'left' || process.spec.direction === 'up' ? -1 : 1;
      const displacement = entering ? sign * distance * (1 - progress) : sign * distance * progress;
      if (process.spec.direction === 'left' || process.spec.direction === 'right') sprite.x += displacement;
      else sprite.y += displacement;
    }
    if ((process.spec.preset === 'wipe' || process.spec.preset === 'dissolve' || process.spec.preset === 'blinds') && (entering || !process.to)) {
      if (!handle.mask) { handle.mask = new Graphics(); this.layers[handle.object.layer].addChild(handle.mask); sprite.mask = handle.mask; }
      const width = this.design.width, height = this.design.height;
      handle.mask.clear();
      if (process.spec.preset === 'wipe') {
        const horizontal = process.spec.direction === 'left' || process.spec.direction === 'right';
        const visible = amount * (horizontal ? width : height);
        const x = process.spec.direction === 'left' ? width - visible : 0;
        const y = process.spec.direction === 'up' ? height - visible : 0;
        handle.mask.rect(x, y, horizontal ? visible : width, horizontal ? height : visible);
      } else if (process.spec.preset === 'blinds') {
        const horizontal = process.spec.direction === 'left' || process.spec.direction === 'right';
        const strips = 12, span = (horizontal ? width : height) / strips, visible = span * amount;
        const reverse = process.spec.direction === 'left' || process.spec.direction === 'up';
        for (let index = 0; index < strips; index++) {
          const offset = index * span + (reverse ? span - visible : 0);
          handle.mask.rect(horizontal ? offset : 0, horizontal ? 0 : offset,
            horizontal ? visible : width, horizontal ? height : visible);
        }
      } else {
        const columns = 64, rows = 36, cellWidth = width / columns, cellHeight = height / rows;
        for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
          let hash = (process.seed | 0) ^ Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663);
          hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
          const selected = ((hash ^ (hash >>> 13)) >>> 0) / 0x100000000 <= progress;
          if (selected === entering) handle.mask.rect(x * cellWidth, y * cellHeight, cellWidth + 0.5, cellHeight + 0.5);
        }
      }
      handle.mask.fill(0xffffff);
    }
  }
  setVisualPreferences(effects:boolean,reduced:boolean){if(effects===this.visualEffects&&reduced===this.reducedMotion)return;this.visualEffects=effects;this.reducedMotion=reduced;this.weather.container.visible=effects;this.weather.backContainer.visible=effects;if(this.state)this.redraw();}
  private redraw() {
    if (!this.state) return;
    const camera = this.state.camera?.current;
    this.app.stage.pivot.set(this.design.width / 2, this.design.height / 2);
    this.app.stage.position.set(this.design.width / 2 + (camera?.x ?? 0), this.design.height / 2 + (camera?.y ?? 0));
    this.app.stage.scale.set(camera?.scaleX ?? 1, camera?.scaleY ?? 1);
    this.app.stage.rotation = (camera?.rotationDeg ?? 0) * Math.PI / 180;
    this.app.stage.alpha = camera?.opacity ?? 1;
    const stageEffects = (this.visualEffects?this.state.effects:[]).filter(effect => effect.target === 'stage' && effect.enabled && effectFilterNames.has(effect.type));
    const stageKey = JSON.stringify([camera, stageEffects.map(({ id, type, parameters, seed, fade }) => ({ id, type, parameters, seed, fade }))]);
    if (stageKey !== this.stageFilterKey) {
      for (const filter of this.app.stage.filters ?? []) filter.destroy();
      this.app.stage.filters = [...(camera && this.visualEffects ? filters(camera) : []), ...effectFilters(stageEffects)]; this.stageFilterKey = stageKey;
    }
    updateEffectTimes(this.app.stage.filters ?? [], stageEffects);
    const surfaces: { object: StageObject; sprite: Sprite }[] = [];
    for (const process of this.state.transitions) if (process.from) {
      const handle = this.transitionHandles.get(process.id); if (!handle) continue;
      this.drawObject(process.from, handle); this.drawTransition(handle, process, false);
      handle.sprite.visible &&= stageObjectVisible(process.from, this.state.text.reading);
      surfaces.push({ object: handle.object, sprite: handle.sprite });
    }
    for (const object of this.state.objects) {
      const handle = this.handles.get(object.id); if (!handle) continue;
      this.drawObject(object, handle);
      const transition = this.state.transitions.find(process => process.objectId === object.id && process.to);
      if (transition) this.drawTransition(handle, transition, true);
      handle.sprite.visible &&= stageObjectVisible(object, this.state.text.reading);
      surfaces.push({ object: handle.object, sprite: handle.sprite });
    }
    // Accumulate the weighted premultiplied images into one transparent surface before
    // compositing onto the stage. Two source-over sprites would leak the background.
    const mixing = new Set<Id>();
    for (const process of this.state.transitions) {
      if (process.spec.preset !== 'fade' || process.kind !== 'replace' || !process.from || !process.to) continue;
      const from = this.transitionHandles.get(process.id), to = this.handles.get(process.objectId);
      if (!from || !to) continue;
      mixing.add(process.id);
      let mix = this.crossfades.get(process.id);
      if (!mix) { const texture = RenderTexture.create({ width: this.design.width, height: this.design.height });
        mix = { texture, sprite: new Sprite(texture), container: new Container() }; this.crossfades.set(process.id, mix); }
      const layer = this.layers[to.object.layer];
      const fromBlend = from.sprite.blendMode, toBlend = to.sprite.blendMode;
      const fromVisible = from.sprite.visible, toVisible = to.sprite.visible;
      mix.container.addChild(from.sprite, to.sprite); from.sprite.blendMode = 'add'; to.sprite.blendMode = 'add';
      this.app.renderer.render({ container: mix.container, target: mix.texture, clear: true });
      this.layers[from.object.layer].addChild(from.sprite); layer.addChild(to.sprite);
      from.sprite.blendMode = fromBlend; to.sprite.blendMode = toBlend;
      from.sprite.visible = false; to.sprite.visible = false;
      layer.addChild(mix.sprite);
      mix.sprite.visible = fromVisible || toVisible;
      surfaces.push({ object: to.object, sprite: mix.sprite });
    }
    for (const [id, mix] of this.crossfades) if (!mixing.has(id)) {
      mix.sprite.destroy(); mix.texture.destroy(true); mix.container.destroy(); this.crossfades.delete(id);
    }
    surfaces.sort((a, b) => layerOrder[a.object.layer] - layerOrder[b.object.layer] ||
      a.object.current.z - b.object.current.z || a.object.entranceOrder - b.object.entranceOrder);
    const orderedSprites = new Map<StageObject['layer'], Sprite[]>();
    for (const { object, sprite } of surfaces) {
      const sprites = orderedSprites.get(object.layer) ?? [];
      sprites.push(sprite); orderedSprites.set(object.layer, sprites);
    }
    for (const [key, sprites] of orderedSprites) {
      const layer = this.layers[key], offset = layer.children.length - sprites.length;
      for (const [index, sprite] of sprites.entries())
        if (layer.children[offset + index] !== sprite) layer.setChildIndex(sprite, offset + index);
    }
    for (const effect of this.state.effects.filter(isWeatherEffect)) {
      if (effect.target === 'stage') { this.weather.target(effect.id, null); continue; }
      const handle = this.handles.get(effect.target.id);
      if (!handle) { this.weather.target(effect.id, null, false); continue; }
      const bounds = handle.sprite.getBounds(), topLeft = this.app.stage.toLocal({ x: bounds.x, y: bounds.y }),
        bottomRight = this.app.stage.toLocal({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
      this.weather.target(effect.id, { x: Math.min(topLeft.x, bottomRight.x), y: Math.min(topLeft.y, bottomRight.y),
        width: Math.abs(bottomRight.x - topLeft.x), height: Math.abs(bottomRight.y - topLeft.y) }, handle.sprite.visible);
    }
    this.app.render();
    for (const [key, surface] of this.gridSurfaces) if (!this.state.transitions.some(process => key.startsWith(`${process.id}/`))) {
      surface.texture.destroy(true); this.gridSurfaces.delete(key);
    }
  }
  tick(deltaMs: number, voiceLevel = 0, pcm?: VoicePCM | null) {
    if (!this.state || this.paused) return;
    const reduced = !this.visualEffects || this.reducedMotion;
    const visualDelta = reduced ? Math.max(deltaMs,
      ...this.state.transitions.map(process => process.spec.durationMs - process.elapsedMs),
      ...this.state.effects.map(effect => effect.fade ? effect.fade.durationMs - effect.fade.elapsedMs : 0)) : deltaMs;
    // A loop has no terminal frame: freeze its cursor while retaining its authored stop/restore identity.
    // A zero-time tick still releases instances whose fields have all been taken over.
    const advanced = advanceAnimations(this.state, reduced ? 0 : deltaMs);
    if (reduced) {
      const finished = finishAnimations(advanced.state, undefined, { includeLoops: false });
      advanced.state = finished.state; advanced.completions.push(...finished.completions);
    }
    this.state = advanced.state;
    this.state = advancePresentationTime(this.state, deltaMs, { finish: reduced });
    const transitions = advanceTransitions(this.state, visualDelta); this.state = transitions.state;
    const imageCompletions: AnimationCompletion[] = [];
    for (const object of this.state.objects) if (object.imagePlayback) {
      const advanced = advanceImagePlayback(object.imagePlayback, deltaMs); object.imagePlayback = advanced.playback;
      if (advanced.completed && advanced.playback.owner) imageCompletions.push({ token: advanced.playback.owner, processId: object.id, outcome: 'completed' });
    }
    for (const process of this.state.transitions) if (process.from?.imagePlayback)
      process.from.imagePlayback = advanceImagePlayback(process.from.imagePlayback, deltaMs).playback;
    if (this.state.intro && !this.introCompleted) this.progressIntro(deltaMs);
    this.state.objects = this.state.objects.map(object => object.imageFace ? { ...object,
      imageFace: advanceImageFace(object.imageFace, deltaMs, voiceLevel, this.state?.voice?.targetObjectId === object.id) } : object);
    for (const finished of transitions.finished) {
      const from = this.transitionHandles.get(finished.id);
      if (from) { this.transitionHandles.delete(finished.id); if (![...this.handles.values(), ...this.transitionHandles.values()].includes(from)) this.release(from); }
      const to = this.handles.get(finished.objectId); if (to) this.clearMask(to);
    }
    this.state.effects = this.state.effects.map(effect => ({ ...effect, elapsedMs: effect.elapsedMs + deltaMs,
      ...(effect.fade ? { fade: { ...effect.fade, elapsedMs: Math.min(effect.fade.durationMs, effect.fade.elapsedMs + visualDelta) } } : {}) }))
      .filter(effect => !effect.fade || effect.fade.elapsedMs < effect.fade.durationMs);
    this.weather.sync(this.state.effects);
    const targetHandle = this.state.voice?.targetObjectId ? this.handles.get(this.state.voice.targetObjectId) : null;
    for (const handle of new Set([...this.handles.values(), ...this.transitionHandles.values()])) if (handle.instance) {
      handle.instance.update(deltaMs, handle === targetHandle ? voiceLevel : 0, handle === targetHandle ? pcm : null); handle.texture.source.update();
    } else if (handle.video) handle.texture.source.update();
    this.redraw(); for (const completion of [...advanced.completions, ...imageCompletions]) this.listener?.(completion);
  }
  bindIntroToken(token: ExecutionToken) {
    if (this.state?.intro && token.sessionId === this.sessionId) {
      this.introToken = token; this.introCompleted = false;
    }
  }
  advanceIntro() {
    if (!this.state?.intro || !this.state.intro.manual || this.introCompleted) return false;
    this.progressIntro(0, true); this.redraw(); return true;
  }
  private progressIntro(deltaMs: number, manualAdvance = false) {
    if (!this.state?.intro) return;
    const result = advanceIntro(this.state.intro, deltaMs, manualAdvance);
    this.state.intro = result.state;
    if (result.completed) {
      this.introCompleted = true;
      if (this.introToken) this.listener?.({ token: this.introToken, processId: createId(), outcome: 'completed' });
    }
  }
  pause(paused: boolean) { this.paused = paused; for (const handle of new Set([...this.handles.values(), ...this.transitionHandles.values()])) {
    handle.instance?.pause(paused); if (handle.video) { if (paused) handle.video.pause(); else void handle.video.play().catch(() => {}); }
  } }
  capture(): Result<PresentationState> {
    if (!this.state) return fail('STAGE_SESSION_MISSING', '舞台没有活动会话');
    const state = copy(this.state);
    const weather = new Map(this.weather.capture().map(effect => [effect.id, effect]));
    state.effects = state.effects.map(effect => weather.get(effect.id) ?? effect);
    for (const object of state.objects) {
      const instance = this.handles.get(object.id)?.instance; if (!instance) continue;
      const captured = instance.capture(); if (!captured.ok) return captured;
      if (!object.providerState) return fail('STAGE_PROVIDER_STATE', '模型对象缺少提供者版本');
      object.providerState.state = captured.value;
      const handle = this.handles.get(object.id); if (handle?.object.providerState) handle.object.providerState.state = copy(captured.value);
    }
    for (const process of state.transitions) if (process.from) {
      const instance = this.transitionHandles.get(process.id)?.instance; if (!instance || !process.from.providerState) continue;
      const captured = instance.capture(); if (!captured.ok) return captured;
      process.from.providerState.state = captured.value;
    }
    return ok(state);
  }
  dispose() {
    for (const surface of this.gridSurfaces.values()) surface.texture.destroy(true); this.gridSurfaces.clear();
    for (const mix of this.crossfades.values()) { mix.sprite.destroy(); mix.texture.destroy(true); mix.container.destroy(); } this.crossfades.clear();
    this.listener = null; for (const id of [...this.prepared.keys()]) this.discardPrepared(id);
    for (const id of [...this.retired.keys()]) this.disposeRetiredStage(id);
    for (const handle of new Set([...this.handles.values(), ...this.transitionHandles.values()])) this.release(handle);
    for (const filter of this.app.stage.filters ?? []) filter.destroy();
    this.app.stage.filters = [];
    this.handles.clear(); this.transitionHandles.clear(); this.weather.dispose(); this.state = null; this.sessionId = null;
    this.owner = null; this.introToken = null; this.app.destroy(true);
  }
}
