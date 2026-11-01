import type { PluginDefinition } from '@galcraft/plugins/contracts';
import { id, ok, titleField, commandSpec, counterDefinition, presentSpec } from './common.js';
export function createDefinition(): PluginDefinition { return {
 messages:{en:{[id+'/settings.title']:'Settings',[id+'/report.title']:'Selection report',[id+'/dialog.title']:'Counter interaction'},'zh-CN':{[id+'/settings.title']:'配置',[id+'/report.title']:'选区报告',[id+'/dialog.title']:'计数交互'}},
 commands:[commandSpec,presentSpec],conditions:[{key:id+'/positive',fields:[]}],components:[counterDefinition],
 documents:[{key:id+'/settings',titleKey:id+'/settings.title',stateVersion:1,instances:'multiple',configMapping:{purpose:'settings',mode:'multiple',required:true},
 schema:{type:'object',properties:{title:{type:'string',minLength:1}},required:['title'],additionalProperties:false},fields:[titleField],initial:{title:'Example'},
 collectReferences:()=>[],rewriteReferences:data=>ok(data),convert:(from,to,data)=>from===to?ok(data):({ok:false,error:{code:'CONVERSION',severity:'error',message:'No conversion for this version',owner:'M09',related:[],actions:['convert']},issues:[]})}]
 }; }
