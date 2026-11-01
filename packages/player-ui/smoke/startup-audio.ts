import '@galcraft/player-ui/player.css';
import './smoke.css';
import { SplashPlaybackSchema, StartupClipSchema, StartupSequenceSchema, TitleMusicPlaybackSchema, TitleVideoPlaybackSchema } from '@galcraft/contracts';
import type { Instruction, Json, PlayerHost, Result, Snapshot } from '@galcraft/contracts';
import { FixtureIds as F, FixtureSnapshot, fixtureId as id } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate } from '@galcraft/templates';
import { mountPlayer } from '../src/bootstrap.js';

const ok = <T>(value:T)=>({ok:true as const,value,warnings:[]});
const unwrap = <T>(result:Result<T>)=>{if(!result.ok)throw Error(result.error.message);return result.value;};
const parameters = new URLSearchParams(location.search), urls:string[]=[];
const tone = (frequency:number,duration:number) => {
  const sampleRate=24000, samples=sampleRate*duration, bytes=new ArrayBuffer(44+samples*2), view=new DataView(bytes);
  const text=(offset:number,value:string)=>[...value].forEach((character,index)=>view.setUint8(offset+index,character.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,36+samples*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples*2,true);
  for(let index=0;index<samples;index++)view.setInt16(44+index*2,Math.round(Math.sin(index/sampleRate*Math.PI*2*frequency)*1800),true);
  const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));urls.push(url);return url;
};
const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#132d56"/><text x="960" y="520" fill="white" font-size="96" text-anchor="middle">GalCraft · 启动验收</text></svg>');
const makeVideo=async()=>{
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const context=canvas.getContext('2d')!;
  const stream=canvas.captureStream(30),chunks:BlobPart[]=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
  const complete=new Promise<Blob>(resolve=>{recorder.ondataavailable=event=>chunks.push(event.data);recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));});
  let frame=0; const paint=()=>{context.fillStyle=frame++%60<30?'#132d56':'#274d80';context.fillRect(0,0,640,360);context.fillStyle='white';context.font='32px sans-serif';context.fillText('启动视频 '+frame,170,180);};
  paint();recorder.start();const timer=setInterval(paint,33);await new Promise(resolve=>setTimeout(resolve,2200));clearInterval(timer);recorder.stop();
  const blob=await complete;for(const track of stream.getTracks())track.stop();const url=URL.createObjectURL(blob);urls.push(url);return url;
};
const events:{kind:string;nodeId:number;at:number;duration:number|null;offset?:number}[]=[];
let nextNodeId=0;
const original=AudioContext.prototype.createBufferSource;
AudioContext.prototype.createBufferSource=function(){const source=original.call(this),start=source.start.bind(source),stop=source.stop.bind(source),nodeId=++nextNodeId;
  source.start=(when?:number,offset?:number,duration?:number)=>{events.push({kind:'start',nodeId,at:performance.now(),duration:source.buffer?.duration??null,offset:offset??0});start(when,offset,duration);};
  source.stop=(when?:number)=>{events.push({kind:'stop',nodeId,at:performance.now(),duration:source.buffer?.duration??null});stop(when);};
  source.addEventListener('ended',()=>events.push({kind:'ended',nodeId,at:performance.now(),duration:source.buffer?.duration??null}));return source;
};
const snapshot:Snapshot=structuredClone(FixtureSnapshot),template=createOfficialTemplate({kind:'standard'});
snapshot.template=template;snapshot.lock.template=template.dependencies.find(item=>item.kind==='template')!;
snapshot.lock.plugins=[];snapshot.pluginDocuments={};snapshot.project.player.autosave=false;snapshot.project.player.name=null;snapshot.documents=[];
const audioPrototype=snapshot.assets.find(item=>item.kind==='audio')!,imagePrototype=snapshot.assets.find(item=>item.kind==='image')!;
const [home,stage,ambience,audition]=[30,31,32,6].map((duration,index)=>({...audioPrototype,assetId:id(0x7200+index),metadata:{durationSec:duration}}));
const splash={...imagePrototype,assetId:id(0x7210)},video={...imagePrototype,assetId:id(0x7211),kind:'video' as const,metadata:{durationSec:2.2}};
snapshot.assets=[home!,stage!,ambience!,audition!,splash,video];
const resources=new Map<string,string>([[home!.assetId,tone(220,30)],[stage!.assetId,tone(330,31)],[ambience!.assetId,tone(110,32)],[audition!.assetId,tone(440,6)],[splash.assetId,svg]]);
if(parameters.get('splash')==='video'||parameters.has('titleVideo')||parameters.has('sequence'))resources.set(video.assetId,await makeVideo());
snapshot.project.display.splash=parameters.get('splash')==='none'?null:parameters.get('splash')==='video'?video.assetId:splash.assetId;
snapshot.project.display.splashPlayback=SplashPlaybackSchema.parse({durationMs:1500,allowSkip:!parameters.has('noSkip')});
if(parameters.has('sequence'))snapshot.project.display.startupSequence=StartupSequenceSchema.parse({allowSkip:!parameters.has('noSkip'),revealMs:3000,clips:[
  StartupClipSchema.parse({id:id(0x7410),kind:'text',name:'原生说明',text:{'zh-CN':'原生文字 · 60 秒阅读时序'},fadeInMs:100,holdMs:parameters.has('short')?500:60000,fadeOutMs:100}),
  StartupClipSchema.parse({id:id(0x7411),kind:'color',name:'纯色',color:'#132d56',startMs:200,holdMs:1000}),
  StartupClipSchema.parse({id:id(0x7412),kind:'image',name:'图片',assetId:splash.assetId,startMs:400,holdMs:1500}),
  StartupClipSchema.parse({id:id(0x7413),kind:'video',name:'视频',assetId:video.assetId,startMs:600,holdMs:2000,volume:0}),
]});
snapshot.project.display.titleBackground=splash.assetId;snapshot.project.display.titleMusic=home!.assetId;
snapshot.project.display.titleMusicPlayback=TitleMusicPlaybackSchema.parse({fadeInMs:0});
snapshot.project.display.titleVideo=parameters.has('titleVideo')?video.assetId:null;snapshot.project.display.titleVideoPlayback=TitleVideoPlaybackSchema.parse({});
snapshot.gallery=[{id:id(0x7220),kind:'music',name:'试听 D · 440Hz',series:'acceptance',order:0,cover:null,assets:[audition!.assetId],lockedView:'placeholder'},
  {id:id(0x7221),kind:'cg',name:'CG',series:'acceptance',order:0,cover:null,assets:[],differences:[{id:id(0x7222),assetId:splash.assetId,name:'CG',order:0}],coverDifferenceId:id(0x7222),lockedView:'placeholder'}];
