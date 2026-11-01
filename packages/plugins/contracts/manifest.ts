import { RelativePathSchema, TargetSchema, VersionSchema } from '@galcraft/contracts';
import type { Target, Version } from '@galcraft/contracts';
import { validRange } from 'semver';
import { z } from 'zod';
import { StudioContributionDeclarationSchema } from './studio.js';

export const PluginIdSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/, 'Expected a publisher-scoped plugin ID');
export const ContributionKeySchema = z.string().regex(
  /^[a-z0-9]+(?:[.-][a-z0-9]+)+\/[A-Za-z_][A-Za-z0-9_-]*$/,
  'Expected pluginId/localName',
);
export const ContributionKindSchema = z.enum([
  'command', 'condition', 'document', 'tool', 'resource', 'stage', 'page', 'component', 'system', 'platform',
  'textPreparation', 'generationProvider', 'resourceProcessor', 'fieldEditor', 'publishCheck', 'targetBuilder', 'assetType', 'assetEditor', 'assetPreview', 'assetThumbnail', 'productionOperation',
]);
export type ContributionKind = z.infer<typeof ContributionKindSchema>;

const RangeSchema = z.string().min(1).refine(value => validRange(value) !== null, 'Expected a SemVer range');
const PluginDependencySchema = z.strictObject({ id: PluginIdSchema, range: RangeSchema });
const EnvironmentDependencySchema = PluginDependencySchema.extend({ targets: z.array(TargetSchema).min(1).optional() });
const ContributionDeclarationSchema = z.strictObject({
  kind: ContributionKindSchema, key: ContributionKeySchema, targets: z.array(TargetSchema).min(1), required: z.boolean(),
});
export type ContributionDeclaration = z.infer<typeof ContributionDeclarationSchema>;

