import { describe, expect, it } from 'vitest';
import { createId } from '@galcraft/contracts';
import type { ProductionOperationSnapshot } from '@galcraft/contracts';
import { FixtureCharacters } from '@galcraft/contracts/fixtures';
import type { FormVariant, MediaInput } from './types.js';
import { ProductionOperationCatalog } from './operations.js';
import { resolveVoiceVariant } from './voice-input.js';
const media = (assetId: string): MediaInput => ({ assetId, variantId: createId(), candidateId: null, artifactIndex: null, localPath: `D:/${assetId}.mp3`, mime: 'audio/mpeg' });
const preset = (assetId: string, connectionId: string, transcript: string) => ({ id: createId(), revision: 3, connectionId, model: 'voice', locale: 'zh', speed: 1, emotion: null, advanced: { performanceInstruction: 'warm' }, voice: { kind: 'reference' as const, assetId, transcript, locale: 'zh' } });
const form = (): FormVariant => ({ operation: 'speech', fields: {}, context: [], connectionId: createId(), workflowBindingId: null, model: null, recipe: null, promptPreparation: null, backgroundRemoval: null, backgroundPreview: null, sourceVersions: [], target: { usage: 'voice', sceneId: null, statementId: null, characterId: null, locale: null, uiScope: null } });
const line = (characterId: string) => ({ id: createId(), sceneId: createId(), statementId: createId(), characterId, original: '原文', text: '朗读覆盖', language: 'zh', voiceId: null, selected: true });
const operation = (): ProductionOperationSnapshot => { const snapshot = new ProductionOperationCatalog().resolve('speech'); snapshot.definition.inputs = [{ key: 'referenceAudio', type: 'audio', required: true, multiple: false, mimeTypes: [] }]; return snapshot; };
describe('per-sentence character voices', () => {
  it('resolves and freezes each character language preset independently', async () => {
    const a = { ...structuredClone(FixtureCharacters[0]!), voicePresets: { zh: preset(createId(), createId(), 'A reference') } }, b = { ...structuredClone(FixtureCharacters[1]!), voicePresets: { zh: preset(createId(), createId(), 'B reference') } };
    const draft = form(), one = await resolveVoiceVariant(draft, line(a.id), [a, b], operation(), async id => media(id)), two = await resolveVoiceVariant(draft, line(b.id), [a, b], operation(), async id => media(id));
    expect(one.variant.connectionId).toBe(a.voicePresets.zh.connectionId); expect(two.variant.fields.referenceText).toBe('B reference');
    expect(one.variant.fields.text).toBe('朗读覆盖'); expect(one.preset?.preset.revision).toBe(3);
    a.voicePresets.zh.voice.transcript = 'changed'; expect(one.preset?.preset.voice).toMatchObject({ transcript: 'A reference' });
    expect(draft.fields).toEqual({});
  });
  it('keeps per-sentence overrides out of character defaults and requires a replacement transcript', async () => {
    const a = { ...structuredClone(FixtureCharacters[0]!), voicePresets: { zh: preset(createId(), createId(), 'A reference') } }, draft = form();
    draft.fields.performanceInstruction = 'common';
    const current = { ...line(a.id), fields: { performanceInstruction: 'sentence' }, references: [{ ...media(createId()), port: 'referenceAudio' }] };
    const result = await resolveVoiceVariant(draft, current, [a], operation(), async id => media(id));
    expect(result.variant.fields.performanceInstruction).toBe('sentence'); expect(result.variant.fields.referenceText).toBeNull();
    expect(a.voicePresets.zh.advanced.performanceInstruction).toBe('warm');
  });
  it('locates a missing required voice before any submission', async () => {
    const a = { ...structuredClone(FixtureCharacters[0]!), voicePresets: {} };
    await expect(resolveVoiceVariant(form(), line(a.id), [a], operation(), async id => media(id))).rejects.toThrow('缺少');
  });
  it('does not read or send a character reference to a design operation without a reference port', async () => {
    const a = { ...structuredClone(FixtureCharacters[0]!), voicePresets: { zh: preset(createId(), createId(), 'reference') } };
    const design = operation(); design.definition.inputs = [];
    const result = await resolveVoiceVariant(form(), line(a.id), [a], design, async () => { throw new Error('must not resolve unused media'); });
    expect(result.variant.fields.references).toEqual([]);
  });
  it('inherits the character speed through untouched openOperation defaults and preserves explicit common and sentence overrides', async () => {
    const a = { ...structuredClone(FixtureCharacters[0]!), voicePresets: { zh: { ...preset(createId(), createId(), 'reference'), speed: .85 } } };
    const snapshot = operation(); snapshot.definition.fields = [{ path: 'speed', label: 'Speed', type: 'number', default: 1, required: false, nullable: false, description: '', unit: 'none', group: 'basic', summary: true, keywords: [] }];
    const draft = { ...form(), fields: Object.fromEntries(snapshot.definition.fields.map(field => [field.path, field.default])), parameterOverrides: {} };
    const inherited = await resolveVoiceVariant(draft, line(a.id), [a], snapshot, async id => media(id));
    expect(inherited.variant.fields.speed).toBe(.85); expect(inherited.variant.parameterOverrides?.speed).toBe(.85); expect(draft.fields.speed).toBe(1);
    const common = await resolveVoiceVariant({ ...draft, parameterOverrides: { speed: 1 } }, line(a.id), [a], snapshot, async id => media(id)); expect(common.variant.fields.speed).toBe(1);
    const sentence = await resolveVoiceVariant(draft, { ...line(a.id), fields: { speed: .9 } }, [a], snapshot, async id => media(id)); expect(sentence.variant.fields.speed).toBe(.9);
  });
});
