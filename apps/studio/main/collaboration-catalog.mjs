import { PerformanceGuidance } from '@galcraft/contracts';
import { z } from 'zod';
import {ComponentEditInputSchema} from './collaboration-contracts.mjs';
import { ComponentConfigSchema, PageConfigSchema, ExprSchema, SceneSchema, VersionRefSchema, fieldSpecsInputSchema } from '@galcraft/contracts';
import { CoreCommandSpecsEnglish as CoreCommandSpecs, commandInputSchema } from '@galcraft/dsl';
import { presetCatalog, PresetDomainOperations } from './collaboration-presets.mjs';
import { ComponentCatalog, readTemplateDocuments } from '@galcraft/templates';
import { acquirePluginDefinition, loadPluginModule } from '@galcraft/plugins';
import { CollaborationError } from '@galcraft/collaboration';
import { exactContract, pageSlice } from './collaboration-projection.mjs';
import {AuthorOperationDefinitions} from '@galcraft/documents/authoring';

const json = value => JSON.parse(JSON.stringify(value ?? null));
const value = result => { if (!result.ok) throw new CollaborationError(result.error.code, result.error.message); return result.value; };
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const componentSchema = z.toJSONSchema(ComponentConfigSchema), pageSchema = z.toJSONSchema(PageConfigSchema);
const fieldsSchema=fieldSpecsInputSchema;

