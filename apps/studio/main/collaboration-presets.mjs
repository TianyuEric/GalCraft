import { localizeRecipe } from '@galcraft/authoring/recipes/operations';
import { join } from 'node:path';
import { z } from 'zod';
import { createId, ObjectTargetSchema, StageStationSchema, StageWeatherPresets, VersionRefSchema } from '@galcraft/contracts';
import { parse, patchFields, toDocumentPatch } from '@galcraft/dsl';
import { AnimationPresets, createAnimationPreset } from '@galcraft/stage/presets';
import { applyReadingPreset, componentDefinition, createUIAnimationPreset, findComponent, putUIAnimation, readTemplateDocuments, templateEdit, UIAnimationPresets } from '@galcraft/templates';
import { CollaborationError } from '@galcraft/collaboration';
import { ActionIconPresets } from './action-icon-presets.mjs';

const str=z.string().min(1),versions=z.array(VersionRefSchema),schema=value=>z.toJSONSchema(value,{io:'input'});
const unwrap=result=>{if(!result.ok)throw new CollaborationError(result.error.code,result.error.message,result.error);return result.value;};
const fail=(code,message)=>{throw new CollaborationError(code,message);};
const sceneTarget=z.strictObject({documentId:str,statementId:str.nullable()});
const parameters=z.strictObject({durationMs:z.number().positive().optional(),amplitude:z.number().optional(),cycles:z.number().int().min(1).max(32).optional(),targetX:z.number().optional(),targetY:z.number().optional(),offsetY:z.number().optional(),station:StageStationSchema.optional()});
const event=z.enum(['enter','exit','show','hide','hover','pressed','focus']);
const state=z.enum(['normal','hover','pressed','focus','disabled','selected','locked','empty']);
const operation=(key,target,fields)=>z.strictObject({operationKey:z.literal(key),target,fields,expected:versions});
const definitions=[
  ['scene.setBackground','Set a scene background',operation('scene.setBackground',sceneTarget,z.strictObject({assetId:str,variantId:str,fit:z.enum(['cover','contain','native']).default('cover'),positionX:z.number().min(0).max(1).default(.5),positionY:z.number().min(0).max(1).default(.5)}))],
  ['statement.bindVoice','Bind dialogue audio',operation('statement.bindVoice',z.strictObject({documentId:str,statementId:str}),z.strictObject({assetId:str,variantId:str,locale:str.nullable()}))],
  ['stage.applyAnimationPreset','Apply a core stage animation',operation('stage.applyAnimationPreset',sceneTarget,z.strictObject({key:z.enum(AnimationPresets.map(item=>item.id)),parameters:parameters.default({}),stageTarget:ObjectTargetSchema.optional()}))],
  ['stage.applyWeatherPreset','Apply core weather and its texture',operation('stage.applyWeatherPreset',sceneTarget,z.strictObject({key:z.enum(Object.keys(StageWeatherPresets)),effectId:str.optional(),target:ObjectTargetSchema.default({kind:'stage'}),density:z.number().nonnegative().optional(),speed:z.number().nonnegative().optional(),directionDeg:z.number().optional(),layer:z.enum(['back','front']).default('front'),parameters:z.strictObject({columns:z.number().int().positive().optional(),size:z.number().positive().optional(),z:z.number().optional()}).default({})}))],
  ['component.applyAnimationPreset','Create and bind a UI animation preset',operation('component.applyAnimationPreset',z.strictObject({componentId:str}),z.strictObject({key:z.enum(UIAnimationPresets.map(item=>item.key)),event}))],
  ['page.applyReadingPreset','Apply a reading layout',operation('page.applyReadingPreset',z.strictObject({pageId:str}),z.strictObject({key:z.enum(['portrait','clear'])}))],
  ['component.applyActionIcon','Import and bind a core action icon',operation('component.applyActionIcon',z.strictObject({componentId:str}),z.strictObject({key:z.enum(ActionIconPresets.map(item=>item.key)),state:state.default('normal')}))],
];
export const PresetEditInputSchema=z.union(definitions.map(([, ,definition])=>definition));
const operationExamples={
  'scene.setBackground':{target:{documentId:'Doc001',statementId:null},fields:{assetId:'Asset1',variantId:'Var001',fit:'cover',positionX:.5,positionY:.5}},
  'statement.bindVoice':{target:{documentId:'Doc001',statementId:'Stmt01'},fields:{assetId:'Asset1',variantId:'Var001',locale:'zh-CN'}},
  'stage.applyAnimationPreset':{target:{documentId:'Doc001',statementId:null},fields:{key:'jump',parameters:{},stageTarget:{kind:'stage'}}},
  'stage.applyWeatherPreset':{target:{documentId:'Doc001',statementId:null},fields:{key:'snow'}},
  'component.applyAnimationPreset':{target:{componentId:'Comp01'},fields:{key:'fadeIn',event:'show'}},
  'page.applyReadingPreset':{target:{pageId:'Page01'},fields:{key:'clear'}},
  'component.applyActionIcon':{target:{componentId:'Comp01'},fields:{key:'start',state:'normal'}},
};
export const PresetDomainOperations=definitions.map(([key,title,definition])=>({key,title,inputSchema:schema(definition),description:`${title}. Prepare through galcraft_edit_prepare, review its complete changes, then apply and save separately.`,example:{tool:'galcraft_edit_prepare',arguments:{sessionId:'Session1',callId:'prepare-domain-operation-1',input:{operationKey:key,...operationExamples[key],expected:[{ref:{kind:'document',id:'Doc001'},revision:1}]}},replace:'Replace all target and asset identities with current discovered values, and expected with all affected document revisions. Asset imports and bindings also require the asset-index revision.'}}));
export const CatalogCategories=['commands','operations','documents','pages','properties','tools','workflows','animationPresets','weatherPresets','uiAnimationPresets','readingLayouts','actionIcons','recipes'];

