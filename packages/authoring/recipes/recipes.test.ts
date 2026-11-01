import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectSession } from '@galcraft/documents';
import { CreationRecipeSchema, RecipeLibrary, OfficialRecipes } from './index.js';
import type { CreationRecipe, RecipeImportPlan } from './index.js';

const projectRoot = resolve('../../tmp/testing/projects/a/recipes');
const userData = resolve('../../tmp/testing/user-data/recipes');
const projectId = '10000000-0000-4000-8000-000000000001';
const seedId = '10000000-0000-4000-8000-000000000002';
const sessions = new Set<ProjectSession>();

function value<T>(result: { ok: boolean; value?: T }): T {
  expect(result.ok).toBe(true);
  return result.value!;
}

async function fresh(): Promise<{ session: ProjectSession; library: RecipeLibrary }> {
  await rm(projectRoot, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
  const session = await ProjectSession.createProject(projectRoot, projectId, [{
    documentId: seedId, revision: 1, format: 'json', files: {
      'project.json': JSON.stringify({ schemaVersion: 1, documentId: seedId, revision: 1,
        data: { projectId, name: 'Recipe test' } }, null, 2) + '\n',
    },
  }]);
  sessions.add(session);
  return { session, library: await RecipeLibrary.open(userData, session) };
}

async function exportSource(library: RecipeLibrary, ids: string[]): Promise<string> {
  const path = join(userData, 'incoming.galrecipe.json');
  value(await library.exportRecipes({ recipeIds: ids, destinationPath: path }));
  return path;
}

async function planTwo(library: RecipeLibrary): Promise<RecipeImportPlan> {
  const path = join(userData, 'two.galrecipe.json');
  await mkdir(userData, { recursive: true });
  await writeFile(path, JSON.stringify({ schemaVersion: 1,
    recipes: [OfficialRecipes[0], OfficialRecipes[0]] }));
  return value(await library.planRecipeImport({ filePath: path, destination: 'personal', projectId: null }));
}

function record(plan: RecipeImportPlan, phase: string): string {
  return JSON.stringify({ schemaVersion: 1, plan, phase }, null, 2) + '\n';
}

async function stopChild(planId: string, phase: string, index = 1): Promise<void> {
  const childPath = fileURLToPath(new URL('./import-child.mjs', import.meta.url));
  const code = await new Promise<number | null>((resolveCode, reject) => {
    const child = spawn(process.execPath, [childPath, userData, planId, phase, String(index)],
      { windowsHide: true });
    child.once('error', reject);
    child.once('close', resolveCode);
  });
  expect(code).toBe(65);
}

afterEach(async () => {
  for (const session of sessions) await session.dispose('discard');
  sessions.clear();
  await rm(projectRoot, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
});

describe('M10 creation recipe library', () => {
  it('persists parameter presets with their scheme dependency and rewrites both identities on import', async () => {
    const { library } = await fresh();
    const official = OfficialRecipes.find(recipe => recipe.production?.operation === 'speech')!;
    const scheme = value(await library.copyRecipe({ recipeId: official.id, sourceScope: 'official', scope: 'personal', projectId: null }));
    const now = new Date().toISOString();
    const preset = value(await library.saveRecipe({ recipe: { ...scheme, production: undefined, parameterPreset: { recipeId: scheme.id, recipeScope: scheme.scope, recipeRevision: scheme.revision, values: { speed: 1.25 } }, id: 'Preset', revision: 0, name: '温柔旁白', createdAt: now, updatedAt: now }, expectedRevision: null }));
    const filePath = await exportSource(library, [preset.id]);
    const exported = JSON.parse(await readFile(filePath, 'utf8'));
    expect(exported.recipes).toHaveLength(2);
    expect(exported.recipes.some((recipe: CreationRecipe) => recipe.id === scheme.id)).toBe(true);
    const plan = value(await library.planRecipeImport({ filePath, destination: 'personal', projectId: null }));
    const imported = value(await library.applyRecipeImport(plan.planId));
    const importedPreset = imported.find(recipe => recipe.parameterPreset)!;
    const importedScheme = imported.find(recipe => recipe.production)!;
    expect(importedPreset.parameterPreset).toMatchObject({ recipeId: importedScheme.id, recipeRevision: importedScheme.revision, values: { speed: 1.25 } });
    expect(importedScheme.id).not.toBe(scheme.id);
    expect((await library.saveRecipe({ recipe: { ...preset, parameterPreset: { ...preset.parameterPreset!, values: { speed: 99 } } }, expectedRevision: preset.revision })).ok).toBe(false);
  });
  it('keeps official recipes read-only and edits project recipes only through M02', async () => {
    const { session, library } = await fresh();
    expect(OfficialRecipes.filter(recipe => !recipe.production)).toHaveLength(17);
    expect(OfficialRecipes.filter(recipe => recipe.production?.executor === 'connection')).toHaveLength(4);
    expect(new Set(OfficialRecipes.map(recipe => recipe.name)).size).toBe(OfficialRecipes.length);
    for (const recipe of OfficialRecipes) expect(CreationRecipeSchema.safeParse(recipe).success).toBe(true);
    expect((await library.deleteRecipe({ recipeId: OfficialRecipes[0]!.id, scope: 'official', expectedRevision: 1 })).ok).toBe(false);
    const personal = value(await library.copyRecipe({ recipeId: OfficialRecipes[0]!.id,
      sourceScope: 'official', scope: 'personal', projectId: null }));
    expect(personal.id).not.toBe(OfficialRecipes[0]!.id);
    expect(session.dirtyIds()).toEqual([]);
    const project = value(await library.copyRecipe({ recipeId: OfficialRecipes[0]!.id,
      sourceScope: 'official', scope: 'project', projectId }));
    expect(project.id).not.toBe(personal.id);
    expect(session.dirtyIds()).toContain(project.id);
    expect((await library.listRecipes({ purpose: 'script', usage: 'script' }))
      .map(recipe => recipe.scope)).toEqual(['official', 'official', 'project', 'personal']);
    const changed = value(await library.saveRecipe({ recipe: { ...project, name: '新名称' }, expectedRevision: 1 }));
    expect(changed.revision).toBe(2);
    expect((await library.saveRecipe({ recipe: { ...project, name: 'stale' }, expectedRevision: 1 })).ok).toBe(false);
    const undo = value(session.planUndo(project.id));
    value(session.undo(undo.planId));
    expect((await library.getRecipe(project.id, 'project'))?.name).toBe(project.name);
    const afterUndo = (await library.getRecipe(project.id, 'project'))!;
    expect(afterUndo.revision).toBe(session.readDocument(project.id)?.revision);
    expect(afterUndo.revision).toBeGreaterThan(changed.revision);
    expect((await library.saveRecipe({ recipe: { ...changed, name: 'stale after undo' }, expectedRevision: changed.revision })).ok)
      .toBe(false);
    const afterUndoEdit = value(await library.saveRecipe({
      recipe: { ...afterUndo, name: '撤销后的新编辑' }, expectedRevision: afterUndo.revision,
    }));
    expect(afterUndoEdit.revision).toBe(afterUndo.revision + 1);
    const undoSecond = value(session.planUndo(project.id));
    value(session.undo(undoSecond.planId));
    const save = value(session.planSave({ kind: 'all' }));
    value(await session.save(save.planId));
    const reopened = await ProjectSession.open(projectRoot, projectId);
    sessions.add(reopened);
    await expect((await RecipeLibrary.open(userData, reopened)).getRecipe(project.id, 'project'))
      .resolves.toMatchObject({ name: project.name });
    expect(await readFile(join(userData, 'recipes', `${personal.id}.json`), 'utf8')).toContain(personal.id);
  });

  it('imports duplicate external IDs as distinct local copies and exports explicit personal content', async () => {
    const { session, library } = await fresh();
    const plan = await planTwo(library);
    expect(plan.recipes[0]!.id).not.toBe(plan.recipes[1]!.id);
    expect(plan.recipes.every(recipe => recipe.scope === 'personal' && recipe.projectId === null)).toBe(true);
    const imported = value(await library.applyRecipeImport(plan.planId));
    expect(imported.map(recipe => recipe.id)).toEqual(plan.recipes.map(recipe => recipe.id));
    expect(session.dirtyIds()).toEqual([]);
    const path = await exportSource(library, imported.map(recipe => recipe.id));
    const exported = JSON.parse(await readFile(path, 'utf8'));
    expect(exported.recipes).toHaveLength(2);
    const projectPlan = value(await library.planRecipeImport({ filePath: path,
      destination: 'project', projectId }));
    value(await library.applyRecipeImport(projectPlan.planId));
    expect(session.dirtyIds()).toEqual(projectPlan.recipes.map(recipe => recipe.id));
    expect((await library.listRecipes()).filter(recipe => recipe.scope === 'project')).toHaveLength(2);
    const undo = value(session.planUndo(projectPlan.recipes[0]!.id));
    expect(undo.members).toEqual(projectPlan.recipes.map(recipe => recipe.id));
    value(session.undo(undo.planId));
    expect((await library.listRecipes()).filter(recipe => recipe.scope === 'project')).toHaveLength(0);
  });

  it('recovers partial and fully installed uncommitted batches as wholly absent', async () => {
    for (const installed of [1, 2]) {
      const { library } = await fresh();
      const baseline = value(await library.copyRecipe({ recipeId: OfficialRecipes[0]!.id,
        sourceScope: 'official', scope: 'personal', projectId: null }));
      const plan = await planTwo(library);
      const directory = join(userData, 'recipe-imports', plan.planId);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'record.json'), record(plan, 'installing'));
      for (const recipe of plan.recipes.slice(0, installed))
        await writeFile(join(userData, 'recipes', `${recipe.id}.json`), JSON.stringify(recipe));
      const reopened = await RecipeLibrary.open(userData);
      expect((await reopened.listRecipes()).filter(recipe => recipe.scope === 'personal').map(recipe => recipe.id))
        .toEqual([baseline.id]);
      expect(JSON.parse(await readFile(join(directory, 'record.json'), 'utf8')).phase).toBe('rolledBack');
      expect(value(await reopened.applyRecipeImport(plan.planId)).map(recipe => recipe.id))
        .toEqual(plan.recipes.map(recipe => recipe.id));
    }
  });

  it.each([
    ['staged', 1, 'noRecord'], ['installed', 1, 'rolledBack'],
    ['installed', 2, 'rolledBack'], ['committed', 1, 'committed'],
  ])('recovers a process stopped at %s item %i', async (phase, index, expectedPhase) => {
    const { library } = await fresh();
    const baseline = value(await library.copyRecipe({ recipeId: OfficialRecipes[0]!.id,
      sourceScope: 'official', scope: 'personal', projectId: null }));
    const plan = await planTwo(library);
    await stopChild(plan.planId, phase, index);
    const reopened = await RecipeLibrary.open(userData);
    const recordPath = join(userData, 'recipe-imports', plan.planId, 'record.json');
    const raw = await readFile(recordPath, 'utf8').catch(() => null);
    expect(raw ? JSON.parse(raw).phase : 'noRecord').toBe(expectedPhase);
    const personal = (await reopened.listRecipes()).filter(recipe => recipe.scope === 'personal');
    expect(personal.map(recipe => recipe.id).sort()).toEqual((expectedPhase === 'committed'
      ? [baseline.id, ...plan.recipes.map(recipe => recipe.id)] : [baseline.id]).sort());
    expect(value(await reopened.applyRecipeImport(plan.planId)).map(recipe => recipe.id))
      .toEqual(plan.recipes.map(recipe => recipe.id));
    expect((await reopened.listRecipes()).filter(recipe => recipe.scope === 'personal')).toHaveLength(3);
  });

  it('hides a rollback-pending batch and retries the frozen IDs after recovery', async () => {
    const { library } = await fresh();
    const baseline = value(await library.copyRecipe({ recipeId: OfficialRecipes[0]!.id,
      sourceScope: 'official', scope: 'personal', projectId: null }));
    const plan = await planTwo(library);
    const directory = join(userData, 'recipe-imports', plan.planId);
    const occupied = join(userData, 'recipes', `${plan.recipes[0]!.id}.json`);
    await mkdir(occupied, { recursive: true });
    await writeFile(join(occupied, 'held'), 'occupied');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'record.json'), record(plan, 'rollingBack'));
    const reopened = await RecipeLibrary.open(userData);
    expect((await reopened.listRecipes()).filter(recipe => recipe.scope === 'personal').map(recipe => recipe.id))
      .toEqual([baseline.id]);
    expect(await reopened.getRecipe(plan.recipes[0]!.id, 'personal')).toBeNull();
    expect((await reopened.applyRecipeImport(plan.planId)).ok).toBe(false);
    await rm(occupied, { recursive: true, force: true });
    expect(value(await reopened.applyRecipeImport(plan.planId)).map(recipe => recipe.id))
      .toEqual(plan.recipes.map(recipe => recipe.id));
  });

  it.skipIf(process.platform !== 'win32')('keeps an actually locked rollback file hidden until release', async () => {
    const { library } = await fresh();
    const baseline = value(await library.copyRecipe({ recipeId: OfficialRecipes[0]!.id,
      sourceScope: 'official', scope: 'personal', projectId: null }));
    const plan = await planTwo(library);
    const directory = join(userData, 'recipe-imports', plan.planId);
    const occupied = join(userData, 'recipes', `${plan.recipes[0]!.id}.json`);
    await writeFile(occupied, JSON.stringify(plan.recipes[0]));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'record.json'), record(plan, 'rollingBack'));
    const script = fileURLToPath(new URL('./hold-file.ps1', import.meta.url));
    const holder = spawn('powershell.exe', ['-NoProfile', '-File', script, '-Target', occupied],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      await new Promise<void>((resolveReady, reject) => {
        holder.once('error', reject);
        holder.stdout.on('data', chunk => {
          if (String(chunk).includes('ready')) resolveReady();
        });
        holder.once('exit', code => { if (code !== null) reject(new Error(`Lock holder exited ${code}`)); });
      });
      const reopened = await RecipeLibrary.open(userData);
      expect((await reopened.listRecipes()).filter(recipe => recipe.scope === 'personal').map(recipe => recipe.id))
        .toEqual([baseline.id]);
      expect(await reopened.getRecipe(plan.recipes[0]!.id, 'personal')).toBeNull();
      const blocked = await reopened.applyRecipeImport(plan.planId);
      expect(blocked.ok).toBe(false);
      if (blocked.ok) throw new Error('Expected locked rollback to remain pending');
      expect(blocked.error.code).toBe('RECIPE_RECOVERY_PENDING');
      expect(blocked.error.message).toContain(occupied);
      expect(blocked.error.message).toContain('recovery is pending');
    } finally {
      holder.stdin.end('\n');
      await new Promise<void>(resolveClose => holder.once('close', () => resolveClose()));
    }
    const recovered = await RecipeLibrary.open(userData);
    expect(value(await recovered.applyRecipeImport(plan.planId)).map(recipe => recipe.id))
      .toEqual(plan.recipes.map(recipe => recipe.id));
  });

  it('replays a committed receipt without restoring later edits or deletions', async () => {
    const { library } = await fresh();
    const plan = await planTwo(library);
    const first = value(await library.applyRecipeImport(plan.planId));
    const edited = value(await library.saveRecipe({ recipe: { ...first[0]!, name: '作者改名' }, expectedRevision: 1 }));
    value(await library.deleteRecipe({ recipeId: first[1]!.id, scope: 'personal', expectedRevision: 1 }));
    const reopened = await RecipeLibrary.open(userData);
    expect(value(await reopened.applyRecipeImport(plan.planId))).toEqual(first);
    expect((await reopened.getRecipe(first[0]!.id, 'personal'))?.name).toBe(edited.name);
    expect(await reopened.getRecipe(first[1]!.id, 'personal')).toBeNull();
    expect((await reopened.listRecipes()).filter(recipe => recipe.scope === 'personal')).toHaveLength(1);
  });

  it('keeps planned content after the source changes and validates fields before writing', async () => {
    const { library } = await fresh();
    const plan = await planTwo(library);
    const sourcePath = join(userData, 'two.galrecipe.json');
    await writeFile(sourcePath, '{"schemaVersion":1,"recipes":[]}');
    const cancelled = new AbortController();
    cancelled.abort();
    expect((await library.applyRecipeImport(plan.planId, cancelled.signal)).ok).toBe(false);
    expect((await library.listRecipes()).filter(recipe => recipe.scope === 'personal')).toHaveLength(0);
    const reopened = await RecipeLibrary.open(userData);
    expect(value(await reopened.applyRecipeImport(plan.planId)).map(recipe => recipe.name))
      .toEqual(plan.recipes.map(recipe => recipe.name));
    const invalid = { ...OfficialRecipes[0]!, parameters: [{ key: 'Bad-Key', label: 'x', help: '',
      type: 'string', defaultValue: '', choices: [], min: null, max: null }] } as CreationRecipe;
    await writeFile(sourcePath, JSON.stringify({ schemaVersion: 1, recipes: [invalid] }));
    const failed = await library.planRecipeImport({ filePath: sourcePath, destination: 'personal', projectId: null });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.message).toContain('parameters');
  });

  it('finishes installation when cancellation arrives after the commit phase starts', async () => {
    const { library } = await fresh();
    const plan = await planTwo(library);
    const controller = new AbortController();
    const observed: string[] = [];
    const committing = await RecipeLibrary.open(userData, null, progress => {
      observed.push(progress.phase);
      if (progress.phase === 'installed') controller.abort();
    });
    const installed = value(await committing.applyRecipeImport(plan.planId, controller.signal));
    expect(observed).toContain('committed');
    expect(installed.map(recipe => recipe.id)).toEqual(plan.recipes.map(recipe => recipe.id));
    const reopened = await RecipeLibrary.open(userData);
    expect(value(await reopened.applyRecipeImport(plan.planId)).map(recipe => recipe.id))
      .toEqual(plan.recipes.map(recipe => recipe.id));
  });

  it('keeps the prior personal library when staged content cannot be completed', async () => {
    const { library } = await fresh();
    const baseline = value(await library.copyRecipe({ recipeId: OfficialRecipes[0]!.id,
      sourceScope: 'official', scope: 'personal', projectId: null }));
    const plan = await planTwo(library);
    const blocked = join(userData, 'recipe-imports', plan.planId, 'new', `${plan.recipes[1]!.id}.json`);
    await mkdir(blocked, { recursive: true });
    expect((await library.applyRecipeImport(plan.planId)).ok).toBe(false);
    await expect((await RecipeLibrary.open(userData)).listRecipes()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: baseline.id }),
    ]));
    const reopened = await RecipeLibrary.open(userData);
    expect((await reopened.listRecipes()).filter(recipe => recipe.scope === 'personal')).toHaveLength(1);
    expect(value(await reopened.applyRecipeImport(plan.planId)).map(recipe => recipe.id))
      .toEqual(plan.recipes.map(recipe => recipe.id));
  });
});
