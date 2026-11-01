import { ease } from '@galcraft/stage';
import type { UIAnimation } from '@galcraft/contracts';

export function animationFrames(definition: UIAnimation, reduced: boolean,scale=1) {
  const segments=definition.segments,total=segments.reduce((sum,segment)=>sum+Math.max(0,segment.durationMs),0);
  let time=0,opacity=1,x=0,y=0,size=1;const frames:Keyframe[]=[];
  const easing=(segment:UIAnimation['segments'][number])=>segment.easing.family==='linear'?'linear':`linear(${Array.from({length:25},(_,index)=>ease(index/24,segment.easing.family,segment.easing.direction)).join(',')})`;
  if(segments[0]?.durationMs)frames.push({offset:0,opacity,transform:'translate(0px,0px) scale(1)'});
  for(const segment of segments){
    if(frames.length)frames[frames.length-1]!.easing=easing(segment);
    time+=Math.max(0,segment.durationMs);opacity=segment.opacity??opacity;x=segment.translateX??x;y=segment.translateY??y;size=segment.scale??size;
    frames.push({offset:total?time/total:1,opacity,...(reduced?{}:{transform:`translate(${x*scale}px,${y*scale}px) scale(${size})`})});
  }
  return {frames,duration:reduced?(definition.reduced==='finish'?0:Math.min(total,80)):total};
}
export class PageTransition {
  busy=false;
  private generation=0;
  private animations=new Set<Animation>();
  private lockedElement:HTMLElement|null=null;
  private interrupted:Keyframe|null=null;
  interrupt(element:HTMLElement){
    const style=getComputedStyle(element);
    this.interrupted=this.animations.size?{opacity:style.opacity,transform:style.transform}:null;
    for(const animation of this.animations)animation.cancel();this.animations.clear();
  }
  cancel(){this.generation++;for(const animation of this.animations)animation.cancel();this.animations.clear();if(this.lockedElement)this.lockedElement.inert=false;this.lockedElement=null;this.busy=false;}
  async play(element:HTMLElement,definition:UIAnimation|undefined,reduced:boolean,duration?:number,scale=1,retain=false){
    if(!definition||!element.animate)return;
    const data=animationFrames(definition,reduced,scale),ms=reduced?data.duration:duration??data.duration;
    const base=element.style.transform;
    if(base&&base!=='none')data.frames=data.frames.map(frame=>frame.transform?{...frame,transform:`${base} ${frame.transform}`}:frame);
    if(this.interrupted&&data.frames.length){data.frames[0]={...data.frames[0],...this.interrupted,offset:0};this.interrupted=null;}
    if(!ms||!data.frames.length)return;
    const animation=element.animate(data.frames,{duration:ms,fill:'both'});this.animations.add(animation);
    let completed=false;
    try{await animation.finished;completed=true;}catch{}finally{if(!retain||!completed){animation.cancel();this.animations.delete(animation);}}
  }
  async navigate(element:HTMLElement,exit:UIAnimation|undefined,change:()=>void,enter:()=>UIAnimation|undefined,reduced:boolean,duration?:number,scale=1){
    if(this.busy)return false;this.busy=true;const generation=++this.generation;this.lockedElement=element;element.inert=true;
    try{await this.play(element,exit,reduced,duration===undefined?undefined:duration/2,scale);
      if(generation!==this.generation)return false;
      change();await this.play(element,enter(),reduced,duration===undefined?undefined:duration/2,scale);return generation===this.generation;
    }finally{if(generation===this.generation){this.busy=false;element.inert=false;this.lockedElement=null;}}
  }
}
