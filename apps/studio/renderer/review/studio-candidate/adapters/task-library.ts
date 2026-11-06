import { ConnectionConfigSchema, DefaultTimeoutSecByPurpose, createId, type CapabilityReport, type ConnectionConfig, type DocumentView, type EditInput, type StudioBridge } from '@galcraft/contracts';
import { OfficialRecipes } from '@galcraft/authoring/recipes/official';
import { localizeRecipe } from '@galcraft/authoring/recipes/operations';
import { ProductionOperationCatalog } from '@galcraft/authoring/production/operations';
import type { CreationRecipe, RecipeImportPlan } from '@galcraft/authoring/recipes';
import type { WorkflowBinding, WorkflowConfigurationDraft } from '@galcraft/authoring/production';
import type { Overview, ProductionBridge } from '../../../../desktop-bridge.js';
import type { CandidateSession } from '../application/session.js';
import { documentVersion, taskError, taskOk, taskTime, unsupported } from './task-model.js';
import { isPageStructureOperation } from './production-session.js';
import { createDefinition as animationDefinition, operation as animationOperation } from '../../../../../../plugins/animation-generation/src/definition.js';
import animationPlugin from '../../../../../../plugins/animation-generation/plugin.config.json' with { type: 'json' };

const reviewOperations = new ProductionOperationCatalog([{
  id: animationOperation.id,
  version: animationOperation.version,
  provider: { id: animationPlugin.manifest.id, version: animationPlugin.manifest.version },
  definition: animationOperation,
  messages: animationDefinition().messages,
}]).list().filter(operation => !isPageStructureOperation(operation.id));

type RecipeMethods = Pick<ProductionBridge, 'saveRecipe' | 'copyRecipe' | 'deleteRecipe' | 'exportRecipes' | 'planRecipeImport' | 'applyRecipeImport' | 'saveWorkflow' | 'listWorkflowDrafts' | 'saveWorkflowDraft' | 'discoverWorkflowOutputs' | 'saveImageRoutes' | 'saveDefaults' | 'removeConnection'>;

