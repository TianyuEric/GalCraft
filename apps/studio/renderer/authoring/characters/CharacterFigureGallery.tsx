import { useEffect, useState } from 'react';
import type { Asset } from '@galcraft/contracts';
import { File, Image, Music2, Play } from 'lucide-react';
import type { DifferenceResources } from './SharedDifferencesEditor.js';

function FigureThumbnail({ asset, resources, unavailable }: { asset?: Asset; resources?: DifferenceResources; unavailable: string }) {
  const [uri, setUri] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let active = true, lease: string | undefined;
    setUri(''); setError('');
    if (!asset || asset.kind !== 'image' || !resources) return;
    void resources.resolveRuntime(asset.id, asset.activeVariantId).then(result => {
      if (!result.ok) { if (active) setError(result.error.message); return; }
      if (!active) { void resources.releaseRuntime(result.value.leaseId); return; }
      lease = result.value.leaseId; setUri(result.value.uri);
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; if (lease) void resources.releaseRuntime(lease); };
  }, [asset?.id, asset?.activeVariantId, resources]);
  if (asset && asset.kind !== 'image') return <span className="character-figure-thumbnail">{asset.kind === 'audio' ? <Music2 size={22}/> : <File size={22}/>}</span>;
  return <span className="character-figure-thumbnail">{uri && !error ? <img src={uri} alt="" onError={() => setError(unavailable)}/> : <><Image size={22}/><small title={error}>{error || !asset ? unavailable : '…'}</small></>}</span>;
}

export function CharacterFigureGallery({ ids, assets, resources, locale, inspect, preview }: {
  ids: string[]; assets: Asset[]; resources?: DifferenceResources; locale: string;
  inspect?(id: string): void; preview?(id: string): void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const current = ids.includes(selected ?? '') ? selected : null;
  return <div className="character-figure-gallery" role="group" aria-label={t('形象比较', 'Compare figures', '立ち絵を比較')}>
    <div className="character-figure-grid">{ids.map(id => {
      const asset = assets.find(item => item.id === id);
      return <button type="button" key={id} aria-pressed={current === id} className="character-figure-choice" onClick={() => { setSelected(id); inspect?.(id); }}>
        <FigureThumbnail asset={asset} resources={resources} unavailable={t('图片不可用', 'Image unavailable', '画像を利用できません')}/>
        <strong>{asset?.name.replace(/\.[^.]+$/, '') ?? t('素材缺失', 'Missing asset', '素材なし')}</strong>
        <small>{asset?.name ?? id}</small>
      </button>;
    })}</div>
    {!!ids.length && <button type="button" className="studio-button character-figure-preview" disabled={!assets.some(asset => asset.id === current)} onClick={() => { if (current) preview?.(current); }}><Play size={15}/>{t('预览所选形象', 'Preview selected figure', '選択した立ち絵をプレビュー')}</button>}
  </div>;
}
