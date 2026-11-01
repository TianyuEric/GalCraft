import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SteamAppIdEditor } from './SteamAppIdEditor.js';
const meta={title:'Product/Studio/Publish/Steam AppID',component:SteamAppIdEditor,decorators:[Story=><div className="authoring-shell" style={{padding:16,maxWidth:560}}><Story/></div>],args:{value:'480',savedValue:null,locale:'zh-CN',change:()=>{},apply:async()=>{}},render:args=>{const[value,change]=useState(args.value);const[savedValue,save]=useState<string|null>(args.savedValue);return <SteamAppIdEditor {...args} value={value} savedValue={savedValue} change={change} apply={async value=>save(value)}/>;}} satisfies Meta<typeof SteamAppIdEditor>;
export default meta;type Story=StoryObj<typeof meta>;
export const Unapplied:Story={};
export const Saved:Story={args:{savedValue:'480'}};
export const English:Story={args:{locale:'en'}};
