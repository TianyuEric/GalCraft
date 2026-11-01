import { domButton } from '../components/dom-button.js';
import type { Asset } from '@galcraft/contracts';
import { prepareNativeDialog } from '../components/motion.js';
import { actionIcon } from '../components/action-icon.js';
import './asset-details.css';

export function createAssetDetails(asset: Asset, locale: string, actions: { preview(variantId: string): void | Promise<void>; transparent(): void | Promise<void> }, reference?: { variantId: string | null }): HTMLDialogElement {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const item = document.createElement(tag); item.className = className; item.textContent = text; return item; };
  const button = (label: string, run: () => void | Promise<void>, icon?: string) => { const item = domButton(label, run); if (icon) item.prepend(actionIcon(icon)); return item; };
  const kinds: Record<string, [string, string, string]> = { image: ['图像', 'Image', '画像'], audio: ['声音', 'Audio', '音声'], video: ['视频', 'Video', '動画'], font: ['字体', 'Font', 'フォント'], live2d: ['Live2D', 'Live2D', 'Live2D'], texture: ['纹理', 'Texture', 'テクスチャ'], animation: ['动画', 'Animation', 'アニメーション'], effect: ['特效', 'Effect', 'エフェクト'] };
  const formatBytes = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
  const dialog = node('dialog', 'authoring-command-dialog asset-details-dialog');
  dialog.dataset.dialogLayout = 'asset-details'; prepareNativeDialog(dialog);
  const titleId = `asset-title-${asset.id}`; dialog.setAttribute('aria-labelledby', titleId);
  const header = node('header', 'asset-details-heading'), heading = node('div', 'asset-details-title');
  heading.append(node('span', 'asset-details-kind', kinds[asset.kind] ? t(...kinds[asset.kind]) : asset.kind));
  const title = node('h2', '', asset.name); title.id = titleId; heading.append(title);
  const close = button('', () => dialog.close(), 'close'); close.ariaLabel = t('关闭素材详情', 'Close asset details', '素材の詳細を閉じる'); close.title = close.ariaLabel;
  header.append(heading, close); dialog.append(header);
  const body = node('div', 'asset-details-body');
  if (reference?.variantId && !asset.variants.some(variant => variant.id === reference.variantId)) body.append(node('p', 'field-error', t('此处引用版本缺失；原引用保持不变。', 'Referenced version is missing; the original reference is retained.', '参照バージョンがありません。元の参照を保持します。')));
  const metadata = node('dl', 'asset-details-meta');
  for (const [label, value] of [[t('所在目录', 'Folder', 'フォルダー'), asset.folder.join(' / ') || t('素材库', 'Asset library', '素材ライブラリ')],
    [t('修改日期', 'Modified', '更新日'), asset.modifiedAt.slice(0, 10)], [t('版本数量', 'Versions', 'バージョン数'), String(asset.variants.length)],
    [t('标签', 'Tags', 'タグ'), asset.tags.length ? asset.tags.join(' · ') : t('未添加', 'None', 'なし')]]) {
    const item = node('div'); item.append(node('dt', '', label), node('dd', '', value)); metadata.append(item);
  }
  body.append(metadata);
  const variants = node('section', 'asset-details-versions'); variants.ariaLabel = t('素材版本', 'Asset versions', '素材のバージョン');
  variants.append(node('h3', '', t('版本与文件', 'Versions and files', 'バージョンとファイル')));
  for (const [index, variant] of asset.variants.entries()) {
    const row = node('article', 'asset-details-version'); row.dataset.active = String(variant.id === asset.activeVariantId);
    const visual = node('div', 'asset-details-visual');
    if (asset.kind === 'image') { const image = node('img'); image.alt = `${asset.name} · ${t('版本', 'Version', 'バージョン')} ${index + 1}`; image.dataset.assetId = asset.id; image.dataset.variantId = variant.id; visual.append(image); }
    else visual.append(actionIcon(asset.kind === 'audio' ? 'music' : asset.kind === 'video' ? 'play' : 'image'));
    const copy = node('div', 'asset-details-version-copy'), versionTitle = node('div', 'asset-details-version-title');
    versionTitle.append(node('strong', '', `${t('版本', 'Version', 'バージョン')} ${index + 1}`));
    if (variant.id === asset.activeVariantId) versionTitle.append(node('span', 'asset-details-current', t('素材当前版本', 'Current asset version', '素材の現在のバージョン')));
    if (reference && variant.id === (reference.variantId ?? asset.activeVariantId)) versionTitle.append(node('span', 'asset-details-current', t('此处引用版本', 'Version referenced here', 'この箇所の参照バージョン')));
    const dimensions = variant.metadata.width && variant.metadata.height ? `${variant.metadata.width} × ${variant.metadata.height} · ` : '';
    copy.append(versionTitle, node('p', 'field-help', `${dimensions}${formatBytes(variant.files.reduce((sum, file) => sum + file.bytes, 0))} · ${variant.files.length} ${t('个文件', 'files', 'ファイル')}`));
    const files = node('details', 'asset-details-files'); files.append(node('summary', '', t('查看文件', 'View files', 'ファイルを表示')));
    const fileList = node('ul'); for (const file of variant.files) { const fileItem = node('li'); fileItem.append(node('span', '', file.path), node('small', '', formatBytes(file.bytes))); fileList.append(fileItem); } files.append(fileList); copy.append(files);
    const provenance = node('details'); provenance.append(node('summary', '', t('来源与技术详情', 'Source and technical details', '出典と技術情報')), node('pre', '', JSON.stringify({ id: variant.id, original: variant.id === asset.originalVariantId, processing: variant.processing, metadata: variant.metadata, targets: variant.targets }, null, 2))); copy.append(provenance);
    row.append(visual, copy, button(t('查看版本', 'View version', 'バージョンを表示'), () => actions.preview(variant.id), 'search')); variants.append(row);
  }
  body.append(variants); dialog.append(body);
  const footer = node('footer', 'asset-details-footer');
  if (asset.kind === 'image') footer.append(button(t('准备透明版本', 'Prepare transparent version', '透過バージョンを作成'), async () => { dialog.close(); await actions.transparent(); }, 'spark'));
  footer.append(button(t('完成', 'Done', '完了'), () => dialog.close())); dialog.append(footer); return dialog;
}
