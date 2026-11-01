import React,{useState} from 'react';
import type {Meta,StoryObj} from '@storybook/react-vite';
import {expect,userEvent} from 'storybook/test';
import type {SceneEntryPresentation} from '@galcraft/contracts';
import {SceneEntryEditor} from './scene-entry-editor.js';
import {productAssets} from '../stories/product-fixture.js';
import './shell.css';
function Editor({theme='light',locale='zh-CN',empty=false}:{theme?:'light'|'dark';locale?:string;empty?:boolean}){const[value,setValue]=useState<SceneEntryPresentation>({title:null,interlude:null});return <div data-theme={theme}><div id="studio-portals" lang={locale} data-theme={theme}/><div className="authoring-shell" style={{display:'block',height:'auto',minHeight:'100vh',padding:24,background:'var(--workbench-editor)',overflow:'visible'}}><div style={{maxWidth:780,margin:'auto'}}><SceneEntryEditor value={value} change={setValue} assets={empty?[]:productAssets()} locale={locale}/><output data-testid="opening-draft">{JSON.stringify(value)}</output></div></div></div>;}
const meta={title:'Product/Studio/Authoring/Scene Entry',component:Editor,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Editor>;
export default meta;type Story=StoryObj<typeof meta>;export const Edit:Story={};export const Dark:Story={args:{theme:'dark'}};
export const ConfigureOpening:Story={play:async({canvas})=>{await userEvent.click(canvas.getByRole('checkbox',{name:'显示短标题卡'}));await userEvent.type(canvas.getByRole('textbox'),'春灯的约定');await expect(canvas.getByTestId('opening-draft')).toHaveTextContent('春灯的约定');await userEvent.click(canvas.getByRole('checkbox',{name:'播放全屏间幕'}));await expect(canvas.getByTestId('opening-draft')).toHaveTextContent('"allowSkip":true');}};
export const EmptyAssets:Story={args:{empty:true}};
export const English:Story={args:{locale:'en'}};
