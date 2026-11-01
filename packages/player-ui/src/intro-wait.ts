import type { ExecutionToken, RuntimeState, Snapshot } from '@galcraft/contracts';

export function isIntroWait(snapshot: Snapshot, state: RuntimeState, token: ExecutionToken | null): boolean {
  if (state.wait?.kind !== 'animation' || !state.presentation.intro || !token ||
    token.statementId !== state.position.statementId) return false;
  return snapshot.scenes.find(scene => scene.scene.id === state.position.sceneId)?.instructions
    .some(instruction => instruction.statementId === token.statementId && instruction.opcode === 'intro') ?? false;
}
