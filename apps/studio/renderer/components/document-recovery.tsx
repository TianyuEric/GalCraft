import { useState } from 'react';
import type { FileConflict, Result } from '@galcraft/contracts';
import { Button, Choice, Field } from './controls.js';
import { Input } from './ui/input.js';
import { CodeBlock } from './code-block.js';
import { requestDialog } from './request-dialog.js';
import './document-recovery.css';

export type ConflictChoice = 'local' | 'disk' | 'copy';
const text = (locale: string, zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
export function ConflictReview({ conflicts, locale, chooseDirectory, onChange }: {
  conflicts: FileConflict[]; locale: string; chooseDirectory(): Promise<Result<string | null>>;
  onChange(choice: ConflictChoice, path: string): void;
}) {
  const [choice, setChoice] = useState<ConflictChoice>('copy'), [path, setPath] = useState(''), [error, setError] = useState('');
  const t = (zh: string, en: string, ja: string) => text(locale, zh, en, ja);
  return <div className="document-recovery">
    <Field label={t('处理方式', 'Resolution', '解決方法')}><Choice label={t('处理方式', 'Resolution', '解決方法')} value={choice} onChange={value => { setChoice(value as ConflictChoice); onChange(value as ConflictChoice, path); }} options={[
      { value: 'copy', label: t('另存副本，保留两份内容', 'Save a copy, keep both versions', 'コピーを保存して両方保持') },
      { value: 'local', label: t('保留工作内容', 'Keep working content', '作業内容を保持') },
      { value: 'disk', label: t('使用磁盘版本', 'Use disk version', 'ディスクの内容を使用') },
    ]}/></Field>
    <p>{choice === 'copy' ? t('副本包含工作内容。原作品保留磁盘内容，副本目录必须尚不存在。', 'The copy includes your working content. The original keeps its disk content. Use a new directory.', 'コピーに作業内容を保存します。元の作品はディスクの内容を保持します。新しいフォルダーを指定してください。') : choice === 'local' ? t('冲突文件将使用工作内容。确认前请展开下方对比，检查磁盘上的外部修改。', 'Conflicting files will use your working content. Review external disk changes below before confirming.', '競合ファイルに作業内容を使用します。確定前に下の比較で外部変更を確認してください。') : t('冲突文件的工作内容将被磁盘版本替换；其他未保存内容继续保留。', 'Disk versions replace working content in conflicting files. Other unsaved content is kept.', '競合ファイルの作業内容をディスクの内容で置き換えます。他の未保存内容は保持します。')}</p>
    {choice === 'copy' && <div className="document-recovery-path"><Field label={t('新副本完整目录', 'New copy directory', '新しいコピーのフォルダー')} required><Input value={path} onChange={event => { setPath(event.target.value); onChange(choice, event.target.value); }}/></Field><Button onClick={async () => { try { const result = await chooseDirectory(); if (!result.ok) throw new Error(result.error.message); if (result.value) { const next = result.value.replace(/[\\/]$/, '') + '/恢复副本'; setPath(next); onChange(choice, next); } setError(''); } catch (reason) { setError(String(reason)); } }}>{t('选择父目录', 'Choose parent folder', '親フォルダーを選択')}</Button></div>}
    {error && <p role="alert">{error}</p>}
    <ul className="document-recovery-files">{conflicts.map(file => <li key={file.path}><details><summary>{file.path}</summary>{(['base', 'local', 'disk'] as const).map(version => <section key={version}><h3>{version === 'base' ? t('上次保存', 'Last saved', '前回の保存') : version === 'local' ? t('工作内容', 'Working content', '作業内容') : t('当前磁盘', 'Current disk', '現在のディスク')}</h3>{file[version] === null ? <p>{t('文件不存在', 'File does not exist', 'ファイルが存在しません')}</p> : <CodeBlock code={file[version]} language={file.path.endsWith('.json') ? 'json' : 'text'} locale={locale}/>}</section>)}</details></li>)}</ul>
  </div>;
}

export async function reviewFileConflicts(options: {
  locale: string; conflicts: FileConflict[]; chooseDirectory(): Promise<Result<string | null>>;
  resolve(choice: ConflictChoice, path?: string): Promise<Result<unknown>>;
  refresh(): Promise<Result<FileConflict[]>>;
}): Promise<ConflictChoice | null> {
  let choice: ConflictChoice = 'copy', path = '', confirmedChoice: ConflictChoice | null = null, refreshView: ((rows: FileConflict[]) => void) | undefined, resolvingChanged: ((busy: boolean) => void) | undefined;
  function Content() { const [rows, setRows] = useState(options.conflicts), [resolving, setResolving] = useState(false); refreshView = setRows; resolvingChanged = setResolving; return <fieldset className="document-recovery-controls" disabled={resolving} aria-busy={resolving}><ConflictReview conflicts={rows} locale={options.locale} chooseDirectory={options.chooseDirectory} onChange={(next, directory) => { choice = next; path = directory; }}/></fieldset>; }
  const result = await requestDialog({ locale: options.locale, title: text(options.locale, '处理文件冲突', 'Resolve file conflicts', 'ファイルの競合を解決'), review: true,
    description: text(options.locale, '磁盘文件已发生变化。请选择如何保留本次工作。', 'Files changed on disk. Choose how to preserve your work.', 'ディスクのファイルが変更されました。作業内容の保存方法を選択してください。'),
    content: <Content/>, confirmLabel: text(options.locale, '应用所选处理', 'Apply resolution', '選択した処理を適用'), confirm: async () => {
      if (choice === 'copy' && !path.trim()) throw new Error(text(options.locale, '请选择新副本目录', 'Choose a new copy directory', '新しいコピーのフォルダーを選択してください'));
      const selectedChoice = choice, selectedPath = path.trim();
      resolvingChanged?.(true);
      try {
      const resolved = await options.resolve(selectedChoice, selectedChoice === 'copy' ? selectedPath : undefined);
      if (!resolved.ok) {
        if (['CONFLICT_STALE', 'RECOVERY_CONFLICT_STALE'].includes(resolved.error.code)) { const latest = await options.refresh(); if (latest.ok) refreshView?.(latest.value); throw new Error(text(options.locale, '磁盘内容再次变化，已更新对比。请重新检查后确认。', 'Disk content changed again. Review the updated comparison and confirm again.', 'ディスクの内容が再度変更されました。更新された比較を確認して再度確定してください。')); }
        throw new Error(resolved.error.message);
      }
      confirmedChoice = selectedChoice;
      } finally { resolvingChanged?.(false); }
    } });
  return result === null ? null : confirmedChoice;
}
