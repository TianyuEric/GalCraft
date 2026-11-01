import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { parseDocument, stringify } from 'yaml';
import type { ConfigurationReadback, HarnessConfiguration, HarnessProject } from './contracts.js';

/** Launch context is separate from native MCP transport configuration. */
export function harnessLaunch(harness:HarnessConfiguration['harness'],command:string,project?:HarnessProject,workspaceDirectory=project?.projectRoot){
  const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
  const launcher=harness==='codex'?`${command} --sandbox workspace-write`:command;
  const instructions=project?`Target projectId: ${project.projectId}\nProject directory: ${project.projectRoot}\nCurrent writeSessionId: ${project.writeSessionId}\n${project.sessionId?`Last observed sessionId: ${project.sessionId}. Explicitly connect to obtain the current identity; never assume it is still valid.\n`:''}Call galcraft_context with {\"projectId\":${JSON.stringify(project.projectId)},\"input\":{\"mode\":\"bootstrap\",\"projectId\":${JSON.stringify(project.projectId)}}}. Then explicitly prepareCreate/apply with galcraft_collaboration using this projectId and the returned writeSessionId. Keep the returned projectId/sessionId on every project business and capability call. Read the exact current contract before constructing domain input.`:'Global creation connection: use galcraft_projects to create or open an author-selected project. Creation does not require a business session. Once it returns the real projectId and directory, generate project connection materials and restart or reconnect from that directory. Bootstrap is read-only; explicitly start or connect to collaboration before project business calls.';
  const guidance=[harness==='codex'?'Codex starts with workspace-write for its native file tools. Trust the project to load .codex/config.toml. Additional native writable paths use --add-dir with author-selected directories.':harness==='claude'?'Claude Code loads .mcp.json after project approval. Its native /permissions and /sandbox settings control shell/file access; review them in that client.':'DSH uses the invoking directory as its workspace root. The selected profile owns native permission and sandbox policy; inspect that profile rather than adding unsupported MCP configuration fields.','MCP transport configuration connects the service. Every project business call separately validates projectId/sessionId. The running harness owns its cwd and sandbox; MCP does not change them.'];
  return {project,instructions,command:workspaceDirectory?`Set-Location -LiteralPath ${quote(workspaceDirectory)}\n${launcher}`:launcher,guidance};
}

