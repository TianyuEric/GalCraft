import { useState } from 'react';
import { AudioLines, Plus, Trash2, Volume2 } from 'lucide-react';
import { createId, type Asset, type CapabilityReport, type ConnectionConfig, type Id, type Result, type VoicePreset } from '@galcraft/contracts';
import type { AuthoringSource } from '../../../authoring/controller.js';
import { neutralCharacter, normalizeCharacterVoicePresets } from '../../../authoring/characters/model.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateIconButton, CandidateInput, CandidateSection, CandidateSelect, CandidateTextarea, CandidateToolbar } from '../components/controls/index.js';
import { CharacterNumber, useClearCharacterNumbers } from './character-number.js';
import type { CharacterFieldsProps } from './character-profile.js';
import { resultValue, workfaceError } from './workface-helpers.js';

type Option = { value: string; label: string };
const options = (values: Option[], selected: string, missing: string) => <>
  {values.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
  {selected && !values.some(item => item.value === selected) && <option value={selected}>{missing}</option>}
</>;

export function CharacterVoice({ current, source, assets, connections, disabled, change, chooseAvatar, openAsset, createVoice, inspect }: CharacterFieldsProps & {
  source: AuthoringSource; assets: Asset[]; connections: ConnectionConfig[];
  chooseAvatar(): Promise<Id | undefined>; openAsset(id: Id): void; createVoice(): void;
  inspect?(connectionId: string, model: string): Promise<Result<CapabilityReport>>;
}) {
  const clearNumbers = useClearCharacterNumbers();
  const [reports, setReports] = useState<Record<string, CapabilityReport>>({});
  const [checking, setChecking] = useState('');
  const [error, setError] = useState('');
  const value = current.voicePresets ?? {};
  const languages = source.project.languages.voices;
  const available = connections.filter(connection => connection.purposes.some(purpose => purpose === 'speech' || purpose.includes('/')));
  const update = (key: string, patch: Partial<VoicePreset>) => change({ voicePresets: { ...value, [key]: { ...value[key]!, ...patch, revision: value[key]!.revision + 1 } } });
  const discover = async (connectionId: string, model: string) => {
    if (!inspect) return;
    setChecking(connectionId); setError('');
    try {
      const report = resultValue(await inspect(connectionId, model));
      setReports(previous => ({ ...previous, [connectionId]: report }));
    } catch (reason) { setError(workfaceError(reason)); }
    finally { setChecking(''); }
  };
  return <>
    <CandidateSection title="阅读头像">
      <div className="candidate-character-control-actions">
        <CandidateField label="角色默认阅读头像" hint="逐句头像和舞台裁剪可在指令属性中编辑。">
          <CandidateSelect value={current.avatar ?? ''} disabled={disabled} onValueChange={id => change({ avatar: id || null })}>
            <option value="">自动使用舞台裁剪</option>
            {options(assets.filter(asset => asset.kind === 'image').map(asset => ({ value: asset.id, label: asset.name })), current.avatar ?? '', '头像素材缺失')}
          </CandidateSelect>
        </CandidateField>
        <CandidateButton variant="outline" disabled={disabled} onClick={() => void chooseAvatar().then(id => { if (id !== undefined) change({ avatar: id }); }).catch(reason => setError(workfaceError(reason)))}>选择头像图片</CandidateButton>
        {current.avatar && <CandidateButton onClick={() => openAsset(current.avatar!)}>查看头像</CandidateButton>}
      </div>
    </CandidateSection>
    <CandidateSection title="配音">
      <label className="candidate-character-check"><CandidateCheckbox disabled={disabled} checked={(current.defaultVoicing ?? (current.narrativeRole === 'viewpoint' ? 'intentionalSilent' : 'required')) === 'required'}
        onChange={event => change({ defaultVoicing: event.target.checked ? 'required' : 'intentionalSilent' })}/>默认参与批量配音</label>
      <p className="candidate-character-hint">批量时仍可手动选入，已有音频继续播放。</p>
      <CandidateToolbar label="声线操作">
        <CandidateButton variant="outline" disabled={disabled} onClick={createVoice}><AudioLines size={14}/>制作角色样音</CandidateButton>
        <CandidateButton disabled={disabled} onClick={() => {
          try {
            change({ voicePresets: normalizeCharacterVoicePresets({ ...neutralCharacter(current.id, current.name, source.project, current.narrativeRole), ...current }, source.project.languages).voicePresets });
          } catch (reason) { setError(workfaceError(reason)); }
        }}>对齐作品配音语言</CandidateButton>
      </CandidateToolbar>
    </CandidateSection>
    <CandidateSection title="按语言保存的参考音色">
      <p className="candidate-character-hint">逐句配音读取对应目标语言的预设。参考逐字稿填写录音内容。</p>
      {!available.length && <p role="status" className="candidate-character-hint">请先在制作的「连接与工具」中配置语音提供方。</p>}
      {Object.entries(value).map(([key, preset]) => {
        const catalog = reports[preset.connectionId]?.speechCatalog;
        const engine = catalog?.engines.find(item => item.id === preset.model);
        const voice = preset.voice;
        return <CandidateSection key={key} title={key} className="candidate-character-entry" actions={<CandidateIconButton label={'移除音色 ' + key} disabled={disabled} onClick={() => {
          const next = { ...value }; delete next[key]; clearNumbers('voice/' + key); change({ voicePresets: next });
        }}><Trash2 size={14}/></CandidateIconButton>}>
          <div className="candidate-character-inline">
            <CandidateField label="个人执行连接"><CandidateSelect value={preset.connectionId} disabled={disabled} onValueChange={connectionId => update(key, { connectionId, model: available.find(connection => connection.id === connectionId)?.model ?? preset.model })}>
              <option value="">选择连接</option>{options(available.map(connection => ({ value: connection.id, label: connection.name })), preset.connectionId, '原连接不可用 · 请重绑')}
            </CandidateSelect></CandidateField>
            <CandidateField label="模型 / 引擎">{catalog ? <CandidateSelect value={preset.model} disabled={disabled} onValueChange={model => update(key, { model })}>
              {options(catalog.engines.filter(item => item.available).map(item => ({ value: item.id, label: item.name })), preset.model, preset.model + ' · 不可用')}
            </CandidateSelect> : <CandidateInput value={preset.model} disabled={disabled} onChange={event => update(key, { model: event.target.value })}/>}</CandidateField>
          </div>
          {inspect && <CandidateToolbar label="语音服务"><CandidateButton variant="outline" disabled={disabled || !!checking || !preset.connectionId} onClick={() => void discover(preset.connectionId, preset.model)}>
            {checking === preset.connectionId ? '正在读取服务…' : '读取实际引擎与声音'}
          </CandidateButton></CandidateToolbar>}
          <div className="candidate-character-inline">
            <CandidateField label="音色来源"><CandidateSelect value={voice.kind} disabled={disabled} onValueChange={kind => update(key, {
              voice: kind === 'reference' ? { kind, assetId: assets.find(asset => asset.kind === 'audio')?.id ?? '', transcript: '', locale: key } : { kind: 'id', value: '' },
            })}><option value="reference">参考录音</option><option value="id">服务声音标识</option></CandidateSelect></CandidateField>
            <CharacterNumber field={'voice/' + key + '/speed'} label="默认语速" unit="倍" value={preset.speed} min={.25} max={4} disabled={disabled} change={speed => update(key, { speed })}/>
          </div>
          {voice.kind === 'reference' ? <>
            <div className="candidate-character-control-actions">
              <CandidateField label="参考音频"><CandidateSelect value={voice.assetId} disabled={disabled} onValueChange={assetId => update(key, { voice: { ...voice, assetId } })}>
                <option value="">选择音频素材</option>{options(assets.filter(asset => asset.kind === 'audio').map(asset => ({ value: asset.id, label: asset.name })), voice.assetId, '参考音频缺失')}
              </CandidateSelect></CandidateField>
              <CandidateButton disabled={!voice.assetId} onClick={() => openAsset(voice.assetId)}><Volume2 size={14}/>试听参考</CandidateButton>
            </div>
            <CandidateField label="参考录音语言"><CandidateInput value={voice.locale} disabled={disabled} onChange={event => update(key, { voice: { ...voice, locale: event.target.value } })}/></CandidateField>
            <CandidateField label="准确参考逐字稿" className="candidate-character-long"><CandidateTextarea rows={2} value={voice.transcript} disabled={disabled} onChange={event => update(key, { voice: { ...voice, transcript: event.target.value } })}/></CandidateField>
          </> : <CandidateField label="服务声音">{catalog ? <CandidateSelect value={voice.value} disabled={disabled} onValueChange={next => update(key, { voice: { kind: 'id', value: next } })}>
            <option value="">选择实际声音</option>{options(catalog.voices.filter(item => !item.engine || item.engine === preset.model).map(item => ({ value: item.id, label: item.language ? item.name + ' · ' + item.language : item.name })), voice.value, voice.value + ' · 目录缺失，请重绑')}
          </CandidateSelect> : <CandidateInput value={voice.value} disabled={disabled} onChange={event => update(key, { voice: { kind: 'id', value: event.target.value } })}/>}</CandidateField>}
          <CandidateField label="默认表演指令" className="candidate-character-long" hint={engine?.performance === 'none' ? '当前服务没有独立表演指令。请清空不适用的旧指令。' : undefined}>
            <CandidateTextarea rows={2} value={String(preset.advanced.performanceInstruction ?? '')} disabled={disabled} onChange={event => update(key, { advanced: { ...preset.advanced, performanceInstruction: event.target.value } })}/>
          </CandidateField>
        </CandidateSection>;
      })}
      {languages.some(language => !value[language]) && <CandidateToolbar label="按语言添加参考音色">{languages.filter(language => !value[language]).map(language =>
        <CandidateButton key={language} variant="outline" disabled={disabled || !available.length} onClick={() => {
          const connection = available[0]!;
          change({ voicePresets: { ...value, [language]: { id: createId(value), revision: 1, locale: language, connectionId: connection.id, model: connection.model,
            voice: { kind: 'reference', assetId: assets.find(asset => asset.kind === 'audio')?.id ?? '', transcript: '', locale: language }, speed: 1, emotion: null, advanced: {} } } });
        }}><Plus size={14}/>{language}</CandidateButton>
      )}</CandidateToolbar>}
    </CandidateSection>
    {error && <p role="alert">{error}</p>}
  </>;
}
