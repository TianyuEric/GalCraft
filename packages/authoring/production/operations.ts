import { ProductionOperationDefinitionSchema, ProductionOperationSnapshotSchema, validateJsonData, validateProductionOperationDefinition } from '@galcraft/contracts';
import type { Artifact, Json, ProductionOperationDefinition, ProductionOperationSnapshot } from '@galcraft/contracts';
import type { GenerationInput, TaskItem } from './types.js';
import { svgProductionGuide } from './svg.js';
export { SVGProposalSchema, svgProductionGuide } from './svg.js';
export function operationSupportsConnection(operation: ProductionOperationSnapshot | undefined, config: import('@galcraft/contracts').ConnectionConfig, purpose: string): boolean {
  const definition = operation?.definition;
  return definition?.connection ? (!definition.textPreparationKey ? !definition.providerKey || definition.providerKey === config.providerKey : true) && config.purposes.includes(definition.connection.purpose as import('@galcraft/contracts').Purpose) && definition.connection.protocols.includes(config.protocol)
    : config.purposes.includes(purpose as import('@galcraft/contracts').Purpose) && (!definition?.providerKey || definition.providerKey === config.providerKey);
}

const textOperations = ['script', 'performance', 'discuss', 'imagePrompt', 'novelaiPrompt', 'differencePrompt', 'speechText', 'musicPrompt', 'uiPlan', 'uiPatch', 'svg'] as const;
export const builtinProductionOperations: ProductionOperationSnapshot[] = [...textOperations, 'image', 'difference', 'speech', 'music'].map(id => {
  const text = (textOperations as readonly string[]).includes(id), type = text ? 'text' : ['speech', 'music'].includes(id) ? 'audio' : 'image';
  const definition: ProductionOperationDefinition = { contractVersion: 1, id: id as ProductionOperationDefinition['id'], version: 1,
    title: id, description: '', purpose: text ? 'text' : id, providerKey: null, fields: [], inputSchema: true,
    inputs: [], outputs: [{ key: 'result', type, required: true, multiple: true, mimeTypes: [] }],
    capabilities: { query: false, refetch: false, cancelPerTask: false, resume: false },
    adoption: text ? { kind: 'text' } : { kind: 'asset', assetKind: type as 'image' | 'audio', usages: type === 'audio' ? ['voice', 'bgm'] : ['background', 'figure', 'cg', 'difference', 'ui'] } };
  if (id === 'svg') {
    definition.description = `${svgProductionGuide.purpose} Output schema: ${JSON.stringify(svgProductionGuide.outputSchema)}. ${svgProductionGuide.editing}`;
    definition.inputSchema = { type: 'object', properties: { instruction: { type: 'string', minLength: 1, description: svgProductionGuide.minimumFields.instruction }, maxOutputTokens: { type: 'integer', minimum: 1, default: svgProductionGuide.minimumFields.maxOutputTokens } }, required: ['instruction'], additionalProperties: true };
  }
  return { id: definition.id, version: 1, provider: null, definition };
});

