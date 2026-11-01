import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, waitFor } from 'storybook/test';
import { FixtureAsset, FixtureCharacters, FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from '../authoring/controller.js';
import { CharacterManager } from '../authoring/characters/CharacterManager.js';
import '../authoring/workspace.css';
import '../styles/studio-theme.css';

function PortraitSettings({ dark = false, missing = false }: { dark?: boolean; missing?: boolean }) {
  const [source,setSource]=useState<AuthoringSource>({projectDocumentId:FixtureProject.projectId,projectRevision:1,projectSavedRevision:1,projectDirty:false,
    project:structuredClone(FixtureProject),scenes:[],characters:structuredClone(FixtureCharacters).map(character=>({...character,avatar:missing?'Miss01':null}))});
  return <div data-theme={dark?'dark':'light'}><div className="authoring-shell" style={{display:'block',padding:24,minHeight:'100vh'}}><CharacterManager embedded locale="zh-CN" source={source} close={()=>{}}
    assets={missing?[]:[{...FixtureAsset,name:'默认头像图片'}]} chooseAvatar={async()=>FixtureAsset.id}
    apply={async drafts=>{const next={...source,characters:source.characters.map(character=>({...character,...drafts.find(draft=>draft.id===character.id)}))};setSource(next);return {ok:true,value:next,warnings:[]};}}
    remove={async()=>({ok:true,value:source,warnings:[]})} history={async()=>({ok:true,value:source,warnings:[]})}/></div></div>;
}
const meta={title:'Product/Studio/Authoring/Reading portrait settings',component:PortraitSettings,parameters:{layout:'fullscreen'}} satisfies Meta<typeof PortraitSettings>;
export default meta;
type Story=StoryObj<typeof meta>;
export const ChooseDefault:Story={play:async({canvas})=>{
  fireEvent.click(canvas.getByRole('button',{name:'头像与声音'}));
  fireEvent.click(canvas.getByRole('button',{name:'选择头像图片'}));
  await waitFor(()=>expect(canvas.getByLabelText('角色默认阅读头像')).toHaveValue(FixtureAsset.id));
  fireEvent.click(canvas.getByRole('button',{name:/应用修改/}));
  await waitFor(()=>expect(canvas.getByRole('status')).toHaveTextContent('已应用到工作区'));
}};
export const MissingInDusk:Story={args:{dark:true,missing:true},play:async({canvas})=>{fireEvent.click(canvas.getByRole('button',{name:'头像与声音'}));await expect(canvas.getByLabelText('角色默认阅读头像')).toHaveValue('Miss01');}};