export const PluginManifestSchema = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(2)]), id: PluginIdSchema, name: z.string().min(1), version: VersionSchema,
  description: z.string(), author: z.string().min(1), license: z.string().min(1), homepage: z.string().url().nullable(),
  localizations: z.record(z.string().min(1), z.strictObject({ name: z.string().min(1), description: z.string() })).optional(),
  engineRange: RangeSchema, sdkMajor: z.literal(0), targets: z.array(TargetSchema).min(1),
  dependencies: z.array(PluginDependencySchema),
  externalTools: z.array(ContributionKeySchema).optional(),
  externalRuntimeDependencies: z.array(ContributionKeySchema).optional(),
  environmentDependencies: z.strictObject({ definition: z.array(EnvironmentDependencySchema), editor: z.array(EnvironmentDependencySchema),
    services: z.array(EnvironmentDependencySchema), runtime: z.array(EnvironmentDependencySchema) }).optional(),
  entry: z.strictObject({ runtime: RelativePathSchema.nullable(), editor: RelativePathSchema.nullable(),
    definition: RelativePathSchema.nullable().optional(), services: RelativePathSchema.nullable().optional() }),
  files: z.array(z.strictObject({ path: RelativePathSchema, size: z.number().int().nonnegative().refine(Number.isSafeInteger) })),
  contributions: z.array(ContributionDeclarationSchema),
  studio: z.array(StudioContributionDeclarationSchema).optional(),
  stateVersions: z.strictObject({ document: z.number().int().nonnegative(), progress: z.number().int().nonnegative(), longTerm: z.number().int().nonnegative() }),
  native: z.array(z.strictObject({ target: TargetSchema, arch: z.enum(['x64', 'arm64']), entry: RelativePathSchema })),
}).superRefine((manifest, context) => {
  const targets = new Set<Target>(manifest.targets);
  if (targets.size !== manifest.targets.length) context.addIssue({ code: 'custom', path: ['targets'], message: 'Duplicate target' });
  const files = new Set<string>();
  for (const [index, file] of manifest.files.entries()) {
    if (files.has(file.path)) context.addIssue({ code: 'custom', path: ['files', index, 'path'], message: 'Duplicate file path' });
    files.add(file.path);
  }
  for (const [kind, path] of Object.entries(manifest.entry)) {
    if (path && !files.has(path)) context.addIssue({ code: 'custom', path: ['entry', kind], message: 'Entry absent from file list' });
  }
  const dependencies = new Set<string>();
  for (const [index, dependency] of manifest.dependencies.entries()) {
    if (dependency.id === manifest.id || dependencies.has(dependency.id)) {
      context.addIssue({ code: 'custom', path: ['dependencies', index, 'id'], message: 'Self or duplicate dependency' });
    }
    dependencies.add(dependency.id);
  }
  for (const [environment, entries] of Object.entries(manifest.environmentDependencies ?? {})) {
    const ids = new Set<string>();
    for (const [index, dependency] of entries.entries()) {
      if (dependency.id === manifest.id || ids.has(dependency.id)) context.addIssue({ code: 'custom',
        path: ['environmentDependencies', environment, index, 'id'], message: 'Self or duplicate environment dependency' });
      ids.add(dependency.id);
      for (const target of dependency.targets ?? []) if (!targets.has(target)) context.addIssue({ code: 'custom',
        path: ['environmentDependencies', environment, index, 'targets'], message: `Undeclared dependency target ${target}` });
    }
  }
  for (const [index, declaration] of manifest.contributions.entries()) {
    for (const target of declaration.targets) {
      if (!targets.has(target)) context.addIssue({ code: 'custom', path: ['contributions', index, 'targets'], message: `Undeclared target ${target}` });
    }
  }
  const studioKeys = new Set<string>();
  for (const [index, declaration] of (manifest.studio ?? []).entries()) {
    if (!declaration.key.startsWith(`${manifest.id}/`) || studioKeys.has(declaration.key))
      context.addIssue({ code: 'custom', path: ['studio', index, 'key'], message: 'Studio贡献键须属于插件且唯一' });
    studioKeys.add(declaration.key);
  }
  if (studioKeys.size && manifest.entry.editor === null)
    context.addIssue({ code: 'custom', path: ['entry', 'editor'], message: 'Studio contribution requires an editor entry' });
  if (manifest.schemaVersion === 2 && !manifest.entry.definition)
    context.addIssue({ code: 'custom', path: ['entry', 'definition'], message: 'Manifest v2 requires a DOM-free definition entry' });
  if (manifest.contributions.some(item => ['assetType', 'assetEditor', 'assetPreview', 'assetThumbnail', 'productionOperation'].includes(item.kind)) && manifest.schemaVersion !== 2)
    context.addIssue({ code: 'custom', path: ['schemaVersion'], message: 'Asset and production extensions require manifest v2' });
  if (manifest.contributions.filter(item => item.kind === 'system').length > 1)
    context.addIssue({ code: 'custom', path: ['contributions'], message: 'PLUGIN_STATE_DUPLICATE: one authoritative system per plugin' });
  const contributionKeys = new Set<string>();
  for (const [index, item] of manifest.contributions.entries()) {
    if (manifest.schemaVersion === 2 && (!item.key.startsWith(`${manifest.id}/`) || contributionKeys.has(item.key)))
      context.addIssue({ code: 'custom', path: ['contributions', index, 'key'], message: 'Contribution keys must belong to the plugin and be unique' });
    contributionKeys.add(item.key);
  }
  if (manifest.contributions.some(item => !['document', 'tool', 'fieldEditor', 'textPreparation', 'generationProvider', 'resourceProcessor', 'publishCheck', 'targetBuilder', 'assetType', 'assetEditor', 'assetPreview', 'assetThumbnail', 'productionOperation'].includes(item.kind)
    && !(item.kind === 'resource' && manifest.schemaVersion === 2 && manifest.entry.services)) && manifest.entry.runtime === null) {
    context.addIssue({ code: 'custom', path: ['entry', 'runtime'], message: 'Runtime contribution requires a runtime entry' });
  }
  if (manifest.contributions.some(item => (['tool', 'fieldEditor', 'assetEditor', 'assetPreview', 'assetThumbnail'].includes(item.kind) && !(item.kind==='tool'&&manifest.externalTools?.includes(item.key))) || item.kind === 'document' && !manifest.entry.definition) && manifest.entry.editor === null) {
    context.addIssue({ code: 'custom', path: ['entry', 'editor'], message: 'Editor contribution requires an editor entry' });
  }
  if (manifest.contributions.some(item => ['textPreparation', 'generationProvider', 'resourceProcessor', 'publishCheck', 'targetBuilder'].includes(item.kind)) && !manifest.entry.services)
    context.addIssue({ code: 'custom', path: ['entry', 'services'], message: 'Service contribution requires a services entry' });
  for(const key of manifest.externalTools??[])if(!manifest.entry.services||!manifest.contributions.some(item=>item.kind==='tool'&&item.key===key))context.addIssue({code:'custom',path:['externalTools'],message:`External tool requires a declared tool and services entry: ${key}`});
  const nativeEntries = new Set<string>();
  for (const [index, native] of manifest.native.entries()) {
    const identity = `${native.target}/${native.arch}`;
    if (nativeEntries.has(identity)) context.addIssue({ code: 'custom', path: ['native', index], message: 'Native target and architecture need a unique entry' });
    nativeEntries.add(identity);
    if (!targets.has(native.target) || native.target === 'web' || !files.has(native.entry)) {
      context.addIssue({ code: 'custom', path: ['native', index], message: 'Native entry must be listed for a native target' });
    }
  }
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
/** Resolve display text without changing the package identity or its source metadata. */
export function pluginDisplayMetadata(manifest: Pick<PluginManifest, 'name' | 'description' | 'localizations'>, locale: string): { name: string; description: string } {
  return manifest.localizations?.[locale] ?? manifest.localizations?.[locale.split('-')[0]!] ?? { name: manifest.name, description: manifest.description };
}
export type PluginDependency = { id: string; range: string };
export type PluginVersion = { id: string; version: Version };
export type PluginEnvironment = 'definition' | 'editor' | 'services' | 'runtime';
export function pluginDependencies(manifest: PluginManifest, environment: PluginEnvironment, target: Target) {
  return [...manifest.dependencies, ...(manifest.environmentDependencies?.[environment] ?? []).filter(item => !item.targets || item.targets.includes(target))];
}
