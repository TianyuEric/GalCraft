import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createOfficialTemplate, components } from '@galcraft/templates';
import { UIAnimationManager } from '../authoring/UIAnimationManager.js';

function Manager({locale='zh-CN'}:{locale?:string}) {
  const [template,setTemplate]=useState(()=>createOfficialTemplate({kind:'standard'}));
  const component=components(template.pages.find(page=>page.key==='title')!.root).find(item=>item.part==='title.menu.start')!;
  return <div id="app" data-theme="light" className="authoring-shell" style={{height:'100vh'}}><UIAnimationManager template={template} locale={locale} target={{componentId:component.id,event:'pressed'}} apply={async next=>setTemplate(next)} close={()=>{}}/></div>;
}
const meta={title:'Product/Player/Animation authoring',component:Manager,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Manager>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Catalog:Story={};
export const English:Story={args:{locale:'en'}};
export const Japanese:Story={args:{locale:'ja'}};
