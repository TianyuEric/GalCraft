import { AnimationGenerationRequestSchema, type AnimationGenerationRequest, type VersionRef } from '@galcraft/contracts';
import type { FormVariant, ProductionFormDraft } from '@galcraft/authoring/production';
import type { CreationRecipe } from '@galcraft/authoring/recipes';
import { ProductionSession, type QuickIntent, type QuickScope } from '../../../pages/Production/session.js';
import { unwrap, type Overview, type WorkbenchBridge } from '../../../pages/Production/bridge.js';
import type { CandidateProductionBridge } from './task-production.js';

export type CandidateProductionOrigin = {
  documentId?: string;
  statementId?: string | null;
  assetId?: string;
  characterId?: string;
  pageIds?: string[];
  componentIds?: string[];
  version?: VersionRef;
  viewId?: string;
};

type DraftOrigin = NonNullable<ProductionFormDraft['origin']> & CandidateProductionOrigin;

export const isPageStructureOperation = (operation: string | undefined) => operation === 'uiPlan' || operation === 'uiPatch';

/** A draft uses sourceVersions for local adoption anchors. Captured request
 * materials carry their own historical versions in ContextPart.source. */
export function targetVersions(data: Overview, target: FormVariant['target']): VersionRef[] {
  const scene = data.scenes.find(scene => scene.id === target.sceneId);
  return scene?.documentId ? data.versions.filter(version => version.ref.id === scene.documentId) : [];
}

export class CandidateProductionSession extends ProductionSession {
  declare readonly bridge: WorkbenchBridge & { production: CandidateProductionBridge };
  private pendingTargetVersions: VersionRef[] | null = null;

  constructor(bridge: CandidateProductionSession['bridge'], projectId: string, displayLocale?: () => string) {
    super(bridge, projectId, displayLocale);
  }

  async openCandidateDraft(intent: QuickIntent, scope: QuickScope = {}, entry?: CandidateProductionOrigin, recipe?: CreationRecipe) {
    if (intent === 'page' || isPageStructureOperation(recipe?.production?.operation)) throw new Error('页面结构继续在页面设计器中手工编辑。');
    const hasScene = Boolean(scope.sceneId);
    // Suppress the formal fallback for a standalone candidate entry.
    await super.openProductionDraft(intent, { ...scope, sceneId: scope.sceneId ?? '' }, recipe);
    const draft = this.draft!, variant = this.variant!;
    const scene = this.data.scenes.find(value => value.id === scope.sceneId);
    const documentId = entry?.documentId ?? scene?.documentId;
    const origin: DraftOrigin = {
      ...draft.origin!,
      ...entry,
      sceneId: scope.sceneId || null,
      ...(documentId ? { documentId } : {}),
      version: entry?.version ?? this.data.versions.find(value => value.ref.id === documentId),
    };
    draft.origin = origin;
    this.origin = origin;
    if (!hasScene) variant.target.sceneId = null;
    if (intent !== 'script' && intent !== 'stage' && intent !== 'ui-assets' && hasScene) {
      this.update({ target: { ...variant.target, sceneId: scene?.id ?? null, statementId: scope.statementId ?? null,
        characterId: entry?.characterId ?? scene?.statements.find(value => value.id === scope.statementId)?.characterId ?? null } });
    } else {
      variant.sourceVersions = targetVersions(this.data, variant.target);
    }
    this.changed();
  }

  override openProductionDraft(intent: QuickIntent, scope: QuickScope = {}, recipe?: CreationRecipe) {
    return this.openCandidateDraft(intent, scope, undefined, recipe);
  }

  async openAnimationProduction(request: AnimationGenerationRequest, scope: QuickScope, entry: CandidateProductionOrigin) {
    const fields = AnimationGenerationRequestSchema.parse(request);
    await this.refresh();
    const operation = this.data.operations?.find(value => value.definition.outputs.some(output => output.type === 'animation' && output.typeVersion === 1));
    if (!operation) throw new Error('审核宿主未装配 GCA 动画制作定义。');
    await this.openOperation(operation, this.displayLocale());
    const origin: DraftOrigin = {
      ...entry, page: 'editor', sceneId: scope.sceneId ?? null, statementId: entry.statementId ?? scope.statementId ?? null,
      pageIds: entry.pageIds ?? [], componentIds: entry.componentIds ?? [],
      version: entry.version ?? this.data.versions.find(value => value.ref.id === entry.documentId),
    };
    this.draft!.origin = origin;
    this.origin = origin;
    this.draft!.name = '动画制作 · ' + (this.data.assets.find(value => value.id === entry.assetId)?.name || request.targetContext.trim().slice(0, 80) || '新动画');
    this.update({ fields, target: { ...this.variant!.target, sceneId: origin.sceneId, statementId: origin.statementId } });
    await this.saveDraft(true);
  }

  override changed() {
    if (this.variant && this.pendingTargetVersions) this.variant.sourceVersions = this.pendingTargetVersions;
    super.changed();
  }

  private withTargetVersions(versions: VersionRef[], edit: () => void) {
    this.pendingTargetVersions = versions;
    try { edit(); } finally { this.pendingTargetVersions = null; }
  }

  override update(patch: Partial<FormVariant>) {
    const versions = patch.target ? targetVersions(this.data, patch.target) : this.variant?.sourceVersions ?? [];
    this.withTargetVersions(versions, () => super.update(patch));
  }

  override field(name: string, value: Parameters<ProductionSession['field']>[1]) {
    this.withTargetVersions(this.variant?.sourceVersions ?? [], () => super.field(name, value));
  }

  override async setQuickScene(sceneId: string | null) {
    if (!this.variant) return;
    this.update({ target: { ...this.variant.target, sceneId, statementId: null, replaceStatementIds: [], characterId: null } });
  }

  override async reviewAdoptionTarget() {
    await this.refresh();
    if (this.variant) this.update({ target: { ...this.variant.target } });
  }

  async captureMaterials(scope: QuickScope) {
    const variant = this.variant;
    if (!variant || !this.draft || this.draft.submittedTaskId) return;
    const captured = unwrap(await this.bridge.production.context({
      sceneId: scope.sceneId ?? null, statementId: scope.statementId, statementIds: scope.statementIds, textRange: scope.textRange,
      pageIds: scope.pageIds ?? [], componentIds: scope.componentIds ?? [], usage: this.draft.activeUse,
    }));
    if (this.variant === variant) this.update({ context: captured });
  }

  override async captureContext() {
    const origin = this.draft?.origin;
    if (origin) await this.captureMaterials(origin);
  }

  originFor(draft = this.task ? this.data.drafts.find(value => value.id === this.task?.sourceDraftId) : this.draft): DraftOrigin | null {
    return draft?.origin ?? null;
  }
}
