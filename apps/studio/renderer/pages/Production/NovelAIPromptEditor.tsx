import {useEffect,useRef} from 'react';
import type {Json} from '@galcraft/contracts';
import {mountNovelAIEditor} from '@galcraft/official-novelai/editor';
export function NovelAIPromptEditor({fields,change,locale}:{fields:Record<string,Json>;change(key:string,value:Json):void;locale:string}){const root=useRef<HTMLDivElement>(null);const callbacks=useRef(change);callbacks.current=change;useEffect(()=>{const abort=new AbortController();const release=mountNovelAIEditor(root.current!,{value:fields,locale,signal:abort.signal,studio:{} as never,commit:async value=>{for(const [key,item]of Object.entries(value as Record<string,Json>))callbacks.current(key,item);return {ok:true,value:undefined,warnings:[]};}});return()=>{abort.abort();release();};},[locale]);return <div ref={root}/>;}
