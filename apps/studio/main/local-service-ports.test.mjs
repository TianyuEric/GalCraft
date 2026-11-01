import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { listenLocalService, servicePort, endpointPort, requireServicePort } from './local-service-ports.mjs';
import { startStudioService } from '../service/server.mjs';
import { ensureStudioService } from '../service/launcher.mjs';
import { studioCli } from '../service/cli.mjs';
import { CollaborationMcp } from './collaboration-mcp.mjs';
import { StudioCollaboration } from './collaboration-providers.mjs';

const bind = async (server, port=0) => { await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return server.address().port; };
const close = server => new Promise(resolve=>{server.closeIdleConnections?.();server.close(resolve);});
const emptyHost = async () => ({host:{handlers:{}}});
async function occupiedRange(count) {
  for(let attempt=0;attempt<20;attempt++) {
    const servers=[];
    try {
      const first=createServer();servers.push(first);const port=await bind(first);
      if(port+count-1>65535)throw new Error('retry test fixture');
      for(let index=1;index<count;index++){const server=createServer();servers.push(server);await bind(server,port+index);}
      return {port,close:()=>Promise.all(servers.map(close))};
    }catch{await Promise.all(servers.map(close));}
  }
  throw new Error('Could not allocate the consecutive TCP fixture');
}
async function rememberWeb(userData,port){const directory=join(userData,'studio-service');await mkdir(directory,{recursive:true});await writeFile(join(directory,'successful.json'),JSON.stringify({port,origin:`http://127.0.0.1:${port}`}));}

it('uses one strict port contract in host and CLI start/serve',async()=>{
  for(const value of [0,-1,65536,1.5,NaN,'','0x24cc','1e4'])expect(()=>servicePort(value)).toThrow('integer');
  expect(servicePort('9420')).toBe(9420);
  expect(endpointPort('http://127.0.0.1:80/mcp')).toBe(80);expect(()=>requireServicePort(80,'http://127.0.0.1/mcp')).not.toThrow();
  for(const command of ['start','serve'])for(const port of ['0','NaN','65536','1.5',''])await expect(studioCli([command,'--port',port,'--no-open'])).rejects.toMatchObject({code:'INVALID_SERVICE_PORT'});
});

it('binds the remembered candidate then its successor, reuses identities and remembers success across shutdown',async()=>{
  const userData=await mkdtemp(join(tmpdir(),'studio-ports-')),occupied=await occupiedRange(1);let service;
  try {
    await rememberWeb(userData,occupied.port);
    service=await startStudioService({userData,createHost:emptyHost});
    expect(Number(new URL(service.origin).port)).toBe(occupied.port+1);
    expect(service.addressChange).toEqual({previous:`http://127.0.0.1:${occupied.port}`,current:service.origin});
    expect((await fetch(`${service.origin}/api/status`).then(r=>r.json())).addressChange).toEqual(service.addressChange);
    expect((await startStudioService({userData,createHost:()=>{throw new Error('duplicate host');}})).reused).toBe(true);
    expect((await ensureStudioService({userData,port:occupied.port+1})).origin).toBe(service.origin);
    await expect(ensureStudioService({userData,port:occupied.port})).rejects.toMatchObject({code:'SERVICE_PORT_CONFLICT',endpoint:service.origin});
    await expect(startStudioService({userData,port:occupied.port,createHost:emptyHost})).rejects.toMatchObject({code:'SERVICE_PORT_CONFLICT'});
    const origin=service.origin;await service.close();
    await expect(readFile(join(userData,'studio-service/active.json'))).rejects.toMatchObject({code:'ENOENT'});
    await occupied.close();
    service=await startStudioService({userData,createHost:emptyHost});expect(service.origin).toBe(origin);
    expect(JSON.parse(await readFile(join(userData,'studio-service/successful.json'),'utf8')).origin).toBe(origin);
  }finally{await service?.close();await occupied.close();await rm(userData,{recursive:true,force:true});}
});

