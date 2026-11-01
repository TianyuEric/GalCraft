import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { CollaborationBridge, CollaborationOverview, CollaborationSession, HarnessConfiguration } from '@galcraft/collaboration/contracts';
import { Collaboration } from './Collaboration.js';
import '../../components/controls.css';
import '../../authoring/workspace.css';
import '../../authoring/shell.css';
import '../../authoring/refinements.css';

const tools=[{key:'galcraft_context',title:'Read authoring context',description:'Read current working documents and versions',effects:['read'] as const},
  {key:'galcraft_edit_apply',title:'Apply reviewed edit',description:'Apply a reviewed M02 working-copy edit',effects:['edit'] as const},
  {key:'galcraft_production',title:'Produce and adopt candidates',description:'Prepare operations, submit, inspect candidates and adopt',effects:['generate','adopt'] as const}].map(value=>({...value,effects:[...value.effects],version:'0.1.0',inputSchema:{type:'object',properties:{documentIds:{type:'array',items:{type:'string'}},commandKeys:{type:'array',items:{type:'string'}}},required:[],additionalProperties:false},outputSchema:true,async:false,cancel:false}));
const longTools=Array.from({length:9},(_,i)=>({...tools[i%tools.length]!,key: `long-tool-${i}`,description: '读取目标作品当前工作版本，包含未保存内容、引用、角色和场景。传入完整修改事务，验证允许范围并保留作者审阅与正式保存边界。返回实际文档、操作与版本。'.repeat(2)}));
function fixture(scenario:string):CollaborationBridge {
  const availableTools=scenario==='long-tools'?longTools:tools;
  const session:CollaborationSession&{bindingValid:boolean}={id:'Sess01',projectId:'Proj01',writeSessionId:'Write1',projectName:'雨落之后的约定',goal:scenario==='long'?'补写雨夜车站重逢场景，并为两条人物路线制作可以试听和审阅的分支素材与演出':'补写雨夜车站重逢场景',harness:'dsh',scope:{mode:scenario==='automatic'?'currentProject':'restricted',documents:['Doc001'],createKinds:['scene','asset'],tools:availableTools.map(tool=>tool.key),operations:['image'],connectionIds:['Conn01'],models:['DeepSeek-V4.1-Flash'],workflowIds:[],maxGenerations:scenario==='automatic'?null:3},scopeRevision:1,paused:scenario==='paused',createdAt:'2026-10-21T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z',generations:1,sentRequests:['Send01'],bindingValid:scenario!=='expired'};
  if(scenario.startsWith('ended'))Object.assign(session,{ended:true,paused:true,bindingValid:false});
  const data:CollaborationOverview={enabled:scenario!=='empty',currentProjectId:scenario==='ended-other-project'?'Other1':'Proj01',defaultScope:session.scope,currentSessionId:(scenario==='empty'||scenario.startsWith('ended'))?null:'Sess01',endpoint:scenario==='empty'?null:'http://127.0.0.1:45000/mcp',sessions:scenario==='empty'?[]:[session],tools:availableTools,calls:scenario==='empty'?[]:[{sessionId:'Sess01',callId:'write-scene',tool:'galcraft_edit_apply',version:'0.1.0',input:{planId:'Plan01'},context:{sessionId:'Sess01',callId:'write-scene',scopeRevision:1,projectId:'Proj01',writeSessionId:'Write1'},state:scenario==='failed'?'uncertain':'completed',createdAt:'2026-10-21T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z',result:{operationId:'Edit01',documents:[{ref:{kind:'document',id:'Doc001'},revision:2}]},...(scenario==='failed'?{error:'采用回执暂未确认，请查询原调用，已有工作内容保持。'}:{})}]};
  if(scenario==='many')data.calls=Array.from({length:763},(_,index)=>({...structuredClone(data.calls[0]!),callId:`call-${index}`,createdAt:new Date(Date.UTC(2026,9,29)+index*1000).toISOString()}));
  Object.assign(data,{options:{documents:[{id:'Doc001',name:'作品与章节结构',kind:'作品文档'},{id:'Doc002',name:'雨夜车站',kind:'场景'},{id:'Doc003',name:'岚汐的角色与后日谈展示',kind:'角色'}],operations:[{id:'image',title:'背景图像'},{id:'org.galcraft.animation-generation/generateGca',title:'GCA局部动画'}],connections:[{id:'Conn01',name:'我的文字连接',model:'DeepSeek-V4.1-Flash'}],workflows:[]}});
  if(scenario==='service-failed')Object.assign(data,{endpoint:null,service:{state:'failed',error:{code:'EADDRINUSE',message:'The last candidate 127.0.0.1:9479 is already in use.'}}});
  if(scenario==='address-changed')Object.assign(data,{endpoint:'http://127.0.0.1:9461/mcp',service:{state:'running',addressChange:{previous:'http://127.0.0.1:9460/mcp',current:'http://127.0.0.1:9461/mcp'}}});
  const ok=<T,>(value:T)=>Promise.resolve({ok:true as const,value,warnings:[]});
  const written=new Set<string>();let writeFailed=false,stopFailed=false;
  return {overview:input=>{const history=input?.history;const calls=history?data.calls.filter(call=>call.sessionId===history.sessionId&&(!history.state||call.state===history.state)&&(!history.search||`${call.tool} ${call.callId}`.includes(history.search))).slice().reverse():[];const offset=history?Math.min(history.offset,Math.max(0,Math.ceil(calls.length/history.limit)-1)*history.limit):0;return ok({...structuredClone(data),calls:input?[]:structuredClone(data.calls),...(history?{callPage:{total:calls.length,offset,limit:history.limit,items:calls.slice(offset,offset+history.limit).map(({sessionId,callId,tool,state,createdAt,updatedAt,error})=>({sessionId,callId,tool,state,createdAt,updatedAt,error,summary:'作品工作版本已更新',documentIds:[]}))}}:{})});},readCall:input=>ok(structuredClone(data.calls.find(call=>call.sessionId===input.sessionId&&call.callId===input.callId)!)),start:()=>{data.endpoint='http://127.0.0.1:9460/mcp';data.service={state:'running'};return ok({endpoint:data.endpoint});},stop:async()=>{if(scenario==='service-stop-failed'&&!stopFailed){stopFailed=true;throw new Error('无法保存服务设置。请检查个人目录写入权限后重试。');}data.endpoint=null;data.service={state:'stopped'};return ok(undefined);},
    create:input=>{const next={...session,...input,id:'Sess02',scopeRevision:1,bindingValid:true,...(!session.ended?{reboundFrom:session.id}:{ended:false,paused:false,generations:0,sentRequests:[]})};data.sessions.push(next);data.currentSessionId=next.id;return ok(next);},
    update:input=>{const target=data.sessions.find(value=>value.id===input.id)!;Object.assign(target,input,{scopeRevision:target.scopeRevision+1});return ok(target);},
    end:input=>{const target=data.sessions.find(value=>value.id===input.id)!;Object.assign(target,{ended:true,paused:true,bindingValid:false,scopeRevision:target.scopeRevision+1});return ok(target);},
    deleteEnded:input=>{data.sessions=data.sessions.filter(value=>value.id!==input.id);data.calls=data.calls.filter(value=>value.sessionId!==input.id);return ok({sessionIds:[input.id]});},
    toolDefinition:input=>ok(availableTools.find(tool=>tool.key===input.key)!),
    chooseWorkspaceDirectory:()=>ok(scenario==='configuration-workspace-cancelled'?null:'D:/Stories'),
    configuration:input=>{
      const projectRoot=scenario.startsWith('configuration-workspace')?'D:/Stories/SpringLights':'D:/作品';
      const workspaceDirectory=input.harness==='codex'&&input.purpose==='mcp'?input.workspaceDirectory??projectRoot:undefined;
      const path=input.purpose==='skill'?projectRoot+'/'+(input.harness==='codex'?'.agents':input.harness==='claude'?'.claude':'.dsh')+'/skills/galcraft-create':input.harness==='codex'?workspaceDirectory+'/.codex/config.toml':projectRoot+(input.harness==='claude'?'/.mcp.json':'/.dsh/galcraft.patch.yml');
      const file=input.purpose==='skill'?path+'/SKILL.md':path;
      const content=input.purpose==='skill'?'---\nname: galcraft-create\ndescription: Create stories with GalCraft MCP tools.\n---\nRead galcraft_guide and actual current capabilities before creating.':input.harness==='codex'?'[mcp_servers.galcraft]\nurl = "http://127.0.0.1:45000/mcp"\n':input.harness==='claude'?'{"mcpServers":{"galcraft":{"type":"http","url":"http://127.0.0.1:45000/mcp"}}}':'[{"insert":[{"name":"@deepseek-ai/dsh-mcp-client","config":{"transport":"streamable-http","url":"http://127.0.0.1:45000/mcp"}}]}]';
      const installed=written.has(path)||scenario==='configuration-current',local=scenario==='configuration-local-edits'&&input.purpose==='skill',state=local?'localEdits':installed?'current':'notInstalled';
      return ok({project:{projectId:'Proj01',projectRoot,writeSessionId:'Write1'},workspaceDirectory,instructions:'Target projectId: Proj01\nBootstrap this project, then explicitly connect. Keep returned projectId/sessionId for every business call.',harness:input.harness,purpose:input.purpose,path,content,
        readback:{state,files:[{path:file,state,...(local?{update:{path:file+'.galcraft-update',pending:installed,existing:installed?content:null,localContent:content+'\n作者的项目写法与很长的本地说明继续保留。',content}}:{})}]},
        changes:installed?[]:[{path:local?file+'.galcraft-update':file,existing:null,content}],
        command:"Set-Location -LiteralPath '"+(workspaceDirectory??projectRoot)+"'\n"+(input.harness==='dsh'?'dsh --profile headless --patch "'+path+'"':input.harness==='codex'?'codex --sandbox workspace-write':input.harness),existing:installed?content:null} satisfies HarnessConfiguration);
    },
    writeConfiguration:async input=>{await new Promise(resolve=>setTimeout(resolve,400));if(scenario==='configuration-write-failed'&&!writeFailed){writeFailed=true;throw new Error('配置文件已变化，请重新审阅合并内容');}if(input.mode==='export')return scenario==='configuration-export-cancelled'?ok({status:'cancelled' as const,path:null}):ok({status:'written' as const,path:'D:/导出目录/助手连接配置.yml'});written.add(input.path);return ok({status:'written' as const,path:input.path});},open:()=>ok(undefined)};
}
function Workspace({scenario='active',theme='light',locale='zh-CN',document}:{scenario?:string;theme?:'light'|'dark';locale?:string;document?:string}) {
  const bridge=fixture(scenario);
  localStorage.removeItem('galcraft.collaboration.codexWorkspaces');
  if(document==='service'){localStorage.setItem('galcraft.collaboration.selected','service');localStorage.setItem('galcraft.collaboration.tabs','["service"]');}
  return <div id="app" className="authoring-shell collaboration-story" data-theme={theme} lang={locale}><div id="studio-portals" lang={locale} data-theme={theme}/><Collaboration bridge={bridge} locale={locale} initialDocument={document??(scenario==='empty'?'service':scenario.startsWith('configuration')?'configuration':'Sess01')}/></div>;
}
const meta={title:'Product/Studio/Collaboration/Collaboration',component:Workspace,parameters:{layout:'fullscreen'},tags:['autodocs']} satisfies Meta<typeof Workspace>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Active:Story={play:async({canvas})=>{await expect(await canvas.findByRole('heading',{name:'补写雨夜车站重逢场景'})).toBeVisible();await userEvent.click(canvas.getByRole('button',{name:'暂停协作'}));await expect(await canvas.findByRole('button',{name:'恢复协作'})).toBeVisible();}};
export const Dark:Story={args:{theme:'dark'}};
export const Narrow:Story={globals:{viewport:{value:'tablet',isRotated:false}},args:{scenario:'long'}};
export const Empty:Story={args:{scenario:'empty'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'开启服务'}));await expect(await canvas.findByText('服务运行中')).toBeVisible();}};
export const Paused:Story={args:{scenario:'paused'}};
export const Expired:Story={args:{scenario:'expired'}};
export const Failed:Story={args:{scenario:'failed'}};
export const Configuration:Story={args:{scenario:'configuration'},play:async({canvas})=>{
  await userEvent.click(await canvas.findByRole('combobox',{name:'安装内容'}));await userEvent.keyboard('{ArrowDown}{Enter}');
  await expect(await canvas.findByRole('button',{name:'安装项目 skill'})).toBeVisible();
}};
export const English:Story={args:{locale:'en'}};

