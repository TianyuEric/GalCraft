import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimationTargetPicker, type AnimationTargetOption } from './AnimationTargetPicker.js';
import './shell.css';
import './workspace.css';

const options: AnimationTargetOption[] = [
  { id:'ActorA',name:'澜汐',appearance:'立绘 · deepseek-neutral-with-a-long-production-asset-name.png · 左四分之一',availability:'present',detail:'今晚，让春天亮起来 / 街道 · 春灯的最后一晚 · 指令7',source:{sceneId:'SceneA',statementId:'StartA',documentId:'DocAAA',order:6} },
  { id:'ActorA',name:'澜汐',appearance:'立绘 · deepseek-smile.png · 左四分之一',availability:'present',detail:'今晚，让春天亮起来 / 街道 · 春灯的最后一晚 · 指令11',source:{sceneId:'SceneA',statementId:'AgainA',documentId:'DocAAA',order:10} },
  { id:'ActorB',name:'绮白',appearance:'立绘 · chatgpt-neutral.png · 居中',availability:'absent',detail:'今晚，让春天亮起来 / 街道 · 春灯的最后一晚 · 指令13',source:{sceneId:'SceneA',statementId:'StartB',documentId:'DocAAA',order:12} },
  { id:'ActorC',name:'绯书',appearance:'立绘 · claude-neutral.png · 右四分之一',availability:'unknown',detail:'次日 / 放映馆 · 尚未选择的剧情分支 · 指令3',source:{sceneId:'SceneB',statementId:'StartC',documentId:'DocBBB',order:2} },
];
function Experience({theme='light',locale='zh-CN',empty=false,width=480}:{theme?:string;locale?:string;empty?:boolean;width?:number}) {
  const [value,choose]=useState('ActorA'),[source,locate]=useState('');
  return <div data-theme={theme} lang={locale} className="authoring-shell" style={{display:'block',minHeight:'100dvh',padding:16}}><div style={{width,maxWidth:'100%',padding:12,background:'var(--popover)',border:'1px solid var(--border)',borderRadius:8}}>
    <AnimationTargetPicker options={empty?[]:options} value={value} locale={locale} choose={choose} locate={option=>locate(option.source?.statementId??'')}/>
  </div><p style={{fontSize:12,color:'var(--foreground-secondary)'}}>Storybook 内存夹具 · <output aria-label="当前目标">{value}</output> · <output aria-label="定位指令">{source}</output></p></div>;
}
const meta={title:'Product/Studio/Authoring/Animation Target Picker',component:Experience,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Experience>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Light:Story={};
export const Dark:Story={args:{theme:'dark'}};
export const Narrow:Story={args:{width:320}};
export const English:Story={args:{locale:'en',width:320}};
export const Japanese:Story={args:{locale:'ja',theme:'dark',width:320}};
export const Empty:Story={args:{empty:true}};
