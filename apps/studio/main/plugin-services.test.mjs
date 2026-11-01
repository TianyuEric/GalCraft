import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ResourceRegistry } from '@galcraft/media-tools/resources';
import { fixtureId, FixtureLock, FixtureProject } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { buildPlugin, createPluginProject, packPlugin } from '@galcraft/plugins/development';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';
import { StudioPluginPackages } from './plugin-packages.mjs';
import { pluginServicePorts } from './plugin-service-ports.mjs';
import { StudioProduction } from './production-providers.mjs';
import { CapabilityReportSchema, DefaultTimeoutSecByPurpose } from '@galcraft/contracts';

const testing = resolve(import.meta.dirname,'../../../tmp/testing/plugin-development');
const root = join(testing,'node-services'), source = join(root,'scaffold/package');
const evidence = resolve(import.meta.dirname,'../../../test-results/latest/plugin-development/node-services.json');
const id = 'org.example.complete';
const value = result => {if(!result.ok)throw new Error(JSON.stringify(result));return result.value;};
const envelope = (documentId,data) => JSON.stringify({schemaVersion:1,documentId,revision:1,data});
let projects, plugins, ports, access, server;
beforeAll(async () => {
  await rm(root,{recursive:true,force:true});
  const project=join(root,'scaffold');await createPluginProject({directory:project,id,template:'complete'});
  await mkdir(join(project,'node_modules/@galcraft'),{recursive:true});
  await symlink(resolve(import.meta.dirname,'../../../packages/plugins'),join(project,'node_modules/@galcraft/plugins'),'junction');
  await symlink(resolve(import.meta.dirname,'../../../packages/contracts'),join(project,'node_modules/@galcraft/contracts'),'junction');
  const built=await buildPlugin(project);expect(built.issues).toEqual([]);
  const packed=await packPlugin(source,join(root,'archives'));if(!packed.ok)throw new Error(JSON.stringify(packed.issues));
  plugins = new StudioPluginPackages(join(root,'installed'),new ResourceRegistry(),(pluginId,target,session)=>({pluginId,target,
    domain:{projectId:session.projectId,kind:'sample',instance:'service-contract'},credentials:{read:async()=> 'local-contract-secret'}}));
  value(await plugins.install({kind:'archive',path:packed.path}));
  const next = join(root,'version-two'); await cp(source,next,{recursive:true});
  const manifest=JSON.parse(await readFile(join(next,'manifest.json'),'utf8')); manifest.version='2.0.0';
  await writeFile(join(next,'manifest.json'),JSON.stringify(manifest)); value(await plugins.install({kind:'directory',path:next}));
  const projectId=fixtureId(0xe01),lockId=fixtureId(0xe02);
  await ProjectSession.createProject(join(root,'project'),FixtureProject.projectId,[
    {documentId:projectId,revision:1,format:'json',files:{'project.json':envelope(projectId,FixtureProject)}},
    {documentId:lockId,revision:1,format:'json',files:{'dependencies.lock.json':envelope(lockId,{...FixtureLock,
      plugins:[{kind:'plugin',id,version:'2.0.0',targets:['web','windows'],required:true}]})}},
  ]);
  access=new ProjectAccess(); projects=new ProjectDocuments(access); value(await projects.open(join(root,'project'))); ports=pluginServicePorts(plugins);
},30000);
afterAll(async()=>{server?.close();if(projects?.currentSessionId){const sid=projects.currentSessionId;await projects.close(sid,'discard');access.release(sid);}});

