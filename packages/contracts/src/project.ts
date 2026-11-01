import { z } from 'zod';
import { AssetKindSchema } from './assets.js';
import { IdSchema, JsonSchema, RevisionSchema, ScalarSchema, UtcTimeSchema, VersionRefSchema, VersionSchema } from './common.js';
import { CommandDraftSchema, ExprSchema } from './dsl.js';
import { EffectValuesSchema, TransitionSchema } from './presentation.js';
import { ReleaseIdentitySchema } from './release-identity.js';
import { StartupSequenceSchema } from './startup.js';
import type { Id, Revision } from './common.js';

const finite = z.number().finite();
const mediaFit = z.enum(['contain', 'cover', 'fill']);
const seconds = finite.nonnegative();
const milliseconds = z.number().int().nonnegative();
export const SplashPlaybackSchema = z.strictObject({
  durationMs: milliseconds.default(1500), fadeInMs: milliseconds.default(250), fadeOutMs: milliseconds.default(250),
  background: z.string().default('#000000'), fit: mediaFit.default('contain'), allowSkip: z.boolean().default(true),
  startSec: seconds.default(0), endSec: seconds.nullable().default(null), volume: finite.min(0).max(1).default(1),
}).refine(value => value.endSec === null || value.endSec > value.startSec, { message: '开屏结束时间必须晚于起点', path: ['endSec'] });
export const TitleMusicPlaybackSchema = z.strictObject({
  startSec: seconds.default(0), volume: finite.min(0).max(1).default(1), loop: z.boolean().default(true),
  loopStartSec: seconds.default(0), loopEndSec: seconds.nullable().default(null), fadeInMs: milliseconds.default(250),
}).refine(value => value.loopEndSec === null || value.loopEndSec > value.loopStartSec, { message: '循环结束时间必须晚于起点', path: ['loopEndSec'] });
export const TitleVideoPlaybackSchema = z.strictObject({
  startSec: seconds.default(0), endSec: seconds.nullable().default(null), volume: finite.min(0).max(1).default(0),
  loop: z.boolean().default(true), fit: mediaFit.default('cover'),
}).refine(value => value.endSec === null || value.endSec > value.startSec, { message: '主页视频结束时间必须晚于起点', path: ['endSec'] });
export type SplashPlayback = z.infer<typeof SplashPlaybackSchema>;
export type TitleMusicPlayback = z.infer<typeof TitleMusicPlaybackSchema>;
export type TitleVideoPlayback = z.infer<typeof TitleVideoPlaybackSchema>;
const nameCharacters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Names use trimmed, user-visible characters in authoring and playback. */
export function countNameCharacters(value: string): number { return [...nameCharacters.segment(value.trim())].length; }
export const PlayerNameSchema = z.strictObject({
  characterId: IdSchema, defaultName: z.string().trim().min(1), allowCustom: z.boolean(),
  variableId: IdSchema.nullable(), maxLength: z.number().int().min(1).max(100).default(24),
  promptPolicy: z.enum(['always', 'firstAndAfterCompletion']).default('always'),
}).refine(value => !value.allowCustom || value.variableId !== null, { message: '自定义姓名需要绑定进度变量', path: ['variableId'] })
  .refine(value => countNameCharacters(value.defaultName) <= value.maxLength,
    { message: '默认姓名超过姓名长度上限', path: ['defaultName'] });
export type PlayerName = z.infer<typeof PlayerNameSchema>;
export function docSchema<T extends z.ZodType>(data: T) {
  return z.strictObject({ schemaVersion: z.literal(1), documentId: IdSchema, revision: RevisionSchema, data });
}
export type Doc<T> = { schemaVersion: 1; documentId: Id; revision: Revision; data: T };

export const EntryTitleSchema = z.strictObject({
  enabled: z.boolean(), text: z.string(), holdMs: milliseconds, enter: TransitionSchema, exit: TransitionSchema,
});
export const InterludeSchema = z.strictObject({
  image: z.strictObject({ assetId: IdSchema, variantId: IdSchema.nullable() }), fit: mediaFit,
  voice: z.strictObject({ assetId: IdSchema, variantId: IdSchema.nullable() }).nullable(), holdMs: milliseconds,
  oldStageExit: TransitionSchema, enter: TransitionSchema, exit: TransitionSchema, newStageEnter: TransitionSchema,
  allowSkip: z.boolean(),
});
export type Interlude = z.infer<typeof InterludeSchema>;
export const SceneEntryPresentationSchema = z.strictObject({ title: EntryTitleSchema.nullable(), interlude: InterludeSchema.nullable() });
export type SceneEntryPresentation = z.infer<typeof SceneEntryPresentationSchema>;

