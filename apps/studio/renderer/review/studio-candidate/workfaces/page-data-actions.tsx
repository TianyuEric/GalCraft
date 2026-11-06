import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { OfficialActionSchema, type Json, type OfficialAction, type UIAction, type UICondition, type UIValueBinding } from '@galcraft/contracts';
import { UIBindingFields } from '@galcraft/templates';
import { z } from 'zod';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput } from '../components/controls/index.js';
import { PageChoiceField, type PageChoice } from './page-property-fields.js';
import { PageScalarValue, PageValueField, type PageValueContext } from './page-data-values.js';

type BehaviorContext = PageValueContext & { pages: readonly PageChoice[] };
const conditionOps = [{ value: 'none', label: '始终执行' }, { value: 'truthy', label: '值为真' }, { value: 'equals', label: '等于' }, { value: 'notEquals', label: '不等于' }, { value: 'greater', label: '大于' }, { value: 'less', label: '小于' }, { value: 'all', label: '全部满足' }, { value: 'any', label: '任一满足' }, { value: 'not', label: '条件取反' }] as const;
const literal = (value: Json = true): UIValueBinding => ({ source: 'literal', value });
const truthy = (): UICondition => ({ op: 'truthy', value: literal() });

export function PageConditionFields({ condition, context, onChange, nested = false }: {
  condition?: UICondition; context: BehaviorContext; onChange: (value?: UICondition) => void; nested?: boolean;
}) {
  const changeType = (op: (typeof conditionOps)[number]['value']) => {
    if (op === 'none') onChange();
    else if (op === 'truthy') onChange(truthy());
    else if (op === 'all' || op === 'any') onChange({ op, conditions: [truthy()] });
    else if (op === 'not') onChange({ op, condition: truthy() });
    else onChange({ op, left: literal(), right: literal() });
  };
  return <div className={nested ? 'candidate-property-condition' : 'candidate-property-form'}>
    <PageChoiceField label="条件类型" value={condition?.op ?? 'none'} options={conditionOps} onChange={changeType}/>
    {condition?.op === 'truthy' && <PageValueField label="条件值" value={condition.value} context={context} onChange={value => onChange({ ...condition, value })}/>}
    {condition && 'left' in condition && <>
      <PageValueField label="条件左值" value={condition.left} context={context} onChange={left => onChange({ ...condition, left })}/>
      <PageValueField label="条件右值" value={condition.right} context={context} onChange={right => onChange({ ...condition, right })}/>
    </>}
    {condition?.op === 'not' && <PageConditionFields nested condition={condition.condition} context={context} onChange={value => onChange({ op: 'not', condition: value ?? truthy() })}/>}
    {condition && 'conditions' in condition && <>
      {condition.conditions.map((child, index) => <div className="candidate-property-condition" key={index}>
        <PageConditionFields condition={child} context={context} onChange={value => onChange({ ...condition, conditions: value ? condition.conditions.map((entry, at) => at === index ? value : entry) : condition.conditions.filter((_, at) => at !== index) })}/>
        <CandidateButton onClick={() => onChange({ ...condition, conditions: condition.conditions.filter((_, at) => at !== index) })}><Trash2 size={14}/>移除子条件</CandidateButton>
      </div>)}
      <CandidateButton onClick={() => onChange({ ...condition, conditions: [...condition.conditions, truthy()] })}><Plus size={14}/>添加子条件</CandidateButton>
    </>}
  </div>;
}

const actionKinds = [{ value: 'open', label: '打开页面' }, { value: 'back', label: '返回上一页' }, { value: 'official', label: '公开游戏动作' },
  { value: 'setLocal', label: '设置局部值' }, { value: 'toggleLocal', label: '切换局部开关' }, { value: 'plugin', label: '插件公开动作' }] as const;
const officialNames: Record<OfficialAction['kind'], string> = {
  start: '开始新游戏', continue: '继续游戏', open: '打开页面', back: '返回上一页', advance: '推进阅读', toggleUI: '切换界面显示', toggleAuto: '切换自动阅读',
  toggleSkip: '切换快进', replayVoice: '重播语音', quickSave: '快速保存', quickLoad: '快速读取', saveSlot: '保存到存档槽', loadSlot: '读取存档槽',
  selectOption: '选择选项', submitInput: '提交输入', cancelInput: '取消输入', jumpHistory: '跳转到历史记录', playHistoryVoice: '播放历史语音', openCg: '打开 CG',
  nextDifference: '切换 CG 差分', music: '音乐播放操作', enterFlow: '进入流程节点', returnTitle: '返回标题页', exit: '退出游戏', toolbarLock: '锁定工具栏',
  toolbarReveal: '显示工具栏', preference: '设置玩家偏好', resetPreferences: '重置玩家偏好', exportData: '导出玩家数据', importData: '导入玩家数据',
  clearData: '清除玩家数据', emergency: '紧急回避', videoRetry: '重试影片', confirm: '确认操作',
};
const paramNames: Record<string, string> = { page: '目标页面', path: '偏好属性路径', value: '参数值', text: '提交文字', slotId: '存档槽 ID', optionId: '选项 ID', historyId: '历史记录 ID', entryId: '条目 ID', delta: '差分方向', op: '播放操作', seconds: '秒数', flowId: '流程 ID', nodeId: '节点 ID', locked: '锁定', paths: '属性路径', scopes: '数据范围', planId: '导入计划 ID', enabled: '启用', requestId: '请求 ID', accepted: '确认', remember: '记住选择' };