const reference=recipe=>({id:recipe.id,scope:recipe.scope,revision:recipe.revision});
export async function scopedRecipes(owner,context){
  const project=owner.project(context,false),session=owner.core.get(context.sessionId),ctx=await owner.production.current();
  if(!ctx.recipes)return [];
  const recipes=await ctx.recipes.listRecipes({projectId:project.projectId});
  const allowed=recipe=>{
    if(session.scope.mode==='currentProject')return true;
    if(recipe.scope==='project'&&!session.scope.documents.includes(recipe.id)&&!project.externalDocuments(context.sessionId).includes(recipe.id))return false;
    if(recipe.parameterPreset){const parent=recipes.find(item=>item.id===recipe.parameterPreset.recipeId&&item.scope===recipe.parameterPreset.recipeScope);return !!parent&&allowed(parent);}
    return recipe.production?session.scope.operations.includes(recipe.production.operation):recipe.purposes.some(purpose=>session.scope.operations.includes(purpose));
  };
  return recipes.filter(allowed);
}

export async function presetCatalog(owner,input,context,push){
  const add=(category,key,title,definition,inputSchema)=>push(category,key,title,{id:'galcraft',version:'0.1.0'},{availability:'available',requiredAssets:[],...definition},inputSchema);
  const example=(operationKey,fields,target)=>({tool:'galcraft_edit_prepare',arguments:{sessionId:'Session1',callId:'prepare-preset-1',input:{operationKey,target,fields,expected:[{ref:{kind:'document',id:'Doc001'},revision:1}]}},replace:'Use actual target IDs and all current affected document revisions, including the asset index when importing or binding assets.'});
  if(!input.category||input.category==='animationPresets')for(const preset of AnimationPresets){const made=createAnimationPreset(preset.id),request=PresetDomainOperations.find(item=>item.key==='stage.applyAnimationPreset');
    add('animationPresets',preset.id,preset.title[1],{description:`${preset.title[1]} as editable native tracks. ${made.lifecycle==='property'?'Insert or replace a property animation statement.':`Select an existing ${made.lifecycle==='show'?'show':'exit/clear'} display statement to set its ${made.lifecycle==='show'?'enter':'exit'} transition.`}`,defaults:{durationMs:preset.durationMs,amplitude:preset.amplitude,cycles:preset.cycles},parametersSchema:schema(parameters),targets:made.lifecycle==='property'?['object','station','stage']:['changeBg','changeFigure','changeIllustration'],lifecycle:made.lifecycle,keepFinal:made.keepFinal,loop:made.loop,example:example(request.key,{key:preset.id,parameters:{},...(made.lifecycle==='property'?{stageTarget:{kind:'stage'}}:{})},{documentId:'Doc001',statementId:made.lifecycle==='property'?null:'Stmt01'})},request.inputSchema);}
  if(!input.category||input.category==='weatherPresets')for(const [key,preset] of Object.entries(StageWeatherPresets)){const request=PresetDomainOperations.find(item=>item.key==='stage.applyWeatherPreset');add('weatherPresets',key,preset.title[1],{description:'Use the shipped weather texture and the stage weather renderer.',defaults:{density:preset.density,speed:preset.speed,directionDeg:preset.directionDeg,parameters:preset.parameters},requiredAssets:[{kind:'image',source:preset.texture,acquisition:'M04 prepared import; reuse the existing core-weather tag'}],targets:['stage','object','station'],lifecycle:'persistent effect until pixiInit',example:example(request.key,{key},{documentId:'Doc001',statementId:null})},request.inputSchema);}
  if(!input.category||input.category==='uiAnimationPresets')for(const preset of UIAnimationPresets){const request=PresetDomainOperations.find(item=>item.key==='component.applyAnimationPreset');add('uiAnimationPresets',preset.key,preset.name.en,{description:'Create an editable UI animation and bind one component event in the same transaction.',defaults:createUIAnimationPreset(preset.key,'Anim01','en'),targets:['component'],lifecycle:'component event',example:example(request.key,{key:preset.key,event:'show'},{componentId:'Comp01'})},request.inputSchema);}
  if(!input.category||input.category==='readingLayouts')for(const [key,title]of [['portrait','Portrait reading'],['clear','Clear reading']]){const request=PresetDomainOperations.find(item=>item.key==='page.applyReadingPreset');add('readingLayouts',key,title,{description:'Arrange the existing story reading panel, text, name, avatar and toolbar while preserving component identities.',targets:['story page'],lifecycle:'page layout',defaults:{key},example:example(request.key,{key},{pageId:'Page01'})},request.inputSchema);}
  if(!input.category||input.category==='actionIcons')for(const preset of ActionIconPresets){const request=PresetDomainOperations.find(item=>item.key==='component.applyActionIcon');add('actionIcons',preset.key,preset.names.en,{description:'Use the shipped SVG in a public icon slot and reuse its imported asset.',targets:['component icon slot'],defaults:{state:'normal'},requiredAssets:[{kind:'image',source:`spring-${preset.key}.svg`,acquisition:'M04 prepared import'}],lifecycle:'component visual state',example:example(request.key,{key:preset.key,state:'normal'},{componentId:'Comp01'})},request.inputSchema);}
  if(!input.category||input.category==='recipes')for(const recipe of await scopedRecipes(owner,context)){
    const key=`${recipe.scope}/${recipe.id}`,selection=reference(recipe),operation=recipe.production?.operation??recipe.purposes[0];
    const parent=recipe.parameterPreset,available=recipe.production?.executor!=='planned';
    const defaults=recipe.production?.defaults??recipe.parameterPreset?.values??Object.fromEntries(recipe.parameters.map(parameter=>[parameter.key,parameter.defaultValue]));
    const field=recipe.production?'productionRecipe':parent?'parameterPreset':'recipe';
    push('recipes',key,localizeRecipe(recipe, 'en').name,recipe.operationSnapshot?.provider??null,{description:localizeRecipe(recipe, 'en').description,identity:selection,availability:available?'available':'planned',recipe,defaults,targets:recipe.uses,lifecycle:'frozen by M10 when preparing a task',example:{tool:'galcraft_production',arguments:{sessionId:'Session1',callId:'prepare-recipe-1',input:{action:'prepare',operation,connectionId:'Conn01',usage:recipe.uses[0],fields:{},[field]:field==='recipe'?{...selection,purpose:operation,parameterValues:{}}:selection,...(parent?{productionRecipe:{id:parent.recipeId,scope:parent.recipeScope,revision:parent.recipeRevision}}:{})}},replace:'Choose an allowed compatible connection and fill the operation fields. Select exact recipe revisions from this catalog.'}},schema(z.record(str,z.union([z.string(),z.number(),z.boolean(),z.null()]))),recipe);
  }
}

