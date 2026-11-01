import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { IdSchema } from '@galcraft/contracts';
import type { Result } from '@galcraft/contracts';
import { CreationRecipeSchema, RecipeImportPlanSchema } from './schema.js';
import type { CreationRecipe, RecipeImportPlan } from './schema.js';
import { fail, ok } from './result.js';
import { importDirectory, listDirectories, readOptional, recipePath, replaceFile } from './storage.js';

const ImportRecordSchema = z.strictObject({
  schemaVersion: z.literal(1), plan: RecipeImportPlanSchema,
  phase: z.enum(['prepared', 'installing', 'committed', 'rollingBack', 'rolledBack']),
});
type ImportRecord = z.infer<typeof ImportRecordSchema>;
type RollbackResult = { ok: true } | { ok: false; path: string; reason: string };
export type ImportProgress = { planId: string; phase: 'staged' | 'prepared' | 'installing' | 'installed' | 'committed';
  recipeId?: string };

const clone = <T>(value: T): T => structuredClone(value);
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

export class PersonalRecipeImports {
  readonly userData: string;
  readonly plans = new Map<string, RecipeImportPlan>();
  readonly hidden = new Set<string>();
  readonly onProgress?: (progress: ImportProgress) => void;
  #tail: Promise<void> = Promise.resolve();

  private constructor(userData: string, onProgress?: (progress: ImportProgress) => void) {
    this.userData = userData;
    this.onProgress = onProgress;
  }

  static async open(userData: string, onProgress?: (progress: ImportProgress) => void): Promise<PersonalRecipeImports> {
    const imports = new PersonalRecipeImports(userData, onProgress);
    await imports.recover();
    return imports;
  }

  async register(plan: RecipeImportPlan): Promise<void> {
    const parsed = RecipeImportPlanSchema.parse(plan);
    if (parsed.destination !== 'personal') throw new Error('Only personal plans use personal import storage');
    await replaceFile(join(importDirectory(this.userData, parsed.planId), 'plan.json'), JSON.stringify(parsed, null, 2) + '\n');
    this.plans.set(parsed.planId, clone(parsed));
  }

  isHidden(id: string): boolean { return this.hidden.has(id); }

  private recordPath(planId: string): string { return join(importDirectory(this.userData, planId), 'record.json'); }

  private async readRecord(planId: string): Promise<ImportRecord | null> {
    const raw = await readOptional(this.recordPath(planId));
    return raw === null ? null : ImportRecordSchema.parse(JSON.parse(raw));
  }

  private async readPlan(planId: string): Promise<RecipeImportPlan | null> {
    const raw = await readOptional(join(importDirectory(this.userData, planId), 'plan.json'));
    return raw === null ? null : RecipeImportPlanSchema.parse(JSON.parse(raw));
  }

  private async writeRecord(record: ImportRecord): Promise<void> {
    await replaceFile(this.recordPath(record.plan.planId), JSON.stringify(record, null, 2) + '\n');
  }

  private hide(plan: RecipeImportPlan): void { for (const recipe of plan.recipes) this.hidden.add(recipe.id); }
  private reveal(plan: RecipeImportPlan): void { for (const recipe of plan.recipes) this.hidden.delete(recipe.id); }
  private progress(value: ImportProgress): void {
    try { this.onProgress?.(value); } catch { /* UI observation does not change commit outcome. */ }
  }

  private async rollback(record: ImportRecord): Promise<RollbackResult> {
    this.hide(record.plan);
    const failed = (path: string, error: unknown): RollbackResult =>
      ({ ok: false, path, reason: String(error) });
    const recordPath = this.recordPath(record.plan.planId);
    if (record.phase !== 'rollingBack') {
      try { await this.writeRecord({ ...record, phase: 'rollingBack' }); }
      catch (error) { return failed(recordPath, error); }
    }
    for (const recipe of record.plan.recipes) {
      const path = recipePath(this.userData, recipe.id);
      try { await rm(path, { force: true }); }
      catch (error) { return failed(path, error); }
    }
    for (const recipe of record.plan.recipes) {
      const path = recipePath(this.userData, recipe.id);
      try {
        if (await readOptional(path) !== null) return failed(path, 'File remains after rollback');
      } catch (error) { return failed(path, error); }
    }
    try { await this.writeRecord({ ...record, phase: 'rolledBack' }); }
    catch (error) { return failed(recordPath, error); }
    this.reveal(record.plan);
    return { ok: true };
  }

  private recoveryPending(planId: string, rollback: Exclude<RollbackResult, { ok: true }>): Result<CreationRecipe[]> {
    return fail('RECIPE_RECOVERY_PENDING',
      `Import recovery is pending for ${planId}; occupied path: ${rollback.path}; ${rollback.reason}`, ['retry']);
  }

