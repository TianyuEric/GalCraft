import { z } from 'zod';
import { isId } from './identity.js';

export const IdSchema = z.string().refine(isId, 'Expected six ASCII letters/digits or a legacy v4 UUID');
export type Id = z.infer<typeof IdSchema>;

export const RevisionSchema = z.number().int().nonnegative().refine(Number.isSafeInteger);
export type Revision = z.infer<typeof RevisionSchema>;

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export function isExactVersion(value: string): boolean {
  const match = semver.exec(value);
  return match !== null && (match[4]?.split('.').every(part => !/^\d+$/.test(part) || part === '0' || !part.startsWith('0')) ?? true);
}
export const VersionSchema = z.string().refine(isExactVersion, 'Expected an exact SemVer');
export type Version = z.infer<typeof VersionSchema>;

export const TargetSchema = z.enum(['web', 'windows', 'android', 'ios']);
export type Target = z.infer<typeof TargetSchema>;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export const JsonSchema: z.ZodType<Json> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(JsonSchema), z.record(z.string(), JsonSchema),
]));
export const ScalarSchema = z.union([z.boolean(), z.number().finite(), z.string()]);
export type Scalar = z.infer<typeof ScalarSchema>;
export const RelativePathSchema = z.string().min(1).refine(
  value => !value.startsWith('/') && !/^[A-Za-z]:/.test(value) && !value.includes('\\') && !value.split('/').some(part => part === '' || part === '.' || part === '..'),
  'Expected a package-relative / path',
);
export type RelativePath = z.infer<typeof RelativePathSchema>;
export const UtcTimeSchema = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/).refine(value => !Number.isNaN(Date.parse(value)));

export const EntityKindSchema = z.enum([
  'project', 'document', 'chapter', 'scene', 'statement', 'label', 'variable', 'character',
  'asset', 'variant', 'object', 'effect', 'gallery', 'galleryDifference', 'flow', 'flowNode', 'preset', 'page',
  'component', 'style', 'task', 'candidate', 'recipe',
]);
export type EntityKind = z.infer<typeof EntityKindSchema>;
export const RefSchema = z.strictObject({ kind: EntityKindSchema, id: IdSchema });
export type Ref = z.infer<typeof RefSchema>;
export const VersionRefSchema = z.strictObject({ ref: RefSchema, revision: RevisionSchema });
export type VersionRef = z.infer<typeof VersionRefSchema>;
export const SourceSchema = z.strictObject({
  documentId: IdSchema,
  statementId: IdSchema.optional(),
  field: z.string().optional(),
  range: z.strictObject({ start: RevisionSchema, end: RevisionSchema }).refine(value => value.end >= value.start).optional(),
  revision: RevisionSchema,
});
export type Source = z.infer<typeof SourceSchema>;

export const DomainKindSchema = z.enum(['player', 'playtest', 'candidate', 'sample']);
export const DomainSchema = z.strictObject({ projectId: IdSchema, kind: DomainKindSchema, instance: z.string().min(1) })
  .refine(value => value.kind !== 'player' || value.instance === 'default', 'Player domain uses default instance');
export type Domain = z.infer<typeof DomainSchema>;

export const DependencySchema = z.strictObject({
  kind: z.enum(['engine', 'plugin', 'template']), id: z.string().min(1),
  version: VersionSchema, targets: z.array(TargetSchema), required: z.boolean(),
});
export type Dependency = z.infer<typeof DependencySchema>;
export const LockSchema = z.strictObject({
  engine: DependencySchema.refine(value => value.kind === 'engine'),
  plugins: z.array(DependencySchema.refine(value => value.kind === 'plugin')),
  template: DependencySchema.refine(value => value.kind === 'template'),
  selectedProviders: z.record(z.string(), z.string()),
  live2dRuntime: z.strictObject({
    sdkRelease: z.literal('5-r.4'), coreVersion: z.string(), motionSyncCoreVersion: z.string().nullable(),
    sourceUrl: z.string(), instructions: z.string(),
  }).optional(),
});
export type Lock = z.infer<typeof LockSchema>;
export const RestoreKeySchema = z.strictObject({ requestId: IdSchema, sessionId: IdSchema, snapshotId: IdSchema });
export type RestoreKey = z.infer<typeof RestoreKeySchema>;

export const IssueSchema = z.strictObject({
  code: z.string(), severity: z.enum(['error', 'warning', 'info']), message: z.string(),
  summary: z.string().optional(), messageKey: z.string().optional(),
  messageParams: z.record(z.string(), ScalarSchema).optional(), details: JsonSchema.optional(),
  owner: z.enum(['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12']),
  source: SourceSchema.optional(), entity: RefSchema.optional(), related: z.array(RefSchema),
  actions: z.array(z.enum(['edit', 'retry', 'compare', 'locate', 'supplyDependency', 'convert', 'chooseTarget', 'loadSave', 'returnTitle', 'cancel'])),
});
export type Issue = z.infer<typeof IssueSchema>;
export type Result<T> = { ok: true; value: T; warnings: Issue[] } | { ok: false; error: Issue; issues: Issue[] };
export function resultSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), value, warnings: z.array(IssueSchema) }),
    z.strictObject({ ok: z.literal(false), error: IssueSchema, issues: z.array(IssueSchema) }),
  ]);
}
export const RequestContextSchema = z.strictObject({ requestId: IdSchema, projectId: IdSchema.optional(), sessionId: IdSchema.optional() });
export type RequestContext = z.infer<typeof RequestContextSchema>;
export type Operation<T> = {
  operationId: Id; state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase: string; completed?: number; total?: number; result?: Result<T>;
};
export function operationSchema<T extends z.ZodType>(value: T) {
  return z.strictObject({
    operationId: IdSchema, state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
    phase: z.string(), completed: z.number().finite().optional(), total: z.number().finite().optional(),
    result: resultSchema(value).optional(),
  });
}
export const CancelResultSchema = z.strictObject({
  local: z.enum(['stopped', 'alreadyFinished', 'commitInProgress']),
  remote: z.enum(['notApplicable', 'confirmed', 'unknown', 'unsupported']),
});
export type CancelResult = z.infer<typeof CancelResultSchema>;
