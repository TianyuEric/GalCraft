import React from 'react';
import type { PlayerHost, Snapshot } from '@galcraft/contracts';
import { useEffect, useState } from 'react';
import { decodeMountedImage } from './resource-image.js';
import type { ReadingRun } from './reading-style.js';

export function DialogueText({ runs, scale = 1, paragraphGap }: { runs: readonly ReadingRun[]; scale?: number; paragraphGap?: number }) {
  return <>{runs.map((segment, index) => paragraphGap !== undefined && segment.text === '\n\n' ? <span key={index} aria-hidden="true" style={{ display:'block', height:paragraphGap }}/>:<span key={index} style={{ color: segment.color,
    fontSize: segment.fontSize ? `${segment.fontSize * scale}px` : undefined,
    fontFamily: segment.fontId ? `var(--gc-font-${segment.fontId}, inherit)` : undefined,
    fontWeight: segment.bold === undefined ? undefined : segment.bold ? 700 : 400,
    fontStyle: segment.italic === undefined ? undefined : segment.italic ? 'italic' : 'normal' }}>
    {segment.ruby ? <ruby>{segment.text}<rt>{segment.ruby}</rt></ruby> : segment.text}</span>)}</>;
}

export function IndependentPortrait({ host, assetId, snapshot, name, unavailable }: {
  host: PlayerHost; assetId: string; snapshot: Snapshot; name: string; unavailable(message: string): void;
}) {
  const [location, setLocation] = useState({ assetId, uri: '',status:'pending' });
  const uri = location.assetId === assetId ? location.uri : '';
  useEffect(() => {
    let active = true, release: (() => void) | undefined; setLocation({ assetId, uri: '',status:'pending' });
    const failed = () => { if (active) {setLocation({assetId,uri:'',status:'failed'});unavailable(snapshot.project.languages.menuDefault === 'en' ? 'Portrait image unavailable' : '头像图片不可用');} };
    const asset = snapshot.assets.find(item => item.assetId === assetId);
    if (!asset || asset.kind !== 'image') failed();
    else void host.resources.resolve(asset.assetId, asset.variantId).then(result => {
      if (!result.ok) { failed(); return; }
      if (!active) { result.value.release(); return; } release = result.value.release; setLocation({ assetId, uri: result.value.uri,status:'pending' });
    }).catch(failed);
    return () => { active = false; release?.(); };
  }, [host, assetId, snapshot.snapshotId]);
  const status=location.assetId===assetId?location.status:'pending';
  return uri ? <img className="gc-dialogue-portrait" src={uri} alt={name} data-gc-media-status={status} style={{visibility:status==='ready'?'visible':'hidden'}} onLoad={event=>{const element=event.currentTarget;void decodeMountedImage(element).then(()=>setLocation(current=>current.assetId===assetId?{...current,status:'ready'}:current)).catch(()=>setLocation(current=>current.assetId===assetId?{...current,status:'failed'}:current));}} onError={event => { event.currentTarget.style.visibility = 'hidden';setLocation(current=>({...current,status:'failed'})); unavailable('头像图片不可用'); }}/>
    : <span className="gc-dialogue-portrait" data-gc-media-status={status} aria-hidden="true"/>;
}
