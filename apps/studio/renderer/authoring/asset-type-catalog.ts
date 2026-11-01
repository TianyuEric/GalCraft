import type { AssetKind, AssetTypeCatalogEntry } from '@galcraft/contracts';
import { actionIcon } from '../components/action-icon.js';
import { displayMessage } from '@galcraft/plugins/contracts';

const names: Record<string, [string, string, string]> = { image: ['图像', 'Images', '画像'], audio: ['声音', 'Audio', '音声'], video: ['视频', 'Video', '動画'], font: ['字体', 'Fonts', 'フォント'], live2d: ['Live2D', 'Live2D', 'Live2D'], texture: ['纹理', 'Textures', 'テクスチャ'], animation: ['动画', 'Animation', 'アニメーション'], effect: ['特效', 'Effects', 'エフェクト'] };
export function assetTypeName(kind: AssetKind, catalog: readonly AssetTypeCatalogEntry[], locale: string): string {
  const entry = catalog.find(item => item.descriptor.key === kind), builtin = !kind.includes('/') && names[kind];
  const name = builtin ? builtin[locale === 'en' ? 1 : locale === 'ja' ? 2 : 0] : entry ? displayMessage(entry.descriptor.messages, locale, entry.descriptor.titleKey, entry.descriptor.title) : kind;
  return entry?.unavailable ? `${name} · ${locale === 'en' ? 'provider unavailable' : locale === 'ja' ? '提供元なし' : '提供方不可用'}` : name;
}
export function uniqueAssetTypes(catalog: readonly AssetTypeCatalogEntry[]) {
  return [...new Map(catalog.map(entry => [entry.descriptor.key, entry])).values()];
}
export function assetTypeIcon(kind: AssetKind, catalog: readonly AssetTypeCatalogEntry[]): SVGSVGElement {
  return actionIcon(catalog.find(entry => entry.descriptor.key === kind)?.descriptor.icon ?? 'file');
}
