import {afterEach,expect,it} from 'vitest';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {z} from 'zod';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {components,componentTextOverride,readTemplateDocuments,createOfficialTemplate,createTemplateDocuments,preparePageEdit} from '@galcraft/templates';
import {ProjectSession} from '@galcraft/documents';
import {currentProjectScope} from '@galcraft/collaboration';
import {StudioCollaboration} from './collaboration-providers.mjs';
import {StudioPluginPackages} from './plugin-packages.mjs';
import {exactContract,discoverySchema,bundleDefinitions} from './collaboration-projection.mjs';

it('retains fragment-local recursive definition closures when composing selected contracts',()=>{
  const fragment=type=>({type:'object',properties:{value:{$ref:'#/$defs/Value'}},required:['value'],additionalProperties:false,$defs:{Value:{type}}});
  const root=bundleDefinitions({oneOf:[{type:'object',properties:{action:{const:'first'},payload:fragment('string')},required:['action','payload']},{type:'object',properties:{action:{const:'second'},payload:fragment('number')},required:['action','payload']}]});
  for(const [action,value]of [['first','voice'],['second',42]]){
    const selected=exactContract(root,{action});expect(Object.keys(selected.$defs)).toHaveLength(1);
    const parsed=z.fromJSONSchema(selected);expect(parsed.safeParse({action,payload:{value}}).success).toBe(true);
    expect(parsed.safeParse({action,payload:{value:typeof value==='string'?42:'wrong'}}).success).toBe(false);
  }
});

it('selects provider field groups and individual domain fields with only their required definition closure',()=>{
  const schema={type:'object',properties:{description:{type:'string'},score:{$ref:'#/$defs/Score'},constraints:{$ref:'#/$defs/Limits'}},required:['description'],additionalProperties:false,$defs:{Score:{type:'object',properties:{notes:{type:'array',items:{type:'number'}}}},Limits:{type:'object',properties:{bpm:{$ref:'#/$defs/Bpm'}},additionalProperties:false},Bpm:{type:'number',minimum:20,maximum:300},Unused:{type:'string'}}};
  const selected=exactContract(schema,{fieldGroup:'constraints'});
  expect(Object.keys(selected.properties)).toEqual(['constraints']);expect(Object.keys(selected.$defs).sort()).toEqual(['Bpm','Limits']);
  expect(z.fromJSONSchema(selected).safeParse({constraints:{bpm:96}}).success).toBe(true);
  expect(z.fromJSONSchema(selected).safeParse({constraints:{bpm:400}}).success).toBe(false);
  const group=exactContract(schema,{fieldGroup:'creative',fieldGroups:{creative:['description','constraints']}});
  expect(Object.keys(group.properties)).toEqual(['description','constraints']);expect(group.required).toEqual(['description']);
  expect(()=>exactContract(schema,{fieldGroup:'missing'})).toThrow('does not expose');
});

const base=resolve('../../tmp/testing/projects/a/refinement-mcp'),profile=resolve('../../tmp/testing/user-data/refinement-mcp');
const evidence=resolve('../../test-results/latest/music-workflow-ports/mcp');
let service,project,client;
afterEach(async()=>{await client?.close();await service?.close();await project?.dispose('discard');client=service=project=null;await rm(base,{recursive:true,force:true});await rm(profile,{recursive:true,force:true});});
async function setup(installedPlugins,additional=[]){
  const template=createOfficialTemplate();
  project=await ProjectSession.createProject(base,'Proj01',[...createTemplateDocuments(template),...additional]);
  const plugins=installedPlugins??{externalTools:async()=>[],dependencies:()=>[],acquireDefinitions:async()=>({ok:true,value:{documents:[],components:[],pages:[],release:async()=>{}}})};
  service=new StudioCollaboration({userData:profile,projects:{currentSession:project,currentRoot:base,currentSessionId:'Write1'},production:{generationProviders:{operations:async()=>[]}},assets:{},plugins});await service.ready;
  const session=await service.core.create({projectId:'Proj01',projectRoot:base,writeSessionId:'Write1',projectName:'Projection fixture',goal:'Refine a page',harness:'codex',scope:currentProjectScope()});
  const {endpoint}=await service.mcp.start();client=new Client({name:'refinement-acceptance',version:'0.1.0'},{versionNegotiation:{mode:'auto'}});await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const calls=[];
  const call=async(name,input,callId,extra={})=>{const args={projectId:'Proj01',sessionId:session.id,...(callId?{callId}:{}),input,...extra};const response=await client.callTool({name,arguments:args});calls.push({name,inputBytes:Buffer.byteLength(JSON.stringify(args)),outputBytes:Buffer.byteLength(JSON.stringify(response))});expect(response.isError,JSON.stringify(response)).not.toBe(true);return response.structuredContent;};
  return {template,session,call,calls};
}

