/// <reference types="vite/client" />
import { configureMonacoWorkers } from '../../../components/monaco-workers.js';
import * as monaco from 'monaco-editor';
import { connectMonaco, LanguageService, languageId, parse } from '@galcraft/dsl';
import type { CommandSpec, Id, Ref, Variable } from '@galcraft/contracts';
import type { ConditionMetadata } from '@galcraft/dsl';
import type { SceneSource } from '../../../authoring/controller.js';
import { commandRegistry } from './command-preview.js';

export type CandidateSourceReveal = { text: string; offset: number };

type Input = { container: HTMLElement; scene: SceneSource; engineVersion: string; wordWrap: boolean; fontSize: number; fontFamily?: string;
  selectedId: Id | null; documentOffset: number; scroll: { statementId: Id | null; offsetPx: number; scrollLeft: number };
  references: (Ref & { name: string; detail?: string })[]; variables: Variable[]; locale?: string;
  pluginCommands?: CommandSpec[];
  pluginConditions?: readonly ConditionMetadata[];
  onCaret(id: Id | null, documentOffset: number): void; onScroll(id: Id | null, offsetPx: number, scrollLeft: number): void;
  onSelection?(statementIds: Id[], range: { start: number; end: number } | null): void;
  initialText?: string; viewState?: monaco.editor.ICodeEditorViewState | null; readScene(): SceneSource | undefined;
  onDraft(text: string | null): void; onCommit(text: string): Promise<boolean> };

