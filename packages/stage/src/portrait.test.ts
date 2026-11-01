import { expect, test } from 'vitest';
import { RuntimeStateSchema } from '@galcraft/contracts';
import { FixtureIds, FixtureRuntimeState } from '@galcraft/contracts/fixtures';
import { StageCommandService } from './commands.js';
import { dialoguePortrait, portraitSourceRect, readingPortrait } from './portrait.js';

test('independent portraits follow sentence/current/default/crop sources with scoped explicit hiding', async () => {
  const state = await figure(), text = state.presentation.text, speaker = text.speakerId!;
  const characters = [{ id: speaker, avatar: 'Default' }];
  expect(readingPortrait(state.presentation.objects, text, characters)).toEqual({ kind: 'image', assetId: 'Default' });
  text.characterAvatars = { [speaker]: { mode: 'image', assetId: 'Current' } };
  expect(readingPortrait([], text, characters)).toEqual({ kind: 'image', assetId: 'Current' });
  text.avatarSelection = { mode: 'image', assetId: 'Sentence' };
  expect(readingPortrait([], text, characters)).toEqual({ kind: 'image', assetId: 'Sentence' });
  text.characterAvatars[speaker] = { mode: 'hidden' };
  expect(readingPortrait([], text, characters)).toBeNull();
  text.speakerId = 'Other'; text.avatarSelection = { mode: 'auto' }; expect(readingPortrait([], text, characters)).toBeNull();
  text.speakerId = null; text.avatarSelection = { mode: 'image', assetId: 'Narration' };
  expect(readingPortrait([], text, characters)).toEqual({ kind: 'image', assetId: 'Narration' });
});

const token={sessionId:FixtureIds.session,occurrence:1,statementId:FixtureIds.statements[0]!};
const service=new StageCommandService({asset:()=>({ok:true,value:{variantId:FixtureIds.variant,kind:'image',provider:null,providerVersion:null},warnings:[]})});
async function figure() {
  const result=await service.prepare({state:structuredClone(FixtureRuntimeState),token,opcode:'changeFigure',args:{objectId:crypto.randomUUID(),assetId:FixtureIds.background,characterId:FixtureIds.an,portrait:{enabled:true,crop:{x:.2,y:.1,width:.4,height:.3}}}});
  if(!result.ok)throw result.error;return result.value.state;
}
test('portrait settings survive save serialization, replacement, and exit without inheriting a speaker',async()=>{
  const state=RuntimeStateSchema.parse(JSON.parse(JSON.stringify(await figure()))), object=state.presentation.objects[0]!;
  expect(dialoguePortrait(state.presentation.objects,state.presentation.text)?.id).toBe(object.id);
  expect(dialoguePortrait(state.presentation.objects,{...state.presentation.text,speakerId:null})).toBeNull();
  expect(dialoguePortrait(state.presentation.objects,{...state.presentation.text,speakerId:crypto.randomUUID()})).toBeNull();
  const replaced=await service.prepare({state,token,opcode:'changeFigure',args:{objectId:object.id,assetId:FixtureIds.background,op:'replace'}});
  if(!replaced.ok)throw replaced.error;
  expect(replaced.value.state.presentation.objects[0]!.portrait).toEqual(object.portrait);
  const exited=await service.prepare({state:replaced.value.state,token,opcode:'changeFigure',args:{objectId:object.id,op:'exit'}});
  if(!exited.ok)throw exited.error;
  expect(dialoguePortrait(exited.value.state.presentation.objects,state.presentation.text)).toBeNull();
});
test('multiple instances require a target, disabled or invisible targets never show',async()=>{
  const state=await figure(), a=state.presentation.objects[0]!, b={...structuredClone(a),id:crypto.randomUUID()};
  expect(dialoguePortrait([a,b],state.presentation.text)).toBeNull();
  expect(dialoguePortrait([a,b],{...state.presentation.text,portraitObjectId:b.id})?.id).toBe(b.id);
  b.current.opacity=0;expect(dialoguePortrait([a,b],{...state.presentation.text,portraitObjectId:b.id})).toBeNull();
  delete a.portrait;expect(dialoguePortrait([a],state.presentation.text)).toBeNull();
});
test('portrait crop uses character canvas offsets independently of stage and camera transforms',async()=>{
  const a=(await figure()).presentation.objects[0]!;
  const before=portraitSourceRect(a,{width:1000,height:2000,offsetX:100,offsetY:100},{width:800,height:1800});
  expect(before).toMatchObject({x:100,y:100,width:400,height:600,offsetX:0,offsetY:0,scaleX:1,scaleY:1});
  a.current.x=300;a.current.scaleX=-2;a.framing.offsetY=500;a.framing.crop={x:10,y:10,width:100,height:100};
  expect(portraitSourceRect(a,{width:1000,height:2000,offsetX:100,offsetY:100},{width:800,height:1800})).toEqual(before);
});
