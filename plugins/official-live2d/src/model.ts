import type { Id, Json, ResolvedAsset, ResourceCapabilities, Result } from '@galcraft/contracts';
import type { ResourceProvider, StageInstance, StageProvider, VoicePCM } from '@galcraft/plugins/contracts';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
function fail<T>(code: string, message: string): Result<T> {
  const error = { code, severity: 'error' as const, message, owner: 'M06' as const, related: [], actions: ['supplyDependency' as const] };
  return { ok: false, error, issues: [error] };
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const refs = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const posix = (base: string, path: string) => [base, path].filter(Boolean).join('/').replace(/\/+/g, '/');
export type Motion = { group: string; index: number; file: string; sound: string | null; fadeInMs: number | null; fadeOutMs: number | null };
export type CubismCapabilities = { mocVersion: number; parameterIds: string[]; partIds: string[]; eyeBlinkIds: string[]; lipSyncIds: string[];
  motions: Motion[]; expressions: { name: string; file: string }[]; physics: boolean; pose: boolean; userData: boolean;
  motionSync: null | { file: string; analysisType: string; parameterIds: string[]; supported: boolean } };
type FileReader = (path: string) => Promise<string>;
type MocInspector = (path: string) => Promise<Result<{ version: number; parameters: ResourceCapabilities['parameters']; partIds: string[] }>>;

export function createLive2DResourceProvider(readText: FileReader, inspectMoc: MocInspector,
  identity = { key: 'galcraft.live2d', version: '0.1.0' }): ResourceProvider {
  return { key: identity.key, kind: 'live2d', extensions: ['.model3.json'], async inspect(rootFile, files) {
    let model: Record<string, unknown>;
    try { model = record(JSON.parse(await readText(rootFile))); }
    catch (error) { return fail('MODEL_INVALID', `${rootFile}: ${String(error)}`); }
    const base = rootFile.includes('/') ? rootFile.slice(0, rootFile.lastIndexOf('/')) : '';
    const references = record(model.FileReferences);
    const required: { field: string; path: string }[] = [];
    const add = (field: string, path: unknown) => { if (text(path)) required.push({ field, path: posix(base, text(path)) }); };
    for (const field of ['Moc', 'Physics', 'Pose', 'UserData', 'DisplayInfo', 'MotionSync']) add(field, references[field]);
    refs(references.Textures).forEach((path, index) => add(`Textures[${index}]`, path));
    const motions: Motion[] = [];
    for (const [group, entries] of Object.entries(record(references.Motions))) if (Array.isArray(entries)) entries.forEach((raw, index) => {
      const motion = record(raw); add(`Motions.${group}[${index}].File`, motion.File); add(`Motions.${group}[${index}].Sound`, motion.Sound);
      motions.push({ group, index, file: posix(base, text(motion.File)), sound: text(motion.Sound) ? posix(base, text(motion.Sound)) : null,
        fadeInMs: typeof motion.FadeInTime === 'number' ? motion.FadeInTime * 1000 : null,
        fadeOutMs: typeof motion.FadeOutTime === 'number' ? motion.FadeOutTime * 1000 : null });
    });
    const expressions = Array.isArray(references.Expressions) ? references.Expressions.map(raw => {
      const expression = record(raw); add(`Expressions.${text(expression.Name)}.File`, expression.File);
      return { name: text(expression.Name), file: posix(base, text(expression.File)) };
    }) : [];
    const present = new Set(files);
    const missing = required.filter(item => !present.has(item.path));
    if (missing.length) return fail('GROUP_INCOMPLETE', `${rootFile}: ${missing.map(item => `${item.field} ${item.path}`).join('; ')}`);
    const mocPath = required.find(item => item.field === 'Moc')?.path;
    if (!mocPath) return fail('GROUP_INCOMPLETE', `${rootFile}: FileReferences.Moc 缺失`);
    const moc = await inspectMoc(mocPath); if (!moc.ok) return moc;
    const groups = Array.isArray(model.Groups) ? model.Groups.map(record) : [];
    const idsFor = (name: string) => groups.filter(group => group.Target === 'Parameter' && group.Name === name).flatMap(group => refs(group.Ids));
    let motionSync: CubismCapabilities['motionSync'] = null;
    if (text(references.MotionSync)) {
      const path = posix(base, text(references.MotionSync));
      try {
        const config = record(JSON.parse(await readText(path)));
        const settings = Array.isArray(config.Settings) ? config.Settings.map(record) : [];
        const setting = settings[0];
        motionSync = { file: path, analysisType: text(setting?.AnalysisType),
          parameterIds: Array.isArray(setting?.CubismParameters) ? setting.CubismParameters.map(row => text(record(row).Id)).filter(Boolean) : [],
          supported: text(setting?.AnalysisType) === 'CRI' };
        if (!motionSync.supported) return fail('MOTIONSYNC_UNSUPPORTED', `${path}: 不支持 MotionSync 分析类型 ${motionSync.analysisType || '(empty)'}`);
      } catch (error) { return fail('MOTIONSYNC_INVALID', `${path}: ${String(error)}`); }
    }
    const capabilities: CubismCapabilities = { mocVersion: moc.value.version, parameterIds: moc.value.parameters.map(item => item.id),
      partIds: moc.value.partIds, eyeBlinkIds: idsFor('EyeBlink'), lipSyncIds: idsFor('LipSync'), motions, expressions,
      physics: !!references.Physics, pose: !!references.Pose, userData: !!references.UserData, motionSync };
    const output: ResourceCapabilities = { resolver: identity.key, resolverVersion: identity.version, format: 'live2d-model3',
      formatVersion: String(model.Version ?? 'unknown'), capabilities: [
        ...(motions.length ? ['motion'] : []), ...(expressions.length ? ['expression'] : []),
        ...(capabilities.physics ? ['physics'] : []), ...(capabilities.pose ? ['pose'] : []),
        ...(capabilities.lipSyncIds.length ? ['amplitudeLip'] : []), ...(motionSync ? ['motionSync'] : [])],
      parameters: moc.value.parameters, motions: motions.map(item => ({ group: item.group, index: item.index, name: `${item.group} ${item.index}`, durationMs: null })),
      expressions: expressions.map(item => item.name), missingFiles: [] };
    return ok({ files: [rootFile, ...new Set(required.map(item => item.path))], capabilities: output, metadata: capabilities as unknown as Json });
  } };
}

export type CubismOptions = { autoBlink: boolean; breath: boolean; physics: boolean;
  look: { mode: 'fixed' | 'pointer'; x: number; y: number }; lip: { mode: 'off' | 'amplitude' | 'motionSync'; gain: number };
  motion: { group: string; index: number; loop: boolean; priority: 1 | 2 | 3 } | null;
  expression: string | null; parameters: Record<string, number>; partOpacity: Record<string, number> };
export type CubismState = { schemaVersion: 1; resourceId: Id; variantId: Id; sdk: '5-r.4'; options: CubismOptions;
  parameterValues: Record<string, number>; partOpacity: Record<string, number>;
  automatic: Json;
  motionElapsedMs: number; expressionElapsedMs: number; blinkElapsedMs: number; breathElapsedMs: number };
export type CubismModelPort = { canvas: HTMLCanvasElement; parameterRanges: Record<string, { min: number; max: number; default: number }>;
  partIds: string[]; motions: Motion[]; expressions: string[]; motionSync: boolean;
  setParameter(id: string, value: number): void; setPartOpacity(id: string, value: number): void;
  playMotion(group: string, index: number, loop: boolean, priority: 1 | 2 | 3, elapsedMs: number): void;
  setExpression(name: string | null, elapsedMs: number): void;
  capture?(): { parameterValues: Record<string, number>; partOpacity: Record<string, number>; automatic: Json };
  restoreAutomatic?(value: Json): void;
  update(deltaMs: number, options: CubismOptions, lipLevel: number, pcm?: VoicePCM | null): void; draw(): void; pause(paused: boolean): void; dispose(): void };
export type CubismRuntime = { sdkRelease: '5-r.4'; coreVersion: string; motionSyncCoreVersion: string | null;
  open(resource: ResolvedAsset): Promise<Result<CubismModelPort>> };

const defaultOptions = (): CubismOptions => ({ autoBlink: true, breath: true, physics: true,
  look: { mode: 'fixed', x: 0, y: 0 }, lip: { mode: 'off', gain: 1 }, motion: null,
  expression: null, parameters: {}, partOpacity: {} });
function initialOptions(source: Record<string, unknown>): Record<string, unknown> {
  if (source.schemaVersion === 1) return record(source.options);
  const motion = record(source.motion), expression = record(source.expression), gaze = record(source.gaze), lip = record(source.lip);
  return {
    autoBlink: source.blink ?? true, breath: source.breath ?? true, physics: source.physics ?? true,
    look: { mode: gaze.follow === 'pointer' ? 'pointer' : 'fixed', x: gaze.follow === 'none' ? 0 : Number(gaze.x ?? 0),
      y: gaze.follow === 'none' ? 0 : Number(gaze.y ?? 0) },
    lip: { mode: lip.mode === 'basic' ? 'amplitude' : lip.mode ?? 'off', gain: Number(lip.gain ?? 1) },
    motion: motion.op === 'play' ? { group: motion.group, index: motion.index, loop: motion.loop ?? false, priority: 2 } : null,
    expression: expression.op === 'set' ? expression.name : null,
    parameters: record(source.parameters), partOpacity: {},
  };
}
class CubismInstance implements StageInstance {
  private readonly state: CubismState;
  private paused = true;
  private lipLevel = 0;
  constructor(private readonly model: CubismModelPort, resource: ResolvedAsset, initial: Json) {
    const source = record(initial), options = initialOptions(source);
    this.state = { schemaVersion: 1, resourceId: resource.assetId, variantId: resource.variantId, sdk: '5-r.4',
      options: { ...defaultOptions(), ...options, look: { ...defaultOptions().look, ...record(options.look) },
        lip: { ...defaultOptions().lip, ...record(options.lip) }, parameters: record(options.parameters) as Record<string, number>,
        partOpacity: record(options.partOpacity) as Record<string, number> } as CubismOptions,
      parameterValues: record(source.parameterValues) as Record<string, number>, partOpacity: record(source.partOpacity) as Record<string, number>,
      automatic: (source.automatic ?? null) as Json,
      motionElapsedMs: Number(source.motionElapsedMs ?? 0), expressionElapsedMs: Number(source.expressionElapsedMs ?? 0),
      blinkElapsedMs: Number(source.blinkElapsedMs ?? 0), breathElapsedMs: Number(source.breathElapsedMs ?? 0) };
    if (this.state.options.motion) model.playMotion(this.state.options.motion.group, this.state.options.motion.index,
      this.state.options.motion.loop, this.state.options.motion.priority, this.state.motionElapsedMs);
    model.setExpression(this.state.options.expression, this.state.expressionElapsedMs);
    for (const [id, value] of Object.entries(this.state.parameterValues)) if (model.parameterRanges[id]) model.setParameter(id, value);
    for (const [id, value] of Object.entries(this.state.partOpacity)) if (model.partIds.includes(id)) model.setPartOpacity(id, value);
    model.restoreAutomatic?.(this.state.automatic);
    model.draw();
  }
  update(deltaMs: number, voiceLevel: number, pcm?: VoicePCM | null) {
    if (this.paused) return;
    const options = this.state.options;
    const target = options.lip.mode === 'off' ? 0 : Math.max(0, Math.min(1, voiceLevel * options.lip.gain));
    this.lipLevel += (target - this.lipLevel) * (1 - Math.exp(-deltaMs / 60));
    this.state.motionElapsedMs += deltaMs; this.state.expressionElapsedMs += deltaMs;
    if (options.autoBlink) this.state.blinkElapsedMs += deltaMs;
    if (options.breath) this.state.breathElapsedMs += deltaMs;
    this.model.update(deltaMs, options, this.lipLevel, pcm); this.model.draw();
  }
  set(command: Json): Result<void> {
    const patch = record(command), options = this.state.options;
    if (typeof patch.parameterId === 'string') {
      const range = this.model.parameterRanges[patch.parameterId]; if (!range) return fail('MODEL_PARAMETER_MISSING', patch.parameterId);
      const value = Math.max(range.min, Math.min(range.max, Number(patch.value))); this.model.setParameter(patch.parameterId, value);
      this.state.parameterValues[patch.parameterId] = value; options.parameters[patch.parameterId] = value;
    }
    if (typeof patch.partId === 'string') {
      if (!this.model.partIds.includes(patch.partId)) return fail('MODEL_PART_MISSING', patch.partId);
      const value = Math.max(0, Math.min(1, Number(patch.value))); this.model.setPartOpacity(patch.partId, value);
      this.state.partOpacity[patch.partId] = value; options.partOpacity[patch.partId] = value;
    }
    if (patch.motion !== undefined) {
      const motion = patch.motion === null ? null : record(patch.motion);
      if (motion && !this.model.motions.some(item => item.group === motion.group && item.index === motion.index)) return fail('MODEL_MOTION_MISSING', `${motion.group}/${motion.index}`);
      options.motion = motion as CubismOptions['motion']; this.state.motionElapsedMs = 0;
      if (options.motion) this.model.playMotion(options.motion.group, options.motion.index, options.motion.loop, options.motion.priority, 0);
    }
    if (patch.expression !== undefined) {
      const expression = patch.expression === null ? null : text(patch.expression);
      if (expression && !this.model.expressions.includes(expression)) return fail('MODEL_EXPRESSION_MISSING', expression);
      options.expression = expression; this.state.expressionElapsedMs = 0; this.model.setExpression(expression, 0);
    }
    if (patch.lip !== undefined) {
      const lip = record(patch.lip);
      if (lip.mode === 'motionSync' && !this.model.motionSync) return fail('MOTIONSYNC_CORE_MISSING', '当前模型或Core不支持MotionSync');
      options.lip = { ...options.lip, ...lip } as CubismOptions['lip'];
    }
    if (patch.look !== undefined) options.look = { ...options.look, ...record(patch.look) } as CubismOptions['look'];
    for (const flag of ['autoBlink', 'breath', 'physics'] as const) if (typeof patch[flag] === 'boolean') options[flag] = patch[flag];
    return ok(undefined);
  }
  capture(): Result<Json> { Object.assign(this.state, this.model.capture?.()); return ok(structuredClone(this.state) as unknown as Json); }
  pause(paused: boolean) { this.paused = paused; this.model.pause(paused); }
  renderSurface() { return this.model.canvas; }
  dispose() { this.model.dispose(); }
}

export function createLive2DStageProvider(runtime: CubismRuntime, expected: { coreVersion: string; motionSyncCoreVersion: string | null }): StageProvider {
  return { key: 'galcraft.live2d', async create(resource, initial) {
    if (runtime.sdkRelease !== '5-r.4' || runtime.coreVersion !== expected.coreVersion)
      return fail('CUBISM_VERSION', `需要 Cubism Web R4 Core ${expected.coreVersion}`);
    if (resource.kind !== 'live2d') return fail('MODEL_KIND', '资源不是Live2D模型');
    const state = record(initial), lip = record(record(state.options).lip ?? initialOptions(state).lip);
    if (lip.mode === 'motionSync' && (!runtime.motionSyncCoreVersion || runtime.motionSyncCoreVersion !== expected.motionSyncCoreVersion))
      return fail('MOTIONSYNC_CORE_MISSING', `需要 MotionSync Core ${expected.motionSyncCoreVersion}`);
    const opened = await runtime.open(resource); if (!opened.ok) return opened;
    if (lip.mode === 'motionSync' && !opened.value.motionSync) { opened.value.dispose();
      return fail('MOTIONSYNC_CORE_MISSING', '当前模型或 Core 未提供可用的 MotionSync 分析'); }
    try { return ok(new CubismInstance(opened.value, resource, initial)); }
    catch (error) { opened.value.dispose(); return fail('MODEL_CREATE', String(error)); }
  } };
}
