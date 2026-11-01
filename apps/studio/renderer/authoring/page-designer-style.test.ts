import { afterEach, expect, test, vi } from 'vitest';
import { createId, type DocumentView, type NamedStyle, type RuntimeTemplate } from '@galcraft/contracts';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { createTemplateDocuments } from '@galcraft/templates';
import { compileStyle } from '@galcraft/templates/compiler';

const monacoState = vi.hoisted(() => ({ editors: [] as FakeEditor[], languages: [] as string[] }));
type FakeModel = { value: string; language: string; getValue(): string; setValue(value: string): void;
  getPositionAt(offset: number): { lineNumber: number; column: number }; getFullModelRange(): object; dispose(): void };
type FakeEditor = { model: FakeModel; view: object; executeEdits: ReturnType<typeof vi.fn>;
  saveViewState: ReturnType<typeof vi.fn>; restoreViewState: ReturnType<typeof vi.fn>; change?: () => void };

vi.mock('monaco-editor', () => ({
  Uri: { parse: (value: string) => value }, MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
  editor: {
    defineTheme: vi.fn(),
    createModel: (value: string, language: string) => ({ value, language, getValue() { return this.value; },
      setValue(value: string) { this.value = value; monacoState.editors.find(editor => editor.model === this)?.change?.(); },
      getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }), getFullModelRange: () => ({}), dispose: vi.fn() }),
    create: (_source: unknown, options: { model: FakeModel }) => {
      const editor: FakeEditor = { model: options.model, view: { lineNumber: 3, column: 7, scrollTop: 42 },
        executeEdits: vi.fn((_source: string, edits: { text: string }[]) => options.model.setValue(edits[0]!.text)),
        saveViewState: vi.fn(() => editor.view), restoreViewState: vi.fn((view: object) => { editor.view = view; }) };
      monacoState.editors.push(editor);
      return { ...editor, onDidChangeModelContent: (change: () => void) => { editor.change = change; return { dispose: vi.fn() }; },
        setPosition: vi.fn(), revealPositionInCenter: vi.fn(), focus: vi.fn(), dispose: vi.fn() };
    },
    setModelLanguage: (model: FakeModel, language: string) => { model.language = language; monacoState.languages.push(language); },
    setModelMarkers: vi.fn(),
  },
}));
vi.mock('../components/monaco-workers.js', () => ({ configureMonacoWorkers: () => {} }));
vi.mock('./player-preview.js', () => ({ openPlayerPreview: vi.fn() }));
vi.mock('./asset-picker.js', () => ({ openAssetPicker: () => {} }));
import { PageDesigner } from './page-designer.js';

class Element {
  dataset:Record<string,string>={};
  style={setProperty:vi.fn()};
  children: Element[] = []; parentElement: Element | null = null; className = ''; textContent = ''; ariaLabel = ''; value = ''; hidden = false;
  onclick?: () => void; onchange?: () => void;
  classList = { add: vi.fn(), remove: vi.fn() };
  constructor(readonly tagName = 'div') {}
  append(...children: Element[]) { this.children.push(...children); for (const child of children) child.parentElement = this; }
  replaceChildren(...children: Element[]) { this.children = []; this.append(...children); }
  querySelector(selector: string): Element | null {
    for (const child of this.children) { if (child.className.split(' ').includes(selector.slice(1))) return child;
      const found = child.querySelector(selector); if (found) return found; }
    return null;
  }
  closest() { return null; }
  setAttribute() {}
  addEventListener(type:string,run:()=>void) { if(type==='click')this.onclick=run; }
  focus() {}
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
}

const documentsFor = (template: RuntimeTemplate, files: Record<string, string>): DocumentView[] =>
  [...createTemplateDocuments(template), { documentId: createId(template), revision: 1, format: 'json' as const, files }]
    .map(doc => ({ ...doc, savedRevision: doc.revision, savedFiles: doc.files, dirty: false }));
