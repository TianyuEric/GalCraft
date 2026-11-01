import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { CollaborationService, currentProjectScope } from './service.js';
import { EditInputSchema } from '@galcraft/contracts';
import { z } from 'zod';
import type { CollaborationScope } from './contracts.js';
const directories:string[]=[];
afterEach(async()=>{await Promise.all(directories.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
const scope:CollaborationScope={documents:['Doc001'],createKinds:['scene'],tools:['edit','generate'],operations:['image'],connectionIds:['Conn01'],models:['model'],workflowIds:[],maxGenerations:1};
async function setup(){const root=await mkdtemp(join(tmpdir(),'galcraft-collaboration-'));directories.push(root);const binding={projectId:'Proj01',writeSessionId:'Write1'};const service=new CollaborationService(root,()=>binding);await service.open();const session=await service.create({projectId:'Proj01',writeSessionId:'Write1',projectName:'作品',goal:'补全黄昏场景',harness:'dsh',scope});return {service,session,binding,root};}
describe('external collaboration',()=>{
  it('pages large stored history without cloning inputs/results and reads one exact receipt without reconciliation', async () => {
    const { service, session, root, binding } = await setup();
    const directory = join(root, 'calls', session.id); await mkdir(directory, { recursive: true });
    const records = Array.from({ length: 763 }, (_, index) => ({ sessionId: session.id, callId: `call-${String(index).padStart(4, '0')}`, tool: 'edit', version: '0.1.0', state: index % 10 === 0 ? 'failed' : 'completed', createdAt: new Date(Date.UTC(2026, 9, 29) + index * 1000).toISOString(), updatedAt: new Date(Date.UTC(2026, 9, 29) + index * 1000).toISOString(), input: { text: 'large input '.repeat(500) }, context: { sessionId: session.id, callId: `call-${index}`, projectId: session.projectId, writeSessionId: session.writeSessionId, scopeRevision: 1 }, result: { name: 'Stored result', text: 'large result '.repeat(500), documents: [{ ref: { id: 'Doc001' } }] } }));
    await Promise.all(records.map(record => writeFile(join(directory, `${record.callId}.json`), JSON.stringify(record))));
    const reopened = new CollaborationService(root, () => binding); await reopened.open();
    reopened.register({ definition: { key: 'edit', version: '0.1.0', title: '编辑作品', description: '', inputSchema: true, outputSchema: true, effects: ['edit'], async: false, cancel: false }, constraints: () => ({ effects: ['edit'] }), execute: async () => null });
    const first = reopened.history({ sessionId: session.id, offset: 0, limit: 25 });
    expect(first).toMatchObject({ total: 763, offset: 0, limit: 25 }); expect(first.items).toHaveLength(25); expect(first.items[0]!.callId).toBe('call-0762');
    expect(JSON.stringify(first).length).toBeLessThan(12000); expect(first.items[0]).not.toHaveProperty('input'); expect(first.items[0]).not.toHaveProperty('result');
    const last = reopened.history({ sessionId: session.id, offset: 9999, limit: 25 }); expect(last.offset).toBe(750); expect(last.items).toHaveLength(13);
    const failed = reopened.history({ sessionId: session.id, offset: 0, limit: 25, state: 'failed' }); expect(failed.total).toBe(77); expect(failed.items.every(item => item.state === 'failed')).toBe(true);
    expect(reopened.history({ sessionId: session.id, offset: 0, limit: 25, search: 'call-0762' }).items).toHaveLength(1);
    expect(reopened.history({ sessionId: session.id, offset: 0, limit: 25, search: '编辑作品' }).total).toBe(763);
    expect(reopened.readCall(session.id, 'call-0762')).toEqual(records[762]); expect(reopened.get(session.id).generations).toBe(0);
    await reopened.close(); await service.close();
  });
  it('resolves current-project scope with no extra limit and still counts only distinct sends',async()=>{
    const {service,session}=await setup();const next=await service.update({id:session.id,expectedRevision:1,scope:currentProjectScope()});
    const context={sessionId:next.id,callId:'actual-send',scopeRevision:next.scopeRevision,projectId:next.projectId,writeSessionId:next.writeSessionId};
    for(const requestId of ['request-1','request-2','request-2'])await service.authorize(context,'newly-installed-tool',{effects:['generate'],operation:'actual-operation',model:'new-model'},requestId);
    expect(service.get(next.id)).toMatchObject({scope:{mode:'currentProject',maxGenerations:null},generations:2,sentRequests:['request-1','request-2']});
    await service.update({id:next.id,expectedRevision:next.scopeRevision,paused:true});await expect(service.authorize(context,'newly-installed-tool',{effects:['generate']},'request-3')).rejects.toMatchObject({code:'SESSION_PAUSED'});
    expect(service.get(next.id).generations).toBe(2);await service.close();
  });
  it('keeps read failures as accepted queryable receipts and reconciles only the original exact provider after unload',async()=>{
    const {service,session}=await setup();let sends=0,current={id:'Task01',state:'running'};
    const definition={key:'generate',version:'0.1.0',provider:{id:'org.example.local',version:'0.1.0'},title:'任务',description:'',inputSchema:true,outputSchema:true,effects:['generate'] as ('generate')[],async:false,cancel:false};
    service.register({definition,constraints:()=>({effects:['generate']}),async execute(){sends++;return current;},async lookup(){return current;}});
    const accepted=await service.invoke('generate',{},session.id,'original');expect(accepted).toMatchObject({callId:'original',state:'completed'});service.unregister('generate');current={...current,state:'completed'};
    service.register({definition:{...definition,provider:{id:'org.example.other',version:'0.1.0'}},constraints:()=>({effects:['generate']}),async execute(){throw new Error('new provider must not execute');},async lookup(){throw new Error('new provider must not reconcile an old exact call');}});
    expect(await service.query(session.id,'original')).toMatchObject({provider:{id:'org.example.local'},result:current});expect(sends).toBe(1);
    service.unregister('generate');service.register({definition:{...definition,effects:['read']},constraints:()=>({effects:['read']}),async execute(){throw new Error('missing media');}});
    const failure=await service.invoke('generate',{},session.id);expect(failure.state).toBe('failed');expect(await service.query(session.id,failure.callId)).toMatchObject({state:'failed',error:expect.any(String),issue:{details:{message:'missing media'}}});await service.close();
  });
  it('accepts the public recursive edit schema for chapter arrays and new documents, and rejects an invalid patch before execution',async()=>{
    const {service,session}=await setup();let actions=0;
    const edit:Record<string,import('@galcraft/contracts').Json>={label:'场景和章节',origin:'field',expected:[],preparedAssets:[],requiredRefs:[],patches:[{kind:'json',documentId:'Doc001',changes:[{path:'/data/chapters',op:'set',before:[],after:[{id:'Chap01',sceneIds:['Scene1']}]}]},{kind:'document',op:'create',documentId:'NewDoc',before:null,after:{documentId:'NewDoc',revision:0,format:'dsl',files:{'scenes/Scene1/script.gal':'end {} @End001;'}}}]};
    expect(EditInputSchema.safeParse(edit).success).toBe(true);
    service.register({definition:{key:'edit',version:'0.1.0',title:'编辑',description:'',inputSchema:z.toJSONSchema(z.object({edit:EditInputSchema})) as unknown as import('@galcraft/contracts').Json,outputSchema:true,effects:['edit'],async:false,cancel:false},constraints:()=>({effects:['edit'],documents:['Doc001'],createKinds:['scene']}),async execute(){actions++;return {operationId:'Edit01'};}});
    expect(await service.call('edit',{edit},session.id,'complex-edit')).toMatchObject({state:'completed',result:{operationId:'Edit01'}});
    const invalid=structuredClone(edit);(invalid.patches as Record<string,import('@galcraft/contracts').Json>[])[0]!.kind='unsupported';await expect(service.call('edit',{edit:invalid},session.id,'invalid-edit')).rejects.toThrow();expect(actions).toBe(1);await service.close();
  });
  it('persists one accepted action, reconciles its provider after a lost response, and rejects changed input',async()=>{
    const {service,session,root,binding}=await setup();let actions=0;let committed:undefined|{operationId:string};
    const tool={definition:{key:'edit',version:'0.1.0',title:'编辑',description:'',inputSchema:true,outputSchema:true,effects:['edit'] as const,async:false,cancel:false},constraints:()=>({effects:['edit'] as ('edit')[],documents:['Doc001']}),async execute(){actions++;committed={operationId:'Edit01'};throw new Error('response lost');},async lookup(){return committed;}};
    service.register({...tool,definition:{...tool.definition,effects:['edit']}});
    const first=await service.call('edit',{text:'新对白'},session.id,'write-1') as {state:string};expect(first.state).toBe('uncertain');
    const reopened=new CollaborationService(root,()=>binding);await reopened.open();reopened.register({...tool,definition:{...tool.definition,effects:['edit']}});
    const recovered=await reopened.call('edit',{text:'新对白'},session.id,'write-1') as {state:string;result:unknown};expect(recovered).toMatchObject({state:'completed',result:{operationId:'Edit01'}});expect(actions).toBe(1);
    await expect(reopened.call('edit',{text:'另一个动作'},session.id,'write-1')).rejects.toMatchObject({code:'CALL_CONFLICT'});
    await expect(reopened.close()).resolves.toBeUndefined();
  });
  it('checks current pause, model, scope and quota at the actual send, while reads do not consume quota',async()=>{
    const {service,session}=await setup(),context={sessionId:session.id,callId:'generate-1',scopeRevision:1,projectId:'Proj01',writeSessionId:'Write1'};
    const input={effects:['generate'] as ('generate')[],operation:'image',connectionId:'Conn01',model:'model'};
    await service.update({id:session.id,expectedRevision:1,paused:true});await expect(service.authorize(context,'generate',input,'Request1')).rejects.toMatchObject({code:'SESSION_PAUSED'});expect(service.get(session.id).generations).toBe(0);
    await service.update({id:session.id,expectedRevision:2,paused:false});await expect(service.authorize(context,'generate',{...input,model:'other'},'Request1')).rejects.toMatchObject({code:'PRODUCTION_SCOPE'});
    await service.authorize(context,'generate',input,'Request1');await service.authorize(context,'generate',input,'Request1');expect(service.get(session.id).generations).toBe(1);
    await expect(service.authorize(context,'generate',input,'Request2')).rejects.toMatchObject({code:'GENERATION_LIMIT'});
    await service.authorize(context,'generate',{effects:['read']});expect(service.get(session.id).generations).toBe(1);
  });
  it('keeps the explicit binding when focus changes and rejects an obsolete write session',async()=>{
    const {service,session,binding}=await setup();const context={sessionId:session.id,callId:'edit-1',scopeRevision:1,projectId:'Proj01',writeSessionId:'Write1'};
    service.check(context,'edit',{effects:['edit'],documents:['Doc001']});binding.writeSessionId='Write2';expect(()=>service.check(context,'edit',{effects:['edit']})).toThrow(expect.objectContaining({code:'BINDING_STALE'}));expect(service.records()).toEqual([]);
    expect(()=>service.check(context,'edit',{effects:['read']})).toThrow(expect.objectContaining({code:'BINDING_STALE'}));
  });
  it('refreshes a completed original call after reopening without executing its business again',async()=>{
    const {service,session,root,binding}=await setup();let sends=0,current={id:'Task01',state:'running'};
    const tool={definition:{key:'generate',version:'0.1.0',title:'任务',description:'',inputSchema:true,outputSchema:true,effects:['generate'] as ('generate')[],async:false,cancel:false},constraints:()=>({effects:['generate'] as ('generate')[]}),async execute(){sends++;return current;},async lookup(){return current;}};
    service.register(tool);expect(await service.call('generate',{},session.id,'original')).toMatchObject({result:{state:'running'}});
    await service.close();binding.writeSessionId='Write2';current={...current,state:'completed'};
    const reopened=new CollaborationService(root,()=>binding);await reopened.open();reopened.register(tool);
    expect(await reopened.query(session.id,'original')).toMatchObject({result:{id:'Task01',state:'completed'}});
    await expect(reopened.call('generate',{},session.id,'original')).rejects.toMatchObject({code:'BINDING_STALE'});expect(sends).toBe(1);
    await expect(reopened.call('generate',{},session.id,'new-request')).rejects.toMatchObject({code:'BINDING_STALE'});await reopened.close();
  });
  it('returns an async handle once, preserves the exact provider, and reports cancellation without assuming remote cancellation',async()=>{
    const {service,session,root,binding}=await setup();let executions=0;
    service.register({definition:{key:'generate',version:'0.1.0',provider:{id:'org.test.external',version:'0.1.0'},title:'长任务',description:'',inputSchema:true,outputSchema:true,effects:['generate'],async:true,cancel:true},constraints:()=>({effects:['generate']}),
      async execute(_input,_context,_check,signal){executions++;await new Promise<void>(resolve=>{if(signal?.aborted)resolve();else signal?.addEventListener('abort',()=>resolve(),{once:true});});return {local:'stopped',remote:'unsupported'};}});
    const accepted=await service.call('generate',{},session.id,'long-1') as {state:string};expect(['accepted','running']).toContain(accepted.state);
    expect(await service.call('generate',{},session.id,'long-1')).toMatchObject({callId:'long-1'});
    expect(await service.cancel(session.id,'long-1')).toMatchObject({status:'requested'});await service.close();
    expect(executions).toBe(1);expect(await service.query(session.id,'long-1')).toMatchObject({state:'completed',provider:{id:'org.test.external',version:'0.1.0'},result:{local:'stopped',remote:'unsupported'}});
    const reopened=new CollaborationService(root,()=>binding);await reopened.open();expect(await reopened.query(session.id,'long-1')).toMatchObject({state:'completed',result:{local:'stopped',remote:'unsupported'}});
  });
});

it('keeps schema failures accepted, drops invalid data, and recovers the original action without another write',async()=>{
  const {service,session}=await setup();let writes=0,recovered:import('@galcraft/contracts').Json={action:'other',value:'wrong action'};
  const branch=(action:string)=>z.strictObject({action:z.literal(action),value:z.string()});
  service.register({definition:{key:'edit',version:'0.1.0',title:'Edit',description:'',inputSchema:z.toJSONSchema(z.strictObject({action:z.enum(['rename','other'])})) as import('@galcraft/contracts').Json,outputSchema:z.toJSONSchema(z.union([branch('rename'),branch('other')])) as import('@galcraft/contracts').Json,effects:['edit'],async:false,cancel:false},constraints:()=>({effects:['edit']}),async execute(){writes++;return recovered;},async lookup(_context,input){expect(input).toEqual({action:'rename'});return recovered;}});
  const record=await service.invoke('edit',{action:'rename'},session.id,'schema-lost');expect(record).toMatchObject({state:'uncertain',errorCode:'TOOL_OUTPUT'});expect(record.result).toBeUndefined();
  expect(await service.query(session.id,'schema-lost')).toMatchObject({state:'uncertain',errorCode:'TOOL_OUTPUT'});
  recovered={action:'rename',value:'actual persisted name'};const result=await service.query(session.id,'schema-lost');expect(result).toMatchObject({state:'completed',result:recovered});
  expect((await service.invoke('edit',{action:'rename'},session.id,'schema-lost')).result).toEqual(recovered);expect(writes).toBe(1);await service.close();
});
it('ends an explicit collaboration binding while preserving original completed receipts',async()=>{
  const {service,session}=await setup();service.register({definition:{key:'edit',version:'0.1.0',title:'Edit',description:'',inputSchema:true,outputSchema:true,effects:['edit'],async:false,cancel:false},constraints:()=>({effects:['edit']}),async execute(){return {operationId:'Op0001'};}});
  await service.invoke('edit',{},session.id,'before-end');await service.end({id:session.id,expectedRevision:1});expect(service.list()[0]!.bindingValid).toBe(false);
  expect(await service.query(session.id,'before-end')).toMatchObject({state:'completed',result:{operationId:'Op0001'}});await expect(service.invoke('edit',{},session.id,'after-end')).rejects.toMatchObject({code:'SESSION_ENDED'});await service.close();
});

it('reads a legacy missing-mode record as restricted and rebinds an exhausted quota without losing facts',async()=>{
  const {service,session,root,binding}=await setup();await service.close();
  const path=join(root,'sessions',session.id+'.json'),old=JSON.parse(await readFile(path,'utf8'));delete old.scope.mode;old.scope.documents=[];old.scope.maxGenerations=0;old.generations=2;old.sentRequests=['old-1','old-2'];old.paused=true;await writeFile(path,JSON.stringify(old));
  binding.writeSessionId='Write2';const reopened=new CollaborationService(root,()=>binding);await reopened.open();const source=reopened.get(session.id);expect(source.scope).toMatchObject({mode:'restricted',documents:[],maxGenerations:0});
  const rebound=await reopened.rebind({id:source.id,expectedRevision:source.scopeRevision,writeSessionId:binding.writeSessionId,scope:source.scope,paused:source.paused,authorControlCallId:'actual-rebind'});
  expect(rebound).toMatchObject({scope:source.scope,paused:true,generations:2,sentRequests:['old-1','old-2'],reboundFrom:source.id});
  expect(()=>reopened.check({sessionId:rebound.id,projectId:rebound.projectId,writeSessionId:rebound.writeSessionId,scopeRevision:1,callId:'read'},'edit',{effects:['read'],documents:['Doc001']})).toThrow(expect.objectContaining({code:'DOCUMENT_SCOPE'}));await reopened.close();
});
