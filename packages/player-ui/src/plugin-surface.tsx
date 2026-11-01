import { isValidElement, useLayoutEffect, useRef } from 'react';
/** React owns the boundary. A DOM plugin exclusively owns its children. */
export function PluginSurface({rendered,publicParts,part}:{rendered:unknown;publicParts:string[];part(key:string):(node:HTMLElement|null)=>void}) {
 const host=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
   const element=host.current;if(!element)return;
   if(rendered instanceof Node)element.append(rendered);
   const bind=()=>{for(const node of element.querySelectorAll<HTMLElement>('[data-part]')){const key=node.dataset.part!;if(publicParts.includes(key)){node.dataset.gcPart=key;part(key)(node);}}};bind();
   const observer=new MutationObserver(bind);observer.observe(element,{childList:true,subtree:true});
   return()=>{observer.disconnect();if(rendered instanceof Node&&rendered.parentNode===element)element.removeChild(rendered);};
 },[rendered,publicParts,part]);
 return <div ref={host} data-gc-plugin-host={rendered instanceof Node?'dom':'react'}>{isValidElement(rendered)?rendered:null}</div>;
}
