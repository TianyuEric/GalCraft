import { useEffect, useRef, useState } from 'react';
import { AssetReferenceSchema, type Asset, type AssetReference, type AssetTypeCatalogEntry, type Id } from '@galcraft/contracts';
import { readTemplateDocuments } from '@galcraft/templates';
import { assetTypeName } from '../../../authoring/asset-type-catalog.js';
import { CandidateButton as Button, CandidateField, CandidateInput, CandidateSourceStatus, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { candidateAssetReferences } from '../adapters/candidate-asset-references.js';
import { useCandidate } from '../application/context.js';
import { useAssetWorkspace, useCandidateAssetIndex } from './asset-workspace.js';
import { resultValue, useFormalSource, workfaceError, type CandidateWorkfaceProps } from './workface-helpers.js';
import '../styles/assets.css';

type ReferenceTarget = { view: string; name: string; sceneId?: Id; statementId?: Id };

export function CandidateAssetInspectorView({ onNavigate }: CandidateWorkfaceProps) {
  const session = useCandidate();
  const { source, versions } = useFormalSource();
  const { services } = session;
  const index = useCandidateAssetIndex(session);
  const [{ pinnedIds, pinnedTitle, selection, renameRequest }, update, read] = useAssetWorkspace(session);
  const ids = pinnedIds ?? selection.selectedIds;
  const assets = ids.flatMap(id => index.byId.get(id) ?? []);
  const asset = ids.length === 1 ? assets[0] : undefined;
  const missing = ids.length - assets.length;
  const [catalog, setCatalog] = useState<AssetTypeCatalogEntry[]>([]);
  const [rename, setRename] = useState<{ id: Id; revision: number; name: string }>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [referenceData, setReferenceData] = useState<{ assetId: Id; versions: string; items: AssetReference[] }>();
  const input = useRef<HTMLInputElement>(null);
  const refs = referenceData?.assetId === asset?.id && referenceData?.versions === versions ? referenceData.items : undefined;
  const locale = session.controller.preferences.locale;
  const currentName = asset?.name ?? (ids.length > 1 ? ids.length + ' 项素材' : pinnedTitle ?? '尚未选择素材');
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    let live = true;
    void services.assetTypeCatalog?.().then(result => { if (live && result.ok) setCatalog(result.value); });
    return () => { live = false; };
  }, [services, index.revision]);

  useEffect(() => {
    if (!asset || renameRequest?.assetId !== asset.id) return;
    setRename({ id: asset.id, revision: asset.revision, name: asset.name });
    update({ renameRequest: null });
  }, [asset, renameRequest, update]);
  useEffect(() => { if (rename?.id === asset?.id) input.current?.select(); }, [rename?.id, asset?.id]);
  useEffect(() => {
    session.setViewPending('asset-inspector', Boolean(rename));
    return () => session.setViewPending('asset-inspector', false);
  }, [session, Boolean(rename)]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError(workfaceError(reason)); }
    finally { setBusy(false); }
  }

  function showAsset(id: Id, mode: 'preview' | 'edit' | 'process' = 'preview') {
    if (!session.getSnapshot().pendingViews.includes('assets:' + id)) update({ assetModes: { ...read().assetModes, [id]: mode } });
    onNavigate?.('assets:' + id);
  }

  function targetOf(reference: AssetReference): ReferenceTarget | undefined {
    const id = reference.source?.documentId;
    if (!id) return;
    const scene = source?.scenes.find(item => item.documentId === id);
    if (scene && reference.source?.statementId) {
      const current = session.graphSceneSource(scene.sceneId);
      if (!current || current.revision !== reference.source.revision) return;
      return { view: 'commands:' + scene.sceneId, name: scene.name, sceneId: scene.sceneId, statementId: reference.source.statementId };
    }
    const document = session.host.list().find(item => item.documentId === id);
    const characterFile = Object.entries(document?.files ?? {}).find(([path]) => path.startsWith('characters/') && path.endsWith('.json'));
    if (characterFile) {
      const characterId = JSON.parse(characterFile[1]).data.id;
      const character = source?.characters.find(item => item.id === characterId);
      if (character) return { view: 'character:' + character.id, name: character.name };
    }
    const page = readTemplateDocuments(session.host.list()).pages.find(item => item.id === id);
    if (page) return { view: 'page:' + page.key, name: page.key };
    return undefined;
  }

  function openReference(target: ReferenceTarget) {
    if (!asset) return;
    const origin = session.getSnapshot().activeView.startsWith('assets:') ? session.getSnapshot().activeView : 'assets';
    update({ referenceReturn: { view: origin, name: asset.name } });
    if (target.sceneId && target.statementId) session.selectCommand(target.sceneId, target.statementId);
    onNavigate?.(target.view);
  }

  function locate() {
    if (asset && selection.activeId !== asset.id)
      update({ selection: { ...selection, activeId: asset.id, selectedIds: [...new Set([...selection.selectedIds, asset.id])] } });
    if (asset) update({ locateId: asset.id });
    onNavigate?.('assets');
  }

  const describeKind = (item: Asset) => assetTypeName(item.kind, catalog, locale);
  const fields: [string, (item: Asset) => string][] = [
    ['类型', describeKind], ['目录', item => item.folder.join('/') || '根目录'], ['标签', item => [...item.tags].sort().join('、') || '无标签'],
    ['语言', item => [...item.locales].sort().join('、') || '未限定'],
    ['角色', item => source?.characters.find(character => character.id === item.characterId)?.name ?? item.characterId ?? '未关联'],
    ['场景', item => item.sceneIds.map(id => source?.scenes.find(scene => scene.sceneId === id)?.name ?? id).join('、') || '未关联'],
  ];

  return <section ref={root} className="candidate-workface candidate-asset-inspector" aria-label="素材属性与引用" onFocusCapture={() => {
    if (index.documentId && session.getSnapshot().commandTarget !== index.documentId) session.target(index.documentId);
  }}>
    <CandidateSourceStatus label={pinnedIds ? '固定素材来源' : '跟随素材库'} name={currentName}
      mode={missing ? 'missing' : pinnedIds ? 'fixed' : 'following'} diagnostic={missing ? missing + ' 项素材已失效' : undefined}
      locate={asset && onNavigate ? { label: '在库中定位', run: locate } : undefined}
      changeMode={ids.length ? { label: pinnedIds ? '恢复跟随' : '固定来源', run: () => update({ pinnedIds: pinnedIds ? null : [...ids], pinnedTitle: pinnedIds ? null : currentName }) } : undefined}/>
    <div className="candidate-asset-inspector-body">
      {!ids.length && <CandidateState kind="empty" title="尚未选择素材" description="从底部素材库选择一项或多项素材。"/>}
      {!!assets.length && <dl className="candidate-asset-fields">{fields.map(([label, get]) => {
        const value = get(assets[0]!);
        const mixed = assets.some(item => get(item) !== value);
        return <div key={label}><dt>{label}</dt><dd data-mixed={mixed}>{mixed ? '多个值' : value}</dd></div>;
      })}</dl>}
      {error && <p className="candidate-asset-note" role="alert">{error}</p>}
      {notice && <p className="candidate-asset-note" role="status">{notice}</p>}
      {asset && <div className="candidate-asset-details">
        {rename && rename.id === asset.id && <form onSubmit={event => {
          event.preventDefault();
          void act(async () => {
            if (asset.revision !== rename.revision) throw new Error('素材已变化，请重新打开改名输入。');
            resultValue(await services.renameAssets!([{ id: asset.id, name: rename.name.trim() }]));
            setRename(undefined); session.refreshFromHost(); setNotice('素材已改名。');
          });
        }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setRename(undefined); } }}>
          <CandidateField label="素材名称"><CandidateInput ref={input} value={rename.name} onChange={event => setRename({ ...rename, name: event.target.value })}/></CandidateField>
          <Button type="submit" variant="primary" disabled={busy || !rename.name.trim() || !services.renameAssets}>应用改名</Button>
          <Button onClick={() => setRename(undefined)}>取消</Button>
        </form>}
        <CandidateToolbar label="素材操作">
          <Button disabled={!onNavigate} onClick={() => showAsset(asset.id)}>预览与版本</Button>
          {!rename && <Button disabled={!services.renameAssets} onClick={() => setRename({ id: asset.id, revision: asset.revision, name: asset.name })}>改名</Button>}
          <Button disabled={busy} onClick={() => void act(async () => {
            const exact = candidateAssetReferences(session.host.graphDocuments(), asset.id);
            const port = services.bridge.assets;
            const catalogReferences = port?.references ? AssetReferenceSchema.array().parse(resultValue(await port.references(asset.id))) : [];
            const extra = catalogReferences.filter(item => !exact.some(match => match.source?.documentId === item.source?.documentId && match.source?.statementId === item.source?.statementId));
            setReferenceData({ assetId: asset.id, versions, items: [...exact, ...extra] });
          })}>查看引用</Button>
          {asset.kind === 'image' && <Button disabled={!onNavigate} onClick={() => showAsset(asset.id, 'process')}>去背与版本影响</Button>}
          {['audio', 'animation', 'live2d'].includes(asset.kind) && <Button disabled={!onNavigate} onClick={() => showAsset(asset.id, 'edit')}>专业编辑</Button>}
        </CandidateToolbar>
        {refs && <section className="candidate-asset-reference-list" aria-label="作品引用"><h3>作品引用</h3>
          {refs.length ? <ul>{refs.map((item, position) => {
            const target = targetOf(item);
            const state = item.variantId === null ? '跟随活动版本' : asset.variants.some(variant => variant.id === item.variantId) ? '固定版本' : '固定版本缺失';
            return <li key={item.owner.id + ':' + position}>{target && onNavigate
              ? <Button onClick={() => openReference(target)}>{target.name} · {item.usage}</Button>
              : <span>{item.usage} · 缺少可定位的对象或语句</span>}<small>{state}</small></li>;
          })}</ul> : <p>当前没有素材引用。</p>}
        </section>}
      </div>}
    </div>
  </section>;
}
