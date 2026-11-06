import type { Lock, StudioBridge } from '@galcraft/contracts';
import { PluginManifestSchema } from '@galcraft/plugins/contracts';

export type CandidateDependencyCatalog = Pick<StudioBridge, 'plugins'> & Partial<Pick<StudioBridge, 'engines'>>;

/** Resolve the backup's exact lock without opening or mutating the work. */
export async function checkCandidateDependencies(lock: Lock, catalog: CandidateDependencyCatalog): Promise<string[]> {
  const missing: string[] = [];
  if (!catalog.engines) missing.push('引擎目录尚未就绪');
  else {
    const engines = await catalog.engines.listCreationVersions();
    if (!engines.ok) missing.push(engines.error.message);
    else if (!engines.value.includes(lock.engine.version)) missing.push('引擎 ' + lock.engine.version);
  }
  if (!lock.plugins.length) return missing;
  const result = await catalog.plugins.resolve(lock);
  if (!result.ok) { missing.push(result.error.message); return missing; }
  try {
    const installed = result.value.packages.flatMap(entry => {
      const parsed = PluginManifestSchema.safeParse(entry.manifest);
      return parsed.success ? [parsed.data] : [];
    });
    for (const plugin of lock.plugins) {
      if (!installed.some(manifest => manifest.id === plugin.id && manifest.version === plugin.version)) missing.push(`插件 ${plugin.id} ${plugin.version}`);
    }
  } finally {
    const released = await catalog.plugins.release(result.value.handleId);
    if (!released.ok) missing.push('依赖检查资源释放失败：' + released.error.message);
  }
  return missing;
}
