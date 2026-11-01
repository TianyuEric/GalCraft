import {expect,it} from 'vitest';
import {migrateEditableProduction} from './production-migration.mjs';
import {migrateProductionStores} from './production-migration.mjs';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
it('changes only known editable identities, preserves graph/revision and is idempotent',()=>{
  const graph={n:{class_type:'SaveAudio',inputs:{}}};const old={id:'Draft1',revision:7,operation:'org.galcraft.voice-comfy/breezeDesign',providerKey:'org.galcraft.voice-comfy/comfy',protocol:'plugin',apiGraph:graph,fields:{instruction:'作者修改'}};
  const next=migrateEditableProduction(old);expect(next.changed).toBe(true);expect(next.value).toEqual({...old,providerKey:'org.galcraft.comfyui/comfyUI',protocol:'comfyUI'});expect(old.providerKey).toBe('org.galcraft.voice-comfy/comfy');expect(migrateEditableProduction(next.value).changed).toBe(false);
});
it('migrates editable stores with a recoverable backup and leaves submitted snapshots and malformed files intact',async()=>{
  const root=await mkdtemp(join(tmpdir(),'galcraft-service-migration-'));
  try {
    await mkdir(join(root,'recipes'),{recursive:true});await mkdir(join(root,'tasks/WorkAA'),{recursive:true});
    const editable={id:'Draft1',revision:4,config:{protocol:'anthropic',providerKey:'org.galcraft.animation-generation/text'},fields:{instruction:'作者原文'}};
    const raw=JSON.stringify(editable),path=join(root,'recipes/recipe.json'),frozen=join(root,'tasks/WorkAA/task.json'),bad=join(root,'recipes/bad.json');await writeFile(path,raw);await writeFile(frozen,raw);await writeFile(bad,'{invalid');
    const project={projectId:'WorkAA',documents:new Map()};const issues=await migrateProductionStores(root,project,[]);
    expect(JSON.parse(await readFile(path,'utf8'))).toMatchObject({...editable,config:{protocol:'anthropic',providerKey:'org.galcraft.generation-services/anthropic'}});expect(await readFile(`${path}.before-services-v1`,'utf8')).toBe(raw);
    expect(await readFile(frozen,'utf8')).toBe(raw);expect(await readFile(bad,'utf8')).toBe('{invalid');expect(issues.join()).toContain('bad.json');
    const current=await readFile(path,'utf8');await migrateProductionStores(root,project,[]);expect(await readFile(path,'utf8')).toBe(current);expect(await readFile(`${path}.before-services-v1`,'utf8')).toBe(raw);
  }finally{await rm(root,{recursive:true,force:true});}
});
