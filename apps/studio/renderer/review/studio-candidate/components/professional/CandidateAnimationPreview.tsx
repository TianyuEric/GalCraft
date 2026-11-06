import { useEffect, useRef, useState } from 'react';
import { createId, type Id, type PresentationState, type StageObject } from '@galcraft/contracts';
import { StageController, defaultEffectValues, parseAnimationResource, sampleObjectAnimation, type ExecutableAnimation, type VisualResource } from '@galcraft/stage';
import { Pause, Play, SkipBack } from 'lucide-react';
import type { AuthoringServices } from '../../../../authoring/controller.js';
import type { AnimationPreviewResource } from '../../../../authoring/professional/AnimationPreview.js';
import { CandidateButton, CandidateField, CandidateIconButton, CandidateRangeField, CandidateSelect, CandidateState, CandidateToolbar } from '../controls/index.js';
import { professionalError, professionalText } from './professional-fields.js';
import '../../styles/professional.css';

const figureId = 'GcaFig', backgroundId = 'GcaBkg', variantId = 'GcaVer';
const svgUri = (value: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(value);
const neutralFigure = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="440" height="900" viewBox="0 0 440 900"><g fill="#8192a9" stroke="#50617a" stroke-width="5"><ellipse cx="220" cy="112" rx="78" ry="94"/><path d="M145 222 Q220 195 295 222 L342 488 292 508 270 360 278 600 265 880 224 880 220 634 216 880 175 880 162 600 170 360 148 508 98 488Z"/></g><path d="M190 130 Q220 148 250 130" fill="none" stroke="#50617a" stroke-width="5"/></svg>');
const neutralBackground = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><path fill="#d9e2ee" d="M0 0h1920v1080H0z"/><path fill="#c4cfdf" d="M0 850h1920v230H0z"/><path stroke="#a9b8cd" stroke-width="3" d="M0 850h1920M480 850v230M960 850v230M1440 850v230"/></svg>');

function stageObject(id: string, background: boolean, height: number): StageObject {
  const cut = { preset: 'cut', resourceId: null, durationMs: 0, easing: { family: 'linear', direction: 'in' }, direction: 'left' } as const;
  return { id, assetId: id, variantId, characterId: null, layer: background ? 'background' : 'figure', entranceOrder: background ? 0 : 1,
    backgroundFrame: background ? { fit: 'cover', positionX: .5, positionY: .5 } : null, station: 'center',
    current: structuredClone(defaultEffectValues), defaults: { ...structuredClone(defaultEffectValues), station: 'center' },
    framing: { mode: 'full', scale: background ? 1 : 940 / height, offsetX: 0, offsetY: -20, crop: null },
    transition: { enter: cut, exit: cut }, processes: [], providerState: null, imageFace: null };
}

function previewState(objects: StageObject[]): PresentationState {
  return { objects, nextEntranceOrder: objects.length, transitions: [], effects: [], bgm: { assetId: null, variantId: null, stopped: true, volume: 1, startSec: 0, loop: false,
    loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 }, ambience: {}, voice: null, currentSfx: [], text: { speakerId: null, speakerName: '', parts: [], text: '', append: false,
    avatarId: null, fontSize: null, textboxVisible: false }, film: { enabled: false, top: 0, bottom: 0 }, intro: null, styles: {}, backgroundVideo: null };
}

async function chooseCandidateAnimationTarget(services: AuthoringServices, locale: string, trigger: HTMLElement): Promise<AnimationPreviewResource | null> {
  const t = professionalText(locale);
  const source = await services.read();
  if (!source.ok) throw new Error(source.error.message);
  const { openCandidateAssetPicker } = await import('../CandidateAssetPicker.js');
  const choice = await openCandidateAssetPicker({
    services, locale, projectId: source.value.project.projectId, allowedKinds: ['image'], remember: false, returnFocus: trigger,
    purpose: t('临时动画预览目标', 'Temporary animation preview target', '一時的なアニメーション対象'),
    onApply: async () => ({ ok: true, value: undefined, warnings: [] }),
  });
  if (!choice) return null;
  const resources = services.runtimeAssets;
  const version = choice.variantId ?? choice.asset.activeVariantId;
  const lease = await resources?.resolveRuntime(choice.assetId, version);
  if (!lease?.ok) throw new Error(lease?.error.message ?? t('动画预览资源服务不可用。', 'Animation preview resource service is unavailable.', 'アニメーションプレビューの素材サービスを利用できません。'));
  return { asset: { ...choice.asset, activeVariantId: version }, uri: lease.value.uri, release: () => { void resources?.releaseRuntime(lease.value.leaseId); } };
}

type PreviewTargetProps = {
  locale?: string;
  active?: boolean;
  image?: string;
  previewServices?: AuthoringServices;
  choosePreviewTarget?(): Promise<AnimationPreviewResource | null>;
};

export function CandidateAnimationPreview({ animation, timeMs, locale = 'zh-CN', active = true, image, previewServices, choosePreviewTarget, onTargetContext }: PreviewTargetProps & {
  animation: ExecutableAnimation;
  timeMs: number;
  onTargetContext?(context: string): void;
}) {
  const t = professionalText(locale);
  const canvas = useRef<HTMLDivElement>(null);
  const generation = useRef(0), render = useRef(() => {});
  const latest = useRef({ animation, timeMs }); latest.current = { animation, timeMs };
  const context = useRef(onTargetContext); context.current = onTargetContext;
  const [mode, setMode] = useState<'figure' | 'background'>('figure');
  const [resource, setResource] = useState<AnimationPreviewResource | null>(null);
  const [loading, setLoading] = useState(true), [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(''), [targetError, setTargetError] = useState('');
  const [attempt, retry] = useState(0);
  const held = useRef<AnimationPreviewResource | null>(null), live = useRef(false), visible = useRef(active);
  visible.current = active;

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; held.current?.release(); held.current = null; };
  }, []);

  useEffect(() => {
    const node = canvas.current;
    if (!node || !active) return;
    let disposed = false, stage: StageController | undefined;
    let queue = Promise.resolve();
    const owner = { sessionId: createId(), occurrence: 0, statementId: createId() };
    setLoading(true); setError('');
    const dimensions = resource?.asset.variants.find(variant => variant.id === resource.asset.activeVariantId)?.metadata;
    const width = dimensions?.width ?? (mode === 'background' ? 1920 : 440);
    const height = dimensions?.height ?? (mode === 'background' ? 1080 : 900);
    const targetId = mode === 'background' ? backgroundId : figureId;
    const objects = [stageObject(backgroundId, true, 1080), ...(mode === 'figure' ? [stageObject(figureId, false, height)] : [])];
    const baseline = previewState(objects);
    const target = objects.find(object => object.id === targetId)!;
    context.current?.(JSON.stringify({ canvas: { width: 1920, height: 1080 }, type: mode, assetName: resource?.asset.name ?? 'neutral',
      sourceSize: { width, height }, station: target.station, current: target.current, framing: target.framing, backgroundFrame: target.backgroundFrame }));
    const visual = (id: string): VisualResource => {
      const selected = id === targetId;
      const url = selected ? resource?.uri ?? (id === figureId ? image ?? neutralFigure : neutralBackground) : neutralBackground;
      return { url, anchor: { x: .5, y: 1 }, asset: { assetId: id, variantId, kind: 'image', entry: 'preview.svg', files: [],
        metadata: { width: selected ? width : 1920, height: selected ? height : 1080 }, canvas: null, provider: null } };
    };
    const layout = () => {
      const bounds = node.getBoundingClientRect();
      stage?.setViewport({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    };
    const resize = new ResizeObserver(layout);
    resize.observe(node);
    render.current = () => {
      if (disposed || !stage) return;
      const controller = stage;
      const value = latest.current, request = ++generation.current;
      queue = queue.then(async () => {
        if (disposed || generation.current !== request) return;
        const sampled = { ...baseline, objects: baseline.objects.map(object => object.id === targetId ? sampleObjectAnimation(object, value.animation, value.timeMs) : object) };
        const prepared = await controller.prepareStage(owner.sessionId, sampled);
        if (disposed || generation.current !== request) {
          if (prepared.ok) controller.discardPrepared(prepared.value.id);
          return;
        }
        if (!prepared.ok) { setError(prepared.error.message); return; }
        const committed = controller.commitStage(prepared.value.id, owner);
        setError(committed.ok ? '' : committed.error.message);
      }).catch(reason => { if (!disposed && generation.current === request) setError(professionalError(reason)); });
    };
    void StageController.create(node, { width: 1920, height: 1080, color: '#d9e2ee' }, { resolve: async id => ({ ok: true, value: visual(id), warnings: [] }) })
      .then(controller => {
        if (disposed) { controller.dispose(); return; }
        stage = controller; layout(); controller.pause(true); setLoading(false); render.current();
      }).catch(reason => { if (!disposed) { setLoading(false); setError(professionalError(reason)); } });
    return () => { disposed = true; generation.current++; resize.disconnect(); stage?.dispose(); };
  }, [active, resource, mode, image, attempt]);

  useEffect(() => { render.current(); }, [animation, timeMs]);

  const replaceTarget = (next: AnimationPreviewResource | null) => {
    const previous = held.current;
    held.current = next;
    setResource(next);
    previous?.release();
  };
  const choose = async (trigger: HTMLElement) => {
    setChoosing(true); setTargetError('');
    try {
      const next = previewServices ? await chooseCandidateAnimationTarget(previewServices, locale, trigger) : await choosePreviewTarget?.();
      if (!next) return;
      if (!live.current || !visible.current) { next.release(); return; }
      replaceTarget(next);
    } catch (reason) {
      if (live.current) setTargetError(professionalError(reason));
    } finally {
      if (live.current) setChoosing(false);
    }
  };

  return <section className="candidate-pro-visual" aria-label={t('动画画面预览', 'Animation visual preview', 'アニメーション表示プレビュー')}>
    <CandidateToolbar label={t('预览目标', 'Preview target', 'プレビュー対象')} className="candidate-pro-target">
      <CandidateField label={t('预览对象类型', 'Preview target type', 'プレビュー対象')} layout="row">
        <CandidateSelect density="compact" value={mode} onValueChange={value => setMode(value as typeof mode)}>
          <option value="figure">{t('立绘', 'Figure', '立ち絵')}</option><option value="background">{t('背景', 'Background', '背景')}</option>
        </CandidateSelect>
      </CandidateField>
      {(previewServices || choosePreviewTarget) && <CandidateButton disabled={!active} aria-disabled={choosing || undefined} variant="outline" onClick={event => void choose(event.currentTarget)}>
        {t('选择作品素材', 'Choose project asset', '作品素材を選択')}
      </CandidateButton>}
      {resource && <CandidateButton onClick={() => { setTargetError(''); replaceTarget(null); }}>{t('使用内置目标', 'Use built-in target', '内蔵対象に戻す')}</CandidateButton>}
    </CandidateToolbar>
    <div className="candidate-pro-canvas" ref={canvas} aria-busy={active && loading} />
    {active && loading && <CandidateState kind="loading" title={t('正在准备舞台…', 'Preparing stage…', '舞台を準備中…')}/>}
    <p className="candidate-pro-note">{resource?.asset.name ?? t('内置中性立绘与简单背景', 'Built-in neutral figure and background', '内蔵の中立立ち絵と背景')} · {t('临时选择只用于预览', 'Temporary selection is for preview', '一時選択はプレビュー用')}</p>
    {targetError && <p role="alert" className="candidate-pro-error">{targetError}</p>}
    {error && <CandidateState kind="error" title={t('舞台预览失败', 'Stage preview failed', '舞台プレビューに失敗')} description={error}
      action={<CandidateButton onClick={() => retry(value => value + 1)}>{t('重试预览', 'Retry preview', 'プレビューを再試行')}</CandidateButton>}/>}
  </section>;
}

export function useCandidatePlayhead(duration: number, active: boolean, onSeek?: (time: number) => void) {
  const [time, setTime] = useState(0), at = useRef(0), [playing, play] = useState(false);
  const notify = useRef(onSeek); notify.current = onSeek;
  const limit = useRef(duration); limit.current = duration;
  const seek = (value: number) => {
    at.current = Math.max(0, Math.min(limit.current, value));
    setTime(at.current); notify.current?.(at.current);
  };
  useEffect(() => { if (at.current > duration) seek(duration); }, [duration]);
  useEffect(() => { if (!active) play(false); }, [active]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      seek(at.current + now - previous);
      previous = now;
      if (at.current >= limit.current) play(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  return { time, at, seek, playing, play };
}

export function CandidateAnimationTransport({ locale, duration, clock, disabled, children }: {
  locale: string;
  duration: number;
  clock: ReturnType<typeof useCandidatePlayhead>;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const t = professionalText(locale);
  return <CandidateToolbar label={t('播放与时间轴', 'Playback and timeline', '再生とタイムライン')} className="candidate-pro-transport">
    <CandidateIconButton label={t('回到起点', 'Return to start', '先頭へ')} onClick={() => { clock.play(false); clock.seek(0); }}><SkipBack size={16}/></CandidateIconButton>
    <CandidateButton variant="outline" disabled={disabled || !duration} onClick={() => {
      if (clock.at.current >= duration) clock.seek(0);
      clock.play(!clock.playing);
    }}>{clock.playing ? <Pause size={16}/> : <Play size={16}/>} {clock.playing ? t('暂停', 'Pause', '一時停止') : t('播放', 'Play', '再生')}</CandidateButton>
    <CandidateRangeField label={t('播放头', 'Playhead', '再生位置')} value={Math.round(clock.time)} min={0} max={duration} unit="ms" disabled={!duration}
      onChange={value => { clock.play(false); clock.seek(value); }}/>
    {children}
  </CandidateToolbar>;
}

export function CandidateAnimationAssetPreview({ animation, locale = 'zh-CN', active = true, ...props }: PreviewTargetProps & { animation: ExecutableAnimation }) {
  const duration = Array.isArray(animation) ? animation.reduce((sum, part) => sum + part.durationMs, 0) : animation.durationMs;
  const clock = useCandidatePlayhead(duration, active);
  useEffect(() => { clock.play(false); }, [animation]);
  return <section className="candidate-pro-editor">
    <CandidateAnimationPreview {...props} animation={animation} locale={locale} active={active} timeMs={clock.time}/>
    <CandidateAnimationTransport locale={locale} duration={duration} clock={clock} disabled={!active}/>
  </section>;
}

/** Read the exact selected version and release its lease once the animation has been parsed. */
export function CandidateLeasedAnimationPreview({ assetId, variantId, services, locale = 'zh-CN', active = true }: {
  assetId: Id; variantId: Id; services: AuthoringServices; locale?: string; active?: boolean;
}) {
  const t = professionalText(locale);
  const [result, setResult] = useState<{ identity: string; animation?: ExecutableAnimation; error?: string }>();
  const [attempt, retry] = useState(0);
  const identity = assetId + ':' + variantId + ':' + attempt;
  const resources = services.runtimeAssets;
  const current = result?.identity === identity ? result : undefined;
  useEffect(() => {
    if (!active || !resources) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const lease = await resources.resolveRuntime(assetId, variantId);
        if (!lease.ok) throw new Error(lease.error.message);
        try {
          if (abort.signal.aborted) return;
          const response = await fetch(lease.value.uri, { signal: abort.signal });
          if (!response.ok) throw new Error('GCA HTTP ' + response.status);
          const parsed = parseAnimationResource(await response.text());
          if (!parsed.ok) throw new Error(parsed.error.message);
          if (!abort.signal.aborted) setResult({ identity, animation: parsed.value });
        } finally { void resources.releaseRuntime(lease.value.leaseId); }
      } catch (reason) {
        if (!abort.signal.aborted) setResult({ identity, error: professionalError(reason) });
      }
    })();
    return () => abort.abort();
  }, [assetId, variantId, identity, resources, active]);
  if (!active) return null;
  if (!resources || current?.error) return <CandidateState kind="error"
    title={t('动画素材读取失败', 'Could not read animation asset', 'アニメーション素材を読み込めませんでした')}
    description={current?.error} action={<CandidateButton onClick={() => retry(value => value + 1)}>{t('重试读取', 'Retry loading', '読み込みを再試行')}</CandidateButton>}/>;
  if (!current?.animation) return <CandidateState kind="loading" title={t('正在读取动画…', 'Loading animation…', 'アニメーションを読み込み中…')}/>;
  return <CandidateAnimationAssetPreview key={identity} animation={current.animation} locale={locale} previewServices={services}/>;
}
