// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import type { MonacoContext } from '@galcraft/dsl';
import { mountScriptEditor } from './script-editor.js';

const mocks = vi.hoisted(() => ({ create: vi.fn(), connect: vi.fn() }));
vi.mock('monaco-editor', () => ({ editor: { create: mocks.create, setTheme: vi.fn() } }));
vi.mock('../components/monaco-workers.js', () => ({ configureMonacoWorkers: vi.fn() }));
vi.mock('@galcraft/dsl', async importOriginal => ({
  ...await importOriginal<typeof import('@galcraft/dsl')>(), connectMonaco: mocks.connect,
}));

type ScriptInput = Parameters<typeof mountScriptEditor>[0];

function fixture(sceneId: string, documentId: string, name: string) {
  const text = '';
  const model = { getValue: () => text, dispose: vi.fn() };
  const listen = () => ({ dispose: vi.fn() });
  const editor = {
    getModel: () => model, onDidChangeCursorPosition: listen, onDidChangeCursorSelection: listen,
    onDidScrollChange: listen, onDidCompositionStart: listen, onDidCompositionEnd: listen,
    onDidChangeModelContent: listen, onDidBlurEditorText: listen,
    updateOptions: vi.fn(), layout: vi.fn(), setScrollLeft: vi.fn(), dispose: vi.fn(),
  };
  const input: ScriptInput = {
    container: document.createElement('div'), engineVersion: '0.1.0', wordWrap: true, fontSize: 16,
    scene: { sceneId, documentId, name, chapterId: FixtureIds.chapter, text, revision: 1, savedRevision: 1, dirty: false },
    selectedId: null, documentOffset: 0, scroll: { statementId: null, offsetPx: 0, scrollLeft: 0 },
    references: [], variables: [], onCaret() {}, onScroll() {}, onDraft() {}, async onCommit() { return true; },
  };
  return { input, model, editor };
}

it('shares Monaco providers across scene editors and resolves the exact model context', async () => {
  const street = fixture(FixtureIds.street, FixtureIds.streetDocument, 'Street');
  const shop = fixture(FixtureIds.bookshop, FixtureIds.bookshopDocument, 'Bookshop');
  const dispose = vi.fn();
  mocks.connect.mockReturnValue({ updateMarkers: vi.fn(), dispose });
  mocks.create.mockReturnValueOnce(street.editor).mockReturnValueOnce(shop.editor);
  let streetEditor: Awaited<ReturnType<typeof mountScriptEditor>> | undefined;
  let shopEditor: Awaited<ReturnType<typeof mountScriptEditor>> | undefined;
  try {
    streetEditor = await mountScriptEditor(street.input);
    shopEditor = await mountScriptEditor(shop.input);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    const modelContext = mocks.connect.mock.calls[0]![2] as (model: typeof street.model) => MonacoContext;
    expect(modelContext(street.model)).toMatchObject({ documentId: FixtureIds.streetDocument, revision: 1 });
    shopEditor.update({ ...shop.input, scene: { ...shop.input.scene, revision: 2 } });
    expect(modelContext(shop.model)).toMatchObject({ documentId: FixtureIds.bookshopDocument, revision: 2 });
    streetEditor.dispose(); streetEditor = undefined;
    expect(dispose).not.toHaveBeenCalled();
    expect(modelContext(shop.model).documentId).toBe(FixtureIds.bookshopDocument);
    shopEditor.dispose(); shopEditor = undefined;
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    streetEditor?.dispose();
    shopEditor?.dispose();
  }
});
