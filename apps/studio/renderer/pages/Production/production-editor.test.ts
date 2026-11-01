import { afterEach, expect, it, vi } from 'vitest';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ProductionOperationSnapshot } from '@galcraft/contracts';
import type { ProductionFormDraft, TaskPlan } from '@galcraft/authoring/production';
import { ProductionSession } from './session.js';
import { operationRecipes } from '@galcraft/authoring/recipes/operations';
import type { WorkbenchBridge } from './bridge.js';
afterEach(() => vi.useRealTimers());
const operation: ProductionOperationSnapshot = { id: 'org.test.video/generate', version: 1, provider: { id: 'org.test.video', version: '0.1.0' }, definition: {
  contractVersion: 1, id: 'org.test.video/generate', version: 1, title: 'Video', description: '', providerKey: 'org.test.video/provider', purpose: 'org.test.video/generate',
  fields: [{ path: 'duration', label: 'Duration', description: '', type: 'integer', required: true, nullable: false, default: 5, min: 1, max: 15, unit: 's', group: 'basic', summary: true, keywords: [] }],
  inputSchema: { type: 'object', required: ['duration'], properties: { duration: { type: 'integer', minimum: 1, maximum: 15 } }, additionalProperties: false }, inputs: [{ key: 'references', type: 'image', required: false, multiple: true, mimeTypes: ['image/png'] }], outputs: [{ key: 'video', type: 'video', required: true, multiple: false, mimeTypes: ['video/mp4'] }], capabilities: { query: true, refetch: true, cancelPerTask: true, resume: true }, adoption: { kind: 'asset', assetKind: 'video', usages: ['background'] },
} };
async function setup() {
  vi.useFakeTimers(); let saved: ProductionFormDraft | null = null;
  const save = vi.fn(async ({ draft, expectedRevision }) => {
    const current = saved?.id === draft.id ? saved : null;
    if ((current?.revision ?? null) !== expectedRevision) throw new Error('draft conflict');
    saved = structuredClone({ ...draft, revision: (current?.revision ?? 0) + 1 });
    return { ok: true, value: saved, warnings: [] };
  });
  const documents = { apply: vi.fn(), planEdit: vi.fn() };
  const s = new ProductionSession({ production: { saveDraft: save, context: async () => ({ ok: true, value: [], warnings: [] }) }, documents } as unknown as WorkbenchBridge, 'WorkAA');
  s.data.operations = [operation];
  s.data.connections = [{ id: 'ConnAA', revision: 1, name: 'Video', protocol: 'plugin', providerKey: 'org.test.video/provider', baseUrl: 'http://localhost', credentialId: null, auth: 'none', apiKeyHeader: null, model: '', purposes: ['org.test.video/generate'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null }];
  s.data.assetsVersion = { ref: { kind: 'document', id: 'Assets' }, revision: 3 };
  await s.openOperation(operation); save.mockClear(); return { s, save, documents, saved: () => saved! };
}
it('commits dedicated fields and references through expectedRevision draft save and invalidates the old plan without an M02 receipt', async () => {
  const { s, documents, saved } = await setup(); s.plan = { planId: 'OldOne' } as TaskPlan;
  const context = s.productionEditorContext(), media = { assetId: 'ImageA', variantId: 'VersAA', candidateId: null, artifactIndex: null, localPath: 'C:/ref.png', mime: 'image/png' };
  const result = await context.commit({ expectedRevision: context.revision, fields: { duration: 8 }, references: [media] });
  expect(result.ok).toBe(true); expect(s.plan).toBeNull(); expect(saved().variants.background!.fields.duration).toBe(8);
  expect(saved().variants.background!.fields.references).toEqual([media]); expect(saved().variants.background!.sourceVersions).toContainEqual(s.data.assetsVersion);
  expect(documents.apply).not.toHaveBeenCalled(); expect(documents.planEdit).not.toHaveBeenCalled();
  s.data.drafts = [structuredClone(saved())]; s.draft = null; await s.openDraft(saved().id);
  expect(s.variant!.fields.duration).toBe(8); expect(s.variant!.operationSnapshot).toEqual(operation);
});
it('preserves current input when a dedicated editor sends invalid or stale values', async () => {
  const { s, save } = await setup(), context = s.productionEditorContext();
  const invalid = await context.commit({ expectedRevision: context.revision, fields: { duration: -1 }, references: [] });
  expect(invalid.ok).toBe(false); expect(s.variant!.fields.duration).toBe(5); expect(save).not.toHaveBeenCalled();
  s.field('duration', 9); const stale = await context.commit({ expectedRevision: context.revision, fields: { duration: 6 }, references: [] });
  expect(stale.ok).toBe(false); expect(s.variant!.fields.duration).toBe(9); expect(save).not.toHaveBeenCalled();
});
it('retains edited input when persistence fails and blocks an absent exact operation package', async () => {
  const { s, save } = await setup(); save.mockRejectedValueOnce(new Error('disk unavailable'));
  const context = s.productionEditorContext(); const result = await context.commit({ expectedRevision: context.revision, fields: { duration: 7 }, references: [] });
  expect(result.ok).toBe(false); expect(s.variant!.fields.duration).toBe(7); expect(s.draftDirty).toBe(true);
  s.data.operations = []; expect(s.operationDefinition).toBeUndefined(); expect(s.variant!.operationSnapshot).toEqual(operation);
});

it('opens a plugin starting scheme with only its declared defaults and no generation request', async () => {
  const { s, save } = await setup();
  const presetOperation = structuredClone(operation);
  presetOperation.definition.presets = [{ id: 'Preset', name: 'Video starting scheme', description: '', defaults: { duration: 9 } }];
  const scheme = operationRecipes([presetOperation])[0]!;
  const data = { ...s.data, recipes: [scheme], operations: [presetOperation] };
  s.bridge.production.overview = vi.fn(async () => ({ ok: true as const, value: data, warnings: [] }));
  await s.openRecipe(scheme);
  expect(s.operation).toBe(operation.id);
  expect(s.variant!.fields.duration).toBe(9);
  expect(s.variant!.fields).not.toHaveProperty('positive');
  expect(s.variant!.operationSnapshot?.provider).toEqual(operation.provider);
  expect(save).toHaveBeenCalledTimes(1);
});

it('keeps at most one polling refresh outstanding when the host is slow', async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  const overview = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const s = new ProductionSession({ production: { overview } } as unknown as WorkbenchBridge, 'WorkAA');
  s.start(); await vi.advanceTimersByTimeAsync(7200);
  expect(overview).toHaveBeenCalledTimes(1);
  finish({ ok: true, value: s.data, warnings: [] }); await vi.advanceTimersByTimeAsync(1800);
  expect(overview).toHaveBeenCalledTimes(2);
  s.stop(); await vi.advanceTimersByTimeAsync(7200);
  expect(overview).toHaveBeenCalledTimes(2);
});
