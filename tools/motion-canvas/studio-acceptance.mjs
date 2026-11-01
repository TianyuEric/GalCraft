import { checkEvidenceBudget, removeWorkspace } from '../../tests/e2e/workspace.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {ProjectSession} from '@galcraft/documents';
import {createId,DefaultTimeoutSecByPurpose,readPluginDocumentInstances,ConnectionConfigSchema} from '@galcraft/contracts';
import {FixtureProject,FixtureScenes,FixtureLock} from '@galcraft/contracts/fixtures';
import {createAssetIndex,decodeSVG} from '../../packages/assets/dist/core/index.js';
import {createOfficialTemplate,createTemplateDocuments} from '@galcraft/templates';
import {StudioAssets} from '../../apps/studio/main/asset-providers.mjs';
import {StudioProduction} from '../../apps/studio/main/production-providers.mjs';
import {StudioPluginPackages} from '../../apps/studio/main/plugin-packages.mjs';
import {pluginServiceContext,pluginServicePorts} from '../../apps/studio/main/plugin-service-ports.mjs';
import {productionRuntimeDependencies} from '../../apps/studio/main/production-runtimes.mjs';
import {PluginDocuments} from '../../apps/studio/main/plugin-documents.mjs';
import {ProjectDocuments} from '../../apps/studio/main/document-providers.mjs';
import {ConnectionVault} from '../../apps/studio/main/preferences.mjs';
import {ResourceRegistry} from '../media/src/resources.mjs';
import {pluginId,projectDocumentKey,operationId,renderProviderKey} from '../../plugins/motion-canvas/dist/index.js';

