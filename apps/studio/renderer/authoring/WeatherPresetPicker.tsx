import { useState } from 'react';
import { StageWeatherPresets, type StageWeatherPresetKey } from '@galcraft/contracts';
import { Button } from '../components/controls.js';

export function WeatherPresetPicker({ locale, apply, disabled = false }: { locale: string; apply(key: StageWeatherPresetKey): Promise<void>; disabled?: boolean }) {
  const [pending, setPending] = useState<StageWeatherPresetKey | null>(null), [error, setError] = useState('');
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return <section className="weather-preset-picker" aria-label={t('天气粒子预设', 'Weather particle presets', '天候パーティクルのプリセット')} aria-busy={!!pending}>
    <p className="field-help">{t('天气粒子预设会填入纹理和运动参数，保留此特效的标识。', 'Weather presets fill the texture and motion parameters, keeping this effect ID.', 'テクスチャと動きの値を設定し、このエフェクトIDを保持します。')}</p>
    <div className="gc-actions">{(Object.keys(StageWeatherPresets) as StageWeatherPresetKey[]).map(key => <Button key={key} disabled={disabled || !!pending}
      onClick={() => { setPending(key); setError(''); void apply(key).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setPending(null)); }}>
      {pending === key ? t('正在应用…', 'Applying…', '適用中…') : StageWeatherPresets[key].title[locale === 'en' ? 1 : locale === 'ja' ? 2 : 0]}</Button>)}</div>
    {error && <p role="alert" className="field-error">{error}</p>}
  </section>;
}
