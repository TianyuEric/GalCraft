import { useRef, useState } from 'react';
import { createId, StartupClipSchema, StartupSequenceSchema, startupClipEnd, type Asset, type StartupClip, type StartupSequence } from '@galcraft/contracts';
import { Button, Choice, Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { StudioColorInput } from '../components/editor-fields/StudioColorInput.js';
import { Type, Palette, Image, Film } from 'lucide-react';

export function StartupSequenceEditor({ sequence, locale, assets, onChange, chooseAsset, preview, onDraftChange }: {
  sequence: StartupSequence; locale: string; assets: Asset[];
  onChange(sequence: StartupSequence): void | Promise<unknown>; chooseAsset(): Promise<string | null>;
  preview(clip: StartupClip): void; onDraftChange?(dirty: boolean): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [selected, select] = useState<string | undefined>(sequence.clips[0]?.id), [error, setError] = useState(''), [buffers, setBuffers] = useState<Record<string, string>>({});
  const drag = useRef<{ id: string; x: number; start: number; width: number; duration: number; next: number } | null>(null);
  const [dragTime, setDragTime] = useState<{ id: string; start: number } | null>(null);
  const clip = sequence.clips.find(clip => clip.id === selected) ?? sequence.clips[0];
  const commit = (next: StartupSequence) => { const checked = StartupSequenceSchema.safeParse(next); if (!checked.success) { setError(checked.error.issues.map(issue => issue.message).join(' · ')); return false; } setError(''); return onChange(checked.data); };
  const patch = (values: Partial<StartupClip>) => { if (clip) return commit({ ...sequence, clips: sequence.clips.map(item => item.id === clip.id ? { ...item, ...values } : item) }); };
  const number = (key: string, label: string, value: number, apply: (value: number) => void, seconds = false) => <Field label={label}><Input type="number" min={0} step={seconds ? .01 : 1} aria-label={label} value={buffers[key] ?? value}
    onChange={event => { setBuffers(previous => ({ ...previous, [key]: event.target.value })); onDraftChange?.(true); }} onBlur={event => {
      const next = event.target.value === '' ? NaN : Number(event.target.value); if (!Number.isFinite(next) || next < 0 || !seconds && !Number.isInteger(next)) { setError(t('请填写非负有效数值。当前草稿和有效预览已保留。', 'Enter a valid nonnegative value. The draft and valid preview remain.', '有効な正の値を入力してください。入力とプレビューを保持します。')); return; }
      apply(next); setBuffers(previous => { const next = { ...previous }; delete next[key]; return next; }); }}/></Field>;
  const types = [['text', t('文字', 'Text', '文字')], ['color', t('纯色底', 'Color', '単色')], ['image', t('图片', 'Image', '画像')], ['video', t('视频', 'Video', '動画')]];
  const add = async (kind: string) => { let assetId: string | null = null; if (['image', 'video'].includes(kind)) { assetId = await chooseAsset(); if (!assetId) return;
      const asset = assets.find(asset => asset.id === assetId); if (asset && asset.kind !== kind) { setError(t('素材类型与片段不符。', 'The resource type does not match the clip.', '素材の種類が一致しません。')); return; } }
    const next = StartupClipSchema.parse({ id: createId(), kind, name: types.find(([value]) => value === kind)![1], assetId,
      startMs: Math.max(0, ...sequence.clips.map(startupClipEnd)), text: { [locale]: t('作者说明', 'Author notice', '作者の案内') }, color: kind === 'color' ? '#000000' : '#ffffff' });
    commit({ ...sequence, clips: [...sequence.clips, next] }); select(next.id); };
  const duration = Math.max(1, ...sequence.clips.map(startupClipEnd));
  const icons = { text: Type, color: Palette, image: Image, video: Film };
  const cancelDrag = () => { drag.current = null; setDragTime(null); onDraftChange?.(false); };
  return <section className="startup-sequence" aria-label={t('开屏片段序列', 'Startup clip sequence', '起動画面シーケンス')}>
    <div className="gc-actions">{types.map(([kind, label]) => { const Icon = icons[kind as keyof typeof icons]; return <Button key={kind} onClick={() => void add(kind!)}><Icon size={16}/>{t('添加', 'Add', '追加')} {label}</Button>; })}</div>
    <StudioColorInput onDraftChange={active => onDraftChange?.(active || Object.keys(buffers).length > 0)} label={t('序列背景', 'Sequence background', 'シーケンス背景')} value={sequence.background} locale={locale} onChange={background => commit({ ...sequence, background })}/>
    <div className="animation-scroll" tabIndex={0} aria-label={t('开屏时序滚动区', 'Scrollable startup timing', '起動画面の時刻スクロール')}><div style={{ width: Math.max(620, duration / 40) }}>
      <div className="startup-sequence-ruler"><span>0 ms</span><span>{duration} ms</span></div>
      {sequence.clips.map(item => { const start = dragTime?.id === item.id ? dragTime.start : item.startMs; return <div className="startup-sequence-row" key={item.id}><button aria-pressed={item.id === clip?.id} onClick={() => select(item.id)}>{item.name}</button><div><button aria-label={`${item.name} ${start} ms`} onClick={() => select(item.id)} style={{ marginLeft: `${start / duration * 100}%`, width: `${(startupClipEnd(item) - item.startMs) / duration * 100}%`, touchAction: 'none' }}
        onPointerDown={event => { if (event.button !== 0) return; select(item.id); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: item.id, x: event.clientX, start: item.startMs, next: item.startMs, width: event.currentTarget.parentElement!.getBoundingClientRect().width, duration }; }}
        onPointerMove={event => { const gesture = drag.current; if (!gesture || gesture.id !== item.id) return; gesture.next = Math.max(0, Math.round(gesture.start + (event.clientX - gesture.x) / gesture.width * gesture.duration)); setDragTime({ id: item.id, start: gesture.next }); onDraftChange?.(true); }}
        onPointerUp={() => { const gesture = drag.current; if (!gesture) return; drag.current = null; setDragTime(null); if (gesture.next !== gesture.start) commit({ ...sequence, clips: sequence.clips.map(value => value.id === gesture.id ? { ...value, startMs: gesture.next } : value) }); onDraftChange?.(false); }}
        onPointerCancel={cancelDrag} onKeyDown={event => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); cancelDrag(); } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); commit({ ...sequence, clips: sequence.clips.map(value => value.id === item.id ? { ...value, startMs: Math.max(0, value.startMs + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10)) } : value) }); } }}
        >{start}–{start + startupClipEnd(item) - item.startMs} ms</button></div></div>; })}
    </div></div>
    {clip ? <section className="startup-clip-editor" key={clip.id} aria-label={t('当前片段', 'Current clip', '現在のクリップ')}>
      <header className="startup-clip-heading"><h3>{clip.name}</h3><div className="gc-actions"><Button onClick={() => preview(clip)}>{t('预览此段', 'Preview clip', 'クリップをプレビュー')}</Button><Button disabled={sequence.clips[0]?.id === clip.id} onClick={() => { const index = sequence.clips.findIndex(item => item.id === clip.id); if (index <= 0) return; const clips = [...sequence.clips]; [clips[index - 1], clips[index]] = [clips[index]!, clips[index - 1]!]; commit({ ...sequence, clips }); }}>{t('前移图层', 'Move layer earlier', 'レイヤーを前へ')}</Button><Button tone="danger" onClick={() => { commit({ ...sequence, clips: sequence.clips.filter(item => item.id !== clip.id) }); select(undefined); }}>{t('删除片段', 'Delete clip', 'クリップ削除')}</Button></div></header>
      <div className="startup-clip-properties">
      <Field label={t('片段名称', 'Clip name', 'クリップ名')}><Input aria-label={t('片段名称', 'Clip name', 'クリップ名')} value={clip.name} onChange={event => patch({ name: event.target.value })}/></Field>
      {number(`${clip.id}.start`, t('出现时刻 · ms', 'Start time · ms', '開始時刻・ms'), clip.startMs, startMs => patch({ startMs }))}
      {number(`${clip.id}.in`, t('片段淡入 · ms', 'Clip fade in · ms', 'フェードイン・ms'), clip.fadeInMs, fadeInMs => patch({ fadeInMs }))}
      {number(`${clip.id}.hold`, t('片段停留 · ms', 'Clip hold · ms', '表示時間・ms'), clip.holdMs, holdMs => patch({ holdMs }))}
      {number(`${clip.id}.out`, t('片段淡出 · ms', 'Clip fade out · ms', 'フェードアウト・ms'), clip.fadeOutMs, fadeOutMs => patch({ fadeOutMs }))}
      {clip.kind === 'text' && <Field name="clip-text" label={t('说明文字', 'Notice text', '案内文')}><textarea aria-label={t('说明文字', 'Notice text', '案内文')} value={clip.text[locale] ?? ''} onChange={event => patch({ text: { ...clip.text, [locale]: event.target.value } })}/></Field>}
      {['text', 'color'].includes(clip.kind) && <StudioColorInput onDraftChange={active => onDraftChange?.(active || Object.keys(buffers).length > 0)} label={t('片段颜色', 'Clip color', 'クリップ色')} value={clip.color} locale={locale} onChange={color => patch({ color })}/>}
      {clip.assetId && <><p>{assets.find(asset => asset.id === clip.assetId)?.name ?? t('素材不可用', 'Missing asset', '素材がありません')}</p><Choice label={t('片段适配', 'Clip fit', 'クリップ表示')} value={clip.fit} options={['contain', 'cover', 'fill'].map(value => ({ value, label: value }))} onChange={fit => patch({ fit: fit as StartupClip['fit'] })}/></>}
      {clip.kind === 'video' && <>{number(`${clip.id}.source`, t('视频起点 · s', 'Video start · s', '動画開始・s'), clip.startSec, startSec => patch({ startSec }), true)}
        {number(`${clip.id}.volume`, t('片段音量 · %', 'Clip volume · %', 'クリップ音量・%'), clip.volume * 100, value => patch({ volume: value / 100 }), true)}</>}
      </div>
    </section> : <p>{t('添加片段开始编排。', 'Add a clip to begin.', 'クリップを追加してください。')}</p>}
    <Choice label={t('标题页揭示方式','Title reveal','タイトルの表示')} value={sequence.revealMode} options={[{value:'afterClips',label:t('片段结束后淡出背景','Fade background after clips','クリップ終了後に背景をフェード')},{value:'withLastClip',label:t('与最后片段同层淡出','Fade the final clip and background together','最後のクリップと背景を同時にフェード')}]} onChange={value=>commit({...sequence,revealMode:value as StartupSequence['revealMode']})}/>
    {sequence.revealMode==='withLastClip'&&<p>{t('最后片段的淡出时长控制整个开屏层。标题页资源就绪后才开始计时。','The final clip fade controls the entire opening layer. Timing starts after title resources are ready.','最後のフェードで起動画面全体を表示します。タイトル準備後に計時を開始します。')}</p>}
    {sequence.revealMode==='afterClips'&&number('reveal', t('揭示主页 · ms', 'Reveal home · ms', 'ホームへ・ms'), sequence.revealMs, revealMs => commit({ ...sequence, revealMs }))}
    <label className="startup-check"><input type="checkbox" checked={sequence.allowSkip} onChange={event => commit({ ...sequence, allowSkip: event.target.checked })}/>{t('允许右键或物理 Esc 结束整个开屏', 'Allow right click or physical Esc to end startup', '右クリック／物理 Esc で終了を許可')}</label>
    {error && <p role="alert">{error}</p>}
  </section>;
}
