import type { Asset, AssetTypeData } from '@galcraft/contracts';
import { createAssetDetails } from './asset-details.js';
import { actionIcon } from '../components/action-icon.js';
import type { AuthoringServices } from './controller.js';
import { createAssetPickerPreview } from './asset-picker-preview.js';
import { assetTypeIcon, assetTypeName } from './asset-type-catalog.js';
import { assetNameParts } from '@galcraft/assets/naming';

const releases = new WeakMap<HTMLElement, () => void>();
export function disposeAssetInspector(root: HTMLElement) { releases.get(root)?.(); releases.delete(root); }

export function createAssetInspector(asset: Asset, options: {
  locale: string; reference?: { variantId: string | null };
  services?: AuthoringServices; changed?(): Promise<void>;
  rename(name: string): Promise<void>; preview(variantId: string): void; reveal(): void; transparent(): void;
}): HTMLElement {
  const t = (zh: string, en: string, ja: string) => options.locale === 'en' ? en : options.locale === 'ja' ? ja : zh;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => { const element = document.createElement(tag); element.textContent = text; element.className = className; return element; };
  const action = (label: string, run: () => void, icon: string) => { const button = node('button', label, 'studio-button'); button.type = 'button'; button.prepend(actionIcon(icon)); button.onclick = run; return button; };
  const root = node('section', '', 'authoring-inspector asset-workbench-inspector');
  root.dataset.assetInspector = asset.id;
  const title = node('div', '', 'asset-inspector-title'), name = node('input'); name.value = asset.name; name.readOnly = true; name.dataset.assetName = asset.id; name.ariaLabel = t('素材名称', 'Asset name', '素材名');
  const error = node('p', '', 'field-error'); error.setAttribute('role', 'alert');
  let editing = false, busy = false, saved = asset.name;
  const extension = node('span', '', 'asset-name-extension'); extension.hidden = true;
  const begin = () => { if (busy) return; editing = true; name.value = assetNameParts(saved).stem; extension.textContent = assetNameParts(saved).extension; extension.hidden = !extension.textContent; name.readOnly = false; name.focus(); name.select(); };
  const cancel = () => { editing = false; extension.hidden = true; name.readOnly = true; name.value = saved; error.textContent = ''; };
  const commit = async () => {
    if (!editing || busy) return;
    const stem = name.value.trim();
    if (!stem) { error.textContent = t('请输入素材名称', 'Enter an asset name', '素材名を入力してください'); return; }
    const value = stem + assetNameParts(saved).extension; if (value === saved) { cancel(); return; }
    busy = true; name.disabled = true; error.textContent = '';
    try { await options.rename(value); saved = value; cancel(); }
    catch (reason) { error.textContent = reason instanceof Error ? reason.message : String(reason); }
    finally { busy = false; name.disabled = false; }
  };
  name.onkeydown = event => { if (event.isComposing) return; if (event.key === 'F2') { event.preventDefault(); begin(); } if (editing && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } if (editing && event.key === 'Enter') { event.preventDefault(); void commit(); } };
  name.ondblclick = begin; name.onblur = () => void commit();
  title.append(name, extension, action(t('重命名', 'Rename', '名前を変更'), begin, 'edit')); root.append(title, error);
  const shownId = options.reference?.variantId ?? asset.activeVariantId, shown = asset.variants.find(variant => variant.id === shownId);
  const visual = node('div', '', 'asset-inspector-visual'); visual.dataset.referencePreview = '';
  if (!shown) visual.append(node('p', t('此处引用版本缺失', 'Referenced version is missing', '参照バージョンがありません'), 'field-error'));
  else {
    if (asset.kind === 'image' && !options.services) { const image = node('img'); image.alt = asset.name; image.dataset.assetId = asset.id; image.dataset.variantId = shown.id; image.className = 'asset-inspector-preview'; visual.append(image); }
    visual.append(node('p', options.reference ? t('此处引用版本', 'Version referenced here', 'この箇所の参照バージョン') : t('素材当前版本', 'Current asset version', '素材の現在のバージョン')),
      action(t('预览', 'Preview', 'プレビュー'), () => options.preview(shown.id), 'play'));
  }
  root.append(visual);
  const dispose: (() => void)[] = [];
  let disposed = false;
  const catalog = options.services?.assetTypeCatalog?.();
  if (catalog) void catalog.then(result => { if (!result.ok || disposed) return; const type = node('span', assetTypeName(asset.kind, result.value, options.locale), 'asset-type-marker'); type.prepend(assetTypeIcon(asset.kind, result.value)); title.prepend(type); }).catch(reason => { if (!disposed) error.textContent = String(reason); });
  if (shown && options.services) {
    const services = options.services;
    if (['image','audio','video'].includes(asset.kind) || services.assetUi?.has(asset.kind, shown.typeData, 'preview')) {
      const previewRoot = node('div', '', 'asset-type-inline-preview'); previewRoot.dataset.mediaKind = asset.kind; visual.prepend(previewRoot);
      const preview = createAssetPickerPreview(previewRoot, services, options.locale); void preview.preview(asset, shown.id); dispose.push(preview.dispose);
    }
    const mountEditor = (typeData: AssetTypeData) => {
      if (disposed) return;
      const editor = node('section', '', 'asset-type-editor'); editor.dataset.assetTypeEditor = asset.kind;
      editor.append(node('h3', t('类型属性', 'Type properties', '種類のプロパティ'))); root.append(editor);
      const content = node('div'); editor.append(content);
      const readonly = !!options.reference || !shown.typeData;
      const release = services.assetUi?.mountEditor(content, { kind: asset.kind, typeData, value: structuredClone(typeData.value),
        resource: { assetId: asset.id, variant: shown },
        target: { kind: 'asset', assetId: asset.id, variantId: shown.id, expectedRevision: asset.revision, readonly },
        commit: async value => {
          if (readonly) throw new Error('Asset type context is read-only');
          if (!services.editAssetTypeData) throw new Error('Asset type edit service unavailable');
          const edited = await services.editAssetTypeData({ assetId: asset.id, variantId: shown.id, expectedRevision: asset.revision, typeData: { ...shown.typeData!, value } });
          if (!edited.ok) return edited;
          await options.changed?.(); return { ok: true, value: undefined, warnings: edited.warnings };
        } });
      if (release) { dispose.push(release); editor.append(node('p', !shown.typeData ? t('旧版素材仅查看已有类型信息；原数据和文件保持。', 'Legacy asset type information is read-only. Original data and files are retained.', '旧バージョンの素材情報は読み取り専用です。元のデータとファイルを保持します。') : readonly ? t('此处仅查看固定引用；请到素材库编辑素材。', 'This reference is read-only. Edit the asset in the library.', 'この参照は読み取り専用です。ライブラリで編集してください。') : t('应用会创建新活动版本，所有浮动引用随之更新；固定版本引用保持。', 'Apply creates a new active version and updates floating references; fixed references are retained.', '適用すると新しいアクティブバージョンを作成し、追従参照を更新します。固定参照は保持します。'), 'field-help')); }
      else content.append(node('p', t('此类型的精确版本编辑器不可用。原数据和文件保留。', 'The exact type editor is unavailable. Original data and files are retained.', 'この種類の正確なバージョンのエディターがありません。データとファイルを保持します。'), 'field-help'));
    };
    if (shown.typeData) mountEditor(shown.typeData);
    else if (services.assetUi) void catalog?.then(result => {
      if (!result.ok) return;
      const type = result.value.find(item => item.descriptor.key === asset.kind && item.descriptor.typeVersion === 1 && item.provider);
      if (type?.provider) mountEditor({ typeVersion: type.descriptor.typeVersion, provider: type.provider, value: {} });
    }).catch(reason => { if (!disposed) error.textContent = reason instanceof Error ? reason.message : String(reason); });
  }
  releases.set(root, () => { disposed = true; for (const release of dispose) release(); });
  const details = createAssetDetails(asset, options.locale, { preview: options.preview, transparent: options.transparent }, options.reference);
  if (options.services?.assetUi) for (const [index, visual] of [...details.querySelectorAll<HTMLElement>('.asset-details-visual')].entries()) {
    const variant = asset.variants[index];
    if (variant && options.services.assetUi.has(asset.kind, variant.typeData, 'thumbnail')) { visual.dataset.assetThumbnail = asset.id; visual.dataset.variantId = variant.id; }
  }
  root.append(details.querySelector('.asset-details-body')!);
  const actions = node('div', '', 'asset-inspector-actions');
  actions.append(action(t('所在目录', 'Show folder', 'フォルダー'), options.reveal, 'folder'));
  if (asset.kind === 'image') actions.append(action(t('准备透明版本', 'Prepare transparent version', '透過バージョンを作成'), options.transparent, 'spark'));
  const technical = node('details'); technical.append(node('summary', t('标识与来源', 'Identity and source', '識別子と出典')), node('p', asset.sourceName), node('code', asset.id)); root.append(actions, technical);
  return root;
}
