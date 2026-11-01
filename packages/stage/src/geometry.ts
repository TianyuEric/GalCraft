import type { BackgroundFrame, StageObject, StageStation } from '@galcraft/contracts';

export type Rect = { x: number; y: number; width: number; height: number };
export type BackgroundGeometry = { scale: number; draw: Rect; visibleSource: Rect };

export function backgroundGeometry(source: { width: number; height: number }, target: { width: number; height: number }, frame: BackgroundFrame): BackgroundGeometry {
  const { width: sw, height: sh } = source, { width: w, height: h } = target;
  if (![sw, sh, w, h].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('Source and target dimensions must be positive');
  const scale = frame.fit === 'native' ? 1 : frame.fit === 'contain' ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
  const draw = { x: (w - sw * scale) * frame.positionX, y: (h - sh * scale) * frame.positionY,
    width: sw * scale, height: sh * scale };
  const visibleSource = { x: Math.max(0, -draw.x / scale), y: Math.max(0, -draw.y / scale),
    width: Math.max(0, Math.min(sw, (w - draw.x) / scale) - Math.max(0, -draw.x / scale)),
    height: Math.max(0, Math.min(sh, (h - draw.y) / scale) - Math.max(0, -draw.y / scale)) };
  return { scale, draw, visibleSource };
}

export function canvasPlacement(design: { width: number; height: number }, viewport: Rect): Rect & { scale: number } {
  const scale = Math.min(viewport.width / design.width, viewport.height / design.height);
  const width = design.width * scale, height = design.height * scale;
  return { x: viewport.x + (viewport.width - width) / 2, y: viewport.y + (viewport.height - height) / 2, width, height, scale };
}
export function pointerInDesign(client: { x: number; y: number }, placement: Rect & { scale: number }) {
  return { x: (client.x - placement.x) / placement.scale, y: (client.y - placement.y) / placement.scale };
}
/** Fit the complete source canvas, including transparent margins, into the authored box. */
export function illustrationGeometry(source: { width: number; height: number }, design: { width: number; height: number }, frame: NonNullable<StageObject['illustrationFrame']>) {
  const width = design.width * frame.widthRatio, height = design.height * frame.heightRatio;
  const geometry = backgroundGeometry(source, { width, height }, { fit: frame.fit, positionX: .5, positionY: .5 });
  return { scale: geometry.scale, crop: frame.fit === 'cover' ? geometry.visibleSource : null };
}
export function stationX(station: StageStation, width: number): number {
  const ratios: Record<StageStation, number> = { left: 1 / 6, leftQuarter: 1 / 4, leftThird: 1 / 3, center: 1 / 2,
    rightThird: 2 / 3, rightQuarter: 3 / 4, right: 5 / 6 };
  return width * ratios[station];
}

export function portraitPlacement(input: { station: StageStation; design: { width: number; height: number };
  source: { width: number; height: number; offsetX: number; offsetY: number }; anchor: { x: number; y: number };
  framing: { scale: number; offsetX: number; offsetY: number }; transform: { x: number; y: number; scaleX: number; scaleY: number } }) {
  const scaleX = input.framing.scale * input.transform.scaleX, scaleY = input.framing.scale * input.transform.scaleY;
  return { x: stationX(input.station, input.design.width) + input.transform.x + input.framing.offsetX +
      (input.source.offsetX - input.anchor.x * input.source.width) * scaleX,
    y: input.design.height + input.transform.y + input.framing.offsetY +
      (input.source.offsetY - input.anchor.y * input.source.height) * scaleY,
    scaleX, scaleY };
}
