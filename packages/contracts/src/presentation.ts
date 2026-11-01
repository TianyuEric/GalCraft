import { z } from 'zod';
import { IdSchema, JsonSchema, RefSchema, VersionSchema } from './common.js';
import type { Id, Source } from './common.js';
import { StageStationSchema } from './dsl.js';
import { NativeAnimationSchema } from './animation.js';
import { AvatarSelectionSchema, DialogueSegmentSchema } from './dialogue.js';

const finite = z.number().finite();
const rgb = z.tuple([finite, finite, finite]);
export const EasingSchema = z.strictObject({
  family: z.enum(['linear', 'sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce']),
  direction: z.enum(['in', 'out', 'inOut']),
});
export type Easing = z.infer<typeof EasingSchema>;
export const EffectValuesSchema = z.strictObject({
  x: finite, y: finite, scaleX: finite, scaleY: finite, rotationDeg: finite, opacity: finite,
  blur: finite, brightness: finite, contrast: finite, saturation: finite, gamma: finite, rgb,
  bloom: z.strictObject({ intensity: finite, brightness: finite, blur: finite, threshold: finite }),
  bevel: z.strictObject({ opacity: finite, thickness: finite, rotationDeg: finite, softness: finite, rgb }),
  shockwave: z.strictObject({ time: finite, amplitude: finite, wavelength: finite.positive(), speed: finite, radius: finite, centerX: finite, centerY: finite }).optional(),
  circle: z.strictObject({ radius: finite, softness: finite.nonnegative(), centerX: finite, centerY: finite, invert: z.boolean() }).optional(),
  filters: z.strictObject({ oldFilm: z.boolean(), dot: z.boolean(), reflection: z.boolean(), glitch: z.boolean(), rgbSplit: z.boolean(), godray: z.boolean() }),
  blend: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add']), z: finite,
});
export type EffectValues = z.infer<typeof EffectValuesSchema>;
export const EffectPatchSchema = EffectValuesSchema.omit({ bloom: true, bevel: true, filters: true, shockwave: true, circle: true }).partial().extend({
  bloom: EffectValuesSchema.shape.bloom.partial().optional(),
  bevel: EffectValuesSchema.shape.bevel.partial().optional(),
  filters: EffectValuesSchema.shape.filters.partial().optional(),
  shockwave: EffectValuesSchema.shape.shockwave.unwrap().partial().optional(),
  circle: EffectValuesSchema.shape.circle.unwrap().partial().optional(),
  station: StageStationSchema.optional(),
});
export type EffectPatch = z.infer<typeof EffectPatchSchema>;
export const SegmentSchema = z.strictObject({ effects: EffectPatchSchema, durationMs: finite, easing: EasingSchema });
export type Segment = z.infer<typeof SegmentSchema>;
export const TransitionSchema = z.strictObject({
  preset: z.enum(['cut', 'fade', 'dissolve', 'slide', 'wipe', 'blinds', 'gridFlip', 'diagonalReveal', 'custom']), resourceId: IdSchema.nullable(),
  durationMs: finite, easing: EasingSchema, direction: z.enum(['left', 'right', 'up', 'down']),
  grid: z.strictObject({ columns: z.number().int().min(1).max(64), rows: z.number().int().min(1).max(36) }).optional(),
  animation: NativeAnimationSchema.optional(),
});
export type Transition = z.infer<typeof TransitionSchema>;
export const TransitionPairSchema = z.strictObject({ enter: TransitionSchema, exit: TransitionSchema });
export type TransitionPair = z.infer<typeof TransitionPairSchema>;
export const BackgroundFrameSchema = z.strictObject({
  fit: z.enum(['cover', 'contain', 'native']), positionX: finite.min(0).max(1), positionY: finite.min(0).max(1),
});
export type BackgroundFrame = z.infer<typeof BackgroundFrameSchema>;
export const DialoguePartSchema = z.strictObject({
  statementId: IdSchema, speakerKind: z.enum(['character', 'narrator']), characterId: IdSchema.nullable(),
  body: z.string(), locale: z.string(), segments: z.array(DialogueSegmentSchema).optional(), speakerName: z.string().optional(),
  fontSize: finite.positive().optional(),
}).refine(value => value.speakerKind === 'character' ? value.characterId !== null : value.characterId === null);
export type DialoguePart = z.infer<typeof DialoguePartSchema>;
export const ExecutionTokenSchema = z.strictObject({ sessionId: IdSchema, occurrence: z.number().int().nonnegative(), statementId: IdSchema });
export type ExecutionToken = z.infer<typeof ExecutionTokenSchema>;
export const EffectInstanceSchema = z.strictObject({
  id: IdSchema, type: z.string(), target: z.union([RefSchema, z.literal('stage')]), enabled: z.boolean(),
  resourceId: IdSchema.nullable(), parameters: z.record(z.string(), JsonSchema), elapsedMs: finite, seed: finite,
  layer: z.enum(['back', 'front']).optional(),
  fade: z.strictObject({ elapsedMs: finite.nonnegative(), durationMs: finite.nonnegative() }).optional(),
});
export type EffectInstance = z.infer<typeof EffectInstanceSchema>;
export const AnimationProcessSchema = z.strictObject({
  id: IdSchema, owner: ExecutionTokenSchema, objectId: IdSchema, fields: z.array(z.string()),
  animationId: IdSchema.optional(),
  segments: z.array(SegmentSchema), segmentIndex: z.number().int().nonnegative(), elapsedMs: finite,
  native: NativeAnimationSchema.optional(),
  segmentFrom: z.record(z.string(), finite), before: z.record(z.string(), z.union([finite, z.boolean(), EffectValuesSchema.shape.blend, StageStationSchema])),
  repeat: z.number().int().nonnegative(), iteration: z.number().int().nonnegative(),
  loop: z.boolean(), cross: z.boolean(), parallel: z.boolean(), keepFinal: z.boolean(), writeDefault: z.boolean(),
  status: z.enum(['queued', 'running', 'paused']),
});
export type AnimationProcess = z.infer<typeof AnimationProcessSchema>;
export const AudioStateSchema = z.strictObject({
  assetId: IdSchema.nullable(), variantId: IdSchema.nullable(), stopped: z.boolean(), volume: finite,
  startSec: finite, loop: z.boolean(), loopStartSec: finite, loopEndSec: finite.nullable(),
  fadeInMs: finite, fadeOutMs: finite,
});
export type AudioState = z.infer<typeof AudioStateSchema>;
export const ImageFaceCombinationsSchema = z.strictObject({
  closedOpen: IdSchema.optional(), halfOpen: IdSchema.optional(), openOpen: IdSchema.optional(),
  closedClosed: IdSchema.optional(), halfClosed: IdSchema.optional(), openClosed: IdSchema.optional(),
});
export type ImageFaceCombinations = z.infer<typeof ImageFaceCombinationsSchema>;
export const ImageFaceSchema = z.strictObject({
  mouth: z.strictObject({ closed: IdSchema, half: IdSchema.nullable(), open: IdSchema }).nullable(),
  blink: z.strictObject({ open: IdSchema, closed: IdSchema, intervalMs: finite, randomMs: finite,
    closeMs: finite, holdMs: finite, openMs: finite }).nullable(),
  combinations: ImageFaceCombinationsSchema,
  elapsedMs: finite, blinkCycleMs: finite, seed: finite,
  mouthShape: z.enum(['closed', 'half', 'open']), eyeClosed: z.boolean(),
});
export type ImageFace = z.infer<typeof ImageFaceSchema>;
export const DialoguePortraitSchema = z.strictObject({
  enabled: z.boolean(),
  crop: z.strictObject({ x: finite.min(0).max(1), y: finite.min(0).max(1),
    width: finite.positive().max(1), height: finite.positive().max(1) }),
});
export type DialoguePortrait = z.infer<typeof DialoguePortraitSchema>;
export const StageObjectSchema = z.strictObject({
  id: IdSchema, characterId: IdSchema.nullable(), assetId: IdSchema, variantId: IdSchema,
  differenceCharacterId: IdSchema.optional(), visible: z.boolean().optional(),
  purpose: z.enum(['figure', 'illustration']).optional(),
  illustrationFrame: z.strictObject({ widthRatio: finite.positive(), heightRatio: finite.positive(),
    fit: z.enum(['contain', 'cover', 'native']) }).optional(),
  illustrationStates: z.record(z.string().min(1), IdSchema).optional(),
  illustrationState: z.string().optional(),
  layer: z.enum(['background', 'figure', 'effect', 'overlay']), entranceOrder: z.number().int().nonnegative(),
  backgroundFrame: BackgroundFrameSchema.nullable(), station: StageStationSchema,
  current: EffectValuesSchema, defaults: EffectValuesSchema.extend({ station: StageStationSchema }),
  framing: z.strictObject({
    mode: z.enum(['full', 'upper', 'custom']), scale: finite, offsetX: finite, offsetY: finite,
    crop: z.strictObject({ x: finite, y: finite, width: finite, height: finite }).nullable(),
  }),
  transition: TransitionPairSchema, processes: z.array(AnimationProcessSchema),
  providerState: z.strictObject({ provider: z.string(), version: VersionSchema, state: JsonSchema }).nullable(),
  imageFace: ImageFaceSchema.nullable(),
  imagePlayback: z.strictObject({ mode: z.enum(['loop', 'once']), elapsedMs: finite.nonnegative(), completed: z.boolean(),
    frameDurationsMs: z.array(finite.positive()).min(2), owner: ExecutionTokenSchema.nullable() }).optional(),
  portrait: DialoguePortraitSchema.optional(),
});
export type StageObject = z.infer<typeof StageObjectSchema>;
export const TransitionProcessSchema = z.strictObject({
  id: IdSchema, owner: ExecutionTokenSchema, objectId: IdSchema, kind: z.enum(['enter', 'replace', 'exit']),
  spec: TransitionSchema, elapsedMs: finite, seed: finite, from: StageObjectSchema.nullable(), to: StageObjectSchema.nullable(),
  custom: z.union([NativeAnimationSchema, z.array(SegmentSchema)]).optional(),
});
export type TransitionProcess = z.infer<typeof TransitionProcessSchema>;

