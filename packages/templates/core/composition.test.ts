import { expect, it } from 'vitest';
import { createOfficialTemplate } from './templates.js';
import { createTemplateDocuments } from './documents.js';
import { components } from './editing.js';
import { prepareComposition, type UIComposition } from './composition.js';
import { compileStyle } from './compiler.js';

function fixture() {
  const template = createOfficialTemplate({ kind: 'standard' }), page = template.pages[0]!, component = components(page.root).find(item => item.part === 'title.workTitle')!;
  const composition: UIComposition = { id: crypto.randomUUID(), revision: 1, planId: crypto.randomUUID(), candidateId: crypto.randomUUID(), baseVersions: [], resources: [], propertyOwners: [], issues: [], proposal: { summary: '文字样式', config: [], styles: [], assets: [] } };
  const style = (source: string) => ({ key: 'style', styleId: null, name: '文字', scope: { pageId: page.id, componentId: null }, language: 'css' as const, source, dependsOn: [] });
  const config = (path: string, value: any) => ({ key: 'config', pageId: page.id, componentId: component.id, path, operation: 'set' as const, value, dependsOn: [] });
  const run = (resolveStyleMatches?: Parameters<typeof prepareComposition>[0]['resolveStyleMatches']) => prepareComposition({ composition, documents: createTemplateDocuments(template).map(document => ({ ...document, savedFiles: document.files, savedRevision: document.revision, dirty: false })), keys: ['config', 'style'], assets: new Map(), validateAsset: () => true, resolveStyleMatches });
  return { template, page, component, composition, style, config, run };
}
it('expands CSS shorthands and configuration paths to the same property ownership', () => {
  const f = fixture(); f.composition.proposal.config = [f.config('normal.borderWidth', 2)];
  f.composition.proposal.styles = [f.style('[data-gc-part="title.workTitle"] {border: 1px solid red}')];
  expect(() => f.run()).toThrow('多个修改来源');
  f.composition.proposal.config = [f.config('layout.padding.left', 2)]; f.composition.proposal.styles = [f.style('[data-gc-part="title.workTitle"] {padding: 4px}')];
  expect(() => f.run()).toThrow('多个修改来源');
});
it('maps page background fields to CSS ownership and rejects overlapping style changes', () => {
  const f = fixture();
  f.composition.proposal.config = [{ ...f.config('background.imageId', null), componentId: null }];
  expect(f.run().propertyOwners).toEqual([{ pageId: f.page.id, componentId: f.page.root.id, state: 'normal', property: 'background-image', owner: 'config', changeKey: 'config' }]);
  f.composition.proposal.styles = [f.style(`[data-gc-component="${f.page.root.id}"] { background-image: none; }`)];
  expect(() => f.run()).toThrow('多个修改来源');
  f.composition.proposal.config = [{ ...f.config('background.color', '#112233'), componentId: null }];
  f.composition.proposal.styles = [f.style(`[data-gc-component="${f.page.root.id}"] { background: red; }`)];
  expect(() => f.run()).toThrow('多个修改来源');
});
it('attributes rules to matching components and states, retaining one source within a style', () => {
  const f = fixture(); f.composition.proposal.config = [f.config('normal.color', 'red')];
  f.composition.proposal.styles = [f.style('[data-gc-part="title.description"] {color:blue} [data-gc-part="title.workTitle"]:hover {color:green;color:black}')];
  const result = f.run(); expect(result.propertyOwners.filter(owner => owner.componentId === f.component.id && owner.state === 'hover')).toHaveLength(1);
  expect(result.propertyOwners.filter(owner => owner.componentId === f.component.id && owner.state === 'normal')).toHaveLength(1);
});
it('keeps configuration pending when an existing CSS rule would hide it', () => {
  const f = fixture(), id = crypto.randomUUID();
  const source = '[data-gc-part="title.workTitle"] {color:blue}';
  const compiled = compileStyle({ style: { id, name: '已有覆盖', scope: { pageId: f.page.id, componentId: null }, language: 'css', sourcePath: `ui/styles/${id}.css`, sourceRevision: 1, compiledSourceRevision: null, compiledPath: `ui/styles/${id}.compiled.css`, assets: [], issues: [] }, source, instanceId: f.template.instanceId });
  f.template.styles = [compiled.style]; f.composition.proposal.config = [f.config('normal.color', 'red')];
  const documents = createTemplateDocuments(f.template).map(document => ({ ...document, savedFiles: document.files, savedRevision: document.revision, dirty: false }));
  Object.assign(documents[0]!.files, { [compiled.style.sourcePath]: source, [compiled.style.compiledPath!]: compiled.css! });
  expect(() => prepareComposition({ composition: f.composition, documents, keys: ['config'], assets: new Map(), validateAsset: () => true })).toThrow('已有样式覆盖');
});
it('requires actual preview matching for dynamic selectors before adoption', () => {
  const f = fixture(); f.composition.proposal.styles = [f.style('[data-gc-part="title.workTitle"]:not(:disabled) {color:var(--gc-ink)}')];
  expect(() => f.run()).toThrow('实际组件预览');
  expect(f.run(() => [{ componentId: f.component.id, state: 'normal' }]).propertyOwners).toHaveLength(1);
});

