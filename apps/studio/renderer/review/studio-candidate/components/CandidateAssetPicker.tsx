import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { File, Play, Search, Upload } from 'lucide-react';
import type { Asset, AssetKind, AssetPickerContext, AssetPickerPage, AssetQuery, AssetTypeCatalogEntry, Json } from '@galcraft/contracts';
import type { AssetPickerChoice, AssetPickerOptions } from '../../../authoring/asset-picker.js';
import { recordAssetsPicked } from '../../../authoring/asset-picker.js';
import type { AuthoringSource } from '../../../authoring/controller.js';
import { createAssetPickerPreview } from '../../../authoring/asset-picker-preview.js';
import { assetTypeName } from '../../../authoring/asset-type-catalog.js';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from './controls/index.js';
import { CandidateLeasedAnimationPreview } from './professional/CandidateAnimationPreview.js';
import '../styles/asset-picker.css';

const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

export function CandidateAssetTypeFilters({ catalog, kind, values, onChange }: { catalog: readonly AssetTypeCatalogEntry[]; kind: AssetKind | null;
  values?: Record<string, Json>; onChange(values: Record<string, Json>): void }) {
  const type = catalog.find(item => item.descriptor.key === kind && !item.unavailable)?.descriptor;
  if (!type?.filterFields?.length) return null;
  return <CandidateFieldGroup title="类型属性">{type.filterFields.map(path => {
    const field = type.fields.find(item => item.path === path); if (!field) return null;
    const value = values?.[path] === undefined ? '' : String(values[path]);
    const change = (next: string) => { const updated = { ...values }; if (!next) delete updated[path];
      else updated[path] = field.type === 'number' ? Number(next) : field.type === 'boolean' ? next === 'true' : next; onChange(updated); };
    return <CandidateField key={path} label={field.label}>{field.type === 'boolean' || field.enumValues
      ? <CandidateSelect value={value} onValueChange={change}><option value="">全部值</option>{(field.type === 'boolean' ? ['true', 'false'] : field.enumValues ?? []).map(option => <option key={option} value={option}>{option}</option>)}</CandidateSelect>
      : <CandidateInput type={field.type === 'number' ? 'number' : 'search'} step={field.type === 'number' ? 'any' : undefined} value={value} onChange={event => change(event.currentTarget.value)}/>}</CandidateField>;
  })}</CandidateFieldGroup>;
}

type CandidateAssetPickerOptions = AssetPickerOptions & { chooseVersion?: boolean };

