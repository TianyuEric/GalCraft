import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate } from '@galcraft/templates';
import { ComponentInstances, playerVariableValues } from '@galcraft/player-ui';
import type { LongTerm } from '@galcraft/contracts';
import '@galcraft/player-ui/player.css';

function Variables({night=false,surface='relations',missing=false}:{night?:boolean;surface?:'relations'|'story';missing?:boolean}) {
  const [value,setValue]=useState(20),[frame,setFrame]=useState(true);
  const snapshot=structuredClone(FixtureSnapshot),state=structuredClone(FixtureRuntimeState);
  snapshot.variables=[{id:'RelatA',name:'澜汐',type:'number',scope:'progress',initial:0},{id:'MetAAA',name:'已经赴约',type:'boolean',scope:'longTerm',initial:false}];
  snapshot.scenes[0]!.scene.locals=[{id:'NameAA',name:'留在明天的称呼 · 很长的自定义字符串变量',type:'string',scope:'local',initial:'同行的人'}];
  state.progress={RelatA:value};state.frames=frame?[{id:'FrameA',sceneId:snapshot.scenes[0]!.scene.id,locals:{NameAA:'一起去看春灯吧'},returnTo:null,receiver:null}]:[];
  const profile:LongTerm={schemaVersion:2,revision:0,readStatements:[],endings:[],cg:{},music:[],video:[],flowEntries:{},variables:{},plugins:{}};
  const template=createOfficialTemplate({kind:'rich',appearance:night?'night':'paper',relationVariables:[...snapshot.variables,...snapshot.scenes[0]!.scene.locals]});
  const page=template.pages.find(page=>page.key===surface)!,values=playerVariableValues(snapshot,missing?undefined:state,profile);
  if(surface==='story')page.root.children=page.root.children.filter(component=>component.name==='Relationships');
  return <div className="galcraft-player" style={{height:'100vh',minHeight:600,background:template.defaultVisual.background.color,color:template.defaultVisual.color,fontSize:26,lineHeight:1.5}}>
    <div style={{position:'absolute',inset:0}}><ComponentInstances root={page.root} context={{data:{},local:{},variables:values}} label={key=>template.locales['zh-CN']?.[key]??key} action={()=>{}}/></div>
    <nav aria-label="变量同步检查" style={{position:'absolute',bottom:16,right:16,display:'flex',gap:8}}><button onClick={()=>setValue(25)}>更新为 25</button><button onClick={()=>setValue(20)}>恢复存档值 20</button><button onClick={()=>setFrame(false)}>结束场景调用</button></nav>
  </div>;
}
const meta={title:'Product/Player/Core variables',component:Variables,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Variables>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Relations:Story={play:async({canvas})=>{
  await expect(canvas.getByText('20',{exact:true})).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'更新为 25'}));await expect(canvas.getByText('25',{exact:true})).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'恢复存档值 20'}));await expect(canvas.getByText('20',{exact:true})).toBeVisible();
  await expect(canvas.getByText('false',{exact:true})).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'结束场景调用'}));await expect(canvas.getByText('—',{exact:true})).toBeVisible();
}};
export const RelationsNight:Story={...Relations,args:{night:true}};
export const BeforeStory:Story={args:{missing:true}};
export const Hud:Story={args:{surface:'story'}};
export const HudNight:Story={args:{surface:'story',night:true}};
