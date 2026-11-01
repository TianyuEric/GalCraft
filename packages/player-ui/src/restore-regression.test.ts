import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { EffectValuesSchema } from '@galcraft/contracts';
import type { AnimationProcess, PlayerHost, PresentationState, Result, Snapshot, StageObject } from '@galcraft/contracts';
import { FixtureCharacters, FixtureEffects, FixtureIds, FixtureLock, FixtureProject, FixtureSaveRecord, FixtureScenes, FixtureTemplate, FixtureVariables } from '@galcraft/contracts/fixtures';
import { compile } from '@galcraft/dsl';
import { SessionController } from '@galcraft/runtime';
import { advanceAnimations, advanceImagePlayback, StageCommandService, type StageController } from '@galcraft/stage';
import { PlayerDataService } from './data.js';
import { PlayerLongTermService } from './long-term.js';
import { RestoreCoordinator } from './restore.js';
import { isStageAnimationWait } from './animation-wait.js';

const ok = <T>(value:T) => ({ok:true as const,value,warnings:[]});
const unwrap=<T>(value:Result<T>):T=>{if(!value.ok)throw value.error;return value.value;};
const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();});
const command=(name:string,args:unknown,id:string)=>`${name} ${JSON.stringify(args)} @${id};`;
const say=(text:string,id:string)=>command('say',{speaker:{kind:'narrator'},text},id);
function compileScenes(scripts:string[],scenes=structuredClone(FixtureScenes)):Snapshot {
  const lock=structuredClone(FixtureLock);lock.plugins=[];
  const result=compile({projectId:FixtureProject.projectId,engineVersion:FixtureProject.engineVersion,lock,project:FixtureProject,
    characters:FixtureCharacters,variables:FixtureVariables,assets:[],gallery:[],flows:[],template:FixtureTemplate,cancelOperationId:'Cancel',scenes,
    documents:scenes.map((scene,i)=>({documentId:`Scrpt${i}`,revision:1,kind:'scene',sceneId:scene.id,text:scripts[i]??'return {} @Return;'}))});
  expect(result.issues).toEqual([]);return structuredClone(result.snapshot!);
}
async function fixture(snapshot:Snapshot) {
  const directory=await mkdtemp(join(tmpdir(),'galcraft-restore-regression-'));cleanups.push(()=>rm(directory,{recursive:true,force:true}));
  const storage:PlayerHost['storage']={read:async key=>{try{return ok(new Uint8Array(await readFile(join(directory,key))));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return ok(null);throw error;}},
    commit:async batch=>{for(const value of batch.writes){const path=join(directory,value.key);await mkdir(dirname(path),{recursive:true});await writeFile(path,value.bytes);}for(const key of batch.deletes)await rm(join(directory,key),{force:true});return ok({revision:batch.expectedRevision+1});}};
  const data=new PlayerDataService({target:'web',storage},{kind:'player',projectId:snapshot.projectId,instance:'restore-regression'},'zh-CN','zh-CN');unwrap(await data.open());
  const commands=new StageCommandService({asset:()=>{throw new Error('This restore fixture has no asset execution');}});
  const session=new SessionController({longTerm:new PlayerLongTermService(data),stage:commands,contributions:{commands:[],conditions:[],documents:[],tools:[],resources:[],stages:[],pages:[],components:[],systems:[],platform:[]}});
  let preparedPresentation:PresentationState|null=null;
  const stage={prepareStage:async(_session:string,state:PresentationState,key:unknown)=>{preparedPresentation=structuredClone(state);return ok({id:crypto.randomUUID(),state,restoreKey:key});},
    commitStage:()=>ok(undefined),discardPrepared:()=>{},disposeRetiredStage:()=>{}} as unknown as StageController;
  const restore=new RestoreCoordinator(snapshot,data,session,stage);
  const position={sceneId:snapshot.project.entry.sceneId,statementId:snapshot.scenes[0]!.instructions[0]!.statementId};
  const prepared=unwrap(await session.prepareSession({snapshot,domain:data.domain,source:{kind:'entry',scenario:{schemaVersion:1,id:'EntryA',name:'Restore regression',projectId:snapshot.projectId,
    entry:position,target:position,initialProgress:{},pluginInitial:{},route:[],playerInputs:[],externalPolicy:'simulate',engineVersion:snapshot.engineVersion,pluginVersions:[]}},target:null}));
  unwrap(session.activate(prepared.id));unwrap(await session.start());
  const save=async()=>{const active=session.inspect()!,record={...structuredClone(FixtureSaveRecord),kind:'quick' as const,recordId:crypto.randomUUID(),projectId:snapshot.projectId,
    releaseVersion:snapshot.releaseVersion,engineVersion:snapshot.engineVersion,dependencyVersions:[snapshot.lock.engine,...snapshot.lock.plugins,snapshot.lock.template],state:active.state,history:active.history};
    unwrap(await data.save({kind:'quick',record,expectedIndexRevision:data.current()!.index.revision}));return record;};
  const load=async(recordId:string)=>{const context=unwrap(restore.context());const prepared=unwrap(await restore.prepareLoad({requestId:crypto.randomUUID(),recordId,context}));unwrap(restore.commitLoad({requestId:prepared.key.requestId,acceptMappings:false}));unwrap(await session.start());return session.inspect()!;};
  return {session,data,restore,save,load,presentation:()=>preparedPresentation!};
}
async function advance(session:SessionController){const token=session.inspect()!.token!;unwrap(await session.updateTextProgress({token,textShown:10000}));return unwrap(await session.dispatch({kind:'advance',token}));}

