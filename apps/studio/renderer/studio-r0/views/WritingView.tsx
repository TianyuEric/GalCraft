import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent, MouseEvent } from 'react';
import { Clock3, Code2, Monitor, Plus, Redo2, Smile, Undo2, Volume2 } from 'lucide-react';
import { createId } from '@galcraft/contracts';
import { useReview, useReviewState } from '../context.js';
import type { InlineEvent, Line } from '../model.js';
import { textBoundary } from './view-details.js';
import { buildRow, getSpan, positionPlayhead, readingText, scrollPointIntoView, setSpan, type Point, type Span } from './writing-dom.js';
import './writing.css';

type Props = { sceneId: string; onOpen?: (viewId: string) => void };
const point = (lineId: string, offset: number): Span => ({ start: { lineId, offset }, end: { lineId, offset } });

function replaceLines(lines: Line[], span: Span, text: string): Point | null {
  const first = lines.findIndex(line => line.id === span.start.lineId);
  const last = lines.findIndex(line => line.id === span.end.lineId);
  if (first < 0 || last < first) return null;
  const lead = lines[first]!, tail = lines[last]!;
  const chunks = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const added = chunks.map((chunk, index): Line => ({
    id: index === 0 ? lead.id : createId(), speakerId: index === 0 ? lead.speakerId : tail.speakerId,
    text: chunk, events: [],
  }));
  const start = added[0]!, end = added.at(-1)!;
  start.text = lead.text.slice(0, span.start.offset) + start.text;
  start.events = lead.events.filter(event => event.offset < span.start.offset);
  const next = { lineId: end.id, offset: end.text.length };
  end.text += tail.text.slice(span.end.offset);
  end.events.push(...tail.events.filter(event => event.offset >= span.end.offset)
    .map(event => ({ ...event, offset: next.offset + event.offset - span.end.offset })));
  lines.splice(first, last - first + 1, ...added);
  return next;
}

