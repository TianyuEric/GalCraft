import { describe,expect,it } from 'vitest';
import { compactPresentationScript, presentationValue } from './presentation.js';
import { hover } from './monaco.js';
import { createCommandRegistry } from './catalog.js';
import { parse } from './parser.js';
import { patchFields,applyTextEdits } from './editing.js';

describe('presentation precision and reference discovery',()=>{
  const script='changeFigure {op:"show",objectId:"Obj001",assetId:"Art001",framing:{mode:"upper",scale:1.11328125,offsetX:0,offsetY:683.9999999639999,crop:null}} @Line01;';
  it('compacts only presentation numeric tokens and leaves authored text and variable values exact',()=>{
    const other='\nsay {speaker:{kind:"narrator"},text:"683.9999999639999"} @Line02;\nsetVar {variableId:"Var001",op:"set",value:1.123456789} @Line03;';
    const projected=compactPresentationScript(script+other);
    expect(projected).toContain('scale:1.1133');expect(projected).toContain('offsetY:684');expect(projected).toContain(other);
    expect(projected).toContain('@Line01');expect(projected).toContain('assetId:"Art001"');
    expect(presentationValue('changeFigure','framing.scale',.000001)).toBe(.000001);
  });
  it('writes bounded control precision through the existing source patch without rewriting the rest',()=>{
    const parsed=parse({documentId:'Doc001',revision:1,text:script});
    const patched=patchFields(parsed,{documentId:'Doc001',revision:1,statementIds:['Line01'],changes:[{field:'framing.offsetY',op:'set',value:123.456789}]});
    expect(patched.ok).toBe(true);if(!patched.ok)return;
    const next=applyTextEdits(script,patched.value);expect(next).toContain('offsetY:123.46');expect(next).toContain('scale:1.11328125');
  });
  it('resolves file names at reference values and retains field documentation at keys',()=>{
    const parsed=parse({documentId:'Doc001',revision:1,text:script}),registry=createCommandRegistry('0.1.0');
    const refs=[{kind:'asset' as const,id:'Art001',name:'街道_背景.png',detail:'背景/街道 · image'}];
    expect(hover(parsed,script.indexOf('Art001')+2,registry,[],refs,'zh-CN')).toMatchObject({title:'街道_背景.png',reference:{id:'Art001',detail:'背景/街道 · image',missing:false}});
    expect(hover(parsed,script.indexOf('assetId')+1,registry,[],refs)?.type).toBe('ref');
    expect(hover(parsed,script.indexOf('Art001')+2,registry,[],[],'en')).toMatchObject({title:'Reference unavailable',reference:{missing:true}});
    expect(hover(parsed,script.indexOf('@Line01')+3,registry)?.reference?.id).toBe('Line01');
  });
});
