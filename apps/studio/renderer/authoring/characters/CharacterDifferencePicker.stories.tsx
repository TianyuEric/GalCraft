import {fixtureId} from '@galcraft/contracts/fixtures';
import {useState} from 'react';
import type {Meta,StoryObj} from '@storybook/react-vite';
import {CharacterDifferencePicker} from './CharacterDifferencePicker.js';
import {productAssets,productMedia} from '../../stories/product-fixture.js';
import '../shell.css';
import '../workspace.css';

function Picker({theme='light',missing=false,empty=false,six=false}:{theme?:'light'|'dark';missing?:boolean;empty?:boolean;six?:boolean}){
  const assets=productAssets(),images=assets.filter(asset=>asset.kind==='image'),[value,setValue]=useState(missing?'Gone01':'Diff01');
  if(six){images.splice(0,images.length,...['neutral','smile','serious','surprised','shy','sad'].map((expression,index)=>({...structuredClone(assets[1]!),id:fixtureId(0xb20+index),name:`chatgpt-${expression}.png`})));assets.push(...images);}
  const differences=empty?[]:(six?images:images.slice(0,2)).map((asset,index)=>({id:`Diff0${index+1}`,name:six?images[index]!.name.replace('chatgpt-','').replace('.png',''):index?'微笑 · 雨后':'平静 · 正面',figure:{assetId:asset.id,variantId:asset.activeVariantId},avatar:null}));
  const thumbnails=()=>{for(const image of document.querySelectorAll<HTMLImageElement>('.character-difference-picker img[data-asset-id]'))image.src=six?`/practice/figures/${images.find(asset=>asset.id===image.dataset.assetId)!.name}`:productMedia[image.dataset.assetId!]!;};
  return <div data-theme={theme} data-picked-difference={value}><main className="authoring-shell" style={{display:'block',height:'auto',minHeight:'100vh',padding:24,background:'var(--workbench-editor)',overflow:'visible'}}><CharacterDifferencePicker differences={differences} assets={assets} value={value} locale="zh-CN" choose={setValue} refreshThumbnails={thumbnails}/></main></div>;
}
const meta={title:'Product/Studio/Authoring/Character Difference Picker',component:Picker,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Picker>;
export default meta;type Story=StoryObj<typeof meta>;
export const Light:Story={};export const Dark:Story={args:{theme:'dark'}};export const Missing:Story={args:{missing:true}};export const Empty:Story={args:{empty:true}};

export const SixDifferences:Story={args:{six:true}};
