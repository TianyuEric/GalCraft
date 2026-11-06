import { useEffect, useMemo, useState } from 'react';
import type { DocumentView, Json, TemplateLibraryInput, TemplateSwitchOptions, TemplateSwitchResult } from '@galcraft/contracts';
import { components, createOfficialTemplate, readTemplateSource, templateIssues } from '@galcraft/templates';
import { designerComponentName, designerPageName } from '../../../authoring/designer-labels.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateInput, CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import type { PageStore, PageTemplate } from './page-edit.js';
import { CandidateResourcePreview, type PageResourcePreviewInput } from './page-resource-preview.js';
import { resultValue, workfaceError } from './workface-helpers.js';
import { templateReferenceTargets } from '../adapters/template-reference-targets.js';

type Entry = { id: string; version: string; name: string; official: boolean };
type Reference = { key: string; kind: string; id: string; scope?: string; valueType?: string };
type Collision = { entry: Entry; choices: ('cancel' | 'copy' | 'update')[] };
type Resolution = 'current' | 'incoming';

const presets = (['light', 'standard', 'rich'] as const).map((kind, index) => ({
  kind, name: ['轻量阅读', '标准作品', '丰富作品'][index]!, template: createOfficialTemplate({ kind }),
}));
const identity = (entry: Entry) => entry.id + '@' + entry.version;
const asObject = <T,>(value: Json): T => value as unknown as T;
const choices = (options: { value: string; label: string }[]) => options.map(item => <option value={item.value} key={item.value}>{item.label}</option>);


