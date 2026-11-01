import { createId, type SaveRecord, type Snapshot } from '@galcraft/contracts';
import type { PlayerDataService } from './data.js';

/** Design and Storybook run the same SavePage with real PNG bytes and record metadata. */
export async function prepareSaveSample(data:PlayerDataService,snapshot:Snapshot,inspection:Pick<SaveRecord,'state'|'history'>,canvas:HTMLCanvasElement,sample:string) {
  if(data.domain.kind!=='sample')throw new Error('Save samples require a sample domain');
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
  const thumbnail=blob?new Uint8Array(await blob.arrayBuffer()):undefined;
  for(let index=0;index<(sample==='partial'?1:12);index++){
    const recordId=createId(),image=sample==='missing'?undefined:thumbnail;
    const record=data.makeRecord({snapshot,inspection,kind:'manual',recordId,thumbnail:image?`thumbnails/${recordId}.png`:null});
    if(sample==='longText')record.summary.text='雨停了。 The rain had stopped. 雨がやみました。'.repeat(80);
    const saved=await data.save({kind:'manual',slotId:data.current()!.index.manual[index]?.slotId,record,thumbnail:image,expectedIndexRevision:data.current()!.index.revision});
    if(!saved.ok)throw new Error(saved.error.message);
  }
}
