import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { TemplateLibraryInputSchema, TemplateSwitchInputSchema } from '@galcraft/contracts';
import { TemplateLibrary } from '@galcraft/templates/library';
import { collectTemplateAssets, collectTemplateVariants, createTemplateSource, instantiateTemplate, mapTemplateExternalReferences, packTemplate, prepareTemplateSwitch, readTemplateDocuments, restoreHiddenTemplatePage, rewriteTemplateCss, templateStyleIssues } from '@galcraft/templates';
import { prepareTemplateAssets } from '@galcraft/assets';
import { fail, ok } from './result.mjs';

const absolute = path => { if (!isAbsolute(path)) throw new Error('TEMPLATE_ABSOLUTE_PATH_REQUIRED'); return path; };
const filesOf = documents => Object.assign({}, ...documents.map(document => document.files));
const variablesOf = documents => documents.flatMap(document => Object.entries(document.files).flatMap(([path,raw]) => {
  if (!path.endsWith('.json')) return []; let data;try{data=JSON.parse(raw).data;}catch{return [];}
  return [...(data?.variables??[]),...(data?.locals??[]).map(variable=>({...variable,sceneId:data.id}))];
}));
const errorResult = error => fail(String(error).split(':')[0].replace(/^Error\s*/, '').trim() || 'TEMPLATE_OPERATION_FAILED', String(error), 'M08', ['edit','compare']);

