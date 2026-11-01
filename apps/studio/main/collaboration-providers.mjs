import { readFile,writeFile,mkdir,readdir,rm,rename,stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join,isAbsolute,resolve } from 'node:path';
import {z} from 'zod';
import { createId, CollaborationScopeSchema,EditInputSchema,EditReceiptSchema,EditPlanSchema,JsonSchema,SceneSchema,VersionRefSchema,PositionSchema,DebugScenarioSchema,PageKeySchema,readPluginDocumentInstances,LayoutSchema,VisualSchema } from '@galcraft/contracts';
import {CoreCommandSpecsEnglish as CoreCommandSpecs,parse} from '@galcraft/dsl';
import { CollaborationService, CollaborationError, harnessContent, harnessLaunch, mergeHarness, harnessReadback, writeHarness, currentProjectScope, creativeSkillFiles, previewSkillFiles } from '@galcraft/collaboration';
import { CollaborationMcp } from './collaboration-mcp.mjs';
import { endpointPort } from './local-service-ports.mjs';
import { CollaborationControl } from './collaboration-control.mjs';
import { registerLifecycleTools } from './collaboration-lifecycle.mjs';
import { compileCollaborationProject } from './collaboration-compile.mjs';
import { registerPageTools } from './collaboration-pages.mjs';
import { registerCompositionTools } from './collaboration-composition.mjs';
import { ok, fail } from './result.mjs';
import { CollaborationMedia } from './collaboration-media.mjs';
import { domainCatalog, toolGuide, toolSummary } from './collaboration-catalog.mjs';
import { pageSlice, bundleDefinitions } from './collaboration-projection.mjs';
import { CatalogCategories, preparePresetEdit, PresetEditInputSchema, scopedRecipes } from './collaboration-presets.mjs';
import { PluginDocuments } from './plugin-documents.mjs';
import { PluginPlayerUi } from './plugin-authoring.mjs';
import { AssetsInputSchema, assetQuery, assetSummary, resourceCandidateSummaryView, editChanges, outputSchemas, PreviewInputSchema, HistoryInputSchema, taskView, candidateView, planView, previewView, sessionSummary,ComponentEditInputSchema } from './collaboration-contracts.mjs';

import { ProductionTargetSchema, ContextPartSchema, CandidateAdoptionChoiceSchema, ProductionFormDraftSchema } from '@galcraft/authoring/production';
import {RecipeUsageSchema} from '@galcraft/authoring/recipes';
import { workflowSupportsPurpose } from '@galcraft/generation-services/validation';
import {deleteExternalEditReviews} from '@galcraft/documents';
import {AuthorOperationSchema,prepareAuthoringEdit} from '@galcraft/documents/authoring';
import {RefSchema,SourceSchema} from '@galcraft/contracts';

const unwrap = result => { if (!result.ok) throw new CollaborationError(result.error.code,result.error.message,result.error); return result.value; };
const json = value => JSON.parse(JSON.stringify(value ?? null));
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = { type: 'string' }, anyObject = { type: 'object', additionalProperties: true };
const createdDocuments = (project, session) => project.externalDocuments(session.id).filter(documentId => {
  const document = project.readDocument(documentId);if (!document) return false;
  const paths = Object.keys(document.files), kind = paths.some(path => path.endsWith('scene.json')) ? 'scene' : paths.some(path => path.startsWith('characters/')) ? 'character' : 'document';
  return session.scope.mode === 'currentProject' || session.scope.createKinds.includes(kind);
});
const jsonSchema=value=>z.toJSONSchema(value,{io:'input'});
const versions=jsonSchema(z.array(VersionRefSchema));
const selection={type:'array',items:schema({itemId:str,candidateId:str},['itemId','candidateId'])};
const recipeIdentity=schema({id:str,scope:{enum:['official','personal','project']},revision:{type:'integer',minimum:0}},['id','scope','revision']);
const recipeSelection={...recipeIdentity,properties:{...recipeIdentity.properties,purpose:str,parameterValues:{type:'object',additionalProperties:{anyOf:[{type:'string'},{type:'number'},{type:'boolean'},{type:'null'}]}}},required:[...recipeIdentity.required,'purpose','parameterValues']};
const productionSchema={oneOf:[
  ...['drafts'].map(action=>schema({action:{const:action},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},['action'])),
  schema({action:{const:'draft'},draftId:str},['action','draftId']),
  schema({action:{const:'saveDraft'},draft:jsonSchema(ProductionFormDraftSchema),expectedRevision:{type:['integer','null'],minimum:0}},['action','draft','expectedRevision']),
  schema({action:{const:'prepareDraft'},draftId:str,name:str},['action','draftId','name']),
  schema({action:{const:'frozen'},taskId:str,itemId:str},['action','taskId']),
  schema({action:{const:'defaults'},usage:jsonSchema(RecipeUsageSchema),operation:str},['action','usage']),
  schema({action:{const:'keepResults'},taskId:str,itemId:str,versions},['action','taskId','itemId','versions']),
  schema({action:{const:'transferPrompt'},candidateId:str,draftId:str,usage:jsonSchema(RecipeUsageSchema),expectedDraftRevision:{type:'integer',minimum:0},acceptedFields:{type:'array',items:str},omittedPorts:{type:'array',items:str}},['action','candidateId','draftId','usage','expectedDraftRevision','acceptedFields','omittedPorts']),
  schema({action:{const:'planContinuation'},taskId:str,candidateId:str,instruction:str,mode:{enum:['write','performance','discuss']},summary:str},['action','taskId','candidateId','instruction','mode']),
  schema({action:{const:'submitContinuation'},taskId:str,planId:str},['action','taskId','planId']),
  schema({action:{const:'prepare'},operation:str,connectionId:str,model:str,workflowId:str,usage:str,fields:anyObject,target:jsonSchema(ProductionTargetSchema.partial()),name:str,context:jsonSchema(z.array(ContextPartSchema)),sourceVersions:versions,recipe:recipeSelection,productionRecipe:recipeIdentity,parameterPreset:recipeIdentity,parameterOverrides:anyObject,references:{type:'array',items:schema({assetId:str,variantId:str,port:str},['assetId','variantId','port'])}},['action','operation','connectionId','fields']),
  schema({action:{const:'submit'},planId:{type:'string',description:'Use result.planId from prepare, not a task ID.'}},['action','planId']),
  schema({action:{const:'editCandidate'},taskId:str,candidateId:str,text:str},['action','taskId','candidateId','text']),
  schema({action:{const:'inspectConnection'},operation:str,connectionId:str,workflowId:str,usage:str},['action','operation','connectionId']),
  schema({action:{const:'tasks'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},['action']),schema({action:{const:'candidate'},candidateId:str,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:24000},full:{type:'boolean'}},['action','candidateId']),
  schema({action:{const:'wait'},taskId:str,timeoutMs:{type:'integer',minimum:0,maximum:30000,default:25000}},['action','taskId']),
  ...['inspectResources','releaseResources'].map(action=>schema({action:{const:action},taskId:str,itemId:str},['action','taskId','itemId'])),
  ...['select','prepareAdoption'].map(action=>schema({action:{const:action},taskId:str,selections:selection,expected:versions,adoptions:jsonSchema(z.record(z.string(),CandidateAdoptionChoiceSchema).describe('Choices keyed by candidateId from selections. An itemId is not a candidate choice key.'))},['action','taskId','selections'])),
  schema({action:{const:'adopt'},planId:str,expected:versions},['action','planId','expected']),
  ...['cancel','resume'].map(action=>schema({action:{const:action},taskId:str},['action','taskId'])),
  ...['query','refetch','reprocess'].map(action=>schema({action:{const:action},taskId:str,itemId:str,...(action==='reprocess'?{text:str,candidateId:str}:{})},['action','taskId','itemId'])),
]};

