import { useCallback, useState } from 'react';
import { Send } from 'lucide-react';
import { parse } from '@galcraft/dsl';
import type { CollaborationSession } from '@galcraft/collaboration/contracts';
import { CollaborationCandidate } from '../components/CollaborationCandidate.js';
import { CandidateButton, CandidateField, CandidateInput, CandidateToolbar } from '../components/controls/index.js';
import type { CandidateSession } from '../application/session.js';
import '../styles/support.css';

type Props = {
  session: CandidateSession;
  documentId?: string;
  statementId?: string;
  active?: boolean;
  onOpen?: (id: string) => void;
  onNavigate?: (documentId: string, statementId?: string) => void;
};

export function CandidateCollaborationView({ session, documentId, statementId, active = true }: Props) {
  const pending = useCallback((dirty: boolean) => session.setViewPending('collaboration', dirty), [session]);
  const tasks = session.tasks;
  const context = tasks.scope(documentId, statementId);
  const source = context.sceneId ? session.sceneSource(context.sceneId) : undefined;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [handoffVersion, setHandoffVersion] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const t = (zh: string, en: string, ja: string) => session.controller.preferences.locale === 'en' ? en : session.controller.preferences.locale === 'ja' ? ja : zh;
  const reportError = (cause: unknown) => setFeedback({ ok: false, message: cause instanceof Error ? cause.message : String(cause) });

  function renderAudit(round: CollaborationSession) {
    const handed = round.target?.source;
    const sceneId = session.controller.source?.scenes.find(scene => scene.documentId === handed?.documentId)?.sceneId;
    const scene = sceneId ? session.sceneSource(sceneId) : undefined;
    const command = scene && parse(scene).cst.find(node => node.id === handed?.statementId);
    const disabledReason = !scene || !handed?.statementId || command?.command !== 'say'
      ? t('请明确交接一条对白。', 'Hand off a dialogue statement first.', '先に台詞を引き継いでください。')
      : session.sourceReadOnly(scene.sceneId) ? t('请先修复目标场景源码。', 'Fix the target scene source first.', '先に対象シーンのソースを修正してください。') : undefined;
    return <details className="candidate-support-audit">
      <summary>{t('运行审核调用', 'Run a review call', 'レビュー呼び出しを実行')}</summary>
      <form onSubmit={event => {
        event.preventDefault();
        if (busy || disabledReason || !scene || !handed?.statementId || !text.trim()) return;
        setBusy(true);
        setFeedback(null);
        void tasks.invokeCollaborationEdit({ documentId: scene.documentId, revision: scene.revision, statementId: handed.statementId, text }, round.id)
          .then(result => {
            setFeedback({ ok: result.ok, message: result.ok ? t('对白已修改，回执已加入调用记录。', 'Dialogue updated. The receipt is in the call history.', '台詞を更新しました。結果は呼び出し履歴にあります。') : result.error.message });
            if (result.ok) setText('');
          }).catch(reportError).finally(() => setBusy(false));
      }}>
        <CandidateField label={t('协作替换对白', 'Replacement dialogue', '置き換える台詞')}>
          <CandidateInput value={text} onChange={event => setText(event.target.value)} />
        </CandidateField>
        <CandidateButton type="submit" variant="primary" disabled={busy || !text.trim()} disabledReason={disabledReason}>
          <Send size={14} aria-hidden="true" />{t('提交审核调用', 'Submit review call', 'レビュー呼び出しを送信')}
        </CandidateButton>
      </form>
    </details>;
  }

  return <section className="candidate-support-view candidate-collaboration-view" aria-label={t('协作工作面', 'Collaboration workspace', '連携ワークスペース')}>
    <CandidateToolbar label={t('交接对象', 'Handoff target', '引き継ぎ対象')} className="candidate-support-toolbar">
      <CandidateButton variant="outline" disabled={busy} disabledReason={!source ? t('请选择一个场景。', 'Select a scene.', 'シーンを選択してください。') : undefined} onClick={() => {
        if (!source || busy) return;
        setBusy(true);
        void tasks.handoff(source.documentId, context.statementId ?? undefined).then(() => {
          setHandoffVersion(version => version + 1);
          setFeedback({ ok: true, message: t('已交接给当前协作', 'Handed off to collaboration', '現在の連携に引き継ぎました') + ' · ' + source.name });
        }).catch(reportError).finally(() => setBusy(false));
      }}>{t('交给当前协作', 'Hand off to collaboration', '現在の連携に引き継ぐ')}</CandidateButton>
      {source && <span className="candidate-support-meta">{source.name}</span>}
    </CandidateToolbar>
    {feedback && <p className="candidate-support-feedback" role={feedback.ok ? 'status' : 'alert'}>{feedback.message}</p>}
    <CollaborationCandidate onUnappliedChange={pending} preferences={tasks.collaborationPreferences} bridge={tasks.collaboration}
      locale={session.controller.preferences.locale} active={active && session.getSnapshot().projectActive} refreshVersion={handoffVersion} renderAudit={renderAudit} targetStatement={source => {
        const scene = session.getSnapshot().project.scenes.find(scene => session.documentId(scene.id) === source.documentId);
        const position = scene?.lines.findIndex(line => line.id === source.statementId) ?? -1;
        return position < 0 ? undefined : t(`第 ${position + 1} 句`, `Statement ${position + 1}`, `第 ${position + 1} 文`);
      }} />
  </section>;
}
