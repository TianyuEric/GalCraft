import { z } from 'zod';
import { IdSchema, JsonSchema, VersionSchema } from './common.js';
import { AssetKindSchema } from './assets.js';
import { FieldSpecSchema } from './dsl.js';

export type ExtensionOperationId = `${string}/${string}`;
export const ExtensionOperationIdSchema: z.ZodType<ExtensionOperationId> = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+\/[A-Za-z_][A-Za-z0-9_-]*$/) as z.ZodType<ExtensionOperationId>;
export const ProductionOperationIdSchema = z.union([z.enum(['script', 'performance', 'discuss', 'image', 'difference', 'speech', 'music', 'imagePrompt', 'novelaiPrompt', 'differencePrompt', 'speechText', 'musicPrompt', 'uiPlan', 'uiPatch', 'svg']), ExtensionOperationIdSchema]);
export const ProductionPortSchema = z.strictObject({
  key: z.string().min(1), type: z.union([z.literal('text'), AssetKindSchema]), required: z.boolean(), multiple: z.boolean(),
  typeVersion: z.number().int().positive().optional(),
  mimeTypes: z.array(z.string()),
});
/** Serializable operation definition; execution belongs to its generation provider. */
export const ProductionOperationDefinitionSchema = z.strictObject({
  contractVersion: z.literal(1), id: ProductionOperationIdSchema, version: z.number().int().positive().refine(Number.isSafeInteger),
  title: z.string().min(1), description: z.string(), titleKey: z.string().optional(), descriptionKey: z.string().optional(), providerKey: ExtensionOperationIdSchema.nullable(),
  purpose: z.string().min(1), fields: z.array(FieldSpecSchema), inputSchema: JsonSchema,
  connection: z.strictObject({ purpose: z.string().min(1), protocols: z.array(z.string().min(1)).min(1) }).optional(),
  execution: z.enum(['local', 'remote']).optional(),
  textPreparationKey: ExtensionOperationIdSchema.optional(),
  /** Transfer an editable plain-text candidate into one field of the next operation's personal draft. */
  textTransfer: z.strictObject({ operation: ExtensionOperationIdSchema, field: z.string().min(1) }).optional(),
  inputs: z.array(ProductionPortSchema), outputs: z.array(ProductionPortSchema).min(1),
  fieldEditorKey: ExtensionOperationIdSchema.optional(),
  /** Provider-authored execution template; M10 validates and freezes the actual binding. */
  workflow: JsonSchema.optional(),
  /** Read-only starting schemes, surfaced by M10's existing recipe library. */
  presets: z.array(z.strictObject({ id: IdSchema, name: z.string().min(1), description: z.string(), nameKey: z.string().optional(), descriptionKey: z.string().optional(),
    defaults: z.record(z.string(), JsonSchema) })).optional(),
  capabilities: z.strictObject({ query: z.boolean(), refetch: z.boolean(), cancelPerTask: z.boolean(), resume: z.boolean() }),
  adoption: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('asset'), assetKind: AssetKindSchema, usages: z.array(z.string()).min(1) }), z.strictObject({ kind: z.literal('text') })]),
});
export type ProductionOperationDefinition = z.infer<typeof ProductionOperationDefinitionSchema>;
export const ProductionOperationSnapshotSchema = z.strictObject({
  id: ProductionOperationIdSchema, version: z.number().int().positive().refine(Number.isSafeInteger),
  provider: z.strictObject({ id: z.string().min(1), version: VersionSchema }).nullable(), definition: ProductionOperationDefinitionSchema,
  messages: z.record(z.string(), z.record(z.string(), z.string())).optional(),
}).refine(value => value.id === value.definition.id && value.version === value.definition.version, 'Operation snapshot identity mismatch');
export type ProductionOperationSnapshot = z.infer<typeof ProductionOperationSnapshotSchema>;

export function validateProductionOperationDefinition(definition: ProductionOperationDefinition, provider: { id: string; version: string }, declarations?: readonly { kind: string; key: string }[]): void {
  ProductionOperationDefinitionSchema.parse(definition); VersionSchema.parse(provider.version);
  if (!definition.id.startsWith(`${provider.id}/`) || definition.purpose !== definition.id
    || !definition.providerKey || definition.fieldEditorKey && !definition.fieldEditorKey.startsWith(`${provider.id}/`)) throw new Error(`Production operation ownership mismatch: ${definition.id}`);
  for (const ports of [definition.inputs, definition.outputs]) if (new Set(ports.map(port => port.key)).size !== ports.length) throw new Error(`Duplicate operation port: ${definition.id}`);
  if (new Set(definition.fields.map(field => field.path)).size !== definition.fields.length) throw new Error(`Duplicate operation field: ${definition.id}`);
  if (definition.textTransfer && (definition.outputs.length !== 1 || definition.outputs[0]?.type !== 'text' || definition.outputs[0]?.multiple)) throw new Error(`Text transfer requires one plain-text output: ${definition.id}`);
  if (new Set(definition.presets?.map(preset => preset.id)).size !== (definition.presets?.length ?? 0)) throw new Error(`Duplicate operation preset: ${definition.id}`);
  for (const preset of definition.presets ?? []) for (const key of Object.keys(preset.defaults))
    if (!definition.fields.some(field => field.path === key)) throw new Error(`Unknown preset field: ${definition.id}/${key}`);
  if (declarations) {
    if (!declarations.some(item => item.kind === 'productionOperation' && item.key === definition.id)) throw new Error(`Undeclared production operation: ${definition.id}`);
    if (definition.providerKey?.startsWith(`${provider.id}/`) && !declarations.some(item => item.kind === (definition.textPreparationKey ? 'textPreparation' : 'generationProvider') && item.key === definition.providerKey)) throw new Error(`Undeclared generation provider: ${definition.providerKey}`);
    if (definition.fieldEditorKey && !declarations.some(item => item.kind === 'fieldEditor' && item.key === definition.fieldEditorKey)) throw new Error(`Undeclared production field editor: ${definition.fieldEditorKey}`);
  }
}
