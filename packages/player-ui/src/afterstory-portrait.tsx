import { useEffect, useRef, useState } from 'react';
import type { Character, PlayerHost, Snapshot } from '@galcraft/contracts';

/** Renders the original canvas coordinates, including cropped-file offsets. */
export function AfterstoryPortrait({ character, snapshot, host, locked, label }: {
  character: Character; snapshot: Snapshot; host: PlayerHost; locked: boolean; label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), [failed, setFailed] = useState(false);
  const presentation = character.afterstory?.presentation;
  const figure = presentation?.figure ?? character.differences?.find(item => item.id === character.initialDifferenceId)?.figure ??
    { assetId: character.groups[0]?.assetIds[0] ?? character.avatar, variantId: null };
  const asset = snapshot.assets.find(item => item.assetId === figure.assetId && (!figure.variantId || item.variantId === figure.variantId));
  const crop = presentation?.crop ?? { x: .1, y: 0, width: .8, height: .6 };
  useEffect(() => {
    let active = true, release: (() => void) | undefined;
    const context = canvas.current?.getContext('2d'); context?.clearRect(0, 0, 600, 760); setFailed(false);
    if(canvas.current)canvas.current.dataset.gcMediaStatus='pending';
    const failed=()=>{setFailed(true);if(canvas.current)canvas.current.dataset.gcMediaStatus='failed';};
    if (!asset) { failed(); return; }
    void host.resources.resolve(asset.assetId, asset.variantId).then(async result => {
      if (!result.ok) { if (active) failed(); return; }
      if (!active) { result.value.release(); return; } release = result.value.release;
      const image = new Image(); image.crossOrigin = 'anonymous'; image.src = result.value.uri;
      try {
        await image.decode(); if (!active || !context) return;
        const width = asset.canvas?.width ?? image.naturalWidth, height = asset.canvas?.height ?? image.naturalHeight;
        const offsetX = asset.canvas?.offsetX ?? 0, offsetY = asset.canvas?.offsetY ?? 0;
        const x = crop.x * width, y = crop.y * height, sw = crop.width * width, sh = crop.height * height;
        const scale = Math.min(600 / sw, 760 / sh);
        context.save(); context.beginPath(); context.rect((600-sw*scale)/2,(760-sh*scale)/2,sw*scale,sh*scale);context.clip();
        context.drawImage(image, (offsetX - x) * scale + (600 - sw * scale) / 2, (offsetY - y) * scale + (760 - sh * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
        if (locked) { context.globalCompositeOperation = 'source-in'; context.fillStyle = getComputedStyle(canvas.current!).getPropertyValue('--gc-afterstory-silhouette').trim() || '#858585'; context.fillRect(0, 0, 600, 760); context.globalCompositeOperation = 'source-over'; }
        context.restore();
        canvas.current!.dataset.gcMediaStatus='ready';
      } catch { if (active) failed(); }
    }).catch(()=>{if(active)failed();});
    return () => { active = false; release?.(); };
  }, [host, asset?.assetId, asset?.variantId, crop.x, crop.y, crop.width, crop.height, locked]);
  return <div className="gc-afterstory-portrait"><canvas ref={canvas} data-gc-media-status="pending" width={600} height={760} role="img" aria-label={label}/>{failed && <span className="gc-afterstory-missing" aria-label={label}/>}</div>;
}
