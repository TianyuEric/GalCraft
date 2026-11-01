import { IdSchema, type Id, type ImageFace, type Result } from '@galcraft/contracts';
import { copy, fail, ok, record } from './common.js';

const keys = ['closedOpen', 'halfOpen', 'openOpen', 'closedClosed', 'halfClosed', 'openClosed'] as const;
const faceId = (value: unknown): value is Id => IdSchema.safeParse(value).success;
const jitter = (seed: number, randomMs: number) => randomMs ? (seed / 0x100000000 * 2 - 1) * randomMs : 0;

export function configureImageFace(raw: unknown): Result<ImageFace | null> {
  const model = record(raw), mouthInput = record(model.imageMouth), blinkInput = record(model.imageBlink);
  const mouth = mouthInput.enabled === true ? {
    closed: mouthInput.closed as Id, half: faceId(mouthInput.half) ? mouthInput.half : null, open: mouthInput.open as Id,
  } : null;
  const blink = blinkInput.enabled === true ? {
    open: blinkInput.open as Id, closed: blinkInput.closed as Id,
    intervalMs: Number(blinkInput.intervalMs ?? 4000), randomMs: Number(blinkInput.randomMs ?? 1000),
    closeMs: Number(blinkInput.closeMs ?? 100), holdMs: Number(blinkInput.holdMs ?? 100), openMs: Number(blinkInput.openMs ?? 100),
  } : null;
  if (mouth && (!faceId(mouth.closed) || !faceId(mouth.open))) return fail('IMAGE_MOUTH_RESOURCE', '图片口型缺少闭口或开口资源');
  if (blink && (!faceId(blink.open) || !faceId(blink.closed))) return fail('IMAGE_BLINK_RESOURCE', '图片眨眼缺少睁眼或闭眼资源');
  if (!mouth && !blink) return ok(null);
  const mapping = record(model.imageFaceCombinations);
  const combinations = Object.fromEntries(keys.filter(key => faceId(mapping[key])).map(key => [key, mapping[key]])) as ImageFace['combinations'];
  if (mouth && blink) {
    const required = keys.filter(key => mouth.half || !key.startsWith('half'));
    const missing = required.filter(key => !combinations[key]);
    if (missing.length) return fail('IMAGE_FACE_COMBINATION_MISSING', `图片口眼缺少显式组合 ${missing.join('、')}`);
  }
  const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
  return ok({ mouth, blink, combinations, elapsedMs: 0,
    blinkCycleMs: blink ? Math.max(0, blink.intervalMs + jitter(seed, blink.randomMs)) : 0,
    seed, mouthShape: 'closed', eyeClosed: false });
}

export function imageFaceAssets(face: ImageFace): Id[] {
  if (face.mouth && face.blink) return [...new Set(Object.values(face.combinations).filter(faceId))];
  if (face.mouth) return [...new Set([face.mouth.closed, face.mouth.half, face.mouth.open].filter(faceId))];
  return face.blink ? [...new Set([face.blink.open, face.blink.closed])] : [];
}

export function imageFaceAsset(face: ImageFace): Result<Id> {
  if (face.mouth && face.blink) {
    const shape = face.mouthShape === 'half' && !face.mouth.half ? 'open' : face.mouthShape;
    const key = `${shape}${face.eyeClosed ? 'Closed' : 'Open'}` as keyof ImageFace['combinations'];
    const selected = face.combinations[key];
    return selected ? ok(selected) : fail('IMAGE_FACE_COMBINATION_MISSING', `图片口眼缺少显式组合 ${key}`);
  }
  if (face.mouth) return ok(face.mouthShape === 'closed' ? face.mouth.closed : face.mouthShape === 'half' ? face.mouth.half ?? face.mouth.open : face.mouth.open);
  if (face.blink) return ok(face.eyeClosed ? face.blink.closed : face.blink.open);
  return fail('IMAGE_FACE_UNCONFIGURED', '图片对象没有口眼资源');
}

export function advanceImageFace(value: ImageFace, deltaMs: number, voiceLevel: number, targeted: boolean): ImageFace {
  const face = copy(value), step = Math.max(0, deltaMs);
  face.elapsedMs += step;
  face.mouthShape = face.mouth && targeted ? voiceLevel >= .25 ? 'open' : voiceLevel >= .08 ? 'half' : 'closed' : 'closed';
  if (!face.blink) return face;
  const blink = face.blink;
  const duration = blink.closeMs + blink.holdMs + blink.openMs;
  while (face.elapsedMs >= face.blinkCycleMs + duration) {
    face.seed = (Math.imul(face.seed, 1664525) + 1013904223) >>> 0;
    face.blinkCycleMs += Math.max(1, duration + blink.intervalMs + jitter(face.seed, blink.randomMs));
  }
  const phase = face.elapsedMs - face.blinkCycleMs;
  face.eyeClosed = phase >= blink.closeMs / 2 && phase < blink.closeMs + blink.holdMs + blink.openMs / 2;
  return face;
}
