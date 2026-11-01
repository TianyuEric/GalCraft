import type { ProductionOperationSnapshot } from '@galcraft/contracts';
import { CreationRecipeSchema, RecipeUsageSchema } from './schema.js';
import type { CreationRecipe } from './schema.js';
export { localizeRecipe, OfficialRecipeMessages } from './localization.js';

/** Plugin-owned presets reuse recipe copy, export, persistence and execution planning. */
export function operationRecipes(operations: readonly ProductionOperationSnapshot[]): CreationRecipe[] {
  return operations.flatMap(snapshot => {
    if (!snapshot.provider || snapshot.definition.adoption.kind !== 'asset') return [];
    const uses = snapshot.definition.adoption.usages.filter(usage => RecipeUsageSchema.safeParse(usage).success) as CreationRecipe['uses'];
    if (!uses.length) return [];
    return (snapshot.definition.presets ?? []).map(preset => CreationRecipeSchema.parse({
      schemaVersion: 1, id: preset.id, revision: snapshot.version, scope: 'official', projectId: null,
      name: preset.name, description: preset.description, purposes: [snapshot.id], uses,
      systemPrompt: '', taskTemplate: '', outputGuidance: '', contextDefaults: [], parameters: [], examples: [],
      operationSnapshot: snapshot, production: { operation: snapshot.id, executor: 'connection', protocol: 'plugin',
        defaults: structuredClone(preset.defaults), parameters: [], ...(snapshot.definition.workflow ? { workflow: snapshot.definition.workflow } : {}) },
      createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z',
    }));
  });
}
