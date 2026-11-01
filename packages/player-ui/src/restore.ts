import { createId } from '@galcraft/contracts';
import type { Domain, EntryMapping, FlowEntryRecord, HistoryEntry, Id, Issue, LongTerm, Position, Result, RestoreKey, RuntimeState, SaveRecord, Snapshot, StateOrigin, Target } from '@galcraft/contracts';
import { FlowEntryRecordSchema, SaveRecordSchema } from '@galcraft/contracts';
import type { SessionController } from '@galcraft/runtime';
import type { StageController } from '@galcraft/stage';
import type { PlayerPreferences } from './preferences.js';
import type { PlayerDataService } from './data.js';
import { clone, fail, ok } from './common.js';
import { afterstoryUnlocked } from './afterstory.js';

export type RestoreSource = { kind: 'save'; record: SaveRecord } | { kind: 'flowEntry'; record: FlowEntryRecord };
export type RestoreContext = { snapshot: Snapshot; target: Target; domain: Domain; longTerm: LongTerm;
  preferences: PlayerPreferences; entryMappings: EntryMapping[]; expectedActiveSessionId: Id | null };
export type RestoreInput = { requestId: Id; purpose: 'activate'|'validate'; source: RestoreSource; context: RestoreContext };
export type PreparedRestore = { key: RestoreKey; purpose: RestoreInput['purpose']; domain: Domain;
  source: { kind: RestoreSource['kind']; id: Id; origin: StateOrigin };
  expected: { activeSessionId: Id | null; longTermRevision: number; preferencesRevision: number };
  handles: { pluginPreparedId: Id | null; stagePreparedId: Id; sessionPreparedId: Id };
  position: Position; compatibility: 'readable'|'mapped'; mappings: EntryMapping[];
  conversions: { provider: string; from: string; to: string }[]; issues: Issue[] };
export type LoadReceipt = { requestId: Id; sessionId: Id; snapshotId: Id; position: Position };
export interface PluginRestorePort {
  prepare(input: { key: RestoreKey; progress: RuntimeState['plugins']; longTerm: LongTerm['plugins'];
    targetLock: Snapshot['lock'] }): Result<{ id: Id; key: RestoreKey; progress: RuntimeState['plugins'];
    conversions: PreparedRestore['conversions'] }>;
  release(id: Id): void;
}
export interface EngineRestorePort {
  prepare(source: RestoreSource, target: Snapshot): Promise<Result<{ source: RestoreSource; conversions: PreparedRestore['conversions'] }>>;
}

type Registered = { public: PreparedRestore; snapshot: Snapshot; context: RestoreContext };

