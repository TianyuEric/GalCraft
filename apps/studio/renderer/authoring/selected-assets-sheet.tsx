import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AssetKind, AssetListIdentity, Id } from '@galcraft/contracts';
import { Button, Modal } from '../components/controls.js';
import { DataTable, type DataTableColumn } from '../components/data-table.js';
import { exitDialog } from '../components/motion.js';
import './asset-feedback.css';

export type MissingSelectedAsset = { id: Id; name?: string };
export type SelectedAssetsSheetProps = { items: AssetListIdentity[]; missing: MissingSelectedAsset[]; visibleIds: Id[]; locale: string;
  removeMissing(ids: Id[]): void; close(): void };
const kinds: Record<AssetKind, [string, string, string]> = { image: ['图像', 'Image', '画像'], audio: ['声音', 'Audio', '音声'], video: ['视频', 'Video', '動画'],
  font: ['字体', 'Font', 'フォント'], live2d: ['Live2D', 'Live2D', 'Live2D'], texture: ['纹理', 'Texture', 'テクスチャ'], animation: ['动画', 'Animation', 'アニメーション'], effect: ['特效', 'Effect', 'エフェクト'] };

export function SelectedAssetsSheet({ items, missing: initialMissing, visibleIds, locale, removeMissing, close }: SelectedAssetsSheetProps) {
  const [missing, setMissing] = useState(initialMissing);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const total = items.length + missing.length, visible = items.filter(item => visibleIds.includes(item.assetId)).length;
  const columns: DataTableColumn<AssetListIdentity>[] = [
    { id: 'name', header: t('素材名称与路径', 'Asset name and path', '素材名とパス'), sortValue: item => item.name,
      cell: item => <><strong className="selected-assets-name">{item.name}</strong><details className="selected-assets-path"><summary>{t('查看路径', 'Show path', 'パスを表示')}</summary>
        <code>{[...item.folder, item.sourceName || item.name].join('/')}</code></details></> },
    { id: 'kind', header: t('类型', 'Type', '種類'), width: '100px', sortValue: item => t(...kinds[item.kind]), cell: item => t(...kinds[item.kind]) },
    { id: 'scope', header: t('位置', 'Location', '表示位置'), width: '120px', cell: item => visibleIds.includes(item.assetId)
      ? t('本页', 'This page', 'このページ') : t('其他页或筛选外', 'Other page or filter', '別ページ・絞り込み外') },
  ];
  return <Modal presentation="sheet" className="selected-assets-sheet" title={t('查看所选素材', 'Selected assets', '選択した素材')} close={close}>
    <p className="selected-assets-summary" role="status">{t(`已选 ${total} 项 · 本页 ${visible} · 其他页或筛选外 ${total - visible}`,
      `${total} selected · ${visible} on this page · ${total - visible} on other pages or outside the filter`, `${total} 件を選択 · このページ ${visible} · 別ページ・絞り込み外 ${total - visible}`)}</p>
    <DataTable rows={items} columns={columns} getRowId={item => item.assetId} label={t('所选素材', 'Selected assets', '選択した素材')}
      maxHeight="none" empty={t('没有可用的所选素材。', 'No available selected assets.', '使用可能な選択素材がありません。')}/>
    {!!missing.length && <section className="selected-assets-stale" aria-label={t('失效选择', 'Unavailable selections', '無効な選択')}>
      <h3>{t(`${missing.length} 项选择已失效`, `${missing.length} unavailable selections`, `${missing.length} 件の選択が無効です`)}</h3>
      <p>{t('这些素材已无法读取。移除失效选择后，可以继续处理其他所选素材。', 'These assets are no longer available. Remove their selections to continue working with the remaining assets.', 'これらの素材は読み込めません。無効な選択を解除して、ほかの選択素材の操作を続けられます。')}</p>
      <ul>{missing.map((item, index) => <li key={item.id}>{item.name ?? t(`不可用素材 ${index + 1}`, `Unavailable asset ${index + 1}`, `使用できない素材 ${index + 1}`)}</li>)}</ul>
      <Button onClick={() => { removeMissing(missing.map(item => item.id)); setMissing([]); }}>{t('移除失效选择', 'Remove unavailable selections', '無効な選択を解除')}</Button>
    </section>}
    <footer className="dialog-actions"><Button onClick={close}>{t('返回素材库', 'Back to library', '素材ライブラリに戻る')}</Button></footer>
  </Modal>;
}

export function mountSelectedAssetsSheet(options: Omit<SelectedAssetsSheetProps, 'close'> & { closed(changed: boolean): void }) {
  const node = document.createElement('div'); (document.getElementById('studio-portals') ?? document.body).append(node);
  const root = createRoot(node); let closing = false, changed = false;
  const close = async () => { if (closing) return; closing = true;
    await exitDialog(document.querySelector<HTMLElement>('.selected-assets-sheet[data-slot="dialog-content"]')); root.unmount(); node.remove(); options.closed(changed); };
  root.render(<SelectedAssetsSheet {...options} close={() => { void close(); }} removeMissing={ids => { changed = true; options.removeMissing(ids); }}/>);
}
