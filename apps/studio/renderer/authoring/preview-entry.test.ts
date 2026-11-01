import { expect, it } from 'vitest';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { previewEntries, resolvePreviewEntry } from '@galcraft/runtime';
import { DebugRouteIntent } from './debug-route-intent.js';
import type { DebugScenario } from '@galcraft/contracts';
it('preserves afterstory labels, initial variables and story identity while keeping main independent', () => {
  const snapshot = structuredClone(FixtureSnapshot), scene = snapshot.scenes[1]!;
  scene.labels.Start1 = scene.instructions[1]!.statementId;
  snapshot.characters[0]!.afterstory = { id: 'Entry1', title: '后日谈',  entry: { sceneId: scene.scene.id, labelId: 'Start1' }, initialProgress: { Flag01: 7 }, unlockEndingIds: ['route'], lockedView: 'locked' };
  const selected = resolvePreviewEntry(snapshot, { sceneId: scene.scene.id, statementId: null });
  expect(selected.entry.statementId).toBe(scene.instructions[1]!.statementId); expect(selected.initialProgress).toEqual({ Flag01: 7 }); expect(selected.story?.kind).toBe('afterstory');
  expect(resolvePreviewEntry(snapshot, null).key).toBe('main'); expect(previewEntries(snapshot)).toHaveLength(2);
});
it('invalidates remembered choices without losing the entry declared initial variables', async () => {
  const intent = new DebugRouteIntent(), snapshot = structuredClone(FixtureSnapshot);
  const scenario: DebugScenario = { schemaVersion: 1, id: 'Debug1', name: '', projectId: snapshot.projectId, engineVersion: snapshot.engineVersion, pluginVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template], entry: { sceneId: snapshot.project.entry.sceneId, statementId: null }, target: { sceneId: snapshot.project.entry.sceneId, statementId: null }, route: [], playerInputs: [], initialProgress: { Flag01: 7 }, pluginInitial: {}, externalPolicy: 'simulate' };
  let invalid = false;
  const session = { prepareSession: async () => ({ ok: true as const, value: { id: 'Ready1', reached: !invalid, routePreparation: { kind: 'unreachable' }, state: { route: [] } }, warnings: [] }), disposePrepared: () => { invalid = false; } };
  intent.restore(snapshot, scenario, 'Entry1'); await intent.prepare(session as never, { snapshot, domain: { projectId: snapshot.projectId, kind: 'sample', instance: 'test' }, source: { kind: 'entry', scenario }, target: null }, 'selected');
  const next = structuredClone(scenario); intent.restore(snapshot, next, 'Entry1'); invalid = true;
  const result = await intent.prepare(session as never, { snapshot, domain: { projectId: snapshot.projectId, kind: 'sample', instance: 'test' }, source: { kind: 'entry', scenario: next }, target: null }, 'selected');
  expect(result.invalidated).toBe(true); expect(next.initialProgress).toEqual({ Flag01: 7 });
});