function AssetPicker({ options, finish }: { options: CandidateAssetPickerOptions; finish(choice: AssetPickerChoice | null): void }) {
  const { services } = options;
  const locale = options.locale ?? 'zh-CN';
  const [context, setContext] = useState<AssetPickerContext>({ projectId: options.projectId, allowedKinds: [...options.allowedKinds], allowedCapabilities: options.allowedCapabilities,
    characterId: options.characterId ?? null, sceneId: options.sceneId ?? null, locale: options.assetLocale ?? null,
    currentAssetId: options.currentAssetId ?? null, currentVariantId: options.currentVariantId ?? null, tab: options.characterId || options.sceneId || options.assetLocale ? 'context' : 'all' });
  const [query, setQuery] = useState<AssetQuery>({ kind: null, allowedKinds: [...options.allowedKinds], folder: null, characterId: null, sceneId: null, locale: null,
    search: '', tags: [], usage: null, reference: 'any', review: 'any', sort: 'name', direction: 'asc', offset: 0, limit: 12, indexRevision: null });
  const [source, setSource] = useState<AuthoringSource | null>(null), [catalog, setCatalog] = useState<AssetTypeCatalogEntry[]>([]);
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(null), [page, setPage] = useState<AssetPickerPage | null>(null);
  const [selected, setSelected] = useState<AssetPickerChoice | null>(null), [viewing, setViewing] = useState<AssetPickerChoice | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [importMessage, setImportMessage] = useState(''), [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null), media = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const updateQuery = (change: Partial<AssetQuery>) => setQuery(value => ({ ...value, ...change, offset: change.offset ?? 0, indexRevision: null }));

  useEffect(() => {
    let live = true;
    void services.read().then(result => { if (live && result.ok) setSource(result.value); });
    void services.assetTypeCatalog?.().then(result => { if (live && result.ok) setCatalog(result.value); });
    if (options.currentAssetId) void services.getAsset?.(options.currentAssetId).then(result => { if (live && result.ok) setCurrentAsset(result.value); });
    return () => { live = false; };
  }, [services, options.currentAssetId, attempt]);
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    const load = async () => {
      if (!services.queryAssetPicker) throw new Error('素材选择服务尚未就绪。');
      let result = await services.queryAssetPicker({ context, query });
      if (!result.ok && result.error.code === 'QUERY_STALE') result = await services.queryAssetPicker({ context, query: { ...query, indexRevision: null } });
      if (!live) return;
      if (!result.ok) throw new Error(result.error.message);
      if (query.offset >= result.value.total && query.offset > 0) { updateQuery({ offset: Math.max(0, Math.floor(Math.max(0, result.value.total - 1) / query.limit) * query.limit) }); return; }
      setPage(result.value);
    };
    void load().catch(reason => { if (live) setError(message(reason)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [services, context, query, attempt]);
  useEffect(() => {
    if (!page || !services.thumbnails) return;
    const assets = [...page.items, ...(currentAsset ? [currentAsset] : [])].filter(asset => asset.kind === 'image');
    const requests = assets.map(asset => ({ assetId: asset.id, variantId: asset.activeVariantId }));
    if (!requests.length) return;
    let live = true;
    void services.thumbnails(requests).then(result => { if (live && result.ok) setThumbnails(Object.fromEntries(result.value.map(item => [item.assetId, item.uri]))); }).catch(() => {});
    return () => { live = false; };
  }, [page, currentAsset, services]);
  useEffect(() => {
    if (!viewing || !media.current || viewing.asset.kind === 'animation') return;
    const preview = createAssetPickerPreview(media.current, services, locale);
    void preview.preview(viewing.asset, viewing.variantId);
    return preview.dispose;
  }, [viewing, services, locale]);

  async function apply() {
    if (!selected || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const latest = await services.getAsset?.(selected.assetId);
      if (latest && !latest.ok) throw new Error(latest.error.message);
      const asset = latest?.ok ? latest.value : selected.asset;
      if (!asset) throw new Error('所选素材已移除，请重新选择；原引用没有更改。');
      const variant = asset.variants.find(item => item.id === (selected.variantId ?? asset.activeVariantId));
      if (!options.allowedKinds.includes(asset.kind) || !variant) throw new Error('所选素材或版本已不可用，请重新选择；原引用没有更改。');
      if (options.allowedCapabilities?.length) {
        const result = await services.assetTypeCatalog?.();
        const type = result?.ok ? result.value.find(item => item.descriptor.key === asset.kind && !item.unavailable && item.descriptor.typeVersion === (variant.typeData?.typeVersion ?? 1) &&
          (!variant.typeData || item.provider?.id === variant.typeData.provider.id && item.provider.version === variant.typeData.provider.version)) : undefined;
        if (!type || !options.allowedCapabilities.every(capability => type.descriptor.capabilities.includes(capability) || variant.groupCapabilities?.capabilities.includes(capability))) throw new Error('该素材当前不支持此字段所需的能力。');
      }
      const choice = { ...selected, asset };
      const result = await options.onApply(choice);
      if (!result.ok) throw new Error(result.error.message);
      if (options.remember !== false) await recordAssetsPicked(services, options.projectId, [choice.assetId]);
      finish(choice);
    } catch (reason) { setError(message(reason)); } finally { running.current = false; setBusy(false); }
  }
  async function importAssets() {
    if (running.current) return;
    running.current = true; setBusy(true); setImportMessage('');
    try {
      if (options.onImport) await options.onImport();
      else if (services.pickAssetFiles && services.importAssets) {
        const picked = await services.pickAssetFiles(); if (!picked.ok) throw new Error(picked.error.message);
        if (!picked.value.length) return;
        const result = await services.importAssets(picked.value); if (!result.ok) throw new Error(result.error.message);
        setImportMessage(`已导入 ${result.value.succeeded.length} 项${result.value.failed.length ? `；${result.value.failed.map(item => `${item.path}：${item.issue.message}`).join('；')}` : ''}`);
      }
      setAttempt(value => value + 1);
    } catch (reason) { setImportMessage(message(reason)); } finally { running.current = false; setBusy(false); }
  }
  const choose = (asset: Asset, variantId: string | null = null) => setSelected({ asset, assetId: asset.id, variantId });
  const row = (asset: Asset, current = false) => {
    const variantId = current ? options.currentVariantId ?? null : null;
    const missing = current && page?.current?.currentBindingMissing;
    const active = selected?.assetId === asset.id && selected.variantId === variantId;
    return <div className="candidate-picker-row" role="none" key={`${asset.id}:${current}`}>
      <CandidateButton role="option" aria-selected={active} disabled={busy || !!missing || !options.allowedKinds.includes(asset.kind)}
        className="candidate-picker-choice" onClick={() => choose(asset, variantId)} title={`${asset.name}\n${asset.sourceName}\n${asset.id}`}>
        {thumbnails[asset.id] && !missing ? <img src={thumbnails[asset.id]} alt=""/> : <File size={20} aria-hidden="true"/>}
        <span><strong>{asset.name}</strong><small>{assetTypeName(asset.kind, catalog, locale)} · {asset.folder.join(' / ') || '根目录'}{current ? missing ? ' · 引用版本缺失' : ' · 当前引用' : ''}</small></span>
      </CandidateButton>
      <CandidateIconButton label={`预览 ${asset.name}`} disabled={!!missing || busy} onClick={() => setViewing({ asset, assetId: asset.id, variantId })}><Play size={14}/></CandidateIconButton>
    </div>;
  };
  return <CandidateReviewDialog open title={options.purpose ? `选择素材 · ${options.purpose}` : '选择素材'} className="candidate-asset-picker-dialog"
    initialFocus={search} onDismiss={() => { if (!running.current) finish(null); }} busy={busy} actions={<>
      <span className="candidate-picker-selected">{selected?.asset.name ?? '尚未选择'}</span>
      <CandidateButton density="standard" variant="secondary" disabled={busy} onClick={() => finish(null)}>取消</CandidateButton>
      <CandidateButton density="standard" variant="primary" disabled={!selected || busy} onClick={() => void apply()}>{busy ? '正在处理…' : '应用素材'}</CandidateButton>
    </>}>
    <div className="candidate-picker-content">
      <CandidateToolbar label="素材查询">
        <Search size={16} aria-hidden="true"/><CandidateInput ref={search} type="search" aria-label="搜索名称、来源或标签" placeholder="搜索名称、来源或标签" value={query.search}
          onChange={event => updateQuery({ search: event.currentTarget.value })} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); list.current?.querySelector<HTMLButtonElement>('[role=option]:not(:disabled)')?.focus(); } }}/>
        <CandidateSelect aria-label="素材类型" value={query.kind ?? ''} onValueChange={kind => updateQuery({ kind: kind ? kind as AssetKind : null, typeFields: {} })}>
          <option value="">全部适用类型</option>{options.allowedKinds.map(kind => <option key={kind} value={kind}>{assetTypeName(kind, catalog, locale)}</option>)}
        </CandidateSelect>
        {(options.onImport || services.pickAssetFiles && services.importAssets) && <CandidateButton disabled={busy} variant="secondary" onClick={() => void importAssets()}><Upload size={14}/>导入素材</CandidateButton>}
      </CandidateToolbar>
      <CandidateSection title="筛选条件" collapsible initiallyOpen={false}>
        <CandidateFieldGroup>
          <CandidateField label="用途"><CandidateSelect value={query.usage ?? ''} onValueChange={usage => updateQuery({ usage: usage || null })}>{[['', '全部用途'], ['background', '背景'], ['figure', '立绘'], ['voice', '配音'], ['bgm', '背景音乐'], ['effect', '音效'], ['ui', '页面素材']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CandidateSelect></CandidateField>
          <CandidateField label="角色"><CandidateSelect searchLabel="搜索角色" value={query.characterId ?? ''} onValueChange={characterId => updateQuery({ characterId: characterId || null })}><option value="">全部角色</option>{source?.characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</CandidateSelect></CandidateField>
          <CandidateField label="场景"><CandidateSelect searchLabel="搜索场景" value={query.sceneId ?? ''} onValueChange={sceneId => updateQuery({ sceneId: sceneId || null })}><option value="">全部场景</option>{source?.scenes.map(item => <option key={item.sceneId} value={item.sceneId}>{item.name}</option>)}</CandidateSelect></CandidateField>
          <CandidateField label="标签"><CandidateInput value={query.tags.join(', ')} placeholder="逗号分隔" onChange={event => updateQuery({ tags: event.currentTarget.value.split(/[,，]/).map(value => value.trim()).filter(Boolean) })}/></CandidateField>
          <CandidateField label="素材语言"><CandidateInput value={query.locale ?? ''} onChange={event => updateQuery({ locale: event.currentTarget.value || null })}/></CandidateField>
        </CandidateFieldGroup>
        <CandidateAssetTypeFilters catalog={catalog} kind={query.kind} values={query.typeFields} onChange={typeFields => updateQuery({ typeFields })}/>
      </CandidateSection>
      <CandidateToolbar label="素材范围">{([['context', '当前上下文'], ['recent', '最近使用'], ['all', '全部']] as const).map(([tab, title]) => <CandidateButton key={tab} aria-pressed={context.tab === tab} onClick={() => { setContext(value => ({ ...value, tab })); updateQuery({ offset: 0 }); }}>{title}</CandidateButton>)}</CandidateToolbar>
      {context.tab === 'context' && <div className="candidate-picker-context">{(['characterId', 'sceneId', 'locale'] as const).filter(key => context[key]).map(key => <CandidateButton key={key} onClick={() => { setContext(value => ({ ...value, [key]: null })); updateQuery({ offset: 0 }); }}>{key === 'characterId' ? source?.characters.find(item => item.id === context[key])?.name : key === 'sceneId' ? source?.scenes.find(item => item.sceneId === context[key])?.name : context[key]} · 移除条件</CandidateButton>)}</div>}
      {error && <CandidateState kind="error" title={error} action={<CandidateButton onClick={() => setAttempt(value => value + 1)}>重试读取</CandidateButton>}/>}
      {importMessage && <p role="status">{importMessage}</p>}
      <div className="candidate-picker-main">
        <div ref={list} role="listbox" aria-label="可选素材" aria-busy={loading} className="candidate-picker-results" onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.nativeEvent.isComposing) return;
          const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)'));
          const current = rows.indexOf(event.target as HTMLButtonElement); if (current < 0) return;
          event.preventDefault(); rows[event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
        }}>
          {options.currentAssetId && (currentAsset ? row(currentAsset, true) : <p role="status">{options.currentName ?? options.currentAssetId} · 素材缺失，取消会保留原引用。{options.onLocate && <CandidateButton onClick={() => options.onLocate!(options.currentAssetId!)}>定位并补齐</CandidateButton>}</p>)}
          {page?.items.map(asset => row(asset))}
          {context.tab === 'recent' && page?.recentEntries.filter(item => item.missing).map(item => <p key={item.assetId}>{item.assetId} · 素材缺失<CandidateButton onClick={() => void services.removeRecentAsset?.({ projectId: options.projectId, assetId: item.assetId }).then(result => { if (result.ok) setAttempt(value => value + 1); else setError(result.error.message); })}>移除记录</CandidateButton></p>)}
          {loading && !page && <CandidateState kind="loading" title="正在读取素材…"/>}
          {!loading && page?.empty && <CandidateState kind="empty" title={{ library: '素材库为空', unsupported: '没有适用于此字段的素材类型', filter: '当前筛选没有结果' }[page.empty]}
            action={<><CandidateButton onClick={() => { setContext(value => ({ ...value, tab: 'all' })); updateQuery({ search: '', kind: null, tags: [], usage: null, characterId: null, sceneId: null, locale: null, typeFields: {} }); }}>清除筛选</CandidateButton>{options.onGenerate && <CandidateButton onClick={options.onGenerate}>创建素材任务</CandidateButton>}</>}/>}
        </div>
        {viewing && <aside className="candidate-picker-preview" aria-label="素材预览"><strong>{viewing.asset.name}</strong>
          {viewing.asset.kind === 'animation' ? <CandidateLeasedAnimationPreview assetId={viewing.assetId} variantId={viewing.variantId ?? viewing.asset.activeVariantId}
            services={services} locale={locale}/> : <div ref={media}/>}
          <CandidateButton onClick={() => setViewing(null)}>收起预览</CandidateButton>
        </aside>}
      </div>
      {selected && options.chooseVersion !== false && <CandidateField label="采用版本" layout="row"><CandidateSelect value={selected.variantId ?? ''} onValueChange={variantId => setSelected({ ...selected, variantId: variantId || null })}><option value="">跟随素材当前版本</option>{selected.asset.variants.map((variant, index) => <option key={variant.id} value={variant.id}>固定版本 {index + 1}{variant.id === selected.asset.activeVariantId ? ' · 当前' : ''}</option>)}</CandidateSelect></CandidateField>}
      <CandidateToolbar label="素材分页"><CandidateButton disabled={!query.offset || loading} onClick={() => updateQuery({ offset: Math.max(0, query.offset - query.limit) })}>上一页</CandidateButton><span>{page?.total ? query.offset + 1 : 0}–{query.offset + (page?.items.length ?? 0)} / {page?.total ?? 0}</span><CandidateButton disabled={loading || query.offset + (page?.items.length ?? 0) >= (page?.total ?? 0)} onClick={() => updateQuery({ offset: query.offset + query.limit })}>下一页</CandidateButton></CandidateToolbar>
    </div>
  </CandidateReviewDialog>;
}

