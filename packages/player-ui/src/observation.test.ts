import { expect, it } from 'vitest';
import { FixtureRuntimeState, FixtureSnapshot, FixtureIds } from '@galcraft/contracts/fixtures';
import { observeVariables } from './observation.js';
import type { LongTerm } from '@galcraft/contracts';

it('reports requested actual scope and active local frame without borrowing a same-name value', () => {
  const snapshot = structuredClone(FixtureSnapshot), state = structuredClone(FixtureRuntimeState);
  snapshot.variables.push({ id: 'Long01', name: '同名', scope: 'longTerm', type: 'string', initial: '初值' });
  snapshot.scenes[0]!.scene.locals.push({ id: 'Local1', name: '同名', scope: 'local', type: 'boolean', initial: true });
  state.frames = [{ id: 'Frame1', sceneId: snapshot.scenes[0]!.scene.id, locals: { Local1: false }, returnTo: null, receiver: null }];
  state.progress[FixtureIds.relation] = 17;
  const longTerm: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [], flowEntries: {}, variables: { Long01: { value: '档外长期值', updatedAt: '2026-10-27T00:00:00Z' } }, plugins: {} };
  const request = [{ id: FixtureIds.relation, scope: 'progress' as const }, { id: 'Long01', scope: 'longTerm' as const }, { id: 'Local1', scope: 'local' as const, declaringSceneId: snapshot.scenes[0]!.scene.id }];
  expect(observeVariables(snapshot, state, longTerm, request).map(value => [value.status, value.value])).toEqual([['available', 17], ['available', '档外长期值'], ['available', false]]);
  state.frames = [];
  expect(observeVariables(snapshot, state, longTerm, request)[2]).toMatchObject({ scope: 'local', status: 'unavailable', value: null });
  expect(observeVariables(snapshot, state, longTerm, [{ id: 'Long01', scope: 'progress' }])[0]).toMatchObject({ scope: 'progress', status: 'missingDeclaration', value: null });
});