export const collaborationGuide = {
  version: '0.1.0', purpose: 'Work on the open GalCraft working copy through its public domain tools.',
  start: ['Discover projects/templates with galcraft_projects. Prepare create/open and apply the frozen target using the author choice.', 'Call galcraft_context with projectId in the envelope and input:{mode:"bootstrap",projectId}. This read only confirms the open target and writeSessionId; it never creates a collaboration.', 'Explicitly start or join with galcraft_collaboration prepareCreate using projectId/writeSessionId, then apply its reviewed plan. Use the returned current sessionId.', 'Every business or capabilities call supplies the same projectId/sessionId. Read summaries first, then request the selected exact contract from galcraft_catalog. For an operation, fieldGroup selects its declared group or one exact top-level field, with only the referenced definitions.'],
  identities: {
    projectId: 'The real project identity returned by project controls or bootstrap. Every project business call fixes this identity.', sessionId: 'Returned by explicit collaboration start/join. Supply it for every business call and capabilities query. Reads never create or rebind a session. Keep original identities for recovery; rebinding never resends work.', callId: 'A client-chosen unique ASCII action ID. Reuse it only to query/repeat exactly the same input. New or corrected work uses a new callId.',
    reviewId: 'Returned by the project/collaboration control prepare action. An author decision applies exactly this target, scope and version review. galcraft_control_call queries original control calls.',
    writeSessionId: 'The current M02 write binding returned by project/open and collaboration control. An old binding keeps its historical meaning.',
    documentId: 'Read from capabilities/context. expected uses its current revision. A sceneId, statementId, componentId and assetId identify different objects.',
    planId: 'A reviewed input from edit_prepare, production prepare or prepareAdoption. submit/adopt takes this planId.',
    taskId: 'The id of the executed M10 task returned by submit/tasks. Use production wait on this original task (25 seconds by default), inspect the reason and candidateIds, and wait again when running.',
    candidateId: 'One output listed by a task item. Read its identity, artifacts and diagnostics as needed; viewing or listening is goal-dependent.',
    variantId: 'An exact M04 asset version returned by assets. Use that identity for repeatable references and media.',
  },
  results: ['Every accepted domain call returns accepted:true, callId, state, result/error and recovery.query. state completed means this tool invocation returned: inspect the task state and issues inside result.',
    'MCP isError means the request was rejected before acceptance. Fix the indicated input/session/scope; no task was submitted.',
    'failed or uncertain are accepted business states. Query galcraft_call with the original sessionId and callId before retrying. Query and repeated identical calls never resubmit business work.',
    'Input or version conflict: reread current documents/capabilities. Keep authored changes and build a new plan with current expected revisions.'],
  editing: [PerformanceGuidance.principles, PerformanceGuidance.shortScene, 'Read selected documents and versions with galcraft_context. List catalog category operations, then request only the selected key and needed fields.', 'Prefer galcraft_edit_prepare with operation and expected for shared structure, character, variable, command and project actions; apply its planId with the frozen expected versions. For source edits use galcraft_edit with one complete EditInput: label, origin, expected, patches, preparedAssets:[], requiredRefs:[]. JSON paths begin /data/. Text edits include exact before and offsets. Both paths are undoable and unsaved.',
    'For plugin author documents use galcraft_documents; it validates through the installed provider and applies one M02 transaction.', 'Use galcraft_pages read/catalog, prepare/compileStyle and apply for semantic page/component/layout/interaction/animation edits. The same M08 schemas and plans serve Studio. Template library and switch plans retain the actual source, instance mapping and explicit conflicts. galcraft_ui_composition adopts reviewed config/style/assets in one transaction; capture when the goal needs visual inspection.',
    'Use galcraft_save plan to review requested objects, necessary associations and complete object changes. Resolve scope issues with an author-reviewed scope change, then save the current plan. Unselected unrelated objects remain dirty.',
    'Use context mode target for the object explicitly handed off from Studio, mode statistics for existing call/send facts, and mode environment for public setup readiness. A later Studio selection does not change the handed-off target.',
    'An explicit local export/update request authorizes galcraft_release check/prepare/build. Discover targets and the selected targetContract/signingOptions as needed. Choose saving current changes or the actual saved snapshot, then build and query status. Android project export needs no SDK/JDK/Gradle; APK and AAB honor the selected signing mode.'],
  production: ['Use an existing compatible connection/model/workflow from capabilities and the selected operation contract. Supply the final prompt or structured fields directly. Recipes, prompt generation and text-model preparation are optional; do not add them when usable input already exists. Local operations use an actual configured protocol:plugin connection; missing setup belongs to Studio Connections and tools.',
    'Explicit parameterOverrides take precedence, followed by explicit direct fields, applicable selected recipe/parameter defaults and operation defaults. Auto-filled form values are not author overrides. Read defaults/frozen only when needed to inspect effective values and sources; a modified score stays one whole value until explicit replacement or restoration of default following.',
    'Music render uses an existing complete score locally. writeScore uses the chosen text connection with a creative description; style, recipe, reference score and full instrument list are optional. Discover the real soundbank and exact operation fields first. Reference tempo, duration and instrumentation are creative context; only independently declared music constraints are requirements. Missing banks or contracts need their actual dependency, never a guessed substitute.',
    'A complete music result violating a declared constraint is a known business failure. Keep its raw text and original task; correct the score and reprocess locally without another model request. A necessary new request uses existing authorization and the real additional-send budget; include the diagnosed deviation. Query the original receipt before retrying after a lost response.',
    'Use configured workflows from the paged public catalog. Selected operation contracts define fields and media ports; unavailable plugin contracts are unavailable. Studio manages personal workflow drafts, imports and library updates. A usable local binding need not have a paid trial; connection checks and actual generation results are separate facts.',
    'Studio service setup presets describe text, image, speech and music protocols and their initial connection defaults. They do not establish an installed service, available model or voice. Read capabilities.connections for actual allowed IDs, revisions, protocols, providers and configured models; inspectConnection queries the chosen provider capabilities. Credentials stay in personal configuration. VoiceStudio engines, languages and voices come from the selected live connection.',
    'Discover animationPresets, weatherPresets, uiAnimationPresets, readingLayouts, actionIcons and recipes with galcraft_catalog. Core keys are factory identities, never animation asset IDs. Use each definition guide example to prepare the same-domain edit. Use recipes scope/id keys and exact id/scope/revision selections in production prepare; preparation freezes the chosen recipes and parameter values.',
    'galcraft_production prepare returns result.planId and a task preview. submit takes planId, then tasks returns real taskId/items/candidateIds. Use drafts/draft/defaults/frozen for actual saved production forms and frozen configuration; saveDraft/prepareDraft update or execute one with its revision. Continue existing tasks with planContinuation/submitContinuation, transferPrompt or keepResults as needed. Original source and execution authorization remain distinct. candidate reads content; editCandidate only edits supported textual candidates. References use references:[{assetId,variantId,port}] with exact IDs from assets and port keys from the operation; Studio resolves media bytes without client paths.',
    'Continue necessary ordinary calls within the existing authorization without pausing after each asset. Stop at candidate completion when only alternatives were requested; for use in a character/scene continue prepareAdoption and adopt/bind. select only changes task selection. prepareAdoption uses selections:[{itemId,candidateId}] and adoptions:{[candidateId]:{mode,name,...}}. bind uses the frozen target, library imports only, voicePreset stores a character reference. adopt takes the returned planId and expected. Keep genuine requested confirmations and ask only for unresolved material choices or expanded scope.',
    'When a remote service restarts and query reports unknown with no available output, preserve the original remote identity and report that recovery is unavailable. Repeating query, refetch, resume or cancel cannot recreate lost remote history. Stop this attempt; a replacement generation needs the author’s authorization and a new plan/callId. Do not inspect personal connection files: public capabilities, workflows and inspectConnection supply the supported configuration facts.',
    'Generation creates candidates; accepted or an outer completed receipt is not candidate completion. Wait on the original task until the requested endpoint. Adoption changes the working copy; formal save is separate and follows authorization. Report these endpoints separately. Warnings do not create extra review tasks. View images, listen, capture or play only when the goal calls for it.',
    'Use the actual Web/MCP address shown by Studio or the CLI. Automatic fallback may change the URL. Repair an existing client through Studio configuration preview/merge/apply or copy the displayed address; preserve other client settings and reload when required. Existing write authorization permits that update; a failed startup supplies no replacement URL. MCP startup failure leaves Studio editing and saving available, with persistent service diagnostics and retry.'],
  media: ['Use source:{kind:"asset",assetId,variantId} from assets or source:{kind:"candidate",candidateId,artifactIndex} from a task. Paths and private resource URIs are not portable media.',
    'mode metadata returns codecs, dimensions and duration; resource returns the complete original media; image returns an absolute localPath; use the client image reader to view pixels; frame requires exactly one timeSec or zero-based frame and reports the actual sampling position; audio supplies the full track or startSec/endSec WAV excerpt.',
    'mode resource returns the complete original localPath plus readable URI/HTTP addresses. image defaults to the original file; request preview:{maxWidth,maxHeight,maxBytes?,format?} only when needed. Actually read its bytes with MCP resources/read at resource.uri or HTTP GET at resource.httpUrl; listing a URI, byte count or resource_link does not establish a complete client read. HTTP Range supports playback. Keep resources until finished, then release by resourceId. release, explicit collaboration end and service stop clean review files outside the project. Startup removes crash remnants. Disconnecting a client does not end a collaboration. Historical media reports expired/missing without changing the original completed call.',
    'galcraft_preview action:capture renders the exact installed Player in an isolated window. action:observe reads only the requested variable scopes or component CSS properties and reports unknown sources explicitly. entryId/target/route/playerInputs use the same full entry preparation as preview state; page can select an actual Player page. These are isolated preview values, not a private running player profile.',
    'State which images/frames were actually viewed and whether audio or full playback was supported. Metadata or one frame does not prove full visual quality or audio/video synchronization.'],
  examples: [
    { tool: 'galcraft_catalog', arguments: { projectId: '<projectId>', sessionId: '<from sessions>', input: { category: 'commands', text: 'say' } } },
    { tool: 'galcraft_catalog', arguments: { projectId: '<projectId>', sessionId: '<sessionId>', input: { category: 'commands', key: 'say' } } },
    { tool: 'galcraft_context', arguments: { projectId: '<projectId>', sessionId: '<sessionId>', input: { documentIds: ['<documentId from capabilities>'] } } },
    { tool: 'galcraft_media', arguments: { projectId: '<projectId>', sessionId: '<sessionId>', input: { mode: 'frame', source: { kind: 'candidate', candidateId: '<candidateId>' }, timeSec: 1.5 } } },
  ],
};

