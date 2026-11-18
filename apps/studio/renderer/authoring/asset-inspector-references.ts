import { AssetReferenceSchema, type Asset, type Source, type StudioBridge } from '@galcraft/contracts';
import { actionIcon } from '../components/action-icon.js';
import { domButton } from '../components/dom-button.js';
import { issueText } from '../components/issue-text.js';

export function assetReferenceSourceKey(source: Source): string {
  return JSON.stringify([source.documentId, source.statementId, source.eventId, source.field]);
}

export function createAssetInspectorReferences(asset: Asset, options: {
  locale: string;
  read: NonNullable<StudioBridge['assets']['references']>;
  locate(source: Source): void;
  canLocate?(source: Source): boolean;
  inspectVersion?(variantId: string | null): void;
  ready?(): void;
}) {
  const t = (zh: string, en: string, ja: string) => options.locale === 'en' ? en : options.locale === 'ja' ? ja : zh;
  const node = document.createElement('details');
  node.className = 'asset-inspector-references';
  const summary = document.createElement('summary');
  summary.textContent = t('作品引用', 'Project references', '作品内の参照');
  const content = document.createElement('div');
  node.append(summary, content);
  let disposed = false;
  let loading = false;
  let loaded = false;
  const message = (text: string, role?: 'alert' | 'status') => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    if (role) paragraph.setAttribute('role', role);
    return paragraph;
  };

  const read = async () => {
    if (disposed || loading || loaded) return;
    loading = true;
    content.replaceChildren(message(t('正在读取引用…', 'Loading references…', '参照を読み込み中…'), 'status'));
    try {
      const result = await options.read(asset.id);
      if (disposed) return;
      if (!result.ok) throw new Error(issueText(result.error, options.locale));
      if (!Array.isArray(result.value)) throw new Error(t('引用数据无法读取。', 'Could not read reference data.', '参照データを読み込めません。'));
      const list = document.createElement('ul');
      const available = new Set(asset.variants.map(variant => variant.id));
      let unreadable = 0;
      for (const raw of result.value) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { unreadable++; continue; }
        const { label, ...record } = raw;
        const parsed = AssetReferenceSchema.safeParse(record);
        if (!parsed.success || parsed.data.assetId !== asset.id) { unreadable++; continue; }
        const { variantId, usage, source } = parsed.data;
        const row = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = typeof label === 'string' && label ? label : usage;
        const missing = !available.has(variantId ?? asset.activeVariantId);
        const version = missing
          ? t('版本缺失', 'Missing version', 'バージョンなし')
          : variantId === null ? t('跟随活动版本', 'Follows active version', 'アクティブバージョンに追従') : t('固定版本', 'Fixed version', '固定バージョン');
        row.dataset.assetReference = variantId ?? 'active';
        row.append(title, message(version, missing ? 'status' : undefined));
        if (missing) row.dataset.versionState = 'missing';
        const actions = document.createElement('div');
        actions.className = 'asset-reference-actions';
        if (source && options.canLocate?.(source) !== false) {
          const locate = domButton(t('定位来源', 'Locate source', '参照元に移動'), () => options.locate(source));
          locate.dataset.assetReferenceSource = assetReferenceSourceKey(source);
          locate.prepend(actionIcon('search'));
          actions.append(locate);
        } else {
          row.append(message(source
            ? t('此来源尚无精确定位入口。', 'This source has no exact location available.', 'この参照元には正確な移動先がありません。')
            : t('引用未提供来源位置。', 'This reference has no source location.', '参照元の位置情報がありません。')));
        }
        if (options.inspectVersion) actions.append(domButton(t('查看引用版本', 'Inspect referenced version', '参照バージョンを確認'), () => options.inspectVersion?.(variantId), 'authoring-copy-action'));
        row.append(actions);
        list.append(row);
      }
      const count = list.childElementCount;
      summary.textContent = t(`作品引用 · ${count}`, `Project references · ${count}`, `作品内の参照 · ${count}`);
      content.replaceChildren(count ? list : message(t('当前没有作品引用。', 'No project references.', '作品内の参照はありません。')));
      if (unreadable) content.append(message(t(`有 ${unreadable} 条引用记录无法读取。`, `${unreadable} reference records could not be read.`, `${unreadable} 件の参照を読み込めませんでした。`), 'status'));
      for (const warning of result.warnings) content.append(message(issueText(warning, options.locale), 'status'));
      loaded = true;
      options.ready?.();
    } catch (reason) {
      if (!disposed) content.replaceChildren(message(reason instanceof Error ? reason.message : String(reason), 'alert'),
        domButton(t('重试读取', 'Retry', '再試行'), read));
    } finally { loading = false; }
  };
  node.ontoggle = () => { if (node.open) void read(); };
  return { node, dispose() { disposed = true; } };
}
