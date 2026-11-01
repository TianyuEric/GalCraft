import {describe,expect,it} from 'vitest';
import {validateJsonData} from '@galcraft/contracts';
import {motionProjectInfo,projectToolOutput,projectToolInput} from './tools.js';
describe('public Motion Canvas project tool',()=>{
  it('returns the real shared project definition and validates its output envelope',async()=>{
    const result=await motionProjectInfo({action:'describe'},{});expect(result.ok).toBe(true);if(result.ok){expect(validateJsonData(projectToolOutput,result.value).ok).toBe(true);expect(result.value).toMatchObject({action:'describe',valid:null,project:{render:{frames:360}}});}
  });
  it('reports missing runtime and invalid source as readable diagnostics',async()=>{
    const missing=await motionProjectInfo({action:'runtime'},{});expect(missing.ok).toBe(true);if(missing.ok)expect(missing.value).toMatchObject({toolchain:null,issues:[{code:'MOTION_RUNTIME'}]});
    const invalid=await motionProjectInfo({action:'validate',project:{}},{});expect(invalid.ok).toBe(true);if(invalid.ok){expect(validateJsonData(projectToolOutput,invalid.value).ok).toBe(true);expect(invalid.value).toMatchObject({valid:false});}
  });
  it('requires validate input and rejects wrong result branches or malformed toolchain diagnostics',async()=>{
    expect(validateJsonData(projectToolInput,{action:'validate'}).ok).toBe(false);
    const described=await motionProjectInfo({action:'describe'},{});if(!described.ok)throw new Error('describe failed');
    expect(validateJsonData(projectToolOutput,{...described.value as object,action:'runtime'}).ok).toBe(false);
    expect(validateJsonData(projectToolOutput,{...described.value as object,issues:[{message:'incomplete'}]}).ok).toBe(false);
    expect(validateJsonData(projectToolOutput,{...described.value as object,action:'runtime',project:null,toolchain:{id:'missing-fields'}}).ok).toBe(false);
  });
});
