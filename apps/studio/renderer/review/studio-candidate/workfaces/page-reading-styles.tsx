import { useRef, useState } from 'react';
import type { Asset, ComponentConfig, PageConfig, ReadingTextStyle } from '@galcraft/contracts';
import { components, officialLocaleResources, readTemplateDocuments, templateEdit } from '@galcraft/templates';
import { colorAlphaValue } from '../../../components/color-alpha.js';
import { previewFontFamily } from '../../../authoring/preview-fonts.js';
import { CandidateButton, CandidateColorField, CandidateField, CandidateFieldGroup, CandidateNumberField, CandidateSection, CandidateSelect } from '../components/controls/index.js';
import type { PageStore, PageTemplate } from './page-edit.js';
import { resultValue, workfaceError } from './workface-helpers.js';
import '../styles/page-resources.css';

const resources = officialLocaleResources();
export function CandidatePageReadingStyles({ store, page, component, template, locale }: {
  store: PageStore; page: PageConfig; component?: ComponentConfig; template: PageTemplate; locale: string;
}) {
  const t = (key: string) => (resources[locale as keyof typeof resources] ?? resources['zh-CN']).strings['reading.' + key]!;
  const [busy, setBusy] = useState(false);
  const applying = useRef(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<'unread' | 'read'>();
  if (page.key !== 'story' || !component || !['story.readingPanel', 'story.bodyText'].includes(component.part)) return null;
  const parts = components(page.root);
  const body = parts.find(item => item.part === 'story.bodyText'), panel = parts.find(item => item.part === 'story.readingPanel');
  const normalColor = body?.normal.color && body.normal.color !== 'inherit' ? body.normal.color : panel?.normal.color ?? template.defaultVisual.color;
  const base = { ...template.defaultVisual, ...panel?.normal, ...body?.normal, color: colorAlphaValue(normalColor),
    background: panel?.normal.background ?? template.defaultVisual.background };
  const fonts: Asset[] = store.host.list().flatMap(item => {
    const raw = item.files['assets/index.json'];
    return raw ? (JSON.parse(raw).data.assets as Asset[]).filter(item => item.kind === 'font') : [];
  });
  const commit = async (state: 'unread' | 'read', patch: Partial<ReadingTextStyle>, reset = false) => {
    if (applying.current) throw new Error(t('applying'));
    applying.current = true;
    setFeedback(state); setBusy(true); setError('');
    try {
      const documents = store.host.list(), next = readTemplateDocuments(documents), reading = next.readingStyles ?? {};
      if (JSON.stringify(reading[state]) !== JSON.stringify(template.readingStyles?.[state])) throw new Error('阅读状态样式已变化，请重新读取。');
      const style = reset ? {} : { ...reading[state], ...patch };
      for (const key of Object.keys(style) as (keyof ReadingTextStyle)[]) if (style[key] === undefined) delete style[key];
      if (Object.keys(style).length) reading[state] = style; else delete reading[state];
      if (Object.keys(reading).length) next.readingStyles = reading; else delete next.readingStyles;
      const edit = templateEdit(documents, next, '修改阅读状态样式');
      if (edit.patches.length) { store.target(edit.patches[0]!.documentId); resultValue(await store.applyEdit(edit)); }
    } finally { applying.current = false; setBusy(false); }
  };
  const apply = (state: 'unread' | 'read', patch: Partial<ReadingTextStyle>, reset = false) =>
    commit(state, patch, reset).catch(reason => setError(workfaceError(reason)));
  return <CandidateSection title="阅读状态样式" collapsible initiallyOpen={false} onFocusCapture={() => {
    const document = store.host.list().find(item => 'ui/template.json' in item.files);
    if (document && store.getSnapshot().commandTarget !== document.documentId) store.target(document.documentId);
  }}>
    <div className="candidate-resource-reading">
      <p className="candidate-resource-hint">{t('help')}</p>
      {(['unread', 'read'] as const).map(state => {
        const style = template.readingStyles?.[state] ?? {};
        const font = fonts.find(item => item.id === (style.fontId ?? base.fontId));
        return <CandidateFieldGroup key={state} title={t(state)} disabled={busy}>
          <div className="candidate-resource-fields">
            <CandidateField label={t('font')}><CandidateSelect aria-label={t(state) + ' · ' + t('font')} density="compact" disabled={busy} value={style.fontId ?? 'inherit'}
              onValueChange={fontId => void apply(state, { fontId: fontId === 'inherit' ? undefined : fontId })}>
              <option value="inherit">{t('inherit')}</option>{fonts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </CandidateSelect></CandidateField>
            <CandidateNumberField label={t(state) + ' · ' + t('size')} value={style.fontSize ?? null} allowEmpty min={1} step={1} unit="px" locale={locale} disabled={busy}
              onCommit={fontSize => commit(state, { fontSize: fontSize ?? undefined })}/>
            <CandidateField label={t('color')}><CandidateSelect aria-label={t(state) + ' · ' + t('color')} density="compact" disabled={busy} value={style.color ? 'custom' : 'inherit'}
              onValueChange={mode => void apply(state, { color: mode === 'custom' ? base.color : undefined })}>
              <option value="inherit">{t('inherit')}</option><option value="custom">{t('custom')}</option>
            </CandidateSelect></CandidateField>
            {style.color && <CandidateColorField label={t(state) + ' · ' + t('color')} locale={locale} allowAlpha value={style.color} disabled={busy}
              onPreview={() => {}} onSession={() => {}} onCommit={color => apply(state, { color })}/>}
            {(['bold', 'italic'] as const).map(key => <CandidateField key={key} label={t(key)}><CandidateSelect aria-label={t(state) + ' · ' + t(key)}
              density="compact" disabled={busy} value={style[key] === undefined ? 'inherit' : String(style[key])}
              onValueChange={choice => void apply(state, { [key]: choice === 'inherit' ? undefined : choice === 'true' })}>
              <option value="inherit">{t('inherit')}</option><option value="true">{t('on')}</option><option value="false">{t('off')}</option>
            </CandidateSelect></CandidateField>)}
          </div>
          <p className="candidate-resource-specimen" aria-label={t(state) + ' · ' + t('preview')} style={{
            background: base.background.color, color: style.color ?? base.color, fontSize: style.fontSize ?? base.fontSize,
            fontFamily: font && JSON.stringify(previewFontFamily(font.id, font.activeVariantId)), fontWeight: style.bold === undefined ? undefined : style.bold ? 700 : 400,
            fontStyle: style.italic === undefined ? undefined : style.italic ? 'italic' : 'normal',
          }}>{t('preview')}</p>
          {feedback === state && (busy || error) && <p role={error ? 'alert' : 'status'} className="candidate-resource-hint">{error || t('applying')}</p>}
          <CandidateButton disabled={busy || !Object.keys(style).length} onClick={() => void apply(state, {}, true)}>{t('reset')}</CandidateButton>
        </CandidateFieldGroup>;
      })}
    </div>
  </CandidateSection>;
}
