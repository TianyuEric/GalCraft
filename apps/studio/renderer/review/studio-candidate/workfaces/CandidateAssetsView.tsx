import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AssetReferenceSchema, type Asset, type AssetKind, type AssetTypeCatalogEntry, type Id, type StudioBridge } from '@galcraft/contracts';
import { assetNameParts } from '@galcraft/assets/naming';
import { CandidateButton as Button, CandidateField, CandidateInput as Input, CandidateMenuButton, CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { Folder, LibraryBig } from 'lucide-react';
import { CandidateAssetTypeFilters } from '../components/CandidateAssetPicker.js';
import { assetTypeIcon, assetTypeName } from '../../../authoring/asset-type-catalog.js';
import { assetFileName, mergeAssetImportResult, type AssetImportResult } from '../../../authoring/asset-import-model.js';
import type { AssetPage, AssetQuery } from '../../../authoring/controller.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { initialAssetQuery, replaceAssetSelection, selectAssetRow, useAssetDockVisible, useAssetWorkspace, useCandidateAssetIndex, writeCandidateAssetDrag, type AssetReview } from './asset-workspace.js';
import { createAssetPickerPreview } from '../../../authoring/asset-picker-preview.js';
import { importCandidateFiles, type CandidateLocalAsset } from '../adapters/candidate-local-assets.js';
import { resultValue, workfaceError, type CandidateWorkfaceProps } from './workface-helpers.js';
import '../styles/assets.css';

type BatchPlan = Extract<Awaited<ReturnType<StudioBridge['assets']['planBatchRename']>>, { ok: true }>['value'];
const noAssets: Asset[] = [];

function Choice({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange(value: string): void }) {
  return <CandidateSelect aria-label={label} density="compact" value={value} onValueChange={selectedValue => onChange(selectedValue)}>
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </CandidateSelect>;
}

export function CandidateAssetDirectoryView({ onNavigate }: CandidateWorkfaceProps) {
  const session = useCandidate();
  const index = useCandidateAssetIndex(session);
  const [{ query }, update] = useAssetWorkspace(session);
  const folders = new Map<string, string[]>();
  for (const asset of index.byId.values()) {
    for (let depth = 1; depth <= asset.folder.length; depth++) {
      const folder = asset.folder.slice(0, depth);
      folders.set(JSON.stringify(folder), folder);
    }
  }
  function scope(folder: string[] | null) {
    update({ folderText: folder?.join('/') ?? '', query: { ...query, folder, offset: 0 }, locateId: null, scrollTop: 0, maximizedScrollTop: null });
    onNavigate?.('assets');
  }
  return <section className="candidate-workface candidate-asset-directory" aria-label="素材目录">
    <CandidateObjectRow icon={<LibraryBig size={15}/>} title="全部素材" active={!query.folder} onActivate={() => scope(null)}/>
    {[...folders.values()].sort((left, right) => left.join('/').localeCompare(right.join('/'))).map(folder => (
      <CandidateObjectRow key={JSON.stringify(folder)} className="candidate-asset-directory-folder"
        style={{ paddingInlineStart: Math.min(4, folder.length) * 12 }}
        icon={<Folder size={15}/>} title={folder.at(-1)!} metadata={folder.length > 1 ? folder.slice(0, -1).join('/') : undefined}
        active={query.folder?.join('/') === folder.join('/')} onActivate={() => scope(folder)}/>
    ))}
  </section>;
}
const noThumbnails: Record<Id, string> = {};

function AssetRowIcon({ kind, catalog }: { kind: AssetKind; catalog: AssetTypeCatalogEntry[] }) {
  const icon = useRef<HTMLSpanElement>(null);
  useEffect(() => { icon.current?.replaceChildren(assetTypeIcon(kind, catalog)); }, [kind, catalog]);
  return <span className="candidate-asset-row-icon" ref={icon} aria-hidden="true"/>;
}

export function CandidateAssetsView({ onNavigate }: CandidateWorkfaceProps) {
  const store = useCandidate();
  const projectActive = useCandidateState().projectActive;
  const services = store.services;
  const locale = store.controller.preferences.locale;
  const index = useCandidateAssetIndex(store);
  const [workspace, update, readWorkspace] = useAssetWorkspace(store);
  const { query, folderText, locateId, selection, referenceReturn } = workspace;
  const { activeId, selectedIds } = selection;
  const [catalog, setCatalog] = useState<AssetTypeCatalogEntry[]>([]);
  const [loaded, setLoaded] = useState<{ query: AssetQuery; page: AssetPage; revision: number | undefined; attempt: number }>();
  const [thumbnails, setThumbnails] = useState<{ items: Asset[]; urls: Record<Id, string> }>();
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [importResult, setImportResult] = useState<AssetImportResult>();
  const [importedIds, setImportedIds] = useState<Id[]>([]);
  const [review, setReview] = useState<AssetReview>();
  const [batchName, setBatchName] = useState('{name}-{n}');
  const [batchPlan, setBatchPlan] = useState<BatchPlan>();
  const [attempt, setAttempt] = useState(0);
  const running = useRef(false);
  const localFiles = useRef<CandidateLocalAsset[]>([]);
  const fileBatch = useRef<AbortController | undefined>(undefined);
  const picker = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [listening, setListening] = useState<Asset>();
  const listeningMedia = useRef<HTMLDivElement>(null);
  useEffect(() => () => fileBatch.current?.abort(), []);
  useEffect(() => {
    const input = picker.current;
    if (!input) return;
    const cancel = () => setMessage('已取消选择文件。');
    input.addEventListener('cancel', cancel);
    return () => input.removeEventListener('cancel', cancel);
  }, []);

  const root = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const visible = useAssetDockVisible(root, projectActive);
  const page = loaded && loaded.query === query && loaded.revision === index.revision && loaded.attempt === attempt ? loaded.page : null;
  const items = page?.items ?? noAssets;
  const urls = thumbnails?.items === items ? thumbnails.urls : noThumbnails;
  const order = items.map(item => item.id);
  const selected = new Set(selectedIds);
  const onPage = order.filter(id => selected.has(id)).length;
  const focusedId = activeId && order.includes(activeId) ? activeId : order[0];
  const current = activeId ? index.byId.get(activeId) : undefined;
  useLayoutEffect(() => {
    const panel = root.current?.closest<HTMLElement>('[data-view="assets"]');
    const node = body.current;
    if (!page || !visible || !node) return;
    const restore = () => {
      const state = readWorkspace();
      node.scrollTop = panel?.dataset.maximized === 'true' ? state.maximizedScrollTop ?? state.scrollTop : state.scrollTop;
    };
    restore();
    if (!panel) return;
    const resize = new MutationObserver(restore);
    resize.observe(panel, { attributes: true, attributeFilter: ['data-maximized'] });
    return () => resize.disconnect();
  }, [page, visible, readWorkspace]);
  useEffect(() => {
    if (!listening || !visible || !listeningMedia.current) return;
    const preview = createAssetPickerPreview(listeningMedia.current, services, locale);
    void preview.preview(listening, listening.activeVariantId);
    return preview.dispose;
  }, [listening, visible, services, locale]);
  const assetKinds = [...new Set<AssetKind>([...catalog.map(item => item.descriptor.key), ...items.map(item => item.kind), 'image', 'audio', 'video', 'font'])];

  async function execute(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (reason) { setError(workfaceError(reason)); } finally { running.current = false; setBusy(false); }
  }

  useEffect(() => {
    let live = true;
    void services.assetTypeCatalog?.().then(result => { if (live) setCatalog(resultValue(result)); }).catch(reason => { if (live) setError(workfaceError(reason)); });
    return () => { live = false; };
  }, [services, index.revision]);

  useEffect(() => {
    let live = true;
    setReadError('');
    void services.queryAssets(query).then(result => {
      if (!live) return;
      const next = resultValue(result);
      if (query.offset && query.offset >= next.total) {
        update({ query: { ...query, offset: Math.max(0, Math.ceil(next.total / query.limit) - 1) * query.limit } });
      } else setLoaded({ query, page: next, revision: index.revision, attempt });
    }).catch(reason => { if (live) setReadError(workfaceError(reason)); });
    return () => { live = false; };
  }, [services, query, index.revision, attempt, update]);

  useEffect(() => {
    if (!visible || !items.length || !services.thumbnails) return;
    const requests = items.filter(asset => asset.kind === 'image').map(asset => ({ assetId: asset.id, variantId: asset.activeVariantId }));
    if (!requests.length) return;
    let live = true;
    void services.thumbnails(requests).then(result => {
      if (live && result.ok) setThumbnails({ items, urls: Object.fromEntries(result.value.map(item => [item.assetId, item.uri])) });
    }).catch(() => { /* Type icons remain available when thumbnails cannot be read. */ });
    return () => { live = false; };
  }, [items, services, visible]);


  useEffect(() => {
    if (!locateId || !visible) return;
    if (page?.items.some(asset => asset.id === locateId)) {
      const row = [...(list.current?.querySelectorAll<HTMLElement>('[data-asset-row]') ?? [])].find(element => element.dataset.assetRow === locateId);
      row?.focus();
      row?.scrollIntoView({ block: 'nearest' });
      update({ locateId: null });
      return;
    }
    if (!services.allAssetIds) {
      update({ locateId: null });
      return;
    }
    let live = true;
    const { offset: _offset, limit: _limit, ...filter } = initialAssetQuery;
    void services.allAssetIds(filter).then(result => {
      if (!live) return;
      const at = resultValue(result).ids.indexOf(locateId);
      if (at < 0) { update({ locateId: null }); return; }
      update({ folderText: '', query: { ...initialAssetQuery, offset: Math.floor(at / initialAssetQuery.limit) * initialAssetQuery.limit } });
    }).catch(reason => { if (live) { setError(workfaceError(reason)); update({ locateId: null }); } });
    return () => { live = false; };
  }, [locateId, visible, page, services, update]);

  function chooseRow(id: Id, modifiers?: Parameters<typeof selectAssetRow>[3]) {
    update({ selection: selectAssetRow(readWorkspace().selection, id, order, modifiers) });
  }

  function changeFilter(changes: Partial<AssetQuery>) {
    update({ locateId: null, query: { ...query, ...changes, offset: 0 }, scrollTop: 0, maximizedScrollTop: null });
  }

  function movePage(offset: number) {
    update({ locateId: null, query: { ...query, offset }, scrollTop: 0, maximizedScrollTop: null });
    if (body.current) body.current.scrollTop = 0;
  }

  function openPreview(id: Id) {
    onNavigate?.('assets:' + id);
  }

  function selectPage() {
    const ids = [...new Set([...readWorkspace().selection.selectedIds, ...order])];
    update({ selection: { activeId: focusedId ?? null, selectedIds: ids, rangeAnchor: focusedId ?? null } });
  }

  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || !focusedId) return;
    const originId = (event.target as HTMLElement).closest<HTMLElement>('[data-asset-row]')?.dataset.assetRow ?? focusedId;
    const key = event.key;
    const toggle = event.ctrlKey || event.metaKey;
    if (toggle && key.toLowerCase() === 'a') { event.preventDefault(); event.stopPropagation(); selectPage(); return; }
    if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); update({ selection: replaceAssetSelection([]) }); return; }
    if (key === 'Enter') { event.preventDefault(); event.stopPropagation(); openPreview(originId); return; }
    if (key === ' ') { event.preventDefault(); event.stopPropagation(); chooseRow(originId, { toggle: true }); return; }
    if (key === 'F2' && onNavigate) {
      event.preventDefault(); event.stopPropagation();
      const pin = readWorkspace().pinnedIds;
      if (pin && (pin.length !== 1 || pin[0] !== originId)) {
        setMessage('素材属性已固定于其他来源。取消固定后可编辑此素材的名称。');
        return;
      }
      update({ selection: replaceAssetSelection([originId]), renameRequest: { assetId: originId } });
      onNavigate('asset-inspector');
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    event.preventDefault(); event.stopPropagation();
    const at = order.indexOf(originId);
    const next = key === 'Home' ? 0 : key === 'End' ? order.length - 1 : Math.max(0, Math.min(order.length - 1, at + (key === 'ArrowUp' ? -1 : 1)));
    chooseRow(order[next]!, { toggle, range: event.shiftKey, focusOnly: toggle && !event.shiftKey });
    list.current?.querySelectorAll<HTMLElement>('[data-asset-row]')[next]?.focus();
  }

  function openReview(kind: AssetReview['kind'], ids = selectedIds) {
    setError(''); setBatchPlan(undefined); setReview({ kind, ids: [...ids], visibleIds: order });
  }

  function closeReview() {
    if (running.current) return;
    setReview(undefined); setBatchPlan(undefined); setError('');
  }

  async function importFiles(entries: CandidateLocalAsset[], prior?: AssetImportResult) {
    const controller = new AbortController();
    fileBatch.current = controller;
    try {
      const result = await importCandidateFiles(store, entries, controller.signal);
      setImportResult(mergeAssetImportResult(result, prior));
      setImportedIds(previous => [...(prior ? previous : []), ...result.succeeded.map(asset => asset.id)]);
      localFiles.current = entries.filter(entry => result.failed.some(item => item.path === entry.key));
      store.refreshFromHost();
      if (controller.signal.aborted) setMessage('已取消其余导入，已登记的素材仍可使用。');
    } finally { fileBatch.current = undefined; }
  }

  function chooseFiles(files: FileList) {
    const entries = Array.from(files, (file, i) => ({ key: `${i + 1} · ${file.name}`, file }));
    if (entries.length) void execute(() => importFiles(entries));
  }

  const [deleteImpact, setDeleteImpact] = useState<{ review: AssetReview; count: number }>();
  useEffect(() => {
    if (review?.kind !== 'remove') return;
    let live = true;
    const port = services.bridge.assets;
    if (!port?.references) { setError('当前宿主未提供素材引用检查。'); return; }
    void Promise.all(review.ids.map(id => port.references!(id))).then(results => {
      if (live) setDeleteImpact({ review, count: results.reduce((count, result) => count + AssetReferenceSchema.array().parse(resultValue(result)).length, 0) });
    }).catch(reason => { if (live) setError(workfaceError(reason)); });
    return () => { live = false; };
  }, [review, services, index.revision]);

  const reviewAssets = review?.ids.flatMap(id => { const asset = index.byId.get(id); return asset ? [asset] : []; }) ?? [];
  const missing = review?.ids.filter(id => !index.byId.has(id)) ?? [];
  const reviewTitle = { rename: '批量改名', remove: '确认移除素材', selection: '查看所选素材', imported: '查看导入素材' };
  const renameCurrent = batchPlan && batchPlan.indexRevision === index.revision;
  const confirmRename = Boolean(renameCurrent && !batchPlan?.conflicts.length && services.applyBatchRename);
  const reviewError = error && review;
  const reviewedOnPage = new Set(review?.visibleIds);
  const renamedById = new Map(renameCurrent ? batchPlan.names.map(item => [item.assetId, item.after]) : []);

  return <section ref={root} className="candidate-workface candidate-asset-library" aria-label="素材库" data-drop-active={dropActive || undefined}
    onDragOver={event => {
      if (!event.dataTransfer.types.includes('Files') || busy) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropActive(true);
    }} onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
    }} onDrop={event => {
      if (!event.dataTransfer.files.length) return;
      event.preventDefault(); setDropActive(false);
      if (!busy) chooseFiles(event.dataTransfer.files);
    }} onFocusCapture={() => {
    if (index.documentId && store.getSnapshot().commandTarget !== index.documentId) store.target(index.documentId);
  }}>
    <header className="candidate-asset-library-tools">
      <CandidateToolbar label="素材搜索与导入" className="candidate-asset-toolrow candidate-asset-search">
        <Input type="search" aria-label="搜索素材" placeholder="搜索素材名称" value={query.text} onChange={event => changeFilter({ text: event.target.value })}/>
        <input type="file" multiple hidden ref={picker} aria-label="选择素材文件" onChange={event => {
          if (event.target.files) chooseFiles(event.target.files);
          event.target.value = '';
        }}/>
        <Button variant="primary" disabled={busy} onClick={() => picker.current?.click()}>导入素材</Button>
        {busy && fileBatch.current && <Button onClick={() => fileBatch.current?.abort()}>取消导入</Button>}
      </CandidateToolbar>
      <div className="candidate-asset-toolrow">
        <Choice label="素材类型" value={query.kind ?? ''} options={[{ value: '', label: '全部类型' }, ...assetKinds.map(kind => ({ value: kind, label: assetTypeName(kind, catalog, locale) }))]} onChange={kind => changeFilter({ kind: kind || null, typeFields: {} })}/>
        <CandidateSection title="筛选与排序" className="candidate-asset-filters" collapsible initiallyOpen={false}>
          <div className="candidate-asset-filter-fields">
            <Input aria-label="素材目录" placeholder="目录，例如 背景/春日" value={folderText} onChange={event => {
              const text = event.target.value, folder = text.split(/[\\/]/).map(item => item.trim()).filter(Boolean);
              update({ folderText: text, locateId: null, query: { ...query, folder: folder.length ? folder : null, offset: 0 }, scrollTop: 0, maximizedScrollTop: null });
            }}/>
            <Choice label="排序方式" value={query.sort ?? 'name'} options={[{ value: 'name', label: '名称' }, { value: 'size', label: '大小' }, { value: 'modified', label: '修改时间' }]} onChange={value => changeFilter({ sort: value as AssetQuery['sort'] })}/>
            <Button aria-label="切换素材排序方向" onClick={() => changeFilter({ direction: query.direction === 'asc' ? 'desc' : 'asc' })}>{query.direction === 'asc' ? '升序' : '降序'}</Button>
            <CandidateAssetTypeFilters catalog={catalog} kind={query.kind as AssetKind | null} values={query.typeFields} onChange={typeFields => update({ query: { ...readWorkspace().query, typeFields, offset: 0 } })}/>
          </div>
        </CandidateSection>
      </div>
      <div className="candidate-asset-toolrow candidate-asset-scope">
        <output aria-live="polite">{selectedIds.length ? '已选 ' + selectedIds.length + ' 项 · 本页 ' + onPage + ' · 其他页或筛选外 ' + (selectedIds.length - onPage) : page ? page.total + ' 项素材' : '正在读取素材…'}</output>
      </div>
      <div className="candidate-asset-toolrow candidate-asset-selection-tools">
        {referenceReturn && <Button onClick={() => {
          update({ referenceReturn: null }); onNavigate?.(referenceReturn.view);
        }}>返回 {referenceReturn.name}</Button>}
        <Button title={current?.name} disabled={!current || !onNavigate} onClick={() => activeId && openPreview(activeId)}>打开预览</Button>
        {current?.kind === 'audio' && <Button aria-pressed={listening?.id === current.id} onClick={() => setListening(listening?.id === current.id ? undefined : current)}>
          {listening?.id === current.id ? '停止试听' : '试听'}
        </Button>}
        <Button disabled={!onNavigate} onClick={() => onNavigate?.('asset-inspector')}>素材属性</Button>
        {selectedIds.length > 0 && <Button onClick={() => openReview('selection')}>查看所选</Button>}
        <CandidateMenuButton label="选择操作" actions={[
          {id:'page',label:'选择本页',disabledReason:busy?'正在处理素材':!order.length?'本页没有素材':undefined,run:selectPage},
          ...(services.allAssetIds?[{id:'all',label:'选择全部结果',disabledReason:busy?'正在处理素材':!page?.total?'当前没有结果':undefined,run:() => void execute(async () => {
              const { offset: _offset, limit: _limit, ...filter } = query;
              const result = resultValue(await services.allAssetIds!(filter));
              if (readWorkspace().query !== query) return;
              const ids = [...new Set([...readWorkspace().selection.selectedIds, ...result.ids])];
              update({ selection: { activeId: focusedId ?? ids[0] ?? null, rangeAnchor: focusedId ?? ids[0] ?? null, selectedIds: ids } });
            })}]:[]),
          {id:'clear',label:'清除选择',disabledReason:busy?'正在处理素材':!selectedIds.length?'请先选择素材':undefined,run:()=>update({selection:replaceAssetSelection([])})},
          {id:'rename',label:'批量改名',separatorBefore:true,disabledReason:busy?'正在处理素材':!selectedIds.length?'请先选择素材':undefined,run:()=>openReview('rename')},
          {id:'remove',label:'移除所选',disabledReason:busy?'正在处理素材':!selectedIds.length?'请先选择素材':undefined,run:()=>openReview('remove')},
        ]}>选择操作</CandidateMenuButton>
      </div>
    </header>
    {dropActive && <span className="candidate-asset-drop-label" role="status">释放以导入文件</span>}
    {listening && <div className="candidate-asset-listen"><div ref={listeningMedia}/>
      <Button onClick={() => setListening(undefined)}>结束试听</Button>
    </div>}
    <div className="candidate-asset-library-body" ref={body} onScroll={event => {
      const scrollTop = event.currentTarget.scrollTop;
      if (!visible || !page) return;
      if (root.current?.closest<HTMLElement>('[data-view="assets"]')?.dataset.maximized === 'true') {
        if (scrollTop !== readWorkspace().maximizedScrollTop) update({ maximizedScrollTop: scrollTop });
      } else if (scrollTop !== readWorkspace().scrollTop) update({ scrollTop });
    }}>
      {readError && <p className="candidate-asset-note" role="alert">{readError} <Button onClick={() => setAttempt(value => value + 1)}>重试读取</Button></p>}
      {error && !review && <p className="candidate-asset-note" role="alert">{error}</p>}
      {message && <p className="candidate-asset-note" role="status">{message}</p>}
      {importResult && <div className="candidate-asset-import">
        <CandidateSection title="素材导入结果" actions={<CandidateToolbar label="导入结果操作">
          {!!importResult.failed.length && <Button variant="secondary" disabled={busy} onClick={() => void execute(() => importFiles(localFiles.current, importResult))}>{busy ? '正在导入…' : '重试未导入项'}</Button>}
          <Button disabled={busy} onClick={() => setImportResult(undefined)}>关闭结果</Button>
        </CandidateToolbar>}>
          <p role="status">已导入 {importResult.succeeded} 项 · 未导入 {importResult.failed.length} 项</p>
          {!!importResult.succeeded && <p>成功导入的素材已在素材库中，可以继续选用。</p>}
          {!!importResult.failed.length && <ul className="candidate-import-failures" aria-label="未导入文件">{importResult.failed.map((item, index) => <li key={`${item.path}:${index}`}><strong>{assetFileName(item.path)}</strong><p>{item.reason}</p><code>{item.path}</code></li>)}</ul>}
        </CandidateSection>
        {!!importedIds.length && <Button onClick={() => openReview('imported', importedIds)}>查看导入项</Button>}
      </div>}
      {!page && !readError && <CandidateState kind="loading" title="正在读取素材"/>}
      {page && !page.total && <p className="candidate-asset-note">{query.text || query.kind || query.folder ? '当前筛选没有素材。' : '作品还没有素材。导入文件后可在这里查找、选择和预览。'}</p>}
      <div className="candidate-asset-rows" ref={list} role="listbox" aria-label="素材结果" aria-multiselectable="true" aria-busy={!page && !readError} onKeyDown={onListKey}>
        {items.map(asset => {
          const kind = assetTypeName(asset.kind, catalog, locale);
          const folder = asset.folder.join('/') || '根目录';
          return <Button role="option" key={asset.id} draggable onDragStart={event => {
            const projectId = store.controller.source?.project.projectId;
            if (projectId) writeCandidateAssetDrag(event.dataTransfer, projectId, asset);
            else event.preventDefault();
          }} data-asset-row={asset.id} data-active={activeId === asset.id}
            aria-selected={selected.has(asset.id)} aria-label={asset.name + ' · ' + kind} tabIndex={focusedId === asset.id ? 0 : -1}
            title={asset.name + ' · ' + folder + ' · ' + kind}
            onClick={event => chooseRow(asset.id, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey })}
            onDoubleClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) openPreview(asset.id); }}>
            <AssetRowIcon kind={asset.kind} catalog={catalog}/>
            {urls[asset.id] && <img key={urls[asset.id]} src={urls[asset.id]} alt="" className="candidate-asset-thumb" loading="lazy" onError={event => { event.currentTarget.hidden = true; }}/>}
            <span className="candidate-asset-row-name">{asset.name}</span>
            {asset.folder.length > 0 && <small>{folder}</small>}
          </Button>;
        })}
      </div>
    </div>
    {!!page?.total && <footer className="candidate-asset-toolrow candidate-asset-pagination">
      <Button disabled={!query.offset} onClick={() => movePage(Math.max(0, query.offset - query.limit))}>上一页</Button>
      <span>第 {Math.floor(query.offset / query.limit) + 1} / {Math.ceil(page.total / query.limit)} 页</span>
      <Button disabled={query.offset + query.limit >= page.total} onClick={() => movePage(query.offset + query.limit)}>下一页</Button>
    </footer>}
    {review && <CandidateReviewDialog open title={reviewTitle[review.kind]} onDismiss={closeReview} actions={<>
      <Button disabled={busy} onClick={closeReview}>{review.kind === 'selection' || review.kind === 'imported' ? '返回素材库' : '取消'}</Button>
      {review.kind === 'rename' && <Button variant="primary" disabled={busy || !!missing.length || !confirmRename} onClick={() => void execute(async () => {
        resultValue(await services.applyBatchRename!(batchPlan!.planId));
        setReview(undefined); setBatchPlan(undefined); store.refreshFromHost();
        setMessage('已重命名 ' + review.ids.length + ' 项素材。');
      })}>应用改名</Button>}
      {review.kind === 'remove' && <Button variant="danger" disabled={busy || !!missing.length || !reviewAssets.length || !services.removeAssets || deleteImpact?.review !== review || !!deleteImpact?.count} onClick={() => void execute(async () => {
        resultValue(await services.removeAssets!(review.ids));
        const removed = new Set(review.ids);
        update({ selection: replaceAssetSelection(readWorkspace().selection.selectedIds.filter(id => !removed.has(id))) });
        setReview(undefined); store.refreshFromHost();
        setMessage('已移除 ' + review.ids.length + ' 项素材。');
      })}>确认移除</Button>}
    </>}>
      <p>共 {review.ids.length} 项 · 本页 {review.ids.filter(id => reviewedOnPage.has(id)).length} 项</p>
      {review.kind === 'remove' && <p>移除素材索引会保留磁盘原文件。仍被引用的素材需先解除引用。{deleteImpact?.review === review ? ' 当前引用 ' + deleteImpact.count + ' 处。' : ' 正在读取引用…'}</p>}
      {review.kind === 'rename' && <div className="candidate-asset-review-template">
        <CandidateField label="命名模板">{field => <Input {...field} value={batchName} disabled={busy} onChange={event => { setBatchName(event.target.value); setBatchPlan(undefined); }}/>}</CandidateField>
        <span>可用字段 {'{name}、{n}'}</span>
        <Button disabled={busy || !batchName.trim() || !!missing.length || !services.planBatchRename} onClick={() => void execute(async () => {
          const template = batchName.trim().replaceAll('{name}', '{usage}').replaceAll('{n}', '{number}');
          setBatchPlan(resultValue(await services.planBatchRename!({
            assetIds: review.ids, template,
            values: reviewAssets.map(asset => ({ assetId: asset.id, chapter: '', character: '', usage: assetNameParts(asset.name).stem })),
          })));
        })}>预览命名</Button>
      </div>}
      <ol className="candidate-asset-review-items" aria-label="本次涉及的全部素材">{reviewAssets.map(asset => {
        const name = renamedById.get(asset.id);
        return <li key={asset.id}><strong>{asset.name}</strong>{name && <span className="candidate-asset-renamed"> → {name}</span>}
          <small>{asset.folder.join('/') || '根目录'} · {assetTypeName(asset.kind, catalog, locale)} · {reviewedOnPage.has(asset.id) ? '本页' : '其他页或筛选外'}</small></li>;
      })}</ol>
      {!!missing.length && <p role="alert">有 {missing.length} 项素材已失效。<Button disabled={busy} onClick={() => {
        const unavailable = new Set(missing);
        update({ selection: replaceAssetSelection(readWorkspace().selection.selectedIds.filter(id => !unavailable.has(id))) });
        setReview({ ...review, ids: review.ids.filter(id => !unavailable.has(id)) });
        setBatchPlan(undefined);
      }}>移除失效选择</Button></p>}
      {batchPlan && !renameCurrent && <p role="status">素材索引已更新，请重新预览命名。</p>}
      {renameCurrent && batchPlan.conflicts.map(item => <p key={item.name} role="alert">名称冲突 · {item.name}</p>)}
      {reviewError && <p role="alert">{error}</p>}
    </CandidateReviewDialog>}
  </section>;
}