function fixture(sourceRevision = 1, language: NamedStyle['language'] = 'scss') {
  const template = structuredClone(FixtureSnapshot.template), page = template.pages.find(page => page.key === 'title')!;
  const style: NamedStyle = { id: createId(template), name: '标题样式', activation: 'page', scope: { pageId: page.id, componentId: null },
    language, sourcePath: 'ui/styles/title.scss', sourceRevision, compiledPath: 'ui/styles/title.css', compiledSourceRevision: sourceRevision,
    assets: [], issues: [] };
  template.styles = [style];
  const source = '@use "./palette.scss" as palette;\n[data-gc-part="title.menu.start"] { color: palette.$color; }';
  return { template, style, source, files: { [style.sourcePath]: source, [style.compiledPath!]: 'last-valid-blue', 'ui/styles/palette.scss': '$color: #466b92;' } };
}
type Harness = { root: Element; styleDrafts: Record<string, string>; styleEditor(): void; reload(): Promise<void>; history(action: 'undo' | 'redo'): Promise<void> };
function setup(initial: ReturnType<typeof fixture>) {
  vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag), createElementNS: (_ns:string,tag:string)=>new Element(tag) }); vi.stubGlobal('HTMLDialogElement', class {});
  const root = new Element(), center = new Element(); center.className = 'designer-center'; root.append(center);
  let current = documentsFor(initial.template, initial.files);
  const compile = vi.fn(async (_input: Parameters<typeof compileStyle>[0]): Promise<{ ok: boolean; value?: ReturnType<typeof compileStyle>; error?: { message: string }; issues: [] }> =>
    ({ ok: false, error: { message: 'stop before applying' }, issues: [] }));
  let undoDocuments = current;
  const designer = Object.assign(Object.create(PageDesigner.prototype), { root, locale: 'zh-CN', page: 'title', template: initial.template,
    documents: current, selected: new Set(), styleDrafts: {}, styleEditors: new Map(), canvas: new Element(), notice: new Element(),
    lastUndo: initial.style.id, redoPlan: null, changed: async () => {}, drawTree: () => {}, drawInspector: () => {}, preview: async () => {},
    services: { compileStyle: compile, bridge: { documents: {
      list: async () => ({ ok: true, value: current }), planUndo: async () => ({ ok: true, value: { planId: 'style-undo' } }),
      undo: async () => { current = undoDocuments; return { ok: true, value: {} }; },
    } } },
  }) as Harness;
  const setDocuments = (next: ReturnType<typeof fixture>) => { current = documentsFor(next.template, next.files); };
  const setUndo = (next: ReturnType<typeof fixture>) => { undoDocuments = documentsFor(next.template, next.files); };
  const panel = () => center.children.find(child => child.className === 'designer-style-workspace')!;
  const apply = () => panel().children.find(child => child.className === 'designer-style-actions')!.children.find(child => child.tagName === 'button' && child.textContent === '编译并应用')!.onclick!();
  return { designer, compile, setDocuments, setUndo, panel, apply };
}
afterEach(() => { monacoState.editors.length = 0; monacoState.languages.length = 0; vi.unstubAllGlobals(); });

test('a cached SCSS editor compiles with the latest package modules and last valid CSS', async () => {
  const initial = fixture(), harness = setup(initial); harness.designer.styleEditor();
  const latest = structuredClone(initial); latest.files['ui/styles/palette.scss'] = '$color: #227755;';
  latest.files[latest.style.compiledPath!] = 'last-valid-green'; latest.style.sourceRevision = 4;
  harness.setDocuments(latest); await harness.designer.reload(); harness.designer.styleEditor(); harness.apply();
  await vi.waitFor(() => expect(harness.compile).toHaveBeenCalledOnce());
  const input = harness.compile.mock.calls[0]![0];
  expect(input.modules?.['ui/styles/palette.scss']).toBe('$color: #227755;');
  expect(input.lastValidCss).toBe('last-valid-green'); expect(input.style.sourceRevision).toBe(5);
  const compiled = compileStyle(input); expect(compiled.style.issues).toEqual([]); expect(compiled.css).toContain('#227755');
  expect(compileStyle({ ...input, source: '[data-gc-part=' }).css).toBe('last-valid-green');
  expect(monacoState.editors).toHaveLength(1);
});

test('M02 undo synchronizes clean cached source and language without replacing its model or caret', async () => {
  const initial = fixture(4), harness = setup(initial); harness.designer.styleEditor();
  const editor = monacoState.editors[0]!, view = editor.view, model = editor.model, panel = harness.panel();
  const undone = structuredClone(initial); undone.style.language = 'css'; undone.style.sourceRevision = 1; undone.style.compiledSourceRevision = 1;
  undone.files[undone.style.sourcePath] = `[data-gc-part="${undone.template.pages[0]!.root.part}"] { color: #224466; }`;
  harness.setUndo(undone); await harness.designer.history('undo'); harness.designer.styleEditor();
  expect(editor.model).toBe(model); expect(model.getValue()).toBe(undone.files[undone.style.sourcePath]); expect(model.language).toBe('css');
  expect(harness.panel()).toBe(panel); expect(monacoState.editors).toHaveLength(1); expect(harness.designer.styleDrafts).toEqual({});
  expect(editor.executeEdits).toHaveBeenCalledOnce(); expect(editor.restoreViewState).toHaveBeenCalledWith(view); expect(editor.view).toBe(view);
  harness.apply(); await vi.waitFor(() => expect(harness.compile).toHaveBeenCalledOnce());
  expect(harness.compile.mock.calls[0]![0].style).toMatchObject({ language: 'css', sourceRevision: 2 });
});

