import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AnimationGenerationRequestSchema, animationChanges, resolveAnimationGeneration, type Json } from '@galcraft/contracts';
import type { Candidate } from './types.js';
export async function animationCandidate(candidate: Candidate) {
  const artifact = candidate.artifacts.find(value => value.kind === 'animation' && value.role === 'primary');
  if (!artifact || !candidate.input || typeof candidate.input !== 'object' || Array.isArray(candidate.input) || !('fields' in candidate.input)) throw new Error('动画候选缺少冻结输入或 GCA 产物');
  const request = AnimationGenerationRequestSchema.parse(candidate.input.fields);
  const text = candidate.editedText ?? await readFile(artifact.localPath, 'utf8');
  return { request, animation: resolveAnimationGeneration(text, request), artifact };
}
export async function prepareAnimationCandidate(candidate: Candidate) {
  const { request, animation, artifact } = await animationCandidate(candidate), localPath = join(dirname(artifact.localPath), `${candidate.id}.gca`);
  const text = JSON.stringify(animation, null, 2) + '\n'; await writeFile(localPath, text);
  Object.assign(artifact, { localPath, bytes: new TextEncoder().encode(text).length, metadata: { animationChanges: animationChanges(request.currentAnimation, animation) as unknown as Json, originalAnimation: request.currentAnimation as unknown as Json } });
}
