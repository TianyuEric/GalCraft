import type { Json } from '@galcraft/contracts';
import type { MediaInput, SpeechLine } from '@galcraft/authoring/production';
import { Button, Choice, Field } from '../../components/controls.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Input } from '../../components/ui/input.js';
import { Disclosure } from '../../components/disclosure.js';
import type { AuthoringServices } from '../../authoring/controller.js';
import type { ProductionSession } from './session.js';
import { openAssetPicker } from '../../authoring/asset-picker.js';

export function speechLineOverrideFields(previous: SpeechLine['fields'], field: Pick<import('@galcraft/contracts').FieldSpec, 'path' | 'type'>, value: string): NonNullable<SpeechLine['fields']> {
  const next = { ...previous };
  if (!value.trim()) delete next[field.path];
  else next[field.path] = field.type === 'number' || field.type === 'integer' ? Number(value) : value;
  return next;
}

export function VoiceLinesEditor({ session: s, lines, services, locale }: { session: ProductionSession; lines: SpeechLine[]; services: AuthoringServices; locale: string }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const update = (id: string, patch: Partial<SpeechLine>) => s.field('speechLines', lines.map(line => line.id === id ? { ...line, ...patch } : line) as unknown as Json);
  const definition = s.operationDefinition?.definition;
  const language = definition?.fields.find(field => field.path === 'language');
  return <section className="space-y-3"><h2>{t('逐句配音', 'Sentence voices', '台詞ごとの音声')}</h2>
    <label className="check-row"><input type="checkbox" checked={s.variant!.fields.voiceUseCharacterPresets !== false} onChange={event => s.field('voiceUseCharacterPresets', event.target.checked)}/>{t('读取每位角色的目标语言音色', 'Use each character’s target-language voice', 'キャラクターの対象言語の音声を使用')}</label>
    <label className="check-row"><input type="checkbox" checked={s.variant!.fields.voiceOverrideConnection === true} onChange={event => s.field('voiceOverrideConnection', event.target.checked)}/>{t('本次共同覆盖连接与模型', 'Override connection and model for this batch', '今回の接続とモデルを共通指定')}</label>
    <p>{t('本句覆盖优先于本次输入，角色预设随后提供缺省参考。检查计划显示每句实际冻结输入；修改角色默认会使旧计划待审阅。', 'Sentence overrides take precedence over common input; character presets supply missing references. The plan shows each frozen input. Character changes require review.', '台詞の指定を共通入力より優先し、未指定の参照はキャラクター設定を使用します。計画で各入力を確認できます。')}</p>
    {lines.map((line, index) => {
      const character = s.data.characters.find(character => character.id === line.characterId);
      const preset = s.variant!.fields.voiceUseCharacterPresets !== false ? character?.voicePresets?.[line.language] : undefined;
      const connectionId = line.connectionId ?? (preset && s.variant!.fields.voiceOverrideConnection !== true ? preset.connectionId : s.variant!.connectionId);
      const connection = s.data.connections.find(value => value.id === connectionId);
      const model = line.model ?? (preset && s.variant!.fields.voiceOverrideConnection !== true ? preset.model : s.variant!.model) ?? connection?.model;
      const references = line.references ?? (Array.isArray(s.variant!.fields.references) ? s.variant!.fields.references as unknown as MediaInput[] : []);
      const commonAudio = s.variant!.fields.referenceAudio as unknown as MediaInput | null;
      const audio = references.find(value => value.port === 'referenceAudio') ?? (!line.references ? commonAudio : null);
      const inherited = !audio && preset?.voice.kind === 'reference' ? preset.voice : null;
      const assetId = audio?.assetId ?? inherited?.assetId;
      const reference = assetId ? s.data.assets.find(asset => asset.id === assetId)?.name ?? assetId : null;
      return <section key={line.id} className="space-y-2 border-t pt-3"><label className="check-row"><input type="checkbox" checked={line.selected} onChange={event => update(line.id, { selected: event.target.checked })}/><strong>{index + 1}. {character?.name ?? t('旁白', 'Narration', 'ナレーション')}</strong></label><p>{line.original}</p>
      <Field label={t('朗读文本', 'Spoken text', '読み上げ文')}><Textarea rows={2} value={line.text} onChange={event => update(line.id, { text: event.target.value })}/></Field>
      <Field label={t('目标语言', 'Target language', '対象言語')}><Choice label={`Voice language ${index + 1}`} value={line.language} options={[...(language?.enumValues ?? ['zh', 'en', 'ja']).map(value => ({ value, label: value })), ...(language?.enumValues && !language.enumValues.includes(line.language) ? [{ value: line.language, label: `${line.language} · ${t('此模式不支持', 'Unsupported by this mode', 'このモードは未対応')}` }] : [])]} onChange={language => update(line.id, { language })}/></Field>
      <p className="text-sm text-muted-foreground">{t('本句连接', 'Sentence connection', '台詞の接続')}：{connection?.name ?? t('连接缺失，请补齐', 'Missing connection', '接続が未設定')} · {model || '—'}{definition?.inputs.some(port => port.key === 'referenceAudio') && <> · {t('参考', 'Reference', '参照')}：{reference ?? t('尚未设置', 'Missing', '未設定')}{inherited ? ` · ${t('继承角色', 'From character', 'キャラクターから継承')}` : ''}</>}</p>
      <Disclosure><span>{t('本句覆盖', 'Sentence overrides', 'この台詞の指定')}</span>
        {definition?.fields.filter(field => !['text', 'language', 'seed'].includes(field.path)).map(field => <Field key={field.path} label={field.label} help={t('留空使用本次输入或角色预设', 'Leave empty to use common input or the character preset', '空欄は共通入力またはキャラクター設定を使用')}>{field.type === 'number' || field.type === 'integer' ? <Input type="number" min={field.min} max={field.max} step={field.type === 'integer' ? 1 : 'any'} value={line.fields?.[field.path] as number ?? ''} onChange={event => update(line.id, { fields: speechLineOverrideFields(line.fields, field, event.target.value) })}/> : <Textarea rows={2} value={String(line.fields?.[field.path] ?? '')} onChange={event => update(line.id, { fields: speechLineOverrideFields(line.fields, field, event.target.value) })}/>}</Field>)}
        {definition?.inputs.some(port => port.key === 'referenceAudio') && <div className="gc-actions"><Button onClick={() => void openAssetPicker({ services, projectId: s.projectId, allowedKinds: ['audio'], locale, purpose: t('本句参考音色', 'Sentence reference voice', 'この台詞の参照音声'), remember: false, onApply: async choice => { const result = await s.bridge.production.mediaInput({ assetId: choice.assetId, variantId: choice.variantId ?? undefined }); if (result.ok) update(line.id, { references: [{ ...result.value, port: 'referenceAudio' } as MediaInput] }); return result; } })}>{t('选择本句参考音频', 'Choose sentence reference', 'この台詞の参照音声を選択')}</Button>{line.references?.length ? <><span>{s.data.assets.find(asset => asset.id === line.references?.[0]?.assetId)?.name ?? t('本句参考音频已选', 'Sentence reference selected', '参照音声を選択済み')}</span><Button tone="quiet" onClick={() => update(line.id, { references: undefined })}>{t('恢复继承', 'Restore inheritance', '継承に戻す')}</Button></> : null}</div>}
      </Disclosure>
    </section>; })}
  </section>;
}
