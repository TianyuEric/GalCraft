import { createId, readPluginDocumentInstances, ResolvedAssetSchema } from '@galcraft/contracts';
import { compilePluginConfigurations } from '@galcraft/dsl';
import { ContributionRegistry } from '@galcraft/plugins/registry';

export function stageResource(asset, variant) {
  return ResolvedAssetSchema.parse({ assetId: asset.id, variantId: variant.id, kind: asset.kind, entry: variant.entry,
    files: variant.files.map(({ path, bytes, mime }) => ({ path, bytes, mime })), metadata: variant.metadata,
    canvas: variant.canvas, provider: variant.groupCapabilities?.resolver ?? null,
    ...(variant.typeData ? { typeData: variant.typeData } : {}) });
}

/** Lease the same exact package graph and shared preview runtime used by Studio's Player. */
export async function prepareStageTarget(session, assets, target, services) {
  if (!services?.plugins || !services?.engines) throw new Error('插件资源目标验证服务尚未就绪');
  const documents = [...session.documents.values()], file = path => documents.find(item => item.files[path])?.files[path];
  const project = JSON.parse(file('project.json')).data, lock = JSON.parse(file('dependencies.lock.json')).data;
  const resolved = await services.plugins.resolve(lock);
  if (!resolved.ok) throw new Error(resolved.error.message);
  let engine, transferred = false;
  const release = async () => { if (engine?.ok) services.engines.releasePreview(engine.value.handleId); await services.plugins.release(resolved.value.handleId); };
  try {
    const registry = new ContributionRegistry();
    for (const { manifest } of resolved.value.packages) {
      const registered = registry.registerInstalled(manifest);
      if (!registered.ok) throw new Error(registered.error.message);
    }
    const prepared = registry.prepareContributions(lock, target, ['runtime']);
    if (!prepared.ok) throw new Error(prepared.error.message);
    const definitions = await services.plugins.acquireDefinitions(session);
    if (!definitions.ok) throw new Error(definitions.error.message);
    let configurations;
    try {
      const instances = readPluginDocumentInstances(documents);
      configurations = compilePluginConfigurations({ lock,
        pluginDocuments: Object.fromEntries(lock.plugins.flatMap(plugin => { const raw = file(`plugins/${plugin.id}/documents/config.json`) ?? file(`plugins/${plugin.id}/config.json`); return raw ? [[plugin.id, JSON.parse(raw).data]] : []; })),
        pluginConfigDocuments: instances.map(item => ({ contribution: item.contributionKey, documentId: item.documentId, revision: item.revision, data: item.data })),
        pluginConfigMappings: Object.fromEntries(definitions.value.documents.filter(item => item.configMapping).map(item => [item.key, item.configMapping])),
      });
    } finally { await definitions.value.release(); }
    if (configurations.issues.some(issue => issue.severity === 'error')) throw new Error(configurations.issues.map(issue => issue.message).join('；'));
    engine = await services.engines.resolvePreview({ project, lock, engineVersion: project.engineVersion, assets: assets.map(asset => stageResource(asset, asset.variants.find(variant => variant.id === asset.activeVariantId))) }, target);
    if (!engine.ok) throw new Error(engine.error.message);
    transferred = true;
    return { binding: { target, engineUrl: engine.value.url, table: prepared.value,
      packages: resolved.value.packages.map(({ manifest, runtimeUrl }) => ({ manifest, runtimeUrl })), externalRuntime: engine.value.live2d,
      domain: { projectId: session.projectId, kind: 'sample', instance: createId() },
      assets: assets.map(asset => stageResource(asset, asset.variants.find(variant => variant.id === asset.activeVariantId))),
      pluginDocuments: configurations.configs }, release };
  } finally { if (!transferred) await release(); }
}

