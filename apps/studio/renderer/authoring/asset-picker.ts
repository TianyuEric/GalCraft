import { domButton } from '../components/dom-button.js';
import { prepareNativeDialog } from '../components/motion.js';
import type { Asset, AssetKind, AssetListIdentity, AssetPickerContext, AssetPickerPage, AssetQuery, AssetTypeCatalogEntry, Id, Result } from '@galcraft/contracts';
import type { AuthoringServices } from './controller.js';
import { createAssetPickerPreview } from './asset-picker-preview.js';
import { loadVisibleAssetThumbnails } from './asset-picker-thumbnails.js';
import './asset-picker.css';
import { assetTypeName, assetTypeIcon } from './asset-type-catalog.js';
import { createAssetTypeFilters } from './asset-type-filters.js';

export type AssetPickerChoice = { asset: Asset; assetId: Id; variantId: Id | null };
export type AssetPickerOptions = {
  services: AuthoringServices; projectId: Id; allowedKinds: AssetKind[]; allowedCapabilities?: string[]; locale?: string;
  characterId?: Id | null; sceneId?: Id | null; assetLocale?: string | null;
  currentAssetId?: Id | null; currentVariantId?: Id | null; currentName?: string; purpose?: string;
  mode?: 'compact' | 'full'; scope?: HTMLElement; returnFocus?: HTMLElement; remember?: boolean;
  onApply(choice: AssetPickerChoice): Promise<Result<unknown>>;
  onImport?(): Promise<void>; onGenerate?(): void; onLocate?(assetId: Id): void;
};
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const value = document.createElement(tag); value.className = className; value.textContent = text; return value;
};
const button = (text: string, run: () => void, className = '') => {
  return domButton(text, run, className);
};
const ok = (): Result<void> => ({ ok: true, value: undefined, warnings: [] });
export async function recordAssetsPicked(services: AuthoringServices, projectId: Id, assetIds: Id[]): Promise<Result<void>> {
  return assetIds.length && services.recordAssetUse ? services.recordAssetUse({ projectId, assetIds: [...new Set(assetIds)] }) : ok();
}

