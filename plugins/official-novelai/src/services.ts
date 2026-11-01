import { generationInputJsonSchema, GenerationOutputJsonSchema, MediaInputSchema } from '@galcraft/contracts';
import { imageOperation } from './definition.js';
import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { HttpGenerationAdapter } from '@galcraft/generation-services';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {NovelAIPromptSchema,NovelAIPromptContract,NovelAISettingsSchema,NovelAIReferenceSchema,NovelAIGenerationInputJsonSchema} from '@galcraft/generation-services/novelai';
import { officialServices } from '@galcraft/generation-services/catalog';

export function createPlugin(): GalCraftPlugin { return {
  async activate(context) {
    const module = officialServices.find(value => value.id === 'org.galcraft.novelai')!;
    return {...emptyContributions(),textPreparations:[{key:'org.galcraft.novelai/preparePrompt',version:'0.1.0',transferOperation:'org.galcraft.novelai/image',prepare(input){if(!('fields' in input))throw new Error('Prompt preparation requires domain fields.');return {purpose:'text',system:`Return strict JSON: ${NovelAIPromptContract}. Preserve the characters and settings confirmed by the author.`,messages:[{role:'user',text:JSON.stringify(input.fields),attachments:[]}],maxOutputTokens:4096,temperature:null,seed:null};},async process(raw,_input,ctx){const prompt=NovelAIPromptSchema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,'')));await mkdir(ctx.directory,{recursive:true});const localPath=join(ctx.directory,'novelai-prompt.json');const text=JSON.stringify(prompt,null,2);await writeFile(localPath,text);return [{kind:'text',port:'prompt',localPath,mime:'application/json',bytes:Buffer.byteLength(text),metadata:{},groupId:ctx.requestId,role:'primary',background:null}];},transfer(result,fields,source){const prompt=NovelAIPromptSchema.safeParse(result);return prompt.success?{ok:true,warnings:[],value:{...fields,novelaiPrompt:prompt.data as unknown as import('@galcraft/contracts').Json,novelaiPromptSource:{...source,contract:'novelaiPrompt',contractVersion:1}}}:{ok:false,error:{code:'NOVELAI_PROMPT',severity:'error',owner:'M10',message:prompt.error.message,related:[],actions:[]},issues:[]};}}], generationProviders: module.protocols.map(entry => ({
      key: `${module.id}/${entry.protocol}`, version:'0.1.0', purposes:entry.protocol==='novelAIImage'?[...entry.purposes,'org.galcraft.novelai/image']:entry.purposes,
      protocols:[entry.protocol], execution:'remote' as const, configFields:entry.protocol==='novelAIImage'?[{path:'novelaiModelProfile',label:'Confirmed model profile',type:'enum' as const,enumValues:['v5-full','v5-curated','v45-full'],default:'v5-full',required:true,nullable:false,description:'Choose the profile matching the actual connection model.',unit:'none' as const,group:'basic' as const,summary:true,keywords:[]}]:[],
      capabilities:{query:entry.protocol==='comfyUI',refetch:entry.protocol==='comfyUI',cancelPerTask:entry.protocol==='comfyUI',resume:entry.protocol==='comfyUI'},
      inputSchema:generationInputJsonSchema(entry.purposes,entry.protocol==='novelAIImage'?[{purpose:'org.galcraft.novelai/image',fields:imageOperation.inputSchema}]:[],{image:NovelAIGenerationInputJsonSchema as import('@galcraft/contracts').Json}),
      outputSchema:GenerationOutputJsonSchema,
      create(config) {
        if(config.protocol!==entry.protocol) throw new Error('The connection protocol does not match this provider.');
        const adapter=new HttpGenerationAdapter({credential:id=>context.credentials?.read(id)??Promise.resolve(null),probe:async(path,mime)=>{if(!context.media)throw new Error('The media probe provider is unavailable.');return context.media.probe(path,mime);}});
        const normalize=(input:import('@galcraft/contracts').GenerationInput):import('@galcraft/contracts').GenerationInput=>{if(input.purpose!=='org.galcraft.novelai/image'||!('fields' in input))return input;const f=input.fields;return {purpose:'image',usage:f.usage as 'cg',positive:'',negative:'',width:Number(f.width),height:Number(f.height),count:Number(f.count),seed:f.seed as number|null,references:input.references,novelai:{prompt:f.novelaiPrompt!,settings:f.novelaiSettings!,...(f.novelaiReference?{references:f.novelaiReference}:{})}};};
        return {inspect:async(config,purpose)=>{const report=await adapter.inspect(config,purpose==='org.galcraft.novelai/image'?'image':purpose);return {...report,purpose,inputs:purpose==='org.galcraft.novelai/image'?[{port:'fields',required:true,supported:true,limits:{}},{port:'references',required:false,supported:true,limits:{}}]:report.inputs};},query:(ref,ctx)=>adapter.query(ref,ctx),fetch:(ref,output,ctx)=>adapter.fetch(ref,output,ctx),cancel:(ref,ctx)=>adapter.cancel(ref,ctx),async *submit(input,ctx){for await(const event of adapter.submit(normalize(input),ctx)){if(event.kind==='output')event.artifacts.forEach(artifact=>{if(artifact.role==='primary')artifact.port='image';});yield event;}}};
      }
    }))};
  }, async deactivate() {}
}; }