/** Runs inside verifyAssetPlayback's real Chromium target window. Keep this function self-contained. */
export async function exercisePluginStage(binding, loadModule = url => import(url)) {
  const active = [], stages = [], cleanups = [];
  let instance = null, texture = null;
  const ok = value => ({ ok: true, value, warnings: [] });
  const unavailable = message => { const error = { code: 'ASSET_TARGET_CONTEXT', message, severity: 'error', owner: 'M04', related: [], actions: ['supplyDependency'] }; return { ok: false, error, issues: [error] }; };
  const value = result => { if (!result?.ok) throw new Error(result?.error?.message ?? '演出提供者返回无效结果'); return result.value; };
  try {
    const engine = await loadModule(binding.engineUrl);
    if (typeof engine.installPluginRuntimes !== 'function') throw new Error('锁定引擎预览缺少插件共享运行入口，请补齐对应引擎版本');
    engine.installPluginRuntimes();
    for (const dependency of binding.table.loadOrder) {
      const selected = binding.packages.find(item => item.manifest.id === dependency.id && item.manifest.version === dependency.version);
      if (!selected?.runtimeUrl) continue;
      const module = await loadModule(selected.runtimeUrl), plugin = module.createPlugin ? module.createPlugin() : module.default;
      if (!plugin || typeof plugin.activate !== 'function' || typeof plugin.deactivate !== 'function') throw new Error(`插件 ${dependency.id}@${dependency.version} 的运行入口无效`);
      const controller = new AbortController(), releases = [];
      active.push(async () => { controller.abort(); try { await plugin.deactivate(); } finally { await Promise.all(releases.map(release => release())); } });
      const offered = await plugin.activate({ pluginId: dependency.id, target: binding.target, domain: binding.domain,
        runtimeDependencies: { resolve: async key => selected.manifest.externalRuntimeDependencies?.includes(key) && key === 'org.galcraft.live2d/cubism' && binding.externalRuntime ? ok(binding.externalRuntime) : unavailable(`外部运行时 ${key} 未准备`),
          load: async key => selected.manifest.externalRuntimeDependencies?.includes(key) && key === 'org.galcraft.live2d/cubism' && binding.externalRuntime
            ? ok({ ...binding.externalRuntime, module: await loadModule(binding.externalRuntime.url) }) : unavailable(`外部运行时 ${key} 未准备`) },
        config: binding.pluginDocuments[dependency.id], signal: controller.signal, onDispose: release => releases.push(release),
        documents: { read: () => unavailable('Player 无作者文档读取'), propose: () => unavailable('目标验证不提交插件编辑') },
        assets: { resolve: async ref => { const resource = ref.id === binding.resource.assetId || ref.id === binding.resource.variantId ? binding.resource : binding.assets.find(item => item.assetId === ref.id || item.variantId === ref.id); return resource ? ok(resource) : unavailable(`素材 ${ref.id} 不在当前作品`); },
          readBytes: async (resource, path) => { if (!resource.files.some(file => file.path === path)) throw new Error(`未声明资源文件 ${path}`);
            const response = await fetch(binding.baseUri + path.split('/').map(encodeURIComponent).join('/')); if (!response.ok) throw new Error(`资源文件无法读取：${path}`); return new Uint8Array(await response.arrayBuffer()); },
          readText: async (resource, path) => { if (!resource.files.some(file => file.path === path)) throw new Error(`未声明资源文件 ${path}`);
            const response = await fetch(binding.baseUri + path.split('/').map(encodeURIComponent).join('/')); if (!response.ok) throw new Error(`资源文件无法读取：${path}`); return response.text(); } },
        pages: { open: async () => unavailable('资源目标验证不打开页面') }, log: () => {} });
      for (const provider of offered.stages ?? []) {
        const declaration = binding.table.byKey[provider.key];
        if (declaration?.kind === 'stage' && declaration.provider.id === dependency.id && declaration.provider.version === dependency.version) stages.push(provider);
        else if (!selected.manifest.contributions.some(item => item.kind === 'stage' && item.key === provider.key)) throw new Error(`未声明演出贡献 ${provider.key}`);
      }
    }
    const matching = stages.filter(provider => (provider.resourceProviderKey ?? provider.key) === binding.resource.provider || provider.resourceProviderAliases?.includes(binding.resource.provider));
    const resolver = binding.table.byKey[matching[0]?.resourceProviderKey ?? binding.resource.provider];
    if (resolver?.kind !== 'resource') throw new Error(`目标 ${binding.target} 缺少资源提供者 ${binding.resource.provider}`);
    if (matching.length !== 1) throw new Error(`资源 ${binding.resource.provider} 需要唯一可用演出提供者，实际 ${matching.length}`);
    for (const file of binding.resource.files) {
      const response = await fetch(binding.baseUri + file.path.split('/').map(encodeURIComponent).join('/'));
      if (!response.ok) throw new Error(`资源文件无法读取：${file.path}`);
      await response.arrayBuffer();
    }
    instance = value(await matching[0].create(binding.resource, {}));
    instance.pause(true);
    const surface = instance.renderSurface();
    if (!(surface instanceof HTMLCanvasElement) || surface.width <= 0 || surface.height <= 0) throw new Error('演出提供者没有有效 Canvas');
    document.body.append(surface);
    texture = globalThis.__GalCraftPixi__.Texture.from(surface);
    instance.pause(false); instance.update(16, 0, null);
    const captured = value(instance.capture());
    const json = item => item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item) || Array.isArray(item) && item.every(json) || typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype && Object.values(item).every(json);
    if (!json(captured)) throw new Error('演出捕获状态必须可序列化为 JSON');
    instance.update(16, 0, null);
    if (!json(value(instance.capture()))) throw new Error('演出捕获状态必须可序列化为 JSON');
    instance.pause(true);
    texture.source.update(); surface.toDataURL();
    return { provider: matching[0].key, width: surface.width, height: surface.height };
  } finally {
    try { instance?.dispose(); } catch (error) { cleanups.push(error); }
    try { texture?.destroy(true); } catch (error) { cleanups.push(error); }
    for (const deactivate of active.reverse()) { try { await deactivate(); } catch (error) { cleanups.push(error); } }
    if (cleanups.length) throw new Error(`插件目标验证释放失败：${cleanups.map(String).join('；')}`);
  }
}
