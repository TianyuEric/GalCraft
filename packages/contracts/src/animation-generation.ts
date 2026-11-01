import { z } from 'zod';
import { AnimationPathSchema, NativeAnimationSchema, type AnimationTrack, type NativeAnimation } from './animation.js';
import { IdSchema } from './common.js';

export const AnimationGenerationRequestSchema = z.strictObject({
  instruction: z.string().trim().min(1), mode: z.enum(['new', 'patch', 'replace']),
  currentAnimation: NativeAnimationSchema.nullable(), paths: z.array(AnimationPathSchema),
  range: z.strictObject({ startMs: z.number().finite().nonnegative(), endMs: z.number().finite().nonnegative() }).nullable(),
  targetContext: z.string(), preserveDuration: z.boolean(), allowDelete: z.boolean(),
  assetId: IdSchema.nullable(), assetRevision: z.number().int().nonnegative().nullable(),
}).superRefine((request, ctx) => {
  if (request.mode !== 'new' && !request.currentAnimation) ctx.addIssue({ code: 'custom', message: 'Editing requires the frozen current animation', path: ['currentAnimation'] });
  if (request.mode === 'patch' && !request.paths.length) ctx.addIssue({ code: 'custom', message: 'Choose the tracks to edit', path: ['paths'] });
  if (request.range && (request.range.endMs < request.range.startMs || request.currentAnimation && request.range.endMs > request.currentAnimation.durationMs)) ctx.addIssue({ code: 'custom', message: 'The edit range must be within the current animation', path: ['range'] });
  if (request.assetId && request.assetRevision === null) ctx.addIssue({ code: 'custom', message: 'Existing assets require a frozen revision', path: ['assetRevision'] });
});
export type AnimationGenerationRequest = z.infer<typeof AnimationGenerationRequestSchema>;
export const AnimationGenerationRequestJsonSchema=z.toJSONSchema(AnimationGenerationRequestSchema,{io:'input'});
export type AnimationTrackChange = { path: AnimationTrack['path']; change: 'added' | 'modified' | 'deleted'; startMs: number; endMs: number };
export function animationChanges(before: NativeAnimation | null, after: NativeAnimation): AnimationTrackChange[] {
  return [...new Set([...(before?.tracks.map(track => track.path) ?? []), ...after.tracks.map(track => track.path)])].flatMap(path => {
    const original = before?.tracks.find(track => track.path === path), next = after.tracks.find(track => track.path === path);
    if (JSON.stringify(original) === JSON.stringify(next)) return [];
    const frames = [...(original?.keyframes ?? []), ...(next?.keyframes ?? [])];
    return [{ path, change: !original ? 'added' as const : !next ? 'deleted' as const : 'modified' as const, startMs: Math.min(...frames.map(frame => frame.timeMs)), endMs: Math.max(...frames.map(frame => frame.timeMs)) }];
  });
}
/** Resolve model data without allowing local-edit requests to overwrite unrelated author content. */
export function resolveAnimationGeneration(raw: unknown, request: AnimationGenerationRequest): NativeAnimation {
  AnimationGenerationRequestSchema.parse(request);
  const value = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
  const envelope = value && typeof value === 'object' && !Array.isArray(value) && 'animation' in value ? value as { animation: unknown; deletePaths?: unknown } : { animation: value };
  const proposed = NativeAnimationSchema.parse(envelope.animation), original = request.currentAnimation;
  const deletion = z.array(AnimationPathSchema).parse(envelope.deletePaths ?? []);
  if (deletion.length && !request.allowDelete) throw new Error('Track deletion was not authorized in this request');
  if (request.mode === 'new' || !original) return proposed;
  if (request.preserveDuration && proposed.durationMs !== original.durationMs) throw new Error('This request preserves the current animation duration');
  if (request.mode === 'replace') return proposed;
  if (proposed.durationMs !== original.durationMs) throw new Error('Local edits preserve the current animation duration');
  if (deletion.some(path => !request.paths.includes(path)) || request.range && deletion.length) throw new Error('Track deletion exceeds the selected edit scope');
  const editable = new Set(request.paths), tracks = original.tracks.filter(track => !deletion.includes(track.path)).map(track => {
    const next = proposed.tracks.find(item => item.path === track.path); if (!editable.has(track.path) || !next) return structuredClone(track);
    if (!request.range) return structuredClone(next);
    if (next.mode !== track.mode) throw new Error('A time-range edit must preserve the track value mode');
    const range = request.range;
    return { ...track, keyframes: [...track.keyframes.filter(frame => frame.timeMs < range.startMs || frame.timeMs > range.endMs), ...next.keyframes.filter(frame => frame.timeMs >= range.startMs && frame.timeMs <= range.endMs)].sort((a, b) => a.timeMs - b.timeMs) };
  });
  for (const track of proposed.tracks) if (editable.has(track.path) && !original.tracks.some(item => item.path === track.path) && !deletion.includes(track.path)) {
    if (request.range) throw new Error('Adding tracks requires a whole-track edit scope'); tracks.push(structuredClone(track));
  }
  return NativeAnimationSchema.parse({ ...original, tracks });
}
