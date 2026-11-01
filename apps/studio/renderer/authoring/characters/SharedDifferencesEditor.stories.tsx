import React,{useState} from 'react';
import type {Meta,StoryObj} from '@storybook/react-vite';
import type {AfterstoryEntry,CharacterDifference} from '@galcraft/contracts';
import {FixtureIds} from '@galcraft/contracts/fixtures';
import {SharedDifferencesEditor} from './SharedDifferencesEditor.js';
import {AfterstoryEditor} from './AfterstoryEditor.js';
import {productAssets,productMedia} from '../../stories/product-fixture.js';
import '../shell.css';
import '../workspace.css';
function Editor({theme='light',empty=false}:{theme?:'light'|'dark';empty?:boolean}){
 const assets=productAssets(),image=assets.find(asset=>asset.characterId)!;
 const [value,setValue]=useState<CharacterDifference[]>(empty?[]:[{id:'Diff01',name:'林舟 · 平静',figure:{assetId:image.id,variantId:image.activeVariantId},avatar:{kind:'crop',crop:{x:.25,y:0,width:.5,height:.35}}}]);
 const [initial,setInitial]=useState<string|null>('Diff01'),[entry,setEntry]=useState<AfterstoryEntry|null>(null),[commits,setCommits]=useState(0);
 const resources={resolveRuntime:async(assetId:string)=>({ok:true as const,value:{leaseId:'Story1',uri:productMedia[assetId]!,mime:'image/png',bytes:1},warnings:[]}),releaseRuntime:async()=>({ok:true as const,value:undefined,warnings:[]})};
 return <div data-theme={theme} data-crop-commits={commits}><div className="authoring-shell" style={{display:'block',height:'auto',minHeight:'100vh',padding:24,background:'var(--workbench-editor)',overflow:'visible'}}><div style={{maxWidth:780,margin:'auto'}}><SharedDifferencesEditor value={value} initialId={initial} change={(value,id)=>{setValue(value);setInitial(id);setCommits(count=>count+1);}} assets={empty?[]:assets} locale="zh-CN" resources={resources}/><hr/><AfterstoryEditor value={entry} change={setEntry} assets={assets} scenes={[{sceneId:FixtureIds.street,name:'雨后 · 后日谈起点',text:''}]} endingIds={['route-a']} locale="zh-CN"/></div></div></div>;
}
const meta={title:'Product/Studio/Authoring/Shared Differences and Afterstory',component:Editor,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Editor>;
export default meta;type Story=StoryObj<typeof meta>;export const Edit:Story={};export const Dark:Story={args:{theme:'dark'}};export const Empty:Story={args:{empty:true}};
