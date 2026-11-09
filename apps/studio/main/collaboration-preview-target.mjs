import { CollaborationError } from '@galcraft/collaboration';

export function checkPreviewRevision(project, input) {
  if (!input.eventId) return;
  const [{ ref, revision }] = input.expected;
  if (project.readDocument(ref.id)?.revision !== revision) {
    throw new CollaborationError('PREVIEW_TARGET_STALE', 'Reread the scene document and supply its current revision.');
  }
}

/** Resolve the exact source that the isolated Player will inspect. */
export function resolvePreviewEventSource(snapshot, input) {
  if (!input.eventId) return;
  const { sceneId, statementId } = input.target;
  const scene = snapshot.scenes.find(item => item.scene.id === sceneId);
  const instruction = scene?.instructions.find(item => item.statementId === statementId);
  const [{ ref, revision }] = input.expected;
  if (!instruction || instruction.opcode !== 'say' || instruction.source.documentId !== ref.id) {
    throw new CollaborationError('PREVIEW_TARGET_MISSING', 'Select an existing dialogue statement in the expected scene document.');
  }
  if (instruction.source.revision !== revision) {
    throw new CollaborationError('PREVIEW_TARGET_STALE', 'Reread the scene document and supply its current revision.');
  }
  const source = snapshot.sourceMap.find(item => item.statementId === statementId
    && item.source.documentId === ref.id && item.source.revision === revision && item.source.eventId === input.eventId)?.source;
  if (!source) {
    throw new CollaborationError('PREVIEW_EVENT_MISSING', 'Select an existing dialogue event within the target statement.');
  }
  return source;
}