/** Both presentation sizes use this controller; filtering never widens allowedKinds. */
export function createAssetPicker(options: AssetPickerOptions, finish: (choice: AssetPickerChoice | null) => void) {
  const { services } = options, locale = options.locale ?? 'zh-CN';
  const importAssets = options.onImport ?? (services.pickAssetFiles && services.importAssets ? async () => {
    const paths = await services.pickAssetFiles!(); if (!paths.ok) throw new Error(paths.error.message);
    if (!paths.value.length) return;
    const result = await services.importAssets!(paths.value); if (!result.ok) throw new Error(result.error.message);
    if (result.value.failed.length) throw new Error(result.value.failed.map(item => item.issue.message).join('\n'));
  } : undefined);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  let catalog: AssetTypeCatalogEntry[] = [];
  const typeName = (kind: AssetKind) => assetTypeName(kind, catalog, locale);
  const root = node('section', 'asset-picker'), header = node('header', 'asset-picker-header');
  const heading = node('h2', '', options.purpose ? `${t('选择素材', 'Choose asset', '素材を選択')} · ${options.purpose}` : t('选择素材', 'Choose asset', '素材を選択'));
  const expand = button(t('展开素材库', 'Expand library', 'ライブラリを展開'), () => {
    root.closest('dialog')?.classList.toggle('asset-picker-full'); expand.hidden = true;
  }); expand.hidden = options.mode === 'full'; header.append(heading, expand);
  const controls = node('div', 'asset-picker-controls'), search = node('input'); search.type = 'search';
  search.placeholder = t('搜索名称、来源或标签', 'Search name, source or tags', '名前・元ファイル・タグを検索'); search.ariaLabel = search.placeholder;
  const kind = node('select'); kind.ariaLabel = t('素材类型', 'Asset type', '素材の種類'); kind.append(new Option(t('全部适用类型', 'All allowed types', '利用可能な種類すべて'), ''));
  for (const item of options.allowedKinds) kind.append(new Option(typeName(item), item));
  const usage = node('select'); usage.ariaLabel = t('用途', 'Purpose', '用途');
  for (const [value, label] of [['', t('全部用途', 'All purposes', 'すべての用途')], ['background', t('背景', 'Background', '背景')],
    ['figure', t('立绘', 'Figure', '立ち絵')], ['voice', t('配音', 'Voice', 'ボイス')], ['bgm', t('背景音乐', 'Music', 'BGM')],
    ['effect', t('音效', 'Sound effect', '効果音')], ['ui', t('页面素材', 'Page asset', 'ページ素材')]]) usage.append(new Option(label!, value!));
  const tags = node('input'); tags.placeholder = t('标签（逗号分隔）', 'Tags (comma separated)', 'タグ（カンマ区切り）'); tags.ariaLabel = tags.placeholder;
  const character = node('select'); character.ariaLabel = t('角色', 'Character', 'キャラクター');
  const scene = node('select'); scene.ariaLabel = t('场景', 'Scene', 'シーン');
  const language = node('input'); language.placeholder = t('素材语言', 'Asset language', '素材の言語'); language.ariaLabel = language.placeholder;
  controls.append(search, kind, usage, character, scene, language, tags);
  const tabs = node('nav', 'asset-picker-tabs'); tabs.ariaLabel = t('素材范围', 'Asset scope', '素材の範囲');
  const conditions = node('div', 'asset-picker-conditions'), fixed = node('div', 'asset-picker-current');
  const status = node('p', 'asset-picker-status'); status.setAttribute('role', 'status'); status.ariaLive = 'polite';
  const body = node('div', 'asset-picker-body'), results = node('div', 'asset-picker-results'), previewRoot = node('aside', 'asset-picker-preview');
  results.setAttribute('role', 'listbox'); results.ariaLabel = t('可选素材', 'Available assets', '選択可能な素材');
  previewRoot.ariaLabel = t('素材预览', 'Asset preview', '素材プレビュー');
  previewRoot.append(node('p', '', t('点击预览可查看图片、试听音频或播放模型。', 'Preview images, listen to audio or play a model.', '画像・音声・モデルをプレビューできます。')));
  const preview = createAssetPickerPreview(previewRoot, services, locale); body.append(results, previewRoot);
  const pagination = node('div', 'asset-picker-pagination'), footer = node('footer', 'asset-picker-footer');
  const selectedLabel = node('span', 'asset-picker-selection', t('尚未选择', 'No selection', '未選択'));
  const apply = button(t('应用', 'Apply', '適用'), () => { void applySelection(); }, 'authoring-primary'); apply.disabled = true;
  const cancel = button(t('取消', 'Cancel', 'キャンセル'), () => { if (!applying) finish(null); });
  footer.append(selectedLabel, cancel, apply); root.append(header, controls, tabs, conditions, fixed, status, body, pagination, footer);
  const context: AssetPickerContext = { projectId: options.projectId, allowedKinds: [...options.allowedKinds], allowedCapabilities: options.allowedCapabilities,
    characterId: options.characterId ?? null, sceneId: options.sceneId ?? null, locale: options.assetLocale ?? null,
    currentAssetId: options.currentAssetId ?? null, currentVariantId: options.currentVariantId ?? null,
    tab: options.characterId || options.sceneId || options.assetLocale ? 'context' : 'all' };
  const query: AssetQuery = { kind: null, allowedKinds: [...options.allowedKinds], folder: null, characterId: null,
    sceneId: null, locale: null, search: '', tags: [], usage: null, reference: 'any', review: 'any', sort: 'name',
    direction: 'asc', offset: 0, limit: options.mode === 'full' ? 40 : 12, indexRevision: null };
  let generation = 0, disposed = false, applying = false, selected: AssetPickerChoice | null = null;
  let page: AssetPickerPage | null = null, currentAsset: Asset | null = null, timer: ReturnType<typeof setTimeout> | null = null;
  const tabButtons = new Map<AssetPickerContext['tab'], HTMLButtonElement>();
  const assetDetails = (asset: Asset, row?: AssetListIdentity) => {
    const metadata = row ? row.shownVariant?.metadata : asset.variants.find(item => item.id === asset.activeVariantId)?.metadata;
    const size = metadata?.width !== undefined && metadata?.height !== undefined ? `${metadata.width} × ${metadata.height}` :
      metadata?.durationSec !== undefined ? `${metadata.durationSec.toFixed(1)} s` : t('未取得', 'Not available', '未取得');
    return [row?.character?.name, asset.folder.join(' / ') || t('根目录', 'Root folder', 'ルート'), size].filter(Boolean).join(' · ');
  };
  const select = (asset: Asset, variantId: Id | null) => {
    if (!options.allowedKinds.includes(asset.kind) || variantId && !asset.variants.some(item => item.id === variantId)) return;
    selected = { asset, assetId: asset.id, variantId }; apply.disabled = applying;
    selectedLabel.textContent = asset.name;
    for (const item of root.querySelectorAll<HTMLElement>('[data-asset-option]'))
      item.setAttribute('aria-selected', String(item.dataset.assetOption === asset.id && (item.dataset.variant || null) === variantId));
  };
  const card = (asset: Asset, row: AssetListIdentity | undefined, variantId: Id | null = null, isCurrent = false) => {
    const item = node('article', 'asset-picker-card'), choose = button('', () => select(asset, variantId), 'asset-picker-choice');
    choose.dataset.assetOption = asset.id; choose.dataset.variant = variantId ?? ''; choose.setAttribute('role', 'option');
    choose.setAttribute('aria-selected', String(selected?.assetId === asset.id && selected.variantId === variantId));
    choose.title = `${asset.name}\n${assetDetails(asset, row)}\n${asset.sourceName}\n${asset.createdAt}\n${asset.id}`;
    const missingVariant = isCurrent && row?.currentBindingMissing;
    choose.disabled = !!missingVariant || !options.allowedKinds.includes(asset.kind);
    const visual = node('span', 'asset-picker-thumbnail'); visual.append(assetTypeIcon(asset.kind, catalog));
    if (asset.kind === 'image' && !missingVariant) { const image = node('img'); image.alt = ''; image.loading = 'lazy'; visual.replaceChildren(image);
      image.dataset.assetId = asset.id; image.dataset.variantId = variantId ?? asset.activeVariantId; }
    const copy = node('span', 'asset-picker-copy'); copy.append(node('strong', '', asset.name), node('small', '', `${typeName(asset.kind)} · ${assetDetails(asset, row)}`));
    if (row && row.sameNameCount > 1) copy.append(node('small', '', `${asset.sourceName} · ${asset.createdAt}`));
    if (isCurrent) copy.append(node('small', '', missingVariant ? t('此处引用版本缺失', 'Referenced version is missing', '参照バージョンがありません') :
      t('此处引用版本', 'Version referenced here', 'この箇所の参照バージョン')));
    if (!missingVariant && (variantId ?? asset.activeVariantId) === asset.activeVariantId) copy.append(node('small', '', t('素材当前版本', 'Current asset version', '素材の現在のバージョン')));
    if (!missingVariant && services.assetUi?.has(asset.kind, asset.variants.find(item => item.id === (variantId ?? asset.activeVariantId))?.typeData, 'thumbnail')) { visual.dataset.assetThumbnail = asset.id; visual.dataset.variantId = variantId ?? asset.activeVariantId; }
    choose.append(visual, copy); item.append(choose);
    const previewButton = button(t('预览', 'Preview', 'プレビュー'), () => { void preview.preview(asset, variantId); }, 'asset-picker-preview-button');
    previewButton.disabled = !!missingVariant; previewButton.ariaLabel = `${previewButton.textContent} ${asset.name}`; item.append(previewButton);
    return item;
  };
  const draw = () => {
    fixed.replaceChildren(); results.replaceChildren(); pagination.replaceChildren(); conditions.replaceChildren();
    controls.querySelector('.asset-type-filters')?.remove();
    controls.append(createAssetTypeFilters(catalog, query.kind, query.typeFields, locale, values => { query.typeFields = values; query.offset = 0; void refresh(); }));
    for (const [key, value] of tabButtons) value.setAttribute('aria-pressed', String(context.tab === key));
    if (context.tab === 'context') {
      const filters: [keyof Pick<AssetPickerContext, 'characterId' | 'sceneId' | 'locale'>, string][] = [
        ['characterId', t('当前角色', 'Current character', '現在のキャラクター')], ['sceneId', t('当前场景', 'Current scene', '現在のシーン')], ['locale', t('目标语言', 'Target language', '対象の言語')]];
      for (const [key, label] of filters) if (context[key]) {
        const value = key === 'characterId' ? [...character.options].find(item => item.value === context[key])?.text :
          key === 'sceneId' ? [...scene.options].find(item => item.value === context[key])?.text : context[key];
        conditions.append(button(`${label}: ${value ?? context[key]} ×`, () => { context[key] = null; query.offset = 0; void refresh(); }, 'asset-picker-condition'));
      }
      conditions.append(button(t('查看全部适用素材', 'View all allowed assets', '利用可能な素材すべてを表示'), () => { context.tab = 'all'; query.offset = 0; void refresh(); }));
    }
    if (options.currentAssetId) {
      fixed.append(node('small', '', t('当前引用', 'Current reference', '現在の参照')));
      if (currentAsset && page?.current) { fixed.append(card(currentAsset, page.current, options.currentVariantId ?? null, true)); if (page.current.currentBindingMissing) { fixed.append(node('p', '', t('可从列表显式选择替换素材；取消会保留原引用。', 'Select a replacement explicitly from the list; cancel keeps the original reference.', '一覧から置換素材を選択できます。キャンセルすると元の参照を保持します。'))); if (options.onLocate) fixed.append(button(t('定位并补齐', 'Locate and supply', '場所を確認して補完'), () => options.onLocate!(options.currentAssetId!))); } }
      else { fixed.append(node('p', '', `${options.currentName ?? options.currentAssetId} · ${t('素材缺失，保留当前引用', 'Missing asset; current reference is retained', '素材がありません。現在の参照を保持します')}`));
        if (options.onLocate) fixed.append(button(t('定位并补齐', 'Locate and supply', '場所を確認して補完'), () => options.onLocate!(options.currentAssetId!))); }
    }
    if (!page) return;
    for (const asset of page.items) results.append(card(asset, page.rows.find(row => row.assetId === asset.id)));
    if (context.tab === 'recent') for (const entry of page.recentEntries.filter(item => item.missing)) {
      const missing = node('article', 'asset-picker-missing', `${entry.assetId} · ${t('素材缺失', 'Missing asset', '素材がありません')}`);
      missing.append(button(t('移除记录', 'Remove record', '履歴を削除'), () => { void services.removeRecentAsset?.({ projectId: options.projectId, assetId: entry.assetId }).then(result => {
        if (result.ok) void refresh(); else status.textContent = result.error.message;
      }); })); results.append(missing);
    }
    if (page.empty) {
      const messages = { library: t('素材库为空，先导入素材。', 'The library is empty. Import an asset.', 'ライブラリは空です。素材を読み込んでください。'),
        unsupported: t('素材库中没有适用于此字段的类型。', 'No assets have a type supported by this field.', 'この項目に対応する種類の素材がありません。'),
        filter: t('当前筛选没有结果。', 'No assets match these filters.', 'フィルターに一致する素材がありません。') };
      const empty = node('div', 'asset-picker-empty', messages[page.empty]);
      if (page.empty === 'filter') empty.append(button(t('清除筛选', 'Clear filters', 'フィルターを解除'), () => {
        context.tab = 'all'; query.search = ''; query.kind = null; query.typeFields = {}; query.tags = []; query.usage = null; query.characterId = null; query.sceneId = null; query.locale = null;
        search.value = ''; kind.value = ''; tags.value = ''; usage.value = ''; character.value = ''; scene.value = ''; language.value = ''; query.offset = 0; void refresh();
      }));
      if (importAssets) empty.append(button(t('导入素材', 'Import assets', '素材を読み込む'), () => { void importAssets().then(() => refresh()).catch(error => { status.textContent = String(error); void refresh(); }); }));
      if (options.onGenerate) empty.append(button(t('创建素材任务', 'Create an asset task', '素材タスクを作成'), options.onGenerate));
      results.append(empty);
    }
    const previous = button(t('上一页', 'Previous', '前へ'), () => { query.offset = Math.max(0, query.offset - query.limit); void refresh(); }); previous.disabled = query.offset === 0;
    const next = button(t('下一页', 'Next', '次へ'), () => { query.offset += query.limit; void refresh(); }); next.disabled = query.offset + page.items.length >= page.total;
    pagination.append(previous, node('span', '', `${page.total ? query.offset + 1 : 0}–${query.offset + page.items.length} / ${page.total}`), next);
    void loadVisibleAssetThumbnails(services).catch(() => undefined);
  };
  async function refresh() {
    const request = ++generation; status.textContent = t('正在加载…', 'Loading…', '読み込み中…');
    try {
      if (!services.queryAssetPicker) throw new Error(t('素材选择服务尚未就绪', 'Asset picker service is unavailable', '素材選択サービスを利用できません'));
      const types = await services.assetTypeCatalog?.();
      if (disposed || request !== generation) return;
      if (types?.ok) { catalog = types.value; for (const option of kind.options) if (option.value) option.text = typeName(option.value as AssetKind); }
      const result = await services.queryAssetPicker({ context: structuredClone(context), query: structuredClone(query) });
      if (disposed || request !== generation) return;
      if (!result.ok) { if (result.error.code === 'QUERY_STALE') { query.indexRevision = null; await refresh(); return; }
        status.textContent = result.error.message; return; }
      page = result.value; query.indexRevision = page.indexRevision;
      if (query.offset >= page.total && query.offset > 0) { query.offset = Math.max(0, Math.floor(Math.max(0, page.total - 1) / query.limit) * query.limit); await refresh(); return; }
      status.textContent = ''; draw();
    } catch (error) { if (!disposed && request === generation) status.textContent = error instanceof Error ? error.message : String(error); }
  }
  async function applySelection() {
    if (!selected || applying || !options.allowedKinds.includes(selected.asset.kind)) return;
    if (options.allowedCapabilities?.length) {
      const listed = await services.assetTypeCatalog?.();
      const variant = selected.asset.variants.find(item => item.id === (selected!.variantId ?? selected!.asset.activeVariantId));
      const type = listed?.ok ? listed.value.find(item => item.descriptor.key === selected!.asset.kind && !item.unavailable && item.descriptor.typeVersion === (variant?.typeData?.typeVersion ?? 1) && (!variant?.typeData || item.provider?.id === variant.typeData.provider.id && item.provider.version === variant.typeData.provider.version)) : null;
      if (!type || !options.allowedCapabilities.every(capability => type.descriptor.capabilities.includes(capability) || variant?.groupCapabilities?.capabilities.includes(capability))) { status.textContent = t('素材类型不再支持此字段需要的能力', 'The asset type no longer supports the capabilities required by this field', 'この項目に必要な機能を素材の種類が提供していません'); return; }
    }
    applying = true; apply.disabled = true; cancel.disabled = true;
    try {
      const result = await options.onApply(selected);
      if (!result.ok) { status.textContent = result.error.message; return; }
      if (options.remember !== false) await recordAssetsPicked(services, options.projectId, [selected.assetId]);
      finish(selected);
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    finally { applying = false; apply.disabled = !selected; cancel.disabled = false; }
  }
  for (const [key, label] of [['context', t('当前上下文', 'Context', '現在のコンテキスト')], ['recent', t('最近使用', 'Recent', '最近使用')], ['all', t('全部', 'All', 'すべて')]] as const) {
    const value = button(label, () => { context.tab = key; query.offset = 0; void refresh(); }); tabButtons.set(key, value); tabs.append(value);
  }
  const update = () => { if (query.kind !== (kind.value || null)) query.typeFields = {}; query.search = search.value; query.kind = (kind.value || null) as AssetKind | null; query.usage = usage.value || null;
    query.characterId = character.value || null; query.sceneId = scene.value || null; query.locale = language.value.trim() || null;
    query.tags = tags.value.split(/[,，]/).map(value => value.trim()).filter(Boolean); query.offset = 0; void refresh(); };
  for (const input of [kind, usage, character, scene, language, tags]) input.addEventListener('change', update);
  search.oninput = () => { if (timer) clearTimeout(timer); timer = setTimeout(update, 160); };
  search.onkeydown = event => { if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector<HTMLButtonElement>('[data-asset-option]')?.focus(); } };
  results.onkeydown = event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...results.querySelectorAll<HTMLButtonElement>('[data-asset-option]:not(:disabled)')];
    if (!items.length) return; event.preventDefault(); const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1); items[next]?.focus();
  };
  const start = async () => {
    character.append(new Option(t('全部角色', 'All characters', 'すべてのキャラクター'), '')); scene.append(new Option(t('全部场景', 'All scenes', 'すべてのシーン'), ''));
    const source = await services.read(); if (disposed) return;
    if (source.ok) { for (const item of source.value.characters) character.append(new Option(item.name, item.id));
      for (const item of source.value.scenes) scene.append(new Option(item.name, item.sceneId)); }
    if (options.currentAssetId && services.getAsset) { const current = await services.getAsset(options.currentAssetId); if (disposed) return; if (current.ok) currentAsset = current.value; }
    await refresh();
  };
  void start().catch(error => { if (!disposed) status.textContent = String(error); });
  return { root, refresh, focus: () => search.focus(), get applying() { return applying; }, dispose: () => { disposed = true; generation++; if (timer) clearTimeout(timer); preview.dispose(); } };
}

