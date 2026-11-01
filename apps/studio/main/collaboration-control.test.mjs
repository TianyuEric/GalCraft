import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createId } from '@galcraft/contracts';
import { z } from 'zod';
import { ProjectDocuments } from './document-providers.mjs';
import { ProjectAccess } from './project-access.mjs';
import { StudioCollaboration } from './collaboration-providers.mjs';

const cleanups=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
const value=result=>{expect(result.state??'completed',JSON.stringify(result)).toBe('completed');return result.result??result;};
async function setup(){
  const root=resolve('../../tmp/testing',`workflow-control-${createId()}`);await mkdir(root,{recursive:true});
  const projects=new ProjectDocuments(new ProjectAccess(),undefined,{resolveEngine:async()=>({ok:true,value:{manifest:{targets:['web','windows']}},warnings:[]})});
  const production={current:async()=>({service:{drain:async()=>{}}}),generationProviders:{operations:async()=>[]},connections:{list:async()=>[]}};
  let directoryPrompts=0;
  const service=new StudioCollaboration({userData:join(root,'profile'),projects,production,assets:{},plugins:{externalTools:async()=>[]},dialog:{showOpenDialog:async(_window,options)=>{directoryPrompts++;expect(options.defaultPath).toBe(root);expect(options.properties).toContain('openDirectory');return {canceled:false,filePaths:[root]};}}});
  await service.ready;
  const client=new Client({name:'codex-workflow-harness',version:'0.1.0'},{versionNegotiation:{mode:'auto'}});
  await client.connect(new StreamableHTTPClientTransport(new URL((await service.mcp.start()).endpoint)));
  cleanups.push(async()=>{await client.close();await service.close();if(projects.currentSession)await projects.close(projects.currentSessionId,'discard');await rm(root,{recursive:true,force:true});});
  let counter=0,binding;
  const control=async(tool,input,callId=`control-${++counter}`)=>{let result=await client.callTool({name:tool,arguments:{callId,input}});expect(result.isError,JSON.stringify(result)).not.toBe(true);for(let attempt=0;['accepted','running'].includes(result.structuredContent.result.state)&&attempt<300;attempt++){await new Promise(resolve=>setTimeout(resolve,20));result=await client.callTool({name:'galcraft_control_call',arguments:{callId}});}return result.structuredContent.result;};
  const project=async name=>{
    const prepared=value(await control('galcraft_projects',{action:'prepareCreate',project:{path:root,name,template:'standard',width:1920,height:1080,engineVersion:'0.1.0'}}));
    const created=value(await control('galcraft_projects',{action:'apply',reviewId:prepared.plan.reviewId,authorDecision:'confirm',closeChoice:'save'}));
    expect(directoryPrompts).toBe(0);expect(service.core.list()).toEqual([]);
    const bootstrap=await client.callTool({name:'galcraft_context',arguments:{projectId:created.projectId,input:{mode:'bootstrap',projectId:created.projectId}}});
    expect(bootstrap.isError,JSON.stringify(bootstrap)).not.toBe(true);binding=bootstrap.structuredContent.result;
    expect(binding).toMatchObject({projectId:created.projectId,writeSessionId:created.writeSessionId});expect(service.core.list()).toEqual([]);
    return created;
  };
  const scope=documents=>({mode:'restricted',documents,createKinds:['scene','document'],tools:['galcraft_context','galcraft_edit','galcraft_save','galcraft_check','galcraft_pages'],operations:[],connectionIds:[],models:[],workflowIds:[],maxGenerations:2});
  const collaborate=async chosen=>{const prepared=value(await control('galcraft_collaboration',{action:'prepareCreate',projectId:binding.projectId,writeSessionId:binding.writeSessionId,goal:'Create a new visual novel',harness:'codex',scope:chosen}));return value(await control('galcraft_collaboration',{action:'apply',reviewId:prepared.plan.reviewId,authorDecision:'confirm'})).session;};
  const outputValidators=new Map();
  const business=async(tool,session,input,callId)=>{
    const response=await client.callTool({name:tool,arguments:{projectId:session.projectId,sessionId:session.sessionId,callId,view:'full',input}});
    expect(response.isError,JSON.stringify(response)).not.toBe(true);const result=response.structuredContent;
    if(result.state==='completed'){
      if(!outputValidators.has(tool))outputValidators.set(tool,z.fromJSONSchema(service.core.catalog().find(definition=>definition.key===tool).outputSchema));
      const checked=outputValidators.get(tool).safeParse(result.result);expect(checked.success,JSON.stringify(checked)).toBe(true);
    }
    return result;
  };
  const query=async(session,callId)=>{const response=await client.callTool({name:'galcraft_call',arguments:{projectId:session.projectId,sessionId:session.sessionId,callId,view:'full'}});expect(response.isError,JSON.stringify(response)).not.toBe(true);return response.structuredContent;};
  const edit=async(session,documents,callId)=>business('galcraft_edit',session,{edit:{label:'Related objects',origin:'field',expected:documents.map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision})),preparedAssets:[],requiredRefs:[],patches:documents.map(document=>({kind:'json',documentId:document.documentId,changes:[{path:'/data/name',op:'set',before:JSON.parse(Object.values(document.files)[0]).data.name,after:`Edited ${document.documentId}`}]}))}},callId);
  return {root,projects,service,client,control,project,scope,collaborate,business,query,edit};
}

