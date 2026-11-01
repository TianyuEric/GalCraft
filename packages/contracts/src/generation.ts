import { z } from 'zod';
import { IdSchema, IssueSchema, JsonSchema, RevisionSchema, UtcTimeSchema } from './common.js';
import { ExtensionOperationIdSchema, type ExtensionOperationId } from './production-operations.js';
import { AssetKindSchema, AssetTypeDataSchema } from './assets.js';
import type { Json } from './common.js';

const finite = z.number().finite();
export const ProtocolSchema = z.enum([
  'chatCompletions', 'anthropic', 'gemini', 'ollama', 'novelAIText', 'comfyUI', 'webUI',
  'novelAIImage', 'openAIImage', 'openAISpeech', 'gptSoVits', 'miniMaxSpeech', 'miniMaxMusic', 'elevenLabs', 'voiceStudio', 'plugin',
]);
export type Protocol = z.infer<typeof ProtocolSchema>;
export const BuiltinPurposeSchema = z.enum(['text', 'image', 'difference', 'speech', 'music', 'matting']);
export const PurposeSchema = z.union([BuiltinPurposeSchema, ExtensionOperationIdSchema]);
export type Purpose = z.infer<typeof BuiltinPurposeSchema> | ExtensionOperationId;
export const ImageUsageSchema = z.enum(['background', 'figure', 'cg', 'ui']);
export type ImageUsage = z.infer<typeof ImageUsageSchema>;
export const DefaultTimeoutSecByPurpose: Record<Purpose, number> = {
  text: 120, image: 600, difference: 600, speech: 600, music: 600, matting: 600,
};
export const TimeoutSecByPurposeSchema = z.object({
  text: finite.positive(), image: finite.positive(), difference: finite.positive(),
  speech: finite.positive(), music: finite.positive(), matting: finite.positive(),
}).catchall(finite.positive());
export const ConnectionConfigSchema = z.strictObject({
  id: IdSchema, revision: RevisionSchema, name: z.string(), protocol: ProtocolSchema, baseUrl: z.string(),
  credentialId: IdSchema.nullable(), auth: z.enum(['none', 'bearer', 'apiKey', 'basic']), apiKeyHeader: z.string().nullable(),
  model: z.string(), purposes: z.array(PurposeSchema), timeoutSecByPurpose: TimeoutSecByPurposeSchema,
  concurrency: z.number().int().positive(), parameters: z.record(z.string(), JsonSchema),
  workflowBindingId: IdSchema.nullable(), serverFileRoot: z.string().nullable(), serverReadRoot: z.string().nullable().optional(),
  providerKey: z.string().min(1).optional(),
  comfyResources: z.strictObject({ ownership: z.enum(['exclusive', 'shared']), release: z.enum(['onSwitch', 'afterTask', 'manual']) })
    .refine(value => value.ownership === 'exclusive' || value.release === 'manual', 'Shared ComfyUI instances use manual resource release.').optional(),
});
export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;
/** Read-only provider discovery. Engine IDs are request identities; model IDs describe the actual installed weights. */
export const SpeechServiceCatalogSchema = z.strictObject({
  activeEngine: z.string(), activeModel: z.string().nullable(),
  engines: z.array(z.strictObject({ id: z.string(), name: z.string(), available: z.boolean(), reason: z.string().nullable(),
    cloning: z.boolean(), speed: z.boolean(), design: z.enum(['none', 'tags', 'description']), performance: z.enum(['none', 'instruction']),
    languages: z.array(z.string()).nullable(), maxReferenceSeconds: finite.positive().nullable(), source: z.string().nullable() })),
  models: z.array(z.strictObject({ id: z.string(), name: z.string(), engines: z.array(z.string()), installed: z.boolean(), source: z.string(), conditions: z.string().nullable() })),
  voices: z.array(z.strictObject({ id: z.string(), name: z.string(), kind: z.enum(['profile', 'preset']), engine: z.string().nullable(), language: z.string().nullable() })),
  designPresets: z.array(z.strictObject({ id: z.string(), name: z.string(), instruction: z.string(), language: z.string().nullable() })),
  transcription: z.strictObject({ engine: z.string(), model: z.string().nullable(), available: z.boolean() }).nullable(),
});
export type SpeechServiceCatalog = z.infer<typeof SpeechServiceCatalogSchema>;
export const CapabilityReportSchema = z.strictObject({
  connectionId: IdSchema, connectionRevision: RevisionSchema, checkedAt: UtcTimeSchema, serviceVersion: z.string().nullable(),
  purpose: PurposeSchema, status: z.enum(['verified', 'unverified', 'unavailable']),
  inputs: z.array(z.strictObject({
    port: z.string(), required: z.boolean(), supported: z.boolean(),
    limits: z.strictObject({ min: finite.optional(), max: finite.optional(), step: finite.optional(), values: z.array(z.string()).optional() }),
  })),
  output: z.union([z.enum(['text', 'image', 'audio']), AssetKindSchema]), models: z.array(z.string()).nullable(),
  promptFormat: z.enum(['natural', 'tags', 'either']).nullable(),
  textVision: z.strictObject({ supported: z.boolean(), mimeTypes: z.array(z.string()), maxImages: finite.nullable(), maxBytes: finite.nullable() }).nullable(),
  remote: z.strictObject({ query: z.boolean(), cancelQueued: z.boolean(), cancelRunning: z.enum(['perTask', 'globalOnly', 'none']) }),
  issues: z.array(IssueSchema),
  speechCatalog: SpeechServiceCatalogSchema.optional(),
});
export type CapabilityReport = z.infer<typeof CapabilityReportSchema>;
export const ConnectionCheckSchema = z.strictObject({
  connectionId: IdSchema, connectionRevision: RevisionSchema, workflowBindingId: IdSchema.nullable(), workflowRevision: RevisionSchema.nullable(),
  purpose: PurposeSchema, imageUsage: ImageUsageSchema.nullable(), model: z.string(),
  reachable: z.enum(['unchecked', 'passed', 'failed']), mapping: z.enum(['unchecked', 'passed', 'failed']),
  trial: z.strictObject({ taskId: IdSchema.nullable(), result: z.enum(['notRun', 'running', 'passed', 'failed']), checkedAt: UtcTimeSchema.nullable() }),
  issues: z.array(IssueSchema),
});
export type ConnectionCheck = z.infer<typeof ConnectionCheckSchema>;
export const ConnectionSelectionSchema = z.strictObject({
  connectionId: IdSchema, purpose: PurposeSchema, imageUsage: ImageUsageSchema.nullable(),
  workflowBindingId: IdSchema.nullable(), model: z.string(),
});
export type ConnectionSelection = z.infer<typeof ConnectionSelectionSchema>;
export const RemoteRefSchema = z.strictObject({
  protocol: ProtocolSchema, id: z.string(), connectionId: IdSchema, submittedAt: UtcTimeSchema,
});
export type RemoteRef = z.infer<typeof RemoteRefSchema>;
export const BackgroundResultSchema = z.strictObject({
  declared: z.enum(['removed', 'unchanged', 'unknown']), hasAlpha: z.boolean(), hasTransparency: z.boolean(),
});
export type BackgroundResult = z.infer<typeof BackgroundResultSchema>;
export const ArtifactSchema = z.strictObject({
  kind: z.union([z.enum(['text', 'image', 'audio']), AssetKindSchema]), localPath: z.string(), mime: z.string(), bytes: z.number().int().nonnegative(),
  typeVersion: z.number().int().positive().optional(), typeData: AssetTypeDataSchema.optional(), port: z.string().optional(),
  metadata: JsonSchema, groupId: z.string(), role: z.enum(['primary', 'mask']), background: BackgroundResultSchema.nullable(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
/** Providers may add their own usage details; known counters retain numeric types. */
export const GenerationUsageSchema=z.object({prompt_tokens:finite.nonnegative().optional(),completion_tokens:finite.nonnegative().optional(),total_tokens:finite.nonnegative().optional(),input_tokens:finite.nonnegative().optional(),output_tokens:finite.nonnegative().optional(),promptTokenCount:finite.nonnegative().optional(),candidatesTokenCount:finite.nonnegative().optional(),totalTokenCount:finite.nonnegative().optional(),engine:z.string().optional(),version:z.string().optional(),requests:finite.nonnegative().optional()}).catchall(JsonSchema);
export const GenerationOutputSchema=z.strictObject({artifacts:z.array(ArtifactSchema),usage:GenerationUsageSchema.nullable()});
export const GenerationOutputJsonSchema=z.toJSONSchema(GenerationOutputSchema,{io:'input'}) as Json;
export function localGenerationOutputJsonSchema(kind:'audio'|'video',mime:string,port:string,engine:string,version:string):Json{return z.toJSONSchema(z.strictObject({artifacts:z.array(ArtifactSchema.extend({kind:z.literal(kind),mime:z.literal(mime),port:z.literal(port)})).length(1),usage:z.strictObject({engine:z.literal(engine),version:z.literal(version),requests:z.literal(1)}).nullable()}),{io:'input'}) as Json;}
export const GenerationProgressSchema = z.strictObject({
  phase: z.string(), completed: finite.nullable(), total: finite.nullable(),
  scope: z.enum(['nodes', 'sampling', 'unknown']).optional(), nodeId: z.string().optional(), nodeName: z.string().optional(), nodeType: z.string().optional(),
  elapsedMs: finite.nonnegative().optional(), updatedAt: UtcTimeSchema.optional(), cachedNodes: z.array(z.string()).optional(),
});
export type GenerationProgress = z.infer<typeof GenerationProgressSchema>;
export const ProviderExecutionErrorSchema = z.strictObject({
  promptId: z.string(), nodeId: z.string().nullable(), nodeType: z.string().nullable(), exceptionType: z.string().nullable(),
  message: z.string(), traceback: z.array(z.string()), observedAt: UtcTimeSchema,
});
export type ProviderExecutionError = z.infer<typeof ProviderExecutionErrorSchema>;
export const ResourceSnapshotSchema = z.strictObject({
  serviceUrl: z.string(), checkedAt: UtcTimeSchema,
  queue: z.strictObject({ running: z.array(z.string()), pending: z.array(z.string()) }),
  system: z.strictObject({ ramTotal: finite.nonnegative().nullable(), ramFree: finite.nonnegative().nullable() }),
  devices: z.array(z.strictObject({ name: z.string(), type: z.string(), index: finite.nullable(),
    vramTotal: finite.nonnegative().nullable(), vramFree: finite.nonnegative().nullable(), torchVramTotal: finite.nonnegative().nullable(), torchVramFree: finite.nonnegative().nullable() })),
  hostCommit: z.strictObject({ usedBytes: finite.nonnegative(), limitBytes: finite.nonnegative(), checkedAt: UtcTimeSchema }).optional(),
  issues: z.array(IssueSchema),
});
export type ResourceSnapshot = z.infer<typeof ResourceSnapshotSchema>;
export const ResourceReleaseReceiptSchema = z.strictObject({
  status: z.enum(['busy', 'idle', 'observed', 'unverified']), requestedAt: UtcTimeSchema.nullable(),
  before: ResourceSnapshotSchema, after: ResourceSnapshotSchema.nullable(), issues: z.array(IssueSchema),
});
export type ResourceReleaseReceipt = z.infer<typeof ResourceReleaseReceiptSchema>;
export const ServiceEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('accepted'), remote: RemoteRefSchema.nullable() }),
  GenerationProgressSchema.extend({ kind: z.literal('progress') }),
  z.strictObject({ kind: z.literal('textDelta'), text: z.string() }),
  z.strictObject({ kind: z.literal('output'), artifacts: z.array(ArtifactSchema), usage: JsonSchema.nullable() }),
  z.strictObject({ kind: z.literal('error'), issue: IssueSchema, remoteStatus: z.enum(['failed', 'unknown']), details: ProviderExecutionErrorSchema.optional() }),
]);
export type ServiceEvent = z.infer<typeof ServiceEventSchema>;
export const RemoteStatusSchema = z.strictObject({
  state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'unknown']),
  output: JsonSchema.nullable(), issues: z.array(IssueSchema),
  errorDetails: ProviderExecutionErrorSchema.optional(),
});
export type RemoteStatus = z.infer<typeof RemoteStatusSchema>;