export const LongToolDescriptions: Story = { args: {scenario:'long-tools'}, play: async ({canvas}) => {
  await userEvent.click(await canvas.findByText('查看与调整执行范围'));
  await userEvent.click(await canvas.findByText('可调用工具 · 9'));
  await expect(canvas.getAllByRole('checkbox',{name:/读取目标作品当前工作版本/})).toHaveLength(9);
} };
export const ToolsCatalog: Story = { args: {document:'tools'}, play: async ({canvas}) => {
  await userEvent.click(await canvas.findByText('读取创作上下文'));
  await userEvent.click(await canvas.findByText('精确英文契约'));
  await expect(canvas.getByRole('button',{name:/^复制$/})).toBeVisible();
} };
export const LongToolDescriptionsDark: Story = { ...LongToolDescriptions, args: {...LongToolDescriptions.args,theme:'dark'} };

export const EndSession:Story={play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'结束协作'}));await expect(await canvas.findByText('协作已结束；作品、原任务及历史调用保留。可从此处开始新一轮协作。')).toBeVisible();await expect(canvas.getByRole('button',{name:'开始新一轮协作'})).toBeEnabled();}};
export const EndedHistory:Story={args:{scenario:'ended'}};
export const StartNextRound:Story={args:{scenario:'ended'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'开始新一轮协作'}));await expect(await canvas.findByRole('heading',{name:'确定本次创作目标与范围'})).toBeVisible();await expect(canvas.getByRole('textbox',{name:'创作目标'})).toHaveValue('补写雨夜车站重逢场景');}};
export const EndedOtherProject:Story={args:{scenario:'ended-other-project'}};
export const EndedHistoryDark:Story={args:{scenario:'ended',theme:'dark'}};
export const EndedHistoryEnglish:Story={args:{scenario:'ended',locale:'en'}};
export const EndedHistoryJapanese:Story={args:{scenario:'ended',locale:'ja'}};
export const Reconnect:Story={args:{scenario:'expired'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'重新接入本轮'}));await expect(await canvas.findByRole('button',{name:/^暂停协作$/})).toBeVisible();}};
export const Japanese:Story={args:{locale:'ja',document:'tools'}};