export const BuiltinPlayerMenuLocales = ['zh-CN', 'en', 'ja'] as const;
export const ProjectLanguagesSchema = z.strictObject({
  menus: z.array(z.string().min(1)).min(1).default([...BuiltinPlayerMenuLocales]),
  menuDefault: z.string().min(1), textDefault: z.string().min(1),
  voiceDefault: z.string().min(1), voices: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (!value.menus.includes(value.menuDefault)) context.addIssue({ code: 'custom', path: ['menuDefault'], message: '默认菜单语言必须在支持列表中' });
  if (value.voices.length && !value.voices.includes(value.voiceDefault)) context.addIssue({ code: 'custom', path: ['voiceDefault'], message: '默认配音语言必须在支持列表中' });
  for (const key of ['menus', 'voices'] as const) if (new Set(value[key]).size !== value[key].length)
    context.addIssue({ code: 'custom', path: [key], message: '语言支持列表不能重复' });
});
export type ProjectLanguages = z.infer<typeof ProjectLanguagesSchema>;

export const EmergencyKeySchema=z.string().regex(/^(?:F(?:[1-9]|1[0-2])|Key[A-Z]|Digit[0-9])$/);
export const ProjectSchema = z.strictObject({
  projectId: IdSchema, name: z.string(), description: z.string(), releaseVersion: VersionSchema, engineVersion: VersionSchema,
  release: ReleaseIdentitySchema.optional(),
  canvas: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive(), stageColor: z.string() }),
  entry: z.strictObject({ sceneId: IdSchema, labelId: IdSchema.nullable() }),
  chapters: z.array(z.strictObject({ id: IdSchema, name: z.string(), sceneIds: z.array(IdSchema), presentation: SceneEntryPresentationSchema.optional() })),
  display: z.strictObject({ icon: IdSchema.nullable(), splash: IdSchema.nullable(), titleBackground: IdSchema.nullable(), titleMusic: IdSchema.nullable(), titleVideo: IdSchema.nullable(),
    splashPlayback: SplashPlaybackSchema.optional(), startupSequence: StartupSequenceSchema.optional(), titleMusicPlayback: TitleMusicPlaybackSchema.optional(), titleVideoPlayback: TitleVideoPlaybackSchema.optional() }),
  languages: ProjectLanguagesSchema,
  dynamicAssets: z.array(IdSchema),
  player: z.strictObject({
    autosave: z.boolean(),
    emergencyKey:EmergencyKeySchema.default('F8'),
    name: PlayerNameSchema.nullable().optional(),
  }),
  platform: z.strictObject({ steamAppId: z.string().nullable() }), createdAt: UtcTimeSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const VariableSchema = z.strictObject({
  id: IdSchema, name: z.string(), type: z.enum(['number', 'boolean', 'string']),
  scope: z.enum(['progress', 'local', 'longTerm']), initial: ScalarSchema,
}).refine(value => typeof value.initial === value.type, { message: 'Initial value must match the variable type', path: ['initial'] });
export type Variable = z.infer<typeof VariableSchema>;
export const SceneSchema = z.strictObject({
  id: IdSchema, name: z.string(), chapterId: IdSchema,
  presentation: SceneEntryPresentationSchema.optional(),
  parameters: z.array(z.strictObject({ variableId: IdSchema, required: z.boolean(), defaultValue: ScalarSchema.nullable() })),
  locals: z.array(VariableSchema), returns: z.enum(['void', 'number', 'boolean', 'string']), script: z.literal('script.gal'),
});
export type Scene = z.infer<typeof SceneSchema>;
/** Legacy required flags remain readable; omission depends on the declared default. */
export function hasSceneParameterDefault(parameter: Scene['parameters'][number], local: Variable | undefined): boolean {
  const value = parameter.defaultValue;
  return !!local && value !== null && typeof value === local.type && (typeof value !== 'number' || Number.isFinite(value));
}
export const VoicePresetSchema = z.strictObject({
  id: IdSchema, revision: RevisionSchema, connectionId: IdSchema, model: z.string(),
  voice: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('id'), value: z.string() }),
    z.strictObject({ kind: z.literal('reference'), assetId: IdSchema, transcript: z.string(), locale: z.string() }),
  ]),
  locale: z.string(), speed: finite, emotion: z.string().nullable(), advanced: z.record(z.string(), JsonSchema),
});
export type VoicePreset = z.infer<typeof VoicePresetSchema>;
export const FixedImageSchema = z.strictObject({ assetId: IdSchema, variantId: IdSchema.nullable() });
export const CharacterDifferenceSchema = z.strictObject({
  id: IdSchema, name: z.string().min(1), figure: FixedImageSchema,
  avatar: z.discriminatedUnion('kind', [
    FixedImageSchema.extend({ kind: z.literal('image') }),
    z.strictObject({ kind: z.literal('crop'), crop: z.strictObject({ x: finite.min(0).max(1), y: finite.min(0).max(1),
      width: finite.positive().max(1), height: finite.positive().max(1) }) }),
  ]).nullable(),
});
export type CharacterDifference = z.infer<typeof CharacterDifferenceSchema>;
export const AfterstoryEntrySchema = z.strictObject({
  id: IdSchema, title: z.string().min(1),
  entry: z.strictObject({ sceneId: IdSchema, labelId: IdSchema.nullable() }), unlockEndingIds: z.array(z.string().min(1)).min(1),
  initialProgress: z.record(IdSchema, ScalarSchema), lockedView: z.enum(['hidden', 'locked']),
  presentation: z.strictObject({
    figure: FixedImageSchema,
    crop: z.strictObject({ x: finite.min(0).max(1), y: finite.min(0).max(1), width: finite.positive().max(1), height: finite.positive().max(1) })
      .refine(crop => crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001, '取景范围须位于源图内'),
    order: finite,
  }).optional(),
});
export type AfterstoryEntry = z.infer<typeof AfterstoryEntrySchema>;
export const CharacterSchema = z.strictObject({
  id: IdSchema, name: z.string(), narrativeRole: z.enum(['viewpoint', 'main', 'supporting', 'character']), description: z.string(), avatar: IdSchema.nullable(),
  personalRoute: z.strictObject({ sceneIds: z.array(IdSchema), endingIds: z.array(z.string().min(1)) }).optional(),
  appearance: z.strictObject({ referenceAssets: z.array(IdSchema), notes: z.string() }),
  groups: z.array(z.strictObject({ id: IdSchema, name: z.string(), assetIds: z.array(IdSchema) })),
  defaultEffects: EffectValuesSchema, voicePresets: z.record(z.string(), VoicePresetSchema),
  defaultVoicing: z.enum(['required', 'intentionalSilent']),
  differences: z.array(CharacterDifferenceSchema).optional(), initialDifferenceId: IdSchema.nullable().optional(),
  afterstory: AfterstoryEntrySchema.nullable().optional(),
});
export type Character = z.infer<typeof CharacterSchema>;

