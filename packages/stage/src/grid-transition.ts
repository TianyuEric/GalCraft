import type { Transition } from '@galcraft/contracts';
import { ease } from './animation.js';

/** The same directional cell clock drives Studio previews and the Player interlude. */
export function gridCellProgress(spec: Transition, progress: number, x: number, y: number): number {
  const columns = spec.grid?.columns ?? 12, rows = spec.grid?.rows ?? 8;
  const horizontal = spec.direction === 'left' || spec.direction === 'right';
  const reverse = spec.direction === 'left' || spec.direction === 'up';
  const primary = horizontal ? x / Math.max(1, columns - 1) : y / Math.max(1, rows - 1);
  const secondary = horizontal ? y / Math.max(1, rows - 1) : x / Math.max(1, columns - 1);
  const order = (reverse ? 1 - primary : primary) * .7 + secondary * .3;
  return Math.max(0, Math.min(1, ease(Math.max(0, Math.min(1, (progress - order * .55) / .45)), spec.easing.family, spec.easing.direction)));
}

export function paintGridTransition(context: CanvasRenderingContext2D, image: CanvasImageSource,
  size: { width: number; height: number }, spec: Transition, progress: number, entering: boolean) {
  const columns = spec.grid?.columns ?? 12, rows = spec.grid?.rows ?? 8;
  const width = size.width / columns, height = size.height / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const phase = gridCellProgress(spec, progress, x, y), amount = entering ? phase : 1 - phase;
    if (amount <= 0) continue;
    const left = x * width, top = y * height;
    if (spec.preset === 'gridFlip') {
      const scale = Math.sin(amount * Math.PI / 2);
      context.drawImage(image, left, top, width, height, left + width * (1 - scale) / 2, top, width * scale, height);
    } else {
      context.save(); context.beginPath();
      context.moveTo(left, top); context.lineTo(left + width * Math.min(1, amount * 2), top);
      context.lineTo(left + width, top + height * Math.max(0, amount * 2 - 1));
      context.lineTo(left + width * Math.max(0, amount * 2 - 1), top + height);
      context.lineTo(left, top + height * Math.min(1, amount * 2)); context.closePath(); context.clip();
      context.drawImage(image, left, top, width, height, left, top, width + .5, height + .5); context.restore();
    }
  }
}
