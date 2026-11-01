import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimationPathSchema, NativeAnimationSchema, type AnimationTrack, type NativeAnimation, type AnimationGenerationRequest } from '@galcraft/contracts';
import { sampleAnimation, type AppliedAnimationPreset, type AnimationPresetParameters } from '@galcraft/stage';
import { ChevronRight, Diamond, Pause, Play, Plus, SkipBack, Trash2 } from 'lucide-react';
import { Collapsible } from '@base-ui/react/collapsible';
import { Button, Choice } from '../../components/controls.js';
import { StudioNumberField } from '../../components/editor-fields/StudioNumberField.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import './professional-editors.css';
import { AnimationPreview, type AnimationPreviewResource } from './AnimationPreview.js';
import { AnimationPresetPicker } from './AnimationPresetPicker.js';

export type AnimationGuiDraft = { draft:NativeAnimation; accepted:NativeAnimation; selection:[number,number]; name:string; instruction:string; generationMode:'new'|'patch'|'replace'; generationPath:string; rangeEnabled:boolean; rangeStart:number; rangeEnd:number; numbers:Record<string,import('../../components/editor-fields/StudioNumberField.js').NumberInputDraft> };
/** The caller owns persistence, the real stage and undo; seeking never calls onChange. */
export function AnimationWorkbench({ animation, locale = 'zh-CN', targetLabel, image, preview: stagePreview, active = true, statusLabel, defaultName = '', onChange, onPreview, onSave, onDraftChange, guiDraft,onGuiDraftChange,choosePreviewTarget, onPreset, presetContext, onGenerate }: {
  animation: NativeAnimation; locale?: string; targetLabel: string; image?: string;
  onChange(value: NativeAnimation): Promise<void>; onPreview?(value: NativeAnimation, timeMs: number): void;
  preview?: ReactNode; active?: boolean; statusLabel?: string; defaultName?: string;
  onSave?(name: string, value: NativeAnimation): Promise<string>; onDraftChange?(dirty: boolean): void;
  choosePreviewTarget?(): Promise<AnimationPreviewResource | null>; onPreset?(preset: AppliedAnimationPreset): Promise<void>; presetContext?: AnimationPresetParameters;
  onGenerate?(request: AnimationGenerationRequest): Promise<void>;
  guiDraft?:AnimationGuiDraft|null;onGuiDraftChange?(draft:AnimationGuiDraft):void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [draft, setDraft] = useState(guiDraft?.draft??animation), latest = useRef(guiDraft?.draft??animation), accepted = useRef(animation);
  const [selection, select] = useState<[number, number]>(guiDraft?.selection??[0, 0]), [time, setTime] = useState(0), timeRef = useRef(0);
  const [playing, play] = useState(false), [zoom, setZoom] = useState(1), [snap, setSnap] = useState(true);
  const [error, setError] = useState(''), [pending, setPending] = useState(false), busy = useRef(false);
  const [name, setName] = useState(guiDraft?.name??(defaultName || t('动画', 'Animation', 'アニメーション'))), [saved, setSaved] = useState(''), [buffered, setBuffered] = useState(!!Object.keys(guiDraft?.numbers??{}).length);
  const [numberInputs,setNumberInputs]=useState<AnimationGuiDraft['numbers']>(guiDraft?.numbers??{}),initialHydration=useRef(!!guiDraft);
  const gesture = useRef<{ before: NativeAnimation; track: number; key: number; node: HTMLButtonElement; pointerId: number } | null>(null);
  const preview = useRef(onPreview); preview.current = onPreview;
  const dirty = useRef(onDraftChange); dirty.current = onDraftChange;
  const dirtyFields = useRef(new Set<string>());
  const [fieldSession, resetFields] = useState(0);
  const [instruction, setInstruction] = useState(guiDraft?.instruction??''), [generationMode, setGenerationMode] = useState<'new' | 'patch' | 'replace'>(guiDraft?.generationMode??'patch'), [generationPath, setGenerationPath] = useState(guiDraft?.generationPath??''), previewContext = useRef('');
  const [rangeEnabled, setRangeEnabled] = useState(guiDraft?.rangeEnabled??false), [rangeStart, setRangeStart] = useState(guiDraft?.rangeStart??0), [rangeEnd, setRangeEnd] = useState(guiDraft?.rangeEnd??animation.durationMs), [generationPending, setGenerationPending] = useState(false);
  useEffect(()=>{onGuiDraftChange?.({draft,accepted:accepted.current,selection,name,instruction,generationMode,generationPath,rangeEnabled,rangeStart,rangeEnd,numbers:numberInputs});},[draft,selection,name,instruction,generationMode,generationPath,rangeEnabled,rangeStart,rangeEnd,numberInputs,onGuiDraftChange]);
  const reportDirty = () => dirty.current?.(dirtyFields.current.size > 0 || JSON.stringify(latest.current) !== JSON.stringify(accepted.current));
  const show = (next: NativeAnimation) => { latest.current = next; setDraft(next); reportDirty(); preview.current?.(next, timeRef.current); };
  const seek = (value: number) => { const at = Math.max(0, Math.min(latest.current.durationMs, value)); timeRef.current = at; setTime(at); preview.current?.(latest.current, at); };
  useEffect(() => { if(initialHydration.current){initialHydration.current=false;return;}if (!gesture.current && !busy.current) { accepted.current = animation; show(animation); seek(timeRef.current); } }, [animation]);
  const commit = async (next: NativeAnimation) => {
    if (busy.current) return;
    const checked = NativeAnimationSchema.safeParse(next);
    if (!checked.success) throw new Error(t('关键帧时刻须递增且位于区间内；请调整时长或时刻。', 'Keyframes must increase within the duration. Adjust duration or time.', '時刻を区間内で昇順にしてください。'));
    show(checked.data); setError('');
    if (JSON.stringify(checked.data) === JSON.stringify(accepted.current)) return;
    busy.current = true; setPending(true); play(false);
    try { await onChange(checked.data); accepted.current = checked.data; reportDirty(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); throw reason; }
    finally { busy.current = false; setPending(false); }
  };
  const apply = (next: NativeAnimation) => { void commit(next).catch(reason => setError(reason.message)); };
  const cancel = () => {
    const current = gesture.current; if (!current) return;
    gesture.current = null; show(current.before); setError('');
    if (current.node.hasPointerCapture(current.pointerId)) current.node.releasePointerCapture(current.pointerId);
    current.node.focus({ preventScroll: true });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); cancel(); } };
    window.addEventListener('keydown', key); window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let handle = 0, previous = performance.now();
    const tick = (now: number) => { seek(timeRef.current + now - previous); previous = now; if (timeRef.current >= latest.current.durationMs) play(false); else handle = requestAnimationFrame(tick); };
    handle = requestAnimationFrame(tick); return () => cancelAnimationFrame(handle);
  }, [playing]);
  useEffect(() => { if (!active) play(false); }, [active]);
  const ti = Math.min(selection[0], draft.tracks.length - 1), track = draft.tracks[ti]!;
  const ki = Math.min(selection[1], track.keyframes.length - 1), frame = track.keyframes[ki]!;
  const label = (path: string) => ({ '/x': 'X', '/y': 'Y', '/opacity': t('透明度', 'Opacity', '不透明度'), '/scaleX': t('水平缩放', 'Scale X', '横倍率'), '/scaleY': t('垂直缩放', 'Scale Y', '縦倍率'), '/rotationDeg': t('旋转', 'Rotation', '回転'), '/station': t('站位', 'Station', '立ち位置'), '/blend': t('混合', 'Blend', '合成') }[path] ?? path.slice(1));
  const framePatch = (patch: Partial<typeof frame>, value = latest.current, trackIndex = ti, keyIndex = ki) => { const next = structuredClone(value); Object.assign(next.tracks[trackIndex]!.keyframes[keyIndex]!, patch); return next; };
  const numeric = typeof frame.value === 'number';
  const sampled = sampleAnimation(draft, time, Object.fromEntries(draft.tracks.map(item => [item.path, item.path.includes('scale') || item.path === '/opacity' ? 1 : typeof item.keyframes[0]!.value === 'number' ? 0 : item.keyframes[0]!.value])));
  const number = (name: string, value: number, unit: string, update: (value: number) => NativeAnimation, min?: number, max?: number) => <StudioNumberField key={`${fieldSession}-${ti}-${ki}-${name}`} label={name} value={value} min={min} max={max} step={unit === 'ms' ? 10 : .1} unit={unit} locale={locale} readOnly={pending}
    inputDraft={numberInputs[`${ti}-${ki}-${name}`]} onInputDraftChange={next=>setNumberInputs(previous=>{const fields={...previous},key=`${ti}-${ki}-${name}`;if(next)fields[key]=next;else delete fields[key];return fields;})}
    onDraftChange={value => { const field = `${ti}-${ki}-${name}`; if (value) dirtyFields.current.add(field); else dirtyFields.current.delete(field); setBuffered(dirtyFields.current.size > 0); reportDirty(); }} onPreview={value => { const next = update(value); if (NativeAnimationSchema.safeParse(next).success) show(next); }} onCommit={value => commit(update(value))}/>;
  return <section className="pro-editor" aria-label={t('动画编辑器', 'Animation editor', 'アニメーションエディター')}>
    <header className="pro-heading"><div><h2>{t('动画与关键帧', 'Animation & keyframes', 'アニメーションとキーフレーム')}</h2><p>{targetLabel}</p></div><span role="status">{pending ? t('正在提交', 'Applying', '適用中') : statusLabel ?? t('预览不写入作品', 'Preview leaves the work unchanged', 'プレビューは作品を変更しません')}</span></header>
    <AnimationPresetPicker locale={locale} disabled={pending || buffered} context={presetContext} apply={async preset => { select([0, 0]); seek(0); if (onPreset) { await onPreset(preset); accepted.current = preset.animation; show(preset.animation); } else await commit(preset.animation); }}/>
    {onGenerate && <details className="gca-generation"><summary>{t('用自然语言制作动画', 'Create animation with a prompt', '指示文からアニメーションを作成')}</summary><div className="gca-generation-fields"><label className="gca-generation-choice">{t('生成方式', 'Generation mode', '生成方法')}<Choice label={t('生成方式', 'Generation mode', '生成方法')} value={generationMode} options={[{ value: 'patch', label: t('局部修改，保留其他内容', 'Edit a track and preserve the rest', '一部を変更して他を保持') }, { value: 'new', label: t('生成新动画', 'Create a new animation', '新しいアニメーション') }, { value: 'replace', label: t('重做整段动画', 'Rewrite the whole animation', '全体を作り直す') }]} onChange={value => setGenerationMode(value as typeof generationMode)}/></label>
      {generationMode === 'patch' && <><label className="gca-generation-choice">{t('允许修改的轨道', 'Editable track', '編集可能トラック')}<Choice label={t('允许修改的轨道', 'Editable track', '編集可能トラック')} value={generationPath || track.path} options={AnimationPathSchema.options.map(path => ({ value: path, label: label(path) }))} onChange={setGenerationPath}/></label><label><input type="checkbox" checked={rangeEnabled} onChange={event => setRangeEnabled(event.target.checked)}/>{t('限定时间范围', 'Limit time range', '時間範囲を限定')}</label>{rangeEnabled && <><label>{t('开始（毫秒）', 'Start (ms)', '開始（ms）')}<Input type="number" min="0" max={draft.durationMs} value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))}/></label><label>{t('结束（毫秒）', 'End (ms)', '終了（ms）')}<Input type="number" min={rangeStart} max={draft.durationMs} value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))}/></label></>}</>}
      <label className="gca-generation-instruction">{t('动画要求', 'Animation request', 'アニメーションの指示')}<Textarea value={instruction} placeholder={t('例如：跳得更高，时长不变', 'For example: jump higher and keep the duration', '例：時間を保ち、もっと高く跳ぶ')} onChange={event => setInstruction(event.target.value)}/></label>
      <Button tone="primary" disabled={pending || buffered || generationPending || !instruction.trim()} onClick={async () => { setGenerationPending(true); setError(''); try { await onGenerate({ instruction: instruction.trim(), mode: generationMode, currentAnimation: generationMode === 'new' ? null : latest.current, paths: generationMode === 'patch' ? [generationPath || track.path] as AnimationTrack['path'][] : [], range: generationMode === 'patch' && rangeEnabled ? { startMs: rangeStart, endMs: rangeEnd } : null, targetContext: previewContext.current || targetLabel, preserveDuration: generationMode !== 'new', allowDelete: false, assetId: null, assetRevision: null }); } catch (reason) { setError(String(reason)); } finally { setGenerationPending(false); } }}>{t('准备制作候选', 'Prepare animation production', '制作候補を準備')}</Button></div><p className="pro-note">{t('下一步使用已配置的文字连接审阅并发送请求。原动画保留，候选通过校验后才可采用。', 'Next, review and send with a configured text connection. The original is retained and candidates must pass validation before adoption.', '次に設定済みの文章接続で確認して送信。元の内容を保持し、検証済み候補のみ適用できます。')}</p></details>}
    <div className="pro-animation-body">
      <div className="pro-stage-column">{stagePreview ?? <AnimationPreview animation={draft} timeMs={time} locale={locale} image={image} chooseTarget={choosePreviewTarget} onTargetContext={value => { previewContext.current = value; }}/>}{stagePreview ? <output className="pro-note">{Math.round(time)} / {draft.durationMs} ms</output> : <output className="pro-note" aria-label={t('实际采样', 'Sampled values', 'サンプル値')}>{Object.entries(sampled).map(([path, value]) => `${label(path)}: ${typeof value === 'number' ? Number(value.toFixed(3)) : value}`).join(' · ')}</output>}</div>
      <fieldset className="pro-properties" aria-busy={pending}><legend>{label(track.path)} · {t('当前关键帧', 'Selected keyframe', '選択中のキーフレーム')}</legend>
        {number(t('时刻', 'Time', '時刻'), frame.timeMs, 'ms', value => framePatch({ timeMs: value }), track.keyframes[ki - 1]?.timeMs === undefined ? 0 : track.keyframes[ki - 1]!.timeMs + 1, track.keyframes[ki + 1]?.timeMs === undefined ? draft.durationMs : track.keyframes[ki + 1]!.timeMs - 1)}
        {numeric ? number(t('数值', 'Value', '値'), Number(frame.value), '', value => framePatch({ value })) : <Choice disabled={pending} label={t('关键帧值', 'Keyframe value', 'キーフレーム値')} value={String(frame.value)} options={(typeof frame.value === 'boolean' ? ['false', 'true'] : track.path === '/station' ? ['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'] : ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add']).map(value => ({ value, label: value }))} onChange={value => apply(framePatch({ value: typeof frame.value === 'boolean' ? value === 'true' : value as typeof frame.value }))}/>}
        <label>{t('计算方式', 'Value mode', '計算方式')}<Choice disabled={pending} label={t('计算方式', 'Value mode', '計算方式')} value={track.mode} options={(numeric ? ['absolute', 'add', 'multiply'] : ['absolute']).map((value, i) => ({ value, label: [t('绝对值', 'Absolute', '絶対'), t('加量', 'Add', '加算'), t('乘量', 'Multiply', '乗算')][i]! }))} onChange={mode => { const next = structuredClone(latest.current); next.tracks[ti]!.mode = mode as AnimationTrack['mode']; apply(next); }}/></label>
        <label>{t('缓动曲线', 'Easing curve', 'イージング')}<Choice disabled={pending} label={t('缓动曲线', 'Easing curve', 'イージング')} value={frame.easing.family} options={['linear', 'sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce'].map(value => ({ value, label: value }))} onChange={family => apply(framePatch({ easing: { ...frame.easing, family: family as typeof frame.easing.family } }))}/></label>
        <label>{t('缓动方向', 'Easing direction', 'イージング方向')}<Choice disabled={pending} label={t('缓动方向', 'Easing direction', 'イージング方向')} value={frame.easing.direction} options={['in', 'out', 'inOut'].map((value, i) => ({ value, label: [t('渐入', 'In', 'イン'), t('渐出', 'Out', 'アウト'), t('渐入渐出', 'In and out', 'インアウト')][i]! }))} onChange={direction => apply(framePatch({ easing: { ...frame.easing, direction: direction as typeof frame.easing.direction } }))}/></label>
      </fieldset>
    </div>
    <div className="pro-transport" role="group" aria-label={t('播放与时间轴', 'Playback and timeline', '再生とタイムライン')}>
      <Button onClick={() => { play(false); seek(0); }} title={t('回到起点', 'Return to start', '先頭へ')} aria-label={t('回到起点', 'Return to start', '先頭へ')}><SkipBack/></Button>
      <Button disabled={pending || draft.durationMs === 0} onClick={() => { if (timeRef.current >= draft.durationMs) seek(0); play(!playing); }}>{playing ? <Pause/> : <Play/>}{playing ? t('暂停', 'Pause', '一時停止') : t('播放', 'Play', '再生')}</Button>
      <label className="pro-seek">{t('播放头', 'Playhead', '再生位置')}<input data-slot="pro-control" type="range" min={0} max={draft.durationMs} value={time} onChange={event => { play(false); seek(Number(event.target.value)); }}/></label>
      <Choice disabled={pending} label={t('时间轴缩放', 'Timeline zoom', 'タイムライン倍率')} value={String(zoom)} options={[1, 2, 4].map(value => ({ value: String(value), label: `${value * 100}%` }))} onChange={value => setZoom(Number(value))}/>
      <label className="pro-check"><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)}/>{t('吸附 100 ms', 'Snap 100 ms', '100 ms に吸着')}</label>
    </div>
    <div className="pro-timeline-scroll" tabIndex={0} aria-label={t('关键帧轨道滚动区', 'Keyframe tracks', 'キーフレームトラック')}><div className="pro-lanes" style={{ minWidth: `${zoom * 100}%` }}>
      <div className="pro-ruler"><span>ms</span><div>{[0, .25, .5, .75, 1].map(value => <span key={value} style={{ left: `${value * 100}%` }}>{Math.round(draft.durationMs * value)}</span>)}</div></div>
      {draft.tracks.map((item, trackIndex) => <div className="pro-lane" key={item.path} data-selected={ti === trackIndex}>
        <Button tone="quiet" onClick={() => select([trackIndex, 0])} aria-pressed={ti === trackIndex}><Diamond size={14}/>{label(item.path)}</Button>
        <div className="pro-track"><i className="pro-playhead" style={{ left: `${draft.durationMs ? time / draft.durationMs * 100 : 0}%` }}/>{item.keyframes.map((keyframe, keyIndex) => <button data-slot="pro-control" className="pro-key" key={keyIndex} disabled={pending} aria-pressed={ti === trackIndex && ki === keyIndex} aria-label={`${label(item.path)} ${keyframe.timeMs} ms`} title={`${keyframe.timeMs} ms · ${keyframe.value}`} style={{ left: `${draft.durationMs ? keyframe.timeMs / draft.durationMs * 100 : 0}%` }}
          onFocus={() => select([trackIndex, keyIndex])} onClick={() => select([trackIndex, keyIndex])} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); select([trackIndex, keyIndex]); play(false); gesture.current = { before: structuredClone(latest.current), track: trackIndex, key: keyIndex, node: event.currentTarget, pointerId: event.pointerId }; }}
          onPointerMove={event => { const current = gesture.current; if (!current) return; const rect = event.currentTarget.parentElement!.getBoundingClientRect(); let value = (event.clientX - rect.left) / rect.width * latest.current.durationMs; value = Math.round(value / (snap ? 100 : 1)) * (snap ? 100 : 1); const frames = current.before.tracks[current.track]!.keyframes; value = Math.max(frames[current.key - 1]?.timeMs === undefined ? 0 : frames[current.key - 1]!.timeMs + 1, Math.min(frames[current.key + 1]?.timeMs === undefined ? latest.current.durationMs : frames[current.key + 1]!.timeMs - 1, value)); show(framePatch({ timeMs: value }, current.before, current.track, current.key)); }}
          onPointerUp={() => { if (!gesture.current) return; gesture.current = null; apply(latest.current); }} onPointerCancel={cancel} onLostPointerCapture={cancel}
          onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const value = keyframe.timeMs + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10); const next = framePatch({ timeMs: value }, latest.current, trackIndex, keyIndex); if (NativeAnimationSchema.safeParse(next).success) apply(next); }}><Diamond size={14}/></button>)}</div>
      </div>)}
    </div></div>
    <Collapsible.Root className="pro-track-disclosure"><div className="pro-edit-tools"><Button disabled={pending || track.keyframes.some(item => item.timeMs === Math.round(time))} onClick={() => { const next = structuredClone(latest.current), frames = next.tracks[ti]!.keyframes; frames.push({ ...structuredClone(frame), timeMs: Math.round(time) }); frames.sort((a, b) => a.timeMs - b.timeMs); select([ti, frames.findIndex(item => item.timeMs === Math.round(time))]); apply(next); }}><Plus/>{t('在播放头添加', 'Add at playhead', '再生位置に追加')}</Button>
      <Button disabled={pending || track.keyframes.length === 1} onClick={() => { const next = structuredClone(latest.current); next.tracks[ti]!.keyframes.splice(ki, 1); select([ti, 0]); apply(next); }}><Trash2/>{t('删除关键帧', 'Delete keyframe', 'キーフレーム削除')}</Button>
      <Collapsible.Trigger data-slot="pro-control" className="pro-track-toggle"><ChevronRight size={16}/>{t('轨道与总时长', 'Tracks and duration', 'トラックと長さ')}</Collapsible.Trigger></div><Collapsible.Panel><div className="pro-track-settings">{number(t('总时长', 'Duration', '長さ'), draft.durationMs, 'ms', value => ({ ...latest.current, durationMs: value }), Math.max(...draft.tracks.flatMap(item => item.keyframes.map(frame => frame.timeMs))))}
        <Choice disabled={pending} label={t('添加属性轨道', 'Add property track', '属性トラックを追加')} value="" options={[{ value: '', label: t('选择属性…', 'Choose property…', '属性を選択…') }, ...AnimationPathSchema.options.filter(path => !draft.tracks.some(item => item.path === path)).map(path => ({ value: path, label: label(path) }))]} onChange={path => { if (!path) return; const next = structuredClone(latest.current); const value = path === '/station' ? 'center' : path === '/blend' ? 'normal' : path.startsWith('/filters/') || path === '/circle/invert' ? false : 1; next.tracks.push({ path: path as AnimationTrack['path'], mode: 'absolute', keyframes: [{ timeMs: draft.durationMs, value, easing: { family: 'linear', direction: 'in' } }] }); select([next.tracks.length - 1, 0]); apply(next); }}/>
        <Button disabled={pending || draft.tracks.length === 1} onClick={() => { const next = structuredClone(latest.current); next.tracks.splice(ti, 1); select([0, 0]); apply(next); }}>{t('删除当前轨道', 'Delete selected track', '選択トラックを削除')}</Button></div></Collapsible.Panel>
    </Collapsible.Root>
    <p className="pro-note">{t('关键帧：← → 移动 10 ms · Shift 移动 100 ms · 拖动后松开提交一次 · Esc 取消拖动', 'Keyframes: ← → 10 ms · Shift 100 ms · Release to apply once · Esc cancels drag', 'キー：← → 10 ms・Shift 100 ms・ドロップで一度適用・Esc で中止')}</p>
    {onSave && <div className="pro-save"><Input aria-label={t('动画名称', 'Animation name', 'アニメーション名')} value={name} onChange={event => setName(event.target.value)}/><Button disabled={pending || buffered || !!error || !name.trim()} onClick={async () => { if (busy.current) return; busy.current = true; setPending(true); try { setSaved(await onSave(name.trim(), latest.current)); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { busy.current = false; setPending(false); } }}>{t('保存为动画素材', 'Save animation asset', 'アニメーション素材を保存')}</Button>{saved && <span role="status">{saved}</span>}</div>}
    {error && <div className="pro-error" role="alert">{error}<Button disabled={pending} onClick={() => apply(latest.current)}>{t('重试提交', 'Retry apply', '再試行')}</Button><Button onClick={() => { dirtyFields.current.clear(); setBuffered(false); resetFields(value => value + 1); show(accepted.current); setError(''); }}>{t('还原已提交值', 'Restore applied values', '適用済みの値へ戻す')}</Button></div>}
  </section>;
}
