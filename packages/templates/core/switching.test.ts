import { describe, expect, it } from 'vitest';
import { createId } from '@galcraft/contracts';
import type { DocumentView } from '@galcraft/contracts';
import { createOfficialTemplate } from './templates.js';
import { components, findComponent, templateEdit } from './editing.js';
import { createTemplateDocuments, createTemplateSource, readTemplateSource } from './documents.js';
import { planTemplate, prepareTemplateSwitch, restoreHiddenTemplatePage } from './switching.js';
import { createBasicComponent } from './editor.js';
const views=(source:ReturnType<typeof createOfficialTemplate>):DocumentView[]=>createTemplateDocuments(source).map(doc=>({...doc,savedFiles:structuredClone(doc.files),savedRevision:1,dirty:false}));
describe('AO-3 adopted source and three-way switching',()=>{
  it('follows unchanged fields, retains authored fields and exposes real overlapping changes',()=>{
    const base=createOfficialTemplate(),current=structuredClone(base),incoming=structuredClone(base);
    const id=base.pages[0]!.root.children[0]!.id;
    findComponent(base,id)!.layout.width={unit:'px',value:200};
    findComponent(current,id)!.layout.width={unit:'px',value:240};
    findComponent(current,id)!.normal.color='#author';
    findComponent(incoming,id)!.layout.width={unit:'px',value:220};
    findComponent(incoming,id)!.layout.height={unit:'px',value:88};
    // Colour is only authored; reset its source to the exact adopted value.
    findComponent(incoming,id)!.normal.color=findComponent(base,id)!.normal.color;
    const selected=planTemplate(current,incoming,[],{baseline:createTemplateSource(base)});
    expect(selected.blocked).toBe(true);expect(selected.conflicts.some(conflict=>conflict.path.endsWith('/layout/width/value'))).toBe(true);
    expect(findComponent(selected.template,id)!.layout.height).toEqual({unit:'px',value:88});expect(findComponent(selected.template,id)!.normal.color).toBe('#author');
    const resolutions=Object.fromEntries(selected.conflicts.map(conflict=>[conflict.path,'current' as const]));
    const resolved=planTemplate(current,incoming,[],{baseline:createTemplateSource(base),options:{resolutions}});
    expect(resolved.blocked).toBe(false);expect(findComponent(resolved.template,id)!.layout.width).toEqual({unit:'px',value:240});
    expect(findComponent(resolved.sourceRecord.source,id)!.layout.width).toEqual({unit:'px',value:220});
  });
  it('keeps authored components and navigation closure and restores archived source pages',()=>{
    const base=createOfficialTemplate({kind:'standard'}),current=structuredClone(base),incoming=createOfficialTemplate({kind:'light'});
    const button=createBasicComponent('button');button.interactions=[{event:'click',actions:[{kind:'open',page:'cg'}]}];
    current.pages[0]!.root.children.push(button);
    const selected=planTemplate(current,incoming,[],{baseline:createTemplateSource(base)});
    expect(selected.template.pages.some(page=>page.key==='cg')).toBe(true);
    expect(findComponent(selected.template,button.id)).toBeDefined();expect(selected.hiddenPages).toContain('music');
    const documents=views(selected.template),source=documents.find(document=>'ui/template-source.json'in document.files)!;
    const envelope=JSON.parse(source.files['ui/template-source.json']!);envelope.data=selected.sourceRecord;source.files['ui/template-source.json']=JSON.stringify(envelope);
    const edit=restoreHiddenTemplatePage(documents,'music');expect(edit.patches.some(patch=>patch.kind==='document'&&patch.op==='create')).toBe(true);
  });
  it('requires an explicit missing-source choice and never rewrites the adopted baseline during ordinary edits',()=>{
    const base=createOfficialTemplate(),next=createOfficialTemplate({kind:'light'}),selected=planTemplate(base,next);
    expect(selected.blocked).toBe(true);expect(selected.conflicts[0]?.kind).toBe('missingBaseline');
    expect(planTemplate(base,next,[],{options:{missingBaseline:'incoming'}}).blocked).toBe(false);
    const documents=views(base),authored=structuredClone(base);authored.pages[0]!.root.name='Authored';
    expect(templateEdit(documents,authored,'Edit').patches.every(patch=>patch.documentId!==documents.find(document=>'ui/template-source.json'in document.files)!.documentId)).toBe(true);
    expect(readTemplateSource(documents)?.source.pages[0]!.root.name).not.toBe('Authored');
  });
  it('joins source, UI and lock changes in a single edit with the original versions',()=>{
    const current=createOfficialTemplate(),documents=views(current),id=createId(documents),lock={engine:{kind:'engine',id:'galcraft.engine',version:'0.1.0',targets:['web'],required:true},plugins:[],template:{kind:'template',id:current.id,version:'0.1.0',targets:['web'],required:true},selectedProviders:{}};
    documents.push({documentId:id,revision:7,savedRevision:7,dirty:false,format:'json',files:{'dependencies.lock.json':JSON.stringify({data:lock})},savedFiles:{}});
    const result=prepareTemplateSwitch(documents,createOfficialTemplate({kind:'light'}));
    expect(result.blocked).toBe(false);expect(result.edit.expected).toContainEqual({ref:{kind:'document',id},revision:7});
    expect(result.edit.patches.some(patch=>patch.documentId===documents.find(document=>'ui/template-source.json'in document.files)!.documentId)).toBe(true);
  });
});
