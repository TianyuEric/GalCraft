import { describe, expect, it } from 'vitest';
import { FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import type { LongTerm } from '@galcraft/contracts';
import { SessionController } from '@galcraft/runtime';
import { StageCommandService } from '@galcraft/stage';
import { isIntroWait } from './intro-wait.js';
import { isStageAnimationWait } from './animation-wait.js';

describe('intro wait ownership', () => {
  it('accepts an intro wait and rejects a later animation wait while the final intro picture remains', () => {
    const snapshot = structuredClone(FixtureSnapshot);
    const scene = snapshot.scenes[0]!;
    const introId = crypto.randomUUID(), animationId = crypto.randomUUID();
    const source = scene.instructions[0]!.source;
    scene.instructions.push({ ...scene.instructions[0]!, statementId: introId, opcode: 'intro',
      source: { ...source, statementId: introId } });
    scene.instructions.push({ ...scene.instructions[0]!, statementId: animationId, opcode: 'setTransform',
      source: { ...source, statementId: animationId } });
    const state = structuredClone(FixtureRuntimeState);
    state.presentation.intro = { paragraphs: ['序章'], index: 0, shown: 2, held: true,
      backgroundColor: '#000000', backgroundImage: null, textColor: '#ffffff', fontSize: null,
      animation: 'fade', durationMs: 300, elapsedMs: 300, holdMs: 0, holdRemainingMs: 0,
      manual: true, keepFinal: true };
    state.wait = { kind: 'animation', processIds: [] };
    state.position.statementId = introId;
    const token = { sessionId: crypto.randomUUID(), occurrence: 1, statementId: introId };
    expect(isIntroWait(snapshot, state, token)).toBe(true);
    expect(isStageAnimationWait(snapshot,state,token,token)).toBe(true);
    expect(isStageAnimationWait(snapshot,state,token,{...token,occurrence:2})).toBe(false);
    state.position.statementId = animationId;
    state.wait = { kind: 'animation', processIds: [crypto.randomUUID()] };
    expect(isIntroWait(snapshot, state, { ...token, statementId: animationId })).toBe(false);
  });

  it('recognizes a wait produced by the real runtime and stage intro command', async () => {
    const snapshot = structuredClone(FixtureSnapshot), introId = crypto.randomUUID();
    const source = snapshot.scenes[0]!.instructions[0]!.source;
    snapshot.scenes[0]!.instructions.unshift({ ...snapshot.scenes[0]!.instructions[0]!, statementId: introId,
      opcode: 'intro', continuation: 'wait', args: { op: 'show', paragraphs: ['序章'], manual: true, keepFinal: true },
      source: { ...source, statementId: introId } });
    const persistent: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [],
      flowEntries: {}, variables: {}, plugins: {} };
    const success = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
    const session = new SessionController({
      longTerm: { current: () => persistent,
        prepareFlowUnlocks: input => success({ sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId,
          sequence: input.sequence, expectedLongTermRevision: input.longTermAfter.revision, entries: [] }),
        commitRuntimeLongTerm: async () => success({ revision: 1 }) },
      stage: new StageCommandService({ asset: assetId => {
        const asset = snapshot.assets.find(item => item.assetId === assetId);
        return asset ? success({ variantId: asset.variantId, kind: asset.kind, provider: asset.provider,
          providerVersion: null }) : { ok: false as const, error: { code: 'ASSET_MISSING',
            severity: 'error' as const, message: 'missing', owner: 'M06' as const, related: [], actions: [] }, issues: [] };
      } }),
      contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [],
        pages: [], components: [], systems: [], platform: [] },
    });
    const position = { sceneId: snapshot.project.entry.sceneId, statementId: introId };
    const prepared = await session.prepareSession({ snapshot,
      domain: { projectId: snapshot.projectId, kind: 'player', instance: 'intro-test' },
      source: { kind: 'entry', scenario: { schemaVersion: 1, id: crypto.randomUUID(), name: 'Intro',
        projectId: snapshot.projectId, entry: position, target: position, initialProgress: {}, pluginInitial: {},
        route: [], playerInputs: [], externalPolicy: 'simulate', engineVersion: snapshot.engineVersion,
        pluginVersions: [] } }, target: null });
    if (!prepared.ok) throw prepared.error;
    expect(session.activate(prepared.value.id).ok).toBe(true);
    const started = await session.start(); if (!started.ok) throw started.error;
    const active = session.inspect()!;
    expect(active.state.wait?.kind).toBe('animation');
    expect(isIntroWait(snapshot, active.state, active.token)).toBe(true);
    expect(isStageAnimationWait(snapshot,active.state,active.token,active.token!)).toBe(true);
    const completed=await session.dispatch({kind:'animation',token:active.token!});
    if(!completed.ok)throw completed.error;
    const reading=session.inspect()!;
    expect(reading.state.wait?.kind).toBe('say');
    expect(reading.state.presentation.intro).not.toBeNull();
    // A retained intro can finish rendering on a later say token. It must not
    // send an animation completion to a statement waiting for player advance.
    expect(isStageAnimationWait(snapshot,reading.state,reading.token,reading.token!)).toBe(false);
    expect(reading.issue).toBeNull();
  });
});