export function WritingView({ sceneId, onOpen }: Props) {
  const store = useReview(), { project, ui, canUndo, canRedo } = useReviewState();
  const scene = project.scenes.find(item => item.id === sceneId);
  const root = useRef<HTMLDivElement>(null), composing = useRef(false), pending = useRef<Span | null>(null);
  const lastSpan = useRef<Span | null>(null), signatures = useRef(new Map<string, string>());
  const updating = useRef(false);
  const revealSerial = useRef(0);
  const initialLine = useRef('');
  const [normalizeVersion, normalize] = useReducer((value: number) => value + 1, 0);
  const activeLineId = ui.sceneId === sceneId ? ui.lineId : null;
  const selectedEvent = ui.selected.documentId === sceneId && ui.selected.kind === 'event' ? ui.selected.id : null;
  const playingLineId = ui.preview.sceneId === sceneId && ui.preview.status !== 'stopped' ? ui.preview.lineId : null;

  function updateSelection(span: Span) {
    lastSpan.current = span;
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
    const domSpan = pending.current ?? getSpan(editor);
    const rows = new Map(Array.from(editor.querySelectorAll<HTMLElement>(':scope > [data-r0-line]'), row => [row.dataset.r0Line!, row]));
    let changed = false;
    scene.lines.forEach((line, index) => {
      const speaker = project.characters.find(character => character.id === line.speakerId);
      const signature = JSON.stringify([line, speaker?.name, speaker?.prefix, speaker?.parts]);
      let row = rows.get(line.id);
      if (!row || signatures.current.get(line.id) !== signature) {
        const next = buildRow(editor.ownerDocument, project, line);
        if (row) row.replaceWith(next);
        row = next;
        signatures.current.set(line.id, signature);
        changed = true;
      }
      rows.delete(line.id);
      const neighbor = editor.children.item(index);
      if (neighbor !== row) { editor.insertBefore(row, neighbor); changed = true; }
      row.dataset.number = String(index + 1).padStart(2, '0');
      row.dataset.active = String(activeLineId === line.id);
      row.dataset.playing = String(playingLineId === line.id);
      for (const chip of row.querySelectorAll<HTMLElement>('[data-r0-event]')) chip.setAttribute('aria-pressed', String(chip.dataset.r0Event === selectedEvent));
    });
    for (const [id, row] of rows) { row.remove(); signatures.current.delete(id); changed = true; }
    if (initialLine.current !== sceneId && editor.clientHeight > 0) {
      initialLine.current = sceneId;
      const active = editor.querySelector<HTMLElement>('[data-active="true"]');
      if (active && editor.parentElement) editor.parentElement.scrollTop = Math.max(0, active.offsetTop - editor.parentElement.clientHeight * .55);
    }
    if (domSpan && (changed || pending.current) && editor === editor.ownerDocument.activeElement) {
      updating.current = true;
      setSpan(editor, domSpan);
      if (pending.current) scrollPointIntoView(editor, domSpan.end);
      updating.current = false;
    }
    pending.current = null;
  }, [scene, project, sceneId, activeLineId, selectedEvent, playingLineId, normalizeVersion]);

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
      const span = getSpan(editor);
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

  function editSelection(span: Span, text: string) {
    if (!root.current) return;
    let result: Point | null = null;
    store.edit('编辑文稿', draft => {
      const target = draft.scenes.find(item => item.id === sceneId);
      if (!target) return;
      result = replaceLines(target.lines, span, text);
    });
    if (result) {
      const { lineId, offset } = result as Point;
      pending.current = point(lineId, offset);
      updateSelection(pending.current);
    }
  }

  function readInput() {
    const editor = root.current;
    if (!editor || composing.current) return;
    const span = getSpan(editor) ?? lastSpan.current;
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
      const span = getSpan(editor);
      if (!span) return;
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault(); editSelection(span, '\n');
      } else if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        if (event.inputType === 'historyUndo') store.undo(); else store.redo();
      } else if (span.start.lineId !== span.end.lineId && (event.inputType.startsWith('delete') || event.inputType === 'insertText')) {
        event.preventDefault(); editSelection(span, event.data ?? '');
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
      if (key === 'y' || event.shiftKey) store.redo(); else store.undo();
      return;
    }
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    if (!root.current?.ownerDocument.getSelection()?.isCollapsed) return;
    const span = root.current && getSpan(root.current);
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
    const editor = root.current, span = editor && getSpan(editor);
    if (!span) return;
    event.preventDefault();
    editSelection(span, event.clipboardData.getData('text/plain'));
  }

  function copy(event: ClipboardEvent<HTMLDivElement>, cut = false) {
    const editor = root.current, span = editor && getSpan(editor);
    if (!span || !scene || (span.start.lineId === span.end.lineId && span.start.offset === span.end.offset)) return;
    const first = scene.lines.findIndex(line => line.id === span.start.lineId), last = scene.lines.findIndex(line => line.id === span.end.lineId);
    if (first < 0 || last < first) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', scene.lines.slice(first, last + 1).map((line, index) => line.text.slice(index === 0 ? span.start.offset : 0, first + index === last ? span.end.offset : undefined)).join('\n'));
    if (cut) editSelection(span, '');
  }

  function activate(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const chip = event.target.closest<HTMLElement>('[data-r0-event]');
    const row = event.target.closest<HTMLElement>('[data-r0-line]');
    const line = scene?.lines.find(item => item.id === row?.dataset.r0Line);
    if (!line) return;
    const inline = line.events.find(item => item.id === chip?.dataset.r0Event);
    if (!inline) { if (event.target.closest('.gc-r0-writing-label')) store.selectLine(sceneId, line.id); return; }
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
  if (!scene) return <p className="gc-r0-view-empty">场景已移除</p>;
  return <section className="gc-r0-writing-view">
    <div className="gc-r0-view-toolbar">
      <span className="gc-r0-view-current">文稿</span>
      {onOpen && <><button type="button" onClick={() => onOpen('stage')}><Monitor size={15}/>演出</button><button type="button" onClick={() => onOpen(`source:${sceneId}`)}><Code2 size={15}/>源码</button></>}
      <i aria-hidden="true"/>
      <button type="button" title="撤销 (Ctrl+Z)" aria-label="撤销" disabled={!canUndo} onMouseDown={holdCaret} onClick={() => store.undo()}><Undo2 size={16}/></button>
      <button type="button" title="重做 (Ctrl+Shift+Z)" aria-label="重做" disabled={!canRedo} onMouseDown={holdCaret} onClick={() => store.redo()}><Redo2 size={16}/></button>
      <span className="gc-r0-view-spacer"/>
      <span className="gc-r0-view-meta">{scene.lines.length} 句</span>
    </div>
    <div className="gc-r0-writing-scroll">
      {!scene.lines.length && <div className="gc-r0-writing-empty"><p>这场戏还没有对白。</p><button type="button" onClick={addFirstLine}><Plus size={16}/>添加第一句</button></div>}
      <div ref={root} contentEditable suppressContentEditableWarning role="textbox" aria-label={`${scene.name} 文稿正文`} aria-multiline="true"
        hidden={!scene.lines.length} spellCheck={false} className="gc-r0-writing-editor" onInput={readInput} onKeyDown={keys} onClick={activate} onPaste={paste}
        onCopy={copy} onCut={event => copy(event, true)} onBlur={() => store.endEditGroup()}
        onCompositionStart={() => { composing.current = true; store.endEditGroup(); }}
        onCompositionEnd={() => { composing.current = false; readInput(); store.endEditGroup(); }}/>
    </div>
    <div className="gc-r0-writing-insert" aria-label="插入句内事件">
      <span><Plus size={15}/>插入事件</span>
      <button type="button" onMouseDown={holdCaret} onClick={() => insert('pause')}><Clock3 size={15}/>停顿</button>
      <button type="button" onMouseDown={holdCaret} onClick={() => insert('expression')}><Smile size={15}/>表情</button>
      <button type="button" onMouseDown={holdCaret} onClick={() => insert('sound')}><Volume2 size={15}/>音效</button>
      <span className="gc-r0-view-spacer"/>
      <small><span className="gc-r0-writing-edit-key"/>编辑位置</small><small><span className="gc-r0-writing-play-key"/>播放位置</small>
    </div>
  </section>;
}
