import { ComponentConfigSchema, PageEditInputSchema, RuntimeTemplateSchema, createId, reserveIds } from '@galcraft/contracts';
import type { BasicComponentKind, ComponentConfig, DocumentView, EditInput, Id, Issue, Json, PageConfig, PageEditInput, RuntimeTemplate } from '@galcraft/contracts';
import { BasicComponentCatalog, componentDefinition } from './catalog.js';
import { readTemplateDocuments } from './documents.js';
import { components, templateEdit } from './editing.js';
import { copyComponentText, setComponentText } from './component-text.js';
import { resolveComponentTree, type ResolvedComponent } from './layout.js';

export { BasicComponentCatalog } from './catalog.js';
export { PageEditInputSchema, PageEditOperationSchema, ComponentChangesSchema, StyleEditInputSchema } from '@galcraft/contracts';
export type { BasicComponentKind, PageEditInput, PageEditOperation, StyleEditInput } from '@galcraft/contracts';
export * from './interactions.js';
export type PageEditPlan = { template: RuntimeTemplate; edit: EditInput;
  affected: { pageIds: Id[]; componentIds: Id[]; styleIds: Id[]; animationIds: Id[] };
  created: { pages: Id[]; components: Id[]; styles: Id[]; animations: Id[] }; issues: Issue[] };
