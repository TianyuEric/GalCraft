import { assetReferenceTarget, createId, readPluginDocumentInstances, ResolvedAssetSchema, SoundBankRuntimeKeys } from '@galcraft/contracts';
import { fail, ok } from './result.mjs';
import { ProductionOperationCatalog } from '@galcraft/authoring/production';
import {join,dirname} from 'node:path';
import {assetFilePath,resourceSource} from '@galcraft/assets';
import { inspectFile } from '@galcraft/assets';
import { externalRuntimeDependencies } from './live2d-inspection.mjs';
import { PluginDocuments } from './plugin-documents.mjs';

export function pluginServiceContext({ projects, assets, credential, runtimeDirectory, soundbanks, productionRuntimes }, pluginId, target, selectedSession) {
  const session = selectedSession ?? projects.currentSession;
  const lockDocument = session && [...session.documents.values()].find(document => document.files['dependencies.lock.json']);
  const lock = lockDocument ? JSON.parse(lockDocument.files['dependencies.lock.json']).data : null;
  return { pluginId, target, domain: { projectId: session?.projectId ?? createId(), kind: 'sample', instance: 'author-services' },
    soundbanks: soundbanks ? { list: () => soundbanks.list(), resolve: input => soundbanks.resolve(input) } : undefined,
    runtimeDependencies: { resolve: key => key in SoundBankRuntimeKeys && soundbanks ? soundbanks.resolve({ id: SoundBankRuntimeKeys[key], version: '0.1.0' }) : key === 'org.galcraft.motion-canvas/toolchain' && productionRuntimes ? productionRuntimes.resolve(key) : runtimeDirectory ? externalRuntimeDependencies(runtimeDirectory, lock?.live2dRuntime, target).resolve(key) : Promise.resolve(fail('RUNTIME_DEPENDENCY_MISSING', `外部运行时 ${key} 未准备`, 'M09', ['supplyDependency'])) },
    credentials: { read: credential },
    media: { probe: async (path, mime) => { const result = await inspectFile(path, assets.toolDirectory, undefined, assets.svgDecoder); if(!result.ok)throw new Error(result.error.message); return {metadata:result.value.metadata,hasAlpha:result.value.metadata?.hasAlpha,hasTransparency:result.value.metadata?.hasTransparency}; } },
    documents: {
      read: ref => {
        const document = session?.readDocument(ref.id);
        if (!document) return fail('DOCUMENT_MISSING', '所选文档不存在', 'M02');
        const raw = Object.entries(document.files).find(([path]) => path.endsWith('.json'))?.[1];
        return raw ? ok(JSON.parse(raw).data) : fail('DOCUMENT_MISSING', '所选文档没有数据定义', 'M02');
      },
      propose: input => session ? session.planEdit(input) : fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02'),
    },
    assets: { get: async id=>session===projects.currentSession?assets.get(id):fail('BINDING_STALE','Open the original project to read its assets.','M04'),readText:async(resource,path)=>{const reader=resourceSource(dirname(join(projects.currentRoot,assetFilePath(resource.assetId,resource.variantId,'resource-root'))),resource.entry,resource.files.map(file=>file.path),resource.metadata);return reader.readText(path);},readBytes:async(resource,path)=>{const reader=resourceSource(dirname(join(projects.currentRoot,assetFilePath(resource.assetId,resource.variantId,'resource-root'))),resource.entry,resource.files.map(file=>file.path),resource.metadata);return reader.readBytes(path);}, resolve: async ref => {
      const index = session && [...session.documents.values()].find(document => document.files['assets/index.json']);
      const all = index ? JSON.parse(index.files['assets/index.json']).data.assets : [];
      const resolved = assetReferenceTarget(ref, all), asset = all.find(item => item.id === resolved?.assetId);
      const variant = asset?.variants.find(item => item.id === (resolved.variantId ?? asset.activeVariantId));
      return asset && variant ? ok(ResolvedAssetSchema.parse({ assetId: asset.id, variantId: variant.id, kind: asset.kind,
        entry: variant.entry, files: variant.files.map(({ path, bytes, mime }) => ({ path, bytes, mime })), metadata: variant.metadata, canvas: variant.canvas,
        provider: variant.groupCapabilities?.resolver ?? null, ...(variant.typeData ? { typeData: variant.typeData } : {}) })) : fail('ASSET_MISSING', '所选素材不存在', 'M04');
    } },
    pages: { open: async () => fail('PLUGIN_SERVICE_PAGE', '服务通过工具结果与公开导航呈现界面', 'M01') },
    log: issue => { if (issue.severity === 'error') console.error(`[${pluginId}] ${issue.code}: ${issue.message}`); },
  };
}