export const Automatic:Story={args:{scenario:'automatic'},play:async({canvas})=>{await expect(await canvas.findByText(/不设额外上限/)).toBeVisible();}};

export const ConnectionEnglish:Story={args:{scenario:'configuration',locale:'en'}};
export const ServiceFailed:Story={args:{scenario:'service-failed',document:'service'},play:async({canvas})=>{await expect(await canvas.findByRole('alert')).toHaveTextContent('MCP 服务启动失败');await userEvent.click(canvas.getByRole('button',{name:'重试启动'}));await expect(await canvas.findByText('服务运行中')).toBeVisible();}};
export const ServiceFailedDark:Story={args:{scenario:'service-failed',document:'service',theme:'dark'}};
export const ServiceAddressChanged:Story={args:{scenario:'address-changed',document:'service'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'修复客户端配置'}));await expect(await canvas.findByRole('button',{name:'生成配置预览'})).toBeVisible();}};
export const ServiceAddressChangedDark:Story={args:{scenario:'address-changed',document:'service',theme:'dark'}};
export const ServiceFailedLight:Story={args:{scenario:'service-failed',document:'service'}};
export const ServiceAddressChangedLight:Story={args:{scenario:'address-changed',document:'service'}};

const chooseSkill:NonNullable<Story['play']>=async({canvas})=>{await userEvent.click(await canvas.findByRole('combobox',{name:'安装内容'}));await userEvent.keyboard('{ArrowDown}{Enter}');await waitFor(()=>expect(canvas.getByRole('combobox',{name:'安装内容'})).toHaveTextContent('项目创作 skill'));};
export const ConfigurationInstalled:Story={args:{scenario:'configuration-current'},play:chooseSkill};
export const ConfigurationLocalEdits:Story={args:{scenario:'configuration-local-edits'},play:async context=>{await chooseSkill(context);await userEvent.click(await context.canvas.findByRole('button',{name:'保存官方更新供审阅'}));await expect(await context.canvas.findByText(/本地编辑已保留，官方更新已另存为/)).toBeVisible();}};
export const ConfigurationLocalEditsDark:Story={...ConfigurationLocalEdits,args:{scenario:'configuration-local-edits',theme:'dark'}};
export const ConfigurationWriteFailed:Story={args:{scenario:'configuration-write-failed'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'安装 / 更新 MCP 配置'}));await expect(await canvas.findByRole('alert')).toHaveTextContent('配置文件已变化');}};
export const ConfigurationWriteFailedDark:Story={...ConfigurationWriteFailed,args:{scenario:'configuration-write-failed',theme:'dark'}};
export const ConfigurationExportCancelled:Story={args:{scenario:'configuration-export-cancelled'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'导出文件'}));await expect(await canvas.findByText('已取消导出，文件保持原样。')).toBeVisible();}};
export const ConfigurationExported:Story={args:{scenario:'configuration'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'导出文件'}));await expect(await canvas.findByText('配置已导出到：D:/导出目录/助手连接配置.yml')).toBeVisible();}};
export const ServiceStopFailed:Story={args:{scenario:'service-stop-failed',document:'service'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('button',{name:'关闭服务'}));const confirm=document.querySelector('[role="alertdialog"]')!;await userEvent.click(Array.from(confirm.querySelectorAll('button')).find(button=>button.textContent==='关闭服务')!);await expect(confirm.querySelector('[role="alert"]')).toHaveTextContent('无法保存服务设置');}};
export const ConfigurationReadbackEnglish:Story={args:{scenario:'configuration-local-edits',locale:'en'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('combobox',{name:'Install'}));await userEvent.keyboard('{ArrowDown}{Enter}');await userEvent.click(await canvas.findByRole('button',{name:'Save official updates for review'}));await expect(await canvas.findByText(/Local edits are preserved/)).toBeVisible();}};
export const ConfigurationReadbackJapanese:Story={args:{scenario:'configuration-local-edits',locale:'ja',theme:'dark'},play:async({canvas})=>{await userEvent.click(await canvas.findByRole('combobox',{name:'導入する内容'}));await userEvent.keyboard('{ArrowDown}{Enter}');await userEvent.click(await canvas.findByRole('button',{name:'公式更新を確認用に保存'}));await expect(await canvas.findByText(/ローカルの編集を保持し、公式更新を/)).toBeVisible();}};

