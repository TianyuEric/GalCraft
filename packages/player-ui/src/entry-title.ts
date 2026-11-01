import type { Transition } from '@galcraft/contracts';
import { defaultEffectValues, ease, paintGridTransition, sampleObjectAnimation, type ExecutableAnimation } from '@galcraft/stage';

type Surface={mask:HTMLCanvasElement;white:HTMLCanvasElement;filter:SVGSVGElement;functions:SVGFEFuncRElement[];opacity:number};
const surfaces=new WeakMap<HTMLElement,Surface>();
export function createEntryTitle(lines:readonly string[]) {
  const element=document.createElement('aside');element.className='gc-entry-title';element.dataset.gcPart='story.entryTitle';
  for(const [index,line] of lines.entries()){const text=document.createElement(index?'strong':'span');text.textContent=line;element.append(text);}return element;
}
function surface(element:HTMLElement){
  let value=surfaces.get(element);if(value)return value;
  const mask=document.createElement('canvas'),white=document.createElement('canvas');mask.width=white.width=512;mask.height=white.height=128;
  white.getContext('2d')!.fillStyle='#fff';white.getContext('2d')!.fillRect(0,0,white.width,white.height);
  const ns='http://www.w3.org/2000/svg',filter=document.createElementNS(ns,'svg'),definition=document.createElementNS(ns,'filter'),transfer=document.createElementNS(ns,'feComponentTransfer');
  definition.id=`gc-title-color-${crypto.randomUUID()}`;definition.setAttribute('color-interpolation-filters','sRGB');definition.append(transfer);filter.append(definition);filter.style.cssText='position:absolute;width:0;height:0;pointer-events:none';filter.setAttribute('aria-hidden','true');element.append(filter);
  const functions=['feFuncR','feFuncG','feFuncB'].map(name=>{const item=document.createElementNS(ns,name) as SVGFEFuncRElement;item.setAttribute('type','gamma');transfer.append(item);return item;});
  value={mask,white,filter,functions,opacity:Number(getComputedStyle(element).opacity)};surfaces.set(element,value);return value;
}
/** DOM titles retain their text while sharing Stage's clock, masks and resource sampler. */
export function paintEntryTitle(element:HTMLElement,spec:Transition,progress:number,entering:boolean,animation:ExecutableAnimation|undefined,reduced:boolean,scale=1){
  const value=surface(element),style=element.style,raw=Math.max(0,Math.min(1,progress)),eased=ease(raw,spec.easing.family,spec.easing.direction),amount=entering?eased:1-eased;
  style.opacity=String(value.opacity);style.translate='';style.scale='';style.rotate='';style.filter='';style.clipPath='';style.maskImage='';style.mixBlendMode='';
  if(reduced||spec.preset==='cut')return;
  if(spec.preset==='custom'&&animation){
    const duration=Array.isArray(animation)?animation.reduce((sum,item)=>sum+item.durationMs,0):animation.durationMs;
    const base={id:'Title1',current:structuredClone(defaultEffectValues),defaults:structuredClone(defaultEffectValues),processes:[]};
    const current=sampleObjectAnimation(base,animation,eased*duration).current;
    style.opacity=String(value.opacity*current.opacity);style.translate=`${current.x*scale}px ${current.y*scale}px`;style.scale=`${current.scaleX} ${current.scaleY}`;style.rotate=`${current.rotationDeg}deg`;
    value.functions.forEach((item,index)=>{item.setAttribute('amplitude',String(current.rgb[index]!/255));item.setAttribute('exponent',String(1/Math.max(.001,current.gamma)));item.setAttribute('offset','0');});
    style.filter=`blur(${current.blur*scale}px) brightness(${current.brightness}) contrast(${current.contrast}) saturate(${current.saturation}) url(#${value.filter.firstElementChild!.id})`;
    style.mixBlendMode=current.blend==='add'?'plus-lighter':current.blend;
    if(current.circle){const circle=current.circle,size=Math.min(element.offsetWidth,element.offsetHeight),radius=circle.radius*size,feather=Math.max(circle.softness,.00001)*size,inside=circle.invert?'transparent':'#fff',outside=circle.invert?'#fff':'transparent';
      style.maskImage=radius+feather<=0?`linear-gradient(${outside},${outside})`:`radial-gradient(circle at ${circle.centerX*100}% ${circle.centerY*100}%,${inside} ${Math.max(0,radius-feather)}px,${outside} ${Math.max(0,radius+feather)}px)`;style.maskSize='100% 100%';}
    return;
  }
  if(spec.preset==='fade'){style.opacity=String(value.opacity*amount);return;}
  if(spec.preset==='slide'){const sign=spec.direction==='left'||spec.direction==='up'?-1:1,offset=(1-amount)*80*sign*scale;style.translate=['left','right'].includes(spec.direction)?`${offset}px 0`:`0 ${offset}px`;return;}
  if(spec.preset==='wipe'){const hidden=(1-amount)*100;style.clipPath=spec.direction==='left'?`inset(0 0 0 ${hidden}%)`:spec.direction==='right'?`inset(0 ${hidden}% 0 0)`:spec.direction==='up'?`inset(${hidden}% 0 0 0)`:`inset(0 0 ${hidden}% 0)`;return;}
  const context=value.mask.getContext('2d')!;context.clearRect(0,0,value.mask.width,value.mask.height);
  if(spec.preset==='gridFlip'||spec.preset==='diagonalReveal')paintGridTransition(context,value.white,value.mask,spec,raw,entering);
  else if(spec.preset==='blinds'){
    const horizontal=['left','right'].includes(spec.direction),reverse=['left','up'].includes(spec.direction),span=(horizontal?value.mask.width:value.mask.height)/12;
    context.fillStyle='#fff';for(let index=0;index<12;index++){const offset=index*span+(reverse?span*(1-amount):0);context.fillRect(horizontal?offset:0,horizontal?0:offset,horizontal?span*amount:value.mask.width,horizontal?value.mask.height:span*amount);}
  }else if(spec.preset==='dissolve'){
    context.fillStyle='#fff';for(let y=0;y<16;y++)for(let x=0;x<64;x++)if(((x*17+y*29)%101)/101<amount)context.fillRect(x*8,y*8,8,8);
  }
  style.maskImage=`url(${value.mask.toDataURL()})`;style.maskSize='100% 100%';
}
export function releaseEntryTitle(element:HTMLElement){surfaces.get(element)?.filter.remove();surfaces.delete(element);}
