import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DocumentView } from '@galcraft/contracts';
import { prepareAuthoringEdit, rebaseAuthoringOperation, type AuthorOperation } from '@galcraft/documents/authoring';
import { ProjectSettingsEditor, type ProjectSettingsGuiDraft } from './ProjectSettingsEditor.js';
import { StoryStructureEditor, type StoryStructureGuiDraft } from './StoryStructureEditor.js';
import { Button } from '../components/controls.js';
import { studioFixture } from '../stories/studio-fixture.js';
import './shell.css';
const longDescription=(kind:string)=>Array.from({length:18},(_,i)=>`${kind} · 第${i+1}段：雨夜的信件记载了不同的约定。作者可以完整阅读这段作品简介，再决定采用哪一份内容。`).join('\n');
function Editor({locale='zh-CN',theme='light',settings=false,conflictDemo=false,parameterDefaults=false}:{locale?:'zh-CN'|'en'|'ja';theme?:'light'|'dark';settings?:boolean;conflictDemo?:boolean;parameterDefaults?:boolean}) {
  const fixture=useRef(studioFixture('normal',locale,theme)),[documents,setDocuments]=useState<DocumentView[]|null>(null);
  const settingsDraft=useRef<ProjectSettingsGuiDraft|undefined>(undefined),structureDraft=useRef<StoryStructureGuiDraft|undefined>(undefined),[generation,setGeneration]=useState(0),[workspace,setWorkspace]=useState('');
  const read=()=>fixture.current.services.bridge.documents.list();
  const apply=async(operation:AuthorOperation,baseline:DocumentView[],resolution?:'draft'|'current')=>{const current=await read();if(!current.ok)return current;const rebased=rebaseAuthoringOperation(baseline,current.value,operation,resolution);if(rebased.conflicts.length&&!resolution){const error={code:'AUTHOR_CONFLICT',message:'同一字段已在工作区修改。输入已保留，请比较后选择。',severity:'error' as const,owner:'M02' as const,related:[],actions:[]};return {ok:false as const,error,issues:[error]};}const edit=prepareAuthoringEdit(current.value,rebased.operation);if(!edit.ok)return edit;const plan=await fixture.current.services.bridge.documents.planEdit(edit.value);const result=plan.ok?await fixture.current.services.bridge.documents.applyEdit(plan.value.planId,edit.value.expected):plan;if(result.ok){const listed=await read();if(listed.ok)setWorkspace(JSON.stringify(listed.value.flatMap(document=>Object.values(document.files).filter(raw=>raw.startsWith('{')).map(raw=>{try{return JSON.parse(raw).data;}catch{return null;}}))));}return result;};
  useEffect(()=>{void (async()=>{let result=await read();if(result.ok&&conflictDemo&&settings){await apply({op:'project.update',changes:{description:longDescription('原依据')}},result.value);result=await read();}if(result.ok&&parameterDefaults){const scene=result.value.flatMap(document=>Object.entries(document.files)).find(([path])=>/^scenes\/.+\/scene.json$/.test(path));await apply({op:'scene.declarations',id:JSON.parse(scene![1]).data.id,returns:'void',locals:[{id:'PzeroA',name:'Zero default',type:'number',initial:1,parameter:{required:true,defaultValue:0}},{id:'PboolA',name:'False default',type:'boolean',initial:true,parameter:{required:false,defaultValue:false}},{id:'PtextA',name:'Empty default',type:'string',initial:'initial',parameter:{required:true,defaultValue:''}},{id:'PnodaA',name:'Required without default',type:'number',initial:1,parameter:{required:false,defaultValue:null}}]},result.value);result=await read();}if(result.ok)setDocuments(result.value);})();},[]);
  const simultaneousChange=async()=>{const current=await read();if(!current.ok)return;const scene=current.value.flatMap(document=>Object.entries(document.files)).find(([path])=>/^scenes\/.+\/scene.json$/.test(path));await apply(settings?{op:'project.update',changes:{description:longDescription('工作区当前值')}}:{op:'scene.update',id:JSON.parse(scene![1]).data.id,changes:{name:'工作区改名后的街角'}},current.value);};
  return <div data-theme={theme}><section className="authoring-shell" style={{display:'block',height:'auto',minHeight:'100vh',padding:16}}>{conflictDemo&&<div className="gc-actions"><Button onClick={()=>void simultaneousChange()}>模拟工作区同时修改</Button><Button onClick={()=>setGeneration(value=>value+1)}>重新打开保留草稿</Button></div>}{documents&&(settings?<ProjectSettingsEditor key={generation} documents={documents} locale={locale} read={read} apply={apply} guiDraft={settingsDraft.current} onGuiDraftChange={draft=>{settingsDraft.current=draft;}}/>:<StoryStructureEditor key={generation} documents={documents} locale={locale} read={read} apply={apply} guiDraft={structureDraft.current} onGuiDraftChange={draft=>{structureDraft.current=draft;}}/>)}{conflictDemo&&<details><summary>当前工作区夹具数据</summary><output data-testid="workspace-values">{workspace}</output></details>}</section></div>;
}
const meta={title:'Product/Studio/Authoring/Structure and variables',component:Editor,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Editor>;
export default meta;type Story=StoryObj<typeof meta>;export const Chinese:Story={};export const EnglishDark:Story={args:{locale:'en',theme:'dark'}};

export const ProjectSettings:Story={args:{settings:true}};
export const ProjectSettingsEnglishDark:Story={args:{settings:true,locale:'en',theme:'dark'}};
export const ProjectSettingsConflict:Story={args:{settings:true,conflictDemo:true}};
export const ProjectSettingsConflictDark:Story={args:{settings:true,conflictDemo:true,theme:'dark'}};
export const StructureConflict:Story={args:{conflictDemo:true}};
export const StructureConflictDark:Story={args:{conflictDemo:true,theme:'dark'}};
export const ParameterDefaults:Story={args:{parameterDefaults:true}};
export const ParameterDefaultsEnglishDark:Story={args:{parameterDefaults:true,locale:'en',theme:'dark'}};
