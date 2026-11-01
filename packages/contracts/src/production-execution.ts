import type { Id, Json, VersionRef } from './common.js';
import type { Artifact, CapabilityReport, ConnectionConfig, Purpose, RemoteRef, RemoteStatus, ServiceEvent, ResourceSnapshot, ResourceReleaseReceipt } from './generation.js';
import type { CancelResult } from './common.js';
import type { Result } from './common.js';
import { z } from 'zod';
import { IdSchema, JsonSchema, VersionRefSchema } from './common.js';
import { AssetKindSchema } from './assets.js';
import { ExtensionOperationIdSchema } from './production-operations.js';

export const MediaInputSchema=z.strictObject({assetId:IdSchema.nullable(),variantId:IdSchema.nullable(),candidateId:IdSchema.nullable(),artifactIndex:z.number().int().nonnegative().nullable(),localPath:z.string(),mime:z.string(),port:z.string().optional(),kind:AssetKindSchema.optional(),typeVersion:z.number().int().positive().optional()});
export const TextAttachmentSchema=z.strictObject({id:IdSchema,localPath:z.string(),mime:z.enum(['image/png','image/jpeg','image/webp']),bytes:z.number().int().nonnegative(),width:z.number().positive(),height:z.number().positive(),source:VersionRefSchema.nullable()});
const seed=z.number().nullable(),size=z.number().int().positive();
export const GenerationInputSchema=z.union([
  z.strictObject({purpose:z.literal('text'),system:z.string(),messages:z.array(z.strictObject({role:z.enum(['user','assistant']),text:z.string(),attachments:z.array(TextAttachmentSchema)})),maxOutputTokens:size,temperature:z.number().nullable(),seed}),
  z.strictObject({purpose:z.literal('image'),usage:z.enum(['background','figure','cg','ui']),positive:z.string(),negative:z.string(),width:size,height:size,count:size,seed,references:z.array(MediaInputSchema),novelai:z.strictObject({prompt:JsonSchema,settings:JsonSchema,references:JsonSchema.optional()}).optional()}),
  z.strictObject({purpose:z.literal('difference'),reference:MediaInputSchema,instruction:z.string(),negative:z.string(),width:size,height:size,count:size,seed}),
  z.strictObject({purpose:z.literal('speech'),text:z.string(),language:z.string(),voiceId:z.string().nullable(),referenceAudio:MediaInputSchema.nullable(),referenceText:z.string().nullable(),referenceLanguage:z.string().nullable(),emotion:z.string().nullable(),speed:z.number().nullable()}),
  z.strictObject({purpose:z.literal('music'),prompt:z.string(),durationSec:z.number().positive(),instrumental:z.boolean(),lyrics:z.string().nullable(),seed}),
  z.strictObject({purpose:z.literal('matting'),reference:MediaInputSchema}),
  z.strictObject({purpose:ExtensionOperationIdSchema,fields:z.record(z.string(),JsonSchema),references:z.array(MediaInputSchema)}),
]);
export const GenerationInputJsonSchema=z.toJSONSchema(GenerationInputSchema,{io:'input'}) as Json;
export function generationInputJsonSchema(purposes:readonly string[],extensions:{purpose:string;fields:Json}[]=[],builtinSchemas:Record<string,Json>={}):Json{
  const builtins=GenerationInputSchema.options.slice(0,-1).filter(schema=>purposes.includes((schema.shape.purpose as z.ZodLiteral<string>).value));
  const schemas:z.ZodType[]=[...builtins.map(schema=>{const custom=builtinSchemas[(schema.shape.purpose as z.ZodLiteral<string>).value];return custom?z.fromJSONSchema(custom as Parameters<typeof z.fromJSONSchema>[0]):schema;}),...extensions.map(extension=>z.strictObject({purpose:z.literal(extension.purpose),fields:z.fromJSONSchema(extension.fields as Parameters<typeof z.fromJSONSchema>[0]),references:z.array(MediaInputSchema)}))];
  return z.toJSONSchema(z.union(schemas),{io:'input'}) as Json;
}

