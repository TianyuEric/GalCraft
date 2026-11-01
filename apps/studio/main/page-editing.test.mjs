import { expect, it } from 'vitest';
import { createId } from '@galcraft/contracts';
import { createBasicComponent, createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { prepareStudioPageEdit } from './page-editing.mjs';

it('measures the installed Player before freezing a flow container and checks every measured input version',async()=>{
  const template=createOfficialTemplate(),page=template.pages[0],group=createBasicComponent('container'),text=createBasicComponent('text');
  group.layout.mode='row';text.layout.position='flow';text.layout.width={unit:'auto'};group.children=[text];page.root.children.push(group);
  const documents=createTemplateDocuments(template),raw=JSON.stringify({data:{canvas:{width:1920,height:1080}}});documents.push({documentId:createId(),revision:4,format:'json',files:{'project.json':raw}});
  const calls=[],capture=async input=>{calls.push(input);return{reached:true,layoutFrames:{[group.id]:{[text.id]:{x:18,y:12,width:319.5,height:41.25}}}};};
  const result=await prepareStudioPageEdit({documents,request:{label:'Freeze',operations:[{kind:'component.update',pageId:page.id,componentId:group.id,changes:{layout:{mode:'absolute'}}}]},capture});
  expect(calls).toEqual([{page:page.key,freezeLayout:[group.id]}]);
  expect(result.template.pages[0].root.children.at(-1).children[0].layout).toMatchObject({position:'free',x:{unit:'px',value:18},width:{unit:'px',value:319.5}});
  expect(result.edit.expected.map(value=>value.ref.id).sort()).toEqual(documents.map(document=>document.documentId).sort());
  await expect(prepareStudioPageEdit({documents,request:{label:'Freeze',operations:[{kind:'component.update',pageId:page.id,componentId:group.id,changes:{layout:{mode:'absolute'}}}]}})).rejects.toThrow('UI_LAYOUT_CAPTURE_UNAVAILABLE');
});