/** One catalog for menus, planning, typed edges, recipes and candidate interpretation. */
export class ProductionOperationCatalog {
  private readonly entries = new Map<string, ProductionOperationSnapshot>(builtinProductionOperations.map(value => [value.id, structuredClone(value)]));
  constructor(extensions: ProductionOperationSnapshot[] = []) { for (const value of extensions) this.register(value); }
  register(snapshot: ProductionOperationSnapshot): void {
    ProductionOperationSnapshotSchema.parse(snapshot);
    if (!snapshot.provider || !snapshot.id.startsWith(`${snapshot.provider.id}/`) || snapshot.definition.purpose !== snapshot.id
      || !snapshot.definition.providerKey
      || snapshot.definition.fieldEditorKey && !snapshot.definition.fieldEditorKey.startsWith(`${snapshot.provider.id}/`)) throw new Error(`Operation ownership mismatch: ${snapshot.id}`);
    validateProductionOperationDefinition(snapshot.definition, snapshot.provider);
    if (this.entries.has(snapshot.id)) throw new Error(`Duplicate production operation: ${snapshot.id}`);
    this.entries.set(snapshot.id, structuredClone(snapshot));
  }
  list(): ProductionOperationSnapshot[] { return structuredClone([...this.entries.values()]); }
  resolve(id: string, frozen?: ProductionOperationSnapshot): ProductionOperationSnapshot {
    const found = this.entries.get(id);
    if (!found) throw new Error(`Production operation is missing: ${id}${frozen?.provider ? `（${frozen.provider.id}@${frozen.provider.version}）` : ''}`);
    if (frozen && (frozen.version !== found.version || frozen.provider?.id !== found.provider?.id || frozen.provider?.version !== found.provider?.version)) throw new Error(`The exact operation version is missing: ${id}@${frozen.version}`);
    // Starting schemes are authoring metadata; adding them does not change frozen execution semantics.
    const executionDefinition = ({ presets: _presets, titleKey: _titleKey, descriptionKey: _descriptionKey, ...definition }: ProductionOperationDefinition) => {
      const fields = (entries: import('@galcraft/contracts').FieldSpec[]): object[] => entries.map(({ labelKey: _label, descriptionKey: _description, placeholder: _placeholder, placeholderKey: _placeholderKey, enumLabelKeys: _options, children, item, ...field }) => ({ ...field, ...(children ? { children: fields(children) } : {}), ...(item ? { item: fields([item])[0] } : {}) }));
      return { ...definition, fields: fields(definition.fields) };
    };
    if (frozen && !validateJsonData({ const: executionDefinition(found.definition) as unknown as Json }, executionDefinition(frozen.definition) as unknown as Json).ok) throw new Error(`The operation definition differs from its exact package: ${id}@${frozen.version}`);
    return structuredClone(frozen ?? found);
  }
}
export const isExtensionInput = (input: GenerationInput): input is Extract<GenerationInput, { fields: unknown }> => input.purpose.includes('/');
export function validateOperationInput(input: GenerationInput, snapshot: ProductionOperationSnapshot, deferredFields: string[] = []): void {
  ProductionOperationSnapshotSchema.parse(snapshot);
  if (snapshot.definition.purpose !== input.purpose) throw new Error(`The operation and input purposes differ: ${snapshot.id}`);
  if (!isExtensionInput(input)) return;
  if (!input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields) || !Array.isArray(input.references)) throw new Error('Extension inputs require a fields object and references array');
  const schema = structuredClone(snapshot.definition.inputSchema);
  if (deferredFields.length && schema && typeof schema === 'object' && !Array.isArray(schema)) {
    if (Array.isArray(schema.required)) schema.required = schema.required.filter(key => !deferredFields.includes(String(key)));
    const properties = schema.properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) for (const key of deferredFields) delete properties[key];
  }
  const fields = Object.fromEntries(Object.entries(input.fields).filter(([key]) => !deferredFields.includes(key)));
  const checked = validateJsonData(schema, fields);
  if (!checked.ok) throw new Error(`${snapshot.definition.title}：${checked.issues.map(issue => issue.message).join('；')}`);
  const mediaPorts = snapshot.definition.inputs.filter(port => port.type !== 'text');
  for (const reference of input.references) if (reference.port ? !mediaPorts.some(port => port.key === reference.port) : mediaPorts.length !== 1) throw new Error(`The media reference lacks a declared port: ${reference.port ?? 'unselected'}`);
  for (const port of mediaPorts) {
    const references = input.references.filter(reference => reference.port ? reference.port === port.key : mediaPorts.length === 1);
    if (port.required && !references.length && !deferredFields.includes(port.key)) throw new Error(`Missing reference media port: ${port.key}`);
    if (!port.multiple && references.length > 1) throw new Error(`Port ${port.key} accepts only one media reference`);
    for (const reference of references) {
      const kind = reference.kind ?? (/^(image|audio|video)\//.exec(reference.mime)?.[1]);
      if (kind !== port.type) throw new Error(`Incompatible type for port ${port.key}: ${kind ?? reference.mime} → ${port.type}`);
      if (port.typeVersion && reference.typeVersion !== port.typeVersion) throw new Error(`Incompatible type version for port ${port.key}`);
      if (port.mimeTypes.length && !port.mimeTypes.includes(reference.mime)) throw new Error(`Port ${port.key} does not accept ${reference.mime}`);
    }
  }
}
export function operationOutputIssues(snapshot: ProductionOperationSnapshot, artifacts: Artifact[]): string[] {
  ProductionOperationDefinitionSchema.parse(snapshot.definition);
  const issues: string[] = [];
  for (const output of snapshot.definition.outputs) {
    const matching = artifacts.filter(artifact => artifact.role === 'primary' && (artifact.port ? artifact.port === output.key : snapshot.definition.outputs.length === 1)
      && artifact.kind === output.type && (!output.typeVersion || artifact.typeVersion === output.typeVersion) && (!output.mimeTypes.length || output.mimeTypes.includes(artifact.mime)));
    if (output.required && !matching.length) issues.push(`Missing ${output.key} (${output.type}) artifact`);
    if (!output.multiple && matching.length > 1) issues.push(`Output ${output.key} permits only one artifact`);
  }
  for (const artifact of artifacts.filter(value => value.role === 'primary')) if (!snapshot.definition.outputs.some(output => artifact.kind === output.type && (!artifact.port || artifact.port === output.key) && (!output.mimeTypes.length || output.mimeTypes.includes(artifact.mime)))) issues.push(`Undeclared artifact type: ${artifact.port ?? artifact.kind}/${artifact.mime}`);
  return issues;
}
export function validateOperationEdges(items: TaskItem[]): void {
  for (const item of items) for (const edge of item.dependencies) {
    const parent = items.find(value => value.id === edge.itemId)!;
    if (!item.operationSnapshot?.provider && !parent.operationSnapshot?.provider) continue;
    const source = edge.sourcePort === undefined
      ? (parent.operationSnapshot?.definition.outputs.length === 1 ? parent.operationSnapshot.definition.outputs[0] : undefined)
      : parent.operationSnapshot?.definition.outputs.find(port => port.key === edge.sourcePort);
    const target = item.operationSnapshot?.definition.inputs.find(port => port.key === edge.output);
    if (!source || !target) throw new Error(`Dependency port is missing: ${parent.id}.${edge.sourcePort ?? 'result'} → ${item.id}.${edge.output}`);
    if (source.type !== target.type) throw new Error(`Incompatible dependency types: ${source.type} → ${target.type}（${edge.output}）`);
    if (target.typeVersion && (source.typeVersion ?? (parent.operationSnapshot?.provider ? undefined : 1)) !== target.typeVersion) throw new Error(`Incompatible dependency type version: ${edge.output}`);
    if (target.mimeTypes.length && source.mimeTypes.some(mime => !target.mimeTypes.includes(mime))) throw new Error(`Incompatible dependency MIME: ${edge.output}`);
  }
}
