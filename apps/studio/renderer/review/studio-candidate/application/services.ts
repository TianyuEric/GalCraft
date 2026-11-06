import { AssetSchema, NativeAnimationSchema, StageWeatherPresets, readPluginDocumentInstances, DefaultStudioPreferences, createId, type Asset, type DocumentView, type EditInput, type Json, type Lock, type Result, type Snapshot, type StudioBridge, type StudioPreferences } from '@galcraft/contracts';
import { FixtureAsset, FixtureVoiceAssets } from '@galcraft/contracts/fixtures';
import { compile, parse, LanguageService } from '@galcraft/dsl';
import { AssetCatalog } from '../../../../../../packages/assets/core/catalog.js';
import { AssetTypeRegistry } from '../../../../../../packages/assets/core/type-registry.js';
import { compileInput, createAuthoringServices } from '../../../authoring/bridge.js';
import { withCandidateCompileInput } from './compile-source.js';
import { readTemplateDocuments } from '@galcraft/templates';
import { createCandidateTemplateHost } from '../adapters/candidate-template-host.js';
import type { AuthoringServices } from '../../../authoring/controller.js';
import type { CandidateHost } from './session.js';
import { authoringSource, documentData } from './documents.js';
import { createCandidateReleaseHost } from '../adapters/candidate-release-host.js';
import { createCandidateAssetProcessing } from '../adapters/candidate-asset-processing.js';
import snowUri from '../../../../resources/practice/textures/snow.png?url&no-inline';
import rainUri from '../../../../resources/practice/textures/rain.png?url&no-inline';
import cherryUri from '../../../../resources/practice/textures/cherryBlossoms.webp?url&no-inline';

export const ok = <T,>(value:T):Result<T> => ({ok:true,value,warnings:[]});
export function fail(message:string,code='CANDIDATE_HOST'):Result<never> { const error={code,message,severity:'error' as const,owner:'M01' as const,related:[],actions:['retry' as const]}; return {ok:false,error,issues:[error]}; }
const unavailable = async ():Promise<Result<never>> => fail('该操作需要桌面文件或外部服务；浏览器审核宿主未提供此能力。');
export function candidateAssets(documents:readonly DocumentView[]) {return documentData<{assets:Asset[]}>(documents,'assets/index.json')?.assets ?? [];}
export function prepareCandidateAsset(documents:DocumentView[], input:{name:string;mime:string;uri:string;usage?:string}) {
  const index=documents.find(document=>'assets/index.json' in document.files)!,resources=documents.find(document=>'candidate/resources.json' in document.files)!;
  const assets=candidateAssets(documents),locations=documentData<{locations:Record<string,string>}>(documents,'candidate/resources.json')!.locations;
  const assetId=createId(),variantId=createId(),base=structuredClone(input.mime.startsWith('audio/')?FixtureVoiceAssets[0]!:FixtureAsset);
  const asset=AssetSchema.parse({...base,id:assetId,name:input.name,sceneIds:[],characterId:null,originalVariantId:variantId,activeVariantId:variantId,source:{kind:'import',description:'候选审核资源',usage:'localReview'},variants:[{...base.variants[0],id:variantId,files:[{path:'resource',bytes:input.uri.length,mime:input.mime,role:'primary'}],entry:'resource'}]});
  const edit:EditInput={label:`登记素材 · ${input.name}`,origin:'candidate',expected:[index,resources].map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision})),patches:[{kind:'json',documentId:index.documentId,changes:[{path:'/data/assets',op:'set',before:assets,after:[...assets,asset]}]},{kind:'json',documentId:resources.documentId,changes:[{path:'/data/locations',op:'set',before:locations,after:{...locations,[assetId]:input.uri}}]}],preparedAssets:[],requiredRefs:[]};
  return ok({asset,input:edit});
}

