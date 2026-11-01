import { StyleEditInputSchema, createId } from '@galcraft/contracts';
import type { DocumentView, NamedStyle, StyleEditInput } from '@galcraft/contracts';
import { compileStyle } from './compiler.js';
import { readTemplateDocuments } from './documents.js';
import { components, templateEdit } from './editing.js';
import type { PageEditPlan } from './editor.js';

/** Compile author source and prepare its source, CSS and metadata as one M02 edit. */
export function preparePageStyleEdit(input: { documents: readonly DocumentView[]; request: StyleEditInput; resolveAsset?: (id: string) => string }): PageEditPlan {
  const request = StyleEditInputSchema.parse(input.request), template = readTemplateDocuments(input.documents);
  const page = template.pages.find(item => item.id === request.pageId);
  if (!page || request.componentId && !components(page.root).some(item => item.id === request.componentId)) throw new Error('UI_STYLE_SCOPE');
  const previous = request.styleId ? template.styles.find(item => item.id === request.styleId) : undefined;
  if (request.styleId && !previous) throw new Error(`UI_STYLE_MISSING: ${request.styleId}`);
  const id = previous?.id ?? createId(input.documents), files = Object.assign({}, ...input.documents.map(document => document.files)) as Record<string, string>;
  const sourcePath = previous && previous.language===request.language && previous.sourcePath !== previous.compiledPath ? previous.sourcePath : `ui/styles/${id}.source.${request.language}`;
  const style: NamedStyle = { id, name: request.name, scope: { pageId: page.id, componentId: request.componentId }, activation: request.activation,
    language: request.language, sourcePath, sourceRevision: (previous?.sourceRevision ?? 0) + 1,
    compiledPath: previous?.compiledPath && previous.compiledPath !== sourcePath ? previous.compiledPath : `ui/styles/${id}.compiled.css`,
    compiledSourceRevision: previous?.compiledSourceRevision ?? null, assets: previous?.assets ?? [], issues: [] };
  const compiled = compileStyle({ style, source: request.source, instanceId: template.instanceId, modules: files,
    ...(style.compiledPath && files[style.compiledPath] !== undefined ? { lastValidCss: files[style.compiledPath]! } : {}), ...(input.resolveAsset ? { resolveAsset: input.resolveAsset } : {}) });
  if (previous) template.styles[template.styles.indexOf(previous)] = compiled.style; else template.styles.push(compiled.style);
  const edit = templateEdit([...input.documents], template, request.label), root = input.documents.find(document => 'ui/template.json' in document.files);
  if (!root) throw new Error('UI_TEMPLATE_MISSING');
  const changed = [{ path: sourcePath, after: request.source }, ...(compiled.css !== null && compiled.style.compiledPath ? [{ path: compiled.style.compiledPath, after: compiled.css }] : [])];
  for (const file of changed) if (root.files[file.path] !== file.after) edit.patches.push({ kind: 'file', documentId: root.documentId, path: file.path, before: root.files[file.path] ?? null, after: file.after });
  if(previous&&previous.sourcePath!==sourcePath&&previous.sourcePath!==previous.compiledPath){const owner=input.documents.find(document=>previous.sourcePath in document.files);if(owner){edit.patches.push({kind:'file',documentId:owner.documentId,path:previous.sourcePath,before:owner.files[previous.sourcePath]!,after:null});if(!edit.expected.some(version=>version.ref.id===owner.documentId))edit.expected.push({ref:{kind:'document',id:owner.documentId},revision:owner.revision});}}
  if (!edit.expected.some(version => version.ref.id === root.documentId)) edit.expected.push({ ref: { kind: 'document', id: root.documentId }, revision: root.revision });
  return { template, edit, affected: { pageIds: [page.id], componentIds: request.componentId ? [request.componentId] : [], styleIds: [id], animationIds: [] },
    created: { pages: [], components: [], styles: previous ? [] : [id], animations: [] }, issues: compiled.style.issues };
}
