import {describe, expect, it} from 'vitest';
import type {Json, ServiceEvent, SubmissionContext} from '@galcraft/contracts';
import {DefaultTimeoutSecByPurpose} from '@galcraft/contracts';
import {createMotionProject, operationId} from './project.js';
import {createMotionRenderAdapter} from './services.js';

describe('Motion Canvas production provider',()=>{
  const submission:SubmissionContext={requestId:'request1',directory:'tmp/testing/motion-canvas-service',signal:new AbortController().signal,workflow:null,
    config:{id:'ConnAA',revision:1,name:'Local Motion Canvas',protocol:'plugin',baseUrl:'http://127.0.0.1',auth:'none',credentialId:null,apiKeyHeader:null,model:'Motion Canvas 3.17.2',purposes:[operationId],timeoutSecByPurpose:{...DefaultTimeoutSecByPurpose,[operationId]:600},concurrency:1,parameters:{},workflowBindingId:null,serverFileRoot:null}};
  it('keeps the parsed source frozen while the author continues editing',async()=>{
    const project=createMotionProject(), original=project.files[1]!.content;
    const adapter=createMotionRenderAdapter({runtimeDependencies:{resolve:async()=>({ok:true,warnings:[],value:{url:'file:///runtime.mjs',expected:{}}}),load:async()=>({ok:true,warnings:[],value:{url:'file:///runtime.mjs',expected:{},module:{async renderMotionProject(input:{project:unknown;onProgress:(value:unknown)=>void}){
      expect(input.project).toMatchObject({files:[expect.anything(),{content:original}]});input.onProgress({phase:'rendering',completed:1,total:360});return {localPath:'output.mp4',mime:'video/mp4',bytes:10,metadata:{frames:360}};
    }}}})}});
    const events:ServiceEvent[]=[];
    for await(const event of adapter.submit({purpose:operationId,fields:{project:project as unknown as Json},references:[]},submission)){events.push(event);if(event.kind==='accepted')project.files[1]!.content='author changed';}
    expect(events.map(event=>event.kind)).toEqual(['accepted','progress','output']);
    expect(events.at(-1)).toMatchObject({artifacts:[{kind:'video',port:'video',metadata:{authorDocument:{data:{project:{files:[expect.anything(),{content:original}]}}}}}]});
  });
  it('returns a missing exact resource before invoking the renderer',async()=>{
    const project=createMotionProject();project.bindings=[{alias:'cover',assetId:'image1',variantId:'variant1',port:'images',purpose:'image'}];let called=0;
    const adapter=createMotionRenderAdapter({runtimeDependencies:{resolve:async()=>({ok:true,warnings:[],value:{url:'file:///runtime.mjs',expected:{}}}),load:async()=>({ok:true,warnings:[],value:{url:'file:///runtime.mjs',expected:{},module:{renderMotionProject(){called++;}}}})}});
    const events=[];for await(const event of adapter.submit({purpose:operationId,fields:{project:project as unknown as Json},references:[]},submission))events.push(event);
    expect(called).toBe(0);expect(events).toMatchObject([{kind:'error',issue:{code:'MOTION_RESOURCE'}}]);
  });
  it('freezes actual runtime versions and refuses a changed browser before render',async()=>{
    const expected={id:'org.galcraft.motion-canvas/toolchain',version:'0.1.0',motionCanvas:'3.17.2',vite:'5.4.21',playwright:'1.62.1',browser:{name:'chromium',version:'155.0.8059.85'},encoding:{ffmpegVersion:'9.0.2',ffprobeVersion:'9.0.2',videoEncoder:'h264_mf',audioEncoder:'aac',pixelFormat:'yuv420p'},dependencies:{vite:'5.4.21'}};
    let called=0;const context={runtimeDependencies:{resolve:async()=>({ok:true as const,warnings:[],value:{url:'file:///runtime.mjs',expected}}),load:async()=>({ok:true as const,warnings:[],value:{url:'file:///runtime.mjs',expected,module:{renderMotionProject(){called++;}}}})}};
    const frozen=await createMotionRenderAdapter(context).freeze!();expected.browser.version='156.0.0.0';
    const adapter=createMotionRenderAdapter(context,frozen),events=[];
    for await(const event of adapter.submit({purpose:operationId,fields:{project:createMotionProject() as unknown as Json},references:[]},submission))events.push(event);
    expect(called).toBe(0);expect(events).toMatchObject([{kind:'error',issue:{code:'MOTION_RUNTIME_CHANGED'}}]);
  });
  it('aborts the owned render at the frozen connection deadline and reports a failed timeout',async()=>{
    let reason:unknown;
    const adapter=createMotionRenderAdapter({runtimeDependencies:{resolve:async()=>({ok:true,warnings:[],value:{url:'file:///runtime.mjs',expected:{}}}),load:async()=>({ok:true,warnings:[],value:{url:'file:///runtime.mjs',expected:{},module:{async renderMotionProject(input:{signal:AbortSignal}){
      await new Promise((_,reject)=>input.signal.addEventListener('abort',()=>{reason=input.signal.reason;reject(reason);},{once:true}));
    }}}})}});
    const events:ServiceEvent[]=[];
    const timed={...submission,config:{...submission.config,timeoutSecByPurpose:{...submission.config.timeoutSecByPurpose,[operationId]:0.01}}};
    for await(const event of adapter.submit({purpose:operationId,fields:{project:createMotionProject() as unknown as Json},references:[]},timed))events.push(event);
    expect(reason).toMatchObject({name:'TimeoutError'});
    expect(events).toMatchObject([{kind:'accepted',remote:null},{kind:'error',issue:{code:'MOTION_TIMEOUT'},remoteStatus:'failed'}]);
  });
  it('keeps author cancellation distinct from a timeout and waits for render cleanup',async()=>{
    const controller=new AbortController();let cleaned=false;
    const adapter=createMotionRenderAdapter({runtimeDependencies:{resolve:async()=>({ok:true,warnings:[],value:{url:'file:///runtime.mjs',expected:{}}}),load:async()=>({ok:true,warnings:[],value:{url:'file:///runtime.mjs',expected:{},module:{async renderMotionProject(input:{signal:AbortSignal}){
      try{await new Promise((_,reject)=>{input.signal.addEventListener('abort',()=>reject(input.signal.reason),{once:true});queueMicrotask(()=>controller.abort());});}finally{cleaned=true;}
    }}}})}});
    const events:ServiceEvent[]=[];
    const collect=async()=>{for await(const event of adapter.submit({purpose:operationId,fields:{project:createMotionProject() as unknown as Json},references:[]},{...submission,signal:controller.signal}))events.push(event);};
    await collect();
    expect(controller.signal.reason).toMatchObject({name:'AbortError'});expect(cleaned).toBe(true);expect(events).toEqual([{kind:'accepted',remote:null}]);
  });
});
