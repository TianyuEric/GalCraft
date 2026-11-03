import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerHost, Result } from '@galcraft/contracts';
import { FixtureSaveRecord, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import type { RuntimePorts, SessionController } from '@galcraft/runtime';
import type { StageController } from '@galcraft/stage';
import type { LoadReceipt } from './restore.js';
import type { PlayerViewOptions } from './view.js';

const mocks = vi.hoisted(() => ({
  ports: null as RuntimePorts | null,
  inspection: null as ReturnType<SessionController['inspect']>,
  viewOptions: null as PlayerViewOptions | null,
  restored: null as ((receipt: LoadReceipt, previous: string | null) => void) | null,
  stageError: vi.fn(),
  prepare: vi.fn<StageController['prepareStage']>(),
  commit: vi.fn<StageController['commitStage']>(),
  capture: vi.fn<StageController['capture']>(),
  sync: vi.fn<SessionController['syncPresentation']>(),
  discard: vi.fn(),
  audioPlay: vi.fn(),
  audioDispose: vi.fn(),
  replayVoice: vi.fn(),
  confirmPresentation: vi.fn(),
  confirmMedia: vi.fn(),
  outputMuted: vi.fn(),
  frame: null as FrameRequestCallback | null,
  videoState: 'idle' as 'idle' | 'playing' | 'error',
  videoStart: vi.fn(),
  navigation: { page: 'story', replace: vi.fn() },
  videoElement: null as { hidden: boolean } | null,
  videoCompletion: null as null | ((completion: {token: import('@galcraft/contracts').ExecutionToken;processId:string;outcome:'completed';issue:null}) => void),
  dispatch: vi.fn(),
  videoHandoff: vi.fn(),
  showError: vi.fn(),
}));
vi.mock('@galcraft/runtime', async importOriginal => ({ ...await importOriginal<typeof import('@galcraft/runtime')>(),
  SessionController: class { constructor(ports: RuntimePorts) { mocks.ports = ports; } inspect() { return mocks.inspection; } syncPresentation = mocks.sync; replayVoice = mocks.replayVoice;
    inspectActivity() { const current = mocks.inspection; return current && { sessionId: current.sessionId, sequence: current.sequence,
      token: current.token, status: current.status, pendingLongTerm: current.pendingLongTerm, waitKind: current.state.wait?.kind ?? null }; }
    dispatch = mocks.dispatch; confirmPresentationEntered = mocks.confirmPresentation; confirmMediaStarted = mocks.confirmMedia;
    activate(){return {ok:true,value:mocks.inspection,warnings:[]};} setPreviewPaused(){}
    async updateTextProgress(){const current=mocks.inspection!;await mocks.ports!.onCommitted!({sessionId:current.sessionId,token:current.token!,state:current.state,sequence:2,delta:null});return {ok:true,value:undefined,warnings:[]};}
  },
}));
vi.mock('@galcraft/stage', async importOriginal => ({ ...await importOriginal<typeof import('@galcraft/stage')>(),
  StageController: class { static async create() { return { prepareStage: mocks.prepare, commitStage: mocks.commit,
    discardPrepared: mocks.discard, capture: mocks.capture, setViewport() {}, onCompletion() {}, pause() {}, setVisualPreferences() {}, tick() {} }; } },
  AudioMixer: class { setLevels() {} setDuck() {} silence() {} setPause() {} setOutputMuted=mocks.outputMuted; disposeSession = mocks.audioDispose; play = mocks.audioPlay; stop() {} voiceLevel() { return 0; } voicePCM() {} tick() {} },
  VideoController: class { constructor(_element:unknown,complete:NonNullable<typeof mocks.videoCompletion>){mocks.videoCompletion=complete;} get state() { return mocks.videoState; } start = mocks.videoStart; async setPause() { return { ok: true, value: undefined, warnings: [] }; } returnTitle() {} tick() {} },
}));
vi.mock('./title-media.js', async importOriginal => ({ ...await importOriginal<typeof import('./title-media.js')>(), waitForTitleFrame: async () => {} }));
vi.mock('./view.js', () => ({ PlayerView: class {
  constructor(options: PlayerViewOptions) { mocks.viewOptions = options; }
  async start() {} render() {} showError = mocks.showError; updateMediaFrame() {} navigation = mocks.navigation; setStageError = mocks.stageError;
  completeVideoPresentation = mocks.videoHandoff;
  holdVideoPresentation = () => () => {};
  holdResourcePreparation = () => () => {};
} }));
vi.mock('./restore.js', () => ({ RestoreCoordinator: class {
  subscribe(listener: NonNullable<typeof mocks.restored>) { mocks.restored = listener; }
} }));
import { mountPlayer } from './bootstrap.js';

const success = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
const coreError = 'Cannot load Cubism Core: runtime/live2d/core/live2dcubismcore.js';
const failure = (): Result<never> => ({ ok: false, error: { code: 'STAGE_PREPARE', severity: 'error',
  owner: 'M06', message: coreError, related: [], actions: [] }, issues: [] });

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function setup(preview=false, movie=false) {
  vi.stubGlobal('document', { createElement: (tag: string) => { const element = { append() {}, hidden: false, style: {}, dataset: {}, readyState: 4, paused: false }; if (tag === 'video') mocks.videoElement = element; return element; }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('AudioContext', class { async close() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['complete movie'], { type: 'video/mp4' }))));
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { mocks.frame = frame; return 0; });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  mocks.videoState = 'idle'; mocks.navigation.page = 'story';
  const root = { append() {}, style: {}, querySelectorAll:()=>[], isConnected: true, clientWidth: 1280, clientHeight: 720, classList: { add() {}, remove() {} } } as unknown as HTMLElement;
  const storage: PlayerHost['storage'] = { read: async () => success(null),
    commit: async batch => success({ revision: batch.expectedRevision + 1 }) };
  const host = { target: 'web', storage, subscribeLifecycle: () => () => {}, resources: { resolve: vi.fn(async () => failure()) } } as unknown as PlayerHost;
  const snapshot = structuredClone(FixtureSnapshot); snapshot.project.player.autosave = false;
  const state = structuredClone(FixtureSaveRecord.state); state.presentation.voice = null;
  state.presentation.bgm.stopped = true; state.presentation.ambience = {}; state.wait = null;
  const sessionId = crypto.randomUUID();
  const token = { sessionId, occurrence: state.occurrence, statementId: state.position.statementId! };
  if (movie) {
    snapshot.scenes[0]!.instructions = [{ ...snapshot.scenes[0]!.instructions[0]!, statementId: token.statementId, opcode: 'video', args: { assetId: snapshot.assets[0]!.assetId } }];
    state.wait = { kind: 'animation', processIds: [] };
  }
  mocks.inspection = { sessionId, token, state } as NonNullable<typeof mocks.inspection>;
  mocks.prepare.mockResolvedValue(success({ id: crypto.randomUUID(), sessionId, state: state.presentation,
    restoreKey: null, voiceBinding: null, resources: [] }));
  mocks.commit.mockReturnValue(success(undefined));
  mocks.capture.mockReturnValue(success(state.presentation));
  mocks.sync.mockReturnValue(success(undefined));
  mocks.audioPlay.mockResolvedValue(success(crypto.randomUUID()));
  mocks.replayVoice.mockReturnValue(success(null));
  mocks.confirmPresentation.mockResolvedValue(success(undefined)); mocks.confirmMedia.mockResolvedValue(success(undefined));
  mocks.videoStart.mockImplementation(async () => { mocks.videoState = 'playing'; return success('MovieProcess'); });
  mocks.dispatch.mockResolvedValue(success(undefined)); mocks.videoHandoff.mockResolvedValue(undefined);
  const mounted=await mountPlayer(root,host,snapshot,preview?{projectId:snapshot.projectId,kind:'sample',instance:'VoicePreview'}:undefined);if(!mounted.ok)throw new Error(mounted.error.message);
  const committed = () => mocks.ports!.onCommitted!({ sessionId, sequence: 1, token, state, delta: null });
  return { committed, sessionId, state, token, player:mounted.value, snapshot, host };
}

