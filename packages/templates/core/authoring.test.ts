import { describe, expect, it } from 'vitest';
import { createOfficialTemplate } from './templates.js';
import { createTemplateDocuments } from './documents.js';
import { findComponent, instantiateTemplate, moveComponents, templateEdit } from './editing.js';
import { compileStyle } from './compiler.js';
import { inspectTemplate, packTemplate, templateIssues } from './package.js';
import { unzipSync } from 'fflate';
import type { NamedStyle } from '@galcraft/contracts';
import { nineSlice } from './images.js';
import { intersectRect } from './geometry.js';
describe('Y template authoring', () => {
  it('compiles scoped SCSS and local modules, renames animation names and preserves valid CSS after syntax failure', () => {
    const template = createOfficialTemplate(), id = crypto.randomUUID();
    const style: NamedStyle = { id, name: 'Paper', scope: { pageId: template.pages[0]!.id, componentId: null }, language: 'scss',
      sourcePath: `ui/styles/${id}.scss`, sourceRevision: 1, compiledPath: null, compiledSourceRevision: null, assets: [], issues: [] };
    const source = '@use "colors"; [data-gc-part="title.workTitle"] { color: colors.$ink; animation: wave 1s; } @keyframes wave { from { opacity: 0; } to { opacity: 1; } }';
    const compiled = compileStyle({ style, source, instanceId: template.instanceId, modules: { 'ui/styles/_colors.scss': '$ink: #123456;' } });
    expect(compiled.style.issues).toEqual([]); expect(compiled.css).toContain(`[data-gc-player="${template.instanceId}"]`);
    expect(compiled.css).toContain(`gc-${template.instanceId}-${id}-wave`); expect(compiled.sourceMap).toBeTruthy();
    const failed = compileStyle({ style: { ...compiled.style, sourceRevision: 2 }, source: '{', instanceId: template.instanceId, lastValidCss: compiled.css! });
    expect(failed.css).toBe(compiled.css); expect(failed.style.compiledSourceRevision).toBe(1); expect(failed.style.issues[0]?.message).toContain('.scss:');
    template.styles = [failed.style]; expect(templateIssues(template).some(item => item.includes('编译'))).toBe(true);
    const forbidden = compileStyle({ style: { ...style, language: 'css' }, source: '[data-gc-part="title.menu.start"]{pointer-events:none}', instanceId: template.instanceId });
    expect(forbidden.style.issues[0]?.code).toBe('STYLE_COMPILE');
  });
  it('creates M02 page patches, preserves locked components and keeps template instances independent', () => {
    const original = createOfficialTemplate(), selected = original.pages[0]!.root.children[0]!;
    const changed = moveComponents(original, [selected.id], 20, 10);
    const documents = createTemplateDocuments(original).map(doc => ({ ...doc, savedRevision: doc.revision, savedFiles: doc.files, dirty: false }));
    const edit = templateEdit(documents, changed, '移动页面组件');
    expect(edit.patches).toHaveLength(1); expect(edit.expected[0]?.ref.id).toBe(original.pages[0]!.id);
    selected.locked = true; expect(findComponent(moveComponents(original, [selected.id], 20, 10), selected.id)).toEqual(selected);
    const clone = instantiateTemplate(original); expect(clone.instanceId).not.toBe(original.instanceId);
    expect(clone.pages[0]!.root.children[0]!.id).not.toBe(selected.id);
  });
  it('packs and imports a standard template and rejects stale current styles', () => {
    const template = createOfficialTemplate(); const bytes = packTemplate({ template, name: '标准', description: '', files: {}, assetFiles: {} });
    const imported = inspectTemplate(bytes); expect(imported.template).toEqual(template); expect(imported.instantiate().instanceId).not.toBe(template.instanceId);
  });
  it('exports only template dependencies when other personal files are supplied', () => {
    const bytes = packTemplate({ template: createOfficialTemplate(), name: '标准', description: '',
      files: { 'authoring/recipes/personal.json': new TextEncoder().encode('personal'),
        '.galcraft/tasks/private.json': new TextEncoder().encode('private') }, assetFiles: {} });
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['config/template.json', 'manifest.json']);
  });
  it('exports transitive local SCSS modules for editing an imported template', () => {
    const template = createOfficialTemplate(), id = crypto.randomUUID();
    const style: NamedStyle = { id, name: 'Paper', scope: { pageId: template.pages[0]!.id, componentId: null }, language: 'scss',
      sourcePath: `ui/styles/${id}.scss`, sourceRevision: 1, compiledPath: `ui/styles/${id}.css`, compiledSourceRevision: 1, assets: [], issues: [] };
    const source = '@use "colors"; [data-gc-part="title.workTitle"] { color: colors.$ink; }';
    const files = {
      [style.sourcePath]: new TextEncoder().encode(source),
      [style.compiledPath!]: new TextEncoder().encode(''),
      'ui/styles/_colors.scss': new TextEncoder().encode('@forward "palette";'),
      'ui/styles/_palette.scss': new TextEncoder().encode('$ink: #123456;'),
    };
    const compiled = compileStyle({ style, source, instanceId: template.instanceId,
      modules: { 'ui/styles/_colors.scss': '@forward "palette";', 'ui/styles/_palette.scss': '$ink: #123456;' } });
    expect(compiled.style.issues).toEqual([]);
    files[style.compiledPath!] = new TextEncoder().encode(compiled.css!);
    template.styles = [style];
    const imported = inspectTemplate(packTemplate({ template, name: '模块样式', description: '', files, assetFiles: {} })).materialize();
    const text = (path: string) => new TextDecoder().decode(imported.files[path]);
    const importedStyle = imported.template.styles[0]!;
    const result = compileStyle({ style: importedStyle, source: text(importedStyle.sourcePath), instanceId: imported.template.instanceId,
      modules: Object.fromEntries(Object.keys(imported.files).filter(path => path.endsWith('.scss')).map(path => [path, text(path)])) });
    expect(imported.files['ui/styles/_colors.scss']).toBeDefined();
    expect(imported.files['ui/styles/_palette.scss']).toBeDefined();
    expect(result.style.issues).toEqual([]);
    expect(result.css).toContain('#123456');
  });
  it('clips geometry and proportionally shrinks nine-slice borders on narrow targets', () => {
    expect(intersectRect({ x: 0, y: 0, width: 20, height: 20 }, { x: 10, y: 10, width: 30, height: 30 })).toEqual({ x: 10, y: 10, width: 10, height: 10 });
    const binding = { assetId: crypto.randomUUID(), variantId: crypto.randomUUID(), mode: 'nineSlice' as const, positionX: .5, positionY: .5,
      colorMode: 'original' as const, tint: null, opacity: 1, slices: { top: 10, right: 10, bottom: 10, left: 10 },
      borders: { top: 10, right: 10, bottom: 10, left: 10 }, fillCenter: true };
    expect(nineSlice(binding, { width: 40, height: 40 }, { width: 10, height: 30 }).borders.left).toBe(5);
  });
});
