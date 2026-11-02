import { describe, expect, it } from 'vitest';
import type { LongTerm, Result, Snapshot } from '@galcraft/contracts';
import { FixtureDomains, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { SessionController, type RuntimePorts } from './index.js';

const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };
async function start(snapshot: Snapshot, run = true) {
  let longTerm: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [], flowEntries: {}, variables: {}, plugins: {} };
  const ports: RuntimePorts = { contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [] },
    stage: { prepare: async input => ({ ok: true, value: { state: input.state, delta: null }, warnings: [] }) },
    longTerm: { current: () => structuredClone(longTerm),
      prepareFlowUnlocks: input => ({ ok: true, value: { sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId,
        sequence: input.sequence, expectedLongTermRevision: input.longTermAfter.revision, entries: [] }, warnings: [] }),
      commitRuntimeLongTerm: async input => { longTerm = { ...input.next, revision: input.next.revision + 1 };
        return { ok: true, value: { revision: longTerm.revision }, warnings: [] }; } } };
  const controller = new SessionController(ports);
  const position = { sceneId: snapshot.scenes[0]!.scene.id, statementId: snapshot.scenes[0]!.instructions[0]!.statementId };
  const prepared = unwrap(await controller.prepareSession({ snapshot, domain: { ...FixtureDomains[0]!, kind: 'playtest' }, source: { kind: 'entry', scenario: {
    schemaVersion: 1, id: crypto.randomUUID(), name: 'Player lifecycle', projectId: snapshot.projectId, entry: position, target: position,
    initialProgress: {}, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate', engineVersion: snapshot.engineVersion, pluginVersions: [] } }, target: null }));
  unwrap(controller.activate(prepared.id)); if (run) unwrap(await controller.start()); return controller;
}
function timerSnapshot(skippable = false) {
  const snapshot = structuredClone(FixtureSnapshot);
  const say = snapshot.scenes[0]!.instructions.find(item => item.opcode === 'say')!;
  const wait = { ...structuredClone(say), statementId: crypto.randomUUID(), opcode: 'wait', skippable,
    continuation: 'wait' as const, args: { durationMs: 1000 } };
  snapshot.scenes[0]!.instructions = [wait, say]; return snapshot;
}

describe('Player wait and skip lifecycle', () => {
  it('isolates activity tokens and observes timer, cover pause and session disposal immediately', async () => {
    const session = await start(timerSnapshot()), initial = session.inspect()!, activity = session.inspectActivity()!;
    expect(activity).toMatchObject({ sessionId: initial.sessionId, sequence: initial.sequence,
      token: initial.token, status: 'waiting', pendingLongTerm: false, waitKind: 'timer' });
    expect(session.inspectActivity(crypto.randomUUID())).toBeNull();
    activity.token!.statementId = crypto.randomUUID();
    initial.state.wait = null; initial.token!.occurrence = -1;
    const current = session.inspectActivity()!, before = session.inspect()!;
    expect(current.token!.occurrence).toBeGreaterThan(0);
    expect(current.token!.statementId).not.toBe(activity.token!.statementId);
    expect(before.state.wait?.kind).toBe('timer');
    unwrap(await session.setPauseReason('emergency', true));
    expect(session.inspectActivity()!.status).toBe('paused');
    expect(unwrap(session.elapseTimer({ token: current.token!, deltaMs: 1000 }))).toBe(false);
    expect(session.inspect()!.state.wait).toEqual(before.state.wait);
    unwrap(await session.setPauseReason('emergency', false));
    expect(session.inspectActivity()!.status).toBe('waiting');
    expect(unwrap(session.elapseTimer({ token: current.token!, deltaMs: 1000 }))).toBe(true);
    expect(session.inspectActivity()!.sequence).toBeGreaterThan(current.sequence);
    unwrap(await session.dispatch({ kind: 'timer', token: current.token! }));
    expect(session.inspectActivity()!.waitKind).toBe('say');
    expect(session.inspect()!.history).toHaveLength(1);
    session.dispose(); expect(session.inspectActivity()).toBeNull(); expect(session.inspect()).toBeNull();
  });
  it('ends the preceding one-shot voice in a movie entry checkpoint while retaining its history', async () => {
    const snapshot = timerSnapshot(), [video, say] = snapshot.scenes[0]!.instructions;
    video!.opcode = 'video'; video!.args = { assetId: snapshot.assets[0]!.assetId };
    say!.args = { ...say!.args as object, voice: snapshot.assets.find(asset => asset.kind === 'audio')!.assetId };
    snapshot.scenes[0]!.instructions = [say!, video!];
    const session = await start(snapshot), dialogue = session.inspect()!;
    expect(dialogue.state.presentation.voice).not.toBeNull();
    unwrap(await session.updateTextProgress({ token: dialogue.token!, textShown: 10000 }));
    unwrap(await session.dispatch({ kind: 'advance', token: dialogue.token! }));
    const movie = session.inspect()!, checkpoint = session.checkpointsFor(movie.sessionId).at(-1)!;
    expect(movie.state.wait?.kind).toBe('animation');
    expect(movie.history).toHaveLength(1);
    expect(checkpoint.state.phase).toBe('entry');
    expect(checkpoint.state.presentation.voice).toBeNull();
    expect(checkpoint.state.occurrence).toBe(1);
    expect(checkpoint.executed.map(item => item.statementId)).toEqual([say!.statementId]);
  });
  it('checkpoints a first movie before execution and resumes it once without duplicating occurrence or history', async () => {
    const snapshot = timerSnapshot();
    const video = snapshot.scenes[0]!.instructions[0]!;
    video.opcode = 'video'; video.args = { assetId: snapshot.assets[0]!.assetId }; video.skippable = false;
    const session = await start(snapshot);
    const original = session.inspect()!;
    expect(original.state.wait?.kind).toBe('animation');
    const checkpoint = session.checkpointsFor(original.sessionId).at(-1)!;
    expect(checkpoint.state.phase).toBe('entry');
    expect(checkpoint.state.wait).toBeNull();
    expect(checkpoint.state.position.statementId).toBe(video.statementId);
    expect(checkpoint.state.occurrence).toBe(0);
    expect(checkpoint.executed).toEqual([]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const prepared = unwrap(await session.prepareSession({ snapshot, domain: { ...FixtureDomains[0]!, kind: 'playtest' },
        source: { kind: 'restored', state: checkpoint.state, history: [], voiceLocale: 'zh-CN' }, target: null }));
      unwrap(session.activate(prepared.id)); unwrap(await session.start());
      const movie = session.inspect()!;
      expect(movie.token?.occurrence).toBe(1);
      expect(movie.state.wait?.kind).toBe('animation');
      unwrap(await session.dispatch({ kind: 'animation', token: movie.token! }));
      const after = session.inspect()!;
      expect(after.state.wait?.kind).toBe('say');
      expect(after.token?.occurrence).toBe(2);
      expect(after.history).toHaveLength(1);
      expect(after.history[0]!.occurrence).toBe(2);
    }
  });
  it.each([0, 1000])('keeps a single debug step paused and resumes after a %sms wait instruction', async durationMs => {
    const snapshot = timerSnapshot(true);
    snapshot.scenes[0]!.instructions[0]!.args = { durationMs };
    const session = await start(snapshot, false);
    let current = session.inspect()!;
    unwrap(await session.dispatchDebug({ requestId: crypto.randomUUID(), sessionId: current.sessionId,
      expectedSequence: current.sequence, command: { op: 'pause' } }));
    current = session.inspect()!;
    unwrap(await session.dispatchDebug({ requestId: crypto.randomUUID(), sessionId: current.sessionId,
      expectedSequence: current.sequence, command: { op: 'step' } }));
    expect(session.inspect()!.status).toBe('paused');
    expect(session.inspect()!.state.wait?.kind ?? null).toBe(durationMs ? 'timer' : null);
    current = session.inspect()!;
    unwrap(await session.dispatchDebug({ requestId: crypto.randomUUID(), sessionId: current.sessionId,
      expectedSequence: current.sequence, command: { op: 'resume' } }));
    expect(session.inspect()!.status).toBe('waiting');
    if (durationMs) expect(unwrap(session.elapseTimer({ token: session.inspect()!.token!, deltaMs: 1000 }))).toBe(true);
    else expect(session.inspect()!.state.wait?.kind).toBe('say');
  });
  it('holds dialogue text during debug pause and restores normal input after resume', async () => {
    const snapshot = structuredClone(FixtureSnapshot);
    const say = snapshot.scenes[0]!.instructions.find(item => item.opcode === 'say')!;
    snapshot.scenes[0]!.instructions = [say];
    const session = await start(snapshot);
    const active = session.inspect()!;
    unwrap(await session.updateTextProgress({ token: active.token!, textShown: 2 }));
    let current = session.inspect()!;
    unwrap(await session.dispatchDebug({ requestId: crypto.randomUUID(), sessionId: current.sessionId,
      expectedSequence: current.sequence, command: { op: 'pause' } }));
    const held = session.inspect()!.state.wait;
    const typing = await session.updateTextProgress({ token: active.token!, textShown: 10000 });
    expect(typing.ok).toBe(false); if (!typing.ok) expect(typing.error.code).toBe('SESSION_PAUSED');
    expect(session.inspect()!.state.wait).toEqual(held);
    const step = await session.dispatchDebug({ requestId: crypto.randomUUID(), sessionId: active.sessionId,
      expectedSequence: session.inspect()!.sequence, command: { op: 'step' } });
    expect(step.ok).toBe(false); if (!step.ok) expect(step.error.code).toBe('STEP_WAIT');
    current = session.inspect()!;
    unwrap(await session.dispatchDebug({ requestId: crypto.randomUUID(), sessionId: current.sessionId,
      expectedSequence: current.sequence, command: { op: 'resume' } }));
    unwrap(await session.dispatch({ kind: 'advance', token: active.token! }));
    expect(session.inspect()!.state.wait).toMatchObject({ kind: 'say', textComplete: true });
  });
  it('keeps remaining wait time and advances once its timer completes', async () => {
    const session = await start(timerSnapshot());
    const token = session.inspect()!.token!;
    expect(unwrap(session.elapseTimer({ token, deltaMs: 600 }))).toBe(false);
    expect(session.inspect()!.state.wait).toEqual({ kind: 'timer', remainingMs: 400 });
    expect(unwrap(session.elapseTimer({ token, deltaMs: -10 }))).toBe(false);
    expect(unwrap(session.elapseTimer({ token, deltaMs: 600 }))).toBe(true);
    unwrap(await session.dispatch({ kind: 'timer', token }));
    expect(session.inspect()!.state.wait?.kind).toBe('say');
    expect(session.elapseTimer({ token, deltaMs: 1 }).ok).toBe(false);
  });

  it('holds the timer while runtime debugging pauses the session', async () => {
    const session = await start(timerSnapshot());
    const active = session.inspect()!;
    unwrap(await session.dispatchDebug({ requestId: crypto.randomUUID(), sessionId: active.sessionId,
      expectedSequence: active.sequence, command: { op: 'pause' } }));
    expect(unwrap(session.elapseTimer({ token: active.token!, deltaMs: 1000 }))).toBe(false);
    expect(session.inspect()!.state.wait).toEqual({ kind: 'timer', remainingMs: 1000 });
  });

  it('stops skip at an authored unskippable wait', async () => {
    const session = await start(timerSnapshot());
    const before = session.inspect()!;
    unwrap(await session.driveSkip('all'));
    expect(session.inspect()!.token).toEqual(before.token);
    expect(session.inspect()!.state.wait).toEqual({ kind: 'timer', remainingMs: 1000 });
  });

  it('stops an active skip when the player opens a system page or cancels it', async () => {
    const snapshot = structuredClone(FixtureSnapshot);
    const say = snapshot.scenes[0]!.instructions.find(item => item.opcode === 'say')!;
    snapshot.scenes[0]!.instructions = [say, { ...structuredClone(say), statementId: crypto.randomUUID() }];
    const session = await start(snapshot), token = session.inspect()!.token!;
    let checks = 0;
    unwrap(await session.driveSkip('all', () => ++checks === 1));
    expect(session.inspect()!.token).toEqual(token);
    expect(session.inspect()!.state.wait).toMatchObject({ kind: 'say', textComplete: true });
  });
});
