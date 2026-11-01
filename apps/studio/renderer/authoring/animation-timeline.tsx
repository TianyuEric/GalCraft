import { useEffect, useRef, useState } from 'react';
import { AnimationPathSchema, NativeAnimationSchema, type AnimationLeaf, type AnimationTrack, type NativeAnimation } from '@galcraft/contracts';
import { sampleAnimation } from '@galcraft/stage';
import { Button, Choice, Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import './animation-timeline.css';

export const initialAnimation = (): NativeAnimation => NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 1000,
  tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 1000, value: 100 }] }] });
const numeric = (track: AnimationTrack) => typeof track.keyframes[0]?.value === 'number';
export type AnimationTimelineProps = {
  animation?: unknown; locale?: string; targetLabel?: string;
  onChange(animation: NativeAnimation): void | Promise<void>;
  onPreview?(animation: NativeAnimation, timeMs: number): void;
  onSave?(name: string, animation: NativeAnimation): Promise<string>;
  onDraftChange?(dirty: boolean): void;
};

/** Drafts stay local. A complete gesture submits exactly one authored edit. */
export function AnimationTimeline({ animation, locale = 'zh-CN', targetLabel, onChange, onPreview, onSave, onDraftChange }: AnimationTimelineProps) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const parsed = NativeAnimationSchema.safeParse(animation);
  const [draft, setDraft] = useState(() => parsed.success ? parsed.data : initialAnimation());
  const latest = useRef(draft), valid = useRef(draft), drag = useRef<{ track: number; frame: number; before: NativeAnimation } | null>(null);
  const [selected, setSelected] = useState<[number, number]>([0, 0]), [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [buffers, setBuffers] = useState<Record<string, string>>({}), [error, setError] = useState(''), [name, setName] = useState('动画'), [saved, setSaved] = useState('');
  const external = JSON.stringify(animation);
  useEffect(() => { if (drag.current || Object.keys(buffers).length) return; const checked = NativeAnimationSchema.safeParse(animation);
    if (checked.success) { latest.current = valid.current = checked.data; setDraft(checked.data); setError(''); }
  }, [external]);
  const timeline = useRef<HTMLDivElement>(null), preview = useRef(onPreview); preview.current = onPreview;
  const track = draft.tracks[selected[0]] ?? draft.tracks[0]!, frame = track.keyframes[selected[1]] ?? track.keyframes[0]!;
  const update = (next: NativeAnimation, commit = true) => {
    latest.current = next; setDraft(next); onDraftChange?.(true);
    const checked = NativeAnimationSchema.safeParse(next);
    if (!checked.success) { setError(t('关键帧时刻需在总时长内递增，数值和计算方式须符合属性类型。草稿与上次有效预览已保留。', 'Keyframe times must increase within the duration, and values and modes must match the property. The draft and last valid preview remain.', 'キーフレームを時間内で昇順にし、属性に合う値と方式を指定してください。入力と前回のプレビューを保持します。')); return; }
    valid.current = checked.data; setError(''); preview.current?.(checked.data, time);
    if (commit) void Promise.resolve(onChange(checked.data)).then(() => onDraftChange?.(false)).catch(reason => setError(String(reason)));
  };
  const seek = (next: number) => { const at = Math.max(0, Math.min(valid.current.durationMs, next)); setTime(at); preview.current?.(valid.current, at); };
  useEffect(() => { if (!playing) return; let previous = performance.now(), frameId = 0, at = time;
    const tick = (now: number) => { at = Math.min(valid.current.durationMs, at + now - previous); previous = now; seek(at);
      if (at >= valid.current.durationMs) setPlaying(false); else frameId = requestAnimationFrame(tick); };
    frameId = requestAnimationFrame(tick); return () => cancelAnimationFrame(frameId);
  }, [playing]);
  const changeTrack = (patch: Partial<AnimationTrack>) => update({ ...latest.current, tracks: latest.current.tracks.map((item, index) => index === selected[0] ? { ...item, ...patch } : item) });
  const changeFrame = (patch: Partial<typeof frame>, commit = true, at = selected) => {
    const next = structuredClone(latest.current); Object.assign(next.tracks[at[0]]!.keyframes[at[1]]!, patch); update(next, commit);
  };
  const field = (key: string, label: string, value: number, apply: (value: number) => void) => <Field label={label}><Input aria-label={label} type="number" value={buffers[key] ?? value}
    onChange={event => { setBuffers(previous => ({ ...previous, [key]: event.target.value })); onDraftChange?.(true); }}
    onBlur={event => { const value = event.target.value === '' ? NaN : Number(event.target.value); if (!Number.isFinite(value)) { setError(t('请输入有效数值；保留上次有效预览。', 'Enter a valid number. The last valid preview remains.', '有効な数値を入力してください。前回のプレビューを保持します。')); return; }
      apply(value); setBuffers(previous => { const next = { ...previous }; delete next[key]; return next; }); }}/></Field>;
  const labels: Record<string, string> = { '/x': 'X', '/y': 'Y', '/scaleX': t('水平缩放', 'Scale X', '横倍率'), '/scaleY': t('垂直缩放', 'Scale Y', '縦倍率'), '/rotationDeg': t('旋转', 'Rotation', '回転'), '/opacity': t('透明度', 'Opacity', '不透明度'), '/blur': t('模糊', 'Blur', 'ぼかし') };
  const sample = sampleAnimation(valid.current, time, Object.fromEntries(valid.current.tracks.map(track => [track.path, track.path.includes('scale') || track.path === '/opacity' ? 1 : numeric(track) ? 0 : track.keyframes[0]!.value])));
  return <section className="animation-timeline" aria-label={t('原生动画时间轴', 'Native animation timeline', 'アニメーションタイムライン')}>
    <header><strong>{t('动画时间轴', 'Animation timeline', 'アニメーションタイムライン')}</strong><span>{targetLabel ?? t('目标使用上方对象或整台设置', 'Uses the object or whole-stage target above', '上のオブジェクト／舞台対象を使用')}</span></header>
    <div className="animation-tools"><Button onClick={() => { if (time >= valid.current.durationMs) seek(0); setPlaying(!playing); }}>{playing ? t('暂停', 'Pause', '一時停止') : t('播放区间', 'Play range', '区間再生')}</Button>
      {field('duration', t('总时长 · ms', 'Duration · ms', '長さ・ms'), draft.durationMs, value => update({ ...latest.current, durationMs: value }))}
      {field('playhead', t('播放头 · ms', 'Playhead · ms', '再生位置・ms'), time, seek)}
    </div>
    <label className="animation-seek">{t('播放头', 'Playhead', '再生位置')}<input aria-label={t('播放头定位', 'Seek playhead', '再生位置の移動')} type="range" min={0} max={valid.current.durationMs} value={time} onChange={event => seek(Number(event.target.value))}/></label>
    <div ref={timeline} className="animation-scroll" tabIndex={0} aria-label={t('轨道滚动区', 'Scrollable tracks', 'トラックスクロール領域')}>
      <div className="animation-lanes" style={{ width: Math.max(620, draft.durationMs / 20) }}>
        <div className="animation-ruler">0 ms <span>{draft.durationMs} ms</span></div>
        {draft.tracks.map((item, ti) => <div className="animation-lane" key={item.path}><button className="animation-track-name" onClick={() => setSelected([ti, 0])}>{labels[item.path] ?? item.path.slice(1)}</button>
          <div className="animation-track" onDoubleClick={event => { const rect = event.currentTarget.getBoundingClientRect(), at = Math.round((event.clientX - rect.left) / rect.width * draft.durationMs); const next = structuredClone(latest.current); next.tracks[ti]!.keyframes.push({ timeMs: at, value: item.keyframes.at(-1)!.value, easing: { family: 'linear', direction: 'in' } }); next.tracks[ti]!.keyframes.sort((a, b) => a.timeMs - b.timeMs); update(next); }}>
            <i className="animation-playhead" style={{ left: `${draft.durationMs ? time / draft.durationMs * 100 : 0}%` }}/>
            {item.keyframes.map((keyframe, ki) => <button key={ki} className="animation-key" aria-label={`${labels[item.path] ?? item.path.slice(1)} ${keyframe.timeMs} ms`} aria-pressed={selected[0] === ti && selected[1] === ki} style={{ left: `${draft.durationMs ? keyframe.timeMs / draft.durationMs * 100 : 0}%` }}
              onClick={() => setSelected([ti, ki])} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setSelected([ti, ki]); drag.current = { track: ti, frame: ki, before: structuredClone(latest.current) }; }}
              onPointerMove={event => { if (!drag.current) return; const rect = event.currentTarget.parentElement!.getBoundingClientRect(); changeFrame({ timeMs: Math.max(0, Math.min(draft.durationMs, Math.round((event.clientX - rect.left) / rect.width * draft.durationMs))) }, false, [ti, ki]); }}
              onPointerUp={() => { if (!drag.current) return; drag.current = null; update(latest.current); }} onPointerCancel={() => { if (drag.current) { update(drag.current.before, false); drag.current = null; onDraftChange?.(false); } }}
              onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeFrame({ timeMs: keyframe.timeMs + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10) }, true, [ti, ki]); } }}>◆</button>)}
          </div></div>)}
      </div>
    </div>
    <div className="animation-tools"><Choice label={t('添加属性轨道', 'Add property track', '属性トラックを追加')} value="" options={[{ value: '', label: t('选择属性…', 'Choose property…', '属性を選択…') }, ...AnimationPathSchema.options.filter(path => !draft.tracks.some(track => track.path === path)).map(path => ({ value: path, label: labels[path] ?? path.slice(1) }))]}
      onChange={path => { if (!path) return; const discrete: AnimationLeaf = path === '/station' ? 'center' : path === '/blend' ? 'normal' : path.startsWith('/filters/') || path === '/circle/invert' ? false : 1; update({ ...latest.current, tracks: [...latest.current.tracks, { path: path as AnimationTrack['path'], mode: 'absolute', keyframes: [{ timeMs: draft.durationMs, value: discrete, easing: { family: 'linear', direction: 'in' } }] }] }); setSelected([draft.tracks.length, 0]); }}/>
      <Button disabled={draft.tracks.length < 2} onClick={() => { update({ ...latest.current, tracks: latest.current.tracks.filter((_, i) => i !== selected[0]) }); setSelected([0, 0]); }}>{t('删除轨道', 'Delete track', 'トラックを削除')}</Button></div>
    <div className="animation-properties">
      <Field label={t('计算方式', 'Value mode', '計算方式')}><Choice label={t('计算方式', 'Value mode', '計算方式')} value={track.mode} onChange={value => changeTrack({ mode: value as AnimationTrack['mode'] })} options={(numeric(track) ? ['absolute', 'add', 'multiply'] : ['absolute']).map((value, i) => ({ value, label: [t('绝对值', 'Absolute', '絶対'), t('加量', 'Add', '加算'), t('乘量', 'Multiply', '乗算')][i]! }))}/></Field>
      {field('frame-time', t('关键帧时刻 · ms', 'Keyframe time · ms', 'キーフレーム時刻・ms'), frame.timeMs, value => changeFrame({ timeMs: value }))}
      {numeric(track) ? field('frame-value', t('关键帧值', 'Keyframe value', 'キーフレーム値'), Number(frame.value), value => changeFrame({ value })) : <Field label={t('关键帧值', 'Keyframe value', 'キーフレーム値')}><Input aria-label={t('关键帧值', 'Keyframe value', 'キーフレーム値')} value={String(frame.value)} onChange={event => changeFrame({ value: (event.target.value === 'true' ? true : event.target.value === 'false' ? false : event.target.value) as AnimationLeaf })}/></Field>}
      <Field label={t('缓动', 'Easing', 'イージング')}><Choice label={t('缓动', 'Easing', 'イージング')} value={frame.easing.family} onChange={value => changeFrame({ easing: { ...frame.easing, family: value as typeof frame.easing.family } })} options={['linear', 'sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce'].map(value => ({ value, label: value }))}/></Field>
      <Choice label={t('缓动方向', 'Easing direction', 'イージング方向')} value={frame.easing.direction} onChange={value => changeFrame({ easing: { ...frame.easing, direction: value as typeof frame.easing.direction } })} options={['in', 'out', 'inOut'].map(value => ({ value, label: value }))}/>
      <Button onClick={() => { const next = structuredClone(latest.current), frames = next.tracks[selected[0]]!.keyframes; const at = Math.min(draft.durationMs, time); if (frames.some(frame => frame.timeMs === at)) { setError(t('该时刻已有关键帧。', 'A keyframe exists at this time.', 'この時刻にはキーフレームがあります。')); return; } frames.push({ ...structuredClone(frame), timeMs: at }); frames.sort((a, b) => a.timeMs - b.timeMs); update(next); setSelected([selected[0], frames.findIndex(frame => frame.timeMs === at)]); }}>{t('添加关键帧', 'Add keyframe', 'キーフレーム追加')}</Button>
      <Button disabled={track.keyframes.length < 2} onClick={() => { changeTrack({ keyframes: track.keyframes.filter((_, i) => i !== selected[1]) }); setSelected([selected[0], 0]); }}>{t('删除关键帧', 'Delete keyframe', 'キーフレーム削除')}</Button>
    </div>
    <output className="animation-sample" aria-label="实际采样">{Object.entries(sample).map(([path, value]) => `${labels[path] ?? path.slice(1)}: ${typeof value === 'number' ? Number(value.toFixed(3)) : value}`).join(' · ')}</output>
    {onSave && <div className="animation-tools"><Input aria-label={t('动画名称', 'Animation name', 'アニメーション名')} value={name} onChange={event => setName(event.target.value)}/><Button disabled={!!error || Object.keys(buffers).length > 0} onClick={() => void onSave(name, valid.current).then(value => setSaved(value)).catch(reason => setError(String(reason)))}>{t('保存为动画素材', 'Save animation asset', 'アニメーション素材を保存')}</Button>{saved && <span role="status">{saved}</span>}</div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
