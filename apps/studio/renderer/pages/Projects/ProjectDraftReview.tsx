import { useId, useMemo, useState } from 'react';
import type { DocumentView, Json } from '@galcraft/contracts';
import type { StudioLocale } from '../../authoring/controller.js';
import { CodeBlock } from '../../components/code-block.js';
import '../../components/controls.css';
import '../../components/document-recovery.css';
import './project-draft-review.css';

type DraftDocument = {
  documentId: string;
  baseRevision: number;
  workingRevision: number;
  files: Record<string, string>;
  baseFiles: Record<string, string>;
};
type CompareRow = { document: DraftDocument; path: string; before: string | null; pending: string | null; disk: string | null; savedRevision?: number };

function DraftFile({ row, locale }: { row: CompareRow; locale: StudioLocale }) {
  const { document, path, before, pending, disk, savedRevision } = row;
  const [expanded, setExpanded] = useState(false);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const show = (label: string, content: string | null) => <div className="project-draft-version">
    <h3>{label}</h3>
    {content === null ? <p>{t('该版本中没有此文件。', 'This version has no file at this path.', 'このバージョンにこのファイルはありません。')}</p>
      : <CodeBlock code={content} language={path.split('.').pop() ?? 'text'} locale={locale}/>}
  </div>;
  return <li><details onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><strong>{path}</strong><small>{before !== disk
      ? t('已保存内容已变化', 'Saved content changed', '保存済みの内容が変更されました')
      : before === null ? t('草稿新增', 'Added in draft', '草稿で追加')
      : pending === null ? t('草稿删除', 'Removed in draft', '草稿で削除')
      : t('草稿修改', 'Changed in draft', '草稿で変更')}</small></summary>
    {expanded && <div className="project-draft-versions">
      {show(t('当前已保存', 'Currently saved', '現在の保存済み') + (savedRevision === undefined ? '' : ` · r${savedRevision}`), disk)}
      {show(t('保留的草稿', 'Retained draft', '保持した草稿') + ` · r${document.workingRevision}`, pending)}
      {before !== disk && show(t('草稿的原始版本', 'Draft baseline', '草稿の基準') + ` · r${document.baseRevision}`, before)}
    </div>}
  </details></li>;
}

export function ProjectDraftReview({ locale, saved, draft, onChoice }: {
  locale: StudioLocale;
  saved: readonly DocumentView[];
  draft: Json;
  onChoice(choice: 'restore' | 'discard'): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const name = useId();
  const [choice, setChoice] = useState<'restore' | 'discard'>('restore');
  const payload = draft as { savedAt?: string; documents?: DraftDocument[] } | null;
  const rows = useMemo(() => {
    const savedByPath = new Map(saved.flatMap(document => Object.entries(document.savedFiles).map(([path, content]) =>
      [path, { content, revision: document.savedRevision }] as const)));
    return (payload?.documents ?? []).flatMap(document => {
      const files = document.files ?? {}, baseFiles = document.baseFiles ?? {};
      return [...new Set([...Object.keys(baseFiles), ...Object.keys(files)])].flatMap(path => {
        const before = baseFiles[path] ?? null, pending = files[path] ?? null;
        const current = savedByPath.get(path), disk = current?.content ?? null;
        if (before === pending && before === disk) return [];
        return [{ document, path, before, pending, disk, savedRevision: current?.revision }];
      });
    });
  }, [payload, saved]);
  const choose = (next: typeof choice) => { setChoice(next); onChoice(next); };
  return <div className="document-recovery project-draft-review">
    {payload?.savedAt && <p><time dateTime={payload.savedAt}>{new Date(payload.savedAt).toLocaleString(locale)}</time></p>}
    <ul className="document-recovery-files">
      {rows.map(row => <DraftFile key={`${row.document.documentId}/${row.path}`} row={row} locale={locale}/>)}
    </ul>
    <fieldset className="project-draft-choices">
      <legend>{t('处理草稿', 'Draft action', '草稿の処理')}</legend>
      <label><input type="radio" name={name} checked={choice === 'restore'} onChange={() => choose('restore')}/>{t('恢复草稿', 'Restore draft', '草稿を復元')}</label>
      <label><input type="radio" name={name} checked={choice === 'discard'} onChange={() => choose('discard')}/>{t('放弃草稿，使用已保存内容', 'Discard draft and use saved content', '草稿を破棄して保存済みの内容を使用')}</label>
    </fieldset>
  </div>;
}
