import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fixtureId } from '@galcraft/contracts/fixtures';
import type { PluginManifest } from '@galcraft/plugins';
import { ProductionCreateMenu } from '../pages/Production/ProductionCreateMenu.js';
import { TaskExecutionStatus } from '../pages/Production/TaskExecutionStatus.js';
import { PluginOverview } from '../pages/Plugins/PluginOverview.js';
import { VerificationAssetList } from '../pages/Publish/VerificationAssetList.js';
import { productionRecords } from './production-fixture.js';
import { productAssets, productSnapshot } from './product-fixture.js';
import { TooltipProvider } from '../components/ui/tooltip.js';
import { quickLabels } from '../pages/Production/QuickTask.js';
import '../authoring/shell.css';

function Example({ theme='light', locale='zh-CN', empty=false }: { theme?:'light'|'dark'; locale?:string; empty?:boolean }) {
  const [chosen, setChosen] = useState(''), [steps, setSteps] = useState(false);
  const task = productionRecords(productSnapshot()).tasks[0]!;
  task.items.push({...structuredClone(task.items[0]!), id:fixtureId(0x555), state:'failed'});
  const assets=Array.from({length:empty?0:87},(_,index)=>({...structuredClone(productAssets()[0]!),id:fixtureId(0x1000+index),name:`雨站 · ${index+1} · ${index===86?'末项长名称素材（保留精确身份供检查）':'背景'}`}));
  const manifest: PluginManifest={schemaVersion:1,id:'org.galcraft.storybook',version:'0.1.0',name:'角色关系与剧情资料扩展',description:'为当前作品提供角色关系和剧情资料管理。',author:'GalCraft',license:'MIT',homepage:null,engineRange:'^0.1.0',sdkMajor:0,targets:['web','windows'],dependencies:[],entry:{runtime:null,editor:null},files:[],contributions:[{kind:'command',key:'org.galcraft.storybook/relationship',targets:['web','windows'],required:false}],stateVersions:{document:1,progress:1,longTerm:1},native:[]};
  return <TooltipProvider><div id="studio-portals" data-theme={theme} lang={locale}/><main id="app" className="authoring-shell" data-theme={theme} lang={locale} style={{height:'100vh',overflow:'auto',padding:16,background:'var(--background)',color:'var(--foreground)'}}>
    <div style={{maxWidth:760}}><h1 style={{fontSize:18,margin:'0 0 16px'}}>制作、插件与发布</h1>
      <ProductionCreateMenu locale={locale} entries={[
        ...Object.entries(quickLabels).map(([id,label])=>({id,label:label[locale==='en'?1:locale==='ja'?2:0],group:locale==='en'?'Production types':locale==='ja'?'制作の種類':'制作类型',run:()=>setChosen(id)})),
        ...Array.from({length:24},(_,index)=>({id:`plugin-${index}`,label:`扩展编曲 ${index+1}`,group:'插件贡献',detail:index===23?'缺少所需提供方':'来自实际操作目录的夹具投影',disabled:index===23?'缺少所需提供方':undefined,run:()=>setChosen(`plugin-${index}`)}))
      ]}/><output aria-label="已选择制作">{chosen}</output>
      <TaskExecutionStatus task={task} locale={locale} statusLabel={state=>state==='running'?'生成中':state==='failed'?'失败':state} showSteps={()=>setSteps(true)}/>{steps&&<p role="status">已定位执行步骤</p>}
      <PluginOverview manifest={manifest} locale={locale}/>
      <VerificationAssetList assets={assets} target="Web" locale={locale}/>
    </div>
  </main></TooltipProvider>;
}
const meta={title:'Product/Studio/Production/Supporting components',component:Example,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Example>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Components:Story={};
export const Dark:Story={args:{theme:'dark'}};
export const English:Story={args:{locale:'en'}};
export const Japanese:Story={args:{locale:'ja'}};
export const Empty:Story={args:{empty:true}};
