import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PlayerHost, Snapshot } from '@galcraft/contracts';
import { registerVisualImageLease } from './visual-handoff.js';
/** Call after load on the mounted image that will own the visible pixels. */
export async function decodeMountedImage(element: HTMLImageElement) {
  await element.decode();
  if (!element.complete || element.naturalWidth === 0) throw new Error('图片未完整加载');
}

type Props = { host: PlayerHost; asset: Snapshot['assets'][number] | undefined; alt: string; className?: string; style?: CSSProperties };

function MountedResourceImage({ host, asset, alt, className, style }: Props) {
  const [resource, setResource] = useState<{ uri: string; release(): void } | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<'pending' | 'ready' | 'failed'>(asset ? 'pending' : 'failed');
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    let lease: { uri: string; release(): void } | null = null;
    setResource(null); setStatus(asset ? 'pending' : 'failed');
    if (asset) void host.resources.resolve(asset.assetId, asset.variantId).then(result => {
      if (generation.current !== current) { if (result.ok) result.value.release(); return; }
      if (!result.ok) { setStatus('failed'); return; }
      lease = { uri: result.value.uri, release: result.value.release }; setResource(lease);
    }).catch(() => { if (generation.current === current) setStatus('failed'); });
    return () => { generation.current++; lease?.release(); };
  }, [host, asset?.assetId, asset?.variantId]);
  useLayoutEffect(() => {
    if (resource && image.current) resource.release = registerVisualImageLease(image.current, resource.release);
  }, [resource]);
  const loaded = (element: HTMLImageElement) => {
    const current = generation.current;
    void decodeMountedImage(element).then(() => {
      if (generation.current === current) setStatus('ready');
    }).catch(() => { if (generation.current === current) setStatus('failed'); });
  };
  return resource ? <img ref={image} src={resource.uri} alt={alt} className={className}
    style={{ ...style, ...(status !== 'ready' ? { visibility: 'hidden' } : {}) }} data-gc-media-status={status}
    onLoad={event => loaded(event.currentTarget)} onError={() => setStatus('failed')} />
    : <span className="gc-image-placeholder" data-gc-media-status={status} aria-label={alt}>◇</span>;
}

export function ResourceImage(props: Props) {
  // A changed asset cannot inherit a previous image's ready state for one render.
  return <MountedResourceImage key={`${props.asset?.assetId}/${props.asset?.variantId}`} {...props} />;
}
