import { acquirePluginDefinition, loadPluginModule } from '@galcraft/plugins';
import { readPluginDocumentInstances, assetFieldReferences, assetReferenceTarget } from '@galcraft/contracts';
import { CollaborationError } from '@galcraft/collaboration';

const unwrap=result=>{if(!result.ok)throw new CollaborationError(result.error.code,result.error.message,result.error);return result.value;};

/** Prepare the actual exact plugin definitions without requiring an earlier renderer preview. */
export async function compileCollaborationProject(owner,project,{publish=false}={}){
  const input=owner.production.compileInput(project),documents=[...project.documents.values()],releases=[];
  input.entityVersions=documents.filter(document=>document.format!=='dsl').map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision}));
  input.pluginCommands=[];input.pluginConditions={};input.pluginMessages=[];input.pluginConfigMappings={};input.pluginConfigDocuments=[];
  try{
    for(const dependency of input.lock.plugins){
      const exact=unwrap(await owner.plugins.exactDirectory(dependency.id,dependency.version));let definition;
      if(exact.manifest.entry.definition){const lease=await acquirePluginDefinition(exact.directory,exact.manifest);releases.push(lease.release);definition=lease.definition;}
      else {const instance=await loadPluginModule(exact.directory,exact.manifest);releases.push(()=>instance.deactivate());const offered=await instance.activate(owner.plugins.context(dependency.id,'windows',project));definition={...offered,commands:offered.commands.map(command=>command.spec)};}
      input.pluginCommands.push(...definition.commands??[]);
      Object.assign(input.pluginConditions,Object.fromEntries((definition.conditions??[]).map(condition=>[condition.key,{args:condition.fields.map(field=>['number','integer'].includes(field.type)?'number':field.type==='boolean'?'boolean':'string'),returns:'boolean'}])));
      if(definition.messages)input.pluginMessages.push({pluginId:dependency.id,messages:definition.messages});
      const reference=(ref,source,usage)=>{const target=assetReferenceTarget(ref,input.assets);if(target)(input.assetReferences??=[]).push({...target,owner:{kind:'document',id:source.documentId},source,usage,required:true});};
      for(const provider of definition.documents??[]){
        if(provider.configMapping)input.pluginConfigMappings[provider.key]=provider.configMapping;
        for(const document of readPluginDocumentInstances(documents).filter(document=>document.pluginId===dependency.id&&document.contributionKey===provider.key)){
          const source={documentId:document.documentId,revision:document.revision};
          if(provider.configMapping)input.pluginConfigDocuments.push({contribution:provider.key,...source,data:document.data});
          for(const ref of provider.collectReferences(document.data))if(['asset','variant'].includes(ref.kind))reference(ref,source,provider.key);
        }
      }
      for(const page of input.template.pages){
        const source=documents.find(document=>Object.values(document.files).some(raw=>{try{return JSON.parse(raw).data?.id===page.id;}catch{return false;}}));if(!source)continue;
        const visit=component=>{const provider=definition.components?.find(provider=>provider.key===component.plugin?.key);if(provider)for(const {ref}of assetFieldReferences(component.plugin.props,provider.fields??[]))reference(ref,{documentId:source.documentId,revision:source.revision},provider.key);component.children.forEach(visit);};visit(page.root);
      }
    }
    return unwrap(await owner.production.language.compile(input,{publish}));
  }finally{await Promise.allSettled(releases.reverse().map(release=>release()));}
}