export function pluginServicePorts(plugins) {
  return {
    generationProviders: {
      prepareAuthorDocument: async (metadata, project) => {
        const documents = new PluginDocuments({ currentSession: project }, plugins);
        if (!metadata || typeof metadata !== 'object' || !metadata.pluginId || !metadata.contributionKey || !Number.isInteger(metadata.stateVersion)) return fail('AUTHOR_DOCUMENT_METADATA', '作者源缺少插件文档身份与数据版本', 'M10');
        const compatible = await documents.definition(metadata.contributionKey, definition => (definition.stateVersion ?? 1) === metadata.stateVersion ? ok(null) : fail('PLUGIN_DOCUMENT_VERSION', '作者源与精确插件文档版本不符', 'M09'));
        return compatible.ok ? documents.create(metadata) : compatible;
      },
      operations: async (project, { onIssue } = {}) => {
        const acquired = await plugins.acquireDefinitions(project, { allowMissing: true });
        if (!acquired.ok) throw new Error(acquired.error.message);
        acquired.warnings.forEach(issue => onIssue?.(issue));
        try { return new ProductionOperationCatalog((acquired.value.productionOperations ?? []).map(({ definition, provider, messages }) => ({ id: definition.id, version: definition.version, provider, definition, messages }))).list(); }
        finally { await acquired.value.release(); }
      },
      acquireTextPreparation: (key, project, version) => plugins.acquireProvider(key, 'textPreparation', project, version),
      list: (project, options) => plugins.providerCatalog('generationProvider', project, { ...options, allowMissing: true }),
      describe: async (key, project) => {
        const lease = await plugins.acquireProvider(key, 'generationProvider', project);
        try { return { providerKey: key, packageVersion: lease.packageVersion, capabilities: lease.provider.capabilities, execution: lease.provider.execution ?? 'remote' }; }
        finally { await lease.release(); }
      },
      acquire: (snapshot, project) => plugins.acquireProvider(snapshot.providerKey, 'generationProvider', project, snapshot.packageVersion),
    },
    resourceProcessors: { list: (project, options) => plugins.providerCatalog('resourceProcessor', project, { ...options, allowMissing: true }),
      acquire: (key, project) => plugins.acquireProvider(key, 'resourceProcessor', project) },
    resourceProviders: { resolve: (sourcePath, project) => plugins.resolveResourceProvider(sourcePath, project) },
    assetTypes: { acquire: project => plugins.acquireAssetTypes(project) },
  };
}

export async function pluginDocumentReferences(plugins, session, assetId, { allowMissing = false, onIssue } = {}) {
  const lease = await plugins.acquireDefinitions(session, { allowMissing });
  if (!lease.ok) throw new Error(lease.error.message);
  try {
    lease.warnings.forEach(issue => onIssue?.(issue));
    const definitions = new Map(lease.value.documents.map(item => [item.key, item]));
    const index = [...session.documents.values()].find(document => document.files['assets/index.json']);
    const assets = index ? JSON.parse(index.files['assets/index.json']).data.assets : [];
    const references = [];
    for (const document of readPluginDocumentInstances([...session.documents.values()])) {
      const definition = definitions.get(document.contributionKey);
      if (!definition) {
        const issue = { ...fail('PLUGIN_DOCUMENT_PROVIDER', `缺少文档定义 ${document.contributionKey}，无法完整读取素材引用`, 'M09', ['supplyDependency']).error,
          entity: { kind: 'document', id: document.documentId }, source: { documentId: document.documentId, revision: document.revision } };
        if (!allowMissing) throw new Error(issue.message);
        onIssue?.({ ...issue, severity: 'warning' });
        continue;
      }
      for (const ref of definition.collectReferences(document.data)) {
        if (ref.kind !== 'asset' && ref.kind !== 'variant') continue;
        const target = assetReferenceTarget(ref, assets);
        if (!target) throw new Error(`插件文档 ${document.contributionKey}/${document.documentId}@${document.revision} 引用了缺少的素材或版本 ${ref.id}`);
        if (assetId && target.assetId !== assetId) continue;
        references.push({ ...target, owner: { kind: 'document', id: document.documentId },
          source: { documentId: document.documentId, revision: document.revision }, usage: 'pluginDocument', required: true,
          label: document.name });
      }
    }
    return references;
  } finally { await lease.value.release(); }
}
