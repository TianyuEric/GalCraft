import type { GalCraftPlugin, PluginContext, StageInstance, StageProvider } from '@galcraft/plugins/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { R4Runtime, type R4Bindings } from './r4-runtime.js';
import { createLive2DStageProvider } from './model.js';
import { legacyResolver, resourceKey, runtimeKey, stageKey } from './metadata.js';

export async function stageProvider(context: PluginContext): Promise<StageProvider & { dispose(): void }> {
  let runtime: Promise<StageProvider> | null = null;
  let modelRuntime: R4Runtime | null = null;
  let disposed = false;
  const checkOpen = () => { if (disposed || context.signal?.aborted) throw new Error('模型所属插件上下文已关闭'); };
  const open = async () => {
    const dependency = await context.runtimeDependencies?.load?.(runtimeKey);
    checkOpen();
    if (!dependency?.ok) throw new Error(dependency && !dependency.ok ? dependency.error.message : '请先导入并锁定 Cubism Web R4 SDK');
    if (!context.assets.readText || !context.assets.readBytes) throw new Error('宿主未提供只读模型资源');
    const expected = dependency.value.expected as { coreVersion: string; motionSyncCoreVersion: string | null };
    const adapter = dependency.value.module as { createBindings(base: URL, expected: { coreVersion: string; motionSyncCoreVersion: string | null }): Promise<R4Bindings> };
    if (!adapter.createBindings) throw new Error('外部 Cubism 运行时缺少 Framework 绑定，请重新准备匹配 SDK');
    const bindings = await adapter.createBindings(new URL('./', dependency.value.url), expected);
    checkOpen();
    modelRuntime = new R4Runtime({ bindings, ...expected, reader: { text: (resource, path) => context.assets.readText!(resource, path),
      bytes: async (resource, path) => { const bytes = await context.assets.readBytes!(resource, path); return bytes.slice().buffer as ArrayBuffer; } } });
    return createLive2DStageProvider(modelRuntime, expected);
  };
  return { key: stageKey, resourceProviderKey: resourceKey, resourceProviderAliases: [legacyResolver], async create(resource, initial) {
    try { checkOpen(); const provider = await (runtime ??= open()); checkOpen(); return await provider.create(resource, initial); }
    catch (error) { modelRuntime?.dispose(); modelRuntime = null; runtime = null; const issue = { code: 'LIVE2D_RUNTIME_UNAVAILABLE', message: String(error), severity: 'error' as const,
      owner: 'M06' as const, related: [], actions: ['supplyDependency' as const] }; return { ok: false, error: issue, issues: [issue] }; }
  }, dispose() { disposed = true; modelRuntime?.dispose(); modelRuntime = null; runtime = null; } };
}
export function createPlugin(): GalCraftPlugin {
  const instances = new Set<StageInstance>();
  let currentProvider: Awaited<ReturnType<typeof stageProvider>> | null = null;
  let active = false;
  return { async activate(context) {
    const contributions = emptyContributions(), provider = await stageProvider(context), create = provider.create;
    currentProvider = provider;
    active = true;
    provider.create = async (resource, initial) => {
      const opened = await create(resource, initial); if (!opened.ok) return opened;
      if (!active || context.signal?.aborted) { opened.value.dispose(); const issue = { code: 'LIVE2D_CONTEXT_CLOSED', message: '模型所属插件上下文已关闭', severity: 'error' as const, owner: 'M06' as const, related: [], actions: [] };
        return { ok: false, error: issue, issues: [issue] }; }
      const instance = opened.value, dispose = instance.dispose.bind(instance); let disposed = false;
      instance.dispose = () => { if (disposed) return; disposed = true; instances.delete(instance); dispose(); };
      instances.add(instance); return opened;
    };
    contributions.stages.push(provider); return contributions;
  }, async deactivate() { active = false; for (const instance of instances) instance.dispose(); instances.clear(); currentProvider?.dispose(); currentProvider = null; } };
}
