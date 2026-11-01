import { useEffect, useState, type ComponentProps } from 'react';
import type { Asset } from '@galcraft/contracts';
import type { AuthoringServices } from '../controller.js';
import { Button } from '../../components/controls.js';
import { AudioLoopWorkbench } from './AudioLoopWorkbench.js';

/** Keep one exact M04 version leased while active; retain field drafts across hidden tabs. */
export function LeasedAudioLoopEditor({ asset, resources, ...props }: Omit<ComponentProps<typeof AudioLoopWorkbench>, 'src' | 'name'> & {
  asset?: Asset; resources: AuthoringServices['runtimeAssets'];
}) {
  const [src, setSrc] = useState<string>(), [error, setError] = useState(''), [attempt, retry] = useState(0);
  const locale = props.locale, t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const active = props.active !== false;
  useEffect(() => { setSrc(undefined); setError(''); }, [asset?.id, asset?.activeVariantId]);
  useEffect(() => {
    let disposed = false, leaseId: string | undefined;
    if (!active || !asset || !resources) return;
    setError('');
    void resources.resolveRuntime(asset.id, asset.activeVariantId).then(result => {
      if (!result.ok) { if (!disposed) setError(result.error.message); return; }
      if (disposed) { void resources.releaseRuntime(result.value.leaseId); return; }
      leaseId = result.value.leaseId; setSrc(result.value.uri);
    }).catch(reason => { if (!disposed) setError(String(reason)); });
    return () => { disposed = true; if (leaseId) void resources.releaseRuntime(leaseId); };
  }, [asset?.id, asset?.activeVariantId, resources, attempt, active]);
  if (!asset) return <AudioLoopWorkbench {...props} name=""/>;
  if (error || !resources) return <div role="alert" className="pro-error">{error || t('声音资源服务不可用，当前引用已保留。', 'Audio resource service unavailable. The reference remains.', '音声リソースサービスを利用できません。参照を保持します。')}<Button onClick={() => retry(value => value + 1)}>{t('重试读取', 'Retry loading', '読み込みを再試行')}</Button></div>;
  if (!src) return <p role="status">{t('正在读取声音…', 'Loading audio…', '音声を読み込み中…')}</p>;
  return <AudioLoopWorkbench {...props} src={src} name={asset.name}/>;
}
