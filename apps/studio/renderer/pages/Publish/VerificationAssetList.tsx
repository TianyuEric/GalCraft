import { useState } from 'react';
import type { Asset } from '@galcraft/contracts';
import { Button, Field } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Identity } from '../../components/identity.js';
import './verification-asset-list.css';

export function VerificationAssetList({ assets, target, locale }: { assets: Asset[]; target: string; locale: string }) {
  const [query, setQuery] = useState('');
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const visible = assets.filter(asset => `${asset.name} ${asset.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  if (!assets.length) return <p className="verification-assets-empty">{t('当前目录没有待验证素材，发行检查仍会核对目标能力。', 'No assets await verification in this catalog. Release checks still validate target capabilities.', '現在の一覧に検証待ち素材はありません。配布確認では対象機能を引き続き確認します。')}</p>;
  return <details className="verification-assets"><summary>{t(`待验证素材清单 · ${assets.length} 项`, `Assets awaiting verification · ${assets.length}`, `検証待ち素材一覧・${assets.length} 件`)}</summary>
    {assets.length > 5 && <Field label={t('搜索待验证素材', 'Search assets awaiting verification', '検証待ち素材を検索')}><Input value={query} onChange={event => setQuery(event.target.value)}/></Field>}
    {!!query && <div className="verification-filter"><span role="status">{t(`显示 ${visible.length}/${assets.length} 项`, `Showing ${visible.length}/${assets.length}`, `${visible.length}/${assets.length} 件を表示`)}</span><Button tone="quiet" onClick={() => setQuery('')}>{t('清除搜索', 'Clear search', '検索をクリア')}</Button></div>}
    <div className="verification-asset-region" role="region" aria-label={t('待验证素材列表', 'Assets awaiting verification list', '検証待ち素材リスト')} tabIndex={0}>
      <ul>{visible.map(asset => <li key={asset.id}><strong>{asset.name}</strong><span>{target} · {t('待验证', 'Unverified', '未検証')}</span><details><summary>{t('素材身份', 'Asset identity', '素材の識別情報')}</summary><Identity label={t('素材 ID', 'Asset ID', '素材 ID')} value={asset.id} locale={locale}/></details></li>)}</ul>
      {!visible.length && <p role="status">{t('没有匹配的待验证素材。清除搜索可查看全部。', 'No matching assets. Clear search to see all.', '一致する素材がありません。検索をクリアしてすべて表示します。')}</p>}
    </div>
  </details>;
}
