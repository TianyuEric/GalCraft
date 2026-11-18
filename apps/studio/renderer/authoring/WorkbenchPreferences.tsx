import { useRef, useState } from 'react';
import { DefaultStudioPreferences, type Result, type StudioPreferences } from '@galcraft/contracts';
import { Button, Choice, Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import './workbench-preferences.css';

export function WorkbenchPreferences({ preferences, onChange, onResetLayout }: {
  preferences: StudioPreferences;
  onChange(update: (previous: StudioPreferences) => StudioPreferences): Promise<Result<void>>;
  onResetLayout(): void | Promise<void>;
}) {
  const { locale, theme, editor } = preferences;
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [fontFamily, setFontFamily] = useState<string>();
  const [fontSize, setFontSize] = useState<string>();
  const [wordWrap, setWordWrap] = useState<boolean>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  const themeLabel = t('界面主题', 'Interface theme', 'テーマ');
  const languageLabel = t('界面语言', 'Interface language', '表示言語');
  const hasEditorInput = fontFamily !== undefined || fontSize !== undefined || wordWrap !== undefined;

  const run = async (action: () => void | Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { pending.current = false; setBusy(false); }
  };
  const write = async (update: (previous: StudioPreferences) => StudioPreferences) => {
    const result = await onChange(update);
    if (!result.ok) throw new Error(result.error.message);
  };

  return <section className="workbench-preferences" aria-busy={busy}>
    <header>
      <h1>{t('工作台偏好', 'Workbench preferences', 'ワークスペース設定')}</h1>
      <p>{t('这些个人设置适用于你在此入口打开的所有作品。', 'These personal preferences apply to projects you open in this Studio entry.', 'この個人設定は、この Studio で開く作品に適用されます。')}</p>
    </header>
    {error && <p className="workbench-error" role="alert">{error}</p>}
    <section className="workbench-preference-section">
      <h2>{t('外观与语言', 'Appearance and language', '外観と言語')}</h2>
      <div className="workbench-preference-grid">
        <Field label={themeLabel}><Choice label={themeLabel} value={theme} disabled={busy} options={[
          { value: 'light', label: t('浅色', 'Light', 'ライト') },
          { value: 'dark', label: t('暮色', 'Dark', 'ダーク') },
        ]} onChange={next => void run(() => write(previous => ({ ...previous, theme: next as StudioPreferences['theme'] })))}/></Field>
        <Field label={languageLabel}><Choice label={languageLabel} value={locale} disabled={busy} options={[
          { value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }, { value: 'ja', label: '日本語' },
        ]} onChange={next => void run(() => write(previous => ({ ...previous, locale: next as StudioPreferences['locale'] })))}/></Field>
      </div>
    </section>
    <section className="workbench-preference-section">
      <h2>{t('编辑器', 'Editor', 'エディター')}</h2>
      <form onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          await write(previous => ({ ...previous, editor: {
            ...previous.editor,
            fontFamily: fontFamily === undefined ? previous.editor.fontFamily : fontFamily.trim() || DefaultStudioPreferences.editor.fontFamily,
            fontSize: fontSize === undefined ? previous.editor.fontSize : Number(fontSize),
            wordWrap: wordWrap ?? previous.editor.wordWrap,
          } }));
          setFontFamily(undefined); setFontSize(undefined); setWordWrap(undefined);
        });
      }}>
        <div className="workbench-preference-grid">
          <Field label={t('编辑器字体', 'Editor font', 'エディターフォント')}><Input value={fontFamily ?? editor.fontFamily} disabled={busy} onChange={event => setFontFamily(event.target.value)}/></Field>
          <Field label={t('编辑器字号（px）', 'Editor font size (px)', 'エディター文字サイズ（px）')}><Input type="number" min={8} max={48} required value={fontSize ?? editor.fontSize} disabled={busy} onChange={event => setFontSize(event.target.value)}/></Field>
        </div>
        <label className="workbench-preference-checkbox"><input type="checkbox" checked={wordWrap ?? editor.wordWrap} disabled={busy} onChange={event => setWordWrap(event.target.checked)}/>
          {t('源码自动换行', 'Wrap source lines', 'ソースを折り返す')}
        </label>
        <Button type="submit" tone="primary" disabled={busy || !hasEditorInput}>{t('应用编辑器偏好', 'Apply editor preferences', 'エディター設定を適用')}</Button>
      </form>
    </section>
    <section className="workbench-preference-section">
      <h2>{t('布局', 'Layout', 'レイアウト')}</h2>
      <p>{t('拖动工作台分隔线调整尺寸。使用布局菜单保存或应用个人命名布局。', 'Drag workbench dividers to resize panels. Use the Layout menu to save or apply personal named layouts.', '仕切りをドラッグしてパネルのサイズを調整します。レイアウトメニューから名前を付けて保存・適用できます。')}</p>
      <Button disabled={busy} onClick={() => void run(onResetLayout)}>{t('应用平衡布局', 'Apply balanced layout', '標準レイアウトを適用')}</Button>
    </section>
  </section>;
}
