import type { CollaborationContext, CollaborationScope, ExternalToolDefinition, Issue, Json, Result, Ref, Source } from '@galcraft/contracts';
export type CollaborationTarget={ref:Ref;source:Source};
export type { CollaborationContext, CollaborationScope, ExternalToolDefinition } from '@galcraft/contracts';
export type CollaborationSession = {
  projectRoot?:string; id: string; projectId: string; writeSessionId: string; projectName: string; goal: string;
  harness: 'dsh' | 'claude' | 'codex'; scope: CollaborationScope; scopeRevision: number;
  paused: boolean; ended?: boolean; createdAt: string; updatedAt: string; generations: number; sentRequests: string[];
  authorControlCallId?: string; reboundFrom?: string;
  target?:CollaborationTarget;
};
export type CallRecord = {
  sessionId: string; callId: string; tool: string; version: string; provider?:ExternalToolDefinition['provider']; input: Json; context: CollaborationContext;
  state: 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled' | 'uncertain';
  createdAt: string; updatedAt: string; result?: Json; error?: string;
  finishedAt?:string;
  errorCode?: string; issue?: Issue;
};
export type CallSummary = Pick<CallRecord, 'sessionId' | 'callId' | 'tool' | 'state' | 'createdAt' | 'updatedAt' | 'error'> & { summary: string; documentIds: string[] };
export type CallHistoryQuery = { sessionId: string; offset: number; limit: number; search?: string; state?: CallRecord['state'] };
export type CallHistoryPage = { items: CallSummary[]; total: number; offset: number; limit: number };
export type Constraint = {
  effects: ExternalToolDefinition['effects']; documents?: string[]; createKinds?: string[];
  operation?: string; connectionId?: string; model?: string; workflowId?: string;
};
export type HarnessProject = {projectId:string;projectRoot:string;writeSessionId:string;sessionId?:string};
export type ConfigurationState = 'notInstalled' | 'current' | 'updateAvailable' | 'localEdits';
export type ConfigurationReadback = {state:ConfigurationState;files:{path:string;state:ConfigurationState;update?:{path:string;pending:boolean;existing:string|null;localContent:string;content:string}}[]};
export type HarnessConfiguration = { harness: 'dsh' | 'claude' | 'codex'; purpose?:'mcp'|'skill'; workspaceDirectory?:string; project?:HarnessProject; readback:ConfigurationReadback; instructions?:string; changes?:{path:string;existing:string|null;content:string}[]; guidance?:string[]; path: string; content: string; mergedContent?:string; command: string; existing: string | null; companionFiles?:{path:string;content:string;existing:string|null}[] };
export type ConfigurationWriteResult = {status:'written';path:string} | {status:'cancelled';path:null};
export type ToolSummary=Pick<ExternalToolDefinition,'key'|'title'|'description'|'effects'|'version'|'provider'|'display'>&{actions?:string[];example?:Json};
export type CollaborationOverview = { endpoint: string | null; enabled?:boolean; service?:{state:'running'|'stopped'|'failed';error?:{code:string;message:string};addressChange?:{previous:string;current:string}}; currentProjectId?:string|null; defaultScope?:CollaborationScope; currentSessionId?:string|null; sessions: (CollaborationSession & {bindingValid:boolean})[]; calls: CallRecord[]; callPage?: CallHistoryPage; tools: ToolSummary[] };
export type CollaborationBridge = {
  handoffTarget?(input:{sessionId?:string;target:CollaborationTarget}):Promise<Result<CollaborationTarget>>;
  reportAuthoringDrafts?(input:{projectId:string;revision:number;documents:{id:string;name:string;kind:string}[]}):Promise<Result<void>>;
  overview(input?: { history?: CallHistoryQuery }): Promise<Result<CollaborationOverview>>;
  readCall(input: { sessionId: string; callId: string }): Promise<Result<CallRecord>>;
  start(): Promise<Result<{endpoint:string}>>;
  stop(): Promise<Result<void>>;
  create(input: {goal:string;harness:CollaborationSession['harness'];scope:CollaborationScope}): Promise<Result<CollaborationSession>>;
  update(input: {id:string;expectedRevision:number;goal?:string;scope?:CollaborationScope;paused?:boolean}): Promise<Result<CollaborationSession>>;
  end(input:{id:string;expectedRevision:number}):Promise<Result<CollaborationSession>>;
  deleteEnded(input:{id:string;expectedRevision:number}):Promise<Result<{sessionIds:string[]}>>;
  toolDefinition(input:{key:string}):Promise<Result<ExternalToolDefinition>>;
  chooseWorkspaceDirectory(input:{directory?:string}):Promise<Result<string|null>>;
  configuration(input: {harness:HarnessConfiguration['harness'];destination:'project'|'personal';purpose?:'mcp'|'skill';workspaceDirectory?:string}): Promise<Result<HarnessConfiguration>>;
  writeConfiguration(input: HarnessConfiguration & {mode:'merge'|'export'}): Promise<Result<ConfigurationWriteResult>>;
  open(input:{page:string;taskId?:string;candidateId?:string;documentId?:string;sessionId?:string}): Promise<Result<void>>;
};
