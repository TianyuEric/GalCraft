export type PlayerPreparationPhase = 'release' | 'fonts' | 'title' | 'opening' | 'ready' | 'error';

/** Actual preparation phases, independent of animation opacity or document onload. */
export function reportPlayerPreparation(root: HTMLElement, phase: PlayerPreparationPhase): void {
  root.dataset.preparation = phase;
  root.dispatchEvent(new CustomEvent('galcraft:preparation', { detail: { phase } }));
}
