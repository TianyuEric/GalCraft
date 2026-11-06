import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Plus, Trash2 } from 'lucide-react';
import { createId, UIAnimationSchema, type ComponentConfig, type UIAnimation } from '@galcraft/contracts';
import { applyBasicPageAnimations, createUIAnimationPreset, findComponent, putUIAnimation, readTemplateDocuments, removeUIAnimation, templateEdit, UIAnimationPresets, uiAnimationUses, type UIAnimationBinding } from '@galcraft/templates';
import { animationFrames } from '@galcraft/player-ui';
import { designerComponentName, designerPageName } from '../../../authoring/designer-labels.js';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateNumberField, CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar, type NumberInputDraft } from '../components/controls/index.js';
import { type PageStore, type PageTemplate } from './page-edit.js';
import { CandidateResourcePreview, type PageResourcePreviewInput } from './page-resource-preview.js';
import { resultValue, workfaceError } from './workface-helpers.js';

export type UIAnimationTarget = { componentId: string; event: UIAnimationBinding };
const names: Record<UIAnimationBinding, string> = { enter: '进入', exit: '退出', show: '显示', hide: '隐藏', hover: '悬停', focus: '焦点', pressed: '按下' };
type Draft = { value: UIAnimation; baseline: string; shared: boolean; binding: string | undefined; existing: boolean };
export const uiAnimationDraftKey = (id: string) => id + '/ui-animation';
export const uiAnimationNumberKey = (id: string) => id + '/ui-animation-numbers';
const fresh = (template: PageTemplate, locale: string) => createUIAnimationPreset('fadeIn', createId(template), locale);
const boundAnimation = (template: PageTemplate, target?: UIAnimationTarget) => target ? findComponent(template, target.componentId)?.animations[target.event] : undefined;
const numberFields = [
  { key: 'durationMs', label: '时长', initial: 0, min: 0, unit: 'ms', step: 1 },
  { key: 'opacity', label: '不透明度', initial: 1, min: 0, max: 1, step: .01 },
  { key: 'translateX', label: '水平位移', initial: 0, unit: 'px', step: 1 },
  { key: 'translateY', label: '垂直位移', initial: 0, unit: 'px', step: 1 },
  { key: 'scale', label: '缩放', initial: 1, step: .01 },
] as const;

