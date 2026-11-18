import { GalleryEntrySchema, PageEditInputSchema, StyleEditInputSchema, type ComponentConfig, type DocumentView, type VersionRef } from '@galcraft/contracts';
import { readTemplateDocuments, type TemplateExternalReference } from '@galcraft/templates';
import { preparePageEdit, type FlowLayoutFrames } from '@galcraft/templates/editor';
import { preparePageStyleEdit } from '@galcraft/templates/style-editing';

type LayoutCapture = (input: { page: string; freezeLayout: string[] }) => Promise<{ reached: boolean; layoutFrames?: FlowLayoutFrames }>;

export function prepareDirectPageEdit(documents: readonly DocumentView[], request: unknown) {
  return preparePageEdit({ documents, request: PageEditInputSchema.parse(request) });
}

/** GUI and MCP use the installed Player to freeze CSS intrinsic layout, never estimated text sizes. */
export async function prepareStudioPageEdit({ documents, request: raw, capture }: { documents: readonly DocumentView[]; request: unknown; capture?: LayoutCapture }) {
  const request = PageEditInputSchema.parse(raw);
  const conversions=request.operations.filter(operation=>operation.kind==='component.update').filter(operation=>operation.changes.layout?.mode==='absolute');
  if (!conversions.length) return preparePageEdit({ documents, request });
  const template=readTemplateDocuments(documents), layoutFrames: FlowLayoutFrames = {};
  for(const pageId of new Set(conversions.map(operation=>operation.pageId))){
    const page=template.pages.find(page=>page.id===pageId);if(!page)continue;
    const components=new Map<string, ComponentConfig>();const visit=(value: ComponentConfig)=>{components.set(value.id,value);value.children.forEach(visit);};visit(page.root);
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

export function prepareStudioPageStyleEdit(documents: readonly DocumentView[], request: unknown) {
  return preparePageStyleEdit({ documents, request: StyleEditInputSchema.parse(request) });
}

export function templateGalleryVersions(documents: readonly DocumentView[], references: readonly TemplateExternalReference[], mappings: Record<string, string | null>): VersionRef[] {
  return references.filter(ref => ref.kind === 'gallery').map(ref => {
    const id = mappings[ref.key], path = `gallery/${id}.json`;
    const document = documents.find(document => Object.hasOwn(document.files, path));
    const target = document && GalleryEntrySchema.safeParse(JSON.parse(document.files[path]!).data);
    if (!document || !target?.success || target.data.id !== id || target.data.kind !== 'cg')
      throw new Error(`TEMPLATE_GALLERY_MAPPING_INVALID: ${ref.key}`);
    return { ref: { kind: 'document', id: document.documentId }, revision: document.revision };
  });
}
