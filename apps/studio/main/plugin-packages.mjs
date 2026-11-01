import { createId } from '@galcraft/contracts';
import { AssetTypeRegistry } from '@galcraft/assets';

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PluginHost, acquirePluginDefinition, loadPluginModule, loadPluginServices, preparePluginModuleGraph } from '@galcraft/plugins';
import { fail, ok } from './result.mjs';
import { createRuntimeDependencyAccess } from '@galcraft/plugins/registry';

export class StudioPluginPackages {
  #host;
  #development = new Map();
  #leases = new Map();

  constructor(root, resources, context = null) {
    this.root = root;
    this.resources = resources;
    this.studioServices = [];
    this.serviceContext = context;
    this.#host = new PluginHost(root, (id, target) => this.context(id, target));
  }

  context(pluginId, target, session) {
    return this.serviceContext?.(pluginId, target, session) ?? {
      pluginId, target, domain: { projectId: session?.projectId ?? createId(), kind: 'sample', instance: 'plugin-services' },
      documents: { read: () => fail('DOCUMENT_CONTEXT_MISSING', '此服务没有活动文档上下文', 'M02'),
        propose: input => session ? session.planEdit(input) : fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02') },
      assets: { resolve: async () => fail('ASSET_CONTEXT_MISSING', '此服务没有活动素材上下文', 'M04') },
      pages: { open: async () => fail('PAGE_CONTEXT_MISSING', '后台服务通过作者入口呈现结果', 'M01') },
      log: () => {},
    };
  }

  setStudioServices(entries) {
    const ids = new Set();
    for (const entry of entries) { if(ids.has(entry.id))throw new Error(`重复Studio能力包 ${entry.id}`);ids.add(entry.id); }
    this.studioServices = entries.map(({id,version})=>({id,version,required:true}));
  }
  dependencies(session) {
    const document = session && [...session.documents.values()].find(value=>value.files['dependencies.lock.json']);
    const locked = document ? JSON.parse(document.files['dependencies.lock.json']).data.plugins : [];
    const result = new Map(this.studioServices.map(value=>[value.id,value]));
    for(const entry of locked) {
      const previous = result.get(entry.id);
      if(previous && previous.version!==entry.version)throw new Error(`Studio能力与作品精确版本冲突 ${entry.id}`);
      result.set(entry.id,entry);
    }
    return [...result.values()];
  }

  async exactDirectory(pluginId, version) {
    const development = this.#development.get(pluginId);
    const inspectedDevelopment = development ? await this.#host.store.inspectDirectory(development) : null;
    const directory = inspectedDevelopment?.ok && inspectedDevelopment.value.version === version && inspectedDevelopment.value.id === pluginId
      ? development : join(this.root, pluginId, version);
    const inspected = await this.#host.store.inspectDirectory(directory);
    if (!inspected.ok) return inspected;
    return inspected.value.id === pluginId && inspected.value.version === version ? ok({ directory, manifest: inspected.value })
      : fail('PLUGIN_LOAD', `插件目录与锁定版本不符：${pluginId}@${version}`, 'M09', ['supplyDependency']);
  }

  async acquireDefinitions(session, { allowMissing = false } = {}) {
    const documents = [], components = [], pages = [], commands = [], assetTypes = [], productionOperations = [], releases = [], warnings = [], messages = {};
    let transferred = false;
    try {
      for (const dependency of this.dependencies(session)) {
        const exact = await this.exactDirectory(dependency.id, dependency.version);
        if (!exact.ok) {
          if (!allowMissing && dependency.required) return exact;
          warnings.push({ ...exact.error, severity: 'warning', message: `缺少精确插件 ${dependency.id}@${dependency.version}，相关定义暂不可用：${exact.error.message}`, actions: ['supplyDependency'] });
          continue;
        }
        const { directory, manifest } = exact.value;
        if (manifest.entry.definition) {
          const lease = await acquirePluginDefinition(directory, manifest); releases.push(lease.release);
          Object.assign(messages,lease.definition.messages?.en??{});
          components.push(...lease.definition.components ?? []);
          commands.push(...lease.definition.commands??[]);
          pages.push(...lease.definition.pages ?? []);
          for (const definition of lease.definition.productionOperations ?? []) {
            if (!manifest.contributions.some(item => item.kind === 'productionOperation' && item.key === definition.id)) throw new Error(`未声明制作操作 ${definition.id}`);
            productionOperations.push({ definition, provider: { id: manifest.id, version: manifest.version }, messages: lease.definition.messages });
          }
          for (const definition of lease.definition.assetTypes ?? []) {
            if (!manifest.contributions.some(item => item.kind === 'assetType' && item.key === definition.key)) throw new Error(`未声明素材类型 ${definition.key}`);
            assetTypes.push({ definition, provider: { id: manifest.id, version: manifest.version } });
          }
          for (const definition of lease.definition.documents ?? []) {
            if (!manifest.contributions.some(item => item.kind === 'document' && item.key === definition.key)) throw new Error(`未声明文档 ${definition.key}`);
            documents.push(definition);
          }
        } else if (manifest.contributions.some(item => ['document','command'].includes(item.kind))) {
          const instance = await loadPluginModule(directory, manifest); releases.push(() => instance.deactivate());
          const offered = await instance.activate(this.context(manifest.id, 'web', session));
          documents.push(...offered.documents);
          commands.push(...(offered.commands??[]).map(command=>command.spec));
        }
      }
      let released = false;
      const release = async () => { if (!released) { released = true; await Promise.allSettled(releases.reverse().map(fn => fn())); } };
      transferred = true;
      return { ...ok({ documents, components, pages, commands, assetTypes, productionOperations, messages, release }), warnings };
    } catch (error) { return fail('PLUGIN_LOAD', String(error), 'M09'); }
    finally {
      // Ownership transfers to the successful definition lease only.
      if (!transferred) await Promise.allSettled(releases.map(fn => fn()));
    }
  }

  async acquireAssetTypes(session) {
    const lease = await this.acquireDefinitions(session, { allowMissing: true });
    if (!lease.ok) throw new Error(lease.error.message);
    try { return { types: new AssetTypeRegistry(lease.value.assetTypes), warnings: lease.warnings, release: lease.value.release }; }
    catch (error) { await lease.value.release(); throw error; }
  }

  async acquireProvider(key, kind, session, packageVersion) {
    const pluginId = key.split('/')[0], lockDocument = session && [...session.documents.values()].find(document => document.files['dependencies.lock.json']);
    const selected = lockDocument && JSON.parse(lockDocument.files['dependencies.lock.json']).data.plugins.find(item => item.id === pluginId);
    const version = packageVersion ?? selected?.version ?? this.studioServices.find(value=>value.id===pluginId)?.version;
    if (!version) throw new Error(`请先启用提供者 ${key}`);
    const exact = await this.exactDirectory(pluginId, version);
    if (!exact.ok) throw new Error(exact.error.message);
    const { directory, manifest } = exact.value, declaration = manifest.contributions.find(item => item.kind === kind && item.key === key);
    if (!declaration) throw new Error(`插件 ${pluginId}@${version} 未声明 ${key}`);
    const target = declaration.targets.includes('windows') ? 'windows' : 'web';
    const instance = await (kind === 'resource' && !manifest.entry.services ? loadPluginModule(directory, manifest) : loadPluginServices(directory, manifest));
    try {
      const context = this.context(pluginId, target, session);
      if (!manifest.externalRuntimeDependencies?.includes('org.galcraft.music-composition/soundbanks')) context.soundbanks = undefined;
      if (context.runtimeDependencies) context.runtimeDependencies = createRuntimeDependencyAccess(manifest.externalRuntimeDependencies ?? [], key => this.context(pluginId, target, session).runtimeDependencies.resolve(key));
      const offered = await instance.activate(context);
      const collection = { generationProvider: 'generationProviders', textPreparation: 'textPreparations', tool: 'tools', resourceProcessor: 'resourceProcessors', resource: 'resources' }[kind];
      const matches = (offered[collection] ?? []).filter(item => item.key === key);
      if (matches.length !== 1) throw new Error(`贡献 ${key} 需要唯一可用实现`);
      let released = false;
      return { provider: matches[0], processor: matches[0], packageVersion: version,
        release: async () => { if (!released) { released = true; await instance.deactivate(); } } };
    } catch (error) { await instance.deactivate(); throw error; }
  }

  async providerCatalog(kind, session, { allowMissing = false, onIssue } = {}) {
    const result = [];
    for (const dependency of this.dependencies(session)) {
      const exact = await this.exactDirectory(dependency.id, dependency.version);
      if (!exact.ok) {
        if (!allowMissing && dependency.required) throw new Error(exact.error.message);
        onIssue?.({ ...exact.error, severity: 'warning', message: `缺少精确插件 ${dependency.id}@${dependency.version}，${kind} 目录无法读取该包：${exact.error.message}`, actions: ['supplyDependency'] });
        continue;
      }
      for (const declaration of exact.value.manifest.contributions.filter(item => item.kind === kind)) {
        const lease = await this.acquireProvider(declaration.key, kind, session, dependency.version);
        try {
          const value = lease.provider;
          result.push(kind === 'generationProvider' ? { key: value.key, packageVersion: lease.packageVersion,
            purposes: value.purposes, protocols: value.protocols, execution: value.execution ?? 'remote', configFields: value.configFields, capabilities: value.capabilities }
            : kind === 'resourceProcessor' ? { key: value.key, packageVersion: lease.packageVersion,
              inputKinds: value.inputKinds, outputKinds: value.outputKinds, fields: value.fields, supportsCancel: value.supportsCancel }
              : { key: value.key, packageVersion: lease.packageVersion, extensions: value.extensions, kind: value.kind });
        } finally { await lease.release(); }
      }
    }
    return result;
  }

  async externalTools(session) {
    const tools=[];
    for(const dependency of this.dependencies(session)) {
      const exact=await this.exactDirectory(dependency.id,dependency.version);if(!exact.ok)continue;
      for(const key of exact.value.manifest.externalTools??[]) {if(!exact.value.manifest.contributions.some(item=>item.kind==='tool'&&item.key===key&&item.targets.includes('windows')))continue;
        const lease=await this.acquireProvider(key,'tool',session,dependency.version);
        try {if(!lease.provider.external||typeof lease.provider.runExternal!=='function')throw new Error(`The external tool lacks its declaration or executable entry: ${key}`);let title=lease.provider.titleKey,display;
          if(exact.value.manifest.entry.definition){const definition=await acquirePluginDefinition(exact.value.directory,exact.value.manifest);try{const messages=definition.definition.messages??{},titleKey=lease.provider.titleKey,descriptionKey=lease.provider.descriptionKey;title=messages.en?.[titleKey]??title;display=Object.fromEntries(['zh-CN','en','ja'].map(locale=>[locale,{title:messages[locale]?.[titleKey]??title,description:descriptionKey?(messages[locale]?.[descriptionKey]??messages.en?.[descriptionKey]??lease.provider.external.description):lease.provider.external.description}]));}finally{await definition.release();}}tools.push({key,packageVersion:dependency.version,title,display,external:structuredClone(lease.provider.external)});}
        finally{await lease.release();}
      }
    }
    return tools;
  }
  async resolveResourceProvider(sourcePath, session) {
    const paths = (await stat(sourcePath)).isDirectory() ? (await readdir(sourcePath, { recursive: true })).map(path => String(path).replaceAll('\\', '/')) : [sourcePath];
    const matches = (await this.providerCatalog('resource', session)).filter(item => item.extensions.some(extension => paths.some(path =>
      path.toLowerCase().endsWith(extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`))));
    if (matches.length > 1) throw new Error(`多个资源提供者匹配本文件：${matches.map(item => item.key).join('、')}`);
    return matches.length ? this.acquireProvider(matches[0].key, 'resource', session, matches[0].packageVersion) : null;
  }

  inspectPackage(source) { return this.#host.inspectPackage(source); }
  install(source) { return this.#host.install(source); }
  async list(session) {
    const entries = [], dirs = async path => { try { return await readdir(path, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } };
    for (const id of await dirs(this.root)) if (id.isDirectory() && !id.name.startsWith('.'))
      for (const version of await dirs(join(this.root, id.name))) if (version.isDirectory()) {
        const inspected = await this.#host.store.inspectDirectory(join(this.root, id.name, version.name));
        if (inspected.ok) { this.#host.registry.registerInstalled(inspected.value); entries.push({ manifest: inspected.value, development: false }); }
      }
    for (const [id, directory] of this.#development) { const inspected = await this.#host.store.inspectDirectory(directory); if (inspected.ok) {this.#host.registry.registerInstalled(inspected.value);entries.push({ manifest: inspected.value, development: true });} }
    const document = session && [...session.documents.values()].find(d => d.files['dependencies.lock.json']);
    return ok({ entries: entries.map(entry => ({ ...entry, studioService: this.studioServices.some(service =>
      service.id === entry.manifest.id && service.version === entry.manifest.version) })),
      lock: document ? JSON.parse(document.files['dependencies.lock.json']).data : null });
  }
  async planChange(input, session) {
    if (this.studioServices.some(service => service.id === input.pluginId))
      return fail('PLUGIN_STUDIO_SERVICE', '此服务由 Studio 默认装配，请在制作页配置服务连接。', 'M09');
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    await this.list(session);
    const document = [...session.documents.values()].find(d => d.files['dependencies.lock.json']), lock = JSON.parse(document.files['dependencies.lock.json']).data;
    const expected = [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }];
    const references = [...session.documents.values()].filter(d => d.documentId!==document.documentId && Object.values(d.files).some(text => text.includes(input.pluginId))).map(d => ({ kind: 'document', id: d.documentId }));
    const result = await this.#host.planChange({ ...input, projectId: session.projectId, expected, lock, references });
    if (!result.ok) return result;
    const plan = session.planEdit({ label: '修改作品插件', origin: 'plugin', expected, patches: [{ kind: 'json', documentId: document.documentId,
      changes: [{ path: '/data', before: lock, after: result.value.targetLock, op: 'set' }] }], preparedAssets: [], requiredRefs: [] });
    return plan.ok ? ok({ change: result.value, edit: plan.value }) : plan;
  }
  async loadDevelopment(input) {
    const result = await this.#host.loadDevelopment(input);
    if (result.ok) this.#development.set(result.value.manifest.id, input.directory);
    return result;
  }

  async resolve(lock) {
    const handleId = createId(), releases = [], packages = [];
    try {
      for (const dependency of [...lock.plugins,...this.studioServices.filter(value=>!lock.plugins.some(item=>item.id===value.id))]) {
        const exact = await this.exactDirectory(dependency.id, dependency.version);
        if (!exact.ok) {
          if (!dependency.required) continue;
          return exact;
        }
        const { directory, manifest } = exact.value;
        if (!lock.plugins.some(item => item.id === manifest.id) && manifest.contributions.length && manifest.contributions.every(item => item.kind === 'targetBuilder') && !manifest.studio?.length) continue;
        const graph = await preparePluginModuleGraph(directory, manifest);
        releases.push(graph.release);
        const urls = new Map();
        for (const file of manifest.files) {
          const mime = file.path.endsWith('.js') || file.path.endsWith('.mjs') ? 'text/javascript' :
            file.path.endsWith('.json') ? 'application/json' : file.path.endsWith('.css') ? 'text/css' : 'application/octet-stream';
          const lease = this.resources.register({ projectId: 'plugins', assetId: manifest.id, variantId: handleId,
            relative: file.path, path: join(graph.directory, file.path), mime });
          releases.push(lease.release); urls.set(file.path, lease.uri);
        }
        packages.push({ manifest, runtimeUrl: manifest.entry.runtime ? urls.get(manifest.entry.runtime) : null,
          editorUrl: manifest.entry.editor ? urls.get(manifest.entry.editor) : null,
          definitionUrl: manifest.entry.definition ? urls.get(manifest.entry.definition) : null,
          servicesUrl: manifest.entry.services ? urls.get(manifest.entry.services) : null });
      }
      this.#leases.set(handleId, releases);
      return ok({ handleId, packages });
    } finally {
      if (!this.#leases.has(handleId)) await Promise.allSettled(releases.map(release => release()));
    }
  }

  async release(handleId) {
    await Promise.allSettled((this.#leases.get(handleId) ?? []).map(release => release()));
    this.#leases.delete(handleId);
    return ok(undefined);
  }

  async dispose() {
    await Promise.all([...this.#leases.keys()].map(handleId => this.release(handleId)));
    await this.#host.dispose();
  }
}
