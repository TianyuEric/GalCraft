import { z } from 'zod';
import { DependencySchema, IdSchema, IssueSchema, JsonSchema, RelativePathSchema, SourceSchema, TargetSchema, VersionRefSchema, VersionSchema } from './common.js';
import type { Dependency, Issue, Ref, Version } from './common.js';
import { EntryMappingSchema, PositionSchema } from './runtime.js';
import { ReleaseSignatureSchema, WindowsSigningSchema } from './release-identity.js';

export const BuildInputSchema = z.strictObject({
  projectId: IdSchema, target: TargetSchema, outputDirectory: z.string().min(1),
  releaseVersion: VersionSchema, snapshotId: IdSchema, savedVersions: z.array(VersionRefSchema),
  keepAssets: z.array(IdSchema), platformPolicy: z.record(z.string(), z.enum(['optionalSkip', 'required'])),
  font: z.strictObject({ mode: z.enum(['full', 'subsetStatic']), fallbackAssetId: IdSchema.nullable() }),
  oldSaveFiles: z.array(z.string()), entryMappings: z.array(EntryMappingSchema),
  windowsSigning: WindowsSigningSchema.optional(),
  targetBuilder: z.strictObject({ key: z.string().min(1), pluginId: z.string().min(1), version: VersionSchema }).optional(),
  targetOptions: JsonSchema.optional(),
  live2d: z.strictObject({ purpose: z.enum(['localTest', 'distribution']), licenseConfirmed: z.boolean() }).optional(),
});
export type BuildInput = z.infer<typeof BuildInputSchema>;
export const TargetCapabilitySchema = z.strictObject({
  provider: z.string(), feature: z.string(), target: TargetSchema,
  treatment: z.enum(['native', 'converted', 'skipped', 'blocked']), reason: z.string(),
  sources: z.array(SourceSchema), required: z.boolean(),
});
export type TargetCapability = z.infer<typeof TargetCapabilitySchema>;
export const PackageFileSchema = z.strictObject({ path: RelativePathSchema, size: z.number().int().nonnegative(), source: z.string(),
  role: z.enum(['runtime', 'snapshot', 'asset', 'template', 'plugin', 'license', 'instructions']) });
export type PackageFile = z.infer<typeof PackageFileSchema>;
const RuntimeFileSchema = z.strictObject({ path: RelativePathSchema, bytes: z.number().int().nonnegative() });
export const CubismRuntimeManifestSchema = z.strictObject({ schemaVersion: z.literal(1), sdkRelease: z.literal('5-r.4'),
  frameworkVersion: z.string(), coreVersion: z.string(), sourceUrl: z.string(), entry: RelativePathSchema,
  coreFiles: z.array(RuntimeFileSchema), frameworkFiles: z.array(RuntimeFileSchema),
  notices: z.array(RelativePathSchema), redistributableFiles: z.array(RelativePathSchema),
  motionSync: z.strictObject({ componentRelease: z.literal('5-r.2'), coreVersion: z.string(), files: z.array(RuntimeFileSchema),
    notices: z.array(RelativePathSchema), redistributableFiles: z.array(RelativePathSchema) }).nullable(),
  verifiedTargets: z.array(TargetSchema) });