export function toolGuide(definition) {
  const sampleEdit={label:'Edit the selected field',origin:'field',expected:[{ref:{kind:'document',id:'Doc001'},revision:1}],patches:[{kind:'json',documentId:'Doc001',changes:[{path:'/data/name',op:'set',before:'Current name',after:'New name'}]}],preparedAssets:[],requiredRefs:[]};
  const examples={galcraft_catalog:{category:'commands',key:'say'},galcraft_context:{documentIds:['Doc001']},galcraft_documents:{action:'list',pluginId:'org.example.plugin'},
    galcraft_edit:{edit:sampleEdit},galcraft_edit_prepare:{edit:sampleEdit},galcraft_edit_apply:{planId:'Plan01',expected:[{ref:{kind:'document',id:'Doc001'},revision:1}]},
    galcraft_assets:{action:'query',query:{limit:40}},galcraft_production:{action:'wait',taskId:'Task01',timeoutMs:25000},galcraft_pages:{action:'catalog'},galcraft_ui_composition:{action:'read',compositionId:'Comp01'},galcraft_save:{action:'plan',scope:{kind:'all'}},galcraft_release:{action:'check'},galcraft_check:{},galcraft_preview:{action:'capture',page:'title'},galcraft_open:{page:'creation'},
    galcraft_media:{mode:'metadata',source:{kind:'asset',assetId:'Asset1',variantId:'Variant1'}}};
  const sample=(schema,depth=0)=>{if(depth>8||typeof schema!=='object'||!schema)return null;if(schema.default!==undefined)return schema.default;if(schema.const!==undefined)return schema.const;if(schema.enum?.length)return schema.enum[0];if(schema.oneOf||schema.anyOf)return sample((schema.oneOf??schema.anyOf)[0],depth+1);if(schema.type==='object')return Object.fromEntries((schema.required??[]).map(key=>[key,sample(schema.properties?.[key],depth+1)]));if(schema.type==='array')return Array.from({length:schema.minItems??0},()=>sample(schema.items,depth+1));if(schema.type==='number'||schema.type==='integer')return schema.minimum??0;if(schema.type==='boolean')return false;return 'Value1';};
  return { purpose: definition.description, prerequisites: ['galcraft_sessions', 'galcraft_capabilities', 'galcraft_guide'], targetScope: definition.effects,
    identitySources: collaborationGuide.identities, version: definition.version, provider: definition.provider ?? null,

    success: 'accepted:true and state:completed; inspect result issues and any nested task state.', rejection: 'isError:true before acceptance. Correct the indicated field, binding or scope.',
    recovery: collaborationGuide.results, minimumExample: { tool: definition.key, arguments: { projectId: '<projectId>', sessionId: 'Session1', ...(definition.effects.some(effect => ['edit', 'import', 'generate', 'adopt'].includes(effect)) ? { callId: 'example-action-1' } : {}), input: examples[definition.key]??sample(definition.inputSchema) },
      replace: 'Replace Session1/Doc001/Plan01/Asset1/Variant1/org.example.plugin and revisions/before values with the actual discovered identities and current values before calling.' } };
}

