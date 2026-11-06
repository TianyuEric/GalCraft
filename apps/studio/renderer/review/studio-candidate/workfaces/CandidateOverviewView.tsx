import {parse} from '@galcraft/dsl';
import {useCandidate,useCandidateState} from '../application/context.js';
import {authoringSource} from '../application/documents.js';
import {CandidateButton,CandidateSection,CandidateState,CandidateToolbar} from '../components/controls/index.js';
import type {CandidateSourceReveal} from '../adapters/script-editor.js';

export function CandidateOverviewView({onOpen}:{onOpen(id:string):void}) {
  const store=useCandidate(),{project,ui}=useCandidateState(), source=authoringSource(store.host.list());
  return <section className="candidate-workface candidate-document-scroll" aria-label="作品概览">
    <CandidateSection title={project.name}><p>{source.project.description||'从一场戏开始，把你的故事做成可以游玩的作品。'}</p>
      <CandidateToolbar label="作品操作"><CandidateButton variant="primary" onClick={()=>onOpen(store.viewState<string>('overview:lastObject')??`writing:${ui.sceneId}`)}>继续编辑</CandidateButton><CandidateButton onClick={()=>onOpen('settings')}>作品设置</CandidateButton><CandidateButton onClick={()=>onOpen('maintenance')}>作品维护</CandidateButton><CandidateButton onClick={()=>onOpen('publish')}>发布作品</CandidateButton></CandidateToolbar>
      <p>{project.scenes.length} 个场景 · {project.characters.length} 位角色 · {project.assets.length} 项素材</p></CandidateSection>
    <CandidateSection title="剧情">{project.scenes.map(scene=><CandidateButton key={scene.id} onClick={()=>onOpen(`writing:${scene.id}`)}>{scene.name} · {scene.lines.length} 句</CandidateButton>)}</CandidateSection>
    <CandidateSection title="继续任务"><CandidateToolbar label="持续任务"><CandidateButton onClick={()=>onOpen('production')}>制作</CandidateButton><CandidateButton onClick={()=>onOpen('collaboration')}>协作</CandidateButton><CandidateButton onClick={()=>onOpen('plugins')}>插件</CandidateButton></CandidateToolbar></CandidateSection>
  </section>;
}
export function CandidateAuxiliaryView({kind,onOpen}:{kind:'problems'|'output';onOpen(id:string):void}) {
  const store=useCandidate(),state=useCandidateState();
  if (kind==='output') return <section className="candidate-workface candidate-document-scroll" aria-label="任务与保存输出">
    <p>{state.ui.notice||'当前没有新输出'}</p>{state.error&&<p role="alert">{state.error}</p>}{store.tasks.production.data.tasks.map(task=><p key={task.id}>{task.id} · {task.items.map(item=>item.state).join('、')}</p>)}
  </section>;

  const issues = authoringSource(store.host.list()).scenes.flatMap(scene => {
    const draft = state.ui.sourceDrafts[scene.sceneId];
    const text = draft ?? scene.text;
    return parse({ documentId: scene.documentId, revision: scene.revision, text }).issues.map(issue => ({ scene, issue, text, isDraft: draft !== undefined }));
  });
  return <section className="candidate-workface candidate-document-scroll" aria-label="源码问题">
    {issues.length ? issues.map(({ scene, issue, text, isDraft }, index) => {
      const offset = issue.source?.range?.start ?? 0;
      const line = text.slice(0, offset).split(/\r\n?|\n/).length;
      return <div key={`${scene.documentId}:${issue.code}:${offset}:${index}`}>
        <CandidateButton onClick={() => {
          store.rememberViewState(`source-reveal:${scene.sceneId}`, { text, offset } satisfies CandidateSourceReveal);
          onOpen(`source:${scene.sceneId}`);
        }}>{scene.name} · {isDraft ? '源码草稿' : '已应用源码'} · 第 {line} 行 · {issue.message}</CandidateButton>
      </div>;
    }) : <CandidateState kind="empty" title="没有源码语法问题" description="发布检查会继续核对作品依赖和运行要求。"/>}
  </section>;
}
