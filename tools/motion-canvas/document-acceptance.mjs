import { checkEvidenceBudget, removeWorkspace } from '../../tests/e2e/workspace.mjs';
import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ProjectSession} from '@galcraft/documents';
import {createId} from '@galcraft/contracts';
import {FixtureProject,FixtureScenes,FixtureLock} from '@galcraft/contracts/fixtures';
import {createAssetIndex} from '../../packages/assets/dist/core/index.js';
import {createOfficialTemplate,createTemplateDocuments} from '@galcraft/templates';
import {StudioPluginPackages} from '../../apps/studio/main/plugin-packages.mjs';
import {PluginDocuments} from '../../apps/studio/main/plugin-documents.mjs';
import {createMotionProject,pluginId,projectDocumentKey} from '../../plugins/motion-canvas/dist/index.js';
await checkEvidenceBudget();
const repo=resolve(import.meta.dirname,'../..'),directory=join(repo,'tmp/testing/motion-canvas-documents'),evidence=join(repo,'test-results/latest/motion-canvas/MC-T01');
const value=result=>{if(!result.ok)throw new Error(`${result.error.code}: ${result.error.message}`);return result.value;};
await mkdir(evidence,{recursive:true});await rm(directory,{recursive:true,force:true});
const report={caseId:'MC-T01/ordinary-package-M02',result:'running',records:[]};let session;
try{
  const doc=createId(),lockId=createId(),sceneId=createId(),index=createAssetIndex(createId()),template=createOfficialTemplate({kind:'standard'});
  const envelope=(documentId,data)=>JSON.stringify({schemaVersion:1,documentId,revision:1,data});
  const project={...structuredClone(FixtureProject),name:'Motion Canvas 作者工程验收',entry:{sceneId:FixtureScenes[0].id,labelId:null},chapters:[{...FixtureProject.chapters[0],sceneIds:[FixtureScenes[0].id]}],templateDocumentId:template.instanceId};
  session=await ProjectSession.createProject(join(directory,'project'),project.projectId,[{documentId:doc,revision:1,format:'json',files:{'project.json':envelope(doc,project)}},{documentId:lockId,revision:1,format:'json',files:{'dependencies.lock.json':envelope(lockId,{...FixtureLock,plugins:[{id:pluginId,version:'0.1.0',required:true}]})}},{documentId:index.documentId,revision:1,format:'json',files:{'assets/index.json':JSON.stringify(index)}},{documentId:sceneId,revision:1,format:'dsl',files:{[`scenes/${FixtureScenes[0].id}/scene.json`]:envelope(sceneId,FixtureScenes[0]),[`scenes/${FixtureScenes[0].id}/script.gal`]:`end {} @${createId()};\n`}},...createTemplateDocuments(template)]);
  const plugins=new StudioPluginPackages(join(directory,'plugins'));value(await plugins.install({kind:'directory',path:join(repo,'plugins/motion-canvas/package')}));
  const projects={get currentSession(){return session;},list(){return {ok:true,warnings:[],value:[...session.documents.values()]};}},documents=new PluginDocuments(projects,plugins);
  const apply=input=>{const plan=value(session.planEdit(input));return value(session.applyEdit(plan.planId,plan.input.expected));};
  const source=createMotionProject();const edit=value(await documents.create({pluginId,contributionKey:projectDocumentKey,name:'测试片头',data:{project:source}}));apply(edit);
  let instance=value(documents.list({pluginId}))[0];assert.equal(instance.data.project.files.length,2);assert.equal(instance.revision,1);
  source.revision=2;source.files[1].content=source.files[1].content.replace('新的篇章','保存后的新篇章');
  apply(value(await documents.update({documentId:instance.documentId,expectedRevision:1,data:{project:source}})));
  assert.equal(value(documents.list({pluginId}))[0].revision,2);
  const stale=await documents.update({documentId:instance.documentId,expectedRevision:1,data:{project:source}});assert(!stale.ok&&stale.error.code==='EDIT_CONFLICT');
  const undo=value(session.planUndo(instance.documentId));value(session.undo(undo.planId));assert.equal(value(documents.list({pluginId}))[0].data.project.revision,1);value(session.redo(undo.planId));assert.equal(value(documents.list({pluginId}))[0].data.project.revision,2);
  const copyEdit=value(await documents.copy({documentId:instance.documentId,name:'副本'}));apply(copyEdit);assert.equal(value(documents.list({pluginId})).length,2);
  value(await session.save(value(session.planSave({kind:'all'})).planId));await session.dispose('keep');
  session=await ProjectSession.open(join(directory,'project'),project.projectId);const reopened=value(documents.list({pluginId}));assert.equal(reopened.length,2);assert(reopened.every(item=>item.data.project.files[1].content.includes('保存后的新篇章')));
  report.result='passed';report.actual={pluginId,version:'0.1.0',ordinaryDirectory:join(repo,'plugins/motion-canvas/package'),created:instance.documentId,sourceRevision:2,stale:stale.error.code,undoRedo:true,copy:true,saved:true,reopened:reopened.map(item=>({documentId:item.documentId,revision:item.revision,sourceRevision:item.data.project.revision}))};
}catch(error){report.result='failed';report.error=String(error.stack??error);process.exitCode=1;}
finally{await session?.dispose('keep');await removeWorkspace(directory);await checkEvidenceBudget();await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