export const PresentationStateSchema = z.strictObject({
  objects: z.array(StageObjectSchema), nextEntranceOrder: z.number().int().nonnegative(),
  characterDifferences: z.record(IdSchema, z.strictObject({ differenceId: IdSchema, changedAtMs: finite,
    figure: z.strictObject({ assetId: IdSchema, variantId: IdSchema }),
    avatar: z.union([z.strictObject({ kind: z.literal('image'), assetId: IdSchema, variantId: IdSchema }),
      z.strictObject({ kind: z.literal('crop'), crop: DialoguePortraitSchema.shape.crop }), z.null()]),
    previous: z.strictObject({ assetId: IdSchema, variantId: IdSchema, crop: DialoguePortraitSchema.shape.crop.nullable() }).nullable(),
    elapsedMs: finite.nonnegative(), durationMs: finite.nonnegative(), avatarVisible: z.boolean(), figureVisible: z.boolean(),
  })).optional(),
  logicalTimeMs: finite.nonnegative().optional(),
  camera: z.strictObject({ current: EffectValuesSchema, defaults: EffectValuesSchema,
    processes: z.array(AnimationProcessSchema) }).optional(),
  transitions: z.array(TransitionProcessSchema), effects: z.array(EffectInstanceSchema),
  bgm: AudioStateSchema, ambience: z.record(IdSchema, AudioStateSchema),
  voice: z.strictObject({ assetId: IdSchema, variantId: IdSchema, volume: finite, targetObjectId: IdSchema.nullable(), statementId: IdSchema }).nullable(),
  currentSfx: z.array(z.strictObject({ soundId: IdSchema, audio: AudioStateSchema, statementId: IdSchema })),
  text: z.strictObject({
    speakerId: IdSchema.nullable(), speakerName: z.string(), parts: z.array(DialoguePartSchema), text: z.string(),
    append: z.boolean(), avatarId: IdSchema.nullable(), fontSize: finite.nullable(), textboxVisible: z.boolean(),
    textboxOpacity: finite.optional(),
    textboxTransition: z.strictObject({ from: finite, to: finite, elapsedMs: finite.nonnegative(), durationMs: finite.nonnegative() }).optional(),
    portraitObjectId: IdSchema.nullable().optional(),
    avatarSelection: AvatarSelectionSchema.optional(),
    characterAvatars: z.record(IdSchema, AvatarSelectionSchema).optional(),
    reading: z.strictObject({ mode: z.enum(['adv', 'nvl']), retainIllustrations: z.boolean(), page: z.number().int().nonnegative(),
      start: z.number().int().nonnegative(), end: z.number().int().nonnegative().nullable() }).optional(),
  }),
  film: z.strictObject({ enabled: z.boolean(), top: finite, bottom: finite,
    transition: z.strictObject({ fromTop: finite, fromBottom: finite, toTop: finite, toBottom: finite,
      enabled: z.boolean(), elapsedMs: finite.nonnegative(), durationMs: finite.nonnegative() }).optional() }),
  intro: z.strictObject({
    paragraphs: z.array(z.string()), index: z.number().int().nonnegative(), shown: z.number().int().nonnegative(), held: z.boolean(),
    backgroundColor: z.string(), backgroundImage: IdSchema.nullable(), textColor: z.string(), fontSize: finite.nullable(),
    animation: z.enum(['fade', 'slide', 'typewriter', 'pixel', 'reveal']), durationMs: finite, elapsedMs: finite,
    holdMs: finite, holdRemainingMs: finite, manual: z.boolean(), keepFinal: z.boolean(),
  }).nullable(),
  styles: z.record(IdSchema, IdSchema),
  backgroundVideo: z.strictObject({ assetId: IdSchema, volume: finite, muted: z.boolean(), loop: z.boolean() }).nullable(),
});
export type PresentationState = z.infer<typeof PresentationStateSchema>;

export type VoiceResolution = {
  id: Id; source: Source; requestedLocale: string; defaultLocale: string;
  attempts: { via: 'requestedLocale' | 'projectDefault' | 'legacyVoice'; locale: string; assetId: Id | null }[];
  selected: {
    assetId: Id; variantId: Id | null; locale: string;
    via: 'requestedLocale' | 'projectDefault' | 'legacyVoice';
  } | null;
};
export type VoicePlaybackBinding = { token: ExecutionToken; resolution: VoiceResolution };
export type PresentationDelta = {
  camera?: PresentationState['camera'];
  objects: { op: 'show' | 'replace' | 'update' | 'exit'; id: Id; value: StageObject | null }[];
  effects: EffectInstance[];
  audio: { bus: 'bgm' | 'sfx' | 'voice' | 'ui' | 'video'; id: Id | null; state: AudioState }[];
  voiceBinding?: VoicePlaybackBinding | null;
  text?: PresentationState['text'];
  film?: PresentationState['film'];
  intro?: PresentationState['intro'];
  styles?: PresentationState['styles'];
  backgroundVideo?: PresentationState['backgroundVideo'];
  transitions?: PresentationState['transitions'];
  providerCommands?: { objectId: Id; command: import('./common.js').Json }[];
};
