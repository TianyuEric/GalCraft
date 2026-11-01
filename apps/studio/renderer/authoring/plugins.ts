import { PluginManifestSchema, emptyContributions } from '@galcraft/plugins/contracts';
import type { Contributions, GalCraftPlugin, PluginContext, PluginManifest, PluginDefinition } from '@galcraft/plugins/contracts';
import { ContributionRegistry, createRuntimeDependencyAccess } from '@galcraft/plugins/registry';
import type { DocumentView, Domain, Json, Lock, ResolvedAsset, Result, StudioBridge } from '@galcraft/contracts';
import { installStudioPluginRuntimes, readPluginDefinition } from '../pages/Plugins/plugin-runtimes.js';

const collections = {
  command: 'commands', condition: 'conditions', document: 'documents', tool: 'tools', resource: 'resources',
  stage: 'stages', page: 'pages', component: 'components', system: 'systems', platform: 'platform',
  textPreparation: 'textPreparations', generationProvider: 'generationProviders', resourceProcessor: 'resourceProcessors', fieldEditor: 'fieldEditors', publishCheck: 'publishChecks', targetBuilder: 'targetBuilders', assetType: 'assetTypes', assetEditor: 'assetEditors', assetPreview: 'assetPreviews', assetThumbnail: 'assetThumbnails', productionOperation: 'productionOperations',
} as const satisfies Record<string, keyof Contributions>;

const authoringOnlyKinds = new Set<keyof typeof collections>([
  'document', 'tool', 'fieldEditor', 'textPreparation', 'generationProvider', 'resourceProcessor', 'publishCheck', 'targetBuilder',
  'assetType', 'assetEditor', 'assetPreview', 'assetThumbnail', 'productionOperation',
]);

function unavailable<T>(message: string): Result<T> {
  const error = { code: 'PLUGIN_CONTEXT_UNAVAILABLE', message, severity: 'error' as const,
    owner: 'M09' as const, related: [], actions: [] };
  return { ok: false, error, issues: [error] };
}

