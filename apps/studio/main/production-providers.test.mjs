import { afterEach, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from 'node:http';
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ProjectSession } from "@galcraft/documents";
import {
  FixtureProject,
  FixtureScenes,
  FixtureLock,
  FixtureCharacters,
  FixtureAsset,
} from "@galcraft/contracts/fixtures";
import { createAffectionContributions, pluginMetadata as affectionMetadata } from "@galcraft/official-affection";
import { reviewScript, previewScript, inputCapability, FrozenProductionTaskSchema, EffectiveProductionDefaultsSchema, ProductionFormDraftSchema } from "@galcraft/authoring/production";
import { DefaultTimeoutSecByPurpose } from "@galcraft/contracts";
import {
  createOfficialTemplate,
  createTemplateDocuments,
  readTemplateDocuments,
  components,
} from "@galcraft/templates";
import { createAssetIndex, decodeSVG, assetFilePath } from "@galcraft/assets";
import { ImportCoordinator } from '@galcraft/assets';
import { StudioProduction } from "./production-providers.mjs";
import { pluginServiceContext } from './plugin-service-ports.mjs';

const sharp = createRequire(
  new URL("../../../packages/assets/package.json", import.meta.url),
)("sharp");
const root = resolve(
  import.meta.dirname,
  "../../../tmp/testing/projects/b/studio-j-provider",
);
const unwrap = (r) => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const envelope = (documentId, data) =>
  JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
let project, provider, sceneDocument, statement, template;
it('keeps personal workflow configuration drafts outside the available workflow overview and preserves revisions through the host', async () => {
  const workflow = { id: randomUUID(), revision: 3, name: 'Available workflow', purpose: 'speech', imageUsages: null, graphVersion: '1', editorWorkflowPath: null,
    apiGraph: { '1': { class_type: 'SaveAudio', inputs: {} } }, inputs: [], uploads: [], requiredNodes: [], modelNotes: [], outputs: [{ nodeId: '1', key: 'audio', kind: 'audio', decoder: 'comfyFileList', group: 'main', role: 'primary', background: 'unknown' }] };
  const available = unwrap(await provider.call('saveWorkflow', { workflow, expectedRevision: null }));
  expect(available.revision).toBe(1);
  const draft = { schemaVersion: 1, id: workflow.id, revision: 0, name: 'Unfinished cross-project edit', workflow: { ...workflow, name: 'Unfinished cross-project edit', purpose: null, outputs: [] }, paste: '{ retained input', availableRevision: 1, updatedAt: new Date().toISOString() };
  unwrap(await provider.call('saveWorkflowDraft', { draft, expectedRevision: null }));
  const overview = unwrap(await provider.call('overview'));
  expect(overview.workflows.find(item => item.id === workflow.id)).toMatchObject({ name: 'Available workflow', revision: 1, purpose: 'speech' });
  expect(overview.workflowDrafts.find(item => item.id === workflow.id)).toMatchObject({ name: draft.name, paste: draft.paste, availableRevision: 1, workflow: { purpose: null } });
  expect(unwrap(await provider.call('listWorkflowDrafts'))).toHaveLength(1);
  expect(await provider.call('saveWorkflow', { workflow, expectedRevision: 3 })).toMatchObject({ ok: false, error: { code: 'WORKFLOW_CONFLICT' } });
});

it('runs the packaged GCA provider with an existing text connection and adopts new and revised animation assets through M04/M02', async () => {
  const { createDefinition } = await import('../../../plugins/animation-generation/package/definition/index.js');
  const { createPlugin } = await import('../../../plugins/animation-generation/package/services/index.js');
  const assetContext=pluginServiceContext({projects:provider.projects,assets:{...provider.assets,get:async id=>({ok:true,warnings:[],value:JSON.parse([...project.documents.values()].find(doc=>doc.files['assets/index.json']).files['assets/index.json']).data.assets.find(asset=>asset.id===id)})}},'org.galcraft.animation-generation','windows',project);
  const definition = createDefinition().productionOperations[0], preparation = (await createPlugin().activate(assetContext)).textPreparations[0];
  const common=await import('../../../plugins/official-generation-services/package/services/index.js');const contribution=(await common.createPlugin().activate({})).generationProviders.find(item=>item.protocols.includes('chatCompletions'));
  const snapshot = { id: definition.id, version: definition.version, provider: { id: 'org.galcraft.animation-generation', version: '0.1.0' }, definition };
  const original = { type: 'galcraft.animation', version: 1, durationMs: 1000, tracks: [{ path: '/y', mode: 'add', keyframes: [{ timeMs: 0, value: 0, easing: { family: 'linear', direction: 'in' } }, { timeMs: 500, value: -40, easing: { family: 'linear', direction: 'in' } }, { timeMs: 1000, value: 0, easing: { family: 'linear', direction: 'in' } }] }, { path: '/x', mode: 'add', keyframes: [{ timeMs: 1000, value: 20, easing: { family: 'linear', direction: 'in' } }] }] };
  let requests = 0, height = -120, acquired = 0, released = 0;
  const server = createServer(async (request, response) => {
    if (request.url === '/v1/models') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'configured-gca-model' }] })); return; }
    expect(request.url).toBe('/v1/chat/completions'); expect(request.method).toBe('POST'); requests++;
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); expect(input.model).toBe('configured-gca-model'); expect(input.temperature).toBe(.2);
    const proposed = structuredClone(original); proposed.tracks[0].keyframes[1].value = height; proposed.tracks[1].keyframes[0].value = 999;
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ animation: proposed, deletePaths: [] }) } }], usage: { total_tokens: 123 } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = { ...unwrap(await provider.call('overview')).connections[0], protocol: 'chatCompletions', providerKey:contribution.key,purposes: ['text'], baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'configured-gca-model', parameters: { request: { temperature: .2 } } };
    provider.connections.read = async () => ({ config }); provider.connections.list = async () => [config];
    provider.generationProviders = {acquireTextPreparation:async()=>({provider:preparation,packageVersion:'0.1.0',release(){}}), operations: async () => [snapshot], describe: async () => ({ providerKey: contribution.key, packageVersion: '0.1.0', capabilities: contribution.capabilities }),
      list: async () => [{ key: contribution.key, packageVersion: '0.1.0', purposes: contribution.purposes, configFields: [], capabilities: contribution.capabilities }],
      acquire: async () => { acquired++; return { provider: contribution, packageVersion: '0.1.0', release() { released++; } }; } };
    const generate = async (asset = null) => {
      const overview = unwrap(await provider.call('overview')), ctx = await provider.current();
      const resolved=asset?unwrap(await assetContext.assets.resolve({kind:'variant',id:asset.activeVariantId})):null;
      const currentAnimation=resolved?JSON.parse(await assetContext.assets.readText(resolved,resolved.entry)):original;
      const fields = { instruction: '跳得更高，时长不变', mode: 'patch', currentAnimation, paths: ['/y'], range: null, preserveDuration: true, allowDelete: false, targetContext: 'center image', assetId: asset?.id ?? null, assetRevision: asset?.revision ?? null };
      const item = await provider.createItem(ctx, { activeUse: 'animation' }, { operation: definition.id, operationSnapshot: snapshot, connectionId: config.id, model: null, workflowBindingId: null, recipe: null, fields, context: [], sourceVersions: overview.versions, backgroundRemoval: null, backgroundPreview: null,
        target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'animation', uiScope: null } });
      expect(item.configSnapshot).toMatchObject({ id: config.id, revision: config.revision, baseUrl: config.baseUrl, model: config.model, providerKey: contribution.key });
      expect(config.providerKey).toBe(contribution.key); expect(config.purposes).toEqual(['text']);
      const plan = unwrap(await provider.call('planTask', { name: 'GCA boundary regression', items: [item], context: [], policy: 'waitForSelection', selectionRule: null, expected: overview.versions }));
      expect(plan.sendSummary[0].requests).toBe(1); const task = unwrap(await provider.call('submit', plan.planId)); await ctx.service.drain();
      const completed = ctx.service.listTasks().find(value => value.id === task.id), candidateId = completed.items[0].candidateIds[0], candidate = ctx.service.getCandidate(candidateId);
      expect(candidate.checks).toEqual([]); const parsed = JSON.parse(await readFile(candidate.artifacts[0].localPath, 'utf8'));
      expect(parsed.tracks[1]).toEqual(original.tracks[1]); expect(parsed.tracks[0].keyframes[1].value).toBe(height);
      const adoption = unwrap(await provider.call('select', { taskId: task.id, selections: [{ itemId: item.id, candidateId }], target: 'project', expected: overview.versions, adoptions: { [candidateId]: { mode: 'library', name: asset?.name ?? '跃起.gca' } } }));
      const receipt = unwrap(await provider.call('apply', { planId: adoption.planId, expected: adoption.input.expected }));
      return { receipt, candidateId, service: ctx.service };
    };
    const first = await generate(), index = [...project.documents.values()].find(document => document.files['assets/index.json']);
    let asset = JSON.parse(project.readDocument(index.documentId).files['assets/index.json']).data.assets[0];
    expect(asset.kind).toBe('animation'); expect(asset.source.kind).toBe('generation'); expect(asset.variants).toHaveLength(1);
    unwrap(project.undo(unwrap(project.planUndo(index.documentId, first.receipt.operationId)).planId));
    expect(JSON.parse(project.readDocument(index.documentId).files['assets/index.json']).data.assets).toEqual([]);
    expect(first.service.adoptionState(first.candidateId)).toBe('unadopted');
    await generate(); asset = JSON.parse(project.readDocument(index.documentId).files['assets/index.json']).data.assets[0];
    const originalVariant = asset.activeVariantId; height = -200; await generate(asset);
    const revised = JSON.parse(project.readDocument(index.documentId).files['assets/index.json']).data.assets[0];
    expect(revised.id).toBe(asset.id); expect(revised.variants).toHaveLength(2); expect(revised.variants.find(variant => variant.id === revised.activeVariantId).parentId).toBe(originalVariant);
    unwrap(await project.save(unwrap(project.planSave({ kind: 'all' })).planId));
    const saved = JSON.parse(await readFile(join(root, 'project', 'assets/index.json'), 'utf8')).data.assets[0]; expect(saved.activeVariantId).toBe(revised.activeVariantId);
    expect(requests).toBe(3); expect(acquired).toBe(released);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

