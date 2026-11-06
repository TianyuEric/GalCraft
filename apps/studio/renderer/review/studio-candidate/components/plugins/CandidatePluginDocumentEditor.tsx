import { useEffect, useState } from 'react';
import { validatePluginData } from '@galcraft/plugins/contracts';
import type { Result } from '@galcraft/contracts';
import type { AuthorContributionServices, AuthorDocument, AuthorDocumentEntry } from '../../../../pages/Plugins/author-contributions.js';
import { validateFields } from '../../../../authoring/field-validation.js';
import { fieldRecord, type PluginReference } from '../../../../pages/Plugins/plugin-fields.js';
import { CandidateButton, CandidateReviewDialog, CandidateSection, CandidateState, CandidateToolbar } from '../controls/index.js';
import { CandidatePluginFields } from './CandidatePluginFields.js';

const unwrap = <T,>(result: Result<T>) => { if (!result.ok) throw new Error(result.error.message); return result.value; };

export function CandidatePluginDocumentEditor({ document, entry, services, locale, active, done, onDirty }: {
  document: AuthorDocument;
  entry: AuthorDocumentEntry;
  services: AuthorContributionServices;
  locale: string;
  active: boolean;
  done(): void;
  onDirty(value: boolean): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [value, setValue] = useState(() => fieldRecord(structuredClone(document.data)));
  const [references, setReferences] = useState<PluginReference[]>([]);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [invalidDrafts, setInvalidDrafts] = useState<ReadonlySet<string>>(() => new Set());
  const dirty = invalidDrafts.size > 0 || JSON.stringify(value) !== JSON.stringify(document.data);
  useEffect(() => active ? services.documentContext?.(document) : undefined, [active, document, services]);
  useEffect(() => { onDirty(dirty || busy); }, [dirty, busy]);
  useEffect(() => {
    let active = true;
    void services.references().then(references => { if (active) setReferences(references); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [services]);
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else done(); };
  const apply = async () => {
    if (!dirty || busy || invalidDrafts.size) return;
    const invalid = validateFields(entry.definition.fields, value, field => field.labelKey ? services.translate(entry.pluginId, field.labelKey) : field.label, locale);
    setErrors(Object.fromEntries(invalid.map(issue => [issue.path, issue.message])));
    if (invalid.length) return;
    setBusy(true);
    setError('');
    try {
      unwrap(validatePluginData(entry.definition.schema, value));
      if (entry.definition.validate) unwrap(entry.definition.validate(value));
      unwrap(await services.documents.update(document, value));
      done();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  return <section className="candidate-plugin-document-editor" aria-label={`${entry.title} · ${document.name}`}>
    <CandidateSection title={document.name} actions={<CandidateButton disabled={busy} onClick={close}>{t('关闭文档', 'Close document', '文書を閉じる')}</CandidateButton>}>
      {error && <CandidateState kind="error" title={error}/>}
      <form onSubmit={event => { event.preventDefault(); void apply(); }}>
        <fieldset disabled={busy} className="candidate-plugin-document-fields">
          <CandidatePluginFields fields={entry.definition.fields} value={value} change={setValue} locale={locale} references={references} errors={errors}
            translate={key => services.translate(entry.pluginId, key)} editorFor={field => services.editor(entry.pluginId, entry.definition.key, field)}
            onInvalidDraft={(id, invalid) => setInvalidDrafts(current => {
              if (current.has(id) === invalid) return current;
              const next = new Set(current);
              if (invalid) next.add(id); else next.delete(id);
              return next;
            })}/>
        </fieldset>
        <CandidateToolbar label={t('文档编辑操作', 'Document editing actions', '文書の編集操作')}>
          <CandidateButton disabled={busy} onClick={close}>{t('取消', 'Cancel', 'キャンセル')}</CandidateButton>
          <CandidateButton type="submit" variant="primary" disabled={busy || !dirty}>{t('应用字段修改', 'Apply field changes', 'フィールド変更を適用')}</CandidateButton>
        </CandidateToolbar>
      </form>
    </CandidateSection>
    <CandidateReviewDialog open={active && discard} title={t('放弃未应用的字段草稿？', 'Discard unapplied field draft?', '未適用の下書きを破棄しますか？')}
      description={document.name} onDismiss={() => setDiscard(false)} actions={<>
        <CandidateButton onClick={() => setDiscard(false)}>{t('继续编辑', 'Keep editing', '編集を続ける')}</CandidateButton>
        <CandidateButton variant="danger" onClick={done}>{t('放弃并关闭', 'Discard and close', '破棄して閉じる')}</CandidateButton>
      </>}/>
  </section>;
}
