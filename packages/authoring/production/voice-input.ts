import type { Character, Json, ProductionOperationSnapshot, VoicePreset } from '@galcraft/contracts';
import type { FormVariant, MediaInput } from './types.js';
import type { SpeechLine } from './draft.js';
export type FrozenVoicePreset = { characterId: string; locale: string; preset: VoicePreset };
/** Resolve one sentence without mutating either the character or the common draft. */
export async function resolveVoiceVariant(variant: FormVariant, line: SpeechLine, characters: Character[], operation: ProductionOperationSnapshot,
  resolveMedia?: (assetId: string) => Promise<MediaInput>): Promise<{ variant: FormVariant; preset?: FrozenVoicePreset }> {
  const character = characters.find(value => value.id === line.characterId), usePreset = variant.fields.voiceUseCharacterPresets !== false;
  const preset = usePreset ? character?.voicePresets[line.language] : undefined;
  const fields: Record<string, Json> = { ...variant.fields, text: line.text, spokenText: line.text, language: line.language, ...(line.fields ?? {}) };
  const parameterOverrides = variant.parameterOverrides ? { ...variant.parameterOverrides, ...(line.fields ?? {}) } : undefined;
  let references = [...(Array.isArray(variant.fields.references) ? variant.fields.references as unknown as MediaInput[] : [])];
  const commonAudio = variant.fields.referenceAudio as unknown as MediaInput | null;
  if (commonAudio && !references.some(media => media.port === 'referenceAudio')) references.push({ ...commonAudio, port: 'referenceAudio' });
  if (line.references) references = structuredClone(line.references);
  const hasReferenceOverride = references.some(media => media.port === 'referenceAudio');
  if (preset) {
    if (!hasReferenceOverride && preset.voice.kind === 'reference' && operation.definition.inputs.some(port => port.key === 'referenceAudio')) {
      if (!resolveMedia) throw new Error(`角色 ${character!.name} 的参考音频解析尚未连接`);
      references.push({ ...await resolveMedia(preset.voice.assetId), port: 'referenceAudio' });
    }
    const values: Record<string, Json> = { voiceId: preset.voice.kind === 'id' ? preset.voice.value : null,
      referenceText: !hasReferenceOverride && preset.voice.kind === 'reference' ? preset.voice.transcript : null,
      referenceLanguage: !hasReferenceOverride && preset.voice.kind === 'reference' ? preset.voice.locale : null, speed: preset.speed, emotion: preset.emotion, ...preset.advanced };
    for (const [key, value] of Object.entries(values)) {
      const defaultValue = operation.definition.fields.find(field => field.path === key)?.default;
      const untouchedDefault = variant.parameterOverrides !== undefined && !Object.hasOwn(variant.parameterOverrides, key) && !Object.hasOwn(line.fields ?? {}, key)
        && defaultValue !== undefined && JSON.stringify(fields[key]) === JSON.stringify(defaultValue);
      if (fields[key] === undefined || fields[key] === null || fields[key] === '' || untouchedDefault) {
        fields[key] = value;
        if (parameterOverrides) parameterOverrides[key] = value;
      }
    }
  }
  if (line.voiceId) fields.voiceId = line.voiceId;
  fields.references = references as unknown as Json;
  fields.referenceAudio = (references.find(media => media.port === 'referenceAudio') ?? null) as unknown as Json;
  const frozen = preset ? { characterId: character!.id, locale: line.language, preset: structuredClone(preset) } : undefined;
  if (frozen) fields.voicePresetSnapshot = frozen as unknown as Json;
  const referencePort = operation.definition.inputs.find(port => port.key === 'referenceAudio' && port.required);
  if (referencePort && !fields.referenceAudio) throw new Error(`台词“${line.original.slice(0, 30)}”缺少 ${character?.name ?? '当前角色'} 的 ${line.language} 参考音色，请补齐或明确覆盖`);
  return { variant: { ...variant, context: [], connectionId: line.connectionId ?? (preset && variant.fields.voiceOverrideConnection !== true ? preset.connectionId : variant.connectionId),
    model: line.model ?? (preset && variant.fields.voiceOverrideConnection !== true ? preset.model : variant.model),
    target: { ...variant.target, sceneId: line.sceneId, statementId: line.statementId, characterId: line.characterId, locale: line.language }, fields,
    ...(parameterOverrides ? { parameterOverrides } : {}) }, ...(frozen ? { preset: frozen } : {}) };
}
