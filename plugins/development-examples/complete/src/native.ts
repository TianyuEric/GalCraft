import type { NativePlatformContext, NativePlatformProvider } from '@galcraft/plugins/contracts';
export function createPlatformProvider(context: NativePlatformContext): NativePlatformProvider {
 return {invoke:async(action,args)=>action==='ping'?({ok:true,value:{target:context.target,arch:context.arch,platform:process.platform,received:args},warnings:[]}):({ok:false,error:{code:'PLATFORM_ACTION',severity:'error',message:'Unknown action',owner:'M09',related:[],actions:['edit']},issues:[]})};
}
