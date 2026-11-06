import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { Asset } from '@galcraft/contracts';
import type { AuthoringServices } from '../../../../authoring/controller.js';
import { configureAudioPreview, type PreviewPlayback } from '../../../../authoring/audio-preview.js';
import { CandidateButton, CandidateFieldGroup, CandidateRangeField, CandidateState, CandidateToolbar } from '../controls/index.js';
import { CandidateAudioWaveform, loopMaxStart, loopMinEnd, type LoopRange } from './CandidateAudioWaveform.js';
import { ProfessionalNumber, professionalError, professionalText, type ProfessionalNumberDraft } from './professional-fields.js';
import '../../styles/professional.css';

type Edge = 'start' | 'end';
export type CandidateAudioLoopGuiDraft = { draft: PreviewPlayback; numbers: Partial<Record<Edge, ProfessionalNumberDraft>> };

function useDecodedWaveform(src: string | undefined, attempt: number) {
  const [decoded, setDecoded] = useState<{ src: string; attempt: number; duration: number; peaks: number[] }>();
  const [failed, setFailed] = useState<{ src: string; attempt: number }>();
  useEffect(() => {
    if (!src) return;
    let live = true, context: AudioContext | undefined;
    const abort = new AbortController();
    const close = () => { if (context?.state !== 'closed') void context?.close().catch(() => {}); };
    void (async () => {
      try {
        const response = await fetch(src, { signal: abort.signal });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (!live) return;
        context = new AudioContext();
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!live) return;
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
        const bins = 512;
        const peaks = Array.from({ length: bins }, (_, index) => {
          const start = Math.floor(index * buffer.length / bins), end = Math.floor((index + 1) * buffer.length / bins);
          let peak = 0;
          for (const channel of channels) for (let sample = start; sample < end; sample++) peak = Math.max(peak, Math.abs(channel[sample]!));
          return peak;
        });
        setDecoded({ src, attempt, duration: buffer.duration, peaks });
      } catch { if (live) setFailed({ src, attempt }); }
      finally { close(); }
    })();
    return () => { live = false; abort.abort(); close(); };
  }, [src, attempt]);
  return {
    ready: decoded?.src === src && decoded?.attempt === attempt ? decoded : undefined,
    error: failed?.src === src && failed?.attempt === attempt,
  };
}

const samePlayback = (a: PreviewPlayback, b: PreviewPlayback) => a.loopStartSec === b.loopStartSec && a.loopEndSec === b.loopEndSec;
const withEdge = (value: PreviewPlayback, edge: Edge, seconds: number): PreviewPlayback =>
  edge === 'start' ? { ...value, loopStartSec: seconds } : { ...value, loopEndSec: seconds };

