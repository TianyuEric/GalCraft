import { z } from 'zod';
import { IdSchema, IssueSchema, JsonSchema, RefSchema, RelativePathSchema, RevisionSchema, SourceSchema, VersionRefSchema } from './common.js';
import type { Id, Ref } from './common.js';

const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const PatchSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('file'), documentId: IdSchema, path: RelativePathSchema,
    before: z.string().nullable(), after: z.string().nullable() }),
  z.strictObject({ kind: z.literal('text'), documentId: IdSchema, edits: z.array(z.strictObject({ start: count, end: count, before: z.string(), after: z.string() })) }),
  z.strictObject({ kind: z.literal('json'), documentId: IdSchema, changes: z.array(z.strictObject({ path: z.string(), before: JsonSchema, after: JsonSchema, op: z.enum(['set', 'remove']) })) }),
  z.strictObject({ kind: z.literal('document'), documentId: IdSchema, op: z.enum(['create', 'delete']), before: JsonSchema.nullable(), after: JsonSchema.nullable() }),
]);
export type Patch = z.infer<typeof PatchSchema>;
export const EditInputSchema = z.strictObject({
  label: z.string(), origin: z.enum(['field', 'script', 'drag', 'batch', 'candidate', 'template', 'plugin', 'preset']),
  expected: z.array(VersionRefSchema), patches: z.array(PatchSchema), preparedAssets: z.array(IdSchema), requiredRefs: z.array(RefSchema),
});
export type EditInput = z.infer<typeof EditInputSchema>;
export const EditPlanSchema = z.strictObject({
  planId: IdSchema, input: EditInputSchema, members: z.array(IdSchema), issues: z.array(IssueSchema),
  before: z.record(IdSchema, RevisionSchema), preview: z.array(z.strictObject({ ref: RefSchema, description: z.string() })),
});
export type EditPlan = z.infer<typeof EditPlanSchema>;
export const EditReceiptSchema = z.strictObject({
  groupId: IdSchema, operationId: IdSchema, documents: z.array(VersionRefSchema), dirty: z.array(IdSchema), assetIds: z.array(IdSchema),
});
export type EditReceipt = z.infer<typeof EditReceiptSchema>;
export const UndoPlanSchema = z.strictObject({
  planId: IdSchema, requestedOperationId: IdSchema, reverseOrder: z.array(IdSchema),
  members: z.array(IdSchema), expected: z.array(VersionRefSchema), label: z.string(),
  operations: z.array(z.strictObject({ operationId: IdSchema, label: z.string(), members: z.array(IdSchema) })).optional(),
});
export type UndoPlan = z.infer<typeof UndoPlanSchema>;
export const FileConflictSchema = z.strictObject({
  path: RelativePathSchema, base: z.string().nullable(), local: z.string().nullable(), disk: z.string().nullable(),
});
export type FileConflict = z.infer<typeof FileConflictSchema>;
export const SaveObjectRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ documentId: IdSchema, kind: z.literal('document'), objectId: z.null() }),
  z.strictObject({ documentId: IdSchema, kind: z.literal('asset'), objectId: IdSchema }),
]);
export type SaveObjectRef = z.infer<typeof SaveObjectRefSchema>;
const saveObjectFields = {
  key: z.string().min(1), revision: RevisionSchema, name: z.string(), paths: z.array(RelativePathSchema),
};
export const SaveObjectSchema = z.discriminatedUnion('kind', [
  SaveObjectRefSchema.options[0].extend(saveObjectFields), SaveObjectRefSchema.options[1].extend(saveObjectFields),
]);
export type SaveObject = z.infer<typeof SaveObjectSchema>;
export const DocumentViewSchema = z.strictObject({ documentId: IdSchema, revision: RevisionSchema, savedRevision: RevisionSchema,
  format: z.enum(['dsl', 'json']), files: z.record(z.string(), z.string()), savedFiles: z.record(z.string(), z.string()), dirty: z.boolean() });
