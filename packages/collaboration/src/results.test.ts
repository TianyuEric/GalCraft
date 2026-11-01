import { expect, it } from 'vitest';
import { z } from 'zod';
import { JsonSchema } from '@galcraft/contracts';
import type { Json } from '@galcraft/contracts';
import { callOutputSchema, publicCall } from './results.js';
it('embeds independent recursive provider schemas without losing their local definitions',()=>{
  const first=z.toJSONSchema(z.strictObject({action:z.literal('first'),value:JsonSchema})),second=z.toJSONSchema(z.strictObject({action:z.literal('second'),value:z.array(JsonSchema)}));
  const schema=z.fromJSONSchema(callOutputSchema({anyOf:[first,second]} as Json) as Parameters<typeof z.fromJSONSchema>[0]);
  const record={sessionId:'Sess01',callId:'original',tool:'test',version:'0.1.0',input:{},context:{sessionId:'Sess01',callId:'original',projectId:'Proj01',writeSessionId:'Write01',scopeRevision:1},state:'completed' as const,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),result:{action:'first',value:{nested:[1,true]}}};
  expect(schema.safeParse(publicCall(record)).success).toBe(true);
  expect(schema.safeParse(publicCall({...record,result:{action:'wrong',value:{}}})).success).toBe(false);
  expect(schema.safeParse(publicCall({...record,state:'uncertain',result:undefined,error:'Verify original transaction.',errorCode:'TOOL_OUTPUT'})).success).toBe(true);
});
