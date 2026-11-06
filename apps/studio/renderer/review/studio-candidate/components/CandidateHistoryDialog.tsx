import { useRef } from 'react';
import type { UndoPlan } from '@galcraft/contracts';
import { CandidateButton, CandidateReviewDialog } from './controls/index.js';

export function CandidateHistoryDialog({plan,onConfirm}:{plan:UndoPlan;onConfirm:(accepted:boolean)=>void}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return <CandidateReviewDialog open title="此操作涉及关联修改" description="这些事务共享文档，需要一起撤销或重做。取消会保留当前作品。"
    initialFocus={cancel} onDismiss={() => onConfirm(false)} actions={<>
      <CandidateButton ref={cancel} variant="secondary" density="standard" onClick={() => onConfirm(false)}>取消历史操作</CandidateButton>
      <CandidateButton variant="primary" density="standard" onClick={() => onConfirm(true)}>确认关联操作</CandidateButton>
    </>}>
    <ul>{plan.operations?.map(operation=><li key={operation.operationId}>{operation.label}</li>)}</ul>
    <p>涉及 {plan.members.length} 份文档。</p>
  </CandidateReviewDialog>;
}
