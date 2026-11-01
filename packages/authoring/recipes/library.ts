import { validateWorkflow } from '../production/validation.js';
import { createId, reserveIds } from '@galcraft/contracts';

import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Id, ProductionOperationSnapshot, Result, VersionRef } from '@galcraft/contracts';
import { IdSchema } from '@galcraft/contracts';
import type { ProjectSession, WorkingDocument } from '@galcraft/documents';
import { OfficialRecipes } from './official.js';
import { operationRecipes, localizeRecipe } from './operations.js';
import { PersonalRecipeImports } from './personal-imports.js';
import type { ImportProgress } from './personal-imports.js';
import { fail, ok } from './result.js';
import { CreationRecipeSchema, RecipeExportSchema } from './schema.js';
import type { CreationRecipe, RecipeImportPlan, RecipePurpose, RecipeScope, RecipeUsage } from './schema.js';
import { listFiles, readOptional, recipePath, replaceFile } from './storage.js';

const clone = <T>(value: T): T => structuredClone(value);
type ProjectEnvelope = { schemaVersion: 1; documentId: Id; revision: number; data: CreationRecipe };
type ListFilter = { projectId?: Id | null; purpose?: RecipePurpose; usage?: RecipeUsage };
type SaveInput = { recipe: CreationRecipe; expectedRevision: number | null };
type CopyInput = { recipeId: Id; sourceScope: RecipeScope; scope: 'personal' | 'project'; projectId: Id | null; locale?: string };
type DeleteInput = { recipeId: Id; scope: RecipeScope; expectedRevision: number;
  affectedPresetIds?: Id[]; confirmed?: boolean };
type ImportInput = { filePath: string; destination: 'personal' | 'project'; projectId: Id | null };

function projectPath(id: Id): string { return `authoring/recipes/${id}.json`; }
function documentImage(document: WorkingDocument): { format: 'json'; files: Record<string, string> } {
  return { format: 'json', files: clone(document.files) };
}
function envelope(recipe: CreationRecipe, revision: number): ProjectEnvelope {
  return { schemaVersion: 1, documentId: recipe.id, revision, data: recipe };
}
function projectRecipe(document: WorkingDocument): CreationRecipe | null {
  const path = projectPath(document.documentId);
  const raw = document.files[path];
  if (!raw) return null;
  const value = JSON.parse(raw) as ProjectEnvelope;
  if (value.schemaVersion !== 1 || value.documentId !== document.documentId || value.revision !== document.revision)
    throw new Error(`Invalid project recipe envelope: ${path}`);
  const recipe = CreationRecipeSchema.parse(value.data);
  if (recipe.id !== document.documentId || recipe.scope !== 'project') throw new Error(`Invalid project recipe identity: ${path}`);
  return { ...recipe, revision: document.revision };
}
function projectVersion(document: WorkingDocument): VersionRef {
  return { ref: { kind: 'document', id: document.documentId }, revision: document.revision };
}

export class RecipeLibrary {
  readonly userData: string;
  readonly project: ProjectSession | null;
  readonly imports: PersonalRecipeImports;
  readonly projectPlans = new Map<Id, RecipeImportPlan>();
  readonly appliedProjectPlans = new Map<Id, CreationRecipe[]>();
  #personalTail: Promise<void> = Promise.resolve();

  private constructor(userData: string, project: ProjectSession | null, imports: PersonalRecipeImports,
    private readonly operations?: () => Promise<ProductionOperationSnapshot[]>) {
    this.userData = userData;
    this.project = project;
    this.imports = imports;
  }

  static async open(userData: string, project: ProjectSession | null = null,
    onImportProgress?: (progress: ImportProgress) => void, operations?: () => Promise<ProductionOperationSnapshot[]>): Promise<RecipeLibrary> {
    return new RecipeLibrary(userData, project, await PersonalRecipeImports.open(userData, onImportProgress), operations);
  }

