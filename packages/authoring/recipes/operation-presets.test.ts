import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { ProductionOperationSnapshot } from '@galcraft/contracts';
import { ProductionOperationCatalog } from '../production/operations.js';
import { RecipeLibrary } from './library.js';
import { OfficialRecipes } from './official.js';
import { resolveProductionFields } from '../production/draft.js';
import type { FormVariant } from '../production/types.js';

const operation: ProductionOperationSnapshot = { id: 'org.example.presets/render', version: 1, provider: { id: 'org.example.presets', version: '0.1.0' }, definition: {
  contractVersion: 1, id: 'org.example.presets/render', version: 1, title: 'Editable score', description: '', purpose: 'org.example.presets/render', providerKey: 'org.example.presets/provider',
  fields: [{ path: 'score', label: 'Score', description: '', type: 'object', nullable: false, required: true, default: { tracks: [] }, unit: 'none', group: 'basic', summary: true, keywords: [] }], inputSchema: true,
  inputs: [], outputs: [{ key: 'audio', type: 'audio', required: true, multiple: false, mimeTypes: ['audio/wav'] }], capabilities: { query: false, refetch: false, cancelPerTask: true, resume: false },
  adoption: { kind: 'asset', assetKind: 'audio', usages: ['bgm'] }, presets: [{ id: 'PrsOne', name: 'Quiet score', description: 'A complete editable starting score', defaults: { score: { tracks: [{ name: 'Piano', notes: [60, 64] }] } } }],
} };

it('lists, copies, exports and imports plugin presets with structured source and exact operation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-presets-'));
  try {
    let available = [operation];
    const library = await RecipeLibrary.open(directory, null, undefined, async () => available);
    const scheme = (await library.listRecipes()).find(recipe => recipe.id === 'PrsOne')!;
    expect(scheme.production?.operation).toBe(operation.id);
    expect(scheme.production?.defaults.score).toEqual(operation.definition.presets![0]!.defaults.score);
    const fields = resolveProductionFields({ fields: { score: { tracks: [] } }, parameterOverrides: {} } as unknown as FormVariant, scheme);
    expect(fields.score).toEqual(scheme.production?.defaults.score);
    expect(fields.score).not.toBe(scheme.production?.defaults.score);
    const copied = await library.copyRecipe({ recipeId: scheme.id, sourceScope: 'official', scope: 'personal', projectId: null });
    if (!copied.ok) throw copied.error;
    expect(copied.value.id).not.toBe(scheme.id);
    const destinationPath = join(directory, 'presets.galrecipe.json');
    expect((await library.exportRecipes({ recipeIds: [scheme.id], destinationPath })).ok).toBe(true);
    const exported = JSON.parse(await readFile(destinationPath, 'utf8'));
    expect(exported.recipes[0].operationSnapshot.provider).toEqual(operation.provider);
    const plan = await library.planRecipeImport({ filePath: destinationPath, destination: 'personal', projectId: null });
    if (!plan.ok) throw plan.error;
    expect(plan.value.recipes[0]!.production?.defaults).toEqual(scheme.production?.defaults);
    available = [];
    expect(await library.getRecipe(scheme.id, 'official')).toBeNull();
    expect((await library.getRecipe(copied.value.id, 'personal'))?.operationSnapshot?.provider).toEqual(operation.provider);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('keeps frozen execution compatible when only starting schemes are added', () => {
  const frozen = structuredClone(operation); delete frozen.definition.presets;
  expect(new ProductionOperationCatalog([operation]).resolve(operation.id, frozen)).toEqual(frozen);
  const changed = structuredClone(operation); changed.definition.outputs[0]!.mimeTypes = ['audio/mpeg'];
  expect(() => new ProductionOperationCatalog([changed]).resolve(operation.id, frozen)).toThrow('The operation definition differs');
  expect(OfficialRecipes.some(recipe => ['Tone.js 编曲', 'NovelAI 图像'].includes(recipe.name))).toBe(false);
});
