import type { ExecutionToken, RuntimeState, Snapshot } from '@galcraft/contracts';

export function isStageAnimationWait(snapshot: Snapshot, state: RuntimeState, current: ExecutionToken | null, completion: ExecutionToken): boolean {
  if (state.wait?.kind !== 'animation' || !current || current.sessionId !== completion.sessionId ||
    current.occurrence !== completion.occurrence || current.statementId !== completion.statementId) return false;
  const instruction = snapshot.scenes.find(scene => scene.scene.id === state.position.sceneId)?.instructions
    .find(instruction => instruction.statementId === current.statementId);
  return !!instruction && instruction.opcode !== 'video';
}
