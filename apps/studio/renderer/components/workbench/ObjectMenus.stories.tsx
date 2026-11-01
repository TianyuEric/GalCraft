import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ObjectTree } from './ObjectTree.js';
import './workbench.css';
import '../../authoring/shell.css';
function Menus() {
  const [selected,setSelected]=useState(['A','B']),[primary,setPrimary]=useState('A'),[action,setAction]=useState('');
  return <div id="app" className="authoring-shell" data-theme="light"><div id="studio-portals" data-theme="light"/>
    <ObjectTree nodes={[{id:'A',name:'A 场景'},{id:'C',name:'C 场景'}]} selected={selected} onSelect={setSelected} onPrimary={setPrimary} onOpen={()=>setAction('打开')} onRename={()=>{}}
      menuGroups={(node,scope,hidden)=>[{label:`当前对象：${node.name}`,actions:[{label:'预览',run:()=>setAction(`预览 ${node.id}`)}]},{label:`所选 ${scope.length} 项 · 隐藏 ${hidden} 项`,actions:[{label:`删除所选 ${scope.length} 项`,run:()=>setAction(scope.join(',')), disabled:scope.includes('B')?'B 为只读对象':undefined}]}]}/>
    <p data-testid="selection">{selected.join(',')}</p><p data-testid="primary">{primary}</p><p data-testid="action">{action}</p>
  </div>;
}
export default {title:'Product/Studio/Workbench/Object menus',component:Menus,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Menus>;
export const Selection:StoryObj<typeof Menus>={};
