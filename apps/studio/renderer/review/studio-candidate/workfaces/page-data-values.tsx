import type { Json, PageConfig, UIValueBinding, Variable } from '@galcraft/contracts';
import { UIBindingFields } from '@galcraft/templates';
import { CandidateField, CandidateFieldGroup, CandidateInput } from '../components/controls/index.js';
import type { PageStore } from './page-edit.js';
import { PageChoiceField, type PageChoice } from './page-property-fields.js';

export type PageValueType = 'string' | 'number' | 'boolean' | 'collection';
type PageVariable = Variable & { sceneName?: string };
export type PageValueContext = { local: Record<string, Json>; variables: PageVariable[] };
export function pageValueContext(store: PageStore, page: PageConfig): PageValueContext {
  const source = store.controller.source;
  return { local: page.localState ?? {}, variables: (source?.variables ?? []).map(variable => ({
    ...variable, sceneName: source?.scenes.find(scene => scene.sceneId === variable.declaringSceneId)?.name,
  })) };
}

const types = [{ value: 'string', label: '文本' }, { value: 'number', label: '数值' }, { value: 'boolean', label: '布尔值' }, { value: 'null', label: '空值' }] as const;
export function PageScalarValue({ label, value, onChange, allowType = true }: {
  label: string; value: Json; onChange: (next: Json) => void; allowType?: boolean;
}) {
  if (value !== null && typeof value === 'object') return <p className="candidate-property-note">{label} · {Array.isArray(value) ? `${value.length} 项` : `${Object.keys(value).length} 个属性`}。在高级配置中编辑集合或对象。</p>;
  const kind = value === null ? 'null' : typeof value as 'string' | 'number' | 'boolean';
  return <div className="candidate-property-grid">
    {allowType && <PageChoiceField label={`${label}类型`} value={kind} options={types} onChange={next => onChange(next === 'null' ? null : next === 'number' ? 0 : next === 'boolean' ? false : '')}/>}
    {kind === 'boolean' ? <PageChoiceField label={label} value={String(value)} options={[{ value: 'true', label: '真' }, { value: 'false', label: '假' }]} onChange={next => onChange(next === 'true')}/>
      : kind !== 'null' && <CandidateField label={label}><CandidateInput density="compact" type={kind === 'number' ? 'number' : 'text'} step={kind === 'number' ? 'any' : undefined}
        value={String(value)} data-local-history onChange={event => {
          if (kind === 'string') onChange(event.target.value);
          else if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber);
        }}/></CandidateField>}
  </div>;
}

const dataPaths = UIBindingFields;
const itemPaths = ['id', 'name', 'description', 'text', 'speaker', 'slotId', 'recordId', 'number', 'empty', 'locked', 'disabled', 'restorable'] as const;
const sourceOptions = [
  { value: 'literal', label: '固定值' }, { value: 'local', label: '页面局部值' }, { value: 'data', label: '公开数据' },
  { value: 'variable', label: '剧情变量' }, { value: 'item', label: '当前列表项' }, { value: 'event', label: '本次事件' },
] as const;
const scopes = { progress: '当前进度', local: '场景调用', longTerm: '玩家资料' };

export function PageValueField({ label, value, context, onChange, type, writable, group = true }: {
  label: string; value: UIValueBinding; context: PageValueContext; onChange: (value: UIValueBinding) => void;
  type?: PageValueType; writable?: boolean; group?: boolean;
}) {
  const variables = context.variables.filter(variable => type !== 'collection' && (!type || type === 'string' || type === variable.type));
  const sources = sourceOptions.filter(option => {
    if (option.value === value.source) return true;
    if (writable) return option.value === 'data' || option.value === 'local';
    return option.value !== 'variable' || variables.length > 0;
  });
  const paths = (source: string): PageChoice[] => {
    if (source === 'data') return dataPaths.filter(path => (!writable || path.value.startsWith('preferences.')) && (!type || path.type === type));
    if (source === 'local') return Object.entries(context.local).filter(([, item]) => !type || (type === 'collection' ? Array.isArray(item) : typeof item === type)).map(([key]) => ({ value: key, label: key }));
    if (source === 'event') return [{ value: 'value', label: '事件值' }, { value: 'checked', label: '选中状态' }];
    return itemPaths.map(key => ({ value: key, label: key }));
  };
  const keyOf = (variable: PageVariable) => `${variable.scope}:${variable.id}`;
  const chosenVariable = value.source === 'variable' ? variables.find(variable => variable.id === value.variableId && variable.scope === value.scope) : undefined;
  const changeSource = (source: UIValueBinding['source']) => {
    if (source === 'variable') { const variable = variables[0]; if (variable) onChange({ source, variableId: variable.id, scope: variable.scope }); }
    else if (source === 'literal') onChange({ source, value: type === 'number' ? 0 : type === 'boolean' ? false : type === 'collection' ? [] : '' });
    else onChange({ source, path: paths(source)[0]?.value ?? 'value' });
  };
  const fields = <>
    <PageChoiceField label={`${label}来源`} value={value.source} options={sources} onChange={changeSource}/>
    {value.source === 'literal' && <PageScalarValue label={`${label}固定值`} value={value.value} onChange={item => onChange({ source: 'literal', value: item })}/>}
    {value.source === 'variable' && <>
      <PageChoiceField label="变量" value={`${value.scope}:${value.variableId}`} options={variables.map(variable => ({ value: keyOf(variable), label: [variable.name, scopes[variable.scope], variable.sceneName, variable.type].filter(Boolean).join(' · ') }))}
        onChange={key => { const variable = variables.find(item => keyOf(item) === key); if (variable) onChange({ ...value, variableId: variable.id, scope: variable.scope }); }}/>
      <CandidateField label="缺值文字" hint={chosenVariable ? 'Player 在变量尚无可读值时显示这段文字。' : '当前变量不可用。可以选择其他变量。'}>
        <CandidateInput density="compact" value={value.missingText ?? '—'} data-local-history onChange={event => onChange({ ...value, missingText: event.target.value })}/>
      </CandidateField>
    </>}
    {'path' in value && <>
      <PageChoiceField label={value.source === 'local' ? '局部键' : '属性'} value={value.path} options={paths(value.source)} onChange={path => onChange({ source: value.source, path })}
        hint={value.source === 'local' && !paths(value.source).length ? '请先在页面局部状态中声明相容类型的值。' : undefined}/>
      <details className="candidate-property-disclosure"><summary>自定义属性路径</summary>
        <CandidateField label="完整属性路径"><CandidateInput density="compact" value={value.path} data-local-history onChange={event => onChange({ source: value.source, path: event.target.value })}/></CandidateField>
      </details>
    </>}
  </>;
  return group ? <CandidateFieldGroup title={label}>{fields}</CandidateFieldGroup> : fields;
}
