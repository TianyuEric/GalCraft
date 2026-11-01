import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {CollaborationService,currentProjectScope} from './service.js';
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function setup(){const root=await mkdtemp(join(tmpdir(),'galcraft-round-'));roots.push(root);const binding={projectId:'ProjectA',writeSessionId:'WriteA1'};const core=new CollaborationService(root,()=>binding);await core.open();const create=(goal='Create the scene')=>core.create({...binding,projectName:binding.projectId,goal,harness:'codex',scope:core.settings(binding.projectId)});return {root,binding,core,create};}
it('keeps one active round per project while multiple clients connect and reads stay side-effect free',async()=>{
  const {core,binding,create}=await setup();expect(core.active(binding.projectId)).toBeNull();expect(core.list()).toEqual([]);
  const [one,two]=await Promise.all([create(),create('Another client')]);expect(two.id).toBe(one.id);expect(core.list()).toHaveLength(1);
  binding.projectId='ProjectB';binding.writeSessionId='WriteB1';const other=await create();expect(other.id).not.toBe(one.id);expect(core.active('ProjectA')?.id).toBe(one.id);expect(core.list()).toHaveLength(2);await core.close();
});
it('preserves pause and actual sends through target changes and rebinds, then keeps an ended terminal ended',async()=>{
  const {core,binding,create}=await setup(),one=await create();
  await core.authorize({sessionId:one.id,projectId:one.projectId,writeSessionId:one.writeSessionId,callId:'send',scopeRevision:1},'generate',{effects:['generate']},'RemoteAttempt1');
  const paused=await core.update({id:one.id,expectedRevision:1,goal:'Revised goal',paused:true,scope:{...currentProjectScope(),maxGenerations:5}});
  binding.writeSessionId='WriteA2';const next=await core.rebind({id:one.id,expectedRevision:paused.scopeRevision,writeSessionId:binding.writeSessionId,scope:paused.scope,paused:false});
  expect(next).toMatchObject({paused:true,goal:'Revised goal',generations:1,sentRequests:['RemoteAttempt1']});
  expect(()=>core.check({sessionId:one.id,projectId:one.projectId,writeSessionId:one.writeSessionId,callId:'read',scopeRevision:1},'read',{effects:['read']})).toThrow(expect.objectContaining({code:'BINDING_STALE'}));
  const ended=await core.end({id:next.id,expectedRevision:1});expect(core.active(one.projectId)).toBeNull();expect(core.valid(one)).toBe(false);
  const fresh=await create();expect(fresh.id).not.toBe(one.id);expect(fresh).toMatchObject({scope:paused.scope,generations:0,sentRequests:[],paused:false});expect(core.active(one.projectId)?.id).toBe(fresh.id);expect(ended.ended).toBe(true);await core.close();
});
it('deletes actual chain details and call payloads, preserves minimal source relations and retained settings after reopening',async()=>{
  const {root,core,binding,create}=await setup(),one=await create();
  core.register({definition:{key:'read',title:'Read',description:'',version:'0.1.0',inputSchema:true,outputSchema:true,effects:['read'],async:false,cancel:false},constraints:()=>({effects:['read']}),execute:async()=>({privateDetail:'remove me'})});
  await core.invoke('read',{privateInput:'remove me'},one.id,'call1');const paused=await core.update({id:one.id,expectedRevision:1,paused:true,scope:{...currentProjectScope(),maxGenerations:3}});
  binding.writeSessionId='WriteA2';const next=await core.rebind({id:one.id,expectedRevision:paused.scopeRevision,writeSessionId:binding.writeSessionId,scope:paused.scope});const ended=await core.end({id:next.id,expectedRevision:1});
  expect(await core.deleteEnded({id:next.id,expectedRevision:ended.scopeRevision})).toEqual({sessionIds:[next.id,one.id]});expect(core.list()).toEqual([]);expect(core.records()).toEqual([]);expect(core.active(one.projectId)).toBeNull();
  for(const path of [join(root,'sessions',one.id+'.json'),join(root,'sessions',next.id+'.json'),join(root,'calls',one.id,'call1.json')])await expect(readFile(path,'utf8')).rejects.toMatchObject({code:'ENOENT'});
  expect(await readFile(join(root,'rounds.json'),'utf8')).not.toMatch(/privateDetail|privateInput|Create the scene/);await core.close();
  const reopened=new CollaborationService(root,()=>binding);await reopened.open();expect(reopened.active(one.projectId)).toBeNull();expect(reopened.lineage(next.id)).toMatchObject({reboundFrom:one.id,ended:true});expect(reopened.settings(one.projectId).maxGenerations).toBe(3);
  const fresh=await reopened.create({...binding,projectName:'ProjectA',goal:'Next round',harness:'claude',scope:reopened.settings(one.projectId)});expect(fresh).toMatchObject({generations:0,scope:{maxGenerations:3}});await reopened.close();
});
