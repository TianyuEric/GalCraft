import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TitleVideoPlaybackSchema } from '@galcraft/contracts';
import type { PlayerHost, Project, Snapshot } from '@galcraft/contracts';
import { ResourceImage } from './resource-image.js';

/** A receipt from the mounted video's selected first frame, including an authored seek. */
export function waitForTitleFrame(element: HTMLVideoElement, startSec: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame: number | null = null, paint: number | null = null;
    const cleanup = () => {
      element.removeEventListener('loadeddata', check); element.removeEventListener('seeked', check);
      element.removeEventListener('error', failed); signal.removeEventListener('abort', aborted);
      if (frame !== null) element.cancelVideoFrameCallback(frame);
      if (paint !== null) cancelAnimationFrame(paint);
    };
    const ready = () => element.readyState >= 2 && !element.seeking && element.currentTime + .001 >= startSec;
    const complete = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('主页视频读取失败')); };
    const aborted = () => { cleanup(); reject(new DOMException('影片已失效', 'AbortError')); };
    const presented = () => { frame = null; if (ready()) complete(); else check(); };
    const check = () => {
      if (typeof element.requestVideoFrameCallback === 'function') {
        if (frame === null) frame = element.requestVideoFrameCallback(presented);
      } else if (ready() && paint === null) {
        // Engines without the frame callback API paint the loaded, settled frame before receipt.
        paint = requestAnimationFrame(() => { paint = requestAnimationFrame(() => { paint = null; if (ready()) complete(); }); });
      }
    };
    element.addEventListener('loadeddata', check); element.addEventListener('seeked', check);
    element.addEventListener('error', failed); signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else check();
  });
}

export function TitleMedia({ host, snapshot, display, paused, videoVolume, backgroundRoot }: {
  host: PlayerHost; snapshot: Snapshot; display: Project['display']; paused: boolean; videoVolume: number; backgroundRoot: HTMLElement;
}) {
  const video = useRef<HTMLVideoElement>(null), [url, setUrl] = useState<string | null>(null), [blocked, setBlocked] = useState(false), [error, setError] = useState<string | null>(null);
  const [readyFrame, setReadyFrame] = useState<string | null>(null);
  const configuration = TitleVideoPlaybackSchema.parse(display.titleVideoPlayback ?? {});
  const asset = snapshot.assets.find(item => item.assetId === display.titleVideo);
  useEffect(() => {
    let active = true, release: (() => void) | null = null; setUrl(null); setReadyFrame(null); setError(null); setBlocked(false);
    if (display.titleVideo && (!asset || asset.kind !== 'video')) setError('主页视频素材不可用');
    if (asset?.kind === 'video') void host.resources.resolve(asset.assetId, asset.variantId).then(result => {
      if (!active) { if (result.ok) result.value.release(); return; }
      if (result.ok) { release = result.value.release; setUrl(result.value.uri); } else setError(result.error.message);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; release?.(); };
  }, [host, asset?.assetId, asset?.variantId, display.titleVideo]);
  const frameIdentity = `${url}/${configuration.startSec}`;
  useEffect(() => {
    const element = video.current; if (!element || !url) return;
    const lifetime = new AbortController(); setReadyFrame(null);
    void waitForTitleFrame(element, configuration.startSec, lifetime.signal).then(() => setReadyFrame(frameIdentity))
      .catch(reason => { if (!lifetime.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => lifetime.abort();
  }, [url, frameIdentity, configuration.startSec]);
  useEffect(() => { const element = video.current; if (!element || !url) return;
    let active = true;
    const play = () => { if (!paused) void element.play().catch(() => { if (active) setBlocked(true); }); };
    if (paused) element.pause(); else play();
    return () => { active = false; element.pause(); };
  }, [url, paused]);
  useEffect(() => { const element = video.current; if (element) { element.volume = configuration.volume * videoVolume; element.muted = configuration.volume * videoVolume === 0; } }, [configuration.volume, videoVolume, url]);
  const start = () => {
    const element = video.current; if (!element) return;
    if (configuration.startSec >= element.duration || configuration.endSec !== null && configuration.endSec > element.duration) { setError('主页视频片段超出时长'); element.pause(); return; }
    element.currentTime = configuration.startSec;
  };
  useEffect(() => { if (video.current && video.current.readyState >= 1) start(); }, [configuration.startSec, configuration.endSec, url]);
  const finish = () => { const element = video.current; if (!element) return;
    if (configuration.loop) { element.currentTime = configuration.startSec; if (!paused) void element.play().catch(() => setBlocked(true)); }
    else element.pause(); };
  const videoStatus = error ? 'failed' : !display.titleVideo || readyFrame === frameIdentity ? 'ready' : 'pending';
  return <>{createPortal(<div className="gc-title-media" aria-hidden="true" data-gc-media-status={videoStatus}>
    {display.titleBackground && <ResourceImage host={host} asset={snapshot.assets.find(item => item.assetId === display.titleBackground)} alt=""/>}
    {url && <video ref={video} src={url} playsInline muted={configuration.volume * videoVolume === 0} style={{ objectFit: configuration.fit, visibility: videoStatus === 'ready' ? 'visible' : 'hidden' }} onLoadedMetadata={start}
      onEnded={finish} onTimeUpdate={() => { if (configuration.endSec !== null && video.current && video.current.currentTime >= configuration.endSec) finish(); }}
      onError={() => setError('主页视频读取失败')}/>}
  </div>, backgroundRoot)}{blocked && !error && <button className="gc-title-video-enable" onClick={() => { void video.current?.play().then(() => setBlocked(false)).catch(() => setError('主页视频播放受阻')); }}>启用主页视频</button>}
    {error && <p role="status">{error}</p>}</>;
}
