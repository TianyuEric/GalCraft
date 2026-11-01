import { createId } from '@galcraft/contracts';
import type { Artifact, DocumentView, Issue, Result, VersionRef } from '@galcraft/contracts';
import type { CompileInput } from '@galcraft/dsl';
import { prepareComposition, type UIComposition } from '@galcraft/templates';
import type { Candidate, TaskItem } from './types.js';
import type { UIPlanProposal } from './ui.js';
import { candidateText, reviewScript } from './review.js';
import { performanceConflicts } from './conversation.js';
import { issue } from './validation.js';
import { prepareAnimationCandidate } from './animation-candidate.js';
export type CandidateValidationPorts = {
  scriptSource(): CompileInput;
  versions(): VersionRef[];
  documents(): DocumentView[];
  validateAsset(id: string, variantId?: string): boolean;
  prepareSVG(candidate: Candidate): Promise<Result<Artifact>>;
};
export async function validateProductionCandidate(candidate: Candidate, item: TaskItem, ports: CandidateValidationPorts): Promise<Issue[]> {
        if (candidate.artifacts.some(artifact => artifact.kind === 'animation')) {
          try { await prepareAnimationCandidate(candidate); return []; }
          catch (reason) { return [issue('ANIMATION_CANDIDATE', String(reason))]; }
        }

        if (item.creationMode === 'discuss' || item.conversation?.mode === 'discuss') return [];
        if (item.conversation?.protectedScript || item.protectedScript) {
          const conflicts = performanceConflicts((item.conversation?.protectedScript ?? item.protectedScript)!, await candidateText(candidate));
          if (conflicts.length) return conflicts;
        }
        const purpose = item.recipeSnapshot?.purpose ?? item.operation;
        if (purpose === 'script' || !purpose && item.purpose === 'text' && item.target.usage === 'script') {
          const current = ports.scriptSource(), document = current.documents.find(d => d.sceneId === item.target.sceneId);
          if (!document) return [issue('SCRIPT_TARGET', '请选择有效的目标场景')];
          const checked = await reviewScript({ candidate, current, documentId: document.documentId, beforeStatementId: item.target.statementId,
            replaceStatementIds: item.target.replaceStatementIds ?? [], bindings: {}, expected: ports.versions() });
          return checked.ok ? [] : checked.issues;
        }
        if (purpose === 'uiPlan' || purpose === 'uiPatch') {
          try {
            const proposal: UIPlanProposal & UIComposition['proposal'] = JSON.parse(await candidateText(candidate));
            if (typeof proposal.summary !== 'string') throw new Error('页面候选需要 summary');
            if (purpose === 'uiPlan') {
              if (!Array.isArray(proposal.steps) || proposal.steps.some(step => !step || typeof step.key !== 'string' || !['patch', 'svg', 'raster'].includes(step.kind) || typeof step.instruction !== 'string' || !step.fields || !Array.isArray(step.dependsOn) || !Array.isArray(step.reuseAssets) || !Array.isArray(step.assetKeys))) throw new Error('页面计划格式不完整');
            } else {
              if (!(['config', 'styles', 'assets'] as const).every(key => Array.isArray(proposal[key])) || proposal.config.some(change => typeof change.path !== 'string' || !Array.isArray(change.dependsOn)) || proposal.styles.some(style => typeof style.source !== 'string' || !Array.isArray(style.dependsOn))) throw new Error('页面修改格式不完整');
              const scope = item.target.uiScope;
              if (!scope?.pageIds.length || [...proposal.config, ...proposal.styles].some(change => { const target = 'scope' in change ? change.scope : change; return !scope.pageIds.includes(target.pageId) || scope.componentIds.length && (!target.componentId || !scope.componentIds.includes(target.componentId)); })) throw new Error('页面修改超出了所选页面或组件范围');
              const composition: UIComposition = { id: createId(), revision: 1, candidateId: candidate.id, planId: createId(), baseVersions: ports.versions(), proposal, resources: [], propertyOwners: [], issues: [] };
              if (!proposal.assets.some(asset => asset.source?.kind === 'candidate')) prepareComposition({ composition, documents: ports.documents(), keys: [...proposal.config, ...proposal.styles, ...proposal.assets].map(change => change.key), assets: new Map(), deferStyleMatches: true, validateAsset: ports.validateAsset });
            }
            return [];
          } catch (error) { return [issue('UI_CANDIDATE', String(error))]; }
        }
        if (purpose !== "svg") return [];
        const prepared = await ports.prepareSVG(candidate);
        if (!prepared.ok) return prepared.issues;
        candidate.artifacts = [
          ...candidate.artifacts.filter((a) => a.mime !== "image/svg+xml"),
          prepared.value,
        ];
        return [];

}
