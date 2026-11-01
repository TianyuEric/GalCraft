import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssetTypeIconNames } from '@galcraft/contracts';
import { actionIcon } from '../components/action-icon.js';
import { AnimationTargetPicker } from './AnimationTargetPicker.js';
import '../components/controls.css';
import './animation-timeline.css';
const meta = { title:'Product/Studio/Assets/Type catalog', parameters:{layout:'fullscreen'} } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function Catalog({dark=false}:{dark?:boolean}) { const [selected,setSelected]=useState('Fig001'),[located,setLocated]=useState(''); return <div className="authoring-shell" data-theme={dark?'dark':'light'} style={{padding:24,minHeight:700,color:'var(--foreground)',background:'var(--background)'}}>
  <h2>素材类型目录与动画目标</h2><div style={{display:'flex',gap:20,flexWrap:'wrap'}}>{[...AssetTypeIconNames,'unknown-future-icon'].map(name=><div key={name}><span ref={node=>{node?.replaceChildren(actionIcon(name));}}/><span>{name}</span></div>)}</div>
  <div style={{width:'min(580px,100%)'}}><AnimationTargetPicker locale="zh-CN" value={selected} choose={setSelected} locate={option=>setLocated(option.source?.statementId??'')} options={[
    {id:'Fig001',name:'岚汐 · 雨天制服 · 左侧',detail:'第一章 / 车站 · 第 4 条指令 · 当前场景，路线待确认',source:{sceneId:'Scene1',documentId:'Doc001',statementId:'Stmt01',order:4}},
    {id:'Fig002',name:'岚汐 · 微笑差分 · 右侧',detail:'第一章 / 车站 · 第 9 条指令 · 当前场景，路线待确认',source:{sceneId:'Scene1',documentId:'Doc001',statementId:'Stmt02',order:9}},
    {id:'Fig003',name:'岚汐 · 雨天制服 · 左侧',detail:'第二章 / 教室 · 第 3 条指令 · 跨场景来源',source:{sceneId:'Scene2',documentId:'Doc002',statementId:'Stmt03',order:3}},
  ]}/><p role="status">{selected} · {located}</p></div></div>; }
export const Light:Story={render:()=> <Catalog/>};
export const Dark:Story={render:()=> <Catalog dark/>};