export function mountCandidateScriptEditor(input: Input) {
  configureMonacoWorkers();
  const service = new LanguageService();
  let registry = commandRegistry(input.engineVersion, input.pluginCommands ?? []);
  const connection = connectMonaco(monaco as never, service, model => ({ documentId: input.scene.documentId, revision: input.scene.revision,
    registry, references: input.references, variables: input.variables, pluginConditions: input.pluginConditions, locale:input.locale,
    issues: parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: model.getValue() }).issues }));
  const editor = monaco.editor.create(input.container, { value: input.initialText ?? input.scene.text, language: languageId,
    automaticLayout: true, minimap: { enabled: false }, wordWrap: input.wordWrap ? 'on' : 'off', fontSize: input.fontSize, fontFamily: input.fontFamily,
    ariaLabel: input.scene.name + ' .gal 源码' });
  const model = editor.getModel()!; connection.updateMarkers(model);
  if (input.viewState) {
    editor.restoreViewState(input.viewState);
  } else {
    if (input.selectedId) {
      const node = parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: input.scene.text }).cst.find(item => item.id === input.selectedId);
      if (node) { const position = model.getPositionAt(Math.max(node.start, Math.min(input.documentOffset, node.end))); editor.setPosition(position); editor.revealPositionInCenter(position); }
    }
    if (input.scroll.statementId) {
      const anchor = parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: input.scene.text }).cst.find(item => item.id === input.scroll.statementId);
      if (anchor) editor.setScrollTop(Math.max(0, editor.getTopForLineNumber(model.getPositionAt(anchor.start).lineNumber) - input.scroll.offsetPx));
    }
    editor.setScrollLeft(input.scroll.scrollLeft);
  }
  const cursor = editor.onDidChangeCursorPosition(event => {
    const at = model.getOffsetAt(event.position);
    const node = parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: model.getValue() }).cst.find(item => item.id && item.start <= at && at <= item.end);
    input.onCaret(node?.id ?? null, at);
  });
  const selection = editor.onDidChangeCursorSelection(event => {
    const start = model.getOffsetAt(event.selection.getStartPosition()), end = model.getOffsetAt(event.selection.getEndPosition());
    const statements = parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: model.getValue() }).cst.filter(node => node.valid && node.id && node.start < end && node.end > start).map(node => node.id!);
    input.onSelection?.(statements, start === end ? null : { start, end });
  });
  const scroll = editor.onDidScrollChange(() => {
    const line = editor.getVisibleRanges()[0]?.startLineNumber ?? 1;
    const at = model.getOffsetAt({ lineNumber: line, column: 1 });
    const node = parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: model.getValue() }).cst.find(item => item.id && item.start <= at && at <= item.end);
    input.onScroll(node?.id ?? null, editor.getTopForLineNumber(line) - editor.getScrollTop(), editor.getScrollLeft());
  });
  let syncing = false, userDraft = model.getValue() !== input.scene.text;
  let disposed = false, restoring = false;
  let pending: Promise<boolean> | null = null;
  const change = editor.onDidChangeModelContent(() => {
    connection.updateMarkers(model);
    if (syncing) return;
    const text = model.getValue();
    userDraft = text !== (input.readScene() ?? input.scene).text;
    input.onDraft(userDraft ? text : null);
  });
  function replaceText(text: string, discardUndo = false) {
    const position = editor.saveViewState();
    syncing = true;
    if (discardUndo) model.setValue(text);
    else editor.executeEdits('galcraft-document', [{ range: model.getFullModelRange(), text, forceMoveMarkers: true }]);
    syncing = false;
    if (position) editor.restoreViewState(position);
  }
  function syncScene(scene: SceneSource) {
    const text = model.getValue();
    if (!userDraft && text !== scene.text) replaceText(scene.text);
    if (userDraft && text === scene.text) {
      userDraft = false;
      input.onDraft(null);
    }
  }
  const flush = async () => {
    while (pending) if (!await pending) return false;
    if (disposed || restoring) return false;
    const scene = input.readScene();
    if (!scene) return false;
    syncScene(scene);
    if (!userDraft) return true;
    const text = model.getValue();
    pending = input.onCommit(text).then(applied => {
      const current = applied && !disposed ? input.readScene() : undefined;
      if (current) syncScene(current);
      return applied;
    }).catch(() => false).finally(() => { pending = null; });
    return pending;
  };
  const restore = async () => {
    if (restoring) return;
    restoring = true;
    try {
      await pending;
      const scene = !disposed ? input.readScene() : undefined;
      if (!scene) return;
      replaceText(scene.text, true);
      userDraft = false;
      input.onDraft(null);
    } finally {
      restoring = false;
    }
  };
  function reveal({ text, offset }: CandidateSourceReveal) {
    const normalizeEol = (value: string) => value.replace(/\r\n?|\n/g, model.getEOL());
    const expected = normalizeEol(text), current = model.getValue();
    const bomLength = expected.startsWith('\uFEFF') && !current.startsWith('\uFEFF') ? 1 : 0;
    if (expected.slice(bomLength) !== current) return;
    const position = model.getPositionAt(Math.max(0, normalizeEol(text.slice(0, offset)).length - bomLength));
    editor.layout();
    editor.setPosition(position);
    editor.revealPositionInCenter(position);
    editor.focus();
  }
  return { flush, restore, reveal, saveViewState: () => editor.saveViewState(), update: (next: Input) => {
    input = next;
    registry = commandRegistry(next.engineVersion, next.pluginCommands ?? []);
    editor.updateOptions({ wordWrap: next.wordWrap ? 'on' : 'off', fontSize: next.fontSize, fontFamily: next.fontFamily });
    syncScene(next.scene);
    if (next.selectedId) {
      const parsed = parse({ documentId: next.scene.documentId, revision: next.scene.revision, text: model.getValue() });
      const position = editor.getPosition(), offset = position ? model.getOffsetAt(position) : 0;
      const currentNode = parsed.cst.find(node => node.id && node.start <= offset && offset <= node.end);
      const target = parsed.cst.find(node => node.id === next.selectedId);
      if (target && (currentNode?.id !== target.id || !editor.getVisibleRanges().some(range => range.startLineNumber <= model.getPositionAt(target.start).lineNumber && range.endLineNumber >= model.getPositionAt(target.start).lineNumber))) {
        const at = model.getPositionAt(Math.max(target.start, Math.min(next.documentOffset, target.end))); editor.setPosition(at); editor.revealPositionInCenter(at);
        requestAnimationFrame(() => { if (!disposed && input === next) { editor.layout(); editor.revealPositionInCenter(at); } });
      }
    }
    connection.updateMarkers(model); editor.layout();
  }, dispose: () => {
    disposed = true;
    cursor.dispose(); selection.dispose(); scroll.dispose(); change.dispose(); editor.dispose(); model.dispose(); connection.dispose();
  } };
}
