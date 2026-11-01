import type { LongTerm, RuntimeState, Snapshot, Variable } from '@galcraft/contracts';
import type { UIVariableValues } from '@galcraft/templates/editor';

/** Read only the current session/frame and the active profile. Never borrow another scope. */
export function playerVariableValues(snapshot: Pick<Snapshot, 'variables' | 'scenes'>, state: RuntimeState | undefined | null, longTerm: LongTerm): UIVariableValues {
  const values: UIVariableValues = { progress: {}, local: {}, longTerm: {} };
  const frame = state?.frames.at(-1);
  const project = (variable: Variable, value: unknown) => {
    if (typeof value === variable.type) values[variable.scope][variable.id] = value as Variable['initial'];
  };
  for (const variable of snapshot.variables) {
    if (variable.scope === 'progress') project(variable, state?.progress[variable.id]);
    else if (variable.scope === 'longTerm') project(variable, longTerm.variables[variable.id]?.value ?? variable.initial);
  }
  if (frame) for (const variable of snapshot.scenes.find(item => item.scene.id === frame.sceneId)?.scene.locals ?? []) {
    if (variable.scope === 'local') project(variable, frame.locals[variable.id]);
  }
  return values;
}
