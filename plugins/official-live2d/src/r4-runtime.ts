import type { Json, ResolvedAsset, Result } from '@galcraft/contracts';
import type { VoicePCM } from '@galcraft/plugins/contracts';
import type { CubismModelPort, CubismOptions, CubismRuntime, Motion } from './model.js';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const fail = <T>(code: string, message: string): Result<T> => {
  const issue = { code, message, severity: 'error' as const, owner: 'M06' as const, related: [], actions: ['supplyDependency' as const] };
  return { ok: false, error: issue, issues: [issue] };
};
const path = (base: string, name: string) => [base, name].filter(Boolean).join('/').replace(/\/+/g, '/');
type Constructor = new (...args: any[]) => any;

/** Bindings come from the installed R4 Framework; Core is loaded before construction. */
export type R4Bindings = {
  acquire?(): void; release?(): void;
  coreVersion(): number;
  CubismFramework: { startUp(): boolean; initialize(): void; isInitialized?(): boolean; dispose?(): void; getIdManager(): { getId(id: string): any } };
  CubismUserModel: Constructor; CubismModelSettingJson: Constructor; CubismMatrix44: Constructor;
  csmVector: Constructor; CubismEyeBlink: { create(setting: any): any };
  CubismBreath: { create(): any }; BreathParameterData: Constructor;
  CubismMotionSync?: { startUp(option: any): boolean; initialize(): void; create(model: any, bytes: ArrayBuffer, size: number, samplesPerSec: number): any };
};
export type R4ResourceReader = {
  text(resource: ResolvedAsset, path: string): Promise<string>;
  bytes(resource: ResolvedAsset, path: string): Promise<ArrayBuffer>;
};
export type R4RuntimeOptions = {
  bindings: R4Bindings; reader: R4ResourceReader; coreVersion: string;
  motionSyncCoreVersion: string | null;
};

