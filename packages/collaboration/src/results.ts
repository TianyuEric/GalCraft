import { IssueSchema, enrichIssue, issueSummary, type Json } from '@galcraft/contracts';
import { z } from 'zod';
import type { CallRecord } from './contracts.js';

/** JSON Schema local references remain rooted at their provider schema when embedded. */
function embedSchema(schema: Json, definitions: Record<string,Json>, scope: Record<string,string> = {}): Json {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(value=>embedSchema(value,definitions,scope));
  const local=schema.$defs;
  if(local&&typeof local==='object'&&!Array.isArray(local)){
    scope={...scope};
    for(const key of Object.keys(local)){const name=`result${Object.keys(definitions).length}_${key}`;scope[`#/$defs/${key}`]=`#/$defs/${name}`;definitions[name]=true;}
    for(const [key,value] of Object.entries(local))definitions[scope[`#/$defs/${key}`]!.slice('#/$defs/'.length)]=embedSchema(value,definitions,scope);
  }
  return Object.fromEntries(Object.entries(schema).filter(([key])=>key!=='$defs'&&key!=='$schema').map(([key,value])=>[key,key==='$ref'&&typeof value==='string'?(scope[value]??value):embedSchema(value,definitions,scope)]));
}

/** The result schema describes provider data; this schema describes the public MCP receipt. */
export function callOutputSchema(resultSchema: Json = true): Json {
  const definitions:Record<string,Json>={},result=embedSchema(resultSchema,definitions),issue=embedSchema(z.toJSONSchema(IssueSchema) as Json,definitions);
  return { ...(Object.keys(definitions).length?{$defs:definitions}:{}),type: 'object', properties: {
    accepted: { const: true }, sessionId: { type: 'string' }, callId: { type: 'string' }, tool: { type: 'string' },
    version: { type: 'string' }, provider: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'string' } }, required: ['id', 'version'], additionalProperties: false },
    state: { enum: ['accepted', 'running', 'completed', 'failed', 'cancelled', 'uncertain'] },
    createdAt: { type: 'string' }, updatedAt: { type: 'string' }, result: {anyOf:[result,{type:'null'}]}, error: {anyOf:[{type:'null'},{type:'object',properties:{code:{type:'string'},message:{type:'string'},issue},required:['code','message'],additionalProperties:false}]},
    recovery: { type: 'object', properties: {
      query: { type: 'object', properties: { tool: { const: 'galcraft_call' }, sessionId: { type: 'string' }, callId: { type: 'string' } }, required: ['tool', 'sessionId', 'callId'], additionalProperties: false },
      next: { type: 'string' },
    }, required: ['query', 'next'], additionalProperties: false },
  }, required: ['accepted', 'sessionId', 'callId', 'tool', 'version', 'state', 'createdAt', 'updatedAt', 'result','error','recovery'], additionalProperties: false };
}

export function publicCall(record: CallRecord) {
  const { sessionId, callId, tool, version, provider, state, createdAt, updatedAt, result, error } = record;
  const issue=error?enrichIssue(record.issue??{code:record.errorCode??'TOOL_EXECUTION',message:error,severity:'error',owner:'M12',related:[],actions:['retry']}):undefined;
  return { accepted: true as const, sessionId, callId, tool, version, ...(provider ? { provider } : {}), state, createdAt, updatedAt,
    result: result ?? null, error: issue ? {code:record.errorCode??issue.code,message:issueSummary(issue),issue} : null,
    recovery: { query: { tool: 'galcraft_call', sessionId, callId }, next:
      state === 'uncertain' ? 'Query this original callId before taking a new action. Query never submits another task or consumes another generation.' :
      state === 'failed' || state === 'cancelled' ? 'Read the error and current domain state. Correct the input and use a new callId for an explicit new action.' :
      state === 'accepted' || state === 'running' ? 'Query this original callId for the current provider result. Do not submit again.' :
      'Read result and any domain issues. A completed tool call can return a still-running task: follow its taskId and candidateIds. Adoption changes the working copy; review and save the actual closure with galcraft_save.' } };
}