export function prepareCandidateAnimation(documents:DocumentView[], input:Parameters<NonNullable<NonNullable<StudioBridge['assets']>['saveAnimation']>>[0]) {
  const parsed=NativeAnimationSchema.safeParse(input.animation);if(!parsed.success)return fail(parsed.error.message);
  const assets=candidateAssets(documents),locations=documentData<{locations:Record<string,string>}>(documents,'candidate/resources.json')!.locations;
  const previous=input.assetId?assets.find(asset=>asset.id===input.assetId):undefined;
  if(input.assetId&&(!previous||previous.kind!=='animation'||previous.revision!==input.expectedRevision))return fail('动画资源已变化，请刷新后重试');
  const uri='data:application/vnd.galcraft.animation+json;charset=utf-8,'+encodeURIComponent(JSON.stringify(parsed.data));
  const prepared=prepareCandidateAsset(documents,{name:input.name,mime:'application/vnd.galcraft.animation+json',uri});if(!prepared.ok)return prepared;
  let asset=prepared.value.asset;asset.kind='animation';asset.variants[0]!.metadata={durationSec:parsed.data.durationMs/1000};
  if(previous){
    const variant=asset.variants[0]!;variant.parentId=previous.activeVariantId;
    asset={...previous,revision:previous.revision+1,name:input.name,activeVariantId:variant.id,variants:[...previous.variants,variant]};
    const patch=prepared.value.input.patches[0]!;if(patch.kind==='json')patch.changes[0]!.after=assets.map(item=>item.id===previous.id?asset:item);
    const resourcePatch=prepared.value.input.patches[1]!;if(resourcePatch.kind==='json')resourcePatch.changes[0]!.after={...locations,[`${previous.id}/${variant.id}`]:uri};
  }
  return ok({asset,input:prepared.value.input});
}

