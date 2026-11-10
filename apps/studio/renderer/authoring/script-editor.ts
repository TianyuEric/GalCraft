/// <reference types="vite/client" />
import { configureMonacoWorkers } from '../components/monaco-workers.js';
import * as monaco from 'monaco-editor';
import { connectMonaco, createCommandRegistry, LanguageService, languageId, parse } from '@galcraft/dsl';
import type { CommandSpec, Id, Ref, Variable } from '@galcraft/contracts';
import type { ConditionMetadata, MonacoContext } from '@galcraft/dsl';
import type { SceneSource } from './controller.js';

type Input = { container: HTMLElement; scene: SceneSource; engineVersion: string; wordWrap: boolean; fontSize: number;
  selectedId: Id | null; documentOffset: number; revealOffset?: number; scroll: { statementId: Id | null; offsetPx: number; scrollLeft: number };
  references: (Ref & { name: string; detail?: string })[]; variables: Variable[]; locale?: string;
  pluginCommands?: CommandSpec[];
  pluginConditions?: readonly ConditionMetadata[];
  onCaret(id: Id | null, documentOffset: number): void; onScroll(id: Id | null, offsetPx: number, scrollLeft: number): void;
  onSelection?(statementIds: Id[], range: { start: number; end: number } | null): void;
  onComposition?(active: boolean): void;
  initialText?: string; onDraft(text: string | null): void; onCommit(text: string): Promise<boolean> };

type LanguageModel = Parameters<Parameters<typeof connectMonaco>[2]>[0];
const languageContexts = new Map<LanguageModel, () => MonacoContext>();
const unboundContext: MonacoContext = { documentId: '000000', revision: 0, registry: new Map(), references: [], variables: [], issues: [] };
let languageConnection: ReturnType<typeof connectMonaco> | null = null;

function releaseLanguageIfIdle(): void {
  if (languageContexts.size) return;
  languageConnection?.dispose();
  languageConnection = null;
}

