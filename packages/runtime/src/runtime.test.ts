import { describe, expect, it } from 'vitest';
import type { Instruction, LongTerm, Result, Snapshot, StageObject } from '@galcraft/contracts';
import { FixtureEffects, FixtureIds, FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { CoreCommandSpecs } from '@galcraft/dsl';
import { RuntimeStateSchema } from '@galcraft/contracts';
import type { PluginStep } from '@galcraft/plugins/contracts';
import { SessionController, evaluateBoolean, formatDialogue } from './index.js';
import type { DebugScenario, RuntimePorts } from './types.js';
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw result.error; return result.value; };

it('emergency cover freezes the current wait and play clock, and preserves an existing debug pause', async()=>{
  const fixture=setup();unwrap(await ready(fixture));
  const before=fixture.controller.inspect()!;
  unwrap(await fixture.controller.setPauseReason('emergency',true));
  fixture.controller.elapsePlayTime(4000);
  const blocked=await fixture.controller.dispatch({kind:'advance',token:before.token!});
  expect(blocked.ok).toBe(false);if(!blocked.ok)expect(blocked.error.code).toBe('SESSION_PAUSED');
  expect(fixture.controller.inspect()!.state).toEqual(before.state);
  unwrap(await fixture.controller.setPauseReason('emergency',false));
  expect(fixture.controller.inspect()!.status).toBe(before.status);
  unwrap(fixture.controller.setPreviewPaused(true));
  unwrap(await fixture.controller.setPauseReason('emergency',true));
  unwrap(await fixture.controller.setPauseReason('emergency',false));
  expect(fixture.controller.inspect()!.status).toBe('paused');
  unwrap(fixture.controller.setPreviewPaused(false));
  expect(fixture.controller.inspect()!.state).toEqual(before.state);
});

it('emergency pause freezes an actual timer and retains a pause requested while covered', async()=>{
  const fixture=setup(), first=fixture.snapshot.scenes[0]!.instructions[0]!;
  fixture.snapshot.scenes[0]!.instructions=[{...first,opcode:'wait',args:{durationMs:3000},continuation:'wait'}];
  unwrap(await ready(fixture)); const before=fixture.controller.inspect()!;
  unwrap(await fixture.controller.setPauseReason('emergency',true));
  expect(unwrap(fixture.controller.elapseTimer({token:before.token!,deltaMs:1000}))).toBe(false);
  expect(fixture.controller.inspect()!.state.wait).toEqual(before.state.wait);
  unwrap(fixture.controller.setPreviewPaused(true));
  unwrap(await fixture.controller.setPauseReason('emergency',false));
  expect(fixture.controller.inspect()!.status).toBe('paused');
  unwrap(fixture.controller.setPreviewPaused(false));
  unwrap(fixture.controller.elapseTimer({token:before.token!,deltaMs:1000}));
  expect(fixture.controller.inspect()!.state.wait).toMatchObject({remainingMs:2000});
});

it('consumes repeated advance while leaving a sentence still owns its long-term commit', async()=>{
  const fixture=setup();unwrap(await ready(fixture));
  const token=fixture.controller.inspect()!.token!,commit=fixture.ports.longTerm.commitRuntimeLongTerm;
  unwrap(await fixture.controller.updateTextProgress({token,textShown:10000}));
  let release!:()=>void,entered!:()=>void;const committing=new Promise<void>(resolve=>{entered=resolve;});fixture.ports.longTerm.commitRuntimeLongTerm=async input=>{await new Promise<void>(resolve=>{release=resolve;entered();});return commit(input);};
  const first=fixture.controller.dispatch({kind:'advance',token});
  await committing;expect(release).toBeTypeOf('function');
  let idle=false;const leaving=fixture.controller.waitForIdle().then(()=>{idle=true;});
  await Promise.resolve();expect(idle).toBe(false);
  const before=fixture.controller.inspect()!;
  for(let i=0;i<8;i++)unwrap(await fixture.controller.dispatch({kind:'advance',token}));
  expect(fixture.controller.inspect()!.state.position).toEqual(before.state.position);
  release();unwrap(await first);
  await leaving;expect(idle).toBe(true);
  expect(fixture.getLongTerm().readStatements.filter(id=>id===token.statementId)).toHaveLength(1);
  expect(fixture.controller.inspect()!.token).not.toEqual(token);
});

it('refreshes one skip wait at a time and stops at a choice without selecting it',async()=>{
  const fixture=setup();unwrap(await ready(fixture));
  const first=fixture.controller.inspect()!;
  expect(unwrap(await fixture.controller.skipStep('read')).continued).toBe(false);
  expect(unwrap(await fixture.controller.skipStep('all')).inspection.token).toEqual(first.token);
  const next=unwrap(await fixture.controller.skipStep('all'));
  expect(next.inspection.state.position).not.toEqual(first.state.position);
  for(let i=0;i<10&&fixture.controller.inspect()?.state.wait?.kind!=='choice';i++)unwrap(await fixture.controller.skipStep('all'));
  const waiting=fixture.controller.inspect()!;expect(waiting.state.wait?.kind).toBe('choice');
  expect(unwrap(await fixture.controller.skipStep('all')).continued).toBe(false);
  expect(fixture.controller.inspect()!.state.route).toEqual(waiting.state.route);
});

it('NVL preserves page boundaries, current-statement continuation, history and save anchors', async () => {
  const fixture = setup(), snapshot = fixture.snapshot, scene = snapshot.scenes[0]!;
  const step = (statementId: string, opcode: string, args: Instruction['args'], continuation: Instruction['continuation'] = 'continue'): Instruction => ({ statementId, opcode, args, continuation, condition: null, skippable: true, specVersion: '0.1.0', source: { documentId: FixtureIds.streetDocument, statementId, revision: 1 } });
  scene.instructions = [step('Mode01','readingMode',{mode:'nvl'}),step('Nvl001','say',{speaker:{kind:'narrator'},text:'旧段。'},'wait'),
    step('Nvl002','say',{speaker:{kind:'character',id:FixtureIds.an},text:{segments:[{text:'跨页正文。'.repeat(50),color:'#66aaff',ruby:'reading'}]}},'wait'),
    step('Clear1','clearPage',{}),step('Nvl003','say',{speaker:{kind:'narrator'},text:'清页后。'},'wait'),
    step('Mode02','readingMode',{mode:'adv'}),step('Adv001','say',{speaker:{kind:'narrator'},text:'恢复ADV'},'wait'),
    step('Mode03','readingMode',{mode:'nvl',retainIllustrations:true}),step('Nvl004','say',{speaker:{kind:'narrator'},text:'重新进入'},'wait')];
  unwrap(await ready(fixture)); let inspection=fixture.controller.inspect()!;
  expect(inspection.state.presentation.text.reading?.mode).toBe('nvl');
  expect(unwrap(await fixture.controller.driveSkip('all')).state.position.statementId).toBe('Nvl001');
  unwrap(fixture.controller.updateNvlLayout({token:inspection.token!,start:0,end:inspection.state.presentation.text.text.length}));
  await completeSay(fixture.controller); inspection=fixture.controller.inspect()!;
  const total=inspection.state.presentation.text.text.length, end=70;
  expect(inspection.state.presentation.text.parts).toHaveLength(2);
  expect(inspection.state.wait?.kind==='say'&&inspection.state.wait.textShown).toBe(3);
  unwrap(fixture.controller.updateNvlLayout({token:inspection.token!,start:0,end}));
  unwrap(await fixture.controller.dispatch({kind:'advance',token:inspection.token!}));
  expect(fixture.getLongTerm().readStatements).not.toContain('Nvl002');
  const auto=unwrap(await fixture.controller.tryAutoAdvance({voiceEnded:true,animationComplete:true,readyDurationMs:100,autoWaitMs:100}));
  expect(auto.advanced).toBe(true); expect(auto.inspection.state.position.statementId).toBe('Nvl002');
  expect(auto.inspection.state.presentation.text.reading).toMatchObject({start:end,end:null});
  const serialized=RuntimeStateSchema.parse(JSON.parse(JSON.stringify(auto.inspection.state)));
  const failed=fixture.controller.updateNvlLayout({token:inspection.token!,start:0,end:0}); expect(failed.ok).toBe(false);
  expect(fixture.controller.inspect()!.state.wait).toEqual(serialized.wait);
  const prepared=unwrap(await fixture.controller.prepareSession({snapshot,domain:{projectId:snapshot.projectId,kind:'playtest',instance:'nvl-restored'},
    source:{kind:'restored',state:serialized,history:auto.inspection.history,voiceLocale:snapshot.project.languages.voiceDefault},target:null}));
  unwrap(fixture.controller.activate(prepared.id)); unwrap(await fixture.controller.start()); inspection=fixture.controller.inspect()!;
  expect(inspection.history).toHaveLength(2); expect(inspection.state.presentation.text.parts).toHaveLength(2);
  expect(inspection.state.wait).toEqual(serialized.wait);
  unwrap(fixture.controller.updateNvlLayout({token:inspection.token!,start:end,end:total}));
  await completeSay(fixture.controller); inspection=fixture.controller.inspect()!;
  expect(inspection.state.position.statementId).toBe('Nvl003'); expect(inspection.state.presentation.text.parts).toHaveLength(1);
  unwrap(fixture.controller.updateNvlLayout({token:inspection.token!,start:0,end:inspection.state.presentation.text.text.length}));
  await completeSay(fixture.controller); expect(fixture.controller.inspect()!.state.presentation.text.reading?.mode).toBe('adv');
  await completeSay(fixture.controller); inspection=fixture.controller.inspect()!;
  expect(inspection.state.presentation.text.reading).toMatchObject({mode:'nvl',start:0,end:null,retainIllustrations:true});
  expect(inspection.state.presentation.text.parts).toHaveLength(1); expect(inspection.history).toHaveLength(5);
});

const id = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;
const scenario = (snapshot: Snapshot, entry = snapshot.project.entry.sceneId, statementId = snapshot.scenes[0]!.instructions[0]!.statementId): DebugScenario => ({
  schemaVersion: 1, id: id(901), name: '路径测试', projectId: snapshot.projectId,
  entry: { sceneId: entry, statementId }, target: { sceneId: entry, statementId }, initialProgress: {}, pluginInitial: {},
  route: [], playerInputs: [], externalPolicy: 'simulate', engineVersion: snapshot.engineVersion, pluginVersions: [],
});
function setup(snapshot = structuredClone(FixtureSnapshot)) {
  let longTerm: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [], flowEntries: {}, variables: {}, plugins: {} };
  let failWrites = 0; let writes = 0;
  const ports: RuntimePorts = { contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [] },
    stage: { prepare: async input => ({ ok: true, value: { state: input.state, delta: null }, warnings: [] }) },
    longTerm: {
      current: () => structuredClone(longTerm),
      prepareFlowUnlocks: input => ({ ok: true, value: { sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId,
        sequence: input.sequence, expectedLongTermRevision: input.longTermAfter.revision, entries: [] }, warnings: [] }),
      commitRuntimeLongTerm: async input => {
        writes++;
        if (failWrites-- > 0) return { ok: false, error: { code: 'DISK_FAIL', severity: 'error', message: 'Disk write failed', owner: 'M07', related: [], actions: ['retry'] }, issues: [] };
        longTerm = structuredClone({ ...input.next, revision: input.next.revision + 1 });
        return { ok: true, value: { revision: longTerm.revision }, warnings: [] };
      },
    },
  };
  return { controller: new SessionController(ports), ports, snapshot, setFailWrites: (value: number) => { failWrites = value; },
    getLongTerm: () => longTerm, getWrites: () => writes };
}
async function ready(fixture: ReturnType<typeof setup>, custom = scenario(fixture.snapshot)) {
  const prepared = await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
    domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'runtime-test' },
    source: { kind: 'entry', scenario: custom }, target: null });
  expect(prepared.ok).toBe(true); if (!prepared.ok) throw prepared.error;
  expect(fixture.controller.activate(prepared.value.id).ok).toBe(true);
  return fixture.controller.start();
}
const completeSay = async (controller: SessionController) => {
  let active = controller.inspect()!; expect(active.state.wait?.kind).toBe('say');
  const token = active.token!;
  let result = await controller.dispatch({ kind: 'advance', token }); expect(result.ok).toBe(true);
  result = await controller.dispatch({ kind: 'advance', token }); expect(result.ok).toBe(true);
  return token;
};

