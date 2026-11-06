import { CandidateButton, CandidateIconButton, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { useLayoutEffect, useRef } from 'react';
import { FileText, RotateCcw } from 'lucide-react';
import { useCandidate, useCandidateState } from '../application/context.js';
import { mountCandidateScriptEditor, type CandidateSourceReveal } from '../adapters/script-editor.js';

export function CandidateSourceView({ sceneId, onOpen }: { sceneId: string; onOpen(view: string): void }) {
  const store = useCandidate(), state = useCandidateState(), host = useRef<HTMLDivElement>(null);
  const editor = useRef<ReturnType<typeof mountCandidateScriptEditor> | null>(null);
  const scene = store.sceneSource(sceneId), draft = state.ui.sourceDrafts[sceneId];
  const error = state.ui.sourceErrors[sceneId] ?? (scene && store.validateSource(sceneId, draft ?? scene.text));
  const sceneAvailable = Boolean(scene);
  const view = `source:${sceneId}`, revealKey = `source-reveal:${sceneId}`;
  const reveal = store.viewState<CandidateSourceReveal>(revealKey);
  const readScene = () => store.sceneSource(sceneId);
  const input = () => ({ container: host.current!, scene: store.sceneSource(sceneId)!, engineVersion: '0.1.0', wordWrap: store.controller.preferences.editor.wordWrap, fontSize: store.controller.preferences.editor.fontSize, fontFamily: store.controller.preferences.editor.fontFamily,
    selectedId: store.commandSelection(sceneId), documentOffset: 0, scroll: { statementId: null, offsetPx: 0, scrollLeft: 0 }, references: store.controller.source?.references??[], variables: store.controller.source?.variables??[], locale: 'zh-CN',
    onCaret: (id: string | null, _offset: number) => { if (id && store.getSnapshot().activeView === `source:${sceneId}`) { if(store.getSnapshot().project.scenes.find(scene=>scene.id===sceneId)?.lines.some(line=>line.id===id))store.selectLine(sceneId,id);else store.selectCommand(sceneId,id); } },
    onScroll: () => {}, readScene, onDraft: (text: string | null) => store.sourceDraft(sceneId, text), onCommit: (text: string) => store.commitSource(sceneId, text) });
  useLayoutEffect(() => {
    if (!host.current || !sceneAvailable) return;
    const mounted = mountCandidateScriptEditor({ ...input(), initialText: store.getSnapshot().ui.sourceDrafts[sceneId], viewState: store.sourcePosition(sceneId) });
    editor.current = mounted;
    const unregister = store.registerEditor(sceneId, mounted.flush);
    return () => {
      unregister();
      store.rememberSource(sceneId, mounted.saveViewState());
      mounted.dispose();
      editor.current = null;
    };
  }, [store, sceneId, sceneAvailable]);
  useLayoutEffect(() => { if (editor.current && scene) editor.current.update(input()); }, [store, sceneId, scene?.revision, scene?.text, store.commandSelection(sceneId), store.controller.preferences]);
  useLayoutEffect(() => {
    if (!reveal || !sceneAvailable || state.activeView !== view) return;
    // The dock restores ordinary tab focus on the next frame; apply the requested editor focus after it.
    const frame = requestAnimationFrame(() => {
      if (store.getSnapshot().activeView !== view || store.viewState(revealKey) !== reveal) return;
      store.rememberViewState(revealKey, undefined);
      editor.current?.reveal(reveal);
    });
    return () => cancelAnimationFrame(frame);
  }, [store, sceneAvailable, state.activeView, view, revealKey, reveal]);
  if (!scene) return <CandidateState kind="empty" title="场景已关闭"/>;
  return <section className="candidate-source" aria-label={`${scene.name} 源码工作面`}>
    <CandidateToolbar className="candidate-source-tools" label="源码工具">
      <CandidateButton onClick={() => onOpen(`writing:${sceneId}`)}><FileText size={14}/>返回文稿</CandidateButton>
      <span>.gal</span>
      <div className="candidate-source-actions">
        <CandidateIconButton label="还原未应用修改" disabled={draft === undefined} onClick={() => void editor.current?.restore()}><RotateCcw size={14}/></CandidateIconButton>
        <CandidateButton variant="secondary" onClick={() => void editor.current?.flush()}>应用源码</CandidateButton>
      </div>
    </CandidateToolbar>
    <div ref={host} className="candidate-monaco"/>
    <footer role={error ? 'alert' : 'status'}>{error ? `${draft !== undefined ? '原文草稿可保存' : '已保留原文，图形模式只读'}：${error}` : draft !== undefined ? '原文草稿 · 保存时应用' : '已与文稿同步'}</footer>
  </section>;
}
