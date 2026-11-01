import { describe, expect, it, vi } from 'vitest';
import type { AudioState, Id, LongTerm } from '@galcraft/contracts';
import { FixtureDomains, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { SessionController, type RuntimePorts } from '@galcraft/runtime';
import type { AudioMixer } from '@galcraft/stage';
import { PlayerAudioRouter } from './audio-routing.js';

const id = () => crypto.randomUUID();
const sound = (assetId: Id, stopped = false): AudioState => ({ assetId, variantId: id(), stopped,
  volume: 1, startSec: 0, loop: true, loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 120 });
const played = (sourceId: Id) => ({ ok: true as const, value: sourceId, warnings: [] });

describe('PlayerAudioRouter', () => {
  it.each(['typewriter', 'first click'])('keeps the dialogue voice when %s completes the text', async mode => {
    const snapshot = structuredClone(FixtureSnapshot);
    const first = snapshot.scenes[0]!.instructions.find(instruction => instruction.opcode === 'say')!;
    snapshot.scenes[0]!.instructions = [first];
    const audio = { play: vi.fn(async () => played(id())), stop: vi.fn(), silence: vi.fn() };
    const router = new PlayerAudioRouter(audio, () => controller.inspect()?.sessionId ?? null);
    let longTerm: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [], flowEntries: {}, variables: {}, plugins: {} };
    const ports: RuntimePorts = { contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [] },
      stage: { prepare: async input => ({ ok: true, value: { state: input.state, delta: null }, warnings: [] }) },
      longTerm: { current: () => structuredClone(longTerm),
        prepareFlowUnlocks: input => ({ ok: true, value: { sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId,
          sequence: input.sequence, expectedLongTermRevision: input.longTermAfter.revision, entries: [] }, warnings: [] }),
        commitRuntimeLongTerm: async input => { longTerm = { ...input.next, revision: input.next.revision + 1 };
          return { ok: true, value: { revision: longTerm.revision }, warnings: [] }; } },
      onCommitted: input => { router.applyDialogue(input); return { presentationEntered: true, mediaStarted: false }; } };
    const controller = new SessionController(ports);
    const position = { sceneId: snapshot.scenes[0]!.scene.id, statementId: first.statementId };
    const prepared = await controller.prepareSession({ snapshot, domain: FixtureDomains[0]!, source: { kind: 'entry', scenario: {
      schemaVersion: 1, id: id(), name: 'voice lifecycle', projectId: snapshot.projectId, entry: position, target: position,
      initialProgress: {}, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate', engineVersion: snapshot.engineVersion, pluginVersions: [] } }, target: null });
    if (!prepared.ok) throw prepared.error;
    expect(controller.activate(prepared.value.id).ok).toBe(true);
    expect((await controller.start()).ok).toBe(true);
    const token = controller.inspect()!.token!;
    expect(audio.play).toHaveBeenCalledTimes(1);
    const completed = mode === 'first click' ? await controller.dispatch({ kind: 'advance', token }) :
      await controller.updateTextProgress({ token, textShown: 10000 });
    expect(completed.ok).toBe(true);
    expect(controller.inspect()!.token).toEqual(token);
    expect(controller.inspect()!.state.wait).toMatchObject({ kind: 'say', textComplete: true });
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(audio.silence).not.toHaveBeenCalled();
    controller.replayVoice();
    expect(audio.play).toHaveBeenCalledTimes(2);
  });
  it('stops BGM by bus when the stop instruction has no asset identity', async () => {
    const sessionId = id(), assetId = id(), sourceId = id();
    const audio = { play: vi.fn(async () => played(sourceId)), stop: vi.fn() } as unknown as AudioMixer;
    const router = new PlayerAudioRouter(audio, () => sessionId);
    router.apply(sessionId, 'bgm', assetId, sound(assetId));
    await Promise.resolve();
    router.apply(sessionId, 'bgm', null, sound(assetId, true));
    expect(audio.stop).toHaveBeenCalledWith(sourceId, 120);
  });

  it('discards a source that finishes loading after its stop instruction', async () => {
    const sessionId = id(), assetId = id(), sourceId = id();
    let complete!: (result: ReturnType<typeof played>) => void;
    const audio = { play: vi.fn(() => new Promise<ReturnType<typeof played>>(resolve => { complete = resolve; })),
      stop: vi.fn() } as unknown as AudioMixer;
    const router = new PlayerAudioRouter(audio, () => sessionId);
    router.apply(sessionId, 'sfx', assetId, sound(assetId));
    router.apply(sessionId, 'sfx', assetId, sound(assetId, true));
    complete(played(sourceId));
    await Promise.resolve();
    expect(audio.stop).toHaveBeenCalledWith(sourceId);
  });

  it('routes looped effects to ambience and stops them by sound identity', async () => {
    const sessionId = id(), soundId = id(), assetId = id(), sourceId = id();
    const audio = { play: vi.fn(async () => played(sourceId)), stop: vi.fn() } as unknown as AudioMixer;
    const router = new PlayerAudioRouter(audio, () => sessionId);
    router.applyStage(sessionId, { bus: 'sfx', id: soundId, state: sound(assetId) });
    await Promise.resolve();
    expect(audio.play).toHaveBeenCalledWith(expect.objectContaining({ bus: 'ambience', sessionId }));
    router.applyStage(sessionId, { bus: 'sfx', id: soundId, state: sound(assetId, true) });
    expect(audio.stop).toHaveBeenCalledWith(sourceId, 120);
  });
});
