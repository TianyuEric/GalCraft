import type { Asset, Id } from '@galcraft/contracts';
import { domButton } from '../components/dom-button.js';
import { actionIcon } from '../components/action-icon.js';
import { createAssetPickerPreview } from './asset-picker-preview.js';
import type { AuthoringServices } from './controller.js';
import './asset-surfaces.css';

export function createAssetWorkbenchPreview(asset: Asset, variantId: Id | null, options: {
  locale: string;
  services: AuthoringServices;
  onBindDifference?(asset: Asset, variantId: Id): void;
  onProduceDifference?(assetId: Id, variantId: Id): void;
  onFollowActive?(): void;
}) {
  const t = (zh: string, en: string, ja: string) => options.locale === 'en' ? en : options.locale === 'ja' ? ja : zh;
  const exact = variantId ?? asset.activeVariantId;
  const index = asset.variants.findIndex(item => item.id === exact);
  const variant = asset.variants[index];
  const node = document.createElement('section');
  node.className = 'asset-workbench-preview';
  node.ariaLabel = t('素材预览', 'Asset preview', '素材プレビュー');
  node.dataset.assetPreview = asset.id;
  node.dataset.previewVariant = exact;
  node.dataset.mediaKind = asset.kind;

  const heading = document.createElement('header');
  const identity = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = asset.name;
  const summary = document.createElement('p');
  if (variant) {
    const version = t(`版本 ${index + 1}`, `Version ${index + 1}`, `バージョン ${index + 1}`);
    const status = variantId === null
      ? t('跟随活动版本', 'Follows active version', 'アクティブバージョンに追従')
      : t('固定版本', 'Fixed version', '固定バージョン');
    const dimensions = variant.metadata.width && variant.metadata.height ? `${variant.metadata.width} × ${variant.metadata.height}` : '';
    summary.textContent = [version, status, dimensions].filter(Boolean).join(' · ');
  } else {
    summary.textContent = t('版本缺失', 'Missing version', 'バージョンなし');
  }
  identity.append(title, summary);
  const actions = document.createElement('div');
  actions.className = 'asset-preview-actions';
  const canvas = document.createElement('div');
  canvas.className = 'asset-preview-canvas';
  if (variant && asset.kind === 'image') {
    const size = domButton(t('原始尺寸', 'Actual size', '原寸表示'), () => {
      const native = canvas.classList.toggle('is-native');
      size.ariaPressed = String(native);
    });
    size.ariaPressed = 'false';
    actions.append(size);
    if (options.onBindDifference) {
      const bind = domButton(t('绑定角色差分', 'Bind character variation', 'キャラクター差分に割り当て'), () => options.onBindDifference?.(asset, variant.id));
      bind.prepend(actionIcon('person-standing'));
      actions.append(bind);
    }
    if (options.onProduceDifference) actions.append(domButton(
      t('制作整图差分', 'Create figure variation', '全身差分を制作'),
      () => options.onProduceDifference?.(asset.id, variant.id),
    ));
  }
  heading.append(identity, actions);
  node.append(heading, canvas);

  const preview = createAssetPickerPreview(canvas, options.services, options.locale, { showHeading: false });
  let active = false;
  let disposed = false;
  const setActive = (next: boolean) => {
    if (disposed || active === next) return;
    active = next;
    if (!active) { preview.clear(); return; }
    if (variant) { void preview.preview(asset, exact); return; }
    const missing = document.createElement('p');
    missing.setAttribute('role', 'alert');
    missing.textContent = t('该版本已无法读取。请选择现存版本进行预览。', 'This version is missing. Choose an available version to preview.', 'このバージョンはありません。表示できるバージョンを選択してください。');
    canvas.append(missing);
    if (variantId !== null && asset.variants.some(item => item.id === asset.activeVariantId) && options.onFollowActive)
      canvas.append(domButton(t('查看活动版本', 'View active version', 'アクティブバージョンを表示'), options.onFollowActive));
  };
  return { node, setActive, dispose() { if (disposed) return; disposed = true; preview.dispose(); } };
}