export function openAssetPicker(options: AssetPickerOptions): Promise<AssetPickerChoice | null> {
  return new Promise(resolve => {
    const dialog = node('dialog', `asset-picker-dialog${options.mode === 'full' ? ' asset-picker-full' : ''}`);
    const active = options.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const scroll: { element: HTMLElement; top: number; left: number }[] = [];
    for (let element = active?.parentElement; element; element = element.parentElement) scroll.push({ element, top: element.scrollTop, left: element.scrollLeft });
    let choice: AssetPickerChoice | null = null;
    const picker = createAssetPicker(options, result => { choice = result; dialog.close(); }); dialog.append(picker.root);
    dialog.addEventListener('cancel', event => { if (picker.applying) event.preventDefault(); });
    dialog.addEventListener('close', () => { picker.dispose(); dialog.remove();
      void loadVisibleAssetThumbnails(options.services).catch(() => undefined);
      if (active?.isConnected) active.focus({ preventScroll: true });
      for (const entry of scroll) { entry.element.scrollTop = entry.top; entry.element.scrollLeft = entry.left; } resolve(choice); }, { once: true });
    const container = options.scope?.isConnected ? options.scope : document.getElementById('studio-portals') ?? document.body;
    prepareNativeDialog(dialog); container.append(dialog); dialog.showModal(); picker.focus();
  });
}
