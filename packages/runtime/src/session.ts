import { createId, reserveIds } from '@galcraft/contracts';
import type { CompiledScene, Domain, ExecutionToken, Expr, Frame, HistoryEntry, Id, Instruction, Issue, Json, LongTerm, Position, PresentationDelta, PresentationState, Result, RuntimeState, Scalar, Snapshot, Source, VoicePlaybackBinding, VoiceResolution } from '@galcraft/contracts';
import { DialogueContentSchema, dialoguePlainText, dialogueSegments, ExprSchema, hasSceneParameterDefault, PresentationStateSchema, RuntimeStateSchema, SnapshotSchema } from '@galcraft/contracts';
import { dialogueInterpolations, parseExpression } from '@galcraft/dsl';
import { validatePluginData } from '@galcraft/plugins/contracts';
import { evaluate, evaluateBoolean, evaluateTree, graphemes } from './expression.js';
import { applyDialogue, chooseVoice, dialogueRuns, formatDialogue } from './voice.js';
import type { Checkpoint, ConditionExplanation, DebugRequest, DebugResult, DebugScenario, PreparedProviderCommands, PreparedSession, PresentationCommitReceipt, RuntimeActivity, RuntimeEvent, RuntimeInspection, RuntimePorts, SessionInput, RoutePreparation, UpdatePlan } from './types.js';

const success = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const failure = <T>(problem: Issue): Result<T> => ({ ok: false, error: problem, issues: [problem] });
const issue = (code: string, message: string, source?: Source): Issue => ({ code, severity: 'error', message, owner: 'M05', ...(source ? { source } : {}), related: [], actions: ['retry', 'returnTitle'] });
const isIssue = (value: unknown): value is Issue => Boolean(value && typeof value === 'object' && 'code' in value && 'owner' in value);
const asIssue = (value: unknown, source?: Source): Issue => isIssue(value) ? { ...value, ...(source ? { source } : {}) } : issue('RUNTIME_ERROR', String(value), source);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const expr = (value: unknown): value is Expr => typeof object(value).kind === 'string' && ExprSchema.safeParse(value).success;
const clone = <T>(value: T): T => structuredClone(value);
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const tokenEqual = (a: ExecutionToken | null, b: ExecutionToken): boolean => a?.sessionId === b.sessionId && a.occurrence === b.occurrence && a.statementId === b.statementId;
function scene(snapshot: Snapshot, id: Id): CompiledScene { const value = snapshot.scenes.find(item => item.scene.id === id); if (!value) throw issue('SCENE_MISSING', `Scene ${id} is unavailable`); return value; }
function at(snapshot: Snapshot, position: Position): Instruction | null {
  if (position.statementId === null) return null;
  const value = scene(snapshot, position.sceneId).instructions.find(item => item.statementId === position.statementId);
  if (!value) throw issue('STATEMENT_MISSING', `Statement ${position.statementId} is unavailable`); return value;
}
function target(snapshot: Snapshot, sceneId: Id, labelId: Id | null): Position {
  const compiled = scene(snapshot, sceneId);
  const statementId = labelId ? compiled.labels[labelId] : compiled.instructions[0]?.statementId;
  if (!statementId) throw issue('TARGET_MISSING', `Target in scene ${sceneId} is unavailable`);
  return { sceneId, statementId };
}
function next(snapshot: Snapshot, state: RuntimeState): void {
  if (state.position.statementId === null) { state.phase = 'completed'; state.wait = null; state.frames = []; return; }
  const compiled = scene(snapshot, state.position.sceneId);
  const index = compiled.instructions.findIndex(item => item.statementId === state.position.statementId);
  if (index < 0) throw issue('STATEMENT_MISSING', 'Current statement is unavailable');
  const upcoming = compiled.instructions[index + 1];
  if (upcoming) { state.position = { sceneId: compiled.scene.id, statementId: upcoming.statementId }; state.phase = 'entry'; return; }
  const frame = state.frames.at(-1);
  if (frame?.returnTo) {
    if (compiled.scene.returns !== 'void') throw issue('RETURN_MISSING', `Scene ${compiled.scene.name} requires a return value`);
    state.frames.pop(); resumeAt(snapshot, state, clone(frame.returnTo)); return;
  }
  state.frames = []; state.phase = 'completed'; state.wait = null; state.position = { sceneId: compiled.scene.id, statementId: null };
}
function resumeAt(snapshot: Snapshot, state: RuntimeState, position: Position): void {
  state.position = position; state.wait = null;
  if (position.statementId !== null) { state.phase = 'entry'; return; }
  const caller = state.frames.at(-1);
  if (caller?.returnTo) {
    const compiled = scene(snapshot, caller.sceneId);
    if (compiled.scene.returns !== 'void') throw issue('RETURN_MISSING', `Scene ${compiled.scene.name} requires a return value`);
    state.frames.pop(); resumeAt(snapshot, state, caller.returnTo); return;
  }
  state.frames = []; state.phase = 'completed';
}
function returnPosition(snapshot: Snapshot, state: RuntimeState): Position {
  const compiled = scene(snapshot, state.position.sceneId);
  const index = compiled.instructions.findIndex(item => item.statementId === state.position.statementId);
  if (index < 0) throw issue('STATEMENT_MISSING', 'Current statement is unavailable');
  return { sceneId: compiled.scene.id, statementId: compiled.instructions[index + 1]?.statementId ?? null };
}
function enterScene(snapshot: Snapshot, state: RuntimeState, position: Position, rebuildLocals = false): void {
  const frame = state.frames.at(-1); if (!frame) throw issue('FRAME_MISSING', 'Current frame is unavailable');
  if (rebuildLocals || frame.sceneId !== position.sceneId) {
    const nextScene = scene(snapshot, position.sceneId);
    frame.locals = Object.fromEntries(nextScene.scene.locals.map(item => [item.id, item.initial]));
    frame.sceneId = position.sceneId;
  }
  state.position = position; state.phase = 'entry'; state.wait = null;
  state.entryPresentation = { sceneId: position.sceneId, instanceId: createId(), completed: false };
}
function initial(snapshot: Snapshot, position: Position, progress: Record<Id, Scalar>): RuntimeState {
  const compiled = scene(snapshot, position.sceneId);
  const defaults = Object.fromEntries(snapshot.variables.filter(value => value.scope === 'progress').map(value => [value.id, value.initial]));
  const name = snapshot.project.player.name;
  if (name?.allowCustom && name.variableId) defaults[name.variableId] = name.defaultName;
  const locals = Object.fromEntries(compiled.scene.locals.map(value => [value.id, value.initial]));
  const silent = { assetId: null, variantId: null, stopped: true, volume: 1, startSec: 0,
    loop: false, loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 };
  const presentation: PresentationState = { objects: [], nextEntranceOrder: 0, transitions: [], effects: [], bgm: silent,
    ambience: {}, voice: null, currentSfx: [], text: { speakerId: null, speakerName: '', parts: [], text: '', append: false,
      avatarId: null, fontSize: null, textboxVisible: true }, film: { enabled: false, top: 0, bottom: 0 }, intro: null,
    styles: {}, backgroundVideo: null };
  return { position: clone(position), phase: 'entry', occurrence: 0,
    entryPresentation: { sceneId: position.sceneId, instanceId: createId(), completed: false },
    frames: [{ id: createId(), sceneId: compiled.scene.id, locals, returnTo: null, receiver: null }],
    progress: { ...defaults, ...progress }, route: [], presentation, wait: null, plugins: {}, playTimeMs: 0 };
}
function scalarType(value: Scalar): string { return typeof value; }
function valueFor(raw: unknown, state: RuntimeState, longTerm: LongTerm, snapshot: Snapshot, input?: string, ports?: RuntimePorts): Scalar {
  if (expr(raw)) return evaluate(raw, { state, longTerm, variables: snapshot.variables, input, functions: pureFunctions(ports, state, longTerm) });
  if (typeof raw === 'string' || typeof raw === 'boolean' || typeof raw === 'number') return raw;
  throw issue('VALUE_MISSING', 'Expression value is unavailable');
}
function runtimeArgs(raw: unknown, state: RuntimeState, longTerm: LongTerm, snapshot: Snapshot, ports: RuntimePorts): Json {
  if (expr(raw)) return valueFor(raw, state, longTerm, snapshot, undefined, ports);
  if (Array.isArray(raw)) return raw.map(item => runtimeArgs(item, state, longTerm, snapshot, ports));
  if (raw !== null && typeof raw === 'object') return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, runtimeArgs(value, state, longTerm, snapshot, ports)]));
  return raw as Json;
}
function pureFunctions(ports: RuntimePorts | undefined, state: RuntimeState, longTerm: LongTerm) {
  return Object.fromEntries((ports?.contributions.conditions ?? []).map(item => {
    const pluginId = item.key.split('/')[0]!;
    return [item.key, (args: Scalar[]) => item.evaluate(Object.fromEntries(item.fields.map((field, index) => [field.path, args[index]])) as Json,
      state.plugins[pluginId]?.progress ?? {}, longTerm.plugins[pluginId]?.data ?? {}) as Result<Scalar>];
  }));
}
function pluginSystem(ports: RuntimePorts, pluginId: string) {
  const systems = ports.contributions.systems.filter(item => item.key === pluginId || item.key.startsWith(`${pluginId}/`));
  if (systems.length > 1) throw issue('PLUGIN_SYSTEM_DUPLICATE', `Plugin ${pluginId} must provide one authoritative state definition`);
  return systems[0];
}
function applyPluginPresentation(state: RuntimeState, delta: PresentationDelta | null, token: ExecutionToken): void {
  if (!delta) return;
  const presentation = state.presentation;
  for (const change of delta.objects) {
    if (change.op === 'exit') presentation.objects = presentation.objects.filter(item => item.id !== change.id);
    else {
      if (!change.value || change.value.id !== change.id) throw issue('PLUGIN_PRESENTATION', 'Plugin object identity does not match its presentation change');
      const index = presentation.objects.findIndex(item => item.id === change.id);
      if (index < 0) presentation.objects.push(clone(change.value)); else presentation.objects[index] = clone(change.value);
      presentation.nextEntranceOrder = Math.max(presentation.nextEntranceOrder, change.value.entranceOrder + 1);
    }
  }
  for (const effect of delta.effects) { const index = presentation.effects.findIndex(item => item.id === effect.id); if (index < 0) presentation.effects.push(clone(effect)); else presentation.effects[index] = clone(effect); }
  for (const field of ['camera', 'text', 'film', 'intro', 'styles', 'backgroundVideo', 'transitions'] as const) if (delta[field] !== undefined) (presentation as Record<string, unknown>)[field] = clone(delta[field]);
  for (const audio of delta.audio) {
    if (audio.bus === 'bgm') presentation.bgm = clone(audio.state);
    if (audio.bus === 'sfx' && audio.id) {
      presentation.currentSfx = presentation.currentSfx.filter(item => item.soundId !== audio.id); delete presentation.ambience[audio.id];
      if (!audio.state.stopped) { if (audio.state.loop) presentation.ambience[audio.id] = clone(audio.state); else presentation.currentSfx.push({ soundId: audio.id, audio: clone(audio.state), statementId: token.statementId }); }
    }
  }
  const checked = PresentationStateSchema.safeParse(presentation); if (!checked.success) throw issue('PLUGIN_PRESENTATION', checked.error.message);
  state.presentation = checked.data;
}
function voiceTarget(instruction: Instruction, presentation: PresentationState): Id | null {
  const raw = object(instruction.args).target;
  if (raw === undefined || raw === null) return null;
  const target = object(raw);
  if (target.kind !== 'object' && target.kind !== 'station') throw issue('OBJECT_TARGET', 'Dialogue target is invalid', instruction.source);
  const matches = presentation.objects.filter(item => target.kind === 'station' ? item.station === target.station : item.id === target.id);
  if (matches.length > 1) throw issue('OBJECT_AMBIGUOUS', 'Dialogue target matches multiple objects', instruction.source);
  if (!matches.length) throw issue('OBJECT_MISSING', 'Dialogue target object is unavailable', instruction.source);
  return matches[0]!.id;
}
function initializePluginLongTerm(snapshot: Snapshot, longTerm: LongTerm, ports: RuntimePorts, pluginId: string): void {
  if (longTerm.plugins[pluginId]) return;
  const dependency = snapshot.lock.plugins.find(item => item.id === pluginId);
  const system = pluginSystem(ports, pluginId);
  if (!dependency || !system) throw issue('PLUGIN_STATE_MISSING', `Plugin ${pluginId} has no locked state contribution`);
  longTerm.plugins[pluginId] = { version: dependency.version, stateVersion: 1,
    data: system.initialLongTerm(snapshot.pluginDocuments[pluginId] ?? {}) };
}
function interpolate(text: string, state: RuntimeState, longTerm: LongTerm, snapshot: Snapshot, ports: RuntimePorts): string {
  let result = '', offset = 0;
  for (const match of dialogueInterpolations(text)) {
    result += text.slice(offset, match.start); offset = match.end;
    if (match.source === null) { result += '{{'; continue; }
    if (!match.closed) throw issue('INTERPOLATION_INVALID', 'Expected closing }} for dialogue interpolation');
    const parsed = parseExpression(match.source); if (!parsed.ok) throw issue('INTERPOLATION_INVALID', parsed.message);
    result += String(valueFor(parsed.expr, state, longTerm, snapshot, undefined, ports));
  }
  return result + text.slice(offset);
}
function projectVariable(snapshot: Snapshot, frame: Frame | undefined, id: Id) {
  return [...snapshot.variables, ...scene(snapshot, frame?.sceneId ?? snapshot.project.entry.sceneId).scene.locals].find(item => item.id === id);
}
function setVariable(snapshot: Snapshot, state: RuntimeState, longTerm: LongTerm, id: Id, value: Scalar, operation: string): boolean {
  const frame = state.frames.at(-1); const variable = projectVariable(snapshot, frame, id);
  if (!variable) throw issue('VARIABLE_MISSING', `Variable ${id} is unavailable`);
  const current = variable.scope === 'progress' ? state.progress[id] : variable.scope === 'local' ? frame?.locals[id] : longTerm.variables[id]?.value ?? variable.initial;
  let updated: Scalar = value;
  if (operation !== 'assign') {
    if (typeof current !== 'number' || typeof value !== 'number') throw issue('VARIABLE_TYPE', 'Arithmetic requires numbers');
    switch (operation) { case 'add': updated = current + value; break; case 'subtract': updated = current - value; break;
      case 'multiply': updated = current * value; break; case 'divide': if (value === 0) throw issue('EXPR_DIV_ZERO', 'Division by zero'); updated = current / value; break;
      default: throw issue('VARIABLE_OPERATION', `Unknown variable operation ${operation}`); }
  }
  if (scalarType(updated) !== variable.type || typeof updated === 'number' && !Number.isFinite(updated)) throw issue('VARIABLE_TYPE', `Variable ${id} expects ${variable.type}`);
  if (variable.scope === 'progress') state.progress[id] = updated;
  else if (variable.scope === 'local') { if (!frame) throw issue('FRAME_MISSING', 'Local frame is unavailable'); frame.locals[id] = updated; }
  else longTerm.variables[id] = { value: updated, updatedAt: new Date().toISOString() };
  return variable.scope === 'longTerm';
}
function provenance(snapshot: Snapshot) { return { releaseVersion: snapshot.releaseVersion, engineVersion: snapshot.engineVersion,
  dependencyVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template] }; }

