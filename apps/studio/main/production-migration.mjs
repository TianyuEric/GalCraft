import {copyFile,mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {serviceKeyForProtocol} from '@galcraft/generation-services/catalog';

// Only editable stores enter this migration. Submitted tasks and candidates are never visited.
export function migrateEditableProduction(source,operations=[]) {
  const value=structuredClone(source),diagnostics=[];
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(node.providerKey==='org.galcraft.animation-generation/text')node.providerKey=serviceKeyForProtocol(node.protocol??'chatCompletions')??node.providerKey;
    if(node.providerKey==='org.galcraft.voice-comfy/comfy')node.providerKey='org.galcraft.comfyui/comfyUI';
    if(node.protocol==='plugin'&&(node.operation?.startsWith('org.galcraft.voice-comfy/')||node.providerKey==='org.galcraft.comfyui/comfyUI'))node.protocol='comfyUI';
    if(node.operationSnapshot?.provider){const current=operations.find(operation=>operation.id===node.operationSnapshot.id);
      if(current)node.operationSnapshot=structuredClone(current);else diagnostics.push(`操作 ${node.operationSnapshot.id} 当前缺包；保留原字段和版本`);
    }
    if((node.purpose==='speech'||operations.some(operation=>operation.id===node.purpose&&operation.id.startsWith('org.galcraft.voice-comfy/')))&&Array.isArray(node.uploads)&&Array.isArray(node.outputs)){
      // The six official voice graphs use Comfy's subfolder/name input syntax.
      if(operations.some(operation=>operation.id.startsWith('org.galcraft.voice-comfy/')&&operation.definition.workflow?.id===node.id)){
        for(const upload of node.uploads)upload.serverPathFormat??='relative';
        for(const output of node.outputs)output.port??='audio';
      }
    }
    Object.values(node).forEach(visit);
  };visit(value);return {value,diagnostics,changed:!isDeepStrictEqual(value,source)};
}
async function files(path){return readdir(path,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});}
export async function migrateProductionStores(userData,project,operations){
  const diagnostics=[];
  for(const directory of [join(userData,'recipes'),join(userData,'task-drafts',project.projectId),join(userData,'connections/workflows')]){
    for(const entry of await files(directory)){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;const path=join(directory,entry.name);
      try {const source=JSON.parse(await readFile(path,'utf8'));if(source.submittedTaskId)continue;const result=migrateEditableProduction(source,operations);diagnostics.push(...result.diagnostics);
        if(result.changed){await copyFile(path,`${path}.before-services-v1`,2).catch(error=>{if(error.code!=='EEXIST')throw error;});await writeFile(`${path}.tmp`,JSON.stringify(result.value,null,2)+'\n');await rename(`${path}.tmp`,path);}
      }catch(error){diagnostics.push(`${entry.name}：${error.message}；原文件保持，可手动修正后重新打开`);}
    }
  }
  for(const document of [...project.documents.values()]){
    const path=Object.keys(document.files).find(path=>path.startsWith('recipes/')&&path.endsWith('.json'));if(!path)continue;
    try{const source=JSON.parse(document.files[path]),result=migrateEditableProduction(source,operations);diagnostics.push(...result.diagnostics);if(!result.changed)continue;
      const backup=join(project.root,'.galcraft/migrations/services-v1',path);await mkdir(dirname(backup),{recursive:true});await writeFile(backup,document.files[path],{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
      const expected=[{ref:{kind:'document',id:document.documentId},revision:document.revision}];
      const plan=project.planEdit({label:'更新制作方案的公开能力引用',origin:'field',expected,preparedAssets:[],requiredRefs:[],patches:[{kind:'json',documentId:document.documentId,changes:[{path:'/data',op:'set',before:source.data,after:result.value.data}]}]});
      if(!plan.ok)throw new Error(plan.error.message);const receipt=project.applyEdit(plan.value.planId,expected);if(!receipt.ok)throw new Error(receipt.error.message);await project.writeDraft();
    }catch(error){diagnostics.push(`${path}：${error.message}；原文档保持，等待作者处理`);}
  }
  return diagnostics;
}
