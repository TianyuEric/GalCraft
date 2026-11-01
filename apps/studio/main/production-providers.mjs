import { HttpGenerationAdapter } from '@galcraft/generation-services';
import {migrateConnection} from '@galcraft/generation-services/catalog';
import { workflowSupportsPurpose, workflowOperationDiagnostics } from '@galcraft/generation-services/validation';
import { createId, DiagnosticError, DialogueContentSchema, dialoguePlainText } from '@galcraft/contracts';
import { productionContext } from './production-context.mjs';
import { ProductionMediaImporter } from './production-media-importer.mjs';
import {
  backgroundReferences,
  selectedReferencePatches,
} from "./asset-providers.mjs";
import { parse, createCommandRegistry } from "@galcraft/dsl";

import { isDeepStrictEqual } from "node:util";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IdSchema, AuthoringOutlineSchema } from "@galcraft/contracts";
import {
  ProductionService,
  ProductionOperationCatalog,
  productionSources, createProductionItem, planProductionDraft, reviewProductionCandidates, validateProductionCandidate, prepareCompositionRecord, createUIPlanItem,
  UIProductionService,
  GenerationConnections,
  candidateText,
  prepareSVGCandidate,
  previewScript,
  continueConversation,
  frozenProductionTask, effectiveProductionDefaults,
} from "@galcraft/authoring/production";
import {migrateProductionStores} from './production-migration.mjs';
import { RecipeLibrary } from "@galcraft/authoring/recipes";
import {
  UIAssetAdoptionCoordinator,
  inspectFile,
  rasterizeSVG,
  assetFilePath,
} from "@galcraft/assets";
import {
  readTemplateDocuments,
  compositionClosure,
  prepareComposition,
  styleMatchKey,
} from "@galcraft/templates";
import { fail, ok } from "./result.mjs";
import { validatePluginData } from '@galcraft/plugins/contracts';
import { operationSupportsConnection } from '@galcraft/authoring/production/operations';
import { inspectLocalCommit } from './production-resource-diagnostics.mjs';
import { prepareAuthoringEdit } from '@galcraft/documents/authoring';

const value = (result) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};
const versions = (session) =>
  [...session.documents.values()].map((d) => ({
    ref: { kind: "document", id: d.documentId },
    revision: d.revision,
  }));
