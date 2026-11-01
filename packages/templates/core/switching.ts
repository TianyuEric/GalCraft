import { createId, RuntimeTemplateSchema, TemplateSwitchOptionsSchema } from '@galcraft/contracts';
import type { DocumentView, Id, Json, PageConfig, RuntimeTemplate, TemplateSourceRecord, TemplateSwitchOptions } from '@galcraft/contracts';
import { components, instantiateTemplate, rewriteTemplateCss, rewriteTemplatePath, templateEdit } from './editing.js';
import { createTemplateSource, readTemplateDocuments, readTemplateSource } from './documents.js';
import { missingRequiredEntrances } from './templates.js';
import { compileStyle } from './compiler.js';

export type TemplateConflict = { path: string; kind: 'field' | 'missingBaseline' | 'reference'; before: unknown; current: unknown; incoming: unknown; resolution: 'current' | 'incoming' | null };
export type TemplateChange = { path: string; outcome: 'current' | 'incoming' | 'conflict'; before: unknown; current: unknown; incoming: unknown };
export type TemplateSwitchInput = { baseline?: TemplateSourceRecord | null; options?: TemplateSwitchOptions; sourceFiles?: Record<string, string>; currentFiles?: Record<string, string> };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const pointer = (s: string) => s.replaceAll('~', '~0').replaceAll('/', '~1');

/** Match package entities to their already adopted identities before comparing fields. */
function identitiesFor(current: RuntimeTemplate, source: RuntimeTemplate, baseline: TemplateSourceRecord | null): Map<Id, Id> {
  const ids = new Map<Id, Id>([[source.instanceId, current.instanceId]]);
  const old = baseline?.source;
  for (const page of source.pages) {
    const target = current.pages.find(item => item.key === page.key) ?? baseline?.hiddenPages.find(item => item.key === page.key);
    if (!target) continue;
    ids.set(page.id, target.id); ids.set(page.portalRootId, target.portalRootId);
    const previous = old?.pages.find(item => item.key === page.key);
    const targetComponents = components(target.root), sourceComponents = components(page.root);
    for (const component of sourceComponents) {
      const adopted = baseline?.identities[component.id];
      const oldComponent = previous && components(previous.root).find(item => item.id === component.id);
      const exact = targetComponents.find(item => item.id === adopted || item.id === component.id || oldComponent && item.id === baseline?.identities[oldComponent.id]);
      const candidates = targetComponents.filter(item => item.part === component.part);
      const unique = candidates.length === 1 && sourceComponents.filter(item => item.part === component.part).length === 1 ? candidates[0] : undefined;
      if (exact ?? unique) ids.set(component.id, (exact ?? unique)!.id);
    }
  }
  for (const style of source.styles) {
    const exact = current.styles.find(item => item.id === baseline?.identities[style.id] || item.id === style.id);
    const named = current.styles.filter(item => item.name === style.name && item.scope.pageId === ids.get(style.scope.pageId));
    if (exact ?? (named.length === 1 ? named[0] : undefined)) ids.set(style.id, (exact ?? named[0])!.id);
  }
  for (const animation of source.animations) {
    const exact = current.animations.find(item => item.id === baseline?.identities[animation.id] || item.id === animation.id);
    const named = current.animations.filter(item => item.name === animation.name);
    if (exact ?? (named.length === 1 ? named[0] : undefined)) ids.set(animation.id, (exact ?? named[0])!.id);
  }
  return ids;
}