describe('successful departure read commits', () => {
  const steps = (fixture: ReturnType<typeof setup>, destination: string, args: Instruction['args']) => {
    const base = fixture.snapshot.scenes[0]!.instructions.find(item => item.opcode === 'say')!;
    const a = { ...base, statementId: 'ReadA1', args: { speaker: { kind: 'narrator' }, text: '第一次停留。' }, source: { ...base.source, statementId: 'ReadA1' } };
    const b = { ...base, statementId: 'ReadB1', opcode: destination, args, source: { ...base.source, statementId: 'ReadB1' } };
    fixture.snapshot.scenes[0]!.instructions = [a, b]; return { a, b };
  };
  it.each(['say', 'choose', 'getUserInput', 'video', 'end', 'natural'])('commits only after entering %s or ending successfully', async destination => {
    const fixture = setup();
    const args: Instruction['args'] = destination === 'say' ? { speaker: { kind: 'narrator' }, text: '下一句。' } : destination === 'choose' ?
      { options: [{ id: 'Option', text: '继续', target: { sceneId: fixture.snapshot.scenes[0]!.scene.id, labelId: null } }] } :
      destination === 'getUserInput' ? { defaultText: '' } : destination === 'video' ? { assetId: fixture.snapshot.assets[0]!.assetId } : {};
    steps(fixture, destination, args);
    if (destination === 'natural') fixture.snapshot.scenes[0]!.instructions.pop();
    unwrap(await ready(fixture)); const first = fixture.controller.inspect()!;
    expect(fixture.getLongTerm().readStatements).toEqual([]);
    unwrap(await fixture.controller.updateTextProgress({ token: first.token!, textShown: 10000 }));
    const savedA = RuntimeStateSchema.parse(JSON.parse(JSON.stringify(fixture.controller.inspect()!.state)));
    expect(fixture.getLongTerm().readStatements).toEqual([]);
    const restore = async (state: typeof savedA) => {
      const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
        domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'runtime-test' },
        source: { kind: 'restored', state, history: first.history, voiceLocale: 'zh-CN' }, target: null }));
      unwrap(fixture.controller.activate(prepared.id)); unwrap(await fixture.controller.start());
    };
    await restore(savedA); expect(fixture.getLongTerm().readStatements).toEqual([]);
    unwrap(await fixture.controller.dispatch({ kind: 'advance', token: fixture.controller.inspect()!.token! }));
    expect(fixture.getLongTerm().readStatements).toEqual(['ReadA1']);
    expect(fixture.controller.inspect()!.state.pendingReadStatementId).toBeUndefined();
    await restore(savedA); expect(fixture.getLongTerm().readStatements).toEqual(['ReadA1']);
  });
  it.each(['timer', 'animation', 'plugin'].flatMap(waiting => [false, true].map(previouslyRead => ({ waiting, previouslyRead }))))('retains the departing identity across $waiting, restore and failed preparation (read=$previouslyRead)', async ({ waiting, previouslyRead }) => {
    const fixture = setup(); const { a, b } = steps(fixture, 'say', { speaker: { kind: 'narrator' }, text: '准备目标。' });
    const key = 'example.read/intermediate';
    const middle: Instruction = { ...a, statementId: 'Middle', opcode: waiting === 'timer' ? 'wait' : waiting === 'animation' ? 'setAnimation' : key,
      args: waiting === 'timer' ? { durationMs: 200 } : {}, source: { ...a.source, statementId: 'Middle' } };
    if (waiting === 'plugin') {
      fixture.ports.contributions.pages.push({ key: 'read-wait', titleKey: 'wait', componentKey: 'wait', inputSchema: {}, resultSchema: {}, configFields: [], publicParts: [], sampleInput: {}, wait: { restorable: true, cancel: 'keepWaiting' }, render: () => null });
      fixture.ports.contributions.commands.push({ spec: { ...CoreCommandSpecs[0]!, key },
        execute: async () => ({ ok: true, value: { progress: {}, longTermDelta: null, presentation: null, wait: { page: 'read-wait', input: {}, resumeData: {} }, result: null }, warnings: [] }),
        resume: async () => ({ ok: true, value: { progress: {}, longTermDelta: null, presentation: null, wait: null, result: null }, warnings: [] }) });
    }
    fixture.snapshot.scenes[0]!.instructions = [a, middle, { ...a, statementId: 'ToNext', opcode: 'changeScene', continuation: 'continue',
      args: { sceneId: fixture.snapshot.scenes[1]!.scene.id, labelId: null }, source: { ...a.source, statementId: 'ToNext' } }];
    fixture.snapshot.scenes[1]!.instructions = [b];
    if (previouslyRead) fixture.getLongTerm().readStatements.push(a.statementId);
    const beforeRead = previouslyRead ? [a.statementId] : [];
    unwrap(await ready(fixture)); await completeSay(fixture.controller);
    const held = fixture.controller.inspect()!;
    expect(held.state.pendingReadStatementId).toBe(a.statementId); expect(fixture.getLongTerm().readStatements).toEqual(beforeRead);
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'runtime-test' },
      source: { kind: 'restored', state: RuntimeStateSchema.parse(JSON.parse(JSON.stringify(held.state))), history: held.history, voiceLocale: 'zh-CN' }, target: null }));
    unwrap(fixture.controller.activate(prepared.id)); let fail = true;
    fixture.ports.beforeDialogue = async ({ token }) => fail && token.statementId === b.statementId ?
      { ok: false, error: { code: 'TARGET_PREPARE', severity: 'error', owner: 'M07', message: 'Target media failed', related: [], actions: ['retry'] }, issues: [] } : { ok: true, value: undefined, warnings: [] };
    const failed = await fixture.controller.dispatch({ kind: waiting as 'timer' | 'animation' | 'plugin', token: fixture.controller.inspect()!.token!, result: null });
    expect(failed.ok).toBe(false); expect(fixture.getLongTerm().readStatements).toEqual(beforeRead);
    expect(fixture.controller.inspect()!.state.pendingReadStatementId).toBe(a.statementId);
    fail = false; unwrap(await fixture.controller.start());
    expect(fixture.getLongTerm().readStatements).toEqual([a.statementId]);
    expect(fixture.controller.inspect()!.state.pendingReadStatementId).toBeUndefined();
  });
  it.each(['say', 'choose', 'getUserInput', 'video'])('retains A when actual %s presentation fails and confirms its retry once', async destination => {
    const fixture = setup();
    const { a, b } = steps(fixture, destination, destination === 'say' ? { speaker: { kind: 'narrator' }, text: '目标正文。' } :
      destination === 'choose' ? { options: [{ id: 'Option', text: '继续', target: { sceneId: fixture.snapshot.scenes[0]!.scene.id, labelId: null } }] } : {});
    const calls: string[] = [], sampledReads: string[][] = [];
    fixture.ports.onCommitted = input => { calls.push(input.token.statementId); return { presentationEntered: input.token.statementId !== b.statementId, mediaStarted: false }; };
    const sample = fixture.ports.longTerm.prepareFlowUnlocks;
    fixture.ports.longTerm.prepareFlowUnlocks = input => { sampledReads.push([...input.longTermAfter.readStatements]); return sample(input); };
    unwrap(await ready(fixture)); await completeSay(fixture.controller);
    const target = fixture.controller.inspect()!;
    expect(target.state.pendingReadStatementId).toBe(a.statementId); expect(fixture.getLongTerm().readStatements).toEqual([]);
    expect(sampledReads.at(-1)).toEqual([]);
    // A repeated attempt cannot overwrite A with B while B has not actually entered.
    unwrap(await fixture.controller.dispatch({ kind: destination === 'video' ? 'animation' : destination === 'choose' ? 'choose' : destination === 'getUserInput' ? 'input' : 'advance', token: target.token!, optionId: 'Option', text: 'test' }));
    expect(fixture.controller.inspect()!.state.pendingReadStatementId).toBe(a.statementId);
    expect(fixture.controller.inspect()!.state.position).toEqual(target.state.position);
    const beforeRetryCalls = calls.length;
    unwrap(destination === 'video' ? await fixture.controller.confirmMediaStarted(target.token!) : await fixture.controller.confirmPresentationEntered(target.token!));
    expect(fixture.getLongTerm().readStatements).toEqual([a.statementId]); expect(fixture.controller.inspect()!.state.pendingReadStatementId).toBeUndefined();
    expect(calls).toHaveLength(beforeRetryCalls); expect(fixture.controller.inspect()!.history).toHaveLength(destination === 'say' ? 2 : 1);
    const writes = fixture.getWrites(); unwrap(await fixture.controller.confirmPresentationEntered(target.token!)); expect(fixture.getWrites()).toBe(writes);
    const stale = await fixture.controller.confirmPresentationEntered({ ...target.token!, sessionId: 'OldSession' }); expect(stale.ok).toBe(false);
  });
  it('keeps a successful text boundary independent of blocked media gallery playback', async () => {
    const fixture = setup(); steps(fixture, 'say', { speaker: { kind: 'narrator' }, text: '目标正文。' });
    fixture.ports.onCommitted = () => ({ presentationEntered: true, mediaStarted: false });
    unwrap(await ready(fixture)); await completeSay(fixture.controller);
    expect(fixture.getLongTerm().readStatements).toEqual(['ReadA1']); expect(fixture.controller.inspect()!.state.pendingReadStatementId).toBeUndefined();
  });
  it.each(['end', 'natural'])('retains the source until actual %s completion can be retried successfully', async destination => {
    const fixture = setup(); steps(fixture, 'end', {}); if (destination === 'natural') fixture.snapshot.scenes[0]!.instructions.pop();
    let failed = true;
    fixture.ports.onCommitted = ({ state }) => ({ presentationEntered: state.phase !== 'completed' || !failed, mediaStarted: false });
    unwrap(await ready(fixture)); await completeSay(fixture.controller);
    expect(fixture.getLongTerm().readStatements).toEqual([]); expect(fixture.controller.inspect()!.state.pendingReadStatementId).toBe('ReadA1');
    failed = false; unwrap(await fixture.controller.start());
    expect(fixture.getLongTerm().readStatements).toEqual(['ReadA1']); expect(fixture.controller.inspect()!.state.pendingReadStatementId).toBeUndefined();
    expect(fixture.controller.inspect()!.history).toHaveLength(1);
    const writes = fixture.getWrites(); unwrap(await fixture.controller.start()); expect(fixture.getWrites()).toBe(writes);
  });
  it('restores a failed target source and retries only its long-term increment after actual video retry succeeds', async () => {
    const fixture = setup(); const { a } = steps(fixture, 'video', {});
    fixture.ports.onCommitted = ({ token }) => ({ presentationEntered: token.statementId !== 'ReadB1', mediaStarted: false });
    unwrap(await ready(fixture)); await completeSay(fixture.controller);
    const failed = fixture.controller.inspect()!;
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot, domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'runtime-test' },
      source: { kind: 'restored', state: RuntimeStateSchema.parse(JSON.parse(JSON.stringify(failed.state))), history: failed.history, voiceLocale: 'zh-CN' }, target: null }));
    unwrap(fixture.controller.activate(prepared.id)); const token = fixture.controller.inspect()!.token!;
    fixture.setFailWrites(1); expect((await fixture.controller.confirmMediaStarted(token)).ok).toBe(false);
    expect(fixture.controller.inspect()!.pendingLongTerm).toBe(true); expect(fixture.getLongTerm().readStatements).toEqual([]);
    unwrap(await fixture.controller.retryLongTerm()); expect(fixture.getLongTerm().readStatements).toEqual([a.statementId]);
    expect(fixture.controller.inspect()!.state.position).toEqual(failed.state.position); expect(fixture.controller.inspect()!.history).toEqual(failed.history);
    const writes = fixture.getWrites(); unwrap(await fixture.controller.confirmMediaStarted(token)); expect(fixture.getWrites()).toBe(writes);
  });
});

it('prepares the actual state before a target and limits current playback after its timer completes', async () => {
  const fixture = setup(), snapshot = fixture.snapshot, scene = snapshot.scenes[0]!, base = scene.instructions[0]!;
  const step = (statementId: string, opcode: string, args: Instruction['args'], continuation: Instruction['continuation'] = 'continue'): Instruction => ({ ...base, statementId, opcode, args, continuation, condition: null, source: { ...base.source, statementId } });
  scene.instructions = [step('Before','comment',{text:'before'}), step('Target','wait',{durationMs:250},'wait'), step('After1','say',{speaker:{kind:'narrator'},text:'Must not execute'},'wait')];
  const target = { sceneId: scene.scene.id, statementId: 'Target' };
  const prepared = unwrap(await fixture.controller.prepareSession({ snapshot, domain: { projectId: snapshot.projectId, kind: 'playtest', instance: 'current-performance' }, source: {kind:'entry',scenario:scenario(snapshot)}, target, evaluateTarget:true, targetPhase:'before' }));
  expect(prepared.reached).toBe(true); expect(prepared.state.phase).toBe('entry'); expect(prepared.state.occurrence).toBe(1); expect(prepared.state.wait).toBeNull();
  unwrap(fixture.controller.activate(prepared.id)); unwrap(await fixture.controller.startPreviewInstruction());
  const waiting = fixture.controller.inspect()!; expect(waiting.state.wait?.kind).toBe('timer');
  unwrap(fixture.controller.setPreviewPaused(true)); expect(fixture.controller.inspect()?.status).toBe('paused');
  unwrap(fixture.controller.setPreviewPaused(false));
  unwrap(fixture.controller.elapseTimer({token:waiting.token!,deltaMs:250}));
  unwrap(await fixture.controller.dispatch({kind:'timer',token:waiting.token!}));
  const ended = fixture.controller.inspect()!;
  expect(ended.state.position.statementId).toBe('After1'); expect(ended.state.phase).toBe('entry');
  expect(ended.state.occurrence).toBe(2); expect(ended.trace.some(item=>item.token.statementId==='After1')).toBe(false);
});