export function PageActionFields({ action, context, onChange }: {
  action: UIAction; context: BehaviorContext; onChange: (value: UIAction) => void;
}) {
  const locals = (booleanOnly: boolean) => Object.entries(context.local).filter(([, value]) => !booleanOnly || typeof value === 'boolean').map(([key]) => ({ value: key, label: key }));
  const changeKind = (kind: (typeof actionKinds)[number]['value']) => {
    if (kind === 'open') onChange({ kind, page: context.pages[0]?.value ?? 'title' });
    else if (kind === 'back' || kind === 'official') onChange({ kind: 'official', action: { kind: kind === 'back' ? 'back' : 'start' } });
    else if (kind === 'setLocal') onChange({ kind, key: locals(false)[0]?.value ?? '', value: literal('') });
    else if (kind === 'toggleLocal') onChange({ kind, key: locals(true)[0]?.value ?? '' });
    else onChange({ kind, key: '', arguments: {} });
  };
  const back = action.kind === 'official' && action.action.kind === 'back' && !Object.keys(action.bindings ?? {}).length;
  return <>
    <PageChoiceField label="动作类型" value={back ? 'back' : action.kind} options={actionKinds} onChange={changeKind}/>
    {action.kind === 'open' && <PageChoiceField label="目标页面" value={action.page} options={context.pages} onChange={page => onChange({ kind: 'open', page })}/>}
    {(action.kind === 'setLocal' || action.kind === 'toggleLocal') && <>
      <PageChoiceField label="目标局部键" value={action.key} options={locals(action.kind === 'toggleLocal')} onChange={key => onChange({ ...action, key })}
        hint={!locals(action.kind === 'toggleLocal').length ? '先在页面局部状态中声明相容值。' : undefined}/>
      {action.kind === 'setLocal' && <PageValueField label="写入值" value={action.value} context={context} onChange={value => onChange({ ...action, value })}/>}
    </>}
    {action.kind === 'plugin' && <>
      <CandidateField label="公开动作键" hint="填写已安装插件声明的完整动作键。"><CandidateInput density="compact" data-local-history value={action.key} onChange={event => onChange({ ...action, key: event.target.value })}/></CandidateField>
      <PageActionBindings bindings={action.arguments} context={context} onChange={args => onChange({ ...action, arguments: args })}/>
    </>}
    {action.kind === 'official' && !back && <OfficialActionFields action={action} context={context} onChange={onChange}/>}
  </>;
}

