import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Image, Music, Play, Square, Film, Undo2, Redo2, Home, Clapperboard } from 'lucide-react';
import { createId, ProjectSchema, SplashPlaybackSchema, StartupClipSchema, StartupSequenceSchema, TitleMusicPlaybackSchema, TitleVideoPlaybackSchema, type Asset, type Project } from '@galcraft/contracts';
import { StartupColorInput, StartupSequenceEditor, type StartupSequenceDraft, type StartupSequenceInput } from './startup-sequence-editor.js';
import './animation-timeline.css';
import { Button, Choice, Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { parseStartupNumber, volumePercent, type StartupNumberOptions } from './startup-input.js';
import './startup-editor.css';
import type { ColorInputDraft } from '../components/editor-fields/StudioColorField.js';
import { LeasedAudioLoopEditor } from './professional/LeasedAudioLoopEditor.js';
import type { AuthoringServices } from './controller.js';

export type StartupAssetField = 'splash' | 'titleBackground' | 'titleMusic' | 'titleVideo';
export type StartupPreviewKind = 'splash' | 'home' | 'startup';
export type StartupGuiDraft = { display: Project['display']; displayPending?: boolean; buffers: Record<string, string>; tab: 'splash' | 'home';
  sequence?: StartupSequenceDraft; colors?: Record<string, ColorInputDraft> };
export type StartupEditorInput = { applyCurrent(): Promise<boolean>; isComposing(): boolean };
const hasSequenceInput = (draft?: StartupSequenceDraft) =>
  !!draft && (Object.keys(draft.buffers).length > 0 || Object.keys(draft.colors).length > 0);
export const hasStartupFieldInput = (draft: StartupGuiDraft | null) =>
  !!draft && (Object.keys(draft.buffers).length > 0 || Object.keys(draft.colors ?? {}).length > 0 || hasSequenceInput(draft.sequence));
export type StartupEditorProps = {
  project: Project; locale: string; assets: Asset[]; active?: boolean; inspectorContainer?: HTMLElement;
  chooseAsset(field: StartupAssetField): Promise<string | null>;
  onChange(display: Project['display']): Promise<void>;
  preview(kind: StartupPreviewKind, host: HTMLElement, display: Project['display']): Promise<() => void>;
  onDraftChange?(dirty: boolean): void;
  registerInput?(input: StartupEditorInput | null): void;
  guiDraft?: StartupGuiDraft | null; onGuiDraftChange?(draft: StartupGuiDraft): void;
  history?(action: 'undo' | 'redo'): Promise<void>;
  runtimeAssets?: AuthoringServices['runtimeAssets'];
};

function focusStartupField(element: HTMLElement | null | undefined) {
  const closedGroup = 'details:is(.startup-advanced, .gc-studio-document-tools):not([open])';
  let collapsed = element?.closest<HTMLDetailsElement>(closedGroup);
  while (collapsed) {
    collapsed.open = true;
    collapsed = collapsed.parentElement?.closest<HTMLDetailsElement>(closedGroup);
  }
  element?.focus();
}

/** This editor submits the existing Project document; it owns no parallel settings store. */
export function StartupEditor({ project, locale, assets, active = true, inspectorContainer, chooseAsset, onChange, preview, onDraftChange, registerInput, guiDraft, onGuiDraftChange, history, runtimeAssets }: StartupEditorProps) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [display, setDisplay] = useState(guiDraft?.displayPending === false ? project.display : guiDraft?.display ?? project.display);
  const current = useRef(display), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'splash' | 'home'>(guiDraft?.tab ?? 'splash'), [playing, setPlaying] = useState(false);
  const [buffers, setBuffers] = useState<Record<string, string>>(guiDraft?.buffers ?? {}), [issues, setIssues] = useState<Record<string, string>>({});
  const host = useRef<HTMLDivElement>(null), stop = useRef<(() => void) | null>(null);
  const queue = useRef(Promise.resolve()), localDirty = useRef(JSON.stringify(display) !== JSON.stringify(project.display)), previewGeneration = useRef(0);
  const sequenceDraft = useRef(guiDraft?.sequence);
  const mounted = useRef(true), activeRef = useRef(active), pendingInputs = useRef(new Set<string>([
    ...Object.keys(guiDraft?.buffers ?? {}), ...Object.keys(guiDraft?.colors ?? {}),
    ...(hasSequenceInput(guiDraft?.sequence) ? ['startup-sequence'] : []),
  ]));
  const root = useRef<HTMLElement>(null), composing = useRef(false), sequenceInput = useRef<StartupSequenceInput | null>(null), bufferValues = useRef(buffers);
  const numberInputs = useRef(new Map<string, { value: number | null; options: StartupNumberOptions; apply(value: number | null): Promise<boolean>; element: HTMLInputElement | null }>());
  const inspector = useRef<HTMLElement>(null), audioLoop = useRef<HTMLDivElement>(null);
  const colorDrafts = useRef(new Map(Object.entries(guiDraft?.colors ?? {})));
  const pendingFocus = useRef<(() => HTMLElement | null | undefined) | undefined>(undefined);
  const applyingInputs = useRef<Promise<boolean> | null>(null);
  const report = () => onDraftChange?.(localDirty.current || pendingInputs.current.size > 0);
  const childPending = (key: string, dirty: boolean) => { if (dirty) pendingInputs.current.add(key); else pendingInputs.current.delete(key); report(); };
  useLayoutEffect(() => {
    const locate = pendingFocus.current;
    pendingFocus.current = undefined;
    if (locate) focusStartupField(locate());
  });
  const capture = () => onGuiDraftChange?.({ display: current.current, displayPending: localDirty.current, buffers: bufferValues.current, tab,
    sequence: sequenceDraft.current, colors: Object.fromEntries(colorDrafts.current) });
  useEffect(capture, [display, buffers, tab, busy, onGuiDraftChange]);
  activeRef.current = active;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; previewGeneration.current++; stop.current?.(); }; }, []);
  useEffect(() => { if (!active) { previewGeneration.current++; stop.current?.(); stop.current = null; setPlaying(false); } }, [active]);
  useEffect(() => {
    if (!localDirty.current) { current.current = project.display; setDisplay(project.display); }
  }, [project.display]);
  const asset = (id: string | null) => assets.find(item => item.id === id);
  const duration = (id: string | null) => { const item = asset(id); return item?.variants.find(version => version.id === item.activeVariantId)?.metadata.durationSec; };
  const stopPreview = () => { previewGeneration.current++; stop.current?.(); stop.current = null; setPlaying(false); };
  const revealInput = (stage: typeof tab, locate?: () => HTMLElement | null | undefined) => {
    pendingFocus.current = locate;
    if (tab === stage) { if (locate) focusStartupField(locate()); return; }
    setTab(stage); stopPreview();
  };
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
  const patchSplash = (patch: Partial<typeof splash>) => commit({ splashPlayback: { ...SplashPlaybackSchema.parse(current.current.splashPlayback ?? {}), ...patch } });
  const patchMusic = (patch: Partial<typeof music>) => commit({ titleMusicPlayback: { ...TitleMusicPlaybackSchema.parse(current.current.titleMusicPlayback ?? {}), ...patch } });
  const patchVideo = (patch: Partial<typeof video>) => commit({ titleVideoPlayback: { ...TitleVideoPlaybackSchema.parse(current.current.titleVideoPlayback ?? {}), ...patch } });
  const pick = async (field: StartupAssetField) => {
    setError('');
    try { const id = await chooseAsset(field); if (id !== null) commit({ [field]: id }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const validateNumber = (key: string, raw: string) => {
    const input = numberInputs.current.get(key), next = input && parseStartupNumber(raw, input.options);
    if (next === undefined) {
      setIssues(previous => ({ ...previous, [key]: t('请填写有效范围内的数值。', 'Enter a number within the valid range.', '有効範囲内の数値を入力してください。') }));
      return undefined;
    }
    return next;
  };
  const confirmNumber = async (key: string, raw: string) => {
    if (composing.current) return false;
    const next = validateNumber(key, raw); if (next === undefined) return false;
    const input = numberInputs.current.get(key)!;
    if (next !== input.value && !await input.apply(next)) return false;
    setIssues(previous => { const result = { ...previous }; delete result[key]; return result; });
    if (bufferValues.current[key] === raw) {
      const remaining = { ...bufferValues.current }; delete remaining[key]; bufferValues.current = remaining; setBuffers(remaining); pendingInputs.current.delete(key);
    }
    report(); return true;
  };
  const applyCurrent = () => {
    if (composing.current || sequenceInput.current?.isComposing()) return Promise.resolve(false);
    if (applyingInputs.current) return applyingInputs.current;
    const task = Promise.resolve().then(applyInputs).finally(() => { applyingInputs.current = null; });
    applyingInputs.current = task; return task;
  };
  const applyInputs = async () => {
    if (composing.current || sequenceInput.current?.isComposing()) return false;
    const retry = localDirty.current && !busy;
    await queue.current;
    if (retry && localDirty.current && !await commit({})) return false;
    const entries = Object.entries(bufferValues.current);
    const revealNumber = (key: string) => {
      revealInput(key.startsWith('splash.') ? 'splash' : 'home', () => numberInputs.current.get(key)?.element);
      return false;
    };
    for (const [key, raw] of entries) if (validateNumber(key, raw) === undefined) return revealNumber(key);
    for (const [key, raw] of entries) if (!await confirmNumber(key, raw)) return revealNumber(key);
    if (sequenceInput.current && !await sequenceInput.current.applyCurrent()) return false;
    if (pendingInputs.current.has('splash.background')) {
      revealInput('splash', () => inspector.current?.querySelector<HTMLElement>('.startup-advanced .candidate-color-trigger'));
      return false;
    }
    if (pendingInputs.current.has('music.loop-workbench')) {
      revealInput('home', () => audioLoop.current?.querySelector<HTMLElement>('[data-local-history="true"]'));
      return false;
    }
    await queue.current;
    return !composing.current && !localDirty.current && pendingInputs.current.size === 0;
  };
  useEffect(() => { registerInput?.({ applyCurrent, isComposing: () => composing.current || !!sequenceInput.current?.isComposing() }); return () => registerInput?.(null); });
  const number = (key: string, label: string, value: number | null, apply: (value: number | null) => Promise<boolean>, options: StartupNumberOptions = {}) => {
    const input = { value, options, apply, element: null as HTMLInputElement | null }; numberInputs.current.set(key, input);
    return <Field label={label} error={issues[key]}>
    <Input ref={element => { input.element = element as HTMLInputElement | null; }} type="number" aria-label={label} min={0} max={options.max} step={options.step ?? 1} value={buffers[key] ?? (value === null ? '' : String(value))}
      placeholder={options.nullable ? t('留空使用完整媒体', 'Leave empty for full media', '空欄でメディア全体を使用') : String(value ?? 0)}
      onChange={event => { pendingInputs.current.add(key); bufferValues.current = { ...bufferValues.current, [key]: event.target.value }; setBuffers(bufferValues.current); report(); }}
      onBlur={event => { if (key in bufferValues.current) void confirmNumber(key, event.target.value); }} />
  </Field>; };
  // Keep restored buffers addressable when their tab is not currently visible.
  const numbers = {
    'splash.duration': number('splash.duration', t('停留时长 · ms', 'Hold duration · ms', '表示時間・ms'), splash.durationMs, value => patchSplash({ durationMs: value! })),
    'splash.fade-in': number('splash.fade-in', t('淡入 · ms', 'Fade in · ms', 'フェードイン・ms'), splash.fadeInMs, value => patchSplash({ fadeInMs: value! })),
    'splash.fade-out': number('splash.fade-out', t('淡出 · ms', 'Fade out · ms', 'フェードアウト・ms'), splash.fadeOutMs, value => patchSplash({ fadeOutMs: value! })),
    'splash.start': number('splash.start', t('播放起点 · s', 'Start · s', '再生開始・s'), splash.startSec, value => patchSplash({ startSec: value! }), { step: .01, end: splash.endSec, total: duration(display.splash), beforeTotal: true }),
    'splash.end': number('splash.end', t('播放终点 · s', 'End · s', '再生終了・s'), splash.endSec, value => patchSplash({ endSec: value }), { step: .01, nullable: true, start: splash.startSec, total: duration(display.splash) }),
    'splash.volume': number('splash.volume', t('视频音量 · %', 'Video volume · %', '動画音量・%'), volumePercent(splash.volume), value => patchSplash({ volume: value! / 100 }), { max: 100, step: .01 }),
    'music.start': number('music.start', t('播放起点 · s', 'Start · s', '再生開始・s'), music.startSec, value => patchMusic({ startSec: value! }), { step: .01, total: duration(display.titleMusic), beforeTotal: true }),
    'music.volume': number('music.volume', t('音乐音量 · %', 'Music volume · %', '音楽音量・%'), volumePercent(music.volume), value => patchMusic({ volume: value! / 100 }), { max: 100, step: .01 }),
    'music.fade': number('music.fade', t('进入淡入 · ms', 'Fade in · ms', 'フェードイン・ms'), music.fadeInMs, value => patchMusic({ fadeInMs: value! })),
    'music.loop-start': number('music.loop-start', t('循环起点 · s', 'Loop start · s', 'ループ開始・s'), music.loopStartSec, value => patchMusic({ loopStartSec: value! }), { step: .01, end: music.loopEndSec, total: duration(display.titleMusic), beforeTotal: true }),
    'music.loop-end': number('music.loop-end', t('循环终点 · s', 'Loop end · s', 'ループ終了・s'), music.loopEndSec, value => patchMusic({ loopEndSec: value }), { step: .01, nullable: true, start: music.loopStartSec, total: duration(display.titleMusic) }),
    'video.start': number('video.start', t('播放起点 · s', 'Start · s', '再生開始・s'), video.startSec, value => patchVideo({ startSec: value! }), { step: .01, end: video.endSec, total: duration(display.titleVideo), beforeTotal: true }),
    'video.end': number('video.end', t('播放终点 · s', 'End · s', '再生終了・s'), video.endSec, value => patchVideo({ endSec: value }), { step: .01, nullable: true, start: video.startSec, total: duration(display.titleVideo) }),
    'video.volume': number('video.volume', t('视频音量 · %', 'Video volume · %', '動画音量・%'), volumePercent(video.volume), value => patchVideo({ volume: value! / 100 }), { max: 100, step: .01 }),
  };
  const fit = (value: 'contain' | 'cover' | 'fill', apply: (value: 'contain' | 'cover' | 'fill') => void) => <Field label={t('适配方式', 'Fit', '表示方法')}><Choice label={t('适配方式', 'Fit', '表示方法')} value={value} onChange={value => apply(value as 'contain' | 'cover' | 'fill')} options={[
    { value: 'contain', label: t('完整显示', 'Contain', '全体を表示') }, { value: 'cover', label: t('填满并裁切', 'Cover', '領域を埋める') }, { value: 'fill', label: t('拉伸', 'Stretch', '引き伸ばし') },
  ]} /></Field>;
  const resource = (field: StartupAssetField, label: string, icon: ReactNode, children?: ReactNode) => <section className="startup-resource" aria-label={label}>
    <h3>{icon}{label}</h3>
    <p>{display[field] ? asset(display[field])?.name ?? t('引用已失效', 'Missing resource', 'リソースが見つかりません') : t('尚未选择', 'None selected', '未選択')}
      {duration(display[field]) !== undefined && <small> · {duration(display[field])!.toFixed(2)} s</small>}</p>
    <div className="gc-actions"><Button onClick={() => void pick(field)}>{t('选择素材', 'Select asset', '素材を選択')}</Button>{display[field] && <Button tone="quiet" onClick={() => commit({ [field]: null })}>{t('移除引用', 'Remove reference', '参照を解除')}</Button>}</div>
    {children}
  </section>;
  const advanced = (label: string, children: ReactNode) => <details className="startup-advanced">
    <summary>{label}</summary><div className="startup-parameters">{children}</div>
  </details>;
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
  return <section ref={root} className="startup-editor" data-inspector-external={!!inspectorContainer} aria-label={t('启动与主页', 'Startup and home', '起動とホーム')}
    onCompositionStartCapture={() => { composing.current = true; }} onCompositionEndCapture={() => { composing.current = false; }}>
    <header className="startup-heading">
      <h2>{t('启动与主页', 'Startup and home', '起動とホーム')}</h2>
      <div className="startup-heading-tools">
        <div className="gc-actions startup-route" role="group" aria-label={t('启动阶段', 'Startup stage', '起動段階')}>
          <Button aria-pressed={tab === 'splash'} onClick={() => { setTab('splash'); stopPreview(); }}><Clapperboard size={16}/>{t('开屏', 'Splash', '起動画面')}</Button>
          <Button aria-pressed={tab === 'home'} onClick={() => { setTab('home'); stopPreview(); }}><Home size={16}/>{t('主页', 'Home', 'ホーム')}</Button>
        </div>
        {history && <div className="gc-actions">
          <Button tone="quiet" disabled={busy} onClick={() => void replay('undo')}><Undo2 size={16}/>{t('撤销', 'Undo', '元に戻す')}</Button>
          <Button tone="quiet" disabled={busy} onClick={() => void replay('redo')}><Redo2 size={16}/>{t('重做', 'Redo', 'やり直す')}</Button>
        </div>}
      </div>
    </header>
    {error && <div role="alert" className="startup-error"><span>{error}</span>{localDirty.current && <Button onClick={() => commit({})}>{t('重试应用', 'Retry applying', '適用を再試行')}</Button>}</div>}
    <div className="startup-layout"><div className="startup-stage">
      <section className="startup-playback" aria-label={t('播放预览', 'Playback preview', '再生プレビュー')}>
        <div className="gc-actions startup-preview-tools">
          <Button tone={tab === 'splash' ? 'primary' : 'quiet'} disabled={busy || !display.splash && !display.startupSequence} onClick={() => void startPreview('splash')}><Play size={16}/>{t('预览开屏', 'Preview splash', '起動画面をプレビュー')}</Button>
          <Button tone={tab === 'home' ? 'primary' : 'quiet'} disabled={busy} onClick={() => void startPreview('home')}><Play size={16}/>{t('预览主页', 'Preview home', 'ホームをプレビュー')}</Button>
          <Button tone="quiet" disabled={busy} onClick={() => void startPreview('startup')}><Play size={16}/>{t('从启动预览', 'Preview startup', '起動からプレビュー')}</Button>
          <Button disabled={!playing} tone="quiet" onClick={stopPreview}><Square size={16}/>{t('停止试听', 'Stop preview', 'プレビューを停止')}</Button>
        </div>
        <div className="startup-preview-frame" style={{ '--startup-canvas-ratio': project.canvas.width / project.canvas.height } as CSSProperties}>
          <div ref={host} className="startup-preview"/>
          {!playing && <div className="startup-preview-idle">
            <Play size={20} aria-hidden="true"/>
            <p>{t('手动预览时播放声音', 'Sound plays when you start a preview', 'プレビュー開始時に音声を再生')}</p>
          </div>}
        </div>
        {!display.splash && !display.startupSequence && <p className="startup-help">{t('无开屏时，启动后直接进入主页。', 'Startup goes directly home when there is no splash.', '起動画面がなければホームへ進みます。')}</p>}
      </section>
      {(tab === 'home' || pendingInputs.current.has('music.loop-workbench')) && display.titleMusic && music.loop && runtimeAssets && <div ref={audioLoop} hidden={tab !== 'home'} style={tab === 'home' ? { display: 'contents' } : undefined}>
        <LeasedAudioLoopEditor asset={asset(display.titleMusic)} resources={runtimeAssets} locale={locale} active={active && tab === 'home' && !playing} readonly={busy} value={musicLoop} onDraftChange={dirty => childPending('music.loop-workbench', dirty)}
          onChange={async next => { const latest = TitleMusicPlaybackSchema.parse(current.current.titleMusicPlayback ?? {}); const applied = await commit({ titleMusicPlayback: { ...latest, loopStartSec: next.loopStartSec ?? 0, loopEndSec: next.loopEndSec } }); if (!applied) throw new Error(t('循环区间尚未应用，请检查当前输入后重试。', 'Loop range was not applied. Check the current input and retry.', 'ループ区間が未適用です。入力を確認して再試行してください。')); }}/>
      </div>}
      {display.startupSequence ? <StartupSequenceEditor sequence={display.startupSequence} locale={locale} assets={assets} visible={tab === 'splash'} active={active && tab === 'splash'} chooseAsset={() => chooseAsset('splash')}
        guiDraft={sequenceDraft.current} onGuiDraftChange={draft => { sequenceDraft.current = draft; capture(); }}
        onChange={startupSequence => commit({ startupSequence })} onDraftChange={dirty => childPending('startup-sequence', dirty)} registerInput={input => { sequenceInput.current = input; }} revealInput={() => revealInput('splash')}
        preview={clip => void startPreview('splash', { ...current.current, startupSequence: { ...display.startupSequence!, revealMs: 0, clips: [{ ...clip, startMs: 0 }] } })}/>
        : tab === 'splash' && <Button onClick={() => {
          if (pendingInputs.current.has('splash.background')) return;
          void commit({ startupSequence: StartupSequenceSchema.parse({ clips: [StartupClipSchema.parse({ id: createId(), kind: 'text', name: t('作者说明', 'Author notice', '作者の案内'), text: { [locale]: project.name } })] }) });
        }}>{t('编排原生开屏序列', 'Create native startup sequence', '起動シーケンスを作成')}</Button>}
    </div>{placeInspector(<aside ref={inspector} className="startup-inspector" data-stage={tab} aria-label={tab === 'splash' ? t('开屏设置', 'Splash settings', '起動画面設定') : t('主页设置', 'Home settings', 'ホーム設定')}>
      {tab === 'splash' ? display.startupSequence ? <p className="startup-help">{t('在中央时间轴选择并编辑片段。出现时刻允许重叠；每段淡入、停留、淡出独立。', 'Select a clip in the timeline. Start times may overlap; fades and hold are independent.', '中央でクリップを選択。時刻の重なりと個別フェードを設定できます。')}</p> : <>
        {resource('splash', t('开屏图片或视频', 'Splash image or video', '起動画面の画像・動画'), <Image size={16}/>, <>
          {asset(display.splash)?.kind === 'video' ? numbers['splash.volume'] : numbers['splash.duration']}
          <label className="startup-check"><input type="checkbox" checked={splash.allowSkip} onChange={event => patchSplash({ allowSkip: event.target.checked })}/>{t('允许跳过开屏', 'Allow skipping splash', '起動画面のスキップを許可')}</label>
          {advanced(t('播放与显示细节', 'Playback and display details', '再生と表示の詳細'), <>
            {asset(display.splash)?.kind === 'video' ? <>{numbers['splash.start']}{numbers['splash.end']}</> : <>{numbers['splash.fade-in']}{numbers['splash.fade-out']}</>}
            {fit(splash.fit, value => patchSplash({ fit: value }))}
            {active && <StartupColorInput draftKey="splash.background" drafts={colorDrafts.current} onDraftChange={dirty => childPending('splash.background', dirty)} onColorDraftChange={capture} label={t('背景颜色', 'Background color', '背景色')} value={splash.background} locale={locale} onChange={background => patchSplash({ background })}/>}
          </>)}
        </>)}
      </> : <>
        {resource('titleBackground', t('主页背景', 'Home background', 'ホーム背景'), <Image size={16}/>)}
        {resource('titleMusic', t('主页音乐', 'Home music', 'ホーム音楽'), <Music size={16}/>, display.titleMusic && <>
          {numbers['music.volume']}
          <label className="startup-check"><input type="checkbox" checked={music.loop} onChange={event => patchMusic({ loop: event.target.checked })}/>{t('循环播放', 'Loop', 'ループ再生')}</label>
          {advanced(t('播放起点、淡入与循环范围', 'Start, fade and loop range', '開始位置・フェード・ループ範囲'), <>
            {numbers['music.start']}{numbers['music.fade']}{music.loop && <>{numbers['music.loop-start']}{numbers['music.loop-end']}</>}
          </>)}
        </>)}
        {resource('titleVideo', t('主页视频', 'Home video', 'ホーム動画'), <Film size={16}/>, display.titleVideo && <>
          {numbers['video.volume']}
          <label className="startup-check"><input type="checkbox" checked={video.loop} onChange={event => patchVideo({ loop: event.target.checked })}/>{t('循环视频', 'Loop video', '動画をループ再生')}</label>
          {video.volume > 0 && display.titleMusic && <p className="startup-help">{t('视频音轨与主页音乐同时播放，请试听确认。', 'Video sound and home music play together. Preview to check.', '動画音声とホーム音楽が同時に再生されます。プレビューで確認してください。')}</p>}
          {advanced(t('播放范围与画面适配', 'Playback range and fit', '再生範囲と表示方法'), <>
            {numbers['video.start']}{numbers['video.end']}{fit(video.fit, value => patchVideo({ fit: value }))}
          </>)}
        </>)}
      </>}
      {(busy || localDirty.current || Object.keys(buffers).length > 0) && <p role="status" className="startup-help">{busy ? t('正在应用设置…', 'Applying settings…', '設定を適用中…') : t('输入尚未应用', 'Input has not been applied', '入力は未適用です')}</p>}
    </aside>)}</div>
  </section>;
}