function CandidateAudioLoopWorkbench({ src, name, value, fallback, loopLimitSec, locale = 'zh-CN', active = true, readonly = false, loop = true,
  onChange, onDraftChange, guiDraft, onGuiDraftChange, loading: resourceLoading, resourceError, onRetry }: {
  src?: string; name: string; value: PreviewPlayback; fallback?: PreviewPlayback; loopLimitSec?: number; locale?: string; active?: boolean; readonly?: boolean; loop?: boolean;
  guiDraft?: CandidateAudioLoopGuiDraft | null; onGuiDraftChange?(draft: CandidateAudioLoopGuiDraft): void;
  onChange(value: PreviewPlayback, durationSec: number): Promise<void>; onDraftChange?(dirty: boolean): void;
  loading?: boolean; resourceError?: string; onRetry?(): void;
}) {
  const t = professionalText(locale);
  const audio = useRef<HTMLAudioElement>(null);
  const [draft, setDraft] = useState(guiDraft?.draft ?? value), current = useRef(draft), accepted = useRef(value), external = useRef(value);
  const [numbers, setNumbers] = useState<CandidateAudioLoopGuiDraft['numbers']>(guiDraft?.numbers ?? {});
  const [pending, setPending] = useState(false), busy = useRef(false);
  const [failure, setFailure] = useState<{ message: string; conflict?: boolean } | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const [attempt, retry] = useState(0);
  const [position, setPosition] = useState(0), [playing, setPlaying] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const dirtyCallback = useRef(onDraftChange); dirtyCallback.current = onDraftChange;
  const { ready, error: decodeFailed } = useDecodedWaveform(src, attempt);
  const duration = ready?.duration ?? 0;
  const loopLimit = Math.min(duration, loopLimitSec ?? duration);
  const buffered = Object.keys(numbers).length > 0;
  const dirty = buffered || !samePlayback(draft, accepted.current);
  const show = (next: PreviewPlayback) => { current.current = next; setDraft(next); };
  const resolveRange = (value: PreviewPlayback): LoopRange => ({
    start: value.loopStartSec ?? fallback?.loopStartSec ?? 0, end: value.loopEndSec ?? fallback?.loopEndSec ?? loopLimit,
  });
  const range = resolveRange(draft);
  const mediaError = decodeFailed || playbackFailed;
  const canPlay = Boolean(ready && !mediaError && active);
  const blocked = readonly || pending || !canPlay || failure?.conflict;

  useEffect(() => { if (!active) audio.current?.pause(); }, [active]);
  useEffect(() => { setPosition(0); setPlaying(false); setPlaybackFailed(false); setPlaybackError(''); }, [src, attempt]);
  useEffect(() => {
    if (samePlayback(external.current, value) || busy.current) return;
    external.current = value;
    if (samePlayback(accepted.current, value)) return;
    accepted.current = value;
    if (dirty) setFailure({ conflict: true, message: t('原循环区间已变化。恢复最新已提交值后可继续编辑。', 'The source loop changed. Restore the latest applied values to continue.', '元のループが変更されました。最新の適用値に戻して続行してください。') });
    else { show(value); setFailure(null); }
  }, [value, pending]);
  useEffect(() => { dirtyCallback.current?.(dirty); }, [dirty]);
  useEffect(() => () => dirtyCallback.current?.(false), []);
  useEffect(() => { onGuiDraftChange?.({ draft, numbers }); }, [draft, numbers, onGuiDraftChange]);
  useEffect(() => {
    const node = audio.current;
    if (!node) return;
    const playable = loop && loopLimit > 0 && range.start >= 0 && range.end > range.start && range.end <= loopLimit;
    return configureAudioPreview(node, playable ? { loopStartSec: range.start, loopEndSec: range.end } : { loopStartSec: null, loopEndSec: null });
  }, [range.start, range.end, src, loopLimit, loop]);

  const restore = () => { setNumbers({}); setFailure(null); show(accepted.current); };
  const commit = async (next: PreviewPlayback) => {
    if (readonly || busy.current || failure?.conflict) return;
    const { start, end } = resolveRange(next);
    if (start < 0 || start >= loopLimit || end > loopLimit || end <= start) {
      const message = t('循环结束须晚于起点，且位于音频时长内。', 'Loop end must follow its start within the audio duration.', 'ループ終了を開始より後、音声の長さ以内にしてください。');
      setFailure({ message }); throw new Error(message);
    }
    show(next); setFailure(null);
    if (samePlayback(next, accepted.current)) return;
    busy.current = true; setPending(true); audio.current?.pause();
    try { await onChange(next, duration); accepted.current = next; }
    catch (reason) { setFailure({ message: professionalError(reason) }); throw reason; }
    finally { busy.current = false; setPending(false); }
  };
  const seek = (next: number) => {
    if (!audio.current || !canPlay) return;
    const at = Math.max(0, Math.min(duration, next));
    audio.current.currentTime = at; setPosition(at);
  };
  const playback = async () => {
    const node = audio.current;
    if (!node || !canPlay) return;
    setPlaybackError('');
    if (!node.paused) { node.pause(); return; }
    try { await node.play(); }
    catch { setPlaybackError(t('未能开始播放，请再次点击播放。', 'Playback did not start. Try Play again.', '再生できませんでした。もう一度再生してください。')); }
  };
  const number = (edge: Edge, label: string, min: number, max: number) =>
    <ProfessionalNumber label={label} locale={locale} unit="s" value={range[edge]}
      displayValue={edge === 'end' && draft.loopEndSec === null && fallback?.loopEndSec == null ? String(Number(range.end.toFixed(3))) : undefined}
      min={min} max={max} step={.01} draft={numbers[edge]}
      readOnly={blocked || buffered && !numbers[edge]}
      onDraft={next => setNumbers(previous => {
        const fields = { ...previous };
        if (next) fields[edge] = next;
        else delete fields[edge];
        return fields;
      })}
      onPreview={value => show(withEdge(current.current, edge, value))}
      onCommit={value => commit(withEdge(current.current, edge, value))}
      onCancel={() => { setFailure(null); show(accepted.current); }}/>;
  const draftRange = ({ start, end }: LoopRange) => {
    const baseline = resolveRange(accepted.current);
    return {
      loopStartSec: baseline.start === start ? accepted.current.loopStartSec : start,
      loopEndSec: baseline.end === end ? accepted.current.loopEndSec : end,
    };
  };
  const positionLabel = t('播放头', 'Playhead', '再生位置');
  const loading = Boolean(resourceLoading || src && !ready && !mediaError);
  return <section className="candidate-pro-editor candidate-pro-audio" aria-label={t('声音循环编辑器', 'Audio loop editor', '音声ループエディター')}>
    <header className="candidate-pro-heading">
      <div><h2>{t('声音与循环区间', 'Audio and loop range', '音声とループ区間')}</h2><p>{name}</p></div>
      <span role="status">{pending ? t('正在提交', 'Applying', '適用中') : ready && !mediaError
        ? duration.toFixed(2) + ' s · ' + t('解码波形', 'Decoded waveform', 'デコード波形') : ''}</span>
    </header>
    {src && <audio ref={audio} src={src} preload="metadata" onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setPlaybackFailed(true)}/>}
    {(resourceError || mediaError) && <CandidateState kind="error" title={t('无法读取声音', 'Cannot read audio', '音声を読み込めません')}
      description={resourceError ?? t('已保留声音引用和循环草稿。', 'The audio reference and loop draft are retained.', '参照とループの入力を保持しています。')}
      action={<CandidateButton variant="outline" onClick={() => {
        if (resourceError) onRetry?.();
        else { audio.current?.load(); retry(value => value + 1); }
      }}>{t('重试读取', 'Retry loading', '読み込みを再試行')}</CandidateButton>}/>}
    {loading && <CandidateState kind="loading" title={resourceLoading
      ? t('正在读取声音…', 'Loading audio…', '音声を読み込み中…')
      : t('正在从声音文件生成波形…', 'Generating waveform from audio…', '音声ファイルから波形を生成中…')}/>}
    {ready && !mediaError && <>
      <CandidateAudioWaveform peaks={ready.peaks} duration={duration} loopLimit={loopLimit} position={position} range={range} locale={locale} disabled={Boolean(blocked || buffered || failure)}
        onSeek={seek} onStart={() => audio.current?.pause()} onPreview={next => show(draftRange(next))}
        onCommit={next => { void commit(draftRange(next)).catch(() => {}); }} onCancel={() => show(accepted.current)}/>
      <CandidateToolbar label={t('声音试听', 'Audition audio', '音声を試聴')} className="candidate-pro-transport">
        <CandidateButton variant="outline" disabled={!canPlay} onClick={() => void playback()}>{playing ? <Pause size={16}/> : <Play size={16}/>}
          {playing ? t('暂停', 'Pause', '一時停止') : t('播放声音', 'Play audio', '音声を再生')}</CandidateButton>
        <CandidateButton disabled={!canPlay} onClick={() => seek(range.start)}><RotateCcw size={16}/>{t('定位循环起点', 'Seek loop start', 'ループ開始へ')}</CandidateButton>
        <CandidateRangeField label={positionLabel} value={Math.min(Number(position.toFixed(2)), duration)} min={0} max={duration} step={.01}
          unit="s" disabled={!canPlay} onChange={seek}/>
        <output className="candidate-pro-position" aria-label={t('声音播放位置', 'Audio position', '音声の再生位置')} aria-live="off">{position.toFixed(2)} s</output>
      </CandidateToolbar>
      <CandidateFieldGroup title={t('循环区间', 'Loop range', 'ループ区間')} className="candidate-pro-loop-fields" aria-busy={pending}>
        {number('start', t('循环起点', 'Loop start', 'ループ開始'), 0, loopMaxStart(Math.min(range.end, loopLimit), loopLimit))}
        {number('end', t('循环终点', 'Loop end', 'ループ終了'), loopMinEnd(range.start, loopLimit), loopLimit)}
      </CandidateFieldGroup>
      <p className="candidate-pro-note">{readonly ? t('当前引用只读。', 'This reference is read-only.', 'この参照は読み取り専用です。')
        : t('试听遵循当前循环区间。确认数值或松开波形手柄后应用，Esc 还原。', 'Audition follows the loop. Confirm a value or release a waveform handle to apply. Esc restores.', '現在の区間で試聴します。数値の確定または波形ハンドルを離して適用し、Esc で元に戻します。')}</p>
      {duration - loopLimit > .05 && <p className="candidate-pro-note">
        {t('指令循环区间受素材索引时长限制', 'Command loops use the duration in the asset index', '指令のループは素材インデックスの長さに従います')} · {loopLimit.toFixed(2)} s
      </p>}
    </>}
    {playbackError && <p className="candidate-pro-error" role="alert">{playbackError}</p>}
    {failure && <CandidateState kind="error" title={t('无法应用循环区间', 'Cannot apply loop range', 'ループ区間を適用できません')} description={failure.message}
      action={<CandidateToolbar label={t('恢复循环编辑', 'Recover loop edit', 'ループ編集を復元')}>
        {!failure.conflict && <CandidateButton variant="outline" disabled={Boolean(blocked) || Object.values(numbers).some(draft => draft?.value === null)}
          onClick={() => { void commit(current.current).then(() => setNumbers({})).catch(() => {}); }}>
          {t('重试提交', 'Retry apply', '適用を再試行')}</CandidateButton>}
        <CandidateButton disabled={pending} onClick={restore}>{t('还原已提交值', 'Restore applied values', '適用済みの値に戻す')}</CandidateButton>
      </CandidateToolbar>}/>}
  </section>;
}

