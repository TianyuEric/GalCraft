import { z } from 'zod';
import { IdSchema, JsonSchema,VersionSchema } from './common.js';

export const CollaborationScopeSchema = z.strictObject({
  mode: z.enum(['currentProject', 'restricted']).optional(),
  documents: z.array(IdSchema), createKinds: z.array(z.string().min(1)), tools: z.array(z.string().min(1)),
  operations: z.array(z.string().min(1)), connectionIds: z.array(IdSchema), models: z.array(z.string()),
  workflowIds: z.array(IdSchema), maxGenerations: z.number().int().nonnegative().nullable(),
});
export type CollaborationScope = z.infer<typeof CollaborationScopeSchema>;
export const CollaborationContextSchema = z.strictObject({
  sessionId: IdSchema, callId: z.string().min(1).max(160), scopeRevision: z.number().int().positive(),
  projectId: IdSchema, writeSessionId: IdSchema, toolKey: z.string().optional(), projectRoot:z.string().optional(),
});
export type CollaborationContext = z.infer<typeof CollaborationContextSchema>;
export const ExternalToolDefinitionSchema = z.strictObject({
  provider:z.strictObject({id:z.string().min(1),version:VersionSchema}).optional(),
  key: z.string().min(1), version: z.string().min(1), title: z.string().min(1),
  description: z.string(), inputSchema: JsonSchema, outputSchema: JsonSchema,
  display:z.record(z.string(),z.strictObject({title:z.string(),description:z.string()})).optional(),
  effects: z.array(z.enum(['read', 'edit', 'import', 'generate', 'adopt', 'preview'])),
  async: z.boolean(), cancel: z.boolean(),
});
export type ExternalToolDefinition = z.infer<typeof ExternalToolDefinitionSchema>;
