import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { JsonSchema, UIInteractionSchema, type ComponentConfig, type Json, type PageConfig, type UIInteraction } from '@galcraft/contracts';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateSection, CandidateSelect, CandidateState, CandidateTextarea, CandidateToolbar } from '../components/controls/index.js';
import { currentPageComponent, editPage, type PageStore } from './page-edit.js';
import { z } from 'zod';
import { readTemplateDocuments } from '@galcraft/templates';
import { workfaceError } from './workface-helpers.js';
import { PageActionFields, PageConditionFields } from './page-data-actions.js';
import { PageScalarValue, pageValueContext } from './page-data-values.js';

const events = { click: '点击', change: '值已改变', input: '正在输入', submit: '提交', focus: '获得焦点', blur: '失去焦点', pointerEnter: '指针进入', pointerLeave: '指针离开' };
type BehaviorDraft = { baseline: string; interactions: UIInteraction[]; advanced?: string };

export function pageBehaviorPending(store: PageStore, viewId: string) {
  return Object.keys(store.viewState<Record<string, BehaviorDraft>>(viewId + '/events') ?? {}).length > 0
    || !!store.viewState<LocalStateDraft>(viewId + '/local-state');
}

export function CandidatePageBehavior({ store, viewId, page, component, pages, onPending }: {
  store: PageStore;
  viewId: string;
  page: PageConfig;
  component: ComponentConfig;
  pages: readonly { value: string; label: string }[];
  onPending: () => void;
}) {
  const key = viewId + '/events';
  const context = { ...pageValueContext(store, page), pages };
  const interactions = component.interactions ?? [];
  const baseline = JSON.stringify(interactions);
  const retained = store.viewState<Record<string, BehaviorDraft>>(key)?.[component.id];
  const [draft, setDraft] = useState<BehaviorDraft>(() => retained ?? { baseline, interactions });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const dirty = JSON.stringify(draft.interactions) !== draft.baseline || draft.advanced !== undefined;
  const value = dirty ? draft : { baseline, interactions };
  const conflict = dirty && draft.baseline !== baseline;
  const set = (next: BehaviorDraft) => {
    const all = { ...store.viewState<Record<string, BehaviorDraft>>(key) };
    if (JSON.stringify(next.interactions) === next.baseline && next.advanced === undefined) delete all[component.id];
    else all[component.id] = next;
    store.rememberViewState(key, all);
    setDraft(next);
    onPending();
  };
  const update = (edit: (items: UIInteraction[]) => void) => {
    const next = structuredClone(value.interactions);
    edit(next);
    set({ ...value, interactions: next });
    setError('');
  };
  const apply = async () => {
    setError('');
    setBusy(true);
    try {
      const latest = currentPageComponent(store, page.id, component.id);
      if (!latest || latest.locked || JSON.stringify(latest.interactions ?? []) !== value.baseline) throw new Error('组件或事件已变化。请重新读取后再应用。');
      const next = UIInteractionSchema.array().parse(value.advanced === undefined ? value.interactions : JSON.parse(value.advanced));
      await editPage(store, '配置组件交互', [{ kind: 'component.update', pageId: page.id, componentId: component.id, changes: { interactions: next } }]);
      const all = { ...store.viewState<Record<string, BehaviorDraft>>(key) };
      if (JSON.stringify(all[component.id]) === JSON.stringify(value)) {
        delete all[component.id];
        store.rememberViewState(key, all);
        if (alive.current) setDraft({ baseline: JSON.stringify(next), interactions: next });
      }
      onPending();
    } catch (reason) { if (alive.current) setError(workfaceError(reason)); }
    finally { if (alive.current) setBusy(false); }
  };
  return <CandidateSection title="可视化交互编辑">
    {component.locked && <p className="candidate-page-hint">组件已锁定。可在布局属性中解锁。</p>}
    <fieldset className="candidate-page-events" disabled={busy || component.locked}>
      <fieldset className="candidate-property-form" disabled={value.advanced !== undefined || conflict}>
      {!value.interactions.length && <CandidateState kind="empty" title="尚未配置交互" description="添加事件，设置触发时执行的动作。"/>}
      {value.interactions.map((event, index) => <CandidateSection title={`事件 ${index + 1}`} className="candidate-page-event" key={index}
        actions={<CandidateIconButton label="移除交互" onClick={() => update(items => items.splice(index, 1))}><Trash2 size={14}/></CandidateIconButton>}>
        <div data-interaction-index={index}>
          <CandidateField label="触发事件"><CandidateSelect value={event.event} onValueChange={eventName => update(items => { items[index]!.event = eventName as UIInteraction['event']; })}>
            {UIInteractionSchema.shape.event.options.map(name => <option key={name} value={name}>{events[name]}</option>)}
          </CandidateSelect></CandidateField>
          <details className="candidate-property-disclosure"><summary>{event.condition ? '执行条件 · 已配置' : '执行条件'}</summary>
            <PageConditionFields condition={event.condition} context={context} onChange={condition => update(items => {
              if (condition) items[index]!.condition = condition; else delete items[index]!.condition;
            })}/>
          </details>
          <ol className="candidate-page-actions">
            {event.actions.map((action, order) => <li key={order} data-action-index={order}>
              <PageActionFields action={action} context={context} onChange={next => update(items => { items[index]!.actions[order] = next; })}/>
              <CandidateToolbar label={`动作 ${order + 1} 顺序`}>
                <CandidateIconButton label="动作上移" disabled={order === 0} onClick={() => update(items => { const list = items[index]!.actions; [list[order - 1], list[order]] = [list[order]!, list[order - 1]!]; })}><ArrowUp size={14}/></CandidateIconButton>
                <CandidateIconButton label="动作下移" disabled={order === event.actions.length - 1} onClick={() => update(items => { const list = items[index]!.actions; [list[order + 1], list[order]] = [list[order]!, list[order + 1]!]; })}><ArrowDown size={14}/></CandidateIconButton>
                <CandidateIconButton label="移除动作" onClick={() => update(items => items[index]!.actions.splice(order, 1))}><Trash2 size={14}/></CandidateIconButton>
              </CandidateToolbar>
            </li>)}
          </ol>
          <CandidateButton onClick={() => update(items => items[index]!.actions.push({ kind: 'open', page: pages[0]?.value ?? 'title' }))}><Plus size={14}/>添加动作</CandidateButton>
        </div>
      </CandidateSection>)}
      <CandidateButton onClick={() => update(items => items.push({ event: 'click', actions: [] }))}><Plus size={14}/>添加交互</CandidateButton>
      </fieldset>
      <CandidateSection title="高级交互 JSON" collapsible initiallyOpen={false}>
        <CandidateField label="高级交互 JSON" hint="可编辑执行条件、局部值、参数绑定和插件动作。读取后可继续编辑常用字段。">
          <CandidateTextarea rows={6} value={value.advanced ?? JSON.stringify(value.interactions, null, 2)} onChange={event => set({ ...value, advanced: event.target.value })}/>
        </CandidateField>
        <CandidateButton disabled={value.advanced === undefined} onClick={() => {
          try { set({ baseline: value.baseline, interactions: UIInteractionSchema.array().parse(JSON.parse(value.advanced!)) }); setError(''); }
          catch (reason) { setError(workfaceError(reason)); }
        }}>读取高级配置</CandidateButton>
      </CandidateSection>
    </fieldset>
    {error && <p className="candidate-page-error" role="alert">{error}</p>}
    {conflict && <p className="candidate-page-error" role="alert">正式事件已变化。重新读取会放弃此组件的交互草稿。</p>}
    <CandidateToolbar label="交互提交">
      <CandidateButton variant="primary" disabled={!dirty || busy || conflict || component.locked} onClick={() => void apply()}>应用交互</CandidateButton>
      <CandidateButton disabled={!dirty || busy} onClick={() => { set({ baseline, interactions }); setError(''); }}>{conflict ? '重新读取' : '撤回草稿'}</CandidateButton>
    </CandidateToolbar>
  </CandidateSection>;
}