/** Remove only the authoring fields explicitly retired by AO-1 at a read boundary. */
export function normalizeProjectAuthoringData(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const result = structuredClone(input) as Record<string, unknown>;
  delete result.templateDocumentId;
  if (result.player && typeof result.player === 'object' && !Array.isArray(result.player)) {
    const player = result.player as Record<string, unknown>;
    for (const field of ['manualPageSize', 'quickCapacity', 'autoCapacity', 'emergencyImage', 'fallbackFonts']) delete player[field];
  }
  return result;
}
export function normalizeCharacterAuthoringData(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const result = structuredClone(input) as Record<string, unknown>;
  delete result.canvas;
  if (result.appearance && typeof result.appearance === 'object' && !Array.isArray(result.appearance)) {
    const appearance = result.appearance as Record<string, unknown>;
    appearance.notes = [...new Set([appearance.costume, appearance.notes].filter(value => typeof value === 'string' && value.trim()))].join('\n');
    delete appearance.costume;
  }
  if (Array.isArray(result.groups)) for (const group of result.groups) if (group && typeof group === 'object') {
    group.name = [...new Set([group.name, group.costume, group.pose].filter(value => typeof value === 'string' && value.trim()))].join(' · ');
    delete group.costume; delete group.pose;
  }
  if (result.afterstory && typeof result.afterstory === 'object') delete (result.afterstory as Record<string, unknown>).cover;
  return result;
}

