import { describe,expect,it } from 'vitest';
import { DefaultTimeoutSecByPurpose, type ConnectionConfig } from '@galcraft/contracts';
import { inputTextSummary,textCharacters } from './input-summary.js';
import { previewTextInput } from './preview.js';
import { prepareRecipe } from './recipe-preparer.js';
import { inputCapability } from './capabilities.js';
import { OfficialRecipes } from '../recipes/official.js';
import type { FormVariant,GenerationInput } from './types.js';

describe('request character accounting',()=>{
  const config:ConnectionConfig={id:'Conn01',revision:1,name:'文字连接',protocol:'chatCompletions',baseUrl:'https://example.invalid',auth:'none',credentialId:null,apiKeyHeader:null,model:'test',purposes:['text'],timeoutSecByPurpose:DefaultTimeoutSecByPurpose,concurrency:1,parameters:{},workflowBindingId:null,serverFileRoot:null};
  it('counts Unicode text and whitespace independently of encoded attachments and transport metadata',()=>{
    const input:Extract<GenerationInput,{purpose:'text'}>={purpose:'text',system:'规则\n',messages:[{role:'user',text:'A😀 中',attachments:[{id:'Img001',localPath:'C:/a/very/long/local/file.png',mime:'image/png',bytes:9000,width:100,height:100,source:null}]}],maxOutputTokens:3000,temperature:null,seed:null};
    expect(textCharacters(input.messages[0]!.text)).toBe(4);
    expect(inputTextSummary(input)).toEqual({textCharacters:7,systemCharacters:3,messageCharacters:4,attachments:1});
    expect(inputTextSummary({...input,maxOutputTokens:99999})).toEqual(inputTextSummary(input));
  });
  it('previews the same full prompt that the execution recipe compiles, excluding unselected context',()=>{
    const recipe=OfficialRecipes.find(item=>item.purposes.includes('script')&&item.scriptMode!=='performance')!;
    const selection={recipeId:recipe.id,scope:recipe.scope,purpose:'script' as const,usage:'script' as const,parameterValues:{}};
    const variant:FormVariant={operation:'script',target:{sceneId:'Scene1',statementId:null,characterId:null,locale:null,usage:'script',uiScope:null},fields:{instruction:'写下一幕',maxOutputTokens:100},context:[{id:'Part01',kind:'setting',label:'作品信息',included:true,source:null,text:'{"name":"春日","description":"中文与日本語"}',media:null,attachment:null,authorEdited:false},{id:'Part02',kind:'setting',label:'排除',included:false,source:null,text:'不发送的内容'.repeat(100),media:null,attachment:null,authorEdited:false}],connectionId:config.id,workflowBindingId:null,model:config.model,recipe:selection,promptPreparation:null,backgroundRemoval:null,backgroundPreview:null,sourceVersions:[]};
    const preview=previewTextInput(variant,'script',[recipe],[config],[]);expect(preview).not.toBeNull();if(!preview)return;
    const planned=prepareRecipe({recipe,selection,context:variant.context,instruction:'写下一幕',settings:{maxOutputTokens:100,temperature:null,seed:null},capability:inputCapability(config,preview.input,null),sourceVersions:[]});
    expect(planned.ok).toBe(true);if(!planned.ok)return;
    expect(preview.input).toEqual(planned.value.assembledInput);expect(preview.input.messages[0]!.text).not.toContain('不发送');
    const selected=previewTextInput({...variant,context:variant.context.map(part=>({...part,included:true}))},'script',[recipe],[config],[])!;
    expect(inputTextSummary(selected.input).textCharacters).toBeGreaterThan(inputTextSummary(preview.input).textCharacters);
    expect(variant.context[1]!.included).toBe(false);
  });
});
