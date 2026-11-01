import { expect, it } from 'vitest';
import { soundInstances } from './sound-instances.js';
import type { SceneSource } from './controller.js';
const scene = (text: string, id = 'Scene1'): SceneSource => ({ sceneId:id, documentId:id, revision:1, savedRevision:1, dirty:false, name:id, chapterId:'Chap01', text });
it('keeps separate sound instances using the same asset and removes only the stopped ID', () => {
  const text='playEffect {soundId:"Rain01",assetId:"Audio1",loop:true} @Play01;\nplayEffect {soundId:"Bell01",assetId:"Audio1"} @Play02;\nplayEffect {op:"stop",soundId:"Rain01"} @Stop01;\nplayEffect {op:"stop",soundId:"Bell01"} @Stop02;';
  expect(soundInstances([scene(text)],'Scene1','Stop01',[]).map(item=>item.id)).toEqual(['Rain01','Bell01']);
  expect(soundInstances([scene(text)],'Scene1','Stop02',[]).map(item=>item.id)).toEqual(['Bell01']);
});
it('marks branch and cross-scene references as needing route confirmation and ignores future local starts', () => {
  const text='playEffect {soundId:"Maybe1",assetId:"Audio1",when:true} @Play01;\nplayEffect {op:"stop",all:true} @Stop01;\nplayEffect {soundId:"Future",assetId:"Audio2"} @Play02;';
  const other=scene('playEffect {soundId:"Other1",assetId:"Audio1",loop:true} @Play03;','Scene2');
  const list=soundInstances([scene(text),other],'Scene1','Stop01',[]);
  expect(list.map(item=>item.id)).toEqual(['Maybe1','Other1']);expect(list.every(item=>!item.current)).toBe(true);
});
