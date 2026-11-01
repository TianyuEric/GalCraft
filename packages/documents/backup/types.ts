import { z } from 'zod';
import { DependencySchema, IdSchema, IssueSchema, LockSchema, RefSchema, RelativePathSchema, UtcTimeSchema, VersionRefSchema, VersionSchema } from '@galcraft/contracts';
import type { AssetKind, AssetTypeData, AssetVariant, Ref, Dependency, Id, Issue, Json, Lock, Project, Result, VersionRef, CommandSpec, ProjectPackage, BackupOptions, RestoreOptions, WorkReadiness, RestoreReceipt } from '@galcraft/contracts';
export type { ProjectPackage, BackupOptions, RestoreOptions, WorkReadiness, RestoreReceipt } from '@galcraft/contracts';
import type { ComponentDefinition, DocumentContribution } from '@galcraft/plugins/contracts';
import type { WorkingDocument, ProjectSession } from '@galcraft/documents';

export const ProjectPackageSchema = z.strictObject({ format: z.literal('galcraft-project'), schemaVersion: z.literal(1), packageId: IdSchema,
  projectId: IdSchema, releaseVersion: VersionSchema, engineVersion: VersionSchema, createdAt: UtcTimeSchema,
  documents: z.array(VersionRefSchema), dependencies: LockSchema,
  files: z.array(z.strictObject({ path: RelativePathSchema, bytes: z.number().int().nonnegative(), role: z.enum(['document', 'asset', 'style', 'dependency']), owner: RefSchema.nullable() })),
  externalDependencies: z.array(z.strictObject({ dependency: DependencySchema, included: z.boolean(), reason: z.string(), sourceUrl: z.string().nullable(), instructions: z.string() })),
});
export type RestorePlan = { planId: Id; packageId: Id; sourceProjectId: Id; resultProjectId: Id; stagingDirectory: string; destination: string; missing: Issue[]; idMap: Record<Id, Id>; previousDirectory: string | null;
  options: RestoreOptions; operationDirectory: string; sourceDirectory: string; manifest: ProjectPackage | null; projectName?: string; rewritten: boolean; phase: 'prepared' | 'oldMoved' | 'installed' | 'committed' | 'cancelled'; registryBefore: Json | null; readiness: WorkReadiness | null };
export type DocumentIdentityProvider = { schema: z.ZodType; ownedIds?: (data: any) => Id[]; rewrite?: (data: any, mapping: Record<Id, Id>) => any };
export type BackupProviders = {
  assetTypes?: {
    references(kind: AssetKind, data?: AssetTypeData): Result<Ref[]>;
    rewrite(kind: AssetKind, data: AssetTypeData | undefined, mapping: Record<Id, Id>): Result<AssetTypeData | undefined>;
    rewriteFile(kind: AssetKind, variant: AssetVariant, path: string, bytes: Uint8Array, mapping: Record<Id, Id>): Result<Uint8Array>;
  };
  collectAssets(index: any): { files: { path: string; bytes: number }[]; issues: Issue[] };
  dependencies(lock: Lock): Promise<{ dependency: Dependency; directory: string | null; redistribute: boolean; reason: string; sourceUrl: string | null; instructions: string }[]>;
  validateDependencies(project: Project, lock: Lock, bundled: string, documents?: WorkingDocument[]): Promise<Issue[]>;
  pluginDocuments: (path: string) => DocumentContribution | null;
  documentProvider?: (path: string) => DocumentIdentityProvider | null;
  pluginCommands?: () => CommandSpec[];
  pluginComponents?: () => ComponentDefinition[];
  validate?: (directory: string, documents: WorkingDocument[]) => Promise<Issue[]>;
  generationReadiness?: (projectId: Id) => WorkReadiness['generation'];
  openSession?: (directory: string) => ProjectSession | null;
  registry: { capture(): Promise<Json>; register(receipt: RestoreReceipt): Promise<void>; restore(previous: Json): Promise<void> };
};
export const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export function problem(code: string, message: string): Issue { return IssueSchema.parse({ code, message, severity: 'error', owner: 'M02', related: [], actions: ['retry', 'supplyDependency'] }); }
export function fail<T = never>(code: string, message: string): Result<T> { const error = problem(code, message); return { ok: false, error, issues: [error] }; }
export function value<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value; }
