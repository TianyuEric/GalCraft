import { useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, GripVertical } from 'lucide-react';
import { CharacterSchema, type Asset, type Character, type DocumentView, type EditInput, type Id } from '@galcraft/contracts';
import { afterstoryPresentation, upperBodyCrop } from '../../../authoring/characters/AfterstoryLayoutEditor.js';
import { FigureCropEditor } from '../../../authoring/characters/SharedDifferencesEditor.js';
import { CandidateButton, CandidateField, CandidateIconButton, CandidateSection, CandidateSelect, CandidateState } from '../components/controls/index.js';
import type { PageStore } from './page-edit.js';
import { resultValue, workfaceError } from './workface-helpers.js';
import '../styles/page-resources.css';

type Presentation = NonNullable<NonNullable<Character['afterstory']>['presentation']>;
type CharacterEntry = { doc: DocumentView; character: Character };

export function CandidatePageAfterstory({ store, viewId, locale }: { store: PageStore; viewId: string; locale: string }) {
  const { documents } = useSyncExternalStore(store.host.subscribe, store.host.getSnapshot, store.host.getSnapshot);
  const [selected, setSelected] = useState(() => store.viewState<Id>(viewId + '/afterstory-selection'));
  const [dragged, setDragged] = useState<Id>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assets: Asset[] = documents.flatMap(doc => {
    const raw = doc.files['assets/index.json'];
    return raw ? JSON.parse(raw).data.assets : [];
  });
  const entries: CharacterEntry[] = documents.flatMap(doc => Object.entries(doc.files)
    .filter(([path]) => /^characters\/[^/]+\.json$/.test(path))
    .map(([, raw]) => ({ doc, character: CharacterSchema.parse(JSON.parse(raw).data) })));
  const ordered = entries.filter(item => item.character.narrativeRole === 'main' && item.character.afterstory).sort((a, b) =>
    (a.character.afterstory!.presentation?.order ?? entries.indexOf(a)) - (b.character.afterstory!.presentation?.order ?? entries.indexOf(b)));
  const entry = ordered.find(item => item.character.id === selected) ?? ordered[0];
  const character = entry?.character;
  const current = entry && afterstoryPresentation(entry.character, assets, entries.indexOf(entry));
  const images = assets.filter(item => item.kind === 'image');
  const asset = images.find(item => item.id === current?.figure.assetId);
  const select = (id: Id) => { setSelected(id); store.rememberViewState(viewId + '/afterstory-selection', id); const document = ordered.find(item => item.character.id === id)?.doc; if (document) store.target(document.documentId); };
  const commit = async (updates: { entry: CharacterEntry; presentation: Presentation }[], label: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const edit: EditInput = { label, origin: 'field', expected: [], patches: [], preparedAssets: [], requiredRefs: [] };
      for (const { entry, presentation } of updates) {
        const { doc, character } = entry;
        const before = character.afterstory!.presentation ?? null;
        if (JSON.stringify(before) === JSON.stringify(presentation)) continue;
        const next = CharacterSchema.parse({ ...character, afterstory: { ...character.afterstory, presentation } });
        edit.expected.push({ ref: { kind: 'document', id: doc.documentId }, revision: doc.revision });
        edit.patches.push({ kind: 'json', documentId: doc.documentId, changes: [{ path: '/data/afterstory/presentation', op: 'set', before, after: next.afterstory!.presentation! }] });
        edit.requiredRefs.push({ kind: 'asset', id: presentation.figure.assetId });
      }
      if (edit.patches.length) { store.target(edit.patches[0]!.documentId); resultValue(await store.applyEdit(edit)); }
    } catch (reason) { setError(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  const reorder = (from: Id, to: number) => {
    const result = [...ordered], index = result.findIndex(item => item.character.id === from);
    if (busy || index < 0 || to < 0 || to >= result.length || index === to) return;
    result.splice(to, 0, result.splice(index, 1)[0]!);
    select(from);
    const updates: { entry: CharacterEntry; presentation: Presentation }[] = [];
    for (const [order, entry] of result.entries()) {
      const presentation = afterstoryPresentation(entry.character, assets, order);
      if (!presentation) { setError('请先为每个后日谈角色选择可用立绘。'); return; }
      updates.push({ entry, presentation: { ...presentation, order } });
    }
    void commit(updates, '调整后日谈角色顺序');
  };
  const update = (presentation: Presentation) => { if (entry) void commit([{ entry, presentation }], '调整后日谈角色取景'); };
  return <CandidateSection title="后日谈角色排列和取景" collapsible initiallyOpen={false} onFocusCapture={() => { if (entry && store.getSnapshot().commandTarget !== entry.doc.documentId) store.target(entry.doc.documentId); }}>
    <p className="candidate-resource-hint">拖动或使用左右移按钮排序。锁定剪影沿用相同取景。</p>
    <ol className="candidate-resource-afterstory-list">{ordered.map((item, index) => <li key={item.character.id} onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault(); if (dragged) reorder(dragged, index); setDragged(undefined);
    }}>
      <CandidateButton disabled={busy} draggable onDragStart={event => {
        event.dataTransfer.setData('text/plain', item.character.id); setDragged(item.character.id);
      }} onDragEnd={() => setDragged(undefined)} aria-pressed={character?.id === item.character.id} onClick={() => select(item.character.id)}>
        <GripVertical size={14} aria-hidden="true"/>{item.character.name}
      </CandidateButton>
      <CandidateIconButton disabled={busy || index === 0} label={'左移 ' + item.character.name} onClick={() => reorder(item.character.id, index - 1)}><ArrowLeft size={14}/></CandidateIconButton>
      <CandidateIconButton disabled={busy || index === ordered.length - 1} label={'右移 ' + item.character.name} onClick={() => reorder(item.character.id, index + 1)}><ArrowRight size={14}/></CandidateIconButton>
    </li>)}</ol>
    {!character && <CandidateState kind="empty" title="先为主角色配置后日谈入口"/>}
    {character && <div className="candidate-resource-fields">
      <CandidateField label="此页立绘"><CandidateSelect density="compact" value={current?.figure.assetId ?? ''} disabled={busy} onValueChange={id => {
        const target = images.find(item => item.id === id);
        if (target) update({ figure: { assetId: id, variantId: target.activeVariantId }, crop: { ...upperBodyCrop }, order: current?.order ?? entries.indexOf(entry!) });
      }}><option value="">选择透明立绘</option>{images.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</CandidateSelect></CandidateField>
      {current && <CandidateField label="固定版本"><CandidateSelect density="compact" value={current.figure.variantId ?? asset?.activeVariantId ?? ''} disabled={busy}
        onValueChange={variantId => update({ ...current, figure: { ...current.figure, variantId } })}>
        {asset?.variants.map((item, index) => <option value={item.id} key={item.id}>{index + 1} · {item.role}</option>)}
      </CandidateSelect></CandidateField>}
    </div>}
    {character && current && <FigureCropEditor key={character.id} difference={{ id: character.id, name: character.name, figure: current.figure, avatar: null }}
      crop={current.crop} assets={assets} resources={store.services.runtimeAssets} locale={locale} disabled={busy} resetCrop={upperBodyCrop} change={crop => update({ ...current, crop })}/>}
    {error && <CandidateState kind="error" title={error}/>}
  </CandidateSection>;
}
