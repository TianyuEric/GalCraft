import type { DialoguePortrait } from '@galcraft/contracts';

export type PortraitCrop = DialoguePortrait['crop'];
export type CropCorner = 'nw' | 'ne' | 'sw' | 'se';
export const defaultPortraitCrop: PortraitCrop = { x: .25, y: 0, width: .5, height: .35 };
const bound = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;

/** Crop geometry uses the original image canvas, independently of its display size. */
export function constrainPortraitCrop(crop: PortraitCrop): PortraitCrop {
  const width = bound(finite(crop.width, .5), .01, 1), height = bound(finite(crop.height, .35), .01, 1);
  return { x: bound(finite(crop.x, .25), 0, 1 - width), y: bound(finite(crop.y, 0), 0, 1 - height), width, height };
}
export function movePortraitCrop(crop: PortraitCrop, dx: number, dy: number): PortraitCrop {
  return constrainPortraitCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
}
export function resizePortraitCrop(crop: PortraitCrop, corner: CropCorner, dx: number, dy: number): PortraitCrop {
  const left = corner.includes('w') ? bound(crop.x + dx, 0, crop.x + crop.width - .01) : crop.x;
  const right = corner.includes('e') ? bound(crop.x + crop.width + dx, crop.x + .01, 1) : crop.x + crop.width;
  const top = corner.includes('n') ? bound(crop.y + dy, 0, crop.y + crop.height - .01) : crop.y;
  const bottom = corner.includes('s') ? bound(crop.y + crop.height + dy, crop.y + .01, 1) : crop.y + crop.height;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
