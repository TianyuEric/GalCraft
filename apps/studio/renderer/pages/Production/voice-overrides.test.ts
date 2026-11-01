import { expect, it, vi } from 'vitest';
import { ProductionSession } from './session.js';
import { speechLineOverrideFields } from './VoiceLinesEditor.js';
import { operations } from '@galcraft/official-voicestudio/definition';
import type { WorkbenchBridge } from './bridge.js';
import type { ProductionOperationSnapshot } from '@galcraft/contracts';

it('starts the actual operation draft with untouched defaults and records subsequent editor changes as explicit common overrides', async () => {
  const saveDraft = vi.fn(async ({ draft }) => ({ ok: true, value: { ...structuredClone(draft), revision: draft.revision + 1 }, warnings: [] }));
  const session = new ProductionSession({ production: { saveDraft } } as unknown as WorkbenchBridge, 'Work01');
  const definition = operations.find(operation => operation.id.endsWith('/speech'))!;
  const snapshot: ProductionOperationSnapshot = { id: definition.id, version: 1, provider: { id: 'org.galcraft.voicestudio', version: '0.1.0' }, definition };
  session.data.operations = [snapshot];
  try {
    await session.openOperation(snapshot); expect(session.variant?.fields.speed).toBe(1); expect(session.variant?.parameterOverrides).toEqual({});
    const target = session.productionEditorContext(); const first = await target.commit({ expectedRevision: target.revision, fields: { ...target.fields, speed: .85 }, references: [] }); expect(first.ok).toBe(true);
    expect(session.variant?.parameterOverrides?.speed).toBe(.85);
    const latest = session.productionEditorContext(); const second = await latest.commit({ expectedRevision: latest.revision, fields: { ...latest.fields, speed: 1 }, references: [] }); expect(second.ok).toBe(true);
    expect(session.variant?.parameterOverrides?.speed).toBe(1);
  } finally { session.stop(); }
});
it('keeps sentence number/integer overrides typed and deletes a cleared value to restore inheritance', () => {
  expect(speechLineOverrideFields({}, { path: 'speed', type: 'number' }, '0.85')).toEqual({ speed: .85 });
  expect(speechLineOverrideFields({}, { path: 'count', type: 'integer' }, '2')).toEqual({ count: 2 });
  expect(speechLineOverrideFields({ speed: .85, referenceText: 'keep' }, { path: 'speed', type: 'number' }, '')).toEqual({ referenceText: 'keep' });
});
it('edits an incomplete clone draft and preserves M10 sentence inputs outside the plugin field schema', async () => {
  const saveDraft = vi.fn(async ({ draft }) => ({ ok: true, value: { ...structuredClone(draft), revision: draft.revision + 1 }, warnings: [] }));
  const session = new ProductionSession({ production: { saveDraft } } as unknown as WorkbenchBridge, 'Work01');
  const definition = operations.find(operation => operation.id.endsWith('/clone'))!, snapshot: ProductionOperationSnapshot = { id: definition.id, version: 1, provider: { id: 'org.galcraft.voicestudio', version: '0.1.0' }, definition };
  session.data.operations = [snapshot];
  try {
    await session.openOperation(snapshot); session.field('speechLines', [{ id: 'Line01', text: 'keep this sentence' }]); session.field('voiceUseCharacterPresets', true); await session.saveDraft(true);
    const target = session.productionEditorContext(); expect(target.fields.speechLines).toBeUndefined();
    const result = await target.commit({ expectedRevision: target.revision, fields: { ...target.fields, text: 'New spoken text', speed: .85 }, references: [] });
    expect(result.ok).toBe(true); expect(session.variant?.fields.speechLines).toEqual([{ id: 'Line01', text: 'keep this sentence' }]); expect(session.variant?.fields.voiceUseCharacterPresets).toBe(true); expect(session.variant?.fields.text).toBe('New spoken text');
  } finally { session.stop(); }
});
