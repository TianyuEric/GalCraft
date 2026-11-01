import { createId } from '@galcraft/contracts';
import { BuiltinAssetKindSchema, CharacterSchema, DefaultStudioPreferences, VariableSchema } from '@galcraft/contracts';
import type { DocumentView, EditInput, EditReceipt, Result, StudioBridge, StudioPreferences } from '@galcraft/contracts';
import { FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import { createTemplateDocuments, readTemplateDocuments } from '@galcraft/templates';
import { preparePageEdit } from '@galcraft/templates/editor';
import { compile } from '@galcraft/dsl';
import type { AuthoringSource } from '../authoring/controller.js';
import type { Overview, ProductionBridge, WorkbenchBridge } from '../pages/Production/bridge.js';
import { productAssets, productMedia, productSnapshot } from './product-fixture.js';
import type { mountAuthoring } from '../authoring/view.js';
import { productionRecords } from './production-fixture.js';
import { projectLibraryFixture } from '../pages/Projects/project-library-fixture.js';

export type ProductState='normal'|'empty'|'failed'|'loading';
export const ok=<T,>(value:T):Result<T>=>({ok:true,value,warnings:[]});
const unavailable=async():Promise<Result<never>>=>{
  const error={code:'STORY_HOST_REQUIRED',message:'此操作需要 Studio 桌面宿主',severity:'error' as const,owner:'M01' as const,related:[],actions:[]};
  return {ok:false,error,issues:[error]};
};
export function studioFixture(state:ProductState,locale:StudioPreferences['locale'],theme:StudioPreferences['theme']){
  const snapshot=productSnapshot(), assets=state==='empty'?[]:productAssets();
  let preferences={...structuredClone(DefaultStudioPreferences),locale,theme};
  const json=(documentId:string,path:string,data:unknown):DocumentView=>{
    const files={[path]:JSON.stringify({schemaVersion:1,documentId,revision:1,data})};
    return {documentId,revision:1,savedRevision:1,format:'json',files,savedFiles:structuredClone(files),dirty:false};
  };
  let documents:DocumentView[]=[json(fixtureId(0xe01),'project.json',snapshot.project),json(fixtureId(0xe02),'dependencies.lock.json',snapshot.lock),
    json(fixtureId(0xe03),'assets/index.json',{assets}),...snapshot.characters.map(character=>json(character.id,`characters/${character.id}.json`,character)),
    ...snapshot.variables.map(variable=>json(variable.id,`variables/${variable.id}.json`,variable)),
    ...createTemplateDocuments(snapshot.template).map(document=>({...document,savedRevision:1,savedFiles:structuredClone(document.files),dirty:false})),
    ...snapshot.scenes.map((scene,index)=>{
      const document=json(index===0?FixtureIds.streetDocument:FixtureIds.bookshopDocument,`scenes/${scene.scene.id}/scene.json`,scene.scene);
      document.format='dsl';document.files[`scenes/${scene.scene.id}/script.gal`]=scene.instructions.map(i=>`${i.opcode} ${JSON.stringify(i.args)} @${i.statementId};`).join('\n');
      document.savedFiles=structuredClone(document.files);return document;
    })];
  const plans=new Map<string,EditInput>(),undo:DocumentView[][]=[],redo:DocumentView[][]=[];
  const project=()=>JSON.parse(documents.find(document=>'project.json' in document.files)!.files['project.json']!).data as typeof snapshot.project;
  const characters=()=>documents.flatMap(document=>Object.entries(document.files).filter(([path])=>path.startsWith('characters/')&&path.endsWith('.json')).map(([,text])=>CharacterSchema.parse(JSON.parse(text).data)));
  const variables=()=>documents.flatMap(document=>Object.entries(document.files).filter(([path])=>path.startsWith('variables/')&&path.endsWith('.json')).map(([,text])=>VariableSchema.parse(JSON.parse(text).data)));
  const receipt=():EditReceipt=>({groupId:createId(),operationId:createId(),documents:documents.map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision})),dirty:documents.filter(document=>document.dirty).map(document=>document.documentId),assetIds:[]});
  const source=():AuthoringSource=>({projectDocumentId:fixtureId(0xe01),projectRevision:documents[0]!.revision,projectSavedRevision:documents[0]!.savedRevision,projectDirty:documents[0]!.dirty,project:project(),
    scenes:snapshot.scenes.map((scene,index)=>{const document=documents.find(d=>d.documentId===(index===0?FixtureIds.streetDocument:FixtureIds.bookshopDocument))!;return {sceneId:scene.scene.id,documentId:document.documentId,revision:document.revision,savedRevision:document.savedRevision,dirty:document.dirty,name:scene.scene.name,chapterId:scene.scene.chapterId,text:document.files[`scenes/${scene.scene.id}/script.gal`]!};}),
    characters:characters(),variables:variables().map(variable=>({...variable,declaringSceneId:null})),references:[...assets.map(asset=>({kind:'asset' as const,id:asset.id,name:asset.name})),...characters().map(character=>({kind:'character' as const,id:character.id,name:character.name})),...variables().map(variable=>({kind:'variable' as const,id:variable.id,name:variable.name}))],anyDirty:documents.some(document=>document.dirty)});
  const delayed=async<T,>(value:T):Promise<Result<T>>=>{
    if(state==='loading')await new Promise<void>(()=>{});
    if(state==='failed'){const error={code:'STORY_SERVICE_FAILED',message:'服务暂时不可用，请重试',severity:'error' as const,owner:'M01' as const,related:[],actions:['retry' as const]};return {ok:false,error,issues:[error]};}
    return ok(value);
  };
  const documentBridge:StudioBridge['documents']={
    list:async()=>ok(structuredClone(documents)),
    planEdit:async input=>{const planId=createId();plans.set(planId,structuredClone(input));return ok({planId,input,members:input.patches.map(p=>p.documentId),issues:[],before:Object.fromEntries(documents.map(d=>[d.documentId,d.revision])),preview:[]});},
    applyEdit:async planId=>{
      const input=plans.get(planId);if(!input)return unavailable();undo.push(structuredClone(documents));redo.length=0;
      for(const patch of input.patches){
        if(patch.kind==='document'){if(patch.op==='delete')documents=documents.filter(d=>d.documentId!==patch.documentId);else if(patch.after&&typeof patch.after==='object'&&!Array.isArray(patch.after)){
          const after=patch.after as {format:'json'|'dsl';files:Record<string,string>};documents.push({documentId:patch.documentId,revision:1,savedRevision:0,dirty:true,format:after.format,files:after.files,savedFiles:{}});
        }continue;}
        const document=documents.find(d=>d.documentId===patch.documentId);if(!document)continue;
        if(patch.kind==='file'){if(patch.after===null)delete document.files[patch.path];else document.files[patch.path]=patch.after;}
        if(patch.kind==='text'){const path=Object.keys(document.files).find(p=>p.endsWith('.gal'))!;for(const edit of [...patch.edits].sort((a,b)=>b.start-a.start)){const text=document.files[path]!;document.files[path]=text.slice(0,edit.start)+edit.after+text.slice(edit.end);}}
        if(patch.kind==='json'){const path=Object.keys(document.files).find(p=>p.endsWith('.json'))!,data=JSON.parse(document.files[path]!);for(const change of patch.changes){const keys=change.path.split('/').slice(1).map(k=>k.replaceAll('~1','/').replaceAll('~0','~'));let parent=data;for(const key of keys.slice(0,-1))parent=parent[key];if(change.op==='remove')delete parent[keys.at(-1)!];else parent[keys.at(-1)!]=change.after;}document.files[path]=JSON.stringify(data);}
        document.revision++;document.dirty=true;
      }plans.delete(planId);return ok(receipt());
    },
    planUndo:async documentId=>ok({planId:createId(),requestedOperationId:createId(),reverseOrder:[],members:[documentId],expected:[],label:'撤销'}),
    planRedo:async documentId=>ok({planId:createId(),requestedOperationId:createId(),reverseOrder:[],members:[documentId],expected:[],label:'重做'}),
    undo:async()=>{const before=undo.pop();if(before){redo.push(structuredClone(documents));documents=before;}return ok(receipt());},redo:async()=>{const after=redo.pop();if(after){undo.push(structuredClone(documents));documents=after;}return ok(receipt());},
    planSave:async()=>ok({planId:createId(),members:documents.map(d=>d.documentId),versions:receipt().documents,files:[],extraDirtyMembers:[],objects:[],requestedObjects:[],reasons:[],preview:[]}),
    save:async()=>{for(const document of documents){document.savedFiles=structuredClone(document.files);document.savedRevision=document.revision;document.dirty=false;}return ok({transactionId:createId(),saved:receipt().documents,remainingDirty:[]});},
    createBackup:unavailable,prepareRestore:unavailable,checkRestore:unavailable,commitRestore:unavailable,cancelRestore:unavailable,
    getConflict:async()=>ok([]),resolveConflict:unavailable,listRecovery:async()=>ok(null),recover:async()=>ok([]),getRecoveryConflict:async()=>ok([]),resolveRecoveryConflict:unavailable,
  };
  const records=productionRecords(snapshot);
  let tasks=state==='empty'?[]:records.tasks,candidates=state==='empty'?[]:records.candidates,drafts=state==='empty'?[]:records.drafts;
  const overview=():Overview=>({tasks,drafts,candidates,canvas:project().canvas,characters:characters(),pages:snapshot.template.pages,scenes:snapshot.scenes.map(scene=>({id:scene.scene.id,name:scene.scene.name,statements:scene.instructions.map(i=>({id:i.statementId,command:i.opcode,label:i.opcode}))})),assets,recipes:[],connections:[],workflows:[],versions:receipt().documents});
  let outline:import('@galcraft/contracts').AuthoringOutline={setting:'',style:'',audienceNotes:'',characters:characters().map(character=>({characterId:character.id,description:'',goal:''})),chapters:[]},outlineRevision:number|null=null;
  const production:ProductionBridge={waitForTask:unavailable,inspectTaskResources:unavailable,releaseTaskResources:unavailable,planOperation:unavailable,authorizeStage:unavailable,reprocess:unavailable,saveDefaults:async defaults=>ok(defaults),removeConnection:unavailable,deleteRecipe:unavailable,planContinuation:unavailable,submitContinuation:unavailable,previewScript:async()=>ok(structuredClone(snapshot)),readOutline:async()=>ok({documentId:null,revision:outlineRevision,outline:structuredClone(outline)}),saveOutline:async input=>{outline=structuredClone(input.outline);outlineRevision=(outlineRevision??0)+1;return ok(receipt());},saveImageRoutes:async routes=>ok(routes),overview:()=>delayed(overview()),assetReferences:async()=>ok([]),mediaInput:unavailable,attachment:unavailable,context:async()=>ok([]),previewComposition:unavailable,
    discardDraft:async id=>{drafts=drafts.filter(d=>d.id!==id);return ok(undefined);},removeTaskRecord:async id=>{tasks=tasks.filter(task=>task.id!==id);return ok(undefined);},
    saveDraft:async({draft})=>{const saved={...structuredClone(draft),revision:draft.revision+1,updatedAt:new Date().toISOString()};drafts=[...drafts.filter(d=>d.id!==draft.id),saved];return ok(saved);},
    plan:unavailable,submit:unavailable,resume:unavailable,retry:unavailable,cancel:async id=>{const task=tasks.find(task=>task.id===id);if(!task)return unavailable();for(const item of task.items)if(['running','queued','submitting'].includes(item.state))item.state='cancelled';return ok({local:'stopped',remote:'notApplicable'});},select:unavailable,discardAdoption:unavailable,apply:unavailable,keepResults:unavailable,
    candidateContent:async id=>{const candidate=candidates.find(record=>record.candidate.id===id)?.candidate;return candidate?ok({text:candidate.editedText??'',media:[]}):unavailable();},
    editCandidate:async({id,text})=>{const candidate=candidates.find(record=>record.candidate.id===id)?.candidate;if(!candidate)return unavailable();candidate.editedText=text;return ok(structuredClone(candidate));},transferPrompt:unavailable,
    saveRecipe:unavailable,copyRecipe:unavailable,exportRecipes:unavailable,planRecipeImport:unavailable,applyRecipeImport:unavailable,saveWorkflow:unavailable,listWorkflowDrafts:async()=>ok([]),saveWorkflowDraft:async input=>ok(input.draft),discoverWorkflowOutputs:unavailable,prepareUIPlan:unavailable,confirmUIPlan:unavailable,saveComposition:unavailable,prepareUIAdoption:unavailable};
  const assetBridge: StudioBridge['assets'] = {
    typeCatalog: async () => ok(BuiltinAssetKindSchema.options.map(key => ({
      descriptor: { contractVersion:1, key, typeVersion:1, title:key, description:'', icon:key, schema:true, fields:[], extensions:[], targets:['web','windows','android'], resourceProviderKey:null, capabilities:[] },
      provider:null, count:assets.filter(asset => asset.kind === key).length,
    }))), processorCatalog: async () => ok([]), resourceCandidates: async () => ok([]),
    subscribeTargetVerification: () => () => {},
    query: async query => {
      const result = await services.queryAssets({ ...query, text: query.search, offset: query.offset, limit: query.limit });
      return result.ok ? ok({ ...result.value, offset: query.offset ?? 0 }) : result;
    }, get: id => services.getAsset(id),
    thumbnails: requests => services.thumbnails(requests), preview: id => services.previewAsset(id),
    stopPreview: async () => ok(undefined),
    resolveRuntime: (id, version) => services.runtimeAssets.resolveRuntime(id, version), releaseRuntime: async () => ok(undefined),
    // These stories exercise page assembly, not disk mutation or native processing.
    editTypeData: unavailable, saveAnimation: unavailable, weatherTexture: unavailable, verifyTarget: unavailable, picker: unavailable,
    recordUse: unavailable, removeRecent: unavailable, allIds: unavailable, inspectModel: unavailable, describe: unavailable,
    rename: unavailable, planBatchRename: unavailable, applyBatchRename: unavailable, remove: unavailable,
    prepareMattingModel: unavailable, removeBackground: unavailable, confirmBackground: unavailable,
    discardBackground: unavailable, import: unavailable, iconPresets: unavailable, importIconPreset: unavailable,
  };
  const bridge={documents:documentBridge,production,assets:assetBridge,projects:projectLibraryFixture(state==='empty',snapshot.projectId),files:{pickAssets:()=>unavailable(),pickRecipes:()=>unavailable(),revealEntity:()=>unavailable(),openBuild:()=>unavailable()} satisfies StudioBridge['files'],
    templates:{preparePageEdit:async request=>{try{return ok(preparePageEdit({documents,request}));}catch(reason){const error={code:'STORY_PAGE_EDIT',message:String(reason),severity:'error' as const,owner:'M08' as const,related:[],actions:[]};return{ok:false as const,error,issues:[error]};}},preparePageStyleEdit:unavailable,compileStyle:unavailable} satisfies StudioBridge['templates'],
    authoringPreferences:{readPreferences:async()=>ok(preferences),writePreferences:async value=>{preferences=value;return ok(undefined);},readWorkspace:async()=>ok(null),writeWorkspace:async()=>ok(undefined),clearWorkspace:async()=>ok(undefined),readStageGuides:async projectId=>ok({schemaVersion:1,projectId,uiBounds:true,center:true,thirds:false}),writeStageGuides:async()=>ok(undefined)} satisfies StudioBridge['authoringPreferences'],
    engines:{listCreationVersions:async()=>ok(['0.1.0']),importLive2D:unavailable,resolvePreview:async()=>ok({handleId:createId(),engineVersion:'0.1.0',url:new URL('./preview-engine.ts',import.meta.url).href}),releasePreview:async()=>ok(undefined)} satisfies StudioBridge['engines'],
    plugins:{inspectPackage:unavailable,install:unavailable,loadDevelopment:unavailable,resolve:async()=>ok({handleId:createId(),packages:[]}),release:async()=>ok(undefined),list:()=>delayed({entries:[],lock:snapshot.lock}),planChange:unavailable} satisfies WorkbenchBridge['plugins'],
    upgrades:{list:async()=>ok([{version:'0.1.0',targets:['web','windows'],conversions:[]}]),history:async()=>ok([]),plan:unavailable,commit:unavailable,restore:unavailable,cancel:async()=>ok({local:'alreadyFinished',remote:'notApplicable'})} satisfies WorkbenchBridge['upgrades'],
    builds:{targets:async()=>ok([]),detectToolchain:async()=>ok({directory:""}),prepareToolchain:async()=>ok({directory:""}),cancelToolchain:async()=>ok({cancelled:false}),status:()=>delayed({ready:true}),signingCertificates:async()=>ok([]),planBuild:async()=>ok({planId:createId(),issues:[]}),build:unavailable,cancel:unavailable,test:unavailable,instructions:unavailable,chooseOldSaves:async()=>ok([]),compatibility:async()=>ok(null)} satisfies WorkbenchBridge['builds'],
  };
  const services={bridge,queryAssetPicker:async ({context,query})=>{
      const matching=assets.filter(a=>context.allowedKinds.includes(a.kind)&&`${a.name} ${a.folder.join('/')}`.toLocaleLowerCase().includes(query.search.toLocaleLowerCase()));
      return delayed({items:matching.slice(query.offset,query.offset+query.limit),total:matching.length,offset:query.offset,indexRevision:1,rows:[],current:null,currentMissing:!!context.currentAssetId&&!assets.some(a=>a.id===context.currentAssetId),applied:[],recentEntries:[],missingRecentIds:[],empty:matching.length?null:assets.length?'filter' as const:'library' as const});
    },recordAssetUse:async()=>ok(undefined),assetTypeCatalog:assetBridge.typeCatalog,read:async()=>ok(source()),queryAssets:async(query)=>{const matching=assets.filter(a=>(!query.kind||a.kind===query.kind)&&a.name.includes(query.text)),page={items:matching.slice(query.offset,query.offset+query.limit),total:matching.length,indexRevision:1};
      // The shell primes its reference catalog before opening the selected page.
      // Let that bootstrap finish so page loading and error states remain visible.
      return query.limit===100?ok(page):delayed(page);},
    readPreferences:async()=>ok(preferences),writePreferences:async value=>{preferences=value;return ok(undefined);},
    chooseDirectory:async()=>ok(null),openProject:async()=>ok({projectId:snapshot.projectId,sessionId:FixtureIds.session}),closeProject:async()=>ok(undefined),pickAssetFiles:async()=>ok([]),revealEntity:async()=>ok(undefined),
    getAsset:async id=>ok(assets.find(a=>a.id===id)??null),thumbnails:async requests=>ok(requests.filter(r=>assets.find(a=>a.id===r.assetId)?.kind==='image').map(r=>({assetId:r.assetId,variantId:assets.find(a=>a.id===r.assetId)!.activeVariantId,uri:productMedia[r.assetId]!}))),
    previewAsset:async assetId=>{const asset=assets.find(asset=>asset.id===assetId);return asset?ok({uri:productMedia[assetId]!,mime:asset.variants[0]!.files[0]!.mime,playback:{loopStartSec:null,loopEndSec:null}}):unavailable();},stopAssetPreview:async()=>ok(undefined),
    runtimeAssets:{resolveRuntime:async(assetId,variantId)=>{const variant=assets.find(asset=>asset.id===assetId)?.variants.find(variant=>variant.id===variantId);return variant?ok({leaseId:createId(),uri:productMedia[assetId]!,mime:variant.files[0]!.mime,bytes:variant.files[0]!.bytes}):unavailable();},releaseRuntime:async()=>ok(undefined)} satisfies NonNullable<Parameters<typeof mountAuthoring>[1]['runtimeAssets']>,
    compilePreview:async()=>{
      const current=source();const result=compile({project:current.project,projectId:snapshot.projectId,engineVersion:snapshot.engineVersion,lock:snapshot.lock,scenes:snapshot.scenes.map(s=>s.scene),characters:current.characters,variables:variables(),assets:productAssets(),gallery:snapshot.gallery,flows:snapshot.flows,template:readTemplateDocuments(documents),pluginDocuments:{},documents:current.scenes.map(scene=>({documentId:scene.documentId,revision:scene.revision,kind:'scene',sceneId:scene.sceneId,text:scene.text})),cancelOperationId:createId()});
      return ok({snapshot:result.snapshot,lastValid:null,current:true,issues:result.issues});
    },
  } satisfies Parameters<typeof mountAuthoring>[1];
  return {services, setState(next: ProductState) { state = next; }};
}