export function openCandidateAssetPicker(options: CandidateAssetPickerOptions): Promise<AssetPickerChoice | null> {
  const active = options.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const scope = options.scope?.closest<HTMLElement>('.gc-candidate') ?? active?.closest<HTMLElement>('.gc-candidate');
  if (!scope) return Promise.reject(new Error('候选素材选择器缺少所属工作台。'));
  const container = document.createElement('div');
  container.className = 'candidate-picker-mount'; scope.append(container);
  const root = createRoot(container);
  const scroll: { node: HTMLElement; top: number; left: number }[] = [];
  for (let node = active?.parentElement; node; node = node.parentElement) scroll.push({ node, top: node.scrollTop, left: node.scrollLeft });
  return new Promise(resolve => {
    let done = false;
    const finish = (choice: AssetPickerChoice | null) => {
      if (done) return; done = true;
      observer.disconnect();
      queueMicrotask(() => { root.unmount(); container.remove(); if (active?.isConnected) active.focus({ preventScroll: true });
        for (const item of scroll) if (item.node.isConnected) { item.node.scrollTop = item.top; item.node.scrollLeft = item.left; }
        resolve(choice);
      });
    };
    const observer = new MutationObserver(() => { if (!container.isConnected) finish(null); });
    observer.observe(scope.ownerDocument, { childList: true, subtree: true });
    root.render(<AssetPicker options={options} finish={finish}/>);
  });
}
