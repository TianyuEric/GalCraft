import type { Purpose } from '@galcraft/contracts';
import type { RecipeUsage } from '../recipes/schema.js';
import type { FormVariant, ProductionFormDraft } from './types.js';
import type { CreationRecipe } from '../recipes/schema.js';

export type ProductionOperation = import('@galcraft/contracts').ProductionOperationDefinition['id'];
export type ProductionOrigin = { page: string; sceneId: string | null; statementId: string | null; statementIds?: string[]; pageIds: string[]; componentIds: string[] };
export type SpeechLine = { id: string; statementId: string | null; sceneId: string | null; characterId: string | null; original: string; text: string; language: string; voiceId: string | null; selected: boolean; fields?: Record<string, import('@galcraft/contracts').Json>; references?: import('./types.js').MediaInput[]; connectionId?: string; model?: string };

export function defaultOperation(usage: RecipeUsage): ProductionOperation {
  if (usage === 'script') return 'script';
  if (usage === 'voice') return 'speech';
  if (usage === 'bgm') return 'music';
  if (usage === 'difference') return 'difference';
  if (['background', 'figure', 'cg', 'ui'].includes(usage)) return 'image';
  throw new Error(`未知制作用途：${usage}`);
}
export function operationPurpose(operation: ProductionOperation): Purpose {
  if (operation.includes('/')) return operation as import('@galcraft/contracts').ExtensionOperationId;
  if (['image', 'difference', 'speech', 'music'].includes(operation)) return operation as Purpose;
  if (['script', 'performance', 'discuss', 'imagePrompt', 'novelaiPrompt', 'differencePrompt', 'speechText', 'musicPrompt', 'uiPlan', 'uiPatch', 'svg'].includes(operation)) return 'text';
  throw new Error(`未知制作操作：${operation}`);
}
/** Missing operation means a legacy draft. Preserve what it would have executed. */
export function variantOperation(variant: FormVariant, usage: RecipeUsage): ProductionOperation {
  return variant.operation ?? (variant.recipe?.purpose === 'script' ? variant.fields.creationMode === 'performance' ? 'performance' : variant.fields.creationMode === 'discuss' ? 'discuss' : 'script' : variant.recipe?.purpose) ?? defaultOperation(usage);
}
export function normalizeProductionDraft(draft: ProductionFormDraft): ProductionFormDraft {
  for (const [usage, variant] of Object.entries(draft.variants)) if (variant && !variant.operation) {
    variant.operation = variantOperation(variant, usage as RecipeUsage);
    variant.parameterOverrides ??= structuredClone(variant.fields);
  }
  return draft;
}
export function resolveProductionFields(variant: FormVariant, scheme: CreationRecipe | null, preset: CreationRecipe | null = null) {
  return resolveProductionParameters(variant, scheme, preset).fields;
}
export function resolveProductionParameters(variant: FormVariant, scheme: CreationRecipe | null, preset: CreationRecipe | null = null) {
  const fields = structuredClone(variant.fields);
  const sources: Record<string, 'operation' | 'scheme' | 'preset' | 'input' | 'override'> = Object.fromEntries(Object.keys(fields).map(key => [key, 'operation']));
  if (scheme?.operationSnapshot?.provider) for (const [key, value] of Object.entries(scheme.production?.defaults ?? {})) {
    fields[key] = structuredClone(value); sources[key] = 'scheme';
  }
  for (const parameter of scheme?.production?.parameters ?? []) {
    const key = parameter.key;
    const fromPreset = preset?.parameterPreset && Object.hasOwn(preset.parameterPreset.values, key);
    const fromScheme = Object.hasOwn(scheme!.production!.defaults, key);
    fields[key] = structuredClone(fromPreset ? preset!.parameterPreset!.values[key]! : fromScheme ? scheme!.production!.defaults[key]! : parameter.defaultValue);
    sources[key] = fromPreset ? 'preset' : fromScheme ? 'scheme' : 'operation';
  }
  for (const key of variant.explicitFields ?? []) if (Object.hasOwn(variant.fields, key)) { fields[key] = structuredClone(variant.fields[key]!); sources[key] = 'input'; }
  for (const [key, value] of Object.entries(variant.parameterOverrides ?? {})) { fields[key] = structuredClone(value); sources[key] = 'override'; }
  return { fields, sources };
}
export function speechLines(variant: FormVariant): SpeechLine[] {
  return Array.isArray(variant.fields.speechLines) ? variant.fields.speechLines as unknown as SpeechLine[] : [];
}
