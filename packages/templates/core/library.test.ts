import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TemplateLibrary } from './library.js';
import { createOfficialTemplate } from './templates.js';
import { packTemplate } from './package.js';
const roots:string[]=[];afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
describe('AO-3 local package library',()=>{
  it('isolates copies, blocks official overwrite, supports cancel/update/copy and deletes only a user version',async()=>{
    const root=await mkdtemp(join(tmpdir(),'galcraft-template-library-'));roots.push(root);const library=new TemplateLibrary(root),official=createOfficialTemplate();
    const bytes=packTemplate({template:official,name:'Official copy source',description:'',files:{},assetFiles:{}});
    const conflict=await library.import(bytes);expect(conflict.status).toBe('conflict');expect(conflict.choices).toEqual(['cancel','copy']);
    await expect(library.import(bytes,'update')).rejects.toThrow('READ_ONLY');
    const copied=await library.copy(official,'My UI');expect(copied.id).not.toBe(official.id);
    const work=structuredClone((await library.read(copied)).template),userBytes=await library.export(copied);
    expect((await library.import(userBytes)).choices).toEqual(['cancel','copy','update']);
    expect((await library.import(userBytes,'cancel')).status).toBe('cancelled');
    await library.rename(copied,'Renamed');expect((await library.read(copied)).manifest.name).toBe('Renamed');
    await library.import(userBytes,'update');expect((await library.read(copied)).manifest.name).toBe('My UI');
    const second=await library.import(userBytes,'copy');expect(second.entry?.id).not.toBe(copied.id);
    await library.remove(copied);expect(work.pages.length).toBeGreaterThan(0);expect((await library.list()).items.some(entry=>entry.id===copied.id)).toBe(false);
    await expect(library.remove(official)).rejects.toThrow('READ_ONLY');
  });
});
