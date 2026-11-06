import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Music, Plus, Video } from 'lucide-react';
import { createId, GalleryEntrySchema, type Asset, type DocumentView, type EditInput, type GalleryEntry, type Json, type Source } from '@galcraft/contracts';
import { parse, patchFields, toDocumentPatch } from '@galcraft/dsl';
import { galleryContentEdit, galleryDocuments } from '../../../authoring/gallery-content.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateInput, CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { CandidateShortNumber } from './CandidateShortNumber.js';
import type { PageStore, PageTemplate } from './page-edit.js';
import { CandidateResourcePreview, type PageResourcePreviewInput } from './page-resource-preview.js';
import { pickWorkfaceAsset, resultValue, workfaceError } from './workface-helpers.js';

type Kind = GalleryEntry['kind'];
type Draft = { entry: GalleryEntry; baseline: string };
const kinds = { cg: 'CG', video: '影片', music: '音乐' };
const mediaTypes = { cg: 'image', video: 'video', music: 'audio' } as const;
const kindIcons = { cg: Image, video: Video, music: Music };
export const galleryDraftKey = (id: string) => id + '/gallery-entry';

function storyDocuments(documents: DocumentView[]) {
  return documents.flatMap(document => Object.entries(document.files)
    .filter(([path]) => path.endsWith('/script.gal'))
    .map(([, text]) => ({ document, parsed: parse({ documentId: document.documentId, revision: document.revision, text }) })));
}
type Story = ReturnType<typeof storyDocuments>[number];
type Statement = Story['parsed']['statements'][number];
const statementKind = (statement?: Statement): Kind | undefined => {
  if (!statement) return undefined;
  if (['changeBg', 'unlockCg'].includes(statement.command)) return 'cg';
  if (['bgm', 'unlockBgm'].includes(statement.command)) return 'music';
  if (['video', 'unlockVideo'].includes(statement.command)) return 'video';
};
function origin(store: PageStore, stories: Story[]) {
  const { ui } = store.getSnapshot();
  const scene = store.controller.source?.scenes.find(item => item.sceneId === ui.sceneId);
  if (!scene) return undefined;
  const statementId = store.viewState<string>('script:editorOrigin') === 'commands:' + scene.sceneId ? store.commandSelection(scene.sceneId) : ui.lineId;
  if (!statementId) return undefined;
  const story = stories.find(item => item.document.documentId === scene.documentId);
  return story && { ...story, statement: story.parsed.statements.find(item => item.id === statementId) };
}
function associate(input: EditInput, entry: GalleryEntry, ids: string[], target: ReturnType<typeof origin>) {
  const statement = target?.statement;
  if (!target || !statement?.id) throw new Error('请先在创作页选择要关联的指令。');
  if (statementKind(statement) !== entry.kind) throw new Error('当前指令与条目类型不同。');
  if (entry.kind === 'cg' && !ids.length) throw new Error('请至少选择一张差分。');
  if (statement.command === 'changeBg' && ids.length !== 1) throw new Error('背景指令需要选择一张匹配差分。');
  const linked = statement.command.startsWith('unlock');
  const changes: { field: string; op: 'set'; value: Json }[] = [{ field: linked ? 'entryId' : 'galleryId', op: 'set', value: entry.id }];
  if (entry.kind === 'cg') changes.push({ field: linked ? 'differenceIds' : 'differenceId', op: 'set', value: linked ? ids : ids[0]! });
  const { document, parsed } = target;
  const patch = resultValue(patchFields(parsed, { documentId: document.documentId, revision: document.revision, statementIds: [statement.id], changes }));
  input.expected.push({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
  input.patches.push(toDocumentPatch(document.documentId, patch));
}

export function CandidateGalleryContent({ store, template, documents, viewId, locale, active, onNavigate, onPending }: {
  store: PageStore; template: PageTemplate; documents: DocumentView[]; viewId: string; locale: string; active: boolean;
  onNavigate?: (id: string) => void; onPending: () => void;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const stories = useMemo(() => storyDocuments(documents), [documents]);
  const source = origin(store, stories);
  const entries = useMemo(() => galleryDocuments(documents), [documents]);
  const [draft, setDraft] = useState(() => store.viewState<Draft>(galleryDraftKey(viewId)));
  const remembered = store.viewState<{ id: string; kind: Kind }>(viewId + '/selection');
  const [kind, setKind] = useState<Kind>(() => draft?.entry.kind ?? statementKind(source?.statement) ?? remembered?.kind ?? 'cg');
  const [id, setId] = useState(() => draft?.entry.id ?? String(source?.statement?.args.galleryId ?? source?.statement?.args.entryId ?? remembered?.id ?? ''));
  const [sample, setSample] = useState('partial');
  const [preview, setPreview] = useState(false);
  const [selection, setSelection] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [remove, setRemove] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const visible = entries.filter(item => item.entry.kind === kind).sort((a, b) =>
    (a.entry.seriesOrder ?? 0) - (b.entry.seriesOrder ?? 0) || a.entry.order - b.entry.order);
  const selected = visible.find(item => item.entry.id === id) ?? visible[0];
  const entry = draft?.entry ?? selected?.entry;
  const conflict = !!draft && (selected?.entry.id !== draft.entry.id || JSON.stringify(selected.entry) !== draft.baseline);
  const assets: Asset[] = useMemo(() => documents.flatMap(item => {
    const raw = item.files['assets/index.json'];
    return raw ? JSON.parse(raw).data.assets : [];
  }), [documents]);
  const previewInput = useMemo<PageResourcePreviewInput>(() => ({ template, page: kind === 'music' ? 'music' : 'cg', sample }), [template, kind, sample]);
  useEffect(() => {
    if (active && selected) store.target(selected.document.documentId);
  }, [active, selected?.document.documentId, store]);
  const retain = (next: Draft | undefined) => { setDraft(next); store.rememberViewState(galleryDraftKey(viewId), next); onPending(); };
  const reset = () => { retain(undefined); setError(''); setNotice(''); };
  const guard = (action: () => void) => { if (draft) setLeave(() => action); else action(); };
  const open = (kind: Kind, id: string) => {
    reset(); setKind(kind); setId(id); setSelection(undefined); store.rememberViewState(viewId + '/selection', { kind, id });
  };
  const update = (change: (next: GalleryEntry) => void) => {
    if (!entry || !selected) return;
    const next = structuredClone(entry);
    change(next);
    const baseline = draft?.baseline ?? JSON.stringify(selected.entry);
    retain(JSON.stringify(next) === baseline ? undefined : { entry: next, baseline });
    setError(''); setNotice('');
  };
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError(workfaceError(reason)); } finally { setBusy(false); }
  };
  const references = entry ? stories.flatMap(({ document, parsed }) => parsed.statements
    .filter(item => item.args.entryId === entry.id || item.args.galleryId === entry.id).map(statement => ({ document, statement }))) : [];
  const differences = [...entry?.differences ?? []].sort((a, b) => a.order - b.order);
  const chosen = (selection ?? differences.slice(0, 1).map(item => item.id)).filter(id => differences.some(item => item.id === id));
  const apply = (link = false, remove = false) => void run(async () => {
    if (!entry || !selected) return;
    const docs = store.host.list(), latest = galleryDocuments(docs).find(item => item.entry.id === entry.id);
    if (!latest || JSON.stringify(latest.entry) !== (draft?.baseline ?? JSON.stringify(selected.entry))) throw new Error('条目已变化，请重新读取。');
    if (remove && storyDocuments(docs).some(item => item.parsed.statements.some(statement => statement.args.entryId === entry.id || statement.args.galleryId === entry.id))) throw new Error('请先处理条目的剧情解锁引用。');
    const edit = galleryContentEdit(docs, GalleryEntrySchema.parse(entry), remove);
    if (link) associate(edit, entry, chosen, origin(store, storyDocuments(docs)));
    resultValue(await store.applyEdit(edit));
    reset(); setRemove(false); setNotice(remove ? '已移除鉴赏条目 · 未保存' : '已应用鉴赏内容 · 未保存');
  });
  const insert = () => void run(async () => {
    if (!entry) return;
    if (entry.kind === 'cg' && !chosen.length) throw new Error('请选择至少一张差分。');
    const docs = store.host.list(), target = origin(store, storyDocuments(docs));
    if (!target) throw new Error('请先在创作页选择插入位置。');
    const { document, parsed, statement } = target;
    const position = parsed.cst.find(node => node.id === statement?.id)?.end ?? parsed.text.length;
    const command = entry.kind === 'cg' ? 'unlockCg' : entry.kind === 'music' ? 'unlockBgm' : 'unlockVideo';
    const args = entry.kind === 'cg' ? { entryId: entry.id, differenceIds: chosen } : { entryId: entry.id };
    const edit: EditInput = { label: '插入鉴赏解锁', origin: 'field', expected: [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }],
      patches: [{ kind: 'text', documentId: document.documentId, edits: [{ start: position, end: position, before: '', after: '\n' + command + ' ' + JSON.stringify(args) + ' @' + createId(docs) + ';' }] }],
      preparedAssets: [], requiredRefs: [{ kind: 'gallery', id: entry.id }] };
    resultValue(await store.applyEdit(edit));
    store.target(document.documentId);
    setNotice('已插入独立解锁指令 · 未保存');
  });
  const create = () => void run(async () => {
    const docs = store.host.list(), target = origin(store, storyDocuments(docs));
    const statement = target?.statement, matching = statementKind(statement) === kind;
    const assetId = matching && typeof statement?.args.assetId === 'string' ? statement.args.assetId : undefined;
    const next: GalleryEntry = { id: createId(docs), kind, name: '新鉴赏条目', series: '默认系列', seriesOrder: 0,
      order: galleryDocuments(docs).length, cover: null, lockedView: 'placeholder', assets: kind !== 'cg' && assetId ? [assetId] : [],
      ...(kind === 'cg' ? { differences: assetId ? [{ id: createId(), assetId, name: '差分 1', order: 0 }] : [], coverDifferenceId: null } : {}) };
    const edit = galleryContentEdit(docs, next);
    if (matching && (kind !== 'cg' || next.differences?.length)) associate(edit, next, next.differences?.map(item => item.id) ?? [], target);
    resultValue(await store.applyEdit(edit));
    open(kind, next.id);
    setNotice('已新建鉴赏条目 · 未保存');
  });
  const pick = (purpose: string, kind: Asset['kind'], trigger: HTMLButtonElement, currentAssetId: string | null, change: (entry: GalleryEntry, assetId: string) => void) =>
    void run(async () => {
      const projectId = resultValue(await store.services.read()).project.projectId;
      const id = await pickWorkfaceAsset(store.services, scope.current, { projectId, locale, purpose, allowedKinds: [kind], returnFocus: trigger, currentAssetId });
      if (id) update(next => change(next, id));
    });
  const mediaName = (id?: string | null) => {
    const asset = assets.find(item => item.id === id), duration = asset?.variants.find(item => item.id === asset.activeVariantId)?.metadata?.durationSec;
    return asset ? asset.name + (duration ? ' · ' + duration + ' s' : '') : id ? '素材不可用' : '未选择';
  };
  const locate = (source: Source) => {
    const scene = store.controller.source?.scenes.find(item => item.documentId === source.documentId);
    if (!scene) return;
    if (source.statementId) store.selectCommand(scene.sceneId, source.statementId);
    onNavigate?.('source:' + scene.sceneId);
  };
  const mediaButton = (purpose: string, kind: Asset['kind'], id: string | null, change: (entry: GalleryEntry, assetId: string) => void) =>
    <CandidateButton disabled={busy} onClick={event => pick(purpose, kind, event.currentTarget, id, change)}>{purpose}</CandidateButton>;
  const hasEnding = stories.some(item => item.parsed.statements.some(statement => statement.command === 'end' && typeof statement.args.endingId === 'string' && statement.args.endingId.trim()));
  return <div ref={scope} className="candidate-resource-stack">
    {!hasEnding && <p className="candidate-resource-hint">鉴赏需要至少一个带结局标识的 end 指令。</p>}
    <CandidateToolbar label="鉴赏类型" className="candidate-resource-toolbar">
      {(Object.keys(kinds) as Kind[]).map(value => <CandidateButton key={value} aria-pressed={kind === value} disabled={busy} onClick={() => value !== kind && guard(() => open(value, ''))}>{kinds[value]}</CandidateButton>)}
      <CandidateButton variant="secondary" disabled={busy} onClick={() => guard(create)}><Plus size={14}/>新建条目</CandidateButton>
      <CandidateButton disabled={!selected || busy || !!draft} onClick={() => selected && void store.save(false, selected.document.documentId)}>保存条目</CandidateButton>
      <CandidateButton aria-expanded={preview} onClick={() => setPreview(!preview)}>Player 样例</CandidateButton>
    </CandidateToolbar>
    {preview && <CandidateSection title="鉴赏预览" actions={<CandidateField label="样例" layout="row"><CandidateSelect density="compact" value={sample} onValueChange={setSample}>
      <option value="partial">部分解锁</option><option value="full">全部解锁</option><option value="locked">未解锁</option><option value="empty">空列表</option><option value="missing">缺图</option><option value="longText">长文本</option>
    </CandidateSelect></CandidateField>}><CandidateResourcePreview store={store} input={previewInput} active={active}/></CandidateSection>}
    <div className="candidate-resource-split">
      <CandidateSection title={kinds[kind] + ' 条目'}>
        <div className="candidate-resource-list">{visible.map(item => {
          const Icon = kindIcons[kind];
          return <CandidateObjectRow key={item.entry.id} title={item.entry.name} description={item.entry.series} icon={<Icon size={14}/>}
            active={selected?.entry.id === item.entry.id} disabled={busy} onActivate={() => guard(() => open(kind, item.entry.id))}/>;
        })}</div>
        {!visible.length && <CandidateState kind="empty" title="暂无鉴赏条目" description="新建条目并选择素材，随后关联剧情解锁点。"/>}
      </CandidateSection>
      {entry && <div className="candidate-resource-stack">
        <CandidateSection title={entry.name || '条目属性'}>
          <div className="candidate-resource-fields">
            <CandidateField label="名称"><CandidateInput density="compact" disabled={busy} value={entry.name} onChange={event => update(next => { next.name = event.currentTarget.value; })}/></CandidateField>
            <CandidateField label="系列"><CandidateInput density="compact" disabled={busy} value={entry.series} onChange={event => update(next => { next.series = event.currentTarget.value; })}/></CandidateField>
            <CandidateField label="系列顺序"><CandidateShortNumber disabled={busy} value={entry.seriesOrder ?? 0} onValueChange={value => update(next => { next.seriesOrder = value; })}/></CandidateField>
            <CandidateField label="条目顺序"><CandidateShortNumber disabled={busy} value={entry.order} onValueChange={value => update(next => { next.order = value; })}/></CandidateField>
            <CandidateField label="未解锁时隐藏" layout="row"><CandidateCheckbox disabled={busy} checked={entry.lockedView === 'hidden'} onChange={event => update(next => { next.lockedView = event.currentTarget.checked ? 'hidden' : 'placeholder'; })}/></CandidateField>
          </div>
        </CandidateSection>
        {entry.kind === 'cg' ? <CandidateSection title="差分" actions={mediaButton('添加差分', 'image', null, (next, assetId) => {
          next.differences ??= [];
          next.differences.push({ id: createId(next), assetId, name: '新差分', order: next.differences.length });
        })}>
          {differences.map(item => {
            const referenced = references.some(({ statement }) => statement.args.differenceId === item.id
              || (Array.isArray(statement.args.differenceIds) && statement.args.differenceIds.includes(item.id)));
            return <div className="candidate-resource-difference" key={item.id}>
              <CandidateField label="差分名称"><CandidateInput density="compact" disabled={busy} value={item.name} onChange={event => update(next => { next.differences!.find(diff => diff.id === item.id)!.name = event.currentTarget.value; })}/></CandidateField>
              <CandidateField label="顺序"><CandidateShortNumber disabled={busy} value={item.order} onValueChange={value => update(next => { next.differences!.find(diff => diff.id === item.id)!.order = value; })}/></CandidateField>
              <p className="candidate-resource-hint">{mediaName(item.assetId)}{entry.coverDifferenceId === item.id ? ' · 封面' : ''}</p>
              <CandidateField label="纳入本次解锁" layout="row"><CandidateCheckbox checked={chosen.includes(item.id)} onChange={event => setSelection(event.currentTarget.checked ? [...chosen, item.id] : chosen.filter(value => value !== item.id))}/></CandidateField>
              <CandidateToolbar label={item.name + ' 操作'} className="candidate-resource-toolbar">
                {mediaButton('更换差分素材', 'image', item.assetId, (next, assetId) => { next.differences!.find(diff => diff.id === item.id)!.assetId = assetId; })}
                <CandidateButton disabled={busy || entry.coverDifferenceId === item.id} onClick={() => update(next => { next.coverDifferenceId = item.id; })}>设为封面</CandidateButton>
                <CandidateButton variant="danger" disabled={busy} disabledReason={referenced ? '请先处理该差分的解锁引用。' : undefined} onClick={() => update(next => {
                  next.differences = next.differences!.filter(diff => diff.id !== item.id); if (next.coverDifferenceId === item.id) next.coverDifferenceId = null;
                })}>移除差分</CandidateButton>
              </CandidateToolbar>
            </div>;
          })}
          {!differences.length && <p className="candidate-resource-hint">添加图像素材作为差分。</p>}
        </CandidateSection> : <CandidateSection title="媒体与封面">
          <CandidateToolbar label="媒体与封面" className="candidate-resource-toolbar">{mediaButton('选择媒体', mediaTypes[entry.kind], entry.assets[0] ?? null, (next, id) => { next.assets = [id]; })}<span>{mediaName(entry.assets[0])}</span></CandidateToolbar>
          <CandidateToolbar label="鉴赏封面" className="candidate-resource-toolbar">{mediaButton('选择封面', 'image', entry.cover ?? null, (next, id) => { next.cover = id; })}<span>{mediaName(entry.cover)}</span></CandidateToolbar>
        </CandidateSection>}
        <CandidateSection title="剧情解锁">
          <CandidateToolbar label="鉴赏解锁操作" className="candidate-resource-toolbar">
            <CandidateButton disabled={busy || !!draft || !source} onClick={insert}>在当前句后插入独立解锁</CandidateButton>
            <CandidateButton disabled={busy || conflict || statementKind(source?.statement) !== entry.kind} onClick={() => apply(true)}>{entry.kind === 'cg' ? '关联当前指令所选差分' : '关联当前指令'}</CandidateButton>
          </CandidateToolbar>
          {references.length ? references.map(({ document, statement }) => {
            const path = Object.keys(document.files).find(item => item.endsWith('/scene.json'));
            const scene = path && JSON.parse(document.files[path]!).data.name;
            return <CandidateObjectRow key={document.documentId + '/' + statement.id} title={statement.command} description={scene} onActivate={() => locate(statement.source)}/>;
          }) : <p className="candidate-resource-hint">尚无剧情解锁位置。</p>}
        </CandidateSection>
        <CandidateToolbar label="条目操作" className="candidate-resource-toolbar">
          <CandidateButton variant="primary" disabled={busy || conflict || !draft || !entry.name.trim() || !entry.series.trim()} onClick={() => apply()}>应用条目</CandidateButton>
          {draft && <CandidateButton disabled={busy} onClick={reset}>恢复输入</CandidateButton>}
          <CandidateButton variant="danger" disabled={busy || conflict} disabledReason={references.length ? '请先处理剧情解锁引用。' : undefined} onClick={() => setRemove(true)}>移除条目</CandidateButton>
        </CandidateToolbar>
        <CandidateSection title="技术详情" collapsible initiallyOpen={false}><code>{entry.id}</code></CandidateSection>
      </div>}
    </div>
    {(error || conflict) && <CandidateState kind="error" title={error || '条目已被其他编辑修改。'}/>}
    {notice && <p className="candidate-resource-hint" role="status">{notice}</p>}
    <CandidateReviewDialog open={remove} title="移除鉴赏条目？" description={entry?.name} busy={busy} onDismiss={() => setRemove(false)}
      actions={<CandidateButton variant="danger" disabled={busy} onClick={() => apply(false, true)}>移除条目</CandidateButton>}/>
    <CandidateReviewDialog open={!!leave} title="鉴赏条目有未应用的修改" description="继续切换会丢弃这些修改。" onDismiss={() => setLeave(null)}
      actions={<CandidateButton variant="danger" onClick={() => { const next = leave; setLeave(null); next?.(); }}>放弃修改并继续</CandidateButton>}/>
  </div>;
}