describe('harness project and collaboration lifecycle on real M02 directories',{timeout:30000},()=>{
  it('WF-6: assembles all 11 base types and preserves SCSS source, compiled CSS and undo through the shared semantic tools',async()=>{
    const s=await setup();await s.project('page-tools');const project=s.projects.currentSession;
    const session=await s.collaborate(s.scope([...project.documents.keys()]));let callId=0;
    const call=async input=>value(await s.business('galcraft_pages',session,input,`page-${++callId}`));
    const catalog=await call({action:'catalog'});expect(catalog.components).toHaveLength(11);
    const prepared=await call({action:'prepare',request:{label:'Create a custom character page',operations:[{kind:'page.create',id:'Page01',key:'character-notes',title:'Character notes'}]}});
    await call({action:'apply',planId:prepared.plan.planId,expected:prepared.plan.input.expected});
    const rootId=prepared.created.components[0];
    const added=await call({action:'prepare',request:{label:'Place the base components',operations:catalog.components.map(component=>({kind:'component.add',pageId:'Page01',parentId:rootId,componentKind:component.componentKind}))}});
    await call({action:'apply',planId:added.plan.planId,expected:added.plan.input.expected});
    const read=await call({action:'read',full:true});expect(read.template.pages.find(page=>page.id==='Page01').root.children.map(component=>component.part)).toEqual(catalog.components.map(component=>component.part));
    const style=await call({action:'compileStyle',request:{label:'Author SCSS',name:'Character tint',pageId:'Page01',componentId:null,language:'scss',activation:'page',source:'$ink: #345; :scope { color: $ink; }'}});
    expect(style.issues).toEqual([]);await call({action:'apply',planId:style.plan.planId,expected:style.plan.input.expected});
    const withStyle=await call({action:'read',full:true}),metadata=withStyle.template.styles.find(style=>style.name==='Character tint');
    expect(metadata.sourcePath).not.toBe(metadata.compiledPath);expect(withStyle.sources[metadata.sourcePath]).toContain('$ink');expect(withStyle.sources[metadata.compiledPath]).not.toContain('$ink');
    const edit=project.operations.at(-1),undo=project.planUndo(edit.members[0],edit.id);expect(undo.ok,JSON.stringify(undo)).toBe(true);expect(project.undo(undo.value.planId).ok).toBe(true);
    const afterUndo=await call({action:'read',full:true});expect(afterUndo.template.styles.some(style=>style.name==='Character tint')).toBe(false);
    const save=await s.service.core.invoke('galcraft_save',{action:'plan',scope:{kind:'all'}},session.sessionId,'page-save-plan');const saved=await s.service.core.invoke('galcraft_save',{action:'save',planId:save.result.plan.planId},session.sessionId,'page-save');expect(saved.state,JSON.stringify(saved)).toBe('completed');
    const directory=s.projects.currentRoot;await s.projects.close(s.projects.currentSessionId,'save');await s.projects.open(directory);
    const pageDocument=[...s.projects.currentSession.documents.values()].find(document=>Object.values(document.files).some(raw=>{try{return JSON.parse(raw).data?.id==='Page01';}catch{return false;}}));expect(JSON.parse(Object.values(pageDocument.files)[0]).data.root.children).toHaveLength(11);
  },30000);
  it('HSC-01: creates a new template and authorizes the first edit through actual MCP without an existing session',async()=>{
    const s=await setup();expect((await s.control('galcraft_projects',{action:'list'})).projects).toEqual([]);
    const created=await s.project('harness-first');expect(created.writeSessionId).toBe(s.projects.currentSessionId);
    const document=[...s.projects.currentSession.documents.values()].find(document=>document.files['project.json']);
    const session=await s.collaborate(s.scope([document.documentId]));expect(session.bindingValid).toBe(true);expect(session.scopeRevision).toBe(1);
    const result=await s.edit(session,[document],'first-edit');expect(result.state,JSON.stringify(result)).toBe('completed');
    expect(s.projects.currentSession.operations).toHaveLength(1);
    expect(JSON.parse(await readFile(join(s.projects.currentRoot,'project.json'),'utf8')).data.name).toBe('harness-first');
    const original=await s.edit(session,[document],'first-edit');expect(original.result).toEqual(result.result);expect(s.projects.currentSession.operations).toHaveLength(1);
    expect((await s.query(session,'first-edit')).result).toEqual(result.result);expect(s.projects.currentSession.operations).toHaveLength(1);
    await expect(s.control('galcraft_projects',{action:'prepareOpen',directory:s.projects.currentRoot},'first-edit')).resolves.toBeTruthy();
  });
  it('HSC-02: rebinds after reopen and preserves old calls, generation usage and the new write identity',async()=>{
    const s=await setup();await s.project('rebind');const directory=s.projects.currentRoot;
    const doc=[...s.projects.currentSession.documents.values()].find(document=>document.files['project.json']);const session=await s.collaborate(s.scope([doc.documentId]));
    const original=await s.edit(session,[doc],'old-edit');
    await s.service.core.authorize({sessionId:session.sessionId,projectId:session.projectId,writeSessionId:session.writeSessionId,scopeRevision:1,callId:'sent'},'galcraft_edit',{effects:['edit']},'Remote1');
    await s.projects.close(s.projects.currentSessionId,'save');await s.projects.open(directory);
    expect(s.projects.currentSessionId).not.toBe(session.writeSessionId);
    const prepared=value(await s.control('galcraft_collaboration',{action:'prepareRebind',sessionId:session.sessionId,expectedRevision:1}));
    const next=value(await s.control('galcraft_collaboration',{action:'apply',reviewId:prepared.plan.reviewId,authorDecision:'confirm'},'rebind-once')).session;
    expect(next).toMatchObject({generations:1,remainingGenerations:1,scopeRevision:1,bindingValid:true});expect(next.sessionId).not.toBe(session.sessionId);
    expect(value(await s.control('galcraft_collaboration',{action:'apply',reviewId:prepared.plan.reviewId,authorDecision:'confirm'},'rebind-once')).session.sessionId).toBe(next.sessionId);
    const recovered=await s.query(session,'old-edit');expect(recovered.state).toBe('completed');expect(recovered.sessionId).toBe(session.sessionId);expect(recovered.result).toEqual(original.result);
    expect(s.service.core.get(next.sessionId).sentRequests).toEqual(['Remote1']);
    await expect(s.service.core.invoke('galcraft_edit',{edit:{label:'old',origin:'field',expected:[],patches:[],preparedAssets:[],requiredRefs:[]}},session.sessionId,'expired')).rejects.toMatchObject({code:'BINDING_STALE'});
  });
  it('HSC-03/04: reviews the real save closure, expands scope, rejects stale review, and keeps unselected work dirty',async()=>{
    const s=await setup();await s.project('save-scope');const project=s.projects.currentSession;
    const first=[...project.documents.values()].find(document=>document.files['project.json']),second=[...project.documents.values()].find(document=>Object.keys(document.files).some(path=>path.endsWith('scene.json')));
    const session=await s.collaborate(s.scope([first.documentId,second.documentId]));await s.edit(session,[first,second],'two-objects');
    const unrelated=[...project.documents.values()].find(document=>document.files['ui/template.json']);
    const independent=project.planEdit({label:'Independent author stylesheet',origin:'field',expected:[{ref:{kind:'document',id:unrelated.documentId},revision:unrelated.revision}],preparedAssets:[],requiredRefs:[],patches:[{kind:'file',documentId:unrelated.documentId,path:'ui/styles/author-note.source.css',before:null,after:'/* Keep this unrelated draft */'}]});expect(independent.ok,JSON.stringify(independent)).toBe(true);expect(project.applyEdit(independent.value.planId,independent.value.input.expected).ok).toBe(true);
    const contracted=await s.service.core.update({id:session.sessionId,expectedRevision:1,scope:s.scope([first.documentId])});
    const prepared=await s.service.core.invoke('galcraft_save',{action:'plan',scope:{kind:'current',documentId:first.documentId}},session.sessionId,'save-plan');expect(prepared.state,JSON.stringify(prepared)).toBe('completed');
    const plan=prepared.result.plan;expect(plan.members).toContain(second.documentId);expect(prepared.result.scopeIssues[0].code).toBe('DOCUMENT_SCOPE');
    const denied=await s.service.core.invoke('galcraft_save',{action:'save',planId:plan.planId},session.sessionId,'save-denied');expect(denied.state).toBe('failed');expect(project.dirtyIds()).toContain(first.documentId);
    for(const authorDecision of ['reject','cancel']){
      const review=value(await s.control('galcraft_collaboration',{action:'prepareScope',sessionId:session.sessionId,expectedRevision:contracted.scopeRevision,scope:session.scope}));
      expect(value(await s.control('galcraft_collaboration',{action:'apply',reviewId:review.plan.reviewId,authorDecision})).status).toBe(authorDecision);expect(s.service.core.get(session.sessionId).scopeRevision).toBe(2);
    }
    const stale=value(await s.control('galcraft_collaboration',{action:'prepareScope',sessionId:session.sessionId,expectedRevision:2,scope:session.scope}));
    await s.service.core.update({id:session.sessionId,expectedRevision:2,goal:'Changed during review'});
    expect((await s.control('galcraft_collaboration',{action:'apply',reviewId:stale.plan.reviewId,authorDecision:'confirm'})).error.code).toBe('SCOPE_CONFLICT');
    const reviewed=value(await s.control('galcraft_collaboration',{action:'prepareScope',sessionId:session.sessionId,expectedRevision:3,scope:session.scope}));
    value(await s.control('galcraft_collaboration',{action:'apply',reviewId:reviewed.plan.reviewId,authorDecision:'confirm'}));
    const saved=await s.service.core.invoke('galcraft_save',{action:'save',planId:plan.planId},session.sessionId,'save-allowed');expect(saved.state,JSON.stringify(saved)).toBe('completed');expect(project.dirtyIds()).toEqual([unrelated.documentId]);
  });
  it('HSC-05: keeps the target on cancel/failed save, resolves the reviewed conflict, and enforces pause/resume/end',async()=>{
    const s=await setup();await s.project('switch-first');const directory=s.projects.currentRoot,project=s.projects.currentSession;
    const doc=[...project.documents.values()].find(document=>document.files['project.json']),session=await s.collaborate(s.scope([doc.documentId]));await s.edit(session,[doc],'dirty');
    const create=value(await s.control('galcraft_projects',{action:'prepareCreate',project:{path:s.root,name:'switch-next',template:'light',width:1920,height:1080,engineVersion:'0.1.0'}}));
    value(await s.control('galcraft_projects',{action:'apply',reviewId:create.plan.reviewId,authorDecision:'cancel'}));expect(s.projects.currentRoot).toBe(directory);expect(project.dirtyIds()).not.toEqual([]);
    const changed=JSON.parse(await readFile(join(directory,'project.json'),'utf8'));changed.data.name='Disk author';await writeFile(join(directory,'project.json'),JSON.stringify(changed));
    const conflict=value(await s.control('galcraft_projects',{action:'prepareCreate',project:{path:s.root,name:'switch-conflict',template:'light',width:1920,height:1080,engineVersion:'0.1.0'}}));
    const failed=await s.control('galcraft_projects',{action:'apply',reviewId:conflict.plan.reviewId,authorDecision:'confirm',closeChoice:'save'});expect(failed.error.code).toBe('EXTERNAL_CONFLICT');expect(s.projects.currentSession).toBe(project);
    const resolve=value(await s.control('galcraft_projects',{action:'prepareConflict',planId:failed.error.savePlanId,choice:'local'}));expect(resolve.plan.conflicts.length).toBeGreaterThan(0);
    value(await s.control('galcraft_projects',{action:'apply',reviewId:resolve.plan.reviewId,authorDecision:'confirm'}));
    expect(s.projects.currentSession).toBe(project);expect(project.getConflict(failed.error.savePlanId)).toEqual([]);
    value(await s.control('galcraft_collaboration',{action:'pause',sessionId:session.sessionId,expectedRevision:1}));
    await expect(s.service.core.invoke('galcraft_edit',{edit:{label:'pause',origin:'field',expected:[],patches:[],preparedAssets:[],requiredRefs:[]}},session.sessionId,'paused')).rejects.toMatchObject({code:'SESSION_PAUSED'});
    value(await s.control('galcraft_collaboration',{action:'resume',sessionId:session.sessionId,expectedRevision:2}));
    value(await s.control('galcraft_collaboration',{action:'end',sessionId:session.sessionId,expectedRevision:3}));
    const ended=await s.control('galcraft_collaboration',{action:'resume',sessionId:session.sessionId,expectedRevision:4});expect(ended.error.code).toBe('SESSION_ENDED');
  });
  it('HSC-05: restores an actual M02 disk draft through the public recovery review',async()=>{
    const s=await setup();await s.project('recover');const before=s.projects.currentSession;
    const doc=[...before.documents.values()].find(document=>document.files['project.json']),session=await s.collaborate(s.scope([doc.documentId]));await s.edit(session,[doc],'recover-edit');
    await before.writeDraft();expect((await before.dispose('keep')).ok).toBe(true);expect((await s.projects.reopenCommitted()).ok).toBe(true);
    const recovery=await s.control('galcraft_projects',{action:'recovery'});expect(recovery.draft).not.toBeNull();
    const prepared=value(await s.control('galcraft_projects',{action:'prepareRecovery',choice:'restore'}));
    value(await s.control('galcraft_projects',{action:'apply',reviewId:prepared.plan.reviewId,authorDecision:'cancel'}));expect(s.projects.currentSession.dirtyIds()).toEqual([]);
    const reviewed=value(await s.control('galcraft_projects',{action:'prepareRecovery',choice:'restore'}));
    value(await s.control('galcraft_projects',{action:'apply',reviewId:reviewed.plan.reviewId,authorDecision:'confirm'}));
    expect(s.projects.currentSession.dirtyIds()).toContain(doc.documentId);expect(JSON.parse(s.projects.currentSession.readDocument(doc.documentId).files['project.json']).data.name).toBe(`Edited ${doc.documentId}`);
  });
});
