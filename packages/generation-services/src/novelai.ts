import { z } from 'zod';
import {GenerationInputSchema} from '@galcraft/contracts';
import type { ConnectionConfig, GenerationInput, Json } from '@galcraft/contracts';

/** Fixed software contract; prompt rules may change wording, never its shape. */
export const NovelAIPromptSchema = z.strictObject({
  kind: z.literal('novelaiPrompt'), contractVersion: z.literal(1),
  basePrompt: z.string(), negativePrompt: z.string().nullable(),
  characters: z.array(z.strictObject({ name: z.string(), prompt: z.string(), negativePrompt: z.string().nullable(),
    position: z.strictObject({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).nullable() })),
  suggestions: z.string().nullable(),
});
export type NovelAIPromptDraft = z.infer<typeof NovelAIPromptSchema>;
export const NovelAIPromptContract = '{"kind":"novelaiPrompt","contractVersion":1,"basePrompt":"Base prompt","negativePrompt":null,"characters":[{"name":"Character name","prompt":"Character prompt","negativePrompt":null,"position":null}],"suggestions":null}. Keep characters in order; position is null or {"x":0..1,"y":0..1}; use [] for a background without characters.';
export const emptyNovelAIPrompt = (): NovelAIPromptDraft => ({ kind: 'novelaiPrompt', contractVersion: 1, basePrompt: '', negativePrompt: null, characters: [], suggestions: null });
export type NovelAIModelProfile = 'v5-full' | 'v5-curated' | 'v45-full';
export type NovelAISettings = { modelProfile: NovelAIModelProfile; quality: 'none' | 'light' | 'standard'; transparent: boolean; negativePreset: string | null };
export const NovelAISettingsSchema=z.strictObject({modelProfile:z.enum(['v5-full','v5-curated','v45-full']),quality:z.enum(['none','light','standard']),transparent:z.boolean(),negativePreset:z.string().nullable()});
export const NovelAIPromptJsonSchema=z.toJSONSchema(NovelAIPromptSchema);
export const NovelAISettingsJsonSchema=z.toJSONSchema(NovelAISettingsSchema);
export const defaultNovelAISettings = (): NovelAISettings => ({ modelProfile: 'v5-full', quality: 'none', transparent: false, negativePreset: null });
export const NovelAIReferenceSchema = z.strictObject({ mode: z.enum(['img2img','vibe','precise']),
  strength: z.number().min(0).max(1), informationExtracted: z.number().min(0).max(1), fidelity: z.number().min(0).max(1).optional(),
  description: z.enum(['character','character&style']).optional(),
});
export const NovelAIGenerationInputJsonSchema=z.toJSONSchema(GenerationInputSchema.options[1].extend({novelai:z.strictObject({prompt:NovelAIPromptSchema,settings:NovelAISettingsSchema,references:NovelAIReferenceSchema.optional()})}),{io:'input'});
export const NovelAIReferenceJsonSchema=z.toJSONSchema(NovelAIReferenceSchema);
/** Native field names follow the image service's public RequestParameters schema. */
export function novelAINativeRequest(input: Extract<GenerationInput,{purpose:'image'}>, config: ConnectionConfig, images:string[]) {
  const stored=input.novelai;
  if(!stored)throw new Error('The native NovelAI request requires a complete structured prompt. Save the current prompt first.');
  const prompt=NovelAIPromptSchema.parse(stored.prompt), settings=NovelAISettingsSchema.parse(stored.settings);
  if(!['v5-full','v5-curated','v45-full'].includes(settings.modelProfile))throw new Error('Invalid NovelAI model profile');
  if(config.parameters.novelaiModelProfile!==settings.modelProfile)throw new Error('Confirm the NovelAI profile matching the actual connection model');
  const limit=settings.modelProfile==='v45-full'?6:22;if(prompt.characters.length>limit)throw new Error(`The current model supports at most ${limit} character blocks`);
  const positive=novelAIBasePrompt(prompt,settings), positions=prompt.characters.some(character=>character.position!==null);
  const caption=(negative:boolean)=>({caption:{base_caption:negative?prompt.negativePrompt??'':positive,char_captions:prompt.characters.map(character=>({char_caption:negative?character.negativePrompt??'':character.prompt,centers:character.position?[character.position]:[]}))},use_coords:positions,use_order:true});
  const request=(config.parameters.request??{}) as Record<string,Json>;
  const parameters:Record<string,Json>={...request,width:input.width,height:input.height,seed:input.seed,n_samples:input.count,negative_prompt:prompt.negativePrompt??'',v4_prompt:caption(false),v4_negative_prompt:caption(true),qualityToggle:false,tag_hint_transparent_background:settings.transparent,straight_alpha:settings.transparent};
  if(settings.negativePreset!==null){const index=Number(settings.negativePreset);if(!Number.isInteger(index)||index<0)throw new Error('An official negative preset requires a numeric identity confirmed by the service');parameters.ucPreset=index;parameters.tag_hint_uc_preset=index;}
  let action='generate';
  if(images.length){const reference=NovelAIReferenceSchema.parse(stored.references);if(reference.mode==='img2img'){if(images.length!==1)throw new Error('Image-to-image requires exactly one reference image');action='img2img';parameters.image=images[0]!;parameters.strength=reference.strength;}
    else if(reference.mode==='vibe'){parameters.reference_image_multiple=images;parameters.reference_strength_multiple=images.map(()=>reference.strength);parameters.reference_information_extracted_multiple=images.map(()=>reference.informationExtracted);}
    else {if(settings.modelProfile!=='v45-full')throw new Error('Precise Reference is unconfirmed for this profile. Choose a confirmed model.');parameters.director_reference_images=images;parameters.director_reference_strength_values=images.map(()=>reference.strength);parameters.director_reference_information_extracted=images.map(()=>reference.informationExtracted);parameters.director_reference_secondary_strength_values=images.map(()=>reference.fidelity??1);parameters.director_reference_descriptions=images.map(()=>({caption:{base_caption:reference.description??'character',char_captions:[]}}));}}
  return {action,input:positive,model:config.model,parameters};
}
export function novelAIBasePrompt(prompt: NovelAIPromptDraft, settings: NovelAISettings): string {
  const quality = settings.modelProfile === 'v45-full' ? [] : settings.quality === 'light' ? ['very aesthetic', 'amazing quality', 'no text'] : settings.quality === 'standard' ? ['very aesthetic', 'masterpiece', 'no text'] : [];
  const parts = prompt.basePrompt.split(',').map(value => value.trim()).filter(Boolean);
  for (const tag of [...quality, ...(settings.transparent && settings.modelProfile !== 'v45-full' ? ['transparent background'] : [])]) if (!parts.some(part => part.toLowerCase() === tag)) parts.push(tag);
  return parts.join(', ');
}
export const novelAISeparatedPrompt = (prompt: NovelAIPromptDraft, settings: NovelAISettings): string => [novelAIBasePrompt(prompt, settings), ...prompt.characters.map(character => character.prompt)].join(' | ');
/** A review artifact, deliberately excludes unverified native model/parameter names. */
export function novelAIRequestDesign(prompt: NovelAIPromptDraft, settings: NovelAISettings) {
  NovelAIPromptSchema.parse(prompt);
  return { endpoint: 'https://image.novelai.net/ai/generate-image', method: 'POST', authentication: 'Personal Bearer credential',
    status: 'requires-account-verification', modelProfile: settings.modelProfile, exactModel: null,
    prompt: { ...prompt, basePrompt: novelAIBasePrompt(prompt, settings) }, quality: settings.modelProfile === 'v45-full' ? 'none' : settings.quality,
    officialNegativePreset: settings.negativePreset, preciseReference: settings.modelProfile === 'v45-full' ? 'Configure and verify with an account' : 'Unverified for this profile',
    cancellation: 'Local abort does not confirm remote cancellation or prevent billing', response: ['ZIP images', 'Documented JSON/base64'], automaticResubmission: false };
}

export { NovelAIRecipeInputs } from './novelai-recipes.js';
