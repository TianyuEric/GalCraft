import { z } from 'zod';
import { IdSchema, JsonSchema, RefSchema, RelativePathSchema, RevisionSchema, SourceSchema, UtcTimeSchema, VersionSchema } from './common.js';
import type { Id, Json, Ref, Revision, Target } from './common.js';
import type { AssetListIdentity } from './host.js';
import type { FieldSpec } from './dsl.js';

const finite = z.number().finite();
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const AnimatedImageMetadataSchema = z.strictObject({ format: z.enum(['gif', 'webp']),
  frameDurationsMs: z.array(finite.positive()).min(2), sourceLoopCount: count.nullable() });
export type AnimatedImageMetadata = z.infer<typeof AnimatedImageMetadataSchema>;
export const AudioLoopSchema = z.strictObject({ startSec: finite.nonnegative(), endSec: finite.positive(), tail: z.enum(['wrap', 'cut']) }).refine(loop => loop.endSec > loop.startSec, { message: 'Loop end must follow loop start', path: ['endSec'] });
export const BuiltinAssetKindSchema = z.enum(['image', 'audio', 'video', 'font', 'live2d', 'texture', 'animation', 'effect']);
export type BuiltinAssetKind = z.infer<typeof BuiltinAssetKindSchema>;
export const ExtensionAssetKindSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+\/[A-Za-z_][A-Za-z0-9_-]*$/).transform(value => value as `${string}/${string}`);
export const AssetKindSchema = z.union([BuiltinAssetKindSchema, ExtensionAssetKindSchema]);
export type AssetKind = z.infer<typeof AssetKindSchema>;
/** Names interpreted by the Studio host's Lucide-based type icon renderer. */
export const AssetTypeIconNames = ['image', 'audio', 'music', 'video', 'font', 'texture', 'grid-2x2', 'animation', 'clapperboard', 'effect', 'sparkles', 'live2d', 'person-standing', 'file', 'package'] as const;
export const AssetTypeDataSchema = z.strictObject({
  typeVersion: z.number().int().positive().refine(Number.isSafeInteger),
  provider: z.strictObject({ id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/), version: VersionSchema }),
  value: JsonSchema,
});
export type AssetTypeData = z.infer<typeof AssetTypeDataSchema>;

/** Serialized project catalog; executable providers remain in M09 definition/editor leases. */
export type AssetTypeDescriptor = {
  contractVersion: 1; key: AssetKind; typeVersion: number; title: string; description: string; icon: string; group?: string;
  titleKey?: string; descriptionKey?: string; messages?: Record<string, Record<string, string>>;
  schema: Json; fields: FieldSpec[]; extensions: string[]; targets: Target[]; resourceProviderKey: string | null;
  stageProviderKey?: string; capabilities: string[]; editorKey?: string; previewKey?: string; thumbnailKey?: string;
  builtinKind?: BuiltinAssetKind; resourceProviderAliases?: string[];
  filterFields?: string[];
};
export type AssetTypeCatalogEntry = { descriptor: AssetTypeDescriptor; provider: AssetTypeData['provider'] | null; count?: number; unavailable?: boolean };
export type AssetTypeEditInput = { assetId: Id; variantId: Id; expectedRevision: number; typeData: AssetTypeData };

export const ResourceCapabilitiesSchema = z.strictObject({
  resolver: z.string(), resolverVersion: VersionSchema, format: z.string(), formatVersion: z.string(),
  capabilities: z.array(z.string()),
  parameters: z.array(z.strictObject({ id: z.string(), min: finite, max: finite, default: finite })),
  motions: z.array(z.strictObject({ group: z.string(), index: count, name: z.string(), durationMs: finite.nullable() })),
  expressions: z.array(z.string()), missingFiles: z.array(RelativePathSchema),
});
export type ResourceCapabilities = z.infer<typeof ResourceCapabilitiesSchema>;

export const ProcessingSchema = z.strictObject({
  toolId: z.string(), toolVersion: z.string(), inputVariantId: IdSchema,
  settings: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('mask'), maskVariantId: IdSchema, featherPx: finite, expandPx: finite }),
    z.strictObject({ kind: z.literal('audio'), startSec: finite, endSec: finite, gainDb: finite, fadeInMs: finite, fadeOutMs: finite, loopStartSec: finite.nullable(), loopEndSec: finite.nullable(), codec: z.enum(['pcm_s16le', 'opus']).optional(), bitrateKbps: finite.positive().optional() }),
    z.strictObject({ kind: z.literal('crop'), x: finite, y: finite, width: finite, height: finite }),
    z.strictObject({ kind: z.literal('transcode'), container: z.string(), videoCodec: z.string().nullable(), audioCodec: z.string().nullable() }),
    z.strictObject({ kind: z.literal('plugin'), settings: JsonSchema }),
  ]),
});
export type Processing = z.infer<typeof ProcessingSchema>;