class R4Model implements CubismModelPort {
  readonly canvas: HTMLCanvasElement;
  readonly parameterRanges: CubismModelPort['parameterRanges'] = {};
  readonly partIds: string[] = [];
  readonly motions: Motion[];
  readonly expressions: string[];
  get motionSync() { return !!this.sync; }
  private readonly context: CanvasRenderingContext2D;
  private readonly model: any;
  private sync: any = null;
  private syncSamples: number[] = [];
  private syncSource: string | null = null;
  private readonly textures: WebGLTexture[] = [];
  private readonly motionObjects = new Map<string, any>();
  private readonly expressionObjects = new Map<string, any>();
  private readonly ids: { getId(id: string): any };
  private paused = true;
  private initialized = false;
  private disposed = false;
  private constructor(private readonly owner: R4Runtime, private readonly user: any,
    private readonly setting: any, private readonly gl: WebGLRenderingContext,
    private readonly surface: HTMLCanvasElement, bindings: R4Bindings, motions: Motion[], expressions: string[]) {
    this.canvas = document.createElement('canvas'); this.canvas.width = surface.width; this.canvas.height = surface.height;
    const context = this.canvas.getContext('2d'); if (!context) throw new Error('Live2D 画布缺少 2D 上下文');
    this.context = context; this.model = user._model; this.ids = bindings.CubismFramework.getIdManager();
    this.motions = motions; this.expressions = expressions;
    for (let index = 0; index < this.model.getParameterCount(); index++) {
      const id = this.model.getParameterId(index).getString().s;
      this.parameterRanges[id] = { min: this.model.getParameterMinimumValue(index), max: this.model.getParameterMaximumValue(index),
        default: this.model.getParameterDefaultValue(index) };
    }
    for (let index = 0; index < this.model.getPartCount(); index++) this.partIds.push(this.model.getPartId(index).getString().s);
    if (setting.getEyeBlinkParameterCount() > 0) {
      user._eyeBlink = bindings.CubismEyeBlink.create(setting);
    }
    user._breath = bindings.CubismBreath.create();
    const breath = [
      ['ParamAngleX', 0, 15, 6.5345, 0.5], ['ParamAngleY', 0, 8, 3.5345, 0.5],
      ['ParamAngleZ', 0, 10, 5.5345, 0.5], ['ParamBodyAngleX', 0, 4, 15.5345, 0.5],
      ['ParamBreath', 0.5, 0.5, 3.2345, 1],
    ];
    const parameters = new bindings.csmVector();
    for (const [id, ...values] of breath) parameters.pushBack(new bindings.BreathParameterData(this.ids.getId(String(id)), ...values));
    user._breath.setParameters(parameters);
  }
  static async open(owner: R4Runtime, resource: ResolvedAsset): Promise<R4Model> {
    const { bindings, reader } = owner.options;
    const root = resource.entry.includes('/') ? resource.entry.slice(0, resource.entry.lastIndexOf('/')) : '';
    const text = await reader.text(resource, resource.entry);
    const bytes = new TextEncoder().encode(text);
    const setting = new bindings.CubismModelSettingJson(bytes.buffer, bytes.byteLength);
    const user = new bindings.CubismUserModel();
    const mocName = setting.getModelFileName();
    try {
      if (!mocName) throw new Error('model3.json 缺少 Moc');
      user.loadModel(await reader.bytes(resource, path(root, mocName)));
      if (!user._model) throw new Error(`无法装载 ${mocName}`);
    } catch (error) { user.release(); setting.release?.(); throw error; }
    const surface = owner.surface;
    const gl = owner.gl;
    const motions: Motion[] = [], expressions: string[] = [];
    let model: R4Model;
    try { model = new R4Model(owner, user, setting, gl, surface, bindings, motions, expressions); }
    catch (error) { user.release(); setting.release?.(); throw error; }
    try {
      if (setting.getPhysicsFileName()) {
        const data = await reader.bytes(resource, path(root, setting.getPhysicsFileName())); user.loadPhysics(data, data.byteLength);
      }
      if (setting.getPoseFileName()) {
        const data = await reader.bytes(resource, path(root, setting.getPoseFileName())); user.loadPose(data, data.byteLength);
      }
      for (let index = 0; index < setting.getExpressionCount(); index++) {
        const name = setting.getExpressionName(index);
        const data = await reader.bytes(resource, path(root, setting.getExpressionFileName(index)));
        model.expressionObjects.set(name, user.loadExpression(data, data.byteLength, name)); expressions.push(name);
      }
      for (let groupIndex = 0; groupIndex < setting.getMotionGroupCount(); groupIndex++) {
        const group = setting.getMotionGroupName(groupIndex);
        for (let index = 0; index < setting.getMotionCount(group); index++) {
          const file = setting.getMotionFileName(group, index);
          const data = await reader.bytes(resource, path(root, file));
          const motion = user.loadMotion(data, data.byteLength, `${group}_${index}`);
          if (!motion) throw new Error(`动作装载失败 ${group}/${index}`);
          const eyeBlinkIds = new bindings.csmVector(), lipSyncIds = new bindings.csmVector();
          for (let item = 0; item < setting.getEyeBlinkParameterCount(); item++) eyeBlinkIds.pushBack(setting.getEyeBlinkParameterId(item));
          for (let item = 0; item < setting.getLipSyncParameterCount(); item++) lipSyncIds.pushBack(setting.getLipSyncParameterId(item));
          motion.setEffectIds(eyeBlinkIds, lipSyncIds);
          const fadeIn = setting.getMotionFadeInTimeValue(group, index), fadeOut = setting.getMotionFadeOutTimeValue(group, index);
          if (fadeIn >= 0) motion.setFadeInTime(fadeIn);
          if (fadeOut >= 0) motion.setFadeOutTime(fadeOut);
          model.motionObjects.set(`${group}/${index}`, motion);
          const sound = setting.getMotionSoundFileName(group, index);
          motions.push({ group, index, file: path(root, file), sound: sound ? path(root, sound) : null,
            fadeInMs: fadeIn >= 0 ? fadeIn * 1000 : null, fadeOutMs: fadeOut >= 0 ? fadeOut * 1000 : null });
        }
      }
      const motionSyncFile = JSON.parse(text).FileReferences?.MotionSync;
      if (motionSyncFile && owner.motionSyncCoreVersion) {
        if (!bindings.CubismMotionSync) throw new Error('MotionSync Framework 未装载');
        bindings.CubismMotionSync.startUp({ engineConfig: null, logFunction: (message: string) => console.info(message), loggingLevel: 3 }); bindings.CubismMotionSync.initialize();
        const data = await reader.bytes(resource, path(root, motionSyncFile));
        model.sync = bindings.CubismMotionSync.create(user._model, data, data.byteLength, 48000);
        if (!model.sync) throw new Error('MotionSync 模型装载失败');
      }
      user.createRenderer(); const renderer = user.getRenderer(); renderer.startUp(gl);
      for (let index = 0; index < setting.getTextureCount(); index++) {
        const name = setting.getTextureFileName(index); if (!name) continue;
        const bitmap = await createImageBitmap(new Blob([await reader.bytes(resource, path(root, name))]));
        const texture = gl.createTexture(); if (!texture) { bitmap.close(); throw new Error(`纹理创建失败 ${name}`); }
        gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap); bitmap.close();
        renderer.bindTexture(index, texture); model.textures.push(texture);
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
      model.initialized = true; model.draw(); return model;
    } catch (error) { model.dispose(); throw error; }
  }
  setParameter(id: string, value: number) { this.model.setParameterValueById(this.ids.getId(id), value); this.model.saveParameters(); }
  setPartOpacity(id: string, value: number) { this.model.setPartOpacityById(this.ids.getId(id), value); }
  playMotion(group: string, index: number, loop: boolean, priority: 1 | 2 | 3, elapsedMs: number) {
    const motion = this.motionObjects.get(`${group}/${index}`); if (!motion) return;
    motion.setLoop(loop);
    if (priority === 3) this.user._motionManager.setReservePriority(priority);
    else if (!this.user._motionManager.reserveMotion(priority)) return;
    this.user._motionManager.startMotionPriority(motion, false, priority);
    if (elapsedMs > 0) this.user._motionManager.updateMotion(this.model, elapsedMs / 1000);
    this.model.saveParameters();
  }
  setExpression(name: string | null, elapsedMs: number) {
    this.user._expressionManager.stopAllMotions();
    if (!name) return;
    const expression = this.expressionObjects.get(name); if (!expression) return;
    this.user._expressionManager.startMotion(expression, false);
    if (elapsedMs > 0) this.user._expressionManager.updateMotion(this.model, elapsedMs / 1000);
  }
  update(deltaMs: number, options: CubismOptions, lipLevel: number, pcm?: VoicePCM | null) {
    if (this.paused) return;
    const delta = Math.max(0, deltaMs) / 1000;
    this.model.loadParameters();
    const motionUpdated = this.user._motionManager.updateMotion(this.model, delta);
    this.model.saveParameters();
    if (options.autoBlink && !motionUpdated) this.user._eyeBlink?.updateParameters(this.model, delta);
    if (options.breath) this.user._breath.updateParameters(this.model, delta);
    this.user.setDragging(options.look.x, options.look.y); this.user._dragManager.update(delta);
    this.model.addParameterValueById(this.ids.getId('ParamAngleX'), this.user._dragManager.getX() * 30);
    this.model.addParameterValueById(this.ids.getId('ParamAngleY'), this.user._dragManager.getY() * 30);
    this.model.addParameterValueById(this.ids.getId('ParamEyeBallX'), this.user._dragManager.getX());
    this.model.addParameterValueById(this.ids.getId('ParamEyeBallY'), this.user._dragManager.getY());
    this.user._expressionManager.updateMotion(this.model, delta);
    for (const [id, value] of Object.entries(options.parameters)) if (this.parameterRanges[id])
      this.model.setParameterValueById(this.ids.getId(id), value);
    for (const [id, value] of Object.entries(options.partOpacity)) if (this.partIds.includes(id))
      this.model.setPartOpacityById(this.ids.getId(id), value);
    if (options.lip.mode === 'amplitude') for (let index = 0; index < this.setting.getLipSyncParameterCount(); index++)
      this.model.addParameterValueById(this.setting.getLipSyncParameterId(index), lipLevel);
    if (options.lip.mode === 'motionSync' && this.sync) {
      if (this.syncSource !== (pcm?.sourceId ?? null)) { this.syncSource = pcm?.sourceId ?? null; this.syncSamples = []; }
      if (pcm) for (const sample of pcm.samples) this.syncSamples.push(sample * options.lip.gain);
      const buffer = new this.owner.options.bindings.csmVector();
      for (const sample of this.syncSamples) buffer.pushBack(sample);
      this.sync.setSoundBuffer(0, buffer, 0); this.sync.updateParameters(this.model, delta);
      this.syncSamples.splice(0, this.sync.getLastTotalProcessedCount(0));
    }
    if (options.physics) this.user._physics?.evaluate(this.model, delta);
    this.user._pose?.updateParameters(this.model, delta);
    this.model.update();
  }
  draw() {
    if (!this.initialized) return;
    this.gl.viewport(0, 0, this.surface.width, this.surface.height);
    this.gl.clearColor(0, 0, 0, 0); this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    const renderer = this.user.getRenderer();
    const matrix = new this.owner.options.bindings.CubismMatrix44();
    matrix.multiplyByMatrix(this.user.getModelMatrix());
    renderer.setMvpMatrix(matrix); renderer.setRenderState(null, [0, 0, this.surface.width, this.surface.height]);
    renderer.drawModel();
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.surface, 0, 0);
  }
  pause(paused: boolean) { this.paused = paused; }
  capture() {
    return { parameterValues: Object.fromEntries(Object.keys(this.parameterRanges).map(id => [id, this.model.getParameterValueById(this.ids.getId(id))])),
      partOpacity: Object.fromEntries(this.partIds.map(id => [id, this.model.getPartOpacityById(this.ids.getId(id))])),
      automatic: { breath: this.user._breath._currentTime, blink: this.user._eyeBlink ? Object.fromEntries(
        ['_blinkingState', '_nextBlinkingTime', '_stateStartTimeSeconds', '_userTimeSeconds'].map(key => [key, this.user._eyeBlink[key]])) : null } as Json };
  }
  restoreAutomatic(value: Json) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (typeof value.breath === 'number') this.user._breath._currentTime = value.breath;
    if (value.blink && this.user._eyeBlink) Object.assign(this.user._eyeBlink, value.blink);
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.sync?.release(); this.sync = null;
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    this.textures.length = 0; this.user.release();
    for (const motion of this.motionObjects.values()) motion.release?.(); this.motionObjects.clear();
    for (const expression of this.expressionObjects.values()) expression.release?.(); this.expressionObjects.clear();
    this.setting.release?.(); this.canvas.width = 0; this.canvas.height = 0; this.canvas.remove();
  }
}

