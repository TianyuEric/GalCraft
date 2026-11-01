import { createId } from '@galcraft/contracts';
import { NativeAnimationSchema } from '@galcraft/contracts';
import type { AnimationLeaf, AnimationPath, AnimationProcess, EffectPatch, EffectValues, ExecutionToken, Id, NativeAnimation, PresentationState, Result, Segment, StageObject, StageStation } from '@galcraft/contracts';
import { copy, fail, ok } from './common.js';
import { ease, sampleAnimation } from './sampling.js';
import type { ExecutableAnimation } from './animation-resource.js';
export { ease } from './sampling.js';

type Leaf = number | boolean | EffectValues['blend'] | StageStation;
export type AnimationTarget = Pick<StageObject, 'id' | 'current' | 'processes'> & {
  defaults: EffectValues & { station?: StageStation }; station?: StageStation };
export const StageCameraId: Id = '00000000-0000-4000-8000-000000000006';
function targets(state: PresentationState): AnimationTarget[] {
  return [...state.objects, ...(state.camera ? [{ id: StageCameraId, ...state.camera }] : [])];
}
function syncCamera(state: PresentationState, object: AnimationTarget) {
  if (object.id === StageCameraId && state.camera) state.camera.processes = object.processes;
}
const discrete = (value: Leaf): value is Exclude<Leaf, number> => typeof value !== 'number';
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const extended = { shockwave: { time: 0, amplitude: 30, wavelength: 160, speed: 500, radius: -1, centerX: .5, centerY: .5 },
  circle: { radius: 2, softness: 0, centerX: .5, centerY: .5, invert: false } };
function ensureBranch(object: AnimationTarget, path: string, target: 'current' | 'defaults' = 'current') {
  const branch = path.split('/')[1];
  if (branch === 'shockwave' || branch === 'circle') {
    const values = object[target];
    if (!values[branch]) Object.assign(values, { [branch]: copy(extended[branch]) });
  }
}

