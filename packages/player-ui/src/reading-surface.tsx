import type { HTMLAttributes, ReactNode, RefAttributes } from 'react';
import { useSyncExternalStore } from 'react';
import type { DialogueSegment } from '@galcraft/contracts';
import { sliceDialogueRuns } from '@galcraft/runtime';
import { DialogueText } from './dialogue-text.js';

type ElementProps<T> = HTMLAttributes<T> & RefAttributes<T>;
export type ReadingSurfaceParts = Record<'panel'|'name'|'nameText'|'body'|'text'|'portrait'|'children',(children?:ReactNode)=>ReactNode>;
export function textProgress(initial: number) {
  let shown = initial;
  const listeners = new Set<() => void>();
  return { current:()=>shown, subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    reveal:(value:number)=>{shown=value;for(const listener of listeners)listener();} };
}
function RevealedText({progress,runs,start,shown,scale,paragraphGap}:{progress?:ReturnType<typeof textProgress>;runs:DialogueSegment[];start:number;shown:number;scale:number;paragraphGap?:number}) {
  const count=useSyncExternalStore(progress?.subscribe??(()=>()=>{}),progress?.current??(()=>shown),()=>shown);
  return <DialogueText runs={sliceDialogueRuns(runs,start,count)} scale={scale} paragraphGap={paragraphGap}/>;
}
/** The complete reading structure shared by live play and independent reading samples. */
export function ReadingSurface({ panel, name, nameText, body, text, speaker, portrait, runs, start = 0, shown, scale, paragraphGap, nvl = false, legacy = false, children, compose, progress }: {
  panel?: ElementProps<HTMLElement>; name?: ElementProps<HTMLHeadingElement>; body?: ElementProps<HTMLDivElement>; text?: ElementProps<HTMLSpanElement>;
  nameText?: ElementProps<HTMLSpanElement>; speaker: string; portrait?: ReactNode; runs: DialogueSegment[]; start?: number; shown: number; scale: number; paragraphGap?: number;
  nvl?: boolean; legacy?: boolean; children?: ReactNode;
  compose?(parts:ReadingSurfaceParts):ReactNode;
  progress?:ReturnType<typeof textProgress>;
}) {
  if(compose)return compose({
    panel:content=><section {...panel} data-gc-page="story" className={`${legacy?'gc-reading-legacy':'gc-reading-panel'}${nvl?' gc-nvl':''}${panel?.className?` ${panel.className}`:''}`}>{content}</section>,
    name:content=><h2 {...name} hidden={nvl||name?.hidden} className="gc-speaker">{content}</h2>,
    nameText:content=><span {...nameText}>{speaker||(legacy?'':'\u00a0')}{content}</span>,
    body:content=><div {...body} className="gc-body" onWheel={event=>{if(!nvl)event.stopPropagation();}}>{!nvl&&<span className="gc-dialogue-measure" aria-hidden="true"><DialogueText runs={runs} scale={scale}/></span>}{content}</div>,
    text:content=><span {...text} className="gc-dialogue-visible"><RevealedText progress={progress} runs={runs} start={start} shown={shown} scale={scale} paragraphGap={paragraphGap}/>{content}</span>,
    portrait:content=><div className="gc-dialogue-portrait">{!nvl&&portrait}{content}</div>,
    children:content=><>{children}{content}</>,
  });
  return <section {...panel} data-gc-page="story" className={`${legacy ? 'gc-reading-legacy' : 'gc-reading-panel'}${nvl ? ' gc-nvl' : ''}${panel?.className ? ` ${panel.className}` : ''}`}>
    {!nvl && portrait}
    <h2 {...name} hidden={nvl || name?.hidden} className="gc-speaker"><span {...nameText}>{speaker || (legacy ? '' : '\u00a0')}</span></h2>
    <div {...body} className="gc-body" onWheel={event => { if (!nvl) event.stopPropagation(); }}>
      {!nvl && <span className="gc-dialogue-measure" aria-hidden="true"><DialogueText runs={runs} scale={scale}/></span>}
      <span {...text} className="gc-dialogue-visible"><RevealedText progress={progress} runs={runs} start={start} shown={shown} scale={scale} paragraphGap={paragraphGap}/></span>
    </div>
    {children}
  </section>;
}

export function readingBackground(background: { color: string; colorOpacity: number }, opacity: number, gradient: boolean) {
  const color = `color-mix(in srgb, ${background.color} ${background.colorOpacity * opacity * 100}%, transparent)`;
  return { backgroundColor: gradient ? 'transparent' : color, backgroundImage: gradient ? `linear-gradient(to bottom, transparent, ${color} 24px, ${color})` : 'none' };
}
