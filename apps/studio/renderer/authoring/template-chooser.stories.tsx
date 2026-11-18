import { useCallback, useState } from 'react';
import type { Meta,StoryObj } from '@storybook/react-vite';
import { expect,userEvent,within } from 'storybook/test';
import type { TemplateLibraryInput } from '@galcraft/contracts';
import { createOfficialTemplate } from '@galcraft/templates';
import { TemplateChooser } from './template-chooser.js';
import { StudioToaster } from '../components/toast.js';
import './shell.css';

const current=createOfficialTemplate({kind:'standard'});
function Example({locale='zh-CN',theme='light',failure=false,previewDelayMs=0,previewFailure=false,previewEnabled=false,library=false,cancelImport=false,restorePage=false}:{locale?:string;theme?:string;failure?:boolean;previewDelayMs?:number;previewFailure?:boolean;previewEnabled?:boolean;library?:boolean;cancelImport?:boolean;restorePage?:boolean}){
  const [applied,setApplied]=useState<string[]|null>(null);
  const preview = useCallback(async (host:HTMLElement) => { await new Promise(resolve => setTimeout(resolve,previewDelayMs)); if(previewFailure) throw new Error('Preview unavailable'); host.textContent='Preview ready'; return () => host.replaceChildren(); },[previewDelayMs,previewFailure]);
  const manage = useCallback(async (input:TemplateLibraryInput) => {
    const entry={id:current.id,version:current.version,name:'标准作品',official:true};
    if(input.action==='list')return {items:[entry]};
    if(input.action==='detail')return {externalReferences:[]};
    if(input.action==='import'&&cancelImport)return input.choice==='cancel'?{status:'cancelled'}:{status:'conflict',entry,choices:['cancel','copy']};
    return {status:'imported'};
  },[cancelImport]);
  return <div id="app" className="authoring-shell" data-theme={theme} style={{padding:16,height:'100dvh',boxSizing:'border-box'}}><div id="studio-portals" lang={locale} data-theme={theme}/><StudioToaster locale={locale}/><TemplateChooser manage={library?manage:undefined} hiddenPages={restorePage?[{id:'hidden-title',key:'title'}]:undefined} restore={restorePage?async()=>{}:undefined} preview={previewEnabled || previewDelayMs || previewFailure ? preview : undefined} current={current} locale={locale} apply={async(_source,keep)=>{if(failure)throw Error(locale==='en'?'Template could not be applied':'模板应用失败，请重试');setApplied(keep);}}/><output aria-label="Applied retention paths">{applied?.join('\n')}</output></div>;
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
export const LibraryMessage:Story={args:{library:true},play:async({canvas,canvasElement})=>{
  await userEvent.click(canvas.getByText('管理本机模板库与交换包'));
  await userEvent.type(canvas.getByRole('textbox',{name:'包文件绝对路径'}),'D:/Templates/reading.galtemplate');
  await userEvent.click(canvas.getByRole('button',{name:'导入整套模板包'}));
  await expect(await within(canvasElement.ownerDocument.body).findByText('模板库操作已完成。')).toBeVisible();
}};
export const CancelledImport:Story={args:{library:true,cancelImport:true},play:async({canvas,canvasElement})=>{
  const messages=()=>Array.from(canvasElement.ownerDocument.querySelectorAll('[data-message-id]'),node=>node.getAttribute('data-message-id'));
  const previous=messages();
  await userEvent.click(canvas.getByText('管理本机模板库与交换包'));
  await userEvent.type(canvas.getByRole('textbox',{name:'包文件绝对路径'}),'D:/Templates/reading.galtemplate');
  await userEvent.click(canvas.getByRole('button',{name:'导入整套模板包'}));
  await userEvent.click(await canvas.findByRole('button',{name:'取消'}));
  await expect(canvas.queryByText(/已存在相同身份和版本/)).toBeNull();
  await expect(messages().filter(id=>!previous.includes(id))).toHaveLength(0);
}};
export const RestoredPageMessage:Story={args:{restorePage:true,theme:'dark'},play:async({canvas,canvasElement})=>{
  await userEvent.click(canvas.getByRole('button',{name:/恢复$/}));
  await expect(await within(canvasElement.ownerDocument.body).findByText('页面已恢复。')).toBeVisible();
}};