export const ProductionItemSchema = z.strictObject({
  id: IdSchema, sceneId: IdSchema, statementId: IdSchema.nullable(), characterId: IdSchema.nullable(),
  usage: z.enum(['voice', 'figure', 'background', 'cg', 'music', 'sfx']), locale: z.string().nullable(),
  specification: z.string(), sourceVersions: z.array(VersionRefSchema),
  state: z.enum(['notStarted', 'processing', 'review', 'adopted', 'needsReview', 'intentionalEmpty']),
  selectedAssetId: IdSchema.nullable(), selectedCandidateId: IdSchema.nullable(), taskId: IdSchema.nullable(),
  spokenText: z.string().nullable(), voicePresetId: IdSchema.nullable(),
});
export type ProductionItem = z.infer<typeof ProductionItemSchema>;
export const GalleryDifferenceSchema = z.strictObject({ id: IdSchema, assetId: IdSchema, name: z.string(), order: finite });
export type GalleryDifference = z.infer<typeof GalleryDifferenceSchema>;
export const GalleryEntrySchema = z.strictObject({
  id: IdSchema, kind: z.enum(['cg', 'music', 'video']), name: z.string(), series: z.string(), order: finite,
  seriesOrder: finite.optional(), differences: z.array(GalleryDifferenceSchema).optional(), coverDifferenceId: IdSchema.nullable().optional(),
  cover: IdSchema.nullable(), assets: z.array(IdSchema), lockedView: z.enum(['hidden', 'placeholder']),
}).refine(value=>value.kind!=='cg'||Array.isArray(value.differences)&&value.assets.length===0,{message:'CG 使用稳定差分列表，assets 应为空',path:['differences']})
  .refine(value=>!value.differences||new Set(value.differences.map(difference=>difference.id)).size===value.differences.length,{message:'CG 差分身份重复',path:['differences']})
  .refine(value=>!value.coverDifferenceId||value.differences?.some(difference=>difference.id===value.coverDifferenceId),{message:'封面差分不属于当前 CG',path:['coverDifferenceId']});
export type GalleryEntry = z.infer<typeof GalleryEntrySchema>;
export const FlowSchema = z.strictObject({
  id: IdSchema, name: z.string(), roots: z.array(IdSchema),
  nodes: z.array(z.strictObject({
    id: IdSchema, name: z.string(), x: finite, y: finite, sceneId: IdSchema, statementId: IdSchema.nullable(),
    unlock: ExprSchema, lockedView: z.enum(['hidden', 'locked']),
    entry: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('firstUnlock') }),
      z.strictObject({ kind: z.literal('initial'), debugScenarioId: IdSchema }),
    ]),
  })),
  edges: z.array(z.strictObject({ id: IdSchema, from: IdSchema, to: IdSchema, label: z.string() })),
});
export type Flow = z.infer<typeof FlowSchema>;
export const PerformancePresetSchema = z.strictObject({
  id: IdSchema, name: z.string(), category: z.string(), revision: RevisionSchema, description: z.string(),
  bindings: z.array(z.strictObject({
    key: z.string(), kind: z.enum(['object', 'character', 'asset']), assetKind: AssetKindSchema.optional(), required: z.boolean(),
  })),
  statements: z.array(CommandDraftSchema), resourceIds: z.array(IdSchema),
});
export type PerformancePreset = z.infer<typeof PerformancePresetSchema>;
export const AuthoringOutlineSchema = z.strictObject({
  setting: z.string(), style: z.string(), audienceNotes: z.string(),
  characters: z.array(z.strictObject({ characterId: IdSchema, description: z.string(), goal: z.string() })),
  chapters: z.array(z.strictObject({
    chapterId: IdSchema, summary: z.string(), scenes: z.array(z.strictObject({
      sceneId: IdSchema, summary: z.string(), branchGoals: z.array(z.string()), productionItemIds: z.array(IdSchema),
    })),
  })),
});
export type AuthoringOutline = z.infer<typeof AuthoringOutlineSchema>;
