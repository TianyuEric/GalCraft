import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createBatchDialogueEditor } from '../authoring/batch-dialogue.js';
import '../authoring/workspace.css';
function Batch() {
  const host=useRef<HTMLDivElement>(null),[result,setResult]=useState('');
  useEffect(()=>{let calls=0;const editor=createBatchDialogueEditor({characters:[{id:'00000000-0000-4000-8000-000000000001',name:'林夏'}],apply:async(lines,characters)=>{if(++calls===1)throw new Error('保存服务暂不可用，输入已保留');setResult(`${lines.length} 条对白，${characters.length} 位新角色`);}});host.current!.append(editor.root);return()=>editor.root.remove();},[]);
  return <div className="authoring-shell" style={{display:'block',padding:16}}><div ref={host}/><output>{result}</output></div>;
}
const meta={title:'Product/Studio/Authoring/Batch dialogue',component:Batch,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Batch>;
export default meta;
export const MappingAndRetry:StoryObj<typeof meta>={};
