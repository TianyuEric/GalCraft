import React, { useEffect, useRef } from 'react';
import type { Id, PlayerHost, PresentationState, Snapshot } from '@galcraft/contracts';
import { decodeMountedImage } from './resource-image.js';

type ImageRef = { assetId: Id; variantId: Id; crop: {x:number;y:number;width:number;height:number} | null };
export function SharedPortrait({ host, snapshot, characterId, current, unavailable }: {
  host: PlayerHost; snapshot: Snapshot; characterId: Id; current(): PresentationState | null; unavailable(message: string|null): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true, frame = 0;
    const images = new Map<string, HTMLImageElement>(), pending = new Set<string>(), failures = new Map<string,string>(), releases: (()=>void)[] = [];
    let lastProblem:string|null=null;
    const surface = document.createElement('canvas'); surface.width = 440; surface.height = 440;
    const resolve = (ref: ImageRef) => {
      const key = `${ref.assetId}/${ref.variantId}`; if (images.has(key)) return images.get(key)!;
      if (!pending.has(key)) { pending.add(key);
        void host.resources.resolve(ref.assetId, ref.variantId).then(result => {
          if (!result.ok) { if (active) failures.set(key,result.error.message); return; }
          if (!active) { result.value.release(); return; } releases.push(result.value.release);
          const image = new Image(); image.crossOrigin='anonymous'; image.onload = () => { void decodeMountedImage(image).then(()=>{if(active)images.set(key,image);}).catch(()=>{if(active)failures.set(key,'角色差分头像图片不可用');}); };
          image.onerror = () => { if (active) failures.set(key,'角色差分头像图片不可用'); }; image.src = result.value.uri;
        }).catch(error=>{if(active)failures.set(key,String(error));}); }
      return null;
    };
    const draw = (context: CanvasRenderingContext2D, ref: ImageRef, weight: number) => {
      const image = resolve(ref); if (!image) return;
      const asset = snapshot.assets.find(item=>item.assetId===ref.assetId&&item.variantId===ref.variantId);
      const width = asset?.canvas?.width ?? image.naturalWidth, height = asset?.canvas?.height ?? image.naturalHeight;
      const crop = ref.crop ?? {x:0,y:0,width:1,height:1};
      const sw=width*crop.width, sh=height*crop.height, scale=Math.min(440/sw,440/sh);
      const offsetX=asset?.canvas?.offsetX??0,offsetY=asset?.canvas?.offsetY??0,x=crop.x*width,y=crop.y*height;
      const left=Math.max(x,offsetX),top=Math.max(y,offsetY),right=Math.min(x+sw,offsetX+image.naturalWidth),bottom=Math.min(y+sh,offsetY+image.naturalHeight);
      context.globalAlpha=weight;
      if(right>left&&bottom>top)context.drawImage(image,left-offsetX,top-offsetY,right-left,bottom-top,(440-sw*scale)/2+(left-x)*scale,(440-sh*scale)/2+(top-y)*scale,(right-left)*scale,(bottom-top)*scale);
    };
    const tick = () => {
      if (!active) return;
      const shared=current()?.characterDifferences?.[characterId], target=canvas.current, context=target?.getContext('2d'), mix=surface.getContext('2d');
      let problem:string|null=null;
      if(context&&mix&&target){
        if(shared?.avatar&&shared.avatarVisible){
          const next:ImageRef={assetId:shared.avatar.kind==='image'?shared.avatar.assetId:shared.figure.assetId,
            variantId:shared.avatar.kind==='image'?shared.avatar.variantId:shared.figure.variantId,crop:shared.avatar.kind==='crop'?shared.avatar.crop:null};
          problem=failures.get(`${next.assetId}/${next.variantId}`)??null;
          const nextReady=resolve(next),previousReady=shared.previous?resolve(shared.previous):true;
          target.dataset.gcMediaStatus=problem?'failed':nextReady&&previousReady?'ready':'pending';
          if(!nextReady||!previousReady){if(problem!==lastProblem){lastProblem=problem;unavailable(problem);}frame=requestAnimationFrame(tick);return;}
          context.clearRect(0,0,440,440);mix.clearRect(0,0,440,440);
          const progress=shared.durationMs===0?1:Math.min(1,shared.elapsedMs/shared.durationMs);
          mix.globalCompositeOperation='lighter'; if(shared.previous)draw(mix,shared.previous,1-progress);draw(mix,next,shared.previous?progress:1);
          mix.globalAlpha=1;context.drawImage(surface,0,0);
        }else{context.clearRect(0,0,440,440);target.dataset.gcMediaStatus='ready';}
      } if(problem!==lastProblem){lastProblem=problem;unavailable(problem);}frame=requestAnimationFrame(tick);
    }; tick();
    return()=>{active=false;cancelAnimationFrame(frame);if(lastProblem)unavailable(null);for(const release of releases)release();};
  },[host,snapshot.snapshotId,characterId]);
  return <canvas ref={canvas} data-gc-media-status="pending" className="gc-dialogue-portrait" width={440} height={440} aria-label={snapshot.characters.find(item=>item.id===characterId)?.name}/>;
}
