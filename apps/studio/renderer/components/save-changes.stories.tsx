import type { Meta,StoryObj } from '@storybook/react-vite';
import type { DocumentView,SavePlan } from '@galcraft/contracts';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { SaveChangeList } from './change-list.js';
import { Button } from './controls.js';
import { requestDialog } from './request-dialog.js';
import './controls.css';
import '../authoring/workspace.css';
import '../authoring/shell.css';
import '../authoring/refinements.css';

const documentId=FixtureIds.streetDocument,statement=FixtureIds.statements[0]!;
const metaPath=`scenes/${FixtureIds.street}/scene.json`,scriptPath=`scenes/${FixtureIds.street}/script.gal`;
const before=`say {speaker:{kind:"narrator"},text:"我在车站等你。"} @${statement};\n`;
const after=`say {speaker:{kind:"narrator"},text:"我在夜色中的车站等你。",append:true} @${statement};\n`;
const document:DocumentView={documentId,revision:3,savedRevision:1,format:'dsl',dirty:true,savedFiles:{[metaPath]:JSON.stringify({revision:1,data:{name:'旧车站'}}),[scriptPath]:before},files:{[metaPath]:JSON.stringify({revision:3,data:{name:'雨夜的车站与久别重逢的旅人'}}),[scriptPath]:after}};
const files:SavePlan['files']=[metaPath,scriptPath].map(path=>({path,documentId,oldExists:true,newExists:true}));
function ChangePreview({invalid=false,theme='light'}:{invalid?:boolean;theme?:'light'|'dark'}) {return <div id="app" data-theme={theme}><div className="authoring-shell" style={{padding:24,maxWidth:720,height:'auto',display:'block'}}><SaveChangeList files={files} documents={[invalid?{...document,files:{...document.files,[scriptPath]:'say {text:"待修正原文'}}:document]} names={{[documentId]:'雨夜的车站与久别重逢的旅人'}} locale="zh-CN"/></div></div>;}
const meta={title:'Product/Studio/Workbench/Save changes',component:ChangePreview,parameters:{layout:'fullscreen'}} satisfies Meta<typeof ChangePreview>;
export default meta;
export const SceneNetChanges:StoryObj<typeof meta>={};
export const InvalidSource:StoryObj<typeof meta>={args:{invalid:true}};
export const DarkChanges:StoryObj<typeof meta>={args:{theme:'dark'}};
function LargeReview({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const groups = Array.from({ length: 48 }, (_, index) => ({ documentId: `${documentId}/${index}`, name: `第 ${index + 1} 组 · 长篇创作内容与关联素材`, paths: [`scenes/${index}/script.gal`], changes: [{ kind: 'update' as const, label: '对白与演出配置', fields: [{ field: 'text', before: '保存前的对白与演出说明。'.repeat(16), after: '作者调整后的长对白和完整演出说明。'.repeat(16) }] }] }));
  return <div className="authoring-shell" data-theme={theme} style={{ padding: 24 }}><div id="studio-portals" data-theme={theme} lang="zh-CN"/><Button onClick={() => void requestDialog({ title: '保存全部', locale: 'zh-CN', review: true, description: '审阅全部净差异后保存。', content: <SaveChangeList files={[]} groups={groups} locale="zh-CN"/>, confirmLabel: '保存 48 项修改', confirm: async () => {} })}>打开完整保存审阅</Button></div>;
}
export const FullReview: StoryObj<typeof meta> = { render: () => <LargeReview/> };
export const FullReviewDark: StoryObj<typeof meta> = { render: () => <LargeReview theme="dark"/> };
