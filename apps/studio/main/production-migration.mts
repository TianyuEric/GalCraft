import {copyFile,mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import type { ProjectSession } from '@galcraft/documents';
import type { Json, ProductionOperationSnapshot } from '@galcraft/contracts';
import {serviceKeyForProtocol} from '@galcraft/generation-services/catalog';

// Only editable stores enter this migration. Submitted tasks and candidates are never visited.
export function migrateEditableProduction(source: Json, operations: ProductionOperationSnapshot[] = []) {
  const value=structuredClone(source),diagnostics: string[]=[];
  const visit=(node: Json): void =>{
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(node.providerKey==='org.galcraft.animation-generation/text')node.providerKey=serviceKeyForProtocol(typeof node.protocol === 'string' ? node.protocol : 'chatCompletions')??node.providerKey;
    if(node.providerKey==='org.galcraft.voice-comfy/comfy')node.providerKey='org.galcraft.comfyui/comfyUI';
    if(node.protocol==='plugin'&&((typeof node.operation === 'string' && node.operation.startsWith('org.galcraft.voice-comfy/'))||node.providerKey==='org.galcraft.comfyui/comfyUI'))node.protocol='comfyUI';
    const snapshot = node.operationSnapshot;
    if(snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && snapshot.provider){const current=operations.find(operation=>operation.id===snapshot.id);
      if(current)node.operationSnapshot=structuredClone(current) as Json;else diagnostics.push(`操作 ${snapshot.id} 当前缺包；保留原字段和版本`);
    }
    if((node.purpose==='speech'||operations.some(operation=>operation.id===node.purpose&&operation.id.startsWith('org.galcraft.voice-comfy/')))&&Array.isArray(node.uploads)&&Array.isArray(node.outputs)){
      // The six official voice graphs use Comfy's subfolder/name input syntax.
      if(operations.some(operation=>{
        const workflow = operation.definition.workflow;
        return operation.id.startsWith('org.galcraft.voice-comfy/') && workflow && typeof workflow === 'object' && !Array.isArray(workflow) && workflow.id === node.id;
      })){
        for(const upload of node.uploads) if(upload && typeof upload === 'object' && !Array.isArray(upload)) upload.serverPathFormat??='relative';
        for(const output of node.outputs) if(output && typeof output === 'object' && !Array.isArray(output)) output.port??='audio';
      }
    }
    Object.values(node).forEach(visit);
  };visit(value);return {value,diagnostics,changed:!isDeepStrictEqual(value,source)};
}
async function files(path: string){return readdir(path,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});}
export async function migrateProductionStores(userData: string, project: ProjectSession, operations: ProductionOperationSnapshot[]){
  const diagnostics: string[]=[];
  for(const directory of [join(userData,'recipes'),join(userData,'task-drafts',project.projectId),join(userData,'connections/workflows')]){
    for(const entry of await files(directory)){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;const path=join(directory,entry.name);
      try {const source: Json=JSON.parse(await readFile(path,'utf8'));if(source && typeof source === 'object' && !Array.isArray(source) && source.submittedTaskId)continue;const result=migrateEditableProduction(source,operations);diagnostics.push(...result.diagnostics);
        if(result.changed){await copyFile(path,`${path}.before-services-v1`,2).catch(error=>{if(error.code!=='EEXIST')throw error;});await writeFile(`${path}.tmp`,JSON.stringify(result.value,null,2)+'\n');await rename(`${path}.tmp`,path);}
      }catch(error){diagnostics.push(`${entry.name}：${error instanceof Error ? error.message : String(error)}；原文件保持，可手动修正后重新打开`);}
    }
  }
  for(const document of [...project.documents.values()]){
    const path=Object.keys(document.files).find(path=>path.startsWith('recipes/')&&path.endsWith('.json'));if(!path)continue;
    try{const source: Json=JSON.parse(document.files[path]),result=migrateEditableProduction(source,operations);diagnostics.push(...result.diagnostics);if(!result.changed)continue;
      const backup=join(project.root,'.galcraft/migrations/services-v1',path);await mkdir(dirname(backup),{recursive:true});await writeFile(backup,document.files[path],{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
      if (!source || typeof source !== 'object' || Array.isArray(source) || !result.value || typeof result.value !== 'object' || Array.isArray(result.value)) throw new Error('制作方案文件格式不正确');
      const expected=[{ref:{kind:'document' as const,id:document.documentId},revision:document.revision}];
      const plan=project.planEdit({label:'更新制作方案的公开能力引用',origin:'field',expected,preparedAssets:[],requiredRefs:[],patches:[{kind:'json',documentId:document.documentId,changes:[{path:'/data',op:'set',before:source.data,after:result.value.data}]}]});
      if(!plan.ok)throw new Error(plan.error.message);const receipt=project.applyEdit(plan.value.planId,expected);if(!receipt.ok)throw new Error(receipt.error.message);await project.writeDraft();
    }catch(error){diagnostics.push(`${path}：${error instanceof Error ? error.message : String(error)}；原文档保持，等待作者处理`);}
  }
  return diagnostics;
}
