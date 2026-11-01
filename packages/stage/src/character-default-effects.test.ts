import { describe, expect, it } from 'vitest';
import { FixtureCharacters, FixtureIds, FixtureRuntimeState } from '@galcraft/contracts/fixtures';
import type { Json, Result } from '@galcraft/contracts';
import { StageCommandService } from './commands.js';
const unwrap=<T>(result:Result<T>):T=>{if(!result.ok)throw result.error;return result.value;};
describe('character default presentation effects',()=>{
  it('inherits on entrance, permits per-field overrides, preserves replacements and resets to character defaults',async()=>{
    const character=structuredClone(FixtureCharacters[0]!);character.defaultEffects={...character.defaultEffects,x:75,scaleX:.8,opacity:.6,z:7,filters:{...character.defaultEffects.filters,oldFilm:true}};
    const service=new StageCommandService({asset:()=>({ok:true,value:{variantId:FixtureIds.variant,kind:'image',provider:null,providerVersion:null},warnings:[]}),character:id=>id===character.id?character:undefined});
    const token={sessionId:FixtureIds.session,occurrence:1,statementId:FixtureIds.statements[0]!};
    const prepare=async(state:typeof FixtureRuntimeState,args:Json)=>unwrap(await service.prepare({state,token,opcode:'changeFigure',args})).state;
    let state=await prepare(structuredClone(FixtureRuntimeState),{op:'show',objectId:'Object',characterId:character.id,assetId:FixtureIds.background,effects:{opacity:.9,filters:{glitch:true}}});
    expect(state.presentation.objects[0]!.current).toMatchObject({x:75,scaleX:.8,opacity:.9,z:7,filters:{oldFilm:true,glitch:true}});
    state=await prepare(state,{op:'replace',objectId:'Object',assetId:FixtureIds.background,effects:{x:120},z:9});expect(state.presentation.objects[0]!.current).toMatchObject({x:120,z:9,opacity:.9});
    state=await prepare(state,{op:'replace',objectId:'Object',assetId:FixtureIds.background,reset:true});expect(state.presentation.objects[0]!.current).toMatchObject({x:75,z:7,opacity:.6,filters:{oldFilm:true,glitch:false}});
  });
});