export type CubismRuntimeManifest = z.infer<typeof CubismRuntimeManifestSchema>;
export const ReleaseManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), packageType: z.literal('game'), projectId: IdSchema, name: z.string(),
  version: VersionSchema, engineVersion: VersionSchema, target: TargetSchema, builtAt: z.string(),
  entry: RelativePathSchema, snapshot: RelativePathSchema, dependencies: z.array(DependencySchema),
  resources: z.array(z.strictObject({ assetId: IdSchema, variantId: IdSchema, files: z.array(RelativePathSchema), mime: z.string(), bytes: z.number().int().nonnegative() })),
  template: z.strictObject({ id: z.string(), version: VersionSchema, config: RelativePathSchema, css: RelativePathSchema }),
  capabilities: z.array(TargetCapabilitySchema), entryMappings: z.array(EntryMappingSchema),
  live2dRuntime: CubismRuntimeManifestSchema.optional(),
  files: z.array(z.strictObject({ path: RelativePathSchema, size: z.number().int().nonnegative() })),
  helpVersion: z.string(), releaseNotes: z.string(),
  signature: ReleaseSignatureSchema.optional(),
});
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
export const TargetSigningSchema=z.strictObject({mode:z.enum(['test','author','notApplied']),identity:z.string().nullable(),status:z.enum(['signed','notApplied'])});
export type TargetSigning=z.infer<typeof TargetSigningSchema>;
export const BuildReceiptSchema = z.strictObject({ projectId: IdSchema, releaseVersion: VersionSchema,
  target: TargetSchema, outputDirectory: z.string(), entry: z.string(),
  handoff: z.strictObject({ path: z.string(), kind: z.enum(['directory', 'archive', 'file']) }), instructionsPath: z.string(),
  artifacts: z.array(z.strictObject({ path: z.string(), kind: z.enum(['apk', 'aab', 'androidProject', 'xcodeProject', 'archive']), bytes: z.number().int().nonnegative() })).optional(),
  targetSigning:TargetSigningSchema.optional(),
  localTest: z.strictObject({ result: z.enum(['passed', 'failed', 'notExecuted']), evidencePaths: z.array(z.string()) }),
  signature: ReleaseSignatureSchema.optional(),
});
export type BuildReceipt = z.infer<typeof BuildReceiptSchema>;
export type BuildPlanSummary = { planId: string; input: BuildInput; issues: z.infer<typeof IssueSchema>[]; capabilityResults: TargetCapability[] };
export const StateCompatibilitySchema = z.strictObject({
  source: z.strictObject({ file: z.string(), kind: z.enum(['save', 'flowEntry']), id: IdSchema }),
  fromRelease: VersionSchema, toRelease: VersionSchema, result: z.enum(['readable', 'mapped', 'incompatible']),
  position: PositionSchema, issues: z.array(IssueSchema),
  conversions: z.array(z.strictObject({ provider: z.string(), from: z.string(), to: z.string() })),
  longTermBasis: z.enum(['provided', 'projectInitial']),
});
export type StateCompatibility = z.infer<typeof StateCompatibilitySchema>;
export const CompatibilityReportSchema = z.strictObject({ projectId: IdSchema, release: VersionSchema,
  samples: z.array(StateCompatibilitySchema), testedAt: z.string(), target: TargetSchema,
  fileIssues: z.array(z.strictObject({ file: z.string(), issues: z.array(IssueSchema) })), missingSamples: z.array(z.string()),
});
export type CompatibilityReport = z.infer<typeof CompatibilityReportSchema>;
export const UpgradeInputSchema = z.strictObject({ projectId: IdSchema, operationId: IdSchema.optional(), toVersion: VersionSchema,
  expected: z.array(VersionRefSchema), representativeSaves: z.array(z.string()) });
export type UpgradeInput = z.infer<typeof UpgradeInputSchema>;
export type UpgradeValidation = { validatedAt: string; sourceVersions: z.infer<typeof VersionRefSchema>[];
  checks: { kind: 'dsl' | 'template' | 'plugin' | 'resource' | 'save' | 'playtest'; target: z.infer<typeof TargetSchema>;
    result: 'pass' | 'fail' | 'notRun'; issues: z.infer<typeof IssueSchema>[] }[] };
export type PluginChange = {
  pluginId: string; from: Version | null; to: Version | null; affected: Ref[]; savedData: string[];
  dependencies: Dependency[];
  conversions: { domain: 'document' | 'progress' | 'longTerm'; from: number; to: number; available: boolean }[];
  issues: Issue[];
};
export type UpgradePlan = { id: string; from: string; to: string; base: z.infer<typeof VersionRefSchema>[];
  originalCopy: string; workingCopy: string; changes: { file: string; description: string; converted: boolean }[];
  dependencyChanges: PluginChange[]; validation: UpgradeValidation | null };
