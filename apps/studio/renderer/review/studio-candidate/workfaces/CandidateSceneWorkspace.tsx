import { Columns2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CandidateActionMenu, CandidateButton, CandidateToolbar, type CandidateMenuTarget } from '../components/controls/index.js';
import { useCandidateState } from '../application/context.js';
const modes = [['writing', '文稿'], ['commands', '完整指令'], ['source', '源码']] as const;

export function CandidateSceneWorkspace({sceneId,mode,onOpen,onCompare,children}:{sceneId:string;mode:string;onOpen(id:string):void;onCompare(id:string,axis:'x'|'y'):void;children:ReactNode}) {
  const {project}=useCandidateState(),scene=project.scenes.find(scene=>scene.id===sceneId);
  const [menu, setMenu] = useState<CandidateMenuTarget | null>(null);
  return <section className="candidate-scene-workspace" style={{height:'100%',display:'flex',flexDirection:'column',minHeight:0}} aria-label={`${scene?.name??'已移除场景'} 编辑模式`}>
    <CandidateToolbar label="场景编辑模式" className="candidate-scene-modes">{modes.map(([key,label])=><CandidateButton key={key} aria-pressed={mode===key} onClick={()=>onOpen(`${key}:${sceneId}`)}>{label}</CandidateButton>)}
      <CandidateButton className="candidate-scene-compare" aria-haspopup="menu" aria-expanded={!!menu} onClick={event => {
        const anchor = event.currentTarget;
        setMenu(menu ? null : { anchor });
      }}><Columns2 size={14}/>并排查看</CandidateButton>
      <CandidateActionMenu label="并排查看" target={menu} onDismiss={() => setMenu(null)}
        actions={modes.filter(([key]) => key !== mode).flatMap(([key, label]) => (['x', 'y'] as const).map(axis => ({
          id: key + axis,
          label: `${axis === 'x' ? '右侧' : '下方'} · ${label}`,
          run: () => onCompare(`${key}:${sceneId}`, axis),
        })))}/>
    </CandidateToolbar><div style={{flex:1,minHeight:0}}>{children}</div>
  </section>;
}
