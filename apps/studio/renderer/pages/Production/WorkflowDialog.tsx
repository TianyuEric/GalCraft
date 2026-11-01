import { useEffect, useRef, useState } from 'react';
import type { WorkflowBinding } from '@galcraft/authoring/production';
import { createId, type ProductionOperationSnapshot } from '@galcraft/contracts';
import { Button, Modal } from '../../components/controls.js';
import { WorkflowEditor } from './WorkflowEditor.js';
import { MessageBox } from '../../components/workbench/MessageBox.js';
import { readWorkflow, type WorkflowDraft } from './workflow-model.js';
import { workflowDiagnostics, workflowOperationDiagnostics } from '@galcraft/generation-services/validation';

export function WorkflowDialog({ initialText, initialImportText, initialBaseline = initialText, initialPaste = '', locale, save, saveDraft, availableRevision, existingWorkflows = [], onIdentityChange, operations = [], outputConnections, discoverOutputs, close, inline = false, onState, closeRequest = 0, chooseImport }: {
  initialText: string; locale: string; save(workflow: WorkflowBinding): Promise<WorkflowBinding | void>; close(): void; inline?: boolean;
  saveDraft?(workflow: WorkflowDraft, paste: string): Promise<void>; availableRevision?: number | null;
  existingWorkflows?: WorkflowBinding[]; operations?: ProductionOperationSnapshot[]; onIdentityChange?(expectedRevision: number | null): void;
  outputConnections?: Parameters<typeof WorkflowEditor>[0]['outputConnections']; discoverOutputs?: Parameters<typeof WorkflowEditor>[0]['discoverOutputs'];
  initialImportText?: string; initialBaseline?: string; initialPaste?: string;
  onState?(state: { text: string; baseline: string; paste: string; dirty: boolean; title: string }): void; closeRequest?: number;
  chooseImport?(): Promise<{ path: string; text: string } | null>;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [text, setText] = useState(initialText), [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [baseline, setBaseline] = useState(initialBaseline), [paste, setPaste] = useState(initialPaste);
  const [pasteBaseline, setPasteBaseline] = useState(initialPaste);
  const [saved, setSaved] = useState(''), [attempted, setAttempted] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ workflow: WorkflowDraft; full: boolean; existing?: WorkflowBinding } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const dirty = text !== baseline || paste !== pasteBaseline;
  let name = t('未命名工作流', 'Untitled workflow', '無題ワークフロー'); try { name = JSON.parse(text).name || name; } catch { /* Keep the editable invalid JSON. */ }
  useEffect(() => onState?.({ text, baseline, paste, dirty, title: name }), [text, baseline, paste, dirty, name]);
  const requestClose = () => { if (!busy) { if (dirty) setConfirm(true); else close(); } };
  useEffect(() => { if (closeRequest) requestClose(); }, [closeRequest]);
  const saveText = async () => {
    JSON.parse(text);
    const binding = readWorkflow(text);
    if (!binding) throw new Error(t('请修正工作流 API 图及输入、输出映射。', 'Correct the workflow API graph and input/output mappings.', 'API グラフと入出力の設定を修正してください。'));
    if (!binding.purpose) throw new Error(t('请选择工作流的实际用途。', 'Choose the actual workflow purpose.', 'ワークフローの実際の用途を選択してください。'));
    const operation = operations.find(operation => operation.id === binding.operation);
    if (workflowDiagnostics(binding).length || operation && workflowOperationDiagnostics(binding, operation).length) throw new Error(t('请按配置摘要修正标出的字段，或保存配置草稿后继续。', 'Correct the fields in the configuration summary, or save a draft to continue later.', '設定概要の項目を修正するか、下書きを保存してください。'));
    if (binding.operation && !operations.some(operation => operation.id === binding.operation)) throw new Error(t('所选操作契约当前不可取得。请启用原插件，或保存配置草稿后继续。', 'The selected operation contract is unavailable. Enable its plugin or save a configuration draft.', '操作の契約が利用できません。プラグインを有効にするか下書きを保存してください。'));
    const result = await save({ ...binding, purpose: binding.purpose }); const next = result ? JSON.stringify(result, null, 2) : text;
    setText(next); setBaseline(next); setPaste(''); setSaved(t('可用配置已更新；网络与真实生成状态分别检查。', 'Available configuration updated. Network and real generation are checked separately.', '利用可能な設定を更新しました。接続と実際の生成は別に確認します。'));
  };
  const commit = async (draftOnly = false) => {
    if (busy) return;
    setBusy(true); setError(''); setAttempted(!draftOnly);
    try { if (draftOnly && saveDraft) { const binding = readWorkflow(text); if (!binding) throw new Error(t('请先修正配置 JSON 的数据结构；未完成映射可以保留。', 'Correct the configuration JSON structure. Incomplete mappings can be kept.', '設定 JSON の構造を修正してください。未完成の設定は保持できます。')); await saveDraft(binding, paste); setBaseline(text); setPasteBaseline(paste); setSaved(t('配置草稿已保存，可跨作品继续编辑；当前可用配置保持原版本。', 'Configuration draft saved for reuse across projects. The available version is retained.', '設定下書きを保存しました。他の作品でも編集でき、利用可能な版は保持されます。')); } else { await saveText(); if (!inline) close(); } }
    catch (error) { setError(String(error).replace(/^Error: /, '')); setConfirm(false); }
    finally { setBusy(false); }
  };
  const applyImport = (workflow: WorkflowDraft, expectedRevision?: number | null) => { setText(JSON.stringify(workflow, null, 2)); setSaved(''); if (expectedRevision !== undefined) onIdentityChange?.(expectedRevision); setPendingImport(null); setPaste(''); };
  const imported = (workflow: WorkflowDraft, full: boolean) => {
    const existing = full ? existingWorkflows.find(item => item.id === workflow.id) : undefined;
    if (existing || dirty && Object.keys(readWorkflow(text)?.apiGraph ?? {}).length) setPendingImport({ workflow, full, existing });
    else applyImport(full ? { ...workflow, revision: 0 } : workflow, full ? null : undefined);
  };
  const title = t('ComfyUI 执行图与映射', 'ComfyUI graph and mapping', 'ComfyUI グラフとマッピング');
  const content = <>
      {error && <p className="field-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      <p role="status" className="field-help">{availableRevision ? t(`当前可用版本 ${availableRevision}；保存草稿只保留编辑，更新可用配置后才用于后续制作。`, `Available revision ${availableRevision}. Saving a draft keeps edits; updating the available configuration changes future production.`, `利用可能な版 ${availableRevision}。下書き保存は編集のみを保持し、設定更新後に次の制作へ反映します。`) : t('尚无可用配置。可先保存配置草稿，完成映射后再保存为可用。', 'No available configuration yet. Save a draft now and make it available after completing mappings.', '利用可能な設定はありません。下書きを保存し、設定完了後に利用可能にします。')}</p>
      <fieldset disabled={busy} className="workflow-edit-fields"><WorkflowEditor text={text} change={value => { setText(value); setSaved(''); }} importDraft={paste} onImportDraftChange={setPaste} locale={locale} expanded={expanded} onExpand={() => setExpanded(!expanded)} chooseImport={chooseImport} operations={operations} outputConnections={outputConnections} discoverOutputs={discoverOutputs} attempted={attempted} initialImportText={initialImportText} onImported={imported}/></fieldset>
      <div className="dialog-actions"><span role="status">{saved || (dirty ? t('有未保存修改', 'Unsaved changes', '未保存の変更') : t('当前编辑已保存', 'Current edits saved', '現在の編集は保存済み'))}</span><Button disabled={busy} onClick={requestClose}>{t('关闭', 'Close', '閉じる')}</Button>{saveDraft && <Button disabled={busy} onClick={() => void commit(true)}>{t('保存配置草稿', 'Save configuration draft', '設定下書きを保存')}</Button>}<Button tone="primary" disabled={busy} onClick={() => void commit()}>{busy ? t('正在保存…', 'Saving…', '保存中…') : availableRevision ? t('更新可用配置', 'Update available configuration', '利用可能な設定を更新') : t('保存为可用', 'Make available', '利用可能にする')}</Button></div>
    </>;
  return <>
    {inline ? <section className="persistent-workflow-editor workflow-configuration-document"><header><h2>{name}</h2><small>{title}</small></header>{content}</section> : <Modal title={title} size={expanded ? 'full' : 'wide'} className="workflow-dialog" close={requestClose}>{content}</Modal>}
    {confirm && <MessageBox title={t('保存工作流修改？', 'Save workflow changes?', 'ワークフローの変更を保存しますか？')}
      description={`${name} · ${t('本次输入、输出与工作流设置尚未保存。', 'Your input, output and workflow settings have not been saved.', '入力・出力・ワークフローの変更は未保存です。')}`}
      cancelLabel={t('继续编辑', 'Keep editing', '編集を続ける')} onClose={() => setConfirm(false)} actions={[
        { label: t('放弃修改', 'Discard changes', '変更を破棄'), tone: 'danger', run: close },
        { label: t('保存并关闭', 'Save & close', '保存して閉じる'), tone: 'primary', run: async () => { await saveText(); close(); } },
      ]}/>}
    {pendingImport && <MessageBox title={pendingImport.existing ? t('本机已有相同身份的工作流', 'A workflow with this identity exists', '同じ ID の設定が存在します') : t('替换当前编辑内容？', 'Replace current edits?', '現在の編集を置き換えますか？')}
      description={pendingImport.existing ? <><p>{`${pendingImport.existing.name} · ${t('本机修订', 'Local revision', 'ローカル版')} ${pendingImport.existing.revision} · ${t('导入来源修订', 'Imported source revision', '読込元の版')} ${pendingImport.workflow.revision}`}</p><p>{t('文件修订号不决定覆盖权限。另存副本会生成新身份。', 'The file revision does not authorize an overwrite. A copy gets a new identity.', 'ファイルの版は上書きの根拠になりません。コピーは新しい ID を使います。')}</p><p>{t('本机当前配置', 'Current local configuration', '現在のローカル設定')}：{pendingImport.existing.operation ?? pendingImport.existing.purpose} · {Object.keys(pendingImport.existing.apiGraph).length} {t('个节点', 'nodes', 'ノード')} · {pendingImport.existing.inputs.length} {t('项输入绑定', 'input mappings', '入力設定')} · {pendingImport.existing.outputs.map(output => `${output.nodeId}.${output.key}`).join(', ')}</p><p>{t('导入配置', 'Imported configuration', '読込設定')}：{pendingImport.workflow.name} · {pendingImport.workflow.operation ?? pendingImport.workflow.purpose} · {Object.keys(pendingImport.workflow.apiGraph).length} {t('个节点', 'nodes', 'ノード')} · {pendingImport.workflow.inputs.length} {t('项输入绑定', 'input mappings', '入力設定')}</p></> : t('替换会更改当前编辑副本。选择继续编辑可保留当前内容。', 'Replacement changes this editing copy. Keep editing to retain current content.', '置換は現在の編集内容を変更します。編集を続けると内容を保持します。')}
      cancelLabel={t('取消并保留内容', 'Cancel and keep content', 'キャンセルして保持')} onClose={() => setPendingImport(null)} actions={pendingImport.existing ? [
        { label: t('明确更新已有配置', 'Update existing configuration', '既存設定を更新'), run: () => applyImport({ ...pendingImport.workflow, revision: pendingImport.existing!.revision }, pendingImport.existing!.revision) },
        { label: t('另存副本', 'Save as a copy', 'コピーとして保存'), tone: 'primary', run: () => applyImport({ ...pendingImport.workflow, id: createId(existingWorkflows), revision: 0 }, null) },
      ] : [{ label: t('替换当前图', 'Replace current graph', '現在のグラフを置換'), tone: 'primary', run: () => applyImport(pendingImport.full ? { ...pendingImport.workflow, revision: 0 } : pendingImport.workflow, pendingImport.full ? null : undefined) }]}/>}
  </>;
}
