import { z } from 'zod';
import { IdSchema, IssueSchema, JsonSchema, RevisionSchema, ScalarSchema, UtcTimeSchema, VersionRefSchema, ProductionOperationIdSchema, ProductionOperationSnapshotSchema, ExtensionOperationIdSchema } from '@galcraft/contracts';
import type { WorkflowBinding } from '../production/types.js';

export const BuiltinRecipePurposeSchema = z.enum([
  'script', 'imagePrompt', 'novelaiPrompt', 'differencePrompt', 'speechText', 'musicPrompt', 'uiPlan', 'uiPatch', 'svg',
]);
export const RecipePurposeSchema = z.union([BuiltinRecipePurposeSchema, ExtensionOperationIdSchema]);
export type RecipePurpose = z.infer<typeof RecipePurposeSchema>;
export const RecipeUsageSchema = z.enum([
  'script', 'figure', 'difference', 'background', 'cg', 'voice', 'bgm', 'ui', 'animation',
]);
export type RecipeUsage = z.infer<typeof RecipeUsageSchema>;
export const RecipeContextKindSchema = z.enum([
  'instruction', 'setting', 'character', 'script', 'media', 'ui', 'style', 'assetCatalog',
]);
export type RecipeContextKind = z.infer<typeof RecipeContextKindSchema>;
export const RecipeScopeSchema = z.enum(['official', 'personal', 'project']);
export type RecipeScope = z.infer<typeof RecipeScopeSchema>;

export const RecipeParameterSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/), label: z.string().min(1), help: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'enum']), defaultValue: ScalarSchema,
  choices: z.array(z.string()), min: z.number().finite().nullable(), max: z.number().finite().nullable(),
}).superRefine((value, context) => {
  const { type, defaultValue, choices, min, max } = value;
  if (type === 'enum') {
    if (!choices.length || new Set(choices).size !== choices.length ||
      typeof defaultValue !== 'string' || !choices.includes(defaultValue))
      context.addIssue({ code: 'custom', path: ['choices'], message: 'Enum choices and default must agree' });
  } else if (choices.length) context.addIssue({ code: 'custom', path: ['choices'], message: 'Only enum accepts choices' });
  if (type === 'number') {
    if (typeof defaultValue !== 'number' || (min !== null && defaultValue < min) ||
      (max !== null && defaultValue > max) || (min !== null && max !== null && min > max))
      context.addIssue({ code: 'custom', path: ['defaultValue'], message: 'Number default is outside its limits' });
  } else if (min !== null || max !== null) context.addIssue({ code: 'custom', path: ['min'], message: 'Only number accepts limits' });
  if (type === 'string' && typeof defaultValue !== 'string')
    context.addIssue({ code: 'custom', path: ['defaultValue'], message: 'Expected a string default' });
  if (type === 'boolean' && typeof defaultValue !== 'boolean')
    context.addIssue({ code: 'custom', path: ['defaultValue'], message: 'Expected a boolean default' });
});
export type RecipeParameter = z.infer<typeof RecipeParameterSchema>;

/** Media schemes reuse the library identity, persistence, copy and export path. */
export const ProductionSchemeSchema = z.strictObject({
  operation: ProductionOperationIdSchema,
  executor: z.enum(['connection', 'planned']),
  protocol: z.string().nullable(),
  defaults: z.record(z.string(), JsonSchema),
  parameters: z.array(RecipeParameterSchema),
  workflow: z.custom<WorkflowBinding>(value => !!value && typeof value === 'object' && 'apiGraph' in value && 'inputs' in value && 'outputs' in value, 'Expected a ComfyUI API graph and mappings').optional(),
});
export type ProductionScheme = z.infer<typeof ProductionSchemeSchema>;
export const ParameterPresetSchema = z.strictObject({
  recipeId: IdSchema, recipeScope: RecipeScopeSchema, recipeRevision: RevisionSchema,
  values: z.record(z.string(), ScalarSchema.nullable()),
});
export type ParameterPreset = z.infer<typeof ParameterPresetSchema>;