/** Every callable reads the same host at invocation; no Story fixture closes over another work. */
export function createCandidateServices(host:CandidateHost,theme:StudioPreferences['theme']='light',options:{failImportOnce?:string[];importPaths?:string[];templatePackages?:readonly Uint8Array[]}={}):AuthoringServices {
  let preferences={...structuredClone(DefaultStudioPreferences),theme,editor:{...DefaultStudioPreferences.editor,fontFamily:'Geist Variable, Microsoft YaHei UI, sans-serif'}},lastValid:Snapshot|null=null;
  const importFailures=new Set(options.failImportOnce??[]);
  const workspaces=new Map<string,import('@galcraft/contracts').WorkspaceResume>();
  const resources=()=>documentData<{locations:Record<string,string>}>(host.list(),'candidate/resources.json')!.locations;
  const assets=()=>candidateAssets(host.list());
  const variantResource=(asset:Asset,variantId=asset.activeVariantId,locations=resources())=>{
    const variant=asset.variants.find(item=>item.id===variantId);
    const entry=variant?.files.find(file=>file.path===variant.entry);
    const uri=locations[`${asset.id}/${variantId}`]??(variantId===asset.originalVariantId?locations[asset.id]:undefined);
    return entry&&uri?{variantId,uri,mime:entry.mime,bytes:entry.bytes}:null;
  };
  const index=()=>host.list().find(document=>'assets/index.json' in document.files)!;
  const modifyAssets=(label:string,change:(items:Asset[])=>Asset[])=>{const before=assets();return host.commit({label,origin:'field',expected:[{ref:{kind:'document',id:index().documentId},revision:index().revision}],patches:[{kind:'json',documentId:index().documentId,changes:[{path:'/data/assets',op:'set',before,after:change(structuredClone(before))}]}],preparedAssets:[],requiredRefs:[]});};
  const identity=(asset:Asset):import('@galcraft/contracts').AssetListIdentity=>{const variant=asset.variants.find(item=>item.id===asset.activeVariantId);return {assetId:asset.id,revision:asset.revision,name:asset.name,kind:asset.kind,folder:asset.folder,character:null,sameNameCount:assets().filter(item=>item.name===asset.name).length,sourceName:asset.sourceName,createdAt:asset.createdAt,shownVariant:variant?{id:variant.id,role:variant.role,metadata:variant.metadata,active:true,currentBinding:false}:null,currentBindingMissing:false};};
  const typeRegistry=new AssetTypeRegistry();
  const catalog=()=>{const docs=host.list(),source=authoringSource(docs),currentAssets=assets(),value=new AssetCatalog({schemaVersion:1,documentId:index().documentId,revision:index().revision,data:{assets:currentAssets}},typeRegistry),input=compileInput(docs);const references=input.ok?input.value.assetReferences??[]:[];
    for(const scene of source.scenes){const found:import('@galcraft/contracts').AssetReference[]=[];const visit=(data:unknown,nodeId:string)=>{if(typeof data==='string'&&currentAssets.some(asset=>asset.id===data))found.push({assetId:data,variantId:null,owner:{kind:'document',id:scene.documentId},source:{documentId:scene.documentId,revision:scene.revision,statementId:nodeId},usage:'scene',required:true});else if(data&&typeof data==='object')Object.values(data).forEach(item=>visit(item,nodeId));};for(const node of parse({documentId:scene.documentId,revision:scene.revision,text:scene.text}).cst)if(node.id)visit(node.object?.value,node.id);value.documentChanged(scene.documentId,found,new Map(),scene.sceneId);}
    for(const doc of docs.filter(doc=>doc.format!=='dsl'))value.documentChanged(doc.documentId,references.filter(ref=>ref.source?.documentId===doc.documentId));return value;
  };
  const recent:string[]=[];
  const renames=new Map<string,{input:EditInput;conflicts:boolean}>();
  const assetInput=(edit:import('../../../../../../packages/assets/core/types.js').PreparedIndexEdit,label:string):EditInput=>({label,origin:'field',expected:edit.expected,patches:edit.indexPatches,preparedAssets:[],requiredRefs:[]});
  const assetBridge:StudioBridge['assets']={
    typeCatalog:async()=>ok(typeRegistry.list().map(entry=>({...entry,count:assets().filter(asset=>asset.kind===entry.descriptor.key).length}))),editTypeData:unavailable,saveAnimation:unavailable,weatherTexture:unavailable,iconPresets:async()=>ok([]),importIconPreset:unavailable,
    references:async assetId=>ok(catalog().references(assetId)),
    query:async query=>catalog().queryAssets(query),
    picker:async input=>catalog().queryPicker(input,recent,new Map(authoringSource(host.list()).characters.map(character=>[character.id,character.name]))),
    recordUse:async input=>{for(const id of input.assetIds){const at=recent.indexOf(id);if(at>=0)recent.splice(at,1);recent.unshift(id);}return ok(undefined);},removeRecent:async input=>{const at=recent.indexOf(input.assetId);if(at>=0)recent.splice(at,1);return ok(undefined);},
    allIds:async query=>catalog().queryAssetIds(query),
    get:async id=>ok(assets().find(asset=>asset.id===id)??null),inspectModel:async id=>ok(assets().find(asset=>asset.id===id)??null),
    describe:async input=>ok({items:assets().filter(asset=>input.assetIds.includes(asset.id)).map(identity),missingAssetIds:input.assetIds.filter(id=>!assets().some(asset=>asset.id===id))}),
    rename:async changes=>{const prepared=catalog().planRename(changes);return prepared.ok?host.commit(assetInput(prepared.value,'重命名素材')):prepared;},
    planBatchRename:async input=>{const values=new Map(input.values.map(value=>[value.assetId,{chapter:value.chapter,character:value.character,usage:input.template.includes('{name}')?assets().find(asset=>asset.id===value.assetId)?.name??value.usage:value.usage}]));const prepared=catalog().planBatchRename({...input,template:input.template.replaceAll('{name}','{usage}').replaceAll('{n}','{number}'),values});if(!prepared.ok)return prepared;const planId=createId();renames.set(planId,{input:assetInput(prepared.value.edit,'批量重命名素材'),conflicts:!!prepared.value.conflicts.length});return ok({planId,names:prepared.value.names,conflicts:prepared.value.conflicts,indexRevision:index().revision});},
    applyBatchRename:async id=>{const plan=renames.get(id);if(!plan)return fail('重命名计划不存在');renames.delete(id);return plan.conflicts?fail('批量名称有冲突，请修正预览。'):host.commit(plan.input);},
    remove:async ids=>{const references=host.list().filter(document=>!('assets/index.json' in document.files)&&!('candidate/resources.json' in document.files)).some(document=>Object.values(document.files).some(raw=>ids.some(id=>raw.includes(id))));return references?fail('素材仍被作品引用，请先解除引用。'):modifyAssets('删除素材',items=>items.filter(asset=>!ids.includes(asset.id)));},
    preview:async(id,variantId)=>{const asset=assets().find(asset=>asset.id===id),resource=asset&&variantResource(asset,variantId??undefined);return resource?ok({uri:resource.uri,mime:resource.mime,playback:{loopStartSec:null,loopEndSec:null}}):fail('素材资源缺失');},
    thumbnails:async requests=>{
      const byId=new Map(assets().map(asset=>[asset.id,asset])),locations=resources();
      return ok(requests.flatMap(({assetId,variantId})=>{
        const asset=byId.get(assetId),resource=asset?.kind==='image'&&variantResource(asset,variantId??undefined,locations);
        return resource&&resource.mime.startsWith('image/')?[{assetId,variantId:resource.variantId,uri:resource.uri}]:[];
      }));
    },stopPreview:async()=>ok(undefined),
    resolveRuntime:async(id,variantId)=>{const asset=assets().find(asset=>asset.id===id),resource=asset&&variantResource(asset,variantId);return resource?ok({leaseId:createId(),uri:resource.uri,mime:resource.mime,bytes:resource.bytes}):fail('素材运行资源缺失');},releaseRuntime:async()=>ok(undefined),
    verifyTarget:async target=>{const locations=resources(),edit=modifyAssets('验证审核资源目标',items=>items.map(asset=>({...asset,variants:asset.variants.map(variant=>({...variant,targets:{...variant.targets,[target]:variantResource(asset,variant.id,locations)?'direct':'unverified'}}))})));return edit.ok?ok({edit:edit.value,issues:[]}):edit;},
    prepareMattingModel:unavailable,removeBackground:unavailable,confirmBackground:unavailable,discardBackground:unavailable,
    import:async paths=>{const succeeded:Asset[]=[],failed:{path:string;issue:import('@galcraft/contracts').Issue}[]=[];for(const path of paths){if(importFailures.delete(path)){const failure=fail('审核文件暂时不可读，重试将恢复。');if(!failure.ok)failed.push({path,issue:failure.error});continue;}const prepared=prepareCandidateAsset(host.list(),{name:path.split('/').at(-1)??'导入素材',uri:path,mime:/\.(opus|mp3|wav)$/i.test(path)?'audio/ogg':'image/png'}),result=prepared.ok?host.commit(prepared.value.input):prepared;if(result.ok&&prepared.ok)succeeded.push(prepared.value.asset);else if(!result.ok)failed.push({path,issue:result.error});}return ok({succeeded,failed});},
  };
  assetBridge.saveAnimation=async input=>{
    const prepared=prepareCandidateAnimation(host.list(),input);if(!prepared.ok)return prepared;
    const edit=host.commit(prepared.value.input),asset=prepared.value.asset;
    return edit.ok?ok({assetId:asset.id,variantId:asset.activeVariantId,edit:edit.value}):edit;
  };
  assetBridge.weatherTexture=async key=>{
    const tag='galcraft-weather:'+key,existing=assets().find(asset=>asset.tags.includes(tag));if(existing)return ok(existing);
    const preset=StageWeatherPresets[key],uri={snow:snowUri,rain:rainUri,cherryBlossoms:cherryUri}[key];if(!preset||!uri)return fail('未知天气预设');
    const prepared=prepareCandidateAsset(host.list(),{name:preset.title[0],mime:key==='cherryBlossoms'?'image/webp':'image/png',uri});if(!prepared.ok)return prepared;
    prepared.value.asset.tags.push(tag);const edit=host.commit(prepared.value.input);return edit.ok?ok(prepared.value.asset):edit;
  };
  Object.assign(assetBridge,createCandidateAssetProcessing(host,assetBridge));
  const documents:StudioBridge['documents']={...host.bridge.documents,createBackup:unavailable,prepareRestore:unavailable,checkRestore:unavailable,commitRestore:unavailable,cancelRestore:unavailable,getConflict:async()=>ok([]),resolveConflict:unavailable,listRecovery:async()=>ok(null),recover:async()=>ok([]),getRecoveryConflict:async()=>ok([]),resolveRecoveryConflict:unavailable};
  const authoringPreferences:StudioBridge['authoringPreferences']={readPreferences:async()=>ok(structuredClone(preferences)),writePreferences:async value=>{preferences=structuredClone(value);return ok(undefined);},readWorkspace:async id=>ok(workspaces.get(id)??null),writeWorkspace:async value=>{workspaces.set(value.projectId,structuredClone(value));return ok(undefined);},clearWorkspace:async id=>{workspaces.delete(id);return ok(undefined);},readStageGuides:async projectId=>ok({schemaVersion:1,projectId,uiBounds:true,center:true,thirds:false}),writeStageGuides:async()=>ok(undefined)};
  const bridge:AuthoringServices['bridge']={documents,authoringPreferences,assets:assetBridge,plugins:{commandSpecs:async()=>ok([]),inspectPackage:unavailable,install:unavailable,loadDevelopment:unavailable,resolve:async()=>ok({handleId:createId(),packages:[]}),release:async()=>ok(undefined)},engines:{listCreationVersions:async()=>ok(['0.1.0']),importLive2D:unavailable,resolvePreview:async snapshot=>ok({handleId:createId(),engineVersion:snapshot.engineVersion,url:import.meta.env.DEV?new URL('../../../stories/preview-engine.ts',import.meta.url).href:new URL('./preview-engine.js',window.location.href).href}),releasePreview:async()=>ok(undefined)},files:{pickAssets:async()=>ok(options.importPaths??['/practice/backgrounds/spring-station.png']),pickRecipes:unavailable,revealEntity:unavailable,openBuild:unavailable},templates:createCandidateTemplateHost(host,options.templatePackages)};
  const compilePreview:NonNullable<AuthoringServices['compilePreview']>=async(saved=false,provided)=>{
    try{
      const docs=(provided??host.list()).map(document=>saved?{...document,files:document.savedFiles,revision:document.savedRevision}:document).filter(document=>Object.keys(document.files).length);
      return await withCandidateCompileInput(bridge,docs,input=>{
      const result=compile(input);if(result.snapshot&&!provided)lastValid=result.snapshot;
      return ok({snapshot:result.snapshot,lastValid:result.snapshot??lastValid,current:!!result.snapshot,issues:result.issues});
      });
    }catch(error){return fail(String(error),'CANDIDATE_COMPILE');}
  };
  Object.assign(bridge, createCandidateReleaseHost({documents,plugins:bridge.plugins,files:bridge.files!,compile:compilePreview}), {projects:{chooseDirectory:async()=>ok('candidate://exports')}});
  const searchSemantic:NonNullable<AuthoringServices['searchSemantic']>=async(filter,offset,sceneIds)=>{
    // A query owns its compiler so simultaneous preview/search cannot cancel each other.
    const language=new LanguageService();
    const semanticBridge={...bridge,language:{compile:async(input:Parameters<LanguageService['compile']>[0])=>ok(await language.compile(input)),querySemantic:async(input:Parameters<LanguageService['querySemantic']>[0])=>language.querySemantic(input)}} as StudioBridge;
    return createAuthoringServices(semanticBridge).searchSemantic!(filter,offset,sceneIds);
  };
  return {bridge,searchSemantic,read:async docs=>{try{return ok(authoringSource(docs??host.list()));}catch(error){return fail(String(error));}},readPreferences:authoringPreferences.readPreferences,writePreferences:authoringPreferences.writePreferences,compilePreview,runtimeAssets:assetBridge,queryAssets:async query=>{const result=await assetBridge.query({folder:null,characterId:null,sceneId:null,locale:null,search:query.text,tags:[],reference:'any',review:'any',sort:'name',direction:'asc',indexRevision:null,...query,kind:query.kind as Asset['kind']|null});return result;},allAssetIds:async query=>catalog().queryAssetIds({folder:null,characterId:null,sceneId:null,locale:null,search:query.text,tags:[],reference:'any',review:'any',sort:'name',direction:'asc',indexRevision:null,...query,kind:query.kind as Asset['kind']|null,offset:0,limit:100}),queryAssetPicker:assetBridge.picker,recordAssetUse:assetBridge.recordUse,removeRecentAsset:assetBridge.removeRecent,getAsset:assetBridge.get,inspectModelAsset:assetBridge.inspectModel,describeAssets:assetBridge.describe,renameAssets:assetBridge.rename,verifyAssetTarget:assetBridge.verifyTarget,planBatchRename:assetBridge.planBatchRename,applyBatchRename:assetBridge.applyBatchRename,removeAssets:assetBridge.remove,previewAsset:assetBridge.preview,stopAssetPreview:assetBridge.stopPreview,thumbnails:assetBridge.thumbnails,importAssets:assetBridge.import,pickAssetFiles:bridge.files!.pickAssets,saveAnimation:assetBridge.saveAnimation,weatherTexture:assetBridge.weatherTexture,assetTypeCatalog:assetBridge.typeCatalog,prepareMattingModel:assetBridge.prepareMattingModel,removeBackground:assetBridge.removeBackground,confirmBackground:assetBridge.confirmBackground,discardBackground:assetBridge.discardBackground};
}