export const ManyCalls:Story={args:{scenario:"many"},play:async({canvas})=>{const nav=await canvas.findByRole("navigation",{name:"调用历史分页"});await userEvent.click(within(nav).getByRole("button",{name:"末页"}));await expect(await canvas.findByText("751–763 / 763")).toBeVisible();}};

const chooseCodex:NonNullable<Story['play']>=async({canvas})=>{await userEvent.click(await canvas.findByRole('combobox',{name:'Harness'}));await userEvent.keyboard('{End}{Enter}');await expect(await canvas.findByRole('button',{name:'选择工作区目录'})).toBeVisible();};
export const ConfigurationWorkspace:Story={args:{scenario:'configuration-workspace'},play:async context=>{
  await chooseCodex(context);const {canvas}=context;
  await userEvent.click(canvas.getByRole('button',{name:'选择工作区目录'}));
  await expect(await canvas.findByText('配置文件：D:/Stories/.codex/config.toml')).toBeVisible();
  await expect(canvas.getByText('当前接入作品目录：D:/Stories/SpringLights')).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'安装 / 更新 MCP 配置'}));
  await expect(await canvas.findByRole('button',{name:'MCP 配置已写入'})).toBeDisabled();
  await expect(canvas.getByText(/MCP 配置已写入。请在助手中重新加载 MCP/)).toBeVisible();
}};
export const ConfigurationWorkspaceDark:Story={...ConfigurationWorkspace,args:{scenario:'configuration-workspace',theme:'dark'}};
export const ConfigurationWorkspaceCancelled:Story={args:{scenario:'configuration-workspace-cancelled'},play:async context=>{
  await chooseCodex(context);const {canvas}=context;
  const before=canvas.getByText('配置文件：D:/Stories/SpringLights/.codex/config.toml');
  await userEvent.click(canvas.getByRole('button',{name:'选择工作区目录'}));
  await expect(before).toBeVisible();await expect(canvas.queryByRole('button',{name:'使用当前作品目录'})).toBeNull();
  await expect(canvas.getByRole('button',{name:'安装 / 更新 MCP 配置'})).toBeEnabled();
}};