async function storedProductionDraft(operation, usage, fields, extra = {}) {
  const overview = unwrap(await provider.call('overview'));
  const config = { ...overview.connections[0], protocol: operation === 'speech' ? 'openAISpeech' : operation === 'image' ? 'webUI' : 'chatCompletions', purposes: [operation === 'speech' ? 'speech' : operation === 'image' ? 'image' : 'text'] };
  provider.connections.read = async () => ({ config }); provider.connections.list = async () => [config];
  const variant = { operation, connectionId: config.id, model: config.model, workflowBindingId: null, recipe: null, promptPreparation: null,
    target: { sceneId: null, statementId: null, characterId: null, locale: null, usage, uiScope: null }, fields, context: [], sourceVersions: overview.versions, backgroundRemoval: null, backgroundPreview: null, ...extra };
  const draft = unwrap(await provider.call('saveDraft', { draft: { schemaVersion: 1, id: randomUUID(), projectId: project.projectId, revision: 0, activeUse: usage, variants: { [usage]: variant }, updatedAt: new Date().toISOString(), submittedTaskId: null }, expectedRevision: null }));
  return { draft, variant, config, overview };
}

it('reads current-project drafts, actual defaults and frozen input without changing ownership, attempts or sending another request', async () => {
  const stored = await storedProductionDraft('image', 'ui', { positive: 'direct frame', width: 64, height: 64, count: 1 });
  expect(ProductionFormDraftSchema.parse(unwrap(await provider.call('readDraft', { draftId: stored.draft.id })))).toEqual(stored.draft);
  expect(unwrap(await provider.call('listDrafts')).map(draft => draft.id)).toEqual([stored.draft.id]);
  stored.draft.variants.ui.fields.positive = 'updated direct frame';
  const updated = unwrap(await provider.call('saveDraft', { draft: stored.draft, expectedRevision: stored.draft.revision }));
  expect(await provider.call('saveDraft', { draft: stored.draft, expectedRevision: stored.draft.revision })).toMatchObject({ ok: false, error: { code: 'DRAFT_CONFLICT' } });
  unwrap(await provider.call('saveImageRoutes', { ui: { connectionId: stored.config.id, model: 'configured-route-model', workflowBindingId: null } }));
  expect(EffectiveProductionDefaultsSchema.parse(unwrap(await provider.call('defaults', { usage: 'ui' })))).toMatchObject({ status: 'available', connection: { id: stored.config.id, revision: stored.config.revision }, model: 'configured-route-model' });
  const collaboration = { projectId: project.projectId, sessionId: 'Collab', writeSessionId: 'Write1', scopeRevision: 1, callId: 'draft-plan', toolKey: 'galcraft_production' };
  const planned = unwrap(await provider.call('plan', { draftId: updated.id, name: 'Continue Studio draft', collaboration }));
  expect(planned).toMatchObject({ sourceDraftRevision: updated.revision, task: { sourceDraftId: updated.id, stagePolicy: 'external', collaboration, items: [{ input: { positive: 'updated direct frame' } }] } });
  const ctx = await provider.current(), task = unwrap(await ctx.service.submit(planned.planId, { ...collaboration, callId: 'submit-draft' }));
  const before = ctx.service.listTasks();
  const frozen = FrozenProductionTaskSchema.parse(unwrap(await provider.call('frozen', { taskId: task.id })));
  expect(frozen).toMatchObject({ collaboration, items: [{ input: { positive: 'updated direct frame' }, attempts: [], remote: null, workflow: 'unknown', recipe: 'unknown' }] });
  expect(JSON.stringify(frozen)).not.toMatch(/credentialId|apiKeyHeader|baseUrl|serverFileRoot/);
  expect(ctx.service.listTasks()).toEqual(before);
  await ctx.service.cancel(task.id); await ctx.service.close();
});

it('plans selected speech lines as speech only, without sending origin, adoption context or a legacy prompt rule', async () => {
  const { draft } = await storedProductionDraft('speech', 'voice', { language: 'ja', voiceId: 'alloy', speechLines: [
    { id: randomUUID(), sceneId: FixtureScenes[0].id, statementId: statement, characterId: null, original: '原正文', text: '本次朗读', language: 'ja', voiceId: null, selected: true },
    { id: randomUUID(), sceneId: null, statementId: null, characterId: null, original: '未选中正文', text: '不可发送', language: 'ja', voiceId: null, selected: false },
  ] }, { recipe: { recipeId: randomUUID(), scope: 'personal', purpose: 'speechText', usage: 'voice', parameterValues: {} }, context: [{ id: randomUUID(), kind: 'script', label: '不参与朗读的整个场景', included: true, text: '私有场景上下文', source: null, media: null, attachment: null, authorEdited: false }] });
  const plan = unwrap(await provider.call('plan', { draftId: draft.id, name: '选中配音' }));
  expect(plan.task.items).toHaveLength(1);
  expect(plan.task.items[0]).toMatchObject({ purpose: 'speech', recipeSnapshot: null, input: { purpose: 'speech', text: '本次朗读', voiceId: 'alloy', language: 'ja' } });
  expect(plan.task.context).toEqual([]);
  expect(JSON.stringify(plan.task.items[0].input)).not.toMatch(/私有场景|不可发送|原正文|sceneId|statementId/);
  expect(plan.sendSummary.reduce((sum, row) => sum + row.requests, 0)).toBe(1);
});

