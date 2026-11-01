import { describe, expect, it } from 'vitest';
import type { PlayerHost, Result, StorageBatch } from '@galcraft/contracts';
import { FixtureDomains, FixtureIds, FixtureSaveRecord, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { SessionController } from '@galcraft/runtime';
import { StageCommandService, StageController } from '@galcraft/stage';
import { PlayerDataService } from './data.js';
import { PlayerLongTermService } from './long-term.js';
import { RestoreCoordinator } from './restore.js';
import { playerVariableValues } from './variables.js';
import { PlayerView } from './view.js';

const success = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };

describe('R/S/U restore integration', () => {
  it.each(['voice', 'narration'] as const)('returns from legacy history after voice A to %s exactly once with the real stage voice guard', async destination => {
    const snapshot = structuredClone(FixtureSnapshot); snapshot.lock.plugins = [];
    const [first, second] = snapshot.scenes[0]!.instructions;
    const target = structuredClone(second!), future = structuredClone(second!);
    target.args = { speaker: destination === 'voice' ? { kind: 'character', id: FixtureIds.an } : { kind: 'narrator' },
      text: 'Historical target', voice: destination === 'voice' ? FixtureIds.voices[1]! : null };
    future.statementId = crypto.randomUUID(); future.source.statementId = future.statementId;
    future.args = { speaker: { kind: 'narrator' }, text: 'Later history', voice: null };
    snapshot.scenes[0]!.instructions = [first!, target, future];
    const values = new Map<string, Uint8Array>();
    const storage: PlayerHost['storage'] = { read: async key => success(values.get(key) ?? null),
      commit: async batch => { for (const write of batch.writes) values.set(write.key, write.bytes);
        return success({ revision: batch.expectedRevision + 1 }); } };
    const data = new PlayerDataService({ target: 'web', storage } as PlayerHost, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    unwrap(await data.open());
    const session = new SessionController({ longTerm: new PlayerLongTermService(data),
      stage: new StageCommandService({ asset: () => { throw new Error('Dialogue needs no stage asset'); } }),
      contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [],
        pages: [], components: [], systems: [], platform: [] } });
    const initial = structuredClone(FixtureSaveRecord.state);
    initial.phase = 'entry'; initial.wait = null; initial.occurrence = 0; initial.presentation.voice = null;
    const firstSession = unwrap(await session.prepareSession({ snapshot, domain: data.domain,
      source: { kind: 'restored', state: initial, history: [], voiceLocale: 'zh-CN' }, target: null }));
    unwrap(session.activate(firstSession.id)); unwrap(await session.start());
    const voiceA = structuredClone(session.inspect()!.state.presentation.voice); expect(voiceA).not.toBeNull();
    const advance = async () => { const token = session.inspect()!.token!;
      unwrap(await session.updateTextProgress({ token, textShown: 10000 })); unwrap(await session.dispatch({ kind: 'advance', token })); };
    await advance(); await advance();
    const legacy = session.inspect()!;
    const historical = legacy.history.find(entry => entry.position.statementId === target.statementId)!;
    historical.entryState!.presentation.voice = voiceA;
    historical.entryState!.pendingReadStatementId = first!.statementId;
    const originalEntry = structuredClone(historical.entryState);
    const active = unwrap(await session.prepareSession({ snapshot, domain: data.domain,
      source: { kind: 'restored', state: legacy.state, history: legacy.history, voiceLocale: 'zh-CN' }, target: null }));
    unwrap(session.activate(active.id));
    const before = session.inspect()!;
    // Empty dialogue stages use M06's actual binding validation without a GPU or media decoder.
    const stage = Object.assign(Object.create(StageController.prototype), { handles: new Map(), prepared: new Map(),
      commitStage: () => success(undefined), disposeRetiredStage: () => {} }) as StageController;
    const restore = new RestoreCoordinator(snapshot, data, session, stage);
    let failedPreparation = true;
    const prepareStage = stage.prepareStage.bind(stage);
    stage.prepareStage = async (...args) => {
      expect(session.inspect()).toEqual(before);
      if (failedPreparation) { const error = { code: 'STAGE_RESOURCE', severity: 'error' as const, owner: 'M06' as const,
        message: 'Preparation failed', related: [], actions: ['retry' as const] }; return { ok: false, error, issues: [error] }; }
      return prepareStage(...args);
    };
    const reports: Result<unknown>[] = [];
    const view = { options: { snapshot, session, data, restore }, ask: async () => true, t: (text: string) => text,
      report: (result: Result<unknown>) => { reports.push(result); }, confirmMappings: async () => true,
      showStory: () => {}, render: () => {} } as unknown as PlayerView;
    const jump = () => (PlayerView.prototype as unknown as { jumpHistory(id: string): Promise<void> }).jumpHistory.call(view, historical.id);
    await jump();
    expect(reports.at(-1)).toMatchObject({ ok: false, error: { code: 'STAGE_RESOURCE' } });
    expect(session.inspect()).toEqual(before);
    failedPreparation = false; reports.length = 0;
    await jump();
    for (const result of reports) unwrap(result);
    const returned = session.inspect()!;
    expect(returned.sessionId).not.toBe(before.sessionId);
    expect(returned.state.position.statementId).toBe(target.statementId);
    expect(returned.state.wait?.kind).toBe('say');
    expect(returned.state.pendingReadStatementId).toBeUndefined();
    expect(returned.history.map(entry => entry.position.statementId)).toEqual([first!.statementId, target.statementId]);
    expect(returned.history.at(-1)!.entryState!.presentation.voice).toBeNull();
    expect(returned.history.at(-1)!.entryState!.pendingReadStatementId).toBeUndefined();
    expect(legacy.history.find(entry => entry.id === historical.id)!.entryState).toEqual(originalEntry);
    expect(before.history.find(entry => entry.id === historical.id)!.entryState).toEqual(originalEntry);
    expect(returned.state.presentation.voice?.assetId ?? null).toBe(destination === 'voice' ? FixtureIds.voices[1] : null);
    if (destination === 'voice') {
      const waiting = unwrap(await session.prepareSession({ snapshot, domain: data.domain,
        source: { kind: 'restored', state: returned.state, history: returned.history, voiceLocale: 'zh-CN' }, target: null }));
      expect((await prepareStage(waiting.sessionId, waiting.state.presentation, null, waiting.voiceBinding)).ok).toBe(true);
      expect(await prepareStage(waiting.sessionId, waiting.state.presentation, null, null)).toMatchObject({ ok: false, error: { code: 'VOICE_BINDING' } });
      expect(await prepareStage(crypto.randomUUID(), waiting.state.presentation, null, waiting.voiceBinding)).toMatchObject({ ok: false, error: { code: 'VOICE_BINDING' } });
    }
  });
  it('publishes one restored session before retiring the old stage and feeds captured progress to stage commands', async () => {
    const snapshot = structuredClone(FixtureSnapshot);
    snapshot.lock.plugins = [];
    const record = structuredClone(FixtureSaveRecord);
    record.state.progress[FixtureIds.relation] = 23;
    record.dependencyVersions = [snapshot.lock.engine, snapshot.lock.template];
    const values = new Map<string, Uint8Array>();
    const storage: PlayerHost['storage'] = {
      read: async key => success(values.get(key) ?? null),
      commit: async (batch: StorageBatch) => {
        for (const write of batch.writes) values.set(write.key, write.bytes);
        for (const key of batch.deletes) values.delete(key);
        return success({ revision: batch.expectedRevision + 1 });
      },
    };
    const data = new PlayerDataService({ target: 'web', storage } as PlayerHost,
      FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    expect((await data.open()).ok).toBe(true);
    const longTerm = new PlayerLongTermService(data);
    const commands = new StageCommandService({ asset: assetId => {
      const asset = snapshot.assets.find(item => item.assetId === assetId);
      return asset ? success({ variantId: asset.variantId, kind: asset.kind,
        provider: asset.provider, providerVersion: null }) : {
        ok: false as const, error: { code: 'ASSET_MISSING', severity: 'error' as const, message: 'missing',
          owner: 'M06' as const, related: [], actions: ['locate' as const] }, issues: [] };
    } });
    const session = new SessionController({ longTerm, stage: commands,
      contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [],
        pages: [], components: [], systems: [], platform: [] } });
    const events: string[] = [];
    const stage = {
      prepareStage: async (sessionId: string, state: typeof record.state.presentation, key: { requestId: string }) =>
        success({ id: crypto.randomUUID(), sessionId, restoreKey: key, state, voiceBinding: null, resources: [] }),
      commitStage: () => { events.push('stage'); return success(undefined); },
      discardPrepared: () => {},
      disposeRetiredStage: () => { events.push('retired'); },
    } as unknown as StageController;
    const restore = new RestoreCoordinator(snapshot, data, session, stage);
    restore.subscribe(() => { events.push('published'); expect(session.inspect()?.state.position).toEqual(record.state.position); });
    const context = restore.context(); if (!context.ok) throw context.error;
    const requestId = crypto.randomUUID();
    const prepared = await restore.prepareRestore({ requestId, purpose: 'activate',
      source: { kind: 'save', record }, context: context.value });
    if (!prepared.ok) throw prepared.error;
    const committed = restore.commitLoad({ requestId, acceptMappings: true });
    if (!committed.ok) throw committed.error;
    expect(events).toEqual(['stage', 'published', 'retired']);
    const current = session.inspect()!;
    expect(playerVariableValues(snapshot,current.state,data.current()!.longTerm).progress[FixtureIds.relation]).toBe(23);
    const presentation = structuredClone(current.state.presentation);
    presentation.effects.push({ id: crypto.randomUUID(), type: 'snow', target: 'stage', enabled: true,
      resourceId: null, parameters: {}, elapsedMs: 400, seed: 1 });
    expect(session.syncPresentation(current.sessionId, presentation).ok).toBe(true);
    const audioAsset = snapshot.assets.find(item => item.assetId === FixtureIds.voices[0])!;
    const next = await commands.prepare({ state: session.inspect()!.state, token: current.token!, opcode: 'bgm',
      args: { op: 'play', assetId: audioAsset.assetId, loop: true } });
    if (!next.ok) throw next.error;
    expect(next.value.state.presentation.effects[0]?.elapsedMs).toBe(400);
    expect(next.value.state.presentation.bgm.assetId).toBe(audioAsset.assetId);
  });
  it('activates B when A finishes later and releases only A preparation', async () => {
    const snapshot = structuredClone(FixtureSnapshot); snapshot.lock.plugins = [];
    const record = structuredClone(FixtureSaveRecord);
    record.dependencyVersions = [snapshot.lock.engine, snapshot.lock.template];
    const storage: PlayerHost['storage'] = { read: async () => success(null),
      commit: async batch => success({ revision: batch.expectedRevision + 1 }) };
    const data = new PlayerDataService({ target: 'web', storage } as PlayerHost, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    expect((await data.open()).ok).toBe(true);
    const session = new SessionController({ longTerm: new PlayerLongTermService(data),
      stage: new StageCommandService({ asset: () => { throw new Error('No assets in this restore'); } }),
      contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [],
        pages: [], components: [], systems: [], platform: [] } });
    const a = crypto.randomUUID(), b = crypto.randomUUID();
    let enteredA!: () => void, releaseA!: () => void;
    const waitingA = new Promise<void>(resolve => { enteredA = resolve; });
    const heldA = new Promise<void>(resolve => { releaseA = resolve; });
    const resources = new Set<string>(), discarded: string[] = [], commits: string[] = [];
    let activeStage: string | null = null;
    const stage = {
      prepareStage: async (sessionId: string, state: typeof record.state.presentation, key: { requestId: string }) => {
        const id = crypto.randomUUID(); resources.add(id);
        if (key.requestId === a) { enteredA(); await heldA; }
        return success({ id, sessionId, restoreKey: key, state, voiceBinding: null, resources: [] });
      },
      commitStage: (id: string) => { activeStage = id; commits.push(id); return success(undefined); },
      discardPrepared: (id: string) => { expect(id).not.toBe(activeStage); resources.delete(id); discarded.push(id); },
      disposeRetiredStage: () => {},
    } as unknown as StageController;
    const restore = new RestoreCoordinator(snapshot, data, session, stage);
    const published: string[] = []; restore.subscribe(receipt => published.push(receipt.requestId));
    const context = restore.context(); if (!context.ok) throw context.error;
    const source = { kind: 'save' as const, record };
    const pendingA = restore.prepareRestore({ requestId: a, purpose: 'activate', source, context: context.value });
    await waitingA;
    const preparedB = await restore.prepareRestore({ requestId: b, purpose: 'activate', source, context: context.value });
    if (!preparedB.ok) throw preparedB.error;
    const committedB = restore.commitLoad({ requestId: b, acceptMappings: true });
    if (!committedB.ok) throw committedB.error;
    releaseA();
    const staleA = await pendingA;
    expect(staleA.ok || staleA.error.code).toBe('RESTORE_STALE');
    expect(restore.commitLoad({ requestId: a, acceptMappings: true }).ok).toBe(false);
    expect(published).toEqual([b]); expect(commits).toHaveLength(1);
    expect(session.inspect()?.sessionId).toBe(committedB.value.sessionId);
    expect(discarded).toHaveLength(1);
    expect(resources).toEqual(new Set([activeStage!]));
  });
});