await checkEvidenceBudget();
const repo=resolve(import.meta.dirname,'../..'),work=join(repo,'tmp/testing/motion-canvas-host'),evidence=join(repo,'test-results/latest/motion-canvas/MC-T03');
const option=name=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const external=option('--project'),root=external?resolve(external):join(work,'project'),userData=option('--profile')?resolve(option('--profile')):join(work,'profile');
const value=result=>{if(!result.ok)throw new Error(`${result.error.code}: ${result.error.message}`);return result.value;};
await mkdir(evidence,{recursive:true});if(!external)await rm(work,{recursive:true,force:true});
let project,production;const report={caseId:'MC-T03/ordinary-package-M04-M10-M02',root,userData,result:'running',events:[]};
try{
  const sessionOptions={resolveRequiredRef:new ProjectDocuments({}).resolveRequiredRef};
  if(external){const envelope=JSON.parse(await readFile(join(root,'project.json'),'utf8'));project=await ProjectSession.open(root,envelope.data.projectId,sessionOptions);if(value(await project.listRecovery()))value(await project.recover('restore'));}
  else{
    const doc=createId(),lockId=createId(),sceneId=createId(),index=createAssetIndex(createId()),template=createOfficialTemplate({kind:'standard'}),envelope=(documentId,data)=>JSON.stringify({schemaVersion:1,documentId,revision:1,data});
    const data={...structuredClone(FixtureProject),name:'Motion Canvas 制作验收',entry:{sceneId:FixtureScenes[0].id,labelId:null},chapters:[{...FixtureProject.chapters[0],sceneIds:[FixtureScenes[0].id]}],templateDocumentId:template.instanceId};
    project=await ProjectSession.createProject(root,data.projectId,[{documentId:doc,revision:1,format:'json',files:{'project.json':envelope(doc,data)}},{documentId:lockId,revision:1,format:'json',files:{'dependencies.lock.json':envelope(lockId,{...FixtureLock,template:{...FixtureLock.template,id:template.id,version:template.version},plugins:[{id:pluginId,version:'0.1.0',required:true,kind:'plugin',targets:['windows','web']}]})}},{documentId:index.documentId,revision:1,format:'json',files:{'assets/index.json':JSON.stringify(index)}},{documentId:sceneId,revision:1,format:'dsl',files:{[`scenes/${FixtureScenes[0].id}/scene.json`]:envelope(sceneId,FixtureScenes[0]),[`scenes/${FixtureScenes[0].id}/script.gal`]:`end {} @${createId()};\n`}},...createTemplateDocuments(template)],sessionOptions);
  }
  const apply=input=>{const plan=value(project.planEdit(input));return value(project.applyEdit(plan.planId,plan.input.expected));};
  const lockDocument=[...project.documents.values()].find(document=>document.files['dependencies.lock.json']),lock=JSON.parse(lockDocument.files['dependencies.lock.json']).data;
  if(!lock.plugins.some(item=>item.id===pluginId))apply({label:'启用 Motion Canvas',origin:'plugin',expected:[{ref:{kind:'document',id:lockDocument.documentId},revision:lockDocument.revision}],patches:[{kind:'json',documentId:lockDocument.documentId,changes:[{path:'/data/plugins',op:'set',before:lock.plugins,after:[...lock.plugins,{id:pluginId,version:'0.1.0',required:true,kind:'plugin',targets:['windows','web']}]}]}],preparedAssets:[],requiredRefs:[]});
  const projects={currentSession:project,currentRoot:root,list:()=>({ok:true,warnings:[],value:[...project.documents.values()]})},resources=new ResourceRegistry(),toolDirectory=join(repo,'tools/media/runtime/bin');
  const assets=new StudioAssets(projects,toolDirectory,decodeSVG,undefined,resources),productionRuntimes=productionRuntimeDependencies({directory:join(import.meta.dirname,'runtime'),entry:join(import.meta.dirname,'render.mjs')});
  const plugins=new StudioPluginPackages(join(userData,'plugins'),resources,(id,target,selected)=>pluginServiceContext({projects,assets,productionRuntimes,credential:async()=>null},id,target,selected));
  value(await plugins.install({kind:'directory',path:join(repo,'plugins/motion-canvas/package')}));
  for(const dependency of lock.plugins.filter(item=>item.id!==pluginId)){
    const catalog=JSON.parse(await readFile(join(repo,'plugins/catalog.json'),'utf8'));
    const found=catalog.find(item=>item.id===dependency.id);if(found)value(await plugins.install({kind:'directory',path:join(repo,'plugins',found.directory)}));
  }
  const ports=pluginServicePorts(plugins);Object.assign(assets,{assetTypes:ports.assetTypes,resourceProcessors:ports.resourceProcessors,resourceProviders:ports.resourceProviders});
  const config=ConnectionConfigSchema.parse({id:createId(),revision:1,name:'本机 Motion Canvas',protocol:'plugin',providerKey:renderProviderKey,baseUrl:'http://127.0.0.1',auth:'none',credentialId:null,apiKeyHeader:null,model:'Motion Canvas 3.17.2',purposes:[operationId],timeoutSecByPurpose:{...DefaultTimeoutSecByPurpose,[operationId]:600},concurrency:1,parameters:{},workflowBindingId:null,serverFileRoot:null});
  const connections=new ConnectionVault(userData);await connections.save(config);assert((await connections.list()).some(item=>item.id===config.id));
  production=new StudioProduction({userData,projects,assets,resources,connections,generationProviders:ports.generationProviders,
    language:{currentInput:()=>({...production.compileInput(project),pluginCommands:[],pluginConditions:[]})}});
  const sourcePaths=[join(repo,'apps/studio/resources/practice/backgrounds/spring-shop.png'),join(repo,'tools/fonts/cache/NotoSansCJKsc-Regular.otf'),join(repo,'apps/studio/resources/practice/music/spring-01.opus')],sourceIds=[];
  for(const path of sourcePaths){let asset=assets.current().index.data.assets.find(asset=>asset.variants.some(variant=>variant.entry===basename(path)));if(!asset){const imported=value(await assets.import([path],{conflict:'keepBoth'}));assert.equal(imported.failed.length,0,JSON.stringify(imported.failed));asset=assets.current().index.data.assets.find(asset=>asset.id===imported.succeeded[0].id);}sourceIds.push(asset.id);}
  const references=await Promise.all(sourceIds.map(async(id,index)=>({...value(await production.call('mediaInput',{assetId:id})),port:['images','fonts','audio'][index]})));
  const source=JSON.parse(await readFile(join(repo,'test-results/latest/motion-canvas/MC-T00/freeze-project-v1.json'),'utf8'));
  source.files[0].content="import {asset} from '@galcraft/motion-canvas-assets';\n"+source.files[0].content.replace("'/media/audio.ogg'","asset('audio')");
  source.files[1].content="import {asset,font} from '@galcraft/motion-canvas-assets';\n"+source.files[1].content.replace('src="/media/image.png"',"src={asset('image')}").replace('fontFamily="GalCraftMotion_font"',"fontFamily={font('font')}");
  source.id=createId();source.revision=1;source.bindings=source.bindings.map((binding,index)=>({...binding,assetId:references[index].assetId,variantId:references[index].variantId,port:references[index].port}));
  const documents=new PluginDocuments(projects,plugins),authorEdit=value(await documents.create({pluginId,contributionKey:projectDocumentKey,name:'Motion Canvas 片头工程',data:{project:source}}));apply(authorEdit);
  const author=value(documents.list({pluginId})).find(document=>document.documentId===authorEdit.patches[0].documentId);
  const plan=value(await production.prepareOperation({operation:operationId,connectionId:config.id,usage:'cg',fields:{project:source,references},sourceVersions:[{ref:{kind:'document',id:author.documentId},revision:author.revision}]}));
  assert(!plan.issues.some(issue=>issue.severity==='error'));report.planId=plan.planId;
  const ctx=await production.current(),task=value(await production.call('submit',plan.planId));report.taskId=task.id;
  ctx.service.subscribe?.(next=>{if(next.id===task.id)report.events.push({state:next.state,items:next.items.map(item=>({state:item.state,phase:item.progress?.phase,progress:item.progress}))});});
  await ctx.service.drain();const completed=ctx.service.listTasks().find(item=>item.id===task.id),item=completed.items[0];
  assert.equal(item.attempts.length,1);assert(item.providerSnapshot.runtime?.browser?.version);assert.equal(item.candidateIds.length,1,JSON.stringify(item.issues));
  const candidate=ctx.service.getCandidate(item.candidateIds[0]);assert.equal(candidate.artifacts[0].kind,'video');await copyFile(candidate.artifacts[0].localPath,join(evidence,'candidate.mp4'));
  const expected=[...project.documents.values()].map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision}));
  const adoption=value(await production.call('select',{taskId:task.id,selections:[{itemId:item.id,candidateId:candidate.id}],target:'project',expected,adoptions:{[candidate.id]:{mode:'library',name:'Motion Canvas 春日序章.mp4'}}}));
  const receipt=value(await production.call('apply',{planId:adoption.planId,expected:adoption.input.expected}));
  const adopted=assets.current().index.data.assets.find(asset=>asset.source?.candidateId===candidate.id);assert(adopted);
  const authorRef=adopted.variants.find(variant=>variant.id===adopted.activeVariantId).metadata.authorDocument;assert(authorRef.documentId);
  const adoptedAuthor=readPluginDocumentInstances([...project.documents.values()]).find(document=>document.documentId===authorRef.documentId);assert.equal(adoptedAuthor.data.project.files.length,2);
  const undo=value(project.planUndo(adoptedAuthor.documentId));value(project.undo(undo.planId));assert(!assets.current().index.data.assets.some(asset=>asset.id===adopted.id));value(project.redo(undo.planId));assert(assets.current().index.data.assets.some(asset=>asset.id===adopted.id));
  value(await project.save(value(project.planSave({kind:'all'})).planId));
  report.result='passed';report.actual={planId:plan.planId,taskId:task.id,itemId:item.id,candidateId:candidate.id,attempts:item.attempts.length,providerSnapshot:item.providerSnapshot,media:references.map(({localPath,...media})=>media),authorDocument:author.documentId,adoptedAssetId:adopted.id,adoptedAuthor:authorRef,receipt,undoRedo:true,saved:true};
  await writeFile(join(evidence,'candidate.json'),JSON.stringify(candidate,null,2));
}catch(error){report.result='failed';report.error=String(error.stack??error);process.exitCode=1;}
finally{if(production)for(const service of production.activeServices)await service.close();await project?.dispose('keep');if(!external)await removeWorkspace(work);await checkEvidenceBudget();await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