export const AssetVariantSchema = z.strictObject({
  id: IdSchema, parentId: IdSchema.nullable(), role: z.enum(['original', 'mask', 'transparent', 'trimmed', 'compatible', 'group']),
  files: z.array(z.strictObject({ path: RelativePathSchema, bytes: count, mime: z.string(), role: z.string() })),
  entry: RelativePathSchema,
  metadata: z.strictObject({
    width: finite.optional(), height: finite.optional(), durationSec: finite.optional(), container: z.string().optional(),
    videoCodec: z.string().optional(), audioCodec: z.string().optional(), sampleRate: finite.optional(), channels: finite.optional(),
    hasAlpha: z.boolean().optional(), hasTransparency: z.boolean().optional(), svgViewBox: z.strictObject({ x: finite, y: finite, width: finite, height: finite }).optional(),
    imageAnimation: AnimatedImageMetadataSchema.optional(),
    loop: AudioLoopSchema.optional(),
    authorDocument: z.strictObject({ documentId: IdSchema, pluginId: z.string(), contributionKey: z.string(), stateVersion: count }).optional(),
  }),
  canvas: z.strictObject({ width: finite, height: finite, offsetX: finite, offsetY: finite }).nullable(),
  processing: ProcessingSchema.nullable(),
  targets: z.strictObject({
    web: z.enum(['direct', 'converted', 'unverified']).optional(),
    windows: z.enum(['direct', 'converted', 'unverified']).optional(),
    android: z.enum(['direct', 'converted', 'unverified']).optional(),
    ios: z.enum(['direct', 'converted', 'unverified']).optional(),
  }),
  groupCapabilities: ResourceCapabilitiesSchema.nullable(),
  typeData: AssetTypeDataSchema.optional(),
});
export type AssetVariant = z.infer<typeof AssetVariantSchema>;

export const AssetSchema = z.strictObject({
  id: IdSchema, revision: RevisionSchema, name: z.string(), kind: AssetKindSchema,
  folder: z.array(z.string()), tags: z.array(z.string()), locales: z.array(z.string()),
  characterId: IdSchema.nullable(), sceneIds: z.array(IdSchema), groupId: IdSchema.nullable(),
  originalVariantId: IdSchema, activeVariantId: IdSchema, variants: z.array(AssetVariantSchema), sourceName: z.string(),
  source: z.strictObject({
    kind: z.enum(['import', 'generation', 'template', 'plugin']), description: z.string(),
    usage: z.enum(['localReview', 'redistributable', 'userConfirmed']), taskId: IdSchema.optional(), candidateId: IdSchema.optional(),
  }),
  createdAt: UtcTimeSchema, modifiedAt: UtcTimeSchema,
});
export type Asset = z.infer<typeof AssetSchema>;
export const AssetReferenceSchema = z.strictObject({
  assetId: IdSchema, owner: RefSchema, source: SourceSchema.optional(), usage: z.string(),
  required: z.boolean(), variantId: IdSchema.nullable(),
});
export type AssetReference = z.infer<typeof AssetReferenceSchema>;

/** Asset references follow the active version; variant references keep their exact version. */
export function assetReferenceTarget(ref: Ref, assets: readonly Asset[]): Pick<AssetReference, 'assetId' | 'variantId'> | null {
  if (ref.kind === 'asset') return assets.some(asset => asset.id === ref.id) ? { assetId: ref.id, variantId: null } : null;
  if (ref.kind !== 'variant') return null;
  const asset = assets.find(asset => asset.variants.some(variant => variant.id === ref.id));
  return asset ? { assetId: asset.id, variantId: ref.id } : null;
}

/** Reads literal asset identities only at positions declared by contribution fields. */
export function assetFieldReferences(value: unknown, fields: readonly FieldSpec[]): { ref: Ref; path: string[] }[] {
  const references: { ref: Ref; path: string[] }[] = [];
  const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  const visit = (value: unknown, field: FieldSpec, path: string[]) => {
    if (field.type === 'ref' && (field.refKind === 'asset' || field.refKind === 'variant') && typeof value === 'string')
      references.push({ ref: { kind: field.refKind, id: value }, path });
    else if (field.type === 'object' && record(value)) for (const child of field.children ?? []) visit(value[child.path], child, [...path, child.path]);
    else if (field.type === 'array' && field.item && Array.isArray(value)) value.forEach((item, index) => visit(item, field.item!, [...path, String(index)]));
  };
  if (record(value)) for (const field of fields) visit(value[field.path], field, [field.path]);
  return references;
}

export const ResolvedAssetSchema = z.strictObject({
  assetId: IdSchema, variantId: IdSchema, kind: AssetKindSchema, entry: RelativePathSchema,
  name: z.string().optional(),
  files: z.array(z.strictObject({ path: RelativePathSchema, bytes: count, mime: z.string() })),
  metadata: AssetVariantSchema.shape.metadata,
  canvas: AssetVariantSchema.shape.canvas,
  provider: z.string().nullable(),
  typeData: AssetTypeDataSchema.optional(),
});
export type ResolvedAsset = z.infer<typeof ResolvedAssetSchema>;

export type AssetQuery = { kind: AssetKind | null; folder: string[] | null; characterId: Id | null; sceneId: Id | null;
  locale: string | null; search: string; tags: string[]; reference: 'any' | 'used' | 'unused';
  review: 'any' | 'needsReview'; sort: 'name' | 'size' | 'modified'; direction: 'asc' | 'desc';
  offset: number; limit: number; indexRevision: Revision | null; allowedKinds?: AssetKind[]; allowedCapabilities?: string[]; typeFields?: Record<string, Json>; usage?: string | null };
export type AssetPage = { items: Asset[]; total: number; offset: number; indexRevision: Revision };
export type AssetIdsResult = { ids: Id[]; indexRevision: Revision };
export type AssetPickerContext = { projectId: Id; allowedKinds: AssetKind[]; allowedCapabilities?: string[]; characterId: Id | null; sceneId: Id | null;
  locale: string | null; currentAssetId: Id | null; currentVariantId: Id | null; tab: 'context' | 'recent' | 'all' };
export type AssetPickerResult = { items: Asset[]; current: AssetListIdentity | null; currentMissing: boolean; applied: string[];
  recentEntries: { assetId: Id; asset: Asset | null; missing: boolean; removable: boolean }[];
  missingRecentIds: Id[]; empty: 'library' | 'filter' | 'unsupported' | null };
export type AssetPickerPage = AssetPickerResult & { total: number; offset: number; indexRevision: Revision;
  rows: AssetListIdentity[] };
export type AssetPickerQuery = { context: AssetPickerContext; query: AssetQuery };