describe('scene frame and presentation restoration (RDV-T06/T07)',()=>{
  it('saves and reloads independent same-name locals in current and historical frames, then returns to the caller',async()=>{
    const scenes=structuredClone(FixtureScenes);scenes[0]!.locals=[{id:'LocalA',name:'amount',type:'number',scope:'local',initial:1}];scenes[1]!.locals=[{id:'LocalB',name:'amount',type:'number',scope:'local',initial:2}];scenes[1]!.returns='number';
    const snapshot=compileScenes([command('setVar',{variableId:'LocalA',op:'assign',value:9},'SetAAA')+'\n'+command('callScene',{sceneId:scenes[1]!.id,receiver:{scope:'local',variableId:'LocalA'}},'CallAA')+'\n'+say('A={{local["LocalA"]}}','LineAA'),
      say('B={{local["LocalB"]}}','LineBB')+'\nreturn {value:expr("local[\\\"LocalB\\\"] + 10")} @Return;'],scenes);
    const context=await fixture(snapshot),before=context.session.inspect()!,record=await context.save();expect(before.state.frames.map(frame=>frame.locals)).toEqual([{LocalA:9},{LocalB:2}]);
    const restored=await context.load(record.recordId);expect(restored.sessionId).not.toBe(before.sessionId);expect(restored.state.frames).toEqual(before.state.frames);
    await advance(context.session);expect(context.session.inspect()!.state.presentation.text.text).toBe('A=12');
    const returned=await context.save();expect(returned.history.find(entry=>entry.position.statementId==='LineBB')!.entryState!.frames).toHaveLength(2);
    expect((await context.load(returned.recordId)).state.frames[0]!.locals).toEqual({LocalA:12});
    const invalid=structuredClone(returned);invalid.state.frames[0]!.locals={LocalB:2};const current=context.session.inspect();
    const rejected=await context.restore.prepareRestore({requestId:crypto.randomUUID(),purpose:'activate',source:{kind:'save',record:invalid},context:unwrap(context.restore.context())});
    expect(rejected).toMatchObject({ok:false,error:{code:'RESTORE_VARIABLE'}});expect(context.session.inspect()).toEqual(current);
    const historical=structuredClone(returned);historical.history.find(entry=>entry.position.statementId==='LineBB')!.entryState!.frames[1]!.sceneId='Absent';
    expect(await context.restore.prepareRestore({requestId:crypto.randomUUID(),purpose:'activate',source:{kind:'save',record:historical},context:unwrap(context.restore.context())})).toMatchObject({ok:false,error:{code:'RESTORE_VARIABLE'}});
  });
  it.each(['object','camera','once'] as const)('preserves %s progress while rebinding the restored owner and rejects old/duplicate completions',async kind=>{
    const snapshot=compileScenes([say('Waiting setup','LineAA')+'\n'+say('Complete','LineBB')]);
    const context=await fixture(snapshot),waiting=context.session.inspect()!,state=structuredClone(waiting.state),old=waiting.token!;
    // Persist the same native process shape produced by the stage, at a captured midpoint.
    const object:StageObject={id:'Object',characterId:null,assetId:FixtureIds.background,variantId:'Varian',layer:'figure' as const,entranceOrder:0,backgroundFrame:null,station:'center' as const,current:EffectValuesSchema.parse(FixtureEffects),defaults:{...EffectValuesSchema.parse(FixtureEffects),station:'center' as const},framing:{mode:'full' as const,scale:1,offsetX:0,offsetY:0,crop:null},transition:{enter:{preset:'cut' as const,resourceId:null,durationMs:0,easing:{family:'linear' as const,direction:'in' as const},direction:'left' as const},exit:{preset:'cut' as const,resourceId:null,durationMs:0,easing:{family:'linear' as const,direction:'in' as const},direction:'left' as const}},processes:[],providerState:null,imageFace:null};
    const process:AnimationProcess={id:'Proces',owner:old,objectId:kind==='camera'?'00000000-0000-4000-8000-000000000006':'Object',fields:['/x'],segments:[],native:{type:'galcraft.animation' as const,version:1 as const,durationMs:1000,tracks:[{path:'/x',mode:'absolute' as const,keyframes:[{timeMs:1000,value:400,easing:{family:'linear' as const,direction:'in' as const}}]}]},segmentIndex:0,elapsedMs:400,segmentFrom:{},before:{'/x':0},repeat:0,iteration:0,loop:false,cross:false,parallel:false,keepFinal:true,writeDefault:false,status:'running' as const};
    state.presentation.objects=kind==='camera'?[]:[{...object,...(kind==='once'?{imagePlayback:{mode:'once' as const,elapsedMs:400,completed:false,frameDurationsMs:[500,500],owner:old}}:{processes:[process]})}];
    if(kind==='camera')state.presentation.camera={current:EffectValuesSchema.parse(FixtureEffects),defaults:EffectValuesSchema.parse(FixtureEffects),processes:[process]};
    state.wait={kind:'animation',processIds:[kind==='once'?'Object':'Proces']};snapshot.scenes[0]!.instructions[0]!.opcode='setAnimation';
    const prepared=unwrap(await context.session.prepareSession({snapshot,domain:context.data.domain,source:{kind:'restored',state,history:[],voiceLocale:'zh-CN'},target:null}));unwrap(context.session.activate(prepared.id));
    const record=await context.save(),savedOwner=kind==='once'?record.state.presentation.objects[0]!.imagePlayback!.owner!:kind==='camera'?record.state.presentation.camera!.processes[0]!.owner:record.state.presentation.objects[0]!.processes[0]!.owner;
    const restored=await context.load(record.recordId),presentation=context.presentation();
    const restoredOwner=kind==='once'?presentation.objects[0]!.imagePlayback!.owner!:kind==='camera'?presentation.camera!.processes[0]!.owner:presentation.objects[0]!.processes[0]!.owner;
    expect(restoredOwner).toEqual({...savedOwner,sessionId:restored.sessionId});expect(restoredOwner).toEqual(restored.token);
    if(kind==='once')expect(presentation.objects[0]!.imagePlayback!.elapsedMs).toBe(400);else expect((kind==='camera'?presentation.camera!.processes:presentation.objects[0]!.processes)[0]!.elapsedMs).toBe(400);
    let finished:PresentationState,completion=restoredOwner;
    if(kind==='once'){finished=structuredClone(presentation);const advanced=advanceImagePlayback(finished.objects[0]!.imagePlayback!,600);expect(advanced.completed).toBe(true);finished.objects[0]!.imagePlayback=advanced.playback;}
    else {const advanced=advanceAnimations(presentation,600);expect(advanced.completions).toHaveLength(1);completion=advanced.completions[0]!.token;finished=advanced.state;}
    expect(isStageAnimationWait(snapshot,restored.state,restored.token,completion)).toBe(true);unwrap(context.session.syncPresentation(restored.sessionId,finished));
    unwrap(await context.session.dispatch({kind:'animation',token:completion}));const after=context.session.inspect()!;expect(after.state.position.statementId).toBe('LineBB');
    expect(await context.session.dispatch({kind:'animation',token:savedOwner})).toMatchObject({ok:false,error:{code:'TOKEN_STALE'}});
    expect(await context.session.dispatch({kind:'animation',token:completion})).toMatchObject({ok:false,error:{code:'TOKEN_STALE'}});expect(context.session.inspect()!.history).toEqual(after.history);
  });
});
