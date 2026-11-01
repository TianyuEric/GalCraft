/** Adoption changes only the author's reviewed draft; compile keeps the original source. */
export function adoptCanvasStyle(source:string):string {
  return source.replace(/(-?(?:\d*\.)?\d+)(vw|vh)\b/g,(_match,value:string,unit:string)=>`calc(var(--gc-canvas-${unit==='vw'?'width':'height'}) * ${Number(value)/100})`)
    .replace(/@media\s*([^{}]+)(?=\{)/g,(match,query:string)=>/\((?:min-|max-)?(?:width|height|aspect-ratio)\s*:/.test(query)?`@container gc-work-canvas ${query.replace(/\b(?:only\s+)?screen\s*(?:and\s*)?/g,'').trim()} `:match);
}
export function hostViewportStyleLocations(source:string) {
  return [...source.matchAll(/-?(?:\d*\.)?\d+(?:vw|vh)\b|@media\s*[^{}]*\((?:min-|max-)?(?:width|height|aspect-ratio)\s*:[^{}]*/g)].map(match=>({start:match.index,end:match.index+match[0].length,line:source.slice(0,match.index).split('\n').length,rule:match[0]}));
}