export function CandidatePageTemplates({ store, template, documents, locale, active, viewId }: {
  store: PageStore; template: PageTemplate; documents: DocumentView[]; locale: string; active: boolean; viewId: string;
}) {
  const bridge = store.services.bridge.templates;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState(() => store.viewState<string>(viewId + '/selection') ?? template.id + '@' + template.version);
  const [references, setReferences] = useState<Reference[]>([]);
  const [referenceReady, setReferenceReady] = useState('');
  const [options, setOptions] = useState<TemplateSwitchOptions>({});
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [plan, setPlan] = useState<TemplateSwitchResult>();
  const [planCurrent, setPlanCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [path, setPath] = useState('');
  const [name, setName] = useState(template.id);
  const [description, setDescription] = useState('');
  const [examples, setExamples] = useState(false);
  const [collision, setCollision] = useState<Collision>();
  const [deleting, setDeleting] = useState(false);
  const entry = entries.find(item => identity(item) === selected) ?? entries[0];
  const entryId = entry?.id, entryVersion = entry?.version;
  const selectedKey = entry ? identity(entry) : '';
  const targets = useMemo(() => templateReferenceTargets(documents), [documents]);
  const hidden = readTemplateSource(documents)?.hiddenPages ?? [];
  const defaultSource = presets.find(item => item.template.id === entryId)?.template;
  const preview = useMemo<PageResourcePreviewInput | undefined>(() => {
    const source = planCurrent ? plan?.template : undefined;
    if (source && plan) return { template: source, page: 'title', files: plan.files, plan };
    return defaultSource ? { template: defaultSource, page: 'title' } : undefined;
  }, [plan, planCurrent, defaultSource]);
  const manage = async (input: TemplateLibraryInput) => {
    if (!bridge?.library) throw new Error('模板库服务不可用。');
    return resultValue(await bridge.library(input));
  };
  const refresh = async () => {
    const result = asObject<{ items: Entry[] }>(await manage({ action: 'list', limit: 100 }));
    return result.items.map(item => ({ ...item, name: presets.find(preset => preset.template.id === item.id)?.name ?? item.name }));
  };
  useEffect(() => {
    let alive = true;
    void refresh().then(list => { if (alive) setEntries(list); }).catch(reason => { if (alive) setError(workfaceError(reason)); });
    return () => { alive = false; };
  }, [bridge]);
  useEffect(() => {
    setPlan(undefined); setPlanCurrent(false); setOptions({}); setMappings({}); setReferences([]); setReferenceReady('');
    if (!entryId || !entryVersion) return;
    let alive = true;
    void manage({ action: 'detail', id: entryId, version: entryVersion }).then(value => {
      if (!alive) return;
      setReferences(asObject<{ externalReferences?: Reference[] }>(value).externalReferences ?? []);
      setReferenceReady(entryId + '@' + entryVersion);
    }).catch(reason => { if (alive) setError(workfaceError(reason)); });
    return () => { alive = false; };
  }, [entryId, entryVersion, bridge]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError(workfaceError(reason)); } finally { setBusy(false); }
  };
  const protectDrafts = () => {
    if (store.getSnapshot().pendingViews.some(id => id.startsWith('page:') && id !== viewId)) throw new Error('请先应用或恢复其他页面、样式和动画的输入。');
  };
  const revise = (patch: Partial<TemplateSwitchOptions>) => {
    setOptions(previous => ({ ...previous, ...patch }));
    setPlanCurrent(false);
  };
  const libraryAction = (input: TemplateLibraryInput) => void run(async () => {
    const value = asObject<{ status?: string } & Collision & Partial<Entry>>(await manage(input));
    if (value.status === 'conflict') { setCollision(value); return; }
    setCollision(undefined); setDeleting(false);
    const list = await refresh();
    setEntries(list);
    if (input.action === 'copy' && value.id && value.version) setSelected(value.id + '@' + value.version);
    setNotice('模板库操作已完成。');
  });
  const review = () => void run(async () => {
    protectDrafts();
    if (!entry || !bridge?.prepareTemplateSwitch) throw new Error('模板切换服务不可用。');
    setPlan(resultValue(await bridge.prepareTemplateSwitch({ id: entry.id, version: entry.version, options, mappings })));
    setPlanCurrent(true);
  });
  const apply = () => void run(async () => {
    protectDrafts();
    if (!planCurrent || !plan || plan.blocked || !plan.edit) throw new Error('请重新查看并处理切换计划。');
    const errors = templateIssues(plan.template);
    if (errors.length) throw new Error(errors.join('\n'));
    resultValue(await store.applyEdit(plan.edit));
    setPlan(undefined); setPlanCurrent(false); setNotice('已应用模板 · 未保存');
  });
  const restore = (key: string) => void run(async () => {
    protectDrafts();
    if (!bridge?.restoreTemplatePage) throw new Error('页面恢复服务不可用。');
    resultValue(await store.applyEdit(resultValue(await bridge.restoreTemplatePage(key)).edit));
    setPlan(undefined); setPlanCurrent(false); setNotice('页面已恢复 · 未保存');
  });
  const fieldName = (path: string) => {
    if (!path) return '整套界面默认值';
    if (path === '/') return '缺少采用时来源';
    if (path.startsWith('/files/')) return '样式源码或 CSS';
    const page = template.pages.find(item => item.key === path.split('/')[2]);
    const component = page && components(page.root).filter(item => path.includes('/' + item.id + '/')).at(-1);
    const key = path.split('/').filter(Boolean).at(-1);
    return [page && designerPageName(page.key, locale, template.locales), component && designerComponentName(component, locale, template.locales), key].filter(Boolean).join(' · ');
  };
  const resolveAll = (resolution: Resolution) => {
    if (!plan) return;
    revise({ resolutions: Object.fromEntries(plan.conflicts.filter(item => item.kind !== 'missingBaseline').map(item => [item.path, resolution])),
      ...(plan.conflicts.some(item => item.kind === 'missingBaseline') ? { missingBaseline: resolution } : {}) });
  };
  const resolutionOptions = choices([{ value: 'unresolved', label: '选择处理方式' }, { value: 'current', label: '保留当前' }, { value: 'incoming', label: '采用新模板' }]);
  return <div className="candidate-resource-stack">
    <div className="candidate-resource-split">
      <CandidateSection title="模板版本">
        <CandidateInput density="compact" aria-label="筛选模板" placeholder="筛选模板" value={librarySearch} onChange={event => setLibrarySearch(event.currentTarget.value)}/>
        <div className="candidate-resource-list">
          {entries.filter(item => (item.name + item.id).toLowerCase().includes(librarySearch.toLowerCase())).map(item =>
            <CandidateObjectRow key={identity(item)} title={item.name} description={(item.official ? '官方模板' : '用户模板') + ' · ' + item.version}
              active={selectedKey === identity(item)} disabled={busy} onActivate={() => { setSelected(identity(item)); store.rememberViewState(viewId + '/selection', identity(item)); }}/>)}
        </div>
      </CandidateSection>
      <CandidateSection title="Player 预览">
        {preview ? <CandidateResourcePreview store={store} input={preview} active={active}/>
          : <CandidateState kind="empty" title="查看切换计划后预览所选版本"/>}
      </CandidateSection>
    </div>
    <CandidateSection title="切换影响" actions={<CandidateButton variant="secondary" disabled={busy || !entry || referenceReady !== selectedKey || references.some(item => !(item.key in mappings))} onClick={review}>查看切换计划</CandidateButton>}>
      <p className="candidate-resource-hint">比较采用时来源、当前工作副本和新模板。作者新增内容及其引用继续保留。</p>
      <div className="candidate-resource-fields">
        <CandidateField label="作者样式"><CandidateSelect density="compact" disabled={busy} value={options.authorStyles ?? 'enabled'} onValueChange={value => revise({ authorStyles: value as TemplateSwitchOptions['authorStyles'] })}>
          <option value="enabled">保留原文并启用</option><option value="disabled">保留原文并停用</option>
        </CandidateSelect></CandidateField>
        {references.map(ref => <CandidateField key={ref.key} label={[ref.kind, ref.id, ref.scope, ref.valueType].filter(Boolean).join(' · ')}>
          <CandidateSelect density="compact" disabled={busy} value={ref.key in mappings ? mappings[ref.key] ?? '@clear' : '@choose'} onValueChange={value => {
            const next = { ...mappings };
            if (value === '@choose') delete next[ref.key]; else next[ref.key] = value === '@clear' ? null : value;
            setMappings(next); setPlanCurrent(false);
          }}><option value="@choose">选择目标或明确解除</option><option value="@clear">解除绑定</option>{choices(targets.filter(item => item.kind === ref.kind).map(item => ({ value: item.id, label: item.name })))}</CandidateSelect>
        </CandidateField>)}
      </div>
      {plan && <div className="candidate-resource-summary" role="status">
        <span>保留 {plan.keptFields.length} · 更新 {plan.replacedFields.length} · 待处理冲突 {plan.conflicts.filter(item => !item.resolution).length}</span>
        {plan.addedPages.length > 0 && <span>新增页面 {plan.addedPages.join('、')}</span>}
        {plan.hiddenPages.length > 0 && <span>隐藏并保留配置 {plan.hiddenPages.join('、')}</span>}
        {plan.requiredEntrances.length > 0 && <span role="alert">必需入口不可达 {plan.requiredEntrances.join('、')}</span>}
        {!planCurrent && <span>处理方式已更改，请重新查看计划。</span>}
      </div>}
    </CandidateSection>
    {!!plan?.conflicts.length && <CandidateSection title="处理冲突" actions={<CandidateToolbar label="批量处理冲突"><CandidateButton disabled={busy} onClick={() => resolveAll('current')}>全部保留当前</CandidateButton><CandidateButton disabled={busy} onClick={() => resolveAll('incoming')}>全部采用新模板</CandidateButton></CandidateToolbar>}>
      {plan.conflicts.map((item, index) => <div className="candidate-resource-conflict" key={item.path + index}>
        <CandidateField label={fieldName(item.path)}><CandidateSelect density="compact" disabled={busy} value={(item.kind === 'missingBaseline' ? options.missingBaseline : options.resolutions?.[item.path]) ?? item.resolution ?? 'unresolved'} onValueChange={value => {
          if (value === 'unresolved') return;
          if (item.kind === 'missingBaseline') revise({ missingBaseline: value as Resolution });
          else revise({ resolutions: { ...options.resolutions, [item.path]: value as Resolution } });
        }}>{resolutionOptions}</CandidateSelect></CandidateField>
        <CandidateSection title="比较双方变化" collapsible initiallyOpen={false}><dl className="candidate-resource-comparison">
          {([['采用时来源', item.before], ['当前', item.current], ['新模板', item.incoming], ['字段路径', item.path]] as const).map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd><code>{JSON.stringify(value) ?? '—'}</code></dd></div>)}
        </dl></CandidateSection>
      </div>)}
    </CandidateSection>}
    <CandidateSection title="按页面选择与字段详情" collapsible initiallyOpen={false}>
      <div className="candidate-resource-fields">{template.pages.map(page => <CandidateField key={page.id} label={designerPageName(page.key, locale, template.locales)}>
        <CandidateSelect density="compact" disabled={busy} value={options.pageChoices?.[page.key] ?? 'auto'} onValueChange={value => {
          const next = { ...options.pageChoices };
          if (value === 'auto') delete next[page.key]; else next[page.key] = value as Resolution;
          revise({ pageChoices: next });
        }}><option value="auto">逐字段合并</option><option value="current">整页保留当前</option><option value="incoming">整页采用新模板</option></CandidateSelect>
      </CandidateField>)}</div>
      <CandidateInput density="compact" aria-label="搜索变更" placeholder="搜索变更" value={search} onChange={event => setSearch(event.currentTarget.value)}/>
      {plan ? <ul className="candidate-resource-changes">{plan.changes.filter(item => (fieldName(item.path) + ' ' + item.path).toLowerCase().includes(search.toLowerCase())).map((item, index) =>
        <li key={item.path + index}>{fieldName(item.path)} · {item.outcome === 'current' ? '保留当前' : item.outcome === 'incoming' ? '采用新值' : '待处理'}</li>)}</ul>
        : <p className="candidate-resource-hint">查看计划后显示字段变更。</p>}
    </CandidateSection>
    {!!hidden.length && <CandidateSection title="恢复隐藏页面">{hidden.map(page => <CandidateObjectRow key={page.id} title={designerPageName(page.key, locale, template.locales)}
      disabled={busy} onActivate={() => restore(page.key)} actions={<CandidateButton disabled={busy} onClick={() => restore(page.key)}>恢复</CandidateButton>}/>)}</CandidateSection>}
    <CandidateSection title="本机模板库与交换包" collapsible initiallyOpen={false}>
      <div className="candidate-resource-fields">
        <CandidateField label="包文件绝对路径"><CandidateInput density="compact" value={path} onChange={event => setPath(event.currentTarget.value)}/></CandidateField>
        <CandidateField label="名称"><CandidateInput density="compact" value={name} onChange={event => setName(event.currentTarget.value)}/></CandidateField>
        <CandidateField label="说明"><CandidateInput density="compact" value={description} onChange={event => setDescription(event.currentTarget.value)}/></CandidateField>
        <CandidateField label="导出时包含页面示例" layout="row"><CandidateCheckbox checked={examples} onChange={event => setExamples(event.currentTarget.checked)}/></CandidateField>
      </div>
      <p className="candidate-resource-hint">导出使用已应用的工作副本。绝对路径交换需要桌面 Studio。</p>
      <CandidateToolbar label="模板库操作" className="candidate-resource-toolbar">
        <CandidateButton disabled={busy || !path} onClick={() => libraryAction({ action: 'import', path })}>导入整套模板包</CandidateButton>
        <CandidateButton disabled={busy || !path || !entry} onClick={() => entry && libraryAction({ action: 'export', id: entry.id, version: entry.version, path })}>导出所选版本</CandidateButton>
        <CandidateButton disabled={busy || !path || !name} onClick={() => libraryAction({ action: 'exportCurrent', path, name, description, includeExamples: examples })}>导出工作副本</CandidateButton>
        <CandidateButton disabled={busy || !name || !entry} onClick={() => entry && libraryAction({ action: 'copy', id: entry.id, version: entry.version, name })}>复制为用户模板</CandidateButton>
        {entry && !entry.official && <>
          <CandidateButton disabled={busy || !name} onClick={() => libraryAction({ action: 'rename', id: entry.id, version: entry.version, name })}>重命名所选版本</CandidateButton>
          <CandidateButton disabled={busy} variant="danger" onClick={() => setDeleting(true)}>删除所选版本…</CandidateButton>
        </>}
      </CandidateToolbar>
    </CandidateSection>
    <CandidateToolbar label="应用模板"><CandidateButton variant="primary" disabled={busy || !planCurrent || !plan || plan.blocked} onClick={apply}>{busy ? '正在处理…' : '应用此模板'}</CandidateButton><span className="candidate-resource-hint">作为一次编辑撤销。保存单独执行。</span></CandidateToolbar>
    {notice && <p className="candidate-resource-hint" role="status">{notice}</p>}
    {error && <CandidateState kind="error" title="模板操作失败" description={error}/>}
    <CandidateReviewDialog open={deleting} title="删除所选模板版本？" description="已采用的作品继续使用各自的模板内容。" busy={busy} onDismiss={() => setDeleting(false)}
      actions={<CandidateButton variant="danger" disabled={busy || !entry} onClick={() => entry && libraryAction({ action: 'delete', id: entry.id, version: entry.version })}>删除这个版本</CandidateButton>}/>
    <CandidateReviewDialog open={!!collision} title="模板身份和版本已存在" description={collision && collision.entry.name + ' · ' + collision.entry.version} busy={busy} onDismiss={() => setCollision(undefined)}
      actions={collision?.choices.map(choice => <CandidateButton key={choice} disabled={busy} onClick={() => choice === 'cancel' ? setCollision(undefined) : libraryAction({ action: 'import', path, choice })}>{choice === 'cancel' ? '取消' : choice === 'copy' ? '另存用户副本' : '更新本机版本'}</CandidateButton>)}/>
  </div>;
}
