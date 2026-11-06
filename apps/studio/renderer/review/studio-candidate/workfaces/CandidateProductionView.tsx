import { useCallback, useState, useSyncExternalStore } from 'react';
import { FlaskConical } from 'lucide-react';
import { Production } from '../components/production/Production.js';
import { CandidateActionMenu, CandidateButton, type CandidateMenuTarget } from '../components/controls/index.js';
import { CandidateProductionInspector } from './CandidateProductionInspector.js';
import type { CandidateSession } from '../application/session.js';
import '../styles/tasks.css';

type Props = {
  session: CandidateSession;
  documentId?: string;
  statementId?: string;
  active?: boolean;
  explorerActive?: boolean;
  inspectorActive?: boolean;
  explorerContainer?: HTMLElement;
  inspectorContainer?: HTMLElement;
  onNavigate?(documentId: string, statementId?: string): void;
  onOpen?(view: string): void;
};

export function CandidateProductionView({ session, documentId, statementId, active, explorerActive, explorerContainer, onNavigate, onOpen }: Props) {
  const tasks = session.tasks, production = tasks.production;
  const [auditMenu, setAuditMenu] = useState<CandidateMenuTarget | null>(null);
  useSyncExternalStore(production.subscribe, production.snapshot, production.snapshot);
  const pending = useCallback((dirty: boolean) => session.setViewPending('production', dirty), [session]);
  return <section className="gc-candidate-task-view gc-candidate-production-view" aria-label="制作工作面">
    <Production session={production} locale={session.controller.preferences.locale} services={tasks.productionServices}
      documentActive={active && session.getSnapshot().projectActive}
      explorerActive={explorerActive} explorerContainer={explorerContainer}
      revealDocument={() => onOpen?.('production')} onUnappliedChange={pending}
      openRecords={onOpen ? () => onOpen('production-explorer') : undefined}
      createDraft={intent => tasks.openDraft(intent, documentId, statementId)}
      reviewTools={<>
        <CandidateButton aria-haspopup="menu" aria-expanded={!!auditMenu} onClick={event => setAuditMenu({ anchor: event.currentTarget })}>
          <FlaskConical size={14}/>审核
        </CandidateButton>
        <CandidateActionMenu label="制作审核" target={auditMenu} onDismiss={() => setAuditMenu(null)} actions={[{
          id: 'fail-next', label: '下次执行失败', disabledReason: tasks.failurePending() ? '已设置一次失败' : undefined,
          run: () => tasks.failNextTask(),
        }]}/>
      </>}
      origin={<CandidateProductionInspector session={session} production={production} onOpen={onOpen} onNavigate={onNavigate}/>}
      navigate={page => onOpen?.(page)} changed={async () => { session.refreshFromHost(); }}/>
  </section>;
}
