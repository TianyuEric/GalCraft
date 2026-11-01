import { init, parse } from 'es-module-lexer';
import { readFile } from 'node:fs/promises';
import { posix, join } from 'node:path';
import type { Issue, Json } from '@galcraft/contracts';
import { FieldSpecSchema, validateProductionOperationDefinition } from '@galcraft/contracts';
import type { Contributions } from '../contracts/sdk.js';
import type { PluginManifest } from '../contracts/manifest.js';
import { acquirePluginDefinition, loadPluginEntries } from './module-loader.js';
import { validatePluginData } from '../contracts/validation.js';
import { validateAssetTypeDefinition } from '../contracts/asset-types.js';

const issue = (code: string, message: string): Issue => ({ code, severity: 'error', message, owner: 'M09', related: [], actions: ['edit'] });
const shared = new Set(['@galcraft/plugins/react', '@galcraft/plugins/pixi', 'react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'pixi.js']);
/** Validate the actual emitted ESM graph separately for every execution environment. */
export async function checkPackageGraph(directory: string, manifest: PluginManifest): Promise<Issue[]> {
  await init;
  const issues: Issue[] = [], listed = new Set(manifest.files.map(file => file.path));
  const entries = [...Object.entries(manifest.entry), ...manifest.native.map(item => [`native.${item.target}.${item.arch}`, item.entry])];
  for (const [environment, entry] of entries) {
    if (!entry) continue;
    const visited = new Set<string>();
    const visit = async (file: string): Promise<void> => {
      if (visited.has(file)) return; visited.add(file);
      if (!listed.has(file)) { issues.push(issue('PLUGIN_DEPENDENCY_GRAPH', `${environment}: 未列出依赖文件 ${file}`)); return; }
      if (!/\.[cm]?js$/.test(file)) return;
      const source = await readFile(join(directory, file), 'utf8');
      const imports = parse(source)[0];
      const nativeRequires = [...source.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)].map(match => ({ n: match[2], d: -1 }));
      for (const item of [...imports, ...nativeRequires]) {
        if (item.d === -2) continue; // import.meta
        if (!item.n) { issues.push(issue('PLUGIN_DEPENDENCY_GRAPH', `${environment}: ${file} 含无法闭合的动态导入`)); continue; }
        if (item.n.startsWith('.')) {
          const dependency = posix.normalize(posix.join(posix.dirname(file), item.n.split(/[?#]/)[0]!));
          if (dependency.startsWith('../') || dependency === '..') { issues.push(issue('PLUGIN_DEPENDENCY_GRAPH', `${environment}: ${file} 的导入越出插件包`)); continue; }
          await visit(dependency);
        } else if (!shared.has(item.n) && !((environment === 'services' || environment?.startsWith('native.')) && item.n.startsWith('node:'))) {
          issues.push(issue('PLUGIN_DEPENDENCY_GRAPH', `${environment}: ${file} 的依赖 ${item.n} 需要打入产物`));
        }
        if (environment === 'definition' && shared.has(item.n)) issues.push(issue('PLUGIN_DEFINITION_DOM', `${file}: 定义产物包含界面运行依赖 ${item.n}`));
      }
      if (environment === 'definition' && /\b(?:document\s*\.\s*(?:createElement|querySelector|body|head|documentElement)|window\s*\.)|__GalCraft(?:React|Pixi)/.test(source)) issues.push(issue('PLUGIN_DEFINITION_DOM', `${file}: 定义产物访问界面运行环境`));
    };
    try { await visit(entry); } catch (error) { issues.push(issue('PLUGIN_DEPENDENCY_GRAPH', `${environment}: ${String(error)}`)); }
  }
  for (const file of manifest.files) if (/(?:^|\/)(node_modules|\.env|\.git|test|tests)(?:\/|$)|\.(test|spec)\./.test(file.path))
    issues.push(issue('PLUGIN_PACKAGE_FILE', `开发文件进入包清单：${file.path}`));
  return issues;
}

/** Definition checks run without invoking any Studio or runtime entry. */
export async function checkPluginDefinition(directory: string, manifest: PluginManifest): Promise<Issue[]> {
  const issues: Issue[] = [], lease = await acquirePluginDefinition(directory, manifest);
  try {
    const documents = lease.definition.documents ?? [];
    const assetTypes = lease.definition.assetTypes ?? [];
    for (const definition of lease.definition.productionOperations ?? []) {
      try { validateProductionOperationDefinition(definition, { id: manifest.id, version: manifest.version }, manifest.contributions); }
      catch (error) { issues.push(issue('PLUGIN_PRODUCTION_OPERATION', String(error))); }
    }
    for (const definition of assetTypes) {
      try {
        validateAssetTypeDefinition(definition, { id: manifest.id, version: manifest.version });
        if (!manifest.contributions.some(item => item.kind === 'assetType' && item.key === definition.key)) throw new Error(`Undeclared asset type ${definition.key}`);
        for (const [kind, key] of [['resource', definition.resourceProviderKey], ['stage', definition.stageProviderKey], ['assetEditor', definition.editorKey], ['assetPreview', definition.previewKey], ['assetThumbnail', definition.thumbnailKey]] as const)
          if (key && !manifest.contributions.some(item => item.kind === kind && item.key === key && definition.targets.every(target => item.targets.includes(target)))) throw new Error(`Missing ${kind} association ${key}`);
        if (definition.targets.some(target => !manifest.targets.includes(target))) throw new Error(`Undeclared asset type target ${definition.key}`);
      } catch (error) { issues.push(issue('PLUGIN_ASSET_TYPE', String(error))); }
    }
    for (const declaration of manifest.contributions.filter(item => item.kind === 'assetType'))
      if (assetTypes.filter(item => item.key === declaration.key).length !== 1) issues.push(issue('PLUGIN_DECLARATION', `${declaration.key}: asset type requires a unique definition`));
    for (const messages of Object.values(lease.definition.messages ?? {})) for (const key of Object.keys(messages))
      if (!key.startsWith(`${manifest.id}/`)) issues.push(issue('PLUGIN_LANGUAGE_NAMESPACE', `语言资源 ${key} 需要 ${manifest.id}/ 命名空间`));
    for (const component of lease.definition.components ?? []) {
      if (!manifest.contributions.some(item => item.kind === 'component' && item.key === component.key)) issues.push(issue('PLUGIN_DECLARATION', `组件定义未声明：${component.key}`));
      if (component.propsSchema && component.sampleProps !== undefined) {
        const checked = validatePluginData(component.propsSchema, component.sampleProps);
        if (!checked.ok) issues.push(...checked.issues.map(item => ({ ...item, message: `${component.key}: ${item.message}` })));
      }
    }
    for (const document of documents) {
      if (!manifest.contributions.some(item => item.kind === 'document' && item.key === document.key))
        issues.push(issue('PLUGIN_DECLARATION', `定义未声明：${document.key}`));
      for (const field of document.fields) {
        const result = FieldSpecSchema.safeParse(field);
        if (!result.success) issues.push(issue('PLUGIN_FIELD', `${document.key}/${field.path}: ${result.error.message}`));
        const schema = document.schema as { properties?: Record<string, Json> };
        if (schema.properties && !Object.hasOwn(schema.properties, field.path.split('.')[0]!))
          issues.push(issue('PLUGIN_FIELD_SCHEMA', `${document.key}/${field.path}: 字段没有对应 schema 属性`));
      }
      const valid = document.validate ? document.validate(document.initial) : validatePluginData(document.schema, document.initial);
      if (!valid.ok) issues.push(...valid.issues.map(item => ({ ...item, message: `${document.key}: ${item.message}` })));
    }
    if (manifest.entry.definition) for (const declaration of manifest.contributions.filter(item => item.kind === 'document'))
      if (documents.filter(item => item.key === declaration.key).length !== 1)
        issues.push(issue('PLUGIN_DECLARATION', `${declaration.key}: 定义需要唯一实现`));
  } finally { await lease.release(); }
  return issues;
}

export async function checkPluginImplementations(directory: string, manifest: PluginManifest): Promise<Issue[]> {
  const errors = await checkPackageGraph(directory, manifest);
  if (errors.length) return errors;
  try { errors.push(...await checkPluginDefinition(directory, manifest)); }
  catch (error) { errors.push(issue('PLUGIN_DEFINITION', String(error))); }
  const collections: Record<string, keyof Contributions> = { command: 'commands', condition: 'conditions', document: 'documents', tool: 'tools',
    resource: 'resources', stage: 'stages', page: 'pages', component: 'components', system: 'systems', platform: 'platform',
    textPreparation: 'textPreparations', generationProvider: 'generationProviders', resourceProcessor: 'resourceProcessors', fieldEditor: 'fieldEditors', publishCheck: 'publishChecks', targetBuilder: 'targetBuilders', assetType: 'assetTypes', assetEditor: 'assetEditors', assetPreview: 'assetPreviews', assetThumbnail: 'assetThumbnails', productionOperation: 'productionOperations' };
  const plugin = await loadPluginEntries(directory, manifest, 'all');
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  const names = ['__GalCraftReact__', '__GalCraftReactJsxRuntime__', '__GalCraftReactJsxDevRuntime__', '__GalCraftPixi__', '__GalCraftReactDom__', '__GalCraftReactDomClient__'];
  const previous = new Map(names.map(name => [name, globals[name]]));
  try {
    globals.__GalCraftReact__ ??= (await import('react')).default;
    globals.__GalCraftReactJsxRuntime__ ??= await import('react/jsx-runtime');
    globals.__GalCraftReactJsxDevRuntime__ ??= await import('react/jsx-dev-runtime');
    globals.__GalCraftPixi__ ??= await import('pixi.js');
    globals.__GalCraftReactDom__ ??= await import('react-dom');
    globals.__GalCraftReactDomClient__ ??= await import('react-dom/client');
    const unavailable = () => { throw new Error('开发检查只允许注册贡献，激活时不能调用宿主服务'); };
    const offered = await plugin.activate({ pluginId: manifest.id, target: manifest.targets[0]!,
      domain: { projectId: '10000000-0000-4000-8000-000000000001', kind: 'sample', instance: 'plugin-check' },
      documents: { read: unavailable, propose: unavailable }, assets: { resolve: unavailable }, pages: { open: unavailable }, log: errors.push.bind(errors) });
    for (const declaration of manifest.contributions) {
      const matches = (offered[collections[declaration.kind]!] ?? []).filter(item => ('spec' in item ? item.spec.key : 'id' in item ? item.id : item.key) === declaration.key);
      if (matches.length !== 1) errors.push(issue('PLUGIN_DECLARATION', `${declaration.key}: 声明需要唯一实现（实际 ${matches.length}）`));
    }
    for (const [kind, collection] of Object.entries(collections)) for (const item of offered[collection] ?? []) {
      const key = 'spec' in item ? item.spec.key : 'id' in item ? item.id : item.key;
      if (!manifest.contributions.some(entry => entry.kind === kind && entry.key === key)) errors.push(issue('PLUGIN_DECLARATION', `未声明实现 ${key}`));
      const groups = [
        ...('spec' in item ? [item.spec.fields] : []), ...('fields' in item ? [item.fields ?? []] : []),
        ...('inputFields' in item ? [item.inputFields] : []), ...('configFields' in item ? [item.configFields] : []),
        ...('debugFields' in item ? [item.debugFields] : []), ...('actions' in item ? item.actions.map(action => action.fields) : []),
      ];
      for (const fields of groups) for (const field of fields) {
        const parsed = FieldSpecSchema.safeParse(field);
        if (!parsed.success) errors.push(issue('PLUGIN_FIELD', `${key}/${field.path}: ${parsed.error.message}`));
      }
    }
    if (offered.systems.length > 1) errors.push(issue('PLUGIN_STATE_DUPLICATE', `${manifest.id}: 同包有多个系统状态定义`));
    for (const builder of offered.targetBuilders ?? []) {
      try {
        if (['describe', 'detect', 'prepare', 'validate', 'build'].some(method => typeof builder[method as keyof typeof builder] !== 'function')) throw new Error('目标构建器需要完整目录、检测、准备、校验和构建入口');
        const description = await builder.describe();
        if (description.key !== builder.key || description.version !== manifest.version || description.version !== builder.version || description.target !== builder.target || !manifest.targets.includes(builder.target) || description.entry !== manifest.entry.services)
          throw new Error('目标目录的精确身份、目标或入口与清单不一致');
        if (!description.architectures.length || !description.environments.length || !description.optionsSchema) throw new Error('目标目录需要架构、实际宿主环境和选项 schema');
      } catch (error) { errors.push(issue('PLUGIN_TARGET_BUILDER', `${builder.key}: ${String(error)}`)); }
    }
    for (const [collection, association] of [[offered.assetEditors, 'editorKey'], [offered.assetPreviews, 'previewKey'], [offered.assetThumbnails, 'thumbnailKey']] as const) for (const contribution of collection ?? []) {
      const type = offered.assetTypes?.find(type => (type.builtinKind ?? type.key) === contribution.assetType && type[association] === contribution.key);
      if (!type || typeof contribution.mount !== 'function') errors.push(issue('PLUGIN_ASSET_UI', `${contribution.key}: asset UI must target its own declared type`));
      if ('contexts' in contribution && (!contribution.contexts.length || contribution.contexts.some(context => !['asset', 'command', 'instance'].includes(context)))) errors.push(issue('PLUGIN_ASSET_UI', `${contribution.key}: invalid editor contexts`));
    }
    for (const editor of offered.fieldEditors ?? []) {
      const fields = offered.documents.find(item => item.key === editor.contributionKey)?.fields
        ?? offered.commands.find(item => item.spec.key === editor.contributionKey)?.spec.fields
        ?? offered.productionOperations?.find(item => item.id === editor.contributionKey)?.fields;
      const operationEditor = offered.productionOperations?.some(item => item.id === editor.contributionKey && item.fieldEditorKey === editor.key);
      if (!editor.contributionKey.startsWith(`${manifest.id}/`) || !operationEditor && !fields?.some(field => field.path === editor.fieldKey))
        errors.push(issue('PLUGIN_FIELD_EDITOR', `${editor.key}: 未公开的同插件字段 ${editor.contributionKey}/${editor.fieldKey}`));
    }
  } catch (error) { errors.push(issue('PLUGIN_ACTIVATION', String(error))); }
  finally { await plugin.deactivate(); for (const [name, value] of previous) {
    if (value === undefined) delete globals[name]; else globals[name] = value;
  } }
  return errors;
}
