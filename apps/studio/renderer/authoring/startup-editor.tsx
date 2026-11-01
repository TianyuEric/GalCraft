import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Image, Music, Play, Square, Film, Undo2, Redo2, Home, Clapperboard } from 'lucide-react';
import { createId, ProjectSchema, SplashPlaybackSchema, StartupClipSchema, StartupSequenceSchema, TitleMusicPlaybackSchema, TitleVideoPlaybackSchema, type Asset, type Project } from '@galcraft/contracts';
import { StartupSequenceEditor } from './startup-sequence-editor.js';
import './animation-timeline.css';
import { Button, Choice, Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { parseStartupNumber, volumePercent, type StartupNumberOptions } from './startup-input.js';
import './startup-editor.css';
import { StudioColorInput } from '../components/editor-fields/StudioColorInput.js';
import { LeasedAudioLoopEditor } from './professional/LeasedAudioLoopEditor.js';
import type { AuthoringServices } from './controller.js';

export type StartupAssetField = 'splash' | 'titleBackground' | 'titleMusic' | 'titleVideo';
export type StartupPreviewKind = 'splash' | 'home' | 'startup';
export type StartupGuiDraft = { display: Project['display']; buffers: Record<string, string>; tab: 'splash' | 'home' };
export type StartupEditorProps = {
  project: Project; locale: string; assets: Asset[]; active?: boolean; inspectorContainer?: HTMLElement;
  chooseAsset(field: StartupAssetField): Promise<string | null>;
  onChange(display: Project['display']): Promise<void>;
  preview(kind: StartupPreviewKind, host: HTMLElement, display: Project['display']): Promise<() => void>;
  onDraftChange?(dirty: boolean): void;
  guiDraft?: StartupGuiDraft | null; onGuiDraftChange?(draft: StartupGuiDraft): void;
  history?(action: 'undo' | 'redo'): Promise<void>;
  runtimeAssets?: AuthoringServices['runtimeAssets'];
};

/** This editor submits the existing Project document; it owns no parallel settings store. */
export function StartupEditor({ project, locale, assets, active = true, inspectorContainer, chooseAsset, onChange, preview, onDraftChange, guiDraft, onGuiDraftChange, history, runtimeAssets }: StartupEditorProps) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [display, setDisplay] = useState(guiDraft?.display ?? project.display);
  const current = useRef(display), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'splash' | 'home'>(guiDraft?.tab ?? 'splash'), [playing, setPlaying] = useState(false);
  const [buffers, setBuffers] = useState<Record<string, string>>(guiDraft?.buffers ?? {}), [issues, setIssues] = useState<Record<string, string>>({});
  useEffect(() => { onGuiDraftChange?.({ display, buffers, tab }); }, [display, buffers, tab, onGuiDraftChange]);
  const host = useRef<HTMLDivElement>(null), stop = useRef<(() => void) | null>(null);
  const queue = useRef(Promise.resolve()), localDirty = useRef(!!guiDraft && JSON.stringify(guiDraft.display) !== JSON.stringify(project.display)), previewGeneration = useRef(0);
  const mounted = useRef(true), activeRef = useRef(active), pendingInputs = useRef(new Set<string>(Object.keys(guiDraft?.buffers ?? {})));
  activeRef.current = active;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; previewGeneration.current++; stop.current?.(); }; }, []);
  useEffect(() => { if (!active) { previewGeneration.current++; stop.current?.(); stop.current = null; setPlaying(false); } }, [active]);
  useEffect(() => {
    if (!localDirty.current) { current.current = project.display; setDisplay(project.display); }
  }, [project.display]);
  const asset = (id: string | null) => assets.find(item => item.id === id);
  const duration = (id: string | null) => { const item = asset(id); return item?.variants.find(version => version.id === item.activeVariantId)?.metadata.durationSec; };
  const stopPreview = () => { previewGeneration.current++; stop.current?.(); stop.current = null; setPlaying(false); };
  const commit = (patch: Partial<Project['display']>) => {
    const next = { ...current.current, ...patch };
    const parsed = ProjectSchema.shape.display.safeParse(next);
    if (!parsed.success) { setError(t('播放设置无效，请检查起点、终点及音量。', 'Check playback ranges and volume.', '再生範囲と音量を確認してください。')); return Promise.resolve(false); }
    current.current = parsed.data; setDisplay(parsed.data); localDirty.current = true; onDraftChange?.(true);
    stopPreview(); setBusy(true); setError('');
    const task = queue.current.catch(() => {}).then(async () => {
      try {
        await onChange(parsed.data);
        if (!mounted.current) return true;
        if (current.current === parsed.data) { localDirty.current = false; onDraftChange?.(pendingInputs.current.size > 0); }
        return true;
      } catch (reason) {
        if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
        return false;
      } finally { if (mounted.current && current.current === parsed.data) setBusy(false); }
    });
    queue.current = task.then(() => {}); return task;
  };
  const splash = SplashPlaybackSchema.parse(display.splashPlayback ?? {});
  const music = TitleMusicPlaybackSchema.parse(display.titleMusicPlayback ?? {});
  const musicLoop = useMemo(() => ({ loopStartSec: music.loopStartSec, loopEndSec: music.loopEndSec }), [music.loopStartSec, music.loopEndSec]);
  const video = TitleVideoPlaybackSchema.parse(display.titleVideoPlayback ?? {});
  const patchSplash = (patch: Partial<typeof splash>) => commit({ splashPlayback: { ...splash, ...patch } });
  const patchMusic = (patch: Partial<typeof music>) => commit({ titleMusicPlayback: { ...music, ...patch } });
  const patchVideo = (patch: Partial<typeof video>) => commit({ titleVideoPlayback: { ...video, ...patch } });
  const pick = async (field: StartupAssetField) => {
    setError('');
    try { const id = await chooseAsset(field); if (id !== null) commit({ [field]: id }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const number = (key: string, label: string, value: number | null, apply: (value: number | null) => void, options: StartupNumberOptions = {}) => <Field label={label} error={issues[key]}>
    <Input type="number" aria-label={label} min={0} max={options.max} step={options.step ?? 1} value={buffers[key] ?? (value === null ? '' : String(value))}
      placeholder={options.nullable ? t('留空使用完整媒体', 'Leave empty for full media', '空欄でメディア全体を使用') : String(value ?? 0)}
      onChange={event => { pendingInputs.current.add(key); setBuffers(previous => ({ ...previous, [key]: event.target.value })); onDraftChange?.(true); }}
      onBlur={event => {
        const next = parseStartupNumber(event.target.value, options);
        if (next === undefined) { setIssues(previous => ({ ...previous, [key]: t('请填写有效范围内的数值。', 'Enter a number within the valid range.', '有効範囲内の数値を入力してください。') })); return; }
        setIssues(previous => { const result = { ...previous }; delete result[key]; return result; });
        setBuffers(previous => { const result = { ...previous }; delete result[key]; return result; });
        pendingInputs.current.delete(key);
        if (next !== value) apply(next);
        else onDraftChange?.(localDirty.current || pendingInputs.current.size > 0);
      }} />
  </Field>;
  const fit = (value: 'contain' | 'cover' | 'fill', apply: (value: 'contain' | 'cover' | 'fill') => void) => <Field label={t('适配方式', 'Fit', '表示方法')}><Choice label={t('适配方式', 'Fit', '表示方法')} value={value} onChange={value => apply(value as 'contain' | 'cover' | 'fill')} options={[
    { value: 'contain', label: t('完整显示', 'Contain', '全体を表示') }, { value: 'cover', label: t('填满并裁切', 'Cover', '領域を埋める') }, { value: 'fill', label: t('拉伸', 'Stretch', '引き伸ばし') },
  ]} /></Field>;
  const resource = (field: StartupAssetField, label: string, icon: ReactNode) => <section className="startup-resource"><h3>{icon}{label}</h3><p>{display[field] ? asset(display[field])?.name ?? t('引用已失效', 'Missing resource', 'リソースが見つかりません') : t('尚未选择', 'None selected', '未選択')}
    {duration(display[field]) !== undefined && <small> · {duration(display[field])!.toFixed(2)} s</small>}</p><div className="gc-actions"><Button onClick={() => void pick(field)}>{t('选择素材', 'Select asset', '素材を選択')}</Button><Button tone="quiet" disabled={!display[field]} onClick={() => commit({ [field]: null })}>{t('移除引用', 'Remove reference', '参照を解除')}</Button></div></section>;
  const startPreview = async (kind: StartupPreviewKind, override?: Project['display']) => {
    await queue.current;
    if (!activeRef.current) return;
    if (localDirty.current || pendingInputs.current.size > 0 || !host.current) {
      setError(t('请先修复并应用当前输入，再预览。', 'Resolve the current input before previewing.', '現在の入力を修正・適用してからプレビューしてください。')); return;
    }
    stopPreview(); const generation = previewGeneration.current; setError('');
    try { const dispose = await preview(kind, host.current, override ?? current.current); if (generation !== previewGeneration.current || !mounted.current) dispose(); else { stop.current = dispose; setPlaying(true); } }
    catch (reason) { if (mounted.current && generation === previewGeneration.current) setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const placeInspector = (node: ReactNode) => inspectorContainer ? createPortal(node, inspectorContainer) : node;
  const replay = async (action: 'undo' | 'redo') => { try { await queue.current; if (pendingInputs.current.size || localDirty.current) throw new Error(t('请先应用当前输入。', 'Apply the current input first.', '現在の入力を適用してください。')); stopPreview(); await history?.(action); } catch (reason) { setError(String(reason)); } };
  return <section className="startup-editor" data-inspector-external={!!inspectorContainer} aria-label={t('启动与主页', 'Startup and home', '起動とホーム')}>
    <header className="startup-heading"><h2>{t('启动与主页', 'Startup and home', '起動とホーム')}</h2><div className="gc-actions">
      <Button aria-pressed={tab === 'splash'} onClick={() => { setTab('splash'); stopPreview(); }}><Clapperboard size={16}/>{t('开屏', 'Splash', '起動画面')}</Button>
      <Button aria-pressed={tab === 'home'} onClick={() => { setTab('home'); stopPreview(); }}><Home size={16}/>{t('主页', 'Home', 'ホーム')}</Button>
      {history && <><Button disabled={busy} onClick={() => void replay('undo')}><Undo2 size={16}/>{t('撤销', 'Undo', '元に戻す')}</Button><Button disabled={busy} onClick={() => void replay('redo')}><Redo2 size={16}/>{t('重做', 'Redo', 'やり直す')}</Button></>}
    </div></header>
    {error && <div role="alert" className="startup-error"><span>{error}</span>{localDirty.current && <Button onClick={() => commit({})}>{t('重试应用', 'Retry applying', '適用を再試行')}</Button>}</div>}
    <div className="startup-layout"><div className="startup-stage"><div className="gc-actions startup-preview-tools">
      <Button disabled={busy || !display.splash && !display.startupSequence} onClick={() => void startPreview('splash')}><Play/>{t('预览开屏', 'Preview splash', '起動画面をプレビュー')}</Button>
      <Button disabled={busy} onClick={() => void startPreview('home')}><Play/>{t('预览主页', 'Preview home', 'ホームをプレビュー')}</Button>
      <Button disabled={busy} onClick={() => void startPreview('startup')}><Play/>{t('从启动预览', 'Preview startup', '起動からプレビュー')}</Button>
      <Button disabled={!playing} tone="quiet" onClick={stopPreview}><Square/>{t('停止试听', 'Stop preview', 'プレビューを停止')}</Button>
    </div><div ref={host} className="startup-preview" style={{ aspectRatio: project.canvas.width + '/' + project.canvas.height }}/>
      {!playing && <p className="startup-help">{t('点击预览后使用真实 Player；编辑器不会自动发声。无开屏时直接进入主页。', 'Preview uses the real Player. Sound starts only after you click. No splash goes directly home.', '実際の Player でプレビューします。クリック後にのみ音声を再生し、起動画面がなければホームへ進みます。')}</p>}
      {tab === 'home' && display.titleMusic && music.loop && runtimeAssets && <LeasedAudioLoopEditor asset={asset(display.titleMusic)} resources={runtimeAssets} locale={locale} active={active && !playing} readonly={busy} value={musicLoop} onDraftChange={dirty => { if (dirty) pendingInputs.current.add('music.loop-workbench'); else pendingInputs.current.delete('music.loop-workbench'); onDraftChange?.(localDirty.current || pendingInputs.current.size > 0); }}
        onChange={async next => { const latest = TitleMusicPlaybackSchema.parse(current.current.titleMusicPlayback ?? {}); const applied = await commit({ titleMusicPlayback: { ...latest, loopStartSec: next.loopStartSec ?? 0, loopEndSec: next.loopEndSec } }); if (!applied) throw new Error(t('循环区间尚未应用，请检查当前输入后重试。', 'Loop range was not applied. Check the current input and retry.', 'ループ区間が未適用です。入力を確認して再試行してください。')); }}/ >}
      {tab === 'splash' && (display.startupSequence ? <StartupSequenceEditor sequence={display.startupSequence} locale={locale} assets={assets} chooseAsset={() => chooseAsset('splash')}
        onChange={startupSequence => commit({ startupSequence })} onDraftChange={onDraftChange}
        preview={clip => void startPreview('splash', { ...current.current, startupSequence: { ...display.startupSequence!, revealMs: 0, clips: [{ ...clip, startMs: 0 }] } })}/>
        : <Button onClick={() => commit({ startupSequence: StartupSequenceSchema.parse({ clips: [StartupClipSchema.parse({ id: createId(), kind: 'text', name: t('作者说明', 'Author notice', '作者の案内'), text: { [locale]: project.name } })] }) })}>{t('编排原生开屏序列', 'Create native startup sequence', '起動シーケンスを作成')}</Button>)}
    </div>{placeInspector(<aside className="startup-inspector">
      {tab === 'splash' ? display.startupSequence ? <p className="startup-help">{t('在中央时间轴选择并编辑片段。出现时刻允许重叠；每段淡入、停留、淡出独立。', 'Select a clip in the timeline. Start times may overlap; fades and hold are independent.', '中央でクリップを選択。時刻の重なりと個別フェードを設定できます。')}</p> : <>
        {resource('splash', t('开屏图片或视频', 'Splash image or video', '起動画面の画像・動画'), <Image/>)}
        {asset(display.splash)?.kind !== 'video' ? <div className="startup-parameters">
          {number('splash.duration', t('停留时长 · ms', 'Hold duration · ms', '表示時間・ms'), splash.durationMs, value => patchSplash({ durationMs: value! }))}
          {number('splash.fade-in', t('淡入 · ms', 'Fade in · ms', 'フェードイン・ms'), splash.fadeInMs, value => patchSplash({ fadeInMs: value! }))}
          {number('splash.fade-out', t('淡出 · ms', 'Fade out · ms', 'フェードアウト・ms'), splash.fadeOutMs, value => patchSplash({ fadeOutMs: value! }))}
        </div> : <div className="startup-parameters">
          {number('splash.start', t('播放起点 · s', 'Start · s', '再生開始・s'), splash.startSec, value => patchSplash({ startSec: value! }), { step: .01, end: splash.endSec, total: duration(display.splash), beforeTotal: true })}
          {number('splash.end', t('播放终点 · s', 'End · s', '再生終了・s'), splash.endSec, value => patchSplash({ endSec: value }), { step: .01, nullable: true, start: splash.startSec, total: duration(display.splash) })}
          {number('splash.volume', t('视频音量 · %', 'Video volume · %', '動画音量・%'), volumePercent(splash.volume), value => patchSplash({ volume: value! / 100 }), { max: 100, step: .01 })}
        </div>}
        {fit(splash.fit, value => patchSplash({ fit: value }))}
        <StudioColorInput onDraftChange={active => onDraftChange?.(active || localDirty.current || pendingInputs.current.size > 0)} label={t('背景颜色', 'Background color', '背景色')} value={splash.background} locale={locale} onChange={background => patchSplash({ background })}/>
        <label className="startup-check"><input type="checkbox" checked={splash.allowSkip} onChange={event => patchSplash({ allowSkip: event.target.checked })}/>{t('允许跳过开屏', 'Allow skipping splash', '起動画面のスキップを許可')}</label>
      </> : <>
        {resource('titleBackground', t('主页背景', 'Home background', 'ホーム背景'), <Image/>)}
        {resource('titleMusic', t('主页音乐', 'Home music', 'ホーム音楽'), <Music/>)}
        {display.titleMusic && <div className="startup-parameters">
          {number('music.start', t('播放起点 · s', 'Start · s', '再生開始・s'), music.startSec, value => patchMusic({ startSec: value! }), { step: .01, total: duration(display.titleMusic), beforeTotal: true })}
          {number('music.volume', t('音乐音量 · %', 'Music volume · %', '音楽音量・%'), volumePercent(music.volume), value => patchMusic({ volume: value! / 100 }), { max: 100, step: .01 })}
          {number('music.fade', t('进入淡入 · ms', 'Fade in · ms', 'フェードイン・ms'), music.fadeInMs, value => patchMusic({ fadeInMs: value! }))}
          <label className="startup-check"><input type="checkbox" checked={music.loop} onChange={event => patchMusic({ loop: event.target.checked })}/>{t('循环播放', 'Loop', 'ループ再生')}</label>
          {music.loop && <>
            {number('music.loop-start', t('循环起点 · s', 'Loop start · s', 'ループ開始・s'), music.loopStartSec, value => patchMusic({ loopStartSec: value! }), { step: .01, end: music.loopEndSec, total: duration(display.titleMusic), beforeTotal: true })}
            {number('music.loop-end', t('循环终点 · s', 'Loop end · s', 'ループ終了・s'), music.loopEndSec, value => patchMusic({ loopEndSec: value }), { step: .01, nullable: true, start: music.loopStartSec, total: duration(display.titleMusic) })}
          </>}
        </div>}
        {resource('titleVideo', t('主页视频', 'Home video', 'ホーム動画'), <Film/>)}
        {display.titleVideo && <div className="startup-parameters">
          {number('video.start', t('播放起点 · s', 'Start · s', '再生開始・s'), video.startSec, value => patchVideo({ startSec: value! }), { step: .01, end: video.endSec, total: duration(display.titleVideo), beforeTotal: true })}
          {number('video.end', t('播放终点 · s', 'End · s', '再生終了・s'), video.endSec, value => patchVideo({ endSec: value }), { step: .01, nullable: true, start: video.startSec, total: duration(display.titleVideo) })}
          {number('video.volume', t('视频音量 · %', 'Video volume · %', '動画音量・%'), volumePercent(video.volume), value => patchVideo({ volume: value! / 100 }), { max: 100, step: .01 })}
          {fit(video.fit, value => patchVideo({ fit: value }))}
          <label className="startup-check"><input type="checkbox" checked={video.loop} onChange={event => patchVideo({ loop: event.target.checked })}/>{t('循环视频', 'Loop video', '動画をループ再生')}</label>
          {video.volume > 0 && display.titleMusic && <p className="startup-help">{t('视频音轨与主页音乐同时播放，请试听确认。', 'Video sound and home music play together. Preview to check.', '動画音声とホーム音楽が同時に再生されます。プレビューで確認してください。')}</p>}
        </div>}
      </>}
      <p role="status" className="startup-help">{busy ? t('正在应用设置…', 'Applying settings…', '設定を適用中…') : localDirty.current || Object.keys(buffers).length ? t('输入尚未应用', 'Input has not been applied', '入力は未適用です') : t('有效修改已进入作品，保存作品后落盘。', 'Changes are in the project. Save the project to write them to disk.', '変更は作品に適用済みです。作品を保存してディスクに書き込みます。')}</p>
    </aside>)}</div>
  </section>;
}
