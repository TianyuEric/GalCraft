import type { ReactNode } from 'react';

export type ConflictField = { path: string; label: string; baseline: unknown; current: unknown; input: unknown };

export function FieldConflictReview({ fields, locale, children }: { fields: ConflictField[]; locale: string; children: ReactNode }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const display = (value: unknown) => value === undefined ? t('未设置', 'Not set', '未設定') : value === '' ? t('（空文字）', '(empty text)', '（空の文字列）') : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const columns = [['baseline', t('原依据', 'Original basis', '元の内容')], ['current', t('工作区当前值', 'Current workspace value', '現在の作業内容')], ['input', t('我的输入（尚未应用）', 'My input (not applied)', '自分の入力（未適用）')]] as const;
  return <section className="authoring-field-conflicts" aria-label={t('审阅冲突字段', 'Review conflicting fields', '競合する項目を確認')}>
    <h3>{t('选择要应用的冲突内容', 'Choose which conflicting values to apply', '採用する競合内容を選択')}</h3>
    {fields.map(field => <section key={field.path} className="authoring-field-conflict"><h4>{field.label}</h4><dl>
      {columns.map(([key, label]) => <div key={key}><dt>{label}</dt><dd tabIndex={0} aria-label={`${field.label} · ${label}`}>{display(field[key])}</dd></div>)}
    </dl></section>)}
    <p>{t('选择仅处理以上冲突字段；其他修改仍会应用。', 'Your choice resolves the fields above; other edits will still be applied.', '選択は上記の競合項目に適用され、その他の変更はそのまま適用します。')}</p>
    <div className="gc-actions">{children}</div>
  </section>;
}
