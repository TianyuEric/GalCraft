import { describe, expect, it } from 'vitest';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, FixtureVariables } from '@galcraft/contracts/fixtures';
import { SnapshotSchema, type DebugScenario, type Json } from '@galcraft/contracts';
import { compile, type CompileInput } from './compiler.js';

const scenario = (): DebugScenario => ({ schemaVersion: 1, id: 'Recall', name: '重读来信', projectId: FixtureProject.projectId,
  entry: { sceneId: FixtureIds.street, statementId: null }, target: { sceneId: FixtureIds.street, statementId: null },
  initialProgress: { [FixtureIds.relation]: 4 }, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate',
  engineVersion: '0.1.0', pluginVersions: [FixtureLock.engine, ...FixtureLock.plugins, FixtureLock.template] });
function input(): CompileInput {
  return { projectId: FixtureProject.projectId, engineVersion: '0.1.0', project: structuredClone(FixtureProject), lock: structuredClone(FixtureLock),
    documents: [{ documentId: 'Script', revision: 2, kind: 'scene', sceneId: FixtureIds.street, text: `say {speaker:{kind:"character",id:"${FixtureIds.an}"},text:"再次读信"} @Letter;` }],
    scenes: [FixtureScenes[0]!], characters: FixtureCharacters, variables: FixtureVariables, assets: [FixtureAsset], gallery: [],
    flows: [{ id: 'FlowAA', name: '回想', roots: ['NodeAA'], nodes: [{ id: 'NodeAA', name: '来信', sceneId: FixtureIds.street, statementId: null,
      x: 0, y: 0, unlock: { kind: 'literal', value: true }, lockedView: 'locked', entry: { kind: 'initial', debugScenarioId: 'Recall' } }], edges: [] }],
    debugScenarios: [{ documentId: 'DebugA', revision: 3, data: scenario() as unknown as Json }], template: FixtureTemplate, cancelOperationId: 'Cancel' };
}
describe('flow independent initial compilation', () => {
  it('freezes only explicitly referenced author scenarios and resolves scene beginnings to actual statements', () => {
    const source = input();
    source.debugScenarios!.push({ documentId: 'Private', revision: 8, data: { id: 'Unused', personal: 'private author data' } });
    source.entityVersions = source.debugScenarios!.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
    const result = compile(source);
    expect(result.issues).toEqual([]);
    expect(result.snapshot?.flowInitials).toEqual([{ ...scenario(), entry: { sceneId: FixtureIds.street, statementId: 'Letter' }, target: { sceneId: FixtureIds.street, statementId: 'Letter' } }]);
    expect(result.snapshot?.documents).toContainEqual({ documentId: 'DebugA', revision: 3 });
    expect(result.snapshot?.documents.some(document => document.documentId === 'Private')).toBe(false);
    expect(JSON.stringify(result.snapshot)).not.toContain('private author data');
    expect((source.debugScenarios![0]!.data as unknown as DebugScenario).entry.statementId).toBeNull();
    expect(SnapshotSchema.safeParse(result.snapshot).success).toBe(true);
    expect(SnapshotSchema.safeParse({ ...result.snapshot, flowInitials: [] }).success).toBe(false);
  });
  it('blocks missing and ambiguous explicit references', () => {
    const source = input(); source.debugScenarios = [];
    expect(compile(source).issues).toContainEqual(expect.objectContaining({ code: 'FLOW_INITIAL_REFERENCE', source: expect.objectContaining({ field: 'nodes.0.entry.debugScenarioId' }) }));
    source.debugScenarios = [{ documentId: 'DebugA', revision: 1, data: scenario() as unknown as Json }, { documentId: 'DebugB', revision: 1, data: scenario() as unknown as Json }];
    expect(compile(source).snapshot).toBeNull();
  });
  it.each([
    ['FLOW_INITIAL_VERSION', { projectId: 'OtherP' }],
    ['FLOW_INITIAL_VERSION', { pluginVersions: [] }],
    ['FLOW_INITIAL_POSITION', { target: { sceneId: FixtureIds.street, statementId: 'Absent' } }],
    ['FLOW_INITIAL_VARIABLE', { initialProgress: { [FixtureIds.relation]: 'wrong type' } }],
    ['FLOW_INITIAL_PLUGIN', { pluginInitial: { 'org.test.missing': {} } }],
    ['FLOW_INITIAL_ROUTE', { route: [{ statementId: 'Letter', occurrence: 0, optionId: 'Option' }] }],
    ['FLOW_INITIAL_INPUT', { playerInputs: [{ statementId: 'Letter', occurrence: 0, text: 'input' }] }],
  ])('blocks invalid authored initial data with %s and the source document', (code, changes) => {
    const source = input(); source.debugScenarios![0]!.data = { ...scenario(), ...changes } as unknown as Json;
    const result = compile(source); expect(result.snapshot).toBeNull();
    expect(result.issues).toContainEqual(expect.objectContaining({ code, source: expect.objectContaining({ documentId: 'DebugA', revision: 3 }) }));
  });
});
