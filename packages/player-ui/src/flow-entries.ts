import type { Flow, Id, RuntimeState, Snapshot } from '@galcraft/contracts';

/** Local conditions only observe the current top frame in their declared scene. */
export function flowLocalContext(snapshot: Snapshot, node: Flow['nodes'][number], state: RuntimeState | null): boolean {
  const localIds = new Set<Id>();
  const scan = (value: typeof node.unlock): void => {
    if (value.kind === 'variable' && value.scope === 'local') localIds.add(value.id);
    if (value.kind === 'unary') scan(value.value);
    if (value.kind === 'binary') { scan(value.left); scan(value.right); }
    if (value.kind === 'call') value.args.forEach(scan);
  };
  scan(node.unlock);
  if (!localIds.size) return true;
  const scenes = snapshot.scenes.filter(scene => scene.scene.locals.some(variable => localIds.has(variable.id)) ||
    scene.scene.parameters.some(parameter => localIds.has(parameter.variableId)));
  return scenes.length === 1 && state?.frames.at(-1)?.sceneId === scenes[0]!.scene.id;
}

export function flowPositionLabel(snapshot: Snapshot, position: { sceneId: Id; statementId: Id | null }): string {
  const scene = snapshot.scenes.find(scene => scene.scene.id === position.sceneId);
  const instruction = scene?.instructions.find(instruction => instruction.statementId === position.statementId);
  const text = instruction?.args && typeof instruction.args === 'object' && !Array.isArray(instruction.args) &&
    typeof instruction.args.text === 'string' ? instruction.args.text : '';
  return [scene?.scene.name ?? position.sceneId, text || position.statementId].filter(Boolean).join(' · ');
}