it('discovers installed Node service providers and retains the frozen exact package until release',async()=>{
  const session=projects.currentSession;
  const generation=await ports.generationProviders.list(session), processors=await ports.resourceProcessors.list(session);
  expect(generation.map(item=>[item.key,item.packageVersion])).toEqual([[`${id}/textProvider`,'2.0.0']]);
  expect(processors.map(item=>item.key)).toEqual([`${id}/copy`]);
  const config = { id: fixtureId(0xe03), revision: 1, name: '插件检查', protocol: 'plugin', providerKey: `${id}/textProvider`, baseUrl: '',
    credentialId: null, auth: 'none', apiKeyHeader: null, model: 'selected', purposes: ['text'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose,
    concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  const production = new StudioProduction({ userData: join(root, 'user-data'), projects, assets: {}, connections: { read: async () => ({ config }), credential: async () => null }, generationProviders: ports.generationProviders });
  const inspected = value(await production.testConnection({ connectionId: config.id, purpose: 'text', imageUsage: null, workflowBindingId: null, model: 'selected' }));
  expect(CapabilityReportSchema.parse(inspected)).toMatchObject({ purpose: 'text', status: 'unverified', serviceVersion: '1' });
  expect(await readdir(join(root, 'installed', id, '.galcraft-load'))).toEqual([]);
  const lease=await ports.generationProviders.acquire({providerKey:`${id}/textProvider`,packageVersion:'0.1.0'},session);
  const graphRoot=join(root,'installed',id,'.galcraft-load');
  expect(lease.packageVersion).toBe('0.1.0'); expect((await readdir(graphRoot)).length).toBeGreaterThan(0);
  const requests=[];
  server=createServer((request,response)=>{let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
    requests.push({authorization:request.headers.authorization?'Bearer [local contract credential]':null,body:JSON.parse(body)});
    response.writeHead(200,{'Content-Type':'text/plain'});response.end('Generated by local HTTP contract fixture');});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const adapter=await lease.provider.create({id:fixtureId(0xe03),revision:1,baseUrl:`http://127.0.0.1:${server.address().port}`,credentialId:fixtureId(0xe04)});
  const directory=join(root,'generation'), requestId=fixtureId(0xe05), signal=new AbortController().signal, events=[];
  for await(const event of adapter.submit({purpose:'text',prompt:'Public provider contract'}, {requestId,directory,signal}))events.push(event);
  expect(events.at(-1).kind).toBe('output'); expect(await readFile(events.at(-1).artifacts[0].localPath,'utf8')).toContain('local HTTP');
  expect(requests).toEqual([{authorization:'Bearer [local contract credential]',body:{purpose:'text',prompt:'Public provider contract'}}]);
  expect(await adapter.cancel()).toEqual({local:'stopped',remote:'unsupported'});
  await lease.release();await lease.release(); expect(await readdir(graphRoot)).toEqual([]);
  const processor=await ports.resourceProcessors.acquire(`${id}/copy`,session), bytes=new Uint8Array([1,2,3,4]);
  const processed=value(await processor.processor.process({source:{rootFile:'source.bin',files:['source.bin'],readBytes:async()=>bytes,metadata:{test:true}},
    outputDirectory:join(root,'processed')},signal));
  expect([...await readFile(join(root,'processed',processed.rootFile))]).toEqual([...bytes]); await processor.release();
  const cancelled=await ports.resourceProcessors.acquire(`${id}/copy`,session), abort=new AbortController();abort.abort();
  await expect(cancelled.processor.process({source:{rootFile:'source.bin',files:['source.bin'],readBytes:async()=>bytes},outputDirectory:join(root,'cancelled')},abort.signal)).rejects.toThrow();
  await cancelled.release();
  await mkdir(resolve(evidence,'..'),{recursive:true});await writeFile(evidence,JSON.stringify({target:'Node installed public SDK service package',
    environment:{node:process.version,service:'local HTTP protocol fixture'},dataset:{id,versions:['0.1.0','2.0.0']},
    steps:['ordinary install','discover generation and processor','acquire frozen version1 while project selects version2',
      'submit local HTTP with host credentials','release exact graph','process source bytes','cancel before processing'],
    expected:'Exact version and leases survive task execution; provider protocol and processor work',
    actual:{generation,processors,requests,events,processed,leaseReleased:true},result:'passed',executedAt:new Date().toISOString()},null,2));
}, 30_000);
