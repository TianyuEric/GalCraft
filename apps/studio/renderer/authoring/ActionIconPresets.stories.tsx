import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../components/controls.js';
import { openActionIconPicker } from './action-icon-picker.js';
import './page-designer.css';
import './shell.css';
import './workspace.css';

const names:Record<string,string>={start:'开始',save:'保存',load:'读取',history:'历史',settings:'设置',pin:'固定',auto:'自动',skip:'快进',title:'标题页',back:'返回',music:'音乐',cg:'图片鉴赏',exit:'退出',flow:'剧情流程',characters:'角色'};
function Presets({theme='light'}:{theme?:'light'|'dark'}){
  const root=useRef<HTMLDivElement>(null),[selected,setSelected]=useState('');
  return <div data-theme={theme} ref={root} className="authoring-shell" style={{display:'block',padding:24,minHeight:'100vh',background:'var(--workbench-editor)',color:'var(--foreground)'}}><div id="studio-portals" lang="zh-CN" data-theme={theme}/>
    <Button onClick={async event=>{const origin=event.currentTarget,manifest=await fetch('/practice/manifest.json').then(response=>response.json());
      openActionIconPicker({root:root.current!,origin,locale:'zh-CN',presets:Object.entries(manifest.ui as Record<string,string>).filter(([key])=>key!=='lantern').map(([key,path])=>({key,names:{'zh-CN':names[key]!},previewUri:`/practice/${path}`})),select:async key=>setSelected(names[key]!)});
    }}>常用图标</Button><p role="status">{selected?`已选择 ${selected}`:'选择后绑定当前图标槽'}</p>
  </div>;
}
const meta={title:'Product/Studio/Authoring/Action Icon Presets',component:Presets,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Presets>;
export default meta;type Story=StoryObj<typeof meta>;
export const CommonIcons:Story={play:async({canvasElement})=>{
  await userEvent.click(within(canvasElement).getByRole('button',{name:'常用图标'}));
  const dialog=await within(document.body).findByRole('dialog',{name:'常用图标'});
  expect(dialog.querySelectorAll('.action-icon-picker-grid button')).toHaveLength(15);
  await userEvent.click(within(dialog).getByRole('button',{name:'历史'}));
  await waitFor(()=>expect(within(canvasElement).getByRole('status')).toHaveTextContent('已选择 历史'));
}};
export const DarkIcons:Story={args:{theme:'dark'}};