const insets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
export function createBasicComponent(kind: BasicComponentKind, input: { id?: Id; name?: string } = {}): ComponentConfig {
  if (!BasicComponentCatalog.some(entry => entry.componentKind === kind)) throw new Error(`UI_COMPONENT_KIND: ${kind}`);
  const container = ['container', 'list', 'tabs'].includes(kind);
  return { id: input.id ?? createId(), part: `basic.${kind}`, name: input.name ?? kind,
    layout: { position: 'free', mode: 'absolute', anchorX: 0, anchorY: 0, x: { unit: 'px', value: 0 }, y: { unit: 'px', value: 0 },
      width: { unit: 'px', value: container ? 480 : kind === 'image' ? 240 : 240 }, height: { unit: 'px', value: container ? 320 : kind === 'image' ? 240 : 56 },
      minWidth: 0, minHeight: 0, maxWidth: null, maxHeight: null, margin: insets(), padding: insets(), gap: 8, align: 'start', justify: 'start', columns: 1, z: 0, overflow: 'visible', safeArea: false },
    visible: true, locked: false, content: kind === 'text' ? { text: 'Text' } : kind === 'button' ? { text: 'Button' }
      : kind === 'slider' ? { value: 0, min: 0, max: 100, step: 1 } : kind === 'toggle' ? { value: false } : kind === 'input' ? { value: '', inputType: 'text' } : {},
    normal: {}, states: {}, children: [], animations: {}, ...(kind === 'tabs' || kind === 'select' ? { options: [] } : {}) };
}
export function componentIsFree(component: ComponentConfig): boolean { return component.layout.position ? component.layout.position === 'free' : component.layout.mode === 'absolute'; }
export function validatePageStructure(template: RuntimeTemplate): Issue[] {
  const issues: Issue[] = [], identities = new Set<string>();
  const issue = (code: string, message: string) => issues.push({ code, message, owner: 'M08', severity: 'error', related: [], actions: ['edit'] });
  const identity = (id: string) => { if (identities.has(id)) issue('UI_DUPLICATE_ID', `Duplicate UI identity: ${id}`); identities.add(id); };
  const pageKeys = new Set<string>();
  for (const page of template.pages) {
    identity(page.id); identity(page.portalRootId);
    if (pageKeys.has(page.key)) issue('UI_DUPLICATE_PAGE', `Duplicate page key: ${page.key}`); pageKeys.add(page.key);
    const all = components(page.root);
    for (const component of all) {
      identity(component.id);
      const definition = componentDefinition(component.part);
      if (!definition && component !== page.root && !component.plugin) issue('UI_COMPONENT_UNKNOWN', `Unknown component type: ${component.part}`);
      if (component.visualScale !== undefined && (!componentIsFree(component) || definition?.kind !== 'container')) issue('UI_GROUP_SCALE', `Visual scale requires a free container: ${component.id}`);
      if (component.repeat && !['list', 'container'].includes(definition?.kind ?? '')) issue('UI_REPEAT_CONTAINER', `Repeat requires a list or container: ${component.id}`);
      for(const binding of [...Object.values(component.bindings??{}),...(component.repeat?[component.repeat.source]:[])])if(binding.source==='local'&&!(binding.path.split(/[/.]/)[0]! in (page.localState??{})))issue('UI_LOCAL_MISSING',`Page local value is not declared: ${binding.path}`);
      for (const id of Object.values(component.animations)) if (!template.animations.some(animation => animation.id === id)) issue('UI_ANIMATION_MISSING', `Missing UI animation: ${id}`);
      for (const interaction of component.interactions ?? []) for (const action of interaction.actions) {
        const destination = action.kind === 'open' ? action.page : action.kind === 'official' && action.action.kind === 'open' ? action.action.page : null;
        if (destination && !template.pages.some(target => target.key === destination)) issue('UI_PAGE_MISSING', `Missing page: ${destination}`);
        if ((action.kind === 'setLocal' || action.kind === 'toggleLocal') && !(action.key in (page.localState ?? {}))) issue('UI_LOCAL_MISSING', `Page local value is not declared: ${action.key}`);
      }
    }
  }
  for (const style of template.styles) { identity(style.id); const page=template.pages.find(page=>page.id===style.scope.pageId);if(!page||style.scope.componentId&&!components(page.root).some(component=>component.id===style.scope.componentId))issue('UI_STYLE_SCOPE',`Style scope is unavailable: ${style.id}`);if (style.compiledPath !== null && style.compiledPath === style.sourcePath) issue('UI_STYLE_PATH', `Style source and compiled paths must differ: ${style.id}`); }
  for (const animation of template.animations) identity(animation.id);
  return issues;
}
function updateComponent(component: ComponentConfig, changes: Record<string, unknown>): void {
  const next = { ...component, ...changes, layout: { ...component.layout, ...(changes.layout as object ?? {}) }, normal: { ...component.normal, ...(changes.normal as object ?? {}) },
    content: { ...component.content, ...(changes.content as object ?? {}) }, states: { ...component.states, ...(changes.states as object ?? {}) }, animations: { ...component.animations, ...(changes.animations as object ?? {}) } };
  if (changes.repeat === null) delete next.repeat;
  Object.assign(component, ComponentConfigSchema.parse(next)); if (changes.repeat === null) delete component.repeat;
}
export type FlowLayoutFrames = Record<Id, Record<Id, { x: number; y: number; width: number; height: number }>>;
export function preparePageEdit(input: { documents: readonly DocumentView[]; request: PageEditInput; layoutFrames?: FlowLayoutFrames }): PageEditPlan {
  const request = PageEditInputSchema.parse(input.request), template = readTemplateDocuments(input.documents), previousTemplate=structuredClone(template);
  reserveIds([input.documents, request]);
  const affected = { pageIds: new Set<Id>(), componentIds: new Set<Id>(), styleIds: new Set<Id>(), animationIds: new Set<Id>() };
  const created: PageEditPlan['created'] = { pages: [], components: [], styles: [], animations: [] };
  const readDocuments=new Set<Id>();
  const freezeFlow=(target:PageConfig,value:ComponentConfig)=>{
    if(!value.children.some(child=>!componentIsFree(child)))return;
    const project=input.documents.find(document=>'project.json' in document.files),canvas=project&&JSON.parse(project.files['project.json']!).data.canvas;
    if(!canvas||!(canvas.width>0&&canvas.height>0))throw new Error('UI_CANVAS_REQUIRED: Layout conversion requires the project canvas.');
    readDocuments.add(project!.documentId);
    const measuredParent=input.layoutFrames?.[value.id]?.[value.id];
    if(measuredParent){if(value.layout.width.unit==='auto')value.layout.width={unit:'px',value:measuredParent.width};if(value.layout.height.unit==='auto')value.layout.height={unit:'px',value:measuredParent.height};}
    const resolved=resolveComponentTree(target.root,{x:0,y:0,width:canvas.width,height:canvas.height}),frames=new Map<Id,ResolvedComponent>();
    const visit=(item:ResolvedComponent)=>{frames.set(item.id,item);item.children.forEach(visit);};visit(resolved);
    const parentFrame=frames.get(value.id)!.rect;
    for(const child of value.children.filter(child=>!componentIsFree(child))){
      const measured=input.layoutFrames?.[value.id]?.[child.id];
      if(measured){Object.assign(child.layout,{position:'free',anchorX:0,anchorY:0,x:{unit:'px',value:measured.x},y:{unit:'px',value:measured.y},width:{unit:'px',value:measured.width},height:{unit:'px',value:measured.height}});affected.componentIds.add(child.id);continue;}
      const rect=frames.get(child.id)!.rect,margin=child.layout.margin;
      Object.assign(child.layout,{position:'free',anchorX:0,anchorY:0,x:{unit:'px',value:rect.x-parentFrame.x-value.layout.padding.left-margin.left+margin.right},y:{unit:'px',value:rect.y-parentFrame.y-value.layout.padding.top-margin.top+margin.bottom},width:{unit:'px',value:rect.width},height:{unit:'px',value:rect.height}});
      affected.componentIds.add(child.id);
    }
  };
  const page = (id: Id): PageConfig => { const value = template.pages.find(item => item.id === id); if (!value) throw new Error(`UI_PAGE_MISSING: ${id}`); affected.pageIds.add(id); return value; };
  const component = (target: PageConfig, id: Id) => { const value = components(target.root).find(item => item.id === id); if (!value) throw new Error(`UI_COMPONENT_MISSING: ${id}`); affected.componentIds.add(id); return value; };
  const parent = (target: PageConfig, id: Id) => components(target.root).find(item => item.children.some(child => child.id === id));
  const container = (target: PageConfig, id: Id) => { const value = component(target, id), definition = componentDefinition(value.part); if (value !== target.root && !value.plugin && !['container', 'list', 'tab', 'button'].includes(definition?.kind ?? '')) throw new Error(`UI_PARENT_TYPE: ${id}`); return value; };
  for (const operation of request.operations) {
    if (operation.kind === 'page.create') {
      if (template.pages.some(item => item.key === operation.key)) throw new Error(`UI_DUPLICATE_PAGE: ${operation.key}`);
      const id = operation.id ?? createId(), root = operation.root ?? createBasicComponent('container', { name: operation.title });
      root.layout.width = { unit: 'percent', value: 100 }; root.layout.height = { unit: 'percent', value: 100 };
      const newPage: PageConfig = { id, key: operation.key, titleKey: operation.title, root, portalRootId: createId(), toolbar: null,
        layout: structuredClone(root.layout), background: { ...template.defaultVisual.background, imageId: null, colorOpacity: 0 }, localState: {} };
      template.pages.push(newPage); created.pages.push(id); created.components.push(...components(root).map(item => item.id)); affected.pageIds.add(id); continue;
    }
    if (operation.kind === 'animation.upsert') { const previous = template.animations.findIndex(item => item.id === operation.animation.id); if (previous < 0) { template.animations.push(operation.animation); created.animations.push(operation.animation.id); } else template.animations[previous] = operation.animation; affected.animationIds.add(operation.animation.id); continue; }
    if (operation.kind === 'animation.remove') { const uses = template.pages.flatMap(item => components(item.root)).filter(item => Object.values(item.animations).includes(operation.animationId)); if (uses.length && !operation.unbind) throw new Error('UI_ANIMATION_IN_USE'); for (const use of uses) for (const [event, id] of Object.entries(use.animations)) if (id === operation.animationId) { delete use.animations[event as keyof typeof use.animations]; affected.componentIds.add(use.id); } template.animations = template.animations.filter(item => item.id !== operation.animationId); affected.animationIds.add(operation.animationId); continue; }
    if (operation.kind === 'style.remove') { if(!template.styles.some(item=>item.id===operation.styleId))throw new Error(`UI_STYLE_MISSING: ${operation.styleId}`);template.styles = template.styles.filter(item => item.id !== operation.styleId); affected.styleIds.add(operation.styleId); continue; }
    const target = page(operation.pageId);
    if (operation.kind === 'page.remove') { template.pages.splice(template.pages.indexOf(target), 1); for (const style of template.styles.filter(item => item.scope.pageId === target.id)) affected.styleIds.add(style.id); template.styles = template.styles.filter(item => item.scope.pageId !== target.id); continue; }
    if (operation.kind === 'page.update') { if (operation.titleKey !== undefined) target.titleKey = operation.titleKey; if (operation.background) target.background = operation.background; if (operation.layout) Object.assign(target.layout, operation.layout); if (operation.localState) target.localState = operation.localState; continue; }
    if (operation.kind === 'component.add') { const owner = container(target, operation.parentId); if (!operation.component && !operation.componentKind) throw new Error('UI_COMPONENT_KIND_REQUIRED'); const value = operation.component ?? createBasicComponent(operation.componentKind!, { ...(operation.id ? { id: operation.id } : {}), ...(operation.name !== undefined ? { name: operation.name } : {}) }); if (operation.changes) updateComponent(value, operation.changes); owner.children.splice(operation.index ?? owner.children.length, 0, value); created.components.push(...components(value).map(item => item.id)); affected.componentIds.add(value.id); continue; }
    if (operation.kind === 'component.update') { const value=component(target,operation.componentId);if(value.layout.mode!=='absolute'&&operation.changes.layout?.mode==='absolute')freezeFlow(target,value);updateComponent(value, operation.changes); continue; }
    if (operation.kind === 'component.text') { setComponentText(template, component(target, operation.componentId), operation.locale, operation.text); continue; }
    if (operation.kind === 'component.clear') { const value = component(target, operation.componentId); for (const path of operation.paths) { const keys = path.split('.'); if (!['normal', 'states', 'content', 'bindings', 'animations'].includes(keys[0]!) || keys.length < 2) throw new Error(`UI_INHERIT_PATH: ${path}`); let record = value as unknown as Record<string, unknown>; for (const key of keys.slice(0, -1)) { const next = record[key]; if (!next || typeof next !== 'object') { record = {}; break; } record = next as Record<string, unknown>; } delete record[keys.at(-1)!]; } continue; }
    if (operation.kind === 'component.duplicate') { const original = component(target, operation.componentId), owner = container(target, operation.parentId ?? parent(target, original.id)?.id ?? target.root.id); const copy = structuredClone(original), originals = components(original); for (const [index, item] of components(copy).entries()) { item.id = createId(); copyComponentText(template.locales, originals[index]!, item); created.components.push(item.id); } copy.name = `${copy.name ?? copy.part} copy`; owner.children.splice(operation.index ?? owner.children.length, 0, copy); continue; }
    if (operation.kind === 'component.reorder') { const value = component(target, operation.componentId), owner = parent(target, value.id); if (!owner) throw new Error('UI_ROOT_REORDER'); owner.children.splice(owner.children.indexOf(value), 1); owner.children.splice(operation.index, 0, value); continue; }
    const selected = operation.componentIds.map(id => component(target, id));
    if (selected.some(value => value === target.root)) throw new Error('UI_ROOT_REMOVE');
    const top = selected.filter(value => !selected.some(other => other !== value && components(other).includes(value)));
    const owner = operation.kind === 'component.reparent' ? container(target, operation.parentId) : null;
    if (owner && top.some(value => components(value).includes(owner))) throw new Error('UI_TREE_CYCLE');
    for (const value of top) { const old = parent(target, value.id)!; old.children.splice(old.children.indexOf(value), 1); }
    if (owner && operation.kind === 'component.reparent') owner.children.splice(operation.index ?? owner.children.length, 0, ...top);
    if (!owner) { const removed = new Set(top.flatMap(value => components(value).map(item => item.id))); template.styles = template.styles.filter(style => !style.scope.componentId || !removed.has(style.scope.componentId)); }
  }
  RuntimeTemplateSchema.parse(template);
  const issues = validatePageStructure(template); if (issues.some(issue => issue.severity === 'error')) throw new Error(issues.map(issue => `${issue.code}: ${issue.message}`).join('\n'));
  const edit = templateEdit([...input.documents], template, request.label);
  for(const id of readDocuments)if(!edit.expected.some(version=>version.ref.id===id))edit.expected.push({ref:{kind:'document',id},revision:input.documents.find(document=>document.documentId===id)!.revision});
  const compare=<T extends {id:Id}>(before:T[],after:T[],changed:Set<Id>)=>{const old=new Map(before.map(item=>[item.id,item])),next=new Map(after.map(item=>[item.id,item]));for(const id of new Set([...old.keys(),...next.keys()]))if(JSON.stringify(old.get(id))!==JSON.stringify(next.get(id)))changed.add(id);};
  compare(previousTemplate.pages,template.pages,affected.pageIds);compare(previousTemplate.pages.flatMap(page=>components(page.root)),template.pages.flatMap(page=>components(page.root)),affected.componentIds);compare(previousTemplate.styles,template.styles,affected.styleIds);compare(previousTemplate.animations,template.animations,affected.animationIds);
  const retainedFiles=new Set(template.styles.flatMap(style=>[style.sourcePath,...style.compiledPath?[style.compiledPath]:[]]));
  for(const style of previousTemplate.styles.filter(style=>!template.styles.some(item=>item.id===style.id)))for(const path of [style.sourcePath,...style.compiledPath?[style.compiledPath]:[]])if(!retainedFiles.has(path)){const document=input.documents.find(document=>path in document.files);if(document){edit.patches.push({kind:'file',documentId:document.documentId,path,before:document.files[path]!,after:null});if(!edit.expected.some(version=>version.ref.id===document.documentId))edit.expected.push({ref:{kind:'document',id:document.documentId},revision:document.revision});}}
  // Removed pages leave the project and its undo history in one M02 transaction.
  const retainedPages = new Set(template.pages.map(item => `ui/pages/${item.id}.json`));
  for (const document of input.documents) if (Object.keys(document.files).some(path => path.startsWith('ui/pages/') && !retainedPages.has(path))) {
    edit.expected.push({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
    edit.patches.push({ kind: 'document', documentId: document.documentId, op: 'delete', before: { documentId: document.documentId, format: document.format, files: document.files } as Json, after: null });
  }
  return { template, edit, affected: Object.fromEntries(Object.entries(affected).map(([key, values]) => [key, [...values]])) as PageEditPlan['affected'], created, issues };
}
