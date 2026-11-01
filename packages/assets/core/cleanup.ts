import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isId } from '@galcraft/contracts';
import type { Id, Result } from '@galcraft/contracts';
import { fail, ok } from './result.js';
import type { AssetIndex } from './types.js';

export type RetainedVariant = { assetId: Id; variantId: Id };
export type CleanupPlan = { directories: string[]; retained: RetainedVariant[]; indexRevision: number };

async function includeProcessingCandidates(projectRoot: string, retained: RetainedVariant[]): Promise<RetainedVariant[]> {
  const values = new Map(retained.map(value => [`${value.assetId}/${value.variantId}`, value]));
  const directory = join(projectRoot, '.galcraft', 'asset-processing');
  let names: string[];
  try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [...values.values()]; throw error; }
  for (const name of names.filter(name => name.endsWith('.json'))) {
    const candidate = JSON.parse(await readFile(join(directory, name), 'utf8'));
    if (!isId(candidate.assetId) || !isId(candidate.variant?.id)) throw new Error('资源处理候选身份无效，请先检查候选记录');
    values.set(`${candidate.assetId}/${candidate.variant.id}`, { assetId: candidate.assetId, variantId: candidate.variant.id });
  }
  return [...values.values()];
}

export async function planAssetCleanup(projectRoot: string, index: AssetIndex, retained: RetainedVariant[],
  undoHistoryActive: boolean): Promise<Result<CleanupPlan>> {
  if (undoHistoryActive) return fail('CLEANUP_UNDO_ACTIVE', '撤销历史仍可能恢复素材，暂不能清理', ['retry']);
  retained = await includeProcessingCandidates(projectRoot, retained);
  const keep = new Set(index.data.assets.flatMap(asset => asset.variants.map(variant => `${asset.id}/${variant.id}`)));
  for (const value of retained) keep.add(`${value.assetId}/${value.variantId}`);
  const base = join(projectRoot, 'assets', 'files');
  const directories: string[] = [];
  let assets;
  try { assets = await readdir(base, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ok({ directories, retained, indexRevision: index.revision }); throw error; }
  for (const asset of assets) {
    if (!asset.isDirectory()) continue;
    for (const variant of await readdir(join(base, asset.name), { withFileTypes: true })) {
      if (variant.isDirectory() && !keep.has(`${asset.name}/${variant.name}`))
        directories.push(`assets/files/${asset.name}/${variant.name}`);
    }
  }
  return ok({ directories, retained, indexRevision: index.revision });
}

export async function confirmAssetCleanup(projectRoot: string, plan: CleanupPlan, currentIndex: AssetIndex,
  retained: RetainedVariant[], undoHistoryActive: boolean, authorConfirmed: boolean): Promise<Result<string[]>> {
  if (!authorConfirmed) return fail('CLEANUP_CANCELLED', '作者取消清理', ['cancel']);
  retained = await includeProcessingCandidates(projectRoot, retained);
  if (undoHistoryActive || currentIndex.revision !== plan.indexRevision ||
    JSON.stringify(retained.map(value => `${value.assetId}/${value.variantId}`).sort()) !==
    JSON.stringify(plan.retained.map(value => `${value.assetId}/${value.variantId}`).sort()))
    return fail('CLEANUP_STALE', '清理计划所依据的版本或持有范围已变化', ['retry']);
  const live = new Set(currentIndex.data.assets.flatMap(asset => asset.variants.map(variant => `${asset.id}/${variant.id}`)));
  for (const path of plan.directories) {
    if (!/^assets\/files\/[^/]+\/[^/]+$/.test(path) || !path.split('/').slice(2).every(isId)) return fail('CLEANUP_PATH', `无效清理目录 ${path}`);
    if (live.has(path.split('/').slice(2).join('/'))) return fail('CLEANUP_STALE', `素材版本仍在索引中：${path}`, ['retry']);
    await rm(join(projectRoot, ...path.split('/')), { recursive: true, force: true });
  }
  return ok(plan.directories);
}