export function toolSummary(definition) {
  const {inputSchema,outputSchema,...summary}=definition;
  const actions=[];
  const visit=node=>{if(!node||typeof node!=='object')return;if(node.$ref?.startsWith('#/$defs/')){const key=node.$ref.slice('#/$defs/'.length);visit(inputSchema.$defs?.[key]);return;}for(const key of ['action','mode','operationKey']){const field=node.properties?.[key];if(field?.const)actions.push(field.const);if(field?.enum)actions.push(...field.enum);}for(const key of ['oneOf','anyOf'])for(const branch of node[key]??[])visit(branch);};
  visit(inputSchema);
  return {...summary,actions:[...new Set(actions)],example:toolGuide(definition).minimumExample.arguments.input};
}

export async function domainCatalog(studio, input, context) {
  const project = studio.project(context, false), rows = [], diagnostics = [];
  const push = (category, key, title, provider, definition, inputSchema, current = null) => rows.push({ category, key, title, provider:provider?{id:provider.id,version:provider.version}:null, version: provider?.version ?? '0.1.0', definition, inputSchema, current });
  if(!input.category||input.category==='documents')push('documents','core.scene','Scene document',null,{description:'Core scene metadata. Script source is read from context by documentId.'},z.toJSONSchema(SceneSchema,{io:'input',reused:'ref'}));
  if (!input.category || input.category === 'commands') {
    for (const command of CoreCommandSpecs) push('commands', command.key, command.name, null, command, commandInputSchema(command));
    for (const dependency of studio.plugins.dependencies?.(project) ?? []) {
      const exact = await studio.plugins.exactDirectory(dependency.id, dependency.version);
      if (!exact.ok) { diagnostics.push(exact.error); continue; }
      if (!exact.value.manifest.entry.definition) {
        const instance=await loadPluginModule(exact.value.directory,exact.value.manifest);
        try{const offered=await instance.activate(studio.plugins.context(dependency.id,'web',project));for(const contribution of offered.commands??[])push('commands',contribution.spec.key,contribution.spec.name,dependency,contribution.spec,fieldsSchema(contribution.spec.fields));}
        finally{await instance.deactivate();}
        continue;
      }
      const lease = await acquirePluginDefinition(exact.value.directory, exact.value.manifest);
      try { for (const command of lease.definition.commands ?? []) push('commands', command.key, command.name, dependency, command, fieldsSchema(command.fields)); }
      finally { await lease.release(); }
    }
  }
  if (!input.category || input.category === 'operations') for (const operation of await studio.production.generationProviders.operations(project))
    push('operations', operation.id, operation.definition.title, operation.provider, operation.definition, operation.definition.inputSchema);
  if (!input.category || ['documents', 'pages', 'properties'].includes(input.category)) {
    const acquired = value(await studio.plugins.acquireDefinitions(project, { allowMissing: true }));
    try {
      if (!input.category || input.category === 'documents') for (const definition of acquired.documents)
        push('documents', definition.key, acquired.messages?.[definition.titleKey]??definition.titleKey, (studio.plugins.dependencies(project)).find(dependency => definition.key.startsWith(`${dependency.id}/`)), definition, definition.schema, { initial: definition.initial });
      if (!input.category || ['pages', 'properties'].includes(input.category)) {
        const template = readTemplateDocuments([...project.documents.values()]);
        const walk = (component, page, path) => {
          const definition = ComponentCatalog.find(definition => definition.part === component.part) ?? acquired.components.find(definition => definition.key === component.plugin?.key);
          push('properties', `${page.key}/${component.id}`, component.part, component.plugin ? studio.plugins.dependencies(project).find(dependency => component.plugin.key.startsWith(`${dependency.id}/`)) : null,
            { component: definition ?? null, pluginPropsSchema: component.plugin ? acquired.components.find(definition => definition.key === component.plugin.key)?.propsSchema ?? null : null,
              documentId: page.id, revision: project.readDocument(page.id)?.revision, path }, componentSchema, component);
          component.children.forEach((child, index) => walk(child, page, `${path}/children/${index}`));
        };
        for (const page of template.pages) {
          push('pages', page.key, page.titleKey, null, { documentId: page.id, revision: project.readDocument(page.id)?.revision, path: '/data', targets: ['web', 'windows'] }, pageSchema, page);
          walk(page.root, page, '/data/root');
        }
      }
    } finally { await acquired.release(); }
  }
  if(!input.category||input.category==='workflows')for(const entry of await studio.workflows(context)){
    const availability=entry.inputSchema?'available':'unavailable';
    push('workflows',entry.id,entry.name,entry.provider,{id:entry.id,name:entry.name,revision:entry.revision,purpose:entry.purpose,description:entry.description,provider:entry.provider,operationIds:entry.operationIds,usages:entry.usages,allowed:entry.allowed,availability,binding:entry.workflow},entry.inputSchema);
    if(availability==='unavailable')diagnostics.push({code:'CONTRACT_UNAVAILABLE',owner:'M10',message:`Workflow ${entry.id} has no available operation contract for ${entry.workflow.operation??entry.purpose}. Install or enable its exact provider, or correct the operation in Studio.`});
  }
  if(!input.category||input.category==='operations'){
    for(const operation of AuthorOperationDefinitions)push('operations',operation.key,operation.title,null,{description:operation.description,example:{tool:'galcraft_edit_prepare',input:{operation:{op:operation.key},expected:'Read affected document versions from context.'}}},z.toJSONSchema(z.strictObject({operation:operation.schema,expected:z.array(VersionRefSchema)}),{io:'input'}));
    push('operations','component.setProperties','Set component properties',null,{description:'Prepare supported component layout, visual properties, visibility or lock state through the actual M08 provider. Plugin props use the installed exact schema.'},z.toJSONSchema(ComponentEditInputSchema,{io:'input'}));
    for(const operation of PresetDomainOperations)push('operations',operation.key,operation.title,null,operation,operation.inputSchema);
  }
  await presetCatalog(studio,input,context,push);
  if (!input.category || input.category === 'tools') for (const tool of studio.core.catalog()) push('tools', tool.key, tool.title, tool.provider, toolGuide(tool), tool.inputSchema);
  const selected = rows.filter(row => (!input.category || row.category === input.category) && (!input.key || row.key === input.key)
    && (!input.providerId || row.provider?.id === input.providerId) && (!input.text || `${row.key} ${row.title} ${JSON.stringify(row.definition)}`.toLocaleLowerCase().includes(input.text.toLocaleLowerCase())));
  if (input.key && !selected.length) throw new CollaborationError('CATALOG_KEY_MISSING', 'This key is absent from the current exact catalog. List its category again and check the installed project dependencies.');
  const page = pageSlice(selected, input);
  const entries = page.items.map(row => {
    const summary = { category:row.category,key:row.key,title:row.title,provider:row.provider??null,version:row.version,...(row.category==='workflows'?{availability:row.definition.availability,purpose:row.definition.purpose,description:row.definition.description,usages:row.definition.usages,revision:row.definition.revision}:{}) };
    if (!input.key) return summary;
    const tool = row.category === 'tools' ? studio.core.catalog().find(tool => tool.key === row.key) : null;
    const guide = tool ? toolGuide(tool) : { purpose:row.definition.description??row.title, example:row.definition.example??(row.key==='component.setProperties'?{tool:'galcraft_edit_prepare',arguments:{projectId:'Project1',sessionId:'Session1',callId:'component-properties-1',input:{operationKey:row.key,target:{componentId:'Comp01'},fields:{visible:true},expected:[{ref:{kind:'document',id:'Page01'},revision:1}]}}}:row.current?.initial??{}) };
    const contract = input.part === 'output' ? tool?.outputSchema : row.inputSchema;
    if (input.part === 'output' && !contract) throw new CollaborationError('CONTRACT_OUTPUT_MISSING','This domain entry has no separate result contract. Select a named tool.');
    if(contract===null||contract===undefined)throw new CollaborationError('CONTRACT_UNAVAILABLE',`The exact input contract for ${row.key} is unavailable. Install or enable its provider, or correct the selected operation in Studio.`);
    const fieldGroups=row.category==='operations'&&row.definition.fields?Object.fromEntries([...new Set(row.definition.fields.map(field=>field.group))].map(group=>[group,row.definition.fields.filter(field=>field.group===group).map(field=>field.path)])):undefined;
    let precise;try{precise=exactContract(contract,{...input,fieldGroups});}catch(error){if(!row.provider||error.code!=='CONTRACT_ACTION_MISSING')throw error;precise=exactContract(contract,{fieldGroup:input.fieldGroup,fieldGroups});}
    let definition=row.definition;
    if(row.category==='operations'){
      const {inputSchema:_inputSchema,...metadata}=definition;
      if(input.fieldGroup){
        if(metadata.fields)metadata.fields=metadata.fields.filter(field=>Object.hasOwn(precise.properties??{},field.path));
        delete metadata.presets;
      }
      definition=metadata;
    }
    return { ...summary, ...(input.part==='output'?{outputSchema:precise}:{inputSchema:precise}),
      guide, ...(tool ? {} : { definition,current:row.current }) };
  });
  return json({view:input.key?'definition':'summary',entries,total:page.total,offset:page.offset,limit:page.limit,nextOffset:page.nextOffset,issues:diagnostics.map(issue=>({severity:'error',related:[],actions:[],...issue}))});
}
