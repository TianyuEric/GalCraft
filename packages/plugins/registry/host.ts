import { createId, validateProductionOperationDefinition } from '@galcraft/contracts';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { CommandSpecSchema, FieldSpecSchema, RelativePathSchema } from '@galcraft/contracts';
import type { Id, Issue, Lock, Ref, Result, Target } from '@galcraft/contracts';
import { PluginManifestSchema } from '../contracts/manifest.js';
import type { ContributionKind, PluginManifest } from '../contracts/manifest.js';
import { validateAssetTypeDefinition } from '../contracts/asset-types.js';
import type { Contributions, GalCraftPlugin, PackageInspection, PackageSource, PluginChangePlan, PluginContext, PluginService } from '../contracts/sdk.js';
import { emptyContributions, PluginStateAdapter } from '../contracts/state-adapter.js';
import { ContributionRegistry } from './index.js';
import { PluginPackageStore } from './package-store.js';
import { loadPluginEntries, loadPluginServices } from './module-loader.js';
import { createRuntimeDependencyAccess } from './external-runtimes.js';
export { loadPluginDefinition, acquirePluginDefinition, loadPluginRuntime, loadPluginServices, preparePluginModuleGraph } from './module-loader.js';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const fail = <T>(message: string): Result<T> => { const error: Issue = { code: message.includes('PLUGIN_STATE_DUPLICATE') ? 'PLUGIN_STATE_DUPLICATE' : 'PLUGIN_LOAD', severity: 'error', message,
  owner: 'M09', related: [], actions: ['supplyDependency'] }; return { ok: false, error, issues: [error] }; };
const kinds: Record<ContributionKind, keyof Contributions> = { command: 'commands', condition: 'conditions', document: 'documents', tool: 'tools',
  resource: 'resources', stage: 'stages', page: 'pages', component: 'components', system: 'systems', platform: 'platform',
  textPreparation: 'textPreparations', generationProvider: 'generationProviders', resourceProcessor: 'resourceProcessors', fieldEditor: 'fieldEditors', publishCheck: 'publishChecks', targetBuilder: 'targetBuilders', assetType: 'assetTypes', assetEditor: 'assetEditors', assetPreview: 'assetPreviews', assetThumbnail: 'assetThumbnails', productionOperation: 'productionOperations' };
export type PluginLoader = (directory: string, manifest: PluginManifest) => Promise<GalCraftPlugin>;
export const loadPluginModule: PluginLoader = (directory, manifest) => loadPluginEntries(directory, manifest, 'all');

export class PluginHost implements PluginService {
  registry = new ContributionRegistry();
  readonly store: PluginPackageStore;
  private directories = new Map<string, string>();
  private development = new Map<string, string>();
  private active: { instances: GalCraftPlugin[]; contributions: Contributions; lock: Lock; target: Target } | null = null;
  private retired = new Map<Contributions, GalCraftPlugin[]>();
  private stateAdapter: PluginStateAdapter | null = null;
  constructor(private readonly root: string, private readonly context: (id: string, target: Target) => PluginContext,
    private readonly loader: PluginLoader = loadPluginModule,
    private readonly readProject?: (id: Id) => Promise<Result<{ lock: Lock; references: Ref[] }>>) { this.store = new PluginPackageStore(root); }

  private pluginContext(manifest: PluginManifest, target: Target): PluginContext {
    const context = this.context(manifest.id, target), runtime = context.runtimeDependencies;
    return runtime ? { ...context, runtimeDependencies: createRuntimeDependencyAccess(manifest.externalRuntimeDependencies ?? [], key => runtime.resolve(key)) } : context;
  }

