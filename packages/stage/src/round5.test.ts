import {expect,it} from 'vitest';
import {FixtureCharacters,FixtureIds,FixtureRuntimeState} from '@galcraft/contracts/fixtures';
import type {Result} from '@galcraft/contracts';
import {StageCommandService} from './commands.js';
import {readingPortrait,stageObjectVisible} from './portrait.js';
import {advancePresentationTime} from './presentation-time.js';
const unwrap=<T>(result:Result<T>):T=>{if(!result.ok)throw result.error;return result.value;};
it('preserves a character difference without a stage instance and separates visibility and sentence overrides',async()=>{
  const character=structuredClone(FixtureCharacters[0]!);character.differences=[{id:'Diff01',name:'平静',figure:{assetId:'Image1',variantId:'Vers01'},avatar:{kind:'crop',crop:{x:.2,y:0,width:.5,height:.4}}},{id:'Diff02',name:'微笑',figure:{assetId:'Image2',variantId:'Vers02'},avatar:{kind:'image',assetId:'Avatar',variantId:'Vers03'}}];
  const service=new StageCommandService({character:()=>character,asset:(_,variantId)=>({ok:true,warnings:[],value:{kind:'image',variantId:variantId??'Vers01',provider:null,providerVersion:null}})});
  const token={sessionId:FixtureIds.session,statementId:FixtureIds.statements[0]!,occurrence:1};let state=structuredClone(FixtureRuntimeState);
  state.presentation.objects=[];state.presentation.text.speakerId=character.id;
  state=unwrap(await service.prepare({state,token,opcode:'characterDifference',args:{characterId:character.id,differenceId:'Diff01',figureVisible:false}})).state;
  expect(readingPortrait([],state.presentation.text,[character],state.presentation.characterDifferences)).toEqual({kind:'shared',characterId:character.id});
  state=unwrap(await service.prepare({state,token,opcode:'changeFigure',args:{objectId:'Figure',characterId:character.id,difference:true}})).state;
  expect(stageObjectVisible(state.presentation.objects[0]!,undefined)).toBe(false);
  state=unwrap(await service.prepare({state,token,opcode:'characterDifference',args:{characterId:character.id,differenceId:'Diff02',figureVisible:true}})).state;
  expect(state.presentation.objects[0]?.assetId).toBe('Image2');expect(state.presentation.transitions[0]?.spec.durationMs).toBe(180);
  expect(state.presentation.characterDifferences?.[character.id]?.avatar).toEqual({kind:'image',assetId:'Avatar',variantId:'Vers03'});
  const text={...state.presentation.text,avatarSelection:{mode:'image' as const,assetId:'OneOff'}};
  expect(readingPortrait([],text,[character],state.presentation.characterDifferences)).toEqual({kind:'image',assetId:'OneOff'});
  const next=advancePresentationTime(state.presentation,180);expect(next.characterDifferences?.[character.id]?.previous).toBeNull();
});
it('applies rendered loop points while preserving an explicitly authored loop override',async()=>{
  const service=new StageCommandService({asset:()=>({ok:true,warnings:[],value:{kind:'audio',variantId:'Vers01',provider:null,providerVersion:null,loop:{startSec:1,endSec:3,tail:'wrap'}}})});
  const input={state:structuredClone(FixtureRuntimeState),token:{sessionId:FixtureIds.session,statementId:FixtureIds.statements[0]!,occurrence:1},opcode:'bgm'};
  const loop=unwrap(await service.prepare({...input,args:{assetId:'Music1'}})).state.presentation.bgm;
  expect(loop).toMatchObject({loop:true,loopStartSec:1,loopEndSec:3});
  expect(unwrap(await service.prepare({...input,args:{assetId:'Music1',loop:false,loopStartSec:0,loopEndSec:2}})).state.presentation.bgm).toMatchObject({loop:false,loopStartSec:0,loopEndSec:2});
});
it('does not use the previous full figure as an avatar when that difference has no avatar mapping',async()=>{
  const character=structuredClone(FixtureCharacters[0]!);character.avatar=null;
  character.differences=[{id:'Diff01',name:'无头像',figure:{assetId:'Image1',variantId:'Vers01'},avatar:null},
    {id:'Diff02',name:'头像',figure:{assetId:'Image2',variantId:'Vers02'},avatar:{kind:'image',assetId:'Avatar',variantId:'Vers03'}}];
  const service=new StageCommandService({character:()=>character,asset:(_,variantId)=>({ok:true,warnings:[],value:{kind:'image',variantId:variantId??'Vers01',provider:null,providerVersion:null}})});
  const token={sessionId:FixtureIds.session,statementId:FixtureIds.statements[0]!,occurrence:1};let state=structuredClone(FixtureRuntimeState);
  state=unwrap(await service.prepare({state,token,opcode:'characterDifference',args:{characterId:character.id,differenceId:'Diff01'}})).state;
  state=unwrap(await service.prepare({state,token,opcode:'characterDifference',args:{characterId:character.id,differenceId:'Diff02'}})).state;
  expect(state.presentation.characterDifferences?.[character.id]?.previous).toBeNull();
  state.presentation.text.speakerId=character.id;state.presentation.text.avatarSelection={mode:'image',assetId:'OneOff'};
  state.presentation.characterDifferences![character.id]!.avatarVisible=false;
  expect(readingPortrait([],state.presentation.text,[character],state.presentation.characterDifferences)).toBeNull();
});
