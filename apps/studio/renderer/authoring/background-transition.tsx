import type { Json } from '@galcraft/contracts';
import { Choice, Field } from '../components/controls.js';
import { StudioNumberField } from '../components/editor-fields/StudioNumberField.js';
import { enumLabel } from './field-help.js';

type Change = { field: string; op: 'set'; value: Json };
export function BackgroundTransition({ value, locale, readOnly, onCommit }: {
  value: unknown; locale: string; readOnly?: boolean; onCommit(changes: Change[]): void | Promise<void>;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const pair = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const enter = pair.enter && typeof pair.enter === 'object' ? pair.enter as Record<string, unknown> : {};
  const preset = typeof enter.preset === 'string' ? enter.preset : 'cut';
  const duration = typeof enter.durationMs === 'number' ? enter.durationMs : 0;
  const presets = ['cut', 'fade', 'dissolve', 'slide', 'wipe', 'blinds', ...(preset === 'custom' ? ['custom'] : [])];
  return <section className="background-transition" aria-label={t('背景切换', 'Background transition', '背景切り替え')}>
    <Field label={t('切换效果', 'Transition effect', '切り替え効果')}>
      <Choice label={t('切换效果', 'Transition effect', '切り替え効果')} value={preset} disabled={readOnly} options={presets.map(key => ({ value: key, label: enumLabel(key, locale) }))}
        onChange={next => onCommit([{ field: 'transition.enter.preset', op: 'set', value: next },
          ...(preset === 'cut' && next !== 'cut' && duration === 0 ? [{ field: 'transition.enter.durationMs', op: 'set' as const, value: 300 }] : [])])}/>
    </Field>
    <Field label={t('持续时间', 'Duration', '継続時間')}>
      <StudioNumberField value={duration} min={0} step={50} unit="ms" locale={locale} buttons disabled={readOnly || preset === 'cut'}
        label={t('背景切换持续时间', 'Background transition duration', '背景切り替え時間')}
        onPreview={() => {}} onCommit={async next => { if (next !== duration) await onCommit([{ field: 'transition.enter.durationMs', op: 'set', value: next }]); }}/>

    </Field>
    <p className="gc-help">{t('用于新背景出现和替换。退场、方向与缓动在高级转场参数中设置。',
      'Used when showing or replacing a background. Exit, direction and easing are available in advanced transition settings.',
      '新しい背景の表示・置換に使用します。退場、方向、イージングは詳細設定で指定します。')}</p>
  </section>;
}