it('current playback executes one nonwaiting control instruction and preserves its destination', async () => {
  const fixture = setup(), snapshot = fixture.snapshot, scene = snapshot.scenes[0]!, base = scene.instructions[0]!;
  scene.instructions = [{...base,opcode:'comment',args:{text:'current only'},continuation:'continue'},scene.instructions[1]!];
  const prepared=unwrap(await fixture.controller.prepareSession({snapshot,domain:{projectId:snapshot.projectId,kind:'sample',instance:'single-control'},source:{kind:'entry',scenario:scenario(snapshot)},target:null}));
  unwrap(fixture.controller.activate(prepared.id)); const result=unwrap(await fixture.controller.startPreviewInstruction());
  expect(result.state.occurrence).toBe(1); expect(result.state.position.statementId).toBe(scene.instructions[1]!.statementId);
  expect(result.state.phase).toBe('entry');
});
const stageObject = (objectId: string, station: StageObject['station']): StageObject => ({
  id: objectId, characterId: FixtureIds.an, assetId: FixtureIds.background, variantId: FixtureIds.variant,
  layer: 'figure', entranceOrder: 0, backgroundFrame: null, station,
  current: structuredClone(FixtureEffects) as StageObject['current'],
  defaults: { ...structuredClone(FixtureEffects), station } as StageObject['defaults'],
  framing: { mode: 'full', scale: 1, offsetX: 0, offsetY: 0, crop: null },
  transition: { enter: { preset: 'cut', resourceId: null, durationMs: 0, easing: { family: 'linear', direction: 'in' }, direction: 'left' },
    exit: { preset: 'cut', resourceId: null, durationMs: 0, easing: { family: 'linear', direction: 'in' }, direction: 'left' } },
  processes: [], providerState: null, imageFace: null,
});