it('discovers component text on demand and applies one Player language through the same M08 transaction',async()=>{
  const {template,call}=await setup(),page=template.pages[0],button=components(page.root).find(component=>component.part==='title.menu.characters');
  const discoveryBefore=await client.listTools(),catalog=await call('galcraft_pages',{action:'catalog',part:'page'});
  expect(catalog.result.operations).toContain('component.text');
  const selected=await call('galcraft_pages',{action:'read',componentId:button.id});expect(selected.result.component.displayText.editable).toBe(true);
  const contract=await call('galcraft_pages',{action:'catalog',part:'page',operationKinds:['component.text']});
  const request={label:'After story',operations:[{kind:'component.text',pageId:page.id,componentId:button.id,locale:'zh-CN',text:'After story'}]};
  expect(z.fromJSONSchema(contract.result.requestSchema).safeParse({action:'prepare',request}).success).toBe(true);
  const prepared=await call('galcraft_pages',{action:'prepare',request},'text-plan');expect(prepared.state).toBe('completed');
  const applied=await call('galcraft_pages',{action:'apply',planId:prepared.result.plan.planId,expected:prepared.result.plan.expected},'text-apply');expect(applied.state).toBe('completed');
  const stored=readTemplateDocuments([...project.documents.values()]),changed=components(stored.pages[0].root).find(component=>component.id===button.id);
  expect(componentTextOverride(changed,stored.locales,'zh-CN')).toBe('After story');expect(componentTextOverride(changed,stored.locales,'en')).toBeUndefined();expect(project.operations).toHaveLength(1);
  const discoveryAfter=await client.listTools();expect(discoveryAfter.tools).toEqual(discoveryBefore.tools);
  await mkdir(resolve('../../test-results/latest/d28-page-player'),{recursive:true});
  await writeFile(resolve('../../test-results/latest/d28-page-player/mcp.json'),JSON.stringify({toolCount:discoveryAfter.tools.length,totalBytes:Buffer.byteLength(JSON.stringify(discoveryAfter.tools)),pagesBytes:Buffer.byteLength(JSON.stringify(discoveryAfter.tools.find(tool=>tool.name==='galcraft_pages'))),operation:'component.text',transactionDocuments:applied.result.receipt.documents.length,actualPlugins:'core fixture, no additional plugins',result:'passed'},null,2));
},20000);