type LocalStateDraft = { baseline: string; values: Record<string, Json>; advanced?: string; keyInput?: string };
const localStateSchema = z.record(z.string().min(1), JsonSchema);

export function CandidatePageLocalState({ store, viewId, page, onPending }: {
  store: PageStore; viewId: string; page: PageConfig; onPending: () => void;
}) {
  const key = viewId + '/local-state', values = page.localState ?? {}, baseline = JSON.stringify(values);
  const [, refresh] = useState(0);
  const draft = store.viewState<LocalStateDraft>(key);
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState('');
  const value: LocalStateDraft = draft ?? { baseline, values };
  const name = value.keyInput ?? '';
  const conflict = !!draft && draft.baseline !== baseline;
  const update = (next?: LocalStateDraft) => {
    if (next && next.advanced === undefined && !next.keyInput && JSON.stringify(next.values) === baseline) next = undefined;
    store.rememberViewState(key, next);
    refresh(revision => revision + 1);
    onPending();
  };
  const add = () => {
    setFault('');
    try {
      const id = name.trim();
      if (!id || Object.hasOwn(value.values, id)) throw new Error('请填写未使用的局部键。');
      update({ ...value, values: { ...value.values, [id]: '' }, keyInput: undefined });
    } catch (reason) { setFault(workfaceError(reason)); }
  };
  const apply = async () => {
    setBusy(true); setFault('');
    try {
      const latest = readTemplateDocuments(store.host.list()).pages.find(item => item.id === page.id);
      if (!latest || JSON.stringify(latest.localState ?? {}) !== draft?.baseline) throw new Error('局部状态已变化。请重新读取后应用。');
      if (name.trim()) throw new Error('请先声明新局部键，或清空尚未声明的名称。');
      const localState = localStateSchema.parse(value.advanced === undefined ? value.values : JSON.parse(value.advanced));
      await editPage(store, '配置局部状态', [{ kind: 'page.update', pageId: page.id, localState }]);
      update();
    } catch (reason) { setFault(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  return <CandidateSection title="页面局部状态" collapsible initiallyOpen={false}>
    <fieldset className="candidate-property-form" disabled={busy || conflict}>
      <fieldset className="candidate-property-form" disabled={value.advanced !== undefined}>
      {Object.entries(value.values).map(([id, initial]) => <CandidateFieldGroup key={id} title={id}>
        <PageScalarValue label={`${id} 初始值`} value={initial} onChange={next => update({ ...value, values: { ...value.values, [id]: next } })}/>
        <CandidateButton onClick={() => update({ ...value, values: Object.fromEntries(Object.entries(value.values).filter(([entry]) => entry !== id)) })}><Trash2 size={14}/>移除此局部值</CandidateButton>
      </CandidateFieldGroup>)}
      <div className="candidate-property-option"><CandidateField label="新局部键"><CandidateInput density="compact" value={name} data-local-history onChange={event => update({ ...value, keyInput: event.target.value })}/></CandidateField>
        <CandidateButton disabled={!name.trim()} onClick={add}><Plus size={14}/>声明局部值</CandidateButton></div>
      </fieldset>
      <details className="candidate-property-disclosure"><summary>高级局部状态 · 集合与对象</summary>
        <CandidateField label="初始值 (JSON)" hint={value.advanced !== undefined ? '读取高级配置后可继续编辑可视化字段。' : undefined}>
          <CandidateTextarea rows={5} value={value.advanced ?? JSON.stringify(value.values, null, 2)} data-local-history onChange={event => { setFault(''); update({ ...value, advanced: event.target.value }); }}/>
        </CandidateField>
        <CandidateButton disabled={value.advanced === undefined} onClick={() => {
          try { update({ ...value, values: localStateSchema.parse(JSON.parse(value.advanced!)), advanced: undefined }); setFault(''); }
          catch (reason) { setFault(workfaceError(reason)); }
        }}>读取高级配置</CandidateButton>
      </details>
    </fieldset>
    {fault && <p role="alert" className="candidate-page-error">{fault}</p>}
    {conflict && <p role="alert" className="candidate-page-error">正式局部状态已变化。重新读取会放弃本地草稿。</p>}
    <CandidateToolbar label="局部状态提交">
      <CandidateButton disabled={!draft || busy || conflict} onClick={() => void apply()}>应用局部状态</CandidateButton>
      <CandidateButton disabled={!draft || busy} onClick={() => update()}>{conflict ? '重新读取' : '撤回草稿'}</CandidateButton>
    </CandidateToolbar>
  </CandidateSection>;
}
