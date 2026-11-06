import type { WorkbenchBridge } from '../../../../desktop-bridge.js';
import { workbenchBridge, unwrap } from '../../../pages/Production/bridge.js';
import type { QuickIntent, QuickScope } from '../../../pages/Production/session.js';
import { CandidateProductionSession, type CandidateProductionOrigin } from './production-session.js';
import type { CandidateSession } from '../application/session.js';
import type { CandidateCollaborationPreferences } from '../components/CollaborationCandidate.js';
import { authoringSource } from '../application/documents.js';
import { createCandidateCollaboration, type OpenTaskWorkspace } from './task-collaboration.js';
import { createCandidateProduction } from './task-production.js';
import { taskOk, unsupported } from './task-model.js';

export function createCandidateTasks(session: CandidateSession) {
  const projectId = authoringSource(session.host.list()).project.projectId;
  const execution = createCandidateProduction(session, projectId);
  let navigator: ((target: OpenTaskWorkspace) => void) | undefined;
  const collaboration = createCandidateCollaboration(session, session.writeSessionId, execution.library.overview, target => navigator?.(target));
  const collaborationPreferences: CandidateCollaborationPreferences = { tabs: ['service'], selected: 'service', workspaces: {} };
  const base = session.services.bridge;
  // The production consumer expects the full desktop type. This composes the ports
  // the embedded workface invokes, using the same conversion as the formal workbench.
  const files: WorkbenchBridge['files'] = {
    pickAssets: async () => taskOk([]), openBuild: unsupported, revealEntity: unsupported,
    ...base.files, pickRecipes: async () => taskOk(execution.library.recipeFiles()),
  };
  const documents: WorkbenchBridge['documents'] = {
    ...session.host.bridge.documents, ...base.documents,
    async list() {
      const result = await base.documents.list();
      if (!result.ok) return result;
      // Production's source diff reads the script as the first scene file.
      return taskOk(result.value.map(document => document.format === 'dsl' ? {
        ...document, files: Object.fromEntries(Object.entries(document.files).sort(([left], [right]) =>
          Number(right.endsWith('.gal')) - Number(left.endsWith('.gal')))),
      } : document));
    },
  };
  const productionServices = { ...session.services, bridge: { ...base, documents } };
  const bridge = workbenchBridge({
    ...base, documents,
  });
  const production = new CandidateProductionSession(Object.assign(bridge, {
    files, connections: execution.library.connectionBridge, production: execution.bridge, collaboration: collaboration.bridge,
    projects: { chooseDirectory: async () => taskOk('/review/production') },
  }), projectId, () => session.controller.preferences.locale);

  function scope(documentId?: string, statementId?: string): QuickScope {
    const documents = session.host.list();
    const page = documentId && documents.find(value => value.documentId === documentId && Object.keys(value.files).some(path => path.startsWith('ui/pages/')));
    if (page) return { sceneId: null, statementId: null, pageIds: [page.documentId] };
    const source = authoringSource(documents);
    const scene = source.scenes.find(value => value.documentId === documentId || value.sceneId === documentId);
    const ui = session.getSnapshot().ui;
    const sceneId = scene?.sceneId ?? ui.sceneId;
    const command = statementId ?? session.editingStatement(sceneId);
    const selected = sceneId === ui.sceneId && ui.selection?.lineId === command && ui.selection.end > ui.selection.start
      ? { start: ui.selection.start, end: ui.selection.end } : null;
    return { sceneId: sceneId || null, statementId: command || null, textRange: selected };
  }

  async function openDraft(intent: QuickIntent, documentId?: string, statementId?: string, assetId?: string, originOverride?: CandidateProductionOrigin) {
    const target = scope(documentId, statementId);
    production.start();
    const scene = target.sceneId ? session.sceneSource(target.sceneId) : undefined;
    await production.openCandidateDraft(intent, target, {
      ...(documentId ?? scene?.documentId ? { documentId: documentId ?? scene?.documentId } : {}),
      ...(statementId ? { statementId } : {}), ...(assetId ? { assetId } : {}), ...originOverride,
    });
    if (production.variant && (production.purpose === 'image' || production.purpose === 'difference')) production.field('count', 2);
    if ((intent === 'page' || intent === 'ui-assets') && production.variant && target.pageIds?.length) {
      production.update({ target: { ...production.variant.target, uiScope: { pageIds: target.pageIds, componentIds: target.componentIds ?? [] } } });
    }
    if (intent !== 'script' && intent !== 'stage' && intent !== 'page' && intent !== 'ui-assets' && production.variant && target.sceneId) {
      const scene = production.data.scenes.find(value => value.id === target.sceneId);
      const characterId = scene?.statements.find(value => value.id === target.statementId)?.characterId ?? null;
      production.update({ target: { ...production.variant.target, sceneId: target.sceneId, statementId: target.statementId ?? null, characterId } });
    }
    if (assetId && production.variant) {
      const reference = unwrap(await execution.bridge.mediaInput({ assetId }));
      production.update({ fields: { ...production.variant.fields, reference, references: [reference] } });
    }
  }

  return {
    production, productionServices, collaboration: collaboration.bridge, collaborationPreferences, invokeCollaborationEdit: collaboration.invokeEdit,
    failNextTask() { execution.failNextTask(); production.changed(); }, failurePending: execution.failurePending, openDraft, scope,
    async openProduction(intent: QuickIntent, origin: CandidateProductionOrigin) {
      production.start();
      const source = authoringSource(session.host.list()).scenes.find(scene => scene.documentId === origin.documentId);
      await production.openCandidateDraft(intent, {sceneId: source?.sceneId ?? null, statementId: origin.statementId,
        pageIds: origin.pageIds, componentIds: origin.componentIds}, origin);
      navigator?.({page: 'production'});
    },
    async openAnimationProduction(request: Parameters<CandidateProductionSession['openAnimationProduction']>[0], origin: CandidateProductionOrigin) {
      production.start();
      const source=authoringSource(session.host.list()).scenes.find(scene=>scene.documentId===origin.documentId);
      await production.openAnimationProduction(request,{sceneId:source?.sceneId??null,statementId:origin.statementId},origin);
      navigator?.({page:'production'});
    },
    attachNavigator(next: (target: OpenTaskWorkspace) => void) { navigator = next; return () => { if (navigator === next) navigator = undefined; }; },
    async handoff(documentId?: string, statementId?: string) {
      const target = scope(documentId, statementId), scene = target.sceneId && session.sceneSource(target.sceneId);
      if (!scene) return;
      unwrap(await collaboration.bridge.handoffTarget!({ target: {
        ref: { kind: 'document', id: scene.documentId },
        source: { documentId: scene.documentId, revision: scene.revision, ...(target.statementId ? { statementId: target.statementId } : {}) },
      } }));
    },
    dispose() { production.stop(); execution.dispose(); collaboration.dispose(); navigator = undefined; },
  };
}
