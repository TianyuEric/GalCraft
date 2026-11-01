import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createId } from '@galcraft/contracts';
import { startStudioService } from './server.mjs';
import { createNodeStudioHost } from './host.mjs';

const root=resolve(import.meta.dirname,'../../..');
const evidence=join(root,'test-results/latest/music-workflow-ports/ports-host');await mkdir(evidence,{recursive:true});
const temporary=join(root,'tmp/testing/user-data');await mkdir(temporary,{recursive:true});
const directory=await mkdtemp(join(temporary,'ports-host-')),userData=join(directory,'profile');
const occupied=[];let service;
const release=()=>Promise.all(occupied.splice(0).map(server=>new Promise(resolve=>server.close(resolve))));
const bind=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const records=[];
try {
  let port;
  for(let attempt=0;attempt<20;attempt++){
    try {
      const first=createServer();occupied.push(first);port=await bind(first);
      assert(port+19<=65535);
      for(let index=1;index<20;index++){
        const server=createServer();occupied.push(server);
        await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port+index,'127.0.0.1',resolve);});
      }
      break;
    }catch(error){await release();if(attempt===19)throw error;}
  }
  await mkdir(join(userData,'collaboration'),{recursive:true});
  const settings={enabled:true,port};await writeFile(join(userData,'collaboration/service.json'),JSON.stringify(settings));
  service=await startStudioService({userData,createHost:createNodeStudioHost});
  const call=async(group,method,...args)=>{
    const response=await fetch(`${service.origin}/api/bridge`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({group,method,args,clientId:'ports-acceptance'})});
    const result=await response.json();assert(result.ok,JSON.stringify(result));return result.value;
  };
  const failed=await call('collaboration','overview');assert.equal(failed.service.state,'failed');assert.equal(failed.service.error.code,'EADDRINUSE');assert.equal(failed.endpoint,null);
  assert.deepEqual(JSON.parse(await readFile(join(userData,'collaboration/service.json'),'utf8')),settings);
  const projects=join(directory,'projects');await mkdir(projects);
  await call('projects','create',{path:projects,name:'MCP failure editing',template:'light',width:960,height:540,engineVersion:'0.1.0'});
  const documents=await call('documents','list'),scene=documents.find(document=>document.format==='dsl');assert(scene);
  const path=Object.keys(scene.files).find(path=>path.endsWith('/script.gal'));
  const source=`say {speaker:{kind:"narrator"},text:"Editing and saving while MCP is unavailable"} @${createId()};\n`;
  const expected=[{ref:{kind:'document',id:scene.documentId},revision:scene.revision}];
  const edit=await call('documents','planEdit',{label:'MCP failure edit',origin:'script',expected,patches:[{kind:'text',documentId:scene.documentId,edits:[{start:0,end:scene.files[path].length,before:scene.files[path],after:source}]}],preparedAssets:[],requiredRefs:[]});
  await call('documents','applyEdit',edit.planId,expected);
  const save=await call('documents','planSave',{kind:'all'});await call('documents','save',save.planId);
  assert.equal(await readFile(join(service.host.projects.currentRoot,path),'utf8'),source);
  assert.equal((await call('collaboration','overview')).service.state,'failed');
  records.push({id:'MWP-V09-host-isolation',target:'Real Node Studio assembly, TCP MCP exhaustion, project HTTP editing and disk save',environment:{platform:process.platform,node:process.version,userData},data:{firstPort:port,lastPort:port+19,webOrigin:service.origin,projectId:service.host.projects.currentSession.projectId},expected:'MCP restoration fails visibly; Studio creates, edits and saves the actual project; failed candidates do not change successful settings.',actual:{mcpState:failed.service.state,errorCode:failed.service.error.code,savedScript:path,settingsUnchanged:true},result:'passed'});
  await release();const retried=await call('collaboration','start');assert.equal(retried.endpoint,`http://127.0.0.1:${port}/mcp`);
  assert.equal((await call('collaboration','overview')).service.state,'running');
  records.push({id:'MWP-V09-host-retry',target:'Existing Studio retry after freeing its candidate ports',environment:{platform:process.platform,node:process.version},data:{endpoint:retried.endpoint},expected:'Existing host retries MCP and records its real successful address.',actual:JSON.parse(await readFile(join(userData,'collaboration/service.json'),'utf8')),result:'passed'});
  console.log(JSON.stringify({evidence,records},null,2));
}finally{
  await service?.close();await release();await writeFile(join(evidence,'acceptance-records.json'),JSON.stringify(records,null,2));
}
