import { useEffect, useRef, useState } from 'react';
import { createId, type Asset, type NativeAnimation, type PresentationState, type StageObject } from '@galcraft/contracts';
import { StageController, defaultEffectValues, sampleObjectAnimation, type ExecutableAnimation, type VisualResource } from '@galcraft/stage';
import { Button, Choice } from '../../components/controls.js';
import './animation-preview.css';

export type AnimationPreviewResource = { asset: Asset; uri: string; release(): void };
const figureId = 'GcaFig', backgroundId = 'GcaBkg', variantId = 'GcaVer';
const svgUri = (value: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
const neutralFigure = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="440" height="900" viewBox="0 0 440 900"><g fill="#8192a9" stroke="#50617a" stroke-width="5"><ellipse cx="220" cy="112" rx="78" ry="94"/><path d="M145 222 Q220 195 295 222 L342 488 292 508 270 360 278 600 265 880 224 880 220 634 216 880 175 880 162 600 170 360 148 508 98 488Z"/></g><path d="M190 130 Q220 148 250 130" fill="none" stroke="#50617a" stroke-width="5"/></svg>');
const neutralBackground = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><path fill="#d9e2ee" d="M0 0h1920v1080H0z"/><path fill="#c4cfdf" d="M0 850h1920v230H0z"/><path stroke="#a9b8cd" stroke-width="3" d="M0 850h1920M480 850v230M960 850v230M1440 850v230"/></svg>');
function baseObject(id: string, background: boolean, width: number, height: number): StageObject {
  const cut = { preset: 'cut', resourceId: null, durationMs: 0, easing: { family: 'linear', direction: 'in' }, direction: 'left' } as const;
  return { id, assetId: id, variantId, characterId: null, layer: background ? 'background' : 'figure', entranceOrder: background ? 0 : 1,
    backgroundFrame: background ? { fit: 'cover', positionX: .5, positionY: .5 } : null, station: 'center',
    current: structuredClone(defaultEffectValues), defaults: { ...structuredClone(defaultEffectValues), station: 'center' },
    framing: { mode: 'full', scale: background ? 1 : 940 / height, offsetX: 0, offsetY: -20, crop: null },
    transition: { enter: cut, exit: cut }, processes: [], providerState: null, imageFace: null };
}
function state(objects: StageObject[]): PresentationState {
  return { objects, nextEntranceOrder: objects.length, transitions: [], effects: [], bgm: { assetId: null, variantId: null, stopped: true, volume: 1, startSec: 0, loop: false,
    loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 }, ambience: {}, voice: null, currentSfx: [], text: { speakerId: null, speakerName: '', parts: [], text: '', append: false,
    avatarId: null, fontSize: null, textboxVisible: false }, film: { enabled: false, top: 0, bottom: 0 }, intro: null, styles: {}, backgroundVideo: null };
}
/** An isolated real stage. Target leases and the playhead belong to the workbench, never to GCA. */
export function AnimationPreview({ animation, timeMs, locale = 'zh-CN', chooseTarget, image, onTargetContext }: {
  animation: ExecutableAnimation; timeMs: number; locale?: string; chooseTarget?(): Promise<AnimationPreviewResource | null>; image?: string; onTargetContext?(value: string): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const root = useRef<HTMLDivElement>(null), stage = useRef<StageController | null>(null), queue = useRef(Promise.resolve()), generation = useRef(0);
  const latest = useRef({ animation, timeMs }); latest.current = { animation, timeMs };
  const [mode, setMode] = useState<'figure' | 'background'>('figure'), [resource, setResource] = useState<AnimationPreviewResource | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [choosing, setChoosing] = useState(false);
  const held = useRef<AnimationPreviewResource | null>(null), owner = useRef({ sessionId: createId(), occurrence: 0, statementId: createId() });
  const render = useRef(() => {});
  useEffect(() => () => { held.current?.release(); held.current = null; }, []);
  useEffect(() => {
    const container = root.current!; let cancelled = false, current: StageController | null = null;
    const version = ++generation.current; setLoading(true); setError('');
    const metadata = resource?.asset.variants.find(item => item.id === resource.asset.activeVariantId)?.metadata;
    const width = metadata?.width ?? (mode === 'background' ? 1920 : 440), height = metadata?.height ?? (mode === 'background' ? 1080 : 900);
    const targetId = mode === 'background' ? backgroundId : figureId;
    const objects = [baseObject(backgroundId, true, 1920, 1080), ...(mode === 'figure' ? [baseObject(figureId, false, width, height)] : [])];
    const baseline = state(objects);
    const target = objects.find(object => object.id === targetId)!;
    onTargetContext?.(JSON.stringify({ canvas: { width: 1920, height: 1080 }, type: mode, assetName: resource?.asset.name ?? 'neutral', sourceSize: { width, height }, station: target.station, current: target.current, framing: target.framing, backgroundFrame: target.backgroundFrame }));
    const visual = (id: string): VisualResource => {
      const selected = id === targetId, w = selected ? width : 1920, h = selected ? height : 1080;
      return { url: selected ? resource?.uri ?? (id === figureId ? image ?? neutralFigure : neutralBackground) : neutralBackground,
        anchor: { x: .5, y: 1 }, asset: { assetId: id, variantId, kind: 'image', entry: 'preview.svg', files: [], metadata: { width: w, height: h }, canvas: null, provider: null } };
    };
    const resize = new ResizeObserver(() => { const bounds = container.getBoundingClientRect(); current?.setViewport({ x: 0, y: 0, width: bounds.width, height: bounds.height }); });
    resize.observe(container);
    render.current = () => {
      const controller = stage.current; if (!controller || cancelled) return;
      const value = latest.current, request = ++generation.current;
      queue.current = queue.current.catch(() => {}).then(async () => {
        if (cancelled || stage.current !== controller || generation.current !== request) return;
        const sampled = { ...baseline, objects: baseline.objects.map(object => object.id === targetId ? sampleObjectAnimation(object, value.animation, value.timeMs) : object) };
        const prepared = await controller.prepareStage(owner.current.sessionId, sampled);
        if (!prepared.ok) { if (!cancelled) setError(prepared.error.message); return; }
        if (cancelled || stage.current !== controller || generation.current !== request) { controller.discardPrepared(prepared.value.id); return; }
        const committed = controller.commitStage(prepared.value.id, owner.current); if (!committed.ok) setError(committed.error.message); else setError('');
      });
    };
    void StageController.create(container, { width: 1920, height: 1080, color: '#d9e2ee' }, { resolve: async id => ({ ok: true, value: visual(id), warnings: [] }) }).then(controller => {
      if (cancelled) { controller.dispose(); return; } current = controller; stage.current = controller;
      const bounds = container.getBoundingClientRect(); controller.setViewport({ x: 0, y: 0, width: bounds.width, height: bounds.height }); controller.pause(true); setLoading(false); render.current();
    }).catch(reason => { if (!cancelled) { setLoading(false); setError(String(reason)); } });
    return () => { cancelled = true; if (generation.current === version) generation.current++; resize.disconnect(); if (stage.current === current) stage.current = null; current?.dispose(); };
  }, [resource, mode, image]);
  useEffect(() => { render.current(); }, [animation, timeMs]);
  return <section className="gca-preview" aria-label={t('动画画面预览', 'Animation visual preview', 'アニメーション表示プレビュー')}>
    <div className="gca-preview-tools"><Choice label={t('预览对象类型', 'Preview target type', 'プレビュー対象')} value={mode} options={[{ value: 'figure', label: t('立绘', 'Figure', '立ち絵') }, { value: 'background', label: t('背景', 'Background', '背景') }]} onChange={value => setMode(value as typeof mode)}/>
      {chooseTarget && <Button disabled={choosing} onClick={async () => { setChoosing(true); try { const next = await chooseTarget(); if (next) { const previous = held.current; held.current = next; setResource(next); previous?.release(); } } catch (reason) { setError(String(reason)); } finally { setChoosing(false); } }}>{t('选择作品素材', 'Choose project asset', '作品素材を選択')}</Button>}
      {resource && <Button tone="quiet" onClick={() => { held.current?.release(); held.current = null; setResource(null); }}>{t('使用内置目标', 'Use built-in target', '内蔵対象に戻す')}</Button>}
    </div><p className="pro-note">{resource?.asset.name ?? t('内置中性立绘与简单背景', 'Built-in neutral figure and background', '内蔵の中立立ち絵と背景')} · {t('临时选择只用于预览', 'Temporary selection is for preview', '一時選択はプレビュー用')}</p>
    <div className="gca-preview-stage" ref={root} aria-busy={loading}/>{loading && <p role="status">{t('正在准备舞台…', 'Preparing stage…', '舞台を準備中…')}</p>}{error && <p className="pro-error" role="alert">{error}</p>}
  </section>;
}
