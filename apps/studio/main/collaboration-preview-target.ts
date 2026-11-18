import { CollaborationError } from '@galcraft/collaboration';
import { DebugScenarioSchema, IdSchema, PositionSchema, VersionRefSchema, type Snapshot } from '@galcraft/contracts';
import type { ProjectSession } from '@galcraft/documents';
import { z } from 'zod';

export const PreviewRouteFields = {
  entryId: z.string().optional(), target: PositionSchema.optional(),
  route: DebugScenarioSchema.shape.route.optional(), playerInputs: DebugScenarioSchema.shape.playerInputs.optional(),
};
export const DialoguePreviewTargetSchema = z.object({
  eventId: IdSchema,
  target: PositionSchema.extend({ statementId: IdSchema }),
  expected: z.array(VersionRefSchema.extend({ ref: z.strictObject({ kind: z.literal('document'), id: IdSchema }) })).length(1),
});
function dialogueTarget(input: unknown) {
  if (!input || typeof input !== 'object' || !('eventId' in input) || input.eventId === undefined) return;
  return DialoguePreviewTargetSchema.parse(input);
}
export function checkPreviewRevision(project: Pick<ProjectSession, 'readDocument'>, input: unknown) {
  const request = dialogueTarget(input);
  if (!request) return;
  const { ref, revision } = request.expected[0]!;
  if (project.readDocument(ref.id)?.revision !== revision) {
    throw new CollaborationError('PREVIEW_TARGET_STALE', 'Reread the scene document and supply its current revision.');
  }
}

/** Resolve the exact source that the isolated Player will inspect. */
export function resolvePreviewEventSource(snapshot: Snapshot, input: unknown) {
  const request = dialogueTarget(input);
  if (!request) return;
  const { sceneId, statementId } = request.target;
  const scene = snapshot.scenes.find(item => item.scene.id === sceneId);
  const instruction = scene?.instructions.find(item => item.statementId === statementId);
  const { ref, revision } = request.expected[0]!;
  if (!instruction || instruction.opcode !== 'say' || instruction.source.documentId !== ref.id) {
    throw new CollaborationError('PREVIEW_TARGET_MISSING', 'Select an existing dialogue statement in the expected scene document.');
  }
  if (instruction.source.revision !== revision) {
    throw new CollaborationError('PREVIEW_TARGET_STALE', 'Reread the scene document and supply its current revision.');
  }
  const source = snapshot.sourceMap.find(item => item.statementId === statementId
    && item.source.documentId === ref.id && item.source.revision === revision && item.source.eventId === request.eventId)?.source;
  if (!source?.eventId || !source.statementId) {
    throw new CollaborationError('PREVIEW_EVENT_MISSING', 'Select an existing dialogue event within the target statement.');
  }
  return source;
}
