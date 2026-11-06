import { CandidateButton, CandidateIconButton, CandidateInput, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent, MouseEvent } from 'react';
import { ChevronDown, ChevronUp, Clock3, Monitor, Plus, Redo2, Search, Smile, Undo2, Volume2, X } from 'lucide-react';
import { createId } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import { useCandidate, useCandidateState } from '../application/context.js';
import type { InlineEvent } from '../../../studio-r0/model.js';
import { textBoundary } from '../../../studio-r0/views/view-details.js';
import { buildRow, getSpan, positionPlayhead, readingText, scrollPointIntoView, setSpan, type Point, type Span } from '../../../studio-r0/views/writing-dom.js';
import '../styles/writing.css';

type Props = { sceneId: string; onOpen?: (viewId: string) => void };
const point = (lineId: string, offset: number): Span => ({ start: { lineId, offset }, end: { lineId, offset } });
export type WritingReturn = { position: { span: Span | null; scroll: number }; serial: number };
type Match = { lineId: string; offset: number };
const highlightName = 'gc-candidate-writing-find';
const searchRanges = new WeakMap<Document, Map<HTMLElement, Range>>();

function markMatch(root: HTMLElement, match: Match | undefined, length: number) {
  const active = root.querySelector<HTMLElement>('[data-find-current]');
  active?.removeAttribute('data-find-current');
  const row = match && root.querySelector<HTMLElement>(`[data-r0-line="${CSS.escape(match.lineId)}"]`);
  row?.setAttribute('data-find-current', 'true');
  if (typeof Highlight !== 'function' || !CSS.highlights) return;
  const ranges = searchRanges.get(root.ownerDocument) ?? new Map<HTMLElement, Range>();
  searchRanges.set(root.ownerDocument, ranges);
  ranges.delete(root);
  const body = row && row.querySelector('[data-r0-body]');
  if (match && body) {
    const locate = (offset: number) => {
      for (const node of body.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const size = node.textContent?.length ?? 0;
        if (offset <= size) return { node, offset };
        offset -= size;
      }
      return null;
    };
    const start = locate(match.offset), end = locate(match.offset + length);
    if (start && end) {
      const range = root.ownerDocument.createRange();
      range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
      ranges.set(root, range);
    }
  }
  if (ranges.size) CSS.highlights.set(highlightName, new Highlight(...ranges.values()));
  else CSS.highlights.delete(highlightName);
}

// The shared writing DOM maps ordinary dialogue ranges. A click or Select All
// can also put a boundary beside a read-only command; map it to adjacent prose.
function writingSpan(root: HTMLElement): Span | null {
  const span = getSpan(root);
  if (span) return span;
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const at = (node: Node, offset: number): Point | null => {
    const element = node instanceof Element ? node : node.parentElement;
    const marker = element?.closest<HTMLElement>('[data-writing-command]');
    const row = element?.closest<HTMLElement>('[data-r0-line]');
    if (row && row.parentElement === root) {
      const body = row.querySelector('[data-r0-body]')!;
      const prefix = root.ownerDocument.createRange();
      prefix.setStart(body, 0);
      if (body.contains(node)) prefix.setEnd(node, offset);
      return { lineId: row.dataset.r0Line!, offset: readingText(prefix.cloneContents()).length };
    }
    if (node !== root && marker?.parentElement !== root) return null;
    const boundary = node === root ? offset : Array.prototype.indexOf.call(root.children, marker);
    const siblings = Array.from(root.children) as HTMLElement[];
    const after = siblings.slice(boundary).find(item => item.dataset.r0Line);
    if (after) return { lineId: after.dataset.r0Line!, offset: 0 };
    const before = siblings.slice(0, boundary).reverse().find(item => item.dataset.r0Line);
    return before ? { lineId: before.dataset.r0Line!, offset: readingText(before).length } : null;
  };
  const start = at(range.startContainer, range.startOffset), end = at(range.endContainer, range.endOffset);
  return start && end ? { start, end } : null;
}

