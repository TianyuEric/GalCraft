import { useCallback, useState } from 'react';
import type { Meta,StoryObj } from '@storybook/react-vite';
import { expect,userEvent } from 'storybook/test';
import { createOfficialTemplate } from '@galcraft/templates';
import { TemplateChooser } from './template-chooser.js';
import './shell.css';

const current=createOfficialTemplate({kind:'standard'});
function Example({locale='zh-CN',theme='light',failure=false,previewDelayMs=0,previewFailure=false,previewEnabled=false}:{locale?:string;theme?:string;failure?:boolean;previewDelayMs?:number;previewFailure?:boolean;previewEnabled?:boolean}){
  const [applied,setApplied]=useState<string[]|null>(null);
  const preview = useCallback(async (host:HTMLElement) => { await new Promise(resolve => setTimeout(resolve,previewDelayMs)); if(previewFailure) throw new Error('Preview unavailable'); host.textContent='Preview ready'; return () => host.replaceChildren(); },[previewDelayMs,previewFailure]);
  return <div id="app" className="authoring-shell" data-theme={theme} style={{padding:16,height:'100dvh',boxSizing:'border-box'}}><div id="studio-portals" lang={locale}/><TemplateChooser preview={previewEnabled || previewDelayMs || previewFailure ? preview : undefined} current={current} locale={locale} apply={async(_source,keep)=>{if(failure)throw Error(locale==='en'?'Template could not be applied':'模板应用失败，请重试');setApplied(keep);}}/><output aria-label="Applied retention paths">{applied?.join('\n')}</output></div>;
}
const meta={title:'Product/Studio/Authoring/Template chooser',component:Example,parameters:{layout:'fullscreen'},args:{locale:'zh-CN',theme:'light',failure:false}} satisfies Meta<typeof Example>;
export default meta;
type Story=StoryObj<typeof meta>;
export const RetainSettings:Story={play:async({canvas})=>{
  await expect(canvas.queryByRole('checkbox')).toBeNull();
  await userEvent.click(canvas.getByRole('button',{name:'保留现有页面设置'}));
  await userEvent.click(canvas.getByRole('checkbox',{name:'标志 · 布局'}));
  await userEvent.click(canvas.getByRole('button',{name:'应用此模板'}));
  await expect(canvas.getByLabelText('Applied retention paths')).toHaveTextContent('title/title.logo/layout');
}};
export const English:Story={args:{locale:'en'}};
export const JapaneseDusk:Story={args:{locale:'ja',theme:'dark'}};
export const ApplyFailure:Story={args:{locale:'en',failure:true},play:async({canvas})=>{await userEvent.click(canvas.getByRole('button',{name:'Apply template'}));await expect(canvas.getByRole('alert')).toHaveTextContent('Template could not be applied');}};

export const DelayedPreview:Story={args:{previewDelayMs:2000}};
export const PreviewFailure:Story={args:{previewFailure:true}};

export const PreviewImmediate:Story={args:{previewEnabled:true,previewDelayMs:0}};
export const Preview300ms:Story={args:{previewDelayMs:300}};
