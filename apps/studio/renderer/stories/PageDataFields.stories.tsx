import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent, within } from 'storybook/test';
import { createBasicComponent } from '@galcraft/templates/editor';
import type { Json, UIInteraction } from '@galcraft/contracts';
import { pageDataEditor, pageInteractionEditor, pageLocalStateEditor, type PageFieldContext } from '../authoring/page-data-fields.js';
import '../authoring/workspace.css';
import '../styles/studio-theme.css';

function Fields({ dark=false, kind='slider' }: {dark?:boolean;kind?:'slider'|'select'|'list'|'tabs'|'text'}) {
  const root=useRef<HTMLDivElement>(null),[saved,setSaved]=useState('');
  useEffect(()=>{
    const context:PageFieldContext={t:zh=>zh,local:{volume:50,showName:true,title:'角色介绍',tab:'first'},pages:[{value:'title',label:'标题页'},{value:'character-intro',label:'自建人物介绍'}]},component=createBasicComponent(kind);
    component.bindings={value:{source:'local',path:'volume'}};
    context.variables=[{id:'NumbrA',name:'澜汐好感度 · 很长的作者自定义变量名称',type:'number',scope:'progress',initial:0},{id:'FlagAA',name:'已经赴约',type:'boolean',scope:'longTerm',initial:false},{id:'NameAA',name:'主角称呼',type:'string',scope:'local',initial:'我',sceneName:'第一章'}];
    if(kind==='text')component.bindings={text:{source:'variable',scope:'progress',variableId:'NumbrA'}};
    const binding:UIInteraction={event:'click',actions:[{kind:'open',page:'title'}]};
    root.current!.replaceChildren(pageDataEditor(component,context,async value=>setSaved(JSON.stringify(value))),pageInteractionEditor([binding],context,async value=>setSaved(JSON.stringify(value))),pageLocalStateEditor(context.local,context.t,async(value:Record<string,Json>)=>setSaved(JSON.stringify(value))));
  },[kind]);
  return <div data-theme={dark?'dark':'light'} className="authoring-shell" style={{padding:16,minHeight:'100vh'}}><div style={{maxWidth:320}} ref={root}/><output aria-label="Applied configuration">{saved}</output></div>;
}
const meta={title:'Product/Studio/Player preview/Page data fields',component:Fields,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Fields>;
export default meta;
type Story=StoryObj<typeof meta>;
export const BindValueConditionAndActions:Story={play:async({canvas})=>{
  await userEvent.selectOptions(canvas.getByLabelText('控件值 · 来源'),'data');
  await userEvent.selectOptions(canvas.getByLabelText('控件值 · 属性'),'preferences.volumes.master');
  await userEvent.click(canvas.getByRole('button',{name:'应用数据配置'}));
  await expect(canvas.getByLabelText('Applied configuration')).toHaveTextContent('preferences.volumes.master');
  await userEvent.selectOptions(canvas.getByLabelText('触发事件'),'submit');
  await userEvent.selectOptions(canvas.getByLabelText('条件类型'),'equals');
  await userEvent.selectOptions(canvas.getByLabelText('条件左值 · 局部键'),'showName');
  await userEvent.selectOptions(canvas.getByLabelText('条件右值 · 固定值'),'true');
  await userEvent.selectOptions(canvas.getByLabelText('目标页面'),'character-intro');
  await userEvent.click(canvas.getByRole('button',{name:'添加动作'}));
  let second=within(canvas.getByRole('list').querySelectorAll('li')[1]!);
  await userEvent.selectOptions(second.getByLabelText('动作类型'),'setLocal');
  await userEvent.selectOptions(second.getByLabelText('目标局部键'),'title');
  fireEvent.change(second.getByLabelText('写入值 · 固定值'),{target:{value:'欢迎'}});
  await userEvent.click(second.getByRole('button',{name:'动作上移'}));
  await userEvent.click(canvas.getByRole('button',{name:'应用交互'}));
  await expect(canvas.getByLabelText('Applied configuration')).toHaveTextContent('"event":"submit"');
  await expect(canvas.getByLabelText('Applied configuration')).toHaveTextContent('"actions":[{"kind":"setLocal"');
  await expect(canvas.getByLabelText('Applied configuration')).toHaveTextContent('character-intro');
}};
export const Options:Story={args:{kind:'select'},play:async({canvas})=>{
  await userEvent.click(canvas.getByRole('button',{name:'添加选项'}));
  fireEvent.change(canvas.getByLabelText('选项值'),{target:{value:'chapter1'}});
  fireEvent.change(canvas.getByLabelText('显示名称'),{target:{value:'第一章'}});
  await userEvent.click(canvas.getByRole('button',{name:'应用数据配置'}));
  await expect(canvas.getByLabelText('Applied configuration')).toHaveTextContent('第一章');
}};
export const Repeat:Story={args:{kind:'list'},play:async({canvas})=>{
  await userEvent.selectOptions(canvas.getByLabelText('重复数据'),'on');
  await userEvent.selectOptions(canvas.getByLabelText('集合来源 · 属性'),'gallery');
  fireEvent.change(canvas.getByLabelText('项目身份属性'),{target:{value:'id'}});
  fireEvent.change(canvas.getByLabelText('空列表文字'),{target:{value:'暂无解锁条目'}});
  await userEvent.click(canvas.getByRole('button',{name:'应用数据配置'}));
  await expect(canvas.getByLabelText('Applied configuration')).toHaveTextContent('暂无解锁条目');
}};
export const Dark:Story={args:{dark:true}};
export const StoryVariables:Story={args:{kind:'text'},play:async({canvas})=>{
  await expect(canvas.getByLabelText('显示文字 · 变量')).toHaveValue('progress:NumbrA');
  await userEvent.selectOptions(canvas.getByLabelText('显示文字 · 变量'),'longTerm:FlagAA');
  await userEvent.click(canvas.getByRole('button',{name:'应用数据配置'}));
  await expect(canvas.getByLabelText('Applied configuration')).toHaveTextContent('"variableId":"FlagAA","scope":"longTerm"');
  await userEvent.selectOptions(canvas.getByLabelText('显示文字 · 变量'),'local:NameAA');
  await userEvent.click(canvas.getByRole('button',{name:'应用数据配置'}));
  await expect(canvas.getByLabelText('Applied configuration')).toHaveTextContent('"variableId":"NameAA","scope":"local"');
}};
export const StoryVariablesDark:Story={...StoryVariables,args:{kind:'text',dark:true}};
