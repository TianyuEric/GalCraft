import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { id, ok, titleField } from './common.js';
export function createPlugin(): GalCraftPlugin { return {activate:async()=>({...emptyContributions(),
 tools:[{key:id+'/report',titleKey:id+'/report.title',inputFields:[],locations:['tools.list','commands.palette','context.menu'],scope:{selection:'statements'},
 run:async(_input,context,signal)=>signal.aborted?ok({kind:'none' as const}):ok({kind:'report' as const,message:'Selected statements: '+(context.scope?.statementIds.length??0),issues:[]})}],
 fieldEditors:[{key:id+'/titleEditor',contributionKey:id+'/settings',fieldKey:titleField.path,mount:(root,context)=>{const input=document.createElement('input');input.value=String(context.value??'');input.setAttribute('aria-label','Title');const submit=()=>{void context.commit(input.value);};input.addEventListener('change',submit);root.append(input);return()=>{input.removeEventListener('change',submit);input.remove();};}}]
 }),deactivate:async()=>{}}; }
