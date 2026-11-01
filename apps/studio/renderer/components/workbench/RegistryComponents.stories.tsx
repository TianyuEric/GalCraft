import { mountColorField } from '../color-field.js';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../controls.js';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '../ui/command.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu.js';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '../ui/context-menu.js';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover-base.js';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from '../ui/alert-dialog.js';
import { Toolbar, ToolbarButton } from '../ui/toolbar.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs.js';
import './workbench.css';
import { prepareNativeDialog } from '../motion.js';
import { domButton } from '../dom-button.js';
import { showContentPopover } from './content-popover.js';
import { createCommandPicker } from '../../authoring/command-picker.js';
import { createCommandRegistry } from '@galcraft/dsl';
function RegistryComponents({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const [result, setResult] = useState(''), [alert, setAlert] = useState(false);
  return <div id="app" className="authoring-shell gc-workbench" data-theme={theme} style={{padding:24,minHeight:'100vh'}}>
    <div id="studio-portals" data-theme={theme}/>
    <Toolbar aria-label="工具栏"><ToolbarButton onClick={() => setResult('工具栏')}>定位</ToolbarButton></Toolbar>
    <Command label="组件命令" style={{maxWidth:480,marginBlock:16}}><CommandInput aria-label="组件命令" placeholder="搜索组件命令"/><CommandList><CommandEmpty>没有匹配项</CommandEmpty><CommandItem value="open" keywords={['场景']} onSelect={() => setResult('打开')}>打开场景</CommandItem><CommandItem disabled value="delete">删除所选 · 只读</CommandItem></CommandList></Command>
    <DropdownMenu><DropdownMenuTrigger render={<Button/>}>更多</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={() => setResult('菜单预览')}>预览</DropdownMenuItem><DropdownMenuItem disabled>只读操作</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <ContextMenu><ContextMenuTrigger style={{padding:24,border:'1px solid var(--border)',marginBlock:16}}>右键对象</ContextMenuTrigger><ContextMenuContent><ContextMenuItem onClick={() => setResult('右键预览')}>右键预览</ContextMenuItem></ContextMenuContent></ContextMenu>
    <Popover><PopoverTrigger render={<Button/>}>参数</PopoverTrigger><PopoverContent><label>参数名称<input aria-label="参数名称" defaultValue="保留输入"/></label></PopoverContent></Popover>
    <Button onClick={() => setAlert(true)}>删除确认</Button>
    <AlertDialog open={alert} onOpenChange={setAlert}><AlertDialogContent className="gc-wb-message" initialFocus={() => document.querySelector<HTMLButtonElement>('[data-testid=registry-cancel]')}><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>删除当前测试对象</AlertDialogDescription><Button data-testid="registry-cancel" onClick={() => setAlert(false)}>取消</Button><Button tone="danger" onClick={() => {setResult('已删除');setAlert(false);}}>删除对象</Button></AlertDialogContent></AlertDialog>
    <Tabs defaultValue="one"><TabsList aria-label="文档"><TabsTrigger value="one">场景一</TabsTrigger><TabsTrigger value="two">场景二</TabsTrigger></TabsList><TabsContent value="one" keepMounted>场景一内容</TabsContent><TabsContent value="two" keepMounted>场景二内容</TabsContent></Tabs>
    <output>{result}</output>
  </div>;
}
export default {title:'Components/Registry components',component:RegistryComponents,parameters:{layout:'fullscreen'}} satisfies Meta<typeof RegistryComponents>;
export const Light:StoryObj<typeof RegistryComponents>={};
export const Dusk:StoryObj<typeof RegistryComponents>={args:{theme:'dark'}};
export const OwnedSurfaces:StoryObj<typeof RegistryComponents>={render:()=>{
  const [result,setResult]=useState('');
  return <div id="app" className="authoring-shell" style={{padding:24}}><div id="studio-portals" lang="zh-CN"/>
    <Button onClick={()=>{const dialog=prepareNativeDialog(document.createElement('dialog'));dialog.className='designer-dialog';const title=document.createElement('h2');title.textContent='原生编辑内容';const input=document.createElement('input');input.ariaLabel='保留的字段';input.value='未提交输入';dialog.append(title,input,mountColorField([255,255,255],()=>{},'zh-CN'),domButton('完成',()=>dialog.close()));dialog.addEventListener('close',()=>{dialog.remove();setResult(input.value);},{once:true});document.body.append(dialog);dialog.showModal();}}>打开编辑内容</Button>
    <Button onClick={event=>{const picker=createCommandPicker(createCommandRegistry('0.1.0'),'zh-CN',key=>{setResult(key);popover.close();});const popover=showContentPopover(picker.root,event.currentTarget,'选择指令',()=>picker.dispose());}}>打开指令选择</Button><output>{result}</output>
  </div>;
}};