it('compiles a pending candidate preview and still requires complete ownership for adoption', () => {
  const f = fixture(); f.composition.proposal.styles = [f.style('[data-gc-part="title.workTitle"]:not(:disabled) {color:var(--gc-ink)}')];
  const input = { composition: f.composition, documents: createTemplateDocuments(f.template).map(document => ({ ...document, savedFiles: document.files, savedRevision: document.revision, dirty: false })), keys: ['style'], assets: new Map(), validateAsset: () => true };
  const preview = prepareComposition({ ...input, deferStyleMatches: true });
  expect(preview.template.styles).toHaveLength(1);
  expect(preview.unresolvedStyleMatches).toEqual([{ pageId: f.page.id, componentId: null, selector: '[data-gc-part="title.workTitle"]:not(:disabled)', property: 'color', value: 'var(--gc-ink)' }]);
  expect(preview.propertyOwners).toHaveLength(0);
  expect(() => prepareComposition(input)).toThrow('实际组件预览');
  f.composition.proposal.config = [f.config('normal.color', 'red')];
  expect(() => prepareComposition({ ...input, keys: ['config', 'style'], resolveStyleMatches: () => [{ componentId: f.component.id, state: 'normal' }] })).toThrow('多个修改来源');
});

it('rejects preview matches outside the style scope', () => {
  const f = fixture(); f.composition.proposal.styles = [{ ...f.style('[data-gc-part="title.workTitle"] {color:var(--gc-ink)}'), scope: { pageId: f.page.id, componentId: f.component.id } }];
  expect(() => f.run(() => [{ componentId: f.page.root.id, state: 'normal' }])).toThrow('超出了样式范围');
});

it.each(['page', 'command', undefined] as const)('preserves %s style activation when adopting an updated composition', activation => {
  const f = fixture(), id = crypto.randomUUID();
  f.template.styles = [{ id, name: '已有主题', activation, scope: { pageId: f.page.id, componentId: null }, language: 'css',
    sourcePath: `ui/styles/${id}.css`, sourceRevision: 1, compiledSourceRevision: null, compiledPath: null, assets: [], issues: [] }];
  f.composition.proposal.styles = [{ ...f.style('[data-gc-part="title.workTitle"] {color:blue}'), styleId: id }];
  expect(f.run().template.styles[0]!.activation).toBe(activation);
});

it('applies newly adopted page styles without a story command', () => {
  const f = fixture(); f.composition.proposal.styles = [f.style('[data-gc-part="title.workTitle"] {color:blue}')];
  expect(f.run().template.styles[0]!.activation).toBe('page');
});
