import { createId, type ComponentConfig, type Id, type RuntimeTemplate, type UIAnimation } from '@galcraft/contracts';
import { components, findComponent } from './editing.js';

export type UIAnimationBinding = keyof ComponentConfig['animations'];
const definitions = [
  ['fadeIn','淡入','Fade in','フェードイン',false,0,0,1,120],['fadeOut','淡出','Fade out','フェードアウト',true,0,0,1,120],
  ['inUp','从上方滑入','Slide in from top','上から入る',false,0,-24,1,200],['inDown','从下方滑入','Slide in from bottom','下から入る',false,0,24,1,200],
  ['inLeft','从左侧滑入','Slide in from left','左から入る',false,-24,0,1,200],['inRight','从右侧滑入','Slide in from right','右から入る',false,24,0,1,200],
  ['outUp','向上方滑出','Slide out to top','上へ出る',true,0,-24,1,180],['outDown','向下方滑出','Slide out to bottom','下へ出る',true,0,24,1,180],
  ['outLeft','向左侧滑出','Slide out to left','左へ出る',true,-24,0,1,180],['outRight','向右侧滑出','Slide out to right','右へ出る',true,24,0,1,180],
  ['scaleIn','轻缩放淡入','Scale & fade in','拡大フェードイン',false,0,0,.96,180],['scaleOut','轻缩放淡出','Scale & fade out','縮小フェードアウト',true,0,0,.96,160],
] as const;
export const UIAnimationPresets = definitions.map(([key,zh,en,ja])=>({key,name:{'zh-CN':zh,en,ja}}));
export function createUIAnimationPreset(key:string,id:Id=createId(),locale='zh-CN'):UIAnimation {
  const definition=definitions.find(item=>item[0]===key);if(!definition)throw new Error(`Unknown UI animation preset: ${key}`);
  const [,zh,en,ja,outgoing,x,y,scale,durationMs]=definition;
  return {id,name:locale==='en'?en:locale==='ja'?ja:zh,version:1,reduced:'fade',segments:[
    {durationMs:0,opacity:outgoing?1:0,translateX:outgoing?0:x,translateY:outgoing?0:y,scale:outgoing?1:scale,easing:{family:'cubic',direction:'out'}},
    {durationMs,opacity:outgoing?0:1,translateX:outgoing?x:0,translateY:outgoing?y:0,scale:outgoing?scale:1,easing:{family:'cubic',direction:'out'}},
  ]};
}
export function uiAnimationUses(template:RuntimeTemplate,id:Id) {
  return template.pages.flatMap(page=>components(page.root).flatMap(component=>Object.entries(component.animations).filter(([,value])=>value===id).map(([event])=>({pageId:page.id,page:page.key,componentId:component.id,part:component.part,event:event as UIAnimationBinding}))));
}
/** One template edit owns definition and binding changes, so M02 can undo them together. */
export function putUIAnimation(template:RuntimeTemplate,value:UIAnimation,target?:{componentId:Id;event:UIAnimationBinding;shared:boolean}) {
  const next=structuredClone(template),component=target&&findComponent(next,target.componentId);
  let edited=structuredClone(value);
  if(target&&!component)throw new Error('Animation component is unavailable');
  if(target&&!target.shared&&uiAnimationUses(template,value.id).length>1){edited.id=createId(next);edited.name=`${edited.name} · ${component!.part}`;}
  const index=next.animations.findIndex(item=>item.id===edited.id);
  if(index<0)next.animations.push(edited);else next.animations[index]=edited;
  if(component&&target)component.animations[target.event]=edited.id;
  return next;
}
export function removeUIAnimation(template:RuntimeTemplate,id:Id,unbind=false) {
  const next=structuredClone(template),uses=uiAnimationUses(next,id);
  if(uses.length&&!unbind)throw new Error('Animation is still referenced');
  for(const use of uses)delete findComponent(next,use.componentId)!.animations[use.event];
  next.animations=next.animations.filter(item=>item.id!==id);return next;
}
