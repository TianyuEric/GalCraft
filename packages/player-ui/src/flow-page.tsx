import { PlayerSelect } from './select.js';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Flow } from '@galcraft/contracts';
import { businessParts } from './business-parts.js';
import type { BusinessPageAdapter } from './instance-renderer.js';
/** Rank by outgoing edges: common route reads downwards; branches share a row. */
export function verticalFlow(flow: Flow) {
  const ranks = new Map<string, number>(), visiting = new Set<string>();
  const incoming = new Map(flow.nodes.map(n => [n.id, flow.edges.filter(e => e.to === n.id).map(e => e.from)]));
  const rank = (id: string): number => {
    if (ranks.has(id)) return ranks.get(id)!; if (visiting.has(id)) return 0;
    visiting.add(id); const parents = incoming.get(id) ?? [];
    const result = parents.length ? Math.max(...parents.map(parent => rank(parent) + 1)) : 0;
    visiting.delete(id); ranks.set(id, result); return result;
  };
  flow.nodes.forEach(n => rank(n.id));
  const rows = new Map<number, typeof flow.nodes>();
  flow.nodes.forEach(n => { const r = ranks.get(n.id)!; rows.set(r, [...(rows.get(r) ?? []), n]); });
  const width = Math.max(640, ...[...rows.values()].map(row => row.length * 260 + 80));
  const nodes = [...rows.entries()].flatMap(([r, row]) => row.sort((a,b) => a.x-b.x).map((node,i) => ({ ...node, left:(width-row.length*260)/2+i*260+20, top:50+r*140 })));
  return { nodes, width, height:Math.max(400, (Math.max(0,...rows.keys())+1)*140+60) };
}
export function FlowPage({ flows, unlocked, entryDescription, busy = false, label, part, back, enter, compose }: { flows: Flow[]; unlocked: Set<string>; entryDescription(id:string):string; busy?:boolean; label(key:string):string; part(key:string):(node:HTMLElement|null)=>void; back():void; enter(id:string):void;compose?(adapter:BusinessPageAdapter):ReactNode }) {
  const [selected, setSelected] = useState(flows[0]?.id ?? ''), [zoom,setZoom] = useState(1), [active,setActive] = useState<string|null>(null);
  const viewport = useRef<HTMLDivElement>(null), flow = flows.find(f => f.id===selected) ?? flows[0];
  const layout = useMemo(() => flow ? verticalFlow(flow) : null, [flow]);
  const nodes = layout?.nodes.filter(n => unlocked.has(n.id) || n.lockedView !== 'hidden') ?? [];
  const locate = (id:string) => { const node=nodes.find(n=>n.id===id); if(node) viewport.current?.scrollTo({left:node.left*zoom-viewport.current.clientWidth/2+110,top:node.top*zoom-viewport.current.clientHeight/2+32,behavior:viewport.current?.closest('[data-gc-reduced-motion="true"]')?'instant':'smooth'}); };
  const source = <><h1 ref={part('flow.header')}>{label('page.flow')}</h1><nav className="gc-nav"><PlayerSelect ref={part('flow.mapSelect')} aria-label={label('page.flow')} value={selected} options={flows.map(flow=>({value:flow.id,label:flow.name}))} onValueChange={value=>{setSelected(value);setActive(null);}}/><span className="gc-flow-control"><button ref={part('flow.zoomOut')} onClick={()=>setZoom(z=>Math.max(.4,z-.1))}>{label('flow.zoomOut')}</button></span><output>{Math.round(zoom*100)}%</output><span className="gc-flow-control"><button ref={part('flow.zoomIn')} onClick={()=>setZoom(z=>Math.min(2,z+.1))}>{label('flow.zoomIn')}</button></span><span className="gc-flow-control"><button ref={part('flow.fit')} onClick={()=>{if(layout&&viewport.current)setZoom(Math.min(1,viewport.current.clientWidth/layout.width,viewport.current.clientHeight/layout.height));}}>{label('flow.fit')}</button></span></nav>
    <div className="gc-flow-layout"><div className="gc-flow-viewport" ref={node=>{viewport.current=node;part('flow.viewport')(node);}} onWheel={e=>e.stopPropagation()}>
      {layout && <div style={{width:layout.width*zoom,height:layout.height*zoom}}><div className="gc-flow-canvas" style={{width:layout.width,height:layout.height,transform:`scale(${zoom})`,transformOrigin:'top left'}}>
        <svg width={layout.width} height={layout.height} aria-hidden="true">{flow!.edges.map(edge=>{const from=nodes.find(n=>n.id===edge.from),to=nodes.find(n=>n.id===edge.to);if(!from||!to)return null;const x1=from.left+110,y1=from.top+64,x2=to.left+110,y2=to.top;return <g key={edge.id} data-gc-part="flow.edge"><path d={`M${x1},${y1} V${(y1+y2)/2} H${x2} V${y2}`} fill="none"/><text x={(x1+x2)/2+8} y={(y1+y2)/2-8}>{edge.label}</text></g>;})}</svg>
        {nodes.map(node=><div key={node.id} className="gc-flow-node-frame" style={{position:'absolute',left:node.left,top:node.top,width:220}}><button ref={part('flow.node')} data-focus-key={`flow.${node.id}`} data-locked={!unlocked.has(node.id)} aria-pressed={active===node.id} className="gc-flow-node" onClick={()=>setActive(node.id)}>{unlocked.has(node.id)?node.name:'◇  ???'}</button></div>)}
      </div></div>}
    </div><aside className="gc-flow-side"><div className="gc-flow-minimap" ref={part('flow.minimap')}>{layout&&<svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={label('page.flow')}>{nodes.map(n=><rect key={n.id} x={n.left} y={n.top} width="220" height="64" opacity={unlocked.has(n.id)?1:.35} onClick={()=>locate(n.id)}/>)}</svg>}</div><p>{active ? unlocked.has(active)?nodes.find(n=>n.id===active)?.name:'???' : label('page.flow')}</p>{active&&unlocked.has(active)&&<p className="gc-flow-entry-description">{entryDescription(active)}</p>}<button ref={part('flow.enter')} disabled={busy||!active||!unlocked.has(active)} aria-busy={busy} onClick={()=>active&&enter(active)}>{label('action.confirm')}</button></aside></div>
    <button className="gc-page-back" ref={part('flow.back')} onClick={back}>{label('nav.back')}</button></>;
  if(!compose)return source;
  const projection=businessParts(source);
  return compose({data:{flowNodes:nodes,flowEdges:flow?.edges.filter(edge=>nodes.some(node=>node.id===edge.from)&&nodes.some(node=>node.id===edge.to))??[]},
    state:(component,context)=>{const node=context.item as typeof nodes[number]|undefined;if(component.part==='flow.node.title')return{text:node&&unlocked.has(node.id)?node.name:'???'};if(component.part==='flow.node.lock')return{visible:!!node&&!unlocked.has(node.id),text:'◇'};if(component.part==='flow.node.current')return{visible:node?.id===active,text:'●'};if(component.part==='flow.edge.label')return{text:String((context.item as {label?:string})?.label??'')};if(component.part==='flow.entryDescription')return{text:active&&unlocked.has(active)?entryDescription(active):label('page.flow')};return{};},
    business:(component,children,context)=>{if(component.part==='flow.viewport')return<div className="gc-flow-viewport" ref={node=>{viewport.current=node;}} onWheel={event=>event.stopPropagation()}><div style={{position:'relative',width:(layout?.width??0)*zoom,height:(layout?.height??0)*zoom}}><div className="gc-flow-canvas" style={{position:'relative',width:layout?.width,height:layout?.height,transform:`scale(${zoom})`,transformOrigin:'top left'}}>{children}</div></div></div>;
      if(component.part==='flow.edges')return<div style={{pointerEvents:'none'}}>{children}</div>;
      if(component.part==='flow.node'){const node=context.item as typeof nodes[number];return<button className="gc-flow-node" data-locked={!unlocked.has(node.id)} aria-pressed={active===node.id} style={{left:node.left+component.layout.x.value,top:node.top+component.layout.y.value}} onClick={()=>setActive(node.id)}>{children}</button>;}
      if(component.part==='flow.edge'){const edge=context.item as Flow['edges'][number],from=nodes.find(node=>node.id===edge.from)!,to=nodes.find(node=>node.id===edge.to)!,x1=from.left+110,y1=from.top+64,x2=to.left+110,y2=to.top;return<svg aria-hidden="true" style={{position:'absolute',left:0,top:0,width:layout?.width,height:layout?.height,pointerEvents:'none',overflow:'visible'}}><path d={`M${x1},${y1} V${(y1+y2)/2} H${x2} V${y2}`} fill="none" stroke={component.normal.color??'currentColor'}/><foreignObject x={(x1+x2)/2+8} y={(y1+y2)/2-40} width="220" height="40">{children}</foreignObject></svg>;}
      return projection.render(component,children,context);}});
}