it('keeps success unchanged after explicit occupancy, twenty occupied candidates or host initialization failure',async()=>{
  const userData=await mkdtemp(join(tmpdir(),'studio-ports-failure-')),occupied=await occupiedRange(20);
  try {
    await rememberWeb(userData,occupied.port);const path=join(userData,'studio-service/successful.json'),before=await readFile(path,'utf8');
    await expect(startStudioService({userData,port:occupied.port,createHost:emptyHost})).rejects.toMatchObject({code:'EADDRINUSE'});
    await expect(startStudioService({userData,createHost:emptyHost})).rejects.toMatchObject({code:'EADDRINUSE',port:occupied.port+19});
    expect(await readFile(path,'utf8')).toBe(before);await occupied.close();
    await expect(startStudioService({userData,createHost:async()=>{throw Object.assign(new Error('domain failed'),{code:'DOMAIN_INIT'});}})).rejects.toMatchObject({code:'DOMAIN_INIT'});
    expect(await readFile(path,'utf8')).toBe(before);
  }finally{await occupied.close();await rm(userData,{recursive:true,force:true});}
});

it('stops at the port boundary and propagates non-occupancy errors without retry',async()=>{
  const server=new EventEmitter(),attempts=[];
  server.listen=port=>{attempts.push(port);queueMicrotask(()=>server.emit('error',Object.assign(new Error('occupied'),{code:'EADDRINUSE'})));};
  await expect(listenLocalService(server,{previousPort:65535,defaultPort:9420})).rejects.toMatchObject({code:'EADDRINUSE'});expect(attempts).toEqual([65535]);
  server.listen=port=>{attempts.push(port);queueMicrotask(()=>server.emit('error',Object.assign(new Error('permission denied'),{code:'EACCES'})));};attempts.length=0;
  await expect(listenLocalService(server,{defaultPort:9420})).rejects.toMatchObject({code:'EACCES'});expect(attempts).toEqual([9420]);expect(server.listenerCount('error')).toBe(0);
});

it('strictly reuses an MCP listener and isolates failed restoration before a real successful retry',async()=>{
  const userData=await mkdtemp(join(tmpdir(),'mcp-ports-')),occupied=await occupiedRange(20);let collaboration;
  try {
    await mkdir(join(userData,'collaboration'),{recursive:true});const path=join(userData,'collaboration/service.json');
    const previous={enabled:true,port:occupied.port,endpoint:`http://127.0.0.1:${occupied.port}/mcp`};await writeFile(path,JSON.stringify(previous));
    collaboration=new StudioCollaboration({userData,projects:{currentSession:null},production:{},assets:{},plugins:{externalTools:async()=>[]}});
    await collaboration.ready;expect(collaboration.serviceStatus()).toMatchObject({state:'failed',error:{code:'EADDRINUSE'}});expect(collaboration.core.catalog().length).toBeGreaterThan(0);expect(collaboration.mcp.endpoint).toBeNull();
    expect(JSON.parse(await readFile(path,'utf8'))).toEqual(previous);
    await occupied.close();const result=await collaboration.startService();expect(result.endpoint).toBe(previous.endpoint);expect(collaboration.serviceStatus().state).toBe('running');
    await expect(collaboration.mcp.start(occupied.port+1)).rejects.toMatchObject({code:'SERVICE_PORT_CONFLICT'});expect((await collaboration.mcp.start(occupied.port)).endpoint).toBe(result.endpoint);
    expect(JSON.parse(await readFile(path,'utf8'))).toMatchObject({enabled:true,port:occupied.port,endpoint:result.endpoint});
  }finally{await collaboration?.close();await occupied.close();await rm(userData,{recursive:true,force:true});}
});

it('starts fresh Web and MCP listeners within their default bounded candidates',async()=>{
  const userData=await mkdtemp(join(tmpdir(),'service-defaults-'));let web;const mcp=new CollaborationMcp({catalog:()=>[]});
  try {web=await startStudioService({userData,createHost:emptyHost});const webPort=Number(new URL(web.origin).port);expect(webPort).toBeGreaterThanOrEqual(9420);expect(webPort).toBeLessThan(9440);const result=await mcp.start();const mcpPort=Number(new URL(result.endpoint).port);expect(mcpPort).toBeGreaterThanOrEqual(9460);expect(mcpPort).toBeLessThan(9480);}
  finally{await web?.close();await mcp.stop();await rm(userData,{recursive:true,force:true});}
});

it('preserves a legacy successful Web address after its instance stopped',async()=>{
  const userData=await mkdtemp(join(tmpdir(),'service-legacy-')),reserved=await occupiedRange(1);let service;
  try {await mkdir(join(userData,'studio-service'),{recursive:true});await writeFile(join(userData,'studio-service/active.json'),JSON.stringify({pid:99999999,userData,origin:`http://127.0.0.1:${reserved.port}`}));await reserved.close();service=await startStudioService({userData,createHost:emptyHost});expect(Number(new URL(service.origin).port)).toBe(reserved.port);}
  finally{await service?.close();await reserved.close();await rm(userData,{recursive:true,force:true});}
});

