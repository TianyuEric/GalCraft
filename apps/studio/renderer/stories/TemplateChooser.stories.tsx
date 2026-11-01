import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createOfficialTemplate, createTemplateDocuments, findComponent, prepareTemplateSwitch } from '@galcraft/templates';
import { TemplateChooser } from '../authoring/template-chooser.js';
function Templates({locale='zh-CN',theme='light'}:{locale?:string;theme?:string}) {
  const [applied,setApplied]=useState(false);
  const {current,documents,incoming}=useMemo(()=>{const base=createOfficialTemplate(),id=base.pages[0]!.root.children[0]!.id;findComponent(base,id)!.layout.width={unit:'px',value:200};
    const current=structuredClone(base),incoming=structuredClone(base);findComponent(current,id)!.layout.width={unit:'px',value:240};findComponent(incoming,id)!.layout.width={unit:'px',value:220};
    return{current,incoming,documents:createTemplateDocuments(base).map(document=>({...document,savedFiles:document.files,savedRevision:1,dirty:false}))};},[]);
  return <div id="app" data-theme={theme} className="authoring-shell gc-workbench" style={{height:'100vh',boxSizing:'border-box',padding:20,background:'var(--workbench-editor)'}}>{applied?<p role="status">Template applied</p>:<TemplateChooser current={current} locale={locale} apply={async()=>setApplied(true)} prepare={async request=>{const edited=structuredClone(documents),page=edited.find(document=>`ui/pages/${current.pages[0]!.id}.json`in document.files)!;const path=`ui/pages/${current.pages[0]!.id}.json`,envelope=JSON.parse(page.files[path]!);envelope.data=current.pages[0];page.files[path]=JSON.stringify(envelope);return prepareTemplateSwitch(edited,request.id===incoming.id?incoming:createOfficialTemplate({kind:request.id.includes('light')?'light':'rich'}),request.options);}} applyPlan={async()=>setApplied(true)}/>}</div>;
}
const meta={title:'Product/Player/Template switching',component:Templates,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Templates>;
export default meta;type Story=StoryObj<typeof meta>;
export const ThreeWay:Story={};
export const Dark:Story={args:{theme:'dark'}};
export const English:Story={args:{locale:'en'}};
