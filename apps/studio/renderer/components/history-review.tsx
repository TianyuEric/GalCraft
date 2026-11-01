import { createRoot } from 'react-dom/client';
import type { DocumentView, UndoPlan } from '@galcraft/contracts';
import { designerPageName } from '../authoring/designer-labels.js';
import { MessageBox } from './workbench/MessageBox.js';

export function requestHistoryReview(plan: UndoPlan, documents: DocumentView[], locale: string): Promise<boolean> {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const name = (id: string) => {
    const document = documents.find(item => item.documentId === id);
    if (!document) return id;
    const path = Object.keys(document.files).find(path => path.endsWith('.json'));
    const data = path ? JSON.parse(document.files[path]!).data : null;
    return data?.name ?? (data?.key ? designerPageName(data.key, locale) : null) ?? path ?? t('已移除文档', 'Removed document', '削除した文書');
  };
  const host = document.createElement('div'); (document.getElementById('studio-portals') ?? document.body).append(host);
  const root = createRoot(host);
  return new Promise(resolve => {
    let accepted = false;
    const close = () => { root.unmount(); host.remove(); resolve(accepted); };
    root.render(<MessageBox title={t('审阅关联编辑', 'Review related edits', '関連する編集を確認')} cancelLabel={t('取消', 'Cancel', 'キャンセル')}
      description={<><p>{t('本次历史操作将一起处理以下关联内容。', 'This history action includes the related content below.', '今回の履歴操作では次の関連内容も変更します。')}</p><ul>{(plan.operations ?? [{ operationId: plan.requestedOperationId, label: plan.label, members: plan.members }]).map(operation => <li key={operation.operationId}>{operation.label} · {operation.members.map(name).join('、')}</li>)}</ul></>}
      actions={[{ label: t('确认范围并继续', 'Confirm scope and continue', '範囲を確認して続行'), tone: 'primary', run: () => { accepted = true; } }]} onClose={close}/>);
  });
}
