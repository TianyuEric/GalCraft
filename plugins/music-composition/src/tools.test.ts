import { expect, it } from 'vitest';
import { validateJsonData } from '@galcraft/contracts';
import type { Json, SoundBankStatus } from '@galcraft/contracts';
import { soundbankInfo, soundbankToolInput, soundbankToolOutput } from './tools.js';
import { musicInstrumentSchema } from './catalog.js';
import { musicWritingOperation } from './definition.js';
import { createMusicScore } from './score.js';
const status=(id:string,availability:SoundBankStatus['availability']):SoundBankStatus=>({descriptor:{schemaVersion:1,id,version:'0.1.0',name:`中文来源 ${id}`,upstreamVersion:'test',format:'sf2',bytes:12,sourceUrl:'local fixture',license:'保留许可原文',notices:[{name:'Notice',text:'作者许可'}]},installed:availability==='ready',directory:availability==='ready'?'D:/fixture':null,availability,issues:availability==='ready'?[]:[{code:availability==='unreadable'?'SOUNDBANK_UNREADABLE':'SOUNDBANK_NOT_INSTALLED',severity:'warning',owner:'M09',message:'The exact library is unavailable.',related:[],actions:['supplyDependency']}]});
it('discovers dynamic libraries with stable pagination, preserves original names and distinguishes unavailable/empty results',async()=>{
  const statuses=Array.from({length:46},(_,i)=>status(`user-${String(i).padStart(3,'0')}`,i===1?'notInstalled':i===2?'unreadable':'ready'));
  const context={soundbanks:{list:async()=>({ok:true as const,warnings:[],value:statuses}),resolve:async()=>{throw new Error('Unavailable libraries must not be resolved.');}}};
  const first=await soundbankInfo({action:'libraries'},context);expect(first.ok).toBe(true);if(first.ok){expect(validateJsonData(soundbankToolOutput,first.value).ok).toBe(true);expect(first.value).toMatchObject({action:'libraries',total:46,offset:0,limit:40});}
  statuses.push(status('user-imported','ready'));const imported=await soundbankInfo({action:'libraries',query:{search:'imported',limit:1}},context);expect(imported).toMatchObject({value:{total:1,items:[{id:'user-imported',name:'中文来源 user-imported',license:'保留许可原文'}]}});
  for(const [id,availability] of [['user-001','notInstalled'],['user-002','unreadable']] as const){const result=await soundbankInfo({action:'instruments',soundbank:{id,version:'0.1.0'}},context);expect(result).toMatchObject({ok:true,value:{action:'instruments',soundbank:{availability},items:[],total:null}});}
  expect(await soundbankInfo({action:'libraries',query:{search:'no match'}},context)).toMatchObject({value:{items:[],total:0}});
  expect(await soundbankInfo({action:'instruments',soundbank:{id:'unknown',version:'0.1.0'}},context)).toMatchObject({ok:false,error:{code:'SOUNDBANK_UNKNOWN'}});
});
it('rejects malformed instrument fields and wrong tool branches; diagnoses a selected unreadable file',async()=>{
  const score=createMusicScore(),instrument={id:'melodic:0:0:0',name:'Piano',bankMSB:0,bankLSB:0,program:0,drum:false,minPitch:0,maxPitch:127,controllers:[1,7,10,11,64,91,93]};
  const fields={score,instruments:[instrument],presetId:'ambient',description:'Quiet BGM'} as unknown as Json;
  expect(validateJsonData(musicWritingOperation.inputSchema,fields).ok).toBe(true);
  expect(validateJsonData(musicInstrumentSchema,{...instrument,program:128}).ok).toBe(false);
  expect(validateJsonData(musicWritingOperation.inputSchema,{...fields as object,instruments:[{id:'invented'}]} as Json).ok).toBe(false);
  expect(validateJsonData(soundbankToolInput,{action:'instruments'}).ok).toBe(false);
  expect(validateJsonData(soundbankToolInput,{action:'libraries',query:{limit:101}}).ok).toBe(false);
  expect(validateJsonData(soundbankToolOutput,{action:'instruments',items:[],total:0,offset:0,limit:40,issues:[]}).ok).toBe(false);
  const context={soundbanks:{list:async()=>({ok:true as const,warnings:[],value:[status('user-readable','ready')]}),resolve:async()=>({ok:true as const,warnings:[],value:{url:'file:///fixture.sf2',expected:status('user-readable','ready').descriptor}})}};
  const result=await soundbankInfo({action:'instruments',soundbank:{id:'user-readable',version:'0.1.0'}},context,async()=>new ArrayBuffer(12));expect(result).toMatchObject({ok:true,value:{soundbank:{availability:'unreadable'},total:null,items:[],issues:[{code:'SOUNDBANK_UNREADABLE'}]}});
});
