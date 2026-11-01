import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DebugScenario, Flow, PlayerHost, PresentationState, Result, SaveRecord, Snapshot } from '@galcraft/contracts';
import { FixtureIds, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { SessionController } from '@galcraft/runtime';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { PlayerDataService } from './data.js';
import { PlayerLongTermService } from './long-term.js';
import { PlayerView, type PlayerViewOptions } from './view.js';
import { PageNavigator } from './navigation.js';
import { flowLocalContext } from './flow-entries.js';
import { RestoreCoordinator } from './restore.js';
import type { StageController } from '@galcraft/stage';

beforeAll(()=>{vi.stubGlobal('document',{activeElement:null});vi.stubGlobal('requestAnimationFrame',vi.fn(()=>0));});
afterAll(()=>vi.unstubAllGlobals());
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const failure = (): Result<never> => ({ ok: false, error: { code: 'STAGE_FAILED', message: 'Image unavailable', severity: 'error', owner: 'M06', related: [], actions: ['retry'] }, issues: [] });
type Harness = {
  newGame(name?:string,characterId?:string):Promise<void>;cancelInput():Promise<void>;load(id:string):Promise<void>;
  askingName:boolean;inputDraft:string;
  enterFlow(id: string): Promise<void>; returnTitle(confirmation?: boolean): Promise<boolean>; flow(): void;
  save(kind: SaveRecord['kind']): Promise<boolean>;
  flowSources: (SaveRecord | null)[]; selectedSave: string | null; flowEntering: boolean;
  ask: ReturnType<typeof vi.fn>; mountPage: ReturnType<typeof vi.fn>; navigation: PageNavigator;
};
async function setup(withName=false) {
  const snapshot: Snapshot = structuredClone(FixtureSnapshot), scene = snapshot.scenes[0]!;
  snapshot.lock.plugins = []; snapshot.pluginDocuments = {};
  if(withName){snapshot.variables.push({id:'NameAA',name:'主角姓名',type:'string',scope:'progress',initial:'玩家'});
    snapshot.project.player.name={characterId:FixtureIds.an,defaultName:'玩家',allowCustom:true,variableId:'NameAA',maxLength:8,promptPolicy:'firstAndAfterCompletion'};}
  const say = scene.instructions.find(instruction => instruction.opcode === 'say')!;
  scene.instructions = [{ ...say, statementId: 'Source', args: { speaker: { kind: 'narrator' }, text: '原剧情' } },
    { ...say, statementId: 'Recall', args: { speaker: { kind: 'narrator' }, text: '独立回想' } }];
  const scenario: DebugScenario = { schemaVersion: 1, id: 'InitAA', name: '作者回想初值', projectId: snapshot.projectId,
    entry: { sceneId: scene.scene.id, statementId: 'Recall' }, target: { sceneId: scene.scene.id, statementId: 'Recall' },
    initialProgress: { [FixtureIds.relation]: 7 }, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate', engineVersion: snapshot.engineVersion,
    pluginVersions: [snapshot.lock.engine, snapshot.lock.template] };
  const node: Flow['nodes'][number] = { id: 'NodeAA', name: '独立回想', x: 0, y: 0, sceneId: scene.scene.id, statementId: 'Recall',
    unlock: { kind: 'literal', value: true }, lockedView: 'locked', entry: { kind: 'initial', debugScenarioId: scenario.id } };
  snapshot.flows = [{ id: 'FlowAA', name: '回想', roots: [node.id], nodes: [node], edges: [] }]; snapshot.flowInitials = [scenario];
  const values = new Map<string, Uint8Array>(); let failWrite = false;
  const host = { target: 'web', storage: { read: async (key: string) => ok(values.get(key) ?? null), commit: async (batch: Parameters<PlayerHost['storage']['commit']>[0]) => {
    if (failWrite) return failure();
    for (const write of batch.writes) values.set(write.key, write.bytes); for (const key of batch.deletes) values.delete(key);
    return ok({ revision: batch.expectedRevision + 1 });
  } } } as unknown as PlayerHost;
  const domain = { projectId: snapshot.projectId, kind: 'player' as const, instance: 'flow-entry' };
  const data = new PlayerDataService(host, domain, 'zh-CN', 'zh-CN'); unwrap(await data.open());
  const longTerm = new PlayerLongTermService(data);
  let stageSessionId: string | null = null, registeredSessionId: string | null = null, stageState: PresentationState;
  const session = new SessionController({ contributions: emptyContributions(), longTerm,
    stage: { prepare: async input => ok({ state: input.state, delta: null }) },
    onCommitted: input => { stageSessionId = registeredSessionId = input.sessionId; stageState = structuredClone(input.state.presentation); return { presentationEntered: true, mediaStarted: false }; } });
  const prepared = unwrap(await session.prepareSession({ snapshot, domain, source: { kind: 'entry', scenario: { ...scenario,
    entry: { sceneId: scene.scene.id, statementId: 'Source' }, initialProgress: { [FixtureIds.relation]: 2 } } }, target: null }));
  unwrap(session.activate(prepared.id)); longTerm.setActiveSession(prepared.sessionId); unwrap(await session.start());
  const preparedStages = new Map<string, { sessionId: string; state: PresentationState }>();
  const stage = { prepareStage: vi.fn(async (sessionId: string, state: PresentationState) => {
    const id = crypto.randomUUID(); preparedStages.set(id, { sessionId, state: structuredClone(state) }); return ok({ id });
  }), commitStage: vi.fn((id: string) => {
    const prepared = preparedStages.get(id)!; stageSessionId = prepared.sessionId; stageState = structuredClone(prepared.state);
    preparedStages.delete(id); return ok(undefined);
  }), discardPrepared: vi.fn(), disposeRetiredStage: vi.fn(),
    capture: () => ok(structuredClone(stageState)), pause: vi.fn(), captureFrame: () => ({ toBlob: (callback: (blob: null) => void) => callback(null) }) };
  const audio = { disposeSession: vi.fn(), setPause: vi.fn() }, onSessionEnd = vi.fn((sessionId: string) => {
    if (registeredSessionId === sessionId) registeredSessionId = null;
  });
  const publishStage = (sessionId: string, previous: string | null) => {
    if (previous) { audio.disposeSession(previous); onSessionEnd(previous); }
    registeredSessionId = sessionId; longTerm.setActiveSession(sessionId);
  };
  const commitSessionStage: PlayerViewOptions['commitSessionStage'] = (id, owner, previous) => {
    const committed = stage.commitStage(id); if (committed.ok) publishStage(owner.sessionId, previous); return committed;
  };
  const restore = new RestoreCoordinator(snapshot, data, session, stage as unknown as StageController);
  restore.subscribe((receipt, previous) => publishStage(receipt.sessionId, previous));
  const view = Object.assign(Object.create(PlayerView.prototype) as Harness, { templateImageIssues: [], flowSources: [], selectedSave: null, flowEntering: false,
    disposed: false, saving: false, transition:{busy:false}, startup: { active: false }, message: { textContent: '' }, operationMessage: '', stageError: null,
    render: vi.fn(), mountPage: vi.fn(), ask: vi.fn(async () => true), navigation: new PageNavigator(),animateNavigation:async(change:()=>void)=>{change();return true;},
    options: { host, data, snapshot, longTerm, session, stage, audio, onSessionEnd, commitSessionStage, restore,
      video: { state: 'idle', returnTitle: vi.fn() }, root: { focus:vi.fn(), setAttribute: vi.fn() }, waitForStage: async () => {}, syncStage: async () => {
        const active = session.inspect();
        return active && registeredSessionId === active.sessionId && stageSessionId === active.sessionId
          ? session.syncPresentation(active.sessionId, stageState) : failure();
      } } as unknown as PlayerViewOptions,
  });
  view.navigation.replace('story', prepared.sessionId); view.navigation.open('flow');
  return { view, snapshot, scenario, session, data, stage, audio, onSessionEnd, rejectWrite: () => { failWrite = true; } };
}
describe('real Player flow actions', () => {
  for (const failWrite of [false, true]) it(`synchronizes an in-story renamed protagonist before afterstory entry${failWrite ? ' and preserves the source when storage fails' : ''}`, async () => {
    const { view, snapshot, session, data, rejectWrite } = await setup(true);
    const scene = snapshot.scenes[0]!, character = snapshot.characters[1]!;
    character.narrativeRole = 'main';
    character.afterstory = { id: 'AfterA', title: '后日谈', entry: snapshot.project.entry,
      initialProgress: { [FixtureIds.relation]: 9 }, unlockEndingIds: ['rename-route'], lockedView: 'locked' };
    const longTerm = data.current()!.longTerm;
    longTerm.endings.push('rename-route'); unwrap(await data.saveLongTerm(longTerm, longTerm.revision));
    scene.instructions.splice(1, 0, { ...scene.instructions[0]!, statementId: 'SetNam', opcode: 'setVar', continuation: 'continue',
      args: { variableId: 'NameAA', op: 'assign', value: '最新名' } });
    await view.newGame('旧名');
    expect((view as unknown as { operationMessage: string }).operationMessage).toBe('');
    for (let step = 0; step < 3 && session.inspect()!.state.progress.NameAA !== '最新名'; step++)
      unwrap(await session.dispatch({ kind: 'advance', token: session.inspect()!.token! }));
    expect(session.inspect()!.state.progress.NameAA).toBe('最新名');
    expect(data.current()!.currentMainStory!.effectiveName).toBe('旧名');
    const source = session.inspect()!.sessionId;
    if (failWrite) rejectWrite();
    await view.newGame(undefined, character.id);
    if (failWrite) {
      expect(session.inspect()!.sessionId).toBe(source);
      expect(session.inspect()!.state.story?.kind).toBe('main');
      expect(data.current()!.currentMainStory!.effectiveName).toBe('旧名');
    } else {
      expect(data.current()!.currentMainStory!.effectiveName).toBe('最新名');
      const saved = unwrap(await data.record(data.current()!.index.continueRecordId!));
      expect(saved!.state.progress.NameAA).toBe('最新名');
      expect(session.inspect()!.state.story?.kind).toBe('afterstory');
      expect(session.inspect()!.state.progress.NameAA).toBe('最新名');
      expect(session.inspect()!.state.progress[FixtureIds.relation]).toBe(9);
    }
  });
  it('confirms the first name, reuses unfinished names, and preserves context through cancellation and failed starts', async () => {
    const {view,data,session,stage,snapshot}=await setup(true);
    await view.newGame();expect(view.askingName).toBe(true);expect(view.inputDraft).toBe('玩家');
    await view.cancelInput();expect(view.navigation.page).toBe('title');expect(data.current()!.currentMainStory).toBeNull();
    await view.newGame('  春👩‍🚀  ');expect(session.inspect()!.state.progress.NameAA).toBe('春👩‍🚀');
    const current=structuredClone(data.current()!.currentMainStory);expect(current).toMatchObject({effectiveName:'春👩‍🚀',completed:false});
    const first=session.inspect()!.sessionId;await view.newGame();expect(session.inspect()!.sessionId).not.toBe(first);
    expect(session.inspect()!.state.progress.NameAA).toBe('春👩‍🚀');
    snapshot.project.player.name!.promptPolicy='always';await view.newGame();expect(view.askingName).toBe(true);expect(view.inputDraft).toBe('玩家');
    await view.cancelInput();expect(data.current()!.currentMainStory).toEqual(current);
    const active=session.inspect()!.sessionId;await view.newGame('   ');await view.newGame('一二三四五六七八九');expect(session.inspect()!.sessionId).toBe(active);
    stage.prepareStage.mockResolvedValueOnce(failure());await view.newGame('新姓名');expect(data.current()!.currentMainStory).toEqual(current);
  });
  it('adopts a restored main save only after success and records completion independently of continue', async () => {
    const {view,data,session,stage,snapshot}=await setup(true);await view.newGame('正篇');
    const record=data.makeRecord({snapshot,inspection:session.inspect()!,kind:'quick'});record.state.progress.NameAA='旧档';
    unwrap(await data.save({kind:'quick',record,expectedIndexRevision:data.current()!.index.revision}));
    stage.prepareStage.mockResolvedValueOnce(failure());await view.load(record.recordId);expect(data.current()!.currentMainStory!.effectiveName).toBe('正篇');
    await view.load(record.recordId);expect(data.current()!.currentMainStory).toMatchObject({effectiveName:'旧档',completed:false});
    await view.save('continue');const continueId=data.current()!.index.continueRecordId;
    for(let i=0;i<5&&session.inspect()!.status!=='ended';i++)unwrap(await session.dispatch({kind:'advance',token:session.inspect()!.token!}));
    expect(session.inspect()!.status).toBe('ended');await view.returnTitle(false);
    expect(data.current()!.currentMainStory).toMatchObject({effectiveName:'旧档',completed:true});expect(data.current()!.index.continueRecordId).toBe(continueId);
    await view.newGame();expect(view.askingName).toBe(true);expect(view.inputDraft).toBe('玩家');
    await view.cancelInput();await view.load(record.recordId);expect(data.current()!.currentMainStory).toMatchObject({effectiveName:'旧档',completed:false});
  });
  it('keeps the previous main context and continue when an activated new session fails to start', async () => {
    const { view, data, session } = await setup(true);
    await view.newGame('原名'); await view.save('continue');
    const current = structuredClone(data.current()!.currentMainStory), continueId = data.current()!.index.continueRecordId;
    vi.spyOn(session, 'start').mockResolvedValueOnce(failure());
    await view.newGame('新名');
    expect(data.current()!.currentMainStory).toEqual(current);
    expect(await view.returnTitle(false)).toBe(true);
    expect(data.current()!.currentMainStory).toEqual(current);
    expect(data.current()!.index.continueRecordId).toBe(continueId);
    expect(unwrap(await data.record(continueId!))!.state.progress.NameAA).toBe('原名');
  });
  it('inherits the main name in temporary recollections and keeps their nested firstUnlock visits temporary', async () => {
    const {view,data,session,snapshot}=await setup(true);await view.newGame('外层');await view.save('continue');
    const before=structuredClone(data.current()!.currentMainStory);
    const first={...structuredClone(snapshot.flows[0]!.nodes[0]!),id:'FirstA',name:'首次位置',entry:{kind:'firstUnlock' as const}};
    snapshot.flows[0]!.nodes.push(first);const longTerm=data.current()!.longTerm,state=structuredClone(session.inspect()!.state);state.progress.NameAA='首次';
    longTerm.flowEntries[first.id]={schemaVersion:1,projectId:snapshot.projectId,nodeId:first.id,state,unlockedAt:new Date().toISOString(),releaseVersion:snapshot.releaseVersion,engineVersion:snapshot.engineVersion,dependencyVersions:[snapshot.lock.engine,snapshot.lock.template]};
    unwrap(await data.saveLongTerm(longTerm,longTerm.revision));view.navigation.open('flow');await view.enterFlow('NodeAA');
    const continueId=data.current()!.index.continueRecordId;
    expect(session.inspect()!.state.progress.NameAA).toBe('外层');view.navigation.open('flow');await view.enterFlow(first.id);
    expect(session.inspect()!.state.progress.NameAA).toBe('首次');expect(data.current()!.currentMainStory).toEqual(before);
    await view.save('continue');expect(data.current()!.index.continueRecordId).toBe(continueId);
    await view.returnTitle(false);expect(session.inspect()!.state.progress.NameAA).toBe('外层');expect(data.current()!.currentMainStory).toEqual(before);
    view.navigation.open('flow');await view.enterFlow(first.id);expect(data.current()!.currentMainStory!.effectiveName).toBe('首次');
  });
  it('opens initial nodes without creating firstUnlock records, saves the current story, and restores it after returning', async () => {
    const { view, session, data, stage, audio } = await setup(), before = structuredClone(session.inspect());
    view.flow(); expect(view.mountPage.mock.calls[0]![0].props.unlocked.has('NodeAA')).toBe(true);
    expect(view.mountPage.mock.calls[0]![0].props.entryDescription('NodeAA')).toContain('独立初值');
    await view.enterFlow('NodeAA');
    expect(session.inspect()!.sessionId).not.toBe(before!.sessionId);
    expect(session.inspect()!.state.position.statementId).toBe('Recall'); expect(session.inspect()!.state.progress[FixtureIds.relation]).toBe(7);
    const saved = unwrap(await data.record(data.current()!.index.continueRecordId!))!;
    expect(saved.state.position).toEqual(before!.state.position); expect(saved.state.progress[FixtureIds.relation]).toBe(2);
    expect(data.current()!.longTerm.flowEntries).toEqual({}); expect(audio.disposeSession).toHaveBeenCalledWith(before!.sessionId);
    expect(stage.commitStage).toHaveBeenCalledOnce();
    expect(await view.save('quick')).toBe(true);
    const recallSave = unwrap(await data.record(view.selectedSave!))!;
    expect(recallSave.state.position.statementId).toBe('Recall'); expect(recallSave.state.progress[FixtureIds.relation]).toBe(7);
    expect(recallSave.history).toEqual(session.inspect()!.history);
    expect(await view.returnTitle(false)).toBe(true);
    expect(session.inspect()!.state.position).toEqual(before!.state.position); expect(session.inspect()!.state.progress[FixtureIds.relation]).toBe(2);
    expect(session.inspect()!.history).toEqual(before!.history); expect(view.flowSources).toEqual([]);
    expect(data.current()!.index.continueRecordId).toBe(saved.recordId);
    expect(await view.save('quick')).toBe(true);
    const returnSave = unwrap(await data.record(view.selectedSave!))!;
    expect(returnSave.state).toEqual(session.inspect()!.state); expect(returnSave.history).toEqual(before!.history);
    unwrap(await session.dispatch({ kind: 'advance', token: session.inspect()!.token! }));
    unwrap(await session.dispatch({ kind: 'advance', token: session.inspect()!.token! }));
    expect(session.inspect()!.state.position.statementId).toBe('Recall');
  });
  it('retains the old session when the player cancels, the continue save fails, or stage preparation fails', async () => {
    for (const mode of ['cancel', 'save', 'stage']) {
      const { view, session, stage, audio, rejectWrite } = await setup(), before = structuredClone(session.inspect());
      if (mode === 'cancel') view.ask.mockResolvedValue(false);
      if (mode === 'save') rejectWrite();
      if (mode === 'stage') stage.prepareStage.mockResolvedValue(failure());
      await view.enterFlow('NodeAA');
      expect(session.inspect()).toEqual(before); expect(view.flowSources).toEqual([]);
      expect(audio.disposeSession).not.toHaveBeenCalled(); expect(stage.commitStage).not.toHaveBeenCalled();
    }
  });
  it('keeps the active recollection and return record when returning is cancelled or cannot prepare its stage', async () => {
    for (const mode of ['cancel', 'stage']) {
      const { view, session, stage } = await setup();
      await view.enterFlow('NodeAA');
      const before = structuredClone(session.inspect()), sources = structuredClone(view.flowSources);
      if (mode === 'cancel') view.ask.mockResolvedValue(false);
      else stage.prepareStage.mockResolvedValueOnce(failure());
      expect(await view.returnTitle()).toBe(false);
      expect(session.inspect()).toEqual(before); expect(view.flowSources).toEqual(sources);
      expect(await view.save('quick')).toBe(true);
    }
  });
  it('leaves firstUnlock restoration on its real record and does not re-evaluate a persisted unlock', async () => {
    const { view, snapshot, data, session } = await setup(), node = snapshot.flows[0]!.nodes[0]!;
    node.entry = { kind: 'firstUnlock' }; node.unlock = { kind: 'literal', value: false }; delete snapshot.flowInitials;
    const state = structuredClone(session.inspect()!.state), current = data.current()!.longTerm;
    current.flowEntries[node.id] = { schemaVersion: 1, projectId: snapshot.projectId, nodeId: node.id, state, unlockedAt: new Date().toISOString(),
      releaseVersion: snapshot.releaseVersion, engineVersion: snapshot.engineVersion, dependencyVersions: [snapshot.lock.engine, snapshot.lock.template] };
    unwrap(await data.saveLongTerm(current, current.revision));
    view.flow(); const props = view.mountPage.mock.calls[0]![0].props;
    expect(props.unlocked.has(node.id)).toBe(true); expect(props.entryDescription(node.id)).toContain('原剧情');
    expect(props.entryDescription(node.id)).toContain('首次解锁回访位置');
    const previousSessionId = session.inspect()!.sessionId;
    await view.enterFlow(node.id);
    expect(session.inspect()!.sessionId).not.toBe(previousSessionId);
    expect(session.inspect()!.state).toEqual(state); expect(session.inspect()!.history).toEqual([]);
    expect(await view.save('quick')).toBe(true);
    const restoredSave = unwrap(await data.record(view.selectedSave!))!;
    expect(restoredSave.state).toEqual(state); expect(restoredSave.history).toEqual([]);
  });
  it('re-evaluates an independent initial from current long-term data without storing a permanent unlock', async () => {
    const { view, snapshot, data } = await setup(), node = snapshot.flows[0]!.nodes[0]!;
    snapshot.variables.push({ id: 'OpenAA', name: '回想开放', scope: 'longTerm', type: 'boolean', initial: false });
    node.unlock = { kind: 'variable', scope: 'longTerm', id: 'OpenAA' };
    const available = () => { view.flow(); return view.mountPage.mock.calls.at(-1)![0].props.unlocked.has(node.id); };
    expect(available()).toBe(false);
    for (const value of [true, false]) {
      const current = data.current()!.longTerm; current.variables.OpenAA = { value, updatedAt: new Date().toISOString() };
      unwrap(await data.saveLongTerm(current, current.revision)); expect(available()).toBe(value);
    }
    expect(data.current()!.longTerm.flowEntries).toEqual({});
  });
  it('checks scene locals only in their declared top frame', async () => {
    const { snapshot, session } = await setup(), node = snapshot.flows[0]!.nodes[0]!;
    snapshot.scenes[1]!.scene.locals = [{ id: 'LocalA', name: 'local', type: 'boolean', scope: 'local', initial: true }];
    node.unlock = { kind: 'variable', scope: 'local', id: 'LocalA' };
    expect(flowLocalContext(snapshot, node, null)).toBe(false);
    expect(flowLocalContext(snapshot, node, session.inspect()!.state)).toBe(false);
    const state = structuredClone(session.inspect()!.state); state.frames.at(-1)!.sceneId = snapshot.scenes[1]!.scene.id;
    expect(flowLocalContext(snapshot, node, state)).toBe(true);
  });
});
