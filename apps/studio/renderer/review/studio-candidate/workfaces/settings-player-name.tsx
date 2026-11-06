import { useEffect, useState } from 'react';
import { countNameCharacters, type PlayerName } from '@galcraft/contracts';
import type { AuthoringSource } from '../../../authoring/controller.js';
import type { PlayerNameGuiDraft } from '../../../authoring/player-name.js';
import type { CandidateSession } from '../application/session.js';
import { CandidateButton, CandidateField, CandidateInput, CandidateSection, CandidateSelect } from '../components/controls/index.js';
import { SettingsCommit } from './settings-project.js';
import { resultValue, workfaceError } from './workface-helpers.js';

const key = 'settings/player-name';
type NameValues = [mode: string, character: string, name: string, limit: string, variable: string, policy: string];
function savedValues(source: AuthoringSource): NameValues {
  const value = source.project.player.name, first = source.characters.find(item => item.narrativeRole === 'viewpoint');
  return [value ? value.allowCustom ? 'custom' : 'fixed' : 'off', value?.characterId ?? first?.id ?? '', value?.defaultName ?? first?.name ?? '',
    String(value?.maxLength ?? 24), value?.variableId ?? '', value?.promptPolicy ?? 'always'];
}

export function CandidateNameFields({ store, source, openCharacters }: { store: CandidateSession; source: AuthoringSource; openCharacters(): void }) {
  const remembered = store.viewState<PlayerNameGuiDraft>(key);
  const [values, setValues] = useState<NameValues>(() => remembered?.values as NameValues | undefined ?? savedValues(source));
  const [baseline, setBaseline] = useState<NameValues>(() => remembered?.baseline as NameValues | undefined ?? savedValues(source));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [mode, character, name, limit, variable, policy] = values;
  const dirty = values.some((value, index) => value !== baseline[index]);
  const viewpoints = source.characters.filter(item => item.narrativeRole === 'viewpoint');
  const variables = (source.variables ?? []).filter(item => item.scope === 'progress' && item.type === 'string');
  const active = mode !== 'off', custom = mode === 'custom';
  const visibleLength = countNameCharacters(name), maxLength = Number(limit);
  const change = (index: number, value: string) => {
    setValues(previous => previous.map((old, i) => i === index ? value : old) as NameValues); setError(''); setStatus('');
  };
  const reset = () => { const next = savedValues(source); setValues(next); setBaseline(next); setError(''); setStatus(''); };
  useEffect(() => {
    store.rememberViewState(key, { values, baseline, numberDraft: limit === String(maxLength) && Number.isFinite(maxLength) ? null : { raw: limit, value: Number.isFinite(maxLength) ? maxLength : null } } satisfies PlayerNameGuiDraft);
    store.setViewPending(key, dirty);
  }, [store, values, baseline, dirty]);
  useEffect(() => { if (!dirty) reset(); }, [source]);
  const commit = async () => {
    if (active && !viewpoints.some(item => item.id === character)) { setError('请选择一位玩家视角角色。'); return; }
    if (active && (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 100)) { setError('姓名长度上限须为 1～100 的整数。'); return; }
    if (active && (!name.trim() || visibleLength > maxLength)) {
      setError(!name.trim() ? '请填写默认姓名。' : '默认姓名超过长度上限，请缩短姓名或提高上限。'); return;
    }
    setBusy(true); setError('');
    try {
      resultValue(await store.controller.setPlayerName(active ? {
        characterId: character, defaultName: name.trim(), allowCustom: custom, variableId: custom ? variable || null : null,
        maxLength, promptPolicy: policy as PlayerName['promptPolicy'],
      } : null));
      setBaseline(values); setStatus('已应用到作品工作区。'); store.refreshFromHost();
    } catch (reason) { setError(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  return <>
    <div className="candidate-document-scroll candidate-settings-scroll"><div className="candidate-settings-fields-body">
      <CandidateSection title="姓名规则">
        <p className="candidate-settings-hint">姓名用于玩家视角角色的对白，随正篇存档保存。</p>
        <CandidateField label="姓名方式" layout="row"><CandidateSelect value={mode} disabled={busy} onValueChange={value => change(0, value)}>
          <option value="off">保持角色原名</option><option value="fixed">固定主角姓名</option><option value="custom">玩家可自定义</option>
        </CandidateSelect></CandidateField>
        {!viewpoints.length && <div className="candidate-settings-inline">
          <p className="candidate-settings-hint">先将一位角色的全局身份设为玩家视角。</p>
          <CandidateButton variant="outline" onClick={openCharacters}>创建或设置视角角色</CandidateButton>
        </div>}
        {active && <>
          <CandidateField label="玩家视角角色" layout="row"><CandidateSelect value={character} disabled={busy || !viewpoints.length} onValueChange={value => change(1, value)}>
            {!character && <option value="">选择视角角色</option>}
            {character && !viewpoints.some(item => item.id === character) && <option value={character} disabled>原关联角色需要先设为玩家视角</option>}
            {viewpoints.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </CandidateSelect></CandidateField>
          <div className="candidate-settings-inline">
            <CandidateField label="默认姓名" hint={'已输入 ' + visibleLength + ' / ' + limit + ' 个可见字符。'}>
              <CandidateInput value={name} placeholder="例如：春树" required disabled={busy} onChange={event => change(2, event.target.value)}/>
            </CandidateField>
            <CandidateField label="姓名长度上限" unit="字符" className="candidate-settings-number">
              <CandidateInput inputMode="numeric" value={limit} disabled={busy} onChange={event => change(3, event.target.value)}/>
            </CandidateField>
          </div>
          {custom && <>
            <CandidateField label="何时确认姓名" layout="row"><CandidateSelect value={policy} disabled={busy} onValueChange={value => change(5, value)}>
              <option value="always">每次新游戏确认</option><option value="firstAndAfterCompletion">首次及正篇结束后确认</option>
            </CandidateSelect></CandidateField>
            <CandidateField label="保存姓名的变量" layout="row"><CandidateSelect value={variable} disabled={busy} onValueChange={value => change(4, value)}>
              <option value="">自动创建或复用「主角姓名」变量</option>
              {variable && !variables.some(item => item.id === variable) && <option value={variable} disabled>原变量不可用</option>}
              {variables.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </CandidateSelect></CandidateField>
          </>}
        </>}
      </CandidateSection>
    </div></div>
    <SettingsCommit title="姓名设置" dirty={dirty} busy={busy} error={error} status={status} reset={reset} apply={() => void commit()}/>
  </>;
}
