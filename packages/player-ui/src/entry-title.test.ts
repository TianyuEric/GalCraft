import {afterEach,expect,test,vi} from 'vitest';
import type{Transition}from '@galcraft/contracts';
import {paintEntryTitle,releaseEntryTitle}from './entry-title.js';
afterEach(()=>vi.unstubAllGlobals());
function setup(){
  const draw=vi.fn(),context={drawImage:draw,clearRect(){},fillRect:draw,save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){}};
  const element=()=>{const value:any={style:{},children:[],attributes:{},append(...children:any[]){this.children.push(...children);},setAttribute(key:string,value:string){this.attributes[key]=value;},remove:vi.fn(),getContext:()=>context,toDataURL:()=>`data:image/png,${draw.mock.calls.length}`};Object.defineProperty(value,'firstElementChild',{get:()=>value.children[0]});return value;};
  vi.stubGlobal('document',{createElement:element,createElementNS:element});vi.stubGlobal('getComputedStyle',()=>({opacity:'0.8'}));return{element:Object.assign(element(),{offsetWidth:200,offsetHeight:100}) as HTMLElement,draw};
}
test.each(['cut','fade','slide','wipe','blinds','gridFlip','diagonalReveal']as const)('title %s uses its transform or geometric mask while retaining DOM text',preset=>{
  const{element,draw}=setup(),spec:Transition={preset,resourceId:null,durationMs:400,easing:{family:'linear',direction:'in'},direction:'right'};
  paintEntryTitle(element,spec,.5,true,undefined,false);
  if(preset==='fade')expect(element.style.opacity).toBe('0.4');
  else{expect(element.style.opacity).toBe('0.8');if(preset==='slide')expect(element.style.translate).toBe('40px 0');else if(preset==='wipe')expect(element.style.clipPath).toBe('inset(0 50% 0 0)');else if(preset!=='cut'){expect(element.style.maskImage).toContain('data:image/png');expect(draw).toHaveBeenCalled();}}
  paintEntryTitle(element,{...spec,preset:'cut'},1,true,undefined,false);expect(element.style.maskImage).toBe('');expect(element.style.clipPath).toBe('');expect(element.style.translate).toBe('');releaseEntryTitle(element);
});
test('custom title shares native sampling and CSS effects; reduced motion keeps the readable baseline',()=>{
  const{element}=setup(),spec:Transition={preset:'custom',resourceId:'Anim01',durationMs:0,easing:{family:'linear',direction:'in'},direction:'right'};
  const animation={type:'galcraft.animation' as const,version:1 as const,durationMs:400,tracks:[{path:'/x' as const,mode:'add' as const,keyframes:[{timeMs:400,value:100,easing:spec.easing}]},{path:'/opacity' as const,mode:'absolute' as const,keyframes:[{timeMs:400,value:0,easing:spec.easing}]},{path:'/blur' as const,mode:'absolute' as const,keyframes:[{timeMs:400,value:8,easing:spec.easing}]}]};
  paintEntryTitle(element,spec,.5,true,animation,false,2);expect(element.style.translate).toBe('100px 0px');expect(element.style.opacity).toBe('0.4');expect(element.style.filter).toContain('blur(8px)');
  paintEntryTitle(element,spec,.5,true,animation,true);expect(element.style.translate).toBe('');expect(element.style.filter).toBe('');expect(element.style.opacity).toBe('0.8');
});
test('custom title circle uses the local short side, inversion and authored feather',()=>{
  const{element}=setup(),spec:Transition={preset:'custom',resourceId:'Anim01',durationMs:0,easing:{family:'linear',direction:'in'},direction:'right'};
  paintEntryTitle(element,spec,1,true,[{durationMs:0,easing:spec.easing,effects:{circle:{radius:.25,softness:.1,invert:true,centerX:.5,centerY:.5}}}],false);
  expect(element.style.maskImage).toContain('transparent 15px,#fff 35px');
});
