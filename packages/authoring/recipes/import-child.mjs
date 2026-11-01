import { RecipeLibrary } from '../dist/recipes/index.js';

const [userData, planId, stopPhase, stopIndex] = process.argv.slice(2);
let seen = 0;
const library = await RecipeLibrary.open(userData, null, progress => {
  if (progress.phase !== stopPhase) return;
  seen++;
  if (seen === Number(stopIndex)) process.exit(65);
});
const result = await library.applyRecipeImport(planId);
process.exit(result.ok ? 0 : 1);
