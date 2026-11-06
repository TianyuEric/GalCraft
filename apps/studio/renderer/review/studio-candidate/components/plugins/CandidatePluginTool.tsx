import { useEffect, useRef, useState } from 'react';
import type { EditInput, Json, Result } from '@galcraft/contracts';
import type { PluginToolResult, StudioScope } from '@galcraft/plugins/contracts';
import type { AuthorContributionServices, AuthorToolEntry } from '../../../../pages/Plugins/author-contributions.js';
import { validateFields } from '../../../../authoring/field-validation.js';
import { fieldDefaults, type PluginReference } from '../../../../pages/Plugins/plugin-fields.js';
import { CandidateButton, CandidateReviewDialog, CandidateSection, CandidateState, CandidateToolbar } from '../controls/index.js';
import { CandidatePluginFields } from './CandidatePluginFields.js';

type Draft = Record<string, Json>;
type Output = PluginToolResult | EditInput | null;
const unwrap = <T,>(result: Result<T>) => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const reason = (error: unknown) => error instanceof Error ? error.message : String(error);

function CandidatePluginToolResult({ value, services, locale }: { value: Output; services: AuthorContributionServices; locale: string }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const proposal = value && ('patches' in value ? value : value.kind === 'edit' ? value.input : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const run = async (action: () => Promise<Result<void>>, done?: () => void) => {
    setBusy(true);
    setError('');
    try { unwrap(await action()); done?.(); }
    catch (error) { setError(reason(error)); }
    finally { setBusy(false); }
  };
  const diff = (before: Json | undefined, after: Json | undefined) => <div className="candidate-plugin-diff">
    <pre tabIndex={0}>{typeof before === 'string' ? before : JSON.stringify(before, null, 2) ?? '—'}</pre>
    <pre tabIndex={0}>{typeof after === 'string' ? after : JSON.stringify(after, null, 2) ?? '—'}</pre>
  </div>;

  return <CandidateSection title={t('工具结果', 'Tool result', 'ツールの結果')} className="candidate-plugin-tool-result">
    {error && <CandidateState kind="error" title={error}/>}
    {proposal ? <>
      <p>{proposal.label}</p>
      <p>{t('核对本次改动后应用，再从作品保存入口保存。', 'Review and apply these changes, then save the project.', '変更を確認して適用し、作品を保存してください。')}</p>
      {proposal.patches.map((patch, index) => <CandidateSection key={index} title={patch.kind === 'document' ? patch.op : patch.kind === 'text'
        ? t('文本修改', 'Text changes', 'テキスト変更') : patch.kind === 'json' ? t('字段修改', 'Field changes', 'フィールド変更') : patch.path}>
        {patch.kind === 'text' ? patch.edits.map((edit, at) => <div key={at}>{diff(edit.before, edit.after)}</div>) :
          patch.kind === 'json' ? patch.changes.map((change, at) => <div key={at}><small>{change.path}</small>{diff(change.before, change.after)}</div>) : diff(patch.before, patch.after)}
        <p><code>{patch.documentId} · {proposal.expected.find(item => item.ref.id === patch.documentId)?.revision ?? 'new'}</code></p>
      </CandidateSection>)}
      <CandidateButton variant="primary" disabled={busy || applied} onClick={() => void run(() => services.apply(proposal), () => setApplied(true))}>
        {applied ? t('已应用，可撤销或保存', 'Applied; ready to undo or save', '適用済み。元に戻すか保存できます') : t('应用本次提案', 'Apply proposal', '提案を適用')}
      </CandidateButton>
    </> : value && 'kind' in value && value.kind === 'report' ? <>
      <p>{value.message}</p>
      {value.issues.map((issue, index) => <div className="candidate-plugin-contribution" key={index}>
        <span>{issue.message}</span>{(issue.source || issue.entity) && <CandidateButton disabled={busy} onClick={() => void run(() => services.locate(issue))}>{t('定位', 'Locate', '移動')}</CandidateButton>}
      </div>)}
    </> : value && 'kind' in value && (value.kind === 'task' || value.kind === 'candidate') ? <>
      <p>{t('结果已进入制作。', 'The result is available in Production.', '結果は制作で確認できます。')}</p>
      <CandidateButton variant="primary" disabled={busy} onClick={() => void run(() => services.openProduction(value))}>{t('打开制作结果', 'Open production result', '制作結果を開く')}</CandidateButton>
    </> : <p>{t('工具执行完成。', 'The tool has finished.', 'ツールが完了しました。')}</p>}
  </CandidateSection>;
}

export function CandidatePluginTool({ entry, services, locale, scope, initialInput, inline = false, active = true, portal, onClose, onPin, onDirty }: {
  entry: AuthorToolEntry;
  services: AuthorContributionServices;
  locale: string;
  scope: StudioScope;
  initialInput?: Draft;
  inline?: boolean;
  active?: boolean;
  portal?: HTMLElement | null;
  onClose(): void;
  onPin?(input: Draft): void;
  onDirty?(dirty: boolean): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [defaults] = useState(() => fieldDefaults(entry.tool.inputFields));
  const [input, setInput] = useState(() => initialInput ?? defaults);
  const [references, setReferences] = useState<PluginReference[]>([]);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Output>();
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [invalidDrafts, setInvalidDrafts] = useState<ReadonlySet<string>>(() => new Set());
  const controller = useRef<AbortController>(null);
  const dirty = result === undefined && (invalidDrafts.size > 0 || JSON.stringify(input) !== JSON.stringify(defaults));
  useEffect(() => { onDirty?.(dirty || busy); }, [dirty, busy]);
  useEffect(() => {
    let mounted = true;
    void services.references().then(value => { if (mounted) setReferences(value); })
      .catch(error => { if (mounted) setError(reason(error)); });
    return () => { mounted = false; controller.current?.abort(); };
  }, [services]);
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else onClose(); };
  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError(t('已停止接收本次执行结果。已有结果仍可审阅。', 'This run has stopped receiving results. Existing results remain available.', '今回の結果の受信を停止しました。既存の結果は確認できます。'));
  };
  const translate = (key: string) => services.translate(entry.pluginId, key);
  const run = async () => {
    if (controller.current || invalidDrafts.size || result !== undefined) return;
    const invalid = validateFields(entry.tool.inputFields, input, field => field.labelKey ? translate(field.labelKey) : field.label, locale);
    setErrors(Object.fromEntries(invalid.map(issue => [issue.path, issue.message])));
    if (invalid.length) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError('');
    try {
      const outcome = unwrap(await services.run(entry, input, scope, current.signal));
      if (!current.signal.aborted) setResult(outcome);
    } catch (error) {
      if (!current.signal.aborted) setError(reason(error));
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
      }
    }
  };

  const body = <form className="candidate-plugin-tool-form" onSubmit={event => { event.preventDefault(); void run(); }}>
    <p>{t('工具使用打开时的对象与选择。应用时检查基准版本。', 'The tool uses the objects and selection captured when it opened. Applying checks the base revisions.', '開いた時点の対象と選択を使います。適用時に基準リビジョンを確認します。')}</p>
    <p className="candidate-plugin-tool-summary">{scope.statementIds.length} {t('条语句', 'statements', '文')} · {scope.assetIds.length} {t('项素材', 'assets', '素材')}</p>
    {error && <CandidateState kind="error" title={error}/>}
    {result === undefined ? <fieldset className="candidate-plugin-document-fields" disabled={busy}>
      <CandidatePluginFields fields={entry.tool.inputFields} value={input} change={setInput} locale={locale} references={references} errors={errors} translate={translate}
        onInvalidDraft={(id, invalid) => setInvalidDrafts(current => {
          if (current.has(id) === invalid) return current;
          const next = new Set(current);
          if (invalid) next.add(id); else next.delete(id);
          return next;
        })}/>
    </fieldset> : <CandidatePluginToolResult value={result} services={services} locale={locale}/>}
    <CandidateToolbar label={t('工具操作', 'Tool actions', 'ツールの操作')}>
      <CandidateButton disabled={busy} onClick={close}>{t('关闭', 'Close', '閉じる')}</CandidateButton>
      {onPin && <CandidateButton disabled={busy || result !== undefined}
        disabledReason={invalidDrafts.size ? t('请先修复结构化参数', 'Fix structured inputs first', '構造化された入力を修正してください') : undefined}
        onClick={() => onPin(structuredClone(input))}>{t('固定到工作区', 'Pin to workspace', 'ワークスペースに固定')}</CandidateButton>}
      {busy ? <CandidateButton key="cancel" onClick={event => { event.preventDefault(); cancel(); }}>{t('取消执行', 'Cancel run', '実行をキャンセル')}</CandidateButton> : result === undefined &&
        <CandidateButton key="execute" type="submit" variant="primary">{t('执行工具', 'Run tool', 'ツールを実行')}</CandidateButton>}
    </CandidateToolbar>
  </form>;
  return <>
    {inline ? <section aria-label={entry.title} className="candidate-plugin-document-editor">
      <CandidateSection title={entry.title}>{body}</CandidateSection>
    </section> : <CandidateReviewDialog open={active} portal={portal} title={entry.title} busy={busy} onDismiss={close}>
      {body}
    </CandidateReviewDialog>}
    <CandidateReviewDialog open={active && discard} portal={portal} title={t('放弃工具参数？', 'Discard tool input?', 'ツールの入力を破棄しますか？')} description={entry.title}
      onDismiss={() => setDiscard(false)} actions={<>
        <CandidateButton onClick={() => setDiscard(false)}>{t('继续编辑', 'Keep editing', '編集を続ける')}</CandidateButton>
        <CandidateButton variant="danger" onClick={onClose}>{t('放弃并关闭', 'Discard and close', '破棄して閉じる')}</CandidateButton>
      </>}/>
  </>;
}
