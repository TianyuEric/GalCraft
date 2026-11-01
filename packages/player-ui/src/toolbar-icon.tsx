import { useLayoutEffect, useRef, useState } from 'react';
export function ToolbarIcon({kind}:{kind:'lock'|'voice'|'more'}) {
  const ref=useRef<SVGSVGElement>(null),[customReady,setCustomReady]=useState(false);
  useLayoutEffect(()=>{
    const button=ref.current?.parentElement;if(!button)return;
    const update=()=>{const state=button.dataset.gcState??'normal';setCustomReady(!!button.querySelector(`[data-gc-image-state="${state}"] [data-gc-image-slot="icon"][data-gc-image-ready="true"]`));};
    const observer=new MutationObserver(update);observer.observe(button,{attributes:true,attributeFilter:['data-gc-state','data-gc-image-ready'],childList:true,subtree:true});update();return()=>observer.disconnect();
  },[]);
  const paths={lock:'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v3',voice:'M5 9h4l5-5v16l-5-5H5zM18 8a6 6 0 0 1 0 8',more:'M5 12h.01M12 12h.01M19 12h.01'};
  return <svg ref={ref} data-gc-default-icon={kind} style={customReady?{display:'none'}:undefined} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