export async function mountScriptEditor(input: Input): Promise<{ flush(): Promise<boolean>; update(next: Input): void; dispose(): void }> {
  configureMonacoWorkers();
  let registry = createCommandRegistry(input.engineVersion, input.pluginCommands ?? []);
  // Monaco providers apply to every model of a language, including the other visible scene panes.
  const connection = languageConnection ??= connectMonaco(monaco as never, new LanguageService(),
    model => languageContexts.get(model)?.() ?? unboundContext);
  let editor: ReturnType<typeof monaco.editor.create>;
  try {
    editor = monaco.editor.create(input.container, { value: input.initialText ?? input.scene.text, language: languageId,
      automaticLayout: true, minimap: { enabled: false }, wordWrap: input.wordWrap ? 'on' : 'off', fontSize: input.fontSize,
      theme: input.container.closest('[data-theme="dark"]') ? 'vs-dark' : 'vs' });
  } catch (error) {
    releaseLanguageIfIdle(); throw error;
  }
  const model = editor.getModel()!;
  languageContexts.set(model, () => ({ documentId: input.scene.documentId, revision: input.scene.revision,
    registry, references: input.references, variables: input.variables, pluginConditions: input.pluginConditions, locale: input.locale,
    issues: parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: model.getValue() }).issues }));
  connection.updateMarkers(model);
  const reveal = (offset: number) => {
    const position = model.getPositionAt(offset);
    editor.setPosition(position);
    editor.revealPositionInCenter(position);
  };
  if (input.revealOffset !== undefined) reveal(input.revealOffset);
  else if (input.selectedId) {
    const node = parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: input.scene.text }).cst.find(item => item.id === input.selectedId);
    if (node) reveal(Math.max(node.start, Math.min(input.documentOffset, node.end)));
  }
  if (input.revealOffset === undefined && input.scroll.statementId) {
    const anchor = parse({ documentId: input.scene.documentId, revision: input.scene.revision, text: input.scene.text }).cst.find(item => item.id === input.scroll.statementId);
    if (anchor) editor.setScrollTop(Math.max(0, editor.getTopForLineNumber(model.getPositionAt(anchor.start).lineNumber) - input.scroll.offsetPx));
  }
  if (input.revealOffset === undefined) editor.setScrollLeft(input.scroll.scrollLeft);
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
  let committed = input.scene.text;
  let composing = false;
  const compositionStart = editor.onDidCompositionStart(() => { composing = true; input.onComposition?.(true); });
  const compositionEnd = editor.onDidCompositionEnd(() => { composing = false; input.onComposition?.(false); });
  let syncing = false, userDraft = input.initialText !== undefined && input.initialText !== input.scene.text;
  const change = editor.onDidChangeModelContent(() => { connection.updateMarkers(model); if (!syncing) userDraft = model.getValue() !== committed; input.onDraft(userDraft ? model.getValue() : null); });
  let scheduled = committed;
  let pending = Promise.resolve(true);
  const flush = async () => {
    if (composing) return false;
    if (!userDraft) {
      if (scheduled !== committed) {
        await pending;
        if (userDraft) return flush();
      }
      input.onDraft(null); return true;
    }
    const text = model.getValue();
    if (text !== scheduled) { scheduled = text; pending = pending.then(async () => {
      if (await input.onCommit(text)) { committed = text; userDraft = model.getValue() !== committed; input.onDraft(userDraft ? model.getValue() : null); return true; }
      scheduled = committed; input.onDraft(text); return false;
    }).catch(() => { scheduled = committed; input.onDraft(text); return false; }); }
    const result = await pending; input.onDraft(userDraft ? model.getValue() : null); return result && !userDraft;
  };
  const blur = editor.onDidBlurEditorText(() => { if (input.container.isConnected && input.container.getClientRects().length && model.getValue() !== committed) void flush(); });
  return { flush, update: next => {
    const pendingDraft = userDraft || scheduled !== committed;
    input = next;
    registry = createCommandRegistry(next.engineVersion, next.pluginCommands ?? []);
    monaco.editor.setTheme(next.container.closest('[data-theme="dark"]') ? 'vs-dark' : 'vs');
    editor.updateOptions({ wordWrap: next.wordWrap ? 'on' : 'off', fontSize: next.fontSize });
    if (!pendingDraft && model.getValue() !== next.scene.text) {
      const position = editor.saveViewState();
      committed = scheduled = next.scene.text;
      syncing = true;
      editor.executeEdits('galcraft-document', [{ range: model.getFullModelRange(), text: next.scene.text, forceMoveMarkers: true }]);
      syncing = false; userDraft = false;
      if (position) editor.restoreViewState(position);
      input.onDraft(null);
    }
    if (next.revealOffset !== undefined) reveal(next.revealOffset);
    else if (next.selectedId) {
      const parsed = parse({ documentId: next.scene.documentId, revision: next.scene.revision, text: model.getValue() });
      const position = editor.getPosition(), offset = position ? model.getOffsetAt(position) : 0;
      const currentNode = parsed.cst.find(node => node.id && node.start <= offset && offset <= node.end);
      const target = parsed.cst.find(node => node.id === next.selectedId);
      if (target && (currentNode?.id !== target.id || !editor.getVisibleRanges().some(range => range.startLineNumber <= model.getPositionAt(target.start).lineNumber && range.endLineNumber >= model.getPositionAt(target.start).lineNumber))) {
        const at = model.getPositionAt(Math.max(target.start, Math.min(next.documentOffset, target.end))); editor.setPosition(at); editor.revealPositionInCenter(at);
        requestAnimationFrame(() => { if (input === next) { editor.layout(); editor.revealPositionInCenter(at); } });
      }
    }
    connection.updateMarkers(model); editor.layout();
  }, dispose: () => {
    input.onDraft(userDraft ? model.getValue() : null);
    if (composing) input.onComposition?.(false);
    cursor.dispose(); selection.dispose(); scroll.dispose(); change.dispose(); blur.dispose(); compositionStart.dispose(); compositionEnd.dispose();
    languageContexts.delete(model);
    editor.dispose(); model.dispose(); releaseLanguageIfIdle();
  } };
}
