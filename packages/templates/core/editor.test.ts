import { describe, expect, it } from 'vitest';
import { createId, PageEditInputSchema, RuntimeTemplateSchema } from '@galcraft/contracts';
import type { DocumentView } from '@galcraft/contracts';
import { createOfficialTemplate } from './templates.js';
import { createTemplateDocuments, readTemplateDocuments } from './documents.js';
import { BasicComponentCatalog, createBasicComponent, preparePageEdit } from './editor.js';
import { preparePageStyleEdit } from './style-editing.js';
import { resolveComponentTree } from './layout.js';
import { components, instantiateTemplate } from './editing.js';
import { componentTextOverride } from './component-text.js';
import { inspectTemplate, packTemplate } from './package.js';

function fixture() {
  const template = createOfficialTemplate();
  const documents: DocumentView[] = createTemplateDocuments(template).map(document => ({ ...document, dirty: false, savedRevision: document.revision, savedFiles: { ...document.files } }));
  return { template, documents, page: template.pages[0]! };
}
function applied(documents: DocumentView[], plan: ReturnType<typeof preparePageEdit>): DocumentView[] {
  const values = structuredClone(documents);
  for (const patch of plan.edit.patches) {
    if (patch.kind === 'document') {
      if (patch.op === 'delete') { const index = values.findIndex(item => item.documentId === patch.documentId); if (index >= 0) values.splice(index, 1); }
      else { const document = patch.after as unknown as Pick<DocumentView, 'documentId' | 'format' | 'files'>; values.push({ ...document, revision: 1, savedRevision: 0, savedFiles: {}, dirty: true }); }
    } else {
      const document = values.find(item => item.documentId === patch.documentId)!;
      if (patch.kind === 'file') { if (patch.after === null) delete document.files[patch.path]; else document.files[patch.path] = patch.after; }
      if (patch.kind === 'json') { const path = Object.keys(document.files).find(path => path.endsWith('.json'))!, envelope = JSON.parse(document.files[path]!); for (const change of patch.changes) { expect(change.path).toBe('/data'); envelope.data = change.after; } document.files[path] = JSON.stringify(envelope); }
    }
  }
  return values;
}
describe('page instance editing', () => {
  it('stores one component and language in page and locale documents, with independent copies and template packages', () => {
    const { documents, page } = fixture(), original = components(page.root).find(component => component.part === 'title.menu.characters')!;
    const edit = (docs: DocumentView[], componentId: string, text: string | null) => preparePageEdit({ documents: docs, request: { label: 'Edit one display label', operations: [{ kind: 'component.text', pageId: page.id, componentId, locale: 'zh-CN', text }] } });
    const first = edit(documents, original.id, 'After story'), changed = components(first.template.pages[0]!.root).find(component => component.id === original.id)!;
    expect(first.edit.patches).toHaveLength(2); expect(first.edit.expected).toHaveLength(2);
    expect(componentTextOverride(changed, first.template.locales, 'zh-CN')).toBe('After story');
    expect(componentTextOverride(changed, first.template.locales, 'en')).toBeUndefined();
    expect(first.template.locales['zh-CN']!['page.characters']).toBe('后日谈');
    const reopened = readTemplateDocuments(applied(documents, first)); expect(reopened).toEqual(first.template);
    const copied = preparePageEdit({ documents: applied(documents, first), request: { label: 'Duplicate', operations: [{ kind: 'component.duplicate', pageId: page.id, componentId: original.id }] } });
    const copy = components(copied.template.pages[0]!.root).find(component => copied.created.components.includes(component.id))!;
    expect(copy.content.labelOverrideKey).not.toBe(changed.content.labelOverrideKey);
    const empty = edit(applied(applied(documents, first), copied), copy.id, '');
    expect(componentTextOverride(components(empty.template.pages[0]!.root).find(component => component.id === copy.id)!, empty.template.locales, 'zh-CN')).toBe('');
    expect(componentTextOverride(changed, empty.template.locales, 'zh-CN')).toBe('After story');
    const reset = edit(applied(documents, first), original.id, null); expect(componentTextOverride(components(reset.template.pages[0]!.root).find(component => component.id === original.id)!, reset.template.locales, 'zh-CN')).toBeUndefined();
    const imported = inspectTemplate(packTemplate({ template: first.template, name: 'Local label', description: '', files: {}, assetFiles: {} })).instantiate();
    const next = components(imported.pages[0]!.root).find(component => component.part === 'title.menu.characters')!;
    expect(next.id).not.toBe(original.id); expect(next.content.labelOverrideKey).not.toBe(changed.content.labelOverrideKey);
    expect(componentTextOverride(next, imported.locales, 'zh-CN')).toBe('After story');
    expect(instantiateTemplate(first.template).locales['en']).toEqual(first.template.locales['en']);
  });
  it('rejects display edits on dynamic data and on an unavailable Player language', () => {
    const { documents, page } = fixture(), dynamic = components(page.root).find(component => component.part === 'title.workTitle')!;
    const prepare = (componentId: string, locale: string) => preparePageEdit({ documents, request: { label: 'Display label', operations: [{ kind: 'component.text', pageId: page.id, componentId, locale, text: 'Fixed text' }] } });
    expect(() => prepare(dynamic.id, 'zh-CN')).toThrow('UI_TEXT_DYNAMIC');
    expect(() => prepare(components(page.root).find(component => component.part === 'title.menu.characters')!.id, 'fr')).toThrow('UI_TEXT_LOCALE');
  });
  it('publishes eleven placeable component identities and preserves three independently versioned images in one transaction', () => {
    const { documents, page } = fixture(), group = createBasicComponent('container');
    const images = [0, 1, 2].map(index => { const image = createBasicComponent('image'); image.layout.x = { unit: 'px', value: index * 80 }; image.normal.images = { decoration: { assetId: createId(), variantId: createId(), mode: 'contain', positionX: .5, positionY: .5, colorMode: 'original', tint: null, opacity: 1, slices: null, borders: null, fillCenter: true } }; return image; }); group.children = images;
    const plan = preparePageEdit({ documents, request: { label: 'Character corner', operations: [{ kind: 'component.add', pageId: page.id, parentId: page.root.id, component: group }] } });
    expect(BasicComponentCatalog).toHaveLength(11); expect(plan.created.components).toHaveLength(4);
    const reopened = readTemplateDocuments(applied(documents, plan));
    expect(reopened.pages[0]!.root.children.at(-1)?.children).toEqual(images);
    expect(plan.edit.patches).toHaveLength(1); expect(plan.edit.expected[0]?.revision).toBe(1);
  });
  it('creates a free page and copies/reparents authored instances with independent identities', () => {
    const { documents } = fixture(), pageId = createId(), root = createBasicComponent('container'), child = createBasicComponent('text'); root.children.push(child);
    const first = preparePageEdit({ documents, request: { label: 'Custom page', operations: [{ kind: 'page.create', id: pageId, key: 'credits', title: 'Credits', root }] } });
    const second = preparePageEdit({ documents: applied(documents, first), request: { label: 'Copy text', operations: [{ kind: 'component.duplicate', pageId, componentId: child.id }] } });
    const page = second.template.pages.find(item => item.id === pageId)!;
    expect(page.root.layout.mode).toBe('absolute'); expect(page.root.children).toHaveLength(2); expect(page.root.children[0]!.id).not.toBe(page.root.children[1]!.id);
    expect(() => preparePageEdit({ documents: applied(documents, first), request: { label: 'Cycle', operations: [{ kind: 'component.reparent', pageId, componentIds: [root.id], parentId: child.id }] } })).toThrow();
  });
  it('keeps a later edit within its page after creating a different unsaved page',()=>{
    const {documents,page}=fixture(),newPageId=createId();
    const added=preparePageEdit({documents,request:{label:'Create another page',operations:[{kind:'page.create',id:newPageId,key:'notes',title:'Notes'}]}});
    const next=applied(documents,added),unchanged=next.find(document=>document.documentId===newPageId)!.files;
    const edited=preparePageEdit({documents:next,request:{label:'Rename the existing root',operations:[{kind:'component.update',pageId:page.id,componentId:page.root.id,changes:{name:'Title group'}}]}});
    expect(edited.edit.patches.map(patch=>patch.documentId)).toEqual([page.id]);
    expect(applied(next,edited).find(document=>document.documentId===newPageId)!.files).toEqual(unchanged);
  });
  it('separates placement from container arrangement without changing the child frame or font', () => {
    const group = createBasicComponent('container'), text = createBasicComponent('text'); group.layout.mode = 'row'; group.layout.position = 'free'; text.layout.position = 'flow'; text.normal.fontSize = 26; group.children.push(text);
    const result = resolveComponentTree(group, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(result.children[0]!.rect.width).toBe(240); expect(text.normal.fontSize).toBe(26); expect(RuntimeTemplateSchema).toBeDefined();
  });
  it.each(['row','column','grid'] as const)('freezes the visible child frames when a %s container becomes free',mode=>{
    const {documents,page}=fixture(),group=createBasicComponent('container'),children=[createBasicComponent('image'),createBasicComponent('text'),createBasicComponent('button')];
    group.layout.mode=mode;group.layout.gap=16;group.layout.columns=2;group.layout.width={unit:'px',value:720};group.layout.height={unit:'px',value:640};group.visualScale=.92;group.layout.padding={top:12,right:14,bottom:16,left:18};
    for(const child of children){child.layout.position='flow';child.normal.fontSize=24;child.layout.width={unit:'px',value:200};child.layout.height={unit:'px',value:120};child.layout.margin={top:2,right:4,bottom:6,left:8};}group.children=children;
    const projectId=createId(),raw=JSON.stringify({data:{canvas:{width:1920,height:1080}}});documents.push({documentId:projectId,revision:3,format:'json',files:{'project.json':raw},savedFiles:{'project.json':raw},savedRevision:3,dirty:false});
    const added=preparePageEdit({documents,request:{label:'Flow group',operations:[{kind:'component.add',pageId:page.id,parentId:page.root.id,component:group}]}}),next=applied(documents,added);
    const before=resolveComponentTree(added.template.pages[0]!.root,{x:0,y:0,width:1920,height:1080}).children.at(-1)!;
    const converted=preparePageEdit({documents:next,request:{label:'Use free layout',operations:[{kind:'component.update',pageId:page.id,componentId:group.id,changes:{layout:{mode:'absolute'}}}]}});
    const after=resolveComponentTree(converted.template.pages[0]!.root,{x:0,y:0,width:1920,height:1080}).children.at(-1)!;
    expect(after.children.map(child=>child.rect)).toEqual(before.children.map(child=>child.rect));
    const stored=converted.template.pages[0]!.root.children.at(-1)!;expect(stored.visualScale).toBe(.92);expect(stored.children.every(child=>child.layout.position==='free'&&child.normal.fontSize===24)).toBe(true);
    expect(converted.edit.expected).toContainEqual({ref:{kind:'document',id:projectId},revision:3});
  });
  it('retains repeat item bindings and ordered local actions in saved page data', () => {
    const { documents, page } = fixture(), list = createBasicComponent('list'), text = createBasicComponent('text');
    list.repeat = { source: { source: 'data', path: 'history' }, key: 'id', emptyText: 'No history' };
    text.bindings = { text: { source: 'item', path: 'text' } }; text.interactions = [{ event: 'click', actions: [{ kind: 'setLocal', key: 'selected', value: { source: 'item', path: 'id' } }] }]; list.children.push(text);
    const plan = preparePageEdit({ documents, request: { label: 'History list', operations: [{ kind: 'page.update', pageId: page.id, localState: { selected: null } }, { kind: 'component.add', pageId: page.id, parentId: page.root.id, component: list }] } });
    expect(readTemplateDocuments(applied(documents, plan)).pages[0]!.root.children.at(-1)).toEqual(list);
    expect(() => PageEditInputSchema.parse({ label: 'script', operations: [{ kind: 'component.script', source: 'alert(1)' }] })).toThrow();
  });
  it('uses measured CSS intrinsic sizes and offsets for flow conversion, preserving the authored scale and text',()=>{
    const {documents,page}=fixture(),group=createBasicComponent('container'),text=createBasicComponent('text');
    group.layout.mode='row';group.layout.width={unit:'auto'};group.layout.height={unit:'auto'};group.visualScale=1.4;
    text.layout.position='flow';text.layout.width={unit:'auto'};text.layout.height={unit:'auto'};text.content.text='来自浏览器的自动尺寸';text.normal.fontSize=27;group.children=[text];
    const raw=JSON.stringify({data:{canvas:{width:1920,height:1080}}});documents.push({documentId:createId(),revision:2,format:'json',files:{'project.json':raw},savedFiles:{'project.json':raw},savedRevision:2,dirty:false});
    const added=preparePageEdit({documents,request:{label:'Auto text',operations:[{kind:'component.add',pageId:page.id,parentId:page.root.id,component:group}]}});
    const converted=preparePageEdit({documents:applied(documents,added),request:{label:'Freeze measured layout',operations:[{kind:'component.update',pageId:page.id,componentId:group.id,changes:{layout:{mode:'absolute'}}}]},layoutFrames:{[group.id]:{[group.id]:{x:0,y:0,width:424.5,height:67.25},[text.id]:{x:18.75,y:12.5,width:315.25,height:42.75}}}});
    const stored=converted.template.pages[0]!.root.children.at(-1)!;
    expect(stored.layout.width).toEqual({unit:'px',value:424.5});expect(stored.layout.height).toEqual({unit:'px',value:67.25});expect(stored.visualScale).toBe(1.4);
    expect(stored.children[0]!.layout).toMatchObject({position:'free',x:{unit:'px',value:18.75},y:{unit:'px',value:12.5},width:{unit:'px',value:315.25},height:{unit:'px',value:42.75}});
    expect(stored.children[0]!.normal.fontSize).toBe(27);expect(stored.children[0]!.content.text).toBe(text.content.text);
  });
  it('removes an ordinary page document and rejects a dangling navigation target', () => {
    const { documents } = fixture(), id = createId();
    const added = preparePageEdit({ documents, request: { label: 'Add', operations: [{ kind: 'page.create', id, key: 'credits', title: 'Credits' }] } });
    const next = applied(documents, added), removed = preparePageEdit({ documents: next, request: { label: 'Remove', operations: [{ kind: 'page.remove', pageId: id }] } });
    expect(removed.edit.patches.some(patch => patch.kind === 'document' && patch.op === 'delete' && patch.documentId === id)).toBe(true);
    expect(readTemplateDocuments(applied(next, removed)).pages.some(page => page.id === id)).toBe(false);
  });
});
describe('page source editing', () => {
  it.each(['css', 'scss'] as const)('keeps %s source independent from compiled CSS and retains the last valid preview after an error', language => {
    const { documents, page } = fixture();
    const source = language === 'scss' ? '$ink: #123456; [data-gc-part="title.workTitle"] { color: $ink; }' : '[data-gc-part="title.workTitle"] { color: #123456; }';
    const plan = preparePageStyleEdit({ documents, request: { label: 'Style', name: 'Title ink', pageId: page.id, componentId: null, language, activation: 'page', source } });
    const style = plan.template.styles[0]!, next = applied(documents, plan), root = next.find(document => 'ui/template.json' in document.files)!;
    expect(style.sourcePath).not.toBe(style.compiledPath); expect(root.files[style.sourcePath]).toBe(source); expect(root.files[style.compiledPath!]).toContain('#123456');
    const failed = preparePageStyleEdit({ documents: next, request: { label: 'Invalid style', styleId: style.id, name: 'Title ink', pageId: page.id, componentId: null, language, activation: 'page', source: '{' } });
    const failedRoot = applied(next, failed).find(document => 'ui/template.json' in document.files)!;
    expect(failedRoot.files[style.sourcePath]).toBe('{'); expect(failedRoot.files[style.compiledPath!]).toBe(root.files[style.compiledPath!]);
    expect(failed.template.styles[0]!.compiledSourceRevision).toBe(1); expect(failed.template.styles[0]!.sourceRevision).toBe(2); expect(failed.issues[0]?.code).toBe('STYLE_COMPILE');
  });
});
