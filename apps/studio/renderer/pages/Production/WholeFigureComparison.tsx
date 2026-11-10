import { useEffect, useState } from 'react';
import type { Asset, Artifact } from '@galcraft/contracts';
import type { GenerationInput } from '@galcraft/authoring/production';
import type { ReactNode } from 'react';
import type { AuthoringServices } from '../../authoring/controller.js';

export function WholeFigureComparison({ input, asset, output, resources, locale, children }: {
  input: Extract<GenerationInput, { purpose: 'image' }>;
  asset?: Asset;
  output?: Artifact;
  resources: AuthoringServices['runtimeAssets'];
  locale: string;
  children: ReactNode;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const ref = input.references[0], assetId = ref?.assetId, variantId = ref?.variantId;
  const variant = asset?.variants.find(item => item.id === variantId);
  const [preview, setPreview] = useState<{ assetId: string; variantId: string; uri: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setPreview(null);
    setFailed(false);
    if (!resources || !assetId || !variantId) return;
    let disposed = false;
    let leaseId: string | undefined;
    void resources.resolveRuntime(assetId, variantId).then(result => {
      if (!result.ok) { if (!disposed) setFailed(true); return; }
      if (disposed) { void resources.releaseRuntime(result.value.leaseId); return; }
      leaseId = result.value.leaseId;
      setPreview({ assetId, variantId, uri: result.value.uri });
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (leaseId) void resources.releaseRuntime(leaseId); };
  }, [resources, assetId, variantId]);

  const size = (width: unknown, height: unknown) => typeof width === 'number' && typeof height === 'number' ? `${width} × ${height}` : '—';
  const metadata = output?.metadata && typeof output.metadata === 'object' && !Array.isArray(output.metadata) ? output.metadata : null;
  return <section className="whole-figure-comparison" aria-label={t('整图差分对照', 'Figure comparison', '立ち絵の差分比較')}>
    <div className="whole-figure-images">
      <figure>
        <figcaption><strong>{t('冻结主参考', 'Frozen main reference', '固定した主参照')}</strong><span>{asset?.name ?? assetId} · {variantId}</span><span>{size(variant?.metadata.width, variant?.metadata.height)}</span></figcaption>
        <div className="whole-figure-image">
          {preview?.assetId === assetId && preview?.variantId === variantId && preview ? <img src={preview.uri} alt={t('主参考图', 'Main reference', '主参照画像')} onError={() => { setPreview(null); setFailed(true); }}/>
            : <p role={failed ? 'alert' : 'status'}>{!resources || !assetId || !variantId || failed ? t('冻结版本的预览不可用', 'Frozen version preview unavailable', '固定したバージョンを表示できません') : t('正在读取精确版本…', 'Loading exact version…', 'バージョンを読み込み中…')}</p>}
        </div>
      </figure>
      <figure>
        <figcaption><strong>{t('生成结果', 'Generated result', '生成結果')}</strong><span>{output?.mime} · {size(metadata?.width, metadata?.height)}</span>
          {output?.background?.hasTransparency && <span>{t('含透明像素', 'Contains transparent pixels', '透明ピクセルあり')}</span>}
        </figcaption>
        <div className="whole-figure-image">{children}</div>
      </figure>
    </div>
    <details><summary>{t('本次目标', 'Generation goal', '今回の目標')}</summary><p>{input.positive}</p></details>
  </section>;
}