export function planTemplate(current: RuntimeTemplate, source: RuntimeTemplate, keepPublicPaths: string[] = [], input: TemplateSwitchInput = {}) {
  const options = TemplateSwitchOptionsSchema.parse(input.options ?? {}), baseline = input.baseline ?? null;
  const ids = identitiesFor(current, source, baseline);
  const incoming = instantiateTemplate(source, id => ids.get(id) ?? id, id => ids.get(id) ?? id, ids);
  incoming.instanceId = current.instanceId;
  const previous = baseline ? instantiateTemplate(baseline.source, id => baseline.identities[id] ?? id, id => baseline.identities[id] ?? id, new Map(Object.entries(baseline.identities))) : null;
  const conflicts: TemplateConflict[] = [], changes: TemplateChange[] = [];
  const resolution = (path: string): 'current' | 'incoming' | null => options.resolutions?.[path] ?? null;
  const merge = (before: any, now: any, future: any, path: string): any => {
    if (same(now, future)) return structuredClone(now);
    if (same(before, now)) { if (!same(now, future)) changes.push({ path, outcome: 'incoming', before, current: now, incoming: future }); return structuredClone(future); }
    if (same(before, future)) { changes.push({ path, outcome: 'current', before, current: now, incoming: future }); return structuredClone(now); }
    if (object(now) && object(future) && (object(before) || before === undefined)) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(future), ...Object.keys(now), ...Object.keys(before ?? {})])) {
        const value = merge(before?.[key], now[key], future[key], `${path}/${pointer(key)}`); if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if (Array.isArray(now) && Array.isArray(future) && (!before || Array.isArray(before))) {
      const key = (v: any) => object(v) ? typeof v.id === 'string' ? v.id : typeof v.kind === 'string' && typeof v.version === 'string' ? `${v.kind}:${v.id}` : null : null;
      if ([...now, ...future, ...(before ?? [])].every(item => key(item))) {
        const result: unknown[] = [];
        const keys = [...new Set([...future.map(key), ...now.map(key), ...(before ?? []).map(key)])];
        for (const id of keys) { const value = merge(before?.find((v: any) => key(v) === id), now.find(v => key(v) === id), future.find(v => key(v) === id), `${path}/${pointer(id!)}`); if (value !== undefined) result.push(value); }
        return result;
      }
    }
    const selected = resolution(path);
    conflicts.push({ path, kind: 'field', before, current: now, incoming: future, resolution: selected });
    changes.push({ path, outcome: selected ?? 'conflict', before, current: now, incoming: future });
    return structuredClone(selected === 'incoming' ? future : now);
  };
  let next: RuntimeTemplate;
  if (!previous) {
    const selected = options.missingBaseline ?? null;
    conflicts.push({ path: '/', kind: 'missingBaseline', before: null, current: current.id, incoming: source.id, resolution: selected });
    next = structuredClone(selected === 'incoming' ? incoming : current);
    next.id=source.id;next.version=source.version;
    next.dependencies=[...source.dependencies,...current.dependencies.filter(item=>item.kind==='plugin'&&!source.dependencies.some(incoming=>incoming.kind==='plugin'&&incoming.id===item.id))];
  } else {
    // Package identity is supplied by the chosen source; authored fields use three-way comparison.
    const { pages: _oldPages, ...oldRest } = previous, { pages: _currentPages, ...currentRest } = current, { pages: _incomingPages, ...incomingRest } = incoming;
    next = { ...merge(oldRest, currentRest, incomingRest, ''), id: source.id, version: source.version, instanceId: current.instanceId, pages: [] };
    for (const page of incoming.pages) {
      const now = current.pages.find(item => item.key === page.key), before = previous.pages.find(item => item.key === page.key);
      const choice = options.pageChoices?.[page.key];
      next.pages.push(choice === 'current' && now ? structuredClone(now) : choice === 'incoming' || !now ? structuredClone(page) : merge(before, now, page, `/pages/${pointer(page.key)}`));
    }
    // Pages authored after adoption stay active; old source pages move to the recoverable archive.
    next.pages.push(...current.pages.filter(page => !incoming.pages.some(item => item.key === page.key) && !previous.pages.some(item => item.key === page.key)).map(page => structuredClone(page)));
  }
  for (const path of keepPublicPaths) {
    const [pageKey, part, field] = path.split('/');
    const now = current.pages.find(page => page.key === pageKey), future = next.pages.find(page => page.key === pageKey);
    const old = now && components(now.root).find(item => item.part === part), target = future && components(future.root).find(item => item.part === part);
    if (!old || !target || !field || !(field in old) || ['id', 'part', 'children'].includes(field)) throw new Error(`UI_TEMPLATE_KEEP_PATH: ${path}`);
    (target as any)[field] = structuredClone((old as any)[field]);
    const prefix = `/pages/${pointer(pageKey!)}`;
    conflicts.filter(conflict => conflict.path.startsWith(prefix) && conflict.path.includes(`/${field}`)).forEach(conflict => conflict.resolution = 'current');
  }
  const hidden = new Map((baseline?.hiddenPages ?? []).map(page => [page.key, structuredClone(page)]));
  for (const page of current.pages) if (!next.pages.some(item => item.key === page.key)) hidden.set(page.key, structuredClone(page));
  const referencedPages = new Set<string>(), referencedStrings = new Set<string>(), referencedAnimations = new Set<string>();
  const scan = (value: unknown, key = ''): void => { if (typeof value === 'string') { referencedStrings.add(value); if (key === 'page') referencedPages.add(value); }
    else if (Array.isArray(value)) value.forEach(item => scan(item, key)); else if (object(value)) for (const [name, item] of Object.entries(value)) scan(item, name); };
  // Restoring the associated page keeps author-created navigation and scoped styles usable.
  for (let pass = 0; pass <= current.pages.length; pass++) {
    next.pages.forEach(page => scan(page));
    for (const style of next.styles) { const page = current.pages.find(page => page.id === style.scope.pageId); if (page) referencedPages.add(page.key); }
    const restore = [...hidden.values()].filter(page => referencedPages.has(page.key) && !next.pages.some(item => item.key === page.key));
    if (!restore.length) break; next.pages.push(...restore); restore.forEach(page => hidden.delete(page.key));
  }
  for (const page of next.pages) { hidden.delete(page.key); for (const component of components(page.root)) Object.values(component.animations).forEach(id => referencedAnimations.add(id)); }
  for (const animation of current.animations) if (referencedAnimations.has(animation.id) && !next.animations.some(item => item.id === animation.id)) next.animations.push(structuredClone(animation));
  for (const [locale, strings] of Object.entries(current.locales)) for (const [key, value] of Object.entries(strings))
    if (referencedStrings.has(key) && next.locales[locale]?.[key] === undefined) (next.locales[locale] ??= {})[key] = value;
  if (options.authorStyles) for (const style of next.styles) {
    const original = previous?.styles.find(item => item.id === style.id), now = current.styles.find(item => item.id === style.id);
    if (now && (!original || !same(original, now))) style.enabled = options.authorStyles === 'enabled';
  }
  // Retained authored nodes can require a plugin the new source does not declare.
  const serialized = JSON.stringify(next.pages);
  for (const dependency of current.dependencies) if (dependency.kind === 'plugin' && serialized.includes(dependency.id) && !next.dependencies.some(item => item.kind === dependency.kind && item.id === dependency.id)) next.dependencies.push(structuredClone(dependency));
  const sourceRecord = createTemplateSource(source, Object.fromEntries(ids), input.sourceFiles ?? {});
  sourceRecord.hiddenPages = [...hidden.values()];
  const hiddenIds=new Set(sourceRecord.hiddenPages.map(page=>page.id));
  sourceRecord.hiddenStyles=[...(baseline?.hiddenStyles??[]),...current.styles.filter(style=>hiddenIds.has(style.scope.pageId))].filter((style,index,all)=>all.findIndex(item=>item.id===style.id)===index);
  sourceRecord.hiddenAnimations=[...(baseline?.hiddenAnimations??[]),...current.animations].filter((animation,index,all)=>all.findIndex(item=>item.id===animation.id)===index);
  sourceRecord.hiddenLocales={...(baseline?.hiddenLocales??{})};
  for(const[locale,strings]of Object.entries(current.locales))sourceRecord.hiddenLocales[locale]={...sourceRecord.hiddenLocales[locale],...strings};
  const files: Record<string, string> = {};
  const oldFiles = baseline ? Object.fromEntries(Object.entries(baseline.sourceFiles).map(([path, text]) => [rewriteTemplatePath(path, new Map(Object.entries(baseline.identities))), rewriteTemplateCss(text, new Map(Object.entries(baseline.identities)), id => baseline.identities[id] ?? id)])) : {};
  const sourceFiles = Object.fromEntries(Object.entries(input.sourceFiles ?? {}).map(([path, text]) => [rewriteTemplatePath(path, ids), rewriteTemplateCss(text, ids, id => ids.get(id) ?? id)]));
  for (const style of next.styles) for (const path of [style.sourcePath, style.compiledPath].filter((v): v is string => !!v)) {
    const now = input.currentFiles?.[path], future = sourceFiles[path];
    const text = now !== undefined && future !== undefined ? merge(oldFiles[path], now, future, `/files/${pointer(path)}`) : future ?? now;
    if (text !== undefined) files[path] = text;
  }
  // Local modules travel with authored styles unchanged; package modules get their mapped paths.
  for (const [path, text] of Object.entries(input.currentFiles ?? {})) if (path.startsWith('ui/styles/') && path.endsWith('.scss') && files[path] === undefined)
    files[path] = sourceFiles[path] !== undefined ? merge(oldFiles[path],text,sourceFiles[path],`/files/${pointer(path)}`) : text;
  for (const [path, text] of Object.entries(sourceFiles)) if (files[path] === undefined) files[path] = text;
  const requiredEntrances = missingRequiredEntrances(next);
  return { planId: createId([current, source]), template: RuntimeTemplateSchema.parse(next), sourceRecord, files, conflicts, changes,
    blocked: conflicts.some(conflict => conflict.resolution === null) || requiredEntrances.length > 0,
    keptFields: changes.filter(change => change.outcome === 'current').map(change => change.path), replacedFields: changes.filter(change => change.outcome === 'incoming').map(change => change.path),
    addedPages: next.pages.filter(page => !current.pages.some(old => old.key === page.key)).map(page => page.key), hiddenPages: [...hidden.keys()], dependencies: next.dependencies, requiredEntrances };
}

