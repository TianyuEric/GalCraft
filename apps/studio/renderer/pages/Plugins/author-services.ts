import { createId, SoundBankRuntimeKeys, type EditInput, type Json, type Result, type StudioBridge } from '@galcraft/contracts';
import type { StudioPluginContext } from '@galcraft/plugins/contracts';
import { workbenchBridge } from '../Production/bridge.js';
import { createRuntimeDependencyAccess } from '@galcraft/plugins/registry';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const unavailable = <T>(message: string): Result<T> => { const error = { code: 'PLUGIN_SERVICE_UNAVAILABLE', message, severity: 'error' as const, owner: 'M01' as const, related: [], actions: [] }; return { ok: false, error, issues: [error] }; };
const json = (value: unknown): Json => JSON.parse(JSON.stringify(value));
const map = <T>(result: Result<T>): Result<Json> => result.ok ? ok(json(result.value)) : result;
export function createStudioAuthorServices(bridge: StudioBridge): Pick<StudioPluginContext, 'semantic' | 'assets' | 'production' | 'playerUi' | 'runtimeDependencies' | 'soundbanks'> {
  const workbench = workbenchBridge(bridge);
  const language = bridge.language as StudioBridge['language'] & {
    pluginQuery?(input: { refs?: import('@galcraft/contracts').Ref[]; sceneId?: string; statementIds?: string[] }): Promise<Result<Json>>;
    pluginPrepare?(input: Json): Promise<Result<EditInput>>;
  };
  return {
    soundbanks: bridge.soundbanks,
    runtimeDependencies: createRuntimeDependencyAccess(['org.galcraft.live2d/cubism', ...Object.keys(SoundBankRuntimeKeys)], async key => {
      if (key in SoundBankRuntimeKeys) { const bank = await bridge.soundbanks?.resolve({ id: SoundBankRuntimeKeys[key as keyof typeof SoundBankRuntimeKeys], version: '0.1.0' }); return bank?.ok ? ok({ ...bank.value, release() {} }) : bank ?? unavailable('本机音色包服务不可用'); }
      const listed = await bridge.documents.list(); if (!listed.ok) return listed;
      const files = listed.value.flatMap(document => Object.entries(document.files));
      const data = (path: string) => { const raw = files.find(([name]) => name === path)?.[1]; return raw ? JSON.parse(raw).data : null; };
      const project = data('project.json'), lock = data('dependencies.lock.json');
      if (!project || !lock || !bridge.engines) return unavailable('请先打开作品并准备精确引擎');
      const bound = await bridge.engines.resolvePreview({ project, lock, engineVersion: project.engineVersion,
        assets: [{ kind: 'live2d' }] } as unknown as import('@galcraft/contracts').Snapshot);
      if (!bound.ok) return bound;
      const release = () => { void bridge.engines!.releasePreview(bound.value.handleId); };
      if (!bound.value.live2d) { release(); return unavailable('作品尚未准备 Cubism 运行时'); }
      return ok({ ...bound.value.live2d, release });
    }),
    semantic: { query: input => language.pluginQuery?.(input) ?? Promise.resolve(unavailable('语义查询服务不可用')), prepare: input => language.pluginPrepare?.(input) ?? Promise.resolve(unavailable('语义编辑服务不可用')) },
    assets: {
      query: async input => { const result = await bridge.assets.query(input); return result.ok ? ok(result.value.items) : result; },
      read: async assetId => { const result = await bridge.assets.get(assetId); return result.ok ? result.value ? ok(result.value) : unavailable('素材已移除') : result; },
      inspect: assetId => bridge.assets.inspectModel(assetId),
      resolve: async ref => {
        const asset = await bridge.assets.get(ref.id); if (!asset.ok) return asset; if (!asset.value) return unavailable('素材已移除');
        const resolved = await bridge.assets.resolveRuntime(asset.value.id, asset.value.activeVariantId); if (!resolved.ok) return resolved;
        let released = false; return ok({ url: resolved.value.uri, release: () => { if (released) return; released = true; void bridge.assets.releaseRuntime(resolved.value.leaseId); } });
      },
      import: async (input, signal) => { if (signal?.aborted) return unavailable('素材导入已取消'); return map(await bridge.assets.import(input.paths)); },
      process: async (input, signal) => {
        if (!bridge.assets.processResource) return unavailable('资源处理服务不可用');
        if (!input || typeof input !== 'object' || Array.isArray(input)) return unavailable('请提供资源处理器、素材和设置');
        if (signal?.aborted) return unavailable('资源处理已取消');
        const operationId = createId(), cancel = () => { void bridge.assets.cancelResource?.(operationId); };
        signal?.addEventListener('abort', cancel, { once: true });
        try { return await bridge.assets.processResource({ ...input, settings: input.settings ?? input.parameters ?? {}, operationId }); } finally { signal?.removeEventListener('abort', cancel); }
      },
    },
    production: {
      prepareOperation: async input => workbench.production.planOperation(input) as unknown as Promise<Result<Json>>,
      applyAdoption: input => workbench.production.apply(input),
      connections: async () => { const result = await workbench.production.overview(); return result.ok ? ok(json(result.value.connections)) : result; },
      prepare: async input => map(await workbench.production.plan(input as Parameters<typeof workbench.production.plan>[0])),
      submit: async planId => map(await workbench.production.submit(planId)),
      tasks: async () => { const result = await workbench.production.overview(); return result.ok ? ok(json(result.value.tasks)) : result; },
      candidate: async id => { const overview = await workbench.production.overview(); if (!overview.ok) return overview; const candidate = overview.value.candidates.find(item => item.candidate.id === id); if (!candidate) return unavailable('候选已移除'); const content = await workbench.production.candidateContent(id); return content.ok ? ok(json({ ...candidate, content: content.value })) : content; },
      cancel: taskId => workbench.production.cancel(taskId),
      resume: async taskId => map(await workbench.production.resume(taskId)),
      queryRemote: async input => map(await (workbench.production as typeof workbench.production & { queryRemote(input: { taskId: string; itemId: string }): Promise<Result<unknown>> }).queryRemote(input)),
      refetch: async input => map(await (workbench.production as typeof workbench.production & { refetch(input: { taskId: string; itemId: string }): Promise<Result<unknown>> }).refetch(input)),
      prepareAdoption: async input => { const result = await workbench.production.select(input as Parameters<typeof workbench.production.select>[0]); if (!result.ok) return result; return 'planId' in result.value ? ok(result.value) : unavailable('所选候选尚未生成作品采用计划，请在制作页处理'); },
    },
    playerUi: { catalog: () => bridge.templates.pluginCatalog?.() ?? Promise.resolve(unavailable('页面目录服务不可用')),
      prepare: input => bridge.templates.pluginPrepare?.(input) ?? Promise.resolve(unavailable('页面编辑服务不可用')),
      preview: input => bridge.templates.pluginPreview?.(input) ?? Promise.resolve(unavailable('页面预览服务不可用')) },
  };
}
