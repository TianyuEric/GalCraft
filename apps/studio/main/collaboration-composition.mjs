import { z } from 'zod';
import { AssetReferenceSchema, SourceSchema, EditPlanSchema, EditReceiptSchema, IdSchema, JsonSchema, VersionRefSchema } from '@galcraft/contracts';
import { UICompositionInputSchema, UICompositionSelectionSchema } from '@galcraft/templates/composition-contracts';
import { CollaborationError } from '@galcraft/collaboration';
import { ChangeSummarySchema, MediaFileSchema, editChanges } from './collaboration-contracts.mjs';

const action=(name,fields={})=>z.strictObject({action:z.literal(name),...fields}),str=z.string(),ids=z.array(str),json=value=>JSON.parse(JSON.stringify(value)),schema=value=>z.toJSONSchema(value,{io:'input'});
const adoption=z.strictObject({key:str,source:z.strictObject({assetId:IdSchema,variantId:IdSchema}).nullable(),destination:z.enum(['newAsset','newVariant']),replace:z.strictObject({mode:z.enum(['none','selected','all']),refs:z.array(AssetReferenceSchema.extend({source:SourceSchema,label:str.optional()}))})});
const Input=z.discriminatedUnion('action',[
  action('save',{composition:UICompositionInputSchema}),action('read',{compositionId:IdSchema}),
  action('preview',{compositionId:IdSchema,revision:z.number().int().positive(),keys:ids,substitutions:z.record(str,IdSchema).optional(),pageId:IdSchema.optional()}),
  action('prepareAdoption',{selection:UICompositionSelectionSchema.extend({assetAdoptions:z.array(adoption)})}),
  action('adopt',{planId:IdSchema,expected:z.array(VersionRefSchema)}),
]);
const Output=z.discriminatedUnion('action',[
  action('save',{composition:JsonSchema}),action('read',{composition:JsonSchema}),
  action('preview',{previewId:IdSchema,compositionId:IdSchema,revision:z.number().int().positive(),propertyOwners:JsonSchema,files:z.array(MediaFileSchema)}),
  action('prepareAdoption',{plan:EditPlanSchema,changes:z.array(ChangeSummarySchema)}),action('adopt',{receipt:EditReceiptSchema}),
]);
const unwrap=value=>{if(!value.ok)throw new CollaborationError(value.error.code,value.error.message,value.error);return value.value;};
export function registerCompositionTools(owner){
  const plans=new Map();
  const ownCandidate=(service,id,sessionId)=>{const candidate=service.getCandidate(id),task=service.listTasks().find(task=>task.id===candidate?.taskId);if(!candidate||!task?.collaboration||!owner.ownsSession(sessionId,task.collaboration.sessionId))throw new CollaborationError('CANDIDATE_SCOPE','The UI candidate does not belong to this collaboration.');return candidate;};
  owner.register('galcraft_ui_composition','Review and adopt a UI candidate composition','Save an existing UI candidate composition, inspect it, preview the selected complete config/style/asset closure in the actual Player, then prepareAdoption and adopt. Preview resolves CSS property ownership from real Player nodes. The complete M02 impact is reviewed and scope checked before the one adoption transaction. Formal save is separate.',schema(Input),['read','preview','edit','adopt'],async(input,context,check)=>{
    owner.project(context,!['read','preview'].includes(input.action));const ctx=await owner.production.current(),service=ctx.service;
    if(input.action==='save'){
      ownCandidate(service,input.composition.candidateId,context.sessionId);for(const resource of input.composition.resources)ownCandidate(service,resource.candidateId,context.sessionId);
      return json({action:'save',composition:unwrap(await owner.production.call('saveComposition',input.composition))});
    }
    if(input.action==='adopt'){
      const project=owner.project(context),plan=project.editPlans.get(input.planId);if(!plan||plans.get(input.planId)!==context.sessionId)throw new CollaborationError('ADOPTION_PLAN_MISSING','Prepare and review this composition adoption in the current collaboration.');
      check({...owner.planConstraint(plan),effects:['edit','adopt']});const receipt=unwrap(await owner.production.call('apply',{planId:input.planId,expected:input.expected,collaboration:context}));owner.changed();return json({action:'adopt',receipt});
    }
    const id=input.action==='prepareAdoption'?input.selection.compositionId:input.compositionId;
    const composition=await service.store.read(service.store.path('compositions',`${IdSchema.parse(id)}.json`));if(!composition)throw new CollaborationError('COMPOSITION_MISSING','Save the candidate composition before reviewing it.');ownCandidate(service,composition.candidateId,context.sessionId);
    if(input.action==='read')return json({action:'read',composition});
    if(input.action==='prepareAdoption'){
      const plan=unwrap(await owner.production.call('prepareUIAdoption',input.selection));
      try{check({...owner.planConstraint(plan),effects:['edit','adopt']});}catch(error){unwrap(await owner.production.call('discardAdoption',plan.planId));throw error;}
      plans.set(plan.planId,context.sessionId);return json({action:'prepareAdoption',plan,changes:editChanges(plan.input)});
    }
    if(!owner.capture)throw new CollaborationError('PREVIEW_CAPTURE_UNAVAILABLE','The actual Player capture provider is unavailable.');
    const request={id,revision:input.revision,keys:input.keys,substitutions:input.substitutions??{}},prepared=unwrap(await owner.production.call('previewComposition',request));
    const pageIds=[...new Set([...prepared.unresolvedStyleMatches.map(match=>match.pageId),...(input.pageId?[input.pageId]:[]),...composition.proposal.config.filter(change=>input.keys.includes(change.key)).map(change=>change.pageId),...composition.proposal.styles.filter(change=>input.keys.includes(change.key)).map(change=>change.scope.pageId)])];
    if(!pageIds.length){const task=service.listTasks().find(task=>task.id===service.getCandidate(composition.candidateId)?.taskId);pageIds.push(...task?.items.find(item=>item.candidateIds.includes(composition.candidateId))?.target.uiScope?.pageIds??[]);}
    const matches=[],files=[];
    for(const pageId of pageIds){
      const page=prepared.template.pages.find(page=>page.id===pageId);if(!page)throw new CollaborationError('UI_PAGE_MISSING','The reviewed page is missing.');
      const observed=await owner.capture({page:page.key,compositionPreview:prepared});if(!observed.reached)throw new CollaborationError('UI_PREVIEW_FAILED','The actual Player could not render this composition. Inspect the candidate and source diagnostics.');
      matches.push(...observed.styleMatches??[]);
      if(observed.pixels){const file=await owner.media.add({bytes:observed.pixels,mime:'image/png',source:{kind:'preview',projectId:context.projectId,snapshotId:observed.snapshotId,engineVersion:observed.engineVersion,pluginVersions:observed.pluginVersions},width:observed.width,height:observed.height},context);files.push((await owner.media.rendition(file,undefined,context)).file);}
    }
    const reviewed=prepared.unresolvedStyleMatches.length?unwrap(await owner.production.call('previewComposition',{...request,previewId:prepared.previewId,matches})):prepared;
    return json({action:'preview',previewId:reviewed.previewId,compositionId:id,revision:input.revision,propertyOwners:reviewed.propertyOwners,files});
  },input=>({effects:input.action==='read'?['read']:input.action==='preview'?['preview']:input.action==='adopt'||input.action==='prepareAdoption'?['edit','adopt']:['edit']}),async(context,input,previous)=>input.action==='adopt'?await owner.editLookup(context).then(receipt=>receipt?{action:'adopt',receipt}:previous):previous,schema(Output));
}
