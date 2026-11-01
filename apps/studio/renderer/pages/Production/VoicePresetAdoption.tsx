import type { CandidateAdoptionChoice } from '@galcraft/authoring/production';
import type { ConnectionConfig } from '@galcraft/contracts';
import { Choice, Field } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
export function VoicePresetAdoption({ value, change, characters, connections, locale }: { value: NonNullable<CandidateAdoptionChoice['voicePreset']>; change(value: NonNullable<CandidateAdoptionChoice['voicePreset']>): void; characters: { id: string; name: string }[]; connections: ConnectionConfig[]; locale: string }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return <section className="space-y-2"><p>{t('采用将音频素材与角色语言预设作为同一组更新。此动作不绑定台词。', 'Adoption updates the audio asset and character language preset together. This action does not bind a dialogue line.', '音声素材と言語別プリセットを同時に採用します。この操作は台詞に紐付けません。')}</p>
    <Field label={t('角色', 'Character', 'キャラクター')}><Choice label="Voice character" value={value.characterId} options={[{ value: '', label: '—' }, ...characters.map(character => ({ value: character.id, label: character.name }))]} onChange={characterId => change({ ...value, characterId })}/></Field>
    <Field label={t('目标配音语言', 'Target voice language', '対象音声の言語')}><Choice label="Voice locale" value={value.locale} options={['zh', 'en', 'ja'].map(value => ({ value, label: value }))} onChange={locale => change({ ...value, locale })}/></Field>
    <Field label={t('参考录音语言', 'Recording language', '参照録音の言語')}><Input value={value.referenceLocale} onChange={event => change({ ...value, referenceLocale: event.target.value })}/></Field>
    <Field label={t('准确参考逐字稿', 'Exact reference transcript', '正確な参照テキスト')}><Textarea rows={3} value={value.transcript} onChange={event => change({ ...value, transcript: event.target.value })}/></Field>
    <Field label={t('逐句配音连接', 'Sentence voice connection', '台詞の音声接続')}><Choice label="Sentence voice connection" value={value.connectionId} options={[{ value: '', label: '—' }, ...connections.map(connection => ({ value: connection.id, label: connection.name }))]} onChange={connectionId => change({ ...value, connectionId, model: connections.find(connection => connection.id === connectionId)?.model ?? value.model })}/></Field>
    <Field label={t('模型', 'Model', 'モデル')}><Input value={value.model} onChange={event => change({ ...value, model: event.target.value })}/></Field>
  </section>;
}
