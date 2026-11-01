import type { Id, LongTerm, RuntimeState, Snapshot, Variable } from '@galcraft/contracts';
import { playerVariableValues } from './variables.js';

export type PlayerObservationRequest = {
  variables?: { id: Id; scope: Variable['scope']; declaringSceneId?: Id | null }[];
  properties?: { pageId: Id; componentId: Id; property: string }[];
};

/** The caller chooses exact identities; a missing local never falls back to a global value. */
export function observeVariables(snapshot: Snapshot, state: RuntimeState | null | undefined, longTerm: LongTerm, requests: NonNullable<PlayerObservationRequest['variables']>) {
  const values = playerVariableValues(snapshot, state, longTerm);
  return requests.map(request => {
    const sceneId = request.scope === 'local' ? request.declaringSceneId ?? null : null;
    const declaration = request.scope === 'local' ? snapshot.scenes.find(scene => scene.scene.id === sceneId)?.scene.locals.find(variable => variable.id === request.id && variable.scope === 'local') : snapshot.variables.find(variable => variable.id === request.id && variable.scope === request.scope);
    const value = request.scope === 'local' && state?.frames.at(-1)?.sceneId !== sceneId ? undefined : values[request.scope][request.id];
    return { id: request.id, scope: request.scope, declaringSceneId: sceneId, name: declaration?.name ?? null,
      type: declaration?.type ?? null, status: !declaration ? 'missingDeclaration' as const : value === undefined ? 'unavailable' as const : 'available' as const,
      value: value ?? null };
  });
}

const properties = new Set(['color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'opacity', 'display', 'visibility', 'width', 'height', 'left', 'top', 'padding', 'gap', 'border-color', 'border-radius', 'transform', 'z-index']);
export function observeProperties(root: HTMLElement, snapshot: Snapshot, requests: NonNullable<PlayerObservationRequest['properties']>, namedStyleDeclarations: (element: HTMLElement, property: string) => boolean) {
  return requests.map(request => {
    const page = snapshot.template.pages.find(page => page.id === request.pageId);
    const element = [...root.querySelectorAll<HTMLElement>('[data-gc-component]')].find(element => element.dataset.gcComponent === request.componentId && element.closest<HTMLElement>('[data-gc-page-id]')?.dataset.gcPageId === request.pageId);
    const allowed = properties.has(request.property);
    if (!page || !element || !allowed) return { ...request, status: !allowed ? 'unsupportedProperty' as const : 'notMounted' as const, value: null, source: { kind: 'unknown' as const } };
    const computed = getComputedStyle(element).getPropertyValue(request.property), inline = element.style.getPropertyValue(request.property);
    // Named CSS, inheritance and browser rules can participate in the cascade. Only claim a source when it is directly established.
    const source = inline && inline === computed && !namedStyleDeclarations(element, request.property)
      ? { kind: 'component' as const, pageId: request.pageId, componentId: request.componentId, declaration: inline }
      : { kind: 'unknown' as const };
    return { ...request, status: 'available' as const, value: computed, source };
  });
}

export type VariableObservation = ReturnType<typeof observeVariables>[number];
export type PropertyObservation = ReturnType<typeof observeProperties>[number];
export type PlayerObservationResult = { status: 'available' | 'privateDomain' | 'notReady'; variables: VariableObservation[]; properties: PropertyObservation[] };