describe('mounted Player stage diagnostic ownership', () => {
  it('starts the prepared voice after the matching stage finishes preparing', async () => {
    const { sessionId, state, token } = await setup();
    state.presentation.voice = { assetId: 'Voice01', variantId: 'Vari01', statementId: token.statementId, volume: 1, targetObjectId: null };
    let finish!: (result: Awaited<ReturnType<StageController['prepareStage']>>) => void;
    mocks.prepare.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const committed = mocks.ports!.onCommitted!({ sessionId, sequence: 1, token, state,
      delta: { objects: [], effects: [], audio: [], voiceBinding: { token, resolution: {} } as never } });
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(mocks.audioPlay).not.toHaveBeenCalled();
    finish(success({ id: 'Stage01', sessionId, state: state.presentation, restoreKey: null, voiceBinding: null, resources: [] }));
    expect(await committed).toEqual({ presentationEntered: true, mediaStarted: true });
    expect(mocks.audioPlay).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionId, token, bus: 'voice' }));
  });

  it('retains the prepared voice resolution when inspection reveals the full dialogue',async()=>{
    const {player,sessionId,state,token}=await setup(true);
    state.wait={kind:'say'} as typeof state.wait;
    state.presentation.voice={assetId:'Voice01',variantId:'Vari01',statementId:token.statementId,volume:1,targetObjectId:null};
    const binding={token,resolution:{id:'Resol1',source:{documentId:'Doc001'},requestedLocale:'zh-CN',defaultLocale:'zh-CN',attempts:[],selected:{assetId:'Voice01',variantId:'Vari01',locale:'zh-CN',via:'requestedLocale'}}};
    player.setPreviewMuted(true);
    expect((await player.activatePreview({id:'Prep01',sessionId,state,voiceBinding:binding} as never,'inspection')).ok).toBe(true);
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    for(const call of mocks.prepare.mock.calls)expect(call[3]).toEqual(binding);
    expect(mocks.outputMuted).toHaveBeenCalledWith(true);expect(mocks.replayVoice).not.toHaveBeenCalled();
    expect(mocks.stageError.mock.calls.every(([error])=>error===null)).toBe(true);
  });
  it.each(['prepare', 'commit'])('reports %s failure and clears it only after a complete stage commit', async at => {
    const { committed } = await setup();
    if (at === 'prepare') mocks.prepare.mockResolvedValueOnce(failure());
    else mocks.commit.mockReturnValueOnce(failure());
    expect(await committed()).toEqual({ presentationEntered: false, mediaStarted: false });
    expect(mocks.stageError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'STAGE_PREPARE', message: coreError }));
    expect(await committed()).toEqual({ presentationEntered: true, mediaStarted: true });
    expect(mocks.stageError).toHaveBeenLastCalledWith(null);
  });
  it('keeps a failed actual movie entry pending until its real startStoryVideo retry confirms the same target', async () => {
    const { token, state, sessionId, snapshot, host } = await setup(false, true);
    const media = { ...state.presentation.bgm, assetId: snapshot.assets[0]!.assetId, variantId: snapshot.assets[0]!.variantId };
    const failed = await mocks.ports!.onCommitted!({ sessionId, sequence: 1, token, state, delta: { objects: [], effects: [], audio: [{ bus: 'video', id: media.assetId, state: media }] } });
    expect(failed).toEqual({ presentationEntered: false, mediaStarted: false });
    expect(host.resources.resolve).toHaveBeenCalledOnce(); expect(mocks.navigation.replace).toHaveBeenCalledWith('videoError');
    expect(await mocks.ports!.onCommitted!({ sessionId, sequence: 2, token, state, delta: null })).toEqual({ presentationEntered: false, mediaStarted: false });
    expect(mocks.confirmMedia).not.toHaveBeenCalled();
    vi.mocked(host.resources.resolve).mockResolvedValueOnce(success({ uri: 'review://exact-video', mime: 'video/mp4', bytes: 1, rangeSupported: true, release() {} }));
    expect((await mocks.viewOptions!.retryVideo!()).ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith('review://exact-video', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mocks.videoStart).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ token, url: expect.stringMatching(/^blob:/) }));
    expect(mocks.confirmMedia).toHaveBeenCalledExactlyOnceWith(token); expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(await mocks.ports!.onCommitted!({ sessionId, sequence: 3, token, state, delta: null })).toEqual({ presentationEntered: true, mediaStarted: false });
  });
  it('confirms a restored pending text target after its actual prepared stage is published', async () => {
    const { sessionId, state, token } = await setup();
    state.pendingReadStatementId = 'DepartedA'; state.wait = { kind: 'say', textShown: 0, textComplete: false, textAnchor: 0 };
    mocks.restored!({ requestId: crypto.randomUUID(), sessionId, snapshotId: FixtureSnapshot.snapshotId, position: state.position }, null);
    await vi.waitFor(() => expect(mocks.confirmPresentation).toHaveBeenCalledExactlyOnceWith(token));
  });

  it('ignores a failed preparation that finishes after a newer stage has committed', async () => {
    const { committed } = await setup();
    let release!: (result: Awaited<ReturnType<StageController['prepareStage']>>) => void;
    mocks.prepare.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const previous = committed();
    expect(await committed()).toEqual({ presentationEntered: true, mediaStarted: true });
    release(failure()); await previous;
    expect(mocks.stageError).toHaveBeenCalledExactlyOnceWith(null);
  });

  it.each(['prepare', 'commit'])('owns a provider command %s failure as a stage diagnostic', async at => {
    const { sessionId, state, token } = await setup();
    if (at === 'prepare') mocks.prepare.mockResolvedValueOnce(failure());
    else mocks.commit.mockReturnValueOnce(failure());
    const prepared = await mocks.ports!.prepareProviderCommands!({ sessionId, token, state: state.presentation, commands: [] });
    if (prepared.ok) prepared.value.commit();
    expect(mocks.stageError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'STAGE_PREPARE', message: coreError }));
  });

  it.each(['capture', 'sync'])('owns a stage %s failure even outside the frame loop', async at => {
    const { committed } = await setup();
    await committed();
    if (at === 'capture') mocks.capture.mockReturnValueOnce(failure());
    else mocks.sync.mockReturnValueOnce(failure());
    expect((await mocks.viewOptions!.syncStage()).ok).toBe(false);
    expect(mocks.stageError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'STAGE_PREPARE', message: coreError }));
  });

  it('does not restore an old failure after the session has ended', async () => {
    const { committed, sessionId } = await setup();
    let release!: (result: Awaited<ReturnType<StageController['prepareStage']>>) => void;
    mocks.prepare.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const previous = committed();
    mocks.inspection = null;
    mocks.viewOptions!.onSessionEnd(sessionId);
    release(failure()); await previous;
    expect(mocks.stageError).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('clears a prior stage failure when a prepared restore is published', async () => {
    const { committed, sessionId, state } = await setup();
    mocks.prepare.mockResolvedValueOnce(failure());
    await committed();
    expect(mocks.stageError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'STAGE_PREPARE', message: coreError }));
    mocks.restored!({ requestId: crypto.randomUUID(), sessionId, snapshotId: FixtureSnapshot.snapshotId,
      position: state.position }, sessionId);
    expect(mocks.stageError).toHaveBeenLastCalledWith(null);
  });

  it.each(['flow', 'restore'])('captures the new %s session after its prepared stage replaces the old session', async source => {
    const { committed, sessionId, state } = await setup();
    await committed();
    const nextSessionId = crypto.randomUUID(), nextState = structuredClone(state);
    nextState.presentation.bgm.startSec = 12;
    nextState.wait = { kind: 'say' } as typeof nextState.wait;
    const nextToken = { sessionId: nextSessionId, occurrence: nextState.occurrence, statementId: nextState.position.statementId! };
    mocks.inspection = { sessionId: nextSessionId, token: nextToken, state: nextState } as NonNullable<typeof mocks.inspection>;
    mocks.capture.mockReturnValue(success(nextState.presentation));
    if (source === 'flow') {
      expect(mocks.viewOptions!.commitSessionStage('PreparedFlowStage', nextToken, sessionId).ok).toBe(true);
      expect(mocks.commit).toHaveBeenLastCalledWith('PreparedFlowStage', nextToken);
    } else mocks.restored!({ requestId: crypto.randomUUID(), sessionId: nextSessionId, snapshotId: FixtureSnapshot.snapshotId,
      position: nextState.position }, sessionId);
    expect((await mocks.viewOptions!.syncStage()).ok).toBe(true);
    expect(mocks.sync).toHaveBeenLastCalledWith(nextSessionId, nextState.presentation);
    expect(mocks.audioDispose).toHaveBeenCalledWith(sessionId);
    expect(mocks.replayVoice).toHaveBeenCalledOnce();
  });

  it('restores the prepared Flow audio under the new session identity', async () => {
    const { sessionId, state } = await setup(), nextSessionId = crypto.randomUUID();
    const nextState = structuredClone(state), token = { sessionId: nextSessionId, occurrence: state.occurrence, statementId: state.position.statementId! };
    nextState.presentation.bgm.stopped = false; nextState.presentation.bgm.startSec = 12;
    nextState.presentation.ambience = { AmbienceA: { ...nextState.presentation.bgm, startSec: 4 } };
    mocks.inspection = { sessionId: nextSessionId, token, state: nextState } as NonNullable<typeof mocks.inspection>;
    expect(mocks.viewOptions!.commitSessionStage('PreparedFlowStage', token, sessionId).ok).toBe(true);
    expect(mocks.audioPlay).toHaveBeenCalledWith({ sessionId: nextSessionId, bus: 'bgm', state: nextState.presentation.bgm });
    expect(mocks.audioPlay).toHaveBeenCalledWith({ sessionId: nextSessionId, bus: 'ambience', state: nextState.presentation.ambience.AmbienceA });
  });

  it('keeps a failed Flow stage commit unavailable for capture', async () => {
    const { sessionId, state, token } = await setup();
    mocks.viewOptions!.onSessionEnd(sessionId);
    mocks.commit.mockReturnValueOnce(failure());
    expect(mocks.viewOptions!.commitSessionStage('PreparedFlowStage', token, sessionId).ok).toBe(false);
    expect((await mocks.viewOptions!.syncStage()).ok).toBe(false);
    expect(mocks.sync).not.toHaveBeenCalledWith(sessionId, state.presentation);
    expect(mocks.audioDispose).not.toHaveBeenCalled();
  });

  it('opens retry when the HTML video enters error after playback has started', async () => {
    await setup();
    mocks.videoState = 'error';
    mocks.videoElement!.hidden = false;
    mocks.frame!(performance.now());
    expect(mocks.navigation.replace).toHaveBeenCalledWith('videoError');
  });

  it('retains the ending video until dispatch and the view target handoff both complete', async () => {
    const { committed, token } = await setup(); await committed();
    let continueDispatch!: (value: ReturnType<typeof success<void>>) => void, releaseTarget!: () => void;
    mocks.dispatch.mockReturnValueOnce(new Promise(resolve => { continueDispatch = resolve; }));
    mocks.videoHandoff.mockReturnValueOnce(new Promise<void>(resolve => { releaseTarget = resolve; }));
    mocks.videoElement!.hidden = false;
    mocks.videoCompletion!({ token, processId: 'Ending01', outcome: 'completed', issue: null });
    await vi.waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1));
    expect(mocks.videoElement!.hidden).toBe(false); expect(mocks.videoHandoff).not.toHaveBeenCalled();
    continueDispatch(success(undefined)); await vi.waitFor(() => expect(mocks.videoHandoff).toHaveBeenCalledTimes(1));
    expect(mocks.videoElement!.hidden).toBe(false);
    releaseTarget(); await vi.waitFor(() => expect(mocks.videoElement!.hidden).toBe(true));
  });

  it('does not let a completed video hide a presentation that replaced its process', async () => {
    const { committed, token, sessionId } = await setup(); await committed();
    let releaseTarget!: () => void;
    mocks.videoHandoff.mockReturnValueOnce(new Promise<void>(resolve => { releaseTarget = resolve; }));
    mocks.videoElement!.hidden = false;
    mocks.videoCompletion!({ token, processId: 'Opening1', outcome: 'completed', issue: null });
    await vi.waitFor(() => expect(mocks.videoHandoff).toHaveBeenCalledTimes(1));
    expect(mocks.viewOptions!.commitSessionStage('NextPresentation', token, sessionId).ok).toBe(true);
    mocks.videoElement!.hidden = false;
    releaseTarget(); await Promise.resolve(); await Promise.resolve();
    expect(mocks.videoElement!.hidden).toBe(false);
  });

  it.each(['dispatch', 'presentation'])('exposes recovery controls when video %s completion fails', async source => {
    const { committed, token } = await setup(); await committed();
    const remove = vi.spyOn(mocks.viewOptions!.root.classList, 'remove');
    if (source === 'dispatch') mocks.dispatch.mockResolvedValueOnce(failure());
    else mocks.videoHandoff.mockRejectedValueOnce(new Error('Target image failed'));
    mocks.videoElement!.hidden = false;
    mocks.videoCompletion!({ token, processId: 'Ending01', outcome: 'completed', issue: null });
    await vi.waitFor(() => expect(mocks.showError).toHaveBeenCalled());
    expect(remove).toHaveBeenCalledWith('gc-video-active');
    expect(mocks.videoElement!.hidden).toBe(false);
  });
});