export function CandidatePageUIAnimations({ store, viewId, template, target, locale, active, onPending }: {
  store: PageStore; viewId: string; template: PageTemplate; target?: UIAnimationTarget; locale: string; active: boolean; onPending: () => void;
}) {
  const draftKey = uiAnimationDraftKey(viewId);
  const [selected, setSelected] = useState(() => store.viewState<string>(viewId + '/selection') ?? boundAnimation(template, target) ?? (target ? '' : template.animations[0]?.id) ?? '');
  const [newAnimation, setNewAnimation] = useState(() => {
    const saved = store.viewState<Draft>(draftKey);
    return saved && !saved.existing ? UIAnimationSchema.parse(JSON.parse(saved.baseline)) : fresh(template, locale);
  });
  const [draft, setDraft] = useState(() => store.viewState<Draft>(draftKey));
  const [shared, setShared] = useState(() => store.viewState<Draft>(draftKey)?.shared ?? false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const [deleting, setDeleting] = useState(false);
  const numberKey = uiAnimationNumberKey(viewId);
  const [numbers, setNumbers] = useState(() => store.viewState<Record<string, NumberInputDraft>>(numberKey) ?? {});
  const [resetGeneration, setResetGeneration] = useState(0);
  const numericPending = Object.keys(numbers).length > 0;
  const specimen = useRef<HTMLButtonElement>(null);
  const playing = useRef<Animation | null>(null);
  const original = template.animations.find(item => item.id === selected) ?? newAnimation;
  const value = draft?.value ?? original;
  const existing = template.animations.some(item => item.id === value.id);
  const uses = uiAnimationUses(template, value.id);
  const targetComponent = target && findComponent(template, target.componentId);
  const targetBinding = boundAnimation(template, target);
  const conflict = !!draft && (draft.baseline !== JSON.stringify(original) || draft.binding !== targetBinding);
  useEffect(() => () => playing.current?.cancel(), [active]);

  const retain = (next: Draft | undefined) => {
    setDraft(next);
    store.rememberViewState(draftKey, next);
    onPending();
  };
  const update = (next: UIAnimation) => {
    const baseline = draft?.baseline ?? JSON.stringify(original);
    retain(JSON.stringify(next) === baseline ? undefined : { value: next, baseline, shared, binding: draft ? draft.binding : targetBinding, existing: draft?.existing ?? existing });
    setNotice(''); setError('');
  };
  const retainNumber = (id: string, input: NumberInputDraft | null) => {
    const next = { ...store.viewState<Record<string, NumberInputDraft>>(numberKey) };
    if (input) next[id] = input; else delete next[id];
    store.rememberViewState(numberKey, Object.keys(next).length ? next : undefined);
    setNumbers(next);
    onPending();
  };
  const reset = () => {
    store.rememberViewState(numberKey, undefined);
    setNumbers({}); setResetGeneration(value => value + 1);
    retain(undefined); setShared(false); setError(''); setNotice('');
  };
  const pick = (id: string) => {
    reset();
    setSelected(id); store.rememberViewState(viewId + '/selection', id);
    if (!id) setNewAnimation(fresh(template, locale));
  };
  const guard = (action: () => void) => { if (draft || numericPending) setLeave(() => action); else action(); };
  const run = async (remove = false) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const documents = store.host.list(), latest = readTemplateDocuments(documents);
      const old = latest.animations.find(item => item.id === selected);
      if (conflict || (old && JSON.stringify(old) !== JSON.stringify(original)) || (!!old !== (selected === original.id))
        || target && (!findComponent(latest, target.componentId) || boundAnimation(latest, target) !== targetBinding)) throw new Error('动画或绑定已变化，请重新读取后再应用。');
      const next = remove ? removeUIAnimation(latest, value.id, deleting)
        : putUIAnimation(latest, UIAnimationSchema.parse(value), target ? { ...target, shared } : undefined);
      const edit = templateEdit(documents, next, remove ? '删除界面动画' : '应用界面动画');
      if (edit.patches.length) resultValue(await store.applyEdit(edit));
      setDeleting(false);
      pick(remove ? '' : boundAnimation(next, target) ?? value.id);
      setNotice(remove ? '已删除动画 · 未保存' : '已应用动画 · 未保存');
    } catch (reason) { setError(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  const preview = () => {
    playing.current?.cancel();
    if (!specimen.current) return;
    const data = animationFrames(value, matchMedia('(prefers-reduced-motion: reduce)').matches);
    playing.current = specimen.current.animate(data.frames, { duration: data.duration, fill: 'none' });
  };
  const editSegment = (index: number, patch: Partial<UIAnimation['segments'][number]>) => update({
    ...value, segments: value.segments.map((item, i) => i === index ? { ...item, ...patch } : item),
  });
  const duplicate = () => {
    const next = { ...structuredClone(value), id: createId(template), name: value.name + ' · 副本' };
    setSelected(''); store.rememberViewState(viewId + '/selection', '');
    const base = fresh(template, locale);
    setNewAnimation(base);
    retain({ value: next, baseline: JSON.stringify(base), shared: false, binding: targetBinding, existing: false });
    setShared(false);
  };
  return <div className="candidate-resource-split candidate-resource-animations">
    <CandidateSection title="作品动画" actions={<CandidateIconButton label="新建动画" disabled={busy} onClick={() => guard(() => pick(''))}><Plus size={14}/></CandidateIconButton>}>
      <div className="candidate-resource-list">{template.animations.map(animation => <CandidateObjectRow key={animation.id}
        title={animation.name} metadata={uiAnimationUses(template, animation.id).length + ' 处引用'} active={selected === animation.id}
        disabled={busy} onActivate={() => guard(() => pick(animation.id))}/>)}</div>
      {!template.animations.length && <p className="candidate-resource-hint">应用动画后将出现在作品目录。</p>}
    </CandidateSection>
    <div className="candidate-resource-stack">
      {target && <p className="candidate-resource-hint">{targetComponent ? designerComponentName(targetComponent, locale, template.locales) : '组件已移除'} · {names[target.event]}</p>}
      <CandidateSection title="动画定义" actions={<CandidateButton disabled={busy || numericPending || !value.segments.length} onClick={preview}>预览动画</CandidateButton>}>
        <div className="candidate-resource-specimen"><CandidateButton variant="secondary" ref={specimen} onClick={preview}>预览部件</CandidateButton></div>
        <div className="candidate-resource-fields">
          <CandidateField label="基础预设"><CandidateSelect density="compact" value="" disabled={busy} onValueChange={preset => { if (preset) update(createUIAnimationPreset(preset, value.id, locale)); }}>
            <option value="">选择预设</option>{UIAnimationPresets.map(item => <option key={item.key} value={item.key}>{item.name[locale as keyof typeof item.name] ?? item.name['zh-CN']}</option>)}
          </CandidateSelect></CandidateField>
          <CandidateField label="动画名称"><CandidateInput density="compact" value={value.name} disabled={busy} onChange={event => update({ ...value, name: event.currentTarget.value })}/></CandidateField>
          <CandidateField label="减弱动画"><CandidateSelect density="compact" disabled={busy} value={value.reduced} onValueChange={reduced => update({ ...value, reduced: reduced as UIAnimation['reduced'] })}>
            <option value="finish">直接完成</option><option value="fade">短淡变</option>
          </CandidateSelect></CandidateField>
        </div>
        {value.segments.map((segment, index) => <CandidateFieldGroup key={value.id + '/' + index + '/' + resetGeneration} title={'动画段 ' + (index + 1)} disabled={busy}>
          <div className="candidate-resource-fields">
            {numberFields.map(field => <CandidateNumberField key={field.key} label={field.label} value={segment[field.key] ?? field.initial}
              min={'min' in field ? field.min : undefined} max={'max' in field ? field.max : undefined} step={field.step}
              unit={'unit' in field ? field.unit : ''} locale={locale} disabled={busy} inputDraft={numbers[index + '/' + field.key]}
              onInputDraftChange={input => retainNumber(index + '/' + field.key, input)}
              onCommit={amount => editSegment(index, { [field.key]: amount })}/>)}
            <CandidateField label="缓动"><CandidateSelect density="compact" disabled={busy} value={segment.easing.family} onValueChange={family => editSegment(index, { easing: { ...segment.easing, family: family as typeof segment.easing.family } })}>
              {['linear', 'sine', 'quad', 'cubic'].map(item => <option key={item}>{item}</option>)}
            </CandidateSelect></CandidateField>
            <CandidateField label="方向"><CandidateSelect density="compact" disabled={busy} value={segment.easing.direction} onValueChange={direction => editSegment(index, { easing: { ...segment.easing, direction: direction as typeof segment.easing.direction } })}>
              <option value="in">加速</option><option value="out">减速</option><option value="inOut">先加速后减速</option>
            </CandidateSelect></CandidateField>
          </div>
          <CandidateToolbar label={'动画段 ' + (index + 1) + ' 操作'}>
            <CandidateIconButton label="上移动画段" disabled={!index || busy || numericPending} onClick={() => { const segments = [...value.segments]; const [item] = segments.splice(index, 1); segments.splice(index - 1, 0, item!); update({ ...value, segments }); }}><ArrowUp size={14}/></CandidateIconButton>
            <CandidateIconButton label="移除动画段" disabled={busy || numericPending} onClick={() => update({ ...value, segments: value.segments.filter((_, i) => i !== index) })}><Trash2 size={14}/></CandidateIconButton>
          </CandidateToolbar>
        </CandidateFieldGroup>)}
        <CandidateButton disabled={busy} onClick={() => update({ ...value, segments: [...value.segments, { durationMs: 120, opacity: 1, easing: { family: 'cubic', direction: 'out' } }] })}><Plus size={14}/>添加动画段</CandidateButton>
      </CandidateSection>
      <CandidateSection title="使用位置">
        {uses.length ? <ul className="candidate-resource-changes">{uses.map(item => <li key={item.componentId + '/' + item.event}>
          {designerPageName(item.page, locale, template.locales)} / {designerComponentName(findComponent(template, item.componentId)!, locale, template.locales)} · {names[item.event]}
        </li>)}</ul> : <p className="candidate-resource-hint">尚未绑定</p>}
        {target && uses.length > 1 && <CandidateField label="修改范围"><CandidateSelect density="compact" disabled={busy} value={shared ? 'shared' : 'local'} onValueChange={scope => {
          setShared(scope === 'shared'); if (draft) retain({ ...draft, shared: scope === 'shared' });
        }}><option value="local">只改此处（独立副本）</option><option value="shared">修改共享动画</option></CandidateSelect></CandidateField>}
      </CandidateSection>
      {(error || conflict) && <CandidateState kind="error" title={error || '动画已被其他编辑修改。'} action={conflict ? <CandidateButton onClick={reset}>重新读取</CandidateButton> : undefined}/>}
      {notice && <p role="status" className="candidate-resource-hint">{notice}</p>}
      <CandidateToolbar label="动画操作" className="candidate-resource-toolbar">
        <CandidateButton variant="primary" disabled={busy || conflict || numericPending || !value.name.trim() || !value.segments.length || !!target && !targetComponent} onClick={() => void run()}>应用动画</CandidateButton>
        <CandidateButton disabled={busy || numericPending} onClick={duplicate}>复制为新动画</CandidateButton>
        {(draft || numericPending) && <CandidateButton disabled={busy} onClick={reset}>恢复输入</CandidateButton>}
        <CandidateButton variant="danger" disabled={busy || !existing || numericPending} onClick={() => setDeleting(true)}>删除定义</CandidateButton>
      </CandidateToolbar>
    </div>
    <CandidateReviewDialog open={deleting} title={uses.length ? '解绑并删除界面动画？' : '删除界面动画？'} busy={busy} onDismiss={() => setDeleting(false)}
      description={uses.length ? '删除会解绑上方列出的 ' + uses.length + ' 处位置。一次撤销可恢复定义和绑定。' : '可从作品历史恢复此动画定义。'}
      actions={<CandidateButton variant="danger" disabled={busy || conflict} onClick={() => void run(true)}>{uses.length ? '解绑后删除' : '删除动画'}</CandidateButton>}/>
    <CandidateReviewDialog open={!!leave} title="动画有未应用的修改" description="继续切换会放弃当前动画输入。" onDismiss={() => setLeave(null)}
      actions={<CandidateButton variant="danger" onClick={() => { const next = leave; setLeave(null); next?.(); }}>放弃修改并继续</CandidateButton>}/>
  </div>;
}

export function CandidatePageAnimationBindings({ store, page, component, template, onNavigate, active = true }: {
  store: PageStore; page: PageTemplate['pages'][number]; component?: ComponentConfig; template: PageTemplate;
  onNavigate?: (id: string) => void; active?: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [animationPreview, setAnimationPreview] = useState<PageResourcePreviewInput>();
  const preview = (animation: PageResourcePreviewInput['animation']) => setAnimationPreview({ template, page: page.key, animation });
  const target = component ?? page.root;
  const root = target.id === page.root.id;
  const bindings: UIAnimationBinding[] = root ? ['enter', 'exit'] : ['show', 'hide', 'hover', 'focus', 'pressed'];
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (reason) { setError(workfaceError(reason)); } finally { setBusy(false); }
  };
  return <CandidateSection title={root ? '页面切换动画' : '组件动画'} collapsible initiallyOpen={false} onFocusCapture={() => { if (store.getSnapshot().commandTarget !== page.id) store.target(page.id); }}>
    <div className="candidate-resource-bindings">{bindings.map(event => <div key={event}>
      <CandidateField label={names[event]}><CandidateSelect density="compact" value={target.animations[event] ?? ''} disabled={busy || target.locked} onValueChange={id => void run(async () => {
        const documents = store.host.list(), next = readTemplateDocuments(documents);
        const current = findComponent(next, target.id);
        if (!current || current.locked) throw new Error('动画绑定对象已变化。');
        if (id) current.animations[event] = id; else delete current.animations[event];
        const edit = templateEdit(documents, next, '修改界面动画绑定');
        if (edit.patches.length) resultValue(await store.applyEdit(edit));
      })}><option value="">无动画</option>{template.animations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</CandidateSelect></CandidateField>
      <CandidateButton disabled={busy || target.locked} onClick={() => onNavigate?.('page:@animations:' + target.id + ':' + event)}>创建或编辑动画</CandidateButton>
    </div>)}</div>
    {root && <CandidateToolbar label="页面切换预览" className="candidate-resource-toolbar">
      <CandidateButton disabled={busy} onClick={() => void run(async () => {
        const documents = store.host.list(), next = readTemplateDocuments(documents);
        applyBasicPageAnimations(next, [page.id]);
        const edit = templateEdit(documents, next, '应用基础淡变');
        if (edit.patches.length) resultValue(await store.applyEdit(edit));
      })}>应用基础淡变</CandidateButton>
      <CandidateButton onClick={() => preview('enter')}>播放进入</CandidateButton>
      <CandidateButton onClick={() => preview('exit')}>播放退出</CandidateButton>
      <CandidateButton onClick={() => preview('roundtrip')}>预览往返</CandidateButton>
    </CandidateToolbar>}
    {root && animationPreview && <CandidateResourcePreview store={store} input={animationPreview} active={active}/>}
    {error && <CandidateState kind="error" title={error}/>}
  </CandidateSection>;
}
