import { CandidateButton, CandidateToolbar } from '../components/controls/index.js';
import {useState} from 'react';
import {useCandidate,useCandidateState} from '../application/context.js';
import {CandidateStageView} from './CandidateStageView.js';
import {CandidateCommandStageView} from './CandidateCommandStageView.js';
import {CandidateSourceBinding} from '../components/CandidateSourceBinding.js';

export function CandidateStageWorkspace({onOpen}:{onOpen(id:string):void}) {
  const store=useCandidate();useCandidateState();
  const [mode,setMode]=useState<'composition'|'runtime'>(()=>store.viewState<'composition'|'runtime'>('stage:mode')??'composition');
  const requested=store.viewState<'composition'|'runtime'>('stage:mode'), active=requested??mode;
  const source=store.source('stage');
  return <section className="candidate-unified-stage" style={{height:'100%',display:'flex',flexDirection:'column',minHeight:0}}>
    <CandidateToolbar className="candidate-stage-modes" label="舞台模式"><CandidateButton aria-pressed={active==='composition'} onClick={()=>{setMode('composition');store.rememberViewState('stage:mode','composition');}}>句内构图</CandidateButton><CandidateButton aria-pressed={active==='runtime'} onClick={()=>{setMode('runtime');store.rememberViewState('stage:mode','runtime');}}>作品运行</CandidateButton><span>{active==='composition'?'编辑当前句内位置':'正式编译与 Player 执行'}</span></CandidateToolbar>
    {active==='runtime'&&<CandidateSourceBinding panel="stage" description={store.getSnapshot().project.scenes.find(scene=>scene.id===source.documentId)?.name??'来源已移除'} available={!!store.sceneSource(source.documentId)}/>}
    <div style={{flex:1,minHeight:0}}>{active==='composition'?<CandidateStageView onOpen={onOpen}/>:<CandidateCommandStageView sceneId={source.documentId} sourceStatementId={source.id} onOpen={onOpen}/>}</div>
  </section>;
}
