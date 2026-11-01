import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { CollaborationScopeSchema, createId, issueFromError, issueSummary } from '@galcraft/contracts';
import { CollaborationError } from '@galcraft/collaboration';
import { StudioProjectLibrary } from './project-library.mjs';
import { sessionSummary } from './collaboration-contracts.mjs';
import { OfficialTemplates } from '@galcraft/templates';
import {toolSummary} from './collaboration-catalog.mjs';

const str=z.string().min(1),decision=z.enum(['confirm','reject','cancel']);
const apply=z.strictObject({action:z.literal('apply'),reviewId:str,authorDecision:decision,closeChoice:z.enum(['save','discard']).optional()});
const sessionTarget={sessionId:str,expectedRevision:z.number().int().positive()};
export const ProjectsControlSchema=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('list')}),z.strictObject({action:z.literal('templates')}),
  z.strictObject({action:z.literal('inspect'),directory:str}),
  z.strictObject({action:z.literal('prepareOpen'),directory:str}),
  z.strictObject({action:z.literal('prepareCreate'),project:z.strictObject({path:str,name:str,template:z.enum(['light','standard','rich','empty']),width:z.number().int().positive(),height:z.number().int().positive(),engineVersion:str})}),
  z.strictObject({action:z.literal('recovery')}),
  z.strictObject({action:z.literal('prepareRecovery'),choice:z.enum(['restore','discard','local','disk','copy']),copyPath:str.optional()}),
  z.strictObject({action:z.literal('prepareConflict'),planId:str,choice:z.enum(['local','disk','copy']),copyPath:str.optional()}),
  apply,
]);
export const CollaborationControlSchema=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('options'),projectId:str.optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional()}),
  z.strictObject({action:z.literal('prepareCreate'),projectId:str,writeSessionId:str,goal:str,harness:z.enum(['codex','claude','dsh']),scope:CollaborationScopeSchema.optional()}),
  z.strictObject({action:z.literal('prepareScope'),...sessionTarget,scope:CollaborationScopeSchema,goal:str.optional()}),
  z.strictObject({action:z.literal('prepareRebind'),...sessionTarget,scope:CollaborationScopeSchema.optional()}),
  ...['pause','resume','end','deleteEnded'].map(action=>z.strictObject({action:z.literal(action),...sessionTarget})),apply,
]);
const unwrap=value=>{if(!value.ok){const error=new CollaborationError(value.error.code,value.error.message);error.issue=value.error;throw error;}return value.value;};
const fail=(code,message)=>{throw new CollaborationError(code,message);};
const clean=value=>JSON.parse(JSON.stringify(value));
const safeId=id=>{if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id))fail('CALL_ID','Use ASCII letters, digits, underscores and hyphens for callId.');return id;};