it('measures the actual SDK discovery and preserves complex, scalar and array payloads under authoritative validation',async()=>{
  const {session,call}=await setup(),core=await client.listTools();
  expect(core.tools).toHaveLength(25);expect(core.tools.every(tool=>!tool.outputSchema)).toBe(false); // controls retain their small dedicated result contract
  expect(core.tools.find(tool=>tool.name==='galcraft_edit_prepare').outputSchema).toBeUndefined();
  const definitions=service.core.catalog(),byKey=new Map(definitions.map(tool=>[tool.key,tool]));
  const rows=core.tools.map(tool=>({key:tool.name,discoveryBytes:Buffer.byteLength(JSON.stringify(tool)),executionInputBytes:byKey.has(tool.name)?Buffer.byteLength(JSON.stringify(byKey.get(tool.name).inputSchema)):null}));
  const observed=[];
  for(const [key,inputSchema,input] of [['scalar_fixture',{type:'string'},'exact scalar'],['array_fixture',{type:'array',items:{type:'integer'}},[1,2,3]],['complex_fixture',{type:'object',properties:{payload:{type:'object',properties:{text:{type:'string'},nested:{type:'array',items:{type:'object',properties:{keep:{type:'string'}},required:['keep'],additionalProperties:false}}},required:['text','nested'],additionalProperties:false}},required:['payload'],additionalProperties:false},{payload:{text:'x'.repeat(12000),nested:[{keep:'preserved'}]}}]]){
    service.core.register({definition:{key,title:'Protocol fixture',description:'Controlled transport fixture',inputSchema,outputSchema:true,effects:['read'],version:'0.1.0',async:false,cancel:false},constraints:()=>({effects:['read']}),execute:async value=>{observed.push(value);return value;}});
    const result=await call(key,input);expect(result.result).toEqual(input);
  }
  const invalid=await client.callTool({name:'array_fixture',arguments:{projectId:'Proj01',sessionId:session.id,input:['wrong']}});expect(invalid.isError).toBe(true);
  expect(observed).toHaveLength(3);
  service.core.register({definition:{key:'wrong_result_fixture',title:'Controlled invalid result',description:'Exact output rejection fixture',inputSchema:{type:'object'},outputSchema:{type:'string'},effects:['read'],version:'0.1.0',async:false,cancel:false},constraints:()=>({effects:['read']}),execute:async()=>42});
  const invalidOutput=await call('wrong_result_fixture',{});expect(invalidOutput.state).toBe('failed');expect(invalidOutput.error.code).toBe('TOOL_OUTPUT');expect(invalidOutput.result).toBe(null);
  const media=definitions.find(tool=>tool.key==='galcraft_media');const frame=exactContract(media.inputSchema,{action:'frame'});
  expect(z.fromJSONSchema(frame).safeParse({mode:'frame',source:{kind:'asset',assetId:'Asset1'},timeSec:1}).success).toBe(true);
  expect(z.fromJSONSchema(frame).safeParse({mode:'frame',source:{kind:'asset',assetId:'Asset1'},frame:2}).success).toBe(true);
  const preview=definitions.find(tool=>tool.key==='galcraft_preview');expect(z.fromJSONSchema(preview.inputSchema).safeParse({}).success).toBe(true);
  const raw=definitions.find(tool=>tool.key==='galcraft_edit_prepare');expect(exactContract(raw.inputSchema,{action:'edit'}).properties.edit).toBeTruthy();
  const recursive={anyOf:[{type:'object',properties:{action:{const:'group'},children:{type:'array',items:{$ref:'#'}}},required:['action','children'],additionalProperties:false},{type:'object',properties:{action:{const:'text'},text:{type:'string'}},required:['action','text'],additionalProperties:false}]};
  expect(z.fromJSONSchema(exactContract(recursive,{action:'group'})).safeParse({action:'group',children:[{action:'text',text:'nested content'}]}).success).toBe(true);
  const pages=definitions.find(tool=>tool.key==='galcraft_pages');const contract=exactContract(pages.inputSchema,{action:'prepare',operationKinds:['component.update'],fieldGroup:'layout'});
  expect(JSON.stringify(contract)).toContain('layout');expect(()=>z.fromJSONSchema(contract)).not.toThrow();
  await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'discovery.json'),JSON.stringify({coreCount:core.tools.length,coreBytes:Buffer.byteLength(JSON.stringify(core.tools)),rows,protocolFixtures:3,actualPlugins:'measured separately with the installed exact packages',tokenCacheCost:'unavailable'},null,2));
});

it('deletes ended personal prepare reviews from the original project while preserving committed document facts',async()=>{
  const {template,session,call}=await setup(),page=template.pages[0];
  const edit={label:'Unapplied personal review',origin:'field',expected:[{ref:{kind:'document',id:page.id},revision:1}],patches:[{kind:'json',documentId:page.id,changes:[{path:'/data/root/layout/gap',op:'set',before:page.root.layout.gap,after:28}]}],preparedAssets:[],requiredRefs:[]};
  const prepared=await call('galcraft_edit_prepare',{edit},'private-review'),path=join(base,'.galcraft/external-plans',`${session.id}-private-review.json`);expect(await readFile(path,'utf8')).toContain('Unapplied personal review');
  const ended=await service.core.end({id:session.id,expectedRevision:1});const deleted=await service.call('deleteEnded',{id:session.id,expectedRevision:ended.scopeRevision});expect(deleted.ok).toBe(true);
  await expect(readFile(path,'utf8')).rejects.toMatchObject({code:'ENOENT'});expect(project.editPlans.has(prepared.result.plan.planId)).toBe(false);expect(project.operations).toHaveLength(0);expect(project.readDocument(page.id)).toBeTruthy();
});

