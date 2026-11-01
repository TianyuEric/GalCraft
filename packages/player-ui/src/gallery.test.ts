import {describe,it,expect} from 'vitest';
import {FixtureSnapshot} from '@galcraft/contracts/fixtures';
import type {GalleryEntry,UIAnimation,LongTerm} from '@galcraft/contracts';
import {galleryCover,unlockedDifferences} from './gallery.js';
import {prepareGallerySample,gallerySampleLongTerm} from './gallery-samples.js';
import {PageTransition,animationFrames} from './page-animation.js';

const FixtureLongTerm:LongTerm={schemaVersion:2,revision:0,endings:[],cg:{},music:[],video:[],readStatements:[],flowEntries:{},variables:{},plugins:{}};

describe('gallery projection and navigation',()=>{
  it('uses stable difference identities and never resolves a locked cover',()=>{
    const entry:GalleryEntry={id:'series',kind:'cg',name:'CG',series:'A',order:0,cover:null,assets:[],lockedView:'placeholder',coverDifferenceId:'locked',differences:[{id:'open',assetId:'image-a',name:'A',order:1},{id:'locked',assetId:'image-b',name:'B',order:0}]};
    const data=structuredClone(FixtureLongTerm);data.cg={series:['open']};expect(galleryCover(entry,data)).toBe('image-a');entry.differences!.reverse();entry.differences![0]!.name='renamed';expect(unlockedDifferences(entry,data).map(diff=>diff.id)).toEqual(['open']);data.cg={};expect(galleryCover(entry,data)).toBeUndefined();
  });
  it('projects samples without modifying source documents or player records',()=>{
    const source=structuredClone(FixtureSnapshot),before=structuredClone(source),sample=structuredClone(source);prepareGallerySample(sample,'partial');const data=gallerySampleLongTerm(sample,FixtureLongTerm,'partial');expect(sample.gallery.filter(entry=>entry.kind==='cg')).toHaveLength(7);expect(source).toEqual(before);expect(FixtureLongTerm.endings).not.toContain('gallery-design-sample');expect(Object.values(data.cg).every(ids=>ids.length===2)).toBe(true);
  });
  const animation:UIAnimation={id:'fade',version:1,name:'Fade',reduced:'finish',segments:[{durationMs:0,opacity:0,translateX:-30,easing:{family:'linear',direction:'in'}},{durationMs:100,opacity:1,translateX:0,easing:{family:'sine',direction:'out'}}]};
  it('keeps segment easing, scales design displacement and honors reduced motion',()=>{const frames=animationFrames(animation,false,.5);expect(frames.duration).toBe(100);expect(frames.frames[0]!.transform).toBe('translate(-15px,0px) scale(1)');expect(frames.frames[0]!.easing).toContain('linear(');expect(animationFrames(animation,true).duration).toBe(0);});
  it('animates without replacing the authored anchor or free group scale',async()=>{let captured:Keyframe[]=[];const style={transform:'translate(-50%,-50%)',translate:'-50% -50%',scale:'1.4'},element={style,animate:(frames:Keyframe[])=>{captured=frames;return{finished:Promise.resolve(),cancel(){}};}} as unknown as HTMLElement;await new PageTransition().play(element,animation,false);expect(style).toEqual({transform:'translate(-50%,-50%)',translate:'-50% -50%',scale:'1.4'});expect(captured[0]!.transform).toBe('translate(-50%,-50%) translate(-30px,0px) scale(1)');expect(captured[0]!.translate).toBeUndefined();expect(captured[0]!.scale).toBeUndefined();});
  it('accepts one navigation and cancels input locks without handing off a stale page',async()=>{
    let reject!:()=>void;const element={inert:false,style:{transform:''},animate:()=>({finished:new Promise<void>((_,failure)=>{reject=()=>failure(new Error('cancel'));}),cancel:()=>reject()})} as unknown as HTMLElement;
    const transition=new PageTransition();let changes=0;const first=transition.navigate(element,animation,()=>changes++,()=>animation,false);expect(element.inert).toBe(true);expect(await transition.navigate(element,animation,()=>changes++,()=>animation,false)).toBe(false);transition.cancel();expect(await first).toBe(false);expect(element.inert).toBe(false);expect(changes).toBe(0);
    expect(await transition.navigate(element,animation,()=>changes++,()=>animation,true)).toBe(true);expect(changes).toBe(1);expect(element.inert).toBe(false);
  });
});
