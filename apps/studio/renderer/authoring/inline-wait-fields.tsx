import { useState } from 'react';
import { Input } from '../components/ui/input.js';
import type { StudioLocale } from './controller.js';

export type WaitInput = { duration: string; automatic: string };

export function InlineWaitFields({ initial, locale, change }: {
  initial: WaitInput; locale: StudioLocale; change(value: WaitInput): void;
}) {
  const [input, setInput] = useState(initial);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const update = (next: WaitInput) => { setInput(next); change(next); };
  return <>
    <label className="authoring-field">
      {t('时长（毫秒，留空等待点击）', 'Duration in milliseconds (blank waits for a click)', '時間（ミリ秒、空欄でクリック待ち）')}
      <Input type="number" min={1} step={1} value={input.duration}
        onChange={event => update({ ...input, duration: event.target.value })}/>
    </label>
    <label className="authoring-field">
      {t('自动模式等待（毫秒）', 'Wait in auto mode (ms)', 'オート時の待機（ミリ秒）')}
      <Input type="number" min={0} step={1} value={input.automatic} disabled={input.duration !== ''}
        onChange={event => update({ ...input, automatic: event.target.value })}/>
      <small className="field-help">{t('仅用于点击等待。留空时使用玩家偏好。', 'Applies to click waits. Leave blank to use the player preference.', 'クリック待ちに適用します。空欄ではプレイヤー設定を使用します。')}</small>
    </label>
  </>;
}

export function waitEventValues(input: WaitInput) {
  return {
    durationMs: input.duration === '' ? null : Number(input.duration),
    ...(input.duration === '' && input.automatic !== '' ? { autoWaitMs: Number(input.automatic) } : {}),
  };
}
