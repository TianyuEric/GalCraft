import { CandidateButton, CandidateSection, CandidateToolbar } from '../components/controls/index.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ListOrdered } from 'lucide-react';
import type { Issue } from '@galcraft/contracts';
import { MiniStage } from '../../../authoring/mini-stage.js';
import { mountCandidateMiniStageControls } from '../components/CandidateMiniStage.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { commandSource, previewPosition, previewVersion, watchCommandVisibility } from '../adapters/command-preview.js';
import '../styles/commands.css';

export function CandidateCommandStageView({ sceneId, sourceStatementId, onOpen }: { sceneId: string; sourceStatementId?: string; onOpen?: (viewId: string) => void }) {
  const session = useCandidate(), { ui, projectActive } = useCandidateState();
  const container = useRef<HTMLDivElement>(null), stage = useRef<MiniStage | null>(null);
  const scene = session.sceneSource(sceneId);
  const statements = useMemo(() => scene ? commandSource(scene).cst : [], [scene?.documentId, scene?.revision, scene?.text]);
  const selection = sourceStatementId ?? session.commandSelection(sceneId);
  const statementId = statements.find(node => node.valid && node.id && (selection === null || node.id === selection))?.id ?? null;
  const ordinal = statementId ? statements.findIndex(node => node.id === statementId) + 1 : 0;
  const pending = ui.sourceDrafts[sceneId] !== undefined && ui.sourceDrafts[sceneId] !== scene?.text;
  const draftMessage = ui.sourceErrors[sceneId]
    ? `请先修复源码草稿。 ${ui.sourceErrors[sceneId]}`
    : pending ? '源码草稿尚未应用。应用后更新舞台。'
    : selection && !statementId ? '来源指令已失效。请定位指令列表并选择新的来源。' : undefined;
  const target = previewPosition(scene, statementId, draftMessage);
  const documents = session.host.list();
  const path = Object.keys(documents.find(document => document.documentId === scene?.documentId)?.files ?? {}).find(name => name.endsWith('.gal'));
  const key = previewVersion(documents, target, draftMessage);
  const [visible, setVisible] = useState(false);
  const running = visible && projectActive;
  const playtestKey = `command-stage-playtest:${sceneId}`;
  const playtestRequest = session.viewState<number>(playtestKey);
  const activeKey = useRef<string | null>(null);
  activeKey.current = running ? key : null;
  const [diagnostics, setDiagnostics] = useState<{ key: string; issues: Issue[] } | null>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let alive = true;
    const unwatch = watchCommandVisibility(node, setVisible);
    const services = session.services;
    const instance = new MiniStage({ ...services,
      compilePreview: services.compilePreview && (async (saved) => {
        const requested = activeKey.current;
        const compiled = await services.compilePreview!(saved, session.host.list());
        if (alive && requested && requested === activeKey.current) setDiagnostics({ key: requested, issues: compiled.ok ? compiled.value.issues : compiled.issues });
        return compiled;
      }),
    }, snapshot => {
      const { width, height } = snapshot.project.canvas;
      node.style.setProperty('--command-stage-ratio', String(width / height));
    });
    stage.current = instance;
    const releaseControls = mountCandidateMiniStageControls(instance);
    node.append(instance.root);
    const chrome = Array.from(instance.root.children).filter(element => !element.classList.contains('studio-mini-player'));
    const resize = new ResizeObserver(() => {
      const insets = getComputedStyle(node);
      const occupied = chrome.reduce((height, element) => {
        if (!element.getClientRects().length) return height;
        const style = getComputedStyle(element);
        return height + element.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }, parseFloat(insets.paddingTop) + parseFloat(insets.paddingBottom));
      node.style.setProperty('--command-stage-room', `${Math.max(72, node.clientHeight - occupied)}px`);
    });
    resize.observe(node);
    chrome.forEach(element => resize.observe(element));
    return () => {
      alive = false;
      unwatch();
      resize.disconnect();
      stage.current = null;
      releaseControls();
      instance.update('closed', null);
      instance.root.remove();
      queueMicrotask(() => instance.dispose());
    };
  }, [session]);

  useEffect(() => {
    stage.current?.update(running ? key : 'hidden', running ? target : null, draftMessage);
  }, [session, key, running]);

  useEffect(() => {
    if (!running || playtestRequest === undefined || session.viewState(playtestKey) !== playtestRequest) return;
    session.rememberViewState(playtestKey, undefined);
    if (!target) return;
    stage.current?.run('playtest');
  }, [session, key, running, playtestKey, playtestRequest]);

  const issues = diagnostics?.key === key ? diagnostics.issues : [];
  return <section className="gc-candidate-command-stage" aria-label="指令运行舞台">
    <CandidateToolbar className="gc-candidate-command-bar" label="运行舞台来源">
      <div className="gc-candidate-command-stage-source" title={path}>
        <strong>{scene?.name ?? '场景已关闭'}</strong>
        <span>{ordinal ? `第 ${ordinal} 条指令` : selection ? '来源指令已失效' : '暂无指令来源'}</span>
      </div>
      {scene && <CandidateButton type="button" onClick={() => {
        if (statementId) session.selectCommand(sceneId, statementId);
        onOpen?.(`commands:${sceneId}`);
      }}><ListOrdered size={16}/>定位指令</CandidateButton>}
    </CandidateToolbar>
    <div ref={container} className="gc-candidate-command-player"/>
    {issues.length > 0 && <CandidateSection className="gc-candidate-command-diagnostics" title={`编译诊断 · ${issues.length}`} collapsible initiallyOpen={false}>
      <ul>{issues.map((issue, index) => <li key={index}><code>{issue.code}</code> {issue.message}</li>)}</ul>
    </CandidateSection>}
  </section>;
}
