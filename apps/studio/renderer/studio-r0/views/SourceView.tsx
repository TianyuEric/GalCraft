import { useEffect, useRef } from 'react';
import { AlertCircle, FileText, Redo2, Undo2 } from 'lucide-react';
import * as monaco from 'monaco-editor';
import { configureMonacoWorkers } from '../../components/monaco-workers.js';
import { useReview, useReviewState } from '../context.js';
import { expressionNames, type InlineEvent, type Line, type Project } from '../model.js';
import { textBoundary } from './view-details.js';
import './writing.css';

type Props = { sceneId: string; onOpen?: (viewId: string) => void };
const sameLines = (a: Line[], b: Line[]) => JSON.stringify(a) === JSON.stringify(b);
const format = (lines: Line[]) => '[\n' + lines.map(line => '  ' + JSON.stringify(line)).join(',\n') + '\n]\n';

function validate(text: string, project: Project): Line[] {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('JSON 语法不完整。请检查括号、引号与逗号。'); }
  if (!Array.isArray(value)) throw new Error('场景源码须为对白列表。');
  const used = new Set<string>(), characters = new Set(project.characters.map(item => item.id));
  function id(value: unknown) {
    if (typeof value !== 'string' || !value.trim() || used.has(value)) throw new Error('语句和事件需要唯一、非空的标识。');
    used.add(value);
    return value;
  }
  return value.map((line: Line, index) => {
    const label = `第 ${index + 1} 句`;
    if (!line || typeof line.text !== 'string' || !Array.isArray(line.events) || (line.speakerId !== null && !characters.has(line.speakerId))) throw new Error(`${label}需要有效的说话人、正文和 events 列表。`);
    const lineId = id(line.id);
    const events = line.events.map((event: InlineEvent) => {
      if (!event || !['expression', 'pause', 'sound'].includes(event.kind) || !Number.isInteger(event.offset) || event.offset < 0 || event.offset > line.text.length || event.offset !== textBoundary(line.text, event.offset) || typeof event.value !== 'string' || !Number.isFinite(event.durationMs) || event.durationMs < 0) throw new Error(`${label}存在无效的句内事件或触发位置。`);
      if (event.kind === 'expression' && (!event.characterId || !characters.has(event.characterId) || !Object.hasOwn(expressionNames, event.value))) throw new Error(`${label}的表情事件需要有效的角色和表情。`);
      return { id: id(event.id), kind: event.kind, offset: event.offset, ...(event.characterId ? { characterId: event.characterId } : {}),
        value: event.value, durationMs: event.durationMs };
    });
    return { id: lineId, speakerId: line.speakerId, text: line.text, events };
  });
}

