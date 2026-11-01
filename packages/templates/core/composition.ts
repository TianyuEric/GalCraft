import { createId } from '@galcraft/contracts';
import { configProperties, cssLeaves, styleTargets, type StyleMatchResolver, type StyleMatchRequest } from './property-owners.js';
import { RuntimeTemplateSchema, VisualSchema, LayoutSchema, BackgroundSchema } from '@galcraft/contracts';
import type { DocumentView, EditInput, Id, Issue, Json, NamedStyle, RuntimeTemplate, VersionRef } from '@galcraft/contracts';
import { components, templateEdit } from './editing.js';
import { readTemplateDocuments } from './documents.js';
import { compileStyle, collectStyleModules } from './compiler.js';
import { templateIssues } from './package.js';

export type UIAssetRef = { kind: 'existing'; assetId: Id; variantId: Id } | { kind: 'candidate'; key: string };
export type UIConfigChange = { key: string; pageId: Id; componentId: Id | null; path: string; operation: 'set' | 'clear'; value: Json; dependsOn: string[] };
export type UIStyleChange = { key: string; styleId: Id | null; name: string; scope: { pageId: Id; componentId: Id | null }; language: 'css' | 'scss'; source: string; dependsOn: string[] };
export type UIPatchProposal = { summary: string; config: UIConfigChange[]; styles: UIStyleChange[]; assets: { key: string; source: UIAssetRef; use: 'icon' | 'frame' | 'background' | 'texture' | 'logo' | 'decoration' }[] };
export type UIComposition = { id: Id; revision: number; planId: Id; candidateId: Id; baseVersions: VersionRef[]; proposal: UIPatchProposal;
  resources: { key: string; taskId: Id; candidateId: Id; artifactIndex: number }[];
  propertyOwners: { pageId: Id; componentId: Id | null; state: string; property: string; owner: 'config' | 'style'; changeKey: string }[]; issues: Issue[] };