const instruction=(index:number,opcode:string,args:Json):Instruction=>({statementId:id(0x7300+index),opcode,args,condition:null,specVersion:'0.1.0',continuation:opcode==='say'?'wait':'continue',skippable:true,source:{documentId:F.streetDocument,statementId:id(0x7300+index),revision:1}});
snapshot.scenes[0]!.instructions=[instruction(1,'bgm',{op:'play',assetId:stage!.assetId,loop:true}),instruction(2,'playEffect',{op:'play',assetId:ambience!.assetId,soundId:id(0x7340),loop:true}),
  instruction(3,'say',{speaker:{kind:'narrator'},text:'舞台背景 B · 330Hz 与环境 C · 110Hz。打开设置或 CG 应持续；音乐鉴赏空闲听主页 A · 220Hz，试听听 D · 440Hz。'})];
snapshot.scenes[0]!.labels={};snapshot.project.entry.labelId=null;
const values=new Map<string,Uint8Array>(),lifecycle=new Set<Parameters<PlayerHost['subscribeLifecycle']>[0]>();
const host:PlayerHost={target:'web',resources:{resolve:async assetId=>{
  if(parameters.get('splash')==='broken'&&assetId===splash.assetId)return{ok:false,error:{code:'RESOURCE_MISSING',message:'开屏测试故障',severity:'error',owner:'M07',related:[],actions:[]},issues:[]};
  const uri=resources.get(assetId);if(!uri)return{ok:false,error:{code:'RESOURCE_MISSING',message:'未提供素材',severity:'error',owner:'M07',related:[],actions:[]},issues:[]};
  return ok({uri,mime:assetId===video.assetId?'video/webm':assetId===splash.assetId?'image/svg+xml':'audio/wav',bytes:1,rangeSupported:false,release(){}});
}},storage:{read:async key=>ok(values.get(key)??null),commit:async batch=>{for(const item of batch.writes)values.set(item.key,item.bytes);for(const key of batch.deletes)values.delete(key);return ok({revision:batch.expectedRevision+1});}},
 transfer:{importFile:async()=>ok(null),exportFile:async()=>ok(undefined)},viewport:()=>({width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:0,right:0,bottom:0,left:0},orientation:'landscape'}),
 subscribeLifecycle:fn=>{lifecycle.add(fn);return()=>{lifecycle.delete(fn);};},subscribeInput:()=>()=>{},close:async()=>ok(undefined),platform:async capability=>ok(capability==='window.fullscreen'?{enabled:false}:null)};
const mounted=unwrap(await mountPlayer(document.getElementById('app')!,host,snapshot));const preferences=mounted.data.current()!.preferences;
unwrap(await mounted.data.savePreferences({...preferences,textSpeed:120,toolbarLocked:true,confirmations:{overwrite:false,load:false,newGame:false,title:false,exit:false}},preferences.revision));
unwrap(await mounted.data.saveLongTerm({...mounted.data.current()!.longTerm,endings:['acceptance'],music:[id(0x7220)],cg:{[id(0x7221)]:[id(0x7222)]}},mounted.data.current()!.longTerm.revision));
mounted.view.render();
Object.assign(window,{acceptance:{mounted,events,snapshot,roles:{home:30,stage:31,ambience:32,audition:6},
  lifecycle:(type:'blur'|'focus')=>{for(const fn of lifecycle)fn({type,at:new Date().toISOString()});},
  dispose:()=>{mounted.view.dispose();for(const url of urls)URL.revokeObjectURL(url);},
  preview:(kind:'splash'|'home'|'startup')=>mounted.view.previewStartup(kind,snapshot.project.display)}});
document.documentElement.dataset.ready='true';