export class RestoreCoordinator {
  private prepared = new Map<Id, Registered>();
  private latest = new Map<string, Id>();
  private listeners = new Set<(receipt: LoadReceipt, previousSessionId: Id | null) => void>();
  private snapshot: Snapshot;
  constructor(snapshot: Snapshot, readonly data: PlayerDataService, readonly session: SessionController,
    readonly stage: StageController, readonly plugins: PluginRestorePort | null = null,
    readonly entryMappings: EntryMapping[] = [], readonly engine: EngineRestorePort | null = null) { this.snapshot = snapshot; }
  setSnapshot(snapshot: Snapshot) { this.snapshot = snapshot; for (const id of [...this.prepared.keys()]) this.disposePreparedRestore(id); }
  subscribe(fn: (receipt: LoadReceipt, previousSessionId: Id | null) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  context(): Result<RestoreContext> {
    const profile = this.data.current(); if (!profile) return fail('PROFILE_NOT_OPEN', '资料尚未装载');
    return ok({ snapshot: this.snapshot, target: this.data.host.target, domain: this.data.domain,
      longTerm: profile.longTerm, preferences: profile.preferences, entryMappings: clone(this.entryMappings),
      expectedActiveSessionId: this.session.inspect()?.sessionId ?? null });
  }
  async prepareLoad(input: { requestId: Id; recordId: Id; context: RestoreContext }): Promise<Result<PreparedRestore>> {
    const record = await this.data.record(input.recordId); if (!record.ok) return record;
    if (!record.value) return fail('RECORD_MISSING', '存档不存在');
    return this.prepareRestore({ requestId: input.requestId, purpose: 'activate', source: { kind: 'save', record: record.value }, context: input.context });
  }
  async prepareRestore(input: RestoreInput): Promise<Result<PreparedRestore>> {
    const { requestId, purpose, context } = input;
    let source = clone(input.source);
    let engineConversions: PreparedRestore['conversions'] = [];
    if (this.prepared.has(requestId)) this.disposePreparedRestore(requestId);
    if (context.snapshot.snapshotId !== this.snapshot.snapshotId || context.domain.projectId !== this.snapshot.projectId ||
      source.record.projectId !== this.snapshot.projectId) return fail('RESTORE_CONTEXT', '恢复记录与当前作品不一致');
    if (purpose === 'validate' && (context.domain.kind !== 'sample' || context.expectedActiveSessionId !== null))
      return fail('RESTORE_VALIDATE_DOMAIN', '验证需要独立的样例资料域');
    if (purpose === 'activate' && context.domain.kind === 'sample') return fail('RESTORE_DOMAIN', '样例资料域不可激活');
    if (purpose === 'activate') {
      const domainKey = JSON.stringify(context.domain);
      const old = this.latest.get(domainKey); if (old) this.disposePreparedRestore(old);
      this.latest.set(domainKey, requestId);
    }
    const parsed = source.kind === 'save' ? SaveRecordSchema.safeParse(source.record) : FlowEntryRecordSchema.safeParse(source.record);
    if (!parsed.success) return fail('RESTORE_RECORD_INVALID', parsed.error.message);
    const origin: StateOrigin = { releaseVersion: source.record.releaseVersion, engineVersion: source.record.engineVersion,
      dependencyVersions: source.record.dependencyVersions };
    if (origin.engineVersion !== context.snapshot.engineVersion) {
      if (!this.engine) return fail('RESTORE_ENGINE_VERSION', '运行状态引擎版本不兼容');
      const converted = await this.engine.prepare(source, context.snapshot); if (!converted.ok) return converted;
      const next = converted.value.source;
      const validated = next.kind === 'save' ? SaveRecordSchema.safeParse(next.record) : FlowEntryRecordSchema.safeParse(next.record);
      if (!validated.success || next.kind !== source.kind || next.record.projectId !== source.record.projectId ||
        next.record.releaseVersion !== source.record.releaseVersion || next.record.engineVersion !== context.snapshot.engineVersion ||
        (next.kind === 'save' && source.kind === 'save' ? next.record.recordId !== source.record.recordId :
          next.kind === 'flowEntry' && source.kind === 'flowEntry' && next.record.nodeId !== source.record.nodeId))
        return fail('RESTORE_ENGINE_CONVERSION', '引擎转换结果的身份或版本无效');
      source = next; engineConversions = converted.value.conversions;
    }
    const expectedDependencies = [context.snapshot.lock.engine, ...context.snapshot.lock.plugins, context.snapshot.lock.template];
    if (source.record.dependencyVersions.length !== expectedDependencies.length || expectedDependencies.some(expected =>
      !source.record.dependencyVersions.some(previous => previous.kind === expected.kind && previous.id === expected.id &&
        (expected.kind === 'plugin' || previous.version === expected.version))))
      return fail('RESTORE_DEPENDENCY_VERSION', '恢复记录依赖版本不兼容');
    const state = clone(source.record.state), history: HistoryEntry[] = source.kind === 'save' ? clone(source.record.history) : [];
    if (purpose === 'activate' && state.story?.kind === 'afterstory') {
      const story = state.story;
      const character = context.snapshot.characters.find(item => item.id === story.characterId && item.afterstory?.id === story.entryId);
      if (!character || !afterstoryUnlocked(character, context.longTerm.endings)) return fail('AFTERSTORY_LOCKED', '后日谈尚未解锁');
    }
    const validateVariables = (values: Record<Id, unknown>, scope: 'progress' | 'local' | 'longTerm', definitions = context.snapshot.variables) => {
      for (const [id, value] of Object.entries(values)) {
        const definition = definitions.find(variable => variable.id === id && variable.scope === scope);
        if (!definition || typeof value !== definition.type || typeof value === 'number' && !Number.isFinite(value)) throw new Error(`变量类型不兼容：${scope}/${id}`);
      }
    };
    const validateFrames = (frames: RuntimeState['frames']) => {
      for (const frame of frames) {
        const scene = context.snapshot.scenes.find(scene => scene.scene.id === frame.sceneId);
        if (!scene) throw new Error(`调用栈场景不存在：${frame.sceneId}`);
        validateVariables(frame.locals, 'local', scene.scene.locals);
      }
    };
    try {
      validateVariables(state.progress, 'progress');
      validateVariables(Object.fromEntries(Object.entries(context.longTerm.variables).map(([id, entry]) => [id, entry.value])), 'longTerm');
      validateFrames(state.frames);
      for (const entry of history) if (entry.entryState) {
        validateVariables(entry.entryState.progress, 'progress');
        validateFrames(entry.entryState.frames);
      }
    } catch (error) { return fail('RESTORE_VARIABLE', String(error), ['compare', 'returnTitle']); }
    const mappings: EntryMapping[] = [];
    const applyPosition = (position: Position): Position => {
      const exists = context.snapshot.scenes.some(scene => scene.scene.id === position.sceneId &&
        (position.statementId === null || scene.instructions.some(item => item.statementId === position.statementId)));
      if (exists) return position;
      const candidates = context.entryMappings.filter(item => item.oldRelease === origin.releaseVersion &&
        item.oldSceneId === position.sceneId && item.oldStatementId === position.statementId);
      if (candidates.length !== 1) throw new Error(`没有唯一的入口映射：${position.sceneId}/${position.statementId}`);
      const selected = candidates[0]!;
      if (!context.snapshot.scenes.some(scene => scene.scene.id === selected.newSceneId &&
        scene.instructions.some(item => item.statementId === selected.newStatementId)))
        throw new Error(`入口映射目标不存在：${selected.newSceneId}/${selected.newStatementId}`);
      mappings.push(selected); return { sceneId: selected.newSceneId, statementId: selected.newStatementId };
    };
    try {
      state.position = applyPosition(state.position);
      for (const frame of state.frames) if (frame.returnTo) frame.returnTo = applyPosition(frame.returnTo);
      for (const entry of history) if (entry.entryState) { entry.position = applyPosition(entry.position);
        entry.entryState.position = applyPosition(entry.entryState.position);
        for (const frame of entry.entryState.frames) if (frame.returnTo) frame.returnTo = applyPosition(frame.returnTo); }
    } catch (error) { return fail('RESTORE_MAPPING', String(error), ['compare', 'returnTitle']); }
    const key: RestoreKey = { requestId, sessionId: createId(context), snapshotId: context.snapshot.snapshotId };
    let pluginId: Id | null = null, sessionId: Id | null = null, stageId: Id | null = null;
    let conversions: PreparedRestore['conversions'] = [...engineConversions];
    try {
      if (context.snapshot.lock.plugins.length) {
        if (!this.plugins) return fail('RESTORE_PLUGIN_UNAVAILABLE', '插件恢复服务不可用');
        const prepared = this.plugins.prepare({ key, progress: state.plugins, longTerm: context.longTerm.plugins,
          targetLock: context.snapshot.lock });
        if (!prepared.ok) return prepared;
        if (JSON.stringify(prepared.value.key) !== JSON.stringify(key)) return fail('RESTORE_KEY', '插件恢复身份不一致');
        pluginId = prepared.value.id; state.plugins = prepared.value.progress; conversions.push(...prepared.value.conversions);
      }
      const preparedSession = await this.session.prepareSession({ snapshot: context.snapshot, domain: context.domain,
        source: { kind: 'restored', state, history, voiceLocale: context.preferences.voiceLocale }, target: null }, key);
      if (!preparedSession.ok) return preparedSession;
      sessionId = preparedSession.value.id;
      if (this.latest.get(JSON.stringify(context.domain)) !== requestId && purpose === 'activate') return fail('RESTORE_STALE', '已有更新的读档请求');
      const preparedStage = await this.stage.prepareStage(key.sessionId, preparedSession.value.state.presentation, key,
        preparedSession.value.voiceBinding);
      if (!preparedStage.ok) return preparedStage;
      stageId = preparedStage.value.id;
      if (this.latest.get(JSON.stringify(context.domain)) !== requestId && purpose === 'activate') return fail('RESTORE_STALE', '已有更新的读档请求');
      const descriptor: PreparedRestore = { key, purpose, domain: clone(context.domain),
        source: { kind: source.kind, id: source.kind === 'save' ? source.record.recordId : source.record.nodeId, origin },
        expected: { activeSessionId: context.expectedActiveSessionId, longTermRevision: context.longTerm.revision,
          preferencesRevision: context.preferences.revision },
        handles: { pluginPreparedId: pluginId, stagePreparedId: stageId, sessionPreparedId: sessionId },
        position: clone(state.position), compatibility: mappings.length ? 'mapped' : 'readable', mappings,
        conversions, issues: [] };
      this.prepared.set(requestId, { public: descriptor, snapshot: context.snapshot, context: clone(context) });
      pluginId = null; sessionId = null; stageId = null;
      return ok(clone(descriptor));
    } finally {
      if (stageId) this.stage.discardPrepared(stageId);
      if (sessionId) this.session.disposePrepared(sessionId);
      if (pluginId) this.plugins?.release(pluginId);
    }
  }
  commitLoad(input: { requestId: Id; acceptMappings: boolean }): Result<LoadReceipt> {
    const registered = this.prepared.get(input.requestId); if (!registered) return fail('RESTORE_STALE', '恢复准备已失效');
    const item = registered.public;
    if (item.purpose === 'validate') return fail('RESTORE_VALIDATE_ONLY', '只读验证不可激活');
    if (item.mappings.length && !input.acceptMappings) return fail('RESTORE_CONFIRMATION_REQUIRED', '需要确认入口映射');
    const latest = this.latest.get(JSON.stringify(item.domain));
    const profile = this.data.current();
    if (latest !== input.requestId || this.snapshot.snapshotId !== item.key.snapshotId || !profile ||
      profile.longTerm.revision !== item.expected.longTermRevision ||
      profile.preferences.revision !== item.expected.preferencesRevision ||
      (this.session.inspect()?.sessionId ?? null) !== item.expected.activeSessionId) {
      this.disposePreparedRestore(input.requestId); return fail('RESTORE_CONTEXT_CHANGED', '恢复期间资料或会话已改变');
    }
    // Both providers have completed their fallible preparation before this synchronous publication.
    const previousSessionId = this.session.inspect()?.sessionId ?? null;
    const activated = this.session.activate(item.handles.sessionPreparedId);
    if (!activated.ok) { this.disposePreparedRestore(input.requestId); return activated; }
    const committed = this.stage.commitStage(item.handles.stagePreparedId, item.key);
    if (!committed.ok) return committed;
    this.prepared.delete(input.requestId);
    this.latest.delete(JSON.stringify(item.domain));
    const receipt = { requestId: input.requestId, sessionId: item.key.sessionId,
      snapshotId: item.key.snapshotId, position: clone(item.position) };
    for (const listener of this.listeners) listener(receipt, previousSessionId);
    this.stage.disposeRetiredStage(input.requestId);
    if (item.handles.pluginPreparedId) this.plugins?.release(item.handles.pluginPreparedId);
    return ok(receipt);
  }
  disposePreparedRestore(requestId: Id): void {
    const item = this.prepared.get(requestId); if (!item) return;
    this.stage.discardPrepared(item.public.handles.stagePreparedId);
    this.session.disposePrepared(item.public.handles.sessionPreparedId);
    if (item.public.handles.pluginPreparedId) this.plugins?.release(item.public.handles.pluginPreparedId);
    this.prepared.delete(requestId);
    const key = JSON.stringify(item.public.domain);
    if (this.latest.get(key) === requestId) this.latest.delete(key);
  }
}
