import { afterEach, expect, test, vi } from 'vitest';
import type { UIAnimation } from '@galcraft/contracts';
import { PageTransition } from './page-animation.js';

afterEach(()=>vi.unstubAllGlobals());
const fade:UIAnimation={id:'Fade01',name:'Fade',version:1,reduced:'fade',segments:[
  {durationMs:0,opacity:1,easing:{family:'linear',direction:'in'}},
  {durationMs:200,opacity:0,easing:{family:'linear',direction:'in'}},
]};
function animatedElement(){
  let complete!:()=>void;
  const animation={finished:new Promise<void>(resolve=>{complete=resolve;}),cancel:vi.fn()};
  const element={style:{transform:''},animate:vi.fn(()=>animation)} as unknown as HTMLElement;
  return{element,animation,complete};
}
test('page handoff keeps the finished source while another page layer is entering',async()=>{
  const transition=new PageTransition(),source=animatedElement(),target=animatedElement();
  const leaving=transition.play(source.element,fade,false,undefined,1,true);
  const entering=transition.play(target.element,fade,false,undefined,1,true);
  source.complete();await leaving;
  expect(source.animation.cancel).not.toHaveBeenCalled();
  target.complete();await entering;
  expect(target.animation.cancel).not.toHaveBeenCalled();
  transition.cancel();
  expect(source.animation.cancel).toHaveBeenCalledOnce();
  expect(target.animation.cancel).toHaveBeenCalledOnce();
});
test('ordinary part animations release their effect at completion',async()=>{
  const transition=new PageTransition(),part=animatedElement();
  const playing=transition.play(part.element,fade,false);
  part.complete();await playing;
  expect(part.animation.cancel).toHaveBeenCalledOnce();
});