const files = async (path) => {
  try {
    return await readdir(path);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
};

/** M10 owns personal drafts and candidates; M02 owns every project change. */
export class StudioProduction {
  constructor({
    userData,
    projects,
    assets,
    connections,
    resources,
    language,
    beforeSend,
    generationProviders,
  }) {
    Object.assign(this, {
      userData,
      projects,
      assets,
      connections,
      resources,
      language,
      generationProviders,
    });
    this.sessions = new WeakMap();
    this.opening = new Set();
    this.activeServices = new Set();
    this.mediaImporters = new Map();
    this.leases = new Map();
    this.adapter = new HttpGenerationAdapter({
      credential: (id) => connections.credential(id),
      beforeSend,
      probe: async (path, mime) => {
        const inspected = value(
          await inspectFile(
            path,
            assets.toolDirectory,
            undefined,
            assets.svgDecoder,
          ),
        );
        return {
          metadata: inspected.metadata,
          hasAlpha: inspected.metadata?.hasAlpha,
          hasTransparency: inspected.metadata?.hasTransparency,
        };
      },
    });
    this.connectionService = new GenerationConnections(userData, this.adapter, async config => {
      const project = this.projects.currentSession;

      const description = config.providerKey ? await this.generationProviders?.describe(config.providerKey, project) : undefined;
      return this.acquireAdapter(config, description, project);
    }, async id => (await this.connections.read(id))?.config ?? null);
  }
  async testConnection(selection) {
    const result = await this.connectionService.testConnection(selection);
    return result.ok ? ok(result.value.report) : result;
  }
  async current() {
    if (this.stopping) throw new Error('制作服务已关闭');
    const project = this.projects.currentSession;
    if (!project) throw new Error("请先打开作品");
    if (!this.sessions.has(project)) {
      const opening = this.open(project, this.projects.currentRoot);
      this.sessions.set(project, opening); this.opening.add(opening);
      opening.then(() => this.opening.delete(opening), () => this.opening.delete(opening));
    }
    const context=await this.sessions.get(project);await context.service.reconcileAdoptions();return context;
  }
  async acquireAdapter(config, snapshot, project = this.projects.currentSession) {
    if (!config.providerKey) return { adapter: this.adapter, release() {} };
    if (!this.generationProviders || !snapshot) throw new Error(`请补齐生成提供者 ${config.providerKey}${snapshot ? `@${snapshot.packageVersion}` : ''}`);
    const lease = await this.generationProviders.acquire(snapshot, project);
    try {
      if (lease.provider.key !== snapshot.providerKey || lease.packageVersion !== snapshot.packageVersion) throw new Error('生成提供者精确版本不匹配');
      const adapter = await lease.provider.create(structuredClone(config), snapshot.runtime), provider = lease.provider;
      const check = (schema, data, requestId) => {
        const result = validatePluginData(schema, data);
        if (!result.ok) throw new Error(`${provider.key}@${snapshot.packageVersion} · ${requestId}: ${result.issues.map(issue => issue.message).join('；')}`);
      };
      const guarded = {
        ...(adapter.validateInput?{validateInput:input=>{check(provider.inputSchema,input,'prepare');return adapter.validateInput(input);}}:{}),
        ...(adapter.freeze ? { freeze: () => adapter.freeze() } : {}),
        inspect: (config, purpose) => adapter.inspect(config, purpose),
        query: (ref, context) => adapter.query(ref, context),
        fetch: async (ref, output, context) => {
          const result = await adapter.fetch(ref, output, context);
          if (result.ok) check(provider.outputSchema, { artifacts: result.value, usage: null }, context.requestId);
          return result;
        },
        cancel: (ref, context) => adapter.cancel(ref, context),
        ...(adapter.inspectResources ? { inspectResources: context => adapter.inspectResources(context) } : {}),
        ...(adapter.releaseResources ? { releaseResources: context => adapter.releaseResources(context) } : {}),
        async *submit(input, context) {
          if (!provider.purposes.includes(input.purpose) && !(provider.protocols?.includes('comfyUI') && context.workflow?.purpose===input.purpose)) throw new Error(`${provider.key} 不支持 ${input.purpose}`);
          check(provider.inputSchema, input, context.requestId);
          for await (const event of adapter.submit(input, context)) {
            if (event.kind === 'output') check(provider.outputSchema, { artifacts: event.artifacts, usage: event.usage }, context.requestId);
            yield event;
          }
        },
      };
      return { adapter: guarded, release: () => lease.release() };
    } catch (error) { await lease.release(); throw error; }
  }
  async freezeProvider(config, input, project = this.projects.currentSession) {
    if (!this.generationProviders) throw new Error(`请补齐生成提供者 ${config.providerKey}`);
    const description = await this.generationProviders.describe(config.providerKey, project);
    const snapshot = { ...description };
    const lease = await this.acquireAdapter(config, snapshot, project);
    try {
      snapshot.capability = await lease.adapter.inspect(structuredClone(config), input.purpose);
      if (snapshot.capability.status === 'unavailable') throw new Error(snapshot.capability.issues.map(issue => issue.message).join('；') || '生成提供者不可用');
      if (lease.adapter.freeze) snapshot.runtime = await lease.adapter.freeze();
      return snapshot;
    } finally { await lease.release(); }
  }
  prepareStop() {
    return this.stopping ??= (async () => {
      await Promise.allSettled([...this.opening]);
      await Promise.all([...this.activeServices].map(service => service.close()));
    })();
  }
  async closeProject(projectId) {
    for (const service of this.activeServices) if (service.store.projectId === projectId) {
      await service.close(); this.activeServices.delete(service);
    }
    for (const [key, leases] of this.leases) { leases.forEach(lease => lease.release()); this.leases.delete(key); }
    await this.mediaImporters.get(projectId)?.close(); this.mediaImporters.delete(projectId);
  }
  async open(project, root) {
    const index = () => {
      const d = [...project.documents.values()].find(
        (d) => d.files["assets/index.json"],
      );
      return {
        ...JSON.parse(d.files["assets/index.json"]),
        revision: d.revision,
      };
    };
    const importer = new ProductionMediaImporter({ root, assets: this.assets, project, index });
    this.mediaImporters.set(project.projectId, importer);
    const adoption = { choices: {}, pending: [], plans: new Map() };
    const migrationIssues=await migrateProductionStores(this.userData,project,await this.generationProviders?.operations?.(project)??[]);
    const service = new ProductionService({
      userData: this.userData,
      project,
      adapter: () => this.adapter,
      freezeProvider: (config, input) => this.freezeProvider(config, input, project),
      acquireAdapter: (config, snapshot) => this.acquireAdapter(config, snapshot, project),
      acquireRecoveryAdapter: async (config,snapshot) => {
        if(config.providerKey==='org.galcraft.voice-comfy/comfy' && snapshot?.packageVersion==='0.1.0') {
          const mapped=migrateConnection(config),identity={...snapshot,providerKey:mapped.providerKey};
          const lease=await this.acquireAdapter(mapped,identity,project),original=lease.adapter;
          return {release:()=>lease.release(),adapter:{...original,query:(ref,ctx)=>original.query(ref,{...ctx,config:mapped}),fetch:(ref,output,ctx)=>original.fetch(ref,output,{...ctx,config:mapped}),cancel:(ref,ctx)=>original.cancel(ref,{...ctx,config:mapped})}};
        }
        return this.acquireAdapter(config,snapshot,project);
      },
      refreshItem: async item => {
        if(item.configSnapshot){const current=await this.connections.read(item.configSnapshot.id);if(!current)throw new Error('原连接已移除，请在制作工作区选择当前连接');item.configSnapshot=current.config;}
        if(item.operationSnapshot?.provider){const operations=await this.generationProviders.operations(project);item.operationSnapshot=new ProductionOperationCatalog(operations.filter(operation=>operation.provider)).resolve(item.operationSnapshot.id);}
        if(item.workflowSnapshot){const current=await service.store.read(join(this.userData,'connections/workflows',`${item.workflowSnapshot.id}.json`));item.workflowSnapshot=current??item.operationSnapshot?.definition.workflow;if(!item.workflowSnapshot)throw new Error('原工作流已移除，请选择当前工作流');}
        return item;
      },
      acquireTextPreparation: (key,version) => { if(!this.generationProviders?.acquireTextPreparation)throw new Error(`文字准备能力缺失 ${key}`);return this.generationProviders.acquireTextPreparation(key,project,version); },
      authorize: (task,item,consume) => this.authorize?.(task,item,consume),
      inspectHostCommit: config => inspectLocalCommit(config.baseUrl),
      resolveOperation: async (id, frozen) => {
        const operations = await this.generationProviders?.operations?.(project);
        return new ProductionOperationCatalog((operations ?? []).filter(operation => operation.provider)).resolve(id, frozen);
      },
      review: (candidates, expected) => reviewProductionCandidates(candidates, expected, {
        projectId: project.projectId,
        choices: adoption.choices,
        findItem: candidate => service.listTasks().find(task => task.id === candidate.taskId)?.items.find(item => item.id === candidate.itemId),
        scriptSource: () => this.scriptCompileInput(project),
        bindingSource: () => this.compileInput(project),
        documents: () => [...project.documents.values()],
        assetNames: () => index().data.assets.map(asset => asset.name),
        prepareAnimations: async inputs => {
          const prepared = value(await importer.prepareAnimations(inputs)), ids = prepared.map(value => value.preparationId); adoption.pending.push(...ids);
          return { edit: value(importer.prepareIndexEdit(ids)), assetIds: prepared.map(value => value.assetId) };
        },
        prepareAuthorDocument: async metadata => {
          if (!this.generationProviders?.prepareAuthorDocument) throw new Error('作者源文档提供方尚未连接');
          const edit = value(await this.generationProviders.prepareAuthorDocument(metadata, project));
          const created = edit.patches.find(patch => patch.kind === 'document' && patch.op === 'create');
          if (!created) throw new Error('作者源文档没有产生新实例');
          return { edit, documentId: created.documentId };
        },
        prepareMedia: async input => {
          const imported = await importer.importBatch(input);
          adoption.pending.push(...imported.flatMap(item => item.result.ok ? [item.result.value.preparationId] : []));
          const edit = value(importer.prepareIndexEdit(imported.map(item => value(item.result).preparationId)));
          return { edit, assetIds: imported.map(item => value(item.result).assetId) };
        },
      }),
      prepareReference: async (media) => {
        if (media.mime !== "image/svg+xml") return media;
        const previewRoot = join(this.userData, "ui-reference-previews");
        await mkdir(previewRoot, { recursive: true });
        const localPath = join(
          previewRoot,
          `${media.assetId ?? media.candidateId}-${media.variantId ?? media.artifactIndex}.png`,
        );
        await writeFile(
          localPath,
          value(await rasterizeSVG(await readFile(media.localPath, "utf8"))),
        );
        return { ...media, localPath, mime: "image/png" };
      },
      validateCandidate: (candidate, item) => validateProductionCandidate(candidate, item, {
        scriptSource: () => this.scriptCompileInput(project),
        versions: () => versions(project),
        documents: () => [...project.documents.values()],
        validateAsset: (id, variantId) => index().data.assets.some(asset => asset.id === id && (!variantId || asset.variants.some(variant => variant.id === variantId))),
        prepareSVG: candidate => prepareSVGCandidate(candidate,
          service.store.candidatePath(candidate.taskId, candidate.itemId, candidate.id), this.assets.svgDecoder),
      }),
    });
    await service.open();
    this.activeServices.add(service);
    const uiAssets = new UIAssetAdoptionCoordinator(
      root,
      this.assets.toolDirectory,
      index,
      (id) => this.assets.referenceRecords ? this.assets.referenceRecords(project, id) : backgroundReferences(project, id),
      () => versions(project),
      this.assets.svgDecoder,
    );
    const ui = new UIProductionService(
      service,
      uiAssets,
      (id, variant) => {
        const asset = index().data.assets.find((a) => a.id === id);
        return asset &&
          (!variant || asset.variants.some((v) => v.id === variant))
          ? { active: !variant || asset.activeVariantId === variant }
          : null;
      },
      async (prepared) => {
        const patches = selectedReferencePatches(
          project,
          prepared.replacementRefs,
          prepared.replacementRefs.map(() => ({
            after: { assetId: prepared.assetId, variantId: prepared.variantId },
          })),
        );
        if (!patches.ok) return patches;
        return ok({
          label: "采用 UI 素材版本",
          origin: "candidate",
          patches: patches.value,
          expected: prepared.expected,
          preparedAssets: [prepared.assetId],
          requiredRefs: prepared.requiredRefs,
        });
      },
    );
    return {
      project,
      root,
      migrationIssues,
      index,
      service,
      ui,
      importer,
      adoption,
      previewReviews: new Map(),
      recipes: await RecipeLibrary.open(this.userData, project, undefined, async () =>
        await this.generationProviders?.operations?.(project) ?? []),
    };
  }
  scriptCompileInput(project) {
    const current = this.compileInput(project);
    if (!current.lock?.plugins.length) return current;
    const compiled = this.language?.currentInput(project.projectId);
    if (
      !compiled ||
      !isDeepStrictEqual(compiled.lock, current.lock) ||
      !isDeepStrictEqual(
        compiled.pluginDocuments ?? {},
        current.pluginDocuments,
      )
    )
      throw new Error("The plugin compilation context is not ready. Refresh the project preview and try again.");
    return {
      ...current,
      pluginCommands: compiled.pluginCommands,
      pluginConditions: compiled.pluginConditions,
    };
  }
  compileInput(project, overview = false) {
    const documents = [...project.documents.values()],
      data = (path) => {
        const d = documents.find((d) => d.files[path]);
        return d ? JSON.parse(d.files[path]).data : null;
      };
    const projectData = data("project.json");
    const entities = (prefix) =>
      documents.flatMap((d) =>
        Object.entries(d.files)
          .filter(([p]) => p.startsWith(prefix) && p.endsWith(".json"))
          .map(([, raw]) => JSON.parse(raw).data),
      );
    const scenes = entities("scenes/");
    return {
      projectId: project.projectId,
      engineVersion: projectData.engineVersion,
      project: projectData,
      lock: data("dependencies.lock.json"),
      pluginDocuments: Object.fromEntries(
        (data("dependencies.lock.json")?.plugins ?? []).flatMap((plugin) => {
          const config = data(`plugins/${plugin.id}/documents/config.json`);
          return config === null ? [] : [[plugin.id, config]];
        }),
      ),
      scenes,
      documents: documents
        .filter((d) => d.format === "dsl")
        .flatMap((d) => {
          const script = Object.entries(d.files).find(([p]) => p.endsWith('/script.gal'));
          const scenePath = script?.[0].replace(/script\.gal$/, 'scene.json');
          const scene = scenePath ? data(scenePath) : null;
          if (!script || !scene) { if (overview) return []; throw new Error('场景脚本缺少对应的场景信息，请在创作页检查并保存该场景'); }
          return ({
          documentId: d.documentId,
          revision: d.revision,
          kind: "scene",
          sceneId: scene.id,
          text: script[1],
        }); }),
      characters: entities("characters/"),
      variables: entities("variables/"),
      gallery: entities("gallery/"),
      flows: entities("flows/"),
      debugScenarios: documents.flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('authoring/debug/') && path.endsWith('.json'))
        .map(([, raw]) => ({ documentId: document.documentId, revision: document.revision, data: JSON.parse(raw).data }))),
      assets: data("assets/index.json").assets,
      template: readTemplateDocuments(documents),
      cancelOperationId: createId(),
    };
  }
  planningPorts(ctx) {
    return {
      readConnection: id => this.connections.read(id),
      resolveMedia: async assetId => value(await this.call('mediaInput', { assetId })),
      context: target => this.contextParts(ctx, target),
      listConnections: () => this.connections.list(),
      readWorkflow: id => ctx.service.store.read(join(this.userData, 'connections/workflows', `${IdSchema.parse(id)}.json`)),
      recipes: ctx.recipes,
      source: () => this.scriptCompileInput(ctx.project),
      sources: (variant, source) => productionSources([...ctx.project.documents.values()], variant, source),
      freezeProvider: (config, purpose) => this.freezeProvider(config, { purpose }, ctx.project),
      acquireTextPreparation: (key,version) => { if(!this.generationProviders?.acquireTextPreparation)throw new Error(`文字准备能力缺失 ${key}`);return this.generationProviders.acquireTextPreparation(key,ctx.project,version); },
      authorize: (task,item,consume) => this.authorize?.(task,item,consume),
      resolveOperation: async (id, frozen) => {
        const operations = await this.generationProviders?.operations?.(ctx.project);
        return new ProductionOperationCatalog((operations ?? []).filter(operation => operation.provider)).resolve(id, frozen);
      },
    };
  }
  productionSources(ctx, variant, source = this.scriptCompileInput(ctx.project)) {
    return productionSources([...ctx.project.documents.values()], variant, source);
  }
  createItem(ctx, draft, variant, purposeOverride) {
    return createProductionItem(this.planningPorts(ctx), draft, variant, purposeOverride);
  }
  async contextParts(ctx, input) {
    const parts = productionContext(ctx.project, this.scriptCompileInput(ctx.project), input);
    for (const part of parts) if (part.media?.assetId) {
      if (this.projects.currentSession !== ctx.project) throw new Error('The project changed while reading character references. Reopen the current production draft.');
      part.media = value(await this.call('mediaInput', { assetId: part.media.assetId, variantId: part.media.variantId }));
      if (['image/png', 'image/jpeg', 'image/webp'].includes(part.media.mime)) part.attachment = { ...value(await this.call('attachment', part.media.localPath)), source: part.source };
      else if (input.usage === 'script') throw new Error(`The selected character image ${part.label} is not supported as a text attachment (${part.media.mime}). Use PNG, JPEG or WebP, or override the context.`);
    }
    if (this.projects.currentSession !== ctx.project) throw new Error('The project changed while reading character references. Reopen the current production draft.');
    return parts;
  }
  async prepareComfyMatting(request,choice,collaboration,signal) {
    try {
      const ctx=await this.current(),config=(await this.connections.read(choice.connectionId))?.config;
      if(!config||config.protocol!=='comfyUI')throw new Error('请连接ComfyUI抠图服务');
      const workflow=await ctx.service.store.read(join(this.userData,'connections/workflows',`${IdSchema.parse(choice.workflowBindingId)}.json`));
      if(!workflow||!workflowSupportsPurpose(workflow,'matting'))throw new Error('缺少已保存的抠图用途工作流');
      const input={purpose:'matting',reference:{assetId:null,variantId:null,candidateId:null,artifactIndex:null,localPath:request.inputPath,mime:'image/png'}};
      const item={id:createId(),purpose:'matting',target:{sceneId:null,statementId:null,characterId:null,locale:null,usage:'figure',uiScope:null},backgroundRemoval:null,backgroundPreview:null,dependencies:[],input,sourceVersions:[],
        configSnapshot:{...config,purposes:[...new Set([...config.purposes,'matting'])]},workflowSnapshot:workflow,recipeSnapshot:null,state:'draft',remote:null,progress:{phase:'',completed:null,total:null},attempts:[],candidateIds:[],selectedCandidateId:null,needsReview:false,issues:[]};
      const plan=value(await ctx.service.planTask({projectId:ctx.project.projectId,name:'ComfyUI抠图',context:[],items:[item],policy:'waitForSelection',selectionRule:null,stagePolicy:collaboration?'external':'interactive',collaboration}));
      const task=value(await ctx.service.submit(plan.planId));const abort=()=>{void ctx.service.cancel(task.id);};signal?.addEventListener('abort',abort,{once:true});
      try {await ctx.service.drain();const finished=ctx.service.listTasks().find(current=>current.id===task.id).items[0];const candidate=ctx.service.getCandidate(finished.candidateIds.at(-1));
        if(!candidate||candidate.partial||candidate.checks.some(issue=>issue.severity==='error'))throw new Error(finished.issues.map(issue=>issue.message).join('；')||'抠图没有完整可用的候选');
        const image=candidate.artifacts.find(artifact=>artifact.kind==='image'&&artifact.role==='primary'),mask=candidate.artifacts.find(artifact=>artifact.role==='mask');
        if(!image)throw new Error('抠图输出缺少主图');return ok({imagePath:image.localPath,maskPath:mask?.localPath??null,width:image.metadata.width,height:image.metadata.height,result:image.background,provider:'comfy',providerVersion:finished.providerSnapshot?.packageVersion??'0.1.0',modelVersion:null});
      } finally {signal?.removeEventListener('abort',abort);}
    } catch(error){return fail('COMFY_MATTING',error.message,'M10');}
  }
  async prepareOperation(input, collaboration) {
    const ctx=await this.current(), usage=input.usage??'script';
    const chosen={};
    for(const key of ['recipe','productionRecipe','parameterPreset'])if(input[key]){
      const selected=input[key],recipe=await ctx.recipes.getRecipe(selected.id,selected.scope);
      if(!recipe||recipe.revision!==selected.revision)throw new Error('The selected recipe revision changed. Read the recipe catalog and prepare a new plan.');
      if(!recipe.uses.includes(usage))throw new Error('The selected recipe does not support this usage.');
      if(key==='recipe'&&(recipe.production||recipe.parameterPreset||!recipe.purposes.includes(selected.purpose)||selected.purpose!==input.operation))throw new Error('Choose a text recipe for this exact operation and purpose.');
      if(key==='productionRecipe'&&(!recipe.production||recipe.production.operation!==input.operation))throw new Error('Choose a production recipe for this exact operation.');
      if(key==='parameterPreset'&&!recipe.parameterPreset)throw new Error('Choose an actual parameter preset.');
      chosen[key]=recipe;
    }
    const target={sceneId:null,statementId:null,characterId:null,locale:null,uiScope:null,usage,...input.target};
    const variant={operation:input.operation,target,fields:input.fields??{},explicitFields:Object.keys(input.fields??{}),context:input.context??[],connectionId:input.connectionId,workflowBindingId:input.workflowId??null,model:input.model??null,
      recipe:input.recipe?{recipeId:input.recipe.id,scope:input.recipe.scope,purpose:input.recipe.purpose,usage,parameterValues:input.recipe.parameterValues}:null,productionRecipeId:input.productionRecipe?.id??null,parameterPresetId:input.parameterPreset?.id??null,parameterOverrides:input.parameterOverrides??{},promptPreparation:null,backgroundRemoval:null,backgroundPreview:null,sourceVersions:[]};
    const draft={schemaVersion:1,id:createId(),projectId:ctx.project.projectId,revision:1,activeUse:usage,variants:{[usage]:variant},updatedAt:new Date().toISOString(),submittedTaskId:null};
    const item=await this.createItem(ctx,draft,variant);
    if(input.sourceVersions) {
      const versions = new Map(item.sourceVersions.map(version => [version.ref.id, version]));
      for (const version of input.sourceVersions) {
        const actual = versions.get(version.ref.id);
        if (actual && actual.revision !== version.revision) throw new Error('The selected source version differs from the formal reference input. Read the source and prepare again.');
        versions.set(version.ref.id, structuredClone(version));
      }
      item.sourceVersions = [...versions.values()];
    }
    for(const [key,recipe]of Object.entries(chosen)){
      const frozen=key==='recipe'?item.recipeSnapshot?.recipe:key==='productionRecipe'?item.productionSnapshot:item.parameterPresetSnapshot;
      if(!frozen||frozen.id!==recipe.id||frozen.scope!==recipe.scope||frozen.revision!==recipe.revision)throw new Error('The selected recipe changed during preparation. Prepare a new plan.');
      if(recipe.scope==='project'&&!item.sourceVersions.some(value=>value.ref.kind==='document'&&value.ref.id===recipe.id))item.sourceVersions.push({ref:{kind:'document',id:recipe.id},revision:recipe.revision});
    }
    return ctx.service.planTask({projectId:ctx.project.projectId,name:input.name??'制作',context:variant.context,items:[item],policy:'waitForSelection',selectionRule:null,
      stagePolicy:collaboration?'external':'interactive',collaboration,externalCallId:collaboration?`${collaboration.sessionId}-${collaboration.callId}`:undefined});
  }
  async inspectOperationConnection(input) {
    const project=this.projects.currentSession,operation=new ProductionOperationCatalog((await this.generationProviders.operations(project)).filter(operation=>operation.provider)).resolve(input.operation);
    const stored=await this.connections.read(input.connectionId);if(!stored)return fail('CONNECTION_MISSING','Select an existing connection.','M10');
    const config=structuredClone(stored.config),purpose=operation.definition.purpose;
    if(!operationSupportsConnection(operation,config,purpose))return fail('PURPOSE_UNSUPPORTED','The selected connection does not support this operation.','M10');
    config.purposes=[...new Set([...config.purposes,purpose])];
    let workflow=operation.definition.workflow??null;
    if(input.workflowId){
      const saved=await readFile(join(this.userData,'connections/workflows',`${IdSchema.parse(input.workflowId)}.json`),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      workflow=saved??(workflow?.id===input.workflowId?workflow:null);
    }
    config.workflowBindingId=workflow?.id??null;
    const description=config.providerKey?await this.generationProviders.describe(config.providerKey,project):null,lease=await this.acquireAdapter(config,description,project);
    let report;try{report=await lease.adapter.inspect(config,purpose);}finally{await lease.release();}
    let mapping=ok(undefined);
    if(config.protocol==='comfyUI')mapping=!workflow?fail('WORKFLOW_MISSING','Select a saved workflow or an operation template.','M10'):!workflowSupportsPurpose(workflow,purpose,input.usage)?fail('WORKFLOW_PURPOSE','The workflow does not support the selected purpose or image use.','M10'):await this.adapter.checkWorkflow(config,workflow);
    return ok({connection:{id:config.id,name:config.name,revision:config.revision},workflow:workflow?{id:workflow.id,revision:workflow.revision}:null,reachable:report.status==='unavailable'?'failed':'passed',mapping:mapping.ok?'passed':'failed',checkedAt:report.checkedAt,capabilities:report,issues:[...report.issues,...(mapping.ok?[]:mapping.issues)],trial:'notRun'});
  }
  async call(method, input) {
    const ctx = await this.current(),
      { service, project, recipes, ui } = ctx;
    switch (method) {
      case 'readDraft': return service.loadFormDraft(input.draftId);
      case 'listDrafts': {
        const drafts = [];
        for (const file of await files(join(this.userData, 'task-drafts', project.projectId))) if (file.endsWith('.json')) {
          const draft = value(await service.loadFormDraft(file.slice(0, -5))); if (draft) drafts.push(draft);
        }
        return ok(drafts);
      }
      case 'frozen': {
        const task = service.listTasks().find(task => task.id === input.taskId);
        if (!task) return fail('TASK_MISSING', 'The production task does not exist in the current project.', 'M10');
        return ok(frozenProductionTask(task, input.itemId, task.items.flatMap(item => item.candidateIds.map(id => service.getCandidate(id))).filter(Boolean)));
      }
      case 'defaults': {
        const workflows = [];
        for (const file of await files(join(this.userData, 'connections/workflows'))) if (file.endsWith('.json')) workflows.push(await service.store.read(join(this.userData, 'connections/workflows', file)));
        return ok(effectiveProductionDefaults({ ...input, connections: await this.connections.list(), workflows: workflows.filter(Boolean), recipes: await recipes.listRecipes(),
          imageRoutes: await service.store.read(join(this.userData, 'connections/image-routes.json')) ?? {},
          defaults: await service.store.read(join(this.userData, 'connections/usage-defaults.json')) ?? {} }));
      }
      case 'planOperation': return this.prepareOperation(input);
      case 'authorizeStage': return service.authorizeStage(input.taskId,input.itemId);
      case 'reprocess': return service.reprocess(input.taskId,input.itemId,input.text,input.candidateId);
      case 'planTask':
        return service.planTask({ ...input, projectId: project.projectId });
      case 'tasks':
        return ok(service.listTasks());
      case 'queryRemote':
        return service.queryRemote(input.taskId, input.itemId);
      case 'waitForTask': return service.waitForTask(input.taskId, { timeoutMs: input.timeoutMs, signal: input.signal });
      case 'inspectTaskResources': return service.inspectTaskResources(input.taskId, input.itemId);
      case 'releaseTaskResources': return service.releaseTaskResources(input.taskId, input.itemId);
      case 'refetch':
        return service.refetch(input.taskId, input.itemId);
      case 'candidate':
        return ok(service.getCandidate(typeof input === 'string' ? input : input.candidateId));
      case 'connections':
        return ok(await this.connections.list());
      case 'providers': {
        const warnings = [], providers = await this.generationProviders?.list?.(project, { onIssue: issue => warnings.push(issue) }) ?? [];
        return { ...ok(providers), warnings };
      }
      case 'connectionCapabilities': {
        const config = (await this.connections.read(input.connectionId))?.config;
        if (!config) return fail('CONNECTION_MISSING', '服务待连接', 'M10');
        if (!config.providerKey) return ok(await this.adapter.inspect(config, input.purpose));
        return ok(await this.freezeProvider(config, { purpose: input.purpose }, project));
      }
      case 'saveDefaults': {
        const connections = await this.connections.list();
        for (const [purpose, id] of Object.entries(input.connections ?? {})) {
          if (!['text', 'speech', 'music', 'difference', 'matting'].includes(purpose) || !connections.some(connection => connection.id === id && connection.purposes.includes(purpose))) throw new Error('默认连接与用途不匹配');
        }
        await service.store.write(join(this.userData, 'connections/usage-defaults.json'), input);
        return ok(input);
      }
      case 'removeConnection': {
        for (const active of this.activeServices) if (active.listTasks().some(task => task.items.some(item => item.configSnapshot?.id === input && ['queued', 'blocked', 'submitting', 'running', 'fetching'].includes(item.state))))
          return fail('CONNECTION_ACTIVE', '请先完成或取消使用此连接的制作任务，再删除连接');
        await this.connections.remove(input);
        for (const name of ['image-routes.json', 'usage-defaults.json']) {
          const path = join(this.userData, 'connections', name), stored = await service.store.read(path);
          if (!stored) continue;
          if (name === 'image-routes.json') { for (const [usage, route] of Object.entries(stored)) if (route.connectionId === input) delete stored[usage]; }
          else { for (const [purpose, id] of Object.entries(stored.connections ?? {})) if (id === input) delete stored.connections[purpose]; }
          await service.store.write(path, stored);
        }
        for (const projectId of await files(join(this.userData, 'task-drafts'))) for (const file of await files(join(this.userData, 'task-drafts', projectId))) {
          if (!file.endsWith('.json')) continue;
          const path = join(this.userData, 'task-drafts', projectId, file), draft = await service.store.read(path);
          if (!draft || draft.submittedTaskId) continue;
          let changed = false;
          for (const variant of Object.values(draft.variants)) {
            if (variant.connectionId === input) { variant.connectionId = null; changed = true; }
            if (variant.fields.promptConnectionId === input) { variant.fields.promptConnectionId = null; changed = true; }
          }
          if (changed) { draft.revision++; await service.store.write(path, draft); }
        }
        return ok(undefined);
      }
      case 'planContinuation': {
        const task = service.listTasks().find(task => task.id === input.taskId), candidate = service.getCandidate(input.candidateId);
        const original = task?.items.find(item => item.id === candidate?.itemId);
        if (!task || !candidate || !original || candidate.taskId !== task.id) throw new Error('请选择当前任务的完整文字候选');
        if (task.items.some(item => ['queued', 'blocked', 'submitting', 'running', 'fetching'].includes(item.state))) throw new Error('请等待当前轮完成后继续');
        const text = await candidateText(candidate);
        const item = continueConversation(original, candidate, text, input);
        const connection = await this.connections.read(item.configSnapshot.id);
        if (!connection) throw new Error('原连接已删除，请为新制作选择连接');
        item.configSnapshot = { ...connection.config, model: original.configSnapshot.model };
        if (candidate.adoption.length) {
          const current = this.scriptCompileInput(project), document = current.documents.find(document => document.sceneId === item.target.sceneId);
          if (!document) throw new Error('目标场景不存在');
          const present = new Map(parse(document).cst.filter(node => node.id).map(node => [node.id, node]));
          const originalNodes = parse({ documentId: document.documentId, revision: document.revision, text }).cst.filter(node => node.id);
          if (originalNodes.some(node => !present.has(node.id) || present.get(node.id).command !== node.command || !isDeepStrictEqual(present.get(node.id).object?.value, node.object?.value))) throw new Error('已采用剧情已在编辑器中修改，请从当前场景新建制作以带入最新内容');
          const adopted = originalNodes.map(node => node.id);
          if (!adopted.length) throw new Error('已采用内容的位置发生变化，请从当前场景新建制作');
          item.target.replaceStatementIds = adopted;
          item.sourceVersions = versions(project);
        }
        const collaboration = input.collaboration;
        const plan = await service.planTask({ projectId: project.projectId, name: task.name, context: task.context, items: [item], policy: 'waitForSelection', selectionRule: null, expected: item.sourceVersions,
          stagePolicy: collaboration ? 'external' : 'interactive', collaboration, previousTaskId: task.id, previousItemId: original.id });
        return plan.ok ? ok({ ...plan.value, continuationTaskId: task.id }) : plan;
      }
      case 'submitContinuation': {
        const result = await service.submitContinuation(input.planId, input.taskId, input.collaboration);
        if (result.ok) void service.drain().catch(() => {});
        return result;
      }
      case 'readOutline': {
        const document = [...project.documents.values()].find(d => d.files['authoring/outline.json']);
        const current = this.compileInput(project, true);
        return ok({ documentId: document?.documentId ?? null, revision: document?.revision ?? null,
          outline: document ? AuthoringOutlineSchema.parse(JSON.parse(document.files['authoring/outline.json']).data) : { setting: '', style: '', audienceNotes: '', characters: current.characters.map(character => ({ characterId: character.id, description: character.description, goal: '' })), chapters: current.project.chapters.map(chapter => ({ chapterId: chapter.id, summary: '', scenes: chapter.sceneIds.map(sceneId => ({ sceneId, summary: '', branchGoals: [], productionItemIds: [] })) })) } });
      }
      case 'saveOutline': {
        const document = [...project.documents.values()].find(d => d.files['authoring/outline.json']);
        if ((document?.revision ?? null) !== input.expectedRevision) return fail('OUTLINE_CONFLICT', '作品大纲已变化，请重新打开');
        const prepared = prepareAuthoringEdit([...project.documents.values()], { op: 'outline.set', outline: input.outline });
        if (!prepared.ok) return prepared;
        const edit = prepared.value;
        const planned = project.planEdit(edit);
        if (!planned.ok) return planned;
        return project.applyEdit(planned.value.planId, edit.expected);
      }
      case 'saveImageRoutes': {
        const routes = input;
        for (const [usage, route] of Object.entries(routes)) {
          if (!['background', 'figure', 'cg', 'ui'].includes(usage) || !route || typeof route.model !== 'string') throw new Error('图像默认用途配置无效');
          const connection = (await this.connections.list()).find(config => config.id === IdSchema.parse(route.connectionId));
          if (!connection?.purposes.includes('image')) throw new Error('图像默认连接不支持图像生成');
          if (connection.protocol === 'comfyUI') {
            const binding = route.workflowBindingId && await service.store.read(join(this.userData, 'connections/workflows', `${IdSchema.parse(route.workflowBindingId)}.json`));
            if (!binding || !workflowSupportsPurpose(binding, 'image', usage)) throw new Error('默认工作流与图像用途不匹配');
          }
        }
        await service.store.write(join(this.userData, 'connections/image-routes.json'), routes);
        return ok(routes);
      }
      case "overview": {
        const warnings = [], catalogOptions = { onIssue: issue => warnings.push(issue) };
        const taskSummaries = input ? service.listTaskSummaries() : undefined;
        const selectedTask = input ? service.getTask(input.taskId ?? taskSummaries.at(-1)?.id) : null;
        const tasks = input ? (selectedTask ? [selectedTask] : []) : service.listTasks(),
          drafts = [];
        for (const file of await files(
          join(this.userData, "task-drafts", project.projectId),
        ))
          if (file.endsWith(".json"))
            drafts.push(value(await service.loadFormDraft(file.slice(0, -5))));
        const candidates = tasks.flatMap((t) =>
          t.items.flatMap((i) =>
            i.candidateIds.map((id) => ({
              candidate: service.getCandidate(id),
              adoption: service.adoptionState(id),
            })),
          ),
        );
        const workflows = [];
        for (const file of await files(
          join(this.userData, "connections/workflows"),
        ))
          if (file.endsWith(".json"))
            workflows.push(
              await service.store.read(
                join(this.userData, "connections/workflows", file),
              ),
            );
        const current = this.compileInput(project, true);
        return { ...ok({
          migrationIssues: ctx.migrationIssues,
          tasks,
          ...(input ? { taskSummaries, imageCandidates: service.listImageCandidates() } : {}),
          candidates,
          drafts,
          scenes: current.documents.map((d) => ({
            id: d.sceneId,
            documentId: d.documentId, revision: d.revision,
            name:
              current.scenes.find((s) => s.id === d.sceneId)
                ?.name ?? d.sceneId,
            statements: parse(d)
              .cst.filter((n) => n.id)
              .map((n) => ({
                id: n.id,
                command: n.command,
                label: n.command === 'say' ? dialoguePlainText(DialogueContentSchema.safeParse(n.object?.value?.text).data ?? '') : String(n.object?.value?.text ?? n.command),
                characterId: n.object?.value?.speaker?.kind === 'character' ? n.object.value.speaker.id : null,
                silent: n.object?.value?.speaker?.kind === 'character' && current.characters.find(character => character.id === n.object.value.speaker.id)?.defaultVoicing === 'intentionalSilent',
              })),
          })),
          canvas: current.project.canvas,
          pages: current.template.pages.map((p) => ({
            id: p.id,
            documentId: p.id, revision: project.readDocument(p.id)?.revision,
            key: p.key,
            labels: Object.fromEntries(Object.entries(current.template.locales).map(([locale, messages]) => [locale, messages[p.titleKey] ?? p.key])),
          })),
          characters: current.characters.map((c) => ({
            id: c.id,
            voicePresets: c.voicePresets,
            name: c.name,
          })),
          assets: ctx.index().data.assets,
          recipes: await recipes.listRecipes(),
          connections: await this.connections.list(),
          providers: await this.generationProviders?.list?.(project, catalogOptions) ?? [],
          operations: await this.generationProviders?.operations?.(project, catalogOptions) ?? new ProductionOperationCatalog().list(),
          workflows,
          workflowDrafts: value(await this.connectionService.listWorkflowDrafts()),
          imageRoutes: await service.store.read(join(this.userData, 'connections/image-routes.json')) ?? {},
          defaults: await service.store.read(join(this.userData, 'connections/usage-defaults.json')) ?? { connections: {}, recipes: {} },
          versions: versions(project),
          projectVersion: versions(project).find(version => project.readDocument(version.ref.id)?.files['project.json']),
          assetsVersion: versions(project).find(version => project.readDocument(version.ref.id)?.files['assets/index.json']),
        }), warnings };
      }
      case "mediaInput": {
        const asset = ctx
            .index()
            .data.assets.find((a) => a.id === input.assetId),
          variant = asset?.variants.find(
            (v) => v.id === (input.variantId ?? asset.activeVariantId),
          );
        if (!variant) throw new Error("参考素材不存在");
        const file = variant.files.find((f) => f.path === variant.entry);
        return ok({
          assetId: asset.id,
          variantId: variant.id,
          candidateId: null,
          artifactIndex: null,
          kind: asset.kind, typeVersion: variant.typeData?.typeVersion ?? 1,
          localPath: join(
            ctx.root,
            ...assetFilePath(asset.id, variant.id, variant.entry).split("/"),
          ),
          mime: file.mime,
        });
      }
      case "attachment": {
        const inspected = value(
          await inspectFile(
            input,
            this.assets.toolDirectory,
            undefined,
            this.assets.svgDecoder,
          ),
        );
        if (!["image/png", "image/jpeg", "image/webp"].includes(inspected.mime))
          throw new Error("文字模型附件支持 PNG、JPEG、WebP");
        const { stat } = await import("node:fs/promises");
        const file = await stat(input);
        return ok({
          id: createId(),
          localPath: input,
          mime: inspected.mime,
          bytes: file.size,
          width: inspected.metadata.width,
          height: inspected.metadata.height,
          source: null,
        });
      }
      case "context": return ok(await this.contextParts(ctx, input));
      case "saveDraft":
        return service.saveFormDraft(input.draft, input.expectedRevision);
      case "discardDraft":
        return service.discardFormDraft(input);
      case "removeTaskRecord":
        return service.removeTaskRecord(input);
      case "plan": {
        if (Array.isArray(input.items)) {
          const proposed = structuredClone(input);
          for (const item of proposed.items) if (item.configSnapshot) {
            const current = await this.connections.read(item.configSnapshot.id);
            if (!current || current.config.revision !== item.configSnapshot.revision) throw new Error('执行连接已变化，请重新选择连接');
            item.configSnapshot = { ...current.config, model: item.configSnapshot.model };
          }
          return service.planTask(proposed);
        }
        const draft = value(await service.loadFormDraft(input.draftId));
        if (!draft) throw new Error('制作草稿不存在');
        const planned = await planProductionDraft(this.planningPorts(ctx), draft, input.name);
        return service.planTask({ ...planned, stagePolicy: input.collaboration ? 'external' : 'interactive', collaboration: input.collaboration,
          externalCallId: input.collaboration ? `${input.collaboration.sessionId}-${input.collaboration.callId}` : undefined });
      }
      case "submit": {
        const planId=typeof input==='string'?input:input.planId;
        const plan = await service.store.read(service.store.planPath(planId));
        if (plan && !service.listTasks().some(task => task.id === plan.task.id || task.sourceDraftId && task.sourceDraftId === plan.task.sourceDraftId)) for (const item of plan.task.items) {
          if (item.configSnapshot) {
            const current = await this.connections.read(item.configSnapshot.id);
            if (!current || current.config.revision !== item.configSnapshot.revision) throw new Error('执行连接已变化，请重新检查发送计划');
          }
          for (const frozen of [item.productionSnapshot ?? item.recipeSnapshot?.recipe, item.parameterPresetSnapshot].filter(Boolean)) { const current = await recipes.getRecipe(frozen.id, frozen.scope); if (!current || current.revision !== frozen.revision) throw new Error('制作方案或提示规则已变化，请重新检查发送计划'); }
        }
        const result = await service.submit(planId,typeof input==='string'?undefined:input.collaboration);
        if (result.ok) void service.drain().catch(() => {});
        return result;
      }
      case "resume":
        return typeof input === 'string' ? service.resume(input) : service.resume(input.taskId, input.collaboration);
      case "retry": return service.retryItem(input.taskId,input.itemId,input.confirmNewRequest);
      case "cancel":
        return service.cancel(input);
      case "select": {
        ctx.adoption.choices = input.adoptions ?? {};
        ctx.adoption.pending = [];
        try {
          const result = await service.selectCandidates(input);
          if (result.ok && "planId" in result.value) {
            ctx.adoption.plans.set(result.value.planId, ctx.adoption.pending);
            ctx.adoption.pending = [];
          }
          if (result.ok && input.target === "taskOnly")
            void service.drain().catch(() => {});
          return result;
        } finally {
          for (const id of ctx.adoption.pending) await ctx.importer.discard(id);
          ctx.adoption.pending = [];
        }
      }
      case "discardAdoption": {
        await ui.finishAdoption(input, false);
        for (const id of ctx.adoption.plans.get(input) ?? [])
          await ctx.importer.discard(id);
        ctx.adoption.plans.delete(input);
        return ok(undefined);
      }
      case "apply": {
        const prepared = ctx.adoption.plans.get(input.planId) ?? [];
        const result = await service.applyAdoption(
            input.planId,
            input.expected,
            input.collaboration,
            async () => { await ctx.importer.confirm(prepared); await ui.finishAdoption(input.planId, true); },
          );
        if (!result.ok) { await ui.finishAdoption(input.planId, false); for (const id of prepared) await ctx.importer.discard(id); }
        ctx.adoption.plans.delete(input.planId);
        return result;
      }
      case "keepResults":
        return service.keepResults(input.taskId, input.itemId, input.versions);
      case "editCandidate":
        return service.editCandidate(input.id, input.text);
      case "transferPrompt":
        return service.applyPromptTransfer(input);
      case 'previewScript': {
        const candidate = service.getCandidate(input);
        if (!candidate) throw new Error('候选不存在');
        const item = service.listTasks().find(task => task.id === candidate.taskId)?.items.find(item => item.id === candidate.itemId);
        if (!item || item.target.usage !== 'script') throw new Error('此候选不是场景脚本');
        const current = this.scriptCompileInput(project), document = current.documents.find(document => document.sceneId === item.target.sceneId);
        if (!document) throw new Error('目标场景不存在');
        return previewScript({ candidate, current, documentId: document.documentId, beforeStatementId: item.target.statementId, replaceStatementIds: item.target.replaceStatementIds ?? [], bindings: {}, expected: versions(project) });
      }
      case "candidateContent": {
        const candidate = service.getCandidate(input);
        if (!candidate) throw new Error("候选不存在");
        const key = `${project.projectId}/${input}`;
        for (const lease of this.leases.get(key) ?? []) lease.release();
        const media = candidate.artifacts.filter((a) => a.kind !== "text");
        const leases = media.map((a, i) =>
          this.resources.register({
            projectId: project.projectId,
            assetId: candidate.id,
            variantId: candidate.itemId,
            relative: `${i}`,
            path: a.localPath,
            mime: a.mime,
          }),
        );
        this.leases.set(key, leases);
        return ok({
          text:
            candidate.editedText ??
            (candidate.artifacts.some((a) => a.kind === "text")
              ? await candidateText(candidate)
              : service.listTasks().find(task=>task.id===candidate.taskId)?.items.find(item=>item.id===candidate.itemId)?.rawOutput??""),
          media: leases.map((l, i) => ({ uri: l.uri, mime: media[i].mime })),
        });
      }
      case "assetReferences":
        return ok(this.assets.referenceRecords ? await this.assets.referenceRecords(project, input) : backgroundReferences(project, input));
      case "saveRecipe":
        return recipes.saveRecipe(input);
      case 'deleteRecipe': {
        const result = await recipes.deleteRecipe(input);
        if (result.ok) {
          const path = join(this.userData, 'connections/usage-defaults.json'), defaults = await service.store.read(path);
          if (defaults) { defaults.recipes = Object.fromEntries(Object.entries(defaults.recipes ?? {}).filter(([, id]) => id !== input.recipeId)); await service.store.write(path, defaults); }
        }
        return result;
      }
      case "copyRecipe":
        return recipes.copyRecipe(input);
      case "exportRecipes":
        return recipes.exportRecipes(input);
      case "planRecipeImport":
        return recipes.planRecipeImport(input);
      case "applyRecipeImport":
        return recipes.applyRecipeImport(input);
      case 'discoverWorkflowOutputs': {
        const config = await this.connectionService.loadConnection(input.connectionId);
        if (!config || config.protocol !== 'comfyUI') return fail('CONNECTION_MISSING', '请选择 ComfyUI 连接。', 'M10');
        let historyId;
        if (input.historyTaskId) {
          const task = service.tasks.get(input.historyTaskId);
          const item = task?.items.find(item => item.remote && item.configSnapshot?.id === config.id && item.workflowSnapshot?.id === input.workflow.id);
          if (!item) return fail('WORKFLOW_HISTORY_MISMATCH', '此任务没有当前工作流和连接的远端记录。', 'M10');
          historyId = item.remote.id;
          if (Object.entries(input.workflow.apiGraph).some(([id, node]) => item.workflowSnapshot.apiGraph[id]?.class_type !== node.class_type)) return fail('WORKFLOW_HISTORY_MISMATCH', '图中节点已变化，请选择对应版本的历史或仅读取节点信息。', 'M10');
        }
        return this.adapter.discoverWorkflowOutputs(config, input.workflow, historyId);
      }
      case "saveWorkflow": {
        if (input.workflow.operation) {
          const operations = await this.generationProviders?.operations?.(project) ?? new ProductionOperationCatalog().list();
          const operation = operations.find(operation => operation.id === input.workflow.operation);
          if (!operation) return fail('WORKFLOW_OPERATION_UNAVAILABLE', '所选公开操作当前不可取得，请启用原插件或保存配置草稿。', 'M10');
          if (operation.definition.purpose !== input.workflow.purpose) return fail('WORKFLOW_OPERATION_PURPOSE', '工作流用途与选定操作不一致，请重新选择操作。', 'M10');
          const diagnostics = workflowOperationDiagnostics(input.workflow, operation);
          if (diagnostics.length) return fail('WORKFLOW_OPERATION_MAPPING', '已有绑定与公开操作字段契约不兼容，请重新绑定或取消。\n' + diagnostics.map(item => item.message).join('\n'), 'M10');
        }
        return this.connectionService.saveWorkflow(
          input.workflow,
          input.expectedRevision,
        );
      }
      case 'listWorkflowDrafts': return this.connectionService.listWorkflowDrafts();
      case 'saveWorkflowDraft': return this.connectionService.saveWorkflowDraft(input.draft, input.expectedRevision);
      case "prepareUIPlan": {
        return ui.prepareUIPlan({
          ...input,
          createItem: step => createUIPlanItem(this.planningPorts(ctx), {
            draft: input.draft, step, proposal: input.proposal, selectedAssets: input.selectedAssets,
            reference: async (assetId, variantId) => service.options.prepareReference(value(await this.call('mediaInput', { assetId, variantId }))),
          }),
        });
      }
      case "confirmUIPlan": {
        const result = await ui.confirmUIPlan(input);
        if (result.ok) void service.drain().catch(() => {});
        return result;
      }
      case "saveComposition": {
        const candidate = service.getCandidate(input.candidateId);
        const item = service.listTasks().find(task => task.id === candidate?.taskId)?.items.find(item => item.id === candidate.itemId);
        let prepared;
        try { prepared = await prepareCompositionRecord(input, {
          candidate, item,
          revision: id => project.readDocument(id)?.revision,
          plans: async () => {
            const plans = [];
            for (const file of await files(service.store.path('ui-plans'))) if (file.endsWith('.json')) {
              const plan = await service.store.read(service.store.path('ui-plans', file));
              const taskPlan = plan?.taskPlanId && await service.store.read(service.store.planPath(plan.taskPlanId));
              plans.push({ id: plan.id, itemIds: taskPlan?.task.items.map(item => item.id) ?? [] });
            }
            return plans;
          },
          previous: id => service.store.read(service.store.path('compositions', `${IdSchema.parse(id)}.json`)),
        }); } catch (error) {
          if (error instanceof DiagnosticError) return { ok: false, error: error.issue, issues: [error.issue] };
          throw error;
        }
        const { composition, scopePlan } = prepared;
        if (scopePlan) await service.store.write(service.store.path('ui-plans', `${scopePlan.id}.json`), scopePlan);
        for (const [id, review] of ctx.previewReviews) if (review.compositionId === composition.id) ctx.previewReviews.delete(id);
        await ui.saveComposition(composition);
        return ok(composition);
      }
      case "prepareUIAdoption": {
        let resolver;
        if (input.previewId) {
          const review = ctx.previewReviews.get(input.previewId);
          if (!review?.matches || review.compositionId !== input.compositionId || review.revision !== input.expectedCompositionRevision ||
            !isDeepStrictEqual([...review.keys].sort(), [...input.changeKeys, ...input.assetKeys].sort()) ||
            !isDeepStrictEqual(review.substitutions, Object.fromEntries(input.substitutions.map(value => [value.key, value.assetId]))) ||
            !isDeepStrictEqual(review.substitutionVariants, Object.fromEntries(input.substitutions.map(({ key, assetId, variantId }) => [key, { assetId, variantId }]))) ||
            review.versions.some(version => project.readDocument(version.ref.id)?.revision !== version.revision)) return fail('UI_PREVIEW_CHANGED', '组合预览已变化，请重新预览所选组合', 'M10', ['compare']);
          resolver = request => review.matches.get(styleMatchKey(request)) ?? null;
        }
        return ui.prepareUIAdoption(input, resolver);
      }
      case "previewComposition": {
        const composition = await service.store.read(
          service.store.path(
            "compositions",
            `${IdSchema.parse(input.id)}.json`,
          ),
        );
        if (!composition || composition.revision !== input.revision)
          throw new Error("组合版本已变化");
        if (composition.baseVersions.some(version => project.readDocument(version.ref.id)?.revision !== version.revision)) throw new Error('页面来源版本已变化');
        const selected = compositionClosure(composition, input.keys, []);
        if (selected.some(key => !input.keys.includes(key))) throw new Error('预览须确认完整依赖闭包');
        let review = null, resolver;
        if (input.previewId) {
          review = ctx.previewReviews.get(input.previewId);
          if (!review || review.compositionId !== composition.id || review.revision !== composition.revision ||
            !isDeepStrictEqual(review.keys, input.keys) || !isDeepStrictEqual(review.substitutions, input.substitutions ?? {}) ||
            review.versions.some(version => project.readDocument(version.ref.id)?.revision !== version.revision)) throw new Error('组合预览已变化，请重新预览所选组合');
          if (!Array.isArray(input.matches) || input.matches.length !== review.pending.length) throw new Error('预览属性归属尚未完整解析');
          const matches = new Map();
          for (const match of input.matches) {
            const key = styleMatchKey(match), request = review.pending.find(value => styleMatchKey(value) === key);
            if (!request || matches.has(key) || !Array.isArray(match.targets)) throw new Error('预览属性归属与待解析声明不匹配');
            matches.set(key, match.targets);
          }
          resolver = request => matches.get(styleMatchKey(request)) ?? null;
          review = { ...review, matches };
        } else if (input.matches) throw new Error('预览属性归属缺少版本绑定');
        const assets = new Map(
          composition.proposal.assets
            .filter((a) => a.source.kind === "existing")
            .map((a) => [
              a.key,
              {
                ...a.source,
                active:
                  ctx.index().data.assets.find((v) => v.id === a.source.assetId)
                    ?.activeVariantId === a.source.variantId,
              },
            ]),
        );
        for (const [key, assetId] of Object.entries(
          input.substitutions ?? {},
        )) {
          const asset = ctx.index().data.assets.find((a) => a.id === assetId);
          if (!asset) throw new Error("替代素材不存在");
          assets.set(key, {
            assetId,
            variantId: asset.activeVariantId,
            active: true,
          });
        }
        const previewAssets = [],
          locations = [];
        for (const resource of composition.resources.filter(
          (r) => input.keys.includes(r.key) && !input.substitutions?.[r.key],
        )) {
          const candidate = service.getCandidate(resource.candidateId),
            artifact = candidate?.artifacts[resource.artifactIndex];
          if (
            !candidate ||
            !artifact ||
            artifact.kind !== "image" ||
            artifact.role !== "primary"
          )
            throw new Error("组合素材尚未准备");
          const inspected = value(
            await inspectFile(
              artifact.localPath,
              this.assets.toolDirectory,
              undefined,
              this.assets.svgDecoder,
            ),
          );
          const assetId = candidate.id,
            variantId = candidate.itemId,
            entry = `candidate-${resource.artifactIndex}`;
          assets.set(resource.key, { assetId, variantId, active: true });
          const lease = this.resources.register({
            projectId: project.projectId,
            assetId,
            variantId,
            relative: entry,
            path: artifact.localPath,
            mime: artifact.mime,
          });
          const leaseKey = `preview/${composition.id}/${resource.key}`;
          this.leases.get(leaseKey)?.forEach((l) => l.release());
          this.leases.set(leaseKey, [lease]);
          locations.push({
            assetId,
            variantId,
            uri: lease.uri,
            mime: artifact.mime,
            bytes: artifact.bytes,
          });
          previewAssets.push({
            assetId,
            variantId,
            kind: "image",
            entry,
            files: [
              { path: entry, mime: artifact.mime, bytes: artifact.bytes },
            ],
            metadata: inspected.metadata,
            canvas: null,
            provider: null,
          });
        }
        const prepared = prepareComposition({
          composition,
          documents: [...project.documents.values()],
          keys: input.keys,
          assets,
          deferStyleMatches: !review,
          resolveStyleMatches: resolver,
          validateAsset: (id, variant) =>
            [...assets.values()].some(
              (a) => a.assetId === id && (!variant || a.variantId === variant),
            ) ||
            ctx
              .index()
              .data.assets.some(
                (a) =>
                  a.id === id &&
                  (!variant || a.variants.some((v) => v.id === variant)),
              ),
        });
        const styles = Object.assign(
          {},
          ...[...project.documents.values()].map((d) => d.files),
        );
        for (const patch of prepared.edit.patches)
          if (patch.kind === "file" && patch.after !== null)
            styles[patch.path] = patch.after;
        const previewId = input.previewId ?? createId();
        if (!review) review = { compositionId: composition.id, revision: composition.revision, keys: input.keys,
          substitutions: input.substitutions ?? {}, substitutionVariants: Object.fromEntries(Object.keys(input.substitutions ?? {}).map(key => {
            const { assetId, variantId } = assets.get(key); return [key, { assetId, variantId }];
          })), versions: versions(project), pending: prepared.unresolvedStyleMatches,
          matches: prepared.unresolvedStyleMatches.length ? null : new Map() };
        ctx.previewReviews.set(previewId, review);
        return ok({
          template: prepared.template,
          styles,
          previewAssets,
          locations,
          propertyOwners: prepared.propertyOwners,
          unresolvedStyleMatches: prepared.unresolvedStyleMatches,
          previewId,
        });
      }
      default:
        return fail("UNKNOWN_PRODUCTION_OPERATION", method, "M10");
    }
  }
}
