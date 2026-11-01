import {it,expect} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudioCollaboration} from './collaboration-providers.mjs';
import {ProjectSession} from '@galcraft/documents';

it('installs Codex in the selected parent workspace while preserving the child project identity and reviewed files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'galcraft-workspace-')),projectRoot=join(root,'作品集合','零点回信'),workspace=join(root,'作品集合');
  let owner,project,cancel=false;
  const value=result=>{expect(result.ok,JSON.stringify(result)).toBe(true);return result.value;};
  try{
    project=await ProjectSession.createProject(projectRoot,'Work01',[{documentId:'Doc001',revision:1,format:'json',files:{'fixture.json':'{}'}}]);
    owner=new StudioCollaboration({userData:join(root,'profile'),projects:{currentSession:project,currentRoot:projectRoot,currentSessionId:'Write1'},production:{},assets:{},plugins:{externalTools:async()=>[]},dialog:{showOpenDialog:async(_window,options)=>{expect(options).toMatchObject({defaultPath:projectRoot,properties:['openDirectory']});return {canceled:cancel,filePaths:cancel?[]:[workspace]};}}});
    await owner.ready;await owner.mcp.start();
    const input={harness:'codex',destination:'project',purpose:'mcp'};
    expect(value(await owner.call('configuration',input)).path).toBe(join(projectRoot,'.codex/config.toml'));
    expect(value(await owner.call('chooseWorkspaceDirectory',{directory:projectRoot}))).toBe(workspace);
    cancel=true;expect(value(await owner.call('chooseWorkspaceDirectory',{directory:projectRoot}))).toBe(null);
    const target=join(workspace,'.codex/config.toml'),original='# Shared workspace\n[mcp_servers.docs]\nurl = "http://localhost:3"\n[mcp_servers.galcraft]\nurl = "http://localhost:1/mcp"\ntool_timeout_sec = 90\n';
    await mkdir(join(workspace,'.codex'));await writeFile(target,original);
    const selected={...input,workspaceDirectory:workspace},preview=value(await owner.call('configuration',selected));
    expect(preview).toMatchObject({path:target,workspaceDirectory:workspace,project:{projectId:'Work01',projectRoot,writeSessionId:'Write1'}});
    expect(preview.command).toContain(`Set-Location -LiteralPath '${workspace}'`);expect(preview.instructions).toContain(projectRoot);expect(preview.content).not.toContain('Work01');
    expect(await readFile(target,'utf8')).toBe(original);
    value(await owner.call('writeConfiguration',{...preview,mode:'merge'}));
    const actual=await readFile(target,'utf8');expect(actual).toContain('# Shared workspace');expect(actual).toContain('http://localhost:3');expect(actual).toContain('tool_timeout_sec = 90');expect(actual).toContain(owner.mcp.endpoint);expect(await readFile(target+'.before-galcraft','utf8')).toBe(original);
    const current=value(await owner.call('configuration',selected));expect(current.readback.state).toBe('current');expect(current.changes).toEqual([]);
    await writeFile(target,actual+'\n# Author changed after review\n');expect((await owner.call('writeConfiguration',{...current,mode:'merge'})).ok).toBe(false);
    expect(await readFile(target,'utf8')).toContain('# Author changed after review');
    expect((await owner.call('configuration',{...selected,workspaceDirectory:join(root,'missing')})).ok).toBe(false);
    expect(value(await owner.call('configuration',{...selected,purpose:'skill'})).path).toBe(join(projectRoot,'.agents/skills/galcraft-create'));
  }finally{await owner?.close();await project?.dispose('discard');await rm(root,{recursive:true,force:true});}
});
