import type { Json, Variable } from '@galcraft/contracts';
export type UIBindingField = {source:'data'|'local'|'variable'|'item'|'event';value:string;label:string;type:'string'|'number'|'boolean'|'collection';access:'read'|'readWrite';scope:'playerPreferences'|'project'|'page'|'listItem'|'event'|'progress'|'local'|'longTerm';sceneId?:string};
/** Descriptors mirror Player.instanceContext. They contain paths and types, never player records. */
export const UIBindingFields:readonly UIBindingField[] = [
  ...[{value:'project.name',label:'作品名称'},{value:'project.description',label:'作品介绍'}].map(field=>({...field,type:'string' as const,source:'data' as const,access:'read' as const,scope:'project' as const})),
  ...(['master','bgm','sfx','voice','ui','video'] as const).map((bus,i)=>({value:`preferences.volumes.${bus}`,label:['总音量','音乐音量','音效音量','配音音量','界面音量','视频音量'][i]!,type:'number' as const,source:'data' as const,access:'readWrite' as const,scope:'playerPreferences' as const})),
  ...(['textSpeed','fontScale','textboxOpacity','historyOpacity','autoWaitMs'] as const).map((key,i)=>({value:`preferences.${key}`,label:['文字速度','字号倍率','阅读框不透明度','历史不透明度','自动等待毫秒'][i]!,type:'number' as const,source:'data' as const,access:'readWrite' as const,scope:'playerPreferences' as const})),
  ...(['pauseOnBlur','reducedMotion','effects','statusIcons','avatar','chapterNotice','toolbarLocked','fullscreen','movieSkip','filmMode','interruptOnSilent','duckBgm'] as const).map((key,i)=>({value:`preferences.${key}`,label:['失焦暂停','减少动态效果','视觉效果','状态图标','头像','章节提示','锁定工具栏','全屏','允许跳过视频','胶片模式','无语音时中断','音乐压低'][i]!,type:'boolean' as const,source:'data' as const,access:'readWrite' as const,scope:'playerPreferences' as const})),
  ...(['skipScope','menuLocale','voiceLocale','wheelUp','wheelDown','rightButton'] as const).map((key,i)=>({value:`preferences.${key}`,label:['快进范围','菜单语言','配音语言','向上滚轮','向下滚轮','右键行为'][i]!,type:'string' as const,source:'data' as const,access:'readWrite' as const,scope:'playerPreferences' as const})),
  ...(['characters','gallery','history','choices','saves'] as const).map((key,i)=>({value:key,label:['角色','鉴赏条目','阅读历史','当前选项','当前存档页'][i]!,type:'collection' as const,source:'data' as const,access:'read' as const,scope:'page' as const})),
];
export function uiBindingFields(input:{variables?:(Variable&{sceneId?:string})[];local?:Record<string,Json>}={}) {
  return [...UIBindingFields,...(input.variables??[]).map(variable=>({source:'variable' as const,value:variable.id,label:variable.name,type:variable.type,access:'read' as const,scope:variable.scope,...(variable.sceneId?{sceneId:variable.sceneId}:{})})),
    ...Object.entries(input.local??{}).map(([value,item])=>({source:'local' as const,value,label:value,type:(Array.isArray(item)||item!==null&&typeof item==='object'?'collection':typeof item==='number'?'number':typeof item==='boolean'?'boolean':'string') as UIBindingField['type'],access:'readWrite' as const,scope:'page' as const}))];
}
