import { expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { RecipeLibrary } from './library.js';
import { OfficialRecipes } from './official.js';
import { localizeRecipe } from './localization.js';

it('freezes the displayed official copy in author scope and preserves its original execution data', async () => {
  const directory = fileURLToPath(new URL('../../../tmp/testing/d28-recipe-localization/', import.meta.url));
  await mkdir(directory, { recursive: true });
  try {
    const library = await RecipeLibrary.open(directory), source = OfficialRecipes.find(recipe => recipe.production?.operation === 'image')!;
    const result = await library.copyRecipe({ recipeId: source.id, sourceScope: 'official', scope: 'personal', projectId: null, locale: 'ja' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.name).toBe(localizeRecipe(source, 'ja').name);
    expect(result.value.description).toBe(localizeRecipe(source, 'ja').description);
    expect(result.value.production?.parameters.map(value => value.label)).toEqual(['幅（px）','高さ（px）','候補数']);
    expect(result.value.production?.defaults).toEqual(source.production?.defaults);
    expect(localizeRecipe(result.value, 'en')).toEqual(result.value);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
