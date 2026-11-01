import type { Domain, Expr, FlowEntryRecord, Id, LongTerm, Result } from '@galcraft/contracts';
import { evaluateBoolean } from '@galcraft/runtime';
import type { FlowUnlockDelta, FlowUnlockInput, LongTermService, RuntimeLongTermInput } from '@galcraft/runtime';
import type { PlayerDataService } from './data.js';
import { clone, fail, ok } from './common.js';

export class PlayerLongTermService implements LongTermService {
  private view: LongTerm | null = null;
  private pending = new Map<string, Promise<Result<{ revision: number }>>>();
  private lastSequence = new Map<Id, number>();
  private sequence: Promise<unknown> = Promise.resolve();
  private activeSessionId: Id | null = null;
  constructor(readonly data: PlayerDataService) {}
  setActiveSession(sessionId: Id | null) { this.activeSessionId = sessionId; }
  current(domain: Domain): LongTerm {
    if (JSON.stringify(domain) !== JSON.stringify(this.data.domain)) throw new Error('Domain mismatch');
    return clone(this.view ?? this.data.current()?.longTerm ?? { schemaVersion: 2, revision: 0,
      readStatements: [], endings: [], cg: {}, music: [], video: [], flowEntries: {}, variables: {}, plugins: {} });
  }
  prepareFlowUnlocks(input: FlowUnlockInput): Result<FlowUnlockDelta> {
    if (JSON.stringify(input.domain) !== JSON.stringify(this.data.domain) || input.snapshot.projectId !== input.domain.projectId)
      return fail('DOMAIN_MISMATCH', '流程采样资料域不匹配');
    const existing = this.current(input.domain), entries: FlowEntryRecord[] = [];
    for (const flow of input.snapshot.flows) for (const node of flow.nodes) {
      if (node.entry.kind !== 'firstUnlock' || existing.flowEntries[node.id] || input.longTermAfter.flowEntries[node.id]) continue;
      const localIds = new Set<Id>();
      const scan = (value: Expr): void => {
        if (value.kind === 'variable' && value.scope === 'local') localIds.add(value.id);
        if (value.kind === 'unary') scan(value.value);
        if (value.kind === 'binary') { scan(value.left); scan(value.right); }
        if (value.kind === 'call') value.args.forEach(scan);
      };
      scan(node.unlock);
      const declaringScenes = new Set(input.snapshot.scenes.filter(scene =>
        scene.scene.locals.some(variable => localIds.has(variable.id)) ||
        scene.scene.parameters.some(parameter => localIds.has(parameter.variableId))).map(scene => scene.scene.id));
      if (localIds.size && (declaringScenes.size !== 1 || input.state.frames.at(-1)?.sceneId !== [...declaringScenes][0])) continue;
      try {
        const evaluation = evaluateBoolean(node.unlock, { state: input.state, longTerm: input.longTermAfter,
          variables: input.snapshot.variables });
        if (!evaluation.value) continue;
      } catch (error) { return fail('FLOW_UNLOCK_EVALUATION', String(error), ['locate']); }
      entries.push({ schemaVersion: 1, projectId: input.snapshot.projectId, nodeId: node.id,
        unlockedAt: new Date().toISOString(), state: clone(input.state), releaseVersion: input.snapshot.releaseVersion,
        engineVersion: input.snapshot.engineVersion,
        dependencyVersions: [input.snapshot.lock.engine, ...input.snapshot.lock.plugins, input.snapshot.lock.template] });
    }
    return ok({ sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId,
      sequence: input.sequence, expectedLongTermRevision: existing.revision, entries });
  }
  commitRuntimeLongTerm(input: RuntimeLongTermInput): Promise<Result<{ revision: number }>> {
    const key = `${input.sessionId}/${input.sequence}`;
    const repeated = this.pending.get(key); if (repeated) return repeated;
    const operation = this.sequence.then(async (): Promise<Result<{ revision: number }>> => {
      if (JSON.stringify(input.domain) !== JSON.stringify(this.data.domain) ||
        this.activeSessionId !== null && input.sessionId !== this.activeSessionId)
        return fail('LONG_TERM_SESSION', '会话已不再活动');
      const previous = this.lastSequence.get(input.sessionId) ?? -1;
      if (input.sequence < previous) return fail('LONG_TERM_SEQUENCE', '旧运行提交不可写入资料');
      const base = input.base ?? this.current(input.domain);
      let current = this.current(input.domain), next = clone(input.next);
      const prepare = (): Result<null> => {
        next = clone(current);
        for (const field of ['readStatements','endings','music','video','afterstoryCompleted'] as const)
          next[field] = [...new Set([...(current[field] ?? []), ...(input.next[field] ?? []).filter(id => !base[field]?.includes(id))])];
        for (const [id, differences] of Object.entries(input.next.cg))
          next.cg[id] = [...new Set([...(current.cg[id] ?? []), ...differences.filter(value => !base.cg[id]?.includes(value))])];
        for (const [id, entry] of Object.entries(input.next.flowEntries))
          if (!base.flowEntries[id] && !next.flowEntries[id]) next.flowEntries[id] = clone(entry);
        for (const field of ['variables','plugins'] as const) for (const [id, value] of Object.entries(input.next[field])) {
          if (JSON.stringify(value) === JSON.stringify(base[field][id])) continue;
          if (JSON.stringify(current[field][id]) !== JSON.stringify(base[field][id]) &&
            JSON.stringify(current[field][id]) !== JSON.stringify(value))
            return fail('LONG_TERM_CONFLICT', '同一长期字段已被其他操作修改，请保留现场并检查资料');
          Object.assign(next[field], {[id]: clone(value)});
        }
        return ok(null);
      };
      if (current.revision !== input.expectedRevision) { const prepared = prepare(); if (!prepared.ok) return prepared; }
      let saved = await this.data.saveLongTerm(next, current.revision);
      if (!saved.ok && /STALE|REVISION|CONFLICT/.test(saved.error.code)) {
        const loaded = await this.data.reload(); if (!loaded.ok) return loaded;
        current = loaded.value.longTerm; this.view = clone(current);
        const prepared = prepare(); if (!prepared.ok) return prepared;
        saved = await this.data.saveLongTerm(next, current.revision);
      }
      if (!saved.ok) return saved;
      this.view = clone(saved.value); this.lastSequence.set(input.sessionId, input.sequence);
      return ok({ revision: saved.value.revision });
    });
    this.sequence = operation.then(() => undefined, () => undefined);
    this.pending.set(key, operation);
    void operation.then(result => { if (!result.ok && this.pending.get(key) === operation) this.pending.delete(key); });
    return operation;
  }
  syncFromDisk() { this.view = this.data.current()?.longTerm ?? null; }
}
