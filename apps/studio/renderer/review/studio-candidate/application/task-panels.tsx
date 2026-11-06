import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCandidate, useCandidateState } from './context.js';
import { CandidateProductionView } from '../workfaces/CandidateProductionView.js';
import { CandidateCollaborationView } from '../workfaces/CandidateCollaborationView.js';

const ids = ['production', 'production-explorer', 'collaboration'] as const;
export type TaskPanelId = typeof ids[number];
type Panels = { nodes: Record<TaskPanelId, HTMLDivElement>; visible: Set<TaskPanelId>; mounted: Set<TaskPanelId>; open(id:string):void; attach(id: TaskPanelId, root: HTMLElement): () => void };
const Context = createContext<Panels | null>(null);

/** DOM holders are stable for the life of this project. Moving a tab moves its holder,
 * never creates a second task controller or resets its draft and selection. */
export function CandidateTaskPanelsProvider({ children, onOpen, onNavigate }: { children: ReactNode; onOpen(id: string): void; onNavigate(documentId: string, statementId?: string): void }) {
  const session = useCandidate(), state = useCandidateState();
  useEffect(()=>session.tasks.attachNavigator(target=>{if(target.documentId)onNavigate(target.documentId,target.statementId);else onOpen(target.page);}),[session,onNavigate,onOpen]);
  const [nodes] = useState(() => Object.fromEntries(ids.map(id => { const node = document.createElement('div'); node.className = `candidate-task-outlet ${id}`; return [id, node]; })) as Record<TaskPanelId, HTMLDivElement>);
  const [visible, setVisible] = useState<Set<TaskPanelId>>(() => new Set()), [mounted, setMounted] = useState<Set<TaskPanelId>>(() => new Set());
  const attach = (id: TaskPanelId, root: HTMLElement) => {
    root.append(nodes[id]);
    setMounted(old => old.has(id) ? old : new Set(old).add(id));
    const read = () => setVisible(old => { const shown = root.isConnected && !root.closest('[hidden]'); if (old.has(id) === shown) return old; const next = new Set(old); shown ? next.add(id) : next.delete(id); return next; });
    const observer = new MutationObserver(read);
    for (let element: HTMLElement | null = root; element; element = element.parentElement) observer.observe(element, { attributes: true, attributeFilter: ['hidden'] });
    read();
    return () => { observer.disconnect(); nodes[id].remove(); setVisible(old => { const next = new Set(old); next.delete(id); return next; }); };
  };
  const active = (id: TaskPanelId) => state.projectActive && visible.has(id);
  const target = { documentId: session.documentId(state.ui.sceneId), statementId: session.editingStatement() ?? undefined };
  return <Context value={{ nodes, visible, mounted, attach, open:onOpen }}>{children}
    {ids.some(id => id.startsWith('production') && mounted.has(id)) && createPortal(<CandidateProductionView session={session} {...target} onOpen={onOpen} onNavigate={onNavigate} active={active('production')} explorerActive={active('production-explorer')} explorerContainer={nodes['production-explorer']}/>, nodes.production)}
    {mounted.has('collaboration') && createPortal(<CandidateCollaborationView session={session} {...target} onNavigate={onNavigate} onOpen={onOpen} active={active('collaboration')}/>, nodes.collaboration)}
  </Context>;
}

export function CandidateTaskPanel({ viewId }: { viewId: TaskPanelId }) {
  const panels = useContext(Context)!, root = useRef<HTMLDivElement>(null);
  const attach = useRef(panels.attach); attach.current = panels.attach;
  const open = useRef(panels.open); open.current = panels.open;
  useLayoutEffect(() => {
    const element=root.current; if(!element)return;
    const release=attach.current(viewId,element);
    return release;
  }, [viewId]);
  return <div ref={root} className="candidate-task-panel"/>;
}
