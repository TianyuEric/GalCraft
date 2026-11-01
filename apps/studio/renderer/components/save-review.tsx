import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DiscardPlan, DocumentView, EditReceipt, Id, SaveObject, SaveObjectRef, SavePlan, SaveScope, StudioBridge } from '@galcraft/contracts';
import { Button, Modal } from './controls.js';
import { SaveChangeList } from './change-list.js';
import { buildSaveChanges, changedValues, type SaveChangeGroup } from './save-changes.js';
import './save-changes.css';

type ReviewScope = Exclude<SaveScope, { kind: 'objects' }>;
type Props = {
  initialPlan: SavePlan; initialDocuments: DocumentView[]; initialObjects?: SaveObject[]; scope: ReviewScope;
  locale: string; names?: Record<string, string>; bridge: StudioBridge['documents'];
  save(plan: SavePlan): Promise<void>; changed(receipt: EditReceipt, documentId: Id): Promise<void>;
  close(): void; pin?(plan: SavePlan, documents: DocumentView[], objects: SaveObject[]): void; dialog?: boolean;
};
const identity = (object: SaveObject): SaveObjectRef => object.kind === 'asset'
  ? { documentId: object.documentId, kind: 'asset', objectId: object.objectId! }
  : { documentId: object.documentId, kind: 'document', objectId: null };
const filesFor = (documents: readonly DocumentView[]) => documents.flatMap(document => [...new Set([...Object.keys(document.files), ...Object.keys(document.savedFiles)])]
  .map(path => ({ path, documentId: document.documentId, oldExists: path in document.savedFiles, newExists: path in document.files })));

function objectChanges(object: SaveObject, documents: DocumentView[], names: Record<string, string>, locale: string): SaveChangeGroup[] {
  const document = documents.find(document => document.documentId === object.documentId);
  if (!document) return [];
  if (object.kind === 'document') return buildSaveChanges(filesFor([document]), [document], names, locale);
  const asset = (files: Record<string, string>) => files['assets/index.json'] ? JSON.parse(files['assets/index.json']).data.assets.find((asset: { id: Id }) => asset.id === object.objectId) : undefined;
  const before = asset(document.savedFiles), after = asset(document.files);
  return [{ documentId: object.documentId, name: object.name, paths: object.paths, changes: [{
    kind: before === undefined ? 'add' : after === undefined ? 'delete' : 'update', label: object.name,
    fields: changedValues(before ?? {}, after ?? {}),
  }] }];
}

