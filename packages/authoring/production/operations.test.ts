import { expect, it } from 'vitest';
import { DefaultTimeoutSecByPurpose, validateProductionOperationDefinition } from '@galcraft/contracts';
import type { ProductionOperationSnapshot, FieldSpec } from '@galcraft/contracts';
import { ProductionOperationCatalog, operationOutputIssues, validateOperationInput } from './operations.js';
import { operationPurpose, variantOperation } from './draft.js';
import { validateItems } from './validation.js';
import type { TaskItem } from './types.js';
import { CreationRecipeSchema } from '../recipes/schema.js';
import { OfficialRecipes } from '../recipes/official.js';

const field: FieldSpec = { path: 'prompt', label: 'Prompt', description: '', type: 'string', required: true, nullable: false, default: 'a clip', unit: 'none', group: 'basic', summary: true, keywords: [] };
export const snapshot = (id = 'org.test.video/generate'): ProductionOperationSnapshot => ({ id: id as `${string}/${string}`, version: 1, provider: { id: id.split('/')[0]!, version: '0.1.0' }, definition: {
  contractVersion: 1, id: id as `${string}/${string}`, version: 1, title: 'Video', description: '', purpose: id, providerKey: `${id.split('/')[0]}/provider`, fields: [field],
  inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', minLength: 1 } }, additionalProperties: false },
  inputs: [{ key: 'prompt', type: 'text', required: true, multiple: false, mimeTypes: ['text/plain'] }], outputs: [{ key: 'video', type: 'video', required: true, multiple: false, mimeTypes: ['video/mp4'] }],
  capabilities: { query: true, refetch: true, cancelPerTask: true, resume: true }, adoption: { kind: 'asset', assetKind: 'video', usages: ['background'] },
} });
const item = (operationSnapshot: ProductionOperationSnapshot): TaskItem => ({ id: 'StepAA', purpose: operationSnapshot.id as `${string}/${string}`, operation: operationSnapshot.id, operationSnapshot,
  target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'background', uiScope: null }, backgroundRemoval: null, backgroundPreview: null, dependencies: [], input: { purpose: operationSnapshot.id, fields: { prompt: 'a clip' }, references: [] }, sourceVersions: [],
  configSnapshot: { id: 'ConnAA', revision: 1, name: 'Local', protocol: 'plugin', providerKey: operationSnapshot.definition.providerKey!, baseUrl: 'http://127.0.0.1', credentialId: null, auth: 'none', apiKeyHeader: null, model: '', purposes: [operationSnapshot.id as `${string}/${string}`], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null }, workflowSnapshot: null, recipeSnapshot: null,
  state: 'draft', remote: null, progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] });
it('resolves two ordinary namespaces and blocks unknown/exact-version mismatches without changing the frozen data', () => {
  const a = snapshot(), b = snapshot('org.renamed.clip/create'), frozen = JSON.stringify(a), catalog = new ProductionOperationCatalog([a, b]);
  expect(catalog.resolve(b.id)).toEqual(b); expect(operationPurpose(b.id)).toBe(b.id);
  expect(() => catalog.resolve('org.absent.clip/create', a)).toThrow('missing');
  expect(() => catalog.resolve(a.id, { ...a, provider: { ...a.provider!, version: '2.0.0' } })).toThrow('exact operation version');
  expect(() => catalog.resolve(a.id, { ...a, definition: { ...a.definition, title: 'changed definition' } })).toThrow('definition differs from its exact package');
  expect(JSON.stringify(a)).toBe(frozen); expect(() => operationPurpose('unknown' as never)).toThrow('未知');
});
it('validates input schemas and declared output MIME instead of treating unknown operations as text/image', () => {
  const op = snapshot();
  expect(() => validateOperationInput({ purpose: op.id as `${string}/${string}`, fields: { prompt: '' }, references: [] }, op)).toThrow('short');
  expect(() => validateOperationInput({ purpose: op.id as `${string}/${string}`, fields: { prompt: 'clip', foreign: true }, references: [] }, op)).toThrow('Unknown property');
  expect(operationOutputIssues(op, [{ kind: 'image', localPath: 'x', mime: 'image/png', bytes: 1, metadata: {}, groupId: 'clip', role: 'primary', background: null }])).toContain('Missing video (video) artifact');
  expect(operationOutputIssues(op, [{ kind: 'video', typeVersion: 1, port: 'video', localPath: 'x', mime: 'video/mp4', bytes: 1, metadata: {}, groupId: 'clip', role: 'primary', background: null }])).toEqual([]);
});