describe('M05 runtime', () => {
  it.each([{required:false,defaultValue:3,passes:true},{required:false,defaultValue:null,passes:false},{required:true,defaultValue:3,passes:true}])('aligns omitted call arguments with declaration defaults: $required / $defaultValue',async({required,defaultValue,passes})=>{
    const fixture=setup(),caller=fixture.snapshot.scenes[0]!,callee=fixture.snapshot.scenes[1]!;
    callee.scene.locals=[{id:'ParamA',name:'amount',scope:'local',type:'number',initial:0}];callee.scene.parameters=[{variableId:'ParamA',required,defaultValue}];
    caller.instructions=[{...caller.instructions[0]!,opcode:'callScene',continuation:'continue',args:{sceneId:callee.scene.id,labelId:null,parameters:{},receiver:null}}];
    const result=await ready(fixture);expect(result.ok).toBe(passes);if(result.ok)expect(result.value.state.frames.at(-1)!.locals.ParamA).toBe(3);else expect(result.error.code).toBe('CALL_ARGUMENT');
  });
  it.each(['choose','getUserInput','wait','end','comment','intro'])('completes the entry before a first %s interaction or terminal commit',async(opcode)=>{
    const fixture=setup(), base=fixture.snapshot.scenes[0]!.instructions[0]!;
    const args: Instruction['args']=opcode==='choose'?{options:[{id:'Opt001',text:'继续',target:{sceneId:fixture.snapshot.scenes[1]!.scene.id,labelId:null}}]}:
      opcode==='getUserInput'?{variableId:'Input1',defaultText:''}:opcode==='wait'?{durationMs:200}:
      opcode==='intro'?{op:'show',text:'序章'}:opcode==='end'?{target:{kind:'title'}}:{};
    fixture.snapshot.scenes[0]!.instructions=[{...base,opcode,args,continuation:['choose','getUserInput','wait','intro'].includes(opcode)?'wait':'continue'}];
    let calls=0,release:(()=>void)|undefined;
    fixture.ports.beforeDialogue=async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});return {ok:true,value:undefined,warnings:[]};};
    const starting=ready(fixture);await new Promise(resolve=>setTimeout(resolve,0));
    expect(calls).toBe(1);expect(fixture.controller.inspect()?.state.entryPresentation?.completed).toBe(false);
    expect(fixture.controller.inspect()?.state.phase).toBe('entry');
    release!();const active=unwrap(await starting);expect(active.state.entryPresentation?.completed).toBe(true);
    expect(active.state.phase).toBe(['end','comment'].includes(opcode)?'completed':'waiting');
  });
  it('creates a fresh entry instance for an end that continues into another scene',async()=>{
    const fixture=setup(), first=fixture.snapshot.scenes[0]!, base=first.instructions[0]!;
    first.instructions=[base,{...base,statementId:'EndSc1',opcode:'end',continuation:'continue',args:{target:{kind:'scene',sceneId:fixture.snapshot.scenes[1]!.scene.id,labelId:null}}}];
    const instances:string[]=[];fixture.ports.beforeDialogue=async({state})=>{instances.push(state.entryPresentation!.instanceId);return{ok:true,value:undefined,warnings:[]};};
    unwrap(await ready(fixture));await completeSay(fixture.controller);
    expect(instances).toHaveLength(2);expect(new Set(instances).size).toBe(2);
  });
  it('commits the first dialogue only after its entry handoff and does not replay it on restore',async()=>{
    const fixture=setup();let calls=0,release:(()=>void)|undefined;
    fixture.ports.beforeDialogue=async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});return {ok:true,value:undefined,warnings:[]};};
    const starting=ready(fixture);await new Promise(resolve=>setTimeout(resolve,0));
    expect(calls).toBe(1);expect(fixture.controller.inspect()?.history).toEqual([]);expect(fixture.getLongTerm().readStatements).toEqual([]);
    release!();const active=unwrap(await starting);expect(active.state.entryPresentation?.completed).toBe(true);expect(active.history).toHaveLength(1);
    const prepared=unwrap(await fixture.controller.prepareSession({snapshot:fixture.snapshot,domain:{projectId:fixture.snapshot.projectId,kind:'playtest',instance:'entry-restore'},source:{kind:'restored',state:active.state,history:active.history,voiceLocale:'zh-CN'},target:null}));
    unwrap(fixture.controller.activate(prepared.id));unwrap(await fixture.controller.start());expect(calls).toBe(1);
  });
  it('creates a fresh entry instance on a real cross-scene choice',async()=>{
    const fixture=setup();const instances:string[]=[];fixture.ports.beforeDialogue=async({state})=>{instances.push(state.entryPresentation!.instanceId);return{ok:true,value:undefined,warnings:[]};};
    unwrap(await ready(fixture));await completeSay(fixture.controller);await completeSay(fixture.controller);const token=fixture.controller.inspect()!.token!;
    unwrap(await fixture.controller.dispatch({kind:'choose',token,optionId:FixtureIds.chooseBookshop}));expect(instances).toHaveLength(2);expect(new Set(instances).size).toBe(2);
  });
  it('completes an afterstory with an independent fact and preserves the main ending list',async()=>{
    const fixture=setup(),snapshot=fixture.snapshot,base=snapshot.scenes[0]!.instructions[0]!;
    snapshot.scenes[0]!.instructions=[{...base,opcode:'end',continuation:'continue',args:{endingId:'not-a-main-ending',target:{kind:'title'}}}];
    const prepared=unwrap(await fixture.controller.prepareSession({snapshot,domain:{projectId:snapshot.projectId,kind:'playtest',instance:'afterstory'},source:{kind:'entry',scenario:scenario(snapshot)},target:null,
      story:{kind:'afterstory',entryId:'After1',characterId:FixtureIds.an,title:'雨后的约定'}}));
    unwrap(fixture.controller.activate(prepared.id));unwrap(await fixture.controller.start());expect(fixture.getLongTerm().endings).toEqual([]);expect(fixture.getLongTerm().afterstoryCompleted).toEqual(['After1']);
  });
  it('uses the selected protagonist name from progress and restores it without changing character identity', async () => {
    const fixture=setup(), variableId=id(0xfa1);
    fixture.snapshot.variables.push({id:variableId,name:'主角姓名',type:'string',scope:'progress',initial:'默认'});
    fixture.snapshot.project.player.name={characterId:FixtureIds.an,defaultName:'旅行者',allowCustom:true,variableId,maxLength:24,promptPolicy:'always'};
    const plan=scenario(fixture.snapshot);plan.initialProgress[variableId]='晨光';
    const started=unwrap(await ready(fixture,plan));
    expect(started.state.presentation.text.speakerId).toBe(FixtureIds.an);
    expect(started.state.presentation.text.speakerName).toBe('晨光');
    expect(started.history[0]?.speaker).toBe('晨光');
    const restored=unwrap(await fixture.controller.prepareSession({snapshot:fixture.snapshot,domain:{projectId:fixture.snapshot.projectId,kind:'playtest',instance:'name-restore'},source:{kind:'restored',state:started.state,history:started.history,voiceLocale:'zh-CN'},target:null}));
    unwrap(fixture.controller.activate(restored.id));
    expect(unwrap(await fixture.controller.start()).state.progress[variableId]).toBe('晨光');
    expect(fixture.controller.inspect()?.state.presentation.text.speakerName).toBe('晨光');
  });
  it('uses author fixed names and the default custom name for playtests without asking for input', async () => {
    const fixture=setup(), variableId=id(0xfa2);
    fixture.snapshot.project.player.name={characterId:FixtureIds.an,defaultName:'林舟',allowCustom:false,variableId:null,maxLength:24,promptPolicy:'always'};
    expect(unwrap(await ready(fixture)).state.presentation.text.speakerName).toBe('林舟');
    fixture.snapshot.variables.push({id:variableId,name:'主角姓名',type:'string',scope:'progress',initial:''});
    fixture.snapshot.project.player.name={characterId:FixtureIds.an,defaultName:'旅行者',allowCustom:true,variableId,maxLength:24,promptPolicy:'always'};
    expect(unwrap(await ready(fixture)).state.presentation.text.speakerName).toBe('旅行者');
    expect(fixture.controller.inspect()?.state.wait?.kind).toBe('say');
  });
  it('evaluates the entry target for a static preview without activating or writing progress', async () => {
    const fixture = setup(), plan = scenario(fixture.snapshot);
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'sample', instance: 'mini' },
      source: { kind: 'entry', scenario: plan }, target: plan.target, evaluateTarget: true }));
    expect(prepared.reached).toBe(true); expect(prepared.state.wait?.kind).toBe('say');
    expect(prepared.state.presentation.text.text).not.toBe('');
    expect(fixture.controller.inspect()).toBeNull(); expect(fixture.getWrites()).toBe(0);
    fixture.controller.disposePrepared(prepared.id);
  });

  it('formats same-speaker append once and keeps narration separate', () => {
    expect(formatDialogue([
      { statementId: id(1), speakerKind: 'character', characterId: FixtureIds.an, body: '春', locale: 'zh-CN' },
      { statementId: id(2), speakerKind: 'character', characterId: FixtureIds.an, body: '日', locale: 'ja' },
      { statementId: id(3), speakerKind: 'narrator', characterId: null, body: '雨', locale: 'zh-CN' },
    ])).toBe('「春日」\n雨');
  });

  it('short circuits the right expression and retains the condition tree', () => {
    const fixture = setup();
    const expression = { kind: 'binary', op: '&&', left: { kind: 'literal', value: false },
      right: { kind: 'binary', op: '>', left: { kind: 'binary', op: '/', left: { kind: 'literal', value: 1 }, right: { kind: 'literal', value: 0 } }, right: { kind: 'literal', value: 0 } } } as const;
    const result = evaluateBoolean(expression, { state: { ...fixture.snapshot, progress: {}, frames: [] } as never,
      longTerm: fixture.getLongTerm() });
    expect(result.value).toBe(false); expect(result.root.children[1]?.status).toBe('shortCircuited');
  });

  it('runs the real F-BASE branch with stable choice IDs and rejects old callbacks', async () => {
    const fixture = setup();
    const started = await ready(fixture); expect(started.ok).toBe(true);
    const oldToken = await completeSay(fixture.controller);
    const stale = await fixture.controller.dispatch({ kind: 'advance', token: oldToken });
    expect(stale.ok).toBe(false); if (!stale.ok) expect(stale.error.code).toBe('TOKEN_STALE');
    await completeSay(fixture.controller);
    const active = fixture.controller.inspect()!; expect(active.state.wait?.kind).toBe('choice');
    const chosen = await fixture.controller.dispatch({ kind: 'choose', token: active.token!, optionId: FixtureIds.chooseBookshop });
    expect(chosen.ok).toBe(true);
    expect(fixture.controller.inspect()?.state.position.sceneId).toBe(FixtureIds.bookshop);
    expect(fixture.controller.inspect()?.state.route[0]?.optionId).toBe(FixtureIds.chooseBookshop);
  });

  it('keeps a single long-term increment pending after failure and retries the same target value', async () => {
    const fixture = setup(); const statement: Instruction = { statementId: id(800), opcode: 'setVar', specVersion: '0.1.0',
      condition: null, continuation: 'continue', skippable: false, args: { variableId: id(801), op: 'add', value: 5 },
      source: { documentId: FixtureIds.streetDocument, statementId: id(800), revision: 1 } };
    fixture.snapshot.variables.push({ id: id(801), name: '永久值', type: 'number', scope: 'longTerm', initial: 55 });
    fixture.snapshot.scenes[0]!.instructions.unshift(statement);
    fixture.setFailWrites(1);
    const started = await ready(fixture, scenario(fixture.snapshot, FixtureIds.street, statement.statementId));
    expect(started.ok).toBe(false);
    expect(fixture.controller.inspect()?.state.position.statementId).toBe(FixtureIds.statements[0]);
    expect(fixture.controller.inspect()?.pendingLongTerm).toBe(true);
    const blocked = await fixture.controller.start(); expect(blocked.ok).toBe(true);
    expect(fixture.controller.inspect()?.state.position.statementId).toBe(FixtureIds.statements[0]);
    const retried = await fixture.controller.retryLongTerm(); expect(retried.ok).toBe(true);
    expect(fixture.getLongTerm().variables[id(801)]?.value).toBe(60);
    expect(fixture.getWrites()).toBe(2);
  });

  it('captures the first flow entry from the post-increment state and does not resample on write retry', async () => {
    const fixture = setup(); const setId = id(840), flowId = id(841);
    fixture.snapshot.scenes[0]!.instructions.unshift({ statementId: setId, opcode: 'setVar', specVersion: '0.1.0',
      condition: null, continuation: 'continue', skippable: false,
      args: { variableId: FixtureIds.relation, op: 'add', value: 5 },
      source: { documentId: FixtureIds.streetDocument, statementId: setId, revision: 1 } });
    let samples = 0;
    fixture.ports.longTerm.prepareFlowUnlocks = input => {
      samples++;
      if (input.state.progress[FixtureIds.relation] !== 60 || input.longTermAfter.flowEntries[flowId])
        return { ok: true, value: { sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId, sequence: input.sequence,
          expectedLongTermRevision: input.longTermAfter.revision, entries: [] }, warnings: [] };
      const entry = { schemaVersion: 1 as const, projectId: input.snapshot.projectId, nodeId: flowId,
        releaseVersion: input.snapshot.releaseVersion, engineVersion: input.snapshot.engineVersion,
        dependencyVersions: [input.snapshot.lock.engine, ...input.snapshot.lock.plugins, input.snapshot.lock.template],
        unlockedAt: '2026-09-23T00:00:00Z', state: structuredClone(input.state) };
      return { ok: true, value: { sessionId: input.sessionId, snapshotId: input.snapshot.snapshotId, sequence: input.sequence,
        expectedLongTermRevision: input.longTermAfter.revision, entries: [entry] }, warnings: [] };
    };
    fixture.setFailWrites(1);
    const plan = scenario(fixture.snapshot, FixtureIds.street, setId); plan.initialProgress[FixtureIds.relation] = 55;
    const started = await ready(fixture, plan);
    expect(started.ok).toBe(false);
    expect(fixture.controller.inspect()?.state.progress[FixtureIds.relation]).toBe(60);
    expect(fixture.controller.inspect()?.pendingLongTerm).toBe(true);
    const sampled = samples;
    expect(unwrap(await fixture.controller.retryLongTerm()).state.progress[FixtureIds.relation]).toBe(60);
    expect(samples).toBe(sampled);
    const entry = fixture.getLongTerm().flowEntries[flowId];
    expect(entry?.state.progress[FixtureIds.relation]).toBe(60);
    expect(entry?.state.position.statementId).toBe(FixtureIds.statements[0]);
  });

  it('builds a target state by walking the selected route', async () => {
    const fixture = setup(); const plan = scenario(fixture.snapshot);
    plan.route = [{ statementId: FixtureIds.choice, occurrence: 3, optionId: FixtureIds.chooseBookshop }];
    const target = { sceneId: FixtureIds.bookshop, statementId: FixtureIds.statements[4]! };
    const prepared = await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'route-test' },
      source: { kind: 'entry', scenario: plan }, target });
    expect(prepared.ok).toBe(true); if (!prepared.ok) return;
    expect(prepared.value.reached).toBe(true);
    expect(prepared.value.state.route[0]?.optionId).toBe(FixtureIds.chooseBookshop);
    expect(prepared.value.state.position).toEqual(target);
    expect(prepared.value.state.phase).toBe('waiting');
  });

  it('resets local variables when a prepared route crosses scenes', async () => {
    const fixture = setup(), localId = id(910);
    fixture.snapshot.scenes[0]!.scene.locals.push({ id: localId, name: '地点值', type: 'number', scope: 'local', initial: 1 });
    fixture.snapshot.scenes[1]!.scene.locals.push({ id: localId, name: '地点值', type: 'number', scope: 'local', initial: 9 });
    const plan = scenario(fixture.snapshot, FixtureIds.street, FixtureIds.choice);
    plan.route = [{ statementId: FixtureIds.choice, occurrence: 1, optionId: FixtureIds.chooseBookshop }];
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'route-locals' },
      source: { kind: 'entry', scenario: plan }, target: { sceneId: FixtureIds.bookshop, statementId: FixtureIds.statements[4]! } }));
    expect(prepared.reached).toBe(true);
    expect(prepared.state.frames.at(-1)?.locals[localId]).toBe(9);
  });

  it('stops a prepared route at invalid planned input without changing state', async () => {
    const fixture = setup(), inputId = id(911), variableId = id(912);
    fixture.snapshot.variables.push({ id: variableId, name: '输入', type: 'string', scope: 'progress', initial: '' });
    fixture.snapshot.scenes[0]!.instructions.unshift({ statementId: inputId, opcode: 'getUserInput', specVersion: '0.1.0',
      condition: null, continuation: 'wait', skippable: false,
      args: { variableId, prompt: '输入', defaultText: '', allowEmpty: false, maxLength: 3, pattern: '[A-Z]+', validation: true, cancelTarget: null },
      source: { documentId: FixtureIds.streetDocument, statementId: inputId, revision: 1 } });
    const plan = scenario(fixture.snapshot, FixtureIds.street, inputId);
    plan.playerInputs = [{ statementId: inputId, occurrence: 1, text: 'lowercase' }];
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'route-input' },
      source: { kind: 'entry', scenario: plan }, target: { sceneId: FixtureIds.street, statementId: FixtureIds.statements[0]! } }));
    expect(prepared.reached).toBe(false); expect(prepared.blockedAt?.statementId).toBe(inputId);
    expect(prepared.state.progress[variableId]).toBe('');
  });

  it('persists route long-term effects before continuing from its target line', async () => {
    const fixture = setup(), longId = id(913), setId = id(914);
    fixture.snapshot.variables.push({ id: longId, name: '永久值', type: 'number', scope: 'longTerm', initial: 55 });
    fixture.snapshot.scenes[0]!.instructions.unshift({ statementId: setId, opcode: 'setVar', specVersion: '0.1.0',
      condition: null, continuation: 'continue', skippable: false, args: { variableId: longId, op: 'add', value: 5 },
      source: { documentId: FixtureIds.streetDocument, statementId: setId, revision: 1 } });
    fixture.snapshot.scenes[0]!.instructions[2]!.condition = { kind: 'binary', op: '==',
      left: { kind: 'variable', scope: 'longTerm', id: longId }, right: { kind: 'literal', value: 60 } };
    const plan = scenario(fixture.snapshot, FixtureIds.street, setId);
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'route-long' },
      source: { kind: 'entry', scenario: plan }, target: { sceneId: FixtureIds.street, statementId: FixtureIds.statements[0]! } }));
    expect(prepared.reached).toBe(true); expect(fixture.getLongTerm().variables[longId]).toBeUndefined();
    unwrap(fixture.controller.activate(prepared.id)); unwrap(await fixture.controller.start());
    expect(fixture.getLongTerm().variables[longId]?.value).toBe(60);
    await completeSay(fixture.controller);
    expect(fixture.controller.inspect()?.state.position.statementId).toBe(FixtureIds.statements[1]);
  });

  it('derives distinct progress and BGM through two paths to one target line', async () => {
    const fixture = setup(); const snapshot = fixture.snapshot;
    const commonId = id(860), branchA = FixtureIds.street, branchB = FixtureIds.bookshop;
    const commonSay = { ...structuredClone(snapshot.scenes[0]!.instructions[0]!), statementId: id(861),
      source: { documentId: id(862), statementId: id(861), revision: 1 } };
    snapshot.scenes.push({ scene: { ...structuredClone(snapshot.scenes[1]!.scene), id: commonId, name: '共同句' }, labels: {}, instructions: [commonSay] });
    snapshot.project.chapters[0]!.sceneIds.push(commonId);
    const command = (opcode: string, suffix: number, args: Instruction['args']): Instruction => ({
      statementId: id(suffix), opcode, specVersion: '0.1.0', condition: null, continuation: 'continue', skippable: false,
      args, source: { documentId: id(suffix + 20), statementId: id(suffix), revision: 1 } });
    const branch = (value: number, voice: string, first: number) => [
      command('setVar', first, { variableId: FixtureIds.relation, op: 'assign', value }),
      command('bgm', first + 1, { assetId: voice, op: 'play' }),
      command('changeScene', first + 2, { sceneId: commonId, labelId: null }),
    ];
    snapshot.scenes[0]!.instructions = [snapshot.scenes[0]!.instructions[2]!, ...branch(20, FixtureIds.voices[0]!, 870)];
    snapshot.scenes[0]!.labels[FixtureIds.streetLabel] = id(870);
    snapshot.scenes[1]!.instructions = branch(40, FixtureIds.voices[1]!, 880);
    fixture.ports.stage.prepare = async input => {
      const state = structuredClone(input.state);
      if (input.opcode === 'bgm') {
        state.presentation.bgm.assetId = (input.args as { assetId: string }).assetId;
        state.presentation.bgm.variantId = snapshot.assets.find(item => item.assetId === state.presentation.bgm.assetId)?.variantId ?? null;
        state.presentation.bgm.stopped = false;
      }
      return { ok: true, value: { state, delta: null }, warnings: [] };
    };
    const makeRoute = async (optionId: string) => {
      const plan = scenario(snapshot, branchA, FixtureIds.choice);
      plan.route = [{ statementId: FixtureIds.choice, occurrence: 1, optionId }];
      const result = await fixture.controller.prepareSession({ snapshot, domain: { projectId: snapshot.projectId, kind: 'playtest', instance: optionId },
        source: { kind: 'entry', scenario: plan }, target: { sceneId: commonId, statementId: commonSay.statementId } });
      return unwrap(result);
    };
    const a = await makeRoute(FixtureIds.chooseStreet);
    const b = await makeRoute(FixtureIds.chooseBookshop);
    expect([a.reached, b.reached]).toEqual([true, true]);
    expect(a.state.progress[FixtureIds.relation]).toBe(20);
    expect(b.state.progress[FixtureIds.relation]).toBe(40);
    expect(a.state.presentation.bgm.assetId).toBe(FixtureIds.voices[0]);
    expect(b.state.presentation.bgm.assetId).toBe(FixtureIds.voices[1]);
  });

  it('commits a locked plugin command progress and long-term target once', async () => {
    const fixture = setup(), pluginId = 'org.galcraft.affection', key = `${pluginId}/add`;
    fixture.snapshot.lock.plugins.push({ kind: 'plugin', id: pluginId, version: '0.1.0', targets: ['web', 'windows'], required: true });
    fixture.ports.contributions.systems.push({ key: `${pluginId}/state`, progressSchema: {}, longTermSchema: {},
      initialProgress: () => ({ count: 0 }), initialLongTerm: () => ({ count: 0 }), debugFields: [],
      validate: value => ({ ok: true, value, warnings: [] }), convert: (_from, _to, value) => ({ ok: true, value, warnings: [] }),
      mergeLongTerm: (_local, incoming) => ({ ok: true, value: incoming, warnings: [] }),
      checkpoint: value => ({ ok: true, value, warnings: [] }) });
    fixture.ports.contributions.commands.push({ spec: { ...CoreCommandSpecs[0]!, key },
      execute: async ({ state }) => ({ ok: true, value: { progress: { count: Number((state as { count: number }).count) + 5 },
        longTermDelta: { count: 5 }, presentation: null, wait: null, result: 5 }, warnings: [] }) });
    const pluginStatement: Instruction = { statementId: id(890), opcode: key, specVersion: '0.1.0', condition: null,
      continuation: 'continue', skippable: false, args: {},
      source: { documentId: FixtureIds.streetDocument, statementId: id(890), revision: 1 } };
    fixture.snapshot.scenes[0]!.instructions.unshift(pluginStatement);
    const started = await ready(fixture, scenario(fixture.snapshot, FixtureIds.street, pluginStatement.statementId));
    expect(started.ok).toBe(true); if (!started.ok) return;
    expect(started.value.state.plugins[pluginId]?.progress).toEqual({ count: 5 });
    expect(fixture.getLongTerm().plugins[pluginId]?.data).toEqual({ count: 5 });
    expect(fixture.getWrites()).toBe(1);
  });

  it('passes named fields to a plugin condition during playtest', async () => {
    const fixture = setup(), pluginId = 'org.example.condition', key = `${pluginId}/ready`;
    fixture.snapshot.lock.plugins.push({ kind: 'plugin', id: pluginId, version: '0.1.0', targets: ['web', 'windows'], required: true });
    let received: unknown;
    fixture.ports.contributions.conditions.push({ key, fields: [{ path: 'threshold', label: 'Threshold', description: '',
      type: 'number', required: true, nullable: false, default: 0, unit: 'none', group: 'basic', summary: true, keywords: [] }],
      evaluate: args => { received = args; return { ok: true, value: true, warnings: [] }; } });
    fixture.snapshot.scenes[0]!.instructions[0]!.condition = { kind: 'call', name: key, args: [{ kind: 'literal', value: 7 }] };
    const started = await ready(fixture);
    expect(started.ok).toBe(true);
    expect(received).toEqual({ threshold: 7 });
  });

  it('evaluates menu conditions with project defaults, the active progress and installed pure plugin conditions', async () => {
    const fixture = setup(), domain = { projectId: fixture.snapshot.projectId, kind: 'playtest' as const, instance: 'runtime-test' };
    const progress = { kind: 'binary' as const, op: '>' as const, left: { kind: 'variable' as const, scope: 'progress' as const, id: FixtureIds.relation }, right: { kind: 'literal' as const, value: 3 } };
    expect(unwrap(fixture.controller.evaluateCondition(progress, fixture.snapshot, domain))).toBe(false);
    const custom = scenario(fixture.snapshot); custom.initialProgress[FixtureIds.relation] = 7;
    await ready(fixture, custom);
    expect(unwrap(fixture.controller.evaluateCondition(progress, fixture.snapshot, domain))).toBe(true);
    const key = 'org.example.condition/menu';
    fixture.ports.contributions.conditions.push({ key, fields: [], evaluate: (_args, _progress, longTerm) =>
      ({ ok: true, value: (longTerm as { open?: boolean }).open === true, warnings: [] }) });
    fixture.getLongTerm().plugins['org.example.condition'] = { version: '0.1.0', stateVersion: 1, data: { open: true } };
    expect(unwrap(fixture.controller.evaluateCondition({ kind: 'call', name: key, args: [] }, fixture.snapshot, domain))).toBe(true);
    expect(fixture.getWrites()).toBe(0);
    const before = structuredClone(fixture.controller.inspect());
    fixture.controller.evaluateCondition(progress, fixture.snapshot, domain);
    expect(fixture.controller.inspect()).toEqual(before);
  });

  it('accepts one asynchronous plugin completion for each execution token', async () => {
    const fixture = setup(), key = 'org.galcraft.test/wait', statementId = id(915);
    fixture.ports.contributions.pages.push({ key: 'test', titleKey: 'test', componentKey: 'test', inputSchema: {}, resultSchema: {}, configFields: [], publicParts: [], sampleInput: {}, wait: { restorable: true, cancel: 'keepWaiting' }, render: () => null });
    let finish!: (result: Result<PluginStep>) => void;
    let resumeCalls = 0;
    fixture.ports.contributions.commands.push({ spec: { ...CoreCommandSpecs[0]!, key },
      execute: async () => ({ ok: true, value: { progress: {}, longTermDelta: null, presentation: null,
        wait: { page: 'test', input: {}, resumeData: {} }, result: null }, warnings: [] }),
      resume: async () => { resumeCalls++; return new Promise(resolve => { finish = resolve; }); } });
    fixture.snapshot.scenes[0]!.instructions.unshift({ statementId, opcode: key, specVersion: '0.1.0',
      condition: null, continuation: 'wait', skippable: false, args: {},
      source: { documentId: FixtureIds.streetDocument, statementId, revision: 1 } });
    const started = unwrap(await ready(fixture, scenario(fixture.snapshot, FixtureIds.street, statementId)));
    const first = fixture.controller.dispatch({ kind: 'plugin', token: started.token!, result: null });
    const duplicate = await fixture.controller.dispatch({ kind: 'plugin', token: started.token!, result: null });
    expect(duplicate.ok).toBe(false); if (!duplicate.ok) expect(duplicate.error.code).toBe('TOKEN_IN_PROGRESS');
    finish({ ok: true, value: { progress: {}, longTermDelta: null, presentation: null, wait: null, result: null }, warnings: [] });
    expect((await first).ok).toBe(true); expect(resumeCalls).toBe(1);
    expect(fixture.controller.inspect()?.state.position.statementId).toBe(FixtureIds.statements[0]);
  });

  it('restores plugin waiting with a fresh token and rejects a nonrestorable interaction', async () => {
    const fixture = setup(), key = 'example.game/interact', statementId = id(0xf30);
    let resumes = 0;
    fixture.ports.contributions.pages.push({ key: 'example.game/page', titleKey: 'page', componentKey: 'page', inputSchema: {}, resultSchema: {}, configFields: [], publicParts: [], sampleInput: {}, wait: { restorable: true, cancel: 'keepWaiting' }, render: () => null });
    fixture.ports.contributions.commands.push({ spec: { ...CoreCommandSpecs[0]!, key }, execute: async () => ({ok:true,value:{progress:{},longTermDelta:null,presentation:null,wait:{page:'example.game/page',input:{selection:'first'},resumeData:{step:2}},result:null},warnings:[]}),
      resume: async ({resumeData}) => { expect(resumeData).toEqual({step:2}); resumes++; return {ok:true,value:{progress:{},longTermDelta:null,presentation:null,wait:null,result:null},warnings:[]}; } });
    fixture.snapshot.scenes[0]!.instructions.unshift({statementId,opcode:key,specVersion:'0.1.0',condition:null,continuation:'wait',skippable:false,args:{},source:{documentId:FixtureIds.streetDocument,statementId,revision:1}});
    const waiting = unwrap(await ready(fixture,scenario(fixture.snapshot,FixtureIds.street,statementId)));
    expect(fixture.controller.pluginWaitPolicy().restorable).toBe(true);
    const prepared = unwrap(await fixture.controller.prepareSession({snapshot:fixture.snapshot,domain:{projectId:fixture.snapshot.projectId,kind:'playtest',instance:'restored'},source:{kind:'restored',state:waiting.state,history:waiting.history,voiceLocale:'zh-CN'},target:null}));
    unwrap(fixture.controller.activate(prepared.id));
    expect(fixture.controller.inspect()!.token!.sessionId).not.toBe(waiting.token!.sessionId);
    expect((await fixture.controller.dispatch({kind:'plugin',token:waiting.token!,result:null})).ok).toBe(false);
    const token = fixture.controller.inspect()!.token!;
    expect((await fixture.controller.dispatch({kind:'cancel',token})).ok).toBe(true);
    expect(resumes).toBe(0);
    expect((await fixture.controller.dispatch({kind:'plugin',token,result:null})).ok).toBe(true);
    expect((await fixture.controller.dispatch({kind:'plugin',token,result:null})).ok).toBe(false);
    expect(resumes).toBe(1);
    fixture.ports.contributions.pages[0]!.wait!.restorable = false;
    const denied = await fixture.controller.prepareSession({snapshot:fixture.snapshot,domain:{projectId:fixture.snapshot.projectId,kind:'playtest',instance:'denied'},source:{kind:'restored',state:waiting.state,history:waiting.history,voiceLocale:'zh-CN'},target:null});
    expect(denied.ok).toBe(false); if (!denied.ok) expect(denied.error.code).toBe('PLUGIN_WAIT_CHECKPOINT');
    fixture.ports.contributions.pages[0]!.wait={restorable:true,cancel:'continue'};fixture.ports.contributions.pages[0]!.resultSchema={type:'number'};
    const cancelled=unwrap(await fixture.controller.prepareSession({snapshot:fixture.snapshot,domain:{projectId:fixture.snapshot.projectId,kind:'playtest',instance:'cancelled'},source:{kind:'restored',state:waiting.state,history:waiting.history,voiceLocale:'zh-CN'},target:null}));
    unwrap(fixture.controller.activate(cancelled.id));expect((await fixture.controller.dispatch({kind:'cancel',token:fixture.controller.inspect()!.token!})).ok).toBe(true);expect(resumes).toBe(2);
  });
  it('commits captured provider business state before the following instruction and keeps commands out of saves', async () => {
    const fixture=setup(),key='example.resource/present',statementId=id(0xf40),objectId=id(0xf41);
    const custom=stageObject(objectId,'center');custom.layer='effect';custom.providerState={provider:'example.resource/effect',version:'0.1.0',state:{count:0}};
    let applied=0,disposed=0;
    fixture.ports.prepareProviderCommands=async input=>{expect(input.commands).toEqual([{objectId,command:{count:11}}]);const captured=structuredClone(input.state);captured.objects[0]!.providerState!.state={count:11};return {ok:true,value:{state:captured,commit:()=>{applied++;return {ok:true,value:undefined,warnings:[]};},dispose:()=>{disposed++;}},warnings:[]};};
    fixture.ports.contributions.commands.push({spec:{...CoreCommandSpecs[0]!,key},execute:async()=>({ok:true,value:{progress:{},longTermDelta:null,presentation:{objects:[{op:'show',id:objectId,value:custom}],effects:[],audio:[],providerCommands:[{objectId,command:{count:11}}]},wait:null,result:null},warnings:[]})});
    fixture.snapshot.scenes[0]!.instructions.unshift({statementId,opcode:key,specVersion:'0.1.0',condition:null,continuation:'continue',skippable:false,args:{},source:{documentId:FixtureIds.streetDocument,statementId,revision:1}});
    const current=unwrap(await ready(fixture,scenario(fixture.snapshot,FixtureIds.street,statementId)));
    expect(current.state.wait?.kind).toBe('say');expect(current.state.presentation.objects[0]?.providerState?.state).toEqual({count:11});
    expect(applied).toBe(1);expect(disposed).toBe(1);expect(JSON.stringify(current.state)).not.toContain('providerCommands');
    const sample=unwrap(await fixture.controller.prepareSession({snapshot:fixture.snapshot,domain:{projectId:fixture.snapshot.projectId,kind:'sample',instance:'provider-preview'},source:{kind:'entry',scenario:scenario(fixture.snapshot,FixtureIds.street,statementId)},target:current.state.position}));
    expect(sample.state.presentation.objects[0]?.providerState?.state).toEqual({count:11});expect(applied).toBe(1);expect(disposed).toBe(2);
    expect(fixture.controller.inspect()?.sessionId).toBe(current.sessionId);fixture.controller.disposePrepared(sample.id);
  });

  it('returns through A → B → C with one caller receiver and isolated local frames', async () => {
    const fixture = setup(); const snapshot = fixture.snapshot;
    const callerLocal = id(810), parameter = id(811), thirdSceneId = id(812);
    snapshot.scenes[0]!.scene.locals.push({ id: callerLocal, name: 'score', type: 'number', scope: 'local', initial: 1 });
    snapshot.scenes[1]!.scene.locals.push({ id: parameter, name: 'score', type: 'number', scope: 'local', initial: 0 });
    snapshot.scenes[1]!.scene.parameters.push({ variableId: parameter, required: true, defaultValue: null });
    const call: Instruction = { statementId: id(813), opcode: 'callScene', specVersion: '0.1.0', condition: null,
      continuation: 'continue', skippable: false,
      args: { sceneId: FixtureIds.bookshop, labelId: null, parameters: { [parameter]: 2 }, receiver: { scope: 'local', variableId: callerLocal } },
      source: { documentId: FixtureIds.streetDocument, statementId: id(813), revision: 1 } };
    snapshot.scenes[0]!.instructions = [call, snapshot.scenes[0]!.instructions[0]!];
    snapshot.scenes[1]!.instructions = [{ statementId: id(814), opcode: 'changeScene', specVersion: '0.1.0', condition: null,
      continuation: 'continue', skippable: false, args: { sceneId: thirdSceneId, labelId: null },
      source: { documentId: FixtureIds.bookshopDocument, statementId: id(814), revision: 1 } }];
    snapshot.scenes.push({ scene: { ...snapshot.scenes[1]!.scene, id: thirdSceneId, name: 'C', parameters: [], locals: [], returns: 'number' },
      labels: {}, instructions: [{ statementId: id(815), opcode: 'return', specVersion: '0.1.0', condition: null,
        continuation: 'continue', skippable: false, args: { value: 7 },
        source: { documentId: id(816), statementId: id(815), revision: 1 } }] });
    snapshot.scenes[1]!.scene.returns = 'number';
    snapshot.project.chapters[0]!.sceneIds.push(thirdSceneId);
    const result = await ready(fixture, scenario(snapshot, FixtureIds.street, call.statementId));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.state.position.statementId).toBe(FixtureIds.statements[0]);
    expect(result.value.state.frames).toHaveLength(1);
    expect(result.value.state.frames[0]?.locals[callerLocal]).toBe(7);
    expect(result.value.state.frames[0]?.locals[parameter]).toBeUndefined();
  });

  it('captures an actual false condition and uses the occurrence in the debug request', async () => {
    const fixture = setup(); const snapshot = fixture.snapshot;
    const guarded: Instruction = { statementId: id(820), opcode: 'setVar', specVersion: '0.1.0',
      condition: { kind: 'binary', op: '&&', left: { kind: 'literal', value: false },
        right: { kind: 'binary', op: '>', left: { kind: 'binary', op: '/', left: { kind: 'literal', value: 1 }, right: { kind: 'literal', value: 0 } }, right: { kind: 'literal', value: 0 } } },
      continuation: 'continue', skippable: false, args: { variableId: FixtureIds.relation, op: 'add', value: 5 },
      source: { documentId: FixtureIds.streetDocument, statementId: id(820), revision: 1 } };
    snapshot.scenes[0]!.instructions.unshift(guarded);
    const started = await ready(fixture, scenario(snapshot, FixtureIds.street, guarded.statementId));
    expect(started.ok).toBe(true); if (!started.ok) return;
    expect(started.value.state.progress[FixtureIds.relation]).toBe(0);
    const trace = started.value.trace.find(item => item.token.statementId === guarded.statementId)!;
    const explained = await fixture.controller.dispatchDebug({ requestId: id(821), sessionId: started.value.sessionId,
      expectedSequence: started.value.sequence, command: { op: 'explainCondition', token: trace.token, field: 'when' } });
    expect(explained.ok).toBe(true); if (explained.ok) {
      expect(explained.value.condition?.outcome).toBe('false');
      expect(explained.value.condition?.root.children[1]?.status).toBe('shortCircuited');
    }
  });

  it('rejects wrong-type debug edits and saves a reproducible playtest initial value', async () => {
    const fixture = setup(); const started = await ready(fixture); expect(started.ok).toBe(true); if (!started.ok) return;
    const base = fixture.controller.inspect()!;
    const wrong = await fixture.controller.dispatchDebug({ requestId: id(850), sessionId: base.sessionId,
      expectedSequence: base.sequence, command: { op: 'setVariable', scope: 'progress', id: FixtureIds.relation, value: 'wrong' } });
    expect(wrong.ok).toBe(false);
    expect(fixture.controller.inspect()?.state.progress[FixtureIds.relation]).toBe(0);
    const valid = await fixture.controller.dispatchDebug({ requestId: id(851), sessionId: base.sessionId,
      expectedSequence: base.sequence, command: { op: 'setVariable', scope: 'progress', id: FixtureIds.relation, value: 30 } });
    expect(valid.ok).toBe(true); if (!valid.ok) return;
    const saved = await fixture.controller.dispatchDebug({ requestId: id(852), sessionId: base.sessionId,
      expectedSequence: valid.value.sequence, command: { op: 'saveInitial', name: '30 分', variableIds: [FixtureIds.relation], pluginIds: [] } });
    expect(saved.ok).toBe(true); if (!saved.ok || !saved.value.scenario) return;
    expect(saved.value.scenario.initialProgress[FixtureIds.relation]).toBe(30);
    const restarted = await fixture.controller.dispatchDebug({ requestId: id(853), sessionId: base.sessionId,
      expectedSequence: saved.value.sequence, command: { op: 'restart', scenario: saved.value.scenario } });
    expect(restarted.ok).toBe(true);
    expect(fixture.controller.inspect()?.state.progress[FixtureIds.relation]).toBe(30);
  });

  it('restores a waiting line under a fresh token without executing previous variable effects', async () => {
    const fixture = setup(); const first = await ready(fixture); expect(first.ok).toBe(true); if (!first.ok) return;
    expect(first.value.history[0]?.entryState?.phase).toBe('entry');
    expect(first.value.history[0]?.entryState?.position.statementId).toBe(FixtureIds.statements[0]);
    const stored = first.value.state;
    const restored = await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'runtime-test' },
      source: { kind: 'restored', state: stored, history: first.value.history, voiceLocale: 'ja' }, target: null },
      { requestId: id(830), sessionId: id(831), snapshotId: fixture.snapshot.snapshotId });
    expect(restored.ok).toBe(true); if (!restored.ok) return;
    expect(restored.value.state.progress).toEqual(stored.progress);
    expect(restored.value.voiceBinding?.token.sessionId).toBe(id(831));
    expect(fixture.controller.activate(restored.value.id).ok).toBe(true);
    const stale = await fixture.controller.dispatch({ kind: 'advance', token: first.value.token! });
    expect(stale.ok).toBe(false);
  });

  it('keeps the launched voice on locale change and uses the new locale on replay', async () => {
    const fixture = setup(); const first = await ready(fixture); expect(first.ok).toBe(true); if (!first.ok) return;
    const original = fixture.controller.inspect()!;
    const zh = fixture.controller.inspectVoice({ sessionId: original.sessionId, expectedSequence: original.sequence, token: original.token! });
    expect(zh.ok).toBe(true); if (!zh.ok) return;
    fixture.controller.setVoiceLocale('ja');
    const stillZh = fixture.controller.inspectVoice({ sessionId: original.sessionId, expectedSequence: original.sequence, token: original.token! });
    expect(stillZh.ok && stillZh.value.id).toBe(zh.value.id);
    const replayed = fixture.controller.replayVoice(); expect(replayed.ok).toBe(true);
    const after = fixture.controller.inspect()!;
    const ja = fixture.controller.inspectVoice({ sessionId: after.sessionId, expectedSequence: after.sequence, token: after.token! });
    expect(ja.ok && ja.value.id).not.toBe(zh.value.id);
    expect(ja.ok && ja.value.attempts[0]?.locale).toBe('ja');
    expect(ja.ok && ja.value.selected?.via).toBe('legacyVoice');
  });

  it('binds normal and replayed dialogue voice to the explicit object', async () => {
    const fixture = setup(), left = stageObject(id(930), 'left'), right = stageObject(id(931), 'right');
    (fixture.snapshot.scenes[0]!.instructions[0]!.args as { target: object }).target = { kind: 'object', id: right.id };
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'voice-object' },
      source: { kind: 'entry', scenario: scenario(fixture.snapshot) }, target: null }));
    unwrap(fixture.controller.activate(prepared.id));
    unwrap(fixture.controller.syncPresentation(prepared.sessionId, { ...prepared.state.presentation, objects: [left, right] }));
    const started = unwrap(await fixture.controller.start());
    expect(started.state.presentation.voice?.targetObjectId).toBe(right.id);
    unwrap(fixture.controller.replayVoice());
    expect(fixture.controller.inspect()?.state.presentation.voice?.targetObjectId).toBe(right.id);
  });

  it('resolves a restored dialogue station uniquely and leaves untargeted dialogue unbound', async () => {
    const fixture = setup(), left = stageObject(id(932), 'left'), right = stageObject(id(933), 'right');
    (fixture.snapshot.scenes[0]!.instructions[0]!.args as { target: object }).target = { kind: 'station', station: 'right' };
    const state = structuredClone(FixtureRuntimeState); state.presentation.objects = [left, right];
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'voice-station' },
      source: { kind: 'restored', state, history: [], voiceLocale: 'zh-CN' }, target: null }));
    expect(prepared.state.presentation.voice?.targetObjectId).toBe(right.id);
    const missing = structuredClone(state); missing.presentation.objects = [left];
    const missingTarget = await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'voice-missing' },
      source: { kind: 'restored', state: missing, history: [], voiceLocale: 'zh-CN' }, target: null });
    expect(missingTarget.ok).toBe(false); if (!missingTarget.ok) expect(missingTarget.error.code).toBe('OBJECT_MISSING');
    const untargeted = setup();
    const withoutTarget = unwrap(await untargeted.controller.prepareSession({ snapshot: untargeted.snapshot,
      domain: { projectId: untargeted.snapshot.projectId, kind: 'playtest', instance: 'voice-none' },
      source: { kind: 'restored', state, history: [], voiceLocale: 'zh-CN' }, target: null }));
    expect(withoutTarget.state.presentation.voice?.targetObjectId).toBeNull();
  });

  it('rejects a station target with multiple objects before committing the dialogue', async () => {
    const fixture = setup(), left = stageObject(id(934), 'center'), right = stageObject(id(935), 'center');
    (fixture.snapshot.scenes[0]!.instructions[0]!.args as { target: object }).target = { kind: 'station', station: 'center' };
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'voice-ambiguous' },
      source: { kind: 'entry', scenario: scenario(fixture.snapshot) }, target: null }));
    unwrap(fixture.controller.activate(prepared.id));
    unwrap(fixture.controller.syncPresentation(prepared.sessionId, { ...prepared.state.presentation, objects: [left, right] }));
    const result = await fixture.controller.start();
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('OBJECT_AMBIGUOUS');
    expect(fixture.controller.inspect()?.state.phase).toBe('entry');
    expect(fixture.controller.inspect()?.state.presentation.voice).toBeNull();
  });

  it('stops read skip at unread text, and all skip at a choice', async () => {
    const fixture = setup(); const first = await ready(fixture); expect(first.ok).toBe(true);
    const read = await fixture.controller.driveSkip('read'); expect(read.ok).toBe(true);
    expect(fixture.controller.inspect()?.state.position.statementId).toBe(FixtureIds.statements[0]);
    const all = await fixture.controller.driveSkip('all'); expect(all.ok).toBe(true);
    expect(fixture.controller.inspect()?.state.position.statementId).toBe(FixtureIds.choice);
    expect(fixture.controller.inspect()?.state.wait?.kind).toBe('choice');
  });

  it.each(['read', 'all', 'natural'] as const)('commits the finished animation before the next choice on %s completion', async completion => {
    const fixture = setup(), scene = fixture.snapshot.scenes[0]!, statementId = id(940), processId = id(941), objectId = id(942);
    const choice = scene.instructions.find(item => item.opcode === 'choose')!;
    scene.instructions = [{ ...structuredClone(scene.instructions[0]!), statementId, opcode: 'setAnimation',
      continuation: 'wait', skippable: true, args: {} }, choice];
    const commits: Parameters<NonNullable<RuntimePorts['onCommitted']>>[0][] = [];
    let finishCalls = 0;
    fixture.ports.stage.prepare = async input => {
      const state = structuredClone(input.state);
      if (input.opcode === 'setAnimation') {
        const object = stageObject(objectId, 'center');
        object.processes = [{ id: processId, owner: input.token, objectId, fields: ['/x'], segments: [],
          native: { type: 'galcraft.animation', version: 1, durationMs: 1000,
            tracks: [{ path: '/x', mode: 'absolute', keyframes: [{ timeMs: 1000, value: 400, easing: { family: 'linear', direction: 'in' } }] }] },
          segmentIndex: 0, elapsedMs: 0, segmentFrom: {}, before: { '/x': 0 }, repeat: 0, iteration: 0,
          loop: false, cross: false, parallel: false, keepFinal: true, writeDefault: false, status: 'running' }];
        state.presentation.objects = [object];
      } else if (input.opcode === '$finishAnimationWait') {
        finishCalls++;
        expect(state.presentation.objects[0]!.processes[0]).toMatchObject({ owner: input.token, elapsedMs: 197 });
        state.presentation.objects[0]!.current.x = 400;
        state.presentation.objects[0]!.processes = [];
        return { ok: true, value: { state, delta: { objects: [{ op: 'update', id: objectId, value: state.presentation.objects[0]! }],
          effects: [], transitions: [], audio: [], voiceBinding: null } }, warnings: [] };
      }
      return { ok: true, value: { state, delta: null }, warnings: [] };
    };
    fixture.ports.onCommitted = input => { commits.push(structuredClone(input)); return { presentationEntered: true, mediaStarted: false }; };
    const started = unwrap(await ready(fixture));
    expect(started.state.wait).toEqual({ kind: 'animation', processIds: [processId] });
    const captured = structuredClone(started.state.presentation);
    captured.objects[0]!.current.x = completion === 'natural' ? 400 : 78.8;
    if (completion === 'natural') captured.objects[0]!.processes = [];
    else captured.objects[0]!.processes[0]!.elapsedMs = 197;
    unwrap(fixture.controller.syncPresentation(started.sessionId, captured));
    commits.length = 0;

    const completed = unwrap(completion === 'natural'
      ? await fixture.controller.dispatch({ kind: 'animation', token: started.token! })
      : await fixture.controller.driveSkip(completion));
    expect(completed.state.wait?.kind).toBe('choice');
    expect(finishCalls).toBe(completion === 'natural' ? 0 : 1);
    expect(commits).toHaveLength(2);
    expect(commits[0]!.state).toMatchObject({ phase: 'entry', wait: null,
      presentation: { objects: [{ id: objectId, current: { x: 400 }, processes: [] }] } });
    expect(commits[1]!.state).toMatchObject({ wait: { kind: 'choice' },
      presentation: { objects: [{ id: objectId, current: { x: 400 }, processes: [] }] } });
    if (completion !== 'natural') expect(commits[0]!.delta?.objects).toEqual([
      { op: 'update', id: objectId, value: completed.state.presentation.objects[0] }]);
  });

  it('waits for text, viewport, voice, animation and interval before auto advances', async () => {
    const fixture = setup(); const first = await ready(fixture); expect(first.ok).toBe(true); if (!first.ok) return;
    const token = first.value.token!;
    unwrap(await fixture.controller.updateTextProgress({ token, textShown: 1000 }));
    unwrap(fixture.controller.updateReadingViewport({ token, textAnchor: 0, atEnd: true }));
    const early = unwrap(await fixture.controller.tryAutoAdvance({ voiceEnded: true, animationComplete: true,
      readyDurationMs: 1499, autoWaitMs: 1500 }));
    expect(early.advanced).toBe(false);
    const stoppedVoice = unwrap(await fixture.controller.tryAutoAdvance({ voiceEnded: false, animationComplete: true,
      readyDurationMs: 1500, autoWaitMs: 1500 }));
    expect(stoppedVoice.advanced).toBe(false);
    const advanced = unwrap(await fixture.controller.tryAutoAdvance({ voiceEnded: true, animationComplete: true,
      readyDurationMs: 1500, autoWaitMs: 1500 }));
    expect(advanced.advanced).toBe(true);
    expect(advanced.inspection.state.position.statementId).toBe(FixtureIds.statements[1]);
  });

  it('continues append dialogue from the common visible prefix', async () => {
    const fixture = setup();
    (fixture.snapshot.scenes[0]!.instructions[1]!.args as { append: boolean }).append = true;
    const started = unwrap(await ready(fixture));
    const firstToken = started.token!;
    unwrap(await fixture.controller.updateTextProgress({ token: firstToken, textShown: 1000 }));
    unwrap(fixture.controller.updateReadingViewport({ token: firstToken, textAnchor: 2, atEnd: true }));
    unwrap(await fixture.controller.dispatch({ kind: 'advance', token: firstToken }));
    const second = fixture.controller.inspect()!;
    expect(second.state.wait?.kind).toBe('say');
    if (second.state.wait?.kind === 'say') {
      expect(second.state.wait.textShown).toBeGreaterThan(0);
      expect(second.state.wait.textAnchor).toBe(2);
    }
  });

  it('keeps debug pause after changing a variable until resume', async () => {
    const fixture = setup(), started = unwrap(await ready(fixture));
    const paused = unwrap(await fixture.controller.dispatchDebug({ requestId: id(916), sessionId: started.sessionId,
      expectedSequence: started.sequence, command: { op: 'pause' } }));
    const edited = unwrap(await fixture.controller.dispatchDebug({ requestId: id(917), sessionId: paused.sessionId,
      expectedSequence: paused.sequence, command: { op: 'setVariable', scope: 'progress', id: FixtureIds.relation, value: 20 } }));
    expect(fixture.controller.inspect()?.status).toBe('paused');
    expect((await fixture.controller.dispatch({ kind: 'advance', token: started.token! })).ok).toBe(false);
    unwrap(await fixture.controller.dispatchDebug({ requestId: id(918), sessionId: edited.sessionId,
      expectedSequence: edited.sequence, command: { op: 'resume' } }));
    expect(fixture.controller.inspect()?.status).toBe('waiting');
  });

  it('keeps a diagnostic loop paused through variable edits and continues after the edit', async () => {
    const fixture = setup(), loopId = id(920), labelId = id(921);
    fixture.snapshot.scenes[0]!.labels[labelId] = loopId;
    fixture.snapshot.scenes[0]!.instructions.unshift({ statementId: loopId, opcode: 'jumpLabel', specVersion: '0.1.0',
      condition: { kind: 'binary', op: '==', left: { kind: 'variable', scope: 'progress', id: FixtureIds.relation },
        right: { kind: 'literal', value: 0 } }, continuation: 'continue', skippable: false, args: { labelId },
      source: { documentId: FixtureIds.streetDocument, statementId: loopId, revision: 1 } });
    const started = unwrap(await ready(fixture, scenario(fixture.snapshot, FixtureIds.street, loopId)));
    expect(started.status).toBe('paused'); expect(started.issue?.code).toBe('RUNTIME_LOOP');
    const edited = unwrap(await fixture.controller.dispatchDebug({ requestId: id(922), sessionId: started.sessionId,
      expectedSequence: started.sequence, command: { op: 'setVariable', scope: 'progress', id: FixtureIds.relation, value: 1 } }));
    expect(fixture.controller.inspect()?.status).toBe('paused');
    expect(fixture.controller.inspect()?.issue?.code).toBe('RUNTIME_LOOP');
    const resumed = await fixture.controller.dispatchDebug({ requestId: id(923), sessionId: edited.sessionId,
      expectedSequence: edited.sequence, command: { op: 'resume' } });
    expect(resumed.ok).toBe(false);
    const continued = unwrap(await fixture.controller.continueLoop());
    expect(continued.status).toBe('waiting'); expect(continued.state.position.statementId).toBe(FixtureIds.statements[0]);
    expect(continued.issue).toBeNull();
  });

  it('synchronizes the active presentation without a runtime or long-term commit', async () => {
    const fixture = setup(); let notifications = 0;
    fixture.ports.onCommitted = () => { notifications++; return { presentationEntered: true, mediaStarted: false }; };
    const started = unwrap(await ready(fixture));
    const before = fixture.controller.inspect()!;
    const writes = fixture.getWrites(), committed = notifications;
    const captured = structuredClone(before.state.presentation);
    captured.film.top = 10;
    const stale = fixture.controller.syncPresentation(id(924), captured);
    expect(stale.ok).toBe(false); expect(fixture.controller.inspect()?.state.presentation.film.top).toBe(before.state.presentation.film.top);
    expect(fixture.controller.syncPresentation(started.sessionId, captured).ok).toBe(true);
    captured.film.top = 20;
    const after = fixture.controller.inspect()!;
    expect(after.state.presentation.film.top).toBe(10);
    expect(after.sequence).toBe(before.sequence); expect(after.token).toEqual(before.token);
    expect(after.status).toBe(before.status); expect(after.state.progress).toEqual(before.state.progress);
    expect(fixture.getWrites()).toBe(writes); expect(notifications).toBe(committed);
  });

  it('validates input without changing its variable, then interpolates the accepted value', async () => {
    const fixture = setup(), inputId = id(895), variableId = id(896);
    fixture.snapshot.variables.push({ id: variableId, name: '名字', type: 'string', scope: 'progress', initial: '' });
    fixture.snapshot.scenes[0]!.instructions.unshift({ statementId: inputId, opcode: 'getUserInput', specVersion: '0.1.0',
      condition: null, continuation: 'wait', skippable: false,
      args: { variableId, prompt: '名字', defaultText: '', allowEmpty: false, maxLength: 3, pattern: '[A-Z]+',
        validation: { kind: 'literal', value: true }, errorText: '请输入英文名字', cancelTarget: null },
      source: { documentId: FixtureIds.streetDocument, statementId: inputId, revision: 1 } });
    (fixture.snapshot.scenes[0]!.instructions[1]!.args as { text: string }).text = `你好 {{progress["${variableId}"]}}`;
    const started = await ready(fixture, scenario(fixture.snapshot, FixtureIds.street, inputId)); expect(started.ok).toBe(true); if (!started.ok) return;
    const token = started.value.token!;
    const invalid = await fixture.controller.dispatch({ kind: 'input', token, text: 'abc' }); expect(invalid.ok).toBe(false);
    expect(fixture.controller.inspect()?.state.progress[variableId]).toBe('');
    const accepted = await fixture.controller.dispatch({ kind: 'input', token, text: 'ANN' }); expect(accepted.ok).toBe(true);
    expect(fixture.controller.inspect()?.state.progress[variableId]).toBe('ANN');
    expect(fixture.controller.inspect()?.state.presentation.text.text).toContain('ANN');
  });

  it('classifies changed current dialogue, future statements, executed control and plugin lock', async () => {
    const fixture = setup(); const first = await ready(fixture); expect(first.ok).toBe(true);
    const current = structuredClone(fixture.snapshot);
    (current.scenes[0]!.instructions[0]!.args as { text: string }).text = '修改正文';
    expect(unwrap(fixture.controller.classifyUpdate({ newSnapshot: current })).kind).toBe('currentLine');
    const changedControl = structuredClone(fixture.snapshot);
    (changedControl.scenes[0]!.instructions[0]!.args as { append: boolean }).append = true;
    expect(unwrap(fixture.controller.classifyUpdate({ newSnapshot: changedControl })).kind).toBe('rebuild');
    const future = structuredClone(fixture.snapshot);
    (future.scenes[0]!.instructions[1]!.args as { text: string }).text = '未来正文';
    expect(unwrap(fixture.controller.classifyUpdate({ newSnapshot: future })).kind).toBe('future');
    const plugin = structuredClone(fixture.snapshot);
    plugin.lock.plugins.push({ kind: 'plugin', id: 'org.galcraft.test', version: '0.1.0', required: false, targets: ['web'] });
    expect(unwrap(fixture.controller.classifyUpdate({ newSnapshot: plugin })).kind).toBe('newSession');
  });

  it('rebuilds combined executed and current changes from a checkpoint before the first changed step', async () => {
    const fixture = setup(); unwrap(await ready(fixture));
    await completeSay(fixture.controller);
    const current = fixture.controller.inspect()!;
    const checkpoints = fixture.controller.checkpointsFor(current.sessionId);
    const firstCheckpoint = checkpoints.find(item => item.executed.length === 1)!;
    const changed = structuredClone(fixture.snapshot);
    (changed.scenes[0]!.instructions[0]!.args as { text: string }).text = '旧句修改';
    (changed.scenes[0]!.instructions[1]!.args as { text: string }).text = '当前句修改';
    const plan = unwrap(fixture.controller.classifyUpdate({ newSnapshot: changed }));
    expect(plan.kind).toBe('rebuild'); expect(plan.checkpointId).toBeNull();
    const later = structuredClone(fixture.snapshot);
    (later.scenes[0]!.instructions[1]!.args as { text: string }).text = '当前句修改';
    (later.scenes[0]!.instructions[2]!.args as { options: unknown[] }).options = [];
    const laterPlan = unwrap(fixture.controller.classifyUpdate({ newSnapshot: later }));
    expect(laterPlan.kind).toBe('rebuild'); expect(laterPlan.checkpointId).toBe(firstCheckpoint.id);
    const structure = structuredClone(fixture.snapshot);
    structure.scenes[0]!.scene.locals.push({ id: id(919), name: '新局部值', type: 'number', scope: 'local', initial: 1 });
    expect(unwrap(fixture.controller.classifyUpdate({ newSnapshot: structure })).kind).toBe('rebuild');
  });

  it('uses only checkpoints from the active route when classifying an update', async () => {
    const fixture = setup(), plan = scenario(fixture.snapshot);
    plan.initialProgress[FixtureIds.relation] = 20;
    const prepared = unwrap(await fixture.controller.prepareSession({ snapshot: fixture.snapshot,
      domain: { projectId: fixture.snapshot.projectId, kind: 'playtest', instance: 'route-b' },
      source: { kind: 'entry', scenario: plan },
      target: { sceneId: FixtureIds.street, statementId: FixtureIds.statements[1]! } }));
    unwrap(await ready(fixture));
    const routeACheckpoint = fixture.controller.checkpointsFor(fixture.controller.inspect()!.sessionId)[0]!;
    unwrap(fixture.controller.activate(prepared.id));
    const routeBCheckpoints = fixture.controller.checkpointsFor(prepared.sessionId);
    expect(routeBCheckpoints).toHaveLength(2);
    expect(routeBCheckpoints.every(item => item.state.progress[FixtureIds.relation] === 20)).toBe(true);
    expect(routeBCheckpoints.some(item => item.id === routeACheckpoint.id)).toBe(false);
    const changed = structuredClone(fixture.snapshot);
    (changed.scenes[0]!.instructions[1]!.args as { text: string }).text = '当前句修改';
    (changed.scenes[0]!.instructions[2]!.args as { options: unknown[] }).options = [];
    const update = unwrap(fixture.controller.classifyUpdate({ newSnapshot: changed }));
    expect(update.kind).toBe('rebuild');
    expect(update.checkpointId).toBe(routeBCheckpoints[0]!.id);
  });
});