it('reads environment readiness and summarizes original records without accepting rejected inputs or duplicating a query as a business failure',async()=>{
  const {session,call}=await setup();
  const environment=await call('galcraft_context',{mode:'environment'});expect(environment.result.capture.ready).toBe(false);expect(environment.result.plugins).toEqual([]);
  const rejected=await client.callTool({name:'galcraft_context',arguments:{projectId:'Proj01',sessionId:session.id,input:{notAField:true}}});expect(rejected.isError).toBe(true);
  expect(service.core.records().filter(record=>record.state==='failed')).toHaveLength(0);
  await client.callTool({name:'galcraft_call',arguments:{projectId:'Proj01',sessionId:session.id,callId:environment.callId}});
  const statistics=await call('galcraft_context',{mode:'statistics'});expect(statistics.result.actualGenerationSends).toBe(0);expect(statistics.result.transport.originalQueries,JSON.stringify(statistics.result)).toBeGreaterThanOrEqual(1);expect(statistics.result.transport.rejectedRequests,JSON.stringify(statistics.result)).toBeGreaterThanOrEqual(1);expect(statistics.result.accepted.states.failed??0).toBe(0);
});

it('holds the explicitly handed-off stable object and original revision until a new author handoff',async()=>{
  const {template,call}=await setup(),page=template.pages[0],target={ref:{kind:'component',id:page.root.id},source:{documentId:page.id,revision:1}};
  expect((await service.call('handoffTarget',{target})).ok).toBe(true);
  expect((await call('galcraft_context',{mode:'target'})).result).toEqual({mode:'target',target,stale:false});
  const prepared=preparePageEdit({documents:[...project.documents.values()],request:{label:'An intervening edit',operations:[{kind:'component.update',pageId:page.id,componentId:page.root.id,changes:{visible:!page.root.visible}}]}});
  const plan=project.planEdit(prepared.edit).value;expect(project.applyEdit(plan.planId,plan.input.expected).ok).toBe(true);
  expect((await call('galcraft_context',{mode:'target'})).result).toEqual({mode:'target',target,stale:true});
});

it('measures the two actual exact plugin tools separately from the 25 core tools',async()=>{
  const plugins=new StudioPluginPackages(join(profile,'installed'),{}),ids=['org.galcraft.motion-canvas','org.galcraft.music-composition'];
  for(const folder of ['motion-canvas','music-composition']){const installed=await plugins.install({kind:'directory',path:resolve('../../plugins',folder,'package')});expect(installed.ok,JSON.stringify(installed)).toBe(true);}
  const {call}=await setup(plugins,[{documentId:'Lock01',revision:1,format:'json',files:{'dependencies.lock.json':JSON.stringify({schemaVersion:1,documentId:'Lock01',revision:1,data:{plugins:ids.map(id=>({id,version:'0.1.0',required:true}))}})}}]);
  service.production.generationProviders.operations=async()=>{
    const acquired=await plugins.acquireDefinitions(project);expect(acquired.ok,JSON.stringify(acquired)).toBe(true);
    try{return acquired.value.productionOperations.map(({definition,provider})=>({id:definition.id,version:definition.version,provider,definition}));}finally{await acquired.value.release();}
  };
  const {tools}=await client.listTools();expect(tools).toHaveLength(27);
  const actual=tools.filter(tool=>tool.name.endsWith('__projectInfo')||tool.name.endsWith('__soundbankInfo'));expect(actual).toHaveLength(2);
  const top=JSON.stringify(tools.map(tool=>tool.inputSchema));expect(top).not.toContain('durationTicks');expect(top).not.toContain('musicConstraints');
  const writing='org.galcraft.music-composition/writeScore';
  const selected=await call('galcraft_catalog',{category:'operations',key:writing,fieldGroup:'musicConstraints'});
  const contract=selected.result.entries[0].inputSchema;expect(Object.keys(contract.properties)).toEqual(['musicConstraints']);expect(JSON.stringify(selected.result.entries[0])).not.toContain('durationTicks');expect(selected.result.entries[0].definition.inputSchema).toBeUndefined();
  expect(z.fromJSONSchema(contract).safeParse({musicConstraints:{fixedBpm:96}}).success).toBe(true);
  expect(z.fromJSONSchema(contract).safeParse({musicConstraints:{fixedBpm:400}}).success).toBe(false);
  await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'actual-plugins.json'),JSON.stringify({totalBytes:Buffer.byteLength(JSON.stringify(tools)),rows:tools.map(tool=>({key:tool.name,bytes:Buffer.byteLength(JSON.stringify(tool))})),plugins:actual.map(tool=>({key:tool.name,bytes:Buffer.byteLength(JSON.stringify(tool)),title:tool.title})),selectedContractBytes:Buffer.byteLength(JSON.stringify(contract)),modelRequests:0},null,2));
},30000);

