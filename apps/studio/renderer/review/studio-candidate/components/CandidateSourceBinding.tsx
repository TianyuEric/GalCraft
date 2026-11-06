import {useCandidate,useCandidateState} from '../application/context.js';
import {CandidateSourceStatus} from './controls/index.js';

export function CandidateSourceBinding({panel,description,available,onLocate}:{panel:'stage'|'inspector';description:string;available:boolean;onLocate?():void}) {
  const store=useCandidate(),{ui}=useCandidateState(),pinned=Boolean(ui.pins[panel]);
  return <CandidateSourceStatus label={panel==='stage'?'舞台来源':'属性来源'} name={description} mode={!available?'missing':pinned?'fixed':'following'}
    modeLabel={!available?'来源已失效':pinned?'固定来源':panel==='stage'?'跟随编辑位置':'跟随选中'}
    diagnostic={!available?'来源已移除；可恢复跟随以选择当前对象。':undefined}
    locate={available&&onLocate?{label:'定位来源',run:onLocate}:undefined}
    changeMode={available||pinned?{label:pinned?'恢复跟随':'固定来源',run:()=>store.pin(panel)}:undefined}/>;
}