  private async officialRecipes(): Promise<CreationRecipe[]> {
    const recipes = [...OfficialRecipes, ...operationRecipes(await this.operations?.() ?? [])];
    if (new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) throw new Error('制作方案身份重复');
    return recipes;
  }

  private async serializedPersonal<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#personalTail;
    let release!: () => void;
    this.#personalTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  private async personalRecipes(): Promise<CreationRecipe[]> {
    const recipes: CreationRecipe[] = [];
    for (const name of await listFiles(join(this.userData, 'recipes'))) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -5);
      if (!IdSchema.safeParse(id).success || this.imports.isHidden(id)) continue;
      const raw = await readFile(recipePath(this.userData, id), 'utf8');
      const recipe = CreationRecipeSchema.parse(JSON.parse(raw));
      if (recipe.id !== id || recipe.scope !== 'personal') throw new Error(`Invalid personal recipe identity: ${name}`);
      reserveIds(recipe);
      recipes.push(recipe);
    }
    return recipes;
  }

  private projectRecipes(): CreationRecipe[] {
    if (!this.project) return [];
    const recipes: CreationRecipe[] = [];
    for (const id of this.project.documents.keys()) {
      const document = this.project.readDocument(id);
      if (!document) continue;
      const recipe = projectRecipe(document);
      if (recipe) {
        if (recipe.projectId !== this.project.projectId) throw new Error(`Recipe belongs to another project: ${recipe.id}`);
        reserveIds(recipe);
      recipes.push(recipe);
      }
    }
    return recipes;
  }

  async listRecipes(filter: ListFilter = {}): Promise<CreationRecipe[]> {
    const project = filter.projectId === undefined || filter.projectId === this.project?.projectId
      ? this.projectRecipes() : [];
    const all = [...await this.officialRecipes(), ...project, ...await this.personalRecipes()];
    const rank: Record<RecipeScope, number> = { official: 0, project: 1, personal: 2 };
    return all.filter(recipe =>
      (!filter.purpose || recipe.purposes.includes(filter.purpose)) &&
      (!filter.usage || recipe.uses.includes(filter.usage))
    ).sort((left, right) => rank[left.scope] - rank[right.scope] || left.name.localeCompare(right.name))
      .map(clone);
  }

  async getRecipe(id: Id, scope: RecipeScope): Promise<CreationRecipe | null> {
    if (!IdSchema.safeParse(id).success) return null;
    if (scope === 'official') return clone((await this.officialRecipes()).find(recipe => recipe.id === id) ?? null);
    if (scope === 'project') {
      const document = this.project?.readDocument(id);
      return document ? clone(projectRecipe(document)) : null;
    }
    if (this.imports.isHidden(id)) return null;
    const raw = await readOptional(recipePath(this.userData, id));
    if (raw === null) return null;
    const recipe = CreationRecipeSchema.parse(JSON.parse(raw));
    if (recipe.id !== id || recipe.scope !== 'personal') throw new Error(`Invalid personal recipe identity: ${id}`);
    return recipe;
  }

  async saveRecipe(input: SaveInput): Promise<Result<CreationRecipe>> {
    const checked = CreationRecipeSchema.safeParse(input.recipe);
    if (!checked.success) return fail('RECIPE_INVALID', checked.error.message);
    const recipe = checked.data;
    if (recipe.production?.workflow) { try { validateWorkflow(recipe.production.workflow); } catch (error) { return fail('RECIPE_WORKFLOW', String(error)); } }
    if (recipe.parameterPreset) {
      const scheme = await this.getRecipe(recipe.parameterPreset.recipeId, recipe.parameterPreset.recipeScope);
      if (!scheme?.production || scheme.revision !== recipe.parameterPreset.recipeRevision) return fail('PRESET_RECIPE_CHANGED', '参数预设引用的制作方案版本已变化');
      for (const [key, value] of Object.entries(recipe.parameterPreset.values)) {
        const parameter = scheme.production.parameters.find(item => item.key === key);
        if (!parameter || value !== null && (parameter.type === 'number' ? typeof value !== 'number' || parameter.min !== null && value < parameter.min || parameter.max !== null && value > parameter.max : parameter.type === 'enum' ? typeof value !== 'string' || !parameter.choices.includes(value) : typeof value !== parameter.type)) return fail('PRESET_PARAMETER', `参数 ${parameter?.label ?? key} 不在制作方案允许范围`);
      }
    }
    if (recipe.scope === 'official') return fail('RECIPE_READ_ONLY', 'Official recipes are read-only');
    if (recipe.scope === 'project') {
      const session = this.project;
      if (!session || recipe.projectId !== session.projectId)
        return fail('RECIPE_PROJECT_MISSING', 'Recipe project session is unavailable');
      const document = session.readDocument(recipe.id);
      const current = document ? projectRecipe(document) : null;
      if (current ? current.revision !== input.expectedRevision : input.expectedRevision !== null)
        return fail('RECIPE_REVISION_CONFLICT', 'Recipe revision changed', ['compare']);
      if (document && !current) return fail('RECIPE_ID_CONFLICT', 'Document ID already belongs to another document');
      const next: CreationRecipe = {
        ...recipe, revision: current ? current.revision + 1 : 1,
        createdAt: current?.createdAt ?? recipe.createdAt, updatedAt: new Date().toISOString(),
      };
      const patch = document ? {
        kind: 'json' as const, documentId: recipe.id,
        changes: [{ path: '/data', before: JSON.parse(document.files[projectPath(recipe.id)]!).data as CreationRecipe,
          after: next, op: 'set' as const }],
      } : {
        kind: 'document' as const, documentId: recipe.id, op: 'create' as const, before: null,
        after: { format: 'json', files: { [projectPath(recipe.id)]: JSON.stringify(envelope(next, 0), null, 2) + '\n' } },
      };
      const expected = document ? [projectVersion(document)] : [];
      const planned = session.planEdit({ label: `保存创作方案 ${next.name}`, origin: 'field', expected,
        patches: [patch], preparedAssets: [], requiredRefs: [] });
      if (!planned.ok) return planned;
      const applied = session.applyEdit(planned.value.planId, expected);
      return applied.ok ? ok(next) : applied;
    }
    return this.serializedPersonal(async () => {
      const current = await this.getRecipe(recipe.id, 'personal');
      if (current ? current.revision !== input.expectedRevision : input.expectedRevision !== null)
        return fail('RECIPE_REVISION_CONFLICT', 'Recipe revision changed', ['compare']);
      if (!current && (await this.officialRecipes()).some(value => value.id === recipe.id))
        return fail('RECIPE_ID_CONFLICT', 'Recipe ID belongs to an official recipe');
      const next: CreationRecipe = {
        ...recipe, revision: current ? current.revision + 1 : 1,
        createdAt: current?.createdAt ?? recipe.createdAt, updatedAt: new Date().toISOString(),
      };
      try { await replaceFile(recipePath(this.userData, next.id), JSON.stringify(next, null, 2) + '\n'); }
      catch (error) { return fail('RECIPE_SAVE_FAILED', String(error), ['retry']); }
      return ok(next);
    });
  }

  async copyRecipe(input: CopyInput): Promise<Result<CreationRecipe>> {
    const original = await this.getRecipe(input.recipeId, input.sourceScope);
    const source = original ? localizeRecipe(original, input.locale ?? 'zh-CN') : null;
    if (!source) return fail('RECIPE_MISSING', 'Source recipe is unavailable', ['locate']);
    if ((input.scope === 'project') !== (input.projectId !== null))
      return fail('RECIPE_PROJECT_ID', 'Copy destination and project ID disagree');
    const now = new Date().toISOString();
    let preset = source.parameterPreset;
    if (preset && preset.recipeScope !== input.scope) {
      const copied = await this.copyRecipe({ recipeId: preset.recipeId, sourceScope: preset.recipeScope, scope: input.scope, projectId: input.projectId, locale: input.locale });
      if (!copied.ok) return copied;
      preset = { ...preset, recipeId: copied.value.id, recipeScope: copied.value.scope, recipeRevision: copied.value.revision };
    }
    const copy: CreationRecipe = { ...clone(source), ...(preset ? { parameterPreset: preset } : {}), id: createId(await this.listRecipes()), revision: 0,
      scope: input.scope, projectId: input.projectId, createdAt: now, updatedAt: now };
    return this.saveRecipe({ recipe: copy, expectedRevision: null });
  }

  async deleteRecipe(input: DeleteInput): Promise<Result<void>> {
    if (input.scope === 'official') return fail('RECIPE_READ_ONLY', 'Official recipes are read-only');
    if (input.affectedPresetIds?.length && !input.confirmed)
      return fail('RECIPE_PRESET_CONFIRM', `Presets refer to this recipe: ${input.affectedPresetIds.join(', ')}`, ['compare']);
    if (input.scope === 'project') {
      const session = this.project;
      const document = session?.readDocument(input.recipeId);
      const current = document ? projectRecipe(document) : null;
      if (!session || !document || !current) return fail('RECIPE_MISSING', 'Project recipe is unavailable', ['locate']);
      if (current.revision !== input.expectedRevision)
        return fail('RECIPE_REVISION_CONFLICT', 'Recipe revision changed', ['compare']);
      const expected = [projectVersion(document)];
      const planned = session.planEdit({ label: `删除创作方案 ${current.name}`, origin: 'field', expected,
        patches: [{ kind: 'document', documentId: input.recipeId, op: 'delete', before: documentImage(document), after: null }],
        preparedAssets: [], requiredRefs: [] });
      if (!planned.ok) return planned;
      const applied = session.applyEdit(planned.value.planId, expected);
      return applied.ok ? ok(undefined) : applied;
    }
    return this.serializedPersonal(async () => {
      const current = await this.getRecipe(input.recipeId, 'personal');
      if (!current) return fail('RECIPE_MISSING', 'Personal recipe is unavailable', ['locate']);
      if (current.revision !== input.expectedRevision)
        return fail('RECIPE_REVISION_CONFLICT', 'Recipe revision changed', ['compare']);
      try { await rm(recipePath(this.userData, current.id)); }
      catch (error) { return fail('RECIPE_DELETE_FAILED', String(error), ['retry']); }
      return ok(undefined);
    });
  }

  async exportRecipes(input: { recipeIds: Id[]; destinationPath: string; overwrite?: boolean }):
    Promise<Result<{ path: string; count: number }>> {
    if (!input.destinationPath.endsWith('.galrecipe.json'))
      return fail('RECIPE_EXPORT_EXTENSION', 'Recipe export path must end in .galrecipe.json');
    const ids = [...new Set(input.recipeIds)];
    if (!ids.length) return fail('RECIPE_EXPORT_EMPTY', 'Choose recipes to export');
    const recipes = await this.listRecipes();
    const selected = ids.map(id => recipes.find(recipe => recipe.id === id));
    if (selected.some(recipe => !recipe)) return fail('RECIPE_MISSING', 'Selected recipe is unavailable', ['locate']);
    for (const recipe of [...selected]) if (recipe?.parameterPreset) {
      const dependency = recipes.find(value => value.id === recipe.parameterPreset!.recipeId);
      if (!dependency?.production) return fail('RECIPE_DEPENDENCY', '参数预设引用的制作方案不可用，请重新选择');
      if (!selected.some(value => value?.id === dependency.id)) selected.push(dependency);
    }
    if (!input.overwrite && await readOptional(input.destinationPath) !== null)
      return fail('RECIPE_EXPORT_EXISTS', 'Choose whether to replace the export file', ['compare']);
    try { await replaceFile(input.destinationPath,
      JSON.stringify({ schemaVersion: 1, recipes: selected }, null, 2) + '\n'); }
    catch (error) { return fail('RECIPE_EXPORT_FAILED', String(error), ['retry']); }
    return ok({ path: input.destinationPath, count: selected.length });
  }

  async planRecipeImport(input: ImportInput): Promise<Result<RecipeImportPlan>> {
    if ((input.destination === 'project') !== (input.projectId !== null))
      return fail('RECIPE_PROJECT_ID', 'Import destination and project ID disagree');
    if (input.destination === 'project' && this.project?.projectId !== input.projectId)
      return fail('RECIPE_PROJECT_MISSING', 'Recipe project session is unavailable');
    let source;
    try { source = RecipeExportSchema.parse(JSON.parse(await readFile(input.filePath, 'utf8'))); }
    catch (error) { const issues=error&&typeof error==='object'&&'issues' in error?(error as {issues:{path:(string|number)[]}[]}).issues:[]; const fields=issues.map(issue=>issue.path.join('.')).filter(Boolean);return fail('RECIPE_IMPORT_INVALID', '请选择从 GalCraft 导出的 recipes.galrecipe.json：文件须为有效 JSON，schemaVersion 为 1，并包含 recipes 方案列表。'+(fields.length?` 请检查字段：${fields.join('、')}。`:'')); }
    if (!source.recipes.length) return fail('RECIPE_IMPORT_EMPTY', '所选文件没有可导入的创作方案。');
    reserveIds(await this.listRecipes()); reserveIds(source);
    const now = new Date().toISOString();
    const generatedIds = source.recipes.map(() => createId());
    const importedIds = new Map(source.recipes.map((recipe, index) => [recipe.id, generatedIds[index]!]));
    const recipes = source.recipes.map((recipe, index) => ({ ...clone(recipe), id: generatedIds[index]!, revision: 1,
      scope: input.destination, projectId: input.projectId, createdAt: now, updatedAt: now,
      ...(recipe.parameterPreset ? { parameterPreset: { ...recipe.parameterPreset, recipeId: importedIds.get(recipe.parameterPreset.recipeId) ?? recipe.parameterPreset.recipeId, recipeScope: importedIds.has(recipe.parameterPreset.recipeId) ? input.destination : recipe.parameterPreset.recipeScope, recipeRevision: importedIds.has(recipe.parameterPreset.recipeId) ? 1 : recipe.parameterPreset.recipeRevision } } : {}) }));
    const plan: RecipeImportPlan = { planId: createId(), recipes, destination: input.destination,
      projectId: input.projectId, expected: [], issues: [] };
    if (input.destination === 'personal') {
      try { await this.imports.register(plan); }
      catch (error) { return fail('RECIPE_PLAN_SAVE_FAILED', String(error), ['retry']); }
    }
    else this.projectPlans.set(plan.planId, clone(plan));
    return ok(clone(plan));
  }

  async applyRecipeImport(planId: Id, signal?: AbortSignal): Promise<Result<CreationRecipe[]>> {
    if (this.projectPlans.has(planId) || this.appliedProjectPlans.has(planId)) {
      const applied = this.appliedProjectPlans.get(planId);
      if (applied) return ok(clone(applied));
      const plan = this.projectPlans.get(planId)!;
      const session = this.project;
      if (!session || plan.projectId !== session.projectId)
        return fail('RECIPE_PROJECT_MISSING', 'Recipe project session is unavailable');
      if (signal?.aborted) return fail('RECIPE_IMPORT_CANCELLED', 'Import cancelled before project edit', ['retry']);
      const patches = plan.recipes.map(recipe => ({ kind: 'document' as const, documentId: recipe.id,
        op: 'create' as const, before: null, after: { format: 'json', files: {
          [projectPath(recipe.id)]: JSON.stringify(envelope(recipe, 0), null, 2) + '\n',
        } } }));
      const planned = session.planEdit({ label: '导入创作方案', origin: 'batch', expected: [],
        patches, preparedAssets: [], requiredRefs: [] });
      if (!planned.ok) return planned;
      const result = session.applyEdit(planned.value.planId, []);
      if (!result.ok) return result;
      this.appliedProjectPlans.set(planId, clone(plan.recipes));
      return ok(clone(plan.recipes));
    }
    return this.serializedPersonal(() => this.imports.apply(planId, signal));
  }
}
