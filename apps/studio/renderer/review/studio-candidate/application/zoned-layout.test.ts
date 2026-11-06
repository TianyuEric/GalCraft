import {describe,expect,it} from 'vitest';
import {emptyLayout,groups,layoutKeys,loadLayouts,minimum,openViews} from './zoned-layout.js';
const group=(id:string,tabs:string[])=>({kind:'group' as const,id,tabs,active:tabs[0]??''});
const legacy={tree:{kind:'split',id:'old',axis:'x',ratio:.15,first:group('outline',['outline']),second:group('scene',['writing:scene-a','source:scene-a'])},floats:[{...group('float',['production-inspector','missing-object']),x:50,y:80,width:360,height:300}],collapsed:[{...group('closed',['inspector']),home:{kind:'dock',target:'scene',edge:'right'}}],pinned:['source:scene-a'],activeGroup:'scene'};
function storage(values:Record<string,string>){return {getItem:(key:string)=>values[key]??null,setItem:(key:string,value:string)=>{values[key]=value;}};}
describe('legacy candidate layout migration',()=>{
  it('preserves both raw keys, explicit scene modes, collapsed intent and unavailable objects',()=>{
    const keys=layoutKeys('work'),raw=JSON.stringify(legacy),presets=JSON.stringify({'我的布局':legacy});
    const values:Record<string,string>={[keys.legacy]:raw,[keys.legacyPresets]:presets};
    const result=loadLayouts(storage(values),'work');expect(result.error).toBeUndefined();
    expect(values[keys.legacy]).toBe(raw);expect(values[keys.legacy+':legacy-backup']).toBe(raw);
    expect(values[keys.legacyPresets]).toBe(presets);expect(values[keys.legacyPresets+':legacy-backup']).toBe(presets);
    expect(result.layout!.left.tabs).toEqual(['outline']);expect(result.layout!.widths).toEqual({left:320,right:320});
    expect(result.layout!.collapsed).toMatchObject([{tabs:['inspector'],zone:'right',home:{kind:'dock'}}]);
    expect(result.layout!.right.tabs).toEqual([]);
    expect(groups(result.layout!.tree).map(group=>group.tabs)).toEqual([['writing:scene-a','source:scene-a'],['production','missing-object']]);
    expect(result.layout!.kept).toContain('source:scene-a');
    expect(openViews(JSON.parse(values[keys.presets]!)['我的布局'])).toContain('missing-object');
    expect(minimum(result.layout!.tree!,'x',()=>({width:480,height:240}))).toBe(965);
  });
  it('keeps malformed values intact and never writes the new layout key on failure',()=>{
    const keys=layoutKeys('broken'),values={[keys.legacy]:'{unfinished',[keys.legacyPresets]:'{"my":null}'};
    const result=loadLayouts(storage(values),'broken');expect(result.error).toContain('旧值保留');
    expect(values[keys.legacy+':legacy-backup']).toBe('{unfinished');expect(values[keys.current]).toBeUndefined();expect(values[keys.presets]).toBeUndefined();
  });
  it('recovers a saved v2 layout even when a legacy named preset cannot migrate',()=>{
    const keys=layoutKeys('current'),layout=emptyLayout();layout.left=group('left',['outline']);
    const current=JSON.stringify(layout),values:Record<string,string>={[keys.current]:current,[keys.legacyPresets]:'{broken'};
    const result=loadLayouts(storage(values),'current');
    expect(result.layout).toEqual(layout);expect(result.error).toContain('旧值保留');
    expect(values[keys.current]).toBe(current);expect(values[keys.legacyPresets+':legacy-backup']).toBe('{broken');
    expect(values[keys.presets]).toBeUndefined();
  });
});
