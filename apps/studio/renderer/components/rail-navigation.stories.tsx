import { useEffect,useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RailNavigation } from './rail-navigation.js';
import '../authoring/shell.css';
import '../authoring/refinements.css';

function NavigationPreview() {
  const [current, setCurrent] = useState('editor');
  const [ready,setReady]=useState(false);
  useEffect(()=>{let portal=document.getElementById('studio-portals');const owns=!portal;if(!portal){portal=document.createElement('div');portal.id='studio-portals';document.body.append(portal);}setReady(true);return()=>{if(owns)portal?.remove();};},[]);
  if(!ready)return null;
  return <div id="app"><div className="authoring-shell" data-rail-collapsed="true"><div className="studio-body" style={{minHeight:400}}>
    <nav className="studio-rail" aria-label="Studio"><RailNavigation locale="zh-CN" navigate={setCurrent} items={[
      {key:'projects',label:'作品',icon:'folder',current:current==='projects'},
      {key:'editor',label:'创作',icon:'edit',current:current==='editor'},
      {key:'extension:afterword',label:'后日谈与创作笔记扩展',icon:'package',extension:true,current:current==='extension:afterword'},
    ]}/></nav><p style={{padding:24}}>悬停或聚焦导航可查看入口名称。当前入口：{current}</p>
  </div></div></div>;
}
const meta = {title:'Product/Studio/Workbench/Navigation tooltips',component:NavigationPreview,parameters:{layout:'fullscreen'}} satisfies Meta<typeof NavigationPreview>;
export default meta;
export const CollapsedWithExtension: StoryObj<typeof meta> = {};
