import { createId } from '@galcraft/contracts';
import type { LongTerm, Snapshot } from '@galcraft/contracts';

/** Only call with the editor's cloned snapshot. No sample is written to M02. */
export function prepareGallerySample(snapshot:Snapshot,sample:string) {
  if(sample==='actual')return;
  if(sample==='empty'){snapshot.gallery=[];return;}
  const longText=['雨の駅で交わした約束 — A promise beyond the last train — 等待下一次相遇的漫长雨夜','A very long gallery series / とても長いシリーズ名 / 长系列名称'];
  const count=sample==='full'?24:sample==='partial'?7:16;
  snapshot.gallery=[];
  for(const kind of ['cg','video','music'] as const){
    const length=kind==='cg'?count:kind==='video'?(sample==='full'?12:9):(sample==='full'?16:6);
    for(let index=0;index<length;index++){
      const media=snapshot.assets.filter(asset=>asset.kind===(kind==='cg'?'image':kind==='video'?'video':'audio'));
      const unbound=['normal','unbound','locked','viewer'].includes(sample)||sample.startsWith('playback:');
      snapshot.gallery.push({id:createId(),kind,name:sample==='longText'?longText[0]!:`${kind==='cg'?'CG':kind==='video'?'影片 / Video / 映像':'曲目 / Track / 楽曲'} ${index+1}`,
        series:sample==='longText'?longText[1]!:index<Math.ceil(length/2)?'系列 A / Series A':'系列 B / Series B',seriesOrder:index<Math.ceil(length/2)?0:1,order:index,cover:null,
        lockedView:'placeholder',assets:kind==='cg'?[]:[unbound?createId():media[index%Math.max(1,media.length)]?.assetId??createId()],
        ...(kind==='cg'?{differences:Array.from({length:4},(_,diff)=>({id:createId(),assetId:unbound?createId():media[(index+diff)%Math.max(1,media.length)]?.assetId??createId(),name:`差分 / Variation / 差分 ${diff+1}`,order:diff})),coverDifferenceId:null}:{})});
    }
  }
}
export function gallerySampleLongTerm(snapshot:Snapshot,original:LongTerm,sample:string):LongTerm {
  const result=structuredClone(original);result.endings=sample==='notCompleted'?[]:['gallery-design-sample'];
  result.cg={};result.music=[];result.video=[];
  snapshot.gallery.forEach((entry,index)=>{
    if(sample==='locked'||sample==='notCompleted'||sample==='actual'&&index%2)return;
    if(sample==='partial'&&index%3===2)return;
    if(entry.kind==='cg')result.cg[entry.id]=(entry.differences??[]).slice(0,sample==='partial'?2:undefined).map(diff=>diff.id);
    else result[entry.kind].push(entry.id);
  });
  return result;
}