function leaves(patch: EffectPatch): Record<string, Leaf> {
  const result: Record<string, Leaf> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((part, index) => { result[`/${key}/${index}`] = part; });
    else if (value !== null && typeof value === 'object') for (const [child, childValue] of Object.entries(value)) {
      if (Array.isArray(childValue)) childValue.forEach((part, index) => { result[`/${key}/${child}/${index}`] = part; });
      else if (childValue !== undefined) result[`/${key}/${child}`] = childValue as Leaf;
    }
    else result[`/${key}`] = value as Leaf;
  }
  return result;
}
function read(object: AnimationTarget, path: string): Leaf {
  ensureBranch(object, path);
  const segments = path.slice(1).split('/');
  let value: unknown = segments[0] === 'station' ? object.station : object.current;
  if (segments[0] === 'station') return value as Leaf;
  for (const key of segments) value = (value as Record<string, unknown>)[key];
  return value as Leaf;
}
function write(object: AnimationTarget, path: string, value: Leaf, target: 'current' | 'defaults' = 'current') {
  ensureBranch(object, path, target);
  const segments = path.slice(1).split('/');
  if (segments[0] === 'station') { if (target === 'current') object.station = value as StageStation; else object.defaults.station = value as StageStation; return; }
  let place: Record<string, unknown> = (target === 'current' ? object.current : object.defaults) as unknown as Record<string, unknown>;
  for (const key of segments.slice(0, -1)) place = place[key] as Record<string, unknown>;
  const name = segments.at(-1)!;
  place[name] = path.startsWith('/rgb/') || path.startsWith('/bevel/rgb/') ? Math.round(Math.max(0, Math.min(255, Number(value)))) :
    path === '/z' ? Math.round(Number(value)) : value;
}
export type AnimationCompletion = { token: ExecutionToken; processId: Id; outcome: 'completed' | 'skipped' | 'failed' };
export function animationFields(animation: ExecutableAnimation): string[] {
  return Array.isArray(animation) ? [...new Set(animation.flatMap(segment => Object.keys(leaves(segment.effects))))] : animation.tracks.map(track => track.path);
}
export function sampleObjectAnimation<T extends AnimationTarget>(object: T, animation: ExecutableAnimation, timeMs: number, current: T = object): T {
  const next = copy(object);
  if (!Array.isArray(animation)) {
    const baseline = Object.fromEntries(animation.tracks.map(track => [track.path, read(next, track.path)]));
    for (const [path, value] of Object.entries(sampleAnimation(animation, timeMs, baseline))) write(next, path, value as Leaf);
  } else {
    let time = Math.max(0, timeMs);
    for (const segment of animation) {
      const factor = segment.durationMs === 0 ? 1 : ease(clamp(time / segment.durationMs), segment.easing.family, segment.easing.direction);
      for (const [path, value] of Object.entries(leaves(segment.effects))) write(next, path,
        typeof value === 'number' ? Number(read(next, path)) + (value - Number(read(next, path))) * factor : value);
      if (time < segment.durationMs) break;
      time -= segment.durationMs;
    }
  }
  const result = copy(current), protectedFields = new Set(current.processes.flatMap(process => process.fields));
  for (const path of animationFields(animation)) if (!protectedFields.has(path)) write(result, path, read(next, path));
  return result;
}
export function scheduleAnimation(object: AnimationTarget, input: { owner: ExecutionToken; segments?: Segment[]; native?: NativeAnimation; repeat?: number; loop?: boolean;
  animationId?: Id; cross?: boolean; parallel?: boolean; keepFinal?: boolean; writeDefault?: boolean }): Result<AnimationProcess> {
  const segments = input.segments ?? [];
  if (input.animationId && object.processes.some(process => process.animationId === input.animationId))
    return fail('ANIMATION_ID_ACTIVE', 'This animation instance is already active on the target', ['chooseTarget']);
  if (input.native && !NativeAnimationSchema.safeParse(input.native).success) return fail('ANIMATION_TRACK', 'Invalid native animation tracks');
  if (!input.native && (!segments.length || segments.some(segment => segment.durationMs < 0))) return fail('ANIMATION_SEGMENT', '动画需要非负时长的段');
  if (input.loop && (input.native ? input.native.durationMs === 0 : segments.every(segment => segment.durationMs === 0)))
    return fail('ANIMATION_LOOP_DURATION', 'A looping animation requires a positive duration');
  if (input.keepFinal === false && input.writeDefault) return fail('ANIMATION_DEFAULT_CONFLICT', '临时动画回退与写入默认表现不能同时启用');
  const fields = input.native ? input.native.tracks.map(track => track.path) : [...new Set(segments.flatMap(segment => Object.keys(leaves(segment.effects))))];
  if (!object.station && fields.includes('/station')) return fail('ANIMATION_CAMERA_STATION', 'The stage camera has no station');
  if (!fields.length) return fail('ANIMATION_FIELDS', '动画没有可变字段');
  const process: AnimationProcess = { id: createId(), owner: input.owner, objectId: object.id, fields,
    ...(input.animationId ? { animationId: input.animationId } : {}),
    segments: copy(segments), ...(input.native ? { native: copy(input.native) } : {}), segmentIndex: 0, elapsedMs: 0, segmentFrom: {}, before: {},
    repeat: input.repeat ?? 1, iteration: 0, loop: input.loop ?? false, cross: input.cross ?? false,
    parallel: input.parallel ?? false, keepFinal: input.keepFinal ?? true, writeDefault: input.writeDefault ?? false,
    status: 'queued' };
  if (process.parallel) {
    for (const old of object.processes) {
      if (old.status === 'queued') continue;
      old.fields = old.fields.filter(path => !fields.includes(path));
    }
    object.processes = object.processes.filter(old => old.fields.length || old.status === 'running');
  }
  object.processes.push(process);
  if (process.parallel || !object.processes.some(old => old !== process && old.status !== 'queued')) start(object, process);
  return ok(process);
}
function start(object: AnimationTarget, process: AnimationProcess) {
  process.status = 'running';
  process.before = Object.fromEntries(process.fields.map(path => [path, read(object, path)]));
  if (process.native) sampleNative(object, process); else enterSegment(object, process);
}
function sampleNative(object: AnimationTarget, process: AnimationProcess) {
  const sampled = sampleAnimation(process.native!, process.elapsedMs,
    process.before as Partial<Record<AnimationPath, AnimationLeaf>>);
  for (const [path, value] of Object.entries(sampled)) if (process.fields.includes(path)) write(object, path, value as Leaf);
}
function enterSegment(object: AnimationTarget, process: AnimationProcess) {
  const targets = leaves(process.segments[process.segmentIndex]!.effects);
  process.segmentFrom = Object.fromEntries(Object.keys(targets).filter(path => process.fields.includes(path) && typeof targets[path] === 'number')
    .map(path => [path, Number(read(object, path))]));
  for (const [path, value] of Object.entries(targets)) if (process.fields.includes(path) && discrete(value)) write(object, path, value);
}
function complete(object: AnimationTarget, process: AnimationProcess, completions: AnimationCompletion[]) {
  if (!process.keepFinal) for (const path of process.fields) write(object, path, process.before[path] as Leaf);
  else if (process.writeDefault) for (const path of process.fields) write(object, path, read(object, path), 'defaults');
  object.processes = object.processes.filter(item => item !== process);
  completions.push({ token: process.owner, processId: process.id, outcome: 'completed' });
  const queued = object.processes.find(item => item.status === 'queued');
  if (queued && !object.processes.some(item => item.status === 'running' && !item.parallel)) start(object, queued);
}
/** Stop only leaves this instance still owns. Newer owners and unrelated processes survive. */
export function stopAnimation(object: AnimationTarget, animationId: Id): Result<AnimationProcess> {
  const process = object.processes.find(item => item.animationId === animationId);
  if (!process) return fail('ANIMATION_INSTANCE_MISSING', 'The animation instance is not active on this target', ['locate']);
  if (process.status !== 'queued' && !process.keepFinal)
    for (const path of process.fields) write(object, path, process.before[path] as Leaf);
  object.processes = object.processes.filter(item => item !== process);
  const queued = object.processes.find(item => item.status === 'queued');
  if (queued && !object.processes.some(item => item.status !== 'queued' && !item.parallel)) start(object, queued);
  return ok(process);
}
export function finishAnimations(state: PresentationState, owner?: ExecutionToken, options: { includeLoops?: boolean } = {}): { state: PresentationState; completions: AnimationCompletion[] } {
  const next=copy(state),completions:AnimationCompletion[]=[];
  for(const object of targets(next)) {
    const owned = () => object.processes.filter(item => (options.includeLoops !== false || !item.loop) && (!owner || item.owner.sessionId === owner.sessionId && item.owner.occurrence === owner.occurrence && item.owner.statementId === owner.statementId));
    while(owned().length) {
      const process=owned().find(item=>item.status==='running')??owned()[0]!;
      if(process.status==='queued')start(object,process);
      if (process.native) { process.elapsedMs = process.native.durationMs; sampleNative(object, process); }
      else for(const segment of process.segments)for(const [path,value] of Object.entries(leaves(segment.effects)))if(process.fields.includes(path))write(object,path,value);
      complete(object,process,completions);
    }
    syncCamera(next, object);
  }
  return {state:next,completions};
}
export function advanceAnimations(state: PresentationState, deltaMs: number): { state: PresentationState; completions: AnimationCompletion[] } {
  const next = copy(state), completions: AnimationCompletion[] = [];
  if (deltaMs < 0) return { state: next, completions };
  for (const object of targets(next)) {
    const budgets = new Map(object.processes.filter(item => item.status === 'running').map(process => [process, deltaMs]));
    const completeAt = (process: AnimationProcess, remainingMs: number) => {
      const queued = object.processes.filter(item => item.status === 'queued');
      complete(object, process, completions);
      for (const item of queued) if (item.status === 'running' && !budgets.has(item)) budgets.set(item, remainingMs);
    };
    for (const [process, budget] of budgets) {
    if (process.status !== 'running') continue;
    if (!process.fields.length) { completeAt(process, budget);
      completions[completions.length - 1]!.outcome = 'skipped'; continue; }
    let left = budget;
    if (process.native) {
      const duration = process.native.durationMs, elapsed = process.elapsedMs + budget, beforeElapsed = process.elapsedMs;
      const remaining = Math.max(1, process.repeat - process.iteration);
      if (!process.loop && (duration === 0 || elapsed >= duration * remaining)) {
        process.elapsedMs = duration; sampleNative(object, process); completeAt(process, Math.max(0, budget - (duration * remaining - beforeElapsed)));
      } else {
        process.iteration += Math.floor(elapsed / duration); process.elapsedMs = elapsed % duration; sampleNative(object, process);
      }
      continue;
    }
    while (left >= 0 && object.processes.includes(process)) {
      const segment = process.segments[process.segmentIndex]!;
      const duration = segment.durationMs, step = Math.min(left, Math.max(0, duration - process.elapsedMs));
      process.elapsedMs += step; left -= step;
      const target = leaves(segment.effects), factor = duration === 0 ? 1 : ease(clamp(process.elapsedMs / duration), segment.easing.family, segment.easing.direction);
      for (const [path, value] of Object.entries(target)) if (process.fields.includes(path) && typeof value === 'number') {
        const from = process.segmentFrom[path] ?? Number(read(object, path));
        write(object, path, from + (value - from) * factor);
      }
      if (process.elapsedMs < duration) break;
      process.segmentIndex++; process.elapsedMs = 0;
      if (process.segmentIndex === process.segments.length) {
        process.iteration++;
        if (process.loop || process.iteration < process.repeat) process.segmentIndex = 0;
        else { completeAt(process, left); break; }
      }
      enterSegment(object, process);
      if (left === 0 && process.segments[process.segmentIndex]!.durationMs > 0) break;
      if (duration === 0 && process.loop && process.segments.every(part => part.durationMs === 0)) break;
    }
  }
    syncCamera(next, object);
  }
  return { state: next, completions };
}