export const CreationRecipeSchema = z.strictObject({
  schemaVersion: z.literal(1), id: IdSchema, revision: RevisionSchema,
  scope: RecipeScopeSchema, projectId: IdSchema.nullable(), name: z.string().trim().min(1),
  description: z.string(), purposes: z.array(RecipePurposeSchema).nonempty(),
  scriptMode: z.enum(['write', 'performance']).optional(),
  uses: z.array(RecipeUsageSchema).nonempty(), systemPrompt: z.string(),
  taskTemplate: z.string(), outputGuidance: z.string(),
  contextDefaults: z.array(RecipeContextKindSchema), parameters: z.array(RecipeParameterSchema),
  examples: z.array(z.strictObject({ input: z.string(), output: z.string() })),
  production: ProductionSchemeSchema.optional(),
  operationSnapshot: ProductionOperationSnapshotSchema.optional(),
  parameterPreset: ParameterPresetSchema.optional(),
  createdAt: UtcTimeSchema, updatedAt: UtcTimeSchema,
}).superRefine((value, context) => {
  if (value.production && value.parameterPreset) context.addIssue({ code: 'custom', path: ['parameterPreset'], message: 'A parameter preset is separate from its production scheme' });
  for (const parameter of value.production?.parameters ?? []) {
    const v = value.production!.defaults[parameter.key];
    if (v === null || v === undefined) continue;
    if (parameter.type === 'number' && (typeof v !== 'number' || parameter.min !== null && v < parameter.min || parameter.max !== null && v > parameter.max) || parameter.type === 'enum' && (typeof v !== 'string' || !parameter.choices.includes(v)) || parameter.type === 'boolean' && typeof v !== 'boolean' || parameter.type === 'string' && typeof v !== 'string') context.addIssue({ code: 'custom', path: ['production', 'defaults', parameter.key], message: 'Default must satisfy the adjustable parameter type and limits' });
  }
  if ((value.scope === 'project') !== (value.projectId !== null))
    context.addIssue({ code: 'custom', path: ['projectId'], message: 'Project scope requires its project ID' });
  for (const key of ['purposes', 'uses', 'contextDefaults'] as const) {
    if (new Set(value[key]).size !== value[key].length)
      context.addIssue({ code: 'custom', path: [key], message: 'Values must be unique' });
  }
  const keys = value.parameters.map(parameter => parameter.key);
  if (new Set(keys).size !== keys.length)
    context.addIssue({ code: 'custom', path: ['parameters'], message: 'Parameter keys must be unique' });
  for (const field of ['systemPrompt', 'taskTemplate'] as const) {
    const template = value[field];
    for (const match of template.matchAll(/\{\{([^{}]*)\}\}/g)) {
      const key = match[1]!;
      if (key !== 'instruction' && key !== 'context' && key !== 'capabilities' &&
        !(key.startsWith('parameters.') && keys.includes(key.slice('parameters.'.length))))
        context.addIssue({ code: 'custom', path: [field], message: `Unknown placeholder ${match[0]}` });
    }
    const residue = template.replace(/\{\{[^{}]*\}\}/g, '');
    if (residue.includes('{{') || residue.includes('}}'))
      context.addIssue({ code: 'custom', path: [field], message: 'Malformed placeholder' });
  }
});
export type CreationRecipe = z.infer<typeof CreationRecipeSchema>;

export const RecipeExportSchema = z.strictObject({
  schemaVersion: z.literal(1), recipes: z.array(CreationRecipeSchema),
});
export type RecipeExport = z.infer<typeof RecipeExportSchema>;

export const RecipeImportPlanSchema = z.strictObject({
  planId: IdSchema, recipes: z.array(CreationRecipeSchema).nonempty(),
  destination: z.enum(['personal', 'project']), projectId: IdSchema.nullable(),
  expected: z.array(VersionRefSchema), issues: z.array(IssueSchema),
}).superRefine((value, context) => {
  if ((value.destination === 'project') !== (value.projectId !== null))
    context.addIssue({ code: 'custom', path: ['projectId'], message: 'Destination and project ID disagree' });
  if (new Set(value.recipes.map(recipe => recipe.id)).size !== value.recipes.length)
    context.addIssue({ code: 'custom', path: ['recipes'], message: 'Recipe IDs must be unique' });
  for (const [index, recipe] of value.recipes.entries()) {
    if (recipe.scope !== value.destination || recipe.projectId !== value.projectId)
      context.addIssue({ code: 'custom', path: ['recipes', index], message: 'Recipe destination differs from plan' });
  }
});
export type RecipeImportPlan = z.infer<typeof RecipeImportPlanSchema>;
