import { afterEach, expect, it, vi } from 'vitest';
import type { BuildInput, CollaborationScope, Json } from '@galcraft/contracts';
import { workbenchBridge, unwrap } from '../../../pages/Production/bridge.js';
import { candidateFixture } from '../../../stories/review/studio-candidate/fixtures.js';
import { CandidateSession } from '../application/session.js';
import { candidateReleaseVersions } from './candidate-release-host.js';

const sessions: CandidateSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); });
async function open({ seed, createServices } = candidateFixture()) {
  const session = new CandidateSession(seed, createServices);
  sessions.push(session);
  await session.open();
  return session;
}
const scope: CollaborationScope = { mode: 'currentProject', documents: [], createKinds: [], tools: [],
  operations: [], connectionIds: [], models: [], workflowIds: [], maxGenerations: 2 };

it('preserves the explicit target and past calls across a reopened write identity', async () => {
  const fixture = candidateFixture(), session = await open(fixture);
  const { ui } = session.getSnapshot(), scene = session.sceneSource(ui.sceneId)!;
  const bridge = session.tasks.collaboration;
  unwrap(await bridge.start());
  const round = unwrap(await bridge.create({ goal: '对白校对', harness: 'codex', scope }));
  expect(round.target).toBeUndefined();
  await session.tasks.handoff(scene.documentId, ui.lineId);
  const target = unwrap(await bridge.overview()).sessions[0]!.target;
  const other = session.controller.source!.scenes.find(item => item.documentId !== scene.documentId)!;
  session.selectCommand(other.sceneId, null);
  expect(unwrap(await bridge.overview()).sessions[0]!.target).toEqual(target);

  const input = { documentId: scene.documentId, statementId: ui.lineId, revision: scene.revision, text: '已明确交接的对白' };
  unwrap(await session.tasks.invokeCollaborationEdit(input, round.id));
  const paused = unwrap(await bridge.update({ id: round.id, expectedRevision: round.scopeRevision, paused: true }));
  const reopened = await open({ ...fixture, seed: { ...fixture.seed, taskRecovery: session.captureRecovery(), documents: session.host.list() } });
  const nextBridge = reopened.tasks.collaboration;
  expect(unwrap(await nextBridge.overview())).toMatchObject({ currentSessionId: null, sessions: [expect.objectContaining({ id: round.id, bindingValid: false })] });
  expect(await reopened.tasks.invokeCollaborationEdit(input, round.id)).toMatchObject({ ok: false, error: { code: 'BINDING_STALE' } });
  const rebound = unwrap(await nextBridge.rebind({ id: round.id, expectedRevision: paused.scopeRevision }));
  expect(rebound).toMatchObject({ reboundFrom: round.id, target, paused: true, scope, writeSessionId: reopened.writeSessionId });
  const call = unwrap(await nextBridge.overview({ history: { sessionId: rebound.id, offset: 0, limit: 25 } })).callPage!.items[0]!;
  expect(call).toMatchObject({ sessionId: round.id, state: 'completed' });
  expect(unwrap(await nextBridge.readCall({ sessionId: round.id, callId: call.callId })).input).toEqual(input);
  const ended = unwrap(await nextBridge.end({ id: rebound.id, expectedRevision: rebound.scopeRevision }));
  expect(unwrap(await nextBridge.deleteEnded({ id: ended.id, expectedRevision: ended.scopeRevision })).sessionIds).toEqual([rebound.id, round.id]);
  expect(reopened.sceneSource(ui.sceneId)!.text).toContain(input.text);
});

it('keeps an interrupted call uncertain under its original identity without replaying the edit', async () => {
  const fixture = candidateFixture(), session = await open(fixture), bridge = session.tasks.collaboration;
  const { ui } = session.getSnapshot(), scene = session.sceneSource(ui.sceneId)!;
  unwrap(await bridge.start());
  const round = unwrap(await bridge.create({ goal: '待核实', harness: 'codex', scope }));
  const original = session.applyEdit.bind(session);
  let complete!: () => void;
  const wait = new Promise<void>(resolve => { complete = resolve; });
  vi.spyOn(session, 'applyEdit').mockImplementationOnce(async input => {
    await wait;
    return original(input);
  });
  const input = { documentId: scene.documentId, statementId: ui.lineId, revision: scene.revision, text: '留在原轮次的请求' };
  const inFlight = session.tasks.invokeCollaborationEdit(input, round.id);
  const call = unwrap(await bridge.overview()).calls[0]!;
  expect(call.state).toBe('running');
  const recovery = session.captureRecovery();
  complete();
  await inFlight;

  const reopened = await open({ ...fixture, seed: { ...fixture.seed, taskRecovery: recovery } });
  const nextBridge = reopened.tasks.collaboration;
  const rebound = unwrap(await nextBridge.rebind({ id: round.id, expectedRevision: round.scopeRevision }));
  const history = unwrap(await nextBridge.overview({ history: { sessionId: rebound.id, offset: 0, limit: 25 } })).callPage!;
  expect(history.items).toHaveLength(1);
  expect(history.items[0]).toMatchObject({ callId: call.callId, sessionId: round.id, state: 'uncertain' });
  expect(reopened.sceneSource(ui.sceneId)!.text).toBe(scene.text);
});

