import { PluginIdSchema } from '../contracts/manifest.js';
import type { PluginTemplate } from './index.js';

export function scaffoldFiles(id: string, template: PluginTemplate, sdkVersion: string): Record<string, string> {
  PluginIdSchema.parse(id);
  const author = ['author-tool', 'complete'].includes(template), game = ['game-system', 'complete'].includes(template);
  const resource = ['resource-stage', 'complete'].includes(template), service = ['service-provider', 'complete'].includes(template);
  const declarations: { kind: string; key: string; targets: string[]; required: boolean }[] = [];
  const add = (kind: string, name: string) => declarations.push({ kind, key: `${id}/${name}`, targets: ['web', 'windows'], required: true });
  if (author || game) add('document', 'settings');
  if (author) { add('tool', 'report'); add('fieldEditor', 'titleEditor'); }
  if (game) for (const [kind, key] of [['command', 'increment'], ['condition', 'positive'], ['system', 'state'], ['page', 'dialog'], ['component', 'counter'], ['platform', 'external']] as const) add(kind, key);
  if (resource) { add('resource', 'plainGroup'); add('stage', 'canvas'); add('resourceProcessor', 'copy'); add('command', 'present'); }
  if (service) { add('generationProvider', 'textProvider'); add('publishCheck', 'settingsCheck'); }
  const sources: Record<string, string> = { definition: 'src/definition.ts' };
  if (author) sources.editor = 'src/editor.ts';
  if (game || resource) sources.runtime = 'src/runtime.ts';
  if (service || resource) sources.services = 'src/services.ts';
  const common = `import type { CommandSpec, EffectValues, FieldSpec, Id, Json, Result, StageObject, Transition } from '@galcraft/contracts';
import type { ComponentDefinition } from '@galcraft/plugins/contracts';
export const id = '${id}';
export const ok = <T>(value: T): Result<T> => ({ok:true,value,warnings:[]});
export const titleField: FieldSpec = {path:'title',label:'Title',description:'Display title',type:'string',required:true,nullable:false,default:'Example',unit:'none',group:'basic',summary:true,keywords:[]};
export const issue = (message: string) => ({code:'EXAMPLE',severity:'error' as const,message,owner:'M09' as const,related:[],actions:['edit' as const]});
export const capabilities = {resolver:id+'/plainGroup',resolverVersion:'0.1.0',format:'plain',formatVersion:'1',capabilities:['capture','pause'],parameters:[],motions:[],expressions:[],missingFiles:[]};
export const commandSpec: CommandSpec = {key:id+'/increment',version:'0.1.0',name:'Increment',description:'Increment the counter and confirm through a restorable page',icon:'plus',category:'example',keywords:[],fields:[],continuation:'wait',skippable:false,executor:id+'/increment',targetCapabilities:[],constraints:[]};
export const counterDefinition: ComponentDefinition = {key:id+'/counter',componentKey:id+'/counter',propsSchema:{type:'object',properties:{title:{type:'string'},value:{type:'number'}}},fields:[titleField,{...titleField,path:'value',label:'Value',type:'number',default:0,required:false}],sampleProps:{title:'Counter',value:0},publicParts:['counter'],stateBindings:[{property:'value',domain:'progress',path:'value'}]};
const resourceFields: FieldSpec[] = [{...titleField,path:'objectId',label:'Object',type:'ref',refKind:'object',default:null},{...titleField,path:'assetId',label:'Asset',type:'ref',refKind:'asset',default:null},{...titleField,path:'variantId',label:'Variant',type:'ref',refKind:'variant',default:null}];
export const presentSpec: CommandSpec = {...commandSpec,key:id+'/present',executor:id+'/present',name:'Present custom resource',continuation:'continue',skippable:true,fields:resourceFields};
const values: EffectValues = {x:0,y:0,scaleX:1,scaleY:1,rotationDeg:0,opacity:1,blur:0,brightness:1,contrast:1,saturation:1,gamma:1,rgb:[255,255,255],bloom:{intensity:0,brightness:1,blur:0,threshold:1},bevel:{opacity:0,thickness:0,rotationDeg:0,softness:0,rgb:[255,255,255]},filters:{oldFilm:false,dot:false,reflection:false,glitch:false,rgbSplit:false,godray:false},blend:'normal',z:0};
const cut: Transition = {preset:'cut',resourceId:null,durationMs:0,easing:{family:'linear',direction:'inOut'},direction:'left'};
export function stageObject(input: {objectId:Id;assetId:Id;variantId:Id}): StageObject {return {id:input.objectId,characterId:null,assetId:input.assetId,variantId:input.variantId,layer:'effect',entranceOrder:0,backgroundFrame:null,station:'center',current:values,defaults:{...values,station:'center'},framing:{mode:'full',scale:1,offsetX:0,offsetY:0,crop:null},transition:{enter:cut,exit:cut},processes:[],providerState:{provider:id+'/plainGroup',version:'0.1.0',state:{}},imageFace:null};}
`;
  const definition = `import type { PluginDefinition } from '@galcraft/plugins/contracts';
import { id, ok, titleField, commandSpec, counterDefinition, presentSpec } from './common.js';
export function createDefinition(): PluginDefinition { return {
 messages:{en:{[id+'/settings.title']:'Settings',[id+'/report.title']:'Selection report',[id+'/dialog.title']:'Counter interaction'},'zh-CN':{[id+'/settings.title']:'配置',[id+'/report.title']:'选区报告',[id+'/dialog.title']:'计数交互'}},
 commands:[${[...(game ? ['commandSpec'] : []), ...(resource ? ['presentSpec'] : [])].join(',')}],conditions:${game ? "[{key:id+'/positive',fields:[]}]" : '[]'},components:${game ? '[counterDefinition]' : '[]'},
 documents:${author || game ? `[{key:id+'/settings',titleKey:id+'/settings.title',stateVersion:1,instances:'multiple',configMapping:{purpose:'settings',mode:'multiple',required:true},
 schema:{type:'object',properties:{title:{type:'string',minLength:1}},required:['title'],additionalProperties:false},fields:[titleField],initial:{title:'Example'},
 collectReferences:()=>[],rewriteReferences:data=>ok(data),convert:(from,to,data)=>from===to?ok(data):({ok:false,error:{code:'CONVERSION',severity:'error',message:'No conversion for this version',owner:'M09',related:[],actions:['convert']},issues:[]})}]` : '[]'}
 }; }
`;
  const editor = `import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { id, ok, titleField } from './common.js';
export function createPlugin(): GalCraftPlugin { return {activate:async()=>({...emptyContributions(),
 tools:[{key:id+'/report',titleKey:id+'/report.title',inputFields:[],locations:['tools.list','commands.palette','context.menu'],scope:{selection:'statements'},
 run:async(_input,context,signal)=>signal.aborted?ok({kind:'none' as const}):ok({kind:'report' as const,message:'Selected statements: '+(context.scope?.statementIds.length??0),issues:[]})}],
 fieldEditors:[{key:id+'/titleEditor',contributionKey:id+'/settings',fieldKey:titleField.path,mount:(root,context)=>{const input=document.createElement('input');input.value=String(context.value??'');input.setAttribute('aria-label','Title');const submit=()=>{void context.commit(input.value);};input.addEventListener('change',submit);root.append(input);return()=>{input.removeEventListener('change',submit);input.remove();};}}]
 }),deactivate:async()=>{}}; }
`;
  const runtime = `import { emptyContributions, React } from '@galcraft/plugins/react';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import type { Id } from '@galcraft/contracts';
import { id, ok, issue, titleField, capabilities, commandSpec, counterDefinition, presentSpec, stageObject } from './common.js';
export function createPlugin(): GalCraftPlugin { return {activate:async(context)=>({...emptyContributions(),
 commands:[${game ? `{spec:commandSpec,execute:async input=>ok({progress:{value:Number((input.state as {value:number}).value??0)+1},longTermDelta:null,presentation:null,wait:{page:id+'/dialog',input:{},resumeData:{}},result:null}),resume:async input=>ok({progress:input.state,longTermDelta:null,presentation:null,wait:null,result:typeof input.result==='string'?input.result:null})},` : ''}
 ${resource ? `{spec:presentSpec,execute:async input=>{const value=stageObject(input.args as {objectId:Id;assetId:Id;variantId:Id});return ok({progress:input.state,longTermDelta:null,presentation:{objects:[{op:'show' as const,id:value.id,value}],effects:[],audio:[]},wait:null,result:null});}},` : ''}],
 ${game ? `
 conditions:[{key:id+'/positive',fields:[],evaluate:(_args,progress)=>ok(Number((progress as {value:number}).value??0)>0)}],
 systems:[{key:id+'/state',progressSchema:{type:'object'},longTermSchema:{type:'object'},initialProgress:()=>({value:0}),initialLongTerm:()=>({}),debugFields:[],validate:state=>ok(state),convert:(from,to,state)=>from===to?ok(state):({ok:false,error:issue('State conversion is unavailable'),issues:[]}),mergeLongTerm:(_local,incoming)=>ok(incoming),checkpoint:state=>ok(state)}],
 pages:[{key:id+'/dialog',titleKey:id+'/dialog.title',componentKey:id+'/counter',inputSchema:{type:'object'},resultSchema:{type:'string'},configFields:[],publicParts:['counter'],sampleInput:{},wait:{restorable:true,cancel:'keepWaiting'},render:page=>React.createElement('button',{onClick:()=>page.finish('done')},'Finish')}],
 components:[{...counterDefinition,render:state=>{const props=state.props as {title?:string;value?:number};return React.createElement('span',{'data-part':'counter'},(props.title??'Counter')+': '+String(props.value??(state.progress as {value:number}).value??0));}}],
 platform:[{key:id+'/external',targets:['windows'],actions:[{name:'ping',fields:[]}],required:false,invoke:async(action,args,domain)=>context.platform?context.platform.invoke(id+'/external',action,args):ok({simulated:true}),fallback:async()=>ok({simulated:true})}],` : ''}
 ${resource ? `stages:[{key:id+'/canvas',resourceProviderKey:id+'/plainGroup',create:async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const graphics=canvas.getContext('2d');if(graphics){graphics.fillStyle='#64748b';graphics.fillRect(0,0,320,180);}let state={value:0},paused=false;return ok({update:()=>{},set:command=>{state=command as typeof state;return ok(undefined);},capture:()=>ok(state),pause:value=>{paused=value;},renderSurface:()=>canvas,dispose:()=>canvas.remove()});}}],` : ''}
 }),deactivate:async()=>{}}; }
`;
  const services = `import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { id, ok, issue, capabilities } from './common.js';
export function createPlugin(): GalCraftPlugin { return {activate:async(host)=>({...emptyContributions(),
 ${resource ? `resources:[{key:id+'/plainGroup',kind:'effect',extensions:['txt'],inspect:async(rootFile,_files,source)=>{if(source)await source.readText(rootFile);return ok({files:[rootFile],capabilities,metadata:{format:'plain'}});}}],
 resourceProcessors:[{key:id+'/copy',version:'0.1.0',inputKinds:['effect'],outputKinds:['effect'],supportsCancel:true,fields:[],process:async(input,signal)=>{const files=[];for(const path of input.source.files){signal.throwIfAborted();const bytes=await input.source.readBytes(path);await mkdir(dirname(join(input.outputDirectory,path)),{recursive:true});await writeFile(join(input.outputDirectory,path),bytes);files.push({path,bytes:bytes.length,mime:path.endsWith('.txt')?'text/plain':'application/octet-stream'});}return ok({rootFile:input.source.rootFile,files,kind:'effect' as const,capabilities,metadata:input.source.metadata});}}],` : ''}
 ${service ? `generationProviders:[{key:id+'/textProvider',version:'0.1.0',purposes:['text'],configFields:[],inputSchema:{type:'object'},outputSchema:{type:'object',properties:{artifacts:{type:'array'},usage:{}},required:['artifacts','usage']},capabilities:{query:false,refetch:false,cancelPerTask:false,resume:false},create:config=>({
 inspect:async(_config,purpose)=>({connectionId:config.id,connectionRevision:config.revision,checkedAt:new Date().toISOString(),serviceVersion:'1',purpose,status:'unverified',inputs:[],output:'text',models:null,promptFormat:'natural',textVision:null,remote:{query:false,cancelQueued:false,cancelRunning:'none'},issues:[]}),
 submit:async function*(input,ctx){const secret=config.credentialId?await host.credentials?.read(config.credentialId):null;const response=await fetch(config.baseUrl,{method:'POST',headers:{'Content-Type':'application/json',...(secret?{Authorization:'Bearer '+secret}:{})},body:JSON.stringify(input),signal:ctx.signal});if(!response.ok)throw new Error('HTTP '+response.status);const text=await response.text();await mkdir(ctx.directory,{recursive:true});const path=join(ctx.directory,'result.txt');await writeFile(path,text);yield{kind:'output' as const,artifacts:[{kind:'text' as const,localPath:path,mime:'text/plain',bytes:Buffer.byteLength(text),metadata:{},groupId:ctx.requestId,role:'primary' as const,background:null}],usage:null};},
 query:async()=>ok({state:'unknown' as const,output:null,issues:[]}),fetch:async()=>({ok:false as const,error:issue('Refetch unsupported'),issues:[]}),cancel:async()=>({local:'stopped' as const,remote:'unsupported' as const})
 })}],
 publishChecks:[{key:id+'/settingsCheck',check:async input=>input.target==='windows'?[]:[{...issue('Review the Web target settings'),severity:'warning'}]}],` : ''}
 }),deactivate:async()=>{}}; }
`;
  const native = `import type { NativePlatformContext, NativePlatformProvider } from '@galcraft/plugins/contracts';
export function createPlatformProvider(context: NativePlatformContext): NativePlatformProvider {
 return {invoke:async(action,args)=>action==='ping'?({ok:true,value:{target:context.target,arch:context.arch,platform:process.platform,received:args},warnings:[]}):({ok:false,error:{code:'PLATFORM_ACTION',severity:'error',message:'Unknown action',owner:'M09',related:[],actions:['edit']},issues:[]})};
}
`;
  return {
    'package.json': JSON.stringify({ name: id, version: '0.1.0', private: true, type: 'module', scripts: { typecheck: 'tsc --noEmit', build: 'galcraft-plugin build .', check: 'galcraft-plugin check package', pack: 'galcraft-plugin pack package dist' },
      dependencies: { '@galcraft/plugins': sdkVersion, '@galcraft/contracts': sdkVersion }, devDependencies: { typescript: '7.0.2', '@types/node': '24.13.6', '@types/react': '19.3.0' } }, null, 2),
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM'], module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, types: ['node'] }, include: ['src/**/*.ts'] }, null, 2),
    'plugin.config.json': JSON.stringify({ manifest: { schemaVersion: 2, id, name: id, version: '0.1.0', description: 'Public SDK example', author: 'Plugin author', license: 'UNLICENSED', homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [],
      environmentDependencies: { definition: [], editor: [], services: [], runtime: [] }, contributions: declarations, stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] }, sources,
      ...(game ? { nativeSources: [{ target: 'windows', arch: 'x64', source: 'src/native.ts' }, { target: 'windows', arch: 'arm64', source: 'src/native.ts' }] } : {}) }, null, 2),
    'src/common.ts': common, 'src/definition.ts': definition,
    ...(author ? { 'src/editor.ts': editor } : {}), ...(game || resource ? { 'src/runtime.ts': runtime.replace("import { emptyContributions, React } from '@galcraft/plugins/react';", "import { emptyContributions } from '@galcraft/plugins/contracts';\nimport { React } from '@galcraft/plugins/react';") } : {}),
    ...(service || resource ? { 'src/services.ts': services } : {}),
    ...(game ? { 'src/native.ts': native } : {}),
    'README.md': `# ${id}\n\nInstall the supplied SDK artifacts with npm install <contracts.tgz> <plugins.tgz>, then run npm run typecheck, npm run build, npm run check and npm run pack. Load the package directory through Studio development loading, or install the generated .galplugin through the ordinary package installer.\n\nThe text provider posts its public input to the configured base URL and uses the host credential service. Use a service you control for protocol acceptance. Capability limits are explicit.\n`,
  };
}