it('repairs the existing client configuration with the actual fallback address and rejects stale previews',async()=>{
  const userData=await mkdtemp(join(tmpdir(),'mcp-config-')),occupied=await occupiedRange(1);let owner;
  try {
    await mkdir(join(userData,'collaboration'),{recursive:true});await writeFile(join(userData,'collaboration/service.json'),JSON.stringify({enabled:true,port:occupied.port}));
    const path=join(userData,'.mcp.json');await writeFile(path,JSON.stringify({mcpServers:{other:{url:'https://example.test/mcp'},galcraft:{type:'http',url:`http://127.0.0.1:${occupied.port}/mcp`,custom:'preserved'}},option:'preserved'}));
    owner=new StudioCollaboration({userData,projects:{currentSession:null,currentRoot:userData},production:{},assets:{},plugins:{externalTools:async()=>[]}});await owner.ready;
    expect(owner.serviceStatus()).toMatchObject({state:'running',addressChange:{previous:`http://127.0.0.1:${occupied.port}/mcp`,current:`http://127.0.0.1:${occupied.port+1}/mcp`}});
    const preview=await owner.call('configuration',{harness:'claude',destination:'project'});expect(preview.ok).toBe(true);expect(preview.value.mergedContent).toContain(owner.mcp.endpoint);
    expect((await owner.call('writeConfiguration',{...preview.value,mode:'merge'})).ok).toBe(true);
    const saved=JSON.parse(await readFile(path,'utf8'));expect(saved).toMatchObject({option:'preserved',mcpServers:{other:{url:'https://example.test/mcp'},galcraft:{url:owner.mcp.endpoint,custom:'preserved'}}});
    await owner.mcp.stop();const stale=await owner.call('writeConfiguration',{...preview.value,mode:'merge'});expect(stale).toMatchObject({ok:false,error:{code:'MCP_CONFIGURATION_STALE'}});
    expect(JSON.parse(await readFile(path,'utf8'))).toEqual(saved);
  }finally{await owner?.close();await occupied.close();await rm(userData,{recursive:true,force:true});}
});

it('isolates MCP settings read and persistence failures while preserving business initialization failures',async()=>{
  const userData=await mkdtemp(join(tmpdir(),'mcp-settings-failure-'));let owner;
  const fixture=()=>new StudioCollaboration({userData,projects:{currentSession:null},production:{},assets:{},plugins:{externalTools:async()=>[]}});
  try {
    const path=join(userData,'collaboration/service.json');await mkdir(path,{recursive:true});
    owner=fixture();await owner.ready;expect(owner.serviceStatus()).toMatchObject({state:'failed',error:{code:'EISDIR'}});expect(owner.core.catalog().length).toBeGreaterThan(0);
    await expect(owner.startService()).rejects.toMatchObject({code:'EISDIR'});expect(owner.mcp.endpoint).toBeNull();
    await rm(path,{recursive:true});
    const reserved=await occupiedRange(1);const port=reserved.port;await reserved.close();
    await writeFile(path,JSON.stringify({enabled:true,port}));
    // A directory at the atomic-write destination prevents persistence on the real filesystem.
    await mkdir(join(userData,'collaboration/service.json.tmp'));
    await owner.startService({restore:true});expect(owner.serviceStatus()).toMatchObject({state:'failed',error:{code:'EISDIR'}});expect(owner.mcp.endpoint).toBeNull();
    expect(JSON.parse(await readFile(path,'utf8'))).toEqual({enabled:true,port});
    await expect(owner.startService()).rejects.toMatchObject({code:'EISDIR'});
    await rm(join(userData,'collaboration/service.json.tmp'),{recursive:true});await owner.startService();expect(owner.serviceStatus().state).toBe('running');
    await owner.close();owner=null;
    const broken=fixture();owner=broken;await broken.ready;
    // Business initialization belongs outside the service-only recovery boundary.
    await broken.close();owner=null;
    const original=StudioCollaboration.prototype.registerCore;StudioCollaboration.prototype.registerCore=()=>{throw Object.assign(new Error('business initialization failed'),{code:'BUSINESS_INIT'});};
    let business;try{business=fixture();await expect(business.ready).rejects.toMatchObject({code:'BUSINESS_INIT'});}finally{StudioCollaboration.prototype.registerCore=original;await business?.mcp.stop();await business?.core.close();}
  }finally{await owner?.close();await rm(userData,{recursive:true,force:true});}
});