export class StudioTemplates {
  constructor({userData,projects,assets,plugins}) { this.projects=projects;this.assets=assets;this.plugins=plugins;this.previews=new Map();this.library=new TemplateLibrary(join(userData,'templates','library')); }
  /** @returns {Promise<import('@galcraft/contracts').Result<import('@galcraft/contracts').Json>>} */
  async manage(raw) {const result=await this.managePackage(raw);return result.ok?ok(JSON.parse(JSON.stringify(result.value))):result;}
  async managePackage(raw) {
    try {const input=TemplateLibraryInputSchema.parse(raw);
      switch(input.action){
        case 'list':return ok(await this.library.list(input));
        case 'detail':{const selected=await this.library.read(input);return ok({id:selected.template.id,version:selected.template.version,name:selected.manifest.name,description:selected.manifest.description,features:selected.template.features,targets:selected.manifest.targets,dependencies:selected.template.dependencies,externalReferences:selected.externalReferences,pages:selected.template.pages.map(page=>({id:page.id,key:page.key})),examples:selected.manifest.examples??[]});}
        case 'import':return ok(await this.library.import(new Uint8Array(await readFile(absolute(input.path))),input.choice));
        case 'export':{const bytes=await this.library.export(input);await mkdir(dirname(absolute(input.path)),{recursive:true});await writeFile(input.path,bytes);return ok({path:input.path,bytes:bytes.length});}
        case 'copy':return ok(await this.library.copy(input,input.name));
        case 'rename':return ok(await this.library.rename(input,input.name));
        case 'delete':return ok(await this.library.remove(input));
        case 'exportCurrent':return await this.exportCurrent(input);
      }
    }catch(error){return errorResult(error);}
  }
  async exportCurrent(input) {
    const project=this.projects.currentSession,root=this.projects.currentRoot;
    if(!project||!root)return fail('PROJECT_SESSION_MISSING','Open a work before exporting its applied Player UI.','M08');
    const documents=[...project.documents.values()],template=readTemplateDocuments(documents),allFiles=filesOf(documents),files={};
    for(const[path,text]of Object.entries(allFiles))if(path.startsWith('ui/styles/'))files[path]=new TextEncoder().encode(text);
    const indexDocument=documents.find(document=>'assets/index.json'in document.files),index=indexDocument?JSON.parse(indexDocument.files['assets/index.json']):null;
    const selectedIds=new Set(collectTemplateAssets(template)),assetDependencies={};
    for(const id of collectTemplateVariants(template)){const asset=index?.data.assets.find(asset=>asset.variants.some(variant=>variant.id===id));if(asset)selectedIds.add(asset.id);else throw new Error(`TEMPLATE_VARIANT_MISSING: ${id}`);}
    const lease=this.assets?await this.assets.acquireTypes(project):null;
    try{
      for(let count=0;count<(index?.data.assets.length??0);count++){let added=false;for(const asset of index?.data.assets??[])if(selectedIds.has(asset.id))for(const variant of asset.variants){const references=lease?.types.references(asset.kind,variant.typeData);if(references&&!references.ok)throw new Error(`${references.error.code}: ${references.error.message}`);for(const ref of references?.value??[]){const owner=ref.kind==='asset'?index.data.assets.find(item=>item.id===ref.id):ref.kind==='variant'?index.data.assets.find(item=>item.variants.some(variant=>variant.id===ref.id)):null;if(owner){(assetDependencies[asset.id]??=[]).push(owner.id);if(!selectedIds.has(owner.id)){selectedIds.add(owner.id);added=true;}}}}if(!added)break;}
      const assets=(index?.data.assets??[]).filter(asset=>selectedIds.has(asset.id)),assetFiles={};
      for(const asset of assets){assetFiles[asset.id]=[];for(const variant of asset.variants)for(const file of variant.files){const path=`assets/files/${asset.id}/${variant.id}/${file.path}`;files[path]=new Uint8Array(await readFile(join(root,path)));assetFiles[asset.id].push(path);}}
      const examples=input.includeExamples?[{path:'examples/pages.json',data:new TextEncoder().encode(JSON.stringify({pages:template.pages,locales:template.locales}))}]:[];
      const bytes=packTemplate({template,name:input.name,description:input.description,files,assetFiles,assets,assetDependencies,variables:variablesOf(documents),examples});
      await mkdir(dirname(absolute(input.path)),{recursive:true});await writeFile(input.path,bytes);
      return ok({path:input.path,bytes:bytes.length,workingCopy:true,saved:false,unappliedInputsExcluded:true,examples:examples.length});
    }finally{await lease?.release();}
  }
  async prepareSwitch(raw) {
    try{const input=TemplateSwitchInputSchema.parse(raw),project=this.projects.currentSession,root=this.projects.currentRoot;
      if(!project||!root)return fail('PROJECT_SESSION_MISSING','Open a work before applying a Player UI template.','M08');
      const documents=[...project.documents.values()],selected=await this.library.read(input),variables=variablesOf(documents);
      for(const dependency of selected.template.dependencies.filter(item=>item.kind==='plugin'&&item.required)){const exact=await this.plugins?.exactDirectory(dependency.id,dependency.version);if(!exact?.ok)throw new Error(`TEMPLATE_PLUGIN_REQUIRED: Install ${dependency.id}@${dependency.version} in Studio before applying this template.`);}
      for(const id of collectTemplateAssets(selected.template))if(!selected.assets.some(asset=>asset.id===id))throw new Error(`TEMPLATE_ASSET_METADATA_MISSING: ${id}`);
      const styleIssues=templateStyleIssues(selected.template,selected.files);if(styleIssues.length)throw new Error(styleIssues.join('\n'));
      let source=mapTemplateExternalReferences(selected.template,selected.externalReferences,input.mappings??{},variables);
      for(const ref of selected.externalReferences.filter(ref=>ref.kind!=='variable')){const id=input.mappings?.[ref.key];if(id&&!documents.some(document=>Object.values(document.files).some(raw=>raw.includes(`"id": "${id}"`)||raw.includes(`"id":"${id}"`))))throw new Error(`TEMPLATE_REFERENCE_TARGET_MISSING: ${ref.key}`);}
      const sourceFiles=Object.fromEntries(Object.entries(selected.files).filter(([path])=>path.startsWith('ui/styles/')).map(([path,bytes])=>[path,new TextDecoder().decode(bytes)]));
      // The conflict preview is read-only; independent resource preparation follows resolved choices.
      const preview=prepareTemplateSwitch(documents,source,input.options??{},sourceFiles);
      if(preview.blocked)return ok({...preview,edit:null});
      let prepared=null;const identityMap={...createTemplateSource(source).identities};
      if(selected.assets.length){const indexDocument=documents.find(document=>'assets/index.json'in document.files);if(!indexDocument)throw new Error('ASSET_INDEX_MISSING');
        const lease=this.assets?await this.assets.acquireTypes(project):null;
        try{prepared=await prepareTemplateAssets({projectRoot:root,index:JSON.parse(indexDocument.files['assets/index.json']),assets:selected.assets,files:selected.files,...(lease?{types:lease.types}:{})});}finally{await lease?.release();}
        Object.assign(identityMap,prepared.assetMap,prepared.variantMap);
        source=instantiateTemplate(source,id=>prepared.assetMap[id]??id,id=>prepared.variantMap[id]??id,new Map(Object.entries(identityMap)));
        for(const[path,text]of Object.entries(sourceFiles))sourceFiles[path]=rewriteTemplateCss(text,new Map(),id=>prepared.assetMap[id]??id);
      }
      const plan=prepareTemplateSwitch(documents,source,input.options??{},sourceFiles);
      if(prepared){plan.edit.patches.push(...prepared.indexPatches);plan.edit.expected.push(...prepared.expected);plan.edit.preparedAssets.push(...prepared.preparedAssets);}
      // Keep the actual package source, not the merged or cross-work mapped instance.
      plan.sourceRecord.source=structuredClone(selected.template);plan.sourceRecord.sourceFiles=Object.fromEntries(Object.entries(selected.files).filter(([path])=>path.startsWith('ui/styles/')).map(([path,bytes])=>[path,new TextDecoder().decode(bytes)]));
      Object.assign(plan.sourceRecord.identities,prepared?.assetMap??{},prepared?.variantMap??{});
      for(const ref of selected.externalReferences){const target=input.mappings?.[ref.key];if(target)plan.sourceRecord.identities[ref.id]=target;}
      const recordPatch=plan.edit.patches.find(patch=>patch.kind==='json'&&patch.changes.some(change=>change.path==='/data'&&change.after?.source));
      if(recordPatch)recordPatch.changes[0].after=plan.sourceRecord;
      else {const created=plan.edit.patches.find(patch=>patch.kind==='document'&&patch.after?.files?.['ui/template-source.json']);if(created){const envelope=JSON.parse(created.after.files['ui/template-source.json']);envelope.data=plan.sourceRecord;created.after.files['ui/template-source.json']=JSON.stringify(envelope);}}
      this.previews.set(plan.planId,{project,assets:prepared?.assets??[]});
      return ok(plan);
    }catch(error){return errorResult(error);}
  }
  async restorePage(pageKey){try{const project=this.projects.currentSession;if(!project)throw new Error('PROJECT_SESSION_MISSING');return ok({edit:restoreHiddenTemplatePage([...project.documents.values()],pageKey)});}catch(error){return errorResult(error);}}
  async previewResources(planId){const selected=this.previews.get(planId);if(!selected||selected.project!==this.projects.currentSession)return fail('TEMPLATE_PLAN_STALE','Review the current template plan before requesting its prepared resources.','M08');return this.assets.previewPreparedAssets(selected.assets);}
}