export type MediaInput = { assetId: Id | null; variantId: Id | null; candidateId: Id | null; artifactIndex: number | null; localPath: string; mime: string; port?: string; kind?: import('@galcraft/contracts').AssetKind; typeVersion?: number };
export type TextAttachment = { id: Id; localPath: string; mime: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: number; width: number; height: number; source: VersionRef | null };
export type GenerationInput =
  | { purpose: 'text'; system: string; messages: { role: 'user' | 'assistant'; text: string; attachments: TextAttachment[] }[]; maxOutputTokens: number; temperature: number | null; seed: number | null }
  | { purpose: 'image'; usage: 'background' | 'figure' | 'cg' | 'ui'; positive: string; negative: string; width: number; height: number; count: number; seed: number | null; references: MediaInput[]; novelai?: { prompt: Json; settings: Json; references?: Json } }
  | { purpose: 'difference'; reference: MediaInput; instruction: string; negative: string; width: number; height: number; count: number; seed: number | null }
  | { purpose: 'speech'; text: string; language: string; voiceId: string | null; referenceAudio: MediaInput | null; referenceText: string | null; referenceLanguage: string | null; emotion: string | null; speed: number | null }
  | { purpose: 'music'; prompt: string; durationSec: number; instrumental: boolean; lyrics: string | null; seed: number | null }
  | { purpose: 'matting'; reference: MediaInput }
  | { purpose: import('@galcraft/contracts').ExtensionOperationId; fields: Record<string, Json>; references: MediaInput[] };
export type ComfyGraph = Record<string, { class_type: string; inputs: Record<string, Json>; _meta?: { title?: string } }>;
export const WorkflowUsageGuidanceSchema = z.strictObject({
  description: z.string(), scenarios: z.array(z.string()),
  inputs: z.array(z.strictObject({ port: z.string().min(1), description: z.string() })),
  promptTips: z.array(z.string()), limitations: z.array(z.string()),
  examples: z.array(z.strictObject({ title: z.string(), input: z.string(), notes: z.string() })),
});
export type WorkflowUsageGuidance = z.infer<typeof WorkflowUsageGuidanceSchema>;
export type WorkflowBinding = { id: Id; revision: number; name: string; purpose: Purpose; operation?: string; imageUsages: ('background' | 'figure' | 'cg' | 'ui')[] | null;
  graphVersion: string; apiGraph: ComfyGraph; editorWorkflowPath: string | null; modelFamily?: string; usageGuidance?: WorkflowUsageGuidance;
  inputs: { port: string; nodeId: string; classType: string; input: string; valueType: 'string' | 'number' | 'boolean' | 'imageFile' | 'audioFile'; required: boolean; transform: 'identity' | 'round' | 'secondsToMs' }[];
  uploads: { port: string; method: 'comfyImage' | 'serverPath'; subfolder: string; serverRoot: string | null; serverPathFormat?: 'absolute' | 'relative' }[];
  outputs: { nodeId: string; classType?: string; key: string; kind: 'image' | 'audio'; source?: 'automatic' | 'author'; decoder: 'comfyFileList'; group: string; role: 'primary' | 'mask'; background: 'removed' | 'unchanged' | 'unknown'; port?: string }[];
  requiredNodes: { classType: string; versionNote: string | null }[]; modelNotes: { name: string; source: string | null; license: string | null }[] };
export type WorkflowOutputCandidate = { nodeId: string; classType: string; key: string | null; kind: 'image' | 'audio' | null; source: 'standard' | 'operationTemplate' | 'history' | 'metadata'; confirmed: boolean };

export type SubmissionContext = { requestId: Id; config: ConnectionConfig; workflow: WorkflowBinding | null; directory: string; signal: AbortSignal; beforeSend?: () => Promise<void> };
export interface GenerationAdapter {
  validateInput?(input:GenerationInput):Promise<Result<void>>;
  freeze?(): Promise<Json>;
  inspect(config: ConnectionConfig, purpose: Purpose): Promise<CapabilityReport>;
  submit(input: GenerationInput, ctx: SubmissionContext): AsyncIterable<ServiceEvent>;
  query(ref: RemoteRef, ctx: SubmissionContext): Promise<Result<RemoteStatus>>;
  fetch(ref: RemoteRef, output: Json, ctx: SubmissionContext): Promise<Result<Artifact[]>>;
  cancel(ref: RemoteRef, ctx: SubmissionContext): Promise<CancelResult>;
  inspectResources?(ctx: SubmissionContext): Promise<Result<ResourceSnapshot>>;
  releaseResources?(ctx: SubmissionContext): Promise<Result<ResourceReleaseReceipt>>;
}
