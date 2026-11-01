import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { AssetSchema, RelativePathSchema, RuntimeTemplateSchema, normalizeRuntimeTemplate } from '@galcraft/contracts';
import type { Asset, Id, RuntimeTemplate, Variable } from '@galcraft/contracts';
import { z } from 'zod';
import { components, instantiateTemplate, rewriteTemplateCss, rewriteTemplatePath } from './editing.js';
import { missingRequiredEntrances } from './templates.js';
import { validateImages } from './images.js';
import { collectStyleModules, compileStyle } from './compiler.js';
export const TemplateExternalReferenceSchema = z.strictObject({ key:z.string(), kind:z.enum(['variable','scene','character','flow','ending','label']), id:z.string(), paths:z.array(z.string()),
  valueType:z.enum(['number','boolean','string']).optional(), scope:z.enum(['progress','local','longTerm']).optional(), sceneId:z.string().nullable().optional() });
export type TemplateExternalReference = z.infer<typeof TemplateExternalReferenceSchema>;
type TemplateVariable=Variable&{sceneId?:string};
export function templateExternalReferences(template: RuntimeTemplate, variables: readonly TemplateVariable[] = []): TemplateExternalReference[] {
  const refs = new Map<string, TemplateExternalReference>();
  const add = (kind:TemplateExternalReference['kind'],id:string,path:string,scope?:TemplateExternalReference['scope']) => {
    const key=`${kind}:${id}`,variable=variables.find(variable=>variable.id===id); const found=refs.get(key);
    if(found){found.paths.push(path);return;}
    refs.set(key,{key,kind,id,paths:[path],...(scope?{scope}:{}),...(variable?{valueType:variable.type,scope:variable.scope,sceneId:variable.sceneId??null}:{})});
    if(variable?.scope==='local'&&variable.sceneId&&!refs.has(`scene:${variable.sceneId}`))refs.set(`scene:${variable.sceneId}`,{key:`scene:${variable.sceneId}`,kind:'scene',id:variable.sceneId,paths:[]});
  };
  const visit=(value:unknown,path:string)=>{if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.forEach((item,index)=>visit(item,`${path}/${index}`));return;}
    const record=value as Record<string,any>;
    if(record.source==='variable'&&typeof record.variableId==='string')add('variable',record.variableId,path,record.scope);
    if(['scene','character','flow','ending','label'].includes(record.kind)&&typeof record.id==='string')add(record.kind,record.id,path);
    for(const [key,item]of Object.entries(record))visit(item,`${path}/${key}`);
  };visit(template,'');return [...refs.values()];
}
export function mapTemplateExternalReferences(template:RuntimeTemplate,references:TemplateExternalReference[],mapping:Record<string,string|null>,variables:readonly TemplateVariable[]=[]):RuntimeTemplate {
  const next=structuredClone(template);
  for(const ref of references){if(!(ref.key in mapping))throw new Error(`TEMPLATE_REFERENCE_MAPPING_REQUIRED: ${ref.key}`);
    const target=mapping[ref.key];
    if(ref.kind==='variable'&&target!==null){const variable=variables.find(item=>item.id===target);
      if(!variable||ref.valueType&&variable.type!==ref.valueType||ref.scope&&variable.scope!==ref.scope||ref.scope==='local'&&(!ref.sceneId||variable.sceneId!==mapping[`scene:${ref.sceneId}`]))throw new Error(`TEMPLATE_VARIABLE_MAPPING_INVALID: ${ref.key}`);}
    for(const path of ref.paths){const parts=path.split('/').filter(Boolean);let parent:any=next;for(const key of parts.slice(0,-1))parent=parent[key];const key=parts.at(-1)!;
      if(target===null){if(parent[key]?.source==='variable')parent[key]={source:'literal',value:null};else parent[key]=null;}
      else if(parent[key]?.source==='variable')parent[key].variableId=target;else parent[key].id=target;}
  }return RuntimeTemplateSchema.parse(next);
}
export function collectTemplateAssets(template: RuntimeTemplate): Id[] {
  const ids = new Set<Id>();
  const visit = (value: unknown, field = '') => {
    if (typeof value === 'string' && ['assetId', 'imageId', 'fontId'].includes(field)) ids.add(value);
    else if (Array.isArray(value)) value.forEach(item => visit(item, field));
    else if (value && typeof value === 'object') { const ref=value as {kind?:string;id?:string};if(ref.kind==='asset'&&ref.id)ids.add(ref.id);for (const [key, item] of Object.entries(value)) visit(item, key); }
  };
  visit(template); template.styles.flatMap(style => style.assets).forEach(id => ids.add(id)); return [...ids];
}
export function collectTemplateVariants(template:RuntimeTemplate):Id[]{const ids=new Set<Id>();const scan=(value:unknown)=>{if(Array.isArray(value))value.forEach(scan);else if(value&&typeof value==='object'){const item=value as Record<string,unknown>;if(item.kind==='variant'&&typeof item.id==='string')ids.add(item.id);if(typeof item.variantId==='string')ids.add(item.variantId);Object.values(item).forEach(scan);}};scan(template);return [...ids];}
export function templateIssues(template: RuntimeTemplate): string[] {
  return [...missingRequiredEntrances(template).map(part => `必要入口不可达：${part}`),
    ...template.pages.flatMap(page => components(page.root).flatMap(validateImages)),
    ...template.pages.flatMap(page => components(page.root).flatMap(component=>Object.entries(component.animations).filter(([,id])=>!template.animations.some(animation=>animation.id===id)).map(([event])=>`动画引用不可用：${page.key}/${component.part}/${event}`))),
    ...template.styles.filter(style => style.enabled!==false&&(style.sourceRevision !== style.compiledSourceRevision || !style.compiledPath || style.issues.some(issue => issue.severity === 'error')))
      .map(style => `样式尚未有效编译：${style.name}`)];
}
export function templateStyleIssues(template:RuntimeTemplate,files:Record<string,Uint8Array>):string[]{
  const modules=Object.fromEntries(Object.entries(files).filter(([path])=>path.endsWith('.scss')).map(([path,data])=>[path,strFromU8(data)])),issues:string[]=[];
  for(const style of template.styles){const source=files[style.sourcePath],css=style.compiledPath&&files[style.compiledPath];if(!source||!css){issues.push(`TEMPLATE_STYLE_FILES_MISSING: ${style.name}`);continue;}
    const compiled=compileStyle({style,source:strFromU8(source),instanceId:template.instanceId,modules});if(compiled.css===null||compiled.style.issues.some(issue=>issue.severity==='error')||compiled.css!==strFromU8(css))issues.push(`TEMPLATE_STYLE_CSS_MISMATCH: ${style.sourcePath}`);}
  return issues;
}
export function packTemplate(input: { template: RuntimeTemplate; name: string; description: string; files: Record<string, Uint8Array>;
  assetFiles: Record<Id, string[]>; assets?: Asset[]; assetDependencies?:Record<Id,Id[]>; variables?:TemplateVariable[]; cover?:string|null; targets?:string[]; examples?:{path:string;data:Uint8Array}[] }): Uint8Array {
  RuntimeTemplateSchema.parse(input.template); const issues = templateIssues(input.template); if (issues.length) throw new Error(issues.join('\n'));
  const required = new Set(input.template.styles.flatMap(style => [style.sourcePath, style.compiledPath!]));
  if(input.cover)required.add(input.cover);
  const modules = Object.fromEntries(Object.entries(input.files).filter(([path]) => path.endsWith('.scss'))
    .map(([path, data]) => [path, strFromU8(data)]));
  for (const style of input.template.styles.filter(style => style.language === 'scss')) {
    const source = input.files[style.sourcePath];
    if (!source) throw new Error(`模板文件缺失：${style.sourcePath}`);
    for (const path of collectStyleModules(style.sourcePath, strFromU8(source), modules)) required.add(path);
  }
  const styleIssues=templateStyleIssues(input.template,input.files);if(styleIssues.length)throw new Error(styleIssues.join('\n'));
  const referenced=new Set(collectTemplateAssets(input.template));
  for(let pass=0;pass<(input.assets?.length??0);pass++){let changed=false;for(const id of [...referenced])for(const dependency of input.assetDependencies?.[id]??[])if(!referenced.has(dependency)){referenced.add(dependency);changed=true;}if(!changed)break;}
  const variants=collectTemplateVariants(input.template);
  for(const id of variants){const owner=input.assets?.find(asset=>asset.variants.some(variant=>variant.id===id));if(!owner)throw new Error(`TEMPLATE_VARIANT_MISSING: ${id}`);referenced.add(owner.id);}
  for(const id of referenced)if(!input.assets?.some(asset=>asset.id===id))throw new Error(`TEMPLATE_ASSET_METADATA_MISSING: ${id}`);
  const assets=(input.assets??[]).filter(asset=>referenced.has(asset.id)).map(asset=>{const copy=structuredClone(asset);copy.characterId=null;copy.sceneIds=[];copy.groupId=null;copy.source={kind:'template',description:input.name,usage:asset.source.usage};
    for(const variant of copy.variants)delete variant.metadata.authorDocument;
    return AssetSchema.parse(copy);});
  for(const asset of assets){if(!asset.variants.some(variant=>variant.id===asset.activeVariantId)||!asset.variants.some(variant=>variant.id===asset.originalVariantId))throw new Error(`TEMPLATE_ASSET_VARIANTS_INVALID: ${asset.id}`);
    for(const variant of asset.variants)for(const file of variant.files)required.add(`assets/files/${asset.id}/${variant.id}/${file.path}`);}
  for (const id of collectTemplateAssets(input.template)) { const paths = input.assetFiles[id]; if (!paths?.length) throw new Error(`模板素材未提供：${id}`); paths.forEach(path => required.add(path)); }
  const files: Record<string, Uint8Array> = { 'config/template.json': strToU8(JSON.stringify(input.template)) };
  for (const path of required) { RelativePathSchema.parse(path); if (!input.files[path]) throw new Error(`模板文件缺失：${path}`); files[path] = input.files[path]!; }
  const manifest = { format: 'galcraft-template', schemaVersion: 1, id: input.template.id, version: input.template.version,
    name: input.name, description: input.description, cover: input.cover??null, engineRange: '^0.1.0', targets: input.targets??['web', 'windows'],
    features: input.template.features, dependencies: input.template.dependencies, template: input.template, examples: (input.examples??[]).map(example=>example.path), assetFiles: input.assetFiles,
    assets, externalReferences:templateExternalReferences(input.template,input.variables),
    files: Object.entries(files).map(([path, data]) => ({ path, bytes: data.length,
      role: path.startsWith('assets/') ? 'asset' : path.endsWith('.css') ? 'css' : path.endsWith('.scss') ? 'source' : 'config' })) };
  for(const example of input.examples??[]){RelativePathSchema.parse(example.path);if(!example.path.startsWith('examples/'))throw new Error('TEMPLATE_EXAMPLE_PATH');files[example.path]=example.data;manifest.files.push({path:example.path,bytes:example.data.length,role:'example'});}
  files['manifest.json'] = strToU8(JSON.stringify(manifest)); return zipSync(files);
}
export function inspectTemplate(bytes: Uint8Array) {
  const files = unzipSync(bytes);if(!files['manifest.json']||!files['config/template.json'])throw new Error('TEMPLATE_MANIFEST_MISSING');const manifest = JSON.parse(strFromU8(files['manifest.json']!));
  if (manifest.format !== 'galcraft-template' || manifest.schemaVersion !== 1) throw new Error('模板包格式无效');
  for (const file of manifest.files as { path: string; bytes: number }[]) {
    RelativePathSchema.parse(file.path); if (files[file.path]?.length !== file.bytes) throw new Error(`模板文件与清单不符：${file.path}`);
  }
  const template = normalizeRuntimeTemplate(JSON.parse(strFromU8(files['config/template.json']!)));
  if (template.id !== manifest.id || template.version !== manifest.version) throw new Error('模板身份与清单不符');
  const assets=(manifest.assets??[]).map((asset:unknown)=>AssetSchema.parse(asset));
  const externalReferences=(manifest.externalReferences??templateExternalReferences(template)).map((ref:unknown)=>TemplateExternalReferenceSchema.parse(ref));
  return { template, manifest, files, assets:assets as Asset[], externalReferences:externalReferences as TemplateExternalReference[], instantiate: (mapAsset?: (id: Id) => Id) => instantiateTemplate(template, mapAsset),
    materialize: (mapAsset: (id: Id) => Id = id => id, mapVariant: (id: Id) => Id = id => id) => {
      const ids = new Map<string, string>(), instance = instantiateTemplate(template, mapAsset, mapVariant, ids);
      const rewritten: Record<string, Uint8Array> = {};
      for (const [path, bytes] of Object.entries(files)) if (path !== 'manifest.json') {
        rewritten[rewriteTemplatePath(path, ids)] = /\.(css|scss)$/.test(path) ? strToU8(rewriteTemplateCss(strFromU8(bytes), ids, mapAsset)) : bytes;
      }
      rewritten['config/template.json'] = strToU8(JSON.stringify(instance));
      return { template: instance, files: rewritten };
    } };
}
