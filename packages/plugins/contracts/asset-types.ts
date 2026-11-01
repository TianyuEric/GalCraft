import { AssetKindSchema, BuiltinAssetKindSchema, FieldSpecSchema, JsonSchema, TargetSchema, VersionSchema } from '@galcraft/contracts';
import type { AssetTypeData, Id, Json, Ref, Result } from '@galcraft/contracts';
import { z } from 'zod';
export { AssetTypeIconNames } from '@galcraft/contracts';

export const AssetTypeDescriptorSchema = z.strictObject({
  contractVersion: z.literal(1), key: AssetKindSchema, typeVersion: z.number().int().positive().refine(Number.isSafeInteger),
  title: z.string().min(1), description: z.string(), icon: z.string(), group: z.string().optional(),
  titleKey: z.string().optional(), descriptionKey: z.string().optional(), messages: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  schema: JsonSchema, fields: z.array(FieldSpecSchema), extensions: z.array(z.string().regex(/^\.[a-z0-9.-]+$/)),
  targets: z.array(TargetSchema).min(1), resourceProviderKey: z.string().nullable(), stageProviderKey: z.string().optional(),
  capabilities: z.array(z.string()),
  editorKey: z.string().optional(), previewKey: z.string().optional(), thumbnailKey: z.string().optional(),
  builtinKind: BuiltinAssetKindSchema.optional(), resourceProviderAliases: z.array(z.string()).optional(),
  filterFields: z.array(z.string().min(1)).optional(),
});
export function validateAssetTypeDefinition(definition: AssetTypeDefinition, provider: AssetTypeData['provider']): void {
  const { validate, collectReferences, rewriteReferences, rewriteFile, ...descriptor } = definition;
  AssetTypeDescriptorSchema.parse(descriptor); VersionSchema.parse(provider.version);
  if (!definition.key.startsWith(`${provider.id}/`) || definition.resourceProviderKey && !definition.resourceProviderKey.startsWith(`${provider.id}/`)
    || definition.stageProviderKey && !definition.stageProviderKey.startsWith(`${provider.id}/`)) throw new Error(`Asset type ownership mismatch: ${definition.key}`);
  if (typeof collectReferences !== 'function' || typeof rewriteReferences !== 'function'
    || validate !== undefined && typeof validate !== 'function' || rewriteFile !== undefined && typeof rewriteFile !== 'function') throw new Error(`Asset type callbacks missing: ${definition.key}`);
  for (const key of [definition.editorKey, definition.previewKey, definition.thumbnailKey]) if (key && !key.startsWith(`${provider.id}/`)) throw new Error(`Asset UI ownership mismatch: ${key}`);
  for (const path of definition.filterFields ?? []) if (!definition.fields.some(field => field.path === path && ['string', 'number', 'boolean'].includes(field.type))) throw new Error(`Asset filter must name a declared scalar field: ${path}`);
}

/** Serializable presentation/query description. Executable definitions stay in the definition lease. */
export type AssetTypeDescriptor = import('@galcraft/contracts').AssetTypeDescriptor;
export type AssetTypeDefinition = AssetTypeDescriptor & {
  validate?(value: Json): Result<Json>;
  collectReferences(value: Json): Ref[];
  rewriteReferences(value: Json, mapping: Record<Id, Id>): Result<Json>;
  /** Rewrites declared dependencies on copy/restore, preserving unrelated bytes. */
  rewriteFile?(path: string, bytes: Uint8Array, mapping: Record<Id, Id>): Result<Uint8Array>;
};
export type RegisteredAssetType = { definition: AssetTypeDefinition; provider: AssetTypeData['provider'] | null };
