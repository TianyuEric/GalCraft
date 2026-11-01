import {isDeepStrictEqual} from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AnimationGenerationRequestSchema, AnimationPathSchema, animationChanges, resolveAnimationGeneration, parseAnimationResource } from '@galcraft/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin, TextPreparationContribution } from '@galcraft/plugins/contracts';
import { providerKey } from './definition.js';
export const preparation: TextPreparationContribution = {
  key: providerKey, version:'0.1.0',
  prepare(input) {
    if(!('fields' in input))throw new Error('GCA domain fields are missing.');
    const frozen=AnimationGenerationRequestSchema.parse(input.fields);
    const system = `Return only JSON: {"animation":{"type":"galcraft.animation","version":1,"durationMs":1000,"tracks":[{"path":"/y","mode":"add","keyframes":[{"timeMs":0,"value":0,"easing":{"family":"sine","direction":"inOut"}},{"timeMs":500,"value":-80,"easing":{"family":"sine","direction":"inOut"}},{"timeMs":1000,"value":0,"easing":{"family":"sine","direction":"inOut"}}]}]},"deletePaths":[]}. Allowed paths: ${AnimationPathSchema.options.join(', ')}. Numeric paths use absolute, add or multiply. /station and /blend are enums; /filters/* and /circle/invert are booleans; discrete paths use absolute. Times increase per track, within duration. Preserve all unrelated author tracks and keyframes. Patch edits may only affect selected paths/range and preserve duration. Delete only when allowDelete is true. replace is an explicit whole-animation rewrite. Reaction actions end at relative 0 or multiplier 1. No code, expressions, resource or difference events.`;
    return {purpose:'text',system,messages:[{role:'user',text:JSON.stringify(frozen),attachments:[]}],maxOutputTokens:8192,temperature:null,seed:null};
  },
  async process(raw,input,context) {
    if(!('fields' in input))throw new Error('GCA domain fields are missing.');
    const frozen=AnimationGenerationRequestSchema.parse(input.fields);
    let animation:import('@galcraft/contracts').NativeAnimation|null=null,validationError:string|null=null;
    try {animation=resolveAnimationGeneration(raw,frozen);}catch(error){validationError=String(error);}
    const bytes=new TextEncoder().encode(animation?JSON.stringify(animation,null,2)+'\n':raw);
    await mkdir(context.directory,{recursive:true});const localPath=join(context.directory,`${context.requestId}.gca`);await writeFile(localPath,bytes);
    return [{kind:'animation',typeVersion:1,port:'animation',localPath,mime:'application/json',bytes:bytes.length,groupId:context.requestId,role:'primary',background:null,
      metadata:{originalText:raw,animationChanges:animation?animationChanges(frozen.currentAnimation,animation) as unknown as import('@galcraft/contracts').Json:[],originalAnimation:frozen.currentAnimation as unknown as import('@galcraft/contracts').Json,...(validationError?{validationError}:{})}}];
  }
};
export function createPlugin():GalCraftPlugin{return {activate:async(context)=>({...emptyContributions(),textPreparations:[{...preparation,async validateInput(input){try{if(!('fields' in input))throw new Error('GCA domain fields are missing.');const frozen=AnimationGenerationRequestSchema.parse(input.fields);if(frozen.assetId){if(!context.assets.get||!context.assets.readText)throw new Error('The host asset reader is unavailable.');const asset=await context.assets.get(frozen.assetId);if(!asset.ok)return asset;if(asset.value.kind!=='animation'||asset.value.revision!==frozen.assetRevision)throw new Error('The animation asset revision changed. Read the current asset and prepare again.');const resource=await context.assets.resolve({kind:'variant',id:asset.value.activeVariantId});if(!resource.ok)return resource;const parsed=parseAnimationResource(await context.assets.readText(resource.value,resource.value.entry),{});if(!parsed.ok)return parsed;if(!isDeepStrictEqual(parsed.value,frozen.currentAnimation))throw new Error('currentAnimation must contain the complete current asset, including every unselected track.');}return {ok:true,warnings:[],value:undefined};}catch(error){const issue={code:'ANIMATION_SOURCE',severity:'error' as const,owner:'M10' as const,message:error instanceof Error?error.message:String(error),related:[],actions:['edit' as const]};return {ok:false,error:issue,issues:[issue]};}}}]}),deactivate:async()=>{}};}
