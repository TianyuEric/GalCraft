import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecoveredInput } from './RecoveredInput.js';
import '../styles/ui.css';
function Example({theme='light',locale='zh-CN',empty=false}:{theme?:'light'|'dark';locale?:string;empty?:boolean}){
  const [closed,setClosed]=useState(false),[discarded,setDiscarded]=useState(false);
  return <div id="app" className="authoring-shell" data-theme={theme} lang={locale} style={{height:'100vh',overflow:'auto',display:'block'}}>
    <div id="studio-portals" data-theme={theme} lang={locale}/>
    {closed?<p style={{padding:24}}>{discarded?'已放弃保留输入':'输入已保留；可从命令面板再次打开。'}</p>:<RecoveredInput locale={locale} groups={empty?[]:[{title:'发行配置',fields:[{label:'Windows 签名',value:'使用本机证书签名'}],open:()=>{}},{title:'街道 · 春灯的最后一晚',fields:[{label:'未应用旁白',value:'街角的灯光亮起来，我们把没说完的话留给明天。'.repeat(10)}]}]} raw={{version:1,projectId:'ProjAA',publish:{windowsSigning:'certificate'},scripts:[['SceneA','保留的剧本输入']]}} close={()=>setClosed(true)} discard={()=>{setDiscarded(true);setClosed(true);}}/>}
  </div>;
}
export default {title:'Product/Studio/Authoring/Recovered input',component:Example,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Example>;
type Story=StoryObj<typeof Example>;
export const Retained:Story={};
export const Dark:Story={args:{theme:'dark'}};
export const English:Story={args:{locale:'en'}};
export const UnknownInput:Story={args:{empty:true}};