function OfficialActionFields({ action, context, onChange }: {
  action: Extract<UIAction, { kind: 'official' }>; context: BehaviorContext; onChange: (value: UIAction) => void;
}) {
  const schemas = OfficialActionSchema.options;
  const shape = schemas.find(schema => schema.shape.kind.value === action.action.kind)!.shape;
  const parameters = action.action as Record<string, Json>;
  const defaultParameters = (kind: OfficialAction['kind']) => {
    const shape = schemas.find(schema => schema.shape.kind.value === kind)!.shape;
    const next: Record<string, Json> = { kind };
    for (const [key, field] of Object.entries(shape)) {
      if (key === 'kind' || field instanceof z.ZodOptional) continue;
      next[key] = key === 'page' ? context.pages[0]?.value ?? 'title' : key === 'path' && kind === 'preference' ? 'volumes.master' : key === 'delta' ? 1
        : field instanceof z.ZodBoolean ? false : field instanceof z.ZodNumber ? 0 : field instanceof z.ZodEnum ? String(field.options[0]) : field instanceof z.ZodArray ? [] : '';
    }
    return next as OfficialAction;
  };
  return <>
    <PageChoiceField label="游戏动作" value={action.action.kind} options={schemas.map(schema => ({ value: schema.shape.kind.value, label: officialNames[schema.shape.kind.value] }))}
      onChange={kind => onChange({ kind: 'official', action: defaultParameters(kind) })}/>
    {Object.entries(shape).filter(([key]) => key !== 'kind').map(([key, raw]) => {
      const field = raw instanceof z.ZodOptional ? raw.unwrap() : raw, label = paramNames[key] ?? key;
      const change = (value?: Json) => {
        const next = { ...parameters };
        if (value === undefined) delete next[key]; else next[key] = value;
        onChange({ ...action, action: next as OfficialAction });
      };
      if (key === 'page') return <PageChoiceField key={key} label={label} value={String(parameters[key] ?? '')} options={context.pages} onChange={change}/>;
      if (key === 'path' && action.action.kind === 'preference') return <PageChoiceField key={key} label={label} value={String(parameters[key] ?? '')} options={UIBindingFields.filter(path => path.value.startsWith('preferences.')).map(path => ({ value: path.value.slice(12), label: path.label }))} onChange={change}/>;
      if (key === 'delta') return <PageChoiceField key={key} label={label} value={String(parameters[key])} options={[{ value: '-1', label: '上一个差分' }, { value: '1', label: '下一个差分' }]} onChange={next => change(Number(next))}/>;
      if (key === 'value') return <PageScalarValue key={key} label={label} value={parameters[key] ?? ''} onChange={change}/>;
      if (field instanceof z.ZodBoolean) return <PageChoiceField key={key} label={label} value={String(parameters[key])} options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} onChange={next => change(next === 'true')}/>;
      if (field instanceof z.ZodEnum) return <PageChoiceField key={key} label={label} value={String(parameters[key] ?? '')} options={field.options.map(value => ({ value: String(value), label: String(value) }))} onChange={change}/>;
      if (field instanceof z.ZodArray) return <ActionArray key={key} label={label} value={Array.isArray(parameters[key]) ? parameters[key] as Json[] : []}
        options={field.element instanceof z.ZodEnum ? field.element.options.map(value => ({ value: String(value), label: String(value) })) : undefined} onChange={change}/>;
      return <CandidateField key={key} label={label}><CandidateInput density="compact" data-local-history value={String(parameters[key] ?? '')} type={field instanceof z.ZodNumber ? 'number' : 'text'} step={field instanceof z.ZodNumber ? 'any' : undefined}
        onChange={event => change(event.target.value === '' && raw instanceof z.ZodOptional ? undefined : field instanceof z.ZodNumber ? event.target.value === '' ? 0 : event.target.valueAsNumber : event.target.value)}/></CandidateField>;
    })}
    <details className="candidate-property-disclosure"><summary>参数数据绑定</summary>
      <PageActionBindings bindings={action.bindings ?? {}} context={context} onChange={bindings => onChange({ ...action, bindings })}/>
    </details>
  </>;
}

function ActionArray({ label, value, options, onChange }: { label: string; value: Json[]; options?: PageChoice[]; onChange: (values: Json[]) => void }) {
  return <CandidateFieldGroup title={label}>
    {value.map((item, index) => <div className="candidate-property-option" key={index}>
      {options ? <PageChoiceField label={`${label} ${index + 1}`} value={String(item)} options={options} onChange={next => onChange(value.map((entry, at) => at === index ? next : entry))}/>
        : <CandidateField label={`${label} ${index + 1}`}><CandidateInput density="compact" data-local-history value={String(item)} onChange={event => onChange(value.map((entry, at) => at === index ? event.target.value : entry))}/></CandidateField>}
      <CandidateIconButton label={`移除${label} ${index + 1}`} onClick={() => onChange(value.filter((_, at) => at !== index))}><Trash2 size={14}/></CandidateIconButton>
    </div>)}
    <CandidateButton onClick={() => onChange([...value, options?.[0]?.value ?? ''])}><Plus size={14}/>添加一项</CandidateButton>
  </CandidateFieldGroup>;
}

function PageActionBindings({ bindings, context, onChange }: { bindings: Record<string, UIValueBinding>; context: BehaviorContext; onChange: (values: Record<string, UIValueBinding>) => void }) {
  const [name, setName] = useState('');
  return <div className="candidate-property-form">
    {Object.entries(bindings).map(([key, value]) => <div className="candidate-property-binding" key={key}>
      <PageValueField label={key} value={value} context={context} onChange={next => onChange({ ...bindings, [key]: next })}/>
      <CandidateButton onClick={() => onChange(Object.fromEntries(Object.entries(bindings).filter(([entry]) => entry !== key)))}><Trash2 size={14}/>移除参数</CandidateButton>
    </div>)}
    <div className="candidate-property-option">
      <CandidateField label="参数名称"><CandidateInput density="compact" value={name} onChange={event => setName(event.target.value)}/></CandidateField>
      <CandidateButton disabled={!name.trim() || Object.hasOwn(bindings, name.trim())} onClick={() => { onChange({ ...bindings, [name.trim()]: literal('') }); setName(''); }}><Plus size={14}/>添加参数</CandidateButton>
    </div>
  </div>;
}
