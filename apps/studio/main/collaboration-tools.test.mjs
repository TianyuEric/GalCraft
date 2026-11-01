import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {mediaExecutables,runProcess} from '@galcraft/media-tools/process';
import { join, resolve } from 'node:path';
import {createOfficialTemplate,createTemplateDocuments,readTemplateDocuments} from '@galcraft/templates';
import { ProjectSession } from '@galcraft/documents';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import { AssetTypeRegistry, createAssetIndex,assetFilePath } from '@galcraft/assets';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { StudioAssets } from './asset-providers.mjs';
import { StudioCollaboration } from './collaboration-providers.mjs';
import { CollaborationMedia } from './collaboration-media.mjs';
const root=resolve(import.meta.dirname,'../../../tmp/testing/projects/a/mcp-tools-unit'),profile=resolve(import.meta.dirname,'../../../tmp/testing/user-data/mcp-tools-unit');
const sessionIdOf=record=>record.sessionId;
const version=(id,revision)=>({ref:{kind:'document',id},revision});
const sharp=createRequire(new URL('../../../packages/assets/package.json',import.meta.url))('sharp');
let project,service,client;
afterEach(async()=>{await client?.close();client=null;await service?.close();service=null;await project?.dispose('discard');project=null;await rm(root,{recursive:true,force:true});await rm(profile,{recursive:true,force:true});});
async function setup(additional=[]){
  await rm(root,{recursive:true,force:true});
  const assets=Array.from({length:96},(_,i)=>{const asset=structuredClone(FixtureAsset);asset.id=`Ast${String(i).padStart(3,'0')}`;asset.name=i<2?'同名背景.png':`背景${i}.png`;asset.sourceName=`原件${i}.png`;asset.variants[0].id=`Var${String(i).padStart(3,'0')}`;asset.activeVariantId=asset.originalVariantId=asset.variants[0].id;return asset;});
  assets[0].variants.push({...structuredClone(assets[0].variants[0]),id:'Vari02',parentId:assets[0].activeVariantId});
  const pixel=await sharp({create:{width:4,height:4,channels:4,background:'#46a'}}).png().toBuffer();for(const asset of assets)for(const variant of asset.variants){variant.entry='source.png';variant.files=[{path:'source.png',bytes:pixel.length,mime:'image/png',role:'entry'}];variant.metadata={width:4,height:4};}
  const index={...createAssetIndex('Index1'),data:{assets}};
  project=await ProjectSession.createProject(root,'Proj01',[{documentId:'Index1',revision:1,format:'json',files:{'assets/index.json':JSON.stringify(index)}},{documentId:'Ref001',revision:1,format:'json',files:{'references.json':JSON.stringify({schemaVersion:1,documentId:'Ref001',revision:1,data:{backgroundImage:assets[0].id,fixed:{assetId:assets[0].id,variantId:assets[0].activeVariantId}}})}},...additional]);

  for(const asset of assets)for(const variant of asset.variants){const path=join(root,assetFilePath(asset.id,variant.id,variant.entry));await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,pixel);}
  const projects={currentSession:project,currentRoot:root,currentSessionId:'Write01'},assetsProvider=new StudioAssets(projects,resolve(process.env.GALCRAFT_TEST_MEDIA_TOOLS??process.env.GALCRAFT_MEDIA_TOOL_DIR??resolve(import.meta.dirname,'../../../tools/media/runtime/bin')),null,null,{register:({path})=>({uri:`galcraft-test://${path}`,release(){}})});
  assetsProvider.assetTypes={acquire:async()=>({types:new AssetTypeRegistry(),release:async()=>{}})};
  service=new StudioCollaboration({userData:profile,projects,assets:assetsProvider,production:{generationProviders:{operations:async()=>[]}},plugins:{externalTools:async()=>[],acquireDefinitions:async()=>({ok:true,warnings:[],value:{documents:[],components:[],pages:[],release:async()=>{}}})}});await service.ready;
  const session=await service.core.create({projectId:'Proj01',writeSessionId:'Write01',projectRoot:root,projectName:'中文作品',goal:'整理素材',harness:'dsh',scope:{documents:[...project.documents.keys()],createKinds:['asset'],tools:service.core.catalog().map(tool=>tool.key),operations:[],connectionIds:[],models:[],workflowIds:[],maxGenerations:0}});
  const endpoint=(await service.mcp.start()).endpoint;client=new Client({name:'mg-contract-acceptance',version:'0.1.0'},{versionNegotiation:{mode:'auto'}});await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const definitions=(await client.listTools()).tools;
  const invoke=async(input,callId,tool='galcraft_assets')=>{const result=await client.callTool({name:tool,arguments:{projectId:'Proj01',sessionId:session.id,view:'full',...(callId?{callId}:{}),input}});expect(result.isError,JSON.stringify(result)).not.toBe(true);if(result.structuredContent.state==='completed')expect(z.fromJSONSchema(service.core.catalog().find(def=>def.key===tool).outputSchema).safeParse(result.structuredContent.result).success).toBe(true);return result.structuredContent;};
  return {session,invoke,assets};
}
describe('actual domain MCP transport',{timeout:30000},()=>{
it('paginates the actual M04 index, retains source names, and applies recoverable rename/metadata edits',async()=>{
  const {session,invoke,assets}=await setup();const first=await invoke({action:'query'});expect(first.result).toMatchObject({action:'query',total:96,offset:0,limit:40,index:{documentId:'Index1',revision:1}});expect(first.result.items).toHaveLength(40);
  const next=await invoke({action:'query',query:{offset:40,limit:40,indexRevision:first.result.index.revision}});expect(next.result.items.some(asset=>first.result.items.some(item=>item.assetId===asset.assetId))).toBe(false);
  const detail=await invoke({action:'get',assetId:assets[0].id});expect(detail.result.asset.variants).toHaveLength(2);
  const input={action:'rename',assetId:assets[0].id,name:'海边夜景.png',expected:[version('Index1',1)]};
  const apply=project.applyExternalEdit.bind(project);project.applyExternalEdit=async(...args)=>{await apply(...args);throw new Error('Lost response after real commit');};
  const lost=await invoke(input,'rename-lost');expect(lost.state).toBe('uncertain');expect(lost.result).toBe(null);project.applyExternalEdit=apply;
  const recovered=await service.core.query(session.id,'rename-lost');expect(recovered.result).toMatchObject({action:'rename',beforeName:'同名背景.png',asset:{assetId:assets[0].id,name:'海边夜景.png',sourceName:'原件0.png'}});
  const repeated=await invoke(input,'rename-lost');expect(repeated.result.receipt.operationId).toBe(recovered.result.receipt.operationId);expect(project.operations).toHaveLength(1);
  const metadata=await invoke({action:'setMetadata',assetId:assets[0].id,fields:{folder:['背景','海边'],tags:['夜景']},expected:recovered.result.receipt.documents},'organize');expect(metadata.state).toBe('completed');
  const stale=await invoke({action:'query',query:{indexRevision:1}});expect(stale.state).toBe('failed');expect(stale.error.code).toBe('QUERY_STALE');
  const before=project.operations.length;const invalid=await invoke({action:'rename',assetId:assets[0].id,name:'错误.jpg',expected:metadata.result.receipt.documents},'wrong-extension');expect(invalid.state).toBe('failed');expect(invalid.error.code).toBe('ASSET_EXTENSION_LOCKED');expect(project.operations).toHaveLength(before);
},15000);
it('reviews complete floating-reference impact and protects author operations during undo',async()=>{
  const {invoke,assets}=await setup(),references=await invoke({action:'references',assetId:assets[0].id});expect(references.result.references.filter(ref=>ref.variantId===null)).toHaveLength(1);expect(references.result.references.filter(ref=>ref.variantId!==null)).toHaveLength(1);
  const expected=[version('Index1',1),...references.result.documents],prepared=await invoke({action:'prepareVariantSwitch',assetId:assets[0].id,variantId:'Vari02',expected},'switch-plan');expect(prepared.state).toBe('completed');expect(prepared.result.affectedReferences).toHaveLength(1);
  const apply=project.applyExternalEdit.bind(project);project.applyExternalEdit=async(...args)=>{await apply(...args);throw new Error('Variant response lost after commit');};const lost=await invoke({action:'applyVariantSwitch',planId:prepared.result.planId,expected},'switch-apply');expect(lost.state).toBe('uncertain');project.applyExternalEdit=apply;service.variantPlans.clear();const applied=await service.core.query(sessionIdOf(prepared),'switch-apply');expect(applied.state).toBe('completed');expect(applied.result.affectedReferences).toEqual(prepared.result.affectedReferences);expect(applied.result.asset.activeVariantId).toBe('Vari02');
  const record=await invoke({action:'get',operationId:applied.result.receipt.operationId},undefined,'galcraft_history');expect(record.result.changes).not.toHaveLength(0);
  const undo=await invoke({action:'prepareUndo',operationId:applied.result.receipt.operationId,documentId:'Index1'},undefined,'galcraft_history');expect(undo.result.issues).toEqual([]);
  const undone=await invoke({action:'undo',planId:undo.result.plan.planId,expected:undo.result.plan.expected},'undo-switch','galcraft_history');expect(undone.state).toBe('completed');
  const redo=await invoke({action:'redo',planId:undo.result.plan.planId,expected:undone.result.receipt.documents},'redo-switch','galcraft_history');expect(redo.state).toBe('completed');
  const index=service.assets.current().index,edit=await service.assets.prepareCatalogEdit({action:'setMetadata',assetId:assets[0].id,fields:{tags:['作者修改']}}),plan=project.planEdit({label:'Author change',origin:'field',expected:edit.value.expected,patches:edit.value.indexPatches,preparedAssets:[],requiredRefs:[]});expect(project.applyEdit(plan.value.planId,edit.value.expected).ok).toBe(true);
  const affected=await invoke({action:'prepareUndo',operationId:applied.result.receipt.operationId,documentId:'Index1'},undefined,'galcraft_history');expect(affected.result.issues[0].code).toBe('AUTHOR_REVIEW_REQUIRED');
  const denied=await invoke({action:'undo',planId:affected.result.plan.planId,expected:affected.result.plan.expected},'author-protected','galcraft_history');expect(denied.state).toBe('failed');expect(denied.error.code).toBe('AUTHOR_REVIEW_REQUIRED');
});
it('keeps review files outside projects, reports missing/expired media and cleans release/end/restart/stop',async()=>{
  const {session}=await setup(),context={sessionId:session.id,callId:'media-one',toolKey:'galcraft_media',projectId:'Proj01',writeSessionId:'Write01'},source={kind:'preview',projectId:'Proj01',snapshotId:'Snap01',engineVersion:'0.1.0',pluginVersions:[]};
  const file=await service.media.add({bytes:Buffer.from('review bytes'),mime:'application/octet-stream',source},context);expect(file.localPath.startsWith(profile)).toBe(true);expect(file.localPath.startsWith(root)).toBe(false);expect((await service.media.bytes(file.resourceId)).bytes.toString()).toBe('review bytes');
  await rm(file.localPath);expect(await service.media.refresh({mode:'resource',file})).toMatchObject({mode:'resource',file:{availability:'missing',localPath:null}});
  await service.media.release(file.resourceId);expect(await service.media.refresh({file})).toMatchObject({file:{availability:'expired',localPath:null}});
  const ending=await service.media.add({bytes:Buffer.from('session review'),mime:'application/octet-stream',source},context);await service.call('end',{id:session.id,expectedRevision:1});await expect(readFile(ending.localPath)).rejects.toMatchObject({code:'ENOENT'});
  const leftover=join(profile,'crash-cache');await mkdir(leftover,{recursive:true});await writeFile(join(leftover,'stale.png'),'stale');
  const next=new CollaborationMedia({assets:{},production:{},authorize(){},endpoint:()=>null,cacheRoot:leftover});await next.ready;await expect(readFile(join(leftover,'stale.png'))).rejects.toMatchObject({code:'ENOENT'});await next.close();
});

it('returns original image paths, proportional previews and actual video/audio samples through the SDK',async()=>{
  const {invoke,session}=await setup(),ffmpeg=mediaExecutables(service.assets.toolDirectory).ffmpeg;
  const image=join(root,'large.png'),video=join(root,'sample.mp4');await sharp(randomBytes(1920*1080*3),{raw:{width:1920,height:1080,channels:3}}).png().toFile(image);
  await runProcess(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','mpeg4','-pix_fmt','yuv420p','-c:a','aac',video]);
  const imported=await invoke({action:'import',paths:[image,video]},'media-fixture-import');expect(imported.state).toBe('completed');expect(imported.result.failed).toEqual([]);const [picture,clip]=imported.result.succeeded;
  const original=await invoke({mode:'image',source:{kind:'asset',assetId:picture.assetId}},'original-image','galcraft_media');expect(original.result.file.bytes).toBeGreaterThan(3500000);expect(original.result.rendition.resized).toBe(false);expect(original.result.file.metadata).toMatchObject({width:1920,height:1080});
  const bytes=await fetch(original.result.file.httpUrl).then(r=>r.arrayBuffer());expect(bytes.byteLength).toBe(original.result.file.bytes);
  const preview=await invoke({mode:'image',source:{kind:'asset',assetId:picture.assetId},preview:{maxWidth:640,maxHeight:360,format:'jpeg',maxBytes:1000000}},'preview-image','galcraft_media');expect(preview.result.original.metadata).toMatchObject({width:1920,height:1080});expect(preview.result.rendition).toMatchObject({resized:true,width:640,height:360,mime:'image/jpeg'});expect(preview.result.file.localPath.startsWith(profile)).toBe(true);
  const frame=await invoke({mode:'frame',source:{kind:'asset',assetId:clip.assetId},timeSec:.9},'video-frame','galcraft_media');expect(frame.state,JSON.stringify(frame)).toBe('completed');expect(frame.result.sample).toMatchObject({frame:9,timeSec:.9,totalFrames:20});
  const audio=await invoke({mode:'audio',source:{kind:'asset',assetId:clip.assetId},startSec:.25,endSec:1.25},'audio-slice','galcraft_media');expect(audio.state,JSON.stringify(audio)).toBe('completed');expect(audio.result.file.metadata).toMatchObject({durationSec:1,sampleRate:48000,channels:1});
  await invoke({mode:'release',resourceId:preview.result.file.resourceId},'release-preview','galcraft_media');expect((await service.core.query(session.id,'preview-image')).result.file).toMatchObject({availability:'expired',localPath:null,uri:null,httpUrl:null});
  expect((await readFile(original.result.file.localPath)).length).toBe(original.result.file.bytes);await service.mcp.stop();await expect(readFile(frame.result.file.localPath)).rejects.toMatchObject({code:'ENOENT'});expect((await readFile(original.result.file.localPath)).length).toBe(original.result.file.bytes);
},30000);

it('discovers and prepares component properties through the actual M08 transaction',async()=>{
  const template=createOfficialTemplate(),page=template.pages.find(page=>page.key==='title'),components=[];expect(page).toBeTruthy();const walk=component=>{components.push(component);component.children.forEach(walk);};walk(page.root);const button=components.find(component=>component.part==='title.menu.start');expect(button).toBeTruthy();
  const {invoke}=await setup(createTemplateDocuments(template));const definition=await invoke({category:'operations',key:'component.setProperties'},undefined,'galcraft_catalog');expect(definition.state,JSON.stringify(definition)).toBe('completed');expect(definition.result.entries[0].guide.example.tool).toBe('galcraft_edit_prepare');
  const fields={normal:{fontSize:27}},prepared=await invoke({operationKey:'component.setProperties',fields,target:{componentId:button.id},expected:[version(page.id,1)]},'component-plan','galcraft_edit_prepare');expect(prepared.state,JSON.stringify(prepared)).toBe('completed');
  const applied=await invoke({planId:prepared.result.plan.planId,expected:prepared.result.plan.input.expected},'component-apply','galcraft_edit_apply');expect(applied.state).toBe('completed');const next=readTemplateDocuments([...project.documents.values()]);const updated=[];const collect=component=>{updated.push(component);component.children.forEach(collect);};collect(next.pages.find(value=>value.id===page.id).root);expect(updated.find(component=>component.id===button.id).normal.fontSize).toBe(27);expect(next.pages.filter(value=>value.id!==page.id)).toEqual(template.pages.filter(value=>value.id!==page.id));
});

it('projects plugin document providers from full lock dependencies in summaries and exact definitions',async()=>{
  const {invoke}=await setup(),{createDefinition}=await import('../../../plugins/motion-canvas/package/definition/index.js'),definition=createDefinition();
  service.plugins.dependencies=()=>[{kind:'plugin',id:'org.galcraft.motion-canvas',version:'0.1.0',targets:['web','windows'],required:true}];
  service.plugins.acquireDefinitions=async()=>({ok:true,warnings:[],value:{documents:definition.documents,messages:definition.messages.en,components:[],release:async()=>{}}});
  const summary=await invoke({category:'documents'},undefined,'galcraft_catalog');expect(summary.state,JSON.stringify(summary)).toBe('completed');
  expect(summary.result.entries.find(entry=>entry.provider).provider).toEqual({id:'org.galcraft.motion-canvas',version:'0.1.0'});
  const exact=await invoke({category:'documents',key:summary.result.entries.find(entry=>entry.provider).key},undefined,'galcraft_catalog');expect(exact.state,JSON.stringify(exact)).toBe('completed');expect(exact.result.entries[0].provider).toEqual(summary.result.entries.find(entry=>entry.provider).provider);
});
});
