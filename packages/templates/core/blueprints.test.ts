import { expect, it } from 'vitest';
import type { PageBlueprint, RuntimeTemplate, UIInteraction } from '@galcraft/contracts';
import { blueprintConversionProblem, convertPageBinding, createOfficialTemplate, createTemplateDocuments, mapTemplateExternalReferences, preparePageEdit, removeUIAnimation, templateExternalReferences, uiBlueprintAnimationUses } from './index.js';

const documentsOf = (template: RuntimeTemplate) => createTemplateDocuments(template).map(document => ({
  ...document, savedRevision: document.revision, savedFiles: document.files, dirty: false,
}));

it('guards both sides of changes to blueprint destinations and animation references', () => {
  const template = createOfficialTemplate(), page = template.pages.find(page => page.key === 'title')!;
  const documents = documentsOf(template);
  const extra = preparePageEdit({ documents, request: { label: 'Add target', operations: [{ kind: 'page.create', key: 'lab', id: 'Lab001', title: 'Lab' }] } }).template;
  const withTarget = documentsOf(extra);
  const graph: PageBlueprint = { revision: 0, entry: 'Node01', edges: [], nodes: [{ id: 'Node01', kind: 'action', action: { kind: 'open', page: 'lab' } }] };
  const add = preparePageEdit({ documents: withTarget, request: { label: 'Connect target', operations: [
    { kind: 'blueprint.create', pageId: page.id, componentId: page.root.id, bindingId: 'Bind01', event: 'click', graph },
  ] } });
  const remove = preparePageEdit({ documents: withTarget, request: { label: 'Remove target', operations: [{ kind: 'page.remove', pageId: 'Lab001' }] } });
  expect(add.edit.expected.map(item => item.ref.id)).toEqual(expect.arrayContaining([page.id, extra.instanceId]));
  expect(remove.edit.expected.map(item => item.ref.id)).toContain(page.id);
  expect(() => preparePageEdit({ documents: documentsOf(add.template), request: {
    label: 'Remove used target', operations: [{ kind: 'page.remove', pageId: 'Lab001' }],
  } })).toThrow('BLUEPRINT_PAGE_MISSING');

  const animation = extra.animations[0]!;
  page.root.interactions = [{ id: 'Bind02', event: 'click', actions: [], blueprint: {
    revision: 1, entry: 'Node02', edges: [], nodes: [{ id: 'Node02', kind: 'animation', animationId: animation.id }],
  } }];
  expect(uiBlueprintAnimationUses(template, animation.id)).toContainEqual(expect.objectContaining({ event: 'blueprint', nodeId: 'Node02' }));
  expect(() => removeUIAnimation(template, animation.id, true)).toThrow('BLUEPRINT_ANIMATION_IN_USE');
});

it('keeps legacy event order and discovers literal gallery references for template mapping', () => {
  const local: UIInteraction = { event: 'click', actions: [{ kind: 'toggleLocal', key: 'ready' }] };
  const open: UIInteraction = { event: 'click', condition: { op: 'truthy', value: { source: 'local', path: 'ready' } }, actions: [{ kind: 'open', page: 'settings' }] };
  expect(blueprintConversionProblem(open, [], [local])).toBeUndefined();
  const converted = convertPageBinding(open, [], [local]);
  expect(converted.actions).toEqual([]);
  expect(converted.blueprint?.nodes).toMatchObject([{ kind: 'condition', condition: open.condition }, { kind: 'action', action: open.actions[0] }]);
  expect(blueprintConversionProblem(open, [local])).toBeDefined();
  expect(blueprintConversionProblem(local, [], [open])).toBeDefined();
  expect(blueprintConversionProblem({ ...open, condition: { op: 'truthy', value: { source: 'data', path: 'preferences.toolbarLocked' } } })).toBeDefined();

  const template = createOfficialTemplate(), page = template.pages[0]!;
  const action = { kind: 'official' as const, action: { kind: 'openCg' as const, entryId: 'CG0001' } };
  page.root.interactions = [{ id: 'Bind01', event: 'click', actions: [], blueprint: {
    revision: 1, entry: 'Node01', edges: [], nodes: [{ id: 'Node01', kind: 'action', action }],
  } }];
  const references = templateExternalReferences(template);
  expect(references).toContainEqual(expect.objectContaining({ key: 'gallery:CG0001', kind: 'gallery' }));
  expect(() => mapTemplateExternalReferences(template, references, { 'gallery:CG0001': null })).toThrow('TEMPLATE_GALLERY_MAPPING_REQUIRED');
  const mapped = mapTemplateExternalReferences(template, references, { 'gallery:CG0001': 'CG0002' });
  expect(mapped.pages[0]!.root.interactions![0]!.blueprint!.nodes[0]).toMatchObject({ action: { action: { entryId: 'CG0002' } } });
});