  private async source<T>(source: PackageSource, action: (directory: string) => Promise<Result<T>>): Promise<Result<T>> {
    if (source.kind === 'directory') return action(source.path);
    const temp = join(this.root, `.unpack-${createId()}`);
    try {
      const files = unzipSync(await readFile(source.path));
      const manifest = PluginManifestSchema.parse(JSON.parse(strFromU8(files['manifest.json']!)));
      await mkdir(temp, { recursive: true });
      for (const path of ['manifest.json', ...manifest.files.map(item => item.path)]) {
        RelativePathSchema.parse(path);
        const bytes = files[path]; if (!bytes) throw new Error(`包文件缺失：${path}`);
        await mkdir(dirname(join(temp, path)), { recursive: true }); await writeFile(join(temp, path), bytes);
      }
      return await action(temp);
    } catch (error) { return fail(String(error)); }
    finally { await rm(temp, { recursive: true, force: true }); }
  }
  async inspectPackage(source: PackageSource): Promise<Result<PackageInspection>> {
    return this.source(source, async directory => {
      const inspected = await this.store.inspectDirectory(directory); if (!inspected.ok) return inspected;
      return ok({ manifest: inspected.value, issues: [], compatible: true,
        installedVersion: this.registry.resolveExact(inspected.value.id, inspected.value.version)?.version ?? null });
    });
  }
  async install(source: PackageSource): Promise<Result<{ id: string; version: string; directory: string }>> {
    return this.source(source, async directory => {
      const installed = await this.store.installDirectory(directory); if (!installed.ok) return installed;
      const registered = this.registry.registerInstalled(installed.value.manifest); if (!registered.ok) return registered;
      const { id, version } = registered.value; this.directories.set(`${id}@${version}`, installed.value.directory);
      return ok({ id, version, directory: installed.value.directory });
    });
  }
  async prepareContributions(lock: Lock, target: Target): Promise<Result<Contributions>> {
    // Installed packages survive application restarts; the in-memory registry is reconstructed from the exact Lock.
    for (const dependency of lock.plugins) {
      if (this.registry.resolveExact(dependency.id, dependency.version)) continue;
      const directory = join(this.root, dependency.id, dependency.version);
      const inspected = await this.store.inspectDirectory(directory);
      if (inspected.ok) { this.registry.registerInstalled(inspected.value); this.directories.set(`${dependency.id}@${dependency.version}`, directory); }
    }
    return this.prepare(this.registry, lock, target);
  }
  private async prepare(registry: ContributionRegistry, lock: Lock, target: Target): Promise<Result<Contributions>> {
    const environment = lock.plugins.some(item => this.context(item.id, target).domain?.kind !== 'player')
      ? ['definition', 'editor', 'services', 'runtime'] as const : ['definition', 'runtime'] as const;
    const table = registry.prepareContributions(lock, target, [...environment]); if (!table.ok) return table;
    const instances: GalCraftPlugin[] = [], contributions = emptyContributions();
    try {
      for (const provider of table.value.loadOrder) {
        const manifest = registry.resolveExact(provider.id, provider.version)!;
        const development = this.development.get(provider.id);
        const inspected = development ? await this.store.inspectDirectory(development) : null;
        const directory = inspected?.ok && inspected.value.id === provider.id && inspected.value.version === provider.version
          ? development : this.directories.get(`${provider.id}@${provider.version}`);
        if (!directory) throw new Error(`缺少 ${provider.id}@${provider.version} 的包目录`);
        const instance = await this.loader(directory, manifest); instances.push(instance);
        const offered = await instance.activate(this.pluginContext(manifest, target));
        for (const definition of offered.assetTypes ?? []) validateAssetTypeDefinition(definition, provider);
        for (const definition of offered.productionOperations ?? []) validateProductionOperationDefinition(definition, provider, manifest.contributions);
        if (offered.systems.length > 1) throw new Error(`PLUGIN_STATE_DUPLICATE: ${provider.id} 提供多个权威状态定义`);
        for (const [kind, collection] of Object.entries(kinds) as [ContributionKind, keyof Contributions][]) {
          for (const item of offered[collection] ?? []) {
            const key = 'spec' in item ? item.spec.key : 'id' in item ? item.id : item.key;
            const declared = table.value.byKey[key];
            if (!declared || declared.provider.id !== provider.id || declared.kind !== kind) {
              if (manifest.contributions.some(entry => entry.key === key && entry.kind === kind)) continue;
              throw new Error(`未声明贡献：${provider.id}/${key}`);
            }
            if ('spec' in item) CommandSpecSchema.parse(item.spec);
            if ('fields' in item) for (const field of item.fields ?? []) FieldSpecSchema.parse(field);
            (contributions[collection] as unknown[]).push(item);
          }
        }
      }
      for (const declaration of Object.values(table.value.byKey)) {
        if (['tool', 'fieldEditor', 'generationProvider', 'resourceProcessor', 'publishCheck', 'targetBuilder', 'assetEditor', 'assetPreview', 'assetThumbnail'].includes(declaration.kind) && this.context(declaration.provider.id, target).domain?.kind === 'player') continue;
        if (declaration.kind === 'resource' && registry.resolveExact(declaration.provider.id, declaration.provider.version)?.entry.services && this.context(declaration.provider.id, target).domain?.kind === 'player') continue;
        if (declaration.kind === 'document' && !registry.resolveExact(declaration.provider.id, declaration.provider.version)?.entry.definition && this.context(declaration.provider.id, target).domain?.kind === 'player') continue;
        const found = (contributions[kinds[declaration.kind]] ?? []).filter(item => ('spec' in item ? item.spec.key : 'id' in item ? item.id : item.key) === declaration.key);
        if (found.length !== 1) throw new Error(`贡献 ${declaration.key} 需要唯一可用实现`);
      }
    } catch (error) {
      await Promise.allSettled(instances.map(instance => instance.deactivate())); return fail(String(error));
    }
    const previous = this.active;
    this.active = { instances, contributions, lock: structuredClone(lock), target };
    this.registry = registry;
    this.registry.activate(table.value);
    this.stateAdapter = new PluginStateAdapter(contributions, table.value.loadOrder.map(item => registry.resolveExact(item.id, item.version)!));
    if (previous) this.retired.set(previous.contributions, previous.instances);
    return { ok: true, value: contributions, warnings: table.warnings };
  }
  activeContributions(): Contributions | null { return this.active?.contributions ?? null; }
  async acquireServices(input: { pluginId: string; version: string; target: Target }) {
    const directory = this.directories.get(`${input.pluginId}@${input.version}`) ?? join(this.root, input.pluginId, input.version);
    const inspected = await this.store.inspectDirectory(directory); if (!inspected.ok) return inspected;
    if (inspected.value.id !== input.pluginId || inspected.value.version !== input.version) return fail<import('../contracts/sdk.js').PluginServiceLease>('服务包身份与精确版本不匹配');
    let instance: GalCraftPlugin | null = null;
    try {
      instance = await loadPluginServices(directory, inspected.value);
      const contributions = await instance.activate(this.pluginContext(inspected.value, input.target));
      const lease = instance; let released = false;
      return ok({ ...input, contributions, release: async () => { if (!released) { released = true; await lease.deactivate(); } } });
    } catch (error) { await instance?.deactivate(); return fail<import('../contracts/sdk.js').PluginServiceLease>(String(error)); }
  }
  async releaseContributions(contributions: Contributions): Promise<void> {
    if (this.active?.contributions === contributions) {
      const active = this.active; this.active = null; this.stateAdapter = null; this.registry.dispose();
      await Promise.allSettled(active.instances.map(instance => instance.deactivate())); return;
    }
    const instances = this.retired.get(contributions); if (!instances) return;
    this.retired.delete(contributions); await Promise.allSettled(instances.map(instance => instance.deactivate()));
  }
  preparePluginRestore(input: Parameters<PluginStateAdapter['prepare']>[0]) {
    return this.stateAdapter ? this.stateAdapter.prepare(input) : fail<ReturnType<PluginStateAdapter['prepare']> extends Result<infer T> ? T : never>('插件贡献尚未准备');
  }
  releasePluginRestore(id: Id): void { this.stateAdapter?.release(id); }
  async loadDevelopment(input: { directory: string; projectId: Id }): Promise<Result<PackageInspection>> {
    const inspected = await this.store.inspectDirectory(input.directory); if (!inspected.ok) return inspected;
    this.development.set(inspected.value.id, resolve(input.directory));
    return ok({ manifest: inspected.value, issues: [], installedVersion: null, compatible: true });
  }
  async reload(input: { pluginId: string; projectId: Id }): Promise<Result<Contributions>> {
    const directory = this.development.get(input.pluginId); if (!directory || !this.active) return fail('没有可重载的开发目录或活动贡献');
    const inspected = await this.store.inspectDirectory(directory); if (!inspected.ok) return inspected;
    const registry = new ContributionRegistry();
    for (const dependency of this.active.lock.plugins) {
      const manifest = dependency.id === input.pluginId ? inspected.value : this.registry.resolveExact(dependency.id, dependency.version);
      if (!manifest || manifest.id !== dependency.id || manifest.version !== dependency.version) return fail('开发重载需要相同的插件身份和精确版本');
      const added = registry.registerInstalled(manifest); if (!added.ok) return added;
    }
    return this.prepare(registry, this.active.lock, this.active.target);
  }
  async planChange(input: { projectId: Id; pluginId: string; version: string | null; expected: { ref: Ref; revision: number }[];
    lock?: Lock; references?: Ref[] }): Promise<Result<PluginChangePlan>> {
    const project = input.lock ? ok({ lock: input.lock, references: input.references ?? [] }) : await this.readProject?.(input.projectId);
    if (!project) return fail('未提供作品依赖与引用读取接口');
    if (!project.ok) return project;
    const old = project.value.lock.plugins.find(item => item.id === input.pluginId);
    const manifest = input.version ? this.registry.resolveExact(input.pluginId, input.version) : null;
    if (input.version && !manifest) return fail('所选精确插件版本尚未安装');
    const targetLock = structuredClone(project.value.lock); targetLock.plugins = targetLock.plugins.filter(item => item.id !== input.pluginId);
    if (manifest) targetLock.plugins.push({ kind: 'plugin', id: manifest.id, version: manifest.version, targets: manifest.targets, required: true });
    const checked = this.registry.prepareContributions(targetLock, this.active?.target ?? 'web'); if (!checked.ok) return checked;
    return ok({ planId: createId(), expected: structuredClone(input.expected), targetLock,
      preparedDirectory: manifest ? this.directories.get(`${manifest.id}@${manifest.version}`) ?? '' : '',
      changes: [{ pluginId: input.pluginId, from: old?.version ?? null, to: input.version, affected: structuredClone(project.value.references),
        savedData: ['document', 'progress', 'longTerm'], dependencies: targetLock.plugins, conversions: [], issues: [] }] });
  }
  async packPlugin(input: { directory: string; outputDirectory: string }): Promise<Result<{ path: string; manifest: PluginManifest; issues: Issue[] }>> {
    const inspected = await this.store.inspectDirectory(input.directory); if (!inspected.ok) return inspected;
    const manifest = inspected.value;
    const destination = join(input.outputDirectory, `${manifest.id}-${manifest.version}.galplugin`), temporary = `${destination}.tmp`;
    try {
      const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(manifest)) };
      for (const file of manifest.files) {
        if (/(^|\/)(node_modules|test|tests|\.git|\.env)(\/|$)|\.(test|spec)\.|\.galplugin$/.test(file.path) || resolve(input.directory, file.path) === resolve(destination))
          throw new Error(`清单包含开发或输出文件：${file.path}`);
        files[file.path] = await readFile(join(input.directory, file.path));
      }
      await mkdir(input.outputDirectory, { recursive: true }); await writeFile(temporary, zipSync(files)); await rename(temporary, destination);
      return ok({ path: destination, manifest, issues: [] });
    } catch (error) { await rm(temporary, { force: true }); return fail(String(error)); }
  }
  async dispose(): Promise<void> { const active = this.active; this.active = null; this.registry.dispose();
    if (active) await Promise.allSettled(active.instances.map(instance => instance.deactivate()));
    for (const contributions of [...this.retired.keys()]) await this.releaseContributions(contributions); }
}
