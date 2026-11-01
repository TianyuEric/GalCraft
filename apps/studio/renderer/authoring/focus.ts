export type FocusBookmark = { key: string; start: number | null; end: number | null; direction: 'forward' | 'backward' | 'none' | null; scrollTop: number; scrollLeft: number };

export function markAuthoringFocus(root: HTMLElement): void {
  const counts = new Map<string, number>();
  for (const control of root.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex]')) {
    if (control.dataset.focusKey) continue;
    const statement = control.closest<HTMLElement>('[data-statement-id]')?.dataset.statementId ?? '';
    const field = control.closest<HTMLElement>('[data-field]')?.dataset.field ?? '';
    const region = control.closest('.authoring-inspector') ? 'inspector' : control.closest('.authoring-nav') ? 'nav' : control.closest('.authoring-center') ? 'center' : control.closest('.authoring-editor > .authoring-toolbar') ? 'toolbar' : 'shell';
    const label = control.getAttribute('aria-label') ?? (control instanceof HTMLButtonElement ? control.textContent : '') ?? '';
    const base = `${region}/${statement}/${field}/${control.tagName}/${control instanceof HTMLInputElement ? control.type : ''}/${label}`;
    const ordinal = counts.get(base) ?? 0; counts.set(base, ordinal + 1);
    control.dataset.focusKey = `${base}/${ordinal}`;
  }
}

export function captureAuthoringFocus(root: HTMLElement): FocusBookmark | null {
  // React and portal controls may mount after the shell's last synchronous render.
  markAuthoringFocus(root);
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active) || !active.dataset.focusKey) return null;
  const text = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement && ['text','search','url','tel','password'].includes(active.type) ? active : null;
  return {key:active.dataset.focusKey,start:text?.selectionStart ?? null,end:text?.selectionEnd ?? null,direction:text?.selectionDirection ?? null,scrollTop:active.scrollTop,scrollLeft:active.scrollLeft};
}

export function restoreAuthoringFocus(root: HTMLElement, bookmark: FocusBookmark | null): void {
  if (!bookmark) return;
  const control = [...root.querySelectorAll<HTMLElement>('[data-focus-key]')].find(item => item.dataset.focusKey === bookmark.key);
  if (!control || control.matches(':disabled')) return;
  control.focus({preventScroll:true});
  if (bookmark.start !== null && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) control.setSelectionRange(bookmark.start,bookmark.end,bookmark.direction ?? undefined);
  control.scrollTop=bookmark.scrollTop; control.scrollLeft=bookmark.scrollLeft;
}

export function hasLocalTextHistory(target: HTMLElement): boolean {
  const owner = target.closest<HTMLElement>('[data-local-history]');
  if (owner) return owner.dataset.localHistory !== 'false';
  return Boolean(target.closest('textarea,[contenteditable="true"],.monaco-editor') || target.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"])'));
}
