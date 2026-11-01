import sharp from 'sharp';

export type AlphaReport = { hasAlpha: boolean; hasTransparency: boolean; hasVisibleForeground: boolean;
  alphaMin: number; alphaMax: number; width: number; height: number };
export type Brush = { x: number; y: number; radius: number; weight: number; mode: 'keep' | 'erase' };
type Undo = { x: number; y: number; width: number; height: number; before: Uint8Array };

export async function inspectAlpha(path: string): Promise<AlphaReport> {
  const metadata = await sharp(path).metadata();
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let alphaMin = 255;
  let alphaMax = 0;
  for (let i = 3; i < data.length; i += info.channels) {
    alphaMin = Math.min(alphaMin, data[i]!);
    alphaMax = Math.max(alphaMax, data[i]!);
  }
  return { hasAlpha: metadata.hasAlpha ?? false, hasTransparency: alphaMin < 255,
    hasVisibleForeground: alphaMax > 0, alphaMin, alphaMax, width: info.width, height: info.height };
}

export class EditableMask {
  readonly values: Uint8Array;
  private readonly undoStack: Undo[] = [];
  constructor(readonly width: number, readonly height: number, initial: Uint8Array) {
    if (width <= 0 || height <= 0 || initial.length !== width * height) throw new Error('蒙版尺寸与画布不符');
    this.values = Uint8Array.from(initial);
  }
  apply(brush: Brush): void {
    if (!Number.isFinite(brush.radius) || brush.radius <= 0 || !Number.isFinite(brush.weight) || brush.weight < 0 || brush.weight > 1)
      throw new Error('笔刷参数不合法');
    const x = Math.max(0, Math.floor(brush.x - brush.radius));
    const y = Math.max(0, Math.floor(brush.y - brush.radius));
    const right = Math.min(this.width, Math.ceil(brush.x + brush.radius + 1));
    const bottom = Math.min(this.height, Math.ceil(brush.y + brush.radius + 1));
    const before = new Uint8Array((right - x) * (bottom - y));
    let n = 0;
    for (let py = y; py < bottom; py++) for (let px = x; px < right; px++) {
      const index = py * this.width + px;
      before[n++] = this.values[index]!;
      if ((px - brush.x) ** 2 + (py - brush.y) ** 2 > brush.radius ** 2) continue;
      const amount = Math.round(brush.weight * 255);
      this.values[index] = brush.mode === 'keep' ? Math.max(this.values[index]!, amount) :
        Math.min(this.values[index]!, 255 - amount);
    }
    this.undoStack.push({ x, y, width: right - x, height: bottom - y, before });
  }
  undo(): boolean {
    const item = this.undoStack.pop();
    if (!item) return false;
    let n = 0;
    for (let py = item.y; py < item.y + item.height; py++) for (let px = item.x; px < item.x + item.width; px++)
      this.values[py * this.width + px] = item.before[n++]!;
    return true;
  }
}

export async function readMask(path: string, width: number, height: number): Promise<Uint8Array> {
  const { data, info } = await sharp(path).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height) throw new Error('蒙版与原图画布不一致');
  if (info.channels === 1) return Uint8Array.from(data);
  const values = new Uint8Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = data[i * info.channels]!;
  return values;
}

export async function maskFromAlpha(path: string): Promise<Uint8Array> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * info.channels + 3]!;
  return mask;
}

export async function adjustMask(mask: Uint8Array, width: number, height: number, featherPx: number, expandPx: number): Promise<Uint8Array> {
  if (mask.length !== width * height || !Number.isFinite(featherPx) || !Number.isFinite(expandPx) || featherPx < 0)
    throw new Error('修边参数不合法');
  let image = sharp(mask, { raw: { width, height, channels: 1 } });
  if (expandPx > 0) image = image.dilate(Math.ceil(expandPx));
  if (expandPx < 0) image = image.erode(Math.ceil(-expandPx));
  if (featherPx > 0) image = image.blur(Math.max(0.3, featherPx));
  const result = await image.greyscale().raw().toBuffer({ resolveWithObject: true });
  if (result.info.channels === 1) return Uint8Array.from(result.data);
  const values = new Uint8Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = result.data[i * result.info.channels]!;
  return values;
}

export async function composeAlpha(path: string, mask: Uint8Array, mode: 'original' | 'existingAlpha'): Promise<Buffer> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (mask.length !== info.width * info.height) throw new Error('蒙版与原图画布不一致');
  for (let i = 0; i < mask.length; i++) data[i * info.channels + 3] = mode === 'original' ?
    Math.round(data[i * info.channels + 3]! * mask[i]! / 255) : mask[i]!;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
}

export async function encodeMask(mask: Uint8Array, width: number, height: number): Promise<Buffer> {
  return sharp(mask, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

export function alignCanvas(canvas: { width: number; height: number; offsetX: number; offsetY: number },
  source: { width: number; height: number; footX: number; footY: number }, targetFoot: { x: number; y: number }) {
  const x = Math.round(targetFoot.x - source.footX);
  const y = Math.round(targetFoot.y - source.footY);
  if (x < 0 || y < 0 || x + source.width > canvas.width || y + source.height > canvas.height)
    throw new Error('差分无法放入共同画布');
  return { width: canvas.width, height: canvas.height, offsetX: canvas.offsetX, offsetY: canvas.offsetY,
    placeX: x, placeY: y };
}

export async function renderAligned(path: string, placement: ReturnType<typeof alignCanvas>): Promise<Buffer> {
  const image = sharp(path);
  const meta = await image.metadata();
  return image.extend({ left: placement.placeX, top: placement.placeY,
    right: placement.width - placement.placeX - meta.width!, bottom: placement.height - placement.placeY - meta.height!,
    background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}
