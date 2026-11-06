import { CollaborationScopeSchema, createId, type DocumentView, type ExternalToolDefinition, type Json, type Result } from '@galcraft/contracts';
import type { CallRecord, CallSummary, CollaborationBridge, CollaborationOverview, CollaborationScope, CollaborationSession, CollaborationTarget, HarnessConfiguration } from '@galcraft/collaboration/contracts';
import { prepareAuthoringEdit } from '@galcraft/documents/authoring';
import type { Overview } from '../../../../desktop-bridge.js';
import type { CandidateSession } from '../application/session.js';
import { authoringSource } from '../application/documents.js';
import { documentVersion, hasUnappliedTaskSource, taskError, taskOk, taskTime } from './task-model.js';

const editTool: ExternalToolDefinition = {
  key: 'galcraft_authoring', version: '1.0.0', title: 'Edit a scene command',
  description: 'Update a dialogue command in the bound project. Requires the current collaboration scope and document revision.',
  display: { 'zh-CN': { title: '编辑场景语句', description: '按当前协作范围和文档版本修改绑定作品中的对白。' } },
  effects: ['edit'], async: false, cancel: false,
  inputSchema: { type: 'object', properties: {
    documentId: { type: 'string' }, statementId: { type: 'string' }, revision: { type: 'integer' }, text: { type: 'string' },
  }, required: ['documentId', 'statementId', 'revision', 'text'], additionalProperties: false },
  outputSchema: { type: 'object', properties: { groupId: { type: 'string' }, operationId: { type: 'string' }, documents: { type: 'array' } } },
};
const blankScope = (): CollaborationScope => ({ mode: 'currentProject', documents: [], createKinds: [], tools: [], operations: [], connectionIds: [], models: [], workflowIds: [], maxGenerations: null });
type ReviewEdit = { documentId: string; statementId: string; revision: number; text: string };
type CollaborationRecovery = {
  rounds: CollaborationSession[];
  calls: CallRecord[];
  callDocuments: [string, string][];
  installations: [string, string][];
  enabled: boolean;
  pendingTarget?: CollaborationTarget;
};
export type CandidateCollaborationBridge = CollaborationBridge & {
  rebind(input: { id: string; expectedRevision: number }): Promise<Result<CollaborationSession>>;
};
export type OpenTaskWorkspace = { page: string; documentId?: string; statementId?: string; taskId?: string };

