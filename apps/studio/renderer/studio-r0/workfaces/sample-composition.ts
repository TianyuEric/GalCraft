import type { Character, Expression, Part } from '../model.js';

const dimensions = { width: 1024, height: 1536 };
const facePoints = [[.39, .10], [.51, .09], [.55, .11], [.56, .17], [.50, .19], [.42, .18]];
const accent = { x: .54, y: .10, width: .04, height: .04 };
type Layer = { image: string; x: number; y: number; crop: 'body' | 'shared' | 'face'; grayscale?: boolean; effect?: Part['effect'] };

export const practice = '/practice';
export const figureUrl = (prefix: string, expression: Expression = 'neutral') => `${practice}/figures/${prefix}-${expression}.png`;

export function sampleLayers(character: Pick<Character, 'prefix'>, outfit: string, expression: Expression, parts: Part[], override?: string): Layer[] {
  const body = parts.find(part => part.axis === 'outfit' && part.value === outfit);
  const face = parts.find(part => part.axis === 'expression' && part.value === expression);
  const fromPart = (crop: Layer['crop'], image: string, part?: Part): Layer => ({ crop, image, x: part?.x ?? 0, y: part?.y ?? 0, effect: part?.effect });
  const layers: Layer[] = [];
  if (body?.visible !== false) layers.push({ ...fromPart('body', body?.image || figureUrl(character.prefix), body), grayscale: ['school', 'alternate', 'formal', '衣装色差样例'].includes(outfit) });
  for (const part of parts) if (part.axis === 'shared' && part.visible) layers.push(fromPart('shared', part.image, part));
  if (override || face?.visible !== false) layers.push(fromPart('face', override ?? face?.image ?? figureUrl(character.prefix, expression), face));
  return layers;
}

function filter(layer: Layer) { return layer.grayscale ? 'grayscale(.86) contrast(1.04)' : 'none'; }
const percent = (value: number) => `${value * 100}%`;
const faceClip = `polygon(${facePoints.map(([x, y]) => `${percent(x)} ${percent(y)}`).join(', ')})`;
const accentClip = `ellipse(${percent(accent.width)} ${percent(accent.height)} at ${percent(accent.x)} ${percent(accent.y)})`;

export function sampleLayerStyle(layer: Layer) {
  return {
    transform: `translate(${percent(layer.x / dimensions.width)}, ${percent(layer.y / dimensions.height)})`,
    clipPath: layer.crop === 'face' ? faceClip : layer.crop === 'shared' ? accentClip : undefined,
    filter: layer.effect === 'bake' ? 'drop-shadow(0 0 3px #e4b8ff)' : filter(layer),
  };
}

function paint(context: CanvasRenderingContext2D, layer: Layer, image: HTMLImageElement) {
  const { width, height } = dimensions;
  context.save();
  context.translate(layer.x, layer.y);
  if (layer.crop !== 'body') {
    context.beginPath();
    if (layer.crop === 'shared') context.ellipse(accent.x * width, accent.y * height, accent.width * width, accent.height * height, 0, 0, Math.PI * 2);
    else { facePoints.forEach(([x, y], index) => index ? context.lineTo(x * width, y * height) : context.moveTo(x * width, y * height)); context.closePath(); }
    context.clip();
  }
  context.filter = layer.effect === 'bake' ? 'drop-shadow(0 0 10px #e4b8ff)' : filter(layer);
  context.drawImage(image, 0, 0, width, height);
  context.restore();
}

function cache<K, V>(entries: Map<K, V>, key: K, limit: number, make: () => V): V {
  const value = entries.get(key) ?? make();
  entries.delete(key);
  entries.set(key, value);
  if (entries.size > limit) entries.delete(entries.keys().next().value!);
  return value;
}

export function createSampleCompositor() {
  const images = new Map<string, Promise<HTMLImageElement>>();
  const compositions = new Map<string, Promise<string>>();
  const load = (url: string) => cache(images, url, 24, async () => {
    const image = new Image();
    image.src = url;
    try { await image.decode(); return image; }
    catch { images.delete(url); throw new Error('审核立绘素材无法读取。'); }
  });
  return async (layers: Layer[]) => {
    const first = layers[0];
    if (!first) return null;
    const sameArtwork = first.crop === 'body' && layers.every(layer => layer.image === first.image && !layer.grayscale && !layer.effect && !layer.x && !layer.y);
    if (sameArtwork) return { key: first.image, url: first.image };
    const key = JSON.stringify(layers);
    const url = await cache(compositions, key, 16, async () => {
      try {
        const decoded = await Promise.all(layers.map(layer => load(layer.image)));
        const canvas = document.createElement('canvas');
        canvas.width = dimensions.width; canvas.height = dimensions.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法建立审核合成画布。');
        for (const [index, layer] of layers.entries()) paint(context, layer, decoded[index]!);
        return canvas.toDataURL('image/png');
      } catch (error) { compositions.delete(key); throw error; }
    });
    return { key, url };
  };
}
