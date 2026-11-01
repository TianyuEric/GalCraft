import type { ReadingRun } from './reading-style.js';
import { graphemes, sliceDialogueRuns } from '@galcraft/runtime';

/** Measure final styled text in the actual template viewport. No character-count page estimates. */
export function measureNvlPage(body: HTMLElement, runs: readonly ReadingRun[], input: { start: number; shown: number; newParagraph: number; scale: number; paragraphGap: number }): { start: number; end: number } {
  const visible = body.querySelector<HTMLElement>('.gc-dialogue-visible') ?? body, computed = getComputedStyle(visible);
  const probe = document.createElement('div');
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', left: '0', top: '0',
    width: `${body.clientWidth}px`, height: 'auto', maxHeight: 'none', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
    font: computed.font, fontSize: computed.fontSize, fontFamily: computed.fontFamily, fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight, letterSpacing: computed.letterSpacing });
  body.append(probe);
  const total = runs.reduce((count, run) => count + graphemes(run.text).length, 0), height = body.clientHeight;
  if (height <= 0 || body.clientWidth <= 0) { probe.remove(); throw new Error('NVL reading area has no available size'); }
  const fits = (start: number, end: number) => {
    probe.replaceChildren(...sliceDialogueRuns(runs, start, end).map(segment => {
      if(segment.text === '\n\n') { const gap=document.createElement('span');gap.style.display='block';gap.style.height=`${input.paragraphGap}px`;return gap; }
      const span = document.createElement('span'); span.style.color = segment.color ?? ''; span.style.fontSize = segment.fontSize ? `${segment.fontSize * input.scale}px` : '';
      const styled = segment as ReadingRun;
      span.style.fontFamily = styled.fontId ? `var(--gc-font-${styled.fontId}, inherit)` : '';
      span.style.fontWeight = segment.bold === undefined ? '' : segment.bold ? '700' : '400'; span.style.fontStyle = segment.italic === undefined ? '' : segment.italic ? 'italic' : 'normal';
      if (segment.ruby) { const ruby = document.createElement('ruby'), rt = document.createElement('rt'); rt.textContent = segment.ruby; ruby.append(document.createTextNode(segment.text), rt); span.append(ruby); } else span.textContent = segment.text;
      return span;
    })); return probe.getBoundingClientRect().height <= height + .5;
  };
  const endFor = (start: number) => {
    let low = start, high = total;
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (fits(start, middle)) low = middle; else high = middle - 1; }
    return low;
  };
  try {
    let start = input.start, end = endFor(start);
    // A new paragraph starts on a clean page when its first line cannot fit below the old paragraphs.
    if (input.newParagraph > start && end <= input.newParagraph && input.shown <= input.newParagraph) { start = input.newParagraph; end = endFor(start); }
    if (end < input.shown) {
      let low = start, high = input.shown;
      while (low < high) { const middle = Math.floor((low + high) / 2); if (endFor(middle) >= input.shown) high = middle; else low = middle + 1; }
      start = low; end = endFor(start);
    }
    if (end <= start) throw new Error('NVL font size exceeds the reading area');
    return { start, end };
  } finally { probe.remove(); }
}
