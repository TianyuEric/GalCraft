import { createId, reserveIds } from '@galcraft/contracts';
import { RuntimeTemplateSchema, IdSchema } from '@galcraft/contracts';
import type { ComponentConfig, DocumentView, EditInput, Id, Json, RuntimeTemplate, Visual, TemplateSourceRecord } from '@galcraft/contracts';
import { createTemplateDocuments } from './documents.js';
import { copyComponentText } from './component-text.js';

export function components(root: ComponentConfig): ComponentConfig[] { return [root, ...root.children.flatMap(components)]; }
export function findComponent(template: RuntimeTemplate, id: Id): ComponentConfig | undefined {
  return template.pages.flatMap(page => components(page.root)).find(item => item.id === id);
}
export function moveComponents(template: RuntimeTemplate, ids: Id[], dx: number, dy: number): RuntimeTemplate {
  const next = structuredClone(template);
  for (const id of ids) {
    const component = findComponent(next, id); if (!component || component.locked) continue;
    if (component.layout.x.unit !== 'px' || component.layout.y.unit !== 'px') throw new Error('组合移动需要先将偏移转换为设计像素');
    component.layout.x.value += dx; component.layout.y.value += dy;
  }
  return RuntimeTemplateSchema.parse(next);
}
export function explainVisual(template: RuntimeTemplate, componentId: Id, field: keyof Visual,
  state: keyof ComponentConfig['states'] | 'normal' = 'normal', playerValue?: unknown,
  computed?: unknown, matchingSources: { path: string; line: number }[] = []) {
  const component = findComponent(template, componentId); if (!component) throw new Error('组件不存在');
  const layers: { source: string; value: unknown }[] = [{ source: 'template', value: template.defaultVisual[field] }];
  if (component.normal[field] !== undefined) layers.push({ source: 'component', value: component.normal[field] });
  if (state !== 'normal' && component.states[state]?.[field] !== undefined) layers.push({ source: state, value: component.states[state]![field] });
  if (playerValue !== undefined) layers.push({ source: 'player', value: playerValue });
  return { field, layers, computed: computed ?? layers.at(-1)!.value, matchingSources };
}
export function templateEdit(documents: DocumentView[], next: RuntimeTemplate, label: string, sourceRecord?: TemplateSourceRecord): EditInput {
  RuntimeTemplateSchema.parse(next);
  reserveIds(documents);
  const generated = createTemplateDocuments(next, () => createId(documents), sourceRecord ?? null);
  const byPath = new Map(documents.flatMap(doc => Object.keys(doc.files).map(path => [path, doc] as const)));
  const root = generated[0]!;
  const rootData = JSON.parse(root.files['ui/template.json']!);
  for (const [locale] of Object.entries(next.locales)) {
    const path = `ui/locales/${locale}.json`, old = byPath.get(path), created = generated.find(doc => path in doc.files)!;
    if (old) { created.documentId = old.documentId; const data = JSON.parse(created.files[path]!); data.documentId = old.documentId;
      created.files[path] = JSON.stringify(data); rootData.data.localeIds[locale] = old.documentId; }
  }
  root.files['ui/template.json'] = JSON.stringify(rootData);
  const edit: EditInput = { label, origin: 'template', expected: [], patches: [], preparedAssets: [], requiredRefs: [] };
  for (const target of generated) {
    const [path, raw] = Object.entries(target.files)[0]!;
    const before = byPath.get(path), data = JSON.parse(raw).data as Json;
    if (before) {
      const previous = JSON.parse(before.files[path]!).data as Json;
      if (JSON.stringify(previous) === JSON.stringify(data)) continue;
      edit.expected.push({ ref: { kind: 'document', id: before.documentId }, revision: before.revision });
      edit.patches.push({ kind: 'json', documentId: before.documentId, changes: [{ path: '/data', before: previous, after: data, op: 'set' }] });
    } else edit.patches.push({ kind: 'document', documentId: target.documentId, op: 'create', before: null,
      after: { documentId: target.documentId, format: target.format, files: target.files } });
  }
  return edit;
}
export function instantiateTemplate(source: RuntimeTemplate, mapAsset: (id: Id) => Id = id => id,
  mapVariant: (id: Id) => Id = id => id, ids = new Map<string, string>()): RuntimeTemplate {
  reserveIds([source,ids]);
  const fresh = (id: string) => { if (!ids.has(id)) ids.set(id, createId()); return ids.get(id)!; };
  fresh(source.instanceId);
  for (const page of source.pages) { fresh(page.id); fresh(page.portalRootId); components(page.root).forEach(item => fresh(item.id)); }
  source.styles.forEach(style => fresh(style.id)); source.animations.forEach(animation => fresh(animation.id));
  const visit = (schema: any, value: any, key = ''): any => {
    if (value === null || value === undefined) return value;
    if (schema === IdSchema) {
      if (['assetId', 'imageId', 'fontId', 'assets'].includes(key)) return mapAsset(value);
      if (key === 'variantId') return mapVariant(value);
      return ids.get(value) ?? value;
    }
    switch (schema.type) {
      case 'optional': case 'nullable': case 'default': return visit(schema.unwrap(), value, key);
      case 'lazy': return visit(schema.def.getter(), value, key);
      case 'object': return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, schema.shape[name] ? visit(schema.shape[name], item, name) : item]));
      case 'array': return value.map((item: unknown) => visit(schema.element, item, key));
      case 'record': return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(schema.valueType, item, key)]));
      case 'union': { const branch = schema.options.find((option: any) => option.safeParse(value).success); return branch ? visit(branch, value, key) : value; }
      default: return typeof value === 'string' && ['sourcePath', 'compiledPath'].includes(key) ? rewriteTemplatePath(value, ids) : value;
    }
  };
  const next = RuntimeTemplateSchema.parse(visit(RuntimeTemplateSchema, source));
  for (const page of source.pages) for (const original of components(page.root)) {
    const copy = findComponent(next, ids.get(original.id)!); if (!copy) continue;
    copyComponentText(next.locales, original, copy);
    if (typeof original.content.labelOverrideKey === 'string') for (const strings of Object.values(next.locales)) delete strings[original.content.labelOverrideKey];
  }
  return next;
}
export function rewriteTemplatePath(path: string, ids: ReadonlyMap<Id, Id>): string {
  return path.split('/').map(part => { const [id, ...suffix] = part.split('.'); return (ids.get(id!) ?? id!) + (suffix.length ? `.${suffix.join('.')}` : ''); }).join('/');
}
export function rewriteTemplateCss(css: string, ids: ReadonlyMap<Id, Id>, mapAsset: (id: Id) => Id): string {
  const token = '(?:[0-9a-f-]{36}|[A-Za-z0-9]{6})';
  return css.replace(new RegExp(`asset:(${token})(?![A-Za-z0-9-])`, 'g'), (_match, id: string) => `asset:${mapAsset(id)}`)
    .replace(/(@(?:use|forward|import)\s+["'])([^"']+)(["'])/g, (_match, prefix: string, path: string, suffix: string) => prefix + rewriteTemplatePath(path, ids) + suffix)
    .replace(new RegExp(`(data-gc-(?:player|page-id|component)\\s*=\\s*["'])(${token})(["'])`, 'g'), (_match, prefix: string, id: string, suffix: string) => prefix + (ids.get(id) ?? id) + suffix)
    .replace(new RegExp(`\\bgc-(${token})-(${token})-`, 'g'), (_match, instance: string, style: string) => `gc-${ids.get(instance) ?? instance}-${ids.get(style) ?? style}-`);
}
export { planTemplate } from './switching.js';
