import { createId } from '@galcraft/contracts';

import { z } from 'zod';
import { AssetSchema, AuthoringOutlineSchema, CharacterSchema, FlowSchema, GalleryEntrySchema, IdSchema, JsonSchema, LockSchema, PageConfigSchema,
  PerformancePresetSchema, ProductionItemSchema, ProjectSchema, RuntimeTemplateSchema, SceneSchema, VariableSchema, DebugScenarioSchema, TemplateSourceRecordSchema, normalizeCharacterAuthoringData, normalizeProjectAuthoringData, type Id, type Json } from '@galcraft/contracts';
import { rewriteScriptReferences, scriptOwnedIds, commandOwnedIds, rewriteCommandReferences, rewriteFieldReferences, createCommandRegistry } from '@galcraft/dsl';
import { readTemplateDocuments } from '@galcraft/templates';
import { compileStyle } from '@galcraft/templates/compiler';
import type { WorkingDocument } from '@galcraft/documents';
import type { BackupProviders, DocumentIdentityProvider } from './types.js';

const TemplateRootSchema = z.object({ template: RuntimeTemplateSchema.omit({ pages: true, locales: true }), pageIds: z.array(IdSchema), localeIds: z.record(z.string(), IdSchema) });
const personal = new Set(['connectionId', 'taskId', 'candidateId', 'selectedCandidateId']);
function schemaFor(path: string, providers: BackupProviders): DocumentIdentityProvider | null {
  if (path === 'ui/template-source.json') return { schema: TemplateSourceRecordSchema, rewrite: (data, mapping) => ({ ...data,
    identities: Object.fromEntries(Object.entries(data.identities).map(([source, instance]) => [source, mapping[instance as string] ?? instance])),
    hiddenPages: walk(z.array(PageConfigSchema), data.hiddenPages, id => mapping[id] ?? id),
  }) };
  const external = providers.documentProvider?.(path); if (external) return external;
  const schema = path === 'project.json' ? ProjectSchema : path === 'dependencies.lock.json' ? LockSchema : path === 'assets/index.json' ? z.object({ assets: z.array(AssetSchema) })
    : path === 'ui/template.json' ? TemplateRootSchema : /^ui\/pages\//.test(path) ? PageConfigSchema
      : /^ui\/locales\//.test(path) ? JsonSchema : /\/scene.json$/.test(path) ? SceneSchema
        : /^characters\//.test(path) ? CharacterSchema : /^variables\//.test(path) ? VariableSchema
          : /^gallery\//.test(path) ? GalleryEntrySchema : /^flows\//.test(path) ? FlowSchema
            : /^presentation\/presets\//.test(path) ? PerformancePresetSchema : /^authoring\/debug\//.test(path) ? DebugScenarioSchema : path === 'authoring/outline.json' ? AuthoringOutlineSchema
              : /(?:production|work-order)\.json$/.test(path) ? z.object({ items: z.array(ProductionItemSchema) }) : null;
  return schema ? { schema } : null;
}
// The schema determines reference positions. Free text and opaque JSON remain unchanged.
function walk(schema: any, data: any, id: (value: Id, path: string[]) => Id, path: string[] = []): any {
  if (data === undefined || data === null || schema === JsonSchema) return data;
  if (schema === IdSchema) return personal.has(path.at(-1)!) ? data : id(data, path);
  switch (schema.type) {
    case 'optional': case 'nullable': case 'default': case 'prefault': case 'readonly': return walk(schema.unwrap(), data, id, path);
    case 'lazy': return walk(schema.def.getter(), data, id, path);
    case 'object': return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, schema.shape[key] ? walk(schema.shape[key], value, id, [...path, key]) : value]));
    case 'array': return data.map((value: any, index: number) => walk(schema.element, value, id, [...path, String(index)]));
    case 'record': return Object.fromEntries(Object.entries(data).map(([key, value]) => [schema.keyType === IdSchema ? id(key, [...path, '<key>']) : key, walk(schema.valueType, value, id, [...path, key])]));
    case 'union': { const branch = schema.options.find((option: any) => option.safeParse(data).success); if (!branch) throw new Error(`引用字段形状无效：${path.join('.')}`); return walk(branch, data, id, path); }
    default: return data;
  }
}
export function rewriteProjectPath(path: string, mapping: Record<Id, Id>): string {
  const parts = path.split('/');
  if (path.startsWith('assets/files/')) return parts.map((part, index) => index === 2 || index === 3 ? mapping[part] ?? part : part).join('/');
  return parts.map(part => { const match = /^([0-9a-f-]{36}|[A-Za-z0-9]{6})(\.[^/]*)?$/.exec(part); return match && mapping[match[1]!] ? mapping[match[1]!]! + (match[2] ?? '') : mapping[part] ?? part; }).join('/');
}
export function enumerateIdentities(documents: WorkingDocument[], providers: BackupProviders, include: (id: Id) => boolean = () => true): Record<Id, Id> {
  const mapping: Record<Id, Id> = {}, remember = (id: Id) => { IdSchema.parse(id); if (include(id)) mapping[id] ??= createId(documents); return id; };
  for (const document of documents) {
    remember(document.documentId);
    for (const [path, text] of Object.entries(document.files)) {
      if (path.endsWith('.gal')) { scriptOwnedIds({ documentId: document.documentId, revision: document.revision, text }).forEach(remember); continue; }
      if (!path.endsWith('.json')) continue;
      const envelope = JSON.parse(text); if (!envelope.documentId) continue;
      const plugin = providers.pluginDocuments(path);
      if (path.startsWith('plugins/')) { if (!plugin) throw new Error(`缺少插件文档引用提供方：${path}`); plugin.collectReferences(envelope.data).forEach(ref => remember(ref.id)); continue; }
      const provider = schemaFor(path, providers); if (!provider) throw new Error(`缺少文档身份描述：${path}`);
      const data: any = provider.schema.parse(path === 'project.json' ? normalizeProjectAuthoringData(envelope.data) : path.startsWith('characters/') ? normalizeCharacterAuthoringData(envelope.data) : envelope.data);
      if (path === 'ui/template-source.json') { Object.values(data.identities).forEach(id => remember(id as Id)); walk(z.array(PageConfigSchema), data.hiddenPages, remember); continue; }
      if (path === 'assets/index.json') for (const asset of data.assets) for (const variant of asset.variants) if (variant.typeData || asset.kind.includes('/')) {
        if (!providers.assetTypes) throw new Error(`缺少素材类型引用提供方：${asset.kind}`);
        const references = providers.assetTypes.references(asset.kind, variant.typeData);
        if (!references.ok) throw new Error(references.error.message);
        references.value.forEach(ref => remember(ref.id));
      }
      walk(provider.schema, data, remember); provider.ownedIds?.(data).forEach(remember);
      if (path.startsWith('presentation/presets/')) for (const statement of data.statements) commandOwnedIds(statement.command, statement.args).forEach(remember);
      if (path.startsWith('authoring/debug/') && Object.keys(data.pluginInitial).length && !provider.rewrite) throw new Error(`调试插件初值需要引用重写提供方：${path}`);
    }
  }
  return mapping;
}
export function rewriteDocuments(documents: WorkingDocument[], mapping: Record<Id, Id>, providers: BackupProviders, engineVersion: string): WorkingDocument[] {
  const rewritten = documents.map(document => {
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(document.files)) {
      let content = text;
      if (path.endsWith('.gal')) content = rewriteScriptReferences({ documentId: document.documentId, revision: document.revision, text }, mapping, engineVersion, providers.pluginCommands?.());
      else if (path.endsWith('.json')) {
        const envelope = JSON.parse(text);
        if (envelope.documentId) {
          envelope.documentId = mapping[envelope.documentId] ?? envelope.documentId;
          if (path.startsWith('plugins/')) {
            const provider = providers.pluginDocuments(path); if (!provider?.rewriteReferences) throw new Error(`插件不提供 rewriteReferences：${path}`);
            const rewritten = provider.rewriteReferences(envelope.data as Json, mapping); if (!rewritten.ok) throw new Error(rewritten.error.message); envelope.data = rewritten.value;
            if (provider.collectReferences(envelope.data).some(ref => mapping[ref.id])) throw new Error(`插件重写后仍引用旧身份：${path}`);
          } else {
            const provider = schemaFor(path, providers); if (!provider) throw new Error(`缺少文档身份描述：${path}`);
            const data: any = provider.schema.parse(path === 'project.json' ? normalizeProjectAuthoringData(envelope.data) : path.startsWith('characters/') ? normalizeCharacterAuthoringData(envelope.data) : envelope.data); envelope.data = provider.rewrite ? provider.rewrite(data, mapping) : walk(provider.schema, data, id => mapping[id] ?? id);
            if (path === 'assets/index.json') for (const asset of envelope.data.assets) for (const variant of asset.variants) if (variant.typeData || asset.kind.includes('/')) {
              if (!providers.assetTypes) throw new Error(`缺少素材类型重写提供方：${asset.kind}`);
              const rewritten = providers.assetTypes.rewrite(asset.kind, variant.typeData, mapping);
              if (!rewritten.ok) throw new Error(rewritten.error.message);
              if (rewritten.value) variant.typeData = rewritten.value;
            }
            if (path.startsWith('ui/pages/')) {
              const definitions = providers.pluginComponents?.() ?? [];
              const rewriteComponent = (component: any): void => {
                if (component.plugin) {
                  const definition = definitions.find(item => item.key === component.plugin.key);
                  if (!definition) throw new Error(`缺少插件组件字段描述：${component.plugin.key}`);
                  const props = component.plugin.props;
                  if (props && typeof props === 'object' && !Array.isArray(props))
                    component.plugin.props = rewriteFieldReferences(props, definition.fields ?? [], mapping);
                }
                for (const child of component.children ?? []) rewriteComponent(child);
              };
              rewriteComponent(envelope.data.root);
            }
            if (path.startsWith('presentation/presets/')) envelope.data.statements = data.statements.map((statement: any) => ({ ...statement, args: rewriteCommandReferences(statement.command, statement.args, mapping, createCommandRegistry(engineVersion, providers.pluginCommands?.())) }));
            if (path === 'ui/template.json') for (const style of envelope.data.template.styles) { style.sourcePath = rewriteProjectPath(style.sourcePath, mapping); if (style.compiledPath) style.compiledPath = rewriteProjectPath(style.compiledPath, mapping); }
            provider.schema.parse(envelope.data);
          }
          content = JSON.stringify(envelope, null, 2) + '\n';
        }
      } else if (/\.(css|scss)$/.test(path)) {
        content = text.replace(/asset:([0-9a-f-]{36}|[A-Za-z0-9]{6})/g, (_, id: string) => `asset:${mapping[id] ?? id}`)
          .replace(/(data-gc-(?:player|page-id|component)\s*=\s*["'])([0-9a-f-]{36}|[A-Za-z0-9]{6})/g, (_, prefix: string, id: string) => prefix + (mapping[id] ?? id));
      }
      files[rewriteProjectPath(path, mapping)] = content;
    }
    return { ...document, documentId: mapping[document.documentId] ?? document.documentId, files, savedFiles: structuredClone(files), dirty: false };
  });
  const template = readTemplateDocuments(rewritten), root = rewritten.find(document => 'ui/template.json' in document.files)!;
  const modules = Object.assign({}, ...rewritten.map(document => document.files));
  for (const style of template.styles) {
    const compiled = compileStyle({ style, source: modules[style.sourcePath], instanceId: template.instanceId, modules });
    if (!compiled.css || compiled.style.issues.some(issue => issue.severity === 'error')) throw new Error(`复制样式编译失败：${style.name}`);
    root.files[style.compiledPath!] = compiled.css;
    for (const path of Object.keys(root.files).filter(path => path.endsWith('.map') && (path.startsWith(style.sourcePath) || path.startsWith(style.compiledPath!)))) if (compiled.sourceMap) root.files[path] = compiled.sourceMap;
  }
  for (const document of rewritten) document.savedFiles = structuredClone(document.files);
  return rewritten;
}
