import { productionMessages } from '@galcraft/plugins/contracts';
import translations from './display-translations.json' with { type: 'json' };
import { AnimationGenerationRequestJsonSchema, AnimationPathSchema, type FieldSpec, type Json, type ProductionOperationDefinition } from '@galcraft/contracts';
import type { PluginDefinition } from '@galcraft/plugins/contracts';
export const pluginId = 'org.galcraft.animation-generation';
export const operationId = `${pluginId}/generateGca` as const, providerKey = `${pluginId}/text`;
export const capabilities = { query: false, refetch: false, cancelPerTask: false, resume: false };
const field = (path: string, label: string, type: FieldSpec['type'], value: Json, extra: Partial<FieldSpec> = {}): FieldSpec => ({ path, label, type, default: value, required: true, nullable: value === null, description: '', unit: 'none', group: 'basic', summary: true, keywords: [], ...extra });
export const operation: ProductionOperationDefinition = { contractVersion: 1, id: operationId, version: 1,
  title: 'GCA animation', description: 'Create a new animation (new), edit selected frozen tracks/time range (patch), or rewrite the whole animation (replace). patch requires paths and currentAnimation; range must be within its duration. Deletion requires allowDelete. Freeze assetId and assetRevision for an existing asset. Review NativeAnimation candidates and AnimationTrackChange facts before adoption; invalid raw output remains editable with diagnostics.', providerKey, textPreparationKey: providerKey, execution:'remote', purpose: operationId,
  connection: { purpose: 'text', protocols: ['chatCompletions','anthropic','gemini','ollama','novelAIText'] },
  fields: [field('instruction', 'Animation request', 'string', ''), field('mode', 'Edit mode', 'enum', 'new', { enumValues: ['new', 'patch', 'replace'] }),
    field('currentAnimation', 'Original animation', 'object', null),
    field('paths', 'Editable tracks', 'array', [], { item: field('path', 'Track', 'enum', '/y', { enumValues: [...AnimationPathSchema.options] }) }),
    field('range', 'Time range', 'object', null, { children: [field('startMs', 'Start (ms)', 'number', 0, { min: 0, unit: 'ms' }), field('endMs', 'End (ms)', 'number', 1000, { min: 0, unit: 'ms' })] }),
    field('targetContext', 'Target and framing', 'string', ''), field('preserveDuration', 'Preserve duration', 'boolean', true), field('allowDelete', 'Allow selected-track deletion', 'boolean', false),
    field('assetId', 'Original asset', 'ref', null), field('assetRevision', 'Asset revision', 'integer', null, { min: 0 })],
  inputSchema: AnimationGenerationRequestJsonSchema as Json, inputs: [], outputs: [{ key: 'animation', type: 'animation', typeVersion: 1, required: true, multiple: false, mimeTypes: ['application/json'] }], capabilities,
  adoption: { kind: 'asset', assetKind: 'animation', usages: ['animation'] },
  presets: [{ id: 'GcaNew', name: 'GCA animation preparation', description: 'Use an actual compatible text connection. Prepare a request, then inspect the candidate before adoption.', defaults: { mode: 'new', preserveDuration: true, allowDelete: false } }],
};
const messages = productionMessages([operation], { ...translations, ...Object.fromEntries(AnimationPathSchema.options.map(path => [path, [path, path] as const])) });
export function createDefinition(): PluginDefinition { return { productionOperations: [operation], messages }; }