export function harnessContent(harness:HarnessConfiguration['harness'],endpoint:string):string {
  const url=new URL(endpoint);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:')throw new Error('MCP端点必须是本机HTTP地址');
  if(harness==='claude')return JSON.stringify({mcpServers:{galcraft:{type:'http',url:endpoint}}},null,2)+'\n';
  if(harness==='codex')return stringifyToml({mcp_servers:{galcraft:{url:endpoint}}});
  return JSON.stringify([{insert:[{id:'mcp-galcraft',name:'@deepseek-ai/dsh-mcp-client',config:{serverName:'galcraft',transport:'streamable-http',url:endpoint,failOnStartupError:true,toolCallTimeoutMs:60000}}]}],null,2)+'\n';
}
export function mergeHarness(harness:HarnessConfiguration['harness'],existing:string|null,content:string):string {
  const object=(value:unknown)=>!!value&&typeof value==='object'&&!Array.isArray(value);
  if(harness==='claude'){const current=existing===null?{}:JSON.parse(existing),next=JSON.parse(content);if(!object(current)||current.mcpServers!==undefined&&!object(current.mcpServers))throw new Error('现有.mcp.json结构无效');return JSON.stringify({...current,mcpServers:{...current.mcpServers,galcraft:{...current.mcpServers?.galcraft,...next.mcpServers.galcraft}}},null,2)+'\n';}
  if(harness==='codex'){
    const current=existing===null?{}:parseToml(existing),next=parseToml(content);
    if(current.mcp_servers!==undefined&&!object(current.mcp_servers))throw new Error('现有mcp_servers结构无效');
    const galcraft={...((current.mcp_servers as Record<string,object>|undefined)?.galcraft),...(next.mcp_servers as Record<string,object>).galcraft};
    const section=stringifyToml({mcp_servers:{galcraft}} as Parameters<typeof stringifyToml>[0]);
    if(existing===null)return section;
    const lines=existing.split(/(?<=\n)/),kept:string[]=[];let own=false;
    for(const line of lines){if(/^\s*\[/.test(line))own=/^\s*\[mcp_servers\.galcraft(?:\.|\])/.test(line);if(!own)kept.push(line);}
    const retained=kept.join('');return retained+(retained.endsWith('\n')?'':'\n')+section;
  }
  const document=parseDocument(existing??'[]'),patch=parseDocument(content).toJSON();if(document.errors.length)throw document.errors[0];const current=document.toJSON();if(!Array.isArray(current)||!Array.isArray(patch))throw new Error('DSH patch必须是补丁列表');
  const previous=current.flatMap(item=>item?.insert??[]).find(entry=>entry.id==='mcp-galcraft'),replacement=patch.flatMap(item=>item?.insert??[]).find(entry=>entry.id==='mcp-galcraft');
  if(previous&&replacement){const target=replacement.config;replacement.config={...target,...previous.config,serverName:target.serverName,transport:target.transport,url:target.url};}
  const entries=current.filter(item=>!(item?.insert?.some((entry:{id?:string})=>entry.id==='mcp-galcraft')&&item.insert.length===1));
  for(const item of entries)if(Array.isArray(item?.insert))item.insert=item.insert.filter((entry:{id?:string})=>entry.id!=='mcp-galcraft');
  return stringify([...entries,...patch]);
}
/** Compare the native GalCraft entry, preserving unrelated and custom client options. */
export function harnessReadback(harness:HarnessConfiguration['harness'],path:string,existing:string|null,content:string,companionFiles:NonNullable<HarnessConfiguration['companionFiles']>=[]):ConfigurationReadback{
  const entry=(text:string)=>harness==='claude'?JSON.parse(text).mcpServers?.galcraft:harness==='codex'?(parseToml(text).mcp_servers as Record<string,unknown>|undefined)?.galcraft:parseDocument(text).toJSON().flatMap((item:{insert?:{id:string}[]})=>item?.insert??[]).find((item:{id:string})=>item.id==='mcp-galcraft');
  const actual=existing===null?null:entry(existing),expected=entry(content);
  const same=(current:unknown,next:unknown):boolean=>next!==null&&typeof next==='object'?!!current&&typeof current==='object'&&Object.entries(next).every(([key,value])=>harness==='dsh'&&['failOnStartupError','toolCallTimeoutMs'].includes(key)||same((current as Record<string,unknown>)[key],value)):current===next;
  const state=actual==null?'notInstalled':same(actual,expected)?'current':'updateAvailable';
  const files:ConfigurationReadback['files']=[{path,state},...companionFiles.map(file=>({path:file.path,state:file.existing===null?'notInstalled' as const:'current' as const}))];
  return {state:state==='current'&&files.some(file=>file.state!=='current')?'updateAvailable':state,files};
}
export async function writeHarness(input:Omit<HarnessConfiguration,'readback'>&{readback?:ConfigurationReadback}):Promise<void>{
  if(input.purpose==='skill'){
    const changes=input.changes??[];
    for(const file of input.readback?.files??[]){if(file.update){let update:string|null=null;try{update=await readFile(file.update.path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(await readFile(file.path,'utf8')!==file.update.localContent||update!==file.update.existing)throw new Error('项目 skill 文件已变化，请重新生成预览');}}
    for(const file of changes){let existing:string|null=null;try{existing=await readFile(file.path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(existing!==file.existing)throw new Error('项目 skill 文件已变化，请重新生成预览');}
    for(const file of changes){await mkdir(dirname(file.path),{recursive:true});const staged=`${file.path}.tmp`;await writeFile(staged,file.content);await rename(staged,file.path);}return;
  }
  for(const file of input.companionFiles??[]){let current:string|null=null;try{current=await readFile(file.path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(current!==file.existing)throw new Error('DSH profile文件已变化，请重新生成预览');}
  let existing:string|null=null;try{existing=await readFile(input.path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(existing!==input.existing)throw new Error('配置文件已变化，请重新审阅合并内容');
  const content=mergeHarness(input.harness,existing,input.content);
  for(const file of input.companionFiles??[]){if(file.existing!==null)continue;await mkdir(dirname(file.path),{recursive:true});await writeFile(file.path,file.content,{flag:'wx'});}
  await mkdir(dirname(input.path),{recursive:true});if(existing!==null)await writeFile(`${input.path}.before-galcraft`,existing,{flag:'wx'}).catch(error=>{if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;});
  const staged=`${input.path}.tmp`;await writeFile(staged,content);await rename(staged,input.path);
}