type Active = { id: Id; snapshot: Snapshot; domain: SessionInput['domain']; state: RuntimeState; history: HistoryEntry[];
  sequence: number; status: RuntimeInspection['status']; issue: Issue | null; token: ExecutionToken | null;
  trace: RuntimeInspection['trace']; executed: Checkpoint['executed']; scenario: DebugScenario | null; voiceLocale: string;
  voiceResolution: VoiceResolution | null; voiceBinding: VoicePlaybackBinding | null; pending: { sequence: number; next: LongTerm; base: LongTerm } | null;
  pausedFrom: RuntimeInspection['status'] | null; explanations: ConditionExplanation[]; viewportAtEnd: boolean | null;
  previewLongTerm: LongTerm | null; routeBuilding: boolean;
  readingCarry: { textShown: number; textAnchor: number } | null; pluginResumeToken: string | null };

export class SessionController {
  private readonly pauseReasons = new Set<'emergency'>();
  /** A cover pause leaves debug/preview status and the current wait untouched. */
  setPauseReason(reason: 'emergency', enabled: boolean): Promise<Result<RuntimeInspection | null>> {
    if (enabled) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason);
    if (!enabled && !this.pauseReasons.size && this.active?.state.phase === 'entry' && this.active.status !== 'paused') return this.start();
    return Promise.resolve(success(this.inspect()));
  }
  private previewInstructionLimit: number | null = null;
  private execution: Promise<Result<RuntimeInspection>> | null = null;
  /** Repeated human input is consumed; one-shot completions wait for the owner. */
  private async exclusively(run: () => Promise<Result<RuntimeInspection>>, completion = false): Promise<Result<RuntimeInspection>> {
    if (this.execution) {
      if (!completion) return this.inspect() ? success(this.inspect()!) : failure(issue('SESSION_MISSING', 'No active session'));
      await this.execution;
      return this.exclusively(run, true);
    }
    const operation = Promise.resolve().then(run); this.execution = operation;
    try { return await operation; } finally { if (this.execution === operation) this.execution = null; }
  }

  private active: Active | null = null;
  private routeProbes = new WeakSet<Active>();
  private prepared = new Map<Id, Active>();
  private checkpoints = new Map<Id, { sessionId: Id; checkpoint: Checkpoint }>();
  constructor(private readonly ports: RuntimePorts) {}

  /** Pure menu conditions share the story evaluator and the installed plugin conditions. */
  evaluateCondition(expression: Expr, snapshot: Snapshot, domain: Domain): Result<boolean> {
    try {
      if (domain.projectId !== snapshot.projectId) return failure(issue('DOMAIN_MISMATCH', 'Condition domain belongs to another project'));
      const current = this.active?.snapshot.snapshotId === snapshot.snapshotId && equal(this.active.domain, domain) ? this.active.state : null;
      const state = current ?? initial(snapshot, target(snapshot, snapshot.project.entry.sceneId, snapshot.project.entry.labelId), {});
      if (!current) for (const dependency of snapshot.lock.plugins) state.plugins[dependency.id] = { version: dependency.version, stateVersion: 1,
        progress: pluginSystem(this.ports, dependency.id)?.initialProgress(snapshot.pluginDocuments[dependency.id] ?? {}) ?? {} };
      const longTerm = this.ports.longTerm.current(domain);
      return success(evaluateBoolean(expression, { state, longTerm, variables: snapshot.variables, functions: pureFunctions(this.ports, state, longTerm) }).value);
    } catch (error) { return failure(asIssue(error)); }
  }

  async prepareSession(input: SessionInput, restoreKey?: { requestId: Id; sessionId: Id; snapshotId: Id }): Promise<Result<PreparedSession>> {
    const checked = SnapshotSchema.safeParse(input.snapshot); if (!checked.success) return failure(issue('SNAPSHOT_INVALID', checked.error.message));
    if (input.domain.projectId !== input.snapshot.projectId) return failure(issue('DOMAIN_MISMATCH', 'Session domain belongs to another project'));
    if (restoreKey && restoreKey.snapshotId !== input.snapshot.snapshotId) return failure(issue('RESTORE_KEY', 'Snapshot does not match restore key'));
    if (restoreKey && input.source.kind !== 'restored') return failure(issue('RESTORE_SOURCE', 'Restore key requires restored state'));
    try {
      reserveIds(input);
      let state: RuntimeState; let history: HistoryEntry[] = []; let scenario: DebugScenario | null = null;
      let voiceLocale = input.snapshot.project.languages.voiceDefault;
      if (input.source.kind === 'restored') {
        const parsed = RuntimeStateSchema.safeParse(input.source.state); if (!parsed.success) return failure(issue('STATE_INVALID', parsed.error.message));
        state = clone(parsed.data); history = clone(input.source.history); voiceLocale = input.source.voiceLocale;
      } else if (input.source.kind === 'checkpoint') {
        const checkpoint = this.checkpoints.get(input.source.checkpointId)?.checkpoint;
        if (!checkpoint || checkpoint.snapshotId !== input.snapshot.snapshotId || checkpoint.projectId !== input.snapshot.projectId) return failure(issue('CHECKPOINT_MISSING', 'Checkpoint is unavailable for this snapshot'));
        state = clone(checkpoint.state);
      } else {
        scenario = clone(input.source.scenario);
        if (scenario.projectId !== input.snapshot.projectId || scenario.engineVersion !== input.snapshot.engineVersion) return failure(issue('SCENARIO_VERSION', 'Scenario does not match snapshot'));
        for (const [variableId, value] of Object.entries(scenario.initialProgress)) {
          const definition = input.snapshot.variables.find(item => item.id === variableId && item.scope === 'progress');
          if (!definition || typeof value !== definition.type) return failure(issue('SCENARIO_VARIABLE', `Initial progress ${variableId} is invalid`));
        }
        state = initial(input.snapshot, scenario.entry, scenario.initialProgress);
        state.story = input.story ?? { kind: 'main' };
        state.presentation.characterDifferences = {};
        for (const character of input.snapshot.characters) {
          const difference = character.differences?.find(item => item.id === character.initialDifferenceId) ?? character.differences?.[0];
          if (!difference) continue;
          const figure = input.snapshot.assets.find(asset => asset.assetId === difference.figure.assetId && (!difference.figure.variantId || asset.variantId === difference.figure.variantId));
          const avatarSource = difference.avatar?.kind === 'image' ? difference.avatar : null;
          const avatar = avatarSource ? input.snapshot.assets.find(asset => asset.assetId === avatarSource.assetId && (!avatarSource.variantId || asset.variantId === avatarSource.variantId)) : null;
          if (!figure || difference.avatar?.kind === 'image' && !avatar) return failure(issue('CHARACTER_DIFFERENCE_ASSET', `角色 ${character.name} 的差分素材不可用`));
          state.presentation.characterDifferences[character.id] = { differenceId: difference.id, changedAtMs: 0, figure: { assetId: figure.assetId, variantId: figure.variantId },
            avatar: avatar ? { kind: 'image', assetId: avatar.assetId, variantId: avatar.variantId } : difference.avatar?.kind === 'crop' ? difference.avatar : null,
            previous: null, elapsedMs: 0, durationMs: 0, figureVisible: true, avatarVisible: true };
        }
        for (const dependency of input.snapshot.lock.plugins) {
          const system = pluginSystem(this.ports, dependency.id);
          const supplied = scenario.pluginInitial[dependency.id];
          if (supplied !== undefined) {
            if (!system) return failure(issue('SCENARIO_PLUGIN', `Plugin ${dependency.id} has no state validator`));
            const validated = system.validate(supplied, 'progress'); if (!validated.ok) return failure(validated.error);
            scenario.pluginInitial[dependency.id] = validated.value;
          }
          state.plugins[dependency.id] = { version: dependency.version, stateVersion: 1,
            progress: scenario.pluginInitial[dependency.id] ?? system?.initialProgress(input.snapshot.pluginDocuments[dependency.id] ?? {}) ?? {} };
        }
      }
      if (state.position.statementId !== null) at(input.snapshot, state.position);
      if (input.source.kind === 'restored' && state.wait?.kind === 'plugin') {
        const wait = state.wait;
        const page = this.ports.contributions.pages.find(item => item.key === wait.page);
        const command = this.ports.contributions.commands.find(item => item.spec.key === wait.contribution);
        if (!page || !command?.resume) return failure(issue('PLUGIN_WAIT_PROVIDER', 'The saved interaction provider is unavailable'));
        if (!page.wait?.restorable) return failure(issue('PLUGIN_WAIT_CHECKPOINT', page.wait?.checkpointReason ?? 'This interaction requires the preceding checkpoint'));
        const validated = validatePluginData(page.inputSchema, wait.input ?? page.sampleInput);
        if (!validated.ok) return failure(validated.error);
      }
      const id = createId(), sessionId = restoreKey?.sessionId ?? createId();
      if (input.source.kind !== 'entry') {
        for (const process of [...state.presentation.objects.flatMap(object => object.processes), ...(state.presentation.camera?.processes ?? [])])
          process.owner = { ...process.owner, sessionId };
        for (const object of state.presentation.objects) if (object.imagePlayback?.mode === 'once' && object.imagePlayback.owner)
          object.imagePlayback.owner = { ...object.imagePlayback.owner, sessionId };
      }
      const prepared: Active = { id: sessionId, snapshot: input.snapshot, domain: input.domain, state, history,
        sequence: 0, status: state.phase === 'waiting' ? 'waiting' : state.phase === 'completed' ? 'ended' : 'ready',
        issue: null, token: state.phase === 'waiting' && state.position.statementId ? { sessionId, occurrence: state.occurrence, statementId: state.position.statementId } : null,
        trace: [], executed: [], scenario, voiceLocale, voiceResolution: null, voiceBinding: null, pending: null,
        pausedFrom: null, explanations: [], viewportAtEnd: null, previewLongTerm: null, routeBuilding: false,
        readingCarry: state.wait?.kind === 'say' ? { textShown: state.wait.textShown, textAnchor: state.wait.textAnchor } : null,
        pluginResumeToken: null };
      if (state.phase === 'waiting' && state.wait?.kind === 'say') {
        const instruction = at(input.snapshot, state.position)!;
        const targetObjectId = voiceTarget(instruction, prepared.state.presentation);
        const selection = chooseVoice(input.snapshot, instruction, voiceLocale, prepared.token!);
        if (selection.resolution.selected?.variantId === null) return failure(issue('VOICE_ASSET_MISSING', `Voice ${selection.resolution.selected.assetId} is missing`, instruction.source));
        prepared.voiceResolution = selection.resolution; prepared.voiceBinding = selection.binding;
        prepared.state.presentation.voice = selection.resolution.selected?.variantId ? {
          assetId: selection.resolution.selected.assetId, variantId: selection.resolution.selected.variantId,
          volume: typeof object(instruction.args).voiceVolume === 'number' ? Number(object(instruction.args).voiceVolume) / 100 : 1,
          targetObjectId, statementId: instruction.statementId } : null;
      }
      this.prepared.set(id, prepared);
      let reached = true, blockedAt: Position | null = null, routePreparation: RoutePreparation | undefined;
      if (input.target && (input.evaluateTarget && input.source.kind === 'entry' || state.position.sceneId !== input.target.sceneId || state.position.statementId !== input.target.statementId)) {
        const route = await this.buildRoute(prepared, input.target, input.routePolicy, input.targetPhase !== 'before');
        if (!route.ok) { this.prepared.delete(id); return route; }
        reached = route.value.reached; blockedAt = route.value.blockedAt; routePreparation = route.value.routePreparation;
      }
      prepared.routeBuilding = false;
      return success({ id, sessionId, snapshotId: input.snapshot.snapshotId, restoreKey: restoreKey ?? null,
        state: clone(prepared.state), voiceBinding: prepared.voiceBinding, reached, blockedAt, issues: [], ...(routePreparation ? { routePreparation } : {}) });
    } catch (error) { return failure(asIssue(error)); }
  }

  activate(preparedId: Id): Result<RuntimeInspection> {
    if(this.execution)return failure(issue('SESSION_BUSY','Current execution must finish before session activation'));
    const prepared = this.prepared.get(preparedId); if (!prepared) return failure(issue('PREPARED_MISSING', 'Prepared session is unavailable'));
    if (this.active?.pending) return failure(issue('LONG_TERM_PENDING', 'Long-term commit must finish before switching sessions'));
    if (prepared.previewLongTerm && !equal(prepared.previewLongTerm, this.ports.longTerm.current(prepared.domain))) {
      prepared.pending = { sequence: prepared.sequence, next: clone(prepared.previewLongTerm), base: clone(this.ports.longTerm.current(prepared.domain)) };
    } else prepared.previewLongTerm = null;
    this.previewInstructionLimit = null;
    this.active = prepared; this.prepared.delete(preparedId); return success(this.inspect()!);
  }
  disposePrepared(preparedId: Id): void { this.prepared.delete(preparedId); }
  /** Leaving waits for the current instruction and its persistence receipt before releasing its owner. */
  async waitForIdle(): Promise<void> { while (this.execution) await this.execution; }
  dispose(): void { this.active = null; this.prepared.clear(); }
  inspect(sessionId?: Id): RuntimeInspection | null {
    const active = this.active; if (!active || sessionId && active.id !== sessionId) return null;
    return { sessionId: active.id, snapshotId: active.snapshot.snapshotId, sequence: active.sequence, state: clone(active.state),
      history: clone(active.history), token: active.token && clone(active.token), status: this.pauseReasons.size ? 'paused' : active.status, issue: active.issue,
      pendingLongTerm: active.pending !== null, trace: clone(active.trace) };
  }
  /** Frame and input checks read only activity, without copying state or execution history. */
  inspectActivity(sessionId?: Id): RuntimeActivity | null {
    const active = this.active; if (!active || sessionId && active.id !== sessionId) return null;
    return { sessionId: active.id, sequence: active.sequence, token: active.token && { ...active.token },
      status: this.pauseReasons.size ? 'paused' : active.status, pendingLongTerm: active.pending !== null,
      waitKind: active.state.wait?.kind ?? null };
  }
  pluginWaitPolicy(): { restorable: boolean; reason: string | null } {
    const wait = this.active?.state.wait;
    if (wait?.kind !== 'plugin') return { restorable: true, reason: null };
    const page = this.ports.contributions.pages.find(item => item.key === wait.page);
    const restorable = !!page?.wait?.restorable && !!this.ports.contributions.commands.find(item => item.spec.key === wait.contribution)?.resume;
    return { restorable, reason: restorable ? null : page?.wait?.checkpointReason ?? '当前交互需要恢复最近检查点' };
  }
  elapsePlayTime(deltaMs: number): void {
    const active = this.active;
    if (active && !this.pauseReasons.size && active.status !== 'paused' && active.status !== 'error' && active.status !== 'ended' && Number.isFinite(deltaMs) && deltaMs > 0)
      active.state.playTimeMs += deltaMs;
  }
  syncPresentation(sessionId: Id, captured: PresentationState): Result<void> {
    const active = this.active;
    if (!active || active.id !== sessionId) return failure(issue('SESSION_STALE', 'Presentation belongs to another session'));
    const parsed = PresentationStateSchema.safeParse(captured);
    if (!parsed.success) return failure(issue('PRESENTATION_INVALID', parsed.error.message));
    const reading = active.state.presentation.text.reading;
    active.state.presentation = clone(parsed.data);
    if (reading) active.state.presentation.text.reading = clone(reading);
    return success(undefined);
  }
  checkpointsFor(sessionId: Id): Checkpoint[] { return this.active?.id === sessionId ? [...this.checkpoints.values()]
    .filter(item => item.sessionId === sessionId && item.checkpoint.projectId === this.active!.snapshot.projectId && item.checkpoint.snapshotId === this.active!.snapshot.snapshotId)
    .map(item => clone(item.checkpoint)) : []; }

  start(): Promise<Result<RuntimeInspection>> {
    return this.exclusively(() => this.startOwned(), false);
  }
  /** Author previews can execute one real instruction while media completes normally. */
  startPreviewInstruction(): Promise<Result<RuntimeInspection>> {
    const active = this.active;
    if (!active || active.domain.kind === 'player') return Promise.resolve(failure(issue('PREVIEW_DOMAIN', 'A preview session is required')));
    this.previewInstructionLimit = active.state.occurrence + 1;
    return this.start();
  }
  setPreviewPaused(paused: boolean): Result<void> {
    const active = this.active;
    if (!active || active.domain.kind === 'player') return failure(issue('PREVIEW_DOMAIN', 'A preview session is required'));
    if (paused && active.status !== 'paused') { active.pausedFrom = active.status; active.status = 'paused'; }
    if (!paused && active.status === 'paused') { active.status = active.pausedFrom ?? 'ready'; active.pausedFrom = null; }
    return success(undefined);
  }
  private async startOwned(): Promise<Result<RuntimeInspection>> {
    const active = this.active; if (!active) return failure(issue('SESSION_MISSING', 'No active session'));
    if (active.pending && active.previewLongTerm) { const result = await this.retryLongTermOwned(); if (!result.ok) return result; }
    if (active.state.phase !== 'entry') {
      const instruction = at(active.snapshot, active.state.position);
      if ((active.state.pendingReadStatementId && (active.state.phase === 'completed' || ['say', 'choose', 'getUserInput', 'video'].includes(instruction!.opcode))) ||
        (active.state.wait?.kind === 'say' && instruction?.continuation !== 'wait')) {
        const retried = await this.commit(active, clone(active.state), clone(this.ports.longTerm.current(active.domain)), null, active.token, 'statement', false, null, true);
        if (!retried.ok) return failure(retried.error);
      }
      return this.run();
    }
    if (active.sequence === 0 && active.scenario) {
      const result = await this.commit(active, clone(active.state), clone(this.ports.longTerm.current(active.domain)), null, null, 'start');
      if (!result.ok) return failure(result.error);
    }
    return this.run();
  }

  retryLongTerm(): Promise<Result<RuntimeInspection>> {
    return this.exclusively(() => this.retryLongTermOwned(), true);
  }
  private async retryLongTermOwned(): Promise<Result<RuntimeInspection>> {
    const active = this.active; if (!active?.pending) return failure(issue('LONG_TERM_NONE', 'No long-term write needs retry'));
    const { sequence, next: value, base } = active.pending;
    let result: Result<{ revision: number }>;
    try { result = await this.ports.longTerm.commitRuntimeLongTerm({ domain: active.domain, sessionId: active.id,
      sequence, expectedRevision: value.revision, next: clone(value), base: clone(base) }); }
    catch (error) { return failure(asIssue(error)); }
    if (!result.ok) return failure(result.error);
    if (this.active === active) { active.pending = null; active.previewLongTerm = null; active.issue = null; active.status = active.state.phase === 'waiting' ? 'waiting' : active.state.phase === 'completed' ? 'ended' : 'ready'; }
    return success(this.inspect()!);
  }
  /** A host calls this only after a previously blocked media instance actually starts. */
  confirmMediaStarted(token: ExecutionToken): Promise<Result<RuntimeInspection>> {
    return this.exclusively(() => this.confirmMediaStartedOwned(token), true);
  }
  private async confirmMediaStartedOwned(token: ExecutionToken): Promise<Result<RuntimeInspection>> {
    const active=this.active;
    if(!active||active.id!==token.sessionId)return failure(issue('TOKEN_STALE','Media belongs to another execution'));
    if(active.pending)return failure(issue('LONG_TERM_PENDING','Long-term write needs retry'));
    const instruction=active.snapshot.scenes.flatMap(scene=>scene.instructions).find(item=>item.statementId===token.statementId);
    if (instruction?.opcode === 'video' && tokenEqual(active.token, token))
      return this.confirmPresentationEnteredOwned(token, true);
    if(!active.trace.some(item=>tokenEqual(item.token,token)))return failure(issue('TOKEN_STALE','Media belongs to another execution'));
    const args=object(instruction?.args),id=String(args.galleryId??'');
    if(!id||!['bgm','video'].includes(instruction?.opcode??''))return success(this.inspect()!);
    const key=instruction!.opcode==='video'?'video':'music';
    const base=clone(this.ports.longTerm.current(active.domain)),next=clone(base);if(next[key].includes(id))return success(this.inspect()!);
    next[key].push(id);const sequence=++active.sequence;
    const result=await this.ports.longTerm.commitRuntimeLongTerm({domain:active.domain,sessionId:active.id,sequence,expectedRevision:next.revision,next,base});
    if(!result.ok){active.pending={sequence,next,base};active.status='error';active.issue=result.error;return failure(result.error);}
    return success(this.inspect()!);
  }
  /** The host confirms the same waiting target after preparing its real presentation. */
  confirmPresentationEntered(token: ExecutionToken): Promise<Result<RuntimeInspection>> {
    return this.exclusively(() => this.confirmPresentationEnteredOwned(token), true);
  }
  private async confirmPresentationEnteredOwned(token: ExecutionToken, mediaStarted = false): Promise<Result<RuntimeInspection>> {
    const active = this.active;
    if (!active || !tokenEqual(active.token, token)) return failure(issue('TOKEN_STALE', 'Presentation belongs to another execution'));
    if (active.pending) return failure(issue('LONG_TERM_PENDING', 'Long-term write needs retry'));
    if (!['say', 'choose', 'getUserInput', 'video'].includes(at(active.snapshot, active.state.position)!.opcode)) return success(this.inspect()!);
    const committed = await this.commit(active, clone(active.state), clone(this.ports.longTerm.current(active.domain)), null,
      token, 'statement', false, null, true, { presentationEntered: true, mediaStarted });
    return committed.ok ? this.run() : failure(committed.error);
  }
  continueLoop(): Promise<Result<RuntimeInspection>> {
    return this.exclusively(() => this.continueLoopOwned(), false);
  }
  private async continueLoopOwned(): Promise<Result<RuntimeInspection>> {
    const active = this.active; if (!active || active.issue?.code !== 'RUNTIME_LOOP') return failure(issue('RUNTIME_LOOP_NONE', 'No diagnostic loop is paused'));
    active.issue = null; active.status = 'ready'; return this.run();
  }

  dispatch(event: RuntimeEvent): Promise<Result<RuntimeInspection>> {
    if(this.execution&&event.kind==='plugin')return Promise.resolve(failure(issue('TOKEN_IN_PROGRESS','Plugin completion is in progress')));
    return this.exclusively(() => this.dispatchOwned(event), event.kind==='animation'||event.kind==='timer');
  }
  private async dispatchOwned(event: RuntimeEvent): Promise<Result<RuntimeInspection>> {
    const active = this.active; if (!active) return failure(issue('SESSION_MISSING', 'No active session'));
    if (active.pending) return failure(issue('LONG_TERM_PENDING', 'Long-term write needs retry'));
    if (this.pauseReasons.size || active.status === 'paused') return failure(issue('SESSION_PAUSED', 'Session is paused'));
    if (active.state.phase !== 'waiting' || !tokenEqual(active.token, event.token)) return failure(issue('TOKEN_STALE', 'Completion belongs to another statement occurrence'));
    try {
    // Retry the current target before another departure can replace its source identity.
    const continuingDialogue = active.state.wait?.kind === 'say' && at(active.snapshot, active.state.position)?.continuation !== 'wait';
    if ((active.state.pendingReadStatementId || continuingDialogue) && ['say', 'choose', 'getUserInput', 'video'].includes(at(active.snapshot, active.state.position)!.opcode)) {
      const retried = await this.commit(active, clone(active.state), clone(this.ports.longTerm.current(active.domain)), null, active.token, 'statement', false, null, true);
      if (!retried.ok) return failure(retried.error);
      if (active.state.phase !== 'waiting') return this.run();
      if (active.state.pendingReadStatementId || continuingDialogue) return success(this.inspect()!);
    }
    const waiting = active.state.wait; const instruction = at(active.snapshot, active.state.position)!;
    if (waiting?.kind === 'say') {
      if (event.kind !== 'advance') return failure(issue('EVENT_KIND', 'Say waits for advance'));
      const reading = active.state.presentation.text.reading, total = graphemes(active.state.presentation.text.text).length;
      if (reading?.mode === 'nvl' && reading.end === null) return success(this.inspect()!);
      if (!waiting.textComplete) return this.updateTextProgressOwned({ token: event.token,
        textShown: reading?.mode === 'nvl' ? reading.end! : total });
      if (reading?.mode === 'nvl' && reading.end! < total) {
        reading.start = reading.end!; reading.end = null; reading.page++; waiting.textComplete = false;
        waiting.textAnchor = reading.start; active.sequence++; return success(this.inspect()!);
      }
    } else if (waiting?.kind === 'choice') {
      if (event.kind !== 'choose' || !event.optionId) return failure(issue('EVENT_KIND', 'Choice requires an option ID'));
      if (!waiting.optionIds.includes(event.optionId)) return failure(issue('OPTION_STALE', 'Option is not available at this occurrence'));
      const option = (object(instruction.args).options as unknown[]).map(object).find(item => item.id === event.optionId)!;
      const staged = clone(active.state); staged.route.push({ statementId: instruction.statementId, occurrence: staged.occurrence, optionId: event.optionId });
      staged.position = target(active.snapshot, String(object(option.target).sceneId), object(option.target).labelId as Id | null);
      enterScene(active.snapshot, staged, staged.position);
      const committed = await this.commit(active, staged, clone(this.ports.longTerm.current(active.domain)), null, active.token, 'statement', false);
      if (!committed.ok) return failure(committed.error);
      return this.run();
    } else if (waiting?.kind === 'input') {
      const args = object(instruction.args); const value = event.text;
      if (event.kind === 'cancel') {
        if (!args.cancelTarget) return success(this.inspect()!);
        const staged = clone(active.state), position = target(active.snapshot, String(object(args.cancelTarget).sceneId), object(args.cancelTarget).labelId as Id | null);
        enterScene(active.snapshot, staged, position);
        const committed = await this.commit(active, staged, clone(this.ports.longTerm.current(active.domain)), null, active.token, 'statement', false);
        if (!committed.ok) return failure(committed.error); return this.run();
      }
      if (event.kind !== 'input' || value === undefined) return failure(issue('EVENT_KIND', 'Input requires text'));
      const before = clone(active.previewLongTerm ?? this.ports.longTerm.current(active.domain));
      const validated = this.validateInput(active, instruction, value, before); if (!validated.ok) return failure(validated.error);
      const staged = clone(active.state), longTerm = clone(before); setVariable(active.snapshot, staged, longTerm, String(args.variableId), value, 'assign');
      next(active.snapshot, staged); staged.wait = null;
      const committed = await this.commit(active, staged, longTerm, null, active.token, 'statement', false); if (!committed.ok) return failure(committed.error);
      return this.run();
    } else if (waiting?.kind === 'timer' && event.kind !== 'timer' && !(event.kind === 'advance' && instruction.skippable)) return failure(issue('EVENT_KIND', 'Timer waits for completion'));
    else if (waiting?.kind === 'animation' && event.kind !== 'animation' && !(event.kind === 'advance' && instruction.skippable && instruction.opcode !== 'video')) return failure(issue('EVENT_KIND', 'Animation waits for completion'));
    else if (waiting?.kind === 'plugin') {
      const page = this.ports.contributions.pages.find(item => item.key === waiting.page);
      if (event.kind === 'cancel' && page?.wait?.cancel !== 'continue') return success(this.inspect()!);
      if (event.kind !== 'plugin' && event.kind !== 'cancel') return failure(issue('EVENT_KIND', 'Plugin waits for completion'));
      if (page && event.kind === 'plugin') { const validated = validatePluginData(page.resultSchema, event.result ?? null); if (!validated.ok) return failure(validated.error); }
      const resumeKey = `${event.token.sessionId}:${event.token.occurrence}:${event.token.statementId}`;
      if (active.pluginResumeToken === resumeKey) return failure(issue('TOKEN_IN_PROGRESS', 'Plugin completion is in progress'));
      const contribution = this.ports.contributions.commands.find(item => item.spec.key === waiting.contribution);
      if (!contribution?.resume) return failure(issue('PLUGIN_RESUME_MISSING', 'Plugin command cannot resume'));
      const pluginId = waiting.contribution.split('/')[0]!;
      const staged = clone(active.state), longTerm = clone(this.ports.longTerm.current(active.domain));
      const current = staged.plugins[pluginId];
      if (!current && pluginSystem(this.ports, pluginId)) return failure(issue('PLUGIN_STATE_MISSING', 'Plugin progress is unavailable'));
      if (pluginSystem(this.ports, pluginId)) initializePluginLongTerm(active.snapshot, longTerm, this.ports, pluginId);
      active.pluginResumeToken = resumeKey; const beforeSequence = active.sequence;
      try {
      const resumed = await contribution.resume({ resumeData: waiting.resumeData, result: event.result ?? null, state: current?.progress ?? {}, token: event.token });
      if (this.active !== active || active.sequence !== beforeSequence || !tokenEqual(active.token, event.token) || active.state.wait !== waiting) return failure(issue('TOKEN_STALE', 'Plugin completion belongs to another state'));
      if (!resumed.ok) return failure(resumed.error);
      const system = pluginSystem(this.ports, pluginId);
      if (system) {
        const valid = system.validate(resumed.value.progress, 'progress'); if (!valid.ok) return failure(valid.error);
        resumed.value.progress = valid.value;
        if (resumed.value.longTermDelta !== null) { const validLongTerm = system.validate(resumed.value.longTermDelta, 'longTerm'); if (!validLongTerm.ok) return failure(validLongTerm.error); resumed.value.longTermDelta = validLongTerm.value; }
      }
      if (current) current.progress = resumed.value.progress;
      applyPluginPresentation(staged, resumed.value.presentation, event.token);
      if (resumed.value.longTermDelta !== null) {
        if (!longTerm.plugins[pluginId]) return failure(issue('PLUGIN_STATE_MISSING', 'Plugin long-term state is unavailable'));
        longTerm.plugins[pluginId]!.data = resumed.value.longTermDelta;
      }
      if (resumed.value.wait) {
        const nextPage = this.ports.contributions.pages.find(item => item.key === resumed.value.wait!.page);
        if (!nextPage) return failure(issue('PLUGIN_WAIT_PROVIDER', 'The next interaction page is unavailable'));
        const validated = validatePluginData(nextPage.inputSchema, resumed.value.wait.input); if (!validated.ok) return failure(validated.error);
        staged.wait = { kind: 'plugin', contribution: waiting.contribution, ...resumed.value.wait };
      }
      else { next(active.snapshot, staged); staged.wait = null; }
      const prepared = await this.prepareProviderCommands(active, staged, resumed.value.presentation, event.token); if (!prepared.ok) return failure(prepared.error);
      let committed: Result<void>;
      try { committed = await this.commit(active, staged, longTerm, resumed.value.presentation, active.token, 'statement', false, prepared.value); }
      finally { prepared.value?.dispose(); }
      if (!committed.ok) return failure(committed.error); return this.run();
      } finally { if (active.pluginResumeToken === resumeKey) active.pluginResumeToken = null; }
    }
    if (waiting?.kind === 'say') active.readingCarry = { textShown: waiting.textShown, textAnchor: waiting.textAnchor };
    const staged = clone(active.state); let delta: PresentationDelta | null = null;
    if (waiting?.kind === 'say') staged.pendingReadStatementId = event.token.statementId;
    if (waiting?.kind === 'animation' && event.kind === 'advance') {
      const finished = await this.ports.stage.prepare({ state: staged, token: event.token, opcode: '$finishAnimationWait', args: {} });
      if (!finished.ok) return failure(finished.error);
      Object.assign(staged, finished.value.state); delta = finished.value.delta;
    }
    next(active.snapshot, staged); staged.wait = null;
    const committed = await this.commit(active, staged, clone(this.ports.longTerm.current(active.domain)), delta, active.token, 'statement', false);
    if (!committed.ok) return failure(committed.error);
    return this.run();
    } catch (error) { return failure(asIssue(error)); }
  }

  private async run(): Promise<Result<RuntimeInspection>> {
    const active = this.active; if (!active) return failure(issue('SESSION_MISSING', 'No active session'));
    let continuous = 0;
    while (this.active === active && active.state.phase === 'entry' && !active.pending && active.status !== 'paused' && !this.pauseReasons.size) {
      if (this.previewInstructionLimit !== null && active.state.occurrence >= this.previewInstructionLimit) break;
      if (continuous++ >= 10000) { active.status = 'paused'; active.issue = issue('RUNTIME_LOOP', '10000 instructions executed without a wait point'); break; }
      const result = await this.execute(active);
      if (!result.ok) { active.status = 'error'; active.issue = result.error; return failure(result.error); }
      if (continuous % 200 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return success(this.inspect()!);
  }

  private async completeEntry(active: Active, state: RuntimeState, token: ExecutionToken): Promise<void> {
    if (state.entryPresentation?.completed !== false) return;
    if (!active.routeBuilding && this.ports.beforeDialogue) {
      const entered = await this.ports.beforeDialogue({ sessionId: active.id, token, state: clone(state), snapshot: active.snapshot });
      if (!entered.ok) throw entered.error;
      if (this.active !== active) throw issue('SESSION_STALE', '入口演出所属会话已结束');
    }
    state.entryPresentation.completed = true;
  }

  private async execute(active: Active): Promise<Result<void>> {
    let instruction: Instruction | null = null;
    try {
      instruction = at(active.snapshot, active.state.position);
      if (!instruction) return failure(issue('STATEMENT_MISSING', 'Cannot execute a completed position'));
      const token: ExecutionToken = { sessionId: active.id, occurrence: active.state.occurrence + 1, statementId: instruction.statementId };
      const staged = clone(active.state), longTerm = clone(active.previewLongTerm ?? this.ports.longTerm.current(active.domain));
      staged.occurrence = token.occurrence; const args = object(instruction.args); let delta: PresentationDelta | null = null;
      let selection: ReturnType<typeof chooseVoice> | null = null;
      if (instruction.condition) {
        const root = evaluateTree(instruction.condition, { state: staged, longTerm, variables: active.snapshot.variables, functions: pureFunctions(this.ports, staged, longTerm) });
        this.capture(active, token, instruction.source, 'when', null, root, 'entry');
        if (root.status === 'error') throw root.issue!;
        if (typeof root.value !== 'boolean') throw issue('EXPR_TYPE', 'Condition must be boolean');
        if (!root.value) { next(active.snapshot, staged); const committed = await this.commit(active, staged, longTerm, null, token, 'statement'); return committed.ok ? success(undefined) : failure(committed.error); }
      }
      if (instruction.opcode === 'setVar') {
        const raw = valueFor(args.value, staged, longTerm, active.snapshot, undefined, this.ports);
        setVariable(active.snapshot, staged, longTerm, String(args.variableId), raw, String(args.op ?? 'assign')); next(active.snapshot, staged);
      } else if (instruction.opcode === 'callScene') {
        const targetScene = scene(active.snapshot, String(args.sceneId)); const parameters = object(args.parameters);
        const locals = Object.fromEntries(targetScene.scene.locals.map(item => [item.id, item.initial])) as Record<Id, Scalar>;
        for (const parameter of targetScene.scene.parameters) {
          const variable = targetScene.scene.locals.find(item => item.id === parameter.variableId);
          if (parameters[parameter.variableId] === undefined && !hasSceneParameterDefault(parameter, variable)) throw issue('CALL_ARGUMENT', `Missing parameter ${parameter.variableId}`);
          const raw = parameters[parameter.variableId] === undefined ? parameter.defaultValue : valueFor(parameters[parameter.variableId], staged, longTerm, active.snapshot, undefined, this.ports);
          if (raw === null || raw === undefined) throw issue('CALL_ARGUMENT', `Missing parameter ${parameter.variableId}`);
          if (!variable || typeof raw !== variable.type || typeof raw === 'number' && !Number.isFinite(raw)) throw issue('CALL_ARGUMENT', `Parameter ${parameter.variableId} has wrong type`);
          locals[parameter.variableId] = raw;
        }
        const caller = staged.frames.at(-1); if (!caller) throw issue('FRAME_MISSING', 'Caller frame is unavailable');
        const receiver = args.receiver ? object(args.receiver) : null;
        const receiverVariable = receiver ? projectVariable(active.snapshot, caller, String(receiver.variableId)) : null;
        if (receiver && (!receiverVariable || receiverVariable.scope !== receiver.scope || receiverVariable.type !== targetScene.scene.returns)) throw issue('RETURN_TYPE', 'Receiver is incompatible with called scene');
        const frame: Frame = { id: createId(), sceneId: targetScene.scene.id, locals, returnTo: returnPosition(active.snapshot, staged),
          receiver: receiver ? { scope: receiver.scope as 'progress' | 'local', variableId: String(receiver.variableId), frameId: receiver.scope === 'local' ? caller.id : null } : null };
        staged.frames.push(frame); staged.position = target(active.snapshot, targetScene.scene.id, args.labelId as Id | null ?? null); staged.phase = 'entry';
        staged.entryPresentation={sceneId:targetScene.scene.id,instanceId:createId(),completed:false};
      } else if (instruction.opcode === 'changeScene') {
        const position = target(active.snapshot, String(args.sceneId), args.labelId as Id | null ?? null);
        enterScene(active.snapshot, staged, position, true);
      } else if (instruction.opcode === 'return') {
        const frame = staged.frames.at(-1); if (!frame?.returnTo) throw issue('TOP_LEVEL_RETURN', 'Top-level scene cannot return');
        const declared = scene(active.snapshot, frame.sceneId).scene.returns;
        const returned = args.value === undefined ? undefined : valueFor(args.value, staged, longTerm, active.snapshot, undefined, this.ports);
        if (declared === 'void' ? returned !== undefined : typeof returned !== declared) throw issue('RETURN_TYPE', `Scene return must be ${declared}`);
        staged.frames.pop();
        if (frame.receiver && returned !== undefined) {
          const caller = staged.frames.find(item => item.id === frame.receiver!.frameId);
          if (frame.receiver.scope === 'local') { if (!caller) throw issue('FRAME_MISSING', 'Receiver frame is unavailable'); caller.locals[frame.receiver.variableId] = returned; }
          else staged.progress[frame.receiver.variableId] = returned;
        }
        resumeAt(active.snapshot, staged, frame.returnTo);
      } else if (instruction.opcode === 'jumpLabel') {
        staged.position = target(active.snapshot, staged.position.sceneId, String(args.labelId)); staged.phase = 'entry';
      } else if (instruction.opcode === 'choose') {
        const available = this.evaluateChoices(active, staged, longTerm, instruction, token, 'entry');
        staged.wait = { kind: 'choice', ...available }; staged.phase = 'waiting';
      } else if (instruction.opcode === 'getUserInput') {
        staged.wait = { kind: 'input', draft: String(args.defaultText ?? '') }; staged.phase = 'waiting';
      } else if (instruction.opcode === 'readingMode' || instruction.opcode === 'clearPage') {
        const text = staged.presentation.text, previous = text.reading;
        if (instruction.opcode === 'readingMode' || previous?.mode === 'nvl') {
          text.reading = { mode: instruction.opcode === 'clearPage' ? 'nvl' : args.mode === 'nvl' ? 'nvl' : 'adv',
            retainIllustrations: instruction.opcode === 'clearPage' ? previous!.retainIllustrations : args.retainIllustrations === true,
            page: (previous?.page ?? 0) + 1, start: 0, end: null };
          text.parts = []; text.text = ''; text.speakerName = ''; text.portraitObjectId = null; text.avatarSelection = { mode: 'auto' }; text.avatarId = null;
          delta = { objects: [], effects: [], audio: [], text: clone(text) };
        }
        next(active.snapshot, staged);
      } else if (instruction.opcode === 'say') {
        await this.completeEntry(active, staged, token);
        const content = DialogueContentSchema.parse(args.text ?? '');
        const segments = dialogueSegments(content).map(segment => ({ ...segment, text: interpolate(segment.text, staged, longTerm, active.snapshot, this.ports) }));
        const body = segments.map(segment => segment.text).join(''); if (!body) throw issue('SAY_EMPTY', 'Dialogue text is empty');
        applyDialogue(staged, active.snapshot, instruction, body, active.readingCarry, typeof content === 'string' ? undefined : segments);
        const targetObjectId = voiceTarget(instruction, staged.presentation);
        selection = chooseVoice(active.snapshot, instruction, active.voiceLocale, token);
        if (selection.resolution.selected?.variantId === null) throw issue('VOICE_ASSET_MISSING', `Voice ${selection.resolution.selected.assetId} is missing`, instruction.source);
        staged.presentation.voice = selection.resolution.selected ? {
          assetId: selection.resolution.selected.assetId, variantId: selection.resolution.selected.variantId!,
          volume: Number(args.voiceVolume ?? 100) / 100, targetObjectId, statementId: instruction.statementId } : null;
        staged.phase = 'waiting'; delta = { objects: [], effects: [], audio: [], voiceBinding: selection.binding,
          text: clone(staged.presentation.text) };
      } else if (instruction.opcode === 'wait') {
        const durationMs = Number(args.durationMs ?? 1000);
        if (durationMs === 0 || instruction.continuation !== 'wait') next(active.snapshot, staged);
        else { staged.wait = { kind: 'timer', remainingMs: durationMs }; staged.phase = 'waiting'; }
      } else if (['setAnimation', 'setComplexAnimation', 'setTransform', 'setTempAnimation', 'video', 'intro'].includes(instruction.opcode) ||
        ['changeBg', 'changeFigure', 'changeIllustration', 'changeIllustrationDiff'].includes(instruction.opcode) && object(args.playback).wait === true) {
        const prepared = await this.ports.stage.prepare({ state: staged, token, opcode: instruction.opcode,
          args: runtimeArgs(instruction.args, staged, longTerm, active.snapshot, this.ports) });
        if (!prepared.ok) throw prepared.error; Object.assign(staged, prepared.value.state); delta = prepared.value.delta;
        if (instruction.continuation === 'wait' && !(instruction.opcode === 'intro' && args.op === 'clear')) {
          staged.wait = { kind: 'animation', processIds: [...staged.presentation.objects.flatMap(item => item.processes),
            ...(staged.presentation.camera?.processes ?? [])].filter(process => tokenEqual(process.owner, token)).map(process => process.id).concat(
              staged.presentation.objects.filter(item => item.imagePlayback?.owner && tokenEqual(item.imagePlayback.owner, token)).map(item => item.id)) };
          staged.phase = 'waiting';
        } else next(active.snapshot, staged);
      } else if (['unlockCg','unlockBgm','unlockVideo'].includes(instruction.opcode)) {
        const id = String(args.entryId);
        if (instruction.opcode === 'unlockCg') {
          const entry = active.snapshot.gallery.find(item => item.id === id && item.kind === 'cg');
          const ids = Array.isArray(args.differenceIds) ? args.differenceIds.map(String) : [];
          if (!ids.length || ids.some(diff => !entry?.differences?.some(item => item.id === diff))) throw issue('GALLERY_DIFFERENCE', 'CG 解锁需要有效差分');
          longTerm.cg[id] = [...new Set([...(longTerm.cg[id] ?? []), ...ids])];
        } else { const key = instruction.opcode === 'unlockBgm' ? 'music' : 'video';
          if (!longTerm[key].includes(id)) longTerm[key].push(id); }
        next(active.snapshot, staged);
      } else if (instruction.opcode === 'end') {
        if (staged.story?.kind !== 'afterstory' && typeof args.endingId === 'string' && args.endingId.trim() && !longTerm.endings.includes(args.endingId)) longTerm.endings.push(args.endingId);
        const endTarget = object(args.target);
        if (endTarget.kind === 'scene') { const endingScene = scene(active.snapshot, String(endTarget.sceneId));
          staged.frames = [{ id: createId(), sceneId: endingScene.scene.id,
            locals: Object.fromEntries(endingScene.scene.locals.map(item => [item.id, item.initial])), returnTo: null, receiver: null }];
          staged.position = target(active.snapshot, endingScene.scene.id, endTarget.labelId as Id | null ?? null); staged.phase = 'entry'; staged.wait = null;
          staged.entryPresentation = { sceneId: endingScene.scene.id, instanceId: createId(), completed: false }; }
        else { staged.frames = []; staged.phase = 'completed'; staged.wait = null; staged.position.statementId = null; }
      } else if (['label', 'comment', 'showVars'].includes(instruction.opcode)) next(active.snapshot, staged);
      else if (instruction.opcode === 'callSteam' && (active.previewLongTerm || active.scenario?.externalPolicy === 'simulate')) next(active.snapshot, staged);
      else {
        const plugin = this.ports.contributions.commands.find(item => item.spec.key === instruction!.opcode);
        if (plugin) {
          const pluginId = instruction.opcode.split('/')[0]!;
          if (pluginSystem(this.ports, pluginId)) initializePluginLongTerm(active.snapshot, longTerm, this.ports, pluginId);
          const current = staged.plugins[pluginId]; const result = await plugin.execute({ args: runtimeArgs(instruction.args, staged, longTerm, active.snapshot, this.ports),
            state: current?.progress ?? {}, token }); if (!result.ok) throw result.error;
          const system = pluginSystem(this.ports, pluginId);
          if (system) { const valid = system.validate(result.value.progress, 'progress'); if (!valid.ok) throw valid.error; result.value.progress = valid.value;
            if (result.value.longTermDelta !== null) { const validLongTerm = system.validate(result.value.longTermDelta, 'longTerm'); if (!validLongTerm.ok) throw validLongTerm.error; result.value.longTermDelta = validLongTerm.value; } }
          if (current) current.progress = result.value.progress;
          else if (pluginSystem(this.ports, pluginId)) throw issue('PLUGIN_STATE_MISSING', `Plugin ${pluginId} is not initialized`);
          if (result.value.longTermDelta !== null) {
            const old = longTerm.plugins[pluginId]; if (!old) throw issue('PLUGIN_STATE_MISSING', `Plugin ${pluginId} has no long-term state`);
            old.data = result.value.longTermDelta;
          }
          delta = result.value.presentation;
          applyPluginPresentation(staged, delta, token);
          if (result.value.wait) {
            const page = this.ports.contributions.pages.find(item => item.key === result.value.wait!.page);
            if (!page || !plugin.resume) throw issue('PLUGIN_WAIT_PROVIDER', `Interaction ${result.value.wait.page} has no page or resume provider`, instruction.source);
            const validated = validatePluginData(page.inputSchema, result.value.wait.input); if (!validated.ok) throw validated.error;
            if (!this.routeProbes.has(active) && !page.wait?.restorable && !this.checkpointsFor(active.id).length) this.makeCheckpoint(active);
            staged.wait = { kind: 'plugin', contribution: instruction.opcode, ...result.value.wait }; staged.phase = 'waiting';
          }
          else next(active.snapshot, staged);
        } else {
          if (instruction.opcode === 'callSteam') {
            const platform = this.ports.contributions.platform.find(item => item.actions.some(action => action.name === 'achievement.unlock'));
            if (!platform && args.unavailable === 'required') throw issue('PLATFORM_UNAVAILABLE', 'Required Steam action is unavailable');
            if (platform) {
              const result = await platform.invoke('achievement.unlock', { id: args.achievement as string }, active.domain);
              if (!result.ok) throw result.error;
              if (args.unavailable === 'required' && typeof result.value === 'object' && result.value !== null &&
                !Array.isArray(result.value) && result.value.status === 'skipped') throw issue('PLATFORM_UNAVAILABLE', 'Required Steam action is unsupported');
            }
            next(active.snapshot, staged);
          } else {
            const prepared = await this.ports.stage.prepare({ state: staged, token, opcode: instruction.opcode,
              args: runtimeArgs(instruction.args, staged, longTerm, active.snapshot, this.ports) });
            if (!prepared.ok) throw prepared.error; Object.assign(staged, prepared.value.state); delta = prepared.value.delta;
            next(active.snapshot, staged);
          }
        }
      }
      if (staged.phase === 'waiting' || staged.phase === 'completed') await this.completeEntry(active, staged, token);
      if (staged.phase === 'completed' && staged.story?.kind === 'afterstory')
        longTerm.afterstoryCompleted = [...new Set([...(longTerm.afterstoryCompleted ?? []), staged.story.entryId])];
      const entryState = clone(active.state);
      const beforeSequence = active.sequence;
      const prepared = await this.prepareProviderCommands(active, staged, delta, token); if (!prepared.ok) return failure(prepared.error);
      let committed: Result<void>;
      try { committed = await this.commit(active, staged, longTerm, delta, token, 'statement', true, prepared.value,
        ['say', 'choose', 'getUserInput', 'video', 'end'].includes(instruction.opcode)); }
      finally { prepared.value?.dispose(); }
      if (!committed.ok && active.sequence === beforeSequence) return failure(committed.error);
      if (instruction.opcode === 'say') active.readingCarry = null;
      if (selection) { active.voiceResolution = selection.resolution; active.voiceBinding = selection.binding; }
      if (instruction.opcode === 'say' && !this.routeProbes.has(active)) {
        const part = active.state.presentation.text.parts.at(-1)!;
        active.history.push({ id: createId(), position: { sceneId: entryState.position.sceneId, statementId: instruction.statementId },
          occurrence: token.occurrence, speaker: active.state.presentation.text.speakerName, speakerKind: part.speakerKind,
          text: formatDialogue([part]), ...(part.segments ? { segments: dialogueRuns([part]) } : {}), textLocale: part.locale, voiceAssetId: selection?.resolution.selected?.assetId ?? null,
          locale: selection?.resolution.selected?.locale ?? active.voiceLocale, entryState, unavailableReason: null });
      }
      if (instruction.opcode === 'choose' && active.state.wait?.kind === 'choice' && !active.state.wait.optionIds.length) {
        active.issue = issue('CHOICE_LOCKED', 'No choice is available', instruction.source);
      }
      if (!committed.ok) return failure(committed.error);
      return success(undefined);
    } catch (error) { return failure(asIssue(error, instruction?.source)); }
  }

  private async prepareProviderCommands(active: Active, staged: RuntimeState, delta: PresentationDelta | null, token: ExecutionToken): Promise<Result<PreparedProviderCommands | null>> {
    if (!delta?.providerCommands?.length) return success(null);
    if (!this.ports.prepareProviderCommands) return failure(issue('STAGE_PROVIDER_COMMAND_UNAVAILABLE', 'The host does not support provider commands'));
    const sequence = active.sequence;
    const prepared = await this.ports.prepareProviderCommands({ sessionId: active.id, token, state: clone(staged.presentation), commands: clone(delta.providerCommands) });
    if (!prepared.ok) return prepared;
    if (!active.routeBuilding && this.active !== active || active.sequence !== sequence) { prepared.value.dispose(); return failure(issue('TOKEN_STALE', 'Provider preparation belongs to another state')); }
    staged.presentation = clone(prepared.value.state);
    return prepared;
  }
  private async commit(active: Active, staged: RuntimeState, longTerm: LongTerm, delta: PresentationDelta | null,
    token: ExecutionToken | null, reason: 'start' | 'statement' | 'debug', recordExecution = true, providerCommands: PreparedProviderCommands | null = null,
    readBoundary = false, confirmedPresentation: PresentationCommitReceipt | null = null): Promise<Result<void>> {
    const readingTarget = staged.phase === 'waiting' && ['say', 'choose', 'getUserInput', 'video'].includes(at(active.snapshot, staged.position)!.opcode);
    const readSource = reason === 'statement' && (readBoundary || readingTarget || staged.phase === 'completed') ? staged.pendingReadStatementId : undefined;
    const priorRead = longTerm.readStatements, priorFlow = clone(longTerm.flowEntries);
    if (readSource && !priorRead.includes(readSource)) longTerm.readStatements = [...priorRead, readSource];
    if(staged.phase==='completed'&&staged.story?.kind==='afterstory')longTerm.afterstoryCompleted=[...new Set([...(longTerm.afterstoryCompleted??[]),staged.story.entryId])];
    const sequence = active.sequence + 1; const prior = active.previewLongTerm ?? this.ports.longTerm.current(active.domain);
    const sampleFlow = (): Result<void> => {
      const sampled = this.ports.longTerm.prepareFlowUnlocks({ domain: active.domain, sessionId: active.id, snapshot: active.snapshot,
        sequence, reason, state: clone(staged), longTermAfter: clone(longTerm) });
      if (!sampled.ok) return failure(sampled.error);
      if (sampled.value.sessionId !== active.id || sampled.value.snapshotId !== active.snapshot.snapshotId ||
        sampled.value.sequence !== sequence || sampled.value.expectedLongTermRevision !== longTerm.revision)
        return failure(issue('FLOW_SAMPLE_STALE', 'Flow unlock sample does not match this state revision'));
      for (const entry of sampled.value.entries) if (!longTerm.flowEntries[entry.nodeId]) longTerm.flowEntries[entry.nodeId] = entry;
      return success(undefined);
    };
    const sampled = sampleFlow(); if (!sampled.ok) return sampled;
    staged.playTimeMs=Math.max(staged.playTimeMs,active.state.playTimeMs);
    const valid = RuntimeStateSchema.safeParse(staged); if (!valid.success) return failure(issue('STATE_INVALID', valid.error.message));
    if (providerCommands && !active.routeBuilding) { const committed = providerCommands.commit(); if (!committed.ok) return committed; }
    const videoWait = token && recordExecution && staged.wait?.kind === 'animation' && at(active.snapshot, staged.position)?.opcode === 'video';
    // Movies resume from their executable entry, never from an orphaned media completion wait.
    if (videoWait && !active.routeBuilding && !this.routeProbes.has(active)) this.makeCheckpoint(active);
    active.state = valid.data; active.sequence = sequence; active.token = staged.phase === 'waiting' ? token ?? active.token : null;
    active.status = staged.phase === 'waiting' ? 'waiting' : staged.phase === 'completed' ? 'ended' : 'ready'; active.issue = null;
    if (token && recordExecution && !this.routeProbes.has(active)) {
      const source = active.snapshot.scenes.flatMap(item => item.instructions).find(item => item.statementId === token.statementId)?.source;
      if (source) { active.trace.push({ token, source }); active.executed.push({ statementId: token.statementId, documentRevision: source.revision }); }
    }
    if (!videoWait && !this.routeProbes.has(active) && token && recordExecution && (staged.wait?.kind === 'choice' || staged.wait?.kind === 'say' || active.trace.length === 1) && this.pluginWaitPolicy().restorable) this.makeCheckpoint(active);
    const receipt = confirmedPresentation ?? (!active.routeBuilding ? await this.ports.onCommitted?.({ sessionId: active.id, sequence, token: token ?? { sessionId: active.id, occurrence: staged.occurrence, statementId: staged.position.statementId ?? active.snapshot.project.entry.sceneId }, state: clone(staged), delta, presentationPrepared: providerCommands !== null }) : undefined)
      ?? { presentationEntered: true, mediaStarted: false };
    if (readSource) {
      if (receipt.presentationEntered) { delete active.state.pendingReadStatementId; delete staged.pendingReadStatementId; }
      else {
        longTerm.readStatements = priorRead; longTerm.flowEntries = priorFlow;
        const withoutRead = sampleFlow(); if (!withoutRead.ok) return withoutRead;
      }
    }
    if (receipt.mediaStarted && token && (recordExecution || confirmedPresentation)) {
      const instruction = active.snapshot.scenes.flatMap(item => item.instructions).find(item => item.statementId === token.statementId);
      const args = object(instruction?.args), id = String(args.galleryId ?? '');
      if (id && instruction?.opcode === 'changeBg' && args.op !== 'clear' && typeof args.differenceId === 'string')
        longTerm.cg[id] = [...new Set([...(longTerm.cg[id] ?? []), args.differenceId])];
      if (id && (instruction?.opcode === 'bgm' && args.op !== 'stop' || instruction?.opcode === 'video')) {
        const key = instruction.opcode === 'video' ? 'video' : 'music'; if (!longTerm[key].includes(id)) longTerm[key].push(id);
      }
    }
    // Enter this dialogue before its departure can replace the previous source.
    const continuingDialogue = reason === 'statement' && receipt.presentationEntered && token && staged.wait?.kind === 'say' &&
      staged.position.statementId === token.statementId && at(active.snapshot, staged.position)?.continuation !== 'wait';
    if (continuingDialogue) {
      active.state.pendingReadStatementId = token.statementId;
      next(active.snapshot, active.state); active.state.wait = null;
      active.token = null; active.status = active.state.phase === 'completed' ? 'ended' : 'ready'; active.readingCarry = null;
    }
    if (active.routeBuilding) {
      active.previewLongTerm = clone(longTerm);
      return continuingDialogue && active.state.phase === 'completed' ?
        this.commit(active, clone(active.state), clone(longTerm), null, token, 'statement', false) : success(undefined);
    }
    if (!equal(prior, longTerm)) {
      let result: Result<{ revision: number }>;
      try { result = await this.ports.longTerm.commitRuntimeLongTerm({ domain: active.domain, sessionId: active.id,
        sequence, expectedRevision: longTerm.revision, next: clone(longTerm), base: clone(prior) }); }
      catch (error) { result = failure(asIssue(error)); }
      if (!result.ok) { active.pending = { sequence, next: clone(longTerm), base: clone(prior) }; active.status = 'error'; active.issue = result.error; return failure(result.error); }
    }
    if (continuingDialogue && active.state.phase === 'completed')
      return this.commit(active, clone(active.state), clone(this.ports.longTerm.current(active.domain)), null, token, 'statement', false);
    return success(undefined);
  }

  private makeCheckpoint(active: Active): void {
    const state = clone(active.state);
    if (state.phase === 'entry') state.presentation.voice = null;
    const checkpoint: Checkpoint = { id: createId(), projectId: active.snapshot.projectId,
      snapshotId: active.snapshot.snapshotId, state, executed: clone(active.executed), createdAt: new Date().toISOString() };
    this.checkpoints.set(checkpoint.id, { sessionId: active.id, checkpoint });
  }
  private evaluateChoices(active: Active, state: RuntimeState, longTerm: LongTerm, instruction: Instruction,
    token: ExecutionToken, trigger: ConditionExplanation['trigger']): { optionIds: Id[]; visibleOptionIds: Id[] } {
    const options = Array.isArray(object(instruction.args).options) ? (object(instruction.args).options as unknown[]).map(object) : [];
    const available: Id[] = [], visibleOptions: Id[] = [];
    for (const [index, option] of options.entries()) {
      const visible = option.visible === undefined ? true : evaluateTree(option.visible as Expr, { state, longTerm, variables: active.snapshot.variables, functions: pureFunctions(this.ports, state, longTerm) });
      if (typeof visible !== 'boolean') { this.capture(active, token, instruction.source, `options.${index}.visible`, String(option.id), visible, trigger); if (visible.status === 'error') throw visible.issue!; }
      const enabled = option.enabled === undefined ? true : evaluateTree(option.enabled as Expr, { state, longTerm, variables: active.snapshot.variables, functions: pureFunctions(this.ports, state, longTerm) });
      if (typeof enabled !== 'boolean') { this.capture(active, token, instruction.source, `options.${index}.enabled`, String(option.id), enabled, trigger); if (enabled.status === 'error') throw enabled.issue!; }
      if (typeof visible === 'boolean' ? visible : visible.value === true) visibleOptions.push(String(option.id));
      if ((typeof visible === 'boolean' ? visible : visible.value === true) && (typeof enabled === 'boolean' ? enabled : enabled.value === true)) available.push(String(option.id));
    }
    return {optionIds:available,visibleOptionIds:visibleOptions};
  }
  private capture(active: Active, token: ExecutionToken, source: Source, field: string, optionId: Id | null,
    root: ConditionExplanation['root'], trigger: ConditionExplanation['trigger']): void {
    if (active.domain.kind !== 'playtest') return;
    active.explanations.push({ token, snapshotId: active.snapshot.snapshotId, sequence: active.sequence + 1,
      source: { ...source, field }, field, optionId, trigger, outcome: root.status === 'error' ? 'error' : root.value ? 'true' : 'false', root });
    const unique = [...new Set(active.explanations.map(item => `${item.token.occurrence}:${item.token.statementId}`))];
    if (unique.length > 100) { const first = unique[0]; active.explanations = active.explanations.filter(item => `${item.token.occurrence}:${item.token.statementId}` !== first); }
  }

  private validateInput(active: Active, instruction: Instruction, value: string, longTerm: LongTerm): Result<void> {
    const args = object(instruction.args);
    if ((!args.allowEmpty && !value.length) || graphemes(value).length > Number(args.maxLength ?? 100)) return failure(issue('INPUT_INVALID', 'Input length is invalid'));
    if (typeof args.pattern === 'string' && !(new RegExp(`^(?:${args.pattern})$`, 'u')).test(value)) return failure(issue('INPUT_INVALID', 'Input does not match pattern'));
    if (args.validation && (typeof args.validation === 'boolean' ? !args.validation : !evaluateBoolean(args.validation as Expr, {
      state: active.state, longTerm, variables: active.snapshot.variables, input: value,
      functions: pureFunctions(this.ports, active.state, longTerm) }).value)) return failure(issue('INPUT_INVALID', String(args.errorText ?? 'Input is invalid')));
    return success(undefined);
  }

  private forkRouteProbe(active: Active): Active {
    const { snapshot, scenario, history, trace, executed, explanations, ...owned } = active;
    // Probes evaluate control flow; replay receipts belong only to the selected route.
    const branch: Active = { ...clone({ ...owned, state: { ...owned.state, route: [] } }), snapshot, scenario,
      history: [], trace: [], executed: [], explanations: [] };
    this.routeProbes.add(branch);
    return branch;
  }
  private routeOccurrenceIssue(active: Active, instruction: Instruction): Issue | null {
    const occurrence = active.state.occurrence + 1;
    const planned = [...active.scenario!.route, ...active.scenario!.playerInputs].find(item => item.occurrence === occurrence && item.statementId !== instruction.statementId);
    return planned ? issue('ROUTE_OCCURRENCE', `Route statement ${planned.statementId} requests execution ${occurrence}, but execution ${occurrence} is ${instruction.statementId} (${instruction.opcode}). Execution numbers count every instruction from the entry, including dialogue; correct the route occurrence.`, instruction.source) : null;
  }
  /** Explore isolated runtime states. Unknown branches never count as impossible. */
  private async probeRoute(active: Active, wanted: Position, budget: { remaining: number },
    choices: { position: Position; progress: RuntimeState['progress']; frames: RuntimeState['frames']; longTerm: LongTerm | null }[] = []): Promise<{ count: number; unknown: boolean }> {
    while (budget.remaining-- > 0) {
      if (equal(active.state.position, wanted)) return { count: 1, unknown: false };
      if (active.state.phase === 'completed') return { count: 0, unknown: false };
      const instruction = at(active.snapshot, active.state.position)!;
      if (active.state.phase === 'entry') {
        if (this.routeOccurrenceIssue(active, instruction)) return { count: 0, unknown: false };
        const customCall = (value: unknown): boolean => {
          if (!value || typeof value !== 'object') return false;
          const item = object(value);
          return item.kind === 'call' && this.ports.contributions.conditions.some(condition => condition.key === item.name)
            || Object.values(value).some(customCall);
        };
        if (this.ports.contributions.commands.some(command => command.spec.key === instruction.opcode)
          || customCall(instruction.condition) || customCall(instruction.args)) return { count: 0, unknown: true };
        const result = await this.executePreview(active);
        if (!result.ok) return { count: 0, unknown: true };
        continue;
      }
      if (active.state.wait?.kind === 'choice') {
        const selected = active.scenario!.route.find(item => item.statementId === instruction.statementId && item.occurrence === active.state.occurrence);
        const hasFutureInput = [...active.scenario!.route, ...active.scenario!.playerInputs].some(item => item.occurrence > active.state.occurrence);
        if (!selected && !hasFutureInput && choices.some(prior => equal(prior.position, active.state.position) &&
          equal(prior.progress, active.state.progress) && equal(prior.frames, active.state.frames) && equal(prior.longTerm, active.previewLongTerm)))
          return { count: 0, unknown: true };
        const options = active.state.wait.optionIds.filter(id => !selected || id === selected.optionId);
        if (selected && !options.length) return { count: 0, unknown: true };
        let count = 0, unknown = false;
        choices.push({ position: clone(active.state.position), progress: clone(active.state.progress), frames: clone(active.state.frames), longTerm: clone(active.previewLongTerm) });
        for (const id of options) {
          const branch = this.forkRouteProbe(active);
          this.followRouteOption(branch, instruction, id);
          const result = await this.probeRoute(branch, wanted, budget, choices);
          count += result.count; unknown ||= result.unknown;
          if (count > 1) break;
        }
        choices.pop();
        return { count, unknown };
      }
      if (active.state.wait?.kind === 'input') {
        if (!this.followRouteInput(active, instruction)) return { count: 0, unknown: true };
      } else if (active.state.wait?.kind === 'plugin') return { count: 0, unknown: true };
      else {
        if (active.state.wait?.kind === 'say') active.readingCarry = { textShown: active.state.wait.textShown, textAnchor: active.state.wait.textAnchor };
        next(active.snapshot, active.state); active.state.wait = null;
      }
    }
    return { count: 0, unknown: true };
  }
  private followRouteOption(active: Active, instruction: Instruction, optionId: Id): void {
    const option = (object(instruction.args).options as unknown[]).map(object).find(item => item.id === optionId)!;
    if (!this.routeProbes.has(active)) active.state.route.push({ statementId: instruction.statementId, occurrence: active.state.occurrence, optionId });
    enterScene(active.snapshot, active.state, target(active.snapshot, String(object(option.target).sceneId), object(option.target).labelId as Id | null));
  }
  private followRouteInput(active: Active, instruction: Instruction): boolean {
    const provided = active.scenario!.playerInputs.find(item => item.statementId === instruction.statementId && item.occurrence === active.state.occurrence);
    if (!provided) return false;
    const longTerm = clone(active.previewLongTerm!);
    if (!this.validateInput(active, instruction, provided.text, longTerm).ok) return false;
    setVariable(active.snapshot, active.state, longTerm, String(object(instruction.args).variableId), provided.text, 'assign');
    next(active.snapshot, active.state); active.state.wait = null; active.previewLongTerm = longTerm; return true;
  }
  private async buildRoute(active: Active, wanted: Position, policy?: 'unique', evaluateTarget = true): Promise<Result<{ reached: boolean; blockedAt: Position | null; routePreparation: RoutePreparation }>> {
    const scenario = active.scenario; if (!scenario) return failure(issue('ROUTE_SOURCE', 'Route construction requires a scenario'));
    active.previewLongTerm = clone(this.ports.longTerm.current(active.domain)); active.routeBuilding = true;
    const budget = { remaining: 10000 };
    const complete = (reached: boolean, kind: RoutePreparation['kind'], reason: string, candidateOptionIds: Id[] = []) => success({ reached, blockedAt: reached ? null : clone(active.state.position), routePreparation: { kind, reason, candidateOptionIds } });
    while (budget.remaining-- > 0) {
      if (equal(active.state.position, wanted)) {
        if (evaluateTarget && active.state.phase === 'entry') { const result = await this.executePreview(active); if (!result.ok) return failure(result.error); }
        return complete(true, scenario.route.length || scenario.playerInputs.length ? 'selected' : 'automatic', 'Reached the target by replaying actual instructions');
      }
      if (active.state.phase === 'entry') {
        const result = await this.executePreview(active); if (!result.ok) return failure(result.error); continue;
      }
      if (active.state.phase === 'completed') return complete(false, 'unreachable', 'The selected route ended before the target');
      const instruction = at(active.snapshot, active.state.position)!;
      if (active.state.wait?.kind === 'choice') {
        const selected = scenario.route.find(item => item.statementId === instruction.statementId && item.occurrence === active.state.occurrence);
        let planned = selected?.optionId ?? (policy === 'unique' ? undefined : object(instruction.args).previewDefault);
        if (selected && !active.state.wait.optionIds.includes(selected.optionId)) return complete(false, 'invalid', 'The remembered option is unavailable', active.state.wait.optionIds);
        if (typeof planned !== 'string' && policy === 'unique') {
          const candidates: { id: Id; count: number; unknown: boolean }[] = [];
          for (const id of active.state.wait.optionIds) {
            const branch = this.forkRouteProbe(active);
            this.followRouteOption(branch, instruction, id);
            candidates.push({ id, ...await this.probeRoute(branch, wanted, budget) });
          }
          const possible = candidates.filter(candidate => candidate.count > 0 || candidate.unknown);
          if (possible.length === 1 && possible[0]!.count > 0 && !possible[0]!.unknown) planned = possible[0]!.id;
          else return complete(false, possible.some(candidate => candidate.unknown) ? 'unknown' : possible.length ? 'choice' : 'unreachable', possible.length ? 'Choose a preceding branch; only provably irrelevant options were excluded' : 'No available option reaches the target', possible.map(candidate => candidate.id));
        }
        if (typeof planned !== 'string' || !active.state.wait.optionIds.includes(planned)) return complete(false, 'choice', 'A preceding choice needs a selection', active.state.wait.optionIds);
        this.followRouteOption(active, instruction, planned);
      } else if (active.state.wait?.kind === 'input') {
        if (!this.followRouteInput(active, instruction)) return complete(false, 'input', 'Valid player input is required');
      } else if (active.state.wait?.kind === 'plugin') return complete(false, 'unknown', 'A plugin interaction needs an explicit response');
      else {
        if (active.state.wait?.kind === 'say') active.readingCarry = { textShown: active.state.wait.textShown, textAnchor: active.state.wait.textAnchor };
        next(active.snapshot, active.state); active.state.wait = null;
      }
    }
    return policy === 'unique' ? complete(false, 'unknown', 'Route analysis reached the 10000 instruction limit') : failure(issue('ROUTE_LOOP', 'Route exceeded 10000 instructions'));
  }
  private async executePreview(active: Active): Promise<Result<void>> {
    const instruction = at(active.snapshot, active.state.position);
    const mismatch = instruction && this.routeOccurrenceIssue(active, instruction);
    return mismatch ? failure(mismatch) : this.execute(active);
  }

  classifyUpdate(input: { newSnapshot: Snapshot }): Result<UpdatePlan> {
    const active = this.active; if (!active) return failure(issue('SESSION_MISSING', 'No active session'));
    const old = active.snapshot, nextSnapshot = input.newSnapshot;
    const valid = SnapshotSchema.safeParse(nextSnapshot); if (!valid.success) return failure(issue('SNAPSHOT_INVALID', valid.error.message));
    const priorInstructions = new Map(old.scenes.flatMap(item => item.instructions).map(item => [item.statementId, item]));
    const nextInstructions = new Map(nextSnapshot.scenes.flatMap(item => item.instructions).map(item => [item.statementId, item]));
    const changedIds = new Set<Id>([...priorInstructions.keys(), ...nextInstructions.keys()].filter(id => !equal(priorInstructions.get(id), nextInstructions.get(id))));
    const affected = [...changedIds].map(id => nextInstructions.get(id)?.source ?? priorInstructions.get(id)!.source);
    const pluginChanged = !equal(old.lock, nextSnapshot.lock) || !equal(old.characters, nextSnapshot.characters) ||
      !equal(old.pluginDocuments, nextSnapshot.pluginDocuments) || old.engineVersion !== nextSnapshot.engineVersion;
    const sceneStructure = (snapshot: Snapshot) => snapshot.scenes.map(item => ({ scene: item.scene, labels: item.labels,
      order: item.instructions.map(instruction => instruction.statementId) }));
    const structuralChanged = !equal(sceneStructure(old), sceneStructure(nextSnapshot)) || !equal(old.variables, nextSnapshot.variables) ||
      !equal(old.project.entry, nextSnapshot.project.entry) || !equal(old.project.chapters, nextSnapshot.project.chapters) ||
      !equal(old.flows, nextSnapshot.flows);
    const currentId = active.state.position.statementId;
    const sayControl = (instruction: Instruction | undefined) => {
      if (!instruction) return null;
      const { text: _text, voice: _voice, voiceByLocale: _voices, voiceVolume: _volume, ...otherArgs } = object(instruction.args);
      return { opcode: instruction.opcode, specVersion: instruction.specVersion, condition: instruction.condition,
        continuation: instruction.continuation, skippable: instruction.skippable, args: otherArgs };
    };
    const onlyCurrentSay = currentId !== null && changedIds.size === 1 && changedIds.has(currentId) &&
      active.state.wait?.kind === 'say' && priorInstructions.get(currentId)?.opcode === 'say' && nextInstructions.get(currentId)?.opcode === 'say' &&
      equal(sayControl(priorInstructions.get(currentId)), sayControl(nextInstructions.get(currentId)));
    const executedChanged = active.executed.some(item => changedIds.has(item.statementId));
    const kind: UpdatePlan['kind'] = pluginChanged ? 'newSession' : structuralChanged || executedChanged && !onlyCurrentSay ? 'rebuild'
      : onlyCurrentSay ? 'currentLine' : changedIds.size ? 'future' : 'presentation';
    const earliestChanged = structuralChanged ? 0 : active.executed.findIndex(item => changedIds.has(item.statementId));
    const checkpoint = kind === 'rebuild' && earliestChanged > 0 ? this.checkpointsFor(active.id)
      .filter(item => item.executed.length <= earliestChanged && item.executed.every(executed => !changedIds.has(executed.statementId)))
      .at(-1) : undefined;
    return success({ kind, oldSnapshotId: active.snapshot.snapshotId, newSnapshotId: input.newSnapshot.snapshotId,
      affected, checkpointId: checkpoint?.id ?? null,
      deferredUntilVideoEnd: active.state.presentation.backgroundVideo !== null });
  }

  async skipStep(scope: 'read' | 'all'): Promise<Result<{ continued: boolean; inspection: RuntimeInspection }>> {
    const active = this.active, inspection = this.inspect();
    if (!active || !inspection) return failure(issue('SESSION_MISSING', 'No active session'));
    const wait = active.state.wait, instruction = at(active.snapshot, active.state.position);
    if (active.pending || active.status !== 'waiting' || !active.token ||
      !wait || ['choice','input','plugin'].includes(wait.kind) || instruction?.opcode === 'video' ||
      wait.kind === 'say' && scope === 'read' && !this.ports.longTerm.current(active.domain).readStatements.includes(active.token.statementId) ||
      ['animation','timer'].includes(wait.kind) && instruction?.skippable === false)
      return success({ continued: false, inspection });
    if (wait.kind === 'say' && active.state.presentation.text.reading?.mode === 'nvl' && active.state.presentation.text.reading.end === null)
      return success({ continued: true, inspection });
    const result = await this.dispatch({kind: wait.kind === 'timer' ? 'timer' : 'advance', token: active.token});
    return result.ok ? success({continued: true, inspection: result.value}) : failure(result.error);
  }

  async driveSkip(scope: 'read' | 'all', shouldContinue: () => boolean = () => true): Promise<Result<RuntimeInspection>> {
    const active = this.active; if (!active) return failure(issue('SESSION_MISSING', 'No active session'));
    for (let count = 0; count < 10000; count++) {
      if (!shouldContinue()) return success(this.inspect()!);
      if (active.pending || active.status !== 'waiting' || !active.token) return success(this.inspect()!);
      const wait = active.state.wait;
      if (wait?.kind === 'say' && active.state.presentation.text.reading?.mode === 'nvl' && active.state.presentation.text.reading.end === null) return success(this.inspect()!);
      if (wait?.kind === 'choice' || wait?.kind === 'input' || wait?.kind === 'plugin') return success(this.inspect()!);
      if (wait?.kind === 'say' && scope === 'read' && !this.ports.longTerm.current(active.domain).readStatements.includes(active.token.statementId)) return success(this.inspect()!);
      const instruction = at(active.snapshot, active.state.position);
      if ((wait?.kind === 'animation' || wait?.kind === 'timer') && instruction?.skippable === false) return success(this.inspect()!);
      const event: RuntimeEvent = { kind: wait?.kind === 'say' || wait?.kind === 'animation' && instruction?.opcode !== 'video'
        ? 'advance' : wait?.kind === 'timer' ? 'timer' : 'animation', token: active.token };
      const result = await this.dispatch(event); if (!result.ok) return result;
    }
    return failure(issue('SKIP_LOOP', 'Skip exceeded 10000 waiting points'));
  }

  async tryAutoAdvance(input: { voiceEnded: boolean; animationComplete: boolean; readyDurationMs: number; autoWaitMs: number }): Promise<Result<{ advanced: boolean; inspection: RuntimeInspection }>> {
    const active = this.active; if (!active) return failure(issue('SESSION_MISSING', 'No active session'));
    const wait = active.state.wait;
    if (active.pending || active.status !== 'waiting' || wait?.kind !== 'say' || !active.token || !wait.textComplete ||
      !active.viewportAtEnd || !input.voiceEnded || !input.animationComplete || input.readyDurationMs < input.autoWaitMs)
      return success({ advanced: false, inspection: this.inspect()! });
    const result = await this.dispatch({ kind: 'advance', token: active.token });
    return result.ok ? success({ advanced: true, inspection: result.value }) : failure(result.error);
  }

  elapseTimer(input: { token: ExecutionToken; deltaMs: number }): Result<boolean> {
    const active = this.active;
    if (!active || !tokenEqual(active.token, input.token) || active.state.wait?.kind !== 'timer')
      return failure(issue('TOKEN_STALE', 'Timer progress belongs to another wait'));
    if (this.pauseReasons.size || active.pending || active.status !== 'waiting') return success(false);
    active.state.wait.remainingMs = Math.max(0, active.state.wait.remainingMs - Math.max(0, input.deltaMs));
    active.sequence++;
    return success(active.state.wait.remainingMs === 0);
  }

  setVoiceLocale(locale: string): Result<void> {
    const active = this.active; if (!active) return failure(issue('SESSION_MISSING', 'No active session'));
    active.voiceLocale = locale; return success(undefined);
  }
  replayVoice(): Result<VoicePlaybackBinding | null> {
    const active = this.active; if (!active || active.state.wait?.kind !== 'say' || !active.token) return failure(issue('VOICE_NOT_AVAILABLE', 'Current line cannot be replayed'));
    const instruction = at(active.snapshot, active.state.position)!;
    let targetObjectId: Id | null;
    try { targetObjectId = voiceTarget(instruction, active.state.presentation); } catch (error) { return failure(asIssue(error, instruction.source)); }
    const selection = chooseVoice(active.snapshot, instruction, active.voiceLocale, active.token);
    active.voiceResolution = selection.resolution;
    if (selection.resolution.selected?.variantId === null) return failure(issue('VOICE_ASSET_MISSING', `Voice ${selection.resolution.selected.assetId} is missing`, instruction.source));
    active.voiceBinding = selection.binding;
    active.state.presentation.voice = selection.resolution.selected ? { assetId: selection.resolution.selected.assetId,
      variantId: selection.resolution.selected.variantId!, volume: Number(object(instruction.args).voiceVolume ?? 100) / 100,
      targetObjectId, statementId: instruction.statementId } : null;
    active.sequence++;
    this.ports.onCommitted?.({ sessionId: active.id, sequence: active.sequence, token: active.token, state: clone(active.state),
      delta: { objects: [], effects: [], audio: [], voiceBinding: selection.binding } });
    return success(selection.binding);
  }

  updateReadingViewport(input: { token: ExecutionToken; textAnchor: number; atEnd: boolean }): Result<RuntimeInspection> {
    const active = this.active; if (!active || !tokenEqual(active.token, input.token) || active.state.wait?.kind !== 'say') return failure(issue('TOKEN_STALE', 'Reading viewport belongs to another line'));
    active.state.wait.textAnchor = Math.max(0, Math.min(Math.floor(input.textAnchor), graphemes(active.state.presentation.text.text).length));
    active.viewportAtEnd = input.atEnd; active.sequence++; return success(this.inspect()!);
  }
  updateNvlLayout(input: { token: ExecutionToken; start: number; end: number }): Result<RuntimeInspection> {
    const active = this.active, wait = active?.state.wait, reading = active?.state.presentation.text.reading;
    if (!active || !tokenEqual(active.token, input.token) || wait?.kind !== 'say' || reading?.mode !== 'nvl') return failure(issue('TOKEN_STALE', 'NVL layout belongs to another line'));
    const total = graphemes(active.state.presentation.text.text).length;
    if (!Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.end) || input.start < 0 || input.end <= input.start || input.end > total || input.end < wait.textShown)
      return failure(issue('NVL_LAYOUT', 'NVL layout must preserve the current logical reading anchor'));
    reading.start = input.start; reading.end = input.end; wait.textAnchor = reading.start;
    wait.textShown = Math.max(wait.textShown, reading.start);
    wait.textComplete = wait.textShown >= input.end; active.viewportAtEnd = true; active.sequence++; return success(this.inspect()!);
  }
  updateTextProgress(input: { token: ExecutionToken; textShown: number }): Promise<Result<RuntimeInspection>> {
    return this.exclusively(() => this.updateTextProgressOwned(input), false);
  }
  private async updateTextProgressOwned(input: { token: ExecutionToken; textShown: number }): Promise<Result<RuntimeInspection>> {
    const active = this.active;
    if (!active || !tokenEqual(active.token, input.token) || active.state.wait?.kind !== 'say') return failure(issue('TOKEN_STALE', 'Text progress belongs to another line'));
    if (active.pending) return failure(issue('LONG_TERM_PENDING', 'Long-term write needs retry'));
    if (this.pauseReasons.size || active.status === 'paused') return failure(issue('SESSION_PAUSED', 'Session is paused'));
    const total = graphemes(active.state.presentation.text.text).length;
    const reading = active.state.presentation.text.reading;
    if (reading?.mode === 'nvl' && reading.end === null) return success(this.inspect()!);
    const limit = reading?.mode === 'nvl' ? reading.end! : total;
    const shown = Math.max(active.state.wait.textShown, Math.min(Math.floor(input.textShown), limit));
    if (shown < total) { active.state.wait.textShown = shown; active.state.wait.textComplete = shown >= limit; active.sequence++; return success(this.inspect()!); }
    if (active.state.wait.textComplete) return success(this.inspect()!);
    const staged = clone(active.state), longTerm = clone(this.ports.longTerm.current(active.domain));
    if (staged.wait?.kind !== 'say') return failure(issue('WAIT_CHANGED', 'Current text wait changed'));
    staged.wait.textShown = total; staged.wait.textComplete = true;
    const committed = await this.commit(active, staged, longTerm, null, null, 'statement');
    return committed.ok ? success(this.inspect()!) : failure(committed.error);
  }
  inspectVoice(input: { sessionId: Id; expectedSequence: number; token: ExecutionToken }): Result<VoiceResolution> {
    const active = this.active; if (!active || active.id !== input.sessionId || active.sequence !== input.expectedSequence || !tokenEqual(active.token, input.token)) return failure(issue('STATE_CHANGED', 'Voice inspection requested an old state'));
    if (!active.voiceResolution) return failure(issue('VOICE_NOT_AVAILABLE', 'Current line has no voice resolution'));
    return success(clone(active.voiceResolution));
  }

  async dispatchDebug(request: DebugRequest): Promise<Result<DebugResult>> {
    const active = this.active; if (!active || active.id !== request.sessionId || active.sequence !== request.expectedSequence) return failure(issue('STATE_CHANGED', 'Debug request is stale'));
    if (active.domain.kind !== 'playtest') return failure(issue('DEBUG_DOMAIN', 'Debug controls require a playtest session'));
    const command = request.command; let value: Json | null = null, condition: ConditionExplanation | null = null;
    let scenario: DebugScenario | null = null; const changed: DebugResult['changed'] = [];
    try {
      if (command.op === 'inspect') value = command.scope === 'state' ? clone(active.state) as Json : command.scope === 'variables' ? { progress: clone(active.state.progress), local: clone(active.state.frames.at(-1)?.locals ?? {}) } : command.scope === 'stack' ? clone(active.state.frames) as Json : command.scope === 'stage' ? clone(active.state.presentation) as Json : clone(active.trace) as Json;
      else if (command.op === 'evaluate') { const parsed = parseExpression(command.expression); if (!parsed.ok) return failure(issue('EXPR_PARSE', parsed.message)); value = evaluate(parsed.expr, { state: active.state, longTerm: this.ports.longTerm.current(active.domain), variables: active.snapshot.variables, functions: pureFunctions(this.ports, active.state, this.ports.longTerm.current(active.domain)) }); }
      else if (command.op === 'explainCondition') {
        condition = [...active.explanations].reverse().find(item => tokenEqual(item.token, command.token) && item.field === command.field) ?? null;
        if (!condition) return failure(issue('CONDITION_NOT_CAPTURED', 'No condition evaluation was captured for this occurrence'));
      } else if (command.op === 'setVariable') {
        const staged = clone(active.state), longTerm = clone(this.ports.longTerm.current(active.domain));
        const variable = projectVariable(active.snapshot, staged.frames.at(-1), command.id);
        if (!variable || variable.scope !== command.scope || typeof command.value !== variable.type) return failure(issue('VARIABLE_TYPE', 'Debug variable has an incompatible type'));
        if (command.scope === 'local' && command.frameId && staged.frames.at(-1)?.id !== command.frameId) return failure(issue('FRAME_MISSING', 'Selected frame is unavailable'));
        setVariable(active.snapshot, staged, longTerm, command.id, command.value, 'assign');
        if (staged.wait?.kind === 'choice' && active.token) {
          const instruction = at(active.snapshot, staged.position)!;
          Object.assign(staged.wait, this.evaluateChoices(active, staged, longTerm, instruction, active.token, 'debugRefresh'));
        }
        const wasPaused = active.status === 'paused', pausedFrom = active.pausedFrom, pausedIssue = active.issue;
        const result = await this.commit(active, staged, longTerm, null, null, 'debug'); if (!result.ok) return failure(result.error);
        if (wasPaused) { active.status = 'paused'; active.pausedFrom = pausedFrom; active.issue = pausedIssue; }
        changed.push({ kind: 'variable', id: command.id });
        for (const [id, entry] of this.checkpoints) if (entry.sessionId === active.id) this.checkpoints.delete(id);
        if (active.state.wait?.kind === 'choice' && !active.state.wait.optionIds.length) active.issue = issue('CHOICE_LOCKED', 'No choice is available');
      } else if (command.op === 'pause') { if (active.status !== 'paused') { active.pausedFrom = active.status; active.status = 'paused'; active.sequence++; } }
      else if (command.op === 'resume') { if (active.status === 'paused') {
        if (active.issue?.code === 'RUNTIME_LOOP') return failure(issue('RUNTIME_LOOP', 'Use continueLoop to resume a diagnostic loop'));
        active.status = active.pausedFrom ?? 'ready'; active.pausedFrom = null; active.sequence++;
        if (active.state.phase === 'entry') { const result = await this.run(); if (!result.ok) return failure(result.error); } } }
      else if (command.op === 'step') { if (active.pending) return failure(issue('LONG_TERM_PENDING', 'Long-term write needs retry')); if (active.state.phase === 'waiting') return failure(issue('STEP_WAIT', 'Current wait needs player or media completion'));
        const wasPaused = active.status === 'paused'; const result = await this.execute(active); if (!result.ok) return failure(result.error);
        if (wasPaused && active.state.phase !== 'completed') { active.pausedFrom = active.status; active.status = 'paused'; } }
      else if (command.op === 'saveInitial') {
        if (!active.scenario) return failure(issue('SCENARIO_MISSING', 'Scenario is unavailable'));
        scenario = { ...clone(active.scenario), id: createId(), name: command.name,
          initialProgress: Object.fromEntries(command.variableIds.filter(id => active.state.progress[id] !== undefined).map(id => [id, active.state.progress[id]!])),
          pluginInitial: Object.fromEntries(command.pluginIds.filter(id => active.state.plugins[id]).map(id => [id, active.state.plugins[id]!.progress])), route: clone(active.state.route) };
      } else if (command.op === 'setPluginInitial') {
        const contribution = pluginSystem(this.ports, command.pluginId);
        if (!contribution) return failure(issue('PLUGIN_MISSING', 'Plugin state contribution is unavailable'));
        const checked = contribution.validate(command.value, 'progress'); if (!checked.ok) return failure(checked.error);
        if (!active.scenario) return failure(issue('SCENARIO_MISSING', 'Scenario is unavailable'));
        scenario = { ...clone(active.scenario), pluginInitial: { ...active.scenario.pluginInitial, [command.pluginId]: checked.value } };
      } else if (command.op === 'restart' || command.op === 'runTo') {
        const input: SessionInput = { snapshot: active.snapshot, domain: active.domain,
          source: { kind: 'entry', scenario: command.scenario }, target: command.op === 'runTo' ? command.target : null };
        const prepared = await this.prepareSession(input); if (!prepared.ok) return failure(prepared.error);
        const activation = this.activate(prepared.value.id); if (!activation.ok) return failure(activation.error);
        scenario = command.scenario;
      }
      return success({ requestId: request.requestId, sessionId: this.active!.id, sequence: this.active!.sequence,
        position: clone(this.active!.state.position), value, changed, diagnostics: [], scenario, condition });
    } catch (error) { return failure(asIssue(error)); }
  }
}