function candidateKeys(value: unknown): string[] {
  if (typeof value === 'string') return [...value.matchAll(/candidate-asset:([a-zA-Z][\w-]*)/g)].map(match => match[1]!);
  if (Array.isArray(value)) return value.flatMap(candidateKeys);
  if (value && typeof value === 'object') { const object = value as Record<string, unknown>;
    return object.kind === 'candidate' && typeof object.key === 'string' ? [object.key] : Object.values(object).flatMap(candidateKeys); }
  return [];
}
export function compositionClosure(composition: UIComposition, changeKeys: string[], assetKeys: string[]): string[] {
  const all = [...composition.proposal.config, ...composition.proposal.styles, ...composition.proposal.assets];
  const entries = new Map(all.map(entry => [entry.key, entry]));
  if (entries.size !== all.length || all.some(entry => !/^[a-zA-Z][\w-]*$/.test(entry.key))) throw new Error('组合 key 重复或无效');
  const result = new Set<string>(), visiting = new Set<string>();
  const visit = (key: string) => {
    if (visiting.has(key)) throw new Error(`组合依赖环：${key}`);
    if (result.has(key)) return; const entry = entries.get(key); if (!entry) throw new Error(`组合依赖缺失：${key}`);
    visiting.add(key);
    for (const dependency of [...('dependsOn' in entry ? entry.dependsOn : []), ...('value' in entry ? candidateKeys(entry.value) : 'source' in entry && typeof entry.source === 'string' ? candidateKeys(entry.source) : [])]) visit(dependency);
    visiting.delete(key); result.add(key);
  };
  [...changeKeys, ...assetKeys].forEach(visit); return [...result];
}
function setPublic(target: any, path: string, value: Json, clear: boolean, component: boolean) {
  const parts = path.replace(/^\//, '').split(/[/.]/), root = parts.shift()!;
  if (!component && !['layout', 'background'].includes(root)) throw new Error(`页面字段未公开：${path}`);
  if (component && !['normal', 'states', 'layout', 'visible', 'locked'].includes(root)) throw new Error(`组件字段未公开：${path}`);
  if (parts.some(part => !part || ['__proto__', 'constructor', 'prototype'].includes(part))) throw new Error('字段路径无效');
  if (root === 'visible' || root === 'locked') { if (parts.length || clear || typeof value !== 'boolean') throw new Error('布尔字段无效'); target[root] = value; return; }
  let schema: any = root === 'layout' ? LayoutSchema : root === 'background' ? BackgroundSchema : VisualSchema;
  if (root === 'states') { const state = parts.shift()!; if (!['hover', 'pressed', 'focus', 'disabled'].includes(state)) throw new Error('未公开的状态'); target.states[state] ??= {}; target = target.states; target[state] ??= {}; return setPublic({ normal: target[state] }, `normal.${parts.join('.')}`, value, clear, true); }
  let cursor = target[root] ??= {};
  for (const [index, part] of parts.entries()) {
    if (schema?.shape) { if (!schema.shape[part]) throw new Error(`字段未公开：${path}`); schema = schema.shape[part]; }
    if (index === parts.length - 1) { if (clear) { if (!component || root !== 'normal' || value !== null) throw new Error('字段不允许继承清除'); delete cursor[part]; } else cursor[part] = value; }
    else { cursor[part] ??= {}; cursor = cursor[part]; }
  }
  if (!parts.length) throw new Error('必须指定公开叶字段');
}
export function prepareComposition(input: { composition: UIComposition; documents: DocumentView[]; keys: string[];
  assets: Map<string, { assetId: Id; variantId: Id; active: boolean }>; validateAsset: (id: Id, variantId?: Id) => boolean; resolveStyleMatches?: StyleMatchResolver; deferStyleMatches?: boolean }): { edit: EditInput; template: RuntimeTemplate; propertyOwners: UIComposition['propertyOwners']; unresolvedStyleMatches: StyleMatchRequest[] } {
  const { composition, documents } = input, next = readTemplateDocuments(documents), selected = new Set(input.keys);
  const owners: UIComposition['propertyOwners'] = [], modules = Object.assign({}, ...documents.map(document => document.files)) as Record<string, string>;
  const unresolvedStyleMatches: StyleMatchRequest[] = [];
  const targets = (page: typeof next.pages[number], componentId: Id | null, declaration: { selector: string; property: string; value: string }) =>
    styleTargets(page, componentId, declaration.selector, declaration.property, declaration.value, input.resolveStyleMatches, input.deferStyleMatches ? unresolvedStyleMatches : undefined);
  const resource = (reference: UIAssetRef) => {
    const asset = reference.kind === 'existing' ? { assetId: reference.assetId, variantId: reference.variantId, active: true } : input.assets.get(reference.key);
    if (!asset || !input.validateAsset(asset.assetId, asset.variantId)) throw new Error('组合素材尚未准备'); return asset;
  };
  const rewrite = (value: any): any => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') {
      if (value.kind === 'candidate' || value.kind === 'existing') { const asset = resource(value); if (!asset.active) throw new Error('浮动引用须采用活动版本或复制为独立素材'); return asset.assetId; }
      if (value.source?.kind) { const asset = resource(value.source), { source: _, ...rest } = value; return { ...rest, assetId: asset.assetId, variantId: asset.variantId }; }
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
    } return value;
  };
  const addOwner = (owner: UIComposition['propertyOwners'][number]) => {
    if (owners.some(previous => previous.pageId === owner.pageId && (previous.componentId === owner.componentId || previous.componentId === null || owner.componentId === null) && previous.state === owner.state && previous.property === owner.property && previous.changeKey !== owner.changeKey)) throw new Error(`属性存在多个修改来源：${owner.property}`);
    if (!owners.some(previous => previous.pageId === owner.pageId && previous.componentId === owner.componentId && previous.state === owner.state && previous.property === owner.property && previous.changeKey === owner.changeKey)) owners.push(owner);
  };
  for (const change of composition.proposal.config.filter(change => selected.has(change.key))) {
    const page = next.pages.find(page => page.id === change.pageId), component = change.componentId && page ? components(page.root).find(value => value.id === change.componentId) : null;
    if (!page || change.componentId && !component) throw new Error('目标页面或组件不存在');
    setPublic(component || page, change.path, rewrite(change.value), change.operation === 'clear', !!component);
    const { state, properties } = configProperties(change.path);
    for (const property of properties) addOwner({ pageId: page.id, componentId: component ? component.id : page.root.id, state, property, owner: 'config', changeKey: change.key });
  }
  for (const style of next.styles.filter(style => owners.some(owner => owner.owner === 'config' && owner.pageId === style.scope.pageId && (!style.scope.componentId || owner.componentId === style.scope.componentId)) && !composition.proposal.styles.some(change => selected.has(change.key) && change.styleId === style.id))) {
    const compiled = compileStyle({ style, source: modules[style.sourcePath] ?? '', instanceId: next.instanceId, modules });
    const page = next.pages.find(page => page.id === style.scope.pageId)!;
    for (const declaration of compiled.declarations) for (const target of targets(page, style.scope.componentId, declaration)) {
      if (owners.some(owner => owner.owner === 'config' && owner.pageId === page.id && owner.componentId === target.componentId && (owner.state === target.state || target.state === 'normal') && cssLeaves(declaration.property).includes(owner.property))) throw new Error(`已有样式覆盖配置，请修改或清除该规则：${style.sourcePath}:${declaration.line}`);
    }
  }
  const styleFiles: { path: string; content: string }[] = [];
  for (const change of composition.proposal.styles.filter(change => selected.has(change.key))) {
    const previous = change.styleId ? next.styles.find(style => style.id === change.styleId) : null;
    if (change.styleId && !previous || previous && previous.language !== change.language) throw new Error('原样式身份或源码语言不匹配');
    const page = next.pages.find(page => page.id === change.scope.pageId); if (!page || change.scope.componentId && !components(page.root).some(value => value.id === change.scope.componentId)) throw new Error('样式范围无效');
    const id = previous?.id ?? createId(input);
    const style: NamedStyle = { id, name: change.name, scope: change.scope, activation: previous ? previous.activation : 'page', language: change.language, sourcePath: previous?.sourcePath ?? `ui/styles/${id}.${change.language}`,
      sourceRevision: (previous?.sourceRevision ?? 0) + 1, compiledPath: previous?.compiledPath ?? `ui/styles/${id}.compiled.css`, compiledSourceRevision: null, assets: [], issues: [] };
    const source = change.source.replace(/candidate-asset:([a-zA-Z][\w-]*)/g, (_, key: string) => { const asset = resource({ kind: 'candidate', key }); if (!asset.active) throw new Error('CSS 浮动引用需要活动版本'); return `asset:${asset.assetId}`; });
    if (change.language === 'scss') collectStyleModules(style.sourcePath, source, modules);
    const compiled = compileStyle({ style, source, instanceId: next.instanceId, modules });
    if (compiled.css === null || compiled.style.issues.length) throw new Error(compiled.style.issues.map(issue => issue.message).join('; ') || '样式编译失败');
    for (const id of compiled.style.assets) if (!input.validateAsset(id)) throw new Error(`样式素材缺失：${id}`);
    const declarations = new Map<string, typeof compiled.declarations[number]>();
    for (const declaration of compiled.declarations) declarations.set(`${declaration.selector}/${declaration.property}`, declaration);
    for (const declaration of declarations.values()) {
      for (const target of targets(page, change.scope.componentId, declaration)) for (const property of cssLeaves(declaration.property))
        addOwner({ pageId: change.scope.pageId, componentId: target.componentId, state: target.state, property, owner: 'style', changeKey: change.key });
    }
    if (previous) next.styles[next.styles.indexOf(previous)] = compiled.style; else next.styles.push(compiled.style);
    styleFiles.push({ path: style.sourcePath, content: source }, { path: compiled.style.compiledPath!, content: compiled.css });
  }
  RuntimeTemplateSchema.parse(next);
  const issues = templateIssues(next); if (issues.length) throw new Error(issues.join('; '));
  const edit = templateEdit(documents, next, '采用页面组合'); edit.origin = 'candidate';
  const root = documents.find(document => 'ui/template.json' in document.files)!;
  for (const file of styleFiles) edit.patches.push({ kind: 'file', documentId: root.documentId, path: file.path, before: root.files[file.path] ?? null, after: file.content });
  if (styleFiles.length && !edit.expected.some(value => value.ref.id === root.documentId)) edit.expected.push({ ref: { kind: 'document', id: root.documentId }, revision: root.revision });
  return { edit, template: next, propertyOwners: owners, unresolvedStyleMatches };
}