describe('Studio unique route preparation', () => {
  const prepare = (fixture: ReturnType<typeof setup>, target: DebugScenario['target'], plan = scenario(fixture.snapshot)) => fixture.controller.prepareSession({
    snapshot: fixture.snapshot, domain: { projectId: fixture.snapshot.projectId, kind: 'sample', instance: 'unique-route' },
    source: { kind: 'entry', scenario: plan }, target, evaluateTarget: true, routePolicy: 'unique',
  });
  const bookTarget = { sceneId: FixtureIds.bookshop, statementId: FixtureIds.statements[4]! };
  const options = (fixture: ReturnType<typeof setup>) => fixture.snapshot.scenes[0]!.instructions.find(i => i.opcode === 'choose')!.args as { options: { id: string; target: { sceneId: string; labelId: string | null }; enabled?: unknown }[]; previewDefault: string | null };
  it('proves the only reachable choice and matches an explicit replay without writes', async () => {
    const fixture = setup(); const automatic = unwrap(await prepare(fixture, bookTarget));
    expect(automatic.reached).toBe(true);expect(automatic.routePreparation?.kind).toBe('automatic');
    expect(automatic.state.route.map(r=>r.optionId)).toEqual([FixtureIds.chooseBookshop]);
    const plan=scenario(fixture.snapshot);plan.route=automatic.state.route;
    const explicit=unwrap(await prepare(fixture,bookTarget,plan));
    expect(explicit.state.presentation).toEqual(automatic.state.presentation);expect(explicit.state.progress).toEqual(automatic.state.progress);
    expect(explicit.routePreparation?.kind).toBe('selected');expect(fixture.getWrites()).toBe(0);expect(fixture.controller.inspect()).toBeNull();
  });
  it('does not take the authored default or first branch when two routes reach the target',async()=>{
    const fixture=setup(),choice=options(fixture);choice.options[0]!.target={sceneId:FixtureIds.bookshop,labelId:null};choice.previewDefault=FixtureIds.chooseBookshop;
    const prepared=unwrap(await prepare(fixture,bookTarget));expect(prepared.reached).toBe(false);expect(prepared.routePreparation?.kind).toBe('choice');
    expect(prepared.routePreparation?.candidateOptionIds).toEqual([FixtureIds.chooseStreet,FixtureIds.chooseBookshop]);expect(prepared.state.route).toEqual([]);
  });
  it('uses the runtime call stack and implicit return before choosing the sole path',async()=>{
    const fixture=setup(),instructions=fixture.snapshot.scenes[0]!.instructions;
    const index=instructions.findIndex(i=>i.statementId===FixtureIds.statements[2]);
    instructions.splice(index,0,{...structuredClone(instructions[0]!),statementId:id(7001),opcode:'callScene',continuation:'continue',args:{sceneId:FixtureIds.bookshop,labelId:null,parameters:{},receiver:null}});
    const prepared=unwrap(await prepare(fixture,{sceneId:FixtureIds.street,statementId:FixtureIds.statements[2]!}));
    expect(prepared.reached).toBe(true);expect(prepared.state.route[0]?.optionId).toBe(FixtureIds.chooseStreet);expect(prepared.state.frames).toHaveLength(1);
  });
  it('keeps cycles unknown and never chooses another route because a search limit ran out',async()=>{
    const fixture=setup(),instructions=fixture.snapshot.scenes[0]!.instructions;
    instructions.splice(4,0,{...structuredClone(instructions[0]!),statementId:id(7002),opcode:'jumpLabel',continuation:'continue',args:{labelId:FixtureIds.streetLabel}});
    const prepared=unwrap(await prepare(fixture,bookTarget));expect(prepared.reached).toBe(false);expect(prepared.routePreparation?.kind).toBe('unknown');expect(prepared.state.route).toEqual([]);
  });
  const dialogueChoiceLoop = () => {
    const fixture = setup(), entry = fixture.snapshot.scenes[0]!;
    const dialogue = structuredClone(entry.instructions.find(item => item.opcode === 'say')!);
    const choice = structuredClone(entry.instructions.find(item => item.opcode === 'choose')!);
    entry.instructions = [dialogue, choice];
    (choice.args as { options: { target: { sceneId: string; labelId: string | null } }[] }).options[0]!.target = { sceneId: entry.scene.id, labelId: null };
    return { fixture, dialogue, choice };
  };
  it('bounds a dialogue/choice self-loop without accumulating replay history or choosing an exit', async () => {
    const { fixture } = dialogueChoiceLoop(); let instructions = 0;
    const sample = fixture.ports.longTerm.prepareFlowUnlocks;
    fixture.ports.longTerm.prepareFlowUnlocks = input => { instructions++; return sample(input); };
    const prepared = unwrap(await prepare(fixture, bookTarget));
    expect(prepared.reached).toBe(false); expect(prepared.routePreparation?.kind).toBe('unknown');
    expect(prepared.state.route).toEqual([]); expect(instructions).toBeLessThan(20); expect(fixture.getWrites()).toBe(0);
  });
  it('diagnoses a choice occurrence that points to the preceding dialogue and accepts the corrected route', async () => {
    const { fixture, dialogue, choice } = dialogueChoiceLoop(), plan = scenario(fixture.snapshot);
    plan.entry = { sceneId: fixture.snapshot.project.entry.sceneId, statementId: dialogue.statementId };
    plan.route = [{ statementId: choice.statementId, occurrence: 1, optionId: FixtureIds.chooseBookshop }];
    const invalid = await prepare(fixture, bookTarget, plan);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe('ROUTE_OCCURRENCE'); expect(invalid.error.source).toEqual(dialogue.source);
      expect(invalid.error.message).toContain(choice.statementId); expect(invalid.error.message).toContain(dialogue.statementId);
      expect(invalid.error.message).toContain('execution 1'); expect(invalid.error.message).toContain('every instruction');
    }
    const atTarget = await prepare(fixture, plan.entry, plan);
    expect(atTarget.ok).toBe(false);
    if (!atTarget.ok) expect(atTarget.error.code).toBe('ROUTE_OCCURRENCE');
    plan.route[0]!.occurrence = 2;
    const corrected = unwrap(await prepare(fixture, bookTarget, plan));
    expect(corrected.reached).toBe(true); expect(corrected.state.route).toEqual(plan.route); expect(fixture.getWrites()).toBe(0);
  });
  it('replays explicit selections at later loop occurrences', async () => {
    const { fixture, dialogue, choice } = dialogueChoiceLoop(), plan = scenario(fixture.snapshot);
    plan.entry = { sceneId: fixture.snapshot.project.entry.sceneId, statementId: dialogue.statementId };
    plan.route = [{ statementId: choice.statementId, occurrence: 2, optionId: FixtureIds.chooseStreet },
      { statementId: choice.statementId, occurrence: 4, optionId: FixtureIds.chooseBookshop }];
    const prepared = unwrap(await prepare(fixture, bookTarget, plan));
    expect(prepared.reached).toBe(true); expect(prepared.state.route).toEqual(plan.route); expect(fixture.getWrites()).toBe(0);
  });
  it('continues a finite choice loop when its controlling variable changes', async () => {
    const { fixture, dialogue, choice } = dialogueChoiceLoop(), entry = fixture.snapshot.scenes[0]!;
    fixture.snapshot.variables.find(variable => variable.id === FixtureIds.relation)!.initial = 0;
    entry.instructions.splice(1, 0, { ...dialogue, statementId: id(7010), opcode: 'setVar', continuation: 'continue',
      args: { variableId: FixtureIds.relation, value: 1, op: 'add' } });
    const choices = (choice.args as { options: { enabled?: unknown }[] }).options;
    const counter = { kind: 'variable', scope: 'progress', id: FixtureIds.relation };
    choices[0]!.enabled = { kind: 'binary', op: '<', left: counter, right: { kind: 'literal', value: 2 } };
    choices[1]!.enabled = { kind: 'binary', op: '>=', left: counter, right: { kind: 'literal', value: 2 } };
    const prepared = unwrap(await prepare(fixture, bookTarget));
    expect(prepared.reached).toBe(true); expect(prepared.state.progress[FixtureIds.relation]).toBe(2);
    expect(prepared.state.route.map(item => item.occurrence)).toEqual([3, 6]); expect(fixture.getWrites()).toBe(0);
  });
  it('does not invent player input; supplied input is replayed and validated',async()=>{
    const fixture=setup(),input=id(7003),variable=id(7004),instructions=fixture.snapshot.scenes[1]!.instructions;
    fixture.snapshot.variables.push({id:variable,name:'name',scope:'progress',type:'string',initial:''});
    instructions.unshift({...structuredClone(instructions[0]!),statementId:input,opcode:'getUserInput',args:{variableId:variable,prompt:'name',defaultText:'',allowEmpty:false,maxLength:5,pattern:'.+',validation:true,cancelTarget:null}});
    const plan=scenario(fixture.snapshot);plan.route=[{statementId:FixtureIds.choice,occurrence:3,optionId:FixtureIds.chooseBookshop}];
    const blocked=unwrap(await prepare(fixture,bookTarget,plan));expect(blocked.reached).toBe(false);expect(blocked.routePreparation?.kind).toBe('input');
    plan.playerInputs=[{statementId:input,occurrence:4,text:'春'}];const prepared=unwrap(await prepare(fixture,bookTarget,plan));expect(prepared.reached).toBe(true);expect(prepared.state.progress[variable]).toBe('春');expect(fixture.getWrites()).toBe(0);
  });
  it('keeps a plugin branch unknown without speculatively executing its command',async()=>{
    const fixture=setup(),key='org.example.route/probe';let calls=0;
    fixture.ports.contributions.commands.push({spec:{...CoreCommandSpecs[0]!,key},execute:async()=>{calls++;return {ok:true,value:{progress:{},longTermDelta:null,presentation:null,wait:null,result:null},warnings:[]};}});
    const instructions=fixture.snapshot.scenes[0]!.instructions;
    instructions.splice(4,0,{...structuredClone(instructions[0]!),statementId:id(7005),opcode:key,args:{}});
    const prepared=unwrap(await prepare(fixture,bookTarget));expect(prepared.reached).toBe(false);expect(prepared.routePreparation?.kind).toBe('unknown');expect(calls).toBe(0);expect(fixture.getWrites()).toBe(0);
  });
  it('invalidates a remembered option when conditions change',async()=>{
    const fixture=setup(),choice=options(fixture);choice.options[1]!.enabled={kind:'literal',value:false};
    const plan=scenario(fixture.snapshot);plan.route=[{statementId:FixtureIds.choice,occurrence:3,optionId:FixtureIds.chooseBookshop}];
    const prepared=unwrap(await prepare(fixture,bookTarget,plan));expect(prepared.reached).toBe(false);expect(prepared.routePreparation?.kind).toBe('invalid');
  });
});

