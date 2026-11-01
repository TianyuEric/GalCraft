import { z } from 'zod';
import { CapabilityReportSchema, CollaborationContextSchema, ConnectionConfigSchema, GenerationInputSchema, IdSchema, JsonSchema, ProductionOperationIdSchema,
  ProductionOperationSnapshotSchema, PurposeSchema, RemoteRefSchema, RevisionSchema, UtcTimeSchema, VersionRefSchema, VersionSchema, VoicePresetSchema, WorkflowUsageGuidanceSchema } from '@galcraft/contracts';
import type { ConnectionConfig, Json } from '@galcraft/contracts';
import { CreationRecipeSchema, ProductionSchemeSchema, RecipePurposeSchema, RecipeScopeSchema, RecipeUsageSchema } from '../recipes/schema.js';
import { ContextPartSchema, ProductionTargetSchema } from './types.js';
import type { RecipeUsage } from '../recipes/schema.js';
import type { CreationRecipe } from '../recipes/schema.js';
import type { Candidate, ImageGenerationRoutes, Task } from './types.js';
import { defaultOperation, operationPurpose } from './draft.js';

export const WorkflowBindingSchema = z.strictObject({ id: IdSchema, revision: RevisionSchema, name: z.string(), purpose: PurposeSchema, operation: z.string().min(1).optional(),
  imageUsages: z.array(z.enum(['background', 'figure', 'cg', 'ui'])).nullable(), graphVersion: z.string(), editorWorkflowPath: z.string().nullable(),
  apiGraph: z.record(z.string(), z.strictObject({ class_type: z.string(), inputs: z.record(z.string(), JsonSchema), _meta: z.strictObject({ title: z.string().optional() }).optional() })),
  modelFamily: z.string().optional(), usageGuidance: WorkflowUsageGuidanceSchema.optional(),
  inputs: z.array(z.strictObject({ port: z.string(), nodeId: z.string(), classType: z.string(), input: z.string(), valueType: z.enum(['string', 'number', 'boolean', 'imageFile', 'audioFile']), required: z.boolean(), transform: z.enum(['identity', 'round', 'secondsToMs']) })),
  uploads: z.array(z.strictObject({ port: z.string(), method: z.enum(['comfyImage', 'serverPath']), subfolder: z.string(), serverRoot: z.string().nullable(), serverPathFormat: z.enum(['absolute', 'relative']).optional() })),
  outputs: z.array(z.strictObject({ nodeId: z.string(), classType: z.string().optional(), key: z.string(), kind: z.enum(['image', 'audio']), source: z.enum(['automatic', 'author']).optional(), decoder: z.literal('comfyFileList'), group: z.string(), role: z.enum(['primary', 'mask']), background: z.enum(['removed', 'unchanged', 'unknown']), port: z.string().optional() })),
  requiredNodes: z.array(z.strictObject({ classType: z.string(), versionNote: z.string().nullable() })), modelNotes: z.array(z.strictObject({ name: z.string(), source: z.string().nullable(), license: z.string().nullable() })) });
const selection = z.strictObject({ recipeId: IdSchema, scope: RecipeScopeSchema, purpose: RecipePurposeSchema, usage: RecipeUsageSchema, parameterValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) });
const backgroundRemoval = z.strictObject({ enabled: z.boolean(), provider: z.enum(['node', 'comfy']).nullable(), connectionId: IdSchema.nullable(), workflowBindingId: IdSchema.nullable() }).nullable();
const backgroundPreview = z.strictObject({ canvas: z.strictObject({ width: z.number(), height: z.number() }), frame: z.strictObject({ fit: z.enum(['cover', 'contain', 'native']), positionX: z.number(), positionY: z.number() }) }).nullable();
export const ProductionFormVariantSchema = z.strictObject({ operation: ProductionOperationIdSchema.optional(), operationSnapshot: ProductionOperationSnapshotSchema.optional(),
  productionRecipeId: IdSchema.nullable().optional(), parameterPresetId: IdSchema.nullable().optional(), parameterOverrides: z.record(z.string(), JsonSchema).optional(), explicitFields: z.array(z.string()).optional(),
  target: ProductionTargetSchema, fields: z.record(z.string(), JsonSchema), context: z.array(ContextPartSchema), connectionId: IdSchema.nullable(), workflowBindingId: IdSchema.nullable(), model: z.string().nullable(),
  recipe: selection.nullable(), promptPreparation: selection.nullable(), backgroundRemoval, backgroundPreview, sourceVersions: z.array(VersionRefSchema) });