export type DocumentView = z.infer<typeof DocumentViewSchema>;
export const SaveScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('current'), documentId: IdSchema }), z.strictObject({ kind: z.literal('all') }),
  z.strictObject({ kind: z.literal('objects'), objects: z.array(SaveObjectRefSchema), expected: z.array(VersionRefSchema) }),
]);
export type SaveScope = z.infer<typeof SaveScopeSchema>;
export const SavePlanSchema = z.strictObject({
  planId: IdSchema, members: z.array(IdSchema), versions: z.array(VersionRefSchema),
  files: z.array(z.strictObject({ path: RelativePathSchema, documentId: IdSchema, oldExists: z.boolean(), newExists: z.boolean() })),
  extraDirtyMembers: z.array(IdSchema),
  objects: z.array(SaveObjectSchema), requestedObjects: z.array(z.string()),
  reasons: z.array(z.strictObject({ objectKey: z.string(), requiredBy: z.string(), kind: z.enum(['associated-edit', 'reference']), ref: RefSchema.optional() })),
  preview: z.array(DocumentViewSchema),
});
export type SavePlan = z.infer<typeof SavePlanSchema>;
export const SaveReceiptSchema = z.strictObject({ transactionId: IdSchema, saved: z.array(VersionRefSchema), remainingDirty: z.array(IdSchema) });
export type SaveReceipt = z.infer<typeof SaveReceiptSchema>;
export const FileTxSchema = z.strictObject({
  schemaVersion: z.literal(1), id: IdSchema, projectId: IdSchema, phase: z.enum(['prepared', 'installing', 'committed', 'rollingBack']),
  members: z.array(z.strictObject({ path: RelativePathSchema, documentId: IdSchema, revision: RevisionSchema, oldExists: z.boolean(), newExists: z.boolean(), installed: z.boolean() })),
});
export type FileTx = z.infer<typeof FileTxSchema>;
export const DiscardScopeSchema = z.strictObject({ documentId: IdSchema, paths: z.array(z.string().startsWith('/data/')).optional(), objectId: IdSchema.optional(),
  objects: z.array(SaveObjectRefSchema).optional(), expected: z.array(VersionRefSchema).optional() });
export type DiscardScope = z.infer<typeof DiscardScopeSchema>;
export type DiscardPlan = { planId: Id; scope: DiscardScope; members: Id[]; expected: z.infer<typeof VersionRefSchema>[];
  expanded: { documentId: Id; paths: string[] }[]; preview: DocumentView[]; requestedObjects?: string[]; objects?: SaveObject[];
  reasons?: { objectKey: string; requiredBy: string; kind: 'reference' | 'recovered-edit'; ref?: Ref }[] };

export const PluginDocumentInstanceSchema = z.strictObject({
  documentId: IdSchema, revision: RevisionSchema, pluginId: z.string().min(1), contributionKey: z.string().min(1),
  name: z.string(), data: JsonSchema, stateVersion: count,
});
export type PluginDocumentInstance = z.infer<typeof PluginDocumentInstanceSchema>;

/** Read a caller-selected working or saved document projection without changing it. */
export function readPluginDocumentInstances(documents: { documentId: Id; revision: number; files: Record<string, string> }[]): PluginDocumentInstance[] {
  const instances: PluginDocumentInstance[] = [];
  for (const document of documents) for (const [path, raw] of Object.entries(document.files)) {
    if (!path.startsWith('plugins/') || !path.endsWith('.json')) continue;
    const envelope = JSON.parse(raw), parts = path.split('/'), metadata = envelope.pluginDocument;
    const pluginId = metadata?.pluginId ?? parts[1];
    const legacyName = parts[2] === 'documents' ? parts[3] : parts[2];
    const contributionKey = metadata?.contributionKey ?? `${pluginId}/${legacyName!.replace(/\.json$/, '')}`;
    instances.push(PluginDocumentInstanceSchema.parse({ documentId: document.documentId, revision: document.revision,
      pluginId, contributionKey, name: metadata?.name ?? contributionKey.split('/')[1], data: envelope.data,
      stateVersion: metadata?.stateVersion ?? 1 }));
  }
  return instances;
}
