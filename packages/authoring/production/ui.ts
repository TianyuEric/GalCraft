import { createId, DiagnosticError } from '@galcraft/contracts';

import type { EditPlan, EditInput, Id, Json, Result, VersionRef } from '@galcraft/contracts';
import type { UIAssetAdoption, UIAssetAdoptionCoordinator, PreparedUIAssetAdoption } from '@galcraft/assets';
import { compositionClosure, prepareComposition, readTemplateDocuments, components } from '@galcraft/templates';
import type { UIComposition, StyleMatchResolver } from '@galcraft/templates';
import type { Candidate, RecipeSelection, Task, TaskItem, TaskPlan } from './types.js';
import { ProductionService } from './service.js';
import { fail, issue, ok, topological } from './validation.js';
export type UIPlanStep = { key: string; kind: 'patch' | 'svg' | 'raster'; description: string; dependsOn: string[]; recipe: RecipeSelection | null; instruction: string; fields: Record<string, Json>; reuseAssets: Id[]; assetKeys: string[] };
export type UIPlanProposal = { summary: string; steps: UIPlanStep[] };
export type UIAuthoringPlan = { id: Id; revision: number; taskId: Id; scope: { pageIds: Id[]; componentIds: Id[] }; baseVersions: VersionRef[]; proposal: UIPlanProposal; taskPlanId: Id | null; confirmedRevision: number | null };
export type UICompositionInput = Omit<UIComposition, 'id' | 'revision' | 'planId' | 'baseVersions' | 'propertyOwners' | 'issues'> & { id?: Id; revision?: number };
/** Plan the persisted composition against the author's reviewed item baseline. */
export async function prepareCompositionRecord(input: UICompositionInput, context: {
  candidate: Candidate | null; item: TaskItem | undefined;
  revision(documentId: Id): number | undefined;
  plans(): Promise<{ id: Id; itemIds: Id[] }[]>;
  previous(id: Id): Promise<UIComposition | null>;
}): Promise<{ composition: UIComposition; scopePlan: UIAuthoringPlan | null }> {
  const { candidate, item } = context;
  if (!candidate) throw new DiagnosticError(issue('CANDIDATE_MISSING', '候选不存在'));
  if (!input.proposal || !Array.isArray(input.proposal.config) || !Array.isArray(input.proposal.styles) || !Array.isArray(input.proposal.assets))
    throw new DiagnosticError(issue('UI_COMPOSITION_INVALID', '页面候选需要 config、styles、assets 数组；请编辑候选源码'));
  if (input.proposal.config.some(change => typeof change.path !== 'string' || !change.path || !Array.isArray(change.dependsOn)))
    throw new DiagnosticError(issue('UI_COMPOSITION_INVALID', '页面修改缺少 path 或 dependsOn；请编辑候选源码补齐属性路径和依赖'));
  const scope = item?.target.uiScope;
  if (!item || !scope?.pageIds.length) throw new DiagnosticError(issue('UI_COMPOSITION_SCOPE', '页面组合缺少已确认来源范围'));
  if (item.needsReview || item.sourceVersions.some(version => context.revision(version.ref.id) !== version.revision))
    throw new DiagnosticError(issue('UI_SOURCE_CHANGED', '页面来源版本已变化，请比较来源并确认保留现有结果'));
  const baseVersions = structuredClone(item.sourceVersions);
  for (const change of [...input.proposal.config, ...input.proposal.styles]) {
    const target = 'scope' in change ? change.scope : change;
    if (!scope.pageIds.includes(target.pageId) || scope.componentIds.length && (!target.componentId || !scope.componentIds.includes(target.componentId)))
      throw new DiagnosticError(issue('UI_COMPOSITION_SCOPE', '组合修改超出了已确认的页面或组件范围'));
  }
  const plan = (await context.plans()).find(plan => plan.itemIds.includes(candidate.itemId));
  const previous = input.id ? await context.previous(input.id) : null;
  if (previous && previous.revision !== input.revision) throw new DiagnosticError(issue('UI_COMPOSITION_CHANGED', '组合版本已变化'));
  const scopePlan: UIAuthoringPlan | null = plan ? null : { id: createId(), revision: 1, taskId: candidate.taskId,
    scope, baseVersions, proposal: { summary: input.proposal.summary, steps: [] }, taskPlanId: null, confirmedRevision: 1 };
  const composition: UIComposition = { ...input, planId: plan?.id ?? scopePlan!.id, id: input.id ?? createId(),
    revision: previous ? previous.revision + 1 : 1, baseVersions, propertyOwners: [], issues: [] };
  compositionClosure(composition, [...composition.proposal.config, ...composition.proposal.styles, ...composition.proposal.assets].map(change => change.key), []);
  return { composition, scopePlan };
}
export class UIProductionService {
  private preparedPlans = new Map<Id, Id[]>();
  async finishAdoption(planId: Id, committed: boolean): Promise<void> {
    const ids = this.preparedPlans.get(planId) ?? []; this.preparedPlans.delete(planId);
    for (const id of ids) { if (committed) this.assets.confirm(id); else await this.assets.discard(id); }
  }
  constructor(readonly production: ProductionService, private assets: UIAssetAdoptionCoordinator,
    private resolveAsset: (id: Id, variantId?: Id) => { active: boolean } | null,
    private replacements?: (prepared: PreparedUIAssetAdoption) => Promise<Result<EditInput>>,
    private resolveStyleMatches?: StyleMatchResolver) {}
  private documents() { return [...this.production.options.project.documents.values()]; }
  private checkVersions(expected: VersionRef[]) { if (expected.some(value => this.production.options.project.readDocument(value.ref.id)?.revision !== value.revision)) throw new Error('页面来源版本已变化'); }
  async prepareUIPlan(input: { candidateId: Id; proposal: UIPlanProposal; expected: VersionRef[]; scope: UIAuthoringPlan['scope']; selectedAssets: Id[];
    createItem: (step: UIPlanStep) => Promise<TaskItem> }): Promise<Result<UIAuthoringPlan>> {
    try {
      this.checkVersions(input.expected); const template = readTemplateDocuments(this.documents());
      if (!input.scope.pageIds.length || input.scope.pageIds.some(id => !template.pages.some(page => page.id === id)) || input.scope.componentIds.some(id => !template.pages.filter(page => input.scope.pageIds.includes(page.id)).flatMap(page => components(page.root)).some(component => component.id === id))) throw new Error('页面范围无效');
      const candidate = this.production.getCandidate(input.candidateId); if (!candidate || candidate.partial) throw new Error('计划候选不存在或不完整');
      const steps = input.proposal.steps; topological(steps.map(step => ({ id: step.key, dependencies: step.dependsOn.map(itemId => ({ itemId })) })));
      const keys = steps.flatMap(step => step.assetKeys); if (new Set(keys).size !== keys.length) throw new Error('资源 key 必须唯一');
      for (const step of steps) {
        if (!/^[a-zA-Z][\w-]*$/.test(step.key) || !['patch', 'svg', 'raster'].includes(step.kind)) throw new Error('不支持的计划步骤');
        if (step.kind === 'patch' ? step.assetKeys.length !== 0 : step.assetKeys.length !== 1) throw new Error('一个生成步骤只产生一种素材');
        if (step.kind !== 'raster' && step.recipe?.purpose !== (step.kind === 'svg' ? 'svg' : 'uiPatch')) throw new Error('步骤方案用途错误');
        if (step.reuseAssets.some(id => !input.selectedAssets.includes(id))) throw new Error('计划使用了未确认的素材');
      }
      const items = await Promise.all(steps.map(step => input.createItem(step))), byKey = new Map(steps.map((step, index) => [step.key, items[index]!]));
      steps.forEach((step, index) => { const item = items[index]!;
        if (step.kind === 'raster' && (item.purpose !== 'image' || (item.input as any).usage !== 'ui') || step.kind !== 'raster' && item.purpose !== 'text') throw new Error('步骤与生成用途不一致');
        item.dependencies = step.dependsOn.map(key => ({ itemId: byKey.get(key)!.id, output: step.kind === 'raster' && input.proposal.steps.find(s => s.key === key)?.kind !== 'patch' ? 'references' : 'context', selectedCandidateId: null })); });
      const planned = await this.production.planTask({ projectId: this.production.store.projectId, name: input.proposal.summary, context: [], items, policy: 'waitForSelection', selectionRule: null, expected: input.expected }); if (!planned.ok) return planned;
      const plan: UIAuthoringPlan = { id: createId(), revision: 1, taskId: candidate.taskId, scope: input.scope, baseVersions: input.expected, proposal: input.proposal, taskPlanId: planned.value.planId, confirmedRevision: null };
      await this.production.store.write(this.production.store.path('ui-plans', `${plan.id}.json`), plan); return ok(plan);
    } catch (error) { return fail('UI_PLAN', String(error)); }
  }
  async confirmUIPlan(input: { planId: Id; revision: number }): Promise<Result<Task>> {
    const path = this.production.store.path('ui-plans', `${input.planId}.json`), plan = await this.production.store.read<UIAuthoringPlan>(path);
    if (!plan || plan.revision !== input.revision || !plan.taskPlanId) return fail('UI_PLAN_CHANGED', '计划已变化或有未完成参数');
    try { if (!plan.confirmedRevision) this.checkVersions(plan.baseVersions); const result = await this.production.submitContinuation(plan.taskPlanId, plan.taskId);
      if (result.ok) { plan.confirmedRevision = plan.revision; await this.production.store.write(path, plan); } return result;
    } catch (error) { return fail('UI_PLAN_CHANGED', String(error)); }
  }
  async saveComposition(composition: UIComposition): Promise<void> { await this.production.store.write(this.production.store.path('compositions', `${composition.id}.json`), composition); }
  async prepareUIAdoption(input: { compositionId: Id; expectedCompositionRevision: number; changeKeys: string[]; assetKeys: string[]; assetAdoptions: UIAssetAdoption[];
    substitutions: { key: string; assetId: Id; variantId: Id }[]; expected: VersionRef[]; previewId?: Id }, resolveStyleMatches = this.resolveStyleMatches): Promise<Result<EditPlan>> {
    const prepared: Id[] = [];
    try {
      const composition = await this.production.store.read<UIComposition>(this.production.store.path('compositions', `${input.compositionId}.json`));
      if (!composition || composition.revision !== input.expectedCompositionRevision) throw new Error('组合版本已变化');
      this.checkVersions(composition.baseVersions); this.checkVersions(input.expected);
      const closure = compositionClosure(composition, input.changeKeys, input.assetKeys);
      const supplied = new Set([...input.changeKeys, ...input.assetKeys]); if (closure.some(key => !supplied.has(key))) throw new Error(`采用须确认依赖闭包：${closure.filter(key => !supplied.has(key)).join(', ')}`);
      const resources = new Map<string, { assetId: Id; variantId: Id; active: boolean }>(), assetPatches: any[] = [], replacementPatches: EditInput['patches'] = [], requiredRefs: EditInput['requiredRefs'] = [], versions = new Map(input.expected.map(value => [value.ref.id, value]));
      for (const choice of composition.proposal.assets.filter(choice => supplied.has(choice.key))) {
        if (choice.source.kind === 'existing') { const found = this.resolveAsset(choice.source.assetId, choice.source.variantId); if (!found) throw new Error('现有资源缺失'); resources.set(choice.key, { ...choice.source, ...found }); continue; }
        const adoption = input.assetAdoptions.filter(value => value.key === choice.key), substitutions = input.substitutions.filter(value => value.key === choice.key);
        if (adoption.length + substitutions.length !== 1) throw new Error(`素材 ${choice.key} 必须恰有一种采用方式`);
        if (substitutions.length) { const replacement = substitutions[0]!, found = this.resolveAsset(replacement.assetId, replacement.variantId); if (!found) throw new Error('替代素材缺失'); resources.set(choice.key, { ...replacement, ...found }); continue; }
        const resource = composition.resources.filter(value => value.key === choice.key); if (resource.length !== 1) throw new Error('候选资源映射不唯一');
        const candidate = this.production.getCandidate(resource[0]!.candidateId), artifact = candidate?.artifacts[resource[0]!.artifactIndex];
        if (!candidate || candidate.partial || !artifact || artifact.role !== 'primary') throw new Error('候选资源未完整');
        const result = await this.assets.prepareUIAssetAdoption({ projectId: this.production.store.projectId, choice: adoption[0]!, use: choice.use, candidate: { taskId: candidate.taskId, candidateId: candidate.id, artifactIndex: resource[0]!.artifactIndex, path: artifact.localPath, name: choice.key }, expected: input.expected });
        if (!result.ok) throw new Error(result.error.message);
        prepared.push(result.value.preparationId);
        if (result.value.replacementRefs.length) {
          if (!this.replacements) throw new Error('缺少引用来源提供方');
          const replacement = await this.replacements(result.value); if (!replacement.ok) throw new Error(replacement.error.message);
          replacementPatches.push(...replacement.value.patches); requiredRefs.push(...replacement.value.requiredRefs); replacement.value.expected.forEach(value => versions.set(value.ref.id, value));
        }
        assetPatches.push(...result.value.indexPatches); result.value.expected.forEach(value => versions.set(value.ref.id, value));
        resources.set(choice.key, { assetId: result.value.assetId, variantId: result.value.variantId, active: adoption[0]!.destination === 'newAsset' || adoption[0]!.replace.mode === 'all' });
      }
      const result = prepareComposition({ composition, documents: this.documents(), keys: closure, assets: resources,
        resolveStyleMatches,
        validateAsset: (id, variant) => [...resources.values()].some(value => value.assetId === id && (!variant || value.variantId === variant)) || !!this.resolveAsset(id, variant) });
      result.edit.expected.forEach(value => versions.set(value.ref.id, value)); result.edit.expected = [...versions.values()];
      // Each asset preparer reads the same frozen index; combine additions before the single M02 patch.
      if (assetPatches.length) { const first = structuredClone(assetPatches[0]); const baseline = first.changes[0].before as any[], merged = new Map(baseline.map(asset => [asset.id, asset]));
        for (const patch of assetPatches) for (const asset of patch.changes[0].after) { const old = baseline.find(value => value.id === asset.id); if (JSON.stringify(old) === JSON.stringify(asset)) continue;
          const current = merged.get(asset.id);
          if (old && current && JSON.stringify(current) !== JSON.stringify(old)) {
            if (current.activeVariantId !== old.activeVariantId && asset.activeVariantId !== old.activeVariantId && current.activeVariantId !== asset.activeVariantId) throw new Error('同一素材有多个活动版本提案');
            merged.set(asset.id, { ...asset, revision: Math.max(current.revision, asset.revision) + 1, activeVariantId: asset.activeVariantId !== old.activeVariantId ? asset.activeVariantId : current.activeVariantId,
              variants: [...current.variants, ...asset.variants.filter((variant: any) => !current.variants.some((value: any) => value.id === variant.id))] });
          } else merged.set(asset.id, asset);
        }
        first.changes[0].after = [...merged.values()]; result.edit.patches.unshift(first); }
      result.edit.preparedAssets = [...resources.values()].map(value => value.assetId);
      result.edit.patches.push(...replacementPatches); result.edit.requiredRefs.push(...requiredRefs);
      const plan = this.production.options.project.planEdit(result.edit); if (!plan.ok) throw new Error(plan.error.message);
      this.production.registerAdoption(plan.value, [composition.candidateId, ...composition.resources.filter(value => supplied.has(value.key)).map(value => value.candidateId)]);
      this.preparedPlans.set(plan.value.planId, prepared);
      return plan;
    } catch (error) { for (const id of prepared) await this.assets.discard(id); return fail('UI_ADOPTION', String(error)); }
  }
}