export function CandidateWritingView({ sceneId, onOpen }: Props) {
  const store = useCandidate(), { project, ui } = useCandidateState();
  const { canUndo, canRedo } = store.history(sceneId);
  const scene = project.scenes.find(item => item.id === sceneId);
  const formalScene=store.graphSceneSource(sceneId), readOnly=store.sourceReadOnly(sceneId);
  const documentId = formalScene?.documentId, revision = formalScene?.revision, text = formalScene?.text;
  const statements = useMemo(() => {
    if (!documentId || revision === undefined || text === undefined) return [];
    let line = 1, newline = text.indexOf('\n');
    return parse({ documentId, revision, text }).cst.flatMap(node => {
      if (!node.valid || !node.id || !node.command) return [];
      if (node.command !== 'say') while (newline >= 0 && newline < node.start) { line++; newline = text.indexOf('\n', newline + 1); }
      return [{ id: node.id, command: node.command, line }];
    });
  }, [documentId, revision, text]);
  const root = useRef<HTMLDivElement>(null), composing = useRef(false), pending = useRef<Span | null>(null);
  const lastSpan = useRef<Span | null>(null), signatures = useRef(new Map<string, string>());
  const updating = useRef(false);
  const compositionSpan = useRef<Span | null>(null), finishingComposition = useRef(false);
  const revealSerial = useRef(0);
  const returnSerial = useRef(0);
  const initialLine = useRef('');
  const [normalizeVersion, normalize] = useReducer((value: number) => value + 1, 0);
  const [editError, setEditError] = useState('');
  const [findOpen, setFindOpen] = useState(false), [term, setTerm] = useState(''), [replacement, setReplacement] = useState(''), [matchIndex, setMatchIndex] = useState(0);
  const findField = useRef<HTMLInputElement>(null), findTrigger = useRef<HTMLButtonElement>(null);
  const findResume = useRef<{ span: Span | null; scroll: number } | null>(null);
  const activeLineId = ui.sceneId === sceneId ? ui.lineId : null;
  const selectedEvent = ui.selected.documentId === sceneId && ui.selected.kind === 'event' ? ui.selected.id : null;
  const playingLineId = ui.preview.sceneId === sceneId && ui.preview.status !== 'stopped' ? ui.preview.lineId : null;
  const matches = useMemo<Match[]>(() => findOpen && term ? (scene?.lines ?? []).flatMap(line => {
    const hits: Match[] = [];
    for (let at = line.text.indexOf(term); at >= 0; at = line.text.indexOf(term, at + term.length)) hits.push({ lineId: line.id, offset: at });
    return hits;
  }) : [], [scene?.lines, term, findOpen]);
  const matchAt = matches.length ? matchIndex % matches.length : 0;
  const match = matches[matchAt];

  function updateSelection(span: Span) {
    lastSpan.current = span;
    store.rememberWriting(sceneId, { span, scroll: root.current?.parentElement?.scrollTop ?? 0 });
    const now = store.getSnapshot().ui;
    if (now.focusDocument === sceneId && now.sceneId === sceneId && now.lineId === span.start.lineId && now.selection?.start === span.start.offset && now.selection?.end === span.end.offset) return;
    store.updateUi(state => {
      state.sceneId = sceneId;
      state.lineId = span.start.lineId;
      state.focusDocument = sceneId;
      if (!(state.selected.kind === 'event' && state.selected.documentId === sceneId && state.selected.lineId === span.start.lineId))
        state.selected = { kind: 'line', documentId: sceneId, id: span.start.lineId };
      state.selection = { lineId: span.start.lineId, start: span.start.offset, end: span.start.lineId === span.end.lineId ? span.end.offset : span.start.offset };
    });
  }

  useLayoutEffect(() => {
    const editor = root.current;
    if (!editor || !scene || composing.current) return;
    const domSpan = pending.current ?? writingSpan(editor);
    const rows = new Map(Array.from(editor.querySelectorAll<HTMLElement>(':scope > [data-r0-line]'), row => [row.dataset.r0Line!, row]));
    const markers = new Map(Array.from(editor.querySelectorAll<HTMLElement>(':scope > [data-writing-command]'), marker => [marker.dataset.writingCommand!, marker]));
    const lineRows = new Map<string, HTMLElement>();
    let changed = false;
    scene.lines.forEach((line, index) => {
      const speaker = project.characters.find(character => character.id === line.speakerId);
      const signature = JSON.stringify([line, speaker?.name, speaker?.prefix, speaker?.parts]);
      let row = rows.get(line.id);
      if (!row || signatures.current.get(line.id) !== signature) {
        const next = buildRow(editor.ownerDocument, project, line);
        for (const element of [next, ...next.querySelectorAll<HTMLElement>('[class]')]) {
          element.className = element.className.replaceAll('gc-r0-', 'gc-candidate-');
        }
        if (row) row.replaceWith(next);
        row = next;
        signatures.current.set(line.id, signature);
        changed = true;
      }
      rows.delete(line.id);
      lineRows.set(line.id, row);
      row.dataset.number = String(index + 1).padStart(2, '0');
      row.dataset.active = String(activeLineId === line.id);
      row.dataset.playing = String(playingLineId === line.id);
      for (const chip of row.querySelectorAll<HTMLElement>('[data-r0-event]')) chip.setAttribute('aria-pressed', String(chip.dataset.r0Event === selectedEvent));
    });
    for (const [id, row] of rows) { row.remove(); signatures.current.delete(id); changed = true; }
    const children = statements.flatMap(({ id, command, line }) => {
      if (command === 'say') {
        const row = lineRows.get(id);
        lineRows.delete(id);
        return row ? [row] : [];
      }
      let marker = markers.get(id);
      if (!marker) {
        marker = editor.ownerDocument.createElement('div');
        marker.className = 'gc-candidate-writing-marker';
        marker.dataset.writingCommand = id;
        marker.contentEditable = 'false';
        const button = editor.ownerDocument.createElement('button');
        button.className = 'gc-candidate-button';
        button.type = 'button';
        button.title = '在完整指令列表定位';
        const name = editor.ownerDocument.createElement('span');
        const meta = editor.ownerDocument.createElement('small');
        button.append(name, meta);
        marker.append(button);
      }
      const button = marker.firstElementChild as HTMLButtonElement;
      const name = command;
      if (button.children[0]!.textContent !== name) button.children[0]!.textContent = name;
      const location = `源码第 ${line} 行`;
      if (button.children[1]!.textContent !== location) button.children[1]!.textContent = location;
      button.setAttribute('aria-label', `定位指令 ${name} · ${location}`);
      button.disabled = !onOpen;
      markers.delete(id);
      return [marker];
    });
    for (const marker of markers.values()) { marker.remove(); changed = true; }
    [...children, ...lineRows.values()].forEach((child, index) => {
      const neighbor = editor.children.item(index);
      if (neighbor !== child) { editor.insertBefore(child, neighbor); changed = true; }
    });
    if (initialLine.current !== sceneId && editor.clientHeight > 0) {
      initialLine.current = sceneId;
      const remembered = store.writingPosition(sceneId);
      if (remembered && editor.parentElement) {
        editor.parentElement.scrollTop = remembered.scroll;
        if (remembered.span && scene.lines.some(line => line.id === remembered.span!.start.lineId) && scene.lines.some(line => line.id === remembered.span!.end.lineId)) {
          lastSpan.current = remembered.span;
          if (store.getSnapshot().activeView === `writing:${sceneId}`) { editor.focus({ preventScroll: true }); setSpan(editor, remembered.span); }
        }
      } else {
        const active = editor.querySelector<HTMLElement>('[data-active="true"]');
        if (active && editor.parentElement) editor.parentElement.scrollTop = Math.max(0, active.offsetTop - editor.parentElement.clientHeight * .55);
      }
    }
    if (domSpan && (changed || pending.current) && editor === editor.ownerDocument.activeElement) {
      updating.current = true;
      setSpan(editor, domSpan);
      if (pending.current) scrollPointIntoView(editor, domSpan.end);
      updating.current = false;
    }
    pending.current = null;
  }, [scene, project, sceneId, activeLineId, selectedEvent, playingLineId, normalizeVersion, statements, store, onOpen]);

  useLayoutEffect(() => {
    const editor = root.current;
    if (!editor || composing.current) return;
    const draw = () => positionPlayhead(editor, playingLineId ? { lineId: playingLineId, offset: ui.preview.offset } : null);
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(editor);
    return () => resize.disconnect();
  }, [scene, playingLineId, ui.preview.offset, normalizeVersion]);

  useEffect(() => {
    const editor = root.current;
    if (!editor) return;
    const doc = editor.ownerDocument;
    const select = () => {
      if (updating.current || composing.current || doc.activeElement !== editor) return;
      const span = writingSpan(editor);
      if (span) updateSelection(span);
    };
    doc.addEventListener('selectionchange', select);
    return () => doc.removeEventListener('selectionchange', select);
  }, [sceneId, store, Boolean(scene)]);

  useLayoutEffect(() => {
    const reveal = ui.reveal;
    const editor = root.current;
    if (!editor || reveal?.sceneId !== sceneId || reveal.serial === revealSerial.current) return;
    const row = editor.querySelector<HTMLElement>(`[data-r0-line="${CSS.escape(reveal.lineId)}"]`);
    if (!row) return;
    revealSerial.current = reveal.serial;
    editor.focus({ preventScroll: true });
    const target = point(reveal.lineId, reveal.offset);
    setSpan(editor, target);
    scrollPointIntoView(editor, target.end);
    lastSpan.current = target;
  }, [sceneId, ui.reveal]);

  const writingReturn = store.viewState<WritingReturn>(`search:return:${sceneId}`);
  useLayoutEffect(() => {
    const editor = root.current;
    if (!editor || !writingReturn || writingReturn.serial === returnSerial.current || store.getSnapshot().activeView !== `writing:${sceneId}`) return;
    returnSerial.current = writingReturn.serial;
    store.rememberViewState(`search:return:${sceneId}`, undefined);
    const { span, scroll } = writingReturn.position;
    editor.focus({ preventScroll: true });
    if (span) { setSpan(editor, span); lastSpan.current = span; }
    if (editor.parentElement) editor.parentElement.scrollTop = scroll;
  }, [sceneId, writingReturn, store]);

  useLayoutEffect(() => {
    const editor = root.current;
    if (!editor) return;
    markMatch(editor, findOpen ? match : undefined, term.length);
    if (findOpen && match) scrollPointIntoView(editor, match);
    return () => markMatch(editor, undefined, 0);
  }, [findOpen, match, normalizeVersion, term.length]);

  useLayoutEffect(() => {
    if (findOpen) { findField.current?.focus(); findField.current?.select(); }
  }, [findOpen]);

  function showFind() {
    if (findOpen) { findField.current?.focus(); findField.current?.select(); return; }
    const editor = root.current;
    const span = editor && writingSpan(editor) || lastSpan.current;
    findResume.current = { span, scroll: editor?.parentElement?.scrollTop ?? 0 };
    if (span && span.start.lineId === span.end.lineId && span.end.offset > span.start.offset) {
      const line = scene?.lines.find(line => line.id === span.start.lineId);
      if (line) { setTerm(line.text.slice(span.start.offset, span.end.offset)); setMatchIndex(0); }
    }
    setFindOpen(true);
  }

  function closeFind() {
    setFindOpen(false);
    const editor = root.current, original = findResume.current;
    if (!editor || editor.hidden || !original) { findTrigger.current?.focus(); return; }
    editor.focus({ preventScroll: true });
    if (original.span) { setSpan(editor, original.span); lastSpan.current = original.span; }
    if (editor.parentElement) editor.parentElement.scrollTop = original.scroll;
  }

  function moveMatch(step: number) {
    if (matches.length) setMatchIndex((matchAt + step + matches.length) % matches.length);
  }

  function replaceMatches(all: boolean) {
    if (!match || readOnly || replacement === term) return;
    const group = all ? `writing-find:${sceneId}` : '';
    const targets = all ? [...matches].reverse() : [match];
    let position: Point | null = null;
    store.endEditGroup();
    try {
      for (const target of targets) {
        const span = { start: target, end: { lineId: target.lineId, offset: target.offset + term.length } };
        const result = store.replaceTextSelection(sceneId, span, replacement, group);
        if (result) position = result;
      }
    } finally { store.endEditGroup(); }
    if (position && findResume.current) findResume.current.span = point(position.lineId, position.offset);
    if (all) setMatchIndex(0);
    else if (replacement.includes(term)) moveMatch(1);
  }

  function findKeys(event: KeyboardEvent<HTMLElement>) {
    if (composing.current || event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault(); event.stopPropagation(); showFind();
    } else if (findOpen && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeFind();
    }
  }

  function editSelection(span: Span, text: string, group = '') {
    if (!root.current) return;
    const before = store.getSnapshot().ui;
    const result = store.replaceTextSelection(sceneId, span, text, group);
    if (result) {
      setEditError('');
      const { lineId, offset } = result as Point;
      pending.current = point(lineId, offset);
      updateSelection(pending.current);
    } else {
      const after = store.getSnapshot().ui;
      if (after !== before && after.notice) setEditError(after.notice);
    }
  }

  function readInput() {
    const editor = root.current;
    if (!editor || composing.current || finishingComposition.current) return;
    const span = writingSpan(editor) ?? lastSpan.current;
    if (!span) return;
    const row = editor.querySelector<HTMLElement>(`[data-r0-line="${CSS.escape(span.start.lineId)}"] [data-r0-body]`);
    if (!row) return;
    pending.current = span;
    const before = store.getSnapshot().project.scenes.find(item => item.id === sceneId)?.lines.find(line => line.id === span.start.lineId);
    if (before && before.events.length !== row.querySelectorAll('[data-r0-event]').length) {
      signatures.current.delete(before.id);
      normalize();
    }
    store.updateText(sceneId, span.start.lineId, readingText(row));
    updateSelection(span);
  }

  useEffect(() => {
    const editor = root.current;
    if (!editor) return;
    const before = (event: InputEvent) => {
      if (composing.current || event.isComposing || !event.cancelable) return;
      let span = writingSpan(editor);
      if (!span) return;
      if (event.inputType.startsWith('delete')) {
        const target = event.getTargetRanges()[0];
        if (target) {
          const range = editor.ownerDocument.createRange();
          range.setStart(target.startContainer, target.startOffset); range.setEnd(target.endContainer, target.endOffset);
          const selection = editor.ownerDocument.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
          span = writingSpan(editor) ?? span;
        }
      }
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault(); editSelection(span, '\n');
      } else if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        if (event.inputType === 'historyUndo') store.undo(sceneId); else store.redo(sceneId);
      } else if (event.inputType === 'insertText' || event.inputType.startsWith('delete')) {
        event.preventDefault(); editSelection(span, event.data ?? '', `text:${sceneId}:${span.start.lineId}`);
      } else if (event.inputType.startsWith('format')) event.preventDefault();
    };
    editor.addEventListener('beforeinput', before);
    return () => editor.removeEventListener('beforeinput', before);
  }, [sceneId, store, Boolean(scene)]);

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (composing.current || event.nativeEvent.isComposing) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
      event.preventDefault(); event.stopPropagation();
      if (key === 'y' || event.shiftKey) store.redo(sceneId); else store.undo(sceneId);
      return;
    }
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    if (!root.current?.ownerDocument.getSelection()?.isCollapsed) return;
    const span = root.current && writingSpan(root.current);
    if (!span || !scene || span.start.lineId !== span.end.lineId || span.start.offset !== span.end.offset) return;
    const index = scene.lines.findIndex(line => line.id === span.start.lineId);
    const line = scene.lines[index], previous = scene.lines[index - 1], next = scene.lines[index + 1];
    if (event.key === 'Backspace' && span.start.offset === 0 && previous) {
      event.preventDefault(); editSelection({ start: { lineId: previous.id, offset: previous.text.length }, end: span.end }, '');
    } else if (event.key === 'Delete' && span.end.offset === line?.text.length && next) {
      event.preventDefault(); editSelection({ start: span.start, end: { lineId: next.id, offset: 0 } }, '');
    }
  }

  function paste(event: ClipboardEvent<HTMLDivElement>) {
    const editor = root.current, span = editor && writingSpan(editor);
    if (!span) return;
    event.preventDefault();
    editSelection(span, event.clipboardData.getData('text/plain'));
  }

  function copy(event: ClipboardEvent<HTMLDivElement>, cut = false) {
    const editor = root.current, span = editor && writingSpan(editor);
    if (!span || !scene || (span.start.lineId === span.end.lineId && span.start.offset === span.end.offset)) return;
    const first = scene.lines.findIndex(line => line.id === span.start.lineId), last = scene.lines.findIndex(line => line.id === span.end.lineId);
    if (first < 0 || last < first) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', scene.lines.slice(first, last + 1).map((line, index) => line.text.slice(index === 0 ? span.start.offset : 0, first + index === last ? span.end.offset : undefined)).join('\n'));
    if (cut) editSelection(span, '');
  }

  function activate(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const command = event.target.closest<HTMLElement>('[data-writing-command]')?.dataset.writingCommand;
    if (command) { store.selectCommand(sceneId, command); onOpen?.(`commands:${sceneId}`); return; }
    const chip = event.target.closest<HTMLElement>('[data-r0-event]');
    const row = event.target.closest<HTMLElement>('[data-r0-line]');
    const line = scene?.lines.find(item => item.id === row?.dataset.r0Line);
    if (!line) return;
    const inline = line.events.find(item => item.id === chip?.dataset.r0Event);
    if (!inline) { if (event.target.closest('.gc-candidate-writing-label')) store.selectLine(sceneId, line.id); return; }
    store.selectLine(sceneId, line.id, inline.offset);
    store.select({ kind: 'event', documentId: sceneId, id: inline.id, lineId: line.id });
    lastSpan.current = point(line.id, inline.offset);
  }

  function insert(kind: InlineEvent['kind']) {
    const position = lastSpan.current?.start ?? (ui.selection && { lineId: ui.selection.lineId, offset: ui.selection.start });
    const line = scene?.lines.find(item => item.id === position?.lineId) ?? scene?.lines.find(item => item.id === ui.lineId) ?? scene?.lines[0];
    if (!line) return;
    const offset = textBoundary(line.text, position?.lineId === line.id ? position.offset : 0);
    store.selectLine(sceneId, line.id, offset);
    store.insertEvent(sceneId, line.id, kind, offset);
  }

  const holdCaret = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();
  function addFirstLine() {
    const id = createId();
    store.edit('添加对白', draft => {
      const target = draft.scenes.find(item => item.id === sceneId);
      if (target && !target.lines.length) target.lines.push({ id, speakerId: null, text: '', events: [] });
    });
    store.revealLine(sceneId, id);
  }
  if (!scene) return <CandidateState kind="empty" title="场景已移除"/>;
  return <section className="gc-candidate-writing-view" onKeyDown={findKeys}>
    <CandidateToolbar className="gc-candidate-view-toolbar" label="文稿工具">
      {onOpen && <CandidateButton type="button" onClick={() => onOpen('stage')}><Monitor size={15}/>舞台</CandidateButton>}
      <span className="gc-candidate-writing-divider" aria-hidden="true"/>
      <CandidateIconButton type="button" title="撤销 (Ctrl+Z)" label="撤销" disabled={!canUndo} onMouseDown={holdCaret} onClick={() => store.undo(sceneId)}><Undo2 size={16}/></CandidateIconButton>
      <CandidateIconButton type="button" title="重做 (Ctrl+Shift+Z)" label="重做" disabled={!canRedo} onMouseDown={holdCaret} onClick={() => store.redo(sceneId)}><Redo2 size={16}/></CandidateIconButton>
      <CandidateIconButton ref={findTrigger} type="button" title="查找文稿 (Ctrl+F)" label="查找文稿" aria-expanded={findOpen} onMouseDown={holdCaret} onClick={findOpen ? closeFind : showFind}><Search size={16}/></CandidateIconButton>
      <span className="gc-candidate-view-spacer"/>
      <span className="gc-candidate-view-meta">{scene.lines.length} 句</span>
    </CandidateToolbar>
    {findOpen && <div className="gc-candidate-writing-find" role="search" aria-label="当前场景文稿查找">
      <div>
        <CandidateInput density="compact" ref={findField} type="search" aria-label="查找文字" placeholder="查找当前场景文稿" value={term} onChange={event => { setTerm(event.target.value); setMatchIndex(0); }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1); } }}/>
        <span role="status">{term ? matches.length ? `${matchAt + 1} / ${matches.length}` : '无结果' : '当前场景'}</span>
        <CandidateIconButton type="button" label="上一个匹配" title="上一个匹配 (Shift+Enter)" disabled={!matches.length} onClick={() => moveMatch(-1)}><ChevronUp size={16} aria-hidden="true"/></CandidateIconButton>
        <CandidateIconButton type="button" label="下一个匹配" title="下一个匹配 (Enter)" disabled={!matches.length} onClick={() => moveMatch(1)}><ChevronDown size={16} aria-hidden="true"/></CandidateIconButton>
        <CandidateIconButton type="button" label="关闭文稿查找" title="关闭 (Esc)" onClick={closeFind}><X size={16} aria-hidden="true"/></CandidateIconButton>
      </div>
      <div>
        <CandidateInput density="compact" type="text" aria-label="替换文字" placeholder="替换为" value={replacement} disabled={readOnly} onChange={event => setReplacement(event.target.value)}/>
        <CandidateButton variant="secondary" type="button" disabled={readOnly || !match || replacement === term} onClick={() => replaceMatches(false)}>替换当前</CandidateButton>
        <CandidateButton type="button" disabled={readOnly || !match || replacement === term} onClick={() => replaceMatches(true)}>替换全部</CandidateButton>
      </div>
    </div>}
    {readOnly ? <div className="gc-candidate-writing-notice" role="status">{store.sourceRecoveryNotice(sceneId)}</div>
      : editError && <div className="gc-candidate-writing-notice" role="alert">{editError}</div>}
    <div className="gc-candidate-writing-scroll" onScroll={event => store.rememberWriting(sceneId, { span: lastSpan.current, scroll: event.currentTarget.scrollTop })}>
      <div ref={root} contentEditable={!readOnly && !!scene.lines.length} aria-readonly={readOnly || !scene.lines.length} suppressContentEditableWarning role="textbox" aria-label={`${scene.name} 文稿正文`} aria-multiline="true"
        hidden={!scene.lines.length && !statements.length} data-empty={!scene.lines.length} spellCheck={false} style={{fontSize:store.controller.preferences.editor.fontSize,lineHeight:1.5,fontFamily:store.controller.preferences.editor.fontFamily,whiteSpace:store.controller.preferences.editor.wordWrap?'pre-wrap':'pre'}} className="gc-candidate-writing-editor" onInput={readInput} onKeyDown={keys} onClick={activate} onPaste={paste}
        onCopy={copy} onCut={event => copy(event, true)} onBlur={() => store.endEditGroup()}
        onCompositionStart={() => { compositionSpan.current = root.current && writingSpan(root.current); composing.current = true; store.endEditGroup(); }}
        onCompositionEnd={event => {
          composing.current = false; finishingComposition.current = true;
          const span = compositionSpan.current; compositionSpan.current = null;
          signatures.current.clear();
          if (span && event.data) editSelection(span, event.data);
          else if (span) { pending.current = span; updateSelection(span); }
          normalize(); store.endEditGroup();
          queueMicrotask(() => { finishingComposition.current = false; });
        }}/>
      {!scene.lines.length && <div className="gc-candidate-writing-empty"><CandidateState kind="empty" title="这场戏还没有对白" action={<CandidateButton variant="secondary" disabled={readOnly} onClick={addFirstLine}><Plus size={16}/>添加第一句</CandidateButton>}/></div>}
    </div>
    <CandidateToolbar className="gc-candidate-writing-insert" label="插入句内事件">
      <span>句内事件</span>
      <CandidateButton type="button" disabled={readOnly||!scene.lines.length} onMouseDown={holdCaret} onClick={() => insert('pause')}><Clock3 size={15}/>停顿</CandidateButton>
      <CandidateButton type="button" disabled={readOnly||!scene.lines.length} onMouseDown={holdCaret} onClick={() => insert('expression')}><Smile size={15}/>表情</CandidateButton>
      <CandidateButton type="button" disabled={readOnly||!scene.lines.length} onMouseDown={holdCaret} onClick={() => insert('sound')}><Volume2 size={15}/>音效</CandidateButton>
      <span className="gc-candidate-view-spacer"/>
      <small><span className="gc-candidate-writing-edit-key"/>编辑位置</small><small><span className="gc-candidate-writing-play-key"/>播放位置</small>
    </CandidateToolbar>
  </section>;
}
