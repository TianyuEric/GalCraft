import {expect,it} from 'vitest';
import {createId} from '@galcraft/contracts';
import {FixtureAsset} from '@galcraft/contracts/fixtures';
import {createOfficialTemplate} from './templates.js';
import {compileStyle} from './compiler.js';
import {inspectTemplate,packTemplate,mapTemplateExternalReferences,templateExternalReferences,collectTemplateAssets} from './package.js';
import {instantiateTemplate} from './editing.js';
import {createTemplateDocuments,readTemplateDocuments} from './documents.js';

it('preserves and remaps both reading font references through the formal template document boundary',()=>{
  const template=createOfficialTemplate(),unread=createId(),read=createId();
  template.readingStyles={unread:{fontId:unread,fontSize:26,bold:false},read:{fontId:read,color:'#756b61',italic:true}};
  expect(collectTemplateAssets(template)).toEqual(expect.arrayContaining([unread,read]));
  expect(readTemplateDocuments(createTemplateDocuments(template)).readingStyles).toEqual(template.readingStyles);
  const mapping=new Map([[unread,createId()],[read,createId()]]);
  const imported=instantiateTemplate(template,id=>mapping.get(id)??id);
  expect(imported.readingStyles?.unread?.fontId).toBe(mapping.get(unread));expect(imported.readingStyles?.read?.fontId).toBe(mapping.get(read));
  expect(imported.readingStyles?.read?.color).toBe('#756b61');
});
it('packages all state-image variants with media metadata and removes work relationships',()=>{
  const template=createOfficialTemplate(),asset=structuredClone(FixtureAsset),bytes=new Uint8Array([1,2,3]),files:Record<string,Uint8Array>={},assetFiles:Record<string,string[]>={[asset.id]:[]};
  template.pages[0]!.background.imageId=asset.id;
  for(const variant of asset.variants)for(const file of variant.files){file.bytes=bytes.length;const path=`assets/files/${asset.id}/${variant.id}/${file.path}`;files[path]=bytes;assetFiles[asset.id]!.push(path);}
  const imported=inspectTemplate(packTemplate({template,name:'Precise UI',description:'',files,assetFiles,assets:[asset]}));
  expect(imported.assets[0]!.variants.map(variant=>variant.id)).toEqual(asset.variants.map(variant=>variant.id));
  expect(imported.assets[0]!.variants.map(variant=>variant.metadata)).toEqual(asset.variants.map(variant=>variant.metadata));
  expect(imported.assets[0]!.characterId).toBeNull();expect(imported.assets[0]!.sceneIds).toEqual([]);expect(imported.manifest.examples).toEqual([]);
});
it('rejects CSS bytes that do not correspond to the exported applied source even with equal revisions',()=>{
  const template=createOfficialTemplate(),id=createId(),source='[data-gc-part="title.workTitle"] { color: #123456; }',style={id,name:'Current CSS',scope:{pageId:template.pages[0]!.id,componentId:null},language:'css' as const,sourcePath:`ui/styles/${id}.source.css`,sourceRevision:1,compiledPath:null,compiledSourceRevision:null,assets:[],issues:[]};
  const compiled=compileStyle({style,source,instanceId:template.instanceId});template.styles=[compiled.style];
  const files={[style.sourcePath]:new TextEncoder().encode(source),[compiled.style.compiledPath!]:new TextEncoder().encode(compiled.css!)};
  expect(inspectTemplate(packTemplate({template,name:'Current CSS',description:'',files,assetFiles:{}})).template.styles).toHaveLength(1);
  files[style.sourcePath]=new TextEncoder().encode(source.replace('#123456','#abcdef'));
  expect(()=>packTemplate({template,name:'Stale CSS',description:'',files,assetFiles:{}})).toThrow('TEMPLATE_STYLE_CSS_MISMATCH');
});
it('requires explicit typed and scoped cross-work variable mappings or unlinking',()=>{
  const template=createOfficialTemplate(),id=createId(),target=createId();template.pages[0]!.root.bindings={value:{source:'variable',variableId:id,scope:'longTerm'}};
  const references=templateExternalReferences(template,[{id,name:'Affinity',type:'number',scope:'longTerm',initial:0}]);
  expect(()=>mapTemplateExternalReferences(template,references,{},[])).toThrow('MAPPING_REQUIRED');
  expect(()=>mapTemplateExternalReferences(template,references,{[`variable:${id}`]:target},[{id:target,name:'Affinity',type:'number',scope:'progress',initial:0}])).toThrow('MAPPING_INVALID');
  expect(mapTemplateExternalReferences(template,references,{[`variable:${id}`]:null},[]).pages[0]!.root.bindings?.value).toEqual({source:'literal',value:null});
});
