import { describe, expect, it } from 'vitest';
import { FixtureLock } from '@galcraft/contracts/fixtures';
import type { Result, Variable } from '@galcraft/contracts';
import { components, createOfficialTemplate, createTemplateDocuments, packTemplate, readTemplateDocuments, readTemplateSource } from '@galcraft/templates';
import { envelope } from '../application/documents.js';
import { createCandidateHost } from './candidate-host.js';
import { createCandidateTemplateHost } from './candidate-template-host.js';
import { templateReferenceTargets } from './template-reference-targets.js';

function unwrap<T>(result: Result<T>) {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('candidate template and style transactions', () => {
  it('does not offer DSL ending aliases rejected by the existing shared mapping contract', () => {
    const files = { 'scenes/Scene1/script.gal': 'label {labelId:"Lbl001"} @Stmt01;\nend {endingId:"End001"} @Stmt02;\nend {endingId:"spring-whale"} @Stmt03;' };
    const targets = templateReferenceTargets([{ documentId: 'Scene1', revision: 1, savedRevision: 1, format: 'dsl', dirty: false, files, savedFiles: files }]);
    expect(targets.map(target => target.kind + ':' + target.id)).toEqual(['label:Lbl001', 'ending:End001']);
  });
  it('requires explicit package references, validates variable identity and supports clearing the binding', async () => {
    const current = createOfficialTemplate({ kind: 'standard' });
    const incoming = structuredClone(current);
    incoming.id = 'review.mapping';
    const foreign: Variable = { id: 'Var001', name: '原标题', scope: 'progress', type: 'string', initial: '原文' };
    const target: Variable = { ...foreign, id: 'Var002', name: '当前标题', initial: '映射后的标题' };
    const wrong: Variable = { ...target, id: 'Var003', type: 'number', initial: 1 };
    const title = (template: typeof current) => components(template.pages.find(page => page.key === 'title')!.root).find(component => component.part === 'title.workTitle')!;
    title(incoming).bindings = { text: { source: 'variable', scope: 'progress', variableId: foreign.id } };
    const bytes = packTemplate({ template: incoming, name: '绑定模板', description: '', files: {}, assetFiles: {}, variables: [foreign],
      examples: [{ path: 'examples/demo.css', data: new TextEncoder().encode('.example { color: red; }') }] });
    const documents = createTemplateDocuments(current).map(document => ({ ...document, savedFiles: document.files, savedRevision: 1, dirty: false }));
    const host = createCandidateHost([...documents, envelope(target.id, `variables/${target.id}.json`, target), envelope(wrong.id, `variables/${wrong.id}.json`, wrong)]);
    const templates = createCandidateTemplateHost(host, [bytes]);
    const identity = { id: incoming.id, version: incoming.version };
    expect(unwrap(await templates.library!({ action: 'detail', ...identity }))).toMatchObject({ externalReferences: [{ key: 'variable:Var001', valueType: 'string' }] });
    const missing = await templates.prepareTemplateSwitch!(identity);
    expect(missing.ok).toBe(false);
    const incompatible = await templates.prepareTemplateSwitch!({ ...identity, mappings: { 'variable:Var001': wrong.id } });
    expect(incompatible.ok).toBe(false);
    const accepted = unwrap(await templates.prepareTemplateSwitch!({ ...identity, mappings: { 'variable:Var001': target.id } }));
    expect(accepted.blocked).toBe(false);
    expect(accepted.files).not.toHaveProperty('examples/demo.css');
    expect(title(accepted.template).bindings?.text).toMatchObject({ source: 'variable', variableId: target.id });
    expect(accepted.edit?.expected).toContainEqual({ ref: { kind: 'document', id: target.id }, revision: 1 });
    unwrap(host.commit(accepted.edit!));
    expect(title(readTemplateDocuments(host.list())).bindings?.text).toMatchObject({ variableId: target.id });
    const cleared = unwrap(await templates.prepareTemplateSwitch!({ ...identity, mappings: { 'variable:Var001': null } }));
    expect(cleared.blocked).toBe(false);
    expect(title(cleared.template).bindings?.text).toEqual({ source: 'literal', value: null });
    unwrap(host.commit(cleared.edit!));
    const remapped = unwrap(await templates.prepareTemplateSwitch!({ ...identity, mappings: { 'variable:Var001': target.id } }));
    expect(remapped.blocked).toBe(false);
    expect(remapped.conflicts).toEqual([]);
    expect(title(remapped.template).bindings?.text).toMatchObject({ source: 'variable', variableId: target.id });
    expect(title(incoming).bindings?.text).toMatchObject({ variableId: foreign.id });
  });
  it('offers real flow identities and refuses missing or wrong-kind mapping targets', async () => {
    const current = createOfficialTemplate({ kind: 'standard' }), incoming = structuredClone(current);
    incoming.id = 'review.flow-mapping';
    const title = components(incoming.pages.find(page => page.key === 'title')!.root).find(component => component.part === 'title.workTitle')!;
    title.content.reviewFlow = { kind: 'flow', id: 'ForF01' };
    const bytes = packTemplate({ template: incoming, name: '故事图模板', description: '', files: {}, assetFiles: {} });
    const documents = createTemplateDocuments(current).map(document => ({ ...document, savedFiles: document.files, savedRevision: 1, dirty: false }));
    const host = createCandidateHost([...documents, envelope('Flow01', 'flows/Flow01.json', { id: 'Flow01', name: '当前故事图', roots: [], nodes: [], edges: [] })]);
    const templates = createCandidateTemplateHost(host, [bytes]), identity = { id: incoming.id, version: incoming.version };
    expect((await templates.prepareTemplateSwitch!({ ...identity, mappings: { 'flow:ForF01': 'Ghost1' } })).ok).toBe(false);
    expect((await templates.prepareTemplateSwitch!({ ...identity, mappings: { 'flow:ForF01': current.pages[0]!.id } })).ok).toBe(false);
    const plan = unwrap(await templates.prepareTemplateSwitch!({ ...identity, mappings: { 'flow:ForF01': 'Flow01' } }));
    expect(plan.blocked).toBe(false);
    expect(plan.edit?.expected).toContainEqual({ ref: { kind: 'document', id: 'Flow01' }, revision: 1 });
    expect(components(plan.template.pages.find(page => page.key === 'title')!.root).find(component => component.part === 'title.workTitle')!.content.reviewFlow).toEqual({ kind: 'flow', id: 'Flow01' });
  });
  it('retains valid compiled CSS through an invalid draft and switches a work with its authored style', async () => {
    const template = createOfficialTemplate({ kind: 'rich' });
    const lockFile = 'dependencies.lock.json';
    const lock = { ...FixtureLock, template: template.dependencies.find(item => item.kind === 'template')! };
    const lockDocument = { documentId: 'Lock01', revision: 1, format: 'json' as const,
      files: { [lockFile]: JSON.stringify({ schemaVersion: 1, documentId: 'Lock01', revision: 1, data: lock }) } };
    const documents = [...createTemplateDocuments(template), lockDocument].map(document => ({ ...document, savedFiles: document.files, savedRevision: 1, dirty: false }));
    const host = createCandidateHost(documents);
    const templates = createCandidateTemplateHost(host);
    const title = template.pages.find(page => page.key === 'title')!;
    const request = { label: '标题文字样式', name: '标题文字', pageId: title.id, componentId: null,
      language: 'scss' as const, activation: 'page' as const,
      source: '$ink: #1b6e43; [data-gc-part="title.workTitle"] { color: $ink; }' };
    const added = unwrap(await templates.preparePageStyleEdit!(request));
    unwrap(host.commit(added.edit));
    const style = added.template.styles[0]!;
    const styleFiles = () => host.list().find(document => document.documentId === template.instanceId)!.files;
    const compiled = styleFiles()[style.compiledPath!]!;
    expect(compiled).toContain(`[data-gc-player="${template.instanceId}"] [data-gc-page-id="${title.id}"]`);
    expect(compiled).toContain('color: #1b6e43 !important');

    const invalid = unwrap(await templates.preparePageStyleEdit!({ ...request, styleId: style.id, source: '[data-gc-part="title.workTitle"] {' }));
    unwrap(host.commit(invalid.edit));
    expect(invalid.issues).toContainEqual(expect.objectContaining({ code: 'STYLE_COMPILE', severity: 'error' }));
    expect(readTemplateDocuments(host.list()).styles[0]).toMatchObject({ sourceRevision: 2, compiledSourceRevision: 1 });
    expect(styleFiles()[style.compiledPath!]).toBe(compiled);

    const light = createOfficialTemplate({ kind: 'light' });
    const blocked = unwrap(await templates.prepareTemplateSwitch!({ id: light.id, version: light.version }));
    expect(blocked).toMatchObject({ blocked: true, edit: null });
    expect(blocked.conflicts).toContainEqual(expect.objectContaining({ path: `/styles/${style.id}`, kind: 'reference' }));
    const repaired = unwrap(await templates.preparePageStyleEdit!({ ...request, styleId: style.id }));
    unwrap(host.commit(repaired.edit));
    const resolutions = Object.fromEntries(blocked.conflicts.filter(conflict => conflict.kind === 'field').map(conflict => [conflict.path, 'incoming' as const]));
    const applied = unwrap(await templates.prepareTemplateSwitch!({ id: light.id, version: light.version, options: { resolutions } }));
    expect(applied.blocked).toBe(false);
    unwrap(host.commit(applied.edit!));
    expect(readTemplateDocuments(host.list())).toMatchObject({ id: light.id, instanceId: template.instanceId, styles: [{ id: style.id }] });
    expect(readTemplateSource(host.list())?.source.id).toBe(light.id);
    expect(JSON.parse(host.list().find(document => lockFile in document.files)!.files[lockFile]!).data.template.id).toBe(light.id);
    expect(styleFiles()[style.compiledPath!]).toBe(compiled);
  });
});
