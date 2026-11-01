import { createId } from '@galcraft/contracts';
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';

import { basename, dirname, join, resolve } from 'node:path';
import { BackupService, problem, value } from '@galcraft/documents/backup';
import { AssetCatalog, AssetTypeRegistry } from '@galcraft/assets';
import { CreationRecipeSchema } from '@galcraft/authoring/recipes';
import { generationReadiness } from '@galcraft/authoring/production';
import { PluginHost } from '@galcraft/plugins';
import { acquirePluginDefinition, loadPluginModule } from '@galcraft/plugins/host';
import { readTemplateDocuments, readTemplateSource } from '@galcraft/templates';
import { EngineManifestSchema } from '@galcraft/publishing/engine';
import { fail, ok } from './result.mjs';
import { StudioProjectLibrary } from './project-library.mjs';

export class StudioBackups {
  constructor({ userData, projects, engineCatalog, officialPackages = {}, routes = () => ({}), projectLibrary }) {
    this.userData = userData;
    this.engineCatalog = engineCatalog;
    this.projects = projects;
    this.documents = [];
    this.pluginRoot = join(userData, 'plugins');
    this.contributions = null;
    this.pluginReleases = [];
    this.assetTypes = new AssetTypeRegistry();
    const unavailable = () => fail('RESTORE_READ_ONLY', '恢复检查仅允许读取文档', 'M02');
    this.pluginContext = (pluginId, target) => ({
      pluginId, target, domain: { kind: 'sample', projectId: this.projectId, instance: 'restore' },
      config: this.readPlugin(pluginId, 'config') ?? undefined,
      documents: { read: ref => { const document = this.documents.find(document => document.documentId === ref.id); return document ? ok(JSON.parse(Object.values(document.files)[0]).data) : unavailable(); }, propose: unavailable },
      assets: { resolve: unavailable }, pages: { open: unavailable }, log: () => {},
    });
    this.plugins = new PluginHost(this.pluginRoot, this.pluginContext);
    const dispose = this.plugins.dispose.bind(this.plugins);
    this.plugins.dispose = async () => { try { await dispose(); } finally { await this.releasePlugins(); } };
    this.officialPackages = officialPackages;
    this.projectLibrary = projectLibrary ?? new StudioProjectLibrary({ userData });
    this.service = new BackupService({
      collectAssets: index => new AssetCatalog(index, this.assetTypes).collectAssets([], 'web', { includeUnused: true }),
      assetTypes: {
        references: (kind, data) => this.assetTypes.references(kind, data),
        rewrite: (kind, data, mapping) => this.assetTypes.rewrite(kind, data, mapping),
        rewriteFile: (kind, variant, path, bytes, mapping) => this.assetTypes.rewriteFile(kind, variant, path, bytes, mapping),
      },
      dependencies: async lock => {
        this.documents = [...projects.currentSession.documents.values()].map(document => ({ ...document, files: document.savedFiles }));
        this.projectId = projects.currentSession.projectId;
        await this.preparePlugins(lock, '');
        return [lock.engine, lock.template, ...lock.plugins].map(dependency => ({ dependency,
          directory: dependency.kind === 'plugin' && officialPackages[dependency.id]?.[dependency.version] ? join(userData, 'plugins', dependency.id, dependency.version) : null,
          redistribute: dependency.kind === 'plugin' && !!officialPackages[dependency.id]?.[dependency.version],
          reason: dependency.kind === 'template' ? '作品已包含模板实例与样式源码' : dependency.kind === 'engine' ? '安装精确引擎版本' : officialPackages[dependency.id]?.[dependency.version] ? '官方插件允许随备份携带' : '由提供方安装精确版本',
          sourceUrl: null, instructions: `需要 ${dependency.id}@${dependency.version}`,
        }));
      },
      validateDependencies: async (project, lock, bundled, documents) => {
        this.documents = documents ?? []; this.projectId = project.projectId;
        const engine = await engineCatalog.resolveProjectEngine(project, lock, 'web');
        const issues = engine.ok ? [] : engine.issues;
        try {const template=readTemplateDocuments(this.documents);readTemplateSource(this.documents);
          if(template.id!==lock.template.id||template.version!==lock.template.version)throw new Error('The embedded template instance does not match its exact dependency.');
        } catch(error){issues.push(problem('TEMPLATE_INSTANCE_INVALID',String(error)));}
        return [...issues, ...await this.preparePlugins(lock, bundled)];
      },
      pluginDocuments: path => {
        const document = this.documents.find(item => path in item.files), envelope = document && JSON.parse(document.files[path]);
        const parts = path.split('/'), local = parts[2] === 'documents' ? parts[3]?.replace(/\.json$/, '') : parts[2];
        const key = envelope?.pluginDocument?.contributionKey ?? (parts[0] === 'plugins' && local ? `${parts[1]}/${local}` : null);
        return this.contributions?.documents.find(item => item.key === key) ?? null;
      },
      pluginCommands: () => this.contributions?.commands.map(item => item.spec) ?? [],
      pluginComponents: () => this.contributions?.components ?? [],
      documentProvider: path => path.startsWith('authoring/recipes/') ? { schema: CreationRecipeSchema } : null,
      generationReadiness: () => generationReadiness(routes()),
      openSession: directory => projects.currentRoot && resolve(projects.currentRoot) === resolve(directory) ? projects.currentSession : null,
      registry: { capture: () => this.projectLibrary.capture(), restore: records => this.projectLibrary.restore(records),
        register: receipt => this.projectLibrary.register(receipt) },
    });
    const commitUpgrade = this.service.commitUpgrade.bind(this.service);
    this.service.commitUpgrade = (...args) => this.withPlugins(() => commitUpgrade(...args));
    projects.beforeOpen = async directory => value(await this.service.recoverDestination(directory));
  }
  readPlugin(pluginId, key) {
    const path = `plugins/${pluginId}/documents/${key}.json`, document = this.documents.find(document => document.files[path]);
    return document ? JSON.parse(document.files[path]).data : null;
  }
  async preparePlugins(lock, bundled) {
    await this.releasePlugins();
    this.assetTypes = new AssetTypeRegistry();
    const definitions = { documents: [], commands: [], components: [] }, issues = [];
    for (const dependency of lock.plugins) {
      const installed = await this.plugins.store.inspectDirectory(join(this.pluginRoot, dependency.id, dependency.version));
      if (!installed.ok) {
        const source = bundled ? join(bundled, 'plugin', dependency.id, dependency.version) : this.officialPackages[dependency.id]?.[dependency.version];
        if (source) { const result = await this.plugins.install({ kind: 'directory', path: source }); if (!result.ok) { issues.push(...result.issues); continue; } }
      }
      const directory = join(this.pluginRoot, dependency.id, dependency.version), inspected = await this.plugins.store.inspectDirectory(directory);
      if (!inspected.ok) { if (dependency.required) issues.push(...inspected.issues); continue; }
      try {
        const lease = await acquirePluginDefinition(directory, inspected.value);
        this.pluginReleases.push(lease.release);
        const definition = lease.definition;
        for (const type of definition.assetTypes ?? []) this.assetTypes.register({ definition: type, provider: { id: dependency.id, version: dependency.version } });
        definitions.documents.push(...definition.documents ?? []);
        definitions.commands.push(...(definition.commands ?? []).map(spec => ({ spec })));
        definitions.components.push(...definition.components ?? []);
        if (!inspected.value.entry.definition && inspected.value.entry.runtime) {
          const instance = await loadPluginModule(directory, { ...inspected.value, entry: { ...inspected.value.entry, editor: null, services: null } });
          this.pluginReleases.push(() => instance.deactivate());
          const offered = await instance.activate(this.pluginContext(dependency.id, 'windows'));
          definitions.commands.push(...offered.commands);
        }
        if (!inspected.value.entry.definition && inspected.value.contributions.some(item => item.kind === 'document')) issues.push({ ...problem('PLUGIN_DEFINITION_LEGACY', `${dependency.id}@${dependency.version} 需要提供独立定义入口才能校验和重写作品文档`), severity: 'warning' });
      } catch (error) { issues.push(problem('PLUGIN_DEFINITION', `${dependency.id}@${dependency.version}: ${String(error)}`)); }
    }
    this.contributions = definitions;
    return issues;
  }
  async releasePlugins() {
    const releases = this.pluginReleases.splice(0);
    await Promise.allSettled(releases.reverse().map(release => release()));
  }
  async withPlugins(operation) { try { return await operation(); } finally { await this.releasePlugins(); } }
  createBackup(input) { return this.withPlugins(async () => {
    const session = this.projects.currentSession; if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    this.documents = [...session.documents.values()]; this.projectId = session.projectId;
    const lock = JSON.parse(this.documents.find(document => document.files['dependencies.lock.json']).files['dependencies.lock.json']).data;
    const issues = await this.preparePlugins(lock, ''); if (issues.some(issue => issue.severity === 'error')) return { ok: false, error: issues[0], issues };
    return this.service.createBackup(session, input);
  }); }
  prepareRestore(input) { return this.withPlugins(() => this.service.prepareRestore(input)); }
  checkRestore(directory) { return this.withPlugins(() => this.service.checkRestore(directory)); }
  commitRestore(directory) { return this.withPlugins(() => this.service.commitRestore(directory)); }
  cancelRestore(directory) { return this.withPlugins(() => this.service.cancelRestore(directory)); }
  async supplyRestoreDependency(input, directory) {
    return this.withPlugins(async () => {
      try {
        const plan = value(await this.service.checkRestore(input.operationDirectory));
        const dependency = plan.manifest?.externalDependencies.find(item => item.dependency.kind === input.kind && item.dependency.id === input.id && item.dependency.version === input.version)?.dependency;
        if (!dependency) return fail('RESTORE_DEPENDENCY_UNKNOWN', '所选依赖不属于此恢复计划', 'M02');
        if (dependency.kind === 'plugin') {
          const source = { kind: 'directory', path: directory }, inspected = value(await this.plugins.inspectPackage(source));
          if (inspected.manifest.id !== dependency.id || inspected.manifest.version !== dependency.version) throw new Error(`请选择 ${dependency.id}@${dependency.version} 的精确插件包`);
          value(await this.plugins.install(source));
        } else {
          const raw = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
          const manifest = dependency.kind === 'engine' ? EngineManifestSchema.parse(raw) : raw;
          if (manifest.id !== dependency.id || manifest.version !== dependency.version) throw new Error(`请选择 ${dependency.id}@${dependency.version} 的精确依赖目录`);
          if (dependency.kind === 'engine' && !manifest.targets.includes('web')) throw new Error('恢复作品需要包含 Web 创作与预览能力的精确引擎包');
          if (dependency.kind === 'engine') for (const file of manifest.files) {
            const details = await stat(join(directory, file.path));
            if (!details.isFile() || details.size !== file.size) throw new Error(`引擎文件与清单不符：${file.path}`);
          }
          const target = dependency.kind === 'engine' ? join(this.userData, 'engines', dependency.version) : join(this.userData, 'templates', dependency.id, dependency.version);
          if (await stat(target).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error(`本机依赖目录已存在，请检查该目录后重新检查恢复：${target}`);
          await mkdir(dirname(target), { recursive: true });
          await cp(directory, target, { recursive: true, errorOnExist: true, force: false });
          if (dependency.kind === 'engine') value(await this.engineCatalog.resolveEngine(dependency.version, 'web'));
        }
        return this.service.checkRestore(input.operationDirectory);
      } catch (error) { return fail('RESTORE_DEPENDENCY_IMPORT', String(error), 'M02'); }
    });
  }
  async copyCurrentProject() {
    const session = this.projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    if (session.dirtyIds().length) return fail('UNSAVED_CHANGES', '请先保存作品再复制', 'M02');
    const source = this.projects.currentRoot;
    const parent = dirname(source), name = `${basename(source)} 副本`;
    let destination = join(parent, name), suffix = 2;
    while (await stat(destination).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }))
      destination = join(parent, `${name} ${suffix++}`);
    await mkdir(this.userData, { recursive: true });
    const packagePath = join(this.userData, `copy-${createId()}.galproject`);
    try {
      value(await this.createBackup({ source: 'saved', destination: packagePath }));
      const plan = value(await this.prepareRestore({ packagePath, destination, identity: 'copyNew', collision: 'newDirectory' }));
      if (plan.missing.some(issue => issue.severity === 'error')) {
        await this.cancelRestore(plan.operationDirectory);
        return fail('COPY_DEPENDENCY', plan.missing.map(issue => issue.message).join('; '), 'M02');
      }
      const receipt = value(await this.commitRestore(plan.operationDirectory));
      return ok({ projectId: receipt.projectId, directory: receipt.directory });
    } catch (error) { return fail('COPY_FAILED', String(error), 'M02'); }
    finally { await rm(packagePath, { force: true }); }
  }
}
