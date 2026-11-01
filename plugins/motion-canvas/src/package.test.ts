import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import type {PluginContext,PluginManifest} from '@galcraft/plugins/contracts';
import {preparePluginModuleGraph} from '@galcraft/plugins';
import {checkPluginImplementations} from '@galcraft/plugins/development';

describe('ordinary Motion Canvas package',()=>{
  it('supplies the declared tool to both the editor and service package hosts',async()=>{
    const directory=resolve(import.meta.dirname,'../package');
    const manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8')) as PluginManifest;
    expect(await checkPluginImplementations(directory,manifest)).toEqual([]);
    const graph=await preparePluginModuleGraph(directory,manifest);
    let plugin;
    try {
      plugin=(await graph.importEntry(manifest.entry.editor!)).createPlugin();
      const offered=await plugin.activate({} as PluginContext);
      for(const tool of manifest.contributions.filter(item=>item.kind==='tool'&&item.targets.includes('windows')))
        expect(offered.tools.filter((item:{key:string})=>item.key===tool.key)).toHaveLength(1);
    } finally {await plugin?.deactivate();await graph.release();}
  });
});
