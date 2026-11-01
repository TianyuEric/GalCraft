import { z } from 'zod';
import { IdSchema } from '@galcraft/contracts';
import type { Json } from '@galcraft/contracts';

export const AffectionConfigSchema = z.strictObject({ characters: z.array(z.strictObject({
  characterId: IdSchema, min: z.number().finite(), max: z.number().finite(), initial: z.number().finite(),
  visible: z.boolean(), label: z.string(),
}).refine(item => item.min <= item.initial && item.initial <= item.max, '数值范围无效')) }).refine(
  config => new Set(config.characters.map(item => item.characterId)).size === config.characters.length, '角色重复');
export type AffectionConfig = z.infer<typeof AffectionConfigSchema>;

/** Old flattened configurations remain readable; new configurations aggregate every declared instance. */
export function readAffectionConfig(raw: Json | undefined, fallback: AffectionConfig = { characters: [] }): AffectionConfig {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.schemaVersion === 1 && Array.isArray(raw.documents)) {
    const documents = raw.documents.filter((item): item is Record<string, Json> => !!item && typeof item === 'object' && !Array.isArray(item) && item.contribution === 'org.galcraft.affection/config');
    return AffectionConfigSchema.parse({ characters: documents.flatMap(item => AffectionConfigSchema.parse(item.data).characters) });
  }
  return AffectionConfigSchema.parse(raw ?? fallback);
}
