import { FileText, Package } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import type { DocumentWorkspace } from '../../components/workbench/document-workspace.js';
import { DocumentTabs } from '../../components/workbench/WorkbenchShell.js';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EditInput, Issue, Json, PluginDocumentInstance, Result } from '@galcraft/contracts';
import { validatePluginData } from '@galcraft/plugins/contracts';
import type { DocumentContribution, PluginToolResult, StudioScope, ToolContribution } from '@galcraft/plugins/contracts';
import { Button, Choice, Field, Modal } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { validateFields } from '../../authoring/field-validation.js';
import { MessageBox } from '../../components/workbench/MessageBox.js';
import { PluginFields, fieldDefaults, fieldRecord, pluginInputsValid, type PluginReference, type PublicFieldEditor } from './plugin-fields.js';

export type AuthorDocument = PluginDocumentInstance;
export type AuthorToolEntry = { tool: ToolContribution; title: string; available: boolean; reason: string; pluginId: string };
export type AuthorDocumentEntry = { definition: DocumentContribution; title: string; pluginId: string };
export interface AuthorContributionServices {
  workspace?: DocumentWorkspace;
  tools(location: string): AuthorToolEntry[];
  documentTypes(): AuthorDocumentEntry[];
  scope(): StudioScope;
  references(): Promise<PluginReference[]>;
  translate(pluginId: string, key: string): string;
  editor(pluginId: string, contribution: string, field: string): PublicFieldEditor | undefined;
  documentContext?(document: AuthorDocument): () => void;
  documents: {
    list(entry: AuthorDocumentEntry): Promise<Result<AuthorDocument[]>>;
    create(entry: AuthorDocumentEntry, name: string): Promise<Result<void>>;
    copy(document: AuthorDocument, name: string): Promise<Result<void>>;
    remove(document: AuthorDocument): Promise<Result<void>>;
    update(document: AuthorDocument, data: Json): Promise<Result<void>>;
  };
  run(entry: AuthorToolEntry, input: Json, scope: StudioScope, signal: AbortSignal): Promise<Result<PluginToolResult | EditInput | null>>;
  apply(input: EditInput): Promise<Result<void>>;
  locate(issue: Issue): Promise<Result<void>>;
  openProduction(result: Extract<PluginToolResult, { kind: 'task' | 'candidate' }>): Promise<Result<void>>;
}
const text = (locale: string, zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
const unwrap = <T,>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
export function ToolResult({ result, services, locale, actionTarget }: { result: PluginToolResult | EditInput | null; services: AuthorContributionServices; locale: string; actionTarget?: HTMLElement | null }) {
  const [error, setError] = useState(''), [applied, setApplied] = useState(false), [busy, setBusy] = useState(false);
  const t = (zh: string, en: string, ja: string) => text(locale, zh, en, ja);
  const action = async (fn: () => Promise<Result<void>>) => { setBusy(true); setError(''); try { unwrap(await fn()); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(false); } };
  const proposal = result && ('patches' in result ? result : result.kind === 'edit' ? result.input : null);
  const applyButton = proposal && <Button tone="primary" disabled={busy || applied} onClick={() => void action(async () => { const outcome = await services.apply(proposal); if (outcome.ok) setApplied(true); return outcome; })}>{applied ? t('已应用，可撤销或保存', 'Applied; ready to undo or save', '適用済み。元に戻すか保存できます') : t('应用本次提案', 'Apply proposal', '提案を適用')}</Button>;
  return <section className="plugin-tool-result" aria-label={t('工具结果', 'Tool result', 'ツールの結果')}>
    {error && <p role="alert" className="workbench-error">{error}</p>}
    {proposal ? <><h3>{proposal.label}</h3><p>{t('核对本次改动后应用；应用后仍需统一保存。', 'Review the changes before applying, then save from the shared save action.', '変更を確認して適用し、共通の保存操作で保存してください。')}</p>
      <div className="plugin-proposal-list">{proposal.patches.map((patch, index) => <article key={index}>
        <strong>{patch.kind === 'document' ? patch.op : patch.kind === 'text' ? t('文本修改', 'Text changes', 'テキスト変更') : patch.kind === 'json' ? t('字段修改', 'Field changes', 'フィールド変更') : patch.path}</strong>
        {patch.kind === 'text' ? patch.edits.map((edit, at) => <div className="plugin-diff" key={at}><pre>{edit.before || '—'}</pre><span>→</span><pre>{edit.after || '—'}</pre></div>) : patch.kind === 'json' ? patch.changes.map((change, at) => <div key={at}><small>{change.path}</small><div className="plugin-diff"><pre>{JSON.stringify(change.before, null, 2)}</pre><span>→</span><pre>{JSON.stringify(change.after, null, 2)}</pre></div></div>) : <div className="plugin-diff"><pre>{typeof patch.before === 'string' ? patch.before : JSON.stringify(patch.before, null, 2)}</pre><span>→</span><pre>{typeof patch.after === 'string' ? patch.after : JSON.stringify(patch.after, null, 2)}</pre></div>}
        <details><summary>{t('文档与基准版本', 'Document and base revision', '文書と基準リビジョン')}</summary><code>{patch.documentId} · {proposal.expected.find(item => item.ref.id === patch.documentId)?.revision ?? 'new'}</code></details>
      </article>)}</div>{actionTarget ? createPortal(applyButton, actionTarget) : applyButton}</> : result && 'kind' in result && result.kind === 'report' ? <><p>{result.message}</p>{result.issues.map((issue, index) => <article className="plugin-issue" key={index}><p>{issue.message}</p>{(issue.source || issue.entity) && <Button disabled={busy} onClick={() => void action(() => services.locate(issue))}>{t('定位', 'Locate', '移動')}</Button>}</article>)}</> : result && 'kind' in result && (result.kind === 'task' || result.kind === 'candidate') ? <><p>{t('结果已进入制作，可查看任务和审阅候选。', 'The result is available in Production for task and candidate review.', '制作でタスクと候補を確認できます。')}</p><Button tone="primary" onClick={() => void action(() => services.openProduction(result))}>{t('打开制作结果', 'Open production result', '制作結果を開く')}</Button></> : <p>{t('工具执行完成。', 'The tool has finished.', 'ツールが完了しました。')}</p>}
  </section>;
}
export function ToolRunner({ entry, services, locale, close, inline = false, initialInput, initialScope, onDirty }: { entry: AuthorToolEntry; services: AuthorContributionServices; locale: string; close(): void; inline?: boolean; initialInput?: Record<string, Json>; initialScope?: StudioScope; onDirty?(dirty: boolean): void }) {
  const [input, setInput] = useState(() => initialInput ?? fieldDefaults(entry.tool.inputFields)), [scope] = useState(() => structuredClone(initialScope ?? services.scope()));
  const [discard, setDiscard] = useState(false);
  const [references, setReferences] = useState<PluginReference[]>([]), [error, setError] = useState(''), [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PluginToolResult | EditInput | null | undefined>(), [abort, setAbort] = useState<AbortController | null>(null), [busy, setBusy] = useState(false);
  const dirty = result === undefined && JSON.stringify(input) !== JSON.stringify(fieldDefaults(entry.tool.inputFields));
  useEffect(() => { onDirty?.(dirty || busy); }, [dirty, busy]);
  const requestClose = () => { if (busy) return; if (dirty) setDiscard(true); else close(); };
  const pin = () => {
    services.workspace?.open(`plugin-tool:${crypto.randomUUID()}`, entry.title, (done, changed) => {
      const node = document.createElement('section'), root = createRoot(node); let draftDirty = dirty;
      root.render(<ToolRunner entry={entry} services={services} locale={locale} inline initialInput={structuredClone(input)} initialScope={structuredClone(scope)} close={done} onDirty={value => { draftDirty = value; changed(); }}/>);
      return { node, dirty: () => draftDirty, dispose: () => root.unmount() };
    });
    close();
  };
  const currentRun = useRef<AbortController | null>(null);
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null);
  useEffect(() => { let alive = true; void services.references().then(value => { if (alive) setReferences(value); }).catch(e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, [services]);
  useEffect(() => () => abort?.abort(), [abort]);
  const t = (zh: string, en: string, ja: string) => text(locale, zh, en, ja);
  const run = async () => {
    const invalid = validateFields(entry.tool.inputFields, input, field => field.labelKey ? services.translate(entry.pluginId, field.labelKey) : field.label, locale);
    setErrors(Object.fromEntries(invalid.map(item => [item.path, item.message]))); if (invalid.length) return;
    if (!pluginInputsValid()) return;
    const controller = new AbortController(); currentRun.current = controller; setAbort(controller); setBusy(true); setError('');
    try { const outcome = await services.run(entry, input, scope, controller.signal); if (!controller.signal.aborted && currentRun.current === controller) setResult(unwrap(outcome)); }
    catch (e) { if (!controller.signal.aborted && currentRun.current === controller) setError(e instanceof Error ? e.message : String(e)); } finally { if (currentRun.current === controller) setBusy(false); }
  };
  const body = <>
    <p>{t('本次范围固定为打开工具时的选择；提交时检查基准版本。', 'This run uses the selection captured when the tool opened. Applying checks its base revisions.', '開いた時点の選択範囲を使用し、適用時に基準リビジョンを確認します。')}</p>
    <p className="plugin-scope-summary">{scope.statementIds.length} {t('条语句', 'statements', '文')} · {scope.assetIds.length} {t('项素材', 'assets', '素材')}</p>
    {error && <p role="alert" className="workbench-error">{error}</p>}
    <fieldset className="plugin-tool-fields" disabled={busy || result !== undefined}><PluginFields fields={entry.tool.inputFields} value={input} change={setInput} locale={locale} references={references} errors={errors} translate={key => services.translate(entry.pluginId, key)}/></fieldset>
    {result !== undefined && <ToolResult key="result" result={result} services={services} locale={locale} actionTarget={actionTarget}/>}
    <footer><Button disabled={busy} onClick={requestClose}>{t('关闭', 'Close', '閉じる')}</Button>{!inline && services.workspace && <Button disabled={busy || result !== undefined} onClick={pin}>{t("固定到工作区", "Pin to workspace", "ワークスペースに固定")}</Button>}<div className="gc-actions" ref={setActionTarget}/>{busy ? <Button onClick={() => { abort?.abort(); setBusy(false); setError(t('已停止接收本次执行结果；已有结果仍可审阅。', 'This run has stopped receiving results. Existing results remain available.', '今回の結果の受信を停止しました。既存の結果は確認できます。')); }}>{t('取消执行', 'Cancel run', '実行をキャンセル')}</Button> : result === undefined ? <Button tone="primary" onClick={() => void run()}>{t('执行工具', 'Run tool', 'ツールを実行')}</Button> : null}</footer>
    {discard && <MessageBox title={t('放弃工具参数？', 'Discard tool input?', 'ツールの入力を破棄しますか？')} description={entry.title} cancelLabel={t('继续编辑', 'Keep editing', '編集を続ける')} onClose={() => setDiscard(false)} actions={[{ label: t('放弃并关闭', 'Discard and close', '破棄して閉じる'), tone: 'danger', run: close }]}/>}
  </>;
  return inline ? <section className="plugin-tool-workspace" aria-label={entry.title}><h2>{entry.title}</h2>{body}</section> : <Modal title={entry.title} close={requestClose} wide>{body}</Modal>;
}
export function DocumentEditor({ document, entry, services, locale, done, active = true, closeRequest = 0, onDirty }: { document: AuthorDocument; entry: AuthorDocumentEntry; services: AuthorContributionServices; locale: string; done(): void; active?: boolean; closeRequest?: number; onDirty?(dirty: boolean): void }) {
  const [value, setValue] = useState(() => fieldRecord(structuredClone(document.data))), [references, setReferences] = useState<PluginReference[]>([]);
  const [error, setError] = useState(''), [errors, setErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [discard, setDiscard] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(document.data), t = (zh: string, en: string, ja: string) => text(locale, zh, en, ja);
  useEffect(() => active ? services.documentContext?.(document) : undefined, [services, document.documentId, active]);
  useEffect(() => { onDirty?.(dirty); }, [dirty]);
  useEffect(() => { let alive = true; void services.references().then(value => { if (alive) setReferences(value); }).catch(e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, [services]);
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else done(); };
  useEffect(() => { if (closeRequest) close(); }, [closeRequest]);
  return <section className="plugin-document-editor" aria-label={`${entry.title} · ${document.name}`}><header><h2>{document.name}{dirty ? ' •' : ''}</h2><Button disabled={busy} onClick={close}>{t('关闭文档', 'Close document', '文書を閉じる')}</Button></header>
    {error && <p className="workbench-error" role="alert">{error}</p>}
    <PluginFields fields={entry.definition.fields} value={value} change={setValue} locale={locale} references={references} errors={errors} translate={key => services.translate(entry.pluginId, key)} editorFor={field => services.editor(entry.pluginId, entry.definition.key, field)}/>
    {discard && <MessageBox title={t('放弃未应用的字段草稿？', 'Discard unapplied field draft?', '未適用の下書きを破棄しますか？')} description={document.name} cancelLabel={t('继续编辑', 'Keep editing', '編集を続ける')} onClose={() => setDiscard(false)} actions={[{ label: t('放弃并关闭', 'Discard and close', '破棄して閉じる'), tone: 'danger', run: done }]}/>}
    <footer><Button disabled={busy} onClick={close}>{t('取消', 'Cancel', 'キャンセル')}</Button><Button tone="primary" disabled={busy || !dirty} onClick={() => void (async () => {
      if (!pluginInputsValid()) return;
      const invalid = validateFields(entry.definition.fields, value, field => field.label, locale); setErrors(Object.fromEntries(invalid.map(item => [item.path, item.message]))); if (invalid.length) return;
      setBusy(true); setError(''); try { unwrap(validatePluginData(entry.definition.schema, value)); if (entry.definition.validate) unwrap(entry.definition.validate(value)); unwrap(await services.documents.update(document, value)); done(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    })()}>{t('应用字段修改', 'Apply field changes', 'フィールド変更を適用')}</Button></footer>
  </section>;
}
export function AuthorContributions({ services, locale, location = 'tools.list', documents = false }: { services: AuthorContributionServices; locale: string; location?: string; documents?: boolean }) {
  const t = (zh: string, en: string, ja: string) => text(locale, zh, en, ja), types = services.documentTypes(), tools = services.tools(location);
  const [active, setActive] = useState<AuthorToolEntry | null>(null), [entryKey, setEntryKey] = useState(types[0]?.definition.key ?? ''), [instances, setInstances] = useState<AuthorDocument[]>([]);
  const [editors, setEditors] = useState<{ document: AuthorDocument; entry: AuthorDocumentEntry; dirty: boolean; closeRequest: number }[]>([]), [activeEditor, setActiveEditor] = useState('');
  const [remove, setRemove] = useState<AuthorDocument | null>(null), [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const entry = types.find(item => item.definition.key === entryKey);
  const openEditor = (document: AuthorDocument, entry: AuthorDocumentEntry) => {
    if (services.workspace) {
      services.workspace.open(`plugin-document:${document.documentId}`, document.name, (done, changed) => {
        const node = window.document.createElement('section'), react = createRoot(node), snapshot = structuredClone(document); let dirty = false, active = true;
        const render = () => react.render(<DocumentEditor document={snapshot} entry={entry} services={services} locale={locale} active={active} done={() => { setRevision(value => value + 1); done(); }} onDirty={value => { dirty = value; changed(); }}/>);
        render(); return { node, dirty: () => dirty, activate: (value: boolean) => { if (active !== value) { active = value; render(); } }, dispose: () => react.unmount() };
      }); return;
    }
    setEditors(items => items.some(item => item.document.documentId === document.documentId) ? items : [...items, { document: structuredClone(document), entry, dirty: false, closeRequest: 0 }]); setActiveEditor(document.documentId);
  };

  useEffect(() => { let alive = true; if (documents && entry) void services.documents.list(entry).then(value => { if (alive) setInstances(unwrap(value)); }).catch(e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, [services, documents, entryKey, revision]);
  const action = async (fn: () => Promise<Result<void>>) => { setBusy(true); setError(''); try { unwrap(await fn()); setRevision(value => value + 1); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  if (!tools.length && (!documents || !types.length)) return null;
  return <section className="plugin-author-contributions">
    {!!editors.length && <DocumentTabs active={activeEditor || 'library'} documents={[{ id: 'library', icon: <Package size={15}/>, title: t('插件工具与文档', 'Plugin tools and documents', 'プラグインツールと文書') }, ...editors.map(item => ({ id: item.document.documentId, icon: <FileText size={15}/>, title: item.document.name, dirty: item.dirty }))]} onSelect={id => setActiveEditor(id === 'library' ? '' : id)} onPin={() => {}} onClose={id => { if (id !== 'library') setEditors(items => items.map(item => item.document.documentId === id ? { ...item, closeRequest: item.closeRequest + 1 } : item)); }}/>}
    <div hidden={!!activeEditor}>
    {error && <p className="workbench-error" role="alert">{error}</p>}
    {tools.length > 0 && <><h2>{t('插件工具', 'Plugin tools', 'プラグインツール')}</h2><div className="plugin-tools-list">{tools.map(item => <article key={item.tool.key}><div><strong>{item.title}</strong>{!item.available && <p>{item.reason}</p>}</div><Button disabled={!item.available} onClick={() => setActive(item)}>{t('打开工具', 'Open tool', 'ツールを開く')}</Button></article>)}</div></>}
    {documents && types.length > 0 && <><h2>{t('插件文档', 'Plugin documents', 'プラグイン文書')}</h2><Field label={t('文档类型', 'Document type', '文書の種類')}><Choice label={t('文档类型', 'Document type', '文書の種類')} value={entryKey} options={types.map(item => ({ value: item.definition.key, label: item.title }))} onChange={setEntryKey}/></Field>
      {entry && <><div className="plugin-document-create"><Field label={t('新文档名称', 'New document name', '新しい文書名')}><Input value={name} onChange={event => setName(event.target.value)}/></Field><Button disabled={busy || !name.trim() || entry.definition.instances === 'fixed' && instances.length > 0} onClick={() => void action(() => services.documents.create(entry, name.trim()))}>{t('创建文档', 'Create document', '文書を作成')}</Button></div>
        {!instances.length && <p>{t('此类型还没有文档。', 'There are no documents of this type yet.', 'この種類の文書はまだありません。')}</p>}
        <div className="plugin-document-list">{instances.map(item => <article key={item.documentId}><strong>{item.name}</strong><div className="gc-actions"><Button disabled={busy} onClick={() => openEditor(item, entry)}>{t('编辑', 'Edit', '編集')}</Button><Button tone="quiet" disabled={busy || entry.definition.instances === 'fixed'} onClick={() => void action(() => services.documents.copy(item, `${item.name} ${t('副本', 'copy', 'コピー')}`))}>{t('复制', 'Copy', 'コピー')}</Button><Button tone="quiet" disabled={busy} onClick={() => setRemove(item)}>{t('移除', 'Remove', '削除')}</Button></div></article>)}</div></>}
    </>}
    </div>
    {editors.map(item => <div key={item.document.documentId} hidden={activeEditor !== item.document.documentId}><DocumentEditor document={item.document} entry={item.entry} services={services} locale={locale} active={activeEditor === item.document.documentId} closeRequest={item.closeRequest} onDirty={dirty => setEditors(items => items.map(current => current.document.documentId === item.document.documentId ? { ...current, dirty } : current))} done={() => { setEditors(items => items.filter(current => current.document.documentId !== item.document.documentId)); setActiveEditor(current => current === item.document.documentId ? '' : current); setRevision(value => value + 1); }}/></div>)}
    {active && <ToolRunner entry={active} services={services} locale={locale} close={() => setActive(null)}/>}
    {remove && <MessageBox title={t('移除插件文档', 'Remove plugin document', 'プラグイン文書を削除')} description={<>{remove.name}<p>{t('应用后可通过统一撤销恢复；统一保存后写入磁盘。', 'You can undo this change before saving it to disk.', '適用後は共通の元に戻す操作で復元でき、保存でディスクに書き込みます。')}</p></>} cancelLabel={t('取消', 'Cancel', 'キャンセル')} onClose={() => setRemove(null)} actions={[{ label: t('移除此文档', 'Remove this document', 'この文書を削除'), tone: 'danger', run: async () => { unwrap(await services.documents.remove(remove)); setRevision(value => value + 1); } }]}/>}
  </section>;
}
