import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createId } from '../packages/contracts/dist/index.js';
import { parse, patchFields, toDocumentPatch } from '../packages/dsl/dist/index.js';
import { createOfficialTemplate, components } from '../packages/templates/dist/index.js';
import { ProjectSession } from '../packages/documents/dist/index.js';

/** One-time local conversion. Its map is captured before any new differences can be added. */
export function planGalleryUpgrade(documents) {
  const edit={label:'升级鉴赏差分格式',origin:'batch',expected:[],patches:[],preparedAssets:[],requiredRefs:[]};
  const map={},issues=[];
  const changed=new Set();
  const expect=document=>{if(!changed.has(document.documentId)){changed.add(document.documentId);edit.expected.push({ref:{kind:'document',id:document.documentId},revision:document.revision});}};
  for(const document of documents)for(const [path,raw] of Object.entries(document.files)){
    if(!path.startsWith('gallery/')||!path.endsWith('.json'))continue;
    const entry=JSON.parse(raw).data;if(entry.kind!=='cg')continue;
    const next=structuredClone(entry);
    if(!entry.differences){next.differences=entry.assets.map((assetId,index)=>({id:createId(documents),assetId,name:`差分 ${index+1}`,order:index}));next.coverDifferenceId=next.differences.find(diff=>diff.assetId===entry.cover)?.id??null;next.assets=[];next.cover=null;
      expect(document);edit.patches.push({kind:'json',documentId:document.documentId,changes:[{path:'/data',before:entry,after:next,op:'set'}]});}
    map[entry.id]=next.differences.map(diff=>({...diff}));
  }
  const defaults=createOfficialTemplate({kind:'standard'});
  const animationIds=new Set(documents.flatMap(document=>Object.entries(document.files).filter(([path])=>path==='ui/template.json').flatMap(([,raw])=>JSON.parse(raw).data.template.animations.map(animation=>animation.id))));
  for(const document of documents)for(const [path,raw] of Object.entries(document.files)){
    if(!path.startsWith('ui/pages/')||!path.endsWith('.json'))continue;
    const page=JSON.parse(raw).data;if(!['cg','music'].includes(page.key))continue;
    const source=defaults.pages.find(item=>item.key===page.key),next=structuredClone(page);
    if(page.key==='cg')for(const component of components(next.root))if(component.part.startsWith('music.'))component.part=`cg.${component.part}`;
    const types=components(next.root).find(component=>component.part==='cg.types');
    if(types)for(const [key,id]of Object.entries(types.animations))if(!animationIds.has(id))delete types.animations[key];
    const existing=new Set(components(next.root).map(component=>component.part));
    for(const component of components(source.root).slice(1))if(!existing.has(component.part)){
      const fresh=structuredClone(component);fresh.id=createId(documents);fresh.children=[];fresh.animations={};
      const parentPart=component.part.slice(0,component.part.lastIndexOf('.'));const parent=components(next.root).find(item=>item.part===parentPart)??next.root;parent.children.push(fresh);existing.add(component.part);
    }
    if(JSON.stringify(page)!==JSON.stringify(next)){expect(document);edit.patches.push({kind:'json',documentId:document.documentId,changes:[{path:'/data',before:page,after:next,op:'set'}]});}
  }
  for(const document of documents)for(const [path,text] of Object.entries(document.files)){
    if(!path.endsWith('/script.gal'))continue;
    const parsed=parse({documentId:document.documentId,revision:document.revision,text});const edits=[];
    for(const statement of parsed.statements){
      const args=statement.args,changes=[];
      if(statement.command==='unlockCg'&&!Array.isArray(args.differenceIds)&&map[args.entryId])changes.push({field:'differenceIds',op:'set',value:map[args.entryId].map(diff=>diff.id)});
      if(statement.command==='changeBg'&&args.galleryId&&!args.differenceId){
        const matches=map[args.galleryId]?.filter(diff=>diff.assetId===args.assetId)??[];
        if(matches.length===1)changes.push({field:'differenceId',op:'set',value:matches[0].id});
        else issues.push({path,statementId:statement.id,entryId:args.galleryId,reason:'背景素材不能唯一对应差分；请选择明确差分',matches:matches.map(diff=>diff.id)});
      }
      if(changes.length){const result=patchFields(parsed,{documentId:document.documentId,revision:document.revision,statementIds:[statement.id],changes});if(!result.ok)throw new Error(result.error.message);edits.push(...result.value);}
    }
    if(edits.length){expect(document);edit.patches.push(toDocumentPatch(document.documentId,edits));}
  }
  return {edit,map,issues};
}
export function upgradeGalleryLongTerm(value,map){
  if(value.schemaVersion===2)return structuredClone(value);
  if(!Array.isArray(value.cg))throw new Error('旧 CG 资料不是条目集合');
  const cg={};for(const id of value.cg){if(!map[id])throw new Error(`缺少旧作品鉴赏清单：${id}`);cg[id]=map[id].map(diff=>diff.id);}
  return {...structuredClone(value),schemaVersion:2,cg,video:[]};
}
const unwrap=result=>{if(!result.ok)throw new Error(result.error.message);return result.value;};
export async function upgradeGalleryDirectory(directory,backupDirectory){
  const root=resolve(directory),backup=resolve(backupDirectory);
  const project=JSON.parse(await readFile(join(root,'project.json'),'utf8')).data;
  // Keep the original backup and original difference map on repeated verification runs.
  let original;
  try{original=JSON.parse(await readFile(join(backup,'gallery-before.json'),'utf8'));if(original.projectId!==project.projectId)throw new Error('备份属于另一个作品');}
  catch(error){if(error.code!=='ENOENT')throw error;await mkdir(backup,{recursive:true});await cp(root,join(backup,'work'),{recursive:true,errorOnExist:true,force:false});}
  const session=await ProjectSession.open(root,project.projectId);
  try{const planned=planGalleryUpgrade([...session.documents.values()]);
    if(!original)await writeFile(join(backup,'gallery-before.json'),JSON.stringify({projectId:project.projectId,map:planned.map},null,2));
    if(planned.issues.length)return {directory:root,projectId:project.projectId,backup,changed:0,issues:planned.issues,map:original?.map??planned.map};
    if(planned.edit.patches.length){const plan=unwrap(session.planEdit(planned.edit));unwrap(session.applyEdit(plan.planId,planned.edit.expected));unwrap(await session.save(unwrap(session.planSave({kind:'all'})).planId));}
    return {directory:root,projectId:project.projectId,backup,changed:planned.edit.patches.length,issues:[],map:original?.map??planned.map};
  }finally{await session.dispose('saved');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [directory,backup]=process.argv.slice(2);if(!directory||!backup)throw new Error('Usage: node tools/upgrade-player-gallery.mjs <work-directory> <new-backup-directory>');
  process.stdout.write(JSON.stringify(await upgradeGalleryDirectory(directory,backup),null,2)+'\n');
}
