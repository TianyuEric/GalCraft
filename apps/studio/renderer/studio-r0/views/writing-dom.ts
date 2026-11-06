import type { InlineEvent, Line, Project } from '../model.js';
import { eventLabel, eventNames, imageForExpression, speakerName } from './view-details.js';

export type Point = { lineId: string; offset: number };
export type Span = { start: Point; end: Point };

export function readingText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLElement && (node.contentEditable === 'false' || node.tagName === 'BR')) return '';
  return Array.from(node.childNodes, readingText).join('');
}

function pointAt(root: HTMLElement, node: Node, offset: number): Point | null {
  const row = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-r0-line]');
  const body = row?.querySelector<HTMLElement>('[data-r0-body]');
  if (!row || !body || !root.contains(row)) {
    if (node !== root) return null;
    const after = root.children.item(offset) as HTMLElement | null;
    const before = root.children.item(offset - 1) as HTMLElement | null;
    const boundary = after ?? before;
    if (!boundary?.dataset.r0Line) return null;
    return { lineId: boundary.dataset.r0Line, offset: after ? 0 : readingText(boundary).length };
  }
  if (!body.contains(node)) return { lineId: row.dataset.r0Line!, offset: 0 };
  const prefix = root.ownerDocument.createRange();
  prefix.setStart(body, 0);
  prefix.setEnd(node, offset);
  return { lineId: row.dataset.r0Line!, offset: readingText(prefix.cloneContents()).length };
}

export function getSpan(root: HTMLElement): Span | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const start = pointAt(root, range.startContainer, range.startOffset);
  const end = pointAt(root, range.endContainer, range.endOffset);
  return start && end ? { start, end } : null;
}

function domPoint(root: HTMLElement, point: Point) {
  const body = root.querySelector<HTMLElement>(`[data-r0-line="${CSS.escape(point.lineId)}"] [data-r0-body]`);
  if (!body) return null;
  let remaining = point.offset;
  for (const node of body.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  return { node: body, offset: body.childNodes.length };
}

export function setSpan(root: HTMLElement, span: Span) {
  const start = domPoint(root, span.start), end = domPoint(root, span.end);
  const selection = root.ownerDocument.getSelection();
  if (!start || !end || !selection) return;
  const range = root.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function scrollPointIntoView(root: HTMLElement, point: Point) {
  const scroller = root.parentElement, position = domPoint(root, point);
  if (!scroller || !position) return;
  const range = root.ownerDocument.createRange();
  range.setStart(position.node, position.offset);
  range.collapse(true);
  const caret = range.getClientRects()[0] ?? position.node.parentElement?.getBoundingClientRect();
  if (!caret) return;
  const viewport = scroller.getBoundingClientRect();
  if (caret.top < viewport.top + 8) scroller.scrollTop -= viewport.top + 8 - caret.top;
  else if (caret.bottom > viewport.bottom - 8) scroller.scrollTop += caret.bottom - viewport.bottom + 8;
}

export function positionPlayhead(root: HTMLElement, point: Point | null) {
  root.querySelector('[data-r0-playhead]')?.remove();
  if (!point) return;
  const row = root.querySelector<HTMLElement>(`[data-r0-line="${CSS.escape(point.lineId)}"]`);
  const position = domPoint(root, point);
  if (!row || !position || !row.getClientRects().length) return;
  const range = root.ownerDocument.createRange();
  range.setStart(position.node, position.offset);
  range.collapse(true);
  const caret = range.getClientRects()[0], line = row.getBoundingClientRect();
  if (!caret) return;
  const marker = root.ownerDocument.createElement('span');
  marker.dataset.r0Playhead = '';
  marker.contentEditable = 'false';
  marker.ariaHidden = 'true';
  marker.className = 'gc-r0-writing-playhead';
  marker.style.left = `${caret.left - line.left - row.clientLeft}px`;
  marker.style.top = `${caret.bottom - line.top - 1}px`;
  row.append(marker);
}

export function buildRow(doc: Document, project: Project, line: Line) {
  const row = doc.createElement('div');
  row.dataset.r0Line = line.id;
  row.className = 'gc-r0-writing-row';
  const label = doc.createElement('span');
  label.className = 'gc-r0-writing-label';
  label.contentEditable = 'false';
  const name = speakerName(project, line.speakerId);
  const avatar = line.speakerId && imageForExpression(project, line.speakerId, 'neutral');
  if (avatar) {
    const thumbnail = doc.createElement('span');
    thumbnail.className = 'gc-r0-writing-avatar';
    const image = doc.createElement('img');
    image.src = avatar;
    image.alt = '';
    image.draggable = false;
    thumbnail.append(image);
    label.append(thumbnail);
  }
  const speaker = doc.createElement('strong');
  speaker.textContent = `${name}：`;
  label.append(speaker);
  const body = doc.createElement('span');
  body.dataset.r0Body = '';
  const appendEvent = (event: InlineEvent) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.contentEditable = 'false';
    button.dataset.r0Event = event.id;
    button.className = 'gc-r0-inline-event';
    button.textContent = eventLabel(event);
    button.setAttribute('aria-label', `${eventNames[event.kind]} ${eventLabel(event)}`);
    const symbol = doc.createElement('span');
    symbol.className = 'gc-r0-inline-symbol';
    symbol.ariaHidden = 'true';
    symbol.textContent = { expression: '☺', pause: '◷', sound: '♫' }[event.kind];
    button.prepend(symbol);
    body.append(button);
  };
  let offset = 0;
  for (const event of [...line.events].sort((a, b) => a.offset - b.offset)) {
    body.append(doc.createTextNode(line.text.slice(offset, event.offset)));
    appendEvent(event);
    offset = event.offset;
  }
  body.append(doc.createTextNode(line.text.slice(offset)));
  if (!line.text) body.append(doc.createElement('br'));
  row.append(label, body);
  return row;
}
