import { emptyContributions } from '@galcraft/plugins/contracts';
import { React } from '@galcraft/plugins/react';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import type { Id } from '@galcraft/contracts';
import { id, ok, issue, titleField, capabilities, commandSpec, counterDefinition, presentSpec, stageObject } from './common.js';
export function createPlugin(): GalCraftPlugin { return {activate:async(context)=>({...emptyContributions(),
 commands:[{spec:commandSpec,execute:async input=>ok({progress:{value:Number((input.state as {value:number}).value??0)+1},longTermDelta:null,presentation:null,wait:{page:id+'/dialog',input:{},resumeData:{}},result:null}),resume:async input=>ok({progress:input.state,longTermDelta:null,presentation:null,wait:null,result:typeof input.result==='string'?input.result:null})},
 {spec:presentSpec,execute:async input=>{const value=stageObject(input.args as {objectId:Id;assetId:Id;variantId:Id});return ok({progress:input.state,longTermDelta:null,presentation:{objects:[{op:'show' as const,id:value.id,value}],effects:[],audio:[]},wait:null,result:null});}},],

 conditions:[{key:id+'/positive',fields:[],evaluate:(_args,progress)=>ok(Number((progress as {value:number}).value??0)>0)}],
 systems:[{key:id+'/state',progressSchema:{type:'object'},longTermSchema:{type:'object'},initialProgress:()=>({value:0}),initialLongTerm:()=>({}),debugFields:[],validate:state=>ok(state),convert:(from,to,state)=>from===to?ok(state):({ok:false,error:issue('State conversion is unavailable'),issues:[]}),mergeLongTerm:(_local,incoming)=>ok(incoming),checkpoint:state=>ok(state)}],
 pages:[{key:id+'/dialog',titleKey:id+'/dialog.title',componentKey:id+'/counter',inputSchema:{type:'object'},resultSchema:{type:'string'},configFields:[],publicParts:['counter'],sampleInput:{},wait:{restorable:true,cancel:'keepWaiting'},render:page=>React.createElement('button',{onClick:()=>page.finish('done')},'Finish')}],
 components:[{...counterDefinition,render:state=>{const props=state.props as {title?:string;value?:number};return React.createElement('span',{'data-part':'counter'},(props.title??'Counter')+': '+String(props.value??(state.progress as {value:number}).value??0));}}],
 platform:[{key:id+'/external',targets:['windows'],actions:[{name:'ping',fields:[]}],required:false,invoke:async(action,args,domain)=>context.platform?context.platform.invoke(id+'/external',action,args):ok({simulated:true}),fallback:async()=>ok({simulated:true})}],
 stages:[{key:id+'/canvas',resourceProviderKey:id+'/plainGroup',create:async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const graphics=canvas.getContext('2d');if(graphics){graphics.fillStyle='#64748b';graphics.fillRect(0,0,320,180);}let state={value:0},paused=false;return ok({update:()=>{},set:command=>{state=command as typeof state;return ok(undefined);},capture:()=>ok(state),pause:value=>{paused=value;},renderSurface:()=>canvas,dispose:()=>canvas.remove()});}}],
 }),deactivate:async()=>{}}; }
