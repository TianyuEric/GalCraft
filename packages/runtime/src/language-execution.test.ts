import { describe, expect, it } from 'vitest';
import { RuntimeStateSchema, type LongTerm, type Result, type Scalar, type Scene, type Snapshot } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, FixtureVariables } from '@galcraft/contracts/fixtures';
import { compile, type CompileInput } from '@galcraft/dsl';
import { SessionController } from './session.js';
import type { RuntimePorts } from './types.js';

const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };
const command = (name: string, args: unknown, id: string) => `${name} ${JSON.stringify(args)} @${id};`;
const say = (text: string, id: string, extra: object = {}) => command('say', { speaker: { kind: 'narrator' }, text, ...extra }, id);
const local = (id = 'LocalA', initial: Scalar = 1) => ({ id, name: 'amount', scope: 'local' as const, type: typeof initial as Scene['locals'][number]['type'], initial });
function input(scripts: string[], scenes = structuredClone(FixtureScenes)): CompileInput {
  return { projectId: FixtureProject.projectId, engineVersion: FixtureProject.engineVersion, lock: FixtureLock,
    project: FixtureProject, characters: FixtureCharacters, variables: FixtureVariables, assets: [], gallery: [], flows: [],
    template: FixtureTemplate, cancelOperationId: 'Cancel', scenes,
    documents: scenes.map((scene, index) => ({ documentId: `Scrpt${index}`, revision: 1, kind: 'scene', sceneId: scene.id,
      text: scripts[index] ?? 'return {} @Return;' })) };
}
function snapshot(source: CompileInput): Snapshot {
  const result = compile(source); expect(result.issues).toEqual([]); expect(result.snapshot).not.toBeNull(); return result.snapshot!;
}
async function run(source: CompileInput) {
  const compiled = snapshot(source);
  let longTerm: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [], flowEntries: {}, variables: {}, plugins: {} };
  const commits: { statementId: string | null; text: string; dialogue: boolean }[] = [];
  const writes: LongTerm[] = [];
  const ports: RuntimePorts = { contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [] },
    stage: { prepare: async value => ({ ok: true, value: { state: value.state, delta: null }, warnings: [] }) },
    longTerm: { current: () => structuredClone(longTerm),
      prepareFlowUnlocks: value => ({ ok: true, value: { sessionId: value.sessionId, snapshotId: compiled.snapshotId,
        sequence: value.sequence, expectedLongTermRevision: value.longTermAfter.revision, entries: [] }, warnings: [] }),
      commitRuntimeLongTerm: async value => { writes.push(structuredClone(value.next)); longTerm = { ...structuredClone(value.next), revision: longTerm.revision + 1 }; return { ok: true, value: { revision: longTerm.revision }, warnings: [] }; } },
    onCommitted: value => { commits.push({ statementId: value.token.statementId, text: value.state.presentation.text.text, dialogue: value.delta?.text !== undefined }); return { presentationEntered: true, mediaStarted: false }; } };
  const session = new SessionController(ports), position = { sceneId: compiled.project.entry.sceneId, statementId: compiled.scenes[0]!.instructions[0]!.statementId };
  const prepared = unwrap(await session.prepareSession({ snapshot: compiled, domain: { projectId: compiled.projectId, kind: 'playtest', instance: 'language-regression' },
    source: { kind: 'entry', scenario: { schemaVersion: 1, id: 'LangAA', name: 'Language regression', projectId: compiled.projectId,
      entry: position, target: position, initialProgress: {}, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate',
      engineVersion: compiled.engineVersion, pluginVersions: [] } }, target: null }));
  unwrap(session.activate(prepared.id)); unwrap(await session.start());
  return { session, compiled, commits, ports, writes, longTerm: () => longTerm };
}
async function advance(session: SessionController) {
  const token = session.inspect()!.token!; unwrap(await session.updateTextProgress({ token, textShown: 10000 }));
  return unwrap(await session.dispatch({ kind: 'advance', token }));
}