export class StudioCollaboration {
  constructor({ userData, projects, assets, production, plugins, window, dialog, preview, capture, host }) {
    Object.assign(this, { userData, projects, assets, production, plugins, window, dialog, preview, capture });
    this.core = new CollaborationService(join(userData, 'collaboration'), () => projects.currentSession ? { projectId: projects.currentSession.projectId, writeSessionId: projects.currentSessionId,createdDocuments:id=>createdDocuments(projects.currentSession,this.core.get(id)) } : null);
    this.externalKeys=new Set();
    this.media = new CollaborationMedia({ assets, production, cacheRoot:join(userData,'collaboration-review-cache'), authorize: context => { this.project(context,false); this.core.check(context,context.toolKey,{effects:['read']}); }, taskInScope: (task,context) => this.taskInScope(task,context), endpoint: () => this.mcp.endpoint });
    this.pluginDocuments = new PluginDocuments(projects, plugins);this.playerUi=new PluginPlayerUi(projects,plugins);
    this.control = new CollaborationControl(this,host);
    this.mcp = new CollaborationMcp({ control:this.control, catalog: async () => {await this.ready;await this.syncExternalTools();return this.core.catalog();}, sessions: async ({projectId,offset=0,limit=50}={}) => {await this.ready;const sessions=this.core.list().filter(session=>!projectId||session.projectId===projectId).map(sessionSummary);return {sessions:sessions.slice(offset,offset+limit),total:sessions.length,offset,limit};},
      capabilities: target => this.capabilities(target), bootstrap: async({projectId})=>{await this.ready;const binding=this.control.binding();if(!binding||binding.projectId!==projectId)throw new CollaborationError('BINDING_STALE','Bootstrap the actual current project returned by galcraft_projects.');return {mode:'bootstrap',projectId:binding.projectId,projectRoot:binding.directory,writeSessionId:binding.writeSessionId,next:'Explicitly use galcraft_collaboration prepareCreate with this projectId/writeSessionId, then apply the review. Keep the returned sessionId for every project call.'};}, receipt: ({projectId,sessionId,callId}) => {this.assertRecovery({projectId,sessionId});return this.core.query(sessionId,callId);},cancel:({projectId,sessionId,callId})=>{this.assertRecovery({projectId,sessionId});return this.core.cancel(sessionId,callId);},
      invoke: async ({tool,input,projectId,sessionId,callId,signal}) => {this.assertBinding({projectId,sessionId});return this.core.invoke(tool,input,sessionId,callId,signal);}, recoverTask:target=>this.recoverTask(target), media: this.media });
    this.ready = Promise.all([this.core.open(),this.media.ready]).then(async () => {
      this.registerCore();
      try {this.serviceSettings=await this.readServiceSettings();}
      catch(error) {this.serviceSettings={enabled:false};this.serviceSettingsUnavailable=true;this.serviceError={code:error.code??'MCP_SETTINGS_READ_FAILED',message:String(error.message??error)};this.changed();return;}
      if(this.serviceSettings.enabled)await this.startService({restore:true});
    });
    production.authorize = async (task, item, consume) => {
      const collaboration=task.executionCollaboration??task.collaboration;if(!collaboration)return;
      const constraint = this.itemConstraint(item);
      if(item.providerSnapshot?.execution==='local'){this.core.check(collaboration,collaboration.toolKey??'galcraft_production',constraint);return;}
      await this.core.authorize(collaboration, collaboration.toolKey ?? 'galcraft_production', constraint,
        consume && item.providerSnapshot?.execution !== 'local' ? item.attempts.at(-1)?.id : undefined);
    };
  }
  async readServiceSettings(){try{return JSON.parse(await readFile(join(this.userData,'collaboration/service.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return {enabled:false};throw error;}}
  async saveServiceSettings(value){const directory=join(this.userData,'collaboration');await mkdir(directory,{recursive:true});const temporary=join(directory,'service.json.tmp');try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n');await rename(temporary,join(directory,'service.json'));}catch(error){await rm(temporary,{force:true}).catch(()=>{});throw error;}this.serviceSettings=value;}
  async startService({restore=false}={}) {
    let result;
    try {
      if(this.serviceSettingsUnavailable){this.serviceSettings=await this.readServiceSettings();this.serviceSettingsUnavailable=false;}
      const previousPort=this.serviceSettings.port;
      result=await this.mcp.start(undefined,{previousPort});
      const previous=this.serviceSettings.endpoint??`http://127.0.0.1:${previousPort??9460}/mcp`;
      await this.saveServiceSettings({...this.serviceSettings,enabled:true,port:endpointPort(result.endpoint),endpoint:result.endpoint});
      if(previous!==result.endpoint)this.serviceAddressChange={previous,current:result.endpoint};
    }
    catch(error) {
      if(result)await this.mcp.stop().catch(()=>{});
      this.serviceError={code:error.code??'MCP_START_FAILED',message:String(error.message??error)};
      this.changed();if(!restore)throw error;return;
    }
    this.serviceError=null;this.changed();return result;
  }
  serviceStatus() {return {state:this.serviceError?'failed':this.mcp.endpoint?'running':'stopped',...(this.serviceError?{error:this.serviceError}:{}),...(this.serviceAddressChange?{addressChange:this.serviceAddressChange}:{})};}
  /** Resolve actual M02 identities. A paused or restricted binding keeps its meaning. */
  async ensureCurrentSession({harness='codex',goal='Create in the current project',create=false}={}){
    await this.ready;
    const work=(this.bindingWork??Promise.resolve()).catch(()=>{}).then(async()=>{
      const project=this.projects.currentSession;if(!project)throw new CollaborationError('PROJECT_SESSION_MISSING','Use galcraft_projects to create or open a project first.');
      const source=this.core.active(project.projectId);
      if(source){
        if(this.core.valid(source))return source;
        const scope=source.scope.mode==='currentProject'?source.scope:{...source.scope,documents:[...new Set([...source.scope.documents,...createdDocuments(project,source)])].filter(id=>project.documents.has(id))};
        return this.core.rebind({id:source.id,expectedRevision:source.scopeRevision,writeSessionId:this.projects.currentSessionId,scope,paused:source.paused});
      }
      if(!create)return null;
      const document=[...project.documents.values()].find(document=>document.files['project.json']);
      const created=await this.core.create({goal,harness,scope:this.core.settings(project.projectId),projectId:project.projectId,projectName:document?JSON.parse(document.files['project.json']).data.name:project.projectId,projectRoot:this.projects.currentRoot,writeSessionId:this.projects.currentSessionId});this.changed();return created;
    });this.bindingWork=work;return work;
  }
  assertRecovery({projectId,sessionId}) {
    if(!projectId||!sessionId)throw new CollaborationError('TARGET_REQUIRED','Specify projectId and sessionId. Use bootstrap, then explicitly start or connect to collaboration.');
    const session=this.core.lineage(sessionId);if(session.projectId!==projectId)throw new CollaborationError('BINDING_STALE','The collaboration belongs to another project.');return session;
  }
  assertBinding(target) {
    this.assertRecovery(target);const session=this.core.get(target.sessionId);
    if(session.ended)throw new CollaborationError('SESSION_ENDED','This collaboration ended. Original calls remain queryable. Explicitly start the next round.');
    if(!this.core.valid(session))throw new CollaborationError('BINDING_STALE','The project or write identity changed. Explicitly connect to the current project collaboration.');return session;
  }
  project(context,write=true) {
    const project = this.projects.currentSession;
    if (!project || project.projectId !== context.projectId || write&&this.projects.currentSessionId !== context.writeSessionId) throw new CollaborationError('BINDING_STALE', write?'The target write session expired. Use galcraft_collaboration prepareRebind.':'Open the original project to query or retrieve its business state. Historical calls remain queryable.');
    return project;
  }
  changed() { this.window?.webContents.send('studio:collaborationChanged'); }
  ownsSession(sessionId,originId) {
    if(!originId)return false;
    const current=this.core.lineage(sessionId);let ancestor=current;
    while(ancestor&&ancestor.projectId===current.projectId){
      if(ancestor.id===originId)return true;
      ancestor=ancestor.reboundFrom?this.core.lineage(ancestor.reboundFrom):null;
    }
    return false;
  }
  taskInScope(task,context){
    if(!task||task.projectId!==context.projectId)return false;
    try{this.core.check(context,context.toolKey??'galcraft_production',{effects:['read'],documents:[...new Set(task.items.flatMap(item=>(item.sourceVersions??[]).filter(version=>version.ref.kind==='document').map(version=>version.ref.id)))]});
      for(const item of task.items)this.core.check(context,context.toolKey??'galcraft_production',{...this.itemConstraint(item),effects:['read']});return true;
    }catch(error){if(['DOCUMENT_SCOPE','PRODUCTION_SCOPE','TOOL_SCOPE'].includes(error.code))return false;throw error;}
  }
  async recoverTask({projectId,sessionId,input,signal}) {
    await this.ready;this.assertRecovery({projectId,sessionId});
    if(!['query','refetch','cancel','wait','inspectResources'].includes(input.action)||!input.taskId)throw new CollaborationError('RECOVERY_ACTION','Recovery only queries, retrieves, waits for, inspects or cancels an original task. Continuing unsent stages requires current authorization.');
    input=z.fromJSONSchema(productionSchema.oneOf.find(branch=>branch.properties.action.const===input.action)).parse(input);
    if(this.projects.currentSession?.projectId!==projectId)throw new CollaborationError('BINDING_STALE','Open the original project to recover its task.');
    const {service}=await this.production.current(),task=service.listTasks().find(task=>task.id===input.taskId);
    if(!task||task.projectId!==projectId||!this.ownsSession(sessionId,task.collaboration?.sessionId))throw new CollaborationError('TASK_COLLABORATION_SCOPE','The original task does not belong to this project and collaboration lineage.');
    const context=structuredClone(task.collaboration);
    const result=input.action==='wait'?await service.waitForTask(task.id,{timeoutMs:input.timeoutMs,signal})
      :input.action==='inspectResources'?await this.production.call('inspectTaskResources',{taskId:task.id,itemId:input.itemId})
      :input.action==='query'?await service.queryRemote(task.id,input.itemId)
      :input.action==='refetch'?await service.refetch(task.id,input.itemId,context):await service.cancel(task.id);
    return this.productionResult(input,json(unwrap(result)));
  }
  planConstraint(plan) {
    return { effects: ['edit'], documents: [...new Set(plan.input.patches.filter(patch => !(patch.kind === 'document' && patch.op === 'create')).map(patch => patch.documentId))],
      createKinds: [...new Set(plan.input.patches.filter(patch => patch.kind === 'document' && patch.op === 'create').map(patch => Object.keys(patch.after?.files ?? {}).some(path => path.endsWith('scene.json')) ? 'scene' : Object.keys(patch.after?.files ?? {}).some(path => path.startsWith('characters/')) ? 'character' : 'document'))] };
  }
  itemConstraint(item) { return { effects: ['generate'], operation: item.operation ?? item.purpose, connectionId: item.configSnapshot?.id, model: item.configSnapshot?.model, ...(item.workflowSnapshot?.id ? { workflowId: item.workflowSnapshot.id } : {}) }; }
  async syncExternalTools() {
    const entries=await this.plugins.externalTools(this.projects.currentSession);
    for(const key of this.externalKeys)this.core.unregister(key);this.externalKeys.clear();
    for(const entry of entries){const {targetFields,...external}=entry.external;const key=entry.key.replaceAll('.','_').replaceAll('/','__');
      this.core.register({definition:{...external,key,title:entry.title,...(entry.display?{display:entry.display}:{}),provider:{id:entry.key.split('/')[0],version:entry.packageVersion}},
        constraints:input=>({effects:entry.external.effects,documents:entry.external.targetFields.flatMap(field=>typeof input?.[field]==='string'?[input[field]]:Array.isArray(input?.[field])?input[field]:[])}),
        execute:async(input,context,check,signal)=>{
          const project=this.project(context,entry.external.effects.some(effect=>['edit','import','generate','adopt'].includes(effect)));if(!this.plugins.dependencies(project).some(dependency=>dependency.id===entry.key.split('/')[0]&&dependency.version===entry.packageVersion))throw new CollaborationError('PLUGIN_TOOL_UNAVAILABLE','The project no longer uses this exact tool version. Historical receipts remain available; refresh capabilities before a new call.');const lease=await this.plugins.acquireProvider(entry.key,'tool',project,entry.packageVersion);
          try{const pluginId=entry.key.split('/')[0],pluginContext={...this.plugins.context(pluginId,'windows',project),collaboration:context};
            const scopedProduction=async input=>{try{return ok(await this.productionCall(input,context,check));}catch(error){return fail(error.code??'PRODUCTION_SCOPE',error.message,'M12');}};
            const studio={pluginId,projectId:project.projectId,target:'windows',open:async()=>ok(undefined),documents:{list:async()=>ok([...project.documents.values()]),apply:async edit=>{const plan=unwrap(project.planEdit(edit));check(this.planConstraint(plan));return project.applyExternalEdit(plan.planId,plan.input.expected,context);}},
              production:{connections:async()=>ok(json((await this.production.connections.list()).map(({credentialId,...value})=>value))),prepareOperation:value=>scopedProduction({...value,action:'prepare'}),prepare:async()=>fail('EXPLICIT_OPERATION','External tools must use prepareOperation.','M10'),submit:planId=>scopedProduction({action:'submit',planId}),tasks:()=>scopedProduction({action:'tasks'}),candidate:async candidateId=>{const result=await scopedProduction({action:'candidate',candidateId});return result.ok?ok(result.value.candidate):result;},cancel:taskId=>scopedProduction({action:'cancel',taskId}),resume:taskId=>scopedProduction({action:'resume',taskId}),prepareAdoption:value=>scopedProduction({...value,action:'prepareAdoption'}),applyAdoption:value=>scopedProduction({...value,action:'adopt'})}};
            const result=unwrap(await lease.provider.runExternal(input,{...pluginContext,studio},signal??new AbortController().signal));
            const edit=result?.kind==='edit'?result.input:result?.patches?result:null;
            if(edit){const plan=unwrap(project.planEdit(edit));check(this.planConstraint(plan));const receipt=unwrap(await project.applyExternalEdit(plan.planId,plan.input.expected,context));this.changed();return json(receipt);}return json(result);
          }finally{await lease.release();}
        },lookup:async(context,input,previous)=>this.productionLookup(context,input,previous)});
      this.externalKeys.add(key);
    }
  }
  async scopeOptions() {
    const project=this.projects.currentSession;if(!project)return {documents:[],operations:[],connections:[],workflows:[]};
    const ctx=await this.production.current();const operations=await this.production.generationProviders.operations(project);
    const workflows=[];for(const operation of operations)if(operation.definition.workflow?.id)workflows.push({id:operation.definition.workflow.id,name:operation.definition.title});
    const {readdir}=await import('node:fs/promises');for(const file of await readdir(join(this.userData,'connections/workflows')).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(file.endsWith('.json')){const workflow=JSON.parse(await readFile(join(this.userData,'connections/workflows',file),'utf8'));if(!workflows.some(item=>item.id===workflow.id))workflows.push({id:workflow.id,name:workflow.name});}
    return {documents:[...project.documents.values()].map(document=>{const path=Object.keys(document.files).find(path=>path.endsWith('.json'));let data;try{data=path?JSON.parse(document.files[path]).data:null;}catch{}return {id:document.documentId,name:data?.name??data?.title??path??document.documentId,kind:Object.keys(document.files).some(path=>path.endsWith('scene.json'))?'场景':'作品文档'};}),operations:operations.map(item=>({id:item.id,title:item.definition.title})),connections:(await this.production.connections.list()).map(({id,name,model})=>({id,name,model})),workflows};
  }
  async workflows(context) {
    const project=this.project(context,false),operations=await this.production.generationProviders.operations(project),session=this.core.get(context.sessionId),entries=[];
    const compatibleWith=(operation,workflow)=>workflow.operation ? operation.id===workflow.operation : operation.definition.purpose==='image'
      ? operation.definition.adoption.kind==='asset'&&operation.definition.adoption.usages.some(usage=>workflowSupportsPurpose(workflow,'image',usage))
      : workflowSupportsPurpose(workflow,operation.definition.purpose);
    for(const operation of operations)if(operation.definition.workflow?.id)entries.push({workflow:operation.definition.workflow,provider:operation.provider,operationIds:compatibleWith(operation,operation.definition.workflow)?[operation.id]:[],inputSchema:operation.definition.inputSchema});
    for(const file of await readdir(join(this.userData,'connections/workflows')).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(file.endsWith('.json')){
      const workflow=JSON.parse(await readFile(join(this.userData,'connections/workflows',file),'utf8'));
      const compatible=operations.filter(operation=>compatibleWith(operation,workflow));
      const existing=entries.find(entry=>entry.workflow.id===workflow.id);if(existing)Object.assign(existing,{workflow,provider:compatible[0]?.provider??null,operationIds:compatible.map(operation=>operation.id),inputSchema:compatible[0]?.definition.inputSchema??null});
      else entries.push({workflow,provider:compatible[0]?.provider??null,operationIds:compatible.map(operation=>operation.id),inputSchema:compatible[0]?.definition.inputSchema??null});
    }
    return entries.map(entry=>({...entry,id:entry.workflow.id,name:entry.workflow.name,revision:entry.workflow.revision,purpose:entry.workflow.purpose,description:entry.workflow.usageGuidance?.description??'',usages:entry.workflow.imageUsages??[],allowed:session.scope.mode==='currentProject'||session.scope.workflowIds.includes(entry.workflow.id)}));
  }
  async capabilities(target) {
    await this.ready;const session=this.assertBinding(target),id=session.id,current=this.projects.currentSession;
    if(current?.projectId!==session.projectId)throw new CollaborationError('BINDING_STALE','Open the original project to inspect its capabilities. Original calls remain queryable.');
    const operations=await this.production.generationProviders.operations(current);await this.syncExternalTools();
    const context={sessionId:id,projectId:session.projectId,writeSessionId:session.writeSessionId};
    return json({session:sessionSummary({...session,bindingValid:this.core.valid(session)}),tools:this.core.catalog().map(({key,title,effects,version,provider})=>({key,title,effects,version,provider:provider??null,allowed:session.scope.mode==='currentProject'||session.scope.tools.includes(key)})),
      operations:operations.map(operation=>({id:operation.id,title:operation.definition.title,version:operation.version,provider:operation.provider,execution:operation.definition.execution??'remote',allowed:session.scope.mode==='currentProject'||session.scope.operations.includes(operation.id)})),
      connections:(await this.production.connections.list()).map(({id,revision,name,protocol,providerKey,model,purposes,workflowBindingId})=>({id,revision,name,protocol,providerKey,model,purposes,workflowBindingId,allowed:session.scope.mode==='currentProject'||session.scope.connectionIds.includes(id)})),
      workflows:(await this.workflows(context)).map(({id,name,revision,purpose,description,provider,operationIds,usages,allowed})=>({id,name,revision,purpose,description,provider,operationIds,usages,allowed})),
      documents:[...current.documents.values()].map(document=>({id:document.documentId,revision:document.revision,paths:Object.keys(document.files),allowed:session.scope.mode==='currentProject'||session.scope.documents.includes(document.documentId)||current.externalDocuments(id).includes(document.documentId)}))});
  }
  register(key,title,description,inputSchema,effects,execute,constraints,lookup,outputSchema) {
    outputSchema??=jsonSchema(outputSchemas[key]);
    inputSchema=bundleDefinitions(inputSchema);outputSchema=bundleDefinitions(outputSchema);
    this.core.register({definition:{key,title,description,inputSchema,outputSchema,effects,version:'0.1.0',async:false,cancel:false},constraints:constraints??(()=>({effects})),execute,lookup});
  }
  async statistics(input,context){
    this.project(context,false);
    const records=this.core.records().filter(call=>call.context.projectId===context.projectId),controls=(await this.control.records()).filter(call=>call.result?.projectId===context.projectId||call.input?.projectId===context.projectId||call.result?.session?.projectId===context.projectId);
    const states={};for(const call of records)states[call.state]=(states[call.state]??0)+1;
    const calls=[...records.map(call=>({...call,statisticEnd:call.finishedAt??(['accepted','running'].includes(call.state)?new Date().toISOString():null)})),...controls.map(call=>({...call,statisticEnd:call.updatedAt??call.createdAt}))].map(call=>({callId:call.callId,sessionId:call.sessionId??null,tool:call.tool,action:call.input?.action??null,state:call.state,durationMs:call.statisticEnd?Math.max(0,Date.parse(call.statisticEnd)-Date.parse(call.createdAt)):null}));
    const page=pageSlice(calls,input),sent=new Set(this.core.list().filter(session=>session.projectId===context.projectId).flatMap(session=>session.sentRequests));
    let unknownGenerationAttempts=0;
    if(this.production.current){const {service}=await this.production.current();for(const task of service.listTasks?.()??[])if(task.projectId===context.projectId)for(const item of task.items)if(item.providerSnapshot?.execution!=='local')for(const attempt of item.attempts??[]){if(attempt.sentAt)sent.add(attempt.id);else if(attempt.sentAt===undefined&&!sent.has(attempt.id))unknownGenerationAttempts++;}}
    return {mode:'statistics',transport:this.mcp.metrics??{requests:0,rejectedRequests:0,parameterRejections:0,originalQueries:0,controlCalls:0},accepted:{total:records.length,states},actualGenerationSends:sent.size,unknownGenerationAttempts,calls:page.items,total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset};
  }
  async environment(context){
    const project=this.project(context,false),plugins=[];
    for(const dependency of this.plugins.dependencies?.(project)??[]){let available=false,reason=null;try{const exact=await this.plugins.exactDirectory(dependency.id,dependency.version);available=exact.ok;reason=exact.ok?null:exact.error.message;}catch(error){reason=error.message;}plugins.push({id:dependency.id,version:dependency.version,enabled:true,available,reason});}
    if(this.plugins.list){const installed=unwrap(await this.plugins.list(project));for(const entry of installed.entries??[]){const manifest=entry.manifest;if(!plugins.some(item=>item.id===manifest.id&&item.version===manifest.version))plugins.push({id:manifest.id,version:manifest.version,enabled:false,available:true,reason:null});}}
    const capture=this.control.host?.captureReadiness?.()??{ready:!!this.capture,kind:'host',executablePath:null,prepare:null,reason:this.capture?null:'No capture provider is installed.'};
    return {mode:'environment',capture,plugins};
  }
  target(context){
    const project=this.project(context,false),target=this.core.get(context.sessionId).target;
    if(!target)throw new CollaborationError('TARGET_MISSING','Use the explicit Studio handoff action on the intended object, or supply an explicitly discovered target.');
    this.core.check(context,'galcraft_context',{effects:['read'],documents:[target.source.documentId]});
    return {mode:'target',target,stale:project.readDocument(target.source.documentId)?.revision!==target.source.revision};
  }
  async prepareEdit(input,context,check){
    const project=this.project(context);let edit=input.edit,prepared;
    try{
    if(input.operation){
      const lease=this.plugins.acquireDefinitions?unwrap(await this.plugins.acquireDefinitions(project,{allowMissing:true})):null;
      try{edit=unwrap(prepareAuthoringEdit([...project.documents.values()],input.operation,lease?.commands??[]));}finally{await lease?.release();}
      for(const version of edit.expected)if(!input.expected?.some(item=>item.ref.kind===version.ref.kind&&item.ref.id===version.ref.id&&item.revision===version.revision))throw new CollaborationError('EDIT_CONFLICT','Supply the current expected version for every operation member; reread the affected objects and prepare again.');
    }
    if(input.operationKey){
      if(input.operationKey==='component.setProperties'){edit=unwrap(await this.playerUi.prepare({componentId:input.target.componentId,...input.fields,label:'Set component properties'}));edit.expected=input.expected;}
      else{prepared=await preparePresetEdit(this,input,context,check);edit=prepared.edit;}
    }
    const temporary=unwrap(project.planEdit(edit));check(this.planConstraint(temporary));project.editPlans.delete(temporary.planId);
    const plan=unwrap(await project.prepareExternalEdit(edit,context));check(this.planConstraint(plan));prepared?.confirm();return {plan,changes:editChanges(plan.input)};
    }catch(error){await prepared?.discard();throw error;}
  }
  registerCore() {
    registerLifecycleTools(this);
    registerPageTools(this);
    registerCompositionTools(this);
    this.register('galcraft_catalog','Discover domain definitions','List or filter commands, operations, documents, pages, properties, tools, workflows, core presets and scoped recipes. Read category+key for the exact schema, version, current value and guide. Keys must come from this catalog.',jsonSchema(z.strictObject({category:z.enum(CatalogCategories).optional(),key:z.string().optional(),text:z.string().optional(),providerId:z.string().optional(),action:z.string().optional(),operationKinds:z.array(z.string()).optional(),fieldGroup:z.string().min(1).optional(),part:z.enum(['input','output']).optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional()})),['read'],(input,context)=>domainCatalog(this,input,context));
    this.register('galcraft_documents','Plugin author documents','Discover contributionKey and schema in catalog documents. Mutations validate the installed contribution and apply one undoable working-copy transaction. Use galcraft_save for the separately reviewed formal save.',jsonSchema(z.discriminatedUnion('action',[
      z.strictObject({action:z.literal('list'),pluginId:z.string(),contributionKey:z.string().optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional()}),z.strictObject({action:z.literal('read'),documentId:z.string()}),z.strictObject({action:z.literal('create'),pluginId:z.string(),contributionKey:z.string(),name:z.string().optional(),data:JsonSchema.optional()}),z.strictObject({action:z.literal('update'),documentId:z.string(),expectedRevision:z.number().int().nonnegative(),data:JsonSchema}),z.strictObject({action:z.literal('copy'),documentId:z.string(),name:z.string().optional()}),z.strictObject({action:z.literal('remove'),documentId:z.string(),expectedRevision:z.number().int().nonnegative()})])),['read','edit'],async(input,context,check)=>{
        const project=this.project(context,!['list','read'].includes(input.action));if(input.action==='list'){const page=pageSlice(unwrap(this.pluginDocuments.list(input)),input);return {action:'list',documents:page.items.map(({data,stateVersion,...document})=>document),total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset};}if(input.action==='read'){const document=readPluginDocumentInstances([...project.documents.values()]).find(document=>document.documentId===input.documentId);if(!document)throw new CollaborationError('PLUGIN_DOCUMENT_MISSING','Select an actual plugin document from its directory.');return {action:'read',document};}
        const prepared=unwrap(await this.pluginDocuments[input.action](input)),result=await this.prepareEdit({edit:prepared},context,check),receipt=unwrap(await project.applyExternalEdit(result.plan.planId,result.plan.input.expected,context));this.changed();
        return this.documentResult(input,receipt,prepared);
      },input=>({effects:['list','read'].includes(input.action)?['read']:['edit']}),(context,input,previous)=>this.documentsLookup(context,input,previous));
    const source=z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('asset'),assetId:z.string(),variantId:z.string().optional()}),z.strictObject({kind:z.literal('candidate'),candidateId:z.string(),artifactIndex:z.number().int().nonnegative().optional()})]);
    const mediaInput=z.union([...['metadata','resource'].map(mode=>z.strictObject({mode:z.literal(mode),source})),z.strictObject({mode:z.literal('image'),source,preview:PreviewInputSchema.optional()}),z.strictObject({mode:z.literal('frame'),source,timeSec:z.number().nonnegative(),preview:PreviewInputSchema.optional()}),z.strictObject({mode:z.literal('frame'),source,frame:z.number().int().nonnegative(),preview:PreviewInputSchema.optional()}),z.strictObject({mode:z.literal('audio'),source,startSec:z.number().nonnegative().optional(),endSec:z.number().positive().optional()}),z.strictObject({mode:z.literal('release'),resourceId:z.string()})]);
    this.register('galcraft_media','Read actual media','Read metadata, the original resource, an image, one video frame or an audio excerpt. Files return absolute localPath; use the client image reader to view pixels. Preview resizing is optional. Release resourceId when finished.',jsonSchema(mediaInput),['read'],async(input,context)=>{this.project(context,false);return this.media.read(input,context);},undefined,(_context,_input,previous)=>this.media.refresh(previous));
    this.register('galcraft_context','Read authoring context','Read paginated document summaries or selected documentIds/sourceRange. Modes target, statistics and environment return the fixed Studio handoff, call/send facts and public readiness. Read exact schemas from catalog only as needed. Bootstrap never creates a collaboration.',jsonSchema(z.strictObject({mode:z.enum(['statistics','environment','target']).optional(),documentIds:z.array(z.string()).optional(),commandKeys:z.array(z.string()).optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional(),sourceRange:z.strictObject({path:z.string(),start:z.number().int().nonnegative(),end:z.number().int().nonnegative()}).optional(),statementRange:z.strictObject({documentId:z.string(),startId:z.string(),endId:z.string().optional()}).optional()})),['read'],async(input,context)=>{
      if(input.mode==='target')return this.target(context);
      if(input.mode==='statistics')return this.statistics(input,context);
      if(input.mode==='environment')return this.environment(context);
      const project=this.project(context,false),all=[...project.documents.values()],directory=all.map(document=>{let data;try{data=JSON.parse(Object.values(document.files).find(value=>value.startsWith('{'))??'{}').data;}catch{}return {documentId:document.documentId,name:data?.name??data?.title??Object.keys(document.files)[0]??document.documentId,revision:document.revision,paths:Object.keys(document.files)};}),page=pageSlice(directory,input);
      let sourceRange=input.sourceRange;if(input.statementRange){const selected=all.find(document=>document.documentId===input.statementRange.documentId),file=Object.entries(selected?.files??{}).find(([path])=>path.endsWith('.gal'));if(!selected||!file)throw new CollaborationError('STATEMENT_RANGE','Select an actual scene document and statement identities.');const nodes=parse({documentId:selected.documentId,revision:selected.revision,text:file[1]}).cst,start=nodes.findIndex(node=>node.id===input.statementRange.startId),end=nodes.findIndex(node=>node.id===(input.statementRange.endId??input.statementRange.startId));if(start<0||end<start)throw new CollaborationError('STATEMENT_RANGE','Select existing statement IDs in their document order.');sourceRange={path:file[0],start:nodes[start].start,end:nodes[end].end};}
      const documents=all.filter(document=>input.documentIds?.includes(document.documentId)||input.statementRange?.documentId===document.documentId).map(({savedFiles,...document})=>{if(!sourceRange)return document;const {path,start,end}=sourceRange;if(end<start||document.files[path]===undefined)throw new CollaborationError('SOURCE_RANGE','Choose an existing file and an ordered source range.');return {...document,files:{[path]:document.files[path].slice(start,end)}};});
      return json({projectRoot:this.projects.currentRoot,projectId:project.projectId,writeSessionId:context.writeSessionId,documents,availableDocuments:page.items,commands:CoreCommandSpecs.filter(command=>(input.commandKeys??[]).includes(command.key)),dirty:project.dirtyIds(),total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset,...(sourceRange?{sourceRange}:{})});
    });
    this.register('galcraft_edit','Apply a working-copy edit','Validate and apply one complete M02 EditInput. The result is undoable and unsaved; use a stable callId and current expected revisions.',jsonSchema(z.strictObject({edit:EditInputSchema})),['edit'],async(input,context,check)=>{const {plan}=await this.prepareEdit(input,context,check),receipt=unwrap(await this.project(context).applyExternalEdit(plan.planId,plan.input.expected,context));this.changed();return json(receipt);},undefined,context=>this.editLookup(context));
    this.register('galcraft_edit_prepare','Prepare a working-copy edit','Prepare an EditInput or a selected catalog operation. Apply result.plan.planId with result.plan.expected from the default summary. Full view stores expected under plan.input.expected; read exact changes only as needed.',jsonSchema(z.union([z.strictObject({edit:EditInputSchema}),z.strictObject({operation:AuthorOperationSchema,expected:z.array(VersionRefSchema)}),ComponentEditInputSchema,PresetEditInputSchema])),['edit'],(input,context,check)=>this.prepareEdit(input,context,check),undefined,async(context,_input,previous)=>{if(previous)return previous;try{const plan=JSON.parse(await readFile(join(context.projectRoot??this.projects.currentRoot,'.galcraft/external-plans',`${context.sessionId}-${context.callId}.json`),'utf8'));return {plan,changes:editChanges(plan.input)};}catch(error){if(error.code!=='ENOENT')throw error;}});
    this.register('galcraft_edit_apply','Apply a reviewed edit','Apply a reviewed plan with its exact expected versions. Use galcraft_save for the separately reviewed formal save.',jsonSchema(z.strictObject({planId:z.string(),expected:z.array(VersionRefSchema)})),['edit'],async(input,context,check)=>{const project=this.project(context),plan=project.editPlans.get(input.planId);if(!plan)throw new CollaborationError('EDIT_PLAN_MISSING','The edit plan has expired. Prepare and review it again.');check(this.planConstraint(plan));const receipt=unwrap(await project.applyExternalEdit(input.planId,input.expected,context));this.changed();return json(receipt);},undefined,context=>this.editLookup(context));
    this.register('galcraft_assets','Find and organize assets','Use query for summaries and get/references for selected assets. Discover types/processors, then read only their selected contracts. editTypeData and processResource use owner schemas and exact versions; confirmResource applies the prepared result. verifyTarget runs actual playback when the goal needs it. Query original calls after disconnect; save follows authorization.',jsonSchema(AssetsInputSchema),['read','import','edit'],(input,context,check)=>this.assetsCall(input,context,check),input=>({effects:input.action==='import'?['import']:['verifyTarget','rename','setMetadata','prepareVariantSwitch','applyVariantSwitch','editTypeData','processResource','confirmResource','discardResource','cancelResource'].includes(input.action)?['edit']:['read']}),(context,input,previous)=>this.assetsLookup(context,input,previous));
    this.register('galcraft_history','Review and undo changes','Read full changes and prepareUndo impact before undo. Only operations originating in this collaboration may be undone automatically. Author or other-session changes require author review in Studio.',jsonSchema(HistoryInputSchema),['read','edit'],(input,context,check)=>this.historyCall(input,context,check),input=>({effects:['undo','redo'].includes(input.action)?['edit']:['read']}),async(context,input,previous)=>{if(previous)return previous;if(!['undo','redo'].includes(input.action))return;const receipt=await this.editLookup(context);if(receipt)return {action:input.action,planId:input.planId,receipt};});
    this.register('galcraft_production','Produce and adopt candidates','Prepare direct fields with a configured connection/workflow; recipes optional. Music render uses an existing score; writeScore accepts a description, optional style/reference and real soundbank. Read exact operation contracts from catalog. Submit once; continue authorized waits/adoption/binding/save to the requested endpoint. Query original tasks after disconnect.',productionSchema,['read','generate','adopt','edit'],async(input,context,check,signal)=>this.productionResult(input,await this.productionCall(input,context,check,signal)),input=>({effects:['tasks','candidate','query','refetch','cancel','inspectConnection','wait','inspectResources','drafts','draft','frozen','defaults'].includes(input.action)?['read']:input.action==='adopt'?['adopt','edit']:['releaseResources','saveDraft','transferPrompt','keepResults'].includes(input.action)?['edit']:['generate']}),(context,input,previous)=>this.productionLookup(context,input,previous));
    this.register('galcraft_check','Check the working project','Compile the current working copy with M03 and its exact plugin definitions. A completed check can contain domain errors and no snapshot. current indicates whether this compile is still current.',schema(),['read'],async(_input,context)=>{const result=await compileCollaborationProject(this,this.project(context,false));return {current:result.current,snapshotId:result.snapshot?.snapshotId??null,issues:result.issues};});
    this.register('galcraft_preview','Inspect the actual Player','State returns runtime position; observe reads requested variable scopes and component CSS properties in an isolated Player. Capture returns actual Player pixels. Entry, target, route and playerInputs replay the route. Use inspection when the goal needs it.',jsonSchema(z.strictObject({action:z.enum(['state','capture','observe']).optional(),variables:z.array(z.strictObject({id:z.string(),scope:z.enum(['progress','local','longTerm']),declaringSceneId:z.string().optional()})).optional(),properties:z.array(z.strictObject({pageId:z.string(),componentId:z.string(),property:z.string()})).optional(),page:PageKeySchema.optional(),entryId:z.string().optional(),target:PositionSchema.optional(),route:DebugScenarioSchema.shape.route.optional(),playerInputs:DebugScenarioSchema.shape.playerInputs.optional(),preview:PreviewInputSchema.optional()})),['preview'],async(input,context)=>{
      this.project(context,false);if(input.action==='observe'){if(!this.capture)throw new CollaborationError('PREVIEW_CAPTURE_UNAVAILABLE','The isolated Player observation provider is unavailable.');const result=await this.capture({...input,observation:{variables:input.variables,properties:input.properties}});return json({action:'observe',reached:result.reached,snapshotId:result.snapshotId??null,observed:result.observed??{status:'notReady',variables:[],properties:[]},issues:result.issues??[]});}if(input.action!=='capture'){if(!this.preview)throw new CollaborationError('PREVIEW_UNAVAILABLE','The runtime preview provider is unavailable.');return json(previewView(await this.preview(input),'state',input));}
      if(!this.capture)throw new CollaborationError('PREVIEW_CAPTURE_UNAVAILABLE','The actual Player capture provider is unavailable.');
      const result=await this.capture(input);let file=null;if(result.pixels){const original=await this.media.add({bytes:result.pixels,mime:'image/png',source:{kind:'preview',projectId:context.projectId,snapshotId:result.snapshotId,engineVersion:result.engineVersion,pluginVersions:result.pluginVersions},width:result.width,height:result.height},context);file=(await this.media.rendition(original,input.preview,context)).file;}
      return json(previewView(result,'capture',input,file));
    },undefined,(_context,_input,previous)=>this.media.refresh(previous));
    this.register('galcraft_open','Open a Studio location','Request navigation to a location in the bound project. navigationRequested confirms the request; inspect Studio to verify the actual UI location.',schema({page:{enum:['creation','assets','production','collaboration','player-ui']},documentId:str,taskId:str,candidateId:str},['page']),['read'],async(input,context)=>{this.project(context,false);this.window?.webContents.send('studio:collaborationNavigate',{...input,sessionId:context.sessionId});return {navigationRequested:true,target:{page:input.page,documentId:input.documentId??null,taskId:input.taskId??null,candidateId:input.candidateId??null}};});
  }
  documentResult(input,receipt,prepared){
    if(input.action==='remove')return {action:'remove',receipt,removedDocumentIds:prepared.patches.filter(p=>p.kind==='document'&&p.op==='delete').map(p=>p.documentId)};
    const instances=readPluginDocumentInstances([...this.projects.currentSession.documents.values()]);
    return {action:input.action,receipt,documents:prepared.patches.flatMap(patch=>{const document=instances.find(doc=>doc.documentId===patch.documentId);return document?[{...Object.fromEntries(['documentId','pluginId','contributionKey','name'].map(key=>[key,document[key]])),revision:receipt.documents.find(version=>version.ref.id===document.documentId)?.revision??document.revision}]:[];})};
  }
  async documentsLookup(context,input,previous){
    if(previous)return previous;const receipt=await this.editLookup(context);if(!receipt)return;
    const project=this.project(context,false),prepared=await project.externalCallInput(context);
    if(!prepared)throw new CollaborationError('DOCUMENT_RESULT_UNCERTAIN','The edit is recorded but its original document summary is unavailable. Inspect the original operation.');
    return this.documentResult(input,receipt,prepared);
  }
  async assetsCall(input,context,check){
    const writes=['import','verifyTarget','rename','setMetadata','prepareVariantSwitch','applyVariantSwitch','editTypeData','processResource','confirmResource','discardResource','cancelResource'];
    const project=this.project(context,writes.includes(input.action)),current=this.assets.current();
    if(!current)throw new CollaborationError('ASSET_INDEX_MISSING','Open a project with an asset index first.');
    const index={documentId:current.index.documentId,revision:current.index.revision},asset=current.index.data.assets.find(asset=>asset.id===input.assetId);
    if(input.action==='types'){const result=await this.assets.typeCatalog(),page=pageSlice(unwrap(result).map(({descriptor,provider,count,unavailable})=>({key:descriptor.key,typeVersion:descriptor.typeVersion,title:descriptor.title,description:descriptor.description,provider:provider??null,capabilities:descriptor.capabilities,count,unavailable:!!unavailable})),input);return {action:input.action,items:page.items,total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset,issues:result.warnings??[]};}
    if(input.action==='processors'){const result=await this.assets.processorCatalog(),page=pageSlice(unwrap(result).map(({key,packageVersion,inputKinds,outputKinds,supportsCancel})=>({key,packageVersion,inputKinds,outputKinds,supportsCancel})),input);return {action:input.action,items:page.items,total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset,issues:result.warnings??[]};}
    if(input.action==='typeContract')return {action:input.action,...unwrap(await this.assets.typeContract(input))};
    if(input.action==='processorContract')return {action:input.action,...unwrap(await this.assets.processorContract(input))};
    if(input.action==='editTypeData'){const result=unwrap(await this.assets.editTypeData(input,{collaboration:context,beforeCommit:(plan,{affectedReferences=[]}={})=>check({...this.planConstraint(plan),documents:[...new Set([...this.planConstraint(plan).documents,...affectedReferences.filter(ref=>ref.source).map(ref=>ref.source.documentId)])]})}));this.changed();return {action:input.action,assetId:result.assetId,variantId:result.variantId,receipt:result.edit};}
    if(input.action==='processResource'){check({effects:['edit'],documents:[index.documentId]});const candidate=unwrap(await this.assets.processResource(input));return {action:input.action,operationId:candidate.operationId,candidate:resourceCandidateSummaryView(candidate)};}
    if(['resourceCandidates','resourceCandidate','confirmResource','discardResource'].includes(input.action)){
      const candidates=unwrap(await this.assets.resourceCandidates());if(input.action==='resourceCandidates'){const page=pageSlice(candidates.map(resourceCandidateSummaryView),input);return {action:input.action,items:page.items,total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset};}
      const candidate=candidates.find(candidate=>candidate.preparationId===input.preparationId);if(!candidate)throw new CollaborationError('PREPARATION_MISSING','Read the current resource processing candidates.');
      if(input.action==='resourceCandidate')return {action:input.action,candidate};
      if(input.action==='discardResource'){check({effects:['edit'],documents:[index.documentId]});unwrap(await this.assets.discardResource(input.preparationId));return {action:input.action,discarded:true};}
      const receipt=unwrap(await this.assets.confirmResource(input,{collaboration:context,beforeCommit:(plan,{affectedReferences=[]}={})=>check({...this.planConstraint(plan),documents:[...new Set([...this.planConstraint(plan).documents,...affectedReferences.filter(ref=>ref.source).map(ref=>ref.source.documentId)])]})}));this.changed();return {action:input.action,receipt};
    }
    if(input.action==='cancelResource'){check({effects:['edit'],documents:[index.documentId]});return {action:input.action,...unwrap(await this.assets.cancelResource(input.operationId))};}
    if(input.action==='list')return {action:'list',assets:current.index.data.assets,index,issues:[]};
    if(input.action==='query'){const query=assetQuery(input.query),result=await this.assets.query(query),page=unwrap(result);return {action:'query',items:page.items.map(assetSummary),total:page.total,offset:page.offset,limit:query.limit,index:{documentId:index.documentId,revision:page.indexRevision},issues:result.warnings??[]};}
    if(input.action==='import'){const previous=await this.assets.lookupImport(context);if(previous)return {action:'import',succeeded:previous.succeeded.map(assetSummary),failed:previous.failed};const result=unwrap(await this.assets.import(input.paths,{collaboration:context,beforeCommit:plan=>check({...this.planConstraint(plan),effects:['import'],createKinds:['asset']})}));this.changed();return {action:'import',succeeded:result.succeeded.map(assetSummary),failed:result.failed};}
    if(input.action==='verifyTarget'){
      check({effects:['edit'],documents:[index.documentId]});
      const result=unwrap(await this.assets.verifyTarget(input.target,context.callId,()=>{},{collaboration:context,beforeCommit:plan=>check(this.planConstraint(plan))}));
      this.changed();return {action:input.action,target:input.target,issues:result.issues,receipt:result.edit};
    }
    if(input.action==='applyVariantSwitch'){
      const saved=this.variantPlans?.get(input.planId),plan=project.editPlans.get(input.planId);
      if(!saved||saved.sessionId!==context.sessionId||!plan)throw new CollaborationError('ASSET_PLAN_EXPIRED','The variant plan has expired. Prepare and review it again.');
      check({...this.planConstraint(plan),documents:[...new Set([...plan.members,...saved.affectedReferences.map(ref=>ref.source.documentId)])]});
      const receipt=unwrap(await project.applyExternalEdit(plan.planId,input.expected,context));this.changed();return {action:input.action,asset:assetSummary(unwrap(this.assets.get(saved.assetId))),affectedReferences:saved.affectedReferences,receipt};
    }
    if(!asset)throw new CollaborationError('ASSET_MISSING','The asset does not exist. Query the current index again.');
    if(input.action==='get')return {action:'get',asset,index,issues:[]};
    if(input.action==='references'){
      const result=await this.assets.references(asset.id),references=unwrap(result).filter(ref=>!input.variantId||ref.variantId===input.variantId||ref.variantId===null);
      const page=pageSlice(references,input);return {action:'references',asset:assetSummary(asset),references:page.items,total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset,documents:[...new Map(references.filter(ref=>ref.source).map(ref=>[ref.source.documentId,{ref:{kind:'document',id:ref.source.documentId},revision:ref.source.revision}])).values()],issues:result.warnings??[]};
    }
    const prepared=unwrap(await this.assets.prepareCatalogEdit(input)),edit=prepared.edit??prepared;
    const affectedReferences=prepared.floatingRefs??[];
    for(const ref of affectedReferences)if(ref.source&&!input.expected.some(v=>v.ref.kind==='document'&&v.ref.id===ref.source.documentId&&v.revision===ref.source.revision))throw new CollaborationError('EDIT_CONFLICT','Include every affected reference document and its current revision in expected.');
    const editInput={label:input.action==='rename'?'Rename asset':input.action==='setMetadata'?'Organize asset':'Switch active asset version',origin:'field',expected:input.expected,patches:edit.indexPatches,preparedAssets:edit.preparedAssets,requiredRefs:[]};
    const {plan,changes}=await this.prepareEdit({edit:editInput},context,check);
    if(input.action==='prepareVariantSwitch'){
      check({effects:['edit'],documents:affectedReferences.filter(ref=>ref.source).map(ref=>ref.source.documentId)});
      const result={action:input.action,planId:plan.planId,expected:plan.input.expected,beforeVariantId:asset.activeVariantId,afterVariantId:input.variantId,affectedReferences,changes,issues:plan.issues};
      const facts={assetId:asset.id,affectedReferences,sessionId:context.sessionId,result};(this.variantPlans??=new Map()).set(plan.planId,facts);const directory=join(this.userData,'collaboration','asset-plans');await mkdir(directory,{recursive:true});await writeFile(join(directory,`${context.sessionId}-${plan.planId}.json`),JSON.stringify(facts));await writeFile(join(directory,`${context.sessionId}-call-${context.callId}.json`),JSON.stringify(facts));return result;
    }
    const receipt=unwrap(await project.applyExternalEdit(plan.planId,input.expected,context));this.changed();
    return {action:input.action,asset:assetSummary(unwrap(this.assets.get(asset.id))),...(input.action==='rename'?{beforeName:asset.name}:{}),receipt};
  }
  async assetsLookup(context,input,previous){
    if(previous)return previous;
    if(input.action==='import'){const result=await this.assets.lookupImport(context);if(result)return {action:'import',succeeded:result.succeeded.map(assetSummary),failed:result.failed};const receipt=await this.editLookup(context);if(receipt)throw new CollaborationError('IMPORT_RESULT_UNCERTAIN','The import transaction exists but its original batch facts are missing. Inspect the original call; do not import again.');return;}
    if(input.action==='prepareVariantSwitch'){const facts=await this.variantFacts(context,`call-${context.callId}`);return facts?.result;}
    const receipt=await this.editLookup(context);if(!receipt)return;
    if(input.action==='confirmResource')return {action:input.action,receipt};
    if(input.action==='editTypeData'){
      const edit=await this.project(context,false).externalCallInput(context),change=edit?.patches.find(patch=>patch.kind==='json')?.changes.find(change=>change.path==='/data/assets'),before=change?.before?.find(asset=>asset.id===input.assetId),after=change?.after?.find(asset=>asset.id===input.assetId),added=after?.variants.filter(variant=>!before?.variants.some(old=>old.id===variant.id));
      if(added?.length!==1)throw new CollaborationError('ASSET_RESULT_UNCERTAIN','The edit is recorded; inspect its exact asset versions before taking another action.');
      return {action:input.action,assetId:input.assetId,variantId:added[0].id,receipt};
    }
    if(input.action==='verifyTarget'){
      const facts=JSON.parse(await readFile(join(context.projectRoot??this.projects.currentRoot,'.galcraft','asset-verification-results',`${context.sessionId}-${context.callId}.json`),'utf8'));
      return {action:input.action,target:input.target,issues:facts.issues,receipt};
    }
    const facts=input.action==='applyVariantSwitch'?await this.variantFacts(context,input.planId):null;
    const project=this.project(context,false),edit=await project.externalCallInput(context),change=edit?.patches.find(p=>p.kind==='json')?.changes.find(change=>change.path==='/data/assets');
    const assetId=facts?.assetId??input.assetId,asset=change?.after?.find(asset=>asset.id===assetId);
    if(!asset)throw new CollaborationError('ASSET_RESULT_UNCERTAIN','The original asset edit needs review. Its transaction is recorded; do not repeat it.');
    return {action:input.action,asset:assetSummary(asset),...(input.action==='rename'?{beforeName:change.before.find(asset=>asset.id===assetId).name}:{}),...(input.action==='applyVariantSwitch'?{affectedReferences:facts?.affectedReferences??[]}:{}),receipt};
  }
  async variantFacts(context,key){try{const facts=JSON.parse(await readFile(join(this.userData,'collaboration','asset-plans',`${context.sessionId}-${key}.json`),'utf8'));return facts.sessionId===context.sessionId?facts:undefined;}catch(error){if(error.code!=='ENOENT')throw error;}}
  operationSummary(operation){
    const call=this.core.records().find(call=>call.result?.operationId===operation.id||call.result?.receipt?.operationId===operation.id);
    return {operationId:operation.id,groupId:operation.groupId,label:operation.label,state:operation.state,documents:operation.members,originCall:call?{sessionId:call.sessionId,callId:call.callId}:null};
  }
  async historyCall(input,context,check){
    const project=this.project(context,['undo','redo'].includes(input.action));
    if(input.action==='list'){const items=project.operations.filter(op=>!input.documentId||op.members.includes(input.documentId)),offset=input.offset??0,limit=input.limit??40;return {action:'list',items:items.slice().reverse().slice(offset,offset+limit).map(op=>this.operationSummary(op)),total:items.length,offset,limit};}
    if(input.action==='get'){const operation=project.operations.find(op=>op.id===input.operationId);if(!operation)throw new CollaborationError('OPERATION_MISSING','The operation is unavailable in this write session.');return {action:'get',operation:this.operationSummary(operation),changes:editChanges({patches:operation.patches})};}
    if(input.action==='prepareUndo'){
      const plan=unwrap(project.planUndo(input.documentId,input.operationId)),operations=plan.reverseOrder.map(id=>project.operations.find(op=>op.id===id)),relatedOperations=operations.map(op=>this.operationSummary(op));
      const foreign=relatedOperations.some(op=>op.originCall?.sessionId!==context.sessionId);
      return {action:'prepareUndo',plan,changes:operations.flatMap(op=>editChanges({patches:op.inverse})),relatedOperations,issues:foreign?[{code:'AUTHOR_REVIEW_REQUIRED',severity:'warning',message:'This plan includes author or other collaboration edits. Ask the author to review it in Studio.',owner:'M12',related:[],actions:['compare']}]:[]};
    }
    const plan=project.undoPlans.get(input.planId);if(!plan)throw new CollaborationError('UNDO_PLAN_EXPIRED','The undo plan is no longer available. Prepare and review it again.');
    if(plan.reverseOrder.some(id=>this.operationSummary(project.operations.find(op=>op.id===id)).originCall?.sessionId!==context.sessionId))throw new CollaborationError('AUTHOR_REVIEW_REQUIRED','The complete undo plan contains edits outside this collaboration. The author must review it in Studio.');
    check({effects:['edit'],documents:plan.members});const receipt=unwrap(await project.applyExternalHistory(input.action,input.planId,input.expected,context));this.changed();return {action:input.action,planId:input.planId,receipt};
  }
  productionResult(input,result){
    const action=input.action;
    if(['prepare','prepareDraft','planContinuation'].includes(action))return json({action,...planView(result)});
    if(action==='frozen')return json({action,frozen:result});if(action==='defaults')return json({action,defaults:result});
    if(['draft','saveDraft','transferPrompt'].includes(action))return json({action,draft:result});
    if(action==='drafts'){const page=pageSlice(result,input);return json({action,drafts:page.items.map(draft=>({id:draft.id,revision:draft.revision,activeUse:draft.activeUse,name:draft.name??'',updatedAt:draft.updatedAt,submittedTaskId:draft.submittedTaskId})),total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset});}
    if(action==='keepResults')return {action,kept:true};if(action==='submitContinuation')return json({action,task:taskView(result)});
    if(['submit','select','refetch','reprocess','resume'].includes(action))return json({action,task:taskView(result)});
    if(action==='tasks'){const page=pageSlice(result,input);return json({action,tasks:page.items.map(taskView),total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset});}
    if(action==='wait')return json({action,task:taskView(result.task),reason:result.reason});
    if(action==='inspectResources')return json({action,resources:result});
    if(action==='releaseResources')return json({action,release:result});
    if(action==='candidate'){const candidate=candidateView(result.candidate),text=result.content.text??null,offset=input.offset??0,limit=input.full?(text?.length??0):(input.limit??12000);return json({action,candidate,content:{text:text===null?null:text.slice(offset,offset+limit),media:[]},textRange:{total:text?.length??0,offset,limit,nextOffset:text!==null&&offset+limit<text.length?offset+limit:null}});}
    if(action==='editCandidate')return json({action,candidate:candidateView(result)});
    if(action==='prepareAdoption')return json({action,plan:result,changes:editChanges(result.input)});
    if(action==='adopt')return json({action,receipt:result});
    if(action==='query')return {action,state:result.state,outputAvailable:result.output!==null,issues:result.issues};
    return json({action,...result});
  }
  async productionCall(input, context, check, signal) {
    const recovery=['tasks','candidate','query','refetch','cancel','inspectConnection','wait','inspectResources','drafts','draft','frozen','defaults'].includes(input.action);
    const project = this.project(context,!recovery), ctx = await this.production.current(), service = ctx.service;
    if (['prepare', 'prepareDraft', 'planContinuation'].includes(input.action)) {
      await compileCollaborationProject(this, project, { publish: true });
    }
    const draftInScope=draft=>{if(!draft||draft.projectId!==context.projectId)return false;try{for(const variant of Object.values(draft.variants)){check({effects:['read'],documents:variant.sourceVersions.filter(version=>version.ref.kind==='document').map(version=>version.ref.id),...(variant.operation?{operation:variant.operation}:{}),...(variant.connectionId?{connectionId:variant.connectionId}:{}),...(variant.model?{model:variant.model}:{}),...(variant.workflowBindingId?{workflowId:variant.workflowBindingId}:{})});}return true;}catch(error){if(['DOCUMENT_SCOPE','PRODUCTION_SCOPE','TOOL_SCOPE'].includes(error.code))return false;throw error;}};
    if(input.action==='drafts')return unwrap(await this.production.call('listDrafts')).filter(draftInScope);
    if(['draft','saveDraft','prepareDraft','transferPrompt'].includes(input.action)){
      const draft=input.action==='saveDraft'?input.draft:unwrap(await this.production.call('readDraft',{draftId:input.draftId}));if(!draftInScope(draft))throw new CollaborationError('DRAFT_SCOPE','The draft is missing or outside the current project authorization.');
      if(input.action==='draft')return draft;if(input.action==='saveDraft')return unwrap(await this.production.call('saveDraft',input));if(input.action==='prepareDraft')return unwrap(await this.production.call('plan',{draftId:input.draftId,name:input.name,collaboration:context}));
      const candidate=service.getCandidate(input.candidateId),task=service.listTasks().find(task=>task.id===candidate?.taskId);if(!this.taskInScope(task,context))throw new CollaborationError('CANDIDATE_SCOPE','The source candidate is outside the current authorization.');return unwrap(await this.production.call('transferPrompt',input));
    }
    if(input.action==='defaults'){const defaults=unwrap(await this.production.call('defaults',input));check({effects:['read'],operation:defaults.operation,...(defaults.connection?{connectionId:defaults.connection.id}:{}),...(defaults.model!=='unknown'?{model:defaults.model}:{}),...(defaults.workflow?{workflowId:defaults.workflow.id}:{})});return defaults;}
    if(['frozen','keepResults','planContinuation','submitContinuation'].includes(input.action)){
      const task=service.listTasks().find(task=>task.id===input.taskId);if(!this.taskInScope(task,context))throw new CollaborationError('TASK_COLLABORATION_SCOPE','The task is outside the current project authorization.');
      if(input.action==='frozen')return unwrap(await this.production.call('frozen',input));if(input.action==='keepResults')return unwrap(await this.production.call('keepResults',input));
      const result=unwrap(await this.production.call(input.action,{...input,collaboration:context}));for(const item of (result.task??result).items)check(this.itemConstraint(item));return result;
    }
    if(input.action==='inspectConnection'){
      const operation=(await this.production.generationProviders.operations(project)).find(operation=>operation.id===input.operation),workflowId=input.workflowId??operation?.definition.workflow?.id;
      check({effects:['read'],operation:input.operation,connectionId:input.connectionId,...(workflowId?{workflowId}:{})});
      return unwrap(await this.production.inspectOperationConnection(input));
    }
    if (input.action === 'prepare') {
      if(input.recipe||input.productionRecipe||input.parameterPreset){const available=await scopedRecipes(this,context);for(const selected of [input.recipe,input.productionRecipe,input.parameterPreset].filter(Boolean))if(!available.some(recipe=>recipe.id===selected.id&&recipe.scope===selected.scope&&recipe.revision===selected.revision))throw new CollaborationError('RECIPE_SCOPE_OR_REVISION','Select the current exact recipe revision from the scoped recipes catalog.');}
      const references=await Promise.all((input.references??[]).map(async reference=>({...unwrap(await this.production.call('mediaInput',{assetId:reference.assetId,variantId:reference.variantId})),port:reference.port})));
      const result=unwrap(await this.production.prepareOperation({...input,...(input.references?{fields:{...input.fields,references}}:{})},context));
      for(const item of result.task.items)check(this.itemConstraint(item));return json(result);
    }
    if (input.action === 'submit') {
      const plan = await service.store.read(service.store.planPath(input.planId)); if (!plan || plan.task.collaboration?.sessionId !== context.sessionId) throw new Error('The production plan does not belong to this collaboration.');
      for (const item of plan.task.items) check(this.itemConstraint(item)); const result = unwrap(await this.production.call('submit', {planId:input.planId,collaboration:context})); return json(result);
    }
    if (input.action === 'tasks') return json(service.listTasks().filter(task => this.taskInScope(task,context)));
    if (input.action === 'candidate') { const candidate = service.getCandidate(input.candidateId); const task = service.listTasks().find(task => task.id === candidate?.taskId); if (!this.taskInScope(task,context)) throw new CollaborationError('CANDIDATE_SCOPE','The candidate is outside the current project authorization.');return json({candidate,content:unwrap(await this.production.call('candidateContent',input.candidateId))}); }
    const task = service.listTasks().find(task => task.id === input.taskId);
    if (input.action === 'adopt') {
      const plan = project.editPlans.get(input.planId); if (!plan || this.adoptionSessions?.get(input.planId)!==context.sessionId) throw new Error('The adoption plan does not belong to this collaboration.'); check({ ...this.planConstraint(plan), effects: ['adopt','edit'] });
      const result = unwrap(await this.production.call('apply', { planId: input.planId, expected: input.expected, collaboration: context })); this.changed(); return json(result);
    }
    if (!this.taskInScope(task,context)) throw new CollaborationError('TASK_COLLABORATION_SCOPE','The task is outside the current project authorization. Original ownership is retained.');
    if(input.action==='wait')return json(unwrap(await service.waitForTask(task.id,{timeoutMs:input.timeoutMs,signal})));
    if(input.action==='inspectResources')return json(unwrap(await this.production.call('inspectTaskResources',{taskId:task.id,itemId:input.itemId})));
    if(input.action==='releaseResources'){check({effects:['edit']});return json(unwrap(await this.production.call('releaseTaskResources',{taskId:task.id,itemId:input.itemId})));}
    if (input.action === 'select' || input.action === 'prepareAdoption') { const result=unwrap(await this.production.call('select', { taskId: task.id, selections: input.selections, target: input.action === 'select' ? 'taskOnly' : 'project', expected: input.expected ?? [], adoptions: input.adoptions ?? {}, collaboration:context }));if(result.planId)(this.adoptionSessions??=new Map()).set(result.planId,context.sessionId);return json(result);}
    if(input.action==='editCandidate'){const candidate=service.getCandidate(input.candidateId);if(candidate?.taskId!==task.id)throw new CollaborationError('CANDIDATE_SCOPE','The candidate does not belong to this task.');return json(unwrap(await service.editCandidate(input.candidateId,input.text,context)));}
    if (input.action === 'cancel') return json(unwrap(await service.cancel(task.id)));
    if (input.action === 'query') return json(unwrap(await service.queryRemote(task.id, input.itemId)));
    if (input.action === 'refetch') return json(unwrap(await service.refetch(task.id, input.itemId,context)));
    if (input.action === 'reprocess') return json(unwrap(await service.reprocess(task.id, input.itemId, input.text,input.candidateId,context)));
    if (input.action === 'resume') {this.assertBinding(context);for(const item of task.items)if(!item.remote&&['queued','blocked'].includes(item.state))check(this.itemConstraint(item));return json(unwrap(await service.resume(task.id,context)));}
    throw new Error('Unknown production action.');
  }
  async editLookup(context) {
    if(this.projects.currentSession?.projectId===context.projectId){const result=await this.projects.currentSession.lookupExternalCall(context);if(result)return json(unwrap(result));}
    if(!context.projectRoot)return;
    for(const filename of ['recovery/draft.json','external-results.json']){try{const data=JSON.parse(await readFile(join(context.projectRoot,'.galcraft',filename),'utf8'));const value=(filename==='recovery/draft.json'?data.externalCalls:data)?.[`${context.sessionId}/${context.callId}`];if(value)return json(unwrap(value.result));}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  async productionLookup(context,input={},previous) {
    const id=`${context.sessionId}-${context.callId}`,base=join(this.userData,'tasks',context.projectId);
    const intents=JSON.parse(await readFile(join(base,'adoptions.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error;}));
    const pending=Object.values(intents).find(intent=>intent.context?.sessionId===context.sessionId&&intent.context?.callId===context.callId);
    if(pending){if(this.projects.currentSession?.projectId!==context.projectId)return;const ctx=await this.production.current();await ctx.service.reconcileAdoption(pending.planId);if(ctx.service.hasPendingAdoption(pending.planId))return;}
    const edit=await this.editLookup(context);if(edit!==undefined)return context.toolKey==='galcraft_production'?{action:input.action,receipt:edit}:edit;
    if(context.toolKey==='galcraft_production'&&input.action==='prepare'){
      try {const plan=JSON.parse(await readFile(join(base,'external-plans',`${encodeURIComponent(id)}.json`),'utf8'));return this.productionResult(input,plan);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    for(const entry of await readdir(base,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){if(!entry.isDirectory())continue;try{const task=JSON.parse(await readFile(join(base,entry.name,'task.json'),'utf8'));const fact=task.externalActions?.[id];if(fact){if(fact.action!==input.action)throw new CollaborationError('PRODUCTION_RESULT_UNCERTAIN','The original action identity does not match its stored business fact.');if(fact.action==='editCandidate'){const candidate=JSON.parse(await readFile(join(base,task.id,'items',fact.itemId,'candidates',fact.candidateId,'candidate.json'),'utf8'));return this.productionResult(input,candidate);}if(fact.action==='prepareAdoption')return this.productionResult(input,fact.plan);return context.toolKey==='galcraft_production'?this.productionResult(input,task):json(task);}if(task.externalCallId===id||task.submissionCalls?.includes(id)||['submit','select','refetch','reprocess','resume'].includes(input.action)&&previous?.task?.id===task.id)return context.toolKey==='galcraft_production'?this.productionResult(input,task):json(task);}catch(error){if(error.code!=='ENOENT')throw error;}}
    return previous;
  }
  async call(method, input) {
    await this.ready;
    try {
      if(method==='handoffTarget'){
        const request=z.strictObject({sessionId:z.string().optional(),target:z.strictObject({ref:RefSchema,source:SourceSchema})}).parse(input),project=this.projects.currentSession;
        if(!project)throw new CollaborationError('PROJECT_SESSION_MISSING','Open the intended project first.');
        const session=request.sessionId?this.core.get(request.sessionId):this.core.active(project.projectId);if(!session)throw new CollaborationError('SESSION_MISSING','Connect to a collaboration before handing off a target.');
        const document=project.readDocument(request.target.source.documentId);if(!document||document.revision!==request.target.source.revision)throw new CollaborationError('TARGET_STALE','Reread the selected object before handing it off.');
        const contains=value=>value&&typeof value==='object'&&(value.id===request.target.ref.id||Object.values(value).some(contains));
        const found=request.target.ref.kind==='document'&&document.documentId===request.target.ref.id||Object.entries(document.files).some(([path,text])=>path.endsWith('.gal')?parse({documentId:document.documentId,revision:document.revision,text}).cst.some(node=>node.id===request.target.ref.id):path.endsWith('.json')&&contains(JSON.parse(text).data));
        if(!found)throw new CollaborationError('TARGET_MISSING','The selected stable object is absent from its document.');
        const context={sessionId:session.id,projectId:session.projectId,writeSessionId:session.writeSessionId,scopeRevision:session.scopeRevision,callId:'read'};this.core.check(context,'galcraft_context',{effects:['read'],documents:[document.documentId]});
        return ok(await this.core.handoffTarget(session.id,request.target));
      }
      if(method==='reportAuthoringDrafts'){
        const report=z.strictObject({projectId:z.string(),revision:z.number().int().nonnegative(),documents:z.array(z.strictObject({id:z.string(),name:z.string(),kind:z.string()}))}).parse(input);
        this.authoringDrafts??=new Map();const previous=this.authoringDrafts.get(report.projectId);if(!previous||previous.revision<=report.revision)this.authoringDrafts.set(report.projectId,report);return ok(undefined);
      }
      if (method === 'overview') {
        const query = input === undefined ? undefined : z.strictObject({ history: z.strictObject({ sessionId: z.string(), offset: z.number().int().nonnegative(), limit: z.number().int().min(1).max(100), search: z.string().optional(), state: z.enum(['accepted','running','completed','failed','cancelled','uncertain']).optional() }).optional() }).parse(input);
        await this.syncExternalTools(); let currentSessionId = null;
        if (this.projects.currentSession) { try { currentSessionId = this.core.active(this.projects.currentSession.projectId)?.id ?? null; } catch (error) { if (error.code !== 'SESSION_AMBIGUOUS') throw error; } }
        const sessions = this.core.list();
        return ok({ options: await this.scopeOptions(), enabled: !!this.serviceSettings.enabled, service: this.serviceStatus(), currentProjectId: this.projects.currentSession?.projectId ?? null, defaultScope: this.projects.currentSession ? this.core.settings(this.projects.currentSession.projectId) : currentProjectScope(), currentSessionId, endpoint: this.mcp.endpoint, sessions, calls: query ? [] : this.core.records(), ...(query?.history && sessions.some(session => session.id === query.history.sessionId) ? { callPage: this.core.history(query.history) } : {}), tools: this.core.catalog().map(toolSummary) });
      }
      if (method === 'readCall') { const query = z.strictObject({ sessionId: z.string(), callId: z.string() }).parse(input); return ok(this.core.readCall(query.sessionId, query.callId)); }
      if (method === 'start') return ok(await this.startService());
      if (method === 'stop') {await this.saveServiceSettings({...this.serviceSettings,enabled:false});await this.mcp.stop();this.serviceError=null;return ok(undefined);}
      if (method === 'create') {
        const project = this.projects.currentSession; if (!project) throw new Error('请先打开作品');
        const active=await this.ensureCurrentSession();if(active)return ok(active);
        const doc = [...project.documents.values()].find(document => document.files['project.json']);
        const session = await this.core.create({ ...input, scope: CollaborationScopeSchema.parse(input.scope??this.core.settings(project.projectId)), projectId: project.projectId, writeSessionId: this.projects.currentSessionId, projectRoot:this.projects.currentRoot, projectName: doc ? JSON.parse(doc.files['project.json']).data.name : project.projectId }); return ok(session);
      }
      if (method === 'update') { const result = await this.core.update(input);if(!result.paused&&this.projects.currentSession)void this.production.current().then(ctx=>ctx.service.drain());return ok(result); }
      if (method === 'end') {const result=await this.core.end(input);await this.media.end(input.id);this.changed();return ok(result);}
      if (method === 'deleteEnded') {
        const result=await this.core.deleteEnded(input,async sessions=>{
          const ids=sessions.map(session=>session.id),roots=[...new Set(sessions.map(session=>session.projectRoot).filter(Boolean))];
          for(const root of roots){const removed=await deleteExternalEditReviews(root,ids);if(root===this.projects.currentRoot)for(const plan of removed)this.projects.currentSession?.editPlans.delete(plan);}
          const directory=join(this.userData,'collaboration','asset-plans');for(const file of await readdir(directory).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(ids.some(id=>file.startsWith(`${id}-`)))await rm(join(directory,file),{force:true});
          for(const [plan,facts]of this.variantPlans??[])if(ids.includes(facts.sessionId))this.variantPlans.delete(plan);
          for(const [plan,id]of this.adoptionSessions??[])if(ids.includes(id))this.adoptionSessions.delete(plan);
          await this.control.deleteSessions(ids);for(const id of ids)await this.media.end(id);await this.sessionDeleted?.(ids);
        });this.changed();return ok(result);
      }
      if (method === 'toolDefinition') {await this.syncExternalTools();const definition=this.core.catalog().find(tool=>tool.key===input.key);if(!definition)throw new CollaborationError('TOOL_MISSING','The tool is no longer available. Refresh the catalog.');return ok(definition);}
      if (method === 'chooseWorkspaceDirectory') {
        const choice=await this.dialog.showOpenDialog(this.window,{defaultPath:input.directory??this.projects.currentRoot,properties:['openDirectory']});
        return ok(choice.canceled?null:choice.filePaths[0]??null);
      }
      if (method === 'configuration') {
        const root = this.projects.currentRoot;
        const binding=this.control.binding(),active=binding?this.core.active(binding.projectId):null,project=binding?{projectId:binding.projectId,projectRoot:root,writeSessionId:binding.writeSessionId,...(active?{sessionId:active.id}:{})}:undefined;
        if(input.purpose==='skill'){
          if(!root)throw new Error('请先打开作品');
          const directory=join(root,input.harness==='codex'?'.agents/skills':input.harness==='claude'?'.claude/skills':'.dsh/skills','galcraft-create');
          const files=creativeSkillFiles(input.harness,project),preview=await previewSkillFiles(directory,files),launch=harnessLaunch(input.harness,input.harness==='codex'?'codex':input.harness==='claude'?'claude':'dsh --profile headless',project);
          return ok({harness:input.harness,purpose:'skill',path:directory,content:files['SKILL.md'],existing:null,...preview,...launch,guidance:[...preview.guidance,...launch.guidance]});
        }
        if (!this.mcp.endpoint) throw new Error('请先开启本机服务');
        if (input.destination === 'project' && !root) throw new Error('请先打开作品');
        const workspaceDirectory=input.harness==='codex'?input.workspaceDirectory??root:undefined;
        if(input.harness==='codex'&&input.workspaceDirectory!==undefined&&(!isAbsolute(input.workspaceDirectory)||!(await stat(input.workspaceDirectory).catch(error=>{if(error.code==='ENOENT')return null;throw error;}))?.isDirectory()))throw new Error('请选择现有的助手工作区目录');
        const configRoot=workspaceDirectory?resolve(workspaceDirectory):root;
        const profileRoot=join(process.env.DSH_HOME??join(homedir(),'.dsh'),'profiles/galcraft');
        const path = input.harness === 'claude' ? join(root, '.mcp.json') : input.harness === 'codex' ? join(configRoot, '.codex/config.toml') : input.destination === 'personal' ? join(profileRoot,'cordis.patch.yml') : join(root, '.dsh/galcraft.patch.yml');
        let existing = null; try { existing = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const companionFiles=[];
        if(input.harness==='dsh'&&input.destination==='personal')for(const [name,content]of Object.entries({'package.json':JSON.stringify({name:'dsh-profile-galcraft',private:true,dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless']}}},null,2)+'\n','pnpm-workspace.yaml':'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n'})){const file=join(profileRoot,name);let previous=null;try{previous=await readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}companionFiles.push({path:file,content:previous??content,existing:previous});}
        const content=harnessContent(input.harness,this.mcp.endpoint);
        const launcher=input.harness==='dsh'?input.destination==='personal'?'dsh --profile galcraft':`dsh --profile headless --patch '${path.replaceAll("'","''")}'`:input.harness==='claude'?'claude':'codex';
        const readback=harnessReadback(input.harness,path,existing,content,companionFiles),mergedContent=mergeHarness(input.harness,existing,content);
        return ok({ harness: input.harness,purpose:'mcp',...(workspaceDirectory?{workspaceDirectory:configRoot}:{}),path,content,readback,mergedContent,existing,companionFiles,changes:[...(readback.files[0].state==='current'?[]:[{path,existing,content:mergedContent}]),...companionFiles.filter(file=>file.existing===null)],...harnessLaunch(input.harness,launcher,project,workspaceDirectory?configRoot:project?.projectRoot) });
      }
      if (method === 'writeConfiguration') { if(input.purpose!=='skill'&&(!this.mcp.endpoint||input.content!==harnessContent(input.harness,this.mcp.endpoint)))throw new CollaborationError('MCP_CONFIGURATION_STALE','MCP address changed or the service stopped. Generate a new configuration preview before applying it.'); if (input.mode === 'export') { const choice = await this.dialog.showSaveDialog(this.window, { defaultPath: input.path }); if (choice.canceled || !choice.filePath) return ok({ status:'cancelled',path:null }); await writeFile(choice.filePath,input.content);return ok({status:'written',path:choice.filePath}); } await writeHarness(input); return ok({ status:'written',path: input.path }); }
      if (method === 'open') { this.window?.webContents.send('studio:collaborationNavigate', input); return ok(undefined); }
      throw new Error('未知协作操作');
    } catch (error) { return fail(error.code ?? 'COLLABORATION_ERROR', error.message, 'M12'); }
  }
  async close() { await this.ready; await this.mcp.stop();await this.core.close(); }
}