export function createCandidateCollaboration(session: CandidateSession, writeSessionId: string, productionOptions: () => Pick<Overview, 'operations' | 'connections' | 'workflows'>, navigate: (target: OpenTaskWorkspace) => void) {
  const recovered = session.recoveryState<CollaborationRecovery>('collaboration');
  const rounds = new Map((recovered?.rounds ?? []).map(round => [round.id, round]));
  const calls = new Map((recovered?.calls ?? []).map(call => [call.callId,
    call.state === 'accepted' || call.state === 'running'
      ? { ...call, state: 'uncertain' as const, updatedAt: taskTime(), error: '上次写会话关闭，请按原调用身份核对目标和回执。' }
      : call,
  ]));
  const callDocuments = new Map(recovered?.callDocuments);
  const inspectedCalls = new Map<string, string>();
  const installations = new Map(recovered?.installations);
  let enabled = recovered?.enabled ?? false, disposed = false, currentSessionId: string | null = null;
  let pendingTarget = recovered?.pendingTarget;
  const capture = () => ({ rounds: [...rounds.values()], calls: [...calls.values()], callDocuments: [...callDocuments], installations: [...installations], enabled, pendingTarget });
  session.registerRecovery('collaboration', capture);
  const endpoint = 'review://galcraft/collaboration';
  const project = () => authoringSource(session.host.list()).project;
  const error = <T>(code: string, message: string) => taskError<T>(code, message, 'M12');
  const documentName = (document: DocumentView) => {
    const [path, raw] = Object.entries(document.files).find(([path]) => path.endsWith('.json')) ?? [];
    if (!path || !raw) return { id: document.documentId, name: document.documentId, kind: '作品文档' };
    const data = JSON.parse(raw).data as { name?: string; key?: string };
    return { id: document.documentId, name: data?.name ?? data?.key ?? path, kind: path.endsWith('/scene.json') ? '场景' : '作品文档' };
  };
  const terminal = (id: string) => ![...rounds.values()].some(value => value.reboundFrom === id);
  const lineage = (id: string) => {
    const ids = new Set<string>();
    let round = rounds.get(id);
    while (round) {
      ids.add(round.id);
      round = round.reboundFrom ? rounds.get(round.reboundFrom) : undefined;
    }
    return ids;
  };
  const staleRound = () => [...rounds.values()].reverse().find(round => round.projectId === project().projectId && !round.ended && terminal(round.id) && !matches(round));
  const matches = (value: CollaborationSession) => !disposed && value.writeSessionId === writeSessionId && value.projectId === project().projectId;
  const updateRound = (value: CollaborationSession, patch: Partial<CollaborationSession>) => {
    const next = { ...value, ...patch, scopeRevision: value.scopeRevision + 1, updatedAt: taskTime() };
    rounds.set(value.id, next);
    return taskOk(structuredClone(next));
  };
  const bridge: CandidateCollaborationBridge = {
    async overview(input) {
      const history = input?.history;
      const historyIds = history ? lineage(history.sessionId) : null;
      const selected = history ? [...calls.values()].reverse().filter(call =>
        historyIds?.has(call.sessionId) && (!history.state || history.state === call.state) &&
        (!history.search || [call.tool, call.callId, call.error, callDocuments.get(call.callId)].some(value => value?.toLowerCase().includes(history.search!.toLowerCase())))) : [];
      const options = productionOptions();
      const result: CollaborationOverview & { options: object } = {
        endpoint: enabled ? endpoint : null, enabled, service: { state: enabled ? 'running' : 'stopped' },
        currentProjectId: project().projectId, currentSessionId, defaultScope: structuredClone([...rounds.values()].at(-1)?.scope ?? blankScope()),
        sessions: [...rounds.values()].reverse().map(value => ({ ...structuredClone(value), bindingValid: matches(value) })),
        tools: [{ ...editTool, actions: ['修改对白'], example: { documentId: 'SceneDocument', statementId: 'Statement', revision: 1, text: '替换后的对白' } }],
        calls: [...calls.values()].filter(call => call.state === 'accepted' || call.state === 'running').map(call => structuredClone(call)),
        options: {
          documents: session.host.list().map(documentName),
          operations: options.operations?.map(item => ({ id: item.id, title: item.definition.title })) ?? [],
          connections: options.connections.map(({ id, name, model }) => ({ id, name, model })),
          workflows: options.workflows.map(({ id, name }) => ({ id, name })),
        },
      };
      if (history) result.callPage = { total: selected.length, offset: history.offset, limit: history.limit, items: selected.slice(history.offset, history.offset + history.limit).map(call => ({
        sessionId: call.sessionId, callId: call.callId, tool: call.tool, state: call.state, createdAt: call.createdAt, updatedAt: call.updatedAt,
        error: call.error, summary: call.state === 'completed' ? '对白已写入当前作品' : '', documentIds: [callDocuments.get(call.callId)!],
      } satisfies CallSummary)) };
      return taskOk(result);
    },
    async readCall({ sessionId, callId }) {
      const call = calls.get(callId);
      if (call?.sessionId !== sessionId) return error('CALL_NOT_FOUND', '找不到此协作调用。');
      inspectedCalls.set(sessionId, callId);
      return taskOk(structuredClone(call));
    },
    async start() { if (disposed) return error('BINDING_STALE', '作品会话已关闭。'); enabled = true; return taskOk({ endpoint }); },
    async stop() { enabled = false; return taskOk(undefined); },
    async create({ goal, harness, scope }) {
      if (disposed) return error('BINDING_STALE', '作品会话已关闭。');
      const parsed = CollaborationScopeSchema.safeParse(scope);
      if (!goal.trim() || !parsed.success) return error('SCOPE_INVALID', '请填写创作目标与有效范围。');
      const current = currentSessionId ? rounds.get(currentSessionId) : undefined;
      if (current && !current.ended && matches(current)) return taskOk(structuredClone(current));
      if (staleRound()) return error('BINDING_STALE', '请先重新接入或结束当前作品的旧协作轮次。');
      const { projectId, name: projectName } = project(), now = taskTime();
      const value: CollaborationSession = { id: createId(rounds), projectId, writeSessionId, projectName, goal: goal.trim(), harness, scope: parsed.data,
        projectRoot: '/review/project', scopeRevision: 1, paused: false, createdAt: now, updatedAt: now, generations: 0, sentRequests: [], target: pendingTarget };
      pendingTarget = undefined;
      rounds.set(value.id, value);
      currentSessionId = value.id;
      return taskOk(structuredClone(value));
    },
    async rebind({ id, expectedRevision }) {
      const previous = staleRound();
      if (disposed || !previous || previous.id !== id || currentSessionId) return error('BINDING_STALE', '原轮次无法重新接入。');
      if (previous.scopeRevision !== expectedRevision) return error('SCOPE_STALE', '协作范围已变化，请重新读取。');
      const now = taskTime();
      const next: CollaborationSession = { ...previous, id: createId(rounds), writeSessionId, scopeRevision: 1, reboundFrom: id, createdAt: now, updatedAt: now };
      rounds.set(next.id, next);
      currentSessionId = next.id;
      return taskOk(structuredClone(next));
    },
    async update({ id, expectedRevision, goal, scope, paused }) {
      const value = rounds.get(id);
      if (!value || value.ended || !matches(value)) return error('BINDING_STALE', '本轮协作写绑定已失效。');
      if (expectedRevision !== value.scopeRevision) return error('SCOPE_STALE', '协作范围已变化，请重新读取。');
      if (goal !== undefined && !goal.trim()) return error('SCOPE_INVALID', '请填写创作目标。');
      const parsed = CollaborationScopeSchema.safeParse(scope ?? value.scope);
      if (!parsed.success) return error('SCOPE_INVALID', '协作范围无效。');
      return updateRound(value, { goal: goal ?? value.goal, scope: parsed.data, paused: paused ?? value.paused });
    },
    async end({ id, expectedRevision }) {
      const value = rounds.get(id);
      if (!value || value.ended) return error('SESSION_ENDED', '此协作已经结束。');
      if (!terminal(id)) return error('BINDING_STALE', '请结束重新接入后的当前轮次。');
      if (expectedRevision !== value.scopeRevision) return error('SCOPE_STALE', '协作范围已变化，请重新读取。');
      if (currentSessionId === id) currentSessionId = null;
      return updateRound(value, { ended: true, paused: true });
    },
    async deleteEnded({ id, expectedRevision }) {
      const value = rounds.get(id);
      if (!value?.ended || !terminal(id) || value.scopeRevision !== expectedRevision) return error('SCOPE_STALE', '请重新确认已结束的协作记录。');
      const ids = lineage(id);
      const history = [...calls.values()].filter(call => ids.has(call.sessionId));
      if (history.some(call => call.state === 'accepted' || call.state === 'running')) return error('SESSION_BUSY', '请等待已受理的调用完成后再删除本轮历史。');
      for (const sessionId of ids) { rounds.delete(sessionId); inspectedCalls.delete(sessionId); }
      for (const call of history) { calls.delete(call.callId); callDocuments.delete(call.callId); }
      return taskOk({ sessionIds: [...ids] });
    },
    async toolDefinition({ key }) { return key === editTool.key ? taskOk(structuredClone(editTool)) : error('TOOL_NOT_FOUND', '此工具没有装配到审核宿主。'); },
    async handoffTarget({ sessionId, target }) {
      const id = sessionId ?? currentSessionId;
      if (disposed || (!id && staleRound())) return error('BINDING_STALE', '请先重新接入当前轮次。');
      const value = id ? rounds.get(id) : undefined;
      if (id && (!value || value.ended || !matches(value))) return error('BINDING_STALE', '无法向失效的协作会话交接对象。');
      if (!session.host.list().some(document => document.documentId === target.source.documentId && document.revision === target.source.revision && Object.keys(document.files).length)) return error('TARGET_NOT_FOUND', '交接对象已经离开当前作品。');
      if (value) rounds.set(value.id, { ...value, target: structuredClone(target), updatedAt: taskTime() });
      else pendingTarget = structuredClone(target);
      return taskOk(structuredClone(target));
    },
    async chooseWorkspaceDirectory({ directory }) { return taskOk(directory || '/review/workspace'); },
    async configuration({ harness, destination, purpose = 'mcp', workspaceDirectory }) {
      if (purpose === 'mcp' && !enabled) return error('SERVICE_STOPPED', '请先开启审核服务。');
      const directory = workspaceDirectory || (destination === 'project' ? '/review/project' : '/review/personal');
      const fileName = purpose === 'skill' ? 'SKILL.md' : harness === 'codex' ? 'config.toml' : 'mcp.json';
      const path = directory + '/' + fileName;
      const content = purpose === 'skill' ? '# GalCraft 审核协作\n\n使用当前作品和写入会话标识。\n'
        : harness === 'codex' ? '[mcp_servers.galcraft]\nurl = "' + endpoint + '"\n' : JSON.stringify({ mcpServers: { galcraft: { url: endpoint } } }, null, 2);
      const existing = installations.get(path) ?? null;
      const state = existing === null ? 'notInstalled' : existing === content ? 'current' : 'updateAvailable';
      return taskOk({ harness, purpose, workspaceDirectory, path, content, command: content, existing,
        project: { projectId: project().projectId, projectRoot: '/review/project', writeSessionId, sessionId: currentSessionId ?? undefined },
        readback: { state, files: [{ path, state }] }, changes: existing === content ? [] : [{ path, existing, content }], instructions: '配置写入当前浏览器审核会话；外部客户端连接待桌面 Studio 验证。',
      } satisfies HarnessConfiguration);
    },
    async writeConfiguration(input) {
      const path = input.mode === 'export' ? input.path + '.review-export' : input.path;
      if (input.mode === 'merge' && (installations.get(path) ?? null) !== input.existing) return error('CONFIGURATION_STALE', '配置已变化，请重新预览。');
      installations.set(path, input.mergedContent ?? input.content);
      return taskOk({ status: 'written', path });
    },
    async open({ page, taskId, documentId, sessionId }) {
      if (sessionId && !rounds.has(sessionId)) return error('SESSION_NOT_FOUND', '协作记录不存在。');
      const inspected = sessionId && calls.get(inspectedCalls.get(sessionId) ?? '');
      const receipt = inspected && callDocuments.get(inspected.callId) === documentId ? inspected :
        [...calls.values()].reverse().find(call => call.sessionId === sessionId && callDocuments.get(call.callId) === documentId && call.state === 'completed');
      const input = receipt?.input as ReviewEdit | undefined;
      navigate({ page, taskId, documentId, statementId: input?.statementId });
      return taskOk(undefined);
    },
  };

  async function invokeEdit(input: ReviewEdit, sessionId = currentSessionId) {
    const round = sessionId ? rounds.get(sessionId) : undefined;
    if (!round || round.ended || !matches(round) || !session.getSnapshot().projectActive) return error('BINDING_STALE', '请先开始或接入当前作品的协作。');
    const createdAt = taskTime(), callId = createId(calls);
    const call: CallRecord = { sessionId: round.id, callId, tool: editTool.key, version: editTool.version, input, createdAt, updatedAt: createdAt, state: 'running',
      context: { sessionId: round.id, callId, projectId: round.projectId, writeSessionId, scopeRevision: round.scopeRevision, toolKey: editTool.key } };
    calls.set(callId, call);
    callDocuments.set(callId, input.documentId);
    const finish = <T extends Json>(result: import('@galcraft/contracts').Result<T>) => {
      const finishedAt = taskTime();
      calls.set(callId, { ...call, state: result.ok ? 'completed' : 'failed', updatedAt: finishedAt, finishedAt,
        ...(result.ok ? { result: result.value } : { error: result.error.message, errorCode: result.error.code, issue: result.error }) });
      return result;
    };
    if (!enabled) return finish(error<never>('SERVICE_STOPPED', '审核协作服务已关闭。'));
    if (round.paused) return finish(error<never>('SESSION_PAUSED', '当前协作已暂停写入。'));
    if (round.scope.mode === 'restricted' && !round.scope.tools.includes(editTool.key)) return finish(error<never>('TOOL_SCOPE', '本轮范围没有授权编辑工具。'));
    if (round.scope.mode === 'restricted' && !round.scope.documents.includes(input.documentId)) return finish(error<never>('DOCUMENT_SCOPE', '目标文档在本轮协作范围之外。'));
    const documents = session.host.list(), scene = authoringSource(documents).scenes.find(item => item.documentId === input.documentId);
    if (!scene || documentVersion(scene).revision !== input.revision) return finish(error<never>('DOCUMENT_STALE', '目标场景版本已变化，请重新读取。'));
    if (session.sourceReadOnly(scene.sceneId)) return finish(error<never>('DOCUMENT_SOURCE_INVALID', '目标场景源码含错误。请修复源码后再继续协作写入。'));
    if (hasUnappliedTaskSource(session, [input.documentId])) return finish(error<never>('DOCUMENT_DRAFT', '目标场景有未应用的源码草稿。请先应用或恢复。'));
    const prepared = prepareAuthoringEdit(documents, { op: 'commands.fields', sceneId: scene.sceneId, ids: [input.statementId], changes: [{ field: 'text', op: 'set', value: input.text }] });
    if (!prepared.ok) return finish(prepared);
    try { return finish(await session.applyEdit({ ...prepared.value, label: '协作修改对白' })); }
    catch (cause) { return finish(error<never>('COLLABORATION_EDIT', cause instanceof Error ? cause.message : String(cause))); }
  }

  return { bridge, invokeEdit, dispose() { disposed = true; enabled = false; }, currentTarget: () => currentSessionId ? rounds.get(currentSessionId)?.target : pendingTarget };
}
