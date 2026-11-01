import { useEffect, useState } from 'react';
import type { AuthoringOutline } from '@galcraft/contracts';
import { Button, Field, Modal } from '../../components/controls.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Disclosure } from '../../components/disclosure.js';
import { CodeEditor } from '../../components/code-editor.js';
import type { ProductionSession } from './session.js';
import { unwrap } from './bridge.js';

export function OutlineEditor({ session: s, locale, close, changed, inline = false }: { session: ProductionSession; locale: string; close(): void; changed(): Promise<void>; inline?: boolean }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [record, setRecord] = useState<{ outline: AuthoringOutline; revision: number | null } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [advanced, setAdvanced] = useState<string | null>(null);
  useEffect(() => { let mounted = true; void s.bridge.production.readOutline().then(result => { if (mounted) setRecord(unwrap(result)); }).catch(error => { if (mounted) setError(String(error)); }); return () => { mounted = false; }; }, [s]);
  const update = (patch: Partial<AuthoringOutline>) => setRecord(record => record ? { ...record, outline: { ...record.outline, ...patch } } : null);
  const title = t('作品大纲与人物设定', 'Project outline & character notes', '作品のあらすじとキャラクター設定');
  const content = <>
    <p>{t('大纲保存到作品，AI 制作会自动带入。更新后仍需保存作品，可在创作页撤销。', 'The outline belongs to this project and is included in AI production. Save the project after updating; changes can be undone in the editor.', 'あらすじを作品に記録し、AI 制作に含めます。更新後に作品を保存してください。編集画面で元に戻せます。')}</p>
    {error && <p role="alert">{error.replace(/^Error: /, '')}</p>}
    {record && <>
      {([['setting', t('世界与故事设定', 'Story setting', '世界と物語の設定')], ['style', t('创作风格', 'Creative style', '制作スタイル')], ['audienceNotes', t('阅读体验与其他要求', 'Audience experience & notes', '読者体験とその他の要望')]] as const).map(([key, label]) => <Field key={key} label={label}><Textarea rows={3} value={record.outline[key]} onChange={event => update({ [key]: event.target.value })}/></Field>)}
      {record.outline.characters.map((character, index) => <section className="outline-character" key={character.characterId}>
        <h3>{s.data.characters.find(value => value.id === character.characterId)?.name ?? character.characterId}</h3>
        <Field label={t('人物设定', 'Character notes', 'キャラクター設定')}><Textarea rows={2} value={character.description} onChange={event => update({ characters: record.outline.characters.map((value, i) => i === index ? { ...value, description: event.target.value } : value) })}/></Field>
        <Field label={t('人物目标', 'Character goal', 'キャラクターの目的')}><Textarea rows={2} value={character.goal} onChange={event => update({ characters: record.outline.characters.map((value, i) => i === index ? { ...value, goal: event.target.value } : value) })}/></Field>
      </section>)}
      {record.outline.chapters.map((chapter, chapterIndex) => <section key={chapter.chapterId}>
        <Field label={t('章节概要', 'Chapter summary', '章の概要')}><Textarea rows={2} value={chapter.summary} onChange={event => update({ chapters: record.outline.chapters.map((value, i) => i === chapterIndex ? { ...value, summary: event.target.value } : value) })}/></Field>
        {chapter.scenes.map((scene, sceneIndex) => <Field key={scene.sceneId} label={s.data.scenes.find(value => value.id === scene.sceneId)?.name ?? scene.sceneId}><Textarea rows={2} value={scene.summary} onChange={event => update({ chapters: record.outline.chapters.map((value, i) => i === chapterIndex ? { ...value, scenes: value.scenes.map((value, j) => j === sceneIndex ? { ...value, summary: event.target.value } : value) } : value) })}/></Field>)}
      </section>)}
      <Disclosure><span>{t('完整大纲结构', 'Complete outline structure', 'あらすじ全体の構造')}</span><CodeEditor label={t('大纲 JSON', 'Outline JSON', 'あらすじ JSON')} locale={locale} language="json" value={advanced ?? JSON.stringify(record.outline, null, 2)} onChange={setAdvanced}/></Disclosure>
      <Button tone="primary" disabled={busy} onClick={() => void (async () => {
        setBusy(true); setError('');
        try { const outline = advanced === null ? record.outline : JSON.parse(advanced); unwrap(await s.bridge.production.saveOutline({ outline, expectedRevision: record.revision })); await changed(); await s.refresh(); close(); }
        catch (error) { setError(String(error)); }
        finally { setBusy(false); }
      })()}>{t('更新作品大纲', 'Update project outline', '作品のあらすじを更新')}</Button>
    </>}
  </>;
  return inline ? <section className="persistent-outline-editor"><header><h2>{title}</h2><Button onClick={close}>{t('关闭大纲', 'Close outline', '閉じる')}</Button></header>{content}</section> : <Modal wide title={title} close={close}>{content}</Modal>;
}