export async function prepareProjectPlugins(bridge: Pick<StudioBridge, 'plugins'>, lock: Lock, pluginDocuments: Record<string, Json>,
  domain: Domain, documents: DocumentView[] = [], assets: ResolvedAsset[] = [], environment: 'definition' | 'runtime' = 'runtime',
  ports?: { runtimeDependencies?: PluginContext['runtimeDependencies']; readText?: NonNullable<PluginContext['assets']['readText']>; readBytes?: NonNullable<PluginContext['assets']['readBytes']> }) {
  installStudioPluginRuntimes();
  const resolved = await bridge.plugins.resolve(lock);
  if (!resolved.ok) throw new Error(resolved.error.message);
  const { handleId } = resolved.value;
  const active: { plugin: GalCraftPlugin; controller: AbortController; releases: (() => void | Promise<void>)[] }[] = [];
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    for (const { controller } of active) controller.abort();
    await Promise.allSettled(active.map(async ({ plugin, releases }) => {
      try { await plugin.deactivate(); }
      finally { await Promise.allSettled(releases.splice(0).map(release => Promise.resolve().then(release))); }
    }));
    await bridge.plugins.release(handleId);
  };
  try {
    const registry = new ContributionRegistry();
    const packages = new Map<string, { manifest: PluginManifest; runtimeUrl: string | null; definitionUrl?: string | null }>();
    for (const item of resolved.value.packages) {
      const manifest = PluginManifestSchema.parse(item.manifest);
      const registered = registry.registerInstalled(manifest);
      if (!registered.ok) throw new Error(registered.error.message);
      packages.set(`${manifest.id}@${manifest.version}`, { manifest, runtimeUrl: item.runtimeUrl, definitionUrl: item.definitionUrl });
    }
    const prepared = registry.prepareContributions(lock, 'web', ['definition', 'runtime']);
    if (!prepared.ok) throw new Error(prepared.error.message);
    const contributions = emptyContributions(), manifests: PluginManifest[] = [], definitions: { pluginId: string; definition: PluginDefinition }[] = [];
    for (const provider of prepared.value.loadOrder) {
      const manifest = registry.resolveExact(provider.id, provider.version)!;
      const installed = packages.get(`${provider.id}@${provider.version}`);
      const definition = installed?.definitionUrl ? await readPluginDefinition(installed.definitionUrl) : null;
      if (definition) {
        contributions.assetTypes!.push(...definition.assetTypes ?? []);
        definitions.push({ pluginId: provider.id, definition });
        if (environment === 'definition') { manifests.push(manifest); continue; }
      }
        if (!installed?.runtimeUrl) {
          if (manifest.contributions.every(item => authoringOnlyKinds.has(item.kind))) {
            manifests.push(manifest);
            continue;
          }
          throw new Error(`插件 ${provider.id}@${provider.version} 缺少运行入口`);
        }
      const module = await import(/* @vite-ignore */ installed.runtimeUrl) as { createPlugin?: () => GalCraftPlugin; default?: GalCraftPlugin };
      const plugin = module.createPlugin ? module.createPlugin() : module.default!;
      if (!plugin || typeof plugin.activate !== 'function' || typeof plugin.deactivate !== 'function')
        throw new Error(`插件 ${provider.id}@${provider.version} 的运行入口无效`);
      const controller = new AbortController(), releases: (() => void | Promise<void>)[] = [];
      active.push({ plugin, controller, releases });
      const context: PluginContext = { pluginId: provider.id, target: 'web', domain,
        runtimeDependencies: ports?.runtimeDependencies ? createRuntimeDependencyAccess(manifest.externalRuntimeDependencies ?? [], key => ports.runtimeDependencies!.resolve(key)) : undefined,
        config: pluginDocuments[provider.id], signal: controller.signal, onDispose: release => releases.push(release),
        documents: { read: ref => {
          const document = documents.find(item => item.documentId === ref.id);
          if (!document) return unavailable(`文档 ${ref.id} 不在当前作品`);
          const raw = Object.values(document.files).find(value => value.trimStart().startsWith('{'));
          if (!raw) return unavailable(`文档 ${ref.id} 没有可读取的数据`);
          try { return { ok: true, value: (JSON.parse(raw) as { data: Json }).data, warnings: [] }; }
          catch { return unavailable(`文档 ${ref.id} 无法解析`); }
        }, propose: () => unavailable('插件编辑操作需要作品编辑服务') },
        assets: { resolve: async ref => {
          const asset = assets.find(item => ref.kind === 'variant' ? item.variantId === ref.id : ref.kind === 'asset' && item.assetId === ref.id);
          return asset ? { ok: true, value: asset, warnings: [] } : unavailable(`素材 ${ref.id} 不在当前快照`);
        }, readText: ports?.readText, readBytes: ports?.readBytes }, pages: { open: async () => unavailable('插件页面由 Player 导航管理') }, log: () => {},
      };
      const offered = await plugin.activate(context);
      for (const [kind, collection] of Object.entries(collections) as [keyof typeof collections, keyof Contributions][]) {
        for (const item of offered[collection] ?? []) {
          const key = 'spec' in item ? item.spec.key : 'id' in item ? item.id : item.key;
          const declaration = prepared.value.byKey[key];
          if (!declaration || declaration.provider.id !== provider.id || declaration.kind !== kind) {
            if (manifest.contributions.some(entry => entry.key === key && entry.kind === kind)) continue;
            throw new Error(`插件 ${provider.id} 提供未声明的贡献 ${key}`);
          }
          (contributions[collection] as unknown[]).push(item);
        }
      }
      manifests.push(manifest);
    }
    for (const declaration of Object.values(prepared.value.byKey)) {
      if (environment === 'definition' && definitions.some(item => item.pluginId === declaration.provider.id)) continue;
      if (authoringOnlyKinds.has(declaration.kind)) continue;
      if (declaration.kind === 'resource' && packages.get(`${declaration.provider.id}@${declaration.provider.version}`)?.manifest.entry.services) continue;
      const found = (contributions[collections[declaration.kind]] ?? []).filter(item => ('spec' in item ? item.spec.key : 'id' in item ? item.id : item.key) === declaration.key);
      if (found.length !== 1) throw new Error(`插件贡献 ${declaration.key} 需要唯一可用实现`);
    }
    const commandSpecs = [...new Map([...contributions.commands.map(item => item.spec), ...definitions.flatMap(item => item.definition.commands ?? [])].map(item => [item.key, item])).values()];
    const conditionSpecs = [...new Map([...contributions.conditions, ...definitions.flatMap(item => item.definition.conditions ?? [])].map(item => [item.key, item])).values()];
    return { contributions, manifests, definitions, commandSpecs, conditionSpecs, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
