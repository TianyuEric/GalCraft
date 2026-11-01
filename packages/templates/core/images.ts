import type { ComponentConfig, UIImageBinding } from '@galcraft/contracts';
import { componentDefinition } from './catalog.js';
export function effectiveImages(component: ComponentConfig, state: keyof ComponentConfig['states'] | 'normal' = 'normal') {
  return { ...component.normal.images, ...(state === 'normal' ? {} : component.states[state]?.images) };
}
export function validateImages(component: ComponentConfig): string[] {
  const slots = componentDefinition(component.part)?.imageSlots ?? [];
  const errors: string[] = [];
  for (const visual of [component.normal, ...Object.values(component.states)]) for (const [slot, image] of Object.entries(visual.images ?? {})) {
    if (!slots.includes(slot as 'icon')) errors.push(`${component.part} 不提供 ${slot} 图像槽`);
    if (image?.mode === 'nineSlice' && (!image.slices || !image.borders)) errors.push(`${component.part}/${slot} 缺少九宫格切片或边框`);
  }
  return errors;
}
export function nineSlice(binding: UIImageBinding, source: { width: number; height: number }, target: { width: number; height: number }) {
  if (!binding.slices || !binding.borders) throw new Error('九宫格配置不完整');
  const slices = { ...binding.slices }, borders = { ...binding.borders };
  const scale = Math.min(1, source.width / Math.max(1, slices.left + slices.right), source.height / Math.max(1, slices.top + slices.bottom));
  for (const key of ['top', 'right', 'bottom', 'left'] as const) slices[key] *= scale;
  const fit = Math.min(1, target.width / Math.max(1, borders.left + borders.right), target.height / Math.max(1, borders.top + borders.bottom));
  for (const key of ['top', 'right', 'bottom', 'left'] as const) borders[key] *= fit;
  return { slices, borders, center: { width: Math.max(0, target.width - borders.left - borders.right),
    height: Math.max(0, target.height - borders.top - borders.bottom) }, fillCenter: binding.fillCenter };
}
export function imageLayer(binding: UIImageBinding, url: string): HTMLElement {
  const layer = document.createElement('span'); layer.setAttribute('aria-hidden', 'true'); layer.dataset.gcImage = '';
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: String(binding.opacity),
    backgroundPosition: `${binding.positionX * 100}% ${binding.positionY * 100}%`, backgroundRepeat: 'no-repeat' });
  if (binding.mode === 'nineSlice' && binding.slices && binding.borders) {
    const { top, right, bottom, left } = binding.slices;
    layer.style.borderStyle = 'solid'; layer.style.borderColor = 'transparent'; layer.style.borderImageSource = `url("${url}")`;
    layer.style.borderImageSlice = `${top} ${right} ${bottom} ${left}${binding.fillCenter ? ' fill' : ''}`;
    layer.style.borderWidth = `${binding.borders.top}px ${binding.borders.right}px ${binding.borders.bottom}px ${binding.borders.left}px`;
    layer.style.borderImageRepeat = 'stretch';
  } else if (binding.colorMode === 'mask') {
    layer.style.maskImage = `url("${url}")`; layer.style.maskSize = binding.mode === 'native' ? 'auto' : binding.mode;
    layer.style.maskPosition = layer.style.backgroundPosition; layer.style.maskRepeat = 'no-repeat'; layer.style.backgroundColor = binding.tint ?? 'currentColor';
  } else { layer.style.backgroundImage = `url("${url}")`; layer.style.backgroundSize = binding.mode === 'native' ? 'auto' : binding.mode; }
  return layer;
}
