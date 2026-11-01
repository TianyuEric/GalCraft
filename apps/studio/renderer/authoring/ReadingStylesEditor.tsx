import { useState } from 'react';
import type { ReadingStyles, ReadingTextStyle, Visual } from '@galcraft/contracts';
import { officialLocaleResources } from '@galcraft/templates';
import { Button, Choice, Field } from '../components/controls.js';
import { ColorAlpha } from '../components/color-alpha.js';
import { StudioNumberField } from '../components/editor-fields/StudioNumberField.js';
import './reading-styles-editor.css';

type Props = { value?: ReadingStyles; base: Visual; fonts: { id: string; name: string; family?: string }[]; locale: string;
  commit(value: ReadingStyles): Promise<void> };
const resources = officialLocaleResources();

export function ReadingStylesEditor({ value, base, fonts, locale, commit }: Props) {
  const t = (key: string) => (resources[locale as keyof typeof resources] ?? resources['zh-CN']).strings[`reading.${key}`]!;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [feedbackState, setFeedbackState] = useState<'unread' | 'read' | null>(null);
  const apply = async (state: 'unread' | 'read', patch: Partial<ReadingTextStyle>, reset = false) => {
    const next = structuredClone(value ?? {}), style = reset ? {} : { ...next[state], ...patch };
    for (const key of Object.keys(style) as (keyof ReadingTextStyle)[]) if (style[key] === undefined) delete style[key];
    if (Object.keys(style).length) next[state] = style; else delete next[state];
    setFeedbackState(state); setBusy(true); setError('');
    try { await commit(next); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const options = [{ value: 'inherit', label: t('inherit') }, { value: 'true', label: t('on') }, { value: 'false', label: t('off') }];
  return <div className="reading-styles-editor">
    <p className="reading-styles-help">{t('help')}</p>
    {(['unread', 'read'] as const).map(state => {
      const style = value?.[state] ?? {};
      return <fieldset key={state} disabled={busy}>
        <legend>{t(state)}</legend>
        {feedbackState === state && (busy || error) && <div className="reading-style-feedback">
          {busy && <p role="status">{t('applying')}</p>}{error && <p role="alert" className="field-error">{error}</p>}
        </div>}
        <Field label={t('font')}><Choice label={`${t(state)} · ${t('font')}`} disabled={busy} value={style.fontId ?? 'inherit'}
          options={[{ value: 'inherit', label: t('inherit') }, ...fonts.map(font => ({ value: font.id, label: font.name }))]}
          onChange={fontId => void apply(state, { fontId: fontId === 'inherit' ? undefined : fontId })}/></Field>
        <StudioNumberField label={`${t(state)} · ${t('size')}`} value={style.fontSize ?? null} allowEmpty min={1} step={1} unit="px" locale={locale}
          disabled={busy} onPreview={() => {}} onCommit={size => apply(state, { fontSize: size ?? undefined })}/>
        <Field label={t('color')}><Choice label={`${t(state)} · ${t('color')}`} disabled={busy} value={style.color ? 'custom' : 'inherit'}
          options={[{ value: 'inherit', label: t('inherit') }, { value: 'custom', label: t('custom') }]}
          onChange={mode => void apply(state, { color: mode === 'custom' ? base.color : undefined })}/></Field>
        {style.color && <ColorAlpha label={`${t(state)} · ${t('color')}`} value={style.color} locale={locale} onChange={color => void apply(state, { color })}/>}
        <div className="reading-styles-pair">{(['bold', 'italic'] as const).map(key => <Field key={key} label={t(key)}>
          <Choice label={`${t(state)} · ${t(key)}`} disabled={busy} value={style[key] === undefined ? 'inherit' : String(style[key])}
            options={options} onChange={choice => void apply(state, { [key]: choice === 'inherit' ? undefined : choice === 'true' })}/>
        </Field>)}</div>
        <p className="reading-style-specimen" aria-label={`${t(state)} · ${t('preview')}`} style={{
          background: base.background.color,
          color: style.color ?? base.color, fontSize: style.fontSize ?? base.fontSize,
          fontFamily: fonts.find(font => font.id === (style.fontId ?? base.fontId))?.family,
          fontWeight: style.bold === undefined ? undefined : style.bold ? 700 : 400,
          fontStyle: style.italic === undefined ? undefined : style.italic ? 'italic' : 'normal',
        }}>{t('preview')}</p>
        <Button tone="quiet" disabled={busy || !Object.keys(style).length} onClick={() => void apply(state, {}, true)}>{t('reset')}</Button>
      </fieldset>;
    })}
  </div>;
}
