import { z } from 'zod';
import { IdSchema } from './common.js';

const ms = z.number().int().nonnegative();
/** Start times are absolute, so clips can overlap without coupling their fades. */
export const StartupClipSchema = z.strictObject({
  id: IdSchema, kind: z.enum(['text', 'color', 'image', 'video']), name: z.string(),
  startMs: ms.default(0), fadeInMs: ms.default(250), holdMs: ms.default(1500), fadeOutMs: ms.default(250),
  text: z.record(z.string(), z.string()).default({}), color: z.string().default('#ffffff'),
  background: z.string().default('transparent'), assetId: IdSchema.nullable().default(null),
  fit: z.enum(['contain', 'cover', 'fill']).default('contain'),
  startSec: z.number().finite().nonnegative().default(0), endSec: z.number().finite().nonnegative().nullable().default(null),
  volume: z.number().finite().min(0).max(1).default(1),
}).superRefine((clip, context) => {
  if (['image', 'video'].includes(clip.kind) && !clip.assetId) context.addIssue({ code: 'custom', path: ['assetId'], message: 'Select a clip resource' });
  if (clip.endSec !== null && clip.endSec <= clip.startSec) context.addIssue({ code: 'custom', path: ['endSec'], message: 'Clip end must follow its start' });
});
export const StartupSequenceSchema = z.strictObject({
  clips: z.array(StartupClipSchema), background: z.string().default('#000000'),
  allowSkip: z.boolean().default(true), revealMs: ms.default(3000),
  revealMode: z.enum(['afterClips', 'withLastClip']).default('afterClips'),
}).refine(sequence => new Set(sequence.clips.map(clip => clip.id)).size === sequence.clips.length, { message: 'Duplicate startup clip identity', path: ['clips'] });
export type StartupClip = z.infer<typeof StartupClipSchema>;
export type StartupSequence = z.infer<typeof StartupSequenceSchema>;
export const startupClipEnd = (clip: StartupClip) => clip.startMs + clip.fadeInMs + clip.holdMs + clip.fadeOutMs;
