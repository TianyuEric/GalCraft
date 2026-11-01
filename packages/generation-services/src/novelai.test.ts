import {expect,it} from 'vitest';
import {novelAINativeRequest,defaultNovelAISettings,emptyNovelAIPrompt} from './novelai.js';
import type {ConnectionConfig,GenerationInput} from '@galcraft/contracts';
const config={model:'account-confirmed-model',parameters:{novelaiModelProfile:'v5-full'}} as unknown as ConnectionConfig;
const prompt={...emptyNovelAIPrompt(),basePrompt:'very aesthetic, moonlit street',negativePrompt:'blur',characters:[{name:'青',prompt:'blue coat',negativePrompt:'red coat',position:{x:.2,y:.7}},{name:'白',prompt:'white dress',negativePrompt:null,position:null}]};
const input={purpose:'image',usage:'cg',positive:'unused flattened copy',negative:'unused',width:1024,height:1024,count:1,seed:42,references:[],novelai:{prompt,settings:{...defaultNovelAISettings(),quality:'light',transparent:true}}} as GenerationInput & {purpose:'image'};
it('maps every character, negative, position and selected tag once to the native request',()=>{
  const body=novelAINativeRequest(input,config,[]);expect(body.model).toBe(config.model);expect(body.input.match(/very aesthetic/g)).toHaveLength(1);
  expect(body.parameters).toMatchObject({qualityToggle:false,straight_alpha:true,v4_prompt:{caption:{char_captions:[{char_caption:'blue coat',centers:[{x:.2,y:.7}]},{char_caption:'white dress',centers:[]}]},use_coords:true},v4_negative_prompt:{caption:{base_caption:'blur',char_captions:[{char_caption:'red coat'},{char_caption:''}]}}});
});
it('keeps reference mode distinct and diagnoses unsupported model capabilities before a send',()=>{
  const value=structuredClone(input);value.novelai!.references={mode:'vibe',strength:.6,informationExtracted:.9};expect(novelAINativeRequest(value,config,['first','second']).parameters).toMatchObject({reference_image_multiple:['first','second'],reference_strength_multiple:[.6,.6]});
  value.novelai!.references={mode:'precise',strength:1,informationExtracted:1};expect(()=>novelAINativeRequest(value,config,['reference'])).toThrow('Precise Reference');
  expect(()=>novelAINativeRequest(input,{...config,parameters:{}},[])).toThrow('Confirm the NovelAI profile');
});