test('M02 reload keeps unapplied invalid input, local language and editor history', async () => {
  const initial = fixture(4), harness = setup(initial); harness.designer.styleEditor();
  const editor = monacoState.editors[0]!, view = editor.view, invalid = '[data-gc-part="button"] { color:';
  editor.model.setValue(invalid);
  const language = harness.panel().children.find(child => child.className === 'designer-style-controls')!.children.find(child => child.tagName === 'select')!; language.value = 'css'; language.onchange!();
  const undone = structuredClone(initial); undone.style.sourceRevision = 1; undone.style.compiledSourceRevision = 1;
  undone.files[undone.style.sourcePath] = '[data-gc-part="button"] { color: red; }';
  harness.setUndo(undone); await harness.designer.history('undo'); harness.designer.styleEditor();
  expect(editor.model.getValue()).toBe(invalid); expect(editor.model.language).toBe('css'); expect(language.value).toBe('css');
  expect(editor.executeEdits).not.toHaveBeenCalled(); expect(editor.restoreViewState).not.toHaveBeenCalled(); expect(editor.view).toBe(view);
  expect(Object.values(harness.designer.styleDrafts)).toEqual([invalid]); expect(monacoState.editors).toHaveLength(1);
  harness.apply(); await vi.waitFor(() => expect(harness.compile).toHaveBeenCalledOnce());
  expect(harness.compile.mock.calls[0]![0]).toMatchObject({ source: invalid, style: { language: 'css', sourceRevision: 2 } });
});

test('returning local text to its applied baseline lets the next reload synchronize it', async () => {
  const initial = fixture(), harness = setup(initial); harness.designer.styleEditor();
  const model = monacoState.editors[0]!.model; model.setValue('invalid {'); model.setValue(initial.source);
  expect(harness.designer.styleDrafts).toEqual({});
  const latest = structuredClone(initial); latest.files[latest.style.sourcePath] = `${initial.source}\n/* updated by page AI */`;
  harness.setDocuments(latest); await harness.designer.reload();
  expect(model.getValue()).toBe(latest.files[latest.style.sourcePath]); expect(harness.designer.styleDrafts).toEqual({});
});

test('a successful style application clears its local draft so M02 undo synchronizes the same model', async () => {
  const initial = fixture(), harness = setup(initial); harness.designer.styleEditor(); harness.setUndo(initial);
  const model = monacoState.editors[0]!.model, appliedSource = `${initial.source}\n/* local change */`;
  model.setValue(appliedSource);
  harness.compile.mockImplementationOnce(async input => ({ ok: true, value: compileStyle(input), issues: [] }));
  Object.assign(harness.designer, { apply: vi.fn(async () => {
    const compiled = compileStyle(harness.compile.mock.calls[0]![0]), next = structuredClone(initial);
    next.style = compiled.style; next.template.styles = [compiled.style];
    next.files[next.style.sourcePath] = appliedSource; next.files[next.style.compiledPath!] = compiled.css!;
    harness.setDocuments(next); await harness.designer.reload();
  }) });
  harness.apply(); await vi.waitFor(() => expect(harness.designer.styleDrafts).toEqual({}));
  expect(model.getValue()).toBe(appliedSource);
  await harness.designer.history('undo');
  expect(model.getValue()).toBe(initial.source); expect(monacoState.editors).toHaveLength(1); expect(harness.designer.styleDrafts).toEqual({});
});


test('typing during style compilation remains an unapplied draft after the frozen source commits', async () => {
  const initial=fixture(),harness=setup(initial);harness.designer.styleEditor();
  const model=monacoState.editors[0]!.model,first=initial.source+'\n/* requested */',latest=initial.source+'\n/* typed while compiling */';
  model.setValue(first);
  let complete!: (value: Awaited<ReturnType<typeof harness.compile>>) => void;
  harness.compile.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const applied=vi.fn(async()=>{});Object.assign(harness.designer,{apply:applied});
  harness.apply();await vi.waitFor(()=>expect(harness.compile).toHaveBeenCalledOnce());
  model.setValue(latest);complete({ok:true,value:compileStyle(harness.compile.mock.calls[0]![0]),issues:[]});
  await vi.waitFor(()=>expect(applied).toHaveBeenCalledOnce());
  await vi.waitFor(()=>expect(Object.values(harness.designer.styleDrafts)).toEqual([latest]));
  expect(harness.compile.mock.calls[0]![0].source).toBe(first);expect(model.getValue()).toBe(latest);
});
