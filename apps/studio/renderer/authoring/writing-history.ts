type TextState = { value: string; start: number; end: number; direction: 'forward' | 'backward' | 'none' };
type Change = { before: TextState; after: TextState; type: string };
/** Local editing history for a writing field that can leave the live DOM. M02 owns applied document history. */
export class WritingHistory {
  private past: Change[] = []; private future: Change[] = []; private group = false;
  boundary() { this.group = false; }
  reset() { this.past = []; this.future = []; this.group = false; }
  record(before: TextState, after: TextState, type: string, composing = false) {
    if (before.value === after.value) return;
    const previous = this.past.at(-1), continued = this.group && previous && previous.after.value === before.value && (composing || type === 'insertText' && previous.type === type && previous.after.start === before.start && before.start === before.end);
    if (continued) previous.after = after; else this.past.push({ before, after, type });
    this.future = []; this.group = composing || type === 'insertText';
  }
  undo(): TextState | null { const change = this.past.pop(); this.boundary(); if (!change) return null; this.future.push(change); return change.before; }
  redo(): TextState | null { const change = this.future.pop(); this.boundary(); if (!change) return null; this.past.push(change); return change.after; }
}
const histories = new WeakMap<HTMLTextAreaElement, WritingHistory>();
export function attachWritingHistory(input: HTMLTextAreaElement): void {
  if (histories.has(input)) return;
  const history = new WritingHistory(); histories.set(input, history);
  const capture = (): TextState => ({ value: input.value, start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection });
  let before = capture(), applying = false, composing = false;
  input.addEventListener('beforeinput', () => { if (!applying) before = capture(); });
  input.addEventListener('input', event => { if (!applying) { history.record(before, capture(), (event as InputEvent).inputType || 'insertText', composing); before = capture(); } });
  input.addEventListener('compositionstart', () => { history.boundary(); composing = true; });
  input.addEventListener('compositionend', () => { composing = false; history.boundary(); });
  input.addEventListener('blur', () => history.boundary()); input.addEventListener('pointerdown', () => history.boundary());
  input.addEventListener('keydown', event => {
    if (event.isComposing || composing || event.altKey) return;
    const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
    if (modifier && (key === 'z' || key === 'y')) {
      event.preventDefault(); event.stopPropagation();
      const state = key === 'y' || event.shiftKey ? history.redo() : history.undo(); if (!state) return;
      applying = true; input.value = state.value; input.setSelectionRange(state.start, state.end, state.direction); input.dispatchEvent(new Event('input', { bubbles: true })); applying = false; before = capture();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(event.key)) history.boundary();
  });
}
export function resetWritingHistory(input: HTMLTextAreaElement): void { histories.get(input)?.reset(); }
