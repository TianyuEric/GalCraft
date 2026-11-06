import { useEffect, useState } from 'react';
import { BuiltinPlayerMenuLocales, ProjectLanguagesSchema, type ProjectLanguages } from '@galcraft/contracts';
import type { ProjectLanguageGuiDraft } from '../../../authoring/project-languages.js';
import type { CandidateSession } from '../application/session.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateInput, CandidateSection, CandidateSelect } from '../components/controls/index.js';
import { SettingsCommit } from './settings-project.js';
import { resultValue, workfaceError } from './workface-helpers.js';

const key = 'settings/languages';
const names: Record<string, string> = { 'zh-CN': '简体中文', en: 'English', ja: '日本語' };

export function CandidateLanguageFields({ store, value }: { store: CandidateSession; value: ProjectLanguages }) {
  const remembered = store.viewState<ProjectLanguageGuiDraft>(key);
  const [draft, setDraft] = useState(() => structuredClone(remembered?.draft ?? value));
  const [baseline, setBaseline] = useState(() => remembered?.baseline ?? JSON.stringify(value));
  const [additional, setAdditional] = useState(remembered?.additional ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const valueDirty = JSON.stringify(draft) !== baseline, dirty = valueDirty || additional.length > 0;
  const reset = () => {
    setDraft(structuredClone(value)); setBaseline(JSON.stringify(value)); setAdditional(''); setError(''); setStatus('');
  };
  useEffect(() => {
    store.rememberViewState(key, { draft, baseline, additional } satisfies ProjectLanguageGuiDraft);
    store.setViewPending(key, dirty);
  }, [store, draft, baseline, additional, dirty]);
  useEffect(() => { if (!dirty) { setDraft(structuredClone(value)); setBaseline(JSON.stringify(value)); } }, [value]);
  const change = (next: ProjectLanguages) => { setDraft(next); setError(''); setStatus(''); };
  const toggle = (group: 'menus' | 'voices', item: string) => {
    const items = draft[group].includes(item) ? draft[group].filter(value => value !== item) : [...draft[group], item];
    if (group === 'menus' && !items.length) return;
    const defaultKey = group === 'menus' ? 'menuDefault' : 'voiceDefault';
    change({ ...draft, [group]: items, [defaultKey]: items.includes(draft[defaultKey]) ? draft[defaultKey] : items[0] ?? draft.voiceDefault });
  };
  const commit = async () => {
    if (additional.trim()) { setError('请先添加或清空新的配音语言。'); return; }
    const checked = ProjectLanguagesSchema.safeParse(draft);
    if (!checked.success) {
      const field = checked.error.issues[0]?.path[0];
      setError(field === 'textDefault' ? '请填写正文源语言，例如 zh-CN。' : field === 'voiceDefault' || field === 'voices'
        ? '请检查配音语言列表，并选择一个已启用的默认配音语言。' : '请至少启用一种菜单语言，并选择一个已启用的默认菜单语言。');
      return;
    }
    setBusy(true); setError('');
    try {
      resultValue(await store.controller.setLanguages(checked.data)); store.refreshFromHost();
      setDraft(checked.data); setBaseline(JSON.stringify(checked.data)); setAdditional(''); setStatus('已应用到作品工作区。');
    } catch (reason) { setError(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  const choices = (group: 'menus' | 'voices', items: readonly string[]) => <div className="candidate-settings-checks">
    {items.map(item => <label key={item} className="candidate-settings-check">
      <CandidateCheckbox checked={draft[group].includes(item)} disabled={busy || group === 'menus' && draft.menus.length === 1 && draft.menus[0] === item}
        onChange={() => toggle(group, item)}/>{names[item] ?? item}
    </label>)}
  </div>;
  const options = (values: string[]) => values.map(item => <option key={item} value={item}>{names[item] ?? item}</option>);
  return <>
    <div className="candidate-document-scroll candidate-settings-scroll"><div className="candidate-settings-fields-body">
      <CandidateSection title="菜单与系统界面">
        {choices('menus', BuiltinPlayerMenuLocales)}
        <CandidateField label="默认菜单语言" layout="row" hint="仅启用一种时，Player 隐藏菜单语言切换。">
          <CandidateSelect value={draft.menuDefault} disabled={busy} onValueChange={menuDefault => change({ ...draft, menuDefault })}>{options(draft.menus)}</CandidateSelect>
        </CandidateField>
      </CandidateSection>
      <CandidateSection title="剧情正文">
        <CandidateField label="正文源语言" layout="row" hint="用于排版，例如 zh-CN。菜单切换保留作者原文。">
          <CandidateInput value={draft.textDefault} disabled={busy} onChange={event => change({ ...draft, textDefault: event.target.value })}/>
        </CandidateField>
      </CandidateSection>
      <CandidateSection title="角色配音">
        {choices('voices', [...new Set([...BuiltinPlayerMenuLocales, ...draft.voices])])}
        <form className="candidate-settings-inline candidate-settings-action-field" onSubmit={event => {
          event.preventDefault();
          try {
            const item = new Intl.Locale(additional.trim()).toString();
            if (!draft.voices.includes(item)) change({ ...draft, voices: [...draft.voices, item], voiceDefault: draft.voices.length ? draft.voiceDefault : item });
            setAdditional(''); setError('');
          } catch { setError('请输入有效的语言标签，例如 ko。'); }
        }}>
          <CandidateField label="其他配音语言"><CandidateInput placeholder="ko, fr, es…" value={additional} disabled={busy}
            onChange={event => { setAdditional(event.target.value); setError(''); setStatus(''); }}/></CandidateField>
          <CandidateButton variant="outline" density="standard" type="submit" disabled={busy || !additional.trim()}>添加语言</CandidateButton>
        </form>
        {draft.voices.length ? <CandidateField label="默认配音语言" layout="row">
          <CandidateSelect value={draft.voiceDefault} disabled={busy} onValueChange={voiceDefault => change({ ...draft, voiceDefault })}>{options(draft.voices)}</CandidateSelect>
        </CandidateField> : <p className="candidate-settings-hint">未启用配音语言时，Player 隐藏配音语言项。</p>}
        <p className="candidate-settings-hint">配音与菜单独立。缺少所选语言时，依次使用作品默认配音、通用语音或静音。</p>
      </CandidateSection>
    </div></div>
    <SettingsCommit title="语言设置" dirty={dirty} busy={busy} error={error} status={status} reset={reset} apply={() => void commit()}/>
  </>;
}