/** The service control plane has no prerequisite business session. It records author choices separately. */
export class CollaborationControl {
  constructor(owner,host){this.owner=owner;this.host=host;this.root=join(owner.userData,'collaboration','control');this.library=host?.projectLibrary??new StudioProjectLibrary({userData:owner.userData});this.tail=Promise.resolve();this.running=new Map();}
  get projects(){return this.owner.projects;}
  async persist(path,value){await mkdir(join(this.root,path.split('/')[0]),{recursive:true});const file=join(this.root,path);await writeFile(`${file}.tmp`,JSON.stringify(value,null,2)+'\n');await rename(`${file}.tmp`,file);}
  async read(path){try{return JSON.parse(await readFile(join(this.root,path),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  binding(){const session=this.projects.currentSession;return session?{projectId:session.projectId,writeSessionId:this.projects.currentSessionId,directory:this.projects.currentRoot,versions:[...session.documents.values()].map(document=>({documentId:document.documentId,revision:document.revision})).sort((a,b)=>a.documentId.localeCompare(b.documentId))}:null;}
  current(){if(!this.projects.currentSession)fail('PROJECT_SESSION_MISSING','Open or create a project with galcraft_projects first.');return this.projects.currentSession;}
  summary(session){return sessionSummary({...session,bindingValid:this.owner.core.valid(session)});}
  authoringDrafts(){const project=this.projects.currentSession;return project?this.owner.authoringDrafts?.get(project.projectId)??{projectId:project.projectId,revision:0,documents:[]}:null;}
  async transition(){const project=this.projects.currentSession;if(!project)return null;const save=project.planSave({kind:'all'});return {binding:this.binding(),dirty:project.dirtyIds(),savePlan:save.ok?save.value:null,saveIssue:save.ok?null:save.error,recovery:unwrap(await project.listRecovery()),unappliedDrafts:this.authoringDrafts(),draftDisposition:'retainWithSourceProject',closeChoices:['save','discard','cancel']};}
  async review(kind,input,extra={}){const plan={reviewId:createId(),kind,input:clean(input),binding:this.binding(),createdAt:new Date().toISOString(),...extra};await this.persist(`plans/${plan.reviewId}.json`,plan);return {action:input.action,plan};}
  async invoke(tool,input,callId){
    input=(tool==='galcraft_projects'?ProjectsControlSchema:CollaborationControlSchema).parse(input);
    const read=['list','templates','inspect','options','recovery'].includes(input.action);
    if(read)return this.execute(tool,input);
    if(!callId)fail('CALL_ID_REQUIRED','Control plans and author choices require a stable callId.');safeId(callId);
    const active=this.running.get(callId);if(active){if(active.tool!==tool||!isDeepStrictEqual(active.input,input))fail('CALL_CONFLICT','This control callId already belongs to different input.');return this.query(callId);}
    const work=this.tail.then(async()=>{
      const path=`calls/${callId}.json`,prior=await this.read(path);
      if(prior){if(prior.tool!==tool||!isDeepStrictEqual(prior.input,input))fail('CALL_CONFLICT','This control callId already belongs to different input.');return prior;}
      const record={callId,tool,input,state:'running',createdAt:new Date().toISOString()};await this.persist(path,record);
      try{record.result=clean(await this.execute(tool,input,callId));record.state='completed';}
      catch(error){
        const issue=issueFromError(error,'M12');record.state=error instanceof CollaborationError||error.name==='ZodError'?'failed':'uncertain';record.error={code:error.code??'CONTROL_EXECUTION',message:issueSummary(issue),issue};
        if(['CONTROL_PLAN_STALE','SCOPE_CONFLICT'].includes(error.code)){
          const plan=input.reviewId?await this.read(`plans/${input.reviewId}.json`):null,sessionId=plan?.input.sessionId??input.sessionId;
          const current=sessionId?this.owner.core.get(sessionId):null;
          record.error.review={currentBinding:this.binding(),expectedBinding:plan?.binding??null,currentSession:current?this.summary(current):null,scopeDifference:plan?.input.scope&&current?{before:current.scope,after:plan.input.scope}:null,next:'Prepare a new review from the current versions. The previous author choice does not authorize these changes.'};
        }
        if(error.code==='EXTERNAL_CONFLICT'&&input.reviewId){const plan=await this.read(`plans/${input.reviewId}.json`);record.error.savePlanId=plan?.transition?.savePlan?.planId??null;}
      }
      record.updatedAt=new Date().toISOString();await this.persist(path,record);this.owner.changed();return record;
    });this.tail=work.catch(()=>{});this.running.set(callId,{work,tool,input});void work.finally(()=>this.running.delete(callId)).catch(()=>{});
    let timer;return Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve({callId,tool,state:'running',waitingReason:'The original control operation is still in progress.',recovery:{tool:'galcraft_control_call',callId}}),500);})]).finally(()=>clearTimeout(timer));
  }
  async query(callId){safeId(callId);const record=await this.read(`calls/${callId}.json`);if(!record){if(this.running.has(callId))return {callId,state:'running',waitingReason:'The control operation is waiting for preceding operations.',recovery:{tool:'galcraft_control_call',callId}};fail('CALL_MISSING','The control call does not exist.');}if(['accepted','running'].includes(record.state)&&!this.running.has(callId))record.state='uncertain';return record;}
  async records(){const records=[];for(const file of await readdir(join(this.root,'calls')).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(file.endsWith('.json'))records.push(await this.read(`calls/${file}`));return records;}
  async deleteSessions(ids){
    const belongs=value=>value&&typeof value==='object'&&(ids.includes(value.sessionId)||ids.includes(value.id)||Object.values(value).some(belongs));
    for(const category of ['plans','calls'])for(const file of await readdir(join(this.root,category)).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(file.endsWith('.json')){const path=`${category}/${file}`;if(belongs(await this.read(path)))await rm(join(this.root,path),{force:true});}
  }
  async execute(tool,input,callId){
    if(input.action==='apply')return this.apply(tool,input,callId);
    if(tool==='galcraft_projects'){
      if(input.action==='list')return {action:'list',projects:unwrap(await this.library.listRecent()),current:this.binding()};
      if(input.action==='templates')return {action:'templates',templates:['light','standard','rich','empty'],summaries:[
        ...OfficialTemplates.map(template=>({...template,name:{light:'Light',standard:'Standard',rich:'Rich'}[template.kind],description:{light:'A compact player with manual saves and reading history.',standard:'A complete reading player with continuation, saves and galleries.',rich:'A full player with story flow, characters and core story variables.'}[template.kind],dependencies:[{kind:'template',id:`org.galcraft.${template.kind}.paper`,version:'0.1.0'}]})),
        {kind:'empty',name:'Empty project',description:'A light player and an empty first scene for writing from scratch.',features:OfficialTemplates.find(item=>item.kind==='light').features,pages:OfficialTemplates.find(item=>item.kind==='light').pages,dependencies:[{kind:'template',id:'org.galcraft.light.paper',version:'0.1.0'}]},
      ],sampleGuidance:'Open a standalone .galproject example through project backup restore with copyNew to create an independent editable project.',engines:this.host?.engines?unwrap(await this.host.engines.listCreationVersions()):[]};
      if(input.action==='inspect')return {action:'inspect',project:unwrap(await this.library.inspect(input.directory))};
      if(input.action==='prepareCreate'){
        if(!isAbsolute(input.project.path))fail('PROJECT_PATH','Choose an absolute parent directory.');
        const parent=resolve(input.project.path),directory=resolve(parent,input.project.name),inside=relative(parent,directory);if(!inside||inside.startsWith('..')||isAbsolute(inside))fail('PROJECT_PATH','Choose a project name inside the selected parent directory.');
        return this.review('project.create',input,{target:{parent,directory},transition:await this.transition()});
      }
      if(input.action==='prepareOpen'){
        if(!isAbsolute(input.directory))fail('PROJECT_PATH','Choose an absolute project directory.');
        return this.review('project.open',input,{target:unwrap(await this.library.inspect(input.directory)),transition:await this.transition()});
      }
      if(input.action==='recovery')return {action:'recovery',binding:this.binding(),draft:unwrap(await this.current().listRecovery()),conflicts:this.current().getRecoveryConflict()};
      if(input.action==='prepareRecovery')return this.review('project.recovery',input,{draft:unwrap(await this.current().listRecovery()),conflicts:this.current().getRecoveryConflict()});
      if(input.action==='prepareConflict'){const conflicts=this.current().getConflict(input.planId);if(!conflicts.length)fail('CONFLICT_MISSING','No save conflict exists for this plan.');return this.review('project.conflict',input,{conflicts});}
    }
    if(input.action==='options'){const projectId=input.projectId??this.projects.currentSession?.projectId,offset=input.offset??0,limit=input.limit??50,sessions=this.owner.core.list().filter(session=>!projectId||session.projectId===projectId).sort((a,b)=>Number(b.bindingValid)-Number(a.bindingValid)||Number(!!a.ended)-Number(!!b.ended)||b.updatedAt.localeCompare(a.updatedAt));return {action:'options',binding:this.binding(),options:await this.owner.scopeOptions(),tools:this.owner.core.catalog().map(toolSummary),createKinds:['scene','character','document','asset'],sessions:sessions.slice(offset,offset+limit).map(session=>this.summary(session)),total:sessions.length,offset,limit,nextOffset:offset+limit<sessions.length?offset+limit:null};}
    if(input.action==='prepareCreate'){const project=this.current();if(project.projectId!==input.projectId||this.projects.currentSessionId!==input.writeSessionId)fail('BINDING_STALE','Start collaboration in the current project and write binding.');const active=this.owner.core.active(project.projectId);return this.review('session.create',{...input,scope:active?.scope??input.scope??this.owner.core.settings(project.projectId)},{activeSessionId:active?.id??null,scopeDifference:{before:active?.scope??null,after:active?.scope??input.scope??this.owner.core.settings(project.projectId)},options:await this.owner.scopeOptions()});}
    const session=this.owner.core.get(input.sessionId);
    if(session.scopeRevision!==input.expectedRevision)fail('SCOPE_CONFLICT','The scope changed. Read options and review a new difference.');
    if(input.action==='deleteEnded'){const deleted=unwrap(await this.owner.call('deleteEnded',{id:session.id,expectedRevision:input.expectedRevision}));return {action:'deleteEnded',...deleted};}
    if(session.ended)fail('SESSION_ENDED','This collaboration ended. Create a new collaboration for new work.');
    if(input.action==='prepareScope')return this.review('session.scope',input,{scopeRevision:session.scopeRevision,scopeDifference:{before:session.scope,after:input.scope},options:await this.owner.scopeOptions()});
    if(input.action==='prepareRebind'){
      const current=this.current();if(current.projectId!==session.projectId)fail('BINDING_STALE','Open the original project before rebinding.');
      const existing=new Set(current.documents.keys());
      const scope=input.scope??{...session.scope,documents:[...new Set([...session.scope.documents,...current.externalDocuments(session.id)])].filter(id=>existing.has(id))};
      return this.review('session.rebind',{...input,scope},{scopeRevision:session.scopeRevision,scopeDifference:{before:session.scope,after:scope},generations:session.generations,remainingGenerations:scope.maxGenerations===null?null:Math.max(0,scope.maxGenerations-session.generations),options:await this.owner.scopeOptions()});
    }
    const changed=unwrap(await this.owner.call(input.action==='end'?'end':'update',{id:session.id,expectedRevision:input.expectedRevision,...(input.action==='end'?{}:{paused:input.action==='pause'})}));
    return {action:input.action,session:this.summary(changed)};
  }
  async apply(tool,input,callId){
    const plan=await this.read(`plans/${safeId(input.reviewId)}.json`);if(!plan)fail('CONTROL_PLAN_MISSING','Prepare a current review plan first.');
    if((tool==='galcraft_projects')!==plan.kind.startsWith('project.'))fail('CONTROL_PLAN_TOOL','Apply the plan through its original tool.');
    if(plan.authorDecision){if(plan.authorDecision!==input.authorDecision)fail('CONTROL_PLAN_DECIDED','This review already has a different author decision.');return plan.result;}
    if(input.authorDecision!=='confirm'){plan.authorDecision=input.authorDecision;plan.result={action:'apply',reviewId:plan.reviewId,status:input.authorDecision};await this.persist(`plans/${plan.reviewId}.json`,plan);return plan.result;}
    if(!isDeepStrictEqual(plan.binding,this.binding()))fail('CONTROL_PLAN_STALE','The project binding or working versions changed. Prepare a new review with the current impact.');
    if(plan.transition&&!isDeepStrictEqual(plan.transition.unappliedDrafts,this.authoringDrafts()))fail('CONTROL_PLAN_STALE','The unapplied authoring drafts changed during review. Refresh the transition; drafts stay with their source project.');
    const request=plan.input;let result;
    if(plan.kind==='project.create'||plan.kind==='project.open'){
      if(plan.transition&&(plan.transition.dirty.length||plan.transition.recovery)&&!input.closeChoice)fail('CLOSE_CHOICE_REQUIRED','Review the transition and choose save or discard; cancel preserves the current workspace.');
      const choice=input.closeChoice??'save';
      if(choice==='save'&&plan.transition?.savePlan)unwrap(await this.current().save(plan.transition.savePlan.planId));
      if(plan.kind==='project.create')result=unwrap(this.host?await this.host.call('projects','create',{...request.project,closeChoice:choice}):await this.projects.create({...request.project,closeChoice:choice}));
      else {
        const inspected=unwrap(await this.library.inspect(request.directory));if(inspected.projectId!==plan.target.projectId)fail('CONTROL_PLAN_STALE','The selected project changed. Prepare a new review.');
        result=unwrap(this.host?await this.host.call('projects','switch',{directory:request.directory,choice}):await this.projects.switch({directory:request.directory,choice}));
      }
      await this.library.register({projectId:result.projectId,directory:this.projects.currentRoot});result={...result,writeSessionId:this.projects.currentSessionId,binding:this.binding(),recovery:unwrap(await this.current().listRecovery())};
      this.owner.window?.webContents.send('studio:collaborationNavigate',{page:'projects',projectChanged:true});
    }else if(plan.kind==='project.conflict'){
      const project=this.current();if(!isDeepStrictEqual(plan.conflicts,project.getConflict(request.planId)))fail('CONFLICT_STALE','The save conflict changed. Review it again.');
      unwrap(await project.resolveConflict(request.planId,request.choice,request.copyPath));result={resolved:true};
    }else if(plan.kind==='project.recovery'){
      const project=this.current();if(!isDeepStrictEqual(plan.draft,unwrap(await project.listRecovery())))fail('RECOVERY_STALE','The recovery draft changed. Review it again.');
      result=unwrap(await (['restore','discard'].includes(request.choice)?project.recover(request.choice):project.resolveRecoveryConflict(request.choice,request.copyPath)));
    }else {
      const project=this.current();
      if(plan.kind==='session.create'){
        const document=[...project.documents.values()].find(value=>value.files['project.json']);
        const active=this.owner.core.active(project.projectId);if((active?.id??null)!==plan.activeSessionId)fail('CONTROL_PLAN_STALE','The active collaboration changed during review. Prepare a current connection.');
        result=active?await this.owner.ensureCurrentSession():await this.owner.core.create({goal:request.goal,harness:request.harness,scope:request.scope,projectId:project.projectId,projectName:document?JSON.parse(document.files['project.json']).data.name:project.projectId,projectRoot:this.projects.currentRoot,writeSessionId:this.projects.currentSessionId,authorControlCallId:callId});
      }else {
        const session=this.owner.core.get(request.sessionId);if(session.scopeRevision!==plan.scopeRevision)fail('SCOPE_CONFLICT','The scope changed during review. Prepare a new difference.');
        if(session.projectId!==project.projectId)fail('BINDING_STALE','Open the target project before changing this collaboration.');
        result=plan.kind==='session.rebind'?await this.owner.core.rebind({id:session.id,expectedRevision:plan.scopeRevision,writeSessionId:this.projects.currentSessionId,scope:request.scope,authorControlCallId:callId}):await this.owner.core.update({id:session.id,expectedRevision:plan.scopeRevision,scope:request.scope,...(request.goal?{goal:request.goal}:{})});
      }
      result={session:this.summary(result)};
    }
    plan.authorDecision='confirm';plan.result=clean({action:'apply',reviewId:plan.reviewId,status:'applied',...(!Array.isArray(result)?result:{restoredDocuments:result})});await this.persist(`plans/${plan.reviewId}.json`,plan);return plan.result;
  }
}