function scene(owner,input,context){
  const project=owner.project(context),document=project.readDocument(input.target.documentId),script=document&&Object.entries(document.files).find(([path])=>path.endsWith('/script.gal'));
  if(!script)fail('SCENE_DOCUMENT_MISSING','Select an actual scene document from context.');
  const parsed=parse({documentId:document.documentId,revision:document.revision,text:script[1]});
  if(parsed.issues.some(issue=>issue.severity==='error'))fail('SCENE_SOURCE_INVALID','Fix the scene source errors before preparing a semantic edit.');
  const node=input.target.statementId?parsed.cst.find(node=>node.id===input.target.statementId):null;
  if(input.target.statementId&&!node?.valid)fail('STATEMENT_MISSING','The selected statement is unavailable. Read the current scene again.');
  return {project,document,text:script[1],parsed,node};
}
const editFor=(document,label,patches,refs=[])=>({label,origin:'preset',expected:[{ref:{kind:'document',id:document.documentId},revision:document.revision}],patches,preparedAssets:[],requiredRefs:refs});
function writeStatement(source,command,args,label,refs=[]){
  const {node,text,document}=source,id=node?.id??createId(source.project.documents),after=`${command} ${JSON.stringify(args)} @${id};`;
  const terminal=source.parsed.cst.find(item=>item.valid&&['end','changeScene','return','jumpLabel'].includes(item.command)&&!item.object?.value?.when),at=node?.start??terminal?.start??text.length;
  return editFor(document,label,[{kind:'text',documentId:document.documentId,edits:[{start:at,end:node?.end??at,before:node?text.slice(node.start,node.end):'',after:node?after:`${at&&!text.slice(0,at).endsWith('\n')?'\n':''}${after}\n`}]}],refs);
}
function bindAsset(owner,fields,kinds,check){
  const current=owner.assets.current();if(!current)fail('ASSET_INDEX_MISSING','Open a project with an asset index first.');
  check({effects:['edit'],documents:[current.index.documentId]});
  const asset=current.index.data.assets.find(asset=>asset.id===fields.assetId);
  if(!asset||!kinds.includes(asset.kind)||!asset.variants.some(variant=>variant.id===fields.variantId))fail('ASSET_REFERENCE_INVALID','Select an existing asset of the required kind and its exact variant.');
  if(asset.activeVariantId!==fields.variantId)fail('ASSET_VARIANT_NOT_ACTIVE','This script reference uses the active asset version. Review and apply an asset variant switch first, then prepare this binding again.');
  return {asset,index:current.index};
}
function includeIndex(edit,index){if(!edit.expected.some(value=>value.ref.id===index.documentId))edit.expected.push({ref:{kind:'document',id:index.documentId},revision:index.revision});}
function combine(edit,resource){if(!resource.edit)return;edit.patches.push(...resource.edit.patches);edit.preparedAssets.push(...resource.edit.preparedAssets);for(const ref of resource.edit.expected)if(!edit.expected.some(item=>item.ref.id===ref.ref.id))edit.expected.push(ref);}

