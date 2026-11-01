import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { BuiltinPlayerMenuLocales, ProjectLanguagesSchema, type ProjectLanguages, type StudioPreferences } from '@galcraft/contracts';
import { Button, Choice, Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import './project-languages.css';

export type ProjectLanguageGuiDraft = { draft: ProjectLanguages; baseline: string; additional: string };
export type ProjectLanguageEditorHandle = { dirty: boolean; discard(): void; capture(): ProjectLanguageGuiDraft };
type Props = { value: ProjectLanguages; locale: StudioPreferences['locale']; ref?: Ref<ProjectLanguageEditorHandle>;
  apply(value: ProjectLanguages): Promise<void>; pendingChanged?(dirty: boolean): void; guiDraft?: ProjectLanguageGuiDraft | null; onGuiDraftChange?(draft: ProjectLanguageGuiDraft): void };
const names: Record<string, string> = { 'zh-CN': '简体中文', en: 'English', ja: '日本語' };

export function ProjectLanguageEditor({ value, locale, apply, pendingChanged, ref, guiDraft, onGuiDraftChange }: Props) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [draft, setDraft] = useState(() => structuredClone(guiDraft?.draft ?? value)), [baseline, setBaseline] = useState(() => guiDraft?.baseline ?? JSON.stringify(value));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [additional, setAdditional] = useState(guiDraft?.additional ?? '');
  const valueDirty = JSON.stringify(draft) !== baseline, dirty = valueDirty || additional.length > 0;
  const reset = () => { setDraft(structuredClone(value)); setBaseline(JSON.stringify(value)); setAdditional(''); setError(''); };
  useImperativeHandle(ref, () => ({ dirty, discard: reset, capture: () => ({ draft, baseline, additional }) }));
  useEffect(() => { onGuiDraftChange?.({ draft, baseline, additional }); }, [draft, baseline, additional, onGuiDraftChange]);
  useEffect(() => { pendingChanged?.(dirty); }, [dirty, pendingChanged]);
  useEffect(() => { if (!dirty) { setDraft(structuredClone(value)); setBaseline(JSON.stringify(value)); } }, [value]);
  const options = (items: string[]) => items.map(item => ({ value: item, label: names[item] ?? item }));
  const toggle = (key: 'menus' | 'voices', item: string) => {
    const items = draft[key].includes(item) ? draft[key].filter(value => value !== item) : [...draft[key], item];
    if (key === 'menus' && !items.length) return;
    const defaultKey = key === 'menus' ? 'menuDefault' : 'voiceDefault';
    setDraft({ ...draft, [key]: items, [defaultKey]: items.includes(draft[defaultKey]) ? draft[defaultKey] : items[0] ?? draft.voiceDefault });
    setError('');
  };
  const commit = async () => {
    const checked = ProjectLanguagesSchema.safeParse(draft);
    if (!checked.success) {
      const field = checked.error.issues[0]?.path[0];
      setError(field === 'textDefault' ? t('请填写正文源语言，例如 zh-CN。', 'Enter the source text language, for example zh-CN.', '本文の元言語を入力してください（例：zh-CN）。')
        : field === 'voiceDefault' || field === 'voices' ? t('请将默认配音语言设为已启用项，并检查配音列表。', 'Select an enabled voice default and check the voice list.', '有効な音声を既定に選び、音声リストを確認してください。')
        : t('请至少选择一种菜单语言，并将默认菜单语言设为已启用项。', 'Enable a menu language and select an enabled menu default.', 'メニュー言語を選び、有効な言語を既定のメニューにしてください。'));
      return;
    }
    setBusy(true); setError('');
    try { await apply(checked.data); setBaseline(JSON.stringify(checked.data)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const choices = (key: 'menus' | 'voices', items: readonly string[]) => <div className="project-language-choices">{items.map(item =>
    <label key={item}><input type="checkbox" checked={draft[key].includes(item)} disabled={busy || key === 'menus' && draft.menus.length === 1 && draft.menus[0] === item}
      onChange={() => toggle(key, item)}/><span>{names[item] ?? item}</span></label>)}</div>;
  return <section className="project-language-editor" aria-labelledby="project-language-heading" aria-busy={busy}>
    <h2 id="project-language-heading">{t('作品语言', 'Project languages', '作品の言語')}</h2>
    <p>{t('菜单、正文和配音分别配置。菜单切换保留作者原文。', 'Configure menus, source text and voices separately. Menu changes keep author text.', 'メニュー・本文・音声を個別に設定します。メニューを変更しても作者の本文を保持します。')}</p>
    <fieldset disabled={busy}><legend>{t('菜单与系统界面', 'Menus and system UI', 'メニューとシステム')}</legend>
      {choices('menus', BuiltinPlayerMenuLocales)}
      <Field label={t('默认菜单语言', 'Default menu language', '既定のメニュー言語')} help={t('至少启用一种；仅启用一种时，Player 隐藏切换项。', 'Enable at least one. Player hides the selector when one is enabled.', '1言語以上を有効にします。1言語の場合、Playerは切替を隠します。')}>
        <Choice label={t('默认菜单语言', 'Default menu language', '既定のメニュー言語')} value={draft.menuDefault} options={options(draft.menus)} onChange={menuDefault => setDraft({ ...draft, menuDefault })}/>
      </Field>
    </fieldset>
    <fieldset disabled={busy}><legend>{t('剧情正文', 'Story source text', '物語の本文')}</legend>
      <Field label={t('正文源语言', 'Source text language', '本文の元言語')} help={t('用于正文排版，例如 zh-CN；当前作品使用一份作者原文。', 'Used for text layout, for example zh-CN. The work uses one source text.', '本文の組版に使用します（例：zh-CN）。作者の原文を使用します。')}>
        <Input value={draft.textDefault} onChange={event => setDraft({ ...draft, textDefault: event.target.value })}/>
      </Field>
    </fieldset>
    <fieldset disabled={busy}><legend>{t('角色配音', 'Character voices', 'キャラクター音声')}</legend>
      {choices('voices', [...new Set([...BuiltinPlayerMenuLocales, ...draft.voices])])}
      <div className="project-language-add"><Field label={t('添加其他配音语言', 'Add another voice language', 'ほかの音声言語を追加')}>
        <Input placeholder="ko, fr, es…" value={additional} onChange={event => setAdditional(event.target.value)}/></Field>
        <Button disabled={!additional.trim()} onClick={() => {
          try { const item = new Intl.Locale(additional.trim()).toString(); if (!draft.voices.includes(item)) setDraft({ ...draft, voices: [...draft.voices, item], voiceDefault: draft.voices.length ? draft.voiceDefault : item }); setAdditional(''); setError(''); }
          catch { setError(t('请输入有效的语言标签，例如 ko。', 'Enter a valid language tag, for example ko.', '有効な言語タグを入力してください（例：ko）。')); }
        }}>{t('添加语言', 'Add language', '言語を追加')}</Button>
      </div>
      {draft.voices.length ? <Field label={t('默认配音语言', 'Default voice language', '既定の音声言語')}>
        <Choice label={t('默认配音语言', 'Default voice language', '既定の音声言語')} value={draft.voiceDefault} options={options(draft.voices)} onChange={voiceDefault => setDraft({ ...draft, voiceDefault })}/>
      </Field> : <p>{t('未启用配音语言，Player 隐藏配音语言项。', 'No voice languages enabled. Player hides the voice language setting.', '音声言語が無効のため、Playerは音声言語設定を隠します。')}</p>}
      <p>{t('配音与菜单独立。缺少所选语言时，按作品默认配音、通用语音、静音顺序处理。', 'Voice and menu choices are independent. Missing voices use the work default, generic voice, then silence.', '音声とメニューの選択は独立です。音声がない場合は作品既定・共通音声・無音の順に処理します。')}</p>
    </fieldset>
    {error && <p role="alert" className="field-error">{error}</p>}
    <div className="gc-actions"><Button tone="primary" disabled={!valueDirty || busy || !!additional.trim()} onClick={() => void commit()}>{busy ? t('正在应用…', 'Applying…', '適用中…') : t('应用语言设置', 'Apply language settings', '言語設定を適用')}</Button>
      <Button tone="quiet" disabled={!dirty || busy} onClick={reset}>{t('还原未应用输入', 'Reset unapplied input', '未適用の入力を戻す')}</Button></div>
  </section>;
}