/** Every UI file, dependency and source-record change is submitted in one M02 transaction. */
export function prepareTemplateSwitch(documents: DocumentView[], source: RuntimeTemplate, options: TemplateSwitchOptions = {}, sourceFiles: Record<string, string> = {}) {
  const current = readTemplateDocuments(documents), baseline = readTemplateSource(documents), currentFiles = Object.assign({}, ...documents.map(document => document.files));
  const selected = planTemplate(current, source, [], { baseline, options, sourceFiles, currentFiles });
  // Merged module choices must produce CSS for the actual retained source, including imported scopes.
  for(let index=0;index<selected.template.styles.length;index++){
    const style=selected.template.styles[index]!,source=selected.files[style.sourcePath];if(source===undefined||style.enabled===false)continue;
    const compiled=compileStyle({style,source,instanceId:selected.template.instanceId,modules:selected.files});
    selected.template.styles[index]=compiled.style;
    if(compiled.css!==null&&compiled.style.compiledPath)selected.files[compiled.style.compiledPath]=compiled.css;
    if(compiled.style.issues.some(issue=>issue.severity==='error')){selected.conflicts.push({path:`/styles/${style.id}`,kind:'reference',before:null,current:style,incoming:compiled.style.issues,resolution:null});selected.blocked=true;}
  }
  const edit = templateEdit(documents, selected.template, 'Apply Player UI template', selected.sourceRecord);
  for(const document of documents)if(Object.keys(document.files).some(path=>path.startsWith('ui/'))&&!edit.expected.some(version=>version.ref.id===document.documentId))
    edit.expected.push({ref:{kind:'document',id:document.documentId},revision:document.revision});
  const root = documents.find(document => 'ui/template.json' in document.files)!;
  for (const [path, after] of Object.entries(selected.files)) {
    const owner = documents.find(document => path in document.files) ?? root, before = owner.files[path] ?? null;
    if (before === after) continue;
    if (!edit.expected.some(version => version.ref.id === owner.documentId)) edit.expected.push({ ref: { kind: 'document', id: owner.documentId }, revision: owner.revision });
    edit.patches.push({ kind: 'file', documentId: owner.documentId, path, before, after });
  }
  const lockDocument = documents.find(document => 'dependencies.lock.json' in document.files);
  if (lockDocument) {
    const before = JSON.parse(lockDocument.files['dependencies.lock.json']!).data, plugins = [...before.plugins];
    for (const dependency of selected.dependencies.filter(item => item.kind === 'plugin')) {
      const existing = plugins.find((item: any) => item.id === dependency.id);
      if (existing && existing.version !== dependency.version) { selected.conflicts.push({ path: `/dependencies/${dependency.id}`, kind: 'reference', before: existing, current: existing, incoming: dependency, resolution: null }); selected.blocked = true; }
      else if (!existing) plugins.push(dependency);
    }
    const after = { ...before, template: { ...before.template, id: source.id, version: source.version }, plugins } as Json;
    edit.expected.push({ ref: { kind: 'document', id: lockDocument.documentId }, revision: lockDocument.revision });
    edit.patches.push({ kind: 'json', documentId: lockDocument.documentId, changes: [{ path: '/data', before, after, op: 'set' }] });
  }
  return { ...selected, edit };
}

export function restoreHiddenTemplatePage(documents: DocumentView[], pageKey: string) {
  const template = readTemplateDocuments(documents), record = readTemplateSource(documents);
  const page = record?.hiddenPages.find(page => page.key === pageKey);
  if (!page || !record) throw new Error(`UI_HIDDEN_PAGE_MISSING: ${pageKey}`);
  if (template.pages.some(item => item.key === page.key)) throw new Error(`UI_PAGE_EXISTS: ${pageKey}`);
  template.pages.push(structuredClone(page)); record.hiddenPages = record.hiddenPages.filter(item => item.key !== pageKey);
  for(const style of record.hiddenStyles??[])if(style.scope.pageId===page.id&&!template.styles.some(item=>item.id===style.id))template.styles.push(structuredClone(style));
  for(const animation of record.hiddenAnimations??[])if(!template.animations.some(item=>item.id===animation.id))template.animations.push(structuredClone(animation));
  for(const[locale,strings]of Object.entries(record.hiddenLocales??{}))template.locales[locale]={...strings,...template.locales[locale]};
  return templateEdit(documents, template, 'Restore hidden Player UI page', record);
}