export function SourceView({ sceneId, onOpen }: Props) {
  const store = useReview(), { project, ui, canUndo, canRedo } = useReviewState();
  const scene = project.scenes.find(item => item.id === sceneId);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const model = useRef<monaco.editor.ITextModel | null>(null);
  const syncing = useRef(false);
  const invalidBase = useRef<Line[] | null>(null);
  const draftError = ui.sourceErrors[sceneId];

  useEffect(() => {
    const container = host.current, initial = store.getSnapshot();
    const current = initial.project.scenes.find(item => item.id === sceneId);
    if (!container || !current) return;
    invalidBase.current = initial.ui.sourceErrors[sceneId] ? current.lines : null;
    configureMonacoWorkers();
    const source = monaco.editor.createModel(initial.ui.sourceDrafts[sceneId] ?? format(current.lines), 'json');
    const view = monaco.editor.create(container, { model: source, automaticLayout: true, ariaLabel: `${current.name} 源码`, wordWrap: 'on',
      minimap: { enabled: false }, lineNumbersMinChars: 3, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false,
      folding: true, overviewRulerLanes: 1, theme: initial.ui.theme === 'dark' ? 'vs-dark' : 'vs' });
    if (initial.ui.sceneId === sceneId) {
      const currentId = source.getValue().indexOf(JSON.stringify(initial.ui.lineId));
      if (currentId >= 0) {
        const position = source.getPositionAt(currentId);
        view.setPosition(position);
        view.revealPositionInCenterIfOutsideViewport(position);
      }
    }
    model.current = source;
    editor.current = view;
    const selectFromSource = () => {
      const caret = view.getPosition(), state = store.getSnapshot();
      const scene = state.project.scenes.find(item => item.id === sceneId);
      if (syncing.current || !view.hasTextFocus() || !caret || !scene || state.ui.sourceErrors[sceneId]) return;
      const lineIds = new Map(scene.lines.map(line => [JSON.stringify(line.id), line.id]));
      const offset = source.getOffsetAt(caret);
      let lineId = scene.lines[0]?.id;
      for (const match of source.getValue().matchAll(/"id"\s*:\s*("(?:\\.|[^"\\])*")/g)) {
        const id = lineIds.get(match[1]!);
        if (!id) continue;
        if (match.index > offset && source.getPositionAt(match.index).lineNumber !== caret.lineNumber) break;
        lineId = id;
      }
      if (lineId && (state.ui.sceneId !== sceneId || state.ui.lineId !== lineId || state.ui.focusDocument !== sceneId)) store.selectLine(sceneId, lineId);
    };
    const selection = view.onDidChangeCursorPosition(selectFromSource);
    const focus = view.onDidFocusEditorText(selectFromSource);
    const changes = source.onDidChangeContent(() => {
      if (syncing.current) return;
      const text = source.getValue();
      const current = store.getSnapshot();
      const target = current.project.scenes.find(item => item.id === sceneId);
      if (!target) return;
      try {
        const lines = validate(text, current.project);
        if (invalidBase.current && !sameLines(invalidBase.current, target.lines) && !sameLines(lines, target.lines))
          throw new Error('文稿在源码修正期间已更新。恢复有效源码后再合并草稿。');
        invalidBase.current = null;
        store.updateUi(state => { state.sourceDrafts[sceneId] = text; delete state.sourceErrors[sceneId]; });
        if (!sameLines(lines, target.lines)) store.edit('编辑场景源码', draft => {
          const scene = draft.scenes.find(item => item.id === sceneId);
          if (scene) scene.lines = lines;
        }, `source:${sceneId}`);
      } catch (error) {
        invalidBase.current ??= target.lines;
        const message = error instanceof Error ? error.message : String(error);
        store.updateUi(state => { state.sourceDrafts[sceneId] = text; state.sourceErrors[sceneId] = message; });
      }
    });
    view.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
      if (store.getSnapshot().ui.sourceErrors[sceneId]) void source.undo();
      else store.undo();
    });
    view.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => store.redo());
    view.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => store.redo());
    const blur = view.onDidBlurEditorText(() => store.endEditGroup());
    return () => { changes.dispose(); blur.dispose(); selection.dispose(); focus.dispose(); view.dispose(); source.dispose(); editor.current = null; model.current = null; };
  }, [sceneId, store, Boolean(scene)]);

  useEffect(() => {
    monaco.editor.setTheme(ui.theme === 'dark' ? 'vs-dark' : 'vs');
  }, [ui.theme]);

  useEffect(() => {
    const source = model.current, view = editor.current;
    if (!source || !view || !scene || draftError) return;
    try { if (sameLines(validate(source.getValue(), project), scene.lines)) return; } catch { /* Apply the last accepted scene. */ }
    const text = format(scene.lines), position = view.saveViewState();
    syncing.current = true;
    view.executeEdits('galcraft-r0-shared-document', [{ range: source.getFullModelRange(), text, forceMoveMarkers: true }]);
    syncing.current = false;
    if (position) view.restoreViewState(position);
    if (store.getSnapshot().ui.sourceDrafts[sceneId] !== text) store.updateUi(state => { state.sourceDrafts[sceneId] = text; });
  }, [project, scene, sceneId, draftError, store]);

  function discardDraft() {
    const source = model.current;
    if (!scene || !source) return;
    const text = format(scene.lines);
    invalidBase.current = null;
    syncing.current = true;
    source.setValue(text);
    syncing.current = false;
    store.updateUi(state => { state.sourceDrafts[sceneId] = text; delete state.sourceErrors[sceneId]; });
  }

  if (!scene) return <p className="gc-r0-view-empty">场景已移除</p>;
  return <section className="gc-r0-source-view">
    <div className="gc-r0-view-toolbar">
      {onOpen && <button type="button" onClick={() => onOpen(`writing:${sceneId}`)}><FileText size={15}/>文稿</button>}
      <span className="gc-r0-view-current">源码</span><i aria-hidden="true"/>
      <button type="button" aria-label="撤销源码编辑" disabled={!canUndo || Boolean(draftError)} onClick={() => store.undo()}><Undo2 size={16}/></button>
      <button type="button" aria-label="重做源码编辑" disabled={!canRedo || Boolean(draftError)} onClick={() => store.redo()}><Redo2 size={16}/></button>
      <span className="gc-r0-view-spacer"/><span className="gc-r0-view-meta">场景 JSON</span>
    </div>
    {draftError && <div className="gc-r0-source-diagnostic" role="alert"><AlertCircle size={16}/><span>{draftError} 文稿和舞台仍使用上次有效内容。</span><button type="button" onClick={discardDraft}>恢复有效源码</button></div>}
    <div className="gc-r0-source-editor" ref={host}/>
  </section>;
}
