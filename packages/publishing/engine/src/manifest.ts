import { z } from 'zod';
import { RelativePathSchema, TargetSchema, VersionSchema } from '@galcraft/contracts';

const natural = z.number().int().nonnegative().refine(Number.isSafeInteger);
const positive = natural.positive();
const packageFile = z.strictObject({ path: RelativePathSchema, size: natural });
const conversion = z.strictObject({ from: VersionSchema, to: VersionSchema, entry: RelativePathSchema });

export const EngineManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.literal('galcraft'),
  version: VersionSchema,
  targets: z.array(TargetSchema).min(1),
  projectSchemaVersions: z.array(positive).min(1),
  saveSchemaVersions: z.array(positive).min(1),
  sdkMajor: natural,
  dslVersion: z.string().min(1),
  templateSchemaVersions: z.array(positive).min(1),
  entries: z.strictObject({
    compiler: RelativePathSchema,
    playerWeb: RelativePathSchema,
    playerWindows: RelativePathSchema,
    preview: RelativePathSchema.optional(),
    live2d: RelativePathSchema.optional(),
    upgrade: RelativePathSchema.nullable(),
  }),
  host: z.strictObject({
    electron: VersionSchema,
    supportedWindows: z.array(z.string().min(1)),
    supportedBrowsers: z.array(z.strictObject({ name: z.string().min(1), minimumMajor: positive })),
  }),
  conversions: z.array(conversion),
  files: z.array(packageFile).min(1),
  releaseNotes: RelativePathSchema,
}).superRefine((manifest, context) => {
  const filePaths = new Set<string>();
  for (const file of manifest.files) {
    if (filePaths.has(file.path)) {
      context.addIssue({ code: 'custom', path: ['files'], message: `Duplicate package file: ${file.path}` });
    }
    filePaths.add(file.path);
  }
  const required = [manifest.entries.compiler, manifest.entries.playerWeb,
    manifest.entries.playerWindows, manifest.entries.upgrade, manifest.releaseNotes,
    ...(manifest.entries.preview ? [manifest.entries.preview] : []), ...(manifest.entries.live2d ? [manifest.entries.live2d] : []), ...manifest.conversions.map(item => item.entry)];
  for (const entry of required) {
    if (entry !== null && !filePaths.has(entry)) {
      context.addIssue({ code: 'custom', path: ['files'], message: `Undeclared entry: ${entry}` });
    }
  }
  if (new Set(manifest.targets).size !== manifest.targets.length) {
    context.addIssue({ code: 'custom', path: ['targets'], message: 'Duplicate target' });
  }
  for (const item of manifest.conversions) {
    if (item.to !== manifest.version || item.from === item.to) {
      context.addIssue({ code: 'custom', path: ['conversions'], message: 'Conversion must lead from another version to this engine' });
    }
  }
});

export type EngineManifest = z.infer<typeof EngineManifestSchema>;
