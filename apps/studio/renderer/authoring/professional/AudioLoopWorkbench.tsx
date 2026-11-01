import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '../../components/controls.js';
import { StudioNumberField } from '../../components/editor-fields/StudioNumberField.js';
import { configureAudioPreview, type PreviewPlayback } from '../audio-preview.js';
import './professional-editors.css';

export type AudioLoopGuiDraft = { draft:PreviewPlayback; numbers:Record<string,import('../../components/editor-fields/StudioNumberField.js').NumberInputDraft> };
/** A single source's existing loop metadata, with an actual decoded waveform. No arrangement model. */
export function AudioLoopWorkbench({ src, name, value, fallback, locale = 'zh-CN', active = true, readonly = false, loop = true, onDraftChange, onChange, guiDraft,onGuiDraftChange }: {
  guiDraft?:AudioLoopGuiDraft|null;onGuiDraftChange?(draft:AudioLoopGuiDraft):void;
  src?: string; name: string; value: PreviewPlayback; onChange(value: PreviewPlayback): Promise<void>;
  locale?: string; active?: boolean; readonly?: boolean; loop?: boolean; fallback?: PreviewPlayback; onDraftChange?(dirty: boolean): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const audio = useRef<HTMLAudioElement>(null), [draft, setDraft] = useState(guiDraft?.draft??value), current = useRef(guiDraft?.draft??value), accepted = useRef(value);
  const [numberInputs,setNumberInputs]=useState<AudioLoopGuiDraft['numbers']>(guiDraft?.numbers??{}),initialHydration=useRef(!!guiDraft);
  useEffect(()=>{onGuiDraftChange?.({draft,numbers:numberInputs});},[draft,numberInputs,onGuiDraftChange]);
  const [peaks, setPeaks] = useState<number[]>([]), [duration, setDuration] = useState(0), [position, setPosition] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'), [attempt, retry] = useState(0);
  const [playing, setPlaying] = useState(false), [error, setError] = useState(''), [pending, setPending] = useState(false), busy = useRef(false);
  const dirtyFields = useRef(new Set<string>()), dirtyCallback = useRef(onDraftChange); dirtyCallback.current = onDraftChange;
  const fieldDirty = (field: string, dirty: boolean) => { if (dirty) dirtyFields.current.add(field); else dirtyFields.current.delete(field); dirtyCallback.current?.(dirtyFields.current.size > 0); };
  useEffect(() => () => { dirtyCallback.current?.(false); }, []);
  const [fieldSession, resetFields] = useState(0);
  const show = (next: PreviewPlayback) => { current.current = next; setDraft(next); };
  useEffect(() => { if (!active) audio.current?.pause(); }, [active]);
  useEffect(() => { if(initialHydration.current){initialHydration.current=false;return;}accepted.current = value; if (!busy.current) show(value); }, [value]);
  useEffect(() => {
    setPeaks([]); setDuration(0); setPosition(0); setPlaying(false); setState('loading');
    if (!src) return;
    let active = true; const abort = new AbortController(), context = new AudioContext();
    void (async () => {
      try {
        const response = await fetch(src, { signal: abort.signal }); if (!response.ok) throw new Error('音频文件不可用');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!active) return;
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)), bins = 512;
        const values = Array.from({ length: bins }, (_, index) => { let peak = 0; const start = Math.floor(index * buffer.length / bins), end = Math.floor((index + 1) * buffer.length / bins); for (const channel of channels) for (let sample = start; sample < end; sample++) peak = Math.max(peak, Math.abs(channel[sample]!)); return peak; });
        setPeaks(values); setDuration(buffer.duration); setState('ready');
      } catch { if (active) setState('error'); }
      finally { if (context.state !== 'closed') await context.close(); }
    })();
    return () => { active = false; abort.abort(); if (context.state !== 'closed') void context.close(); audio.current?.pause(); };
  }, [src, attempt]);
  const start = draft.loopStartSec ?? fallback?.loopStartSec ?? 0, end = draft.loopEndSec ?? fallback?.loopEndSec ?? duration;
  useEffect(() => { const node = audio.current; if (node) return configureAudioPreview(node, loop && duration > 0 ? { loopStartSec: start, loopEndSec: end } : { loopStartSec: null, loopEndSec: null }); }, [start, end, src, duration, loop]);
  const commit = async (next: PreviewPlayback) => {
    if (readonly) return;
    const start = next.loopStartSec ?? fallback?.loopStartSec ?? 0, end = next.loopEndSec ?? fallback?.loopEndSec ?? duration;
    if (start !== null && (start < 0 || start >= duration) || end !== null && (end > duration || end <= (start ?? 0))) throw new Error(t('循环结束须晚于起点，且位于音频时长内。', 'Loop end must follow its start within the audio duration.', 'ループ終了を開始より後、音声の長さ以内にしてください。'));
    show(next); if (busy.current || next.loopStartSec === accepted.current.loopStartSec && next.loopEndSec === accepted.current.loopEndSec) return;
    busy.current = true; setPending(true); audio.current?.pause(); setError('');
    try { await onChange(next); accepted.current = next; dirtyCallback.current?.(dirtyFields.current.size > 0); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); throw reason; } finally { busy.current = false; setPending(false); }
  };
  const seek = (at: number) => { if (audio.current) audio.current.currentTime = at; setPosition(at); };
  if (!src) return <section className="pro-editor pro-audio-empty"><h2>{t('先选择一项声音', 'Choose an audio asset', '音声素材を選択')}</h2><p>{t('选择后可查看真实波形、定位播放头并调整循环区间。', 'Choose audio to inspect its waveform, seek and edit its loop.', '波形の確認、再生位置とループ区間の編集ができます。')}</p></section>;
  return <section className="pro-editor" aria-label={t('声音循环编辑器', 'Audio loop editor', '音声ループエディター')}>
    <header className="pro-heading"><div><h2>{t('声音与循环区间', 'Audio and loop range', '音声とループ区間')}</h2><p>{name}</p></div><span role="status">{pending ? t('正在提交', 'Applying', '適用中') : state === 'ready' ? `${duration.toFixed(2)} s · ${t('解码波形', 'Decoded waveform', 'デコード波形')}` : state === 'loading' ? t('正在解码音频…', 'Decoding audio…', '音声をデコード中…') : t('音频不可用', 'Audio unavailable', '音声を利用できません')}</span></header>
    <audio ref={audio} src={src} preload="metadata" onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setState('error')}/>
    {state === 'error' ? <div className="pro-error" role="alert">{t('无法读取声音。当前引用与循环草稿已保留。', 'Cannot read audio. Its reference and loop draft remain.', '音声を読み込めません。参照と入力を保持しています。')}<Button onClick={() => { audio.current?.load(); retry(value => value + 1); }}>{t('重试读取', 'Retry loading', '読み込みを再試行')}</Button></div> : <>
      <div className="pro-wave" aria-busy={state === 'loading'}>
        {state === 'ready' && <><div className="pro-loop-area" style={{ left: `${start / duration * 100}%`, width: `${Math.max(0, end - start) / duration * 100}%` }}/><svg viewBox="0 0 1024 160" preserveAspectRatio="none" role="img" aria-label={t('实际音频的振幅波形', 'Waveform decoded from audio', '実音声の振幅波形')}>{peaks.map((peak, index) => <line key={index} x1={index * 2 + 1} x2={index * 2 + 1} y1={80 - peak * 72} y2={80 + peak * 72}/>)}</svg><i className="pro-playhead" style={{ left: `${position / duration * 100}%` }}/><span className="pro-loop-label" style={{ left: `${start / duration * 100}%`, transform: start / duration > .8 ? 'translateX(-100%)' : undefined }}>{t('起点', 'Start', '開始')} {start.toFixed(2)}s</span><span className="pro-loop-end" style={{ left: `${end / duration * 100}%`, transform: end / duration > .8 ? 'translateX(-100%)' : undefined }}>{t('终点', 'End', '終了')} {end.toFixed(2)}s</span></>}
        {state === 'loading' && <p>{t('正在从声音文件生成波形…', 'Generating waveform from audio…', '音声ファイルから波形を生成中…')}</p>}
      </div>
      <div className="pro-audio-ruler"><span>0 s</span><span>{(duration / 2).toFixed(2)} s</span><span>{duration.toFixed(2)} s</span></div>
      <div className="pro-transport"><Button disabled={state !== 'ready' || !active} onClick={() => { const node = audio.current!; if (node.paused) void node.play().catch(() => setError(t('未能开始播放，请再次点击播放。', 'Playback did not start. Try Play again.', '再生できませんでした。もう一度再生してください。'))); else node.pause(); }}>{playing ? <Pause/> : <Play/>}{playing ? t('暂停', 'Pause', '一時停止') : t('播放声音', 'Play audio', '音声を再生')}</Button>
        <Button disabled={state !== 'ready'} onClick={() => seek(start)}><RotateCcw/>{t('定位循环起点', 'Seek loop start', 'ループ開始へ')}</Button>
        <label className="pro-seek">{t('播放头', 'Playhead', '再生位置')}<input data-slot="pro-control" type="range" min={0} max={duration} step={.01} value={Math.min(position, duration)} disabled={state !== 'ready'} onChange={event => seek(Number(event.target.value))}/></label><output aria-label={t('声音播放位置', 'Audio position', '音声の再生位置')}>{position.toFixed(2)} s</output>
      </div>
      <fieldset key={fieldSession} className="pro-loop-fields" disabled={state !== 'ready'}>
        <legend>{t('循环区间', 'Loop range', 'ループ区間')} · s</legend>
        <StudioNumberField label={t('循环起点', 'Loop start', 'ループ開始')} value={start} min={0} max={Math.max(0, end - .01)} step={.01} unit="s" locale={locale} readOnly={pending || readonly} inputDraft={numberInputs.start} onInputDraftChange={next=>setNumberInputs(previous=>{const fields={...previous};if(next)fields.start=next;else delete fields.start;return fields;})} onDraftChange={dirty => fieldDirty('start', dirty)} onPreview={value => show({ ...current.current, loopStartSec: value })} onCommit={value => commit({ ...accepted.current, loopStartSec: value })}/>
        <StudioNumberField label={t('循环终点', 'Loop end', 'ループ終了')} value={end} min={start + .01} max={duration} step={.01} unit="s" locale={locale} readOnly={pending || readonly} inputDraft={numberInputs.end} onInputDraftChange={next=>setNumberInputs(previous=>{const fields={...previous};if(next)fields.end=next;else delete fields.end;return fields;})} onDraftChange={dirty => fieldDirty('end', dirty)} onPreview={value => show({ ...current.current, loopEndSec: value })} onCommit={value => commit({ ...accepted.current, loopEndSec: value })}/>
      </fieldset>
    </>}
    <p className="pro-note">{readonly ? t('当前引用只读。', 'This reference is read-only.', 'この参照は読み取り専用です。') : t('试听遵循当前循环起止点。播放与定位只改变预览；数值输入或拖动标签后确认一次，Esc 还原。', 'Preview follows the loop. Playback and seeking only affect preview; confirm a field or scrub once to apply. Esc restores.', '現在の区間で試聴します。再生と位置変更はプレビューのみ。数値またはドラッグを確定して適用、Esc で復元。')}</p>
    {error && <div role="alert" className="pro-error">{error}<Button disabled={pending || readonly} onClick={() => { void commit(current.current).catch(() => {}); }}>{t('重试提交', 'Retry apply', '適用を再試行')}</Button><Button onClick={() => { dirtyFields.current.clear(); resetFields(value => value + 1); show(accepted.current); dirtyCallback.current?.(false); setError(''); }}>{t('还原已提交值', 'Restore applied values', '適用済みの値に戻す')}</Button></div>}
  </section>;
}
