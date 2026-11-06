import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Home, Play, Redo2, Square, Undo2 } from 'lucide-react';
import { createId, ProjectSchema, SplashPlaybackSchema, StartupClipSchema, StartupSequenceSchema, TitleMusicPlaybackSchema, TitleVideoPlaybackSchema, type Asset, type Project } from '@galcraft/contracts';
import { CandidateStartupSequence } from './settings-startup-sequence.js';
import { parseStartupNumber, volumePercent, type StartupNumberOptions } from '../../../authoring/startup-input.js';
import type { StartupAssetField, StartupGuiDraft, StartupPreviewKind } from '../../../authoring/startup-editor.js';
import type { CandidateSession } from '../application/session.js';
import { CandidateButton, CandidateCheckbox, CandidateColorField, CandidateField, CandidateIconButton, CandidateInput, CandidateSection, CandidateSelect, CandidateToolbar, type ColorInputDraft } from '../components/controls/index.js';
import { CandidateLeasedAudioLoopEditor } from '../components/professional/CandidateAudioLoopEditor.js';
import { workfaceError } from './workface-helpers.js';
import '../../../authoring/animation-timeline.css';
import '../../../authoring/startup-editor.css';

type Display = Project['display'];
type Fit = 'contain' | 'cover' | 'fill';
type Capture = StartupGuiDraft & { baseline?: Display; colorDraft?: ColorInputDraft | null };
const key = 'settings/startup';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function CandidateStartupFields({ store, project, documentId, active, assets, chooseAsset, commit, preview }: {
  store: CandidateSession; project: Project; documentId: string; active: boolean; assets: Asset[];
  chooseAsset(field: StartupAssetField, currentId: string | null, preferredKind?: 'image' | 'video'): Promise<string | undefined>;
  commit(display: Display, baseline: Display): Promise<Display>;
  preview(kind: StartupPreviewKind, host: HTMLElement, display: Display): Promise<() => void>;
}) {
  const restored = store.viewState<Capture>(key);
  const [tab, setTab] = useState<'splash' | 'home'>(restored?.tab ?? 'splash');
  const [display, setDisplay] = useState(() => restored?.display ?? project.display);
  const [buffers, setBuffers] = useState<Record<string, string>>(() => restored?.buffers ?? {});
  const [colorDraft, setColorDraft] = useState<ColorInputDraft | null>(restored?.colorDraft ?? null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [professionalPending, setProfessionalPending] = useState<Record<string, boolean>>({});
  const [committed, setCommitted] = useState(() => restored?.baseline ?? project.display);
  const current = useRef(display), baseline = useRef(committed), acceptedInput = useRef(committed), queue = useRef<Promise<unknown>>(Promise.resolve());
  const host = useRef<HTMLDivElement>(null), release = useRef<(() => void) | null>(null), generation = useRef(0);
  const activeRef = useRef(active), mounted = useRef(true);
  activeRef.current = active;
  const dirty = !equal(display, committed);
  const invalidOrEditing = !!colorDraft || Object.keys(buffers).length > 0 || Object.values(professionalPending).some(Boolean);
  const locale = store.controller.preferences.locale;
  const history = store.history(documentId);
  useEffect(() => {
    store.rememberViewState(key, { display, buffers, tab, baseline: committed, colorDraft } satisfies Capture);
    store.setViewPending(key, dirty || invalidOrEditing || busy);
  }, [store, display, buffers, tab, committed, colorDraft, dirty, invalidOrEditing, busy]);
  useEffect(() => {
    if (!dirty && !busy) { current.current = baseline.current = acceptedInput.current = project.display; setDisplay(project.display); setCommitted(project.display); }
  }, [project.display]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; release.current?.(); release.current = null; };
  }, []);
  const stop = () => { generation.current++; release.current?.(); release.current = null; setPlaying(false); };
  useEffect(() => { if (!active) stop(); }, [active]);
  const update = (patch: Partial<Display>) => {
    const next = { ...current.current, ...patch };
    const parsed = ProjectSchema.shape.display.safeParse(next);
    if (!parsed.success) { setError('请检查播放设置、媒体范围和音量。'); return Promise.resolve(false); }
    current.current = parsed.data; setDisplay(parsed.data); stop(); setBusy(true); setError('');
    const task = queue.current.catch(() => {}).then(async () => {
      try {
        const next = { ...baseline.current };
        for (const field of Object.keys(ProjectSchema.shape.display.shape) as (keyof Display)[]) {
          if (!equal(parsed.data[field], acceptedInput.current[field])) Object.assign(next, { [field]: parsed.data[field] });
        }
        const fresh = await commit(next, baseline.current);
        acceptedInput.current = parsed.data;
        baseline.current = fresh;
        if (mounted.current) setCommitted(fresh);
        if (current.current === parsed.data) {
          current.current = acceptedInput.current = fresh;
          if (mounted.current) setDisplay(fresh);
        }
        return true;
      } catch (reason) {
        if (mounted.current) setError(workfaceError(reason));
        return false;
      } finally { if (mounted.current && (current.current === parsed.data || equal(current.current, baseline.current))) setBusy(false); }
    });
    queue.current = task;
    return task;
  };
  const reset = () => {
    current.current = baseline.current = acceptedInput.current = project.display;
    setDisplay(project.display); setCommitted(project.display); setBuffers({}); setIssues({}); setError('');
  };
  const startPreview = async (kind: StartupPreviewKind, override?: Display) => {
    await queue.current;
    if (!activeRef.current || !host.current) return;
    if (!equal(current.current, baseline.current) || invalidOrEditing) { setError('请修正当前输入后再预览。'); return; }
    stop(); setError('');
    const request = generation.current;
    try {
      const dispose = await preview(kind, host.current, override ?? current.current);
      if (request !== generation.current || !mounted.current) dispose();
      else { release.current = dispose; setPlaying(true); }
    } catch (reason) { if (mounted.current && request === generation.current) setError(workfaceError(reason)); }
  };
  const replay = async (action: 'undo' | 'redo') => {
    await queue.current;
    if (!equal(current.current, baseline.current) || invalidOrEditing) { setError('请先应用或还原当前输入。'); return; }
    stop();
    await store[action](documentId);
  };
  const asset = (id: string | null) => assets.find(item => item.id === id);
  const duration = (id: string | null) => { const item = asset(id); return item?.variants.find(variant => variant.id === item.activeVariantId)?.metadata.durationSec; };
  const splash = SplashPlaybackSchema.parse(display.splashPlayback ?? {});
  const music = TitleMusicPlaybackSchema.parse(display.titleMusicPlayback ?? {});
  const video = TitleVideoPlaybackSchema.parse(display.titleVideoPlayback ?? {});
  const musicLoop = useMemo(() => ({ loopStartSec: music.loopStartSec, loopEndSec: music.loopEndSec }), [music.loopStartSec, music.loopEndSec]);
  const patchSplash = (patch: Partial<typeof splash>) => update({ splashPlayback: { ...SplashPlaybackSchema.parse(current.current.splashPlayback ?? {}), ...patch } });
  const patchMusic = (patch: Partial<typeof music>) => update({ titleMusicPlayback: { ...TitleMusicPlaybackSchema.parse(current.current.titleMusicPlayback ?? {}), ...patch } });
  const patchVideo = (patch: Partial<typeof video>) => update({ titleVideoPlayback: { ...TitleVideoPlaybackSchema.parse(current.current.titleVideoPlayback ?? {}), ...patch } });
  const dropBuffer = (field: string) => {
    setBuffers(previous => { const next = { ...previous }; delete next[field]; return next; });
    setIssues(previous => { const next = { ...previous }; delete next[field]; return next; });
  };
  const issue = (field: string, text: string) => setIssues(previous => ({ ...previous, [field]: text }));
  const number = (field: string, label: string, unit: string, value: number | null, apply: (value: number | null) => void, options: StartupNumberOptions = {}) =>
    <CandidateField label={label} unit={unit} error={issues[field]} className="candidate-settings-number">
      <CandidateInput inputMode={(options.step ?? 1) === 1 ? 'numeric' : 'decimal'} value={buffers[field] ?? (value === null ? '' : String(value))}
        placeholder={options.nullable ? '完整' : undefined} onChange={event => setBuffers(previous => ({ ...previous, [field]: event.target.value }))}
        onBlur={event => {
          if (!Object.hasOwn(buffers, field)) return;
          const next = parseStartupNumber(event.target.value.trim(), options);
          if (next === undefined) { issue(field, '请输入有效范围内的数值。'); return; }
          dropBuffer(field); if (next !== value) apply(next);
        }}/>
    </CandidateField>;
  const fit = (value: Fit, apply: (fit: Fit) => void) => <CandidateField label="适配方式" layout="row">
    <CandidateSelect value={value} onValueChange={next => apply(next as Fit)}><option value="contain">完整显示</option><option value="cover">填满并裁切</option><option value="fill">拉伸</option></CandidateSelect>
  </CandidateField>;
  const resource = (field: StartupAssetField, label: string) => {
    const id = display[field], item = asset(id), seconds = duration(id);
    return <div className="candidate-settings-inline candidate-settings-action-field">
      <CandidateField label={label} hint={id && seconds !== undefined ? seconds.toFixed(2) + ' s' : undefined}>
        <CandidateInput value={id ? item?.name ?? '引用已失效' : '尚未选择'} title={item?.name} readOnly/>
      </CandidateField>
      <CandidateButton variant="outline" density="standard" onClick={() => void chooseAsset(field, id).then(next => { if (next !== undefined) void update({ [field]: next }); }).catch(reason => setError(workfaceError(reason)))}>选择素材</CandidateButton>
      {id && <CandidateButton density="standard" onClick={() => void update({ [field]: null })}>移除引用</CandidateButton>}
    </div>;
  };
  const setProfessional = (field: string, pending: boolean) => setProfessionalPending(previous => ({ ...previous, [field]: pending }));
  return <div className="candidate-startup-editor">
    <CandidateToolbar label="启动设置分区" className="candidate-settings-toolbar">
      <CandidateButton aria-pressed={tab === 'splash'} onClick={() => { setTab('splash'); stop(); }}><Clapperboard size={14}/>开屏</CandidateButton>
      <CandidateButton aria-pressed={tab === 'home'} onClick={() => { setTab('home'); stop(); }}><Home size={14}/>主页</CandidateButton>
      <span className="candidate-settings-toolbar-spacer"/>
      <CandidateIconButton label="撤销" disabled={busy || dirty || invalidOrEditing || !history.canUndo} onClick={() => void replay('undo')}><Undo2 size={14}/></CandidateIconButton>
      <CandidateIconButton label="重做" disabled={busy || dirty || invalidOrEditing || !history.canRedo} onClick={() => void replay('redo')}><Redo2 size={14}/></CandidateIconButton>
    </CandidateToolbar>
    <div className="candidate-document-scroll candidate-settings-scroll">
      <div className="candidate-startup-grid">
        <CandidateSection title="Player 预览" className="candidate-startup-preview-section">
          <div ref={host} className="candidate-startup-preview" style={{ aspectRatio: project.canvas.width + '/' + project.canvas.height }} aria-label="Player 预览画面"/>
          <CandidateToolbar label="预览控制">
            {tab === 'splash' ? <CandidateButton variant="outline" disabled={busy || !display.splash && !display.startupSequence} onClick={() => void startPreview('splash')}><Play size={14}/>预览开屏</CandidateButton>
              : <CandidateButton variant="outline" disabled={busy} onClick={() => void startPreview('home')}><Play size={14}/>预览主页</CandidateButton>}
            <CandidateButton disabled={busy} onClick={() => void startPreview('startup')}><Play size={14}/>从启动预览</CandidateButton>
            <CandidateIconButton label="停止预览" disabled={!playing} onClick={stop}><Square size={14}/></CandidateIconButton>
          </CandidateToolbar>
          {!playing && <p className="candidate-settings-hint">点击预览后才播放声音。作品未设置开屏时直接进入主页。</p>}
        </CandidateSection>
        <div className="candidate-startup-fields" hidden={tab !== 'splash'}>
          {display.startupSequence ? <CandidateSection title="序列说明"><p className="candidate-settings-hint">在时间轴选择和编辑片段。片段可以重叠，淡入、停留和淡出分别设置。</p></CandidateSection> : <CandidateSection title="开屏素材">
            {resource('splash', '开屏图片或视频')}
            {asset(display.splash)?.kind !== 'video' ? <div className="candidate-settings-inline">
              {number('splash.duration', '停留时长', 'ms', splash.durationMs, next => void patchSplash({ durationMs: next! }))}
              {number('splash.fade-in', '淡入', 'ms', splash.fadeInMs, next => void patchSplash({ fadeInMs: next! }))}
              {number('splash.fade-out', '淡出', 'ms', splash.fadeOutMs, next => void patchSplash({ fadeOutMs: next! }))}
            </div> : <div className="candidate-settings-inline">
              {number('splash.start', '播放起点', 's', splash.startSec, next => void patchSplash({ startSec: next! }), { step: .01, end: splash.endSec, total: duration(display.splash), beforeTotal: true })}
              {number('splash.end', '播放终点', 's', splash.endSec, next => void patchSplash({ endSec: next }), { step: .01, nullable: true, start: splash.startSec, total: duration(display.splash) })}
              {number('splash.volume', '视频音量', '%', volumePercent(splash.volume), next => void patchSplash({ volume: next! / 100 }), { max: 100, step: .01 })}
            </div>}
            {fit(splash.fit, next => void patchSplash({ fit: next }))}
            {active && tab === 'splash' && <div className="candidate-settings-color">
              <span>背景颜色</span><CandidateColorField label="背景颜色" locale={locale} value={splash.background} allowAlpha
                inputDraft={colorDraft} onInputDraftChange={setColorDraft} onPreview={() => {}} onSession={() => {}} onCommit={async background => {
                  if (!await patchSplash({ background })) throw new Error('背景颜色尚未应用。');
                }}/>
            </div>}
            <label className="candidate-settings-check"><CandidateCheckbox checked={splash.allowSkip} onChange={event => void patchSplash({ allowSkip: event.target.checked })}/>允许跳过开屏</label>
            <CandidateToolbar label="开屏序列"><CandidateButton variant="outline" onClick={() => void update({ startupSequence: StartupSequenceSchema.parse({
              clips: [StartupClipSchema.parse({ id: createId(), kind: 'text', name: '作者说明', text: { [locale]: project.name } })],
            }) })}>编排原生开屏序列</CandidateButton></CandidateToolbar>
          </CandidateSection>}
        </div>
        <div className="candidate-startup-fields" hidden={tab !== 'home'}>
          <CandidateSection title="背景">{resource('titleBackground', '主页背景')}</CandidateSection>
          <CandidateSection title="音乐">
            {resource('titleMusic', '主页音乐')}
            {display.titleMusic && <>
              <div className="candidate-settings-inline">
                {number('music.start', '播放起点', 's', music.startSec, next => void patchMusic({ startSec: next! }), { step: .01, total: duration(display.titleMusic), beforeTotal: true })}
                {number('music.volume', '音乐音量', '%', volumePercent(music.volume), next => void patchMusic({ volume: next! / 100 }), { max: 100, step: .01 })}
                {number('music.fade', '进入淡入', 'ms', music.fadeInMs, next => void patchMusic({ fadeInMs: next! }))}
              </div>
              <label className="candidate-settings-check"><CandidateCheckbox checked={music.loop} onChange={event => void patchMusic({ loop: event.target.checked })}/>循环播放</label>
              {music.loop && <div className="candidate-settings-inline">
                {number('music.loop-start', '循环起点', 's', music.loopStartSec, next => void patchMusic({ loopStartSec: next! }), { step: .01, end: music.loopEndSec, total: duration(display.titleMusic), beforeTotal: true })}
                {number('music.loop-end', '循环终点', 's', music.loopEndSec, next => void patchMusic({ loopEndSec: next }), { step: .01, nullable: true, start: music.loopStartSec, total: duration(display.titleMusic) })}
              </div>}
            </>}
          </CandidateSection>
          <CandidateSection title="视频">
            {resource('titleVideo', '主页视频')}
            {display.titleVideo && <>
              <div className="candidate-settings-inline">
                {number('video.start', '播放起点', 's', video.startSec, next => void patchVideo({ startSec: next! }), { step: .01, end: video.endSec, total: duration(display.titleVideo), beforeTotal: true })}
                {number('video.end', '播放终点', 's', video.endSec, next => void patchVideo({ endSec: next }), { step: .01, nullable: true, start: video.startSec, total: duration(display.titleVideo) })}
                {number('video.volume', '视频音量', '%', volumePercent(video.volume), next => void patchVideo({ volume: next! / 100 }), { max: 100, step: .01 })}
              </div>
              {fit(video.fit, next => void patchVideo({ fit: next }))}
              <label className="candidate-settings-check"><CandidateCheckbox checked={video.loop} onChange={event => void patchVideo({ loop: event.target.checked })}/>循环视频</label>
              {video.volume > 0 && display.titleMusic && <p className="candidate-settings-hint">视频音轨与主页音乐会同时播放，可试听确认。</p>}
            </>}
          </CandidateSection>
        </div>
        {display.startupSequence && <div className="candidate-startup-professional" hidden={tab !== 'splash'}>
          <CandidateStartupSequence sequence={display.startupSequence} locale={locale} assets={assets} busy={busy} buffers={buffers}
            edit={(key, value) => setBuffers(previous => ({ ...previous, [key]: value }))}
            clear={key => setBuffers(previous => Object.fromEntries(Object.entries(previous).filter(([field]) => field !== key && !field.startsWith(key + '/'))))}
            chooseAsset={kind => chooseAsset('splash', null, kind)} onChange={startupSequence => update({ startupSequence })} onTransient={setProfessional}
            preview={clip => void startPreview('splash', { ...current.current, startupSequence: { ...display.startupSequence!, revealMs: 0, clips: [{ ...clip, startMs: 0 }] } })}/>
        </div>}
        {display.titleMusic && music.loop && store.services.runtimeAssets && <div className="candidate-startup-professional" hidden={tab !== 'home'}>
          <CandidateLeasedAudioLoopEditor asset={asset(display.titleMusic)} resources={store.services.runtimeAssets} locale={locale} active={tab === 'home' && active && !playing}
            readonly={busy} value={musicLoop} onDraftChange={pending => setProfessional('audio', pending)} onChange={async next => {
              if (!await patchMusic({ loopStartSec: next.loopStartSec ?? 0, loopEndSec: next.loopEndSec })) throw new Error('循环区间尚未应用。');
            }}/>
        </div>}
      </div>
    </div>
    <footer className="candidate-settings-footer">
      <div className="candidate-settings-status">{error ? <p role="alert">{error}</p> : <p role="status">{busy ? '正在应用…' : dirty || invalidOrEditing ? '有未应用输入' : '有效修改已进入作品工作区。'}</p>}</div>
      {!busy && (dirty || Object.keys(buffers).length > 0) && <CandidateButton onClick={reset}>还原未应用输入</CandidateButton>}
      {dirty && <CandidateButton variant="primary" disabled={busy} onClick={() => void update({})}>重试应用</CandidateButton>}
    </footer>
  </div>;
}