describe('PG gallery state',()=>{
  it('unlocks only explicit stable differences and preserves them across another new game',async()=>{
    const fixture=setup();const snapshot=fixture.snapshot,entryId=id(0xfa1),first=id(0xfa2),second=id(0xfa3),added=id(0xfa4);
    snapshot.gallery=[{id:entryId,kind:'cg',name:'CG',series:'A',order:0,cover:null,assets:[],lockedView:'placeholder',differences:[first,second,added].map((id,index)=>({id,assetId:FixtureIds.background,name:`${index}`,order:index}))}];
    const base=snapshot.scenes[0]!.instructions[0]!;snapshot.scenes[0]!.instructions=[{...base,opcode:'unlockCg',continuation:'continue',args:{entryId,differenceIds:[first,second]}},{...base,statementId:id(0xfa5),opcode:'end',continuation:'continue',args:{endingId:'route-a',target:{kind:'title'},durationMs:0}}];
    expect((await ready(fixture)).ok).toBe(true);expect(fixture.getLongTerm().cg[entryId]).toEqual([first,second]);expect(fixture.getLongTerm().cg[entryId]).not.toContain(added);expect(fixture.getLongTerm().endings).toEqual(['route-a']);
    expect((await ready(fixture)).ok).toBe(true);expect(fixture.getLongTerm().cg[entryId]).toEqual([first,second]);expect(fixture.getLongTerm().endings).toEqual(['route-a']);
  });
  it('does not publish a media unlock when presentation did not actually start',async()=>{
    const fixture=setup();const entryId=id(0xfb1);fixture.ports.onCommitted=()=>({presentationEntered:true,mediaStarted:false});
    fixture.snapshot.gallery=[{id:entryId,kind:'music',name:'Music',series:'A',order:0,cover:null,assets:[FixtureIds.background],lockedView:'placeholder'}];
    fixture.snapshot.scenes[0]!.instructions[0]={...fixture.snapshot.scenes[0]!.instructions[0]!,opcode:'bgm',continuation:'continue',args:{op:'play',galleryId:entryId}};
    expect((await ready(fixture)).ok).toBe(true);expect(fixture.getLongTerm().music).toEqual([]);
  });
  it('records a retried actual media start once and keeps failed endings closed until retry',async()=>{
    const fixture=setup();fixture.ports.onCommitted=()=>({presentationEntered:false,mediaStarted:false});const base=fixture.snapshot.scenes[0]!.instructions[0]!,entryId=id(0xfc1);
    fixture.snapshot.gallery=[{id:entryId,kind:'video',name:'Video',series:'A',order:0,assets:[FixtureIds.background],cover:null,lockedView:'placeholder'}];
    fixture.snapshot.scenes[0]!.instructions=[{...base,opcode:'video',args:{galleryId:entryId}},{...base,statementId:id(0xfc2),opcode:'end',args:{endingId:'saved',target:{kind:'title'},durationMs:0}}];
    unwrap(await ready(fixture));const token=fixture.controller.inspect()!.token!;expect(fixture.getLongTerm().video).toEqual([]);
    unwrap(await fixture.controller.confirmMediaStarted(token));unwrap(await fixture.controller.confirmMediaStarted(token));expect(fixture.getLongTerm().video).toEqual([entryId]);const writes=fixture.getWrites();expect(writes).toBe(1);
    fixture.setFailWrites(1);expect((await fixture.controller.dispatch({kind:'animation',token})).ok).toBe(false);expect(fixture.getLongTerm().endings).toEqual([]);expect(fixture.controller.inspect()!.pendingLongTerm).toBe(true);unwrap(await fixture.controller.retryLongTerm());expect(fixture.getLongTerm().endings).toEqual(['saved']);
  });
  it('uses actual elapsed time and excludes an ended session',async()=>{
    const fixture=setup();await ready(fixture);const before=fixture.controller.inspect()!.state.playTimeMs;fixture.controller.elapsePlayTime(1234);expect(fixture.controller.inspect()!.state.playTimeMs).toBe(before+1234);fixture.controller.elapsePlayTime(-10);expect(fixture.controller.inspect()!.state.playTimeMs).toBe(before+1234);
  });
});
