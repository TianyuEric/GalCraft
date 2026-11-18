import { z } from 'zod';
import { BlueprintAddressSchema, BlueprintEditOperationSchema, BlueprintNodeSchema, BlueprintOutcomeSchema, BlueprintTriggerSchema, IdSchema, IssueSchema, JsonSchema, PageBlueprintSchema, UIEventSchema, UIInteractionSchema, VersionRefSchema, type RuntimeTemplate, type VersionRef } from '@galcraft/contracts';
import { CollaborationError } from '@galcraft/collaboration';
import type { ProjectSession } from '@galcraft/documents';
import { blueprintConversionProblem, components, findPageBlueprint, preparePageEdit, readTemplateDocuments, validatePageBlueprint } from '@galcraft/templates';
import { PreviewRouteFields } from './collaboration-preview-target.ts';

const ComponentAddress = BlueprintAddressSchema.omit({ bindingId: true });
const Expected = z.array(VersionRefSchema.extend({ ref: z.strictObject({ kind: z.literal('document'), id: IdSchema }) })).length(1);
const Diagnostics = z.array(z.strictObject({ code: z.string(), message: z.string(), nodeId: IdSchema.optional(), edgeId: IdSchema.optional() }));
const source = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('applied') }),
  z.strictObject({ kind: z.literal('draft'), graph: PageBlueprintSchema, event: UIEventSchema.optional() }),
]);
export const blueprintPageInputs = [
  ComponentAddress.extend({ action: z.literal('blueprintRead'), bindingId: IdSchema.optional() }),
  ComponentAddress.extend({ action: z.literal('blueprintValidate'), graph: PageBlueprintSchema, expected: Expected }),
  z.strictObject({ action: z.literal('blueprintPlan'), label: z.string().min(1), operation: BlueprintEditOperationSchema, expected: Expected }),
] as const;
export const blueprintPageOutputs = [
  ComponentAddress.extend({ action: z.literal('blueprintRead'), expected: Expected, bindings: z.array(z.strictObject({
    index: z.number().int().nonnegative(), binding: UIInteractionSchema, conversionBlocked: z.string().nullable(),
  })) }),
  z.strictObject({ action: z.literal('blueprintValidate'), valid: z.boolean(), diagnostics: Diagnostics }),
] as const;
export const BlueprintPreviewInputSchema = z.strictObject({
  action: z.literal('blueprint'), trigger: BlueprintTriggerSchema, source, expected: Expected, ...PreviewRouteFields,
});
export type BlueprintPreviewInput = z.infer<typeof BlueprintPreviewInputSchema>;
export const BlueprintPreviewOutputSchema = z.strictObject({
  action: z.literal('blueprint'), reached: z.boolean(), snapshotId: IdSchema.nullable(), page: z.string().nullable(),
  source: z.enum(['draft', 'applied']), draftBaseRevision: z.number().int().nonnegative().optional(), issues: z.array(IssueSchema),
  execution: BlueprintAddressSchema.extend({
    revision: z.number().int().nonnegative().nullable(), visitId: IdSchema,
    status: z.enum(['completed', 'unmet', 'failed', 'cancelled', 'navigated', 'unavailable']), issue: IssueSchema.nullable(),
    steps: z.array(z.strictObject({
      nodeId: IdSchema, kind: z.enum(['condition', 'action', 'wait', 'animation']), outcome: BlueprintOutcomeSchema,
      nextNodeId: IdSchema.nullable(), value: JsonSchema.optional(), issue: IssueSchema.nullable(),
    })),
  }).nullable(),
});
const schema = (value: z.ZodType) => z.toJSONSchema(value, { io: 'input', reused: 'ref' });
export const blueprintCatalog = () => ({
  requests: schema(z.discriminatedUnion('action', blueprintPageInputs)), preview: schema(BlueprintPreviewInputSchema),
  nodes: BlueprintNodeSchema.options.map(node => node.shape.kind.value), outputPorts: BlueprintOutcomeSchema.options,
});

function pageVersion(project: ProjectSession, pageId: string, expected?: readonly VersionRef[]) {
  const path = `ui/pages/${pageId}.json`;
  const document = [...project.documents.values()].find(document => Object.hasOwn(document.files, path));
  if (!document) throw new CollaborationError('PAGE_MISSING', 'Select an existing page from the directory.');
  const version = { ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision };
  if (expected && (expected.length !== 1 || expected[0]?.ref.kind !== 'document' || expected[0].ref.id !== version.ref.id || expected[0].revision !== version.revision))
    throw new CollaborationError('BLUEPRINT_STALE', 'Reread the page and supply its current document revision.');
  return version;
}

export function blueprintPageOperation(project: ProjectSession, raw: unknown, checkRead?: (version: VersionRef) => void) {
  const input = z.discriminatedUnion('action', blueprintPageInputs).parse(raw);
  const documents = [...project.documents.values()];
  if (input.action === 'blueprintPlan') {
    pageVersion(project, input.operation.pageId, input.expected);
    return preparePageEdit({ documents, request: { label: input.label, operations: [input.operation] } });
  }
  const expected = pageVersion(project, input.pageId, input.action === 'blueprintValidate' ? input.expected : undefined);
  checkRead?.(expected);
  const template = readTemplateDocuments(documents);
  const page = template.pages.find(page => page.id === input.pageId);
  const component = page && components(page.root).find(component => component.id === input.componentId);
  if (!page || !component) throw new CollaborationError('BLUEPRINT_COMPONENT_MISSING', 'Select a component in the specified page.');
  if (input.action === 'blueprintValidate') {
    const diagnostics = validatePageBlueprint(input.graph, page, template);
    return { action: input.action, valid: !diagnostics.length, diagnostics };
  }
  const interactions = component.interactions ?? [];
  const bindings = interactions.map((binding, index) => ({ binding, index, conversionBlocked: blueprintConversionProblem(binding, interactions.slice(index + 1), interactions.slice(0, index)) ?? null }))
    .filter(({ binding }) => !input.bindingId || binding.id === input.bindingId);
  return { action: input.action, pageId: page.id, componentId: component.id, expected: [expected], bindings };
}

export function prepareBlueprintPreview(project: ProjectSession, input: BlueprintPreviewInput): { page: string; template?: RuntimeTemplate } {
  pageVersion(project, input.trigger.pageId, input.expected);
  const documents = [...project.documents.values()];
  const applied = readTemplateDocuments(documents);
  let template = applied;
  if (input.source.kind === 'draft') {
    const { graph, event } = input.source, { pageId, componentId, bindingId } = input.trigger;
    const operation = event ? { kind: 'blueprint.create' as const, pageId, componentId, bindingId, graph, event }
      : { kind: 'blueprint.apply' as const, pageId, componentId, bindingId, graph };
    template = preparePageEdit({ documents, request: { label: 'Preview blueprint draft', operations: [operation] } }).template;
    // A preview keeps the requested draft revision. Its origin is carried separately.
    const selected = findPageBlueprint(template, input.trigger);
    if (selected) selected.graph.revision = graph.revision || 1;
  }
  const selected = findPageBlueprint(template, input.trigger);
  if (!selected) throw new CollaborationError('BLUEPRINT_MISSING', 'Select an applied binding or supply a valid draft and its source.');
  return { page: selected.page.key, ...(template === applied ? {} : { template }) };
}
