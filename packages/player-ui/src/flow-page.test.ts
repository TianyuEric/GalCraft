import { expect, it } from 'vitest';
import type { Flow } from '@galcraft/contracts';
import { verticalFlow } from './flow-page.js';
const graph = (edges: [string,string][]) => ({nodes:[...new Set(edges.flat())].map((id,x)=>({id,x})),edges:edges.map(([from,to])=>({from,to}))}) as Flow;
it('lays a shared route above branches and their merge below both',()=>{
 const {nodes}=verticalFlow(graph([['start','split'],['split','a'],['split','b'],['a','merge'],['b','merge']]));
 const at=(id:string)=>nodes.find(n=>n.id===id)!;
 expect(at('start').top).toBeLessThan(at('split').top);
 expect(at('a').top).toBe(at('b').top);
 expect(at('a').left).not.toBe(at('b').left);
 expect(at('merge').top).toBeGreaterThan(at('a').top);
});
it('keeps cyclic routes finite and does not mutate author coordinates',()=>{
 const flow=graph([['a','b'],['b','a']]), before=JSON.stringify(flow);
 const layout=verticalFlow(flow);
 expect(layout.nodes.every(n=>Number.isFinite(n.top))).toBe(true);
 expect(JSON.stringify(flow)).toBe(before);
});
