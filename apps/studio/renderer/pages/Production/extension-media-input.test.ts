import { afterEach, expect, it, vi } from 'vitest';
import type { Json, ProductionOperationSnapshot } from '@galcraft/contracts';
import type { MediaInput, ProductionFormDraft, TaskPlan } from '@galcraft/authoring/production';
import { validateOperationInput } from '@galcraft/authoring/production/operations';
import { addProductionPortReference, productionPortReferences } from './extension-media-input.js';
import { ProductionSession } from './session.js';
import type { WorkbenchBridge } from './bridge.js';

afterEach(() => vi.useRealTimers());
const snapshot: ProductionOperationSnapshot = { id: 'org.test.media/generate', version: 1, provider: { id: 'org.test.media', version: '0.1.0' }, definition: {
  contractVersion: 1, id: 'org.test.media/generate', version: 1, title: 'Media operation', description: '', providerKey: 'org.test.media/provider', purpose: 'org.test.media/generate',
  fields: [{ path: 'duration', label: 'Duration', description: '', type: 'integer', required: true, nullable: false, default: 5, min: 1, max: 15, unit: 's', group: 'basic', summary: true, keywords: [] }],
  inputSchema: { type: 'object', required: ['duration'], properties: { duration: { type: 'integer', minimum: 1, maximum: 15 } }, additionalProperties: false },
  inputs: [{ key: 'picture', type: 'image', required: true, multiple: false, mimeTypes: ['image/png'] }, { key: 'soundtrack', type: 'audio', required: true, multiple: false, mimeTypes: ['audio/wav'] }],
  outputs: [{ key: 'video', type: 'video', required: true, multiple: false, mimeTypes: ['video/mp4'] }], capabilities: { query: true, refetch: true, cancelPerTask: true, resume: true }, adoption: { kind: 'asset', assetKind: 'video', usages: ['background'] },
} };
const picture: MediaInput = { assetId: 'ImageA', variantId: 'VersAA', candidateId: null, artifactIndex: null, localPath: 'C:/reference.png', mime: 'image/png', kind: 'image' };
const soundtrack: MediaInput = { ...picture, assetId: 'AudioA', localPath: 'C:/reference.wav', mime: 'audio/wav', kind: 'audio' };
const add = (references: MediaInput[], key: string, value: MediaInput, inputs = snapshot.definition.inputs) => {
  const result = addProductionPortReference(references, inputs, inputs.find(port => port.key === key)!, value);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};
it('fills both required media ports through the M10 draft, preserves other fields and port values, and saves the plan-ready input', async () => {
  vi.useFakeTimers(); let saved: ProductionFormDraft | undefined;
  const saveDraft = vi.fn(async ({ draft, expectedRevision }) => {
    expect(expectedRevision).toBe(saved?.revision ?? null);
    saved = structuredClone({ ...draft, revision: (saved?.revision ?? 0) + 1 });
    return { ok: true, value: saved, warnings: [] };
  });
  const s = new ProductionSession({ production: { saveDraft } } as unknown as WorkbenchBridge, 'WorkAA');
  s.data.operations = [snapshot]; s.data.assetsVersion = { ref: { kind: 'document', id: 'Assets' }, revision: 3 };
  await s.openOperation(snapshot);
  s.field('duration', 8);
  s.field('references', add([], 'picture', picture) as unknown as Json);
  expect(() => validateOperationInput({ purpose: snapshot.id as 'org.test.media/generate', fields: { duration: 8 }, references: s.variant!.fields.references as unknown as MediaInput[] }, snapshot)).toThrow('soundtrack');
  s.plan = { planId: 'OldPlan' } as TaskPlan;
  const references = add(s.variant!.fields.references as unknown as MediaInput[], 'soundtrack', soundtrack);
  s.field('references', references as unknown as Json);
  expect(s.plan).toBeNull(); expect(s.draftDirty).toBe(true);
  expect(s.variant!.fields.duration).toBe(8);
  expect(s.variant!.sourceVersions).toContainEqual(s.data.assetsVersion);
  expect(() => validateOperationInput({ purpose: 'org.test.media/generate', fields: { duration: 8 }, references }, snapshot)).not.toThrow();
  const replacement = { ...picture, assetId: 'ImageB' };
  s.field('references', add(references, 'picture', replacement) as unknown as Json);
  await s.saveDraft(true);
  expect(saved!.variants.background!.fields).toMatchObject({ duration: 8, references: [{ ...soundtrack, port: 'soundtrack' }, { ...replacement, port: 'picture' }] });
  s.stop();
});
it('appends multiple media without replacing other ports or previously selected media', () => {
  const inputs = snapshot.definition.inputs.map(port => ({ ...port, multiple: port.key === 'picture' }));
  const existing = [{ ...soundtrack, port: 'soundtrack' }, { ...picture, port: 'picture' }];
  const next = add(existing, 'picture', { ...picture, assetId: 'ImageB' }, inputs);
  expect(next).toEqual([...existing, { ...picture, assetId: 'ImageB', port: 'picture' }]);
  expect(productionPortReferences(next, inputs, 'picture')).toHaveLength(2);
  expect(existing).toHaveLength(2);
});
it('reads legacy unported references only for a single media port and replaces them with an explicit port', () => {
  const inputs = [{ ...snapshot.definition.inputs[0]! }, { key: 'prompt', type: 'text' as const, required: false, multiple: false, mimeTypes: [] }];
  expect(productionPortReferences([picture], inputs, 'picture')).toEqual([picture]);
  expect(add([picture], 'picture', { ...picture, assetId: 'ImageB' }, inputs)).toEqual([{ ...picture, assetId: 'ImageB', port: 'picture' }]);
  expect(productionPortReferences([picture], snapshot.definition.inputs, 'picture')).toEqual([]);
  expect(add([picture], 'picture', picture)).toEqual([picture, { ...picture, port: 'picture' }]);
});
it('keeps namespaced media kind identity and enforces its version and MIME before changing references', () => {
  const port = { key: 'model', type: 'org.test.model/mesh' as const, typeVersion: 2, required: true, multiple: false, mimeTypes: ['model/gltf+json'] };
  const value = { ...picture, kind: port.type, typeVersion: 2, mime: 'model/gltf+json' };
  expect(add([], 'model', value, [port])).toEqual([{ ...value, port: 'model' }]);
  for (const invalid of [{ ...value, kind: 'image' as const }, { ...value, typeVersion: 1 }, { ...value, mime: 'application/json' }]) {
    expect(addProductionPortReference([value], [port], port, invalid).ok).toBe(false);
  }
  expect(add([], 'picture', { ...picture, kind: undefined })).toEqual([{ ...picture, kind: undefined, port: 'picture' }]);
});
