import { PageEditInputSchema } from '@galcraft/contracts';
import { readTemplateDocuments } from '@galcraft/templates';
import { preparePageEdit } from '@galcraft/templates/editor';

/** GUI and MCP use the installed Player to freeze CSS intrinsic layout, never estimated text sizes. */
export async function prepareStudioPageEdit({ documents, request, capture }) {
  request=PageEditInputSchema.parse(request);
  const template=readTemplateDocuments(documents), layoutFrames={};
  const conversions=request.operations.filter(operation=>operation.kind==='component.update'&&operation.changes.layout?.mode==='absolute');
  for(const pageId of new Set(conversions.map(operation=>operation.pageId))){
    const page=template.pages.find(page=>page.id===pageId);if(!page)continue;
    const components=new Map();const visit=value=>{components.set(value.id,value);value.children.forEach(visit);};visit(page.root);
    const containerIds=conversions.filter(operation=>operation.pageId===pageId&&components.get(operation.componentId)?.layout.mode!=='absolute').map(operation=>operation.componentId);
    if(!containerIds.length)continue;
    if(!capture)throw new Error('UI_LAYOUT_CAPTURE_UNAVAILABLE: Open the installed Player before converting flow layout.');
    const observed=await capture({page:page.key,freezeLayout:containerIds});
    if(!observed.reached)throw new Error('UI_LAYOUT_CAPTURE_FAILED: The Player could not measure the current page.');
    for(const id of containerIds){if(!observed.layoutFrames?.[id])throw new Error(`UI_LAYOUT_CAPTURE_FAILED: The Player could not measure container ${id}.`);layoutFrames[id]=observed.layoutFrames[id];}
  }
  const prepared=preparePageEdit({documents,request,layoutFrames});
  if(Object.keys(layoutFrames).length)for(const document of documents)if(!prepared.edit.expected.some(version=>version.ref.id===document.documentId))prepared.edit.expected.push({ref:{kind:'document',id:document.documentId},revision:document.revision});
  return prepared;
}
