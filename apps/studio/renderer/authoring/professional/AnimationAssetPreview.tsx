import { useEffect, useRef, useState } from 'react';
import type { ExecutableAnimation } from '@galcraft/stage';
import { Pause, Play, SkipBack } from 'lucide-react';
import { Button } from '../../components/controls.js';
import { AnimationPreview, type AnimationPreviewResource } from './AnimationPreview.js';
export function AnimationAssetPreview({ animation, locale, chooseTarget }: { animation: ExecutableAnimation; locale: string; chooseTarget?(): Promise<AnimationPreviewResource | null> }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const duration = Array.isArray(animation) ? animation.reduce((sum, part) => sum + part.durationMs, 0) : animation.durationMs;
  const [time, setTime] = useState(0), at = useRef(0), [playing, play] = useState(false);
  const seek = (value: number) => { at.current = Math.max(0, Math.min(duration, value)); setTime(at.current); };
  useEffect(() => { play(false); seek(at.current); }, [animation]);
  useEffect(() => { if (!playing) return; let frame = 0, previous = performance.now(); const tick = (now: number) => { seek(at.current + now - previous); previous = now; if (at.current >= duration) play(false); else frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [playing, duration]);
  return <section className="pro-editor"><AnimationPreview animation={animation} timeMs={time} locale={locale} chooseTarget={chooseTarget}/><div className="pro-transport"><Button tone="quiet" aria-label={t('回到开头', 'Return to start', '先頭へ')} onClick={() => { play(false); seek(0); }}><SkipBack size={16}/></Button><Button onClick={() => { if (at.current >= duration) seek(0); play(value => !value); }}>{playing ? <Pause size={16}/> : <Play size={16}/>} {playing ? t('暂停', 'Pause', '一時停止') : t('播放', 'Play', '再生')}</Button><label>{t('播放头', 'Playhead', '再生位置')}<input aria-label={t('动画播放头', 'Animation playhead', 'アニメーション再生位置')} type="range" min="0" max={duration} value={time} onChange={event => { play(false); seek(Number(event.target.value)); }}/></label><output>{Math.round(time)} / {duration} ms</output></div></section>;
}
