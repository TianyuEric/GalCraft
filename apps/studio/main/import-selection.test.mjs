import {expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ImportSelection} from './import-selection.mjs';
it('shares successful manual directories across works, separates purposes and retains them on cancel',async()=>{
  const profile=await mkdtemp(join(tmpdir(),'galcraft-import-')),observed=[];
  const results=[{canceled:false,filePaths:[join(profile,'media','image.png')]},{canceled:true,filePaths:[]},{canceled:false,filePaths:[join(profile,'package')]},{canceled:true,filePaths:[]}];
  const dialog={showOpenDialog:async(_window,options)=>{observed.push(options);return results.shift();}};
  try{
    const picker=new ImportSelection(profile,dialog,null);await picker.choose('assets',{properties:['openFile']});await picker.choose('assets',{properties:['openFile']});
    await picker.choose('packages',{properties:['openDirectory']});
    await new ImportSelection(profile,dialog,null).choose('assets',{properties:['openFile']});
    expect(observed[0].defaultPath).toBeUndefined();expect(observed[1].defaultPath).toBe(join(profile,'media'));expect(observed[2].defaultPath).toBeUndefined();expect(observed[3].defaultPath).toBe(join(profile,'media'));
  }finally{await rm(profile,{recursive:true,force:true});}
});