export function createTaskLibrary(session: CandidateSession, projectId: string) {
  const recipes = new Map(OfficialRecipes.map(value => [value.id, structuredClone(value)]));
  const exports = new Map<string, CreationRecipe[]>();
  const imports = new Map<string, RecipeImportPlan>();
  const workflows = new Map<string, WorkflowBinding>();
  const workflowDrafts = new Map<string, WorkflowConfigurationDraft>();
  const connections = new Map<string, ConnectionConfig>();
  let defaults: NonNullable<Overview['defaults']> = { connections: {}, recipes: {} };
  let imageRoutes: NonNullable<Overview['imageRoutes']> = {};
  const pathFor = (id: string) => 'authoring/recipes/' + id + '.json';
  const recipeDocuments = () => session.host.list().filter(document => pathFor(document.documentId) in document.files);
  const allRecipes = () => [...recipes.values(), ...recipeDocuments().map(document => ({
    ...JSON.parse(document.files[pathFor(document.documentId)]!).data as CreationRecipe, revision: document.revision,
  }))];
  const saveProjectRecipes = (values: CreationRecipe[], previous: DocumentView[] = []) => {
    const input: EditInput = { label: '保存作品制作方案', origin: 'preset', expected: previous.map(documentVersion), patches: [], preparedAssets: [], requiredRefs: [] };
    for (const value of values) {
      const path = pathFor(value.id), document = previous.find(item => item.documentId === value.id);
      const raw = JSON.stringify({ schemaVersion: 1, documentId: value.id, revision: value.revision, data: value }, null, 2) + '\n';
      input.patches.push(document ? { kind: 'file', documentId: value.id, path, before: document.files[path]!, after: raw } :
        { kind: 'document', op: 'create', documentId: value.id, before: null, after: { format: 'json', files: { [path]: raw } } });
    }
    return session.applyEdit(input);
  };
  const connection = (purpose: ConnectionConfig['purposes'][number], protocol: ConnectionConfig['protocol'], name: string) => {
    const value: ConnectionConfig = { id: createId(connections), revision: 1, name, protocol, model: 'galcraft-review',
      baseUrl: 'https://review.invalid', credentialId: null, auth: 'none', apiKeyHeader: null,
      purposes: [purpose], timeoutSecByPurpose: { ...DefaultTimeoutSecByPurpose }, concurrency: 1, parameters: {},
      workflowBindingId: null, serverFileRoot: null };
    connections.set(value.id, value);
    defaults.connections[purpose] ??= value.id;
  };
  connection('text', 'chatCompletions', '审核文字');
  connection('image', 'openAIImage', '审核图像');
  connection('difference', 'webUI', '审核差分');
  connection('speech', 'openAISpeech', '审核语音');
  connection('music', 'miniMaxMusic', '审核音乐');
  connection('image', 'comfyUI', '审核工作流');
  const recovered=session.recoveryState<{recipes:CreationRecipe[];connections:ConnectionConfig[];workflows:WorkflowBinding[];workflowDrafts:WorkflowConfigurationDraft[];defaults:typeof defaults;imageRoutes:typeof imageRoutes}>('production-library');
  if(recovered){
    recipes.clear();connections.clear();
    for(const value of recovered.recipes)recipes.set(value.id,value);
    for(const value of recovered.connections)connections.set(value.id,value);
    for(const value of recovered.workflows)workflows.set(value.id,value);
    for(const value of recovered.workflowDrafts)workflowDrafts.set(value.id,value);
    defaults=recovered.defaults;imageRoutes=recovered.imageRoutes;
  }
  session.registerRecovery('production-library',()=>({recipes:[...recipes.values()],connections:[...connections.values()],workflows:[...workflows.values()],workflowDrafts:[...workflowDrafts.values()],defaults,imageRoutes}));
  const saveRecipe: ProductionBridge['saveRecipe'] = async ({ recipe, expectedRevision }) => {
    const previous = allRecipes().find(item => item.id === recipe.id);
    if (recipe.scope === 'official' || previous?.scope === 'official') return taskError('RECIPE_READ_ONLY', '请先复制官方方案。');
    if ((previous?.revision ?? null) !== expectedRevision || (previous && previous.scope !== recipe.scope)) return taskError('RECIPE_STALE', '方案已变化，请重新打开。');
    if (!recipe.name.trim() || (recipe.scope === 'project' ? recipe.projectId !== projectId : recipe.projectId !== null)) return taskError('RECIPE_INVALID', '填写方案名称并选择正确的保存范围。');
    const saved = structuredClone({ ...recipe, revision: (previous?.revision ?? 0) + 1, updatedAt: taskTime() });
    if (saved.scope === 'project') {
      const result = await saveProjectRecipes([saved], recipeDocuments().filter(document => document.documentId === saved.id));
      if (!result.ok) return result;
    } else recipes.set(saved.id, saved);
    return taskOk(structuredClone(saved));
  };
  const production: RecipeMethods = {
    saveRecipe,
    async copyRecipe({ recipeId, sourceScope, scope, projectId: targetProject, locale }) {
      const source = allRecipes().find(item => item.id === recipeId);
      if (!source || source.scope !== sourceScope) return taskError('RECIPE_NOT_FOUND', '原方案已离开当前目录。');
      const recipe = localizeRecipe(source, locale ?? 'zh-CN');
      const now = taskTime();
      return saveRecipe({ recipe: { ...structuredClone(recipe), id: createId(recipes), scope, projectId: targetProject, revision: 0, createdAt: now, updatedAt: now }, expectedRevision: null });
    },
    async deleteRecipe({ recipeId, scope, expectedRevision, affectedPresetIds, confirmed }) {
      const entries = allRecipes(), existing = entries.find(item => item.id === recipeId);
      if (!existing || existing.scope !== scope || existing.revision !== expectedRevision || scope === 'official') return taskError('RECIPE_STALE', '方案已变化或为只读。');
      const affected = entries.filter(item => item.parameterPreset?.recipeId === recipeId);
      if (affected.length && (!confirmed || affected.some(item => !affectedPresetIds?.includes(item.id)))) return taskError('RECIPE_IN_USE', '请先确认受影响的参数预设。');
      const removed = new Set([recipeId, ...affected.map(item => item.id)]);
      const documents = recipeDocuments().filter(document => removed.has(document.documentId));
      if (documents.length) {
        const result = await session.applyEdit({ label: '移除作品制作方案', origin: 'preset', expected: documents.map(documentVersion),
          patches: documents.map(document => ({ kind: 'document', op: 'delete', documentId: document.documentId,
            before: { format: document.format, files: document.files }, after: null })), preparedAssets: [], requiredRefs: [] });
        if (!result.ok) return result;
      }
      for (const item of affected) recipes.delete(item.id);
      recipes.delete(recipeId);
      defaults = { ...defaults, recipes: Object.fromEntries(Object.entries(defaults.recipes).filter(([, id]) => !removed.has(id))) };
      return taskOk(undefined);
    },
    async exportRecipes({ recipeIds, destinationPath, overwrite }) {
      if (exports.has(destinationPath) && !overwrite) return taskError('RECIPE_EXPORT_EXISTS', '审核目录已有同名方案文件。');
      const chosen = new Set(recipeIds), entries = new Map(allRecipes().map(item => [item.id, item]));
      for (const id of recipeIds) {
        const source = entries.get(id);
        if (!source) return taskError('RECIPE_NOT_FOUND', '所选方案已离开当前目录。');
        if (source.parameterPreset) chosen.add(source.parameterPreset.recipeId);
      }
      const values = [...chosen].flatMap(id => entries.get(id) ?? []);
      if (!values.length) return taskError('RECIPE_EXPORT_EMPTY', '请选择要导出的方案。');
      exports.set(destinationPath, structuredClone(values));
      return taskOk({ path: destinationPath, count: values.length });
    },
    async planRecipeImport({ filePath, destination, projectId: targetProject }) {
      const values = exports.get(filePath);
      if (!values) return taskError('RECIPE_IMPORT_INVALID', '审核目录中没有此方案文件。');
      if ((destination === 'project' ? projectId : null) !== targetProject) return taskError('RECIPE_PROJECT_ID', '方案范围与当前作品不一致。');
      const ids = new Map(values.map(value => [value.id, createId(recipes)]));
      const imported = values.map(value => ({ ...structuredClone(value), id: ids.get(value.id)!, revision: 1, scope: destination, projectId: targetProject,
        ...(value.parameterPreset && ids.has(value.parameterPreset.recipeId) ? { parameterPreset: { ...value.parameterPreset, recipeId: ids.get(value.parameterPreset.recipeId)!, recipeScope: destination, recipeRevision: 1 } } : {}) }));
      const plan: RecipeImportPlan = { planId: createId(imports), recipes: imported, destination, projectId: targetProject, expected: [], issues: [] };
      imports.set(plan.planId, plan);
      return taskOk(structuredClone(plan));
    },
    async applyRecipeImport(planId) {
      const plan = imports.get(planId);
      if (!plan) return taskError('RECIPE_IMPORT_STALE', '请重新选择审核目录的方案文件。');
      if (plan.destination === 'project') {
        const result = await saveProjectRecipes(plan.recipes);
        if (!result.ok) return result;
      } else for (const recipe of plan.recipes) recipes.set(recipe.id, recipe);
      imports.delete(planId);
      return taskOk(structuredClone(plan.recipes));
    },
    async saveWorkflow({ workflow, expectedRevision }) {
      const previous = workflows.get(workflow.id);
      if ((previous?.revision ?? null) !== expectedRevision) return taskError('WORKFLOW_STALE', '工作流已变化，请重新打开。');
      const saved = structuredClone({ ...workflow, revision: (previous?.revision ?? 0) + 1 });
      workflows.set(saved.id, saved);
      workflowDrafts.delete(saved.id);
      return taskOk(structuredClone(saved));
    },
    async listWorkflowDrafts() { return taskOk(structuredClone([...workflowDrafts.values()])); },
    async saveWorkflowDraft({ draft, expectedRevision }) {
      const previous = workflowDrafts.get(draft.id);
      if ((previous?.revision ?? null) !== expectedRevision) return taskError('WORKFLOW_STALE', '工作流草稿已变化，请重新打开。');
      const saved = structuredClone({ ...draft, revision: (previous?.revision ?? 0) + 1, updatedAt: taskTime() });
      workflowDrafts.set(saved.id, saved);
      return taskOk(structuredClone(saved));
    },
    discoverWorkflowOutputs: unsupported,
    async saveImageRoutes(routes) { imageRoutes = structuredClone(routes); return taskOk(structuredClone(imageRoutes)); },
    async saveDefaults(input) { defaults = structuredClone(input); return taskOk(structuredClone(defaults)); },
    async removeConnection(id) {
      connections.delete(id);
      defaults = { ...defaults, connections: Object.fromEntries(Object.entries(defaults.connections).filter(([, connectionId]) => connectionId !== id)) };
      imageRoutes = Object.fromEntries(Object.entries(imageRoutes).filter(([, route]) => route.connectionId !== id));
      return taskOk(undefined);
    },
  };
  const connectionBridge: StudioBridge['connections'] = {
    async save(config) {
      const parsed = ConnectionConfigSchema.safeParse(config);
      if (!parsed.success) return taskError('CONNECTION_INVALID', '连接配置无效。');
      const saved = { ...parsed.data, revision: (connections.get(config.id)?.revision ?? 0) + 1 };
      connections.set(saved.id, saved);
      return taskOk(saved.id);
    },
    async test({ connectionId, purpose, model }) {
      const value = connections.get(connectionId);
      if (!value?.purposes.includes(purpose)) return taskError('CONNECTION_PURPOSE', '连接未启用此用途。');
      return taskOk({
        connectionId, purpose, connectionRevision: value.revision, checkedAt: taskTime(), serviceVersion: 'review', status: 'verified',
        output: purpose === 'text' ? 'text' : purpose === 'speech' || purpose === 'music' ? 'audio' : 'image',
        models: [model || value.model], inputs: [], promptFormat: 'either', textVision: null,
        remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [],
      } satisfies CapabilityReport);
    },
  };
  const overview = () => ({ operations: reviewOperations,
    recipes: allRecipes().filter(recipe => !recipe.purposes.some(isPageStructureOperation) && !isPageStructureOperation(recipe.production?.operation)), workflows: [...workflows.values()],
    workflowDrafts: [...workflowDrafts.values()], connections: [...connections.values()], imageRoutes, defaults });
  return { production, connectionBridge, overview, recipeFiles: () => [...exports.keys()].slice(-1) };
}
