import { describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { CollaborationMcp } from './collaboration-mcp.mjs';
import { studioVersion } from './studio-version.mjs';
import {StudioCollaboration} from './collaboration-providers.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {exactContract} from './collaboration-projection.mjs';
describe('actual MCP transport',()=>{
  it('publishes the assembled core schemas with recursive edit data and action-specific requirements',async()=>{
    const userData=await mkdtemp(join(tmpdir(),'assembled-mcp-'));
    const service=new StudioCollaboration({userData,projects:{currentSession:null},production:{},assets:{},plugins:{externalTools:async()=>[]}});
    const client=new Client({name:'assembled-acceptance',version:'0.1.0'},{versionNegotiation:{mode:'auto'}});
    try{const {endpoint}=await service.mcp.start();await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));const {tools}=await client.listTools();
      expect(tools.some(tool=>tool.name==='galcraft_edit_prepare')).toBe(true);const input=tools.find(tool=>tool.name==='galcraft_production').inputSchema.properties.input;expect(input.properties.action.enum).toContain('submit');expect(JSON.stringify(input)).not.toContain('selections');
      const authoritative=service.core.catalog().find(tool=>tool.key==='galcraft_production').inputSchema;expect(exactContract(authoritative,{action:'submit'}).required).toContain('planId');expect(exactContract(authoritative,{action:'prepareAdoption'}).properties.selections).toBeTruthy();
      const rejected=await client.callTool({name:'galcraft_production',arguments:{projectId:'Proj01',sessionId:'Sess01',callId:'wrong',input:{action:'submit',taskId:'Task01'}}});expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected)).not.toContain('uncertain');
    }finally{await client.close();await service.close();await rm(userData,{recursive:true,force:true});}
  },15000);
  it('discovers the real schema and executes a business call, with local Origin protection',async()=>{
    const calls=[];const transport=new CollaborationMcp({catalog:()=>[{key:'galcraft_example',title:'测试',description:'实际schema',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']},outputSchema:{type:'object',properties:{echo:{type:'string'}},required:['echo'],additionalProperties:false},effects:['read']}],sessions:()=>[],capabilities:async()=>({}),receipt:async()=>({}),invoke:async(args)=>{calls.push(args);return {sessionId:args.sessionId,callId:'Read01',tool:args.tool,version:'0.1.0',state:'completed',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),result:{echo:args.input.text}};}});
    const {endpoint}=await transport.start();const client=new Client({name:'galcraft-acceptance',version:'0.1.0'},{versionNegotiation:{mode:'auto'}});
    try {await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));expect(client.getServerVersion()).toEqual({name:'galcraft-studio',version:studioVersion});const {tools}=await client.listTools();expect(tools.find(tool=>tool.name==='galcraft_example').inputSchema.properties.input.properties.text.type).toBe('string');
      const result=await client.callTool({name:'galcraft_example',arguments:{projectId:'Proj01',sessionId:'Sess01',input:{text:'通过实际SDK'}}});expect(result.isError).not.toBe(true);expect(result.structuredContent.result).toEqual({echo:'通过实际SDK'});expect(calls).toHaveLength(1);
      const rejected=await fetch(endpoint,{method:'POST',headers:{Origin:'https://example.com','content-type':'application/json'},body:'{}'});expect(rejected.status).toBe(403);
    }finally{await client.close();await transport.stop();}expect(transport.endpoint).toBe(null);
  });
});