export const ProductionFormDraftSchema = z.strictObject({ schemaVersion: z.literal(1), id: IdSchema, projectId: IdSchema, revision: RevisionSchema, activeUse: RecipeUsageSchema,
  name: z.string().optional(), origin: z.strictObject({ page: z.string(), sceneId: IdSchema.nullable(), statementId: IdSchema.nullable(), statementIds: z.array(IdSchema).optional(), pageIds: z.array(IdSchema), componentIds: z.array(IdSchema) }).nullable().optional(),
  variants: z.partialRecord(RecipeUsageSchema, ProductionFormVariantSchema), updatedAt: UtcTimeSchema, submittedTaskId: IdSchema.nullable() });
export const FrozenCreationRecipeSchema = z.strictObject({ ...CreationRecipeSchema.shape, production: ProductionSchemeSchema.extend({ workflow: WorkflowBindingSchema.optional() }).optional() }).superRefine((value, context) => {
  const checked = CreationRecipeSchema.safeParse(value); if (!checked.success) for (const issue of checked.error.issues) context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});
const recipeSnapshot = z.strictObject({ recipe: FrozenCreationRecipeSchema, purpose: RecipePurposeSchema, usage: RecipeUsageSchema, parameterValues: selection.shape.parameterValues,
  contract: RecipePurposeSchema, contractVersion: z.literal(1), assembledInput: GenerationInputSchema.options[0], omittedPorts: z.array(z.string()), context: z.array(ContextPartSchema), sourceVersions: z.array(VersionRefSchema), idAliases: z.record(z.string(), IdSchema).optional() });
const recorded = <T extends z.ZodType>(schema: T) => z.union([schema, z.literal('unknown')]);
const publicConnection = ConnectionConfigSchema.pick({ id: true, revision: true, name: true, protocol: true, providerKey: true, model: true, parameters: true, timeoutSecByPurpose: true, concurrency: true }).extend({ providerKey: z.string().nullable() });
export const FrozenProductionTaskSchema = z.strictObject({ taskId: IdSchema, projectId: IdSchema, revision: RevisionSchema, collaboration: CollaborationContextSchema.nullable(), executionCollaboration: CollaborationContextSchema.nullable(),
  sourceDraftId: IdSchema.nullable(), previousTaskId: IdSchema.nullable(), previousItemId: IdSchema.nullable(),
  items: z.array(z.strictObject({ itemId: IdSchema, state: z.enum(['draft', 'blocked', 'queued', 'submitting', 'running', 'fetching', 'review', 'interrupted', 'failed', 'cancelled']), target: ProductionTargetSchema,
    input: recorded(GenerationInputSchema), parameterSources: recorded(z.record(z.string(), z.enum(['operation', 'scheme', 'preset', 'input', 'override']))), sourceVersions: recorded(z.array(VersionRefSchema)), reviewedSourceVersions: recorded(z.array(VersionRefSchema)), operation: recorded(ProductionOperationSnapshotSchema), connection: recorded(publicConnection), workflow: recorded(WorkflowBindingSchema),
    provider: recorded(z.strictObject({ providerKey: z.string(), packageVersion: VersionSchema, capability: CapabilityReportSchema })), recipe: recorded(recipeSnapshot), productionRecipe: recorded(FrozenCreationRecipeSchema), parameterPreset: recorded(FrozenCreationRecipeSchema),
    voicePreset: recorded(z.strictObject({ characterId: IdSchema, locale: z.string(), preset: VoicePresetSchema })), remote: RemoteRefSchema.nullable(),
    attempts: z.array(z.strictObject({ id: IdSchema, createdAt: UtcTimeSchema, sentAt:UtcTimeSchema.nullable().optional(), remote: RemoteRefSchema.nullable(), outcome: z.enum(['pending', 'completed', 'failed', 'unknown', 'cancelled']) })), candidateIds: z.array(IdSchema), selectedCandidateId: IdSchema.nullable(), needsReview: z.boolean() })) });
const versionIdentity = z.strictObject({ id: IdSchema, revision: recorded(RevisionSchema) });
export const EffectiveProductionDefaultsSchema = z.strictObject({ usage: RecipeUsageSchema, operation: ProductionOperationIdSchema, purpose: PurposeSchema, status: z.enum(['unconfigured', 'unavailable', 'available']),
  connection: z.union([versionIdentity.extend({ name: z.string(), protocol: ConnectionConfigSchema.shape.protocol, providerKey: z.string().nullable() }), versionIdentity]).nullable(), model: z.string(), workflow: versionIdentity.nullable(),
  recipe: z.union([versionIdentity.extend({ scope: RecipeScopeSchema }), versionIdentity]).nullable() });

