import {expect,it} from 'vitest';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {DefaultTimeoutSecByPurpose} from '@galcraft/contracts';
import {ProjectSession} from '@galcraft/documents';
import {ProductionService,inputCapability} from '@galcraft/authoring/production';
import {emptyNovelAIPrompt,defaultNovelAISettings} from '@galcraft/generation-services/novelai';
import {createPlugin} from '../../../plugins/official-novelai/package/services/index.js';
import {createDefinition} from '../../../plugins/official-novelai/package/definition/index.js';
const {zipSync}=createRequire(new URL('../../../packages/authoring/package.json',import.meta.url))('fflate');
const unwrap=result=>{if(!result.ok)throw new Error(JSON.stringify(result));return result.value;};
const defaults=definition=>Object.fromEntries(definition.fields.map(field=>[field.path,structuredClone(field.default)]));
const snapshot=definition=>({id:definition.id,version:1,provider:{id:'org.galcraft.novelai',version:'0.1.0'},definition});
const config={id:'Conn01',revision:1,name:'Explicit NovelAI',protocol:'novelAIImage',baseUrl:'',credentialId:null,auth:'none',apiKeyHeader:null,model:'account-confirmed-model',purposes:['image'],timeoutSecByPurpose:DefaultTimeoutSecByPurpose,concurrency:1,parameters:{novelaiModelProfile:'v5-full'},workflowBindingId:null,serverFileRoot:null};
it('sends the public native image operation through its packaged adapter exactly once with complete character blocks',async()=>{
  await mkdir(resolve('../../tmp/testing'),{recursive:true});const root=await mkdtemp(resolve('../../tmp/testing/novelai-adapter-'));let sends=0,body;
  const server=createServer(async(request,response)=>{sends++;const parts=[];for await(const part of request)parts.push(part);body=JSON.parse(Buffer.concat(parts));response.writeHead(200,{'Content-Type':'application/zip'});response.end(zipSync({'image.png':new Uint8Array([137,80,78,71,13,10,26,10])}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const contributions=await createPlugin().activate({media:{probe:async()=>({metadata:{width:1024,height:1024},hasAlpha:true,hasTransparency:true})}});
    const provider=contributions.generationProviders.find(value=>value.protocols.includes('novelAIImage'));
    const connection={...config,baseUrl:`http://127.0.0.1:${server.address().port}`};const adapter=provider.create(connection),image=createDefinition().productionOperations.find(value=>value.id.endsWith('/image'));
    const prompt={...emptyNovelAIPrompt(),basePrompt:'very aesthetic, night station',negativePrompt:'blur',characters:[{name:'青',prompt:'blue coat',negativePrompt:'red coat',position:{x:.2,y:.7}}]};
    const input={purpose:image.id,fields:{...defaults(image),novelaiPrompt:prompt,novelaiSettings:{...defaultNovelAISettings(),quality:'light',transparent:true}},references:[]};
    const events=[];let authorizations=0;for await(const event of adapter.submit(input,{config:connection,workflow:null,requestId:'Req001',directory:root,signal:new AbortController().signal,beforeSend:async()=>{authorizations++;}}))events.push(event);
    expect(events.filter(event=>event.kind==='error')).toEqual([]);expect(events.find(event=>event.kind==='output').artifacts[0]).toMatchObject({port:'image',kind:'image'});expect(sends).toBe(1);expect(authorizations).toBe(1);
    expect(body.input.match(/very aesthetic/g)).toHaveLength(1);expect(body.parameters).toMatchObject({qualityToggle:false,straight_alpha:true,v4_prompt:{caption:{char_captions:[{char_caption:'blue coat',centers:[{x:.2,y:.7}]}]}},v4_negative_prompt:{caption:{char_captions:[{char_caption:'red coat'}]}}});
    const invalid={...connection,parameters:{}};const failures=[];for await(const event of adapter.submit(input,{config:invalid,workflow:null,requestId:'Req002',directory:root,signal:new AbortController().signal}))failures.push(event);
    expect(failures.some(event=>event.kind==='error')).toBe(true);expect(sends).toBe(1);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
it('repairs an invalid public prompt result locally and transfers the valid derived candidate to the real image operation',async()=>{
  await mkdir(resolve('../../tmp/testing'),{recursive:true});const root=await mkdtemp(resolve('../../tmp/testing/novelai-transfer-'));
  const project=await ProjectSession.createProject(join(root,'project'),'Proj01',[{documentId:'Doc001',revision:1,format:'json',files:{'value.json':JSON.stringify({schemaVersion:1,documentId:'Doc001',revision:1,data:{value:1}})}}]);
  const definitions=createDefinition().productionOperations,promptOperation=definitions.find(value=>value.id.endsWith('/prompt')),imageOperation=definitions.find(value=>value.id.endsWith('/image'));
  const preparation=(await createPlugin().activate({})).textPreparations[0];let sends=0;
  const remote={async *submit(){sends++;yield {kind:'textDelta',text:'{"basePrompt":"broken"}'};yield {kind:'output',artifacts:[],usage:null};}};
  const service=new ProductionService({userData:join(root,'profile'),project,adapter:()=>remote,acquireAdapter:async()=>({adapter:remote,release(){}}),freezeProvider:async(connection,input)=>({providerKey:connection.providerKey,packageVersion:'0.1.0',capabilities:{query:false,refetch:false,cancelPerTask:false,resume:false},capability:{...inputCapability(connection,input,null),inputs:[{port:'fields',required:true,supported:true,limits:{}},{port:'references',required:false,supported:true,limits:{}}]}}),acquireTextPreparation:async()=>({provider:preparation,packageVersion:'0.1.0',release(){}}),review:async()=>{throw new Error('unused');}});
  try{
    const item={id:'Item01',operation:promptOperation.id,operationSnapshot:snapshot(promptOperation),purpose:promptOperation.purpose,target:{sceneId:null,statementId:null,characterId:null,locale:null,usage:'cg',uiScope:null},backgroundRemoval:null,backgroundPreview:null,dependencies:[],input:{purpose:promptOperation.purpose,fields:{...defaults(promptOperation),instruction:'双人在黄昏车站'},references:[]},sourceVersions:[],configSnapshot:{...config,providerKey:'org.galcraft.generation/chatCompletions',protocol:'chatCompletions',purposes:['text']},workflowSnapshot:null,recipeSnapshot:null,state:'draft',remote:null,progress:{phase:'',completed:null,total:null},attempts:[],candidateIds:[],selectedCandidateId:null,needsReview:false,issues:[]};
    const plan=unwrap(await service.planTask({projectId:project.projectId,name:'完整分块提示',items:[item],context:[],policy:'waitForSelection',selectionRule:null}));const task=unwrap(await service.submit(plan.planId));await service.drain();
    const invalid=service.getCandidate(service.listTasks()[0].items[0].candidateIds[0]);expect(invalid.partial).toBe(true);const original=await readFile(invalid.artifacts[0].localPath,'utf8');
    const correct={...emptyNovelAIPrompt(),basePrompt:'station, evening',characters:[{name:'青',prompt:'blue coat',negativePrompt:'hat',position:{x:.25,y:.5}}]};
    const processed=unwrap(await service.reprocess(task.id,item.id,JSON.stringify(correct),invalid.id)),repaired=service.getCandidate(processed.items[0].candidateIds.at(-1));expect(repaired.partial).toBe(false);expect(repaired.parentCandidateIds).toEqual([invalid.id]);expect(repaired.checks.filter(issue=>issue.severity==='error')).toEqual([]);expect(await readFile(invalid.artifacts[0].localPath,'utf8')).toBe(original);expect(sends).toBe(1);
    const draft=unwrap(await service.saveFormDraft({schemaVersion:1,id:'Draft1',projectId:project.projectId,revision:0,activeUse:'cg',variants:{cg:{operation:imageOperation.id,operationSnapshot:snapshot(imageOperation),target:item.target,fields:{...defaults(imageOperation),width:832,height:1216},context:[],connectionId:'Image1',workflowBindingId:null,model:'confirmed-image-model',recipe:null,promptPreparation:null,backgroundRemoval:null,backgroundPreview:null,sourceVersions:[]}},updatedAt:new Date().toISOString(),submittedTaskId:null},null));
    const transfer={candidateId:invalid.id,draftId:draft.id,usage:'cg',expectedDraftRevision:draft.revision,acceptedFields:[],omittedPorts:[]};expect((await service.applyPromptTransfer(transfer)).ok).toBe(false);
    const next=unwrap(await service.applyPromptTransfer({...transfer,candidateId:repaired.id}));expect(next.variants.cg).toMatchObject({operation:imageOperation.id,model:'confirmed-image-model',fields:{width:832,height:1216,novelaiPrompt:correct,novelaiPromptSource:{candidateId:repaired.id,taskId:task.id,itemId:item.id}}});expect(sends).toBe(1);
  }finally{await service.close();await project.dispose('discard');await rm(root,{recursive:true,force:true});}
});