/** Hold the exact audio version while its candidate workface is active. */
export function CandidateLeasedAudioLoopEditor({ asset, resources, ...props }: Omit<ComponentProps<typeof CandidateAudioLoopWorkbench>, 'src' | 'name' | 'loading' | 'resourceError' | 'onRetry'> & {
  asset?: Asset; resources: AuthoringServices['runtimeAssets'];
}) {
  const locale = props.locale ?? 'zh-CN', t = professionalText(locale);
  const active = props.active !== false, id = asset?.id, variant = asset?.activeVariantId;
  const [attempt, retry] = useState(0);
  const [load, setLoad] = useState<{ id: string; variant: string; attempt: number; port: AuthoringServices['runtimeAssets']; src?: string; error?: string }>();
  useEffect(() => {
    if (!active || !id || !variant || !resources) return;
    let live = true, lease: string | undefined;
    const identity = { id, variant, attempt, port: resources };
    void resources.resolveRuntime(id, variant).then(result => {
      if (!result.ok) { if (live) setLoad({ ...identity, error: result.error.message }); return; }
      if (!live) { void resources.releaseRuntime(result.value.leaseId); return; }
      lease = result.value.leaseId;
      setLoad({ ...identity, src: result.value.uri });
    }).catch(reason => { if (live) setLoad({ ...identity, error: professionalError(reason) }); });
    return () => {
      live = false;
      setLoad(current => current?.id === id && current.variant === variant && current.attempt === attempt && current.port === resources ? undefined : current);
      if (lease) void resources.releaseRuntime(lease);
    };
  }, [active, id, variant, resources, attempt]);

  if (!asset) return <CandidateState kind="empty" title={t('先选择一项声音', 'Choose an audio asset', '音声素材を選択')}
    description={t('选择后可查看真实波形、定位播放头并调整循环区间。', 'Choose audio to inspect its waveform, seek and edit its loop.', '波形の確認、再生位置とループ区間の編集ができます。')}/>;
  const current = active && load?.id === id && load?.variant === variant && load?.attempt === attempt && load.port === resources ? load : undefined;
  const error = current?.error ?? (!resources ? t('声音资源服务不可用，当前引用已保留。', 'Audio resource service unavailable. The reference remains.', '音声リソースサービスを利用できません。参照を保持します。') : undefined);
  return <CandidateAudioLoopWorkbench {...props} name={asset.name} src={current?.src} loading={active && !error && !current?.src}
    resourceError={error} onRetry={() => retry(value => value + 1)}/>;
}
