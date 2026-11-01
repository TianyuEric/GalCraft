import { useState } from 'react';
import { Button, Field } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { tr } from '../Production/Production.js';

export function parseSteamAppId(value: string): string | null | undefined {
  if (!value.trim()) return null;
  const number = Number(value);
  return /^\d+$/.test(value.trim()) && Number.isSafeInteger(number) && number > 0 && number <= 4294967295 ? String(number) : undefined;
}
export function SteamAppIdEditor({ value, savedValue, locale, busy, change, apply }: { value: string; savedValue: string | null; locale: string; busy?: boolean; change(value: string): void; apply(value: string | null): Promise<void> }) {
  const t = (zh: string,en: string,ja: string) => tr(locale,zh,en,ja);
  const [error,setError] = useState(''), [pending,setPending] = useState(false);
  const dirty = value !== String(savedValue ?? '');
  return <section className="publish-steam-appid"><h4>Steam</h4><Field label="Steam AppID" help={t('填写作品的 Steam AppID；留空可移除。应用后保存作品，再检查发行。','Enter the work’s Steam AppID, or leave empty to remove it. Apply and save before checking the release.','作品の Steam AppID を入力。空欄で削除できます。適用・保存してから配布を確認してください。')} error={error}><Input inputMode="numeric" value={value} disabled={busy || pending} onChange={event => { change(event.target.value); setError(''); }}/></Field><Button disabled={!dirty || busy || pending} onClick={() => { const parsed = parseSteamAppId(value); if(parsed === undefined){setError(t('AppID 须为 1 至 4294967295 的整数。','AppID must be an integer from 1 to 4294967295.','AppID は 1～4294967295 の整数です。'));return;}setPending(true);void apply(parsed).catch(reason=>setError(String(reason instanceof Error?reason.message:reason))).finally(()=>setPending(false)); }}>{pending?t('正在应用…','Applying…','適用中…'):t('应用 Steam AppID','Apply Steam AppID','Steam AppID を適用')}</Button></section>;
}
