import { describe, expect, it } from 'vitest';
import { parse } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { harnessContent, harnessLaunch, harnessReadback, mergeHarness, writeHarness } from './configuration.js';
import { creativeSkillFiles, previewSkillFiles } from './creative-skill.js';
const endpoint='http://127.0.0.1:45000/mcp';
describe('explicit harness configuration',()=>{
  it('keeps exact project identity in launch instructions and native cwd while transport config stays native',()=>{
    const project={projectId:'ProjectA',projectRoot:"D:\\Stories\\Author's work",writeSessionId:'WriteA1'};
    for(const harness of ['codex','claude','dsh'] as const){const launch=harnessLaunch(harness,harness==='dsh'?'dsh --profile galcraft':harness,project);expect(launch.command).toContain("Set-Location -LiteralPath 'D:\\Stories\\Author''s work'");expect(launch.instructions).toContain('ProjectA');expect(launch.instructions).toContain('bootstrap');expect(launch.instructions).toContain('projectId/sessionId');expect(harnessContent(harness,endpoint)).not.toContain('ProjectA');expect(creativeSkillFiles(harness,project)['SKILL.md']).toContain('Target projectId: ProjectA');}
    const instructions=harnessLaunch('codex','codex',project).instructions;const bootstrap=JSON.parse(instructions.split('with ')[1]!.split('. Then')[0]!);expect(bootstrap).toEqual({projectId:project.projectId,input:{mode:'bootstrap',projectId:project.projectId}});expect(harnessLaunch('codex','codex',project).command).toContain('--sandbox workspace-write');expect(harnessLaunch('dsh','dsh --profile galcraft').instructions).toContain('Global creation');
  });
  it('installs native project skills separately and preserves actual user edits during an update',async()=>{
    const root=await mkdtemp(join(tmpdir(),'galcraft-skill-'));
    try{
      const files=creativeSkillFiles('codex'),first=await previewSkillFiles(root,files);
      expect(first.readback.state).toBe('notInstalled');
      const input={harness:'codex' as const,purpose:'skill' as const,path:root,content:files['SKILL.md']!,existing:null,command:'codex',...first};await writeHarness(input);
      expect(await readFile(join(root,'agents/openai.yaml'),'utf8')).toContain('allow_implicit_invocation: true');
      const installed=await previewSkillFiles(root,files);expect(installed.readback.state).toBe('current');expect(installed.changes).toEqual([]);
      const officialUpdate=await previewSkillFiles(root,{...files,'SKILL.md':files['SKILL.md']!+'\nUpdated workflow.\n'});expect(officialUpdate.readback.state).toBe('updateAvailable');
      const edited=files['SKILL.md']!+'\nMy project style stays here.\n';await writeFile(join(root,'SKILL.md'),edited);
      const updated={...files,'SKILL.md':files['SKILL.md']!+'\nUpdated official workflow.\n'},preview=await previewSkillFiles(root,updated);await writeHarness({...input,...preview});
      expect(preview.readback.state).toBe('localEdits');expect(preview.readback.files.find(file=>file.update)?.update?.pending).toBe(false);
      const pending=await previewSkillFiles(root,updated);expect(pending.readback.files.find(file=>file.update)?.update?.pending).toBe(true);expect(pending.changes).toEqual([]);
      expect(await readFile(join(root,'SKILL.md'),'utf8')).toBe(edited);expect(await readFile(join(root,'SKILL.md.galcraft-update'),'utf8')).toBe(updated['SKILL.md']);
      const stale=await previewSkillFiles(root,updated);await writeFile(join(root,'SKILL.md.galcraft-update'),'Changed since review');await expect(writeHarness({...input,...stale})).rejects.toThrow('已变化');
    }finally{await rm(root,{recursive:true,force:true});}
  });
  it('reads native MCP connection facts independently from formatting and preserves client options',()=>{
    for(const harness of ['codex','claude','dsh'] as const){
      const content=harnessContent(harness,endpoint);
      expect(harnessReadback(harness,'config',null,content).state).toBe('notInstalled');
      const other=harness==='codex'?'[mcp_servers.docs]\nurl="http://localhost:3"':harness==='claude'?'{"mcpServers":{"docs":{"url":"http://localhost:3"}}}':'[]';
      expect(harnessReadback(harness,'config',other,content).state).toBe('notInstalled');
      const merged=mergeHarness(harness,other,content);expect(harnessReadback(harness,'config',merged,content).state).toBe('current');
      expect(harnessReadback(harness,'config',merged,harnessContent(harness,'http://localhost:9/mcp')).state).toBe('updateAvailable');
    }
    const customized=parseYaml(harnessContent('dsh',endpoint));customized[0].insert[0].config.toolCallTimeoutMs=120000;
    expect(harnessReadback('dsh','config',JSON.stringify(customized),harnessContent('dsh',endpoint)).state).toBe('current');
    expect(harnessReadback('dsh','config',JSON.stringify(customized),harnessContent('dsh',endpoint),[{path:'package.json',existing:null,content:'{}'}]).state).toBe('updateAvailable');
  });
  it('retains other TOML comments and customized GalCraft client options when updating its endpoint',()=>{
    const source='# Personal setup\nmodel = "chosen"\n[mcp_servers.docs]\n# Keep this explanation\nurl="http://localhost:3"\n[mcp_servers.galcraft]\nurl="http://localhost:1/mcp"\ntool_timeout_sec=90\n';
    const merged=mergeHarness('codex',source,harnessContent('codex',endpoint));
    expect(merged).toContain('# Keep this explanation');expect(parse(merged)).toMatchObject({mcp_servers:{docs:{url:'http://localhost:3'},galcraft:{url:endpoint,tool_timeout_sec:90}}});
  });
  it('preserves unrelated JSON and TOML settings and replaces only the GalCraft item',()=>{
    const claude=JSON.parse(mergeHarness('claude',JSON.stringify({other:'kept',mcpServers:{docs:{type:'http',url:'http://localhost:3'},galcraft:{url:'old'}}}),harnessContent('claude',endpoint)));
    expect(claude).toMatchObject({other:'kept',mcpServers:{docs:{url:'http://localhost:3'},galcraft:{type:'http',url:endpoint}}});
    const codex=parse(mergeHarness('codex','model = "chosen"\n[mcp_servers.docs]\nurl="http://localhost:3"\n',harnessContent('codex',endpoint)));
    expect(codex).toMatchObject({model:'chosen',mcp_servers:{docs:{url:'http://localhost:3'},galcraft:{url:endpoint}}});
  });
  it('exports the actual DSH insert patch and keeps other plugin configuration',()=>{
    const content=mergeHarness('dsh','- id: another\n  config:\n    value: kept\n',harnessContent('dsh',endpoint));const patch=parseYaml(content);
    expect(patch[0]).toMatchObject({id:'another',config:{value:'kept'}});expect(patch[1].insert[0]).toMatchObject({name:'@deepseek-ai/dsh-mcp-client',config:{serverName:'galcraft',transport:'streamable-http',url:endpoint}});
    expect(parseYaml(mergeHarness('dsh',content,harnessContent('dsh',endpoint)))).toHaveLength(2);
    const customized=JSON.parse(harnessContent('dsh',endpoint));customized[0].insert[0].config.toolCallTimeoutMs=90000;customized[0].insert[0].config.customOption='kept';
    expect(parseYaml(mergeHarness('dsh',JSON.stringify(customized),harnessContent('dsh','http://127.0.0.1:46000/mcp')))[0].insert[0].config).toMatchObject({toolCallTimeoutMs:90000,customOption:'kept',url:'http://127.0.0.1:46000/mcp'});
  });
  it('keeps malformed configuration out of a write and rejects a remote endpoint',()=>{
    expect(()=>mergeHarness('codex','[bad',harnessContent('codex',endpoint))).toThrow();expect(()=>harnessContent('dsh','https://example.com/mcp')).toThrow('本机');
    expect(()=>mergeHarness('claude','{"mcpServers":[]}',harnessContent('claude',endpoint))).toThrow();
    expect(()=>mergeHarness('codex','mcp_servers="invalid"',harnessContent('codex',endpoint))).toThrow();
  });
  it('writes the reviewed configuration and DSH profile on disk, retains the original backup, and rejects a stale preview',async()=>{
    const root=await mkdtemp(join(tmpdir(),'galcraft-harness-'));
    try {
      const path=join(root,'cordis.patch.yml'),existing='- id: other\n  config:\n    value: kept\n';await writeFile(path,existing);
      const input={harness:'dsh' as const,path,existing,content:harnessContent('dsh',endpoint),command:'dsh --profile galcraft',companionFiles:[{path:join(root,'package.json'),content:'{"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-headless"]}}}',existing:null}]};
      await writeHarness(input);const merged=await readFile(path,'utf8');expect(parseYaml(merged)[0]).toMatchObject({id:'other',config:{value:'kept'}});expect(await readFile(`${path}.before-galcraft`,'utf8')).toBe(existing);expect(JSON.parse(await readFile(join(root,'package.json'),'utf8')).dsh.profile.bundles).toContain('@deepseek-ai/dsh-headless');
      await expect(writeHarness(input)).rejects.toThrow('已变化');expect(await readFile(path,'utf8')).toBe(merged);
      await writeFile(path,'[malformed');await expect(writeHarness({...input,existing:'[malformed',companionFiles:[]})).rejects.toThrow();expect(await readFile(path,'utf8')).toBe('[malformed');
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