it('extracts readable controlled dialogue for speech while preserving source and frozen input without a request', async () => {
  const path = `scenes/${FixtureScenes[0].id}/script.gal`;
  const content = { segments: [{ text: '星空', ruby: 'ほしぞら', bold: true }, { text: ' hello <b>literal</b>', color: '#99ccff', italic: true }] };
  const source = `say ${JSON.stringify({ speaker: { kind: 'narrator' }, text: content })} @${statement};\n`;
  project.documents.get(sceneDocument).files[path] = source;
  let requests = 0;
  provider.adapter.submit = async function* () { requests++; throw new Error('No generation is authorized by this regression'); };
  const overview = unwrap(await provider.call('overview'));
  const line = overview.scenes.find(scene => scene.id === FixtureScenes[0].id).statements.find(line => line.id === statement);
  expect(line.label).toBe('星空 hello <b>literal</b>');
  const { draft } = await storedProductionDraft('speech', 'voice', { language: 'ja', voiceId: 'alloy', speechLines: [
    { id: randomUUID(), sceneId: FixtureScenes[0].id, statementId: statement, characterId: null, original: line.label, text: line.label, language: 'ja', voiceId: null, selected: true },
  ] });
  const plan = unwrap(await provider.call('plan', { draftId: draft.id, name: 'Controlled dialogue speech' }));
  const frozen = structuredClone(plan.task.items[0]);
  expect(frozen.input).toMatchObject({ purpose: 'speech', text: line.label, language: 'ja' });
  expect(JSON.stringify(frozen.input)).not.toMatch(/segments|ruby|ほしぞら|#99ccff|\[object Object\]/);
  expect(project.readDocument(sceneDocument).files[path]).toBe(source);
  project.documents.get(sceneDocument).files[path] = source.replace('星空', '修改后的正文');
  await provider.call('overview');
  expect(plan.task.items[0]).toEqual(frozen);
  expect(requests).toBe(0);
});

it('plans UI raster assets without a scene, page scope or text preparation request', async () => {
  const { draft } = await storedProductionDraft('image', 'ui', { positive: 'a blue button frame', negative: '', width: 512, height: 512, count: 1, references: [] });
  const plan = unwrap(await provider.call('plan', { draftId: draft.id, name: 'UI 位图' }));
  expect(plan.task.items).toHaveLength(1); expect(plan.task.items[0].input).toMatchObject({ purpose: 'image', usage: 'ui', positive: 'a blue button frame' });
  expect(plan.task.items[0].target).toMatchObject({ sceneId: null, statementId: null, uiScope: null });
});

it('sends the explicitly restored scheme default while retaining the selected parameter preset for other fields', async () => {
  const ctx = await provider.current(), official = (await ctx.recipes.listRecipes()).find(recipe => recipe.production?.operation === 'speech');
  const scheme = unwrap(await ctx.recipes.copyRecipe({ recipeId: official.id, sourceScope: 'official', scope: 'personal', projectId: null }));
  const changed = unwrap(await ctx.recipes.saveRecipe({ recipe: { ...scheme, production: { ...scheme.production, defaults: { ...scheme.production.defaults, speed: 1 } } }, expectedRevision: scheme.revision }));
  const preset = unwrap(await ctx.recipes.saveRecipe({ recipe: { ...changed, id: randomUUID(), revision: 0, name: 'Preset speed', production: undefined, parameterPreset: { recipeId: changed.id, recipeScope: changed.scope, recipeRevision: changed.revision, values: { speed: 1.4 } } }, expectedRevision: null }));
  const { draft } = await storedProductionDraft('speech', 'voice', { text: 'restore speed', language: 'ja', voiceId: 'alloy', speed: 1 }, { productionRecipeId: changed.id, parameterPresetId: preset.id, parameterOverrides: { speed: 1 } });
  const plan = unwrap(await provider.call('plan', { draftId: draft.id, name: 'Reset parameter' }));
  expect(plan.task.items[0].input.speed).toBe(1);
  expect(plan.task.items[0].parameterPresetSnapshot.parameterPreset.values.speed).toBe(1.4);
});

it('prepares exact recipe and parameter-preset selections with frozen revisions and rejects a stale selection before submission', async () => {
  const { config }=await storedProductionDraft('speech','voice',{text:'Recipe preparation',language:'ja',voiceId:'alloy'});
  const ctx=await provider.current(),official=(await ctx.recipes.listRecipes()).find(recipe=>recipe.production?.operation==='speech');
  const scheme=unwrap(await ctx.recipes.copyRecipe({recipeId:official.id,sourceScope:'official',scope:'personal',projectId:null}));
  const preset=unwrap(await ctx.recipes.saveRecipe({recipe:{...scheme,id:randomUUID(),revision:0,name:'Exact voice parameters',production:undefined,parameterPreset:{recipeId:scheme.id,recipeScope:scheme.scope,recipeRevision:scheme.revision,values:{speed:1.4}}},expectedRevision:null}));
  const input={operation:'speech',connectionId:config.id,usage:'voice',fields:{text:'Recipe preparation',language:'ja',voiceId:'alloy'},productionRecipe:{id:scheme.id,scope:scheme.scope,revision:scheme.revision},parameterPreset:{id:preset.id,scope:preset.scope,revision:preset.revision},parameterOverrides:{speed:1.2}};
  const plan=unwrap(await provider.prepareOperation(input));expect(plan.task.items[0]).toMatchObject({input:{speed:1.2},productionSnapshot:{id:scheme.id,revision:scheme.revision},parameterPresetSnapshot:{id:preset.id,revision:preset.revision}});
  const direct=unwrap(await provider.prepareOperation({...input,fields:{...input.fields,speed:1.8},parameterOverrides:{}}));
  expect(direct.task.items[0]).toMatchObject({input:{speed:1.8},parameterSources:{speed:'input'}});
  const overridden=unwrap(await provider.prepareOperation({...input,fields:{...input.fields,speed:1.8}}));
  expect(overridden.task.items[0]).toMatchObject({input:{speed:1.2},parameterSources:{speed:'override'}});
  const defaults=unwrap(await provider.prepareOperation({...input,parameterOverrides:{}}));
  expect(defaults.task.items[0]).toMatchObject({input:{speed:1.4},parameterSources:{speed:'preset'}});
  unwrap(await ctx.recipes.saveRecipe({recipe:{...scheme,name:'Updated exact scheme'},expectedRevision:scheme.revision}));
  await expect(provider.prepareOperation(input)).rejects.toThrow('recipe revision changed');expect(plan.task.items[0].productionSnapshot.name).toBe(scheme.name);
});

it('plans a portable ComfyUI scheme using only its embedded API graph and mappings', async () => {
  const ctx = await provider.current(), official = (await ctx.recipes.listRecipes()).find(recipe => recipe.production?.operation === 'image');
  const graph = { id: randomUUID(), revision: 1, name: 'Embedded graph', purpose: 'image', imageUsages: ['ui'], graphVersion: '1', apiGraph: { '1': { class_type: 'FixtureImage', inputs: { positive: '', width: 32, height: 32, count: 1 } } }, editorWorkflowPath: null,
    inputs: ['positive','width','height','count'].map(port => ({ port, nodeId: '1', classType: 'FixtureImage', input: port, valueType: port === 'positive' ? 'string' : 'number', required: true, transform: 'identity' })), uploads: [], outputs: [{ nodeId: '1', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'image', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] };
  const scheme = unwrap(await ctx.recipes.saveRecipe({ recipe: { ...official, id: randomUUID(), revision: 0, scope: 'personal', projectId: null, production: { ...official.production, protocol: 'comfyUI', workflow: graph } }, expectedRevision: null }));
  const { draft, config } = await storedProductionDraft('image', 'ui', { positive: 'frame', negative: '', width: 32, height: 32, count: 1 }, { productionRecipeId: scheme.id, workflowBindingId: null, parameterOverrides: { width: 32, height: 32, count: 1 } });
  config.protocol = 'comfyUI';
  const plan = unwrap(await provider.call('plan', { draftId: draft.id, name: 'Embedded Comfy graph' }));
  expect(plan.task.items[0].workflowSnapshot).toEqual(graph);
  expect(plan.task.items[0].input).toMatchObject({ width: 32, height: 32, count: 1 });
});

it('rejects a draft revision changed after checking while retaining the saved inputs', async () => {
  const { draft } = await storedProductionDraft('image', 'ui', { positive: 'first', negative: '', width: 512, height: 512, count: 1, references: [] });
  const plan = unwrap(await provider.call('plan', { draftId: draft.id, name: '旧计划' }));
  draft.variants.ui.fields.positive = 'latest';
  unwrap(await provider.call('saveDraft', { draft, expectedRevision: draft.revision }));
  expect(await provider.call('submit', plan.planId)).toMatchObject({ ok: false, error: { code: 'TASK_DRAFT_CHANGED' } });
  expect(unwrap(await provider.call('overview')).drafts[0].variants.ui.fields.positive).toBe('latest');
});

it('does not invalidate an independent UI input when an unrelated scene changes', async () => {
  const { draft } = await storedProductionDraft('image', 'ui', { positive: 'independent frame', negative: '', width: 512, height: 512, count: 1, references: [] });
  project.documents.get(sceneDocument).revision++;
  const plan = unwrap(await provider.call('plan', { draftId: draft.id, name: 'Independent UI' }));
  expect(plan.expected).toEqual([]);
  expect(plan.task.items[0].sourceVersions).toEqual([]);
  expect(plan.task.items[0].input.positive).toBe('independent frame');
});

it('requires review when the actual adoption scene changes and accepts an explicitly reviewed target version', async () => {
  const { draft, variant } = await storedProductionDraft('image', 'background', { positive: 'background', negative: '', width: 512, height: 512, count: 1, references: [] });
  draft.variants.background.target.sceneId = FixtureScenes[0].id;
  let saved = unwrap(await provider.call('saveDraft', { draft, expectedRevision: draft.revision }));
  project.documents.get(sceneDocument).revision++;
  expect(await provider.call('plan', { draftId: saved.id, name: 'Bound background' })).toMatchObject({ ok: false, error: { code: 'TASK_SOURCE_CHANGED' } });
  saved.variants.background.sourceVersions = unwrap(await provider.call('overview')).versions;
  saved = unwrap(await provider.call('saveDraft', { draft: saved, expectedRevision: saved.revision }));
  const plan = unwrap(await provider.call('plan', { draftId: saved.id, name: 'Reviewed target' }));
  expect(plan.expected).toEqual([{ ref: { kind: 'document', id: sceneDocument }, revision: project.readDocument(sceneDocument).revision }]);
  expect(plan.task.items[0].input.positive).toBe(variant.fields.positive);
});
it('runs a plugin generation adapter against an HTTP service, reviews its candidate, and saves the adopted script through M02', async () => {
  let requests = 0, acquired = 0, released = 0;
  const server = createServer(async (request, response) => {
    if (request.url !== '/generate' || request.method !== 'POST') { response.writeHead(404); response.end(); return; }
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); expect(input.purpose).toBe('text'); requests++;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ text: `say {speaker:{kind:"narrator"},text:"插件服务候选"} @${randomUUID()};` }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const lockId = randomUUID(), lockFiles = { 'dependencies.lock.json': envelope(lockId, { ...FixtureLock, plugins: [], template: { ...FixtureLock.template, id: template.id, version: template.version } }) };
    project.documents.set(lockId, { documentId: lockId, revision: 1, savedRevision: 1, format: 'json', files: lockFiles, savedFiles: structuredClone(lockFiles), dirty: false });
    const baseUrl = `http://127.0.0.1:${server.address().port}`, config = { ...unwrap(await provider.call('overview')).connections[0],
      providerKey: 'test.service/generate', protocol: 'plugin', purposes: ['text'], baseUrl };
    provider.connections.read = async () => ({ config }); provider.connections.list = async () => [config];
    const capabilities = { query: false, refetch: false, cancelPerTask: false, resume: false };
    const contribution = { key: config.providerKey, version: '0.1.0', purposes: ['text'], configFields: [], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, capabilities,
      create: () => ({ inspect: async (connection) => inputCapability({ ...connection, protocol: 'chatCompletions' }, { purpose: 'text', system: '', messages: [], maxOutputTokens: 64, temperature: null, seed: null }, null),
        async *submit(input, context) {
          const result = await fetch(context.config.baseUrl + '/generate', { method: 'POST', body: JSON.stringify(input), signal: context.signal });
          if (!result.ok) throw new Error('Service failed'); const output = await result.json();
          yield { kind: 'accepted', remote: null }; yield { kind: 'textDelta', text: output.text }; yield { kind: 'output', artifacts: [], usage: null };
        }, query: async () => { throw new Error('unsupported'); }, fetch: async () => { throw new Error('unsupported'); }, cancel: async () => ({ local: 'stopped', remote: 'unsupported' }) }) };
    provider.generationProviders = { describe: async () => ({ providerKey: contribution.key, packageVersion: '0.1.0', capabilities }),
      list: async () => [{ key: contribution.key, packageVersion: '0.1.0', purposes: contribution.purposes, configFields: contribution.configFields, capabilities }],
      acquire: async (snapshot) => { expect(snapshot.packageVersion).toBe('0.1.0'); acquired++; return { provider: contribution, packageVersion: '0.1.0', release() { released++; } }; } };
    const overview = unwrap(await provider.call('overview')), ctx = await provider.current();
    expect(overview.providers[0].key).toBe(config.providerKey); expect(unwrap(await provider.call('providers'))).toEqual(overview.providers);
    const item = await provider.createItem(ctx, { activeUse: 'script' }, { connectionId: config.id, model: null, workflowBindingId: null, recipe: null,
      fields: { instruction: '写一行旁白' }, context: [], sourceVersions: overview.versions, backgroundRemoval: null, backgroundPreview: null,
      target: { sceneId: FixtureScenes[0].id, statementId: statement, replaceStatementIds: [], characterId: null, locale: null, usage: 'script', uiScope: null } });
    const plan = unwrap(await provider.call('planTask', { name: '插件服务制作', items: [item], context: [], policy: 'waitForSelection', selectionRule: null, expected: overview.versions }));
    const task = unwrap(await provider.call('submit', plan.planId)); await ctx.service.drain();
    const completed = ctx.service.listTasks().find(value => value.id === task.id), candidateId = completed.items[0].candidateIds[0];
    expect(completed.items[0].providerSnapshot).toMatchObject({ providerKey: config.providerKey, packageVersion: '0.1.0' });
    expect(ctx.service.getCandidate(candidateId).checks).toEqual([]);
    const adoption = unwrap(await provider.call('select', { taskId: task.id, selections: [{ itemId: item.id, candidateId }], target: 'project', expected: overview.versions }));
    unwrap(await provider.call('apply', { planId: adoption.planId, expected: adoption.input.expected }));
    const save = unwrap(project.planSave({ kind: 'all' })); unwrap(await project.save(save.planId));
    expect(project.readDocument(sceneDocument, 'saved').files[`scenes/${FixtureScenes[0].id}/script.gal`]).toContain('插件服务候选');
    expect(requests).toBe(1); expect(acquired).toBe(released); expect(ctx.service.adoptionState(candidateId)).toBe('saved');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
it('previews a replacement candidate from the full scene with retained identity without changing project files', async () => {
  const lockId = randomUUID(), lockFiles = { 'dependencies.lock.json': envelope(lockId, { ...FixtureLock, plugins: [], template: { ...FixtureLock.template, id: template.id, version: template.version } }) };
  project.documents.set(lockId, { documentId: lockId, revision: 1, savedRevision: 1, format: 'json', files: lockFiles, savedFiles: structuredClone(lockFiles), dirty: false });
  const path = `scenes/${FixtureScenes[0].id}/script.gal`, prefix = randomUUID(), terminal = randomUUID();
  project.documents.get(sceneDocument).files[path] = `say {speaker:{kind:"narrator"},text:"场景前序"} @${prefix};\nsay {speaker:{kind:"narrator"},text:"原文"} @${statement};\nend {} @${terminal};`;
  const before = project.readDocument(sceneDocument).files[path];
  const input = { current: provider.scriptCompileInput(project), documentId: sceneDocument, beforeStatementId: statement, replaceStatementIds: [statement], bindings: {}, expected: [{ ref: { kind: 'document', id: sceneDocument }, revision: 1 }], candidate: { partial: false, editedText: `say {speaker:{kind:"narrator"},text:"候选旁白"} @${statement};` } };
  const snapshot = unwrap(await previewScript(input));
  const instructions = snapshot.scenes.find(scene => scene.scene.id === FixtureScenes[0].id).instructions;
  expect(instructions.map(instruction => instruction.statementId)).toEqual([prefix, statement, terminal]);
  expect(project.readDocument(sceneDocument).files[path]).toBe(before);
  expect(snapshot.project.entry).toEqual({ sceneId: FixtureScenes[0].id, labelId: null });
  const insertion = unwrap(await reviewScript({ ...input, beforeStatementId: null, replaceStatementIds: [] }));
  expect(insertion.patches[0].edits[0].start).toBe(before.indexOf('end {}'));
  expect(insertion.patches[0].edits[0].end).toBe(before.indexOf('end {}'));
});
it('assembles selected story context with actual assets, outline and legal command fields', async () => {
  const outline = unwrap(await provider.call('readOutline'));
  outline.outline.chapters = [];
  outline.outline.setting = '黄昏海边的约定';
  unwrap(await provider.call('saveOutline', { outline: outline.outline, expectedRevision: null }));
  const parts = unwrap(await provider.call('context', { sceneId: FixtureScenes[0].id, pageIds: [], componentIds: [], statementIds: [statement], usage: 'script' }));
  expect(parts.find(part => part.kind === 'setting' && part.label.includes('outline')).text).toContain('黄昏海边的约定');
  expect(parts.some(part => part.kind === 'assetCatalog')).toBe(true);
  expect(parts.find(part => part.label.includes('Selected script')).text).toContain(statement);
  const command = JSON.parse(parts.find(part => part.kind === 'instruction' && part.text.includes('"commands"')).text);
  expect(command.syntax).toBe('<command> <JSON object> @<6-character A-Za-z0-9 ID>;');
  expect(command.commands.find(spec => spec.key === 'say').fields.some(field => field.path === 'speaker')).toBe(true);
});
it('freezes formal character prose and actual reference bytes through M10 media and text attachment ports', async () => {
  const current = [...project.documents.values()].find(document => document.files['assets/index.json']);
  const index = JSON.parse(current.files['assets/index.json']), picture = join(root, 'character-reference.png');
  provider.assets.toolDirectory = resolve(import.meta.dirname, '../../../tools/media/runtime/bin');
  await sharp({ create: { width: 4, height: 6, channels: 4, background: '#aabbcc' } }).png().toFile(picture);
  const importer = new ImportCoordinator(join(root, 'project'), provider.assets.toolDirectory, () => index);
  const prepared = unwrap((await importer.importBatch({ projectId: project.projectId, files: [picture], folder: [], conflict: 'keepBoth', usage: 'image', targetBinding: null }))[0].result);
  const edit = unwrap(importer.prepareIndexEdit([prepared.preparationId]));
  const character = structuredClone(FixtureCharacters[1]); character.appearance.referenceAssets = [prepared.assetId]; character.description = '沉静、谨慎，守住海边的约定'; character.appearance.notes = '银色短发和蓝色围巾';
  const characterDocumentId = randomUUID(), characterPath = `characters/${character.id}.json`;
  const plan = unwrap(project.planEdit({ label: '正式人设及参考', origin: 'field', expected: edit.expected,
    patches: [...edit.indexPatches, { kind: 'document', documentId: characterDocumentId, op: 'create', before: null, after: { format: 'json', files: { [characterPath]: envelope(characterDocumentId, character) } } }],
    preparedAssets: edit.preparedAssets, requiredRefs: edit.requiredRefs }));
  unwrap(project.applyEdit(plan.planId, edit.expected)); importer.confirm([prepared.preparationId]);
  const outline = unwrap(await provider.call('readOutline')); outline.outline.setting = '黄昏海边'; outline.outline.chapters = [];
  unwrap(await provider.call('saveOutline', { outline: outline.outline, expectedRevision: null }));
  const ctx = await provider.current(), overview = unwrap(await provider.call('overview'));
  const variant = { operation: 'image', connectionId: overview.connections[0].id, fields: { positive: '站姿参考', width: 64, height: 64, count: 1 }, context: [], model: null, workflowBindingId: null, recipe: null, promptPreparation: null,
    sourceVersions: [], target: { sceneId: null, statementId: null, characterId: character.id, locale: null, usage: 'figure', uiScope: null }, backgroundRemoval: null, backgroundPreview: null };
  const item = await provider.createItem(ctx, { activeUse: 'figure' }, variant);
  expect(item.input.positive).toContain('沉静、谨慎'); expect(item.input.positive).toContain('银色短发'); expect(item.input.positive).toContain('黄昏海边');
  expect(item.input.references).toHaveLength(1); expect(item.input.references[0]).toMatchObject({ assetId: prepared.assetId, variantId: prepared.variantId, mime: 'image/png' });
  const taskPlan = unwrap(await ctx.service.planTask({ projectId: project.projectId, name: 'Reference bytes', context: [], items: [item], policy: 'waitForSelection', selectionRule: null }));
  const task = unwrap(await ctx.service.submit(taskPlan.planId));
  expect(await readFile(task.items[0].input.references[0].localPath)).toEqual(await readFile(picture));
  expect(task.items[0].sourceVersions.some(source => source.ref.id === characterDocumentId)).toBe(true);
  await ctx.service.cancel(task.id);
  const textParts = unwrap(await provider.call('context', { characterId: character.id, usage: 'script' }));
  const attachment = textParts.find(part => part.kind === 'media').attachment;
  expect(attachment).toMatchObject({ mime: 'image/png', width: 4, height: 6, source: { ref: { id: current.documentId } } });
  const textConfig = { ...overview.connections[0], protocol: 'chatCompletions', parameters: { textVision: false } };
  provider.connections.read = async () => ({ config: textConfig });
  const unsupported = await provider.createItem(ctx, { activeUse: 'script' }, { ...variant, operation: 'script', target: { ...variant.target, usage: 'script' }, fields: { instruction: '保持人设' }, context: textParts });
  expect(unsupported.input.messages[0].attachments[0].localPath).toBe(attachment.localPath);
  expect(await ctx.service.planTask({ projectId: project.projectId, name: 'Unsupported vision', context: [], items: [unsupported], policy: 'waitForSelection', selectionRule: null })).toMatchObject({ ok: false, error: { code: 'TASK_PLAN' } });
  await ctx.service.close();
}, 20000);
it('updates the outline through one M02 undoable edit and rejects stale revisions', async () => {
  const initial = unwrap(await provider.call('readOutline'));
  const outline = { ...initial.outline, chapters: [], setting: '作者设定' };
  const receipt = unwrap(await provider.call('saveOutline', { outline, expectedRevision: null }));
  const current = unwrap(await provider.call('readOutline'));
  expect(current.outline.setting).toBe('作者设定');
  expect(project.dirtyIds()).toContain(current.documentId);
  expect((await provider.call('saveOutline', { outline, expectedRevision: null })).ok).toBe(false);
  unwrap(project.undo(unwrap(project.planUndo(current.documentId, receipt.operationId)).planId));
  expect(unwrap(await provider.call('readOutline')).documentId).toBeNull();
});
it('keeps direct creation and a continuing discussion in one persisted task', async () => {
  const ctx = await provider.current(), overview = unwrap(await provider.call('overview'));
  overview.connections[0].protocol = 'chatCompletions';
  provider.connections.read = async () => ({ config: overview.connections[0] });
  let reply = '先让两个人在车站讨论约定';
  provider.adapter.submit = async function* () { yield { kind: 'textDelta', text: reply }; yield { kind: 'output', artifacts: [], usage: { prompt_tokens: 200, completion_tokens: 20, prompt_cache_hit_tokens: 128 } }; };
  const variant = { connectionId: overview.connections[0].id, fields: { instruction: '讨论剧情', creationMode: 'discuss' }, context: [], model: null, workflowBindingId: null, recipe: null,
    sourceVersions: overview.versions, target: { sceneId: FixtureScenes[0].id, statementId: statement, replaceStatementIds: [], characterId: null, locale: null, usage: 'script', uiScope: null }, backgroundRemoval: null, backgroundPreview: null };
  const first = await provider.createItem(ctx, { activeUse: 'script' }, variant);
  const plan = unwrap(await ctx.service.planTask({ projectId: project.projectId, name: '持续创作', context: [], items: [first], policy: 'waitForSelection', selectionRule: null }));
  const task = unwrap(await ctx.service.submit(plan.planId)); await ctx.service.drain();
  const original = ctx.service.listTasks().find(t => t.id === task.id), candidateId = original.items[0].candidateIds[0];
  expect(ctx.service.getCandidate(candidateId).checks).toEqual([]);
  const next = unwrap(await provider.call('planContinuation', { taskId: task.id, candidateId, instruction: '把人物动机说清楚', mode: 'discuss' }));
  reply = '她害怕错过最后的告别';
  unwrap(await provider.call('submitContinuation', { taskId: task.id, planId: next.planId })); await ctx.service.drain();
  const updated = ctx.service.listTasks().find(t => t.id === task.id);
  expect(updated.items).toHaveLength(2);
  expect(updated.items[1].input.messages[1].text).toBe('先让两个人在车站讨论约定');
  const candidate = ctx.service.getCandidate(updated.items[1].candidateIds[0]);
  expect(candidate.parentCandidateIds).toEqual([candidateId]);
  expect(candidate.provenance.usage.prompt_cache_hit_tokens).toBe(128);
});
it('freezes selected dialogue for the initial performance request', async () => {
  const path = `scenes/${FixtureScenes[0].id}/script.gal`, text = `say {speaker:{kind:"narrator"},text:"原文"} @${statement};`;
  project.documents.get(sceneDocument).files[path] = text;
  const ctx = await provider.current(), overview = unwrap(await provider.call('overview'));
  const item = await provider.createItem(ctx, { activeUse: 'script' }, { connectionId: overview.connections[0].id, fields: { instruction: '补演出', creationMode: 'performance' }, context: [], model: null, workflowBindingId: null, recipe: null, sourceVersions: overview.versions,
    target: { sceneId: FixtureScenes[0].id, statementId: statement, replaceStatementIds: [statement], characterId: null, locale: null, usage: 'script', uiScope: null }, backgroundRemoval: null, backgroundPreview: null });
  expect(item.protectedScript).toBe(text);
});
it('persists separate background and figure generation routes', async () => {
  const connection = unwrap(await provider.call('overview')).connections[0];
  const routes = { background: { connectionId: connection.id, workflowBindingId: null, model: 'background-model' }, figure: { connectionId: connection.id, workflowBindingId: null, model: 'figure-model' } };
  unwrap(await provider.call('saveImageRoutes', routes));
  expect(unwrap(await provider.call('overview')).imageRoutes).toEqual(routes);
});
beforeEach(async () => {
  await mkdir(root, { recursive: true });
  const id = randomUUID(),
    scene = FixtureScenes[0];
  sceneDocument = randomUUID();
  statement = randomUUID();
  template = createOfficialTemplate({ kind: "standard" });
  const index = createAssetIndex(randomUUID());
  project = await ProjectSession.createProject(
    join(root, "project"),
    FixtureProject.projectId,
    [
      {
        documentId: id,
        revision: 1,
        format: "json",
        files: { "project.json": envelope(id, FixtureProject) },
      },
      {
        documentId: sceneDocument,
        revision: 1,
        format: "dsl",
        files: {
          [`scenes/${scene.id}/scene.json`]: envelope(sceneDocument, scene),
          [`scenes/${scene.id}/script.gal`]: `end {} @${statement};\n`,
        },
      },
      {
        documentId: index.documentId,
        revision: 1,
        format: "json",
        files: { "assets/index.json": JSON.stringify(index) },
      },
      ...createTemplateDocuments(template),
    ],
  );
  const config = {
    id: randomUUID(),
    revision: 1,
    name: "Local test transport",
    protocol: "webUI",
    baseUrl: "http://local.invalid",
    auth: "none",
    credentialId: null,
    apiKeyHeader: null,
    model: "test",
    purposes: ["text", "image"],
    timeoutSecByPurpose: DefaultTimeoutSecByPurpose,
    concurrency: 1,
    parameters: {},
    workflowBindingId: null,
    serverFileRoot: null,
  };
  provider = new StudioProduction({
    userData: join(root, "user-data"),
    projects: { currentSession: project, currentRoot: join(root, "project") },
    assets: { toolDirectory: "", svgDecoder: decodeSVG },
    connections: {
      read: async () => ({ config }),
      list: async () => [config],
      credential: async () => null,
    },
    resources: { register: () => ({ uri: "test://candidate", release() {} }) },
  });
  provider.adapter = {
    async *submit(input) {
      const path = join(root, `${randomUUID()}.svg`);
      await writeFile(
        path,
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#89abcf"/></svg>',
      );
      yield {
        kind: "output",
        artifacts: [
          {
            id: randomUUID(),
            kind: "image",
            localPath: path,
            mime: "image/svg+xml",
            bytes: 128,
            role: "primary",
            group: "result",
            background: "unchanged",
            metadata: { width: 32, height: 32 },
            source: null,
          },
        ],
        usage: null,
      };
    },
    inspect: async () => ({}),
    query: async () => ({
      ok: true,
      value: { state: "unknown", output: null, issues: [] },
      warnings: [],
    }),
  };
});
afterEach(async () => {
  await project?.dispose("discard");
  await rm(root, { recursive: true, force: true });
});
async function generated(ui = false, usage = "background") {
  const ctx = await provider.current(),
    overview = unwrap(await provider.call("overview"));
  const variant = {
    target: {
      sceneId: FixtureScenes[0].id,
      statementId: statement,
      characterId: null,
      locale: null,
      usage,
      uiScope: ui
        ? { pageIds: [template.pages[0].id], componentIds: [] }
        : null,
    },
    fields: { positive: "test", width: 32, height: 32, count: 1 },
    context: [],
    connectionId: overview.connections[0].id,
    model: null,
    workflowBindingId: null,
    recipe: null,
    promptPreparation: null,
    backgroundRemoval: null,
    backgroundPreview: {
      canvas: { width: 1920, height: 1080 },
      frame: { fit: "contain", positionX: 0.25, positionY: 0.75 },
    },
    sourceVersions: overview.versions,
  };
  const items = await Promise.all(
    [1, 2].map(() => provider.createItem(ctx, { activeUse: usage }, variant)),
  );
  const plan = unwrap(
    await ctx.service.planTask({
      projectId: project.projectId,
      name: "images",
      items,
      context: [],
      policy: "waitForSelection",
      selectionRule: null,
      expected: overview.versions,
    }),
  );
  const task = unwrap(await ctx.service.submit(plan.planId));
  await ctx.service.drain();
  return { ctx, task: ctx.service.listTasks().find(current => current.id === task.id), expected: overview.versions };
}
it("reviews enabled plugin commands against current project text and rejects stale plugin context", async () => {
  const addDocument = (path, data) => {
    const documentId = randomUUID(),
      files = { [path]: envelope(documentId, data) };
    project.documents.set(documentId, {
      documentId,
      revision: 1,
      savedRevision: 1,
      format: "json",
      files,
      savedFiles: { ...files },
      dirty: false,
    });
    return project.documents.get(documentId);
  };
  const activeLock = {
    ...FixtureLock,
    plugins: FixtureLock.plugins.map(plugin => plugin.id === affectionMetadata.id ? { ...plugin, version: affectionMetadata.version } : plugin),
    template: {
      ...FixtureLock.template,
      id: template.id,
      version: template.version,
    },
  };
  const lock = addDocument("dependencies.lock.json", activeLock);
  addDocument(
    `characters/${FixtureCharacters[0].id}.json`,
    FixtureCharacters[0],
  );
  const config = {
    characters: [
      {
        characterId: FixtureCharacters[0].id,
        min: 0,
        max: 100,
        initial: 0,
        visible: true,
        label: "杏",
      },
    ],
  };
  addDocument("plugins/org.galcraft.affection/documents/config.json", config);
  const contributions = createAffectionContributions(config);
  const compiled = {
    ...provider.compileInput(project),
    pluginCommands: contributions.commands.map((c) => c.spec),
    pluginConditions: {},
  };
  provider.language = { currentInput: () => structuredClone(compiled) };
  const document = project.documents.get(sceneDocument),
    path = `scenes/${FixtureScenes[0].id}/script.gal`;
  document.files[path] = `// current working text\n${document.files[path]}`;
  const current = provider.scriptCompileInput(project);
  expect(current.documents[0].text).toContain("current working text");
  expect(current.pluginDocuments["org.galcraft.affection"]).toEqual(config);
  const result = await reviewScript({
    current,
    documentId: sceneDocument,
    beforeStatementId: statement,
    replaceStatementIds: [],
    bindings: {},
    expected: [{ ref: { kind: "document", id: sceneDocument }, revision: 1 }],
    candidate: {
      partial: false,
      editedText: `org.galcraft.affection/add { characterId: "${FixtureCharacters[0].id}", amount: 5 } @${randomUUID()};`,
    },
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  lock.files["dependencies.lock.json"] = envelope(lock.documentId, {
    ...FixtureLock,
    plugins: [{ ...FixtureLock.plugins[0], version: "2.0.0" }],
  });
  expect(() => provider.scriptCompileInput(project)).toThrow(
    "The plugin compilation context is not ready",
  );
});

it("adopts two image candidates with one index patch and binds a framed background before saving", async () => {
  const { ctx, task, expected } = await generated();
  const candidates = task.items.map((i) =>
    ctx.service.getCandidate(i.candidateIds[0]),
  );
  expect(candidates.every(Boolean)).toBe(true);
  const plan = unwrap(
    await provider.call("select", {
      taskId: task.id,
      selections: candidates.map((c) => ({
        itemId: c.itemId,
        candidateId: c.id,
      })),
      target: "project",
      expected,
      adoptions: {
        [candidates[0].id]: {
          mode: "bind",
          frame: { fit: "contain", positionX: 0.25, positionY: 0.75 },
        },
      },
    }),
  );
  expect(plan.input.patches.filter((p) => p.kind === "json")).toHaveLength(1);
  unwrap(
    await provider.call("apply", {
      planId: plan.planId,
      expected: plan.input.expected,
    }),
  );
  const overview = unwrap(await provider.call("overview"));
  expect(overview.assets).toHaveLength(2);
  expect(
    project.readDocument(sceneDocument).files[
      `scenes/${FixtureScenes[0].id}/script.gal`
    ],
  ).toContain('"positionX":0.25');
  expect(ctx.service.adoptionState(candidates[0].id)).toBe("adopted");
  unwrap(await project.save(unwrap(project.planSave({ kind: "all" })).planId));
  expect(ctx.service.adoptionState(candidates[0].id)).toBe("saved");
  expect(ctx.importer.pendingVariants()).toHaveLength(0);
});
it("discarding an adoption releases prepared files without changing the index", async () => {
  const { ctx, task, expected } = await generated(),
    candidateId = task.items[0].candidateIds[0];
  const plan = unwrap(
    await provider.call("select", {
      taskId: task.id,
      selections: [{ itemId: task.items[0].id, candidateId }],
      target: "project",
      expected,
    }),
  );
  expect(ctx.importer.pendingVariants()).toHaveLength(1);
  unwrap(await provider.call("discardAdoption", plan.planId));
  expect(ctx.importer.pendingVariants()).toHaveLength(0);
  expect(unwrap(await provider.call("overview")).assets).toHaveLength(0);
});
it('retains the actual adopted media when M10 metadata fails, then repairs the original candidate on reopen',async()=>{
  const {ctx,task,expected}=await generated(),candidateId=task.items[0].candidateIds[0];
  const plan=unwrap(await provider.call('select',{taskId:task.id,selections:[{itemId:task.items[0].id,candidateId}],target:'project',expected}));
  const saveCandidate=ctx.service.store.saveCandidate.bind(ctx.service.store);ctx.service.store.saveCandidate=async()=>{throw new Error('candidate metadata disk full');};
  await expect(provider.call('apply',{planId:plan.planId,expected:plan.input.expected,collaboration:{sessionId:'Collab01',callId:'Adopt01',scopeRevision:1,projectId:project.projectId,writeSessionId:'Write1'}})).rejects.toThrow('candidate metadata disk full');
  expect(ctx.importer.pendingVariants()).toHaveLength(0);const adopted=ctx.index().data.assets[0],variant=adopted.variants[0],file=join(root,'project',assetFilePath(adopted.id,variant.id,variant.entry));
  const bytes=await readFile(file);expect(bytes.length).toBeGreaterThan(0);await provider.closeProject(project.projectId);expect(await readFile(file)).toEqual(bytes);
  ctx.service.store.saveCandidate=saveCandidate;const projectId=project.projectId;await project.dispose('keep');project=await ProjectSession.open(join(root,'project'),projectId);unwrap(await project.recover('restore'));provider.projects.currentSession=project;
  const reopened=await provider.current();expect(reopened.service.getCandidate(candidateId).adoption).toHaveLength(1);expect(reopened.service.adoptionState(candidateId)).toBe('adopted');expect(await readFile(file)).toEqual(bytes);await provider.closeProject(projectId);
});
it("rejects a UI patch outside the confirmed page scope", async () => {
  const { ctx, task } = await generated(true),
    candidateId = task.items[0].candidateIds[0];
  const result = await provider
    .call("saveComposition", {
      candidateId,
      planId: task.id,
      proposal: {
        summary: "patch",
        config: [
          {
            key: "outside",
            pageId: template.pages[1].id,
            componentId: null,
            path: "background",
            operation: "clear",
            value: null,
            dependsOn: [],
          },
        ],
        styles: [],
        assets: [],
      },
      resources: [],
    })
    .catch((e) => ({ ok: false, error: { message: String(e) } }));
  expect(result.ok).toBe(false);
  expect(result.error.message).toContain("范围");
});

it("rejects an explicitly selected figure without a character before changing the project", async () => {
  const { ctx, task, expected } = await generated(false, "figure");
  const candidateId = task.items[0].candidateIds[0];
  const result = await provider
    .call("select", {
      taskId: task.id,
      selections: [{ itemId: task.items[0].id, candidateId }],
      target: "project",
      expected,
      adoptions: { [candidateId]: { mode: "bind", placement: "new", use: "figure" } },
    })
    .catch((error) => ({ ok: false, error }));
  expect(result.ok).toBe(false);
  expect(result.error.message).toContain("Select a character");
  expect(ctx.importer.pendingVariants()).toHaveLength(0);
  expect(unwrap(await provider.call("overview")).assets).toHaveLength(0);
});
it("inserts a showing background at a clear command instead of rewriting its asset", async () => {
  const path = `scenes/${FixtureScenes[0].id}/script.gal`,
    before = project.readDocument(sceneDocument).files[path];
  const after = `changeBg {"op":"clear"} @${statement};\nend {} @${randomUUID()};\n`;
  const expected = [
    { ref: { kind: "document", id: sceneDocument }, revision: 1 },
  ];
  const edit = unwrap(
    project.planEdit({
      label: "Clear scene",
      origin: "field",
      expected,
      patches: [
        {
          kind: "text",
          documentId: sceneDocument,
          edits: [{ start: 0, end: before.length, before, after }],
        },
      ],
      preparedAssets: [],
      requiredRefs: [],
    }),
  );
  unwrap(project.applyEdit(edit.planId, expected));
  const generatedResult = await generated(),
    { ctx, task } = generatedResult,
    candidateId = task.items[0].candidateIds[0];
  const plan = unwrap(
    await provider.call("select", {
      taskId: task.id,
      selections: [{ itemId: task.items[0].id, candidateId }],
      target: "project",
      expected: generatedResult.expected,
      adoptions: { [candidateId]: { mode: "bind" } },
    }),
  );
  const patch = plan.input.patches.find((p) => p.kind === "text");
  expect(patch.edits[0].before).toBe("");
  expect(patch.edits[0].after).toContain('"op":"show"');
  unwrap(await provider.call("discardAdoption", plan.planId));
  expect(ctx.importer.pendingVariants()).toHaveLength(0);
});
it("cleans UI composition asset preparation on cancel, and commits it on adoption", async () => {
  const { ctx, task, expected } = await generated(true),
    candidateId = task.items[0].candidateIds[0];
  const composition = unwrap(
    await provider.call("saveComposition", {
      candidateId,
      proposal: {
        summary: "new image",
        config: [],
        styles: [],
        assets: [
          {
            key: "image",
            source: { kind: "candidate", key: "image" },
            use: "background",
          },
        ],
      },
      resources: [
        { key: "image", taskId: task.id, candidateId, artifactIndex: 0 },
      ],
    }),
  );
  const input = {
    compositionId: composition.id,
    expectedCompositionRevision: composition.revision,
    changeKeys: [],
    assetKeys: ["image"],
    assetAdoptions: [
      {
        key: "image",
        source: null,
        destination: "newAsset",
        replace: { mode: "none", refs: [] },
      },
    ],
    substitutions: [],
    expected,
  };
  const first = unwrap(await provider.call("prepareUIAdoption", input));
  const created = first.input.patches.find((p) => p.kind === "json").changes[0]
    .after[0];
  expect(created.tags).toContain('ui:background');
  await readdir(
    join(root, "project/assets/files", created.id, created.activeVariantId),
  );
  unwrap(await provider.call("discardAdoption", first.planId));
  await expect(
    readdir(
      join(root, "project/assets/files", created.id, created.activeVariantId),
    ),
  ).rejects.toThrow();
  const second = unwrap(await provider.call("prepareUIAdoption", input));
  unwrap(
    await provider.call("apply", {
      planId: second.planId,
      expected: second.input.expected,
    }),
  );
  expect(unwrap(await provider.call("overview")).assets).toHaveLength(1);
  expect(ctx.service.adoptionState(candidateId)).toBe("adopted");
});

it("adopts a fixed page style and image as one document group, and rejects an old candidate after the page changes", async () => {
  const proposal = {
    summary: "Page background",
    config: [],
    assets: [{ key: "image", source: { kind: "candidate", key: "image" }, use: "background" }],
    styles: [{ key: "style", name: "Page background", styleId: null,
      scope: { pageId: template.pages[0].id, componentId: null }, language: "css",
      source: '[data-gc-part="title.background"] { background-image: url("candidate-asset:image"); }',
      dependsOn: ["image"] }],
  };
  const { ctx, task, expected } = await generated(true, "ui");
  const candidateId = task.items[0].candidateIds[0];
  const composition = unwrap(await provider.call("saveComposition", {
    candidateId, proposal, resources: [{ key: "image", taskId: task.id, candidateId, artifactIndex: 0 }],
  }));
  const adoption = () => ({ compositionId: composition.id, expectedCompositionRevision: composition.revision,
    changeKeys: ["style"], assetKeys: ["image"], assetAdoptions: [{ key: "image", source: null,
      destination: "newAsset", replace: { mode: "none", refs: [] } }], substitutions: [], expected });
  const plan = unwrap(await provider.call("prepareUIAdoption", adoption()));
  expect(plan.input.patches.some(patch => patch.kind === "json" && patch.documentId === template.instanceId)).toBe(true);
  const receipt = unwrap(await provider.call("apply", { planId: plan.planId, expected: plan.input.expected }));
  const current = unwrap(await provider.call("overview"));
  const assetId = current.assets[0].id;
  expect(current.assets).toHaveLength(1);
  expect(readTemplateDocuments([...project.documents.values()]).styles.some(style => style.assets.includes(assetId))).toBe(true);
  const undo = unwrap(project.planUndo(template.instanceId, receipt.operationId));
  unwrap(project.undo(undo.planId));
  expect(unwrap(await provider.call("overview")).assets).toHaveLength(0);
  expect(readTemplateDocuments([...project.documents.values()]).styles.some(style => style.assets.includes(assetId))).toBe(false);
  unwrap(project.redo(undo.planId));
  expect(unwrap(await provider.call("overview")).assets.map(asset => asset.id)).toContain(assetId);
  unwrap(await project.save(unwrap(project.planSave({ kind: "all" })).planId));
  const reopened = await ProjectSession.open(join(root, "project"), project.projectId);
  expect(readTemplateDocuments([...reopened.documents.values()]).styles.some(style => style.assets.includes(assetId))).toBe(true);
  expect(JSON.parse([...reopened.documents.values()].find(doc => doc.files["assets/index.json"]).files["assets/index.json"]).data.assets.map(asset => asset.id)).toContain(assetId);
  await reopened.dispose("saved");

  const later = await generated(true, "ui"), oldCandidate = later.task.items[0].candidateIds[0];
  const oldComposition = unwrap(await provider.call("saveComposition", { candidateId: oldCandidate, proposal,
    resources: [{ key: "image", taskId: later.task.id, candidateId: oldCandidate, artifactIndex: 0 }] }));
  const pageId = template.pages[0].id, page = project.readDocument(pageId), pageExpected = [{ ref: { kind: "document", id: pageId }, revision: page.revision }];
  const before = JSON.parse(page.files[`ui/pages/${pageId}.json`]).data.background.color;
  const edit = unwrap(project.planEdit({ label: "Author edits page", origin: "field", expected: pageExpected,
    patches: [{ kind: "json", documentId: pageId, changes: [{ path: "/data/background/color", before, after: "#123456", op: "set" }] }],
    preparedAssets: [], requiredRefs: [] }));
  unwrap(project.applyEdit(edit.planId, pageExpected));
  const rejected = await provider.call("prepareUIAdoption", { ...adoption(), compositionId: oldComposition.id,
    expectedCompositionRevision: oldComposition.revision, expected: unwrap(await provider.call("overview")).versions });
  expect(rejected.ok).toBe(false);
  if (!rejected.ok) expect(rejected.error.message).toContain("页面来源版本已变化");
  expect(JSON.parse(project.readDocument(pageId).files[`ui/pages/${pageId}.json`]).data.background.color).toBe("#123456");
  expect(unwrap(await provider.call("overview")).assets.map(asset => asset.id)).toEqual([assetId]);
  expect(ctx.importer.pendingVariants()).toHaveLength(0);
});

it('adopts only the exact substitute variant shown in the reviewed composition preview', async () => {
  const asset = structuredClone(FixtureAsset), oldVariant = asset.activeVariantId;
  const active = { ...structuredClone(asset.variants[0]), id: randomUUID() };
  asset.variants.push(active); asset.activeVariantId = active.id;
  const index = [...project.documents.values()].find(document => document.files['assets/index.json']);
  const indexExpected = [{ ref: { kind: 'document', id: index.documentId }, revision: index.revision }];
  const seed = unwrap(project.planEdit({ label: 'Two reviewed image versions', origin: 'field', expected: indexExpected,
    patches: [{ kind: 'json', documentId: index.documentId, changes: [{ path: '/data/assets', op: 'set', before: [], after: [asset] }] }],
    preparedAssets: [], requiredRefs: [] }));
  unwrap(project.applyEdit(seed.planId, indexExpected));
  const { task, expected } = await generated(true, 'ui'), candidateId = task.items[0].candidateIds[0], page = template.pages[0];
  const composition = unwrap(await provider.call('saveComposition', { candidateId,
    proposal: { summary: 'Reviewed substitute', styles: [],
      assets: [{ key: 'image', source: { kind: 'candidate', key: 'image' }, use: 'background' }],
      config: [{ key: 'background', pageId: page.id, componentId: null, path: 'background.imageId', operation: 'set',
        value: { kind: 'candidate', key: 'image' }, dependsOn: ['image'] }] },
    resources: [{ key: 'image', taskId: task.id, candidateId, artifactIndex: 0 }] }));
  const preview = unwrap(await provider.call('previewComposition', { id: composition.id, revision: composition.revision,
    keys: ['background', 'image'], substitutions: { image: asset.id } }));
  const adoption = { compositionId: composition.id, expectedCompositionRevision: composition.revision,
    changeKeys: ['background'], assetKeys: ['image'], assetAdoptions: [], expected, previewId: preview.previewId };
  const before = project.operations.length;
  expect(await provider.call('prepareUIAdoption', { ...adoption, substitutions: [{ key: 'image', assetId: asset.id, variantId: oldVariant }] }))
    .toMatchObject({ ok: false, error: { code: 'UI_PREVIEW_CHANGED' } });
  expect(project.operations).toHaveLength(before);
  expect((await provider.call('prepareUIAdoption', { ...adoption, substitutions: [{ key: 'image', assetId: asset.id, variantId: active.id }] })).ok).toBe(true);
});

it('reviews complex CSS ownership before adoption and binds matches to the exact composition', async () => {
  const { task, expected } = await generated(true, 'ui'), candidateId = task.items[0].candidateIds[0];
  const page = template.pages[0], title = components(page.root).find(component => component.part === 'title.workTitle');
  const proposal = { summary: 'CSS preview ownership', config: [], assets: [], styles: [{ key: 'style', name: 'Preview', styleId: null,
    scope: { pageId: page.id, componentId: null }, language: 'css', dependsOn: [],
    source: '[data-gc-part="title.workTitle"]:not(:disabled) {color:var(--gc-ink)}' }] };
  const composition = unwrap(await provider.call('saveComposition', { candidateId, proposal, resources: [] }));
  const input = { id: composition.id, revision: composition.revision, keys: ['style'] };
  const adoption = { compositionId: composition.id, expectedCompositionRevision: composition.revision, changeKeys: ['style'],
    assetKeys: [], assetAdoptions: [], substitutions: [], expected };
  const unresolved = await provider.call('prepareUIAdoption', adoption);
  expect(unresolved.ok).toBe(false);
  expect(unresolved.error.message).toContain('实际组件预览');
  const preview = unwrap(await provider.call('previewComposition', input));
  expect(preview.unresolvedStyleMatches).toHaveLength(1);
  expect(preview.template.styles).toHaveLength(1);
  expect(await provider.call('prepareUIAdoption', { ...adoption, previewId: preview.previewId })).toMatchObject({ ok: false, error: { code: 'UI_PREVIEW_CHANGED' } });
  await expect(provider.call('previewComposition', { ...input, previewId: preview.previewId, matches: [] })).rejects.toThrow('尚未完整解析');
  const reviewed = unwrap(await provider.call('previewComposition', { ...input, previewId: preview.previewId,
    matches: preview.unresolvedStyleMatches.map(request => ({ ...request, targets: [{ componentId: title.id, state: 'normal' }] })) }));
  expect(reviewed.unresolvedStyleMatches).toHaveLength(0);
  expect(reviewed.propertyOwners).toEqual([{ pageId: page.id, componentId: title.id, state: 'normal', property: 'color', owner: 'style', changeKey: 'style' }]);
  expect((await provider.call('prepareUIAdoption', { ...adoption, previewId: reviewed.previewId })).ok).toBe(true);
  const changed = unwrap(await provider.call('saveComposition', { ...composition, proposal }));
  expect(await provider.call('prepareUIAdoption', { ...adoption, expectedCompositionRevision: changed.revision, previewId: reviewed.previewId })).toMatchObject({ ok: false, error: { code: 'UI_PREVIEW_CHANGED' } });
  const conflicting = unwrap(await provider.call('saveComposition', { ...changed, proposal: { ...proposal,
    config: [{ key: 'config', pageId: page.id, componentId: title.id, path: 'normal.color', operation: 'set', value: '#123456', dependsOn: [] }] } }));
  const conflictInput = { id: conflicting.id, revision: conflicting.revision, keys: ['config', 'style'] };
  const conflictPreview = unwrap(await provider.call('previewComposition', conflictInput));
  await expect(provider.call('previewComposition', { ...conflictInput, previewId: conflictPreview.previewId,
    matches: conflictPreview.unresolvedStyleMatches.map(request => ({ ...request, targets: [{ componentId: title.id, state: 'normal' }] })) })).rejects.toThrow('多个修改来源');
});

it('uses the confirmed item baseline for UI compositions after imports and restart while preserving stale preview rejection', async () => {
  const { task, expected } = await generated(true, 'ui'), item = task.items[0], candidateId = item.candidateIds[0];
  const page = template.pages[0], title = components(page.root).find(component => component.part === 'title.workTitle');
  const proposal = { summary: 'Reviewed CSS baseline', config: [], assets: [], styles: [{ key: 'style', name: 'Reviewed theme', styleId: null,
    scope: { pageId: page.id, componentId: null }, language: 'css', source: '[data-gc-part="title.workTitle"] {color:var(--gc-ink)}', dependsOn: [] }] };
  const original = unwrap(await provider.call('saveComposition', { candidateId, proposal, resources: [] }));
  const importItem = task.items[1], importCandidate = importItem.candidateIds[0];
  const imported = unwrap(await provider.call('select', { taskId: task.id, selections: [{ itemId: importItem.id, candidateId: importCandidate }],
    target: 'project', expected, adoptions: { [importCandidate]: { mode: 'library' } } }));
  unwrap(await provider.call('apply', { planId: imported.planId, expected: imported.input.expected }));
  unwrap(await project.save(unwrap(project.planSave({ kind: 'all' })).planId));
  const reopen = async () => {
    await project.dispose('saved'); project = await ProjectSession.open(join(root, 'project'), project.projectId);
    provider.projects.currentSession = project;
  };
  await reopen();
  await expect(provider.call('previewComposition', { id: original.id, revision: original.revision, keys: ['style'] })).rejects.toThrow('页面来源版本已变化');
  const edited = unwrap(await provider.call('editCandidate', { id: candidateId, text: JSON.stringify(proposal) }));
  expect(edited.sourceVersions).toEqual(item.sourceVersions);
  expect(await provider.call('saveComposition', { candidateId: edited.id, proposal, resources: [] })).toMatchObject({ ok: false, error: { code: 'UI_SOURCE_CHANGED' } });
  expect((await provider.call('keepResults', { taskId: task.id, itemId: item.id, versions: expected })).ok).toBe(false);
  const current = unwrap(await provider.call('overview')).versions;
  unwrap(await provider.call('keepResults', { taskId: task.id, itemId: item.id, versions: current }));
  await reopen();
  const confirmed = unwrap(await provider.call('saveComposition', { candidateId: edited.id, proposal, resources: [] }));
  expect(confirmed.baseVersions.map(version => version.ref)).toEqual(item.sourceVersions.map(version => version.ref));
  for (const version of confirmed.baseVersions) {
    expect(version.revision).toBe(current.find(value => value.ref.kind === version.ref.kind && value.ref.id === version.ref.id).revision);
  }
  expect((await provider.current()).service.getCandidate(edited.id).sourceVersions).toEqual(item.sourceVersions);
  const previewInput = { id: confirmed.id, revision: confirmed.revision, keys: ['style'] };
  const preview = unwrap(await provider.call('previewComposition', previewInput));
  const reviewed = unwrap(await provider.call('previewComposition', { ...previewInput, previewId: preview.previewId,
    matches: preview.unresolvedStyleMatches.map(request => ({ ...request, targets: [{ componentId: title.id, state: 'normal' }] })) }));
  const adoption = { compositionId: confirmed.id, expectedCompositionRevision: confirmed.revision, changeKeys: ['style'], assetKeys: [],
    assetAdoptions: [], substitutions: [], expected: current, previewId: reviewed.previewId };
  expect((await provider.call('prepareUIAdoption', adoption)).ok).toBe(true);
  const document = project.readDocument(page.id), before = JSON.parse(document.files[`ui/pages/${page.id}.json`]).data.background.color;
  const pageExpected = [{ ref: { kind: 'document', id: page.id }, revision: document.revision }];
  const changed = unwrap(project.planEdit({ label: 'Concurrent page edit', origin: 'field', expected: pageExpected,
    patches: [{ kind: 'json', documentId: page.id, changes: [{ path: '/data/background/color', before, after: '#345678', op: 'set' }] }],
    preparedAssets: [], requiredRefs: [] }));
  unwrap(project.applyEdit(changed.planId, pageExpected));
  const latest = unwrap(await provider.call('overview')).versions;
  unwrap(await provider.call('keepResults', { taskId: task.id, itemId: item.id, versions: latest }));
  expect(await provider.call('prepareUIAdoption', { ...adoption, expected: latest })).toMatchObject({ ok: false, error: { code: 'UI_PREVIEW_CHANGED' } });
  await expect(provider.call('previewComposition', previewInput)).rejects.toThrow('页面来源版本已变化');
});

it("returns image MIME with a real candidate lease for the renderer", async () => {
  const { task } = await generated();
  const content = unwrap(
    await provider.call("candidateContent", task.items[0].candidateIds[0]),
  );
  expect(content.media[0].mime).toBe("image/svg+xml");
  const first=unwrap(await provider.call('editCandidate',{id:task.items[0].candidateIds[0],text:content.text}));
  const second=unwrap(await provider.call('editCandidate',{id:first.id,text:content.text}));
  expect(first.checks).toEqual([]);expect(second.checks).toEqual([]);expect(second.artifacts.filter(artifact=>artifact.mime==='image/svg+xml')).toHaveLength(1);
});

it("resolves an existing UI reference to PNG without adding files to the asset variant", async () => {
  const { ctx, task, expected } = await generated(true, "ui"),
    candidateId = task.items[0].candidateIds[0];
  const edit = unwrap(
    await provider.call("select", {
      taskId: task.id,
      selections: [{ itemId: task.items[0].id, candidateId }],
      target: "project",
      expected,
    }),
  );
  unwrap(
    await provider.call("apply", {
      planId: edit.planId,
      expected: edit.input.expected,
    }),
  );
  const overview = unwrap(await provider.call("overview")),
    asset = overview.assets[0],
    variant = asset.variants[0];
  const directory = join(root, "project/assets/files", asset.id, variant.id),
    before = await readdir(directory);
  const proposal = {
    summary: "UI bitmap",
    steps: [
      {
        key: "bitmap",
        kind: "raster",
        description: "bitmap",
        dependsOn: [],
        recipe: null,
        instruction: "a blue frame",
        fields: {
          width: 32,
          height: 32,
          count: 1,
          references: [
            { kind: "existing", assetId: asset.id, variantId: variant.id },
          ],
        },
        reuseAssets: [asset.id],
        assetKeys: ["frame"],
      },
    ],
  };
  const draft = {
    activeUse: "ui",
    variants: {
      ui: {
        operation: "uiPlan",
        productionRecipeId: randomUUID(),
        parameterPresetId: randomUUID(),
        parameterOverrides: { width: 4096 },
        target: task.items[0].target,
        fields: {},
        context: [],
        connectionId: overview.connections[0].id,
        recipe: null,
        workflowBindingId: null,
        sourceVersions: overview.versions,
      },
    },
  };
  const plan = unwrap(
    await provider.call("prepareUIPlan", {
      candidateId,
      proposal,
      scope: task.items[0].target.uiScope,
      expected: overview.versions,
      selectedAssets: [asset.id],
      draft,
    }),
  );
  const taskPlan = await ctx.service.store.read(
    ctx.service.store.planPath(plan.taskPlanId),
  );
  expect(taskPlan.task.items[0]).toMatchObject({ operation: "image", purpose: "image", input: { width: 32, height: 32, count: 1 } });
  expect(taskPlan.task.items[0].input.references[0].mime).toBe("image/png");
  expect(taskPlan.task.items[0].input.references[0].localPath).toContain(
    "ui-reference-previews",
  );
  expect(await readdir(directory)).toEqual(before);
  proposal.steps[0].fields.references = [{ localPath: "C:/unconfirmed.png" }];
  const rejected = await provider.call("prepareUIPlan", {
    candidateId,
    proposal,
    scope: task.items[0].target.uiScope,
    expected: overview.versions,
    selectedAssets: [asset.id],
    draft,
  });
  expect(rejected.ok).toBe(false);
  expect(rejected.error.message).toContain("Choose an exact project asset version");
});