export class R4Runtime implements CubismRuntime {
  private disposed = false;
  readonly sdkRelease = '5-r.4' as const;
  readonly coreVersion: string;
  readonly motionSyncCoreVersion: string | null;
  readonly surface: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;
  constructor(readonly options: R4RuntimeOptions) {
    const version = options.bindings.coreVersion();
    const actual = `${(version >>> 24) & 0xff}.${(version >>> 16) & 0xff}.${String(version & 0xffff).padStart(2, '0')}`;
    if (actual !== options.coreVersion) throw new Error(`Cubism Core 版本不匹配：${actual}，需要 ${options.coreVersion}`);
    this.coreVersion = actual; this.motionSyncCoreVersion = options.motionSyncCoreVersion;
    this.surface = document.createElement('canvas'); this.surface.width = 1024; this.surface.height = 1024;
    const gl = this.surface.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('Cubism WebGL 不可用'); this.gl = gl;
    try {
      if (options.bindings.acquire) options.bindings.acquire();
      else { if (!options.bindings.CubismFramework.startUp()) throw new Error('Cubism Framework 启动失败');
        if (!options.bindings.CubismFramework.isInitialized?.()) options.bindings.CubismFramework.initialize(); }
    } catch (error) { gl.getExtension('WEBGL_lose_context')?.loseContext(); this.surface.width = 0; this.surface.height = 0; throw error; }
  }
  async open(resource: ResolvedAsset): Promise<Result<CubismModelPort>> {
    if (this.disposed) return fail('LIVE2D_RUNTIME_DISPOSED', 'Cubism 运行时已释放');
    try { const model = await R4Model.open(this, resource);
      if (this.disposed) { model.dispose(); return fail('LIVE2D_RUNTIME_DISPOSED', 'Cubism 运行时已释放'); }
      return ok(model); }
    catch (error) { return fail('MODEL_LOAD_FAILED', String(error)); }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.gl.getExtension('WEBGL_lose_context')?.loseContext(); this.surface.width = 0; this.surface.height = 0;
    this.options.bindings.release?.();
  }
}