describe('source compiled dialogue and control flow (RDV-T01–T05)', () => {
  it('evaluates current string and number expressions, preserves escaped openings and ordinary dollar text in body and history', async () => {
    const text = `Hello {{"world"}} {{1 + 2}} / {{progress["${FixtureIds.relation}"]}} / \\{{unknown}} / \${ordinary}`;
    const fixture = await run(input([say(text, 'LineAA')]));
    expect(fixture.session.inspect()!.state.presentation.text.text).toBe('Hello world 3 / 0 / {{unknown}} / ${ordinary}');
    expect(fixture.session.inspect()!.history[0]!.text).toBe('Hello world 3 / 0 / {{unknown}} / ${ordinary}');
  });
  it('changes interpolation values between lines and records evaluated history', async () => {
    const fixture = await run(input([[say(`Before {{progress["${FixtureIds.relation}"]}}`, 'LineAA'),
      command('setVar', { variableId: FixtureIds.relation, op: 'assign', value: 8 }, 'SetAAA'),
      say(`After {{progress["${FixtureIds.relation}"]}}`, 'LineBB')].join('\n')]));
    await advance(fixture.session);
    expect(fixture.session.inspect()!.history.map(entry => entry.text)).toEqual(['Before 0', 'After 8']);
  });
  it.each(['{{1 + }}', '{{}}', '{{1 + 2'])('locates invalid interpolation %s without losing the source', text => {
    const source = input([say(text, 'LineAA')]), original = source.documents[0]!.text;
    expect(compile(source).issues).toContainEqual(expect.objectContaining({ code: 'INTERPOLATION_SYNTAX', source: expect.objectContaining({ documentId: 'Scrpt0', statementId: 'LineAA' }) }));
    expect(source.documents[0]!.text).toBe(original);
  });
  it.each([true, false])('uses legal falsy defaults and explicit caller expressions with required=%s', async required => {
    for (const value of [0, false, ''] as const) {
      const scenes = structuredClone(FixtureScenes); scenes[1]!.locals = [local('ParamA', value)]; scenes[1]!.parameters = [{ variableId: 'ParamA', required, defaultValue: value }];
      const fixture = await run(input([command('callScene', { sceneId: scenes[1]!.id }, 'CallAA'), say('Value={{local["ParamA"]}}', 'LineAA')], scenes));
      expect(fixture.session.inspect()!.state.presentation.text.text).toBe(`Value=${value}`);
    }
    const scenes = structuredClone(FixtureScenes); scenes[0]!.locals = [local('LocalA', 7)]; scenes[1]!.locals = [local('ParamA', 0)]; scenes[1]!.parameters = [{ variableId: 'ParamA', required, defaultValue: 0 }];
    const source = input([`callScene {sceneId:"${scenes[1]!.id}",parameters:{ParamA:expr("local[\\\"LocalA\\\"] + 2")}} @CallAA;`, say('Value={{local["ParamA"]}}', 'LineAA')], scenes);
    expect((await run(source)).session.inspect()!.state.presentation.text.text).toBe('Value=9');
  });
  it.each([true, false])('requires a value without a default under required=%s', required => {
    const scenes = structuredClone(FixtureScenes); scenes[1]!.locals = [local('ParamA')]; scenes[1]!.parameters = [{ variableId: 'ParamA', required, defaultValue: null }];
    expect(compile(input([command('callScene', { sceneId: scenes[1]!.id }, 'CallAA')], scenes)).issues).toContainEqual(expect.objectContaining({ code: 'CALL_ARGUMENT' }));
    expect(compile(input([command('callScene', { sceneId: scenes[1]!.id, parameters: { ParamA: 3 } }, 'CallAA')], scenes)).snapshot).not.toBeNull();
  });
  it.each(['wrong', Infinity, NaN])('locates invalid declared defaults %s', defaultValue => {
    const scenes = structuredClone(FixtureScenes); scenes[1]!.locals = [local('ParamA')]; scenes[1]!.parameters = [{ variableId: 'ParamA', required: true, defaultValue }];
    expect(compile(input([command('callScene', { sceneId: scenes[1]!.id, parameters: { ParamA: 3 } }, 'CallAA')], scenes)).issues).toContainEqual(expect.objectContaining({ code: 'SCENE_PARAMETER', source: expect.objectContaining({ documentId: 'Scrpt1' }) }));
  });
  it.each(['changeScene', 'jumpLabel', 'choose'])('applies %s local lifetime at the same-scene label', async kind => {
    const scenes = structuredClone(FixtureScenes); scenes[0]!.locals = [local()];
    const destination = { sceneId: scenes[0]!.id, labelId: 'LabelA' };
    const jump = kind === 'choose' ? command(kind, { options: [{ id: 'Option', text: 'Go', target: destination }] }, 'JumpAA') : command(kind, kind === 'jumpLabel' ? { labelId: 'LabelA' } : destination, 'JumpAA');
    const fixture = await run(input([[command('setVar', { variableId: 'LocalA', op: 'assign', value: 9 }, 'SetAAA'), jump,
      command('label', { labelId: 'LabelA', name: 'Destination' }, 'LabelB'), say('Value={{local["LocalA"]}}', 'LineAA')].join('\n')], scenes));
    if (kind === 'choose') unwrap(await fixture.session.dispatch({ kind: 'choose', token: fixture.session.inspect()!.token!, optionId: 'Option' }));
    expect(fixture.session.inspect()!.state.presentation.text.text).toBe(`Value=${kind === 'changeScene' ? 1 : 9}`);
  });
  it.each([false, true])('writes a local receiver before unwinding the caller (terminal=%s)', async terminal => {
    const scenes = structuredClone(FixtureScenes); scenes[0]!.locals = [local()]; scenes[1]!.returns = 'number';
    const source = input([command('callScene', { sceneId: scenes[1]!.id, receiver: { scope: 'local', variableId: 'LocalA' } }, 'CallAA') + (terminal ? '' : '\n' + say('Value={{local["LocalA"]}}', 'LineAA')),
      command('return', { value: 42 }, 'Return')], scenes);
    const fixture = await run(source);
    expect(fixture.session.inspect()!.status).toBe(terminal ? 'ended' : 'waiting');
    if (!terminal) expect(fixture.session.inspect()!.state.presentation.text.text).toBe('Value=42');
  });
  it('naturally unwinds nested void scenes after a terminal local receiver', async () => {
    const scenes = structuredClone(FixtureScenes); const third = { ...structuredClone(scenes[1]!), id: 'SceneC', locals: [], parameters: [], returns: 'number' as const }; scenes.push(third);
    scenes[1]!.locals = [local('LocalB')];
    const project = structuredClone(FixtureProject); project.chapters[0]!.sceneIds.push(third.id);
    const source = input([command('callScene', { sceneId: scenes[1]!.id }, 'CallAA'),
      command('callScene', { sceneId: third.id, receiver: { scope: 'local', variableId: 'LocalB' } }, 'CallBB'), command('return', { value: 42 }, 'Return')], scenes); source.project = project;
    expect((await run(source)).session.inspect()!.status).toBe('ended');
  });
  it('retains the caller return and receiver when a called scene changes its current layer', async () => {
    const scenes = structuredClone(FixtureScenes); scenes[0]!.locals = [local()]; scenes[1]!.returns = 'number';
    const third = { ...structuredClone(scenes[1]!), id: 'SceneC', locals: [local('LocalC', 4)], parameters: [] }; scenes.push(third);
    const source = input([command('callScene', { sceneId: scenes[1]!.id, receiver: { scope: 'local', variableId: 'LocalA' } }, 'CallAA') + '\n' + say('Value={{local["LocalA"]}}', 'LineAA'),
      command('changeScene', { sceneId: third.id }, 'Change'), 'return {value:expr("local[\\\"LocalC\\\"]")} @Return;'], scenes);
    source.project = structuredClone(FixtureProject); source.project.chapters[0]!.sceneIds.push(third.id);
    expect((await run(source)).session.inspect()!.state.presentation.text.text).toBe('Value=4');
  });
  it.each([true, false])('commits continuous dialogue once and preserves default waiting (continue=%s)', async continuation => {
    const fixture = await run(input([[say('First', 'LineAA', { continue: continuation }), say('Second', 'LineBB')].join('\n')]));
    expect(fixture.session.inspect()!.state.position.statementId).toBe(continuation ? 'LineBB' : 'LineAA');
    expect(fixture.session.inspect()!.history.map(entry => entry.text)).toEqual(continuation ? ['First', 'Second'] : ['First']);
    expect(fixture.longTerm().readStatements).toEqual(continuation ? ['LineAA'] : []);
    expect(fixture.commits.filter(value => value.statementId === 'LineAA' && value.text === 'First')).toHaveLength(1);
  });
  it.each([1, 3])('keeps each departure through %s continuous lines and commits dialogue and long-term effects once', async count => {
    const source = input([[say('First', 'LineAA'), ...Array.from({ length: count }, (_, index) => [
      say(`Continuous ${index}`, `LineB${index}`, { continue: true }),
      command('setVar', { variableId: 'LongAA', op: 'add', value: 1 }, `Effec${index}`)].join('\n')), say('Last', 'LineCC')].join('\n')]);
    source.variables = [...FixtureVariables, { id: 'LongAA', name: 'visits', scope: 'longTerm', type: 'number', initial: 0 }];
    const fixture = await run(source);
    await advance(fixture.session);
    const departed = ['LineAA', ...Array.from({ length: count }, (_, index) => `LineB${index}`)];
    expect(fixture.session.inspect()!.state.position.statementId).toBe('LineCC');
    expect(fixture.session.inspect()!.state.pendingReadStatementId).toBeUndefined();
    expect(fixture.longTerm().readStatements).toEqual(departed);
    expect(fixture.longTerm().variables.LongAA?.value).toBe(count);
    expect(fixture.session.inspect()!.history.map(entry => entry.position.statementId)).toEqual([...departed, 'LineCC']);
    expect(fixture.commits.filter(value => value.dialogue).map(value => value.statementId)).toEqual([...departed, 'LineCC']);
    for (const statementId of departed) expect(fixture.writes.filter((write, index) => write.readStatements.includes(statementId) &&
      !fixture.writes[index - 1]?.readStatements.includes(statementId))).toHaveLength(1);
    expect(fixture.writes.map(write => write.variables.LongAA?.value).filter((value, index, values) => value !== undefined && value !== values[index - 1])).toEqual(
      Array.from({ length: count }, (_, index) => index + 1));
  });
  it.each(['LineBB', 'LineCC'])('preserves the source when %s fails to enter, restores it and confirms the retry once', async failedStatement => {
    const source = input([[say('First', 'LineAA'), say('Continuous', 'LineBB', { continue: true }),
      command('setVar', { variableId: 'LongAA', op: 'add', value: 1 }, 'Effect'), say('Last', 'LineCC')].join('\n')]);
    source.variables = [...FixtureVariables, { id: 'LongAA', name: 'visits', scope: 'longTerm', type: 'number', initial: 0 }];
    const fixture = await run(source), entered = fixture.ports.onCommitted!;
    let blocked = true;
    fixture.ports.onCommitted = async value => { const receipt = await entered(value); return { ...receipt, presentationEntered: value.token.statementId !== failedStatement || !blocked }; };
    await advance(fixture.session);
    const failed = fixture.session.inspect()!, sourceId = failedStatement === 'LineBB' ? 'LineAA' : 'LineBB';
    const reads = failedStatement === 'LineBB' ? [] : ['LineAA'];
    expect(failed.state.position.statementId).toBe(failedStatement);
    expect(failed.state.pendingReadStatementId).toBe(sourceId); expect(fixture.longTerm().readStatements).toEqual(reads);
    unwrap(await fixture.session.start());
    expect(fixture.session.inspect()!.state.pendingReadStatementId).toBe(sourceId); expect(fixture.longTerm().readStatements).toEqual(reads);
    const prepared = unwrap(await fixture.session.prepareSession({ snapshot: fixture.compiled,
      domain: { projectId: fixture.compiled.projectId, kind: 'playtest', instance: 'language-regression' },
      source: { kind: 'restored', state: RuntimeStateSchema.parse(JSON.parse(JSON.stringify(failed.state))), history: failed.history, voiceLocale: 'zh-CN' }, target: null }));
    unwrap(fixture.session.activate(prepared.id)); unwrap(await fixture.session.start());
    expect(fixture.session.inspect()!.state.pendingReadStatementId).toBe(sourceId); expect(fixture.longTerm().readStatements).toEqual(reads);
    expect((await fixture.session.confirmPresentationEntered(failed.token!)).ok).toBe(false);
    blocked = false; unwrap(await fixture.session.confirmPresentationEntered(fixture.session.inspect()!.token!));
    expect(fixture.session.inspect()!.state.position.statementId).toBe('LineCC');
    expect(fixture.session.inspect()!.state.pendingReadStatementId).toBeUndefined();
    expect(fixture.longTerm().readStatements).toEqual(['LineAA', 'LineBB']); expect(fixture.longTerm().variables.LongAA?.value).toBe(1);
    expect(fixture.session.inspect()!.history.map(entry => entry.position.statementId)).toEqual(['LineAA', 'LineBB', 'LineCC']);
    expect(fixture.commits.filter(value => value.dialogue).map(value => value.statementId)).toEqual(['LineAA', 'LineBB', 'LineCC']);
    const writes = fixture.writes.length; unwrap(await fixture.session.confirmPresentationEntered(fixture.session.inspect()!.token!));
    expect(fixture.writes).toHaveLength(writes);
  });
  it('commits a terminal continuous dialogue at its successful natural completion', async () => {
    const fixture = await run(input([[say('First', 'LineAA'), say('Last', 'LineBB', { continue: true })].join('\n')]));
    await advance(fixture.session);
    expect(fixture.session.inspect()!.status).toBe('ended'); expect(fixture.longTerm().readStatements).toEqual(['LineAA', 'LineBB']);
    expect(fixture.session.inspect()!.state.pendingReadStatementId).toBeUndefined();
    expect(fixture.session.inspect()!.history.map(entry => entry.position.statementId)).toEqual(['LineAA', 'LineBB']);
    expect(fixture.commits.filter(value => value.dialogue).map(value => value.statementId)).toEqual(['LineAA', 'LineBB']);
  });
});
