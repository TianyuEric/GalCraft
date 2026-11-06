import { createId, readPluginDocumentInstances, type DocumentView, type Result } from '@galcraft/contracts';
import type { CompileInput } from '@galcraft/dsl';
import type { AuthoringServices } from '../../../authoring/controller.js';
import { compileInput } from '../../../authoring/bridge.js';
import { prepareProjectPlugins } from '../../../authoring/plugins.js';

/** Preview and candidate adoption compile the same authority and plugin definitions. */
export async function withCandidateCompileInput<T>(bridge: AuthoringServices['bridge'], documents: DocumentView[],
  action: (input: CompileInput) => Result<T> | Promise<Result<T>>): Promise<Result<T>> {
  const prepared = compileInput(documents);
  if (!prepared.ok) return prepared;
  const input = prepared.value;
  let plugins: Awaited<ReturnType<typeof prepareProjectPlugins>> | undefined;
  try {
    if (input.lock.plugins.length) {
      plugins = await prepareProjectPlugins(bridge,input.lock,input.pluginDocuments??{},
        {projectId:input.projectId,kind:'playtest',instance:createId()},documents,[],'definition');
      input.pluginCommands = plugins.commandSpecs;
      input.pluginConfigMappings = Object.fromEntries(plugins.definitions.flatMap(({definition}) => (definition.documents??[]).flatMap(document => document.configMapping ? [[document.key,document.configMapping]] : [])));
      input.pluginConfigDocuments = readPluginDocumentInstances(documents).map(item => ({contribution:item.contributionKey,documentId:item.documentId,revision:item.revision,data:item.data}));
      input.pluginMessages = plugins.definitions.flatMap(({pluginId,definition}) => definition.messages ? [{pluginId,messages:definition.messages}] : []);
      input.pluginConditions = Object.fromEntries(plugins.conditionSpecs.map(condition => [condition.key,{args:condition.fields.map(field => field.type==='number'||field.type==='integer'?'number':field.type==='boolean'?'boolean':'string'),returns:'boolean'}]));
    }
    return await action(input);
  } finally { await plugins?.dispose(); }
}
