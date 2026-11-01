import { useEffect, useState } from 'react';
import { NativeAnimationSchema, type NativeAnimation } from '@galcraft/contracts';
import type { Candidate } from '@galcraft/authoring/production';
import { Button } from '../../components/controls.js';
import { AnimationAssetPreview } from '../../authoring/professional/AnimationAssetPreview.js';
import { AnimationWorkbench } from '../../authoring/professional/AnimationWorkbench.js';
import { chooseAnimationPreviewTarget } from '../../authoring/animation-preview-target.js';
import type { AuthoringServices } from '../../authoring/controller.js';
export function AnimationCandidatePreview({ candidate, uri, services, locale, edit }: { candidate: Candidate; uri: string; services: AuthoringServices; locale: string; edit?(value: NativeAnimation): Promise<void> }) {
  const [animation, setAnimation] = useState<NativeAnimation | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [original, showOriginal] = useState(false), [editing, setEditing] = useState(false);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const artifact = candidate.artifacts.find(item => item.kind === 'animation')!, metadata = artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata) ? artifact.metadata : {};
  const before = NativeAnimationSchema.safeParse(metadata.originalAnimation).data;
  const changes = Array.isArray(metadata.animationChanges) ? metadata.animationChanges as { path: string; change: string; startMs: number; endMs: number }[] : [];
  useEffect(() => { const abort = new AbortController(); setLoading(true); setError(''); void fetch(uri, { signal: abort.signal }).then(async response => { if (!response.ok) throw new Error(`GCA HTTP ${response.status}`); const next = NativeAnimationSchema.parse(await response.json()); if (!abort.signal.aborted) { setAnimation(next); setError(''); } }).catch(reason => { if (!abort.signal.aborted) setError(String(reason)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); }); return () => abort.abort(); }, [candidate.id, uri]);
  const chooseTarget = () => chooseAnimationPreviewTarget(services, locale);
  return <section className="production-animation-candidate"><div className="gc-actions">{before && <><Button tone="quiet" aria-pressed={original} onClick={() => showOriginal(true)}>{t('原动画', 'Original', '元のアニメーション')}</Button><Button tone="quiet" aria-pressed={!original} onClick={() => showOriginal(false)}>{t('候选动画', 'Candidate', '候補')}</Button></>}{edit && <Button onClick={() => { showOriginal(false); setEditing(value => !value); }}>{editing ? t('收起关键帧', 'Hide keyframes', 'キーフレームを閉じる') : t('手调关键帧', 'Edit keyframes', 'キーフレームを編集')}</Button>}</div>
    {changes.length > 0 && <ul aria-label={t('动画变化', 'Animation changes', 'アニメーションの変更')}>{changes.map(change => <li key={change.path}>{({ added: t('新增', 'Added', '追加'), modified: t('修改', 'Modified', '変更'), deleted: t('删除', 'Deleted', '削除') }[change.change] ?? change.change)} · {change.path} · {change.startMs}–{change.endMs} ms</li>)}</ul>}
    {loading && <p role="status">{t('正在读取候选动画…', 'Loading candidate animation…', '候補アニメーションを読み込み中…')}</p>}
    {animation && (editing && !original && edit ? <AnimationWorkbench animation={animation} locale={locale} targetLabel={t('手调后保留为独立候选；原候选继续保留', 'Edits create a separate candidate and retain the original', '編集は独立した候補として保存し、元の候補を保持')} choosePreviewTarget={chooseTarget} onChange={async next => { await edit(next); setAnimation(next); }}/>
      : <AnimationAssetPreview animation={original && before ? before : animation} locale={locale} chooseTarget={chooseTarget}/>)}
    {error && <p role="alert" className="workbench-error">{error}</p>}
  </section>;
}
