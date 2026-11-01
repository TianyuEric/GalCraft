import type { Ref } from 'react';

export function ReadingStatus({mode,part}:{mode:'auto'|'skip';part?:Ref<HTMLSpanElement>}) {
  return <span className="gc-reading-status" ref={part}>{mode==='auto'?'▶ AUTO':'≫ SKIP'}</span>;
}
export function FilmBars({top,bottom}:{top:number;bottom:number}) {
  return <div className="gc-film-bars" aria-hidden="true" style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:9}}><div style={{position:'absolute',inset:'0 0 auto',height:`${top*100}%`,background:'#000'}}/><div style={{position:'absolute',inset:'auto 0 0',height:`${bottom*100}%`,background:'#000'}}/></div>;
}
