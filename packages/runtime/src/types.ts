import type { Domain, ExecutionToken, Expr, HistoryEntry, Id, Issue, Json, LongTerm, Position, PresentationDelta, PresentationState, RestoreKey, Result, Revision, RuntimeState, Scalar, Snapshot, Source, Variable, VoicePlaybackBinding, VoiceResolution } from '@galcraft/contracts';
import type { Contributions } from '@galcraft/plugins/contracts';

import type { DebugScenario } from '@galcraft/contracts';
export type { DebugScenario } from '@galcraft/contracts';
export type SessionInput = { snapshot: Snapshot; domain: Domain; source:
  | { kind: 'entry'; scenario: DebugScenario }
  | { kind: 'checkpoint'; checkpointId: Id }
  | { kind: 'restored'; state: RuntimeState; history: HistoryEntry[]; voiceLocale: string };
  target: Position | null; evaluateTarget?: boolean; targetPhase?: 'before' | 'after'; routePolicy?: 'unique'; story?: RuntimeState['story'] };
/** Debug-only reachability; authored preview defaults remain unchanged. */
export type RoutePreparation = { kind: 'automatic' | 'selected' | 'choice' | 'input' | 'unreachable' | 'unknown' | 'invalid'; candidateOptionIds: Id[]; reason: string };
export type PreparedSession = { id: Id; sessionId: Id; snapshotId: Id; restoreKey: RestoreKey | null;
  state: RuntimeState; voiceBinding: VoicePlaybackBinding | null; reached: boolean; blockedAt: Position | null; issues: Issue[]; routePreparation?: RoutePreparation };
export type Checkpoint = { id: Id; projectId: Id; snapshotId: Id; state: RuntimeState;
  executed: { statementId: Id; documentRevision: Revision }[]; createdAt: string };
export type UpdatePlan = { kind: 'presentation' | 'currentLine' | 'future' | 'rebuild' | 'newSession';
  oldSnapshotId: Id; newSnapshotId: Id; affected: Source[]; checkpointId: Id | null; deferredUntilVideoEnd: boolean };
export type ConditionNode = { path: string; expression: string; status: 'evaluated' | 'shortCircuited' | 'notReached' | 'error';
  value: Scalar | null; variable: { id: Id; scope: 'progress' | 'local' | 'longTerm'; frameId: Id | null } | null;
  issue: Issue | null; children: ConditionNode[] };
export type ConditionExplanation = { token: ExecutionToken; snapshotId: Id; sequence: number; source: Source;
  field: string; optionId: Id | null; trigger: 'entry' | 'debugRefresh'; outcome: 'true' | 'false' | 'error'; root: ConditionNode };
export type DebugCommand = { op: 'inspect'; scope: 'state' | 'variables' | 'stack' | 'stage' | 'trace' }
  | { op: 'evaluate'; expression: string }
  | { op: 'explainCondition'; token: ExecutionToken; field: string }
  | { op: 'setVariable'; scope: 'progress' | 'local'; id: Id; value: Scalar; frameId?: Id }
  | { op: 'setPluginInitial'; pluginId: string; value: Json }
  | { op: 'pause' | 'resume' | 'step' }
  | { op: 'restart'; scenario: DebugScenario }
  | { op: 'runTo'; target: Position; scenario: DebugScenario }
  | { op: 'saveInitial'; name: string; variableIds: Id[]; pluginIds: string[] };
export type DebugRequest = { requestId: Id; sessionId: Id; expectedSequence: number; command: DebugCommand };
export type DebugResult = { requestId: Id; sessionId: Id; sequence: number; position: Position; value: Json | null;
  changed: { kind: 'variable' | 'scene' | 'statement' | 'asset' | 'character' | 'flowNode' | 'project' | 'document' | 'chapter' | 'label' | 'object' | 'effect' | 'gallery' | 'galleryDifference' | 'variant' | 'preset' | 'page' | 'component' | 'style' | 'task' | 'candidate' | 'recipe'; id: Id }[];
  diagnostics: Issue[]; scenario: DebugScenario | null; condition: ConditionExplanation | null };
export type FlowUnlockInput = { domain: Domain; sessionId: Id; snapshot: Snapshot; sequence: number;
  reason: 'start' | 'statement' | 'debug'; state: RuntimeState; longTermAfter: LongTerm };
export type FlowUnlockDelta = { sessionId: Id; snapshotId: Id; sequence: number; expectedLongTermRevision: Revision;
  entries: LongTerm['flowEntries'][Id][] };
export type RuntimeLongTermInput = { domain: Domain; sessionId: Id; sequence: number; expectedRevision: Revision; next: LongTerm; base?: LongTerm };
export interface LongTermService {
  current(domain: Domain): LongTerm;
  prepareFlowUnlocks(input: FlowUnlockInput): Result<FlowUnlockDelta>;
  commitRuntimeLongTerm(input: RuntimeLongTermInput): Promise<Result<{ revision: Revision }>>;
}
export interface StageService {
  prepare(input: { state: RuntimeState; token: ExecutionToken; opcode: string; args: Json }): Promise<Result<{ state: RuntimeState; delta: PresentationDelta | null }>>;
}
export type PreparedProviderCommands = { state: PresentationState; commit(): Result<void>; dispose(): void };
export type PresentationCommitReceipt = { presentationEntered: boolean; mediaStarted: boolean };
export type RuntimePorts = { longTerm: LongTermService; stage: StageService; contributions: Contributions;
  beforeDialogue?: (input: { sessionId: Id; token: ExecutionToken; state: RuntimeState; snapshot: Snapshot }) => Promise<Result<void>>;
  prepareProviderCommands?: (input: { sessionId: Id; token: ExecutionToken; state: PresentationState; commands: NonNullable<PresentationDelta['providerCommands']> }) => Promise<Result<PreparedProviderCommands>>;
  onCommitted?: (input: { sessionId: Id; sequence: number; token: ExecutionToken; state: RuntimeState; delta: PresentationDelta | null; presentationPrepared?: boolean }) => PresentationCommitReceipt | Promise<PresentationCommitReceipt> };
export type RuntimeInspection = { sessionId: Id; snapshotId: Id; sequence: number; state: RuntimeState; history: HistoryEntry[];
  token: ExecutionToken | null; status: 'ready' | 'waiting' | 'paused' | 'error' | 'ended'; issue: Issue | null;
  pendingLongTerm: boolean; trace: { token: ExecutionToken; source: Source }[] };
export type ExpressionContext = { state: RuntimeState; longTerm: LongTerm; variables?: readonly Variable[];
  input?: string; functions?: Record<string, (args: Scalar[]) => Result<Scalar>> };
export type EvaluatedCondition = { value: boolean; root: ConditionNode };
export type VoiceSelection = { resolution: VoiceResolution; binding: VoicePlaybackBinding | null };
export type RuntimeEvent = { kind: 'advance' | 'choose' | 'input' | 'cancel' | 'complete' | 'timer' | 'animation' | 'plugin';
  token: ExecutionToken; optionId?: Id; text?: string; result?: Json };
export type RuntimeStep = Result<{ state: RuntimeState; token: ExecutionToken | null; issue: Issue | null }>;