it('accepts added display keys for a historical frozen operation while preserving its exact inputs and defaults', () => {
  const frozen = snapshot(), current = structuredClone(frozen), before = JSON.stringify(frozen);
  current.definition.titleKey = `${current.id}/title`; current.definition.descriptionKey = `${current.id}/description`;
  current.definition.fields[0]!.labelKey = `${current.id}/prompt/label`;
  current.messages = { ja: { [`${current.id}/title`]: '動画制作' } };
  expect(new ProductionOperationCatalog([current]).resolve(frozen.id, frozen)).toEqual(frozen);
  expect(JSON.stringify(frozen)).toBe(before);
  current.definition.inputSchema = { type: 'object', properties: { different: { type: 'number' } }, required: ['different'], additionalProperties: false };
  expect(() => new ProductionOperationCatalog([current]).resolve(frozen.id, frozen)).toThrow('definition differs');
});
it('connects a text operation to video in the same DAG and rejects an incompatible media edge', () => {
  const catalog = new ProductionOperationCatalog(), child = item(snapshot()), parent = { ...item(snapshot()), id: 'Parent', purpose: 'text', operation: 'script', operationSnapshot: catalog.resolve('script'),
    input: { purpose: 'text', system: '', messages: [{ role: 'user', text: 'clip', attachments: [] }], maxOutputTokens: 10, temperature: null, seed: null }, configSnapshot: { ...child.configSnapshot!, providerKey: undefined, protocol: 'chatCompletions', purposes: ['text'] } } as TaskItem;
  child.dependencies = [{ itemId: parent.id, sourcePort: 'result', output: 'prompt', selectedCandidateId: null }];
  expect(() => validateItems([parent, child])).not.toThrow();
  delete child.dependencies[0]!.sourcePort;
  expect(() => validateItems([parent, child])).not.toThrow();
  child.dependencies[0]!.sourcePort = 'missing';
  expect(() => validateItems([parent, child])).toThrow('Dependency port is missing');
  child.dependencies[0]!.sourcePort = 'result';
  parent.operationSnapshot = catalog.resolve('image'); expect(() => validateItems([parent, child])).toThrow('image → text');
});
it('preserves the existing legacy mapping and explicit unknown IDs', () => {
  const legacy = { fields: { creationMode: 'performance' }, recipe: { purpose: 'script' } } as never;
  expect(variantOperation(legacy, 'script')).toBe('performance');
  expect(variantOperation({ fields: {}, recipe: null } as never, 'voice')).toBe('speech');
  expect(variantOperation({ fields: {}, recipe: null, operation: 'org.missing.operation/old' } as never, 'cg')).toBe('org.missing.operation/old');
});
it('requires an owned provider and declaration for a public operation', () => {
  const op = snapshot(); expect(() => validateProductionOperationDefinition(op.definition, op.provider!, [])).toThrow('Undeclared');
  expect(() => validateProductionOperationDefinition({ ...op.definition, providerKey: 'org.foreign.plugin/provider' }, op.provider!)).not.toThrow();
});
it('uses namespaced recipe operations and the same frozen definition without a text fallback', () => {
  const op = snapshot(), recipe = CreationRecipeSchema.parse({ ...structuredClone(OfficialRecipes[0]!), purposes: [op.id], uses: ['background'], production: { operation: op.id, executor: 'connection', protocol: 'plugin', defaults: { prompt: 'saved clip' }, parameters: [] }, operationSnapshot: op });
  expect(recipe.production!.operation).toBe(op.id); expect(recipe.operationSnapshot).toEqual(op);
});
it('keeps media ports distinct and checks their declared type version', () => {
  const op = snapshot(); op.definition.inputs.push({ key: 'imageReference', type: 'image', typeVersion: 1, required: false, multiple: false, mimeTypes: ['image/png'] }, { key: 'audioReference', type: 'audio', required: false, multiple: false, mimeTypes: ['audio/wav'] });
  const reference = { assetId: 'ImageA', variantId: 'VarAAA', candidateId: null, artifactIndex: null, localPath: 'ref.png', mime: 'image/png', port: 'imageReference', kind: 'image' as const, typeVersion: 1 };
  expect(() => validateOperationInput({ purpose: op.id as `${string}/${string}`, fields: { prompt: 'clip' }, references: [reference] }, op)).not.toThrow();
  expect(() => validateOperationInput({ purpose: op.id as `${string}/${string}`, fields: { prompt: 'clip' }, references: [{ ...reference, port: 'audioReference' }] }, op)).toThrow('Incompatible type');
  expect(() => validateOperationInput({ purpose: op.id as `${string}/${string}`, fields: { prompt: 'clip' }, references: [{ ...reference, typeVersion: 2 }] }, op)).toThrow('type version');
});