export async function preparePresetEdit(owner,raw,context,check){
  const input=PresetEditInputSchema.parse(raw),fields=input.fields,project=owner.project(context);let edit,resource;
  try{
    if(input.target.documentId)check({effects:['edit'],documents:[input.target.documentId]});
    if(input.operationKey==='scene.setBackground'||input.operationKey==='statement.bindVoice'){
      const source=scene(owner,input,context),voice=input.operationKey==='statement.bindVoice';
      if(source.node&&source.node.command!==(voice?'say':'changeBg')||voice&&!source.node)fail('STATEMENT_COMMAND','Select a dialogue statement for voice or a background statement for background editing.');
      const bound=bindAsset(owner,fields,voice?['audio']:['image','video'],check),refs=[{kind:'asset',id:bound.asset.id}];
      if(voice){
        const projectDocument=[...project.documents.values()].find(document=>document.files['project.json']),languages=projectDocument?JSON.parse(projectDocument.files['project.json']).data.languages:null;
        if(fields.locale&&languages&&!new Set([languages.textDefault,languages.voiceDefault,...languages.voices]).has(fields.locale))fail('VOICE_LOCALE','Choose a configured dialogue or voice language.');
        const changes=[{field:fields.locale?`voiceByLocale.${fields.locale}`:'voice',op:'set',value:bound.asset.id}],patch=unwrap(patchFields(source.parsed,{documentId:source.document.documentId,revision:source.document.revision,statementIds:[source.node.id],changes}));
        edit=editFor(source.document,'Bind dialogue audio',[toDocumentPatch(source.document.documentId,patch)],refs);
      }else{
        const previous=source.node?.object?.value??{},next={...previous,op:'show',assetId:bound.asset.id,fit:fields.fit,positionX:fields.positionX,positionY:fields.positionY};
        if(previous.assetId!==bound.asset.id){delete next.galleryId;delete next.differenceId;}
        edit=writeStatement(source,'changeBg',next,'Set scene background',refs);
      }
      includeIndex(edit,bound.index);
    }else if(input.operationKey==='stage.applyAnimationPreset'){
      const source=scene(owner,input,context),projectDocument=[...project.documents.values()].find(document=>document.files['project.json']),canvas=projectDocument?JSON.parse(projectDocument.files['project.json']).data.canvas:{width:1920};
      const args=source.node?.object?.value??{},preset=createAnimationPreset(fields.key,{...fields.parameters,stageWidth:canvas.width,station:fields.parameters.station??args.station});
      if(preset.lifecycle==='property'){
        if(source.node&&!['setAnimation','setComplexAnimation'].includes(source.node.command))fail('ANIMATION_STATEMENT','Select an animation statement, or use statementId:null to append one.');
        const target=fields.stageTarget??args.target;if(!target)fail('ANIMATION_TARGET','Choose the stage, a concrete object or a station.');
        const next={...args,animationId:args.animationId??createId(project.documents),target,animation:preset.animation,keepFinal:preset.keepFinal,loop:preset.loop};for(const key of ['presetId','resourceId','segments','parameters'])delete next[key];
        edit=writeStatement(source,'setComplexAnimation',next,'Apply stage animation preset');
      }else{
        const background=source.node?.command==='changeBg',exit=preset.lifecycle==='exit';
        if(!source.node||!['changeBg','changeFigure','changeIllustration'].includes(source.node.command)||(exit?!['exit','clear'].includes(args.op):!['show','replace',undefined].includes(args.op)))fail('ANIMATION_LIFECYCLE_TARGET','Choose an actual show statement for entrance, or an exit/clear statement for exit.');
        const transition={preset:'custom',resourceId:null,durationMs:preset.animation.durationMs,easing:{family:'linear',direction:'in'},direction:'left',animation:preset.animation};
        edit=writeStatement(source,source.node.command,{...args,op:exit?(background?'clear':'exit'):args.op??'show',transition:{...args.transition,[exit?'exit':'enter']:transition}},'Apply stage transition preset');
      }
    }else if(input.operationKey==='stage.applyWeatherPreset'){
      const source=scene(owner,input,context);if(source.node&&source.node.command!=='pixi')fail('WEATHER_STATEMENT','Select a pixi statement, or use statementId:null to append weather.');
      const preset=StageWeatherPresets[fields.key],index=owner.assets.current()?.index;if(!index)fail('ASSET_INDEX_MISSING','Open a project with an asset index.');check({effects:['edit'],documents:[index.documentId]});
      resource=unwrap(await owner.assets.prepareBuiltinPreset({file:join(import.meta.dirname,'../resources/practice/textures',preset.texture),tag:`galcraft-weather:${fields.key}`,source:{kind:'template',description:`OpenWebGAL/WebGAL_Terre · ${preset.texture} · MPL-2.0`,usage:'redistributable'}}));
      const args=source.node?.object?.value??{};edit=writeStatement(source,'pixi',{...args,effectId:fields.effectId??args.effectId??createId(project.documents),type:fields.key,target:fields.target,enabled:true,resourceId:resource.asset.id,density:fields.density??preset.density,speed:fields.speed??preset.speed,directionDeg:fields.directionDeg??preset.directionDeg,parameters:{...preset.parameters,...fields.parameters},layer:fields.layer},'Apply weather preset',[{kind:'asset',id:resource.asset.id}]);combine(edit,resource);includeIndex(edit,index);
    }else{
      const documents=[...project.documents.values()],template=readTemplateDocuments(documents),component=input.target.componentId?findComponent(template,input.target.componentId):null;
      if(input.operationKey==='page.applyReadingPreset'){
        const page=template.pages.find(page=>page.id===input.target.pageId);if(page?.key!=='story')fail('READING_PAGE','Choose the actual story page.');applyReadingPreset(template,fields.key);edit=templateEdit(documents,template,'Apply reading layout');
      }else{
        if(!component)fail('COMPONENT_MISSING','Choose an actual component from the current page tree.');
        if(input.operationKey==='component.applyAnimationPreset')edit=templateEdit(documents,putUIAnimation(template,createUIAnimationPreset(fields.key,createId(template),'en'),{componentId:component.id,event:fields.event,shared:false}),'Apply UI animation preset');
        else{
          if(!componentDefinition(component.part)?.imageSlots.includes('icon'))fail('ICON_SLOT_MISSING','Choose a component with a public icon slot.');
          const index=owner.assets.current()?.index;if(!index)fail('ASSET_INDEX_MISSING','Open a project with an asset index.');check({effects:['edit'],documents:[index.documentId]});
          resource=unwrap(await owner.assets.prepareBuiltinPreset({file:join(import.meta.dirname,'../resources/practice/ui',`spring-${fields.key}.svg`),tag:`galcraft:action-icon:${fields.key}`,source:{kind:'template',description:`GalCraft core action icon · ${fields.key}`,usage:'redistributable'}}));
          const visual=fields.state==='normal'?component.normal:component.states[fields.state]??={};(visual.images??={}).icon={assetId:resource.asset.id,variantId:resource.asset.activeVariantId,mode:'contain',positionX:.5,positionY:.5,colorMode:'mask',tint:null,opacity:1,slices:null,borders:null,fillCenter:false};
          edit=templateEdit(documents,template,'Apply action icon');edit.requiredRefs.push({kind:'asset',id:resource.asset.id});combine(edit,resource);includeIndex(edit,index);
        }
      }
    }
    for(const expected of edit.expected)if(!input.expected.some(value=>value.ref.kind===expected.ref.kind&&value.ref.id===expected.ref.id&&value.revision===expected.revision))fail('EDIT_EXPECTED_REQUIRED','Supply every affected document and read dependency at its current revision. Read context and prepare a new review.');
    edit.expected=input.expected;edit.origin='preset';
    return {edit,confirm:()=>resource?.confirm(),discard:()=>resource?.discard()};
  }catch(error){await resource?.discard();throw error;}
}
