import { useEffect, useState } from 'react';
import type { AuthoringServices } from '../../../../authoring/controller.js';
import { openPlayerPreview } from '../../../../authoring/player-preview.js';
import { unwrap } from '../../../../pages/Production/bridge.js';
import type { CandidateProductionSession } from '../../adapters/production-session.js';
import { CandidateButton, CandidateReviewDialog, CandidateState } from '../controls/index.js';

export function CandidateScriptPreview({session,services,candidateId,close}:{session:CandidateProductionSession;services:AuthoringServices;candidateId:string;close():void}) {
  const [root,setRoot]=useState<HTMLDivElement|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!root)return;
    let active=true,player:Awaited<ReturnType<typeof openPlayerPreview>>|null=null;
    const surface=root.ownerDocument.createElement('div');Object.assign(surface.style,{position:'absolute',inset:'0'});root.replaceChildren(surface);
    void(async()=>{
      const snapshot=unwrap(await session.bridge.production.previewScript(candidateId));
      const documents=unwrap(await session.bridge.documents.list());
      if(!active)return;
      root.style.aspectRatio=`${snapshot.project.canvas.width}/${snapshot.project.canvas.height}`;
      const mounted=await openPlayerPreview(surface,services,snapshot,'candidate',Object.assign({},...documents.map(document=>document.files)));
      if(!active){mounted.dispose();return;}
      player=mounted;await mounted.view.newGame();if(active)setLoading(false);
    })().catch(reason=>{if(active){setError(reason instanceof Error?reason.message:String(reason));setLoading(false);}});
    return()=>{active=false;player?.dispose();surface.remove();};
  },[root,session,services,candidateId]);
  return <CandidateReviewDialog open title="候选试玩" className="candidate-script-preview-dialog" onDismiss={close} actions={<CandidateButton onClick={close}>返回比较</CandidateButton>}>
    <p>试玩使用独立候选会话。确认采用后才写入作品。</p>
    {loading&&<CandidateState kind="loading" title="正在编译并启动候选…"/>}
    {error&&<CandidateState kind="error" title="候选暂时无法试玩" description={error}/>}
    <div ref={setRoot} className="candidate-script-preview-surface"/>
  </CandidateReviewDialog>;
}
