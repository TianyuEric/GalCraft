import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createId, type DocumentView, type Result } from '@galcraft/contracts';
import { componentTextOverride, components, createOfficialTemplate, createTemplateDocuments, readTemplateDocuments } from '@galcraft/templates';
import { createBasicComponent, preparePageEdit } from '@galcraft/templates/editor';
import { preparePageStyleEdit } from '@galcraft/templates/style-editing';
import { ProjectSession } from './index.js';

const base=resolve(import.meta.dirname,'../../../tmp/testing/page-authoring');
const roots:string[]=[],sessions:ProjectSession[]=[];
const value=<T>(result:Result<T>):T=>{if(!result.ok)throw new Error(`${result.error.code}: ${result.error.message}`);return result.value;};
afterEach(async()=>{for(const session of sessions)await session.dispose('discard');sessions.length=0;for(const root of roots){if(!root.startsWith(base+sep))throw new Error('Acceptance directory escaped its workspace');await rm(root,{recursive:true,force:true});}roots.length=0;});

it('undoes the page and locale label together and reopens the saved local label from disk',async()=>{
  await mkdir(base,{recursive:true});const root=resolve(base,createId()),projectId=createId();roots.push(root);
  const template=createOfficialTemplate(),page=template.pages[0]!,button=components(page.root).find(component=>component.part==='title.menu.characters')!;
  let session=await ProjectSession.createProject(root,projectId,createTemplateDocuments(template));sessions.push(session);
  const read=()=>readTemplateDocuments([...session.documents.values()]);
  const edit=preparePageEdit({documents:[...session.documents.values()],request:{label:'After story',operations:[{kind:'component.text',pageId:page.id,componentId:button.id,locale:'zh-CN',text:'After story'}]}});
  const receipt=value(session.applyEdit(value(session.planEdit(edit.edit)).planId,edit.edit.expected)),undo=value(session.planUndo(page.id,receipt.operationId));
  const text=()=>{const current=read();return componentTextOverride(components(current.pages[0]!.root).find(component=>component.id===button.id)!,current.locales,'zh-CN');};
  expect(text()).toBe('After story');value(session.undo(undo.planId));expect(text()).toBeUndefined();value(session.redo(undo.planId));expect(text()).toBe('After story');
  value(await session.save(value(session.planSave({kind:'current',documentId:page.id})).planId));
  await session.dispose('discard');session=await ProjectSession.open(root,projectId);sessions.push(session);expect(text()).toBe('After story');
  expect(read().locales.en!['nav.characters']).toBe(template.locales.en!['nav.characters']);
},30000);

it('commits the actual page editor plan through M02, restores its group, and reopens original styles and three image instances from disk',async()=>{
  await mkdir(base,{recursive:true});const root=resolve(base,createId()),projectId=createId();roots.push(root);
  const template=createOfficialTemplate(),initial=createTemplateDocuments(template),ids=new Set(initial.map(document=>document.documentId));
  let session=await ProjectSession.createProject(root,projectId,initial);sessions.push(session);
  const documents=()=>[...ids].map(id=>session.readDocument(id)).filter((document):document is DocumentView=>!!document&&Object.keys(document.files).length>0);
  const apply=(plan:ReturnType<typeof preparePageEdit>)=>{const prepared=value(session.planEdit(plan.edit)),receipt=value(session.applyEdit(prepared.planId,plan.edit.expected));plan.created.pages.forEach(id=>ids.add(id));return receipt;};
  const pageId=createId(),pageRoot=createBasicComponent('container'),group=createBasicComponent('container');group.visualScale=1.4;
  group.children=[0,1,2].map(index=>{const image=createBasicComponent('image');image.layout.x.value=index*180;image.normal.images={decoration:{assetId:createId(),variantId:createId(),mode:'contain',positionX:.5,positionY:.5,colorMode:'original',tint:null,opacity:1,slices:null,borders:null,fillCenter:true}};return image;});
  const added=preparePageEdit({documents:documents(),request:{label:'Three characters',operations:[{kind:'page.create',id:pageId,key:'credits',title:'Credits',root:pageRoot},{kind:'component.add',pageId,parentId:pageRoot.id,component:group}]}});
  const receipt=apply(added),undo=value(session.planUndo(pageId,receipt.operationId));
  expect(readTemplateDocuments(documents()).pages.find(page=>page.id===pageId)?.root.children[0]?.children).toHaveLength(3);
  value(session.undo(undo.planId));expect(readTemplateDocuments(documents()).pages.some(page=>page.id===pageId)).toBe(false);
  value(session.redo(undo.planId));expect(readTemplateDocuments(documents()).pages.find(page=>page.id===pageId)?.root.children[0]?.visualScale).toBe(1.4);
  const source='$ink: #123456; [data-gc-part="basic.image"] { outline: 2px solid $ink; }';
  const styled=preparePageStyleEdit({documents:documents(),request:{label:'Source style',name:'Character outline',pageId,componentId:group.id,language:'scss',activation:'page',source}});apply(styled);
  const style=styled.template.styles[0]!;
  const removed=preparePageEdit({documents:documents(),request:{label:'Remove group',operations:[{kind:'component.remove',pageId,componentIds:[group.id]}]}}),removedReceipt=apply(removed);
  expect(session.readDocument(template.instanceId)!.files[style.sourcePath]).toBeUndefined();
  value(session.undo(value(session.planUndo(pageId,removedReceipt.operationId)).planId));
  expect(session.readDocument(template.instanceId)!.files[style.sourcePath]).toBe(source);
  value(await session.save(value(session.planSave({kind:'all'})).planId));
  expect(await readFile(resolve(root,style.sourcePath),'utf8')).toBe(source);
  await session.dispose('discard');session=await ProjectSession.open(root,projectId);sessions.push(session);
  const reopened=readTemplateDocuments(documents()),restored=reopened.pages.find(page=>page.id===pageId)!;
  expect(restored.root.children[0]!.children).toEqual(group.children);expect(restored.root.children[0]!.visualScale).toBe(1.4);
  expect(session.readDocument(template.instanceId)!.files[style.compiledPath!]).toContain('#123456');
  const stale=preparePageEdit({documents:documents(),request:{label:'Stale',operations:[{kind:'component.update',pageId,componentId:group.id,changes:{name:'stale'}}]}});
  apply(preparePageEdit({documents:documents(),request:{label:'Current',operations:[{kind:'component.update',pageId,componentId:group.id,changes:{name:'current'}}]}}));
  expect(session.planEdit(stale.edit).ok).toBe(false);
},30000);
