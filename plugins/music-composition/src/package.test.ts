import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { preparePluginModuleGraph } from '@galcraft/plugins';
import { checkPluginImplementations } from '@galcraft/plugins/development';
import type { PluginContext, PluginManifest } from '@galcraft/plugins/contracts';
import { soundbankToolKey } from './tools.js';
it('declares and supplies soundbankInfo through its ordinary services entry',async()=>{
  const directory=resolve(import.meta.dirname,'../package'),manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8')) as PluginManifest;
  expect(manifest.externalTools).toContain(soundbankToolKey);expect(await checkPluginImplementations(directory,manifest)).toEqual([]);
  const graph=await preparePluginModuleGraph(directory,manifest);
  try{for(const environment of ['services'] as const){const plugin=(await graph.importEntry(manifest.entry[environment]!)).createPlugin();try{const offered=await plugin.activate({} as PluginContext);expect(offered.tools.map((tool:{key:string})=>tool.key)).toContain(soundbankToolKey);}finally{await plugin.deactivate();}}}finally{await graph.release();}
});
