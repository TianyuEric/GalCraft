import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentConfig, Issue, PlayerHost, UIImageBinding } from '@galcraft/contracts';
import { effectiveImages } from '@galcraft/templates';
import { decodeMountedImage } from './resource-image.js';
import { registerVisualImageLease } from './visual-handoff.js';
export function scaledBorders(b: NonNullable<UIImageBinding['borders']>, scale: number, width: number, height: number) {
  const fit=Math.min(scale, b.left+b.right ? width/(b.left+b.right) : Infinity, b.top+b.bottom ? height/(b.top+b.bottom) : Infinity);
  return {top:b.top*fit,right:b.right*fit,bottom:b.bottom*fit,left:b.left*fit};
}
function Image({binding,slot,part,host,scale,element,report}:{binding:UIImageBinding;slot:string;part:string;host:PlayerHost;scale:number;element:HTMLElement;report:(id:string,issue:Issue|null)=>void}) {
 const identity=useId();
 const generation=useRef(0);
 const [uri,setUri]=useState(''),[status,setStatus]=useState<'pending'|'ready'|'failed'>('pending'),[size,setSize]=useState({width:element.clientWidth,height:element.clientHeight});
 useLayoutEffect(()=>{const observer=new ResizeObserver(()=>setSize({width:element.clientWidth,height:element.clientHeight}));observer.observe(element);return()=>observer.disconnect();},[element]);
 useEffect(()=>{
   const current=++generation.current;setUri('');setStatus('pending');report(identity,null);let active=true,release:(()=>void)|undefined;
   const failed=(message:string)=>{if(active){setStatus('failed');report(identity,{code:slot==='icon'?'UI_ICON_UNAVAILABLE':'UI_IMAGE_UNAVAILABLE',severity:'warning',owner:'M08',message,related:[{kind:'asset',id:binding.assetId},{kind:'variant',id:binding.variantId}],actions:['supplyDependency','edit']});}};
   void host.resources.resolve(binding.assetId,binding.variantId).then(result=>{
     if(!result.ok){failed(result.error.message);return;}if(!active){result.value.release();return;}release=registerVisualImageLease(element,result.value.release);
     setUri(result.value.uri);
   }).catch(error=>failed(error instanceof Error?error.message:String(error)));
   return()=>{active=false;if(generation.current===current)generation.current++;report(identity,null);release?.();};
 },[host,binding.assetId,binding.variantId,slot,identity,report,element]);
 const failed=(message:string)=>{setStatus('failed');report(identity,{code:slot==='icon'?'UI_ICON_UNAVAILABLE':'UI_IMAGE_UNAVAILABLE',severity:'warning',owner:'M08',message,related:[{kind:'asset',id:binding.assetId},{kind:'variant',id:binding.variantId}],actions:['supplyDependency','edit']});};
 if(!uri)return <span aria-hidden="true" data-gc-image="" data-gc-image-slot={slot} data-gc-media-status={status} style={{visibility:'hidden'}}/>;
 const style:CSSProperties={position:'absolute',inset:0,pointerEvents:'none',zIndex:-1,opacity:binding.opacity,backgroundPosition:`${binding.positionX*100}% ${binding.positionY*100}%`,backgroundRepeat:'no-repeat'};
 if(slot==='icon')Object.assign(style,element.tagName==='BUTTON'
  ?{position:'relative',display:'inline-block',width:'1.15em',height:'1.15em',inset:'auto',flex:'0 0 1.15em',order:-1,zIndex:0}
  :{width:'1.4em',height:'1.4em',inset:'50% auto auto .5em',transform:'translateY(-50%)'});
 if(binding.mode==='nineSlice'&&binding.slices&&binding.borders){if(!size.width||!size.height)return null;const b=scaledBorders(binding.borders,scale,size.width,size.height),s=binding.slices;Object.assign(style,{boxSizing:'border-box',borderStyle:'solid',borderColor:'transparent',borderImageSource:`url("${uri}")`,borderImageSlice:`${s.top} ${s.right} ${s.bottom} ${s.left}${binding.fillCenter?' fill':''}`,borderWidth:`${b.top}px ${b.right}px ${b.bottom}px ${b.left}px`,borderImageRepeat:'stretch'});}
 else if(binding.colorMode==='mask')Object.assign(style,{maskImage:`url("${uri}")`,maskSize:binding.mode==='native'?'auto':binding.mode,maskPosition:style.backgroundPosition,maskRepeat:'no-repeat',backgroundColor:binding.tint??'currentColor'});
 else Object.assign(style,{backgroundImage:`url("${uri}")`,backgroundSize:binding.mode==='native'?'auto':binding.mode});
 return <span aria-hidden="true" data-gc-image="" data-gc-media-status={status} data-gc-image-slot={slot} data-gc-image-ready={status==='ready'?'true':undefined} data-gc-part={`${part}.image.${slot}`} style={{...style,visibility:status==='ready'?'visible':'hidden'}}>
   <img src={uri} alt="" style={{position:'absolute',width:0,height:0,visibility:'hidden'}} onLoad={event=>{const current=generation.current;void decodeMountedImage(event.currentTarget).then(()=>{if(generation.current===current)setStatus('ready');}).catch(error=>{if(generation.current===current)failed(error instanceof Error?error.message:String(error));});}} onError={()=>failed('图片读取失败')}/>
 </span>;
}
function TargetImages({element,config,host,scale,sequence,report}:{element:HTMLElement;config:ComponentConfig;host:PlayerHost;scale:number;sequence:number;report:(id:string,issue:Issue|null)=>void}) {
 const [container]=useState(()=>{const node=document.createElement('span');node.dataset.gcImageTarget='';node.style.display='contents';return node;});
 const [currentState,setCurrentState]=useState(()=>element.dataset.gcState??'normal');
 useLayoutEffect(()=>{const update=()=>setCurrentState(element.dataset.gcState??'normal');const observer=new MutationObserver(update);observer.observe(element,{attributes:true,attributeFilter:['data-gc-state']});update();return()=>observer.disconnect();},[element]);
 // A page may replace its text children. Keep portal children inside a separate container
 // so the page can detach that container without changing React's decoration child list.
 useLayoutEffect(()=>{element.append(container);return()=>container.remove();},[element,container,sequence]);
 return createPortal(<>{(['normal','hover','pressed','focus','disabled','selected','locked','empty'] as const).map(state=><span key={state} hidden={state!==currentState} data-gc-image-state={state}>{Object.entries(effectiveImages(config,state)).map(([slot,binding])=>binding&&<Image key={`${slot}:${binding.assetId}:${binding.variantId}`} binding={binding} slot={slot} part={config.part} host={host} scale={scale} element={element} report={report}/>)}</span>)}</>,container);
}
/** React owns the decoration children; each target remains owned by its page or plugin. */
export function TemplateImages({root,host,part,sequence,scale,onIssues}:{root:HTMLElement;host:PlayerHost;part(key:string,element:HTMLElement):ComponentConfig|null;sequence:number;scale:number;onIssues?:(issues:Issue[])=>void}) {
 const [targets,setTargets]=useState<{element:HTMLElement;config:ComponentConfig}[]>([]);
 const failures=useRef(new Map<string,Issue>()),notify=useRef(onIssues);notify.current=onIssues;
 const report=useCallback((id:string,issue:Issue|null)=>{if(issue)failures.current.set(id,issue);else if(!failures.current.delete(id))return;
   notify.current?.([...new Map([...failures.current.values()].map(value=>[JSON.stringify([value.code,value.related]),value])).values()]);},[]);
 useLayoutEffect(()=>{setTargets([...root.querySelectorAll<HTMLElement>('[data-gc-part]:not([data-gc-image])')].filter(element=>!element.closest('.gc-visual-hold')).flatMap(element=>{const config=part(element.dataset.gcPart!,element);return config&&(Object.values(config.normal.images??{}).some(Boolean)||Object.values(config.states).some(s=>Object.values(s.images??{}).some(Boolean)))?[{element,config}]:[];}));},[sequence,root]);
 return <>{targets.filter(t=>t.element.isConnected).map(({element,config},index)=><TargetImages key={`${config.id}-${index}`} element={element} config={config} host={host} scale={scale} sequence={sequence} report={report}/>)}</>;
}