it('reads local contracts and complete mixed layout/CSS differences, then applies, undoes, redoes and saves one real M02 transaction',async()=>{
  const {template,session,call,calls}=await setup(),page=template.pages.find(page=>page.key==='title');
  const directory=await call('galcraft_pages',{action:'read'});expect(directory.result.template).toBeUndefined();expect(directory.result.directory.pages.length).toBeGreaterThan(0);
  const context=await call('galcraft_context',{});expect(context.result.documents).toEqual([]);expect(context.result.contracts).toBeUndefined();
  const catalog=await call('galcraft_catalog',{category:'tools',key:'galcraft_pages',action:'prepare',operationKinds:['component.update'],fieldGroup:'layout'});expect(catalog.result.entries[0].inputSchema).toBeTruthy();expect(catalog.result.entries[0].outputSchema).toBeUndefined();expect(catalog.result.entries[0].guide.inputSchema).toBeUndefined();
  const current=await call('galcraft_pages',{action:'read',pageId:page.id});expect(current.result.page.id).toBe(page.id);
  const request={label:'Layout and authored CSS',operations:[{kind:'component.update',pageId:page.id,componentId:page.root.id,changes:{layout:{gap:36}}}]};
  const prepared=preparePageEdit({documents:[...project.documents.values()],request});expect(prepared.edit).toBeTruthy();
  const edit=prepared.edit;edit.patches.push({kind:'file',documentId:page.id,path:'ui/styles/refinement.css',before:null,after:'.page-title { color: rgb(30 50 80); }'});
  const plan=await call('galcraft_edit_prepare',{edit},'mixed-plan');expect(plan.state).toBe('completed');expect(plan.result.plan.preview).toBeUndefined();expect(plan.result.plan.input.patches).toBeUndefined();
  const full=await client.callTool({name:'galcraft_call',arguments:{projectId:'Proj01',sessionId:session.id,callId:'mixed-plan',resultPath:'/plan/input'}});expect(full.structuredContent.result.value.patches).toHaveLength(2);expect(full.structuredContent.result.value.patches[0].changes[0]).toMatchObject({path:'/data/root/layout/gap',after:36});expect(full.structuredContent.result.value.patches[1].after).toBe(edit.patches[1].after);
  const changes=await client.callTool({name:'galcraft_call',arguments:{projectId:'Proj01',sessionId:session.id,callId:'mixed-plan',resultPath:'/changes',offset:0,limit:1}});expect(changes.structuredContent.result.total).toBe(2);expect(changes.structuredContent.result.nextOffset).toBe(1);
  for(const [resultPath,response]of [['/plan/input',full],['/changes',changes]])calls.push({name:'galcraft_call',resultPath,inputBytes:Buffer.byteLength(JSON.stringify({projectId:'Proj01',sessionId:session.id,callId:'mixed-plan',resultPath})),outputBytes:Buffer.byteLength(JSON.stringify(response))});
  const applied=await call('galcraft_edit_apply',{planId:plan.result.plan.planId,expected:plan.result.plan.expected},'mixed-apply');expect(applied.state).toBe('completed');expect(project.operations).toHaveLength(1);
  const undo=await call('galcraft_history',{action:'prepareUndo',documentId:page.id,operationId:applied.result.operationId});
  const undone=await call('galcraft_history',{action:'undo',planId:undo.result.plan.planId,expected:undo.result.plan.expected},'mixed-undo');expect(undone.state).toBe('completed');
  const redone=await call('galcraft_history',{action:'redo',planId:undo.result.plan.planId,expected:undone.result.receipt.documents},'mixed-redo');expect(redone.state).toBe('completed');
  const save=await call('galcraft_save',{action:'plan',scope:{kind:'all'}});expect(save.result.plan.preview).toBeUndefined();expect(save.result.scopeIssues).toEqual([]);
  const saved=await call('galcraft_save',{action:'save',planId:save.result.plan.planId},'mixed-save');expect(saved.state).toBe('completed');expect(project.dirtyIds()).toEqual([]);
  await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'mixed-edit.json'),JSON.stringify({calls,operationCount:project.operations.length,patches:edit.patches.length,save:saved.result,modelRequests:0,cacheAndFees:'unavailable'},null,2));
});