/** Only execution facts are public; credential storage and private connection setup stay with the host. */
export function nonSecretProductionValue(value: unknown): Json {
  if (Array.isArray(value)) return value.map(nonSecretProductionValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(?:authorization|credentialId|password|secret|api.?key|access.?token|refresh.?token)$/i.test(key)).map(([key, item]) => [key, nonSecretProductionValue(item)]));
  return value === undefined ? 'unknown' : value as Json;
}
export function frozenProductionTask(task: Task, itemId?: string, candidates: Candidate[] = []): Json {
  const items = itemId ? task.items.filter(item => item.id === itemId) : task.items;
  if (!items.length) throw new Error('The production item does not exist. Read the current project tasks again.');
  return nonSecretProductionValue({ taskId: task.id, projectId: task.projectId, revision: task.revision,
    collaboration: task.collaboration ?? null, executionCollaboration: task.executionCollaboration ?? null,
    sourceDraftId: task.sourceDraftId ?? null, previousTaskId: task.previousTaskId ?? null, previousItemId: task.previousItemId ?? null,
    items: items.map(item => ({ itemId: item.id, state: item.state, target: item.target, input: item.input ?? 'unknown', parameterSources: item.parameterSources ?? 'unknown',
      sourceVersions: item.frozenSourceVersions ?? candidates.find(candidate => candidate.itemId === item.id)?.sourceVersions ?? 'unknown', reviewedSourceVersions: item.sourceVersions ?? 'unknown', operation: item.operationSnapshot ?? 'unknown',
      connection: item.configSnapshot ? { id: item.configSnapshot.id, revision: item.configSnapshot.revision, name: item.configSnapshot.name,
        protocol: item.configSnapshot.protocol, providerKey: item.configSnapshot.providerKey ?? null, model: item.configSnapshot.model,
        parameters: item.configSnapshot.parameters, timeoutSecByPurpose: item.configSnapshot.timeoutSecByPurpose, concurrency: item.configSnapshot.concurrency } : 'unknown',
      workflow: item.workflowSnapshot ?? 'unknown', provider: item.providerSnapshot ? { providerKey: item.providerSnapshot.providerKey,
        packageVersion: item.providerSnapshot.packageVersion, capability: item.providerSnapshot.capability } : 'unknown',
      recipe: item.recipeSnapshot ?? 'unknown', productionRecipe: item.productionSnapshot ?? 'unknown', parameterPreset: item.parameterPresetSnapshot ?? 'unknown',
      voicePreset: item.voicePresetSnapshot ?? 'unknown', remote: item.remote, attempts: item.attempts, candidateIds: item.candidateIds,
      selectedCandidateId: item.selectedCandidateId, needsReview: item.needsReview })) });
}
export function effectiveProductionDefaults(input: { usage: RecipeUsage; operation?: string; connections: ConnectionConfig[];
  imageRoutes: ImageGenerationRoutes; defaults: { connections?: Record<string, string>; recipes?: Record<string, string> };
  workflows: { id: string; revision: number }[]; recipes: CreationRecipe[] }): Json {
  const operation = input.operation ?? defaultOperation(input.usage), purpose = operationPurpose(operation as Parameters<typeof operationPurpose>[0]);
  const route = purpose === 'image' ? input.imageRoutes[input.usage as keyof ImageGenerationRoutes] : undefined;
  const connectionId = route?.connectionId ?? input.defaults.connections?.[purpose] ?? null;
  const connection = input.connections.find(connection => connection.id === connectionId);
  const workflowId = route?.workflowBindingId ?? connection?.workflowBindingId ?? null;
  const workflow = input.workflows.find(workflow => workflow.id === workflowId);
  const recipeId = input.defaults.recipes?.[input.usage] ?? null, recipe = input.recipes.find(recipe => recipe.id === recipeId);
  return { usage: input.usage, operation, purpose, status: !connectionId ? 'unconfigured' : !connection || !connection.purposes.includes(purpose) || workflowId && !workflow ? 'unavailable' : 'available',
    connection: connection ? { id: connection.id, revision: connection.revision, name: connection.name, protocol: connection.protocol,
      providerKey: connection.providerKey ?? null } : connectionId ? { id: connectionId, revision: 'unknown' } : null,
    model: connection ? route?.model ?? connection.model : 'unknown', workflow: workflow ? { id: workflow.id, revision: workflow.revision } : workflowId ? { id: workflowId, revision: 'unknown' } : null,
    recipe: recipe ? { id: recipe.id, scope: recipe.scope, revision: recipe.revision } : recipeId ? { id: recipeId, revision: 'unknown' } : null };
}
