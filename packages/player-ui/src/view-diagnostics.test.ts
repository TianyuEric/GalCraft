import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Id, Issue, OfficialAction, PlayerHost, Result, SaveRecord } from '@galcraft/contracts';
import { FixtureDomains, FixtureSaveRecord, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { PlayerDataService } from './data.js';
import { PlayerView, type PlayerViewOptions } from './view.js';

const success = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
const failure = (message: string): Result<never> => ({ ok: false, error: {
  code: 'STORAGE_FAILED', severity: 'error', owner: 'M07', message, related: [], actions: ['retry'],
}, issues: [] });
const coreError = 'Cannot load Cubism Core: runtime/live2d/core/live2dcubismcore.js';
beforeAll(()=>{vi.stubGlobal('document',{activeElement:null});vi.stubGlobal('requestAnimationFrame',vi.fn(()=>0));});
afterAll(()=>vi.unstubAllGlobals());

type ViewHarness = Pick<PlayerView, 'showError' | 'setStageError' | 'newGame'> & {
  options: PlayerViewOptions;
  message: { textContent: string };
  report(result: Result<unknown>): void;
  save(kind: SaveRecord['kind'], slotId?: Id): Promise<boolean>;
  replayVoice(): Promise<void>;
  returnTitle(confirmation?: boolean): Promise<boolean>;
  exit(): Promise<void>;
  render: ReturnType<typeof vi.fn>;
  showStory: ReturnType<typeof vi.fn>;
  navigation: { replace: ReturnType<typeof vi.fn> };
  saving: boolean;
  pendingConfirm: {retry?():void;resolve(value:boolean):void}|null;
};

async function setup(target: PlayerHost['target'] = 'windows') {
  const values = new Map<string, Uint8Array>();
  const commit = vi.fn<PlayerHost['storage']['commit']>(async batch => {
    for (const item of batch.writes) values.set(item.key, item.bytes);
    for (const key of batch.deletes) values.delete(key);
    return success({ revision: batch.expectedRevision + 1 });
  });
  const close = vi.fn(async () => success(undefined));
  const host = { target, storage: { read: async (key: string) => success(values.get(key) ?? null), commit }, close } as unknown as PlayerHost;
  const data = new PlayerDataService(host, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
  expect((await data.open()).ok).toBe(true);
  const inspection = { sessionId: crypto.randomUUID(), sequence: 1, status: 'active', pendingLongTerm: null as object|null,
    state: structuredClone(FixtureSaveRecord.state), history: structuredClone(FixtureSaveRecord.history), token: null };
  const session = { inspect: vi.fn(() => inspection), dispose: vi.fn(), waitForIdle:vi.fn(async()=>{}), retryLongTerm:vi.fn(async()=>failure('Long-term write failed')), pluginWaitPolicy: () => ({ restorable: true }),
    checkpointsFor: vi.fn((): { state: typeof inspection.state }[] => []), prepareSession: vi.fn(), activate: vi.fn(), start: vi.fn(async () => success(undefined)), replayVoice: vi.fn(() => success(null)) };
  const stage = { capture: vi.fn(() => success(inspection.state.presentation)), pause: vi.fn(),
    captureFrame: vi.fn(() => ({ toBlob: (callback: (blob: null) => void) => callback(null) })), prepareStage: vi.fn(), commitStage: vi.fn() };
  const video = { state: 'idle', returnTitle: vi.fn() };
  // Exercise the real view actions without mounting React or a browser surface.
  const view = Object.assign(Object.create(PlayerView.prototype) as ViewHarness, {
    message: { textContent: '' }, operationMessage: '', templateImageIssues: [], stageError: null, saving: false, disposed: false,
    render: vi.fn(), showStory: vi.fn(), ask: vi.fn(async () => true), navigation: { replace: vi.fn() },
    options: { host, data, snapshot: structuredClone(FixtureSnapshot), session, stage, video,
      root: { focus:vi.fn(), setAttribute: vi.fn(), dataset: {}, dispatchEvent: vi.fn() }, waitForStage: async () => {}, syncStage: async () => success(undefined),
      audio: { disposeSession: vi.fn(), setPause: vi.fn() }, longTerm: { setActiveSession: vi.fn() }, onSessionEnd: vi.fn() } as unknown as PlayerViewOptions,
  });
  const leaveChoices:('cancel'|'retry'|'direct')[]=[];
  Object.assign(view,{open:vi.fn(()=>{const choice=leaveChoices.shift()??'cancel';if(choice==='retry'){const confirmation=vi.spyOn(view as unknown as {finishConfirmation(accepted:boolean):Promise<void>},'finishConfirmation').mockImplementation(async accepted=>{const pending=view.pendingConfirm;view.pendingConfirm=null;pending?.resolve(accepted);});view.pendingConfirm?.retry?.();confirmation.mockRestore();}else view.pendingConfirm?.resolve(choice==='direct');})});
  return { view, data, commit, close, session, stage, video, inspection,leaveChoices };
}

describe('Player stage diagnostics', () => {
  it('keeps the same expanded diagnostic disclosure across ordinary rendering updates',async()=>{
    const {view}=await setup(),originalDocument=globalThis.document;
    class Element {
      children:Element[]=[];dataset:Record<string,string>={};textContent='';open=false;
      constructor(readonly tag:string){}
      append(...children:Element[]){this.children.push(...children);}
      replaceChildren(...children:Element[]){this.children=children;}
      get firstElementChild(){return this.children[0];}
      querySelector(selector:string):Element|null{return this.children.find(child=>selector==='details[data-gc-diagnostic]'?child.tag==='details'&&'gcDiagnostic' in child.dataset:child.tag===selector)??null;}
    }
    try{
      vi.stubGlobal('document',{createElement:(tag:string)=>new Element(tag)});
      const message=new Element('aside');(view as unknown as {message:Element}).message=message;
      (view as unknown as {setTemplateImageIssues(issues:Issue[]):void}).setTemplateImageIssues([{code:'UI_ICON_UNAVAILABLE',severity:'warning',owner:'M08',message:'Image unavailable',related:[{kind:'asset',id:'Asset1'}],actions:['supplyDependency']}]);
      const details=message.querySelector('details[data-gc-diagnostic]')!;details.open=true;
      view.report(success(undefined));
      expect(message.querySelector('details[data-gc-diagnostic]')).toBe(details);expect(details.open).toBe(true);expect(details.querySelector('pre')!.textContent).toContain('Asset1');
    }finally{vi.stubGlobal('document',originalDocument);}
  });
  it('retains a current image diagnostic across successful operations until that image is resolved or removed',async()=>{
    const {view}=await setup(),images=view as unknown as {setTemplateImageIssues(issues:Issue[]):void;inspectDiagnostics():Issue[]};
    const issue:Issue={code:'UI_ICON_UNAVAILABLE',severity:'warning',owner:'M08',message:'Image decode failed',related:[{kind:'asset',id:'Asset1'},{kind:'variant',id:'Variant1'}],actions:['supplyDependency','edit']};
    images.setTemplateImageIssues([issue]);view.report(success(undefined));
    expect(images.inspectDiagnostics()).toContainEqual(issue);expect(view.message.textContent).toContain('UI_ICON_UNAVAILABLE');expect(view.message.textContent).toContain('Variant1');
    view.showError('Save failed');view.report(success(undefined));expect(view.message.textContent).toContain('UI_ICON_UNAVAILABLE');
    images.setTemplateImageIssues([]);expect(images.inspectDiagnostics()).toEqual([]);expect(view.message.textContent).toBe('');
  });
  it('keeps updated control geometry when public visual states reset',async()=>{
    const {view}=await setup();
    const values=new Map([['left',{value:'25%',priority:''}],['color',{value:'blue',priority:''}]]),listeners=new Map<string,()=>void>();
    const style={getPropertyValue:(key:string)=>values.get(key)?.value??'',getPropertyPriority:(key:string)=>values.get(key)?.priority??'',
      setProperty:(key:string,value:string,priority='')=>values.set(key,{value,priority}),removeProperty:(key:string)=>values.delete(key)};
    const element={style,hidden:false,dataset:{gcPart:'settings.slider.thumb',gcComponent:'SliderThumb',gcInstanceRendered:'true'},
      closest:(selector:string)=>selector==='[data-gc-page]'?{dataset:{gcPage:'settings'}}:null,matches:()=>false,
      getAttribute:()=>JSON.stringify([...values]),setAttribute:(_key:string,value:string)=>{values.clear();for(const [key,entry] of JSON.parse(value))values.set(key,entry);},
      addEventListener:(name:string,listener:()=>void)=>listeners.set(name,listener)};
    const component=structuredClone(FixtureSnapshot.template.pages[0]!.root);component.states={hover:{color:'red'}};
    vi.stubGlobal('getComputedStyle',()=>({position:'absolute'}));
    Object.assign(view,{styleElement:{textContent:'',sheet:null},visualEvents:new AbortController(),visualReset:[],partVisibility:new Map([[element,true]]),
      partAnimations:new Map([[element,{interrupt:vi.fn(),play:vi.fn(async()=>{}),cancel:vi.fn()}]]),
      componentById:()=>component,navigation:{page:'settings'},options:{...view.options,root:{querySelectorAll:()=>[element]}}});
    const visual=view as unknown as {applyPublicVisuals(sequence:number):void;visualReset:(()=>void)[]};
    visual.applyPublicVisuals(1);
    style.setProperty('left','100%');listeners.get('pointerenter')!();
    expect(style.getPropertyValue('left')).toBe('100%');expect(style.getPropertyValue('color')).toBe('red');
    listeners.get('pointerleave')!();expect(style.getPropertyValue('left')).toBe('100%');expect(style.getPropertyValue('color')).toBe('blue');
    for(const reset of visual.visualReset)reset();expect(style.getPropertyValue('left')).toBe('100%');
  });
  it('resets only the authored preference paths and rejects values outside the public preference types',async()=>{
    const {view,data}=await setup(),current=data.current()!.preferences;
    expect((await data.savePreferences({...current,textSpeed:88,fontScale:1.5,volumes:{...current.volumes,bgm:12}},current.revision)).ok).toBe(true);
    await(view as unknown as {dispatchPageAction(action:OfficialAction):Promise<void>}).dispatchPageAction({kind:'resetPreferences',paths:['textSpeed','volumes.bgm']});
    expect(data.current()!.preferences).toMatchObject({textSpeed:30,fontScale:1.5,volumes:{bgm:100}});
    const invalid={...data.current()!.preferences,toolbarLocked:'invalid'} as unknown as typeof current;
    expect((await data.savePreferences(invalid,invalid.revision)).ok).toBe(false);
  });
  it('accepts only the active confirmation request and persists its matching remember preference',async()=>{
    const {view,data}=await setup(),id=crypto.randomUUID(),resolved=vi.fn();
    const action=view as unknown as {dispatchPageAction(action:OfficialAction):Promise<void>;finishConfirmation(accepted:boolean,remember:boolean):Promise<void>;pendingConfirm:unknown;transition:unknown;backImmediate:unknown;};
    Object.assign(view,{modalLayers:[],pendingConfirm:{id,message:'Load',confirmation:'load',resolve:resolved},transition:{busy:false,navigate:async(_element:unknown,_exit:unknown,change:()=>void)=>{change();return true;}},backImmediate:vi.fn()});
    await action.dispatchPageAction({kind:'confirm',requestId:crypto.randomUUID(),accepted:true,remember:true});expect(resolved).not.toHaveBeenCalled();
    await action.dispatchPageAction({kind:'confirm',requestId:id,accepted:true,remember:true});
    expect(data.current()!.preferences.confirmations.load).toBe(false);expect(data.current()!.preferences.confirmations.overwrite).toBe(true);expect(resolved).toHaveBeenCalledWith(true);
  });
  it('invokes the installed SDK named action with the repeated item context',async()=>{const{view}=await setup(),invoke=vi.fn(async()=>success({done:true}));view.options.pluginPlatforms=[{key:'org.example.test/external',targets:['windows'],actions:[{name:'ping',fields:[]}],invoke}];await(view as unknown as {instanceAction(action:unknown,context:unknown):Promise<void>}).instanceAction({kind:'plugin',key:'org.example.test/external:ping',arguments:{record:{source:'item',path:'id'}}},{data:{},local:{},item:{id:'Record1'}});expect(invoke).toHaveBeenCalledWith('ping',{record:'Record1'},view.options.data.domain);expect(view.message.textContent).toBe('');});
  it('accepts the first fresh Ctrl press after focus was lost without a keyup', async () => {
    const {view}=await setup();
    vi.stubGlobal('HTMLElement',class {});
    const input=view as unknown as {ctrlDown:boolean;ctrlFast:boolean;loseInputFocus():void;keydown(event:KeyboardEvent):void};
    Object.defineProperty(view,'storyActive',{value:true});input.ctrlDown=true;input.ctrlFast=true;
    input.loseInputFocus();
    expect(input.ctrlFast).toBe(false);
    input.keydown({key:'Control',repeat:false,isComposing:false,target:null,preventDefault:vi.fn()} as unknown as KeyboardEvent);
    expect(input.ctrlFast).toBe(true);
    expect(input.ctrlDown).toBe(true);
  });
  it('synchronizes the current animation phase before replaying with the current voice preference', async () => {
    const { view, session } = await setup();
    const sync = vi.fn(async () => success(undefined)); view.options.syncStage = sync;
    await view.replayVoice();
    expect(session.replayVoice).toHaveBeenCalledOnce();
    expect(sync.mock.invocationCallOrder[0]).toBeLessThan(session.replayVoice.mock.invocationCallOrder[0]!);
    session.replayVoice.mockClear(); view.options.syncStage = async () => failure('Stage not ready');
    await view.replayVoice();
    expect(session.replayVoice).not.toHaveBeenCalled();
    expect(view.message.textContent).toContain('Stage not ready');
    expect(view.message.textContent).toContain('STORAGE_FAILED');
  });
  it('keeps a stage error across ordinary success and transient operation errors', async () => {
    const { view } = await setup();
    view.setStageError(coreError);
    view.report(success(undefined));
    expect(view.message.textContent).toBe(coreError);
    view.showError('Save failed');
    expect(view.message.textContent).toContain('Save failed');
    expect(view.message.textContent).toContain(coreError);
    view.report(success(undefined));
    expect(view.message.textContent).toBe(coreError);
    view.setStageError(null);
    expect(view.message.textContent).toBe('');
    view.showError('An ordinary operation failed');
    view.report(success(undefined));
    expect(view.message.textContent).toBe('');
  });

  it('retains the diagnostic after a successful continue save and clears it on return to title', async () => {
    const { view, data, session, stage } = await setup('web');
    view.setStageError(coreError);
    expect(await view.save('continue')).toBe(true);
    expect(stage.captureFrame).toHaveBeenCalledOnce();
    expect(data.current()!.index.continueRecordId).toBeTruthy();
    expect(view.message.textContent).toBe(coreError);
    expect(await view.returnTitle(false)).toBe(true);
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(view.navigation.replace).toHaveBeenCalledWith('title');
    expect(view.message.textContent).toBe('');
  });

  it('allows Windows exit after a successful save even when the stage has an error', async () => {
    const { view, close, data } = await setup();
    view.setStageError(coreError);
    await view.exit();
    expect(data.current()!.index.continueRecordId).toBeTruthy();
    expect(close).toHaveBeenCalledOnce();
    expect(view.message.textContent).toBe('');
  });

  it('keeps the session when the player cancels leaving after the actual continue save fails', async () => {
    const { view, close, commit, session, data } = await setup();
    commit.mockResolvedValue(failure('Disk write failed'));
    view.setStageError(coreError);
    await view.exit();
    expect(close).not.toHaveBeenCalled();
    expect(session.dispose).not.toHaveBeenCalled();
    expect(view.navigation.replace).not.toHaveBeenCalled();
    expect(data.current()!.index.continueRecordId).toBeNull();
    expect(view.message.textContent).toContain('Disk write failed');
    expect(view.message.textContent).toContain(coreError);
    expect(view.saving).toBe(false);
  });

  it('uses the pre-video checkpoint for exit while preserving ordinary-save rejection', async () => {
    const { view, video, session, stage, inspection, close } = await setup();
    video.state = 'error';
    session.checkpointsFor.mockReturnValue([{ state: inspection.state }]);
    view.setStageError(coreError);
    expect(await view.save('quick')).toBe(false);
    expect(view.message.textContent).toContain('当前演出尚不能捕获');
    await view.exit();
    expect(stage.capture).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(view.message.textContent).toBe('');
  });

  it('keeps the session when the player cancels leaving without a recoverable video checkpoint', async () => {
    const { view, video, close, commit, session } = await setup();
    video.state = 'error';
    view.setStageError(coreError);
    await view.exit();
    expect(commit).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(session.dispose).not.toHaveBeenCalled();
    expect(view.message.textContent).toContain('当前没有可用的退出检查点');
    expect(view.message.textContent).toContain(coreError);
  });

  it('closes the host on explicit direct exit without an opening checkpoint',async()=>{
    const {view,video,close,commit,session,leaveChoices}=await setup();video.state='error';leaveChoices.push('direct');
    await view.exit();expect(close).toHaveBeenCalledOnce();expect(session.dispose).toHaveBeenCalledOnce();expect(commit).not.toHaveBeenCalled();expect(session.waitForIdle).toHaveBeenCalledTimes(2);
  });

  it.each(['windows','web'] as const)('returns to title on explicit direct leave after continue failure in %s',async target=>{
    const {view,commit,data,session,leaveChoices}=await setup(target);
    expect(await view.save('quick')).toBe(true);const original=structuredClone(data.current()!.index);
    commit.mockResolvedValue(failure('Disk write failed'));leaveChoices.push('direct');
    expect(await view.returnTitle(false)).toBe(true);expect(view.navigation.replace).toHaveBeenCalledWith('title');expect(session.dispose).toHaveBeenCalledOnce();expect(data.current()!.index).toEqual(original);
  });

  it('retries the failed continue before a normal exit and keeps existing saves',async()=>{
    const {view,commit,close,data,leaveChoices}=await setup();expect(await view.save('quick')).toBe(true);const quick=data.current()!.index.quick;
    commit.mockResolvedValueOnce(failure('Disk write failed'));leaveChoices.push('retry');await view.exit();expect(close).toHaveBeenCalledOnce();expect(data.current()!.index.quick).toEqual(quick);expect(data.current()!.index.continueRecordId).toBeTruthy();
  });

  it.each(['cancel','direct'] as const)('keeps pending long-term deltas until the player chooses %s',async choice=>{
    const {view,session,inspection,close,commit,leaveChoices}=await setup();vi.spyOn(view as unknown as {renderMessage():void},'renderMessage').mockImplementation(()=>{});inspection.pendingLongTerm={sequence:1};leaveChoices.push('retry',choice);await view.exit();
    expect(session.retryLongTerm).toHaveBeenCalledTimes(2);expect(commit).not.toHaveBeenCalled();expect(close).toHaveBeenCalledTimes(choice==='direct'?1:0);expect(session.dispose).toHaveBeenCalledTimes(choice==='direct'?1:0);if(choice==='cancel')expect(inspection.pendingLongTerm).toEqual({sequence:1});
  });

  it('waits for an in-flight runtime commit before offering direct leave',async()=>{
    const {view,session,inspection,close,leaveChoices}=await setup();vi.spyOn(view as unknown as {renderMessage():void},'renderMessage').mockImplementation(()=>{});let settle!:()=>void;session.waitForIdle.mockImplementationOnce(()=>new Promise<void>(resolve=>{settle=resolve;}));leaveChoices.push('direct');const leaving=view.exit();await vi.waitFor(()=>expect(settle).toBeTypeOf('function'));expect(close).not.toHaveBeenCalled();inspection.pendingLongTerm={sequence:1};settle();await leaving;expect(session.retryLongTerm).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
  });

  it.each(['success','failure'] as const)('waits for a Quick commit %s before continuing the close flow',async outcome=>{
    const {view,commit,close,data,leaveChoices}=await setup();
    let settle!:(value:Awaited<ReturnType<PlayerHost['storage']['commit']>>)=>void;
    commit.mockImplementationOnce(()=>new Promise(resolve=>{settle=resolve;}));
    const saving=view.save('quick');await vi.waitFor(()=>expect(settle).toBeTypeOf('function'));
    if(outcome==='failure'){commit.mockResolvedValue(failure('Disk write failed'));leaveChoices.push('direct');}
    const leaving=view.exit();await Promise.resolve();await Promise.resolve();expect(close).not.toHaveBeenCalled();expect(commit).toHaveBeenCalledOnce();
    settle(outcome==='success'?success({revision:1}):failure('Quick write failed'));
    expect(await saving).toBe(outcome==='success');await leaving;expect(close).toHaveBeenCalledOnce();
    expect(data.current()!.index.quick).toHaveLength(outcome==='success'?1:0);expect(!!data.current()!.index.continueRecordId).toBe(outcome==='success');
  });

  it.each(['success','failure'] as const)('waits for a preference commit %s in the same profile domain',async outcome=>{
    const {view,commit,close,data}=await setup(),preferences=data.current()!.preferences;
    let settle!:(value:Awaited<ReturnType<PlayerHost['storage']['commit']>>)=>void;
    commit.mockImplementationOnce(()=>new Promise(resolve=>{settle=resolve;}));
    const writing=data.savePreferences({...preferences,textSpeed:88},preferences.revision);await vi.waitFor(()=>expect(settle).toBeTypeOf('function'));
    const leaving=view.exit();await Promise.resolve();await Promise.resolve();expect(close).not.toHaveBeenCalled();expect(commit).toHaveBeenCalledOnce();
    settle(outcome==='success'?success({revision:1}):failure('Preference write failed'));await writing;await leaving;
    expect(close).toHaveBeenCalledOnce();expect(data.current()!.preferences.textSpeed).toBe(outcome==='success'?88:preferences.textSpeed);expect(data.current()!.index.continueRecordId).toBeTruthy();
  });

  it.each(['prepare', 'commit'])('clears an old stage error only after new-game %s succeeds', async failureAt => {
    const { view, session, stage, inspection } = await setup();
    view.options.snapshot.project.player.name = null;
    const prepared = { id: crypto.randomUUID(), sessionId: inspection.sessionId, state: inspection.state, voiceBinding: null };
    session.prepareSession.mockResolvedValue(success(prepared));
    session.activate.mockReturnValue(success(inspection));
    stage.prepareStage.mockResolvedValue(failureAt === 'prepare' ? failure(coreError) : success({ id: crypto.randomUUID() }));
    stage.commitStage.mockReturnValue(failure(coreError));
    Object.assign(session, { disposePrepared: vi.fn() });
    view.setStageError('Previous stage failure');
    await view.newGame();
    view.report(success(undefined));
    expect(view.message.textContent).toContain(coreError);
    expect(view.message.textContent).toContain('STORAGE_FAILED');
    stage.prepareStage.mockResolvedValue(success({ id: crypto.randomUUID() }));
    stage.commitStage.mockReturnValue(success(undefined));
    await view.newGame();
    expect(view.message.textContent).toBe('');
    expect(session.start).toHaveBeenCalledOnce();
  });

  it('keeps the retry page when the first video fails before new-game startup returns', async () => {
    const { view, session, stage, inspection, video } = await setup();
    view.options.snapshot.project.player.name = null;
    const prepared = { id: crypto.randomUUID(), sessionId: inspection.sessionId, state: inspection.state, voiceBinding: null };
    session.prepareSession.mockResolvedValue(success(prepared)); session.activate.mockReturnValue(success(inspection));
    stage.prepareStage.mockResolvedValue(success({ id: crypto.randomUUID() })); stage.commitStage.mockReturnValue(success(undefined));
    session.start.mockImplementationOnce(async () => { video.state = 'error'; view.navigation.replace('videoError'); return success(undefined); });
    Object.defineProperty(view, 'storyActive', { value: true });
    const showStory = (PlayerView.prototype as unknown as { showStory(): void }).showStory;
    view.showStory.mockImplementation(() => showStory.call(view));
    await view.newGame();
    expect(view.navigation.replace).toHaveBeenLastCalledWith('videoError');
    expect(view.navigation.replace.mock.calls.filter(call => call[0] === 'story')).toHaveLength(1);
  });
});