export function SaveReview(props: Props) {
  const { locale, bridge, names = {} } = props;
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [plan, setPlan] = useState(props.initialPlan), [documents, setDocuments] = useState(props.initialDocuments);
  const [pool, setPool] = useState(props.initialObjects ?? props.initialPlan.objects), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [notice, setNotice] = useState(''), [stale, setStale] = useState(false), [discard, setDiscard] = useState<DiscardPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastDiscard, setLastDiscard] = useState<{ documentId: Id; operationId: Id } | null>(null);
  const unwrap = <T,>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
  const replan = async (requested: Set<string>, source = documents, objects = pool) => unwrap(await bridge.planSave({ kind: 'objects',
    objects: objects.filter(object => requested.has(object.key)).map(identity), expected: source.map(document => ({ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision })) }));
  const refresh = async () => {
    const source = unwrap(await bridge.list()), fresh = unwrap(await bridge.planSave(props.scope));
    const requested = new Set(plan.requestedObjects.filter(key => fresh.objects.some(object => object.key === key)));
    const next = await replan(requested, source, fresh.objects);
    setDocuments(source); setPool(fresh.objects); setPlan(next); setStale(false);
  };
  const run = async (action: () => Promise<void>, refreshOnFailure = false, savingOperation = false) => {
    if (busy) return; setBusy(true); setSaving(savingOperation); setError('');
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); if (refreshOnFailure) setStale(true); }
    finally { setBusy(false); setSaving(false); }
  };
  const select = (key: string, checked: boolean) => run(async () => {
    const requested = new Set(plan.requestedObjects);
    if (checked) requested.add(key); else requested.delete(key);
    let next = await replan(requested);
    if (!checked && next.objects.some(object => object.key === key)) {
      const removed = new Set([key]);
      let changed = true;
      while (changed) { changed = false; for (const reason of next.reasons) if (removed.has(reason.objectKey) && !removed.has(reason.requiredBy)) { removed.add(reason.requiredBy); changed = true; } }
      for (const removedKey of removed) requested.delete(removedKey);
      next = await replan(requested);
      setNotice(t('已同时取消依赖此项的对象。', 'Objects that require this item were also deselected.', 'この項目を必要とする対象も選択解除しました。'));
    } else setNotice('');
    setPlan(next);
  }, true);
  const reviewDiscard = (objects: SaveObject[]) => run(async () => {
    if (!bridge.planDiscard) throw new Error(t('放弃服务尚未就绪', 'Discard is unavailable', '破棄サービスは準備中です'));
    const result = await bridge.planDiscard({ documentId: objects[0]!.documentId, objects: objects.map(identity), expected: documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })) });
    setDiscard(unwrap(result));
  });
  const selected = new Set(plan.objects.map(object => object.key));
  const linked = plan.objects.filter(object => !plan.requestedObjects.includes(object.key)).length;
  const body = discard ? <>
    <p>{t('确认后立即恢复以下对象的最近保存内容。一次撤销可恢复本次丢弃的工作。', 'Confirm to restore the saved content below immediately. Undo restores all work discarded by this action.', '確認すると次の対象を保存済みの内容に戻します。元に戻す操作で今回破棄した作業を復元できます。')}</p>
    {!!discard.reasons?.length && <div className="save-object-reason" role="status"><p>{t('必要关联扩大了丢弃范围，请审阅以下对象与原因。', 'Required dependencies expand this discard. Review the objects and reasons below.', '必要な関連により破棄範囲が広がりました。対象と理由を確認してください。')}</p><ul>{discard.reasons.map(reason => { const object = discard.objects?.find(item => item.key === reason.objectKey); return <li key={reason.objectKey}>{object ? names[object.documentId] ?? object.name : reason.objectKey} · {reason.kind === 'reference' ? t('引用完整性', 'reference integrity', '参照の整合性') : t('恢复关联', 'recovered association', '復元した関連')}</li>; })}</ul></div>}
    <SaveChangeList files={filesFor(discard.preview)} documents={discard.preview} locale={locale} names={names} context="discard"/>
  </> : <>
    <p className="save-review-help">{t('勾选用于保存，同一对象的字段一起保存。未勾选的修改继续保留；丢弃需点击“丢弃”并单独确认。', 'Check objects to save all their fields together. Unchecked changes stay in your workspace. To discard changes, choose Discard and confirm separately.', 'チェックした対象の項目をまとめて保存します。未選択の変更は保持します。破棄するには「破棄」を選び、別途確認してください。')}</p>
    <div className="save-review-selection"><strong aria-live="polite">{t(`已选 ${plan.objects.length} / ${pool.length} 个对象`, `${plan.objects.length} of ${pool.length} objects selected`, `${pool.length} 件中 ${plan.objects.length} 件を選択`)}{linked ? t(` · ${linked} 项联动`, ` · ${linked} required`, ` · ${linked} 件の関連対象`) : ''}</strong>
      <Button tone="quiet" disabled={busy || stale || !pool.length} onClick={() => void run(async () => { setPlan(await replan(new Set(pool.map(object => object.key)))); setNotice(''); }, true)}>{t('全选', 'Select all', 'すべて選択')}</Button>
      <Button tone="quiet" disabled={busy || stale || !plan.objects.length} onClick={() => void run(async () => { setPlan(await replan(new Set())); setNotice(''); }, true)}>{t('全不选', 'Deselect all', 'すべて解除')}</Button>
      <Button tone="quiet" disabled={busy || stale || !plan.objects.length} onClick={() => void reviewDiscard(plan.objects)}>{t(`丢弃已选择（${plan.objects.length}）`, `Discard selected (${plan.objects.length})`, `選択した変更を破棄（${plan.objects.length}）`)}</Button>
    </div>
    {!pool.length && <p>{t('当前范围的修改均已处理。', 'All changes in this scope have been handled.', 'この範囲の変更はすべて処理済みです。')}</p>}
    <ul className="save-object-list">{pool.map(object => {
      const name = object.kind === 'asset' ? object.name : names[object.documentId] ?? object.name;
      const reasons = plan.reasons.filter(reason => reason.objectKey === object.key && !plan.requestedObjects.includes(object.key));
      return <li key={object.key} className="save-object-row" data-selected={selected.has(object.key)}>
        <div className="save-object-heading"><label><input type="checkbox" checked={selected.has(object.key)} disabled={busy || stale} onChange={event => void select(object.key, event.target.checked)} aria-label={t(`保存 ${name}`, `Save ${name}`, `${name}を保存`)}/><strong>{name}</strong></label>
          <Button tone="quiet" disabled={busy || stale} onClick={() => void reviewDiscard([object])}>{t('丢弃此项修改', 'Discard these changes', 'この変更を破棄')}</Button></div>
        {!!reasons.length && <p className="save-object-reason">{t('联动：', 'Required: ', '関連：')}{reasons.map(reason => {
          const source = pool.find(object => object.key === reason.requiredBy);
          return `${source ? names[source.documentId] ?? source.name : ''} · ${reason.kind === 'reference' ? t('引用完整性', 'reference integrity', '参照の整合性') : t('同一关联编辑', 'associated edit', '関連する編集')}`;
        }).join('；')}</p>}
        <details className="save-object-details"><summary>{t('查看修改与文件位置', 'Changes and file locations', '変更とファイルの場所')}</summary><SaveChangeList files={[]} groups={objectChanges(object, documents, names, locale)} locale={locale}/></details>
      </li>;
    })}</ul>
  </>;
  const footer = <footer className="dialog-actions save-review-actions">
    {discard ? <><Button disabled={busy} onClick={() => setDiscard(null)}>{t('返回保存审阅', 'Back to save review', '保存レビューに戻る')}</Button><Button tone="danger" disabled={busy} onClick={() => void run(async () => {
      if (!bridge.applyDiscard) throw new Error(t('放弃服务尚未就绪', 'Discard is unavailable', '破棄サービスは準備中です'));
      const receipt = unwrap(await bridge.applyDiscard(discard.planId)); await props.changed(receipt, discard.scope.documentId);
      setLastDiscard({ documentId: discard.scope.documentId, operationId: receipt.operationId }); setDiscard(null); await refresh();
      setNotice(t('丢弃已生效，可通过“撤销丢弃”恢复。保存按钮仅保存剩余勾选的对象；关闭审阅会保留本次丢弃结果。', 'Changes discarded; Undo discard restores them. Save applies only to the remaining checked objects. Closing this review keeps the discard result.', '破棄を適用しました。「破棄を元に戻す」で復元できます。保存は残りの選択対象に適用され、レビューを閉じても破棄結果を保持します。'));
    }, true)}>{busy ? t('正在丢弃…', 'Discarding…', '破棄中…') : t('确认丢弃修改', 'Confirm discard', '変更の破棄を確認')}</Button></> : <>
      {lastDiscard && <Button disabled={busy} onClick={() => void run(async () => {
        const undo = unwrap(await bridge.planUndo(lastDiscard.documentId, lastDiscard.operationId));
        const receipt = unwrap(await bridge.undo(undo.planId)); await props.changed(receipt, lastDiscard.documentId); setLastDiscard(null); await refresh();
        setNotice(t('已恢复被丢弃的修改。', 'Discarded changes restored.', '破棄した変更を復元しました。'));
      }, true)}>{t('撤销丢弃', 'Undo discard', '破棄を元に戻す')}</Button>}
      {props.pin && <Button disabled={busy} onClick={() => props.pin!(plan, documents, pool)}>{t('固定到工作区', 'Pin to workspace', '作業領域に固定')}</Button>}
      <Button tone={!pool.length ? 'primary' : undefined} disabled={busy} onClick={props.close}>{lastDiscard ? t('关闭审阅', 'Close review', 'レビューを閉じる') : t('取消', 'Cancel', 'キャンセル')}</Button>
      {!!pool.length && <Button tone="primary" disabled={busy || stale || !plan.objects.length} onClick={() => void run(async () => { await props.save(plan); props.close(); }, true, true)}>{saving ? t('正在保存…', 'Saving…', '保存中…') : t(`保存 ${plan.objects.length} 个对象`, `Save ${plan.objects.length} objects`, `${plan.objects.length} 件を保存`)}</Button>}
    </>}
  </footer>;
  const feedback = <>{notice && <p role="status" className="save-review-notice">{notice}</p>}{error && <p role="alert" className="workbench-error">{error}</p>}{stale && <Button disabled={busy} onClick={() => void run(refresh)}>{t('刷新修改范围', 'Refresh changes', '変更範囲を更新')}</Button>}</>;
  const title = discard ? t('丢弃对象修改', 'Discard object changes', '対象の変更を破棄') : t('保存审阅', 'Save review', '保存レビュー');
  return props.dialog ? <Modal title={title} className="gc-save-review save-object-review" close={() => { if (!busy) props.close(); }}>{body}{feedback}{footer}</Modal>
    : <section className="save-object-review save-review-workspace">{body}{feedback}{footer}</section>;
}

export function requestSaveReview(options: Omit<Props, 'close' | 'dialog' | 'pin'> & { pin?(plan: SavePlan, documents: DocumentView[], objects: SaveObject[]): void }): Promise<void> {
  const node = document.createElement('div'), origin = document.activeElement as HTMLElement | null;
  (document.getElementById('studio-portals') ?? document.body).append(node);
  const root = createRoot(node);
  return new Promise(resolve => {
    const close = () => { root.unmount(); node.remove(); if (origin?.isConnected) origin.focus(); resolve(); };
    root.render(<SaveReview {...options} dialog close={close} pin={options.pin ? (plan, documents, objects) => { close(); options.pin!(plan, documents, objects); } : undefined}/>);
  });
}