  async recover(): Promise<void> {
    for (const planId of await listDirectories(join(this.userData, 'recipe-imports'))) {
      if (!IdSchema.safeParse(planId).success) continue;
      const record = await this.readRecord(planId);
      if (!record) {
        const plan = await this.readPlan(planId);
        if (plan) await rm(join(importDirectory(this.userData, planId), 'new'), { recursive: true, force: true });
        else await rm(importDirectory(this.userData, planId), { recursive: true, force: true });
        continue;
      }
      if (record.phase === 'committed' || record.phase === 'rolledBack') continue;
      await this.rollback(record);
    }
  }

  private async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  async apply(planId: string, signal?: AbortSignal): Promise<Result<CreationRecipe[]>> {
    if (!IdSchema.safeParse(planId).success) return fail('RECIPE_PLAN_ID', 'Invalid recipe import plan ID');
    return this.serialized(async () => {
      let record = await this.readRecord(planId);
      if (record?.phase === 'committed') return ok(clone(record.plan.recipes));
      if (record && record.phase !== 'rolledBack') {
        const rollback = await this.rollback(record);
        if (!rollback.ok) return this.recoveryPending(planId, rollback);
      }
      record = await this.readRecord(planId);
      const plan = record?.plan ?? this.plans.get(planId) ?? await this.readPlan(planId);
      if (!plan) return fail('RECIPE_PLAN_MISSING', 'Recipe import plan is unavailable', ['retry']);
      const checked = RecipeImportPlanSchema.safeParse(plan);
      if (!checked.success || checked.data.destination !== 'personal')
        return fail('RECIPE_PLAN_INVALID', checked.error?.message ?? 'Expected personal recipe plan');
      if (signal?.aborted) return fail('RECIPE_IMPORT_CANCELLED', 'Import cancelled before installation', ['retry']);
      for (const recipe of plan.recipes) {
        if (await readOptional(recipePath(this.userData, recipe.id)) !== null)
          return fail('RECIPE_IMPORT_CONFLICT', `Recipe ${recipe.id} already exists`, ['compare']);
      }
      const directory = importDirectory(this.userData, planId);
      try {
        for (const recipe of plan.recipes) {
          const staged = join(directory, 'new', `${recipe.id}.json`);
          await replaceFile(staged, JSON.stringify(recipe, null, 2) + '\n');
          this.progress({ planId, phase: 'staged', recipeId: recipe.id });
        }
        for (const recipe of plan.recipes) {
          const staged = join(directory, 'new', `${recipe.id}.json`);
          const value = CreationRecipeSchema.parse(JSON.parse(await readFile(staged, 'utf8')));
          if (!same(value, recipe)) throw new Error(`Staged recipe differs: ${recipe.id}`);
        }
        if (signal?.aborted) {
          await rm(join(directory, 'new'), { recursive: true, force: true });
          return fail('RECIPE_IMPORT_CANCELLED', 'Import cancelled before installation', ['retry']);
        }
        await this.writeRecord({ schemaVersion: 1, plan, phase: 'prepared' });
        this.progress({ planId, phase: 'prepared' });
        if (signal?.aborted) {
          const rollback = await this.rollback({ schemaVersion: 1, plan, phase: 'prepared' });
          if (!rollback.ok) return this.recoveryPending(planId, rollback);
          return fail('RECIPE_IMPORT_CANCELLED', 'Import cancelled before installation', ['retry']);
        }
        await this.writeRecord({ schemaVersion: 1, plan, phase: 'installing' });
        this.hide(plan);
        this.progress({ planId, phase: 'installing' });
        for (const recipe of plan.recipes) {
          const staged = join(directory, 'new', `${recipe.id}.json`);
          await replaceFile(recipePath(this.userData, recipe.id), await readFile(staged, 'utf8'));
          this.progress({ planId, phase: 'installed', recipeId: recipe.id });
        }
        await this.writeRecord({ schemaVersion: 1, plan, phase: 'committed' });
        this.reveal(plan);
        this.progress({ planId, phase: 'committed' });
        await rm(join(directory, 'new'), { recursive: true, force: true }).catch(() => {});
        return ok(clone(plan.recipes));
      } catch (error) {
        const pending = await this.readRecord(planId);
        if (pending) {
          const rollback = await this.rollback(pending);
          if (!rollback.ok) return this.recoveryPending(planId, rollback);
        } else await rm(join(directory, 'new'), { recursive: true, force: true }).catch(() => {});
        return fail('RECIPE_IMPORT_FAILED', String(error), ['retry']);
      }
    });
  }
}
