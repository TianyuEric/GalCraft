import { readFile, readdir, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { BuildInputSchema, BuildReceiptSchema, IssueSchema, JsonSchema, SavePlanSchema, SaveReceiptSchema, SaveScopeSchema, VersionRefSchema } from '@galcraft/contracts';
import { CollaborationError } from '@galcraft/collaboration';
import { compileCollaborationProject } from './collaboration-compile.mjs';
import {authorSigningCertificates} from './author-signing.mjs';

const unwrap=result=>{if(!result.ok){const error=new CollaborationError(result.error.code,result.error.message);error.issue=result.error;throw error;}return result.value;};
const json=value=>JSON.parse(JSON.stringify(value));
const schema=value=>z.toJSONSchema(value,{io:'input'});
const action=(name,fields={})=>z.strictObject({action:z.literal(name),...fields});
const str=z.string(),issues=z.array(IssueSchema);
const builderIdentity=BuildInputSchema.shape.targetBuilder.unwrap();
const targetSummary=z.strictObject({builder:builderIdentity,target:z.enum(['web','windows','android','ios']),name:str,outputs:z.array(z.strictObject({key:str,requiresTools:z.boolean(),signingModes:z.array(str),defaultSigningMode:str.nullable()})),available:z.boolean(),issues});
const SaveInput=z.discriminatedUnion('action',[action('plan',{scope:SaveScopeSchema}),action('save',{planId:str}),action('conflicts',{planId:str}),action('resolveConflict',{planId:str,choice:z.enum(['local','disk','copy']),copyPath:str.optional()})]);
const SaveOutput=z.discriminatedUnion('action',[action('plan',{plan:SavePlanSchema,changes:z.array(z.strictObject({documentId:str,path:str,before:str.nullable(),after:str.nullable()})),scopeIssues:issues}),action('save',{receipt:SaveReceiptSchema}),action('conflicts',{conflicts:JsonSchema}),action('resolveConflict',{resolved:z.literal(true)})]);
const SigningOptions=action('signingOptions',{target:z.enum(['web','windows','android','ios']),available:z.boolean(),reason:str.nullable(),unsignedAllowed:z.boolean(),certificates:z.array(z.strictObject({thumbprint:str,subject:str,validFrom:str,expiresAt:str,authorUsable:z.boolean(),blockedReason:str.nullable()}))});
const ReleaseInput=z.discriminatedUnion('action',[action('targets'),action('targetContract',{builder:builderIdentity}),action('signingOptions',{target:z.enum(['web','windows','android','ios'])}),action('check'),action('prepare',{settings:BuildInputSchema.omit({projectId:true,snapshotId:true,savedVersions:true})}),action('build',{planId:str}),action('status',{planId:str})]);
const ReleaseOutput=z.discriminatedUnion('action',[action('targets',{targets:z.array(targetSummary)}),action('targetContract',{builder:builderIdentity,definition:JsonSchema,inputSchema:JsonSchema}),SigningOptions,action('check',{snapshotId:str.nullable(),savedVersions:z.array(VersionRefSchema),dirty:z.array(str),issues}),action('prepare',{plan:JsonSchema}),action('build',{receipt:BuildReceiptSchema}),action('status',{receipt:BuildReceiptSchema.nullable()})]);
const saveConstraint=plan=>({effects:['edit'],documents:plan.members});

export function registerLifecycleTools(owner){
  const root=join(owner.userData,'collaboration','lifecycle');
  const persist=async(path,value)=>{await mkdir(root,{recursive:true});const file=join(root,path);await writeFile(`${file}.tmp`,JSON.stringify(value,null,2)+'\n');await rename(`${file}.tmp`,file);};
  const read=async path=>{try{return JSON.parse(await readFile(join(root,path),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  const builds=()=>{const provider=owner.control.host?.builds;if(!provider)throw new CollaborationError('BUILD_PROVIDER_UNAVAILABLE','The local release provider is unavailable.');return provider;};
  const savePlans=new Map(),releaseChecks=new Map();
  const previousDelete=owner.sessionDeleted;
  owner.sessionDeleted=async ids=>{await previousDelete?.(ids);for(const [key,value]of savePlans)if(ids.includes(value.sessionId))savePlans.delete(key);for(const [key,value]of releaseChecks)if(ids.includes(value.sessionId))releaseChecks.delete(key);for(const file of await readdir(root).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(ids.some(id=>file.startsWith(`${id}-`)))await rm(join(root,file),{force:true});};
  owner.register('galcraft_save','Review and save project objects','Read the actual M02 save closure and all object changes. Scope issues are included for author review; expand the collaboration scope if needed, then save the same current plan. Saving commits these complete objects, including any author edits. Other dirty objects remain unsaved.',schema(SaveInput),['read','edit'],async(input,context,check)=>{
    const project=owner.project(context,input.action!=='conflicts');
    if(input.action==='plan'){
      const plan=unwrap(project.planSave(input.scope));savePlans.set(plan.planId,{plan,sessionId:context.sessionId,projectId:context.projectId,writeSessionId:context.writeSessionId});
      const changes=plan.preview.flatMap(document=>[...new Set([...Object.keys(document.files),...Object.keys(document.savedFiles)])].filter(path=>document.files[path]!==document.savedFiles[path]).map(path=>({documentId:document.documentId,path,before:document.savedFiles[path]??null,after:document.files[path]??null})));
      const scopeIssues=[];try{check(saveConstraint(plan));}catch(error){scopeIssues.push({code:error.code,severity:'error',message:error.message,owner:'M12',related:[],actions:['chooseTarget']});}
      return json({action:'plan',plan,changes,scopeIssues});
    }
    const saved=savePlans.get(input.planId),plan=project.savePlans.get(input.planId)??saved?.plan;
    if(!plan||saved&&saved.writeSessionId!==context.writeSessionId)throw new CollaborationError('SAVE_PLAN_MISSING','Prepare a current save plan in this write session.');
    if(input.action==='conflicts')return json({action:'conflicts',conflicts:project.getConflict(input.planId)??[]});
    check(saveConstraint(plan));
    if(input.action==='resolveConflict'){unwrap(await project.resolveConflict(input.planId,input.choice,input.copyPath));return {action:'resolveConflict',resolved:true};}
    const receipt=unwrap(await project.save(input.planId)),result=json({action:'save',receipt});await persist(`${context.sessionId}-${context.callId}.json`,result);owner.changed();return result;
  },input=>({effects:input.action==='save'||input.action==='resolveConflict'?['edit']:['read']}),async(context,_input,previous)=>previous??await read(`${context.sessionId}-${context.callId}.json`),schema(SaveOutput));
  owner.register('galcraft_release','Check and build a local release','Explicit export/update authorizes local checks and construction. Check compiles actual saved files; dirty lists unsaved work. Save first or explicitly choose this saved snapshot. Prepare reviews the real M11 output/target plan; build uses its planId and staging/backup replacement. Query the original call after disconnect.',schema(ReleaseInput),['read','edit'],async(input,context,check)=>{
    const project=owner.project(context,input.action==='build');
    if(input.action==='targets'||input.action==='targetContract'){
      const entries=unwrap(await builds().targets());
      if(input.action==='targets')return json({action:input.action,targets:entries.map(entry=>({builder:entry.builder,target:entry.description.target,name:entry.description.name,outputs:entry.description.outputs??[],available:entry.description.availability.available,issues:entry.description.availability.issues}))});
      const entry=entries.find(entry=>entry.builder.key===input.builder.key&&entry.builder.pluginId===input.builder.pluginId&&entry.builder.version===input.builder.version);if(!entry)throw new CollaborationError('BUILD_TARGET_MISSING','Refresh release targets and select an available exact builder.');
      return json({action:input.action,builder:entry.builder,definition:entry.description,inputSchema:entry.description.optionsSchema});
    }
    if(input.action==='signingOptions'){const windows=input.target==='windows',available=!windows||process.platform==='win32';return {action:input.action,target:input.target,available,reason:available?null:'Windows certificate discovery requires a Windows host.',unsignedAllowed:['web','windows'].includes(input.target),certificates:windows&&available?await authorSigningCertificates():[]};}
    if(input.action==='check')return project.withSavedSnapshot(async documents=>{
      const saved={projectId:project.projectId,documents:new Map(documents.map(document=>[document.documentId,document]))};
      const compiled=await compileCollaborationProject(owner,saved,{publish:true});
      if(!compiled.current){releaseChecks.delete(project.projectId);throw new CollaborationError('COMPILE_SUPERSEDED','A newer project compilation superseded this saved-snapshot check. Read the current project state and run galcraft_release check again. No release was prepared.');}
      const checked=json({action:'check',snapshotId:compiled.snapshot?.snapshotId??null,savedVersions:documents.map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision})),dirty:project.dirtyIds(),issues:compiled.issues});
      if(checked.snapshotId)releaseChecks.set(project.projectId,{...checked,sessionId:context.sessionId});else releaseChecks.delete(project.projectId);return checked;
    });
    const provider=builds();
    if(input.action==='prepare'){
      const checked=releaseChecks.get(project.projectId);if(!checked)throw new CollaborationError('BUILD_SNAPSHOT_MISSING','Run galcraft_release check on the saved project first.');
      return json({action:'prepare',plan:unwrap(await provider.planBuild({...input.settings,projectId:project.projectId,snapshotId:checked.snapshotId,savedVersions:checked.savedVersions}))});
    }
    if(input.action==='status')return json({action:'status',receipt:unwrap(provider.receipt(input.planId))??null});
    const plan=provider.plans.get(input.planId);if(!plan||plan.input.projectId!==context.projectId)throw new CollaborationError('BUILD_PLAN_STALE','Prepare a current release plan for this project.');
    check({effects:['edit']});const receipt=unwrap(await provider.build(input.planId)),result=json({action:'build',receipt});await persist(`${context.sessionId}-${context.callId}.json`,result);return result;
  },input=>({effects:input.action==='build'?['edit']:['read']}),async(context,input,previous)=>previous??await read(`${context.sessionId}-${context.callId}.json`),schema(ReleaseOutput));
}
