import { SaxesParser } from 'saxes';
import type { Issue, Result } from '@galcraft/contracts';
import { fail, issue, ok } from './result.js';
import sharp from 'sharp';

export type SVGInspection = { viewBox: { x: number; y: number; width: number; height: number };
  intrinsic: { width: number; height: number }; issues: Issue[] };
export type SVGDecoder = (source: string) => Promise<Result<void>>;
export async function rasterizeSVG(source: string): Promise<Result<Uint8Array>> {
  const inspected = inspectSVG({ source }); if (!inspected.ok) return inspected;
  try { return ok(await sharp(Buffer.from(source)).png().toBuffer()); }
  catch (error) { return fail('SVG_DECODE', String(error), ['edit']); }
}
export const decodeSVG: SVGDecoder = async source => {
  const inspected = inspectSVG({ source }); if (!inspected.ok) return inspected;
  const rendered = await rasterizeSVG(source); return rendered.ok ? ok(undefined) : rendered;
};

const blocked = new Set(['script', 'foreignObject', 'image', 'text', 'tspan', 'animate', 'animateMotion',
  'animateTransform', 'set', 'audio', 'video', 'iframe']);
const allowed = new Set(['svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line',
  'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feComposite', 'feColorMatrix', 'feFlood',
  'feMerge', 'feMergeNode', 'feMorphology', 'feTurbulence', 'feDisplacementMap', 'feDropShadow',
  'feComponentTransfer', 'feFuncR', 'feFuncG', 'feFuncB', 'feFuncA', 'style', 'title', 'desc']);

function dimension(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/.test(raw)) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function inspectSVG(input: { source: string }): Result<SVGInspection> {
  const problems: Issue[] = [];
  if (/<!DOCTYPE|<!ENTITY/i.test(input.source)) return fail('SVG_XML', 'SVG 不接受 DTD 或实体声明');
  const ids = new Set<string>();
  const references: { id: string; place: string }[] = [];
  let root: Record<string, string> | null = null;
  let depth = 0;
  let styleDepth = -1;
  const collectUrls = (value: string, place: string) => {
    for (const match of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      const target = match[2]?.trim() ?? '';
      if (target.startsWith('#') && target.length > 1) references.push({ id: target.slice(1), place });
      else problems.push(issue('SVG_EXTERNAL', `${place} 引用了外部或无效资源 ${target}`));
    }
  };
  try {
    const parser = new SaxesParser({ xmlns: false });
    parser.on('opentag', tag => {
      depth++;
      const name = tag.name;
      const attrs = tag.attributes as Record<string, string>;
      if (depth === 1) {
        if (name !== 'svg') problems.push(issue('SVG_ROOT', '根节点必须是 svg'));
        root = attrs;
      }
      if (!allowed.has(name) || blocked.has(name)) problems.push(issue('SVG_ELEMENT', `不支持 SVG 节点 ${name}`));
      if (name === 'style') styleDepth = depth;
      for (const [key, value] of Object.entries(attrs)) {
        if (/^on[a-z]/i.test(key)) problems.push(issue('SVG_EVENT', `${name} 的 ${key} 事件属性不允许`));
        if (key === 'id') ids.add(value);
        if (key === 'href' || key === 'xlink:href') {
          if (value.startsWith('#') && value.length > 1) references.push({ id: value.slice(1), place: `${name}.${key}` });
          else problems.push(issue('SVG_EXTERNAL', `${name}.${key} 引用了外部资源`));
        }
        collectUrls(value, `${name}.${key}`);
        if (/^(?:src|xlink:arcrole)$/i.test(key)) problems.push(issue('SVG_EXTERNAL', `${name}.${key} 不允许`));
      }
    });
    parser.on('closetag', () => { if (depth === styleDepth) styleDepth = -1; depth--; });
    parser.on('text', value => {
      if (styleDepth >= 0) {
        if (/@import\b/i.test(value)) problems.push(issue('SVG_EXTERNAL', 'style 中不允许 @import'));
        collectUrls(value, 'style');
      }
    });
    parser.on('processinginstruction', value => {
      if (value.target.toLowerCase() === 'xml-stylesheet') problems.push(issue('SVG_EXTERNAL', 'SVG 不允许外部样式表'));
    });
    parser.write(input.source).close();
  } catch (error) { return fail('SVG_XML', `SVG XML 无效：${String(error)}`); }
  if (!root) return fail('SVG_ROOT', '缺少 svg 根节点');
  for (const ref of references) if (!ids.has(ref.id)) problems.push(issue('SVG_REFERENCE', `${ref.place} 缺少内部目标 #${ref.id}`));
  const attrs = root as Record<string, string>;
  const parts = attrs.viewBox?.trim().split(/[\s,]+/).map(Number) ?? [];
  if (parts.length !== 4 || parts.some(value => !Number.isFinite(value)) || parts[2]! <= 0 || parts[3]! <= 0)
    problems.push(issue('SVG_VIEWBOX', 'SVG viewBox 需要四个有限数值，宽高必须大于 0'));
  const width = dimension(attrs.width);
  const height = dimension(attrs.height);
  if (attrs.width !== undefined && width === null) problems.push(issue('SVG_SIZE', 'SVG width 必须是正数或 px'));
  if (attrs.height !== undefined && height === null) problems.push(issue('SVG_SIZE', 'SVG height 必须是正数或 px'));
  if (problems.length) return { ok: false, error: problems[0]!, issues: problems };
  return ok({ viewBox: { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! },
    intrinsic: { width: width ?? parts[2]!, height: height ?? parts[3]! }, issues: [] });
}

export async function decodeSVGInImage(source: string): Promise<Result<void>> {
  const inspected = inspectSVG({ source });
  if (!inspected.ok) return inspected;
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function')
    return fail('SVG_DECODE_UNAVAILABLE', '当前宿主无法进行 SVG 图像解码', ['retry']);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) return fail('SVG_DECODE_FAILED', 'SVG 解码结果没有有效尺寸');
    return ok(undefined);
  } catch (error) { return fail('SVG_DECODE_FAILED', `SVG 图像解码失败：${String(error)}`); }
  finally { URL.revokeObjectURL(url); }
}
