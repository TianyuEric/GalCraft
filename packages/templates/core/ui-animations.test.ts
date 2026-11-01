import { describe, expect, it } from 'vitest';
import { components, createOfficialTemplate, createUIAnimationPreset, putUIAnimation, removeUIAnimation, UIAnimationPresets, uiAnimationUses, planTemplate } from './index.js';
describe('UI animation ownership',()=>{
  it('provides twelve observable directional presets and preserves local versus shared edit scope',()=>{
    expect(UIAnimationPresets).toHaveLength(12);
    for(const preset of UIAnimationPresets){const animation=createUIAnimationPreset(preset.key);expect(animation.segments[0]).not.toMatchObject(animation.segments[1]!);}
    const template=createOfficialTemplate(),first=template.pages[0]!.root,second=template.pages[1]!.root,id=first.animations.enter!;
    const animation=template.animations.find(item=>item.id===id)!;
    const edited=putUIAnimation(template,{...animation,name:'Only here'},{componentId:first.id,event:'enter',shared:false});
    expect(edited.pages[0]!.root.animations.enter).not.toBe(id);expect(edited.pages[1]!.root.animations.enter).toBe(second.animations.enter);
    expect(()=>removeUIAnimation(edited,id)).toThrow();
    const removed=removeUIAnimation(edited,id,true);expect(uiAnimationUses(removed,id)).toEqual([]);expect(removed.pages[0]!.root.animations.enter).toBeTruthy();
  });
  it('retains author definitions with retained bindings during template adoption',()=>{
    const template=createOfficialTemplate(),page=template.pages[0]!,part=components(page.root).find(item=>item.part==='title.menu.start')!;
    const animation=createUIAnimationPreset('scaleIn');template.animations.push(animation);part.animations.pressed=animation.id;
    const next=planTemplate(template,createOfficialTemplate({kind:'rich',richRelation:'reading'}),[`title/${part.part}/animations`]).template;
    expect(components(next.pages[0]!.root).find(item=>item.part===part.part)?.animations.pressed).toBe(animation.id);
    expect(next.animations.find(item=>item.id===animation.id)).toEqual(animation);
  });
});
