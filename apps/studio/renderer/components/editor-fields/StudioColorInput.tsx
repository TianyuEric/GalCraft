import { Field } from '../controls.js';
import { StudioColorField } from './StudioColorField.js';

/** Labeled color field for forms that commit only after the picker confirms. */
export function StudioColorInput({ label, value, locale, onChange, onDraftChange }: {
  label: string; value: string; locale: string;
  onChange(value: string): void | boolean | Promise<unknown>; onDraftChange?(active: boolean): void;
}) {
  return <Field label={label}><StudioColorField label={label} value={value} allowAlpha locale={locale}
    onPreview={() => {}} onCommit={async next => {
      if (await onChange(next) === false) throw new Error(locale === 'en' ? 'Color was not applied. Resolve the form error and retry.' : locale === 'ja' ? '色を適用できませんでした。フォームのエラーを修正して再試行してください。' : '颜色未应用，请修复表单错误后重试。');
    }} onSession={active => onDraftChange?.(active)}/></Field>;
}
