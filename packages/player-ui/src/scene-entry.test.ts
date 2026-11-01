import { afterEach, expect, test, vi } from 'vitest';
import { FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import type { PlayerHost, Transition } from '@galcraft/contracts';
import type { AudioMixer, StageController } from '@galcraft/stage';
import { SceneEntryPresentation } from './scene-entry.js';

afterEach(()=>vi.unstubAllGlobals());
const cut:Transition={preset:'cut',resourceId:null,durationMs:0,easing:{family:'linear',direction:'in'},direction:'left'};
function setup(missing=false,titleOnly=false,oldExit:Transition=cut){
  const draw=vi.fn(),render=vi.fn((_animation:unknown,_timeMs:number)=>element()),dispose=vi.fn(),release=vi.fn();
  function element():HTMLElement & HTMLCanvasElement{return {dataset:{},style:{},children:[],classList:{add(){},remove(){}},append(){},replaceChildren(){},setAttribute(){},addEventListener(){},remove(){},focus(){},getContext:()=>({drawImage:draw,clearRect(){},fillRect(){},save(){},restore(){},translate(){}})} as unknown as HTMLElement & HTMLCanvasElement;}
  vi.stubGlobal('document',{createElement:element});vi.stubGlobal('Image',class {naturalWidth=800;naturalHeight=600;async decode(){}});
  const snapshot=structuredClone(FixtureSnapshot),image=snapshot.assets.find(asset=>asset.kind==='image')!;
  const animation={...image,assetId:'R5anim',kind:'animation' as const};snapshot.assets.push(animation);
  const custom={...cut,preset:'custom' as const,resourceId:missing?'Absent':animation.assetId};
  snapshot.project.chapters=[];snapshot.scenes[0]!.scene.presentation={title:null,interlude:{image:{assetId:image.assetId,variantId:null},voice:null,fit:'contain',holdMs:100,oldStageExit:oldExit,enter:custom,exit:cut,newStageEnter:custom,allowSkip:true}};
  if(titleOnly)snapshot.scenes[0]!.scene.presentation={title:{enabled:true,text:'Title',holdMs:100,enter:custom,exit:cut},interlude:null};
  let unblock!:()=>void;const resourceReady=titleOnly?new Promise<void>(resolve=>{unblock=resolve;}):Promise.resolve();
  const host={resources:{resolve:async()=>{await resourceReady;return{ok:true,value:{uri:'data:application/json,'+encodeURIComponent(JSON.stringify({type:'galcraft.animation',version:1,durationMs:500,tracks:[{path:'/x',mode:'absolute',keyframes:[{timeMs:0,value:100},{timeMs:500,value:0}]}]})),release},warnings:[]};}}} as unknown as PlayerHost;
  const stage={canvas:element(),captureFrame:()=>element(),createSurfaceAnimation:()=>({render,dispose})} as unknown as StageController;
  const entry=new SceneEntryPresentation(element(),host,snapshot,stage,{} as AudioMixer),state=structuredClone(FixtureRuntimeState);
  state.entryPresentation={sceneId:snapshot.scenes[0]!.scene.id,instanceId:'Entry1',completed:false};entry.begin('Sess01',state);
  return{entry,state,render,dispose,release,unblock};
}
test('custom entry waits for its locked animation, uses resource duration and pauses sampled frames',async()=>{
  const{entry,state,render,dispose,release}=setup();await vi.waitFor(()=>expect(entry.currentPhase).toBe('oldStageExit'));
  entry.tick(0);entry.tick(125);expect(entry.currentPhase).toBe('interludeEnter');expect(render.mock.calls.at(-1)?.[1]).toBe(125);
  entry.setPreferences(true,false);entry.tick(800);expect(render.mock.calls.at(-1)?.[1]).toBe(125);
  entry.setPreferences(false,false);entry.tick(375);expect(entry.currentPhase).toBe('holding');
  entry.tick(100);entry.tick(0);const done=entry.enterBody('Sess01',state);await Promise.resolve();expect(entry.currentPhase).toBe('newStageEnter');
  entry.tick(499);expect(entry.active).toBe(true);entry.tick(1);expect((await done).ok).toBe(true);expect(entry.active).toBe(false);expect(dispose).toHaveBeenCalled();expect(release).toHaveBeenCalled();
});
test('an unavailable explicit custom animation stays failed until an explicit skip',async()=>{
  const{entry,state}=setup(true);await vi.waitFor(()=>expect(entry.currentPhase).toBe('failed'));
  entry.tick(1000);expect(entry.currentPhase).toBe('failed');expect(entry.skip(true)).toBe(true);
  expect((await entry.enterBody('Sess01',state)).ok).toBe(true);expect(entry.active).toBe(false);
});
test('retains the source through old-stage exit and reveals the first interlude as it is painted',async()=>{
  const {entry}=setup(false,false,{...cut,preset:'fade',durationMs:200});
  const presented=vi.fn();entry.onVisualReady(presented);
  await vi.waitFor(()=>expect(entry.currentPhase).toBe('oldStageExit'));
  entry.tick(100);expect(presented).not.toHaveBeenCalled();
  entry.tick(100);expect(entry.currentPhase).toBe('interludeEnter');expect(presented).toHaveBeenLastCalledWith(0);
  entry.tick(250);expect(presented).toHaveBeenLastCalledWith(.5);
  entry.tick(250);expect(entry.currentPhase).toBe('holding');expect(presented).toHaveBeenLastCalledWith(1);
  entry.stop();
});
test('a title-only custom resource never blocks body entry, and its late resolution cannot revive an exited title',async()=>{
  const{entry,state,unblock,release}=setup(false,true),presented=vi.fn();entry.onVisualReady(presented);expect((await entry.enterBody('Sess01',state)).ok).toBe(true);expect(entry.active).toBe(false);expect(presented).not.toHaveBeenCalled();
  entry.stop();unblock();await vi.waitFor(()=>expect(release).toHaveBeenCalled());expect(entry.active).toBe(false);
});
test.each([
  {chapter:false,scene:true,expected:['Scene name']},
  {chapter:true,scene:false,expected:['Chapter name']},
  {chapter:true,scene:true,expected:['Chapter name','Scene name']},
])('blank titles retain their owning names: $expected',async({chapter,scene,expected})=>{
  const element=(tag='div'):any=>({tag,dataset:{},style:{},clientWidth:1280,children:[],classList:{add(){},remove(){}},append(...children:any[]){this.children.push(...children);},setAttribute(){},remove(){},getContext:()=>({fillRect(){}})});
  vi.stubGlobal('document',{createElement:element,createElementNS:(_ns:string,tag:string)=>element(tag)});vi.stubGlobal('getComputedStyle',()=>({opacity:'1'}));
  const snapshot=structuredClone(FixtureSnapshot),first=snapshot.scenes[0]!.scene,presentation={title:{enabled:true,text:'',holdMs:200,enter:cut,exit:cut},interlude:null};
  first.name='Scene name';first.presentation=scene?structuredClone(presentation):undefined;snapshot.project.chapters=[{id:first.chapterId,name:'Chapter name',sceneIds:[first.id],...(chapter?{presentation:structuredClone(presentation)}:{})}];
  const state=structuredClone(FixtureRuntimeState);state.entryPresentation={sceneId:first.id,instanceId:'Entry1',completed:false};const root=element();
  const entry=new SceneEntryPresentation(root,{} as PlayerHost,snapshot,{} as StageController,{} as AudioMixer);expect((await entry.enterBody('Sess01',state)).ok).toBe(true);
  expect(root.children[0].children.filter((child:any)=>child.tag==='span'||child.tag==='strong').map((child:any)=>child.textContent)).toEqual(expected);entry.stop();
});
test.each([
  ['春夜.第二乐章.OGG','春夜.第二乐章'],['春夜.mp3','春夜'],['春夜','春夜'],['春夜.live','春夜.live'],
])('BGM notice presents the title of %s without changing its asset identity',(name,expected)=>{
  const children:any[]=[],element=()=>({dataset:{},style:{},setAttribute(){},remove(){}});
  vi.stubGlobal('document',{createElement:element});
  const snapshot=structuredClone(FixtureSnapshot),asset=snapshot.assets.find(item=>item.kind==='audio')!;asset.name=name;
  const inspect=vi.fn(()=>({ok:true,value:{status:'playing'}}));
  const entry=new SceneEntryPresentation({append:(child:unknown)=>children.push(child)} as unknown as HTMLElement,{} as PlayerHost,snapshot,{} as StageController,{inspect} as unknown as AudioMixer);
  entry.bgmStarted('Sess01','Music1',asset.assetId);entry.tick(0);
  expect(children[0].textContent).toBe(`♫  ${expected}`);
  expect(inspect).toHaveBeenCalledWith({sessionId:'Sess01',source:{kind:'instance',id:'Music1'}});
  expect(asset.name).toBe(name);
});