it('reports plugin document impact and preserves existing instances when the provider is disabled', async () => {
  const session = await open();
  const bridge = workbenchBridge(session.services.bridge), pluginId = 'org.galcraft.affection';
  const installed = unwrap(await bridge.plugins.list()).entries.find(item => item.manifest.id === pluginId)!;
  const enable = unwrap(await bridge.plugins.planChange({ pluginId, version: installed.manifest.version }));
  unwrap(await bridge.documents.applyEdit(enable.edit.planId, enable.edit.input.expected));
  const contributionKey = installed.manifest.contributions.find(item => item.kind === 'document')!.key;
  const create = unwrap(await bridge.documents.pluginCreate!({ pluginId, contributionKey, name: '测试好感度' }));
  unwrap(await session.applyEdit(create));
  const instance = unwrap(await bridge.documents.pluginList!({ pluginId }))[0]!;
  const disable = unwrap(await bridge.plugins.planChange({ pluginId, version: null }));
  expect(disable.change.changes[0]!.affected).toContainEqual({ kind: 'document', id: instance.documentId });
  unwrap(await bridge.documents.applyEdit(disable.edit.planId, disable.edit.input.expected));
  expect(unwrap(await bridge.documents.pluginList!({ pluginId }))).toEqual([instance]);
  expect(await bridge.documents.pluginUpdate!({ documentId: instance.documentId, expectedRevision: instance.revision, data: instance.data }))
    .toMatchObject({ ok: false, error: { code: 'CANDIDATE_PLUGIN_DOCUMENT_UNAVAILABLE' } });
});

async function releaseInput(session: CandidateSession): Promise<BuildInput> {
  const snapshot = unwrap(await session.services.compilePreview!(true)).snapshot!;
  return { projectId: snapshot.projectId, releaseVersion: snapshot.releaseVersion, snapshotId: snapshot.snapshotId,
    savedVersions: candidateReleaseVersions(session.host.list()), target: 'web', outputDirectory: 'candidate://exports/test',
    keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] };
}

it('invalidates an old plan on save and identifies actual receipt replacement', async () => {
  const session = await open(), bridge = workbenchBridge(session.services.bridge), input = await releaseInput(session);
  const first = unwrap(await bridge.builds.planBuild(input));
  const competing = unwrap(await bridge.builds.planBuild(input));
  const built = unwrap(await bridge.builds.build(first.planId));
  expect(built.localTest.result).toBe('notExecuted');
  expect(await bridge.builds.build(competing.planId)).toMatchObject({ ok: false, error: { code: 'CANDIDATE_BUILD_OUTPUT_STALE' } });
  const replacement = unwrap(await bridge.builds.planBuild(input));
  expect(replacement.issues).toContainEqual(expect.objectContaining({ code: 'CANDIDATE_BUILD_REPLACE' }));

  const document = session.host.list().find(doc => 'project.json' in doc.files)!;
  const before = JSON.parse(document.files['project.json']!).data.name as Json;
  unwrap(await session.applyEdit({
    label: '修改作品名称', origin: 'field', expected: [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }],
    patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/name', before, after: '新名称', op: 'set' }] }],
    preparedAssets: [], requiredRefs: [],
  }));
  expect(candidateReleaseVersions(session.host.list())).toEqual(input.savedVersions);
  expect(await session.save()).toBe(true);
  expect(await bridge.builds.build(replacement.planId)).toMatchObject({ ok: false, error: { code: 'CANDIDATE_BUILD_STALE' } });
  expect(unwrap(await bridge.builds.planBuild({ ...(await releaseInput(session)), target: 'android' })).issues)
    .toContainEqual(expect.objectContaining({ code: 'CANDIDATE_MOBILE_TOOLCHAIN', severity: 'error' }));
});

it('blocks release after an invalid saved source and retains compiler diagnostics', async () => {
  const session = await open(), bridge = workbenchBridge(session.services.bridge), input = await releaseInput(session);
  const { ui } = session.getSnapshot(), scene = session.sceneSource(ui.sceneId)!;
  expect(await session.commitSource(ui.sceneId, scene.text + '\nsay {')).toBe(true);
  expect(await session.save()).toBe(true);
  const planned = await bridge.builds.planBuild({ ...input, savedVersions: candidateReleaseVersions(session.host.list()) });
  expect(planned).toMatchObject({ ok: false, error: { code: 'CANDIDATE_BUILD_SNAPSHOT' }, issues: [expect.objectContaining({ severity: 'error' })] });
});
