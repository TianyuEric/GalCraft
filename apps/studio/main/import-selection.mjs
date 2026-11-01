import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';

/** Manual import locations are local preferences shared by desktop and browser entry points. */
export class ImportSelection {
  constructor(userData,dialog,window){this.path=join(userData,'authoring-preferences','import-directories.json');this.dialog=dialog;this.window=window;this.tail=Promise.resolve();}
  async choose(purpose,options){
    if(!['assets','production','packages','documents'].includes(purpose))throw new Error('Unknown import purpose.');
    const work=this.tail.catch(()=>{}).then(async()=>{
      let locations={};try{locations=JSON.parse(await readFile(this.path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      const selected=await this.dialog.showOpenDialog(this.window,{...options,...(locations[purpose]?{defaultPath:locations[purpose]}:{})});
      if(!selected.canceled&&selected.filePaths?.[0]){
        locations[purpose]=options.properties?.includes('openDirectory')?selected.filePaths[0]:dirname(selected.filePaths[0]);
        await mkdir(dirname(this.path),{recursive:true});await writeFile(`${this.path}.tmp`,JSON.stringify(locations));await rename(`${this.path}.tmp`,this.path);
      }
      return selected;
    });this.tail=work.then(()=>undefined,()=>undefined);return work;
  }
}
