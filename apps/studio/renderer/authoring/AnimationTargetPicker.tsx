import { useId, useState } from 'react';
import { Button } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { Check, MapPin } from 'lucide-react';
import './animation-target-picker.css';
export type AnimationTargetAvailability = 'present' | 'absent' | 'unknown';
type TargetSource = { sceneId: string; statementId: string; documentId: string; order: number; label?: string; appearance?: string };
export type AnimationTargetOption = { id: string; name: string; appearance?: string; detail?: string; availability?: AnimationTargetAvailability; source?: TargetSource; sources?: TargetSource[] };
/** Repeated show commands keep the same target identity; retain every source for navigation. */
export function groupAnimationTargets(options: readonly AnimationTargetOption[]): AnimationTargetOption[] {
  const grouped = new Map<string, AnimationTargetOption>();
  for (const option of options) {
    const target = grouped.get(option.id) ?? { ...option, sources: [] };
    for (const source of option.sources ?? (option.source ? [{ ...option.source, label: option.detail, appearance: option.appearance }] : [])) {
      if (!target.sources!.some(item => item.sceneId === source.sceneId && item.statementId === source.statementId)) target.sources!.push(source);
    }
    grouped.set(option.id, target);
  }
  return [...grouped.values()];
}
export function AnimationTargetPicker({ options, value, locale, choose, locate }: { options: readonly AnimationTargetOption[]; value: string; locale: string; choose(id: string): void; locate?(option: AnimationTargetOption): void }) {
  const [search, setSearch] = useState(''), help = useId();
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const shown = groupAnimationTargets(options).filter(option => `${option.name} ${option.appearance ?? ''} ${option.sources?.map(source => `${source.label} ${source.appearance ?? ''}`).join(' ') ?? option.detail ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const stateLabel = (state?: AnimationTargetAvailability) => state === 'present' ? t('当前舞台中', 'On the current stage', '現在の舞台に存在') : state === 'absent' ? t('当前舞台未找到', 'Not on the current stage', '現在の舞台には不在') : t('当前舞台尚未确认', 'Stage preview not ready', '舞台プレビューの確認待ち');
  return <section className="animation-target-picker" aria-label={t('选择动画目标', 'Choose animation target', 'アニメーション対象を選択')}>
    <div className="animation-target-heading"><strong>{t('选择舞台对象', 'Choose a stage object', '舞台オブジェクトを選択')}</strong><p>{t('动画作用于对象；更换立绘后仍是同一目标。', 'Animation follows the object, even when its artwork changes.', '画像を変更しても、アニメーションの対象は同じオブジェクトです。')}</p></div>
    <Input autoFocus aria-label={t('搜索动画目标', 'Search animation targets', 'アニメーション対象を検索')} placeholder={t('搜索名称、素材或场景', 'Search name, asset or scene', '名前・素材・シーンを検索')} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (['ArrowDown','Enter'].includes(event.key)) { event.preventDefault(); event.currentTarget.closest('.animation-target-picker')?.querySelector<HTMLElement>('[role=option]')?.focus(); } }}/>
    <div className="animation-target-results"><div role="listbox" aria-describedby={help} aria-label={t('舞台对象', 'Stage objects', '舞台オブジェクト')} onKeyDown={event => { if (!(event.target as HTMLElement).matches('[role=option]')) return; const options = [...event.currentTarget.querySelectorAll<HTMLElement>('[role=option]')], index = options.indexOf(document.activeElement as HTMLElement); const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? Math.min(options.length - 1, index + 1) : event.key === 'ArrowUp' ? Math.max(0, index - 1) : null; if (next !== null) { event.preventDefault(); options[next]?.focus(); } }}>{shown.map(option => <div key={option.id} className="animation-target-option">
      <button type="button" data-slot="animation-target-control" className="animation-target-choice" role="option" aria-selected={value === option.id} onClick={() => choose(option.id)}><span className="animation-target-title"><strong>{option.name}</strong>{value === option.id && <span className="animation-target-selected"><Check size={14} aria-hidden="true"/>{t('已选目标', 'Selected target', '選択中の対象')}</span>}</span>
        {option.appearance && <span className="animation-target-appearance">{t('出场示例：', 'Appearance example: ', '登場例：')}{option.appearance}</span>}<span className="animation-target-state" data-state={option.availability ?? 'unknown'}>{stateLabel(option.availability)}</span></button>
      {locate && !!option.sources?.length && <details className="animation-target-sources"><summary>{t(`出场来源（${option.sources.length}处）`, `Appearances (${option.sources.length})`, `登場箇所（${option.sources.length}件）`)}</summary>{option.sources.map(source => <Button key={`${source.sceneId}/${source.statementId}`} tone="quiet" onClick={() => locate({ ...option, source })}><MapPin size={14} aria-hidden="true"/><span>{source.label ?? option.detail}</span></Button>)}</details>}
    </div>)}</div>{!shown.length && <p role="status">{t('没有匹配对象，请换个名称或场景搜索。', 'No matches. Try another name or scene.', '一致する対象がありません。別の名前やシーンを検索してください。')}</p>}</div>
    <p id={help} className="animation-target-help">{t('“已选目标”表示指令引用。舞台尚未确认时，请先在“当前指令舞台”完成预览或选择剧情分支，再打开列表。', 'Selected target identifies the command reference. Stage status comes from this command’s preview and may differ by story branch.', '「選択中の対象」は命令の参照先です。舞台の状態は現在の命令のプレビューに基づき、物語の分岐で変わる場合があります。')}</p>
  </section>;
}
