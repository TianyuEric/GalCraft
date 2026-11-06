import { useEffect, useId, useRef, useState } from 'react';
import type { Asset, BackgroundAdoptionScope, Id, Source, StudioBridge } from '@galcraft/contracts';
import { CandidateButton as Button, CandidateCheckbox, CandidateFieldGroup, CandidateRadio, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { assetReferenceKey, canMigrateAssetReference } from '../adapters/candidate-asset-references.js';
import { useCandidate } from '../application/context.js';
import { resultValue, workfaceError } from './workface-helpers.js';

type Prepared = Extract<Awaited<ReturnType<StudioBridge['assets']['removeBackground']>>, { ok: true }>['value'];
export function CandidateTransparencyReview({ asset, variantId, onAdopt }: { asset: Asset; variantId: Id; onAdopt(assetId: Id, variantId: Id): void }) {
  const session = useCandidate(), { services } = session;
  const scopeName = useId();
  const [candidate, setCandidate] = useState<{ result: Prepared; before: string }>();
  const [scope, setScope] = useState<'keepCurrent' | 'allFloating' | 'newAssetSelectedRefs'>('keepCurrent');
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef<Id | undefined>(undefined);
  const live = useRef(false), viewId = 'assets:' + asset.id;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (pending.current) void services.discardBackground?.(pending.current);
      session.setViewPending(viewId, false);
    };
  }, [services, session, viewId]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (reason) { if (live.current) setError(workfaceError(reason)); }
    finally { if (live.current) setBusy(false); }
  }

  const refs = candidate?.result.references ?? [];
  const floating = refs.filter(item => item.variantId === null).length;
  const id = candidate?.result.preparationId;
  return <section className="candidate-asset-processing" aria-label="去背与版本影响">
    {!candidate && <CandidateState kind={busy ? 'running' : 'empty'} title={busy ? '正在计算透明像素' : '准备透明版本'}
      description="比较处理前后的像素，再选择新版本如何影响作品引用。"
      action={<Button variant="primary" disabled={busy} disabledReason={services.removeBackground && services.previewAsset ? undefined : '当前宿主未提供图像处理'}
        onClick={() => void act(async () => {
          const before = resultValue(await services.previewAsset!(asset.id, variantId));
          const result = resultValue(await services.removeBackground!({ assetId: asset.id, sourceVariantId: variantId,
            choice: { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null }, declared: 'unknown' }));
          if (!live.current) { if (result.preparationId) await services.discardBackground?.(result.preparationId); return; }
          if (!result.preparationId || !result.previewUri) { setNotice('这次处理没有生成可采用的透明版本。'); return; }
          pending.current = result.preparationId; session.setViewPending(viewId, true);
          setCandidate({ before: before.uri, result }); setSources([]);
        })}>准备透明版本</Button>}/>}
    {candidate && <>
      <div className="candidate-asset-comparison">
        <figure><figcaption>处理前</figcaption><img src={candidate.before} alt="原图"/></figure>
        <figure><figcaption>处理后</figcaption><img src={candidate.result.previewUri} alt="候选透明图"/></figure>
      </div>
      <CandidateFieldGroup className="candidate-asset-impact" title="采用范围" disabled={busy}>
        <label><CandidateRadio name={scopeName} checked={scope === 'keepCurrent'} onChange={() => setScope('keepCurrent')}/>保留活动版本和全部引用，添加透明版本</label>
        <label><CandidateRadio name={scopeName} checked={scope === 'allFloating'} onChange={() => setScope('allFloating')}/>将透明版本设为活动版本，更新 {floating} 处浮动引用</label>
        <label><CandidateRadio name={scopeName} checked={scope === 'newAssetSelectedRefs'} onChange={() => setScope('newAssetSelectedRefs')}/>创建独立素材，只迁移勾选的引用</label>
        {!!refs.length && <ul className="candidate-asset-impact-refs">{refs.map(reference => {
          const key = assetReferenceKey(reference.source);
          const valid = canMigrateAssetReference({ ...reference, owner: { kind: 'document', id: reference.source.documentId },
            assetId: asset.id, usage: reference.label, required: true });
          return <li key={key}><label>
            {scope === 'newAssetSelectedRefs' && <CandidateCheckbox checked={sources.some(source => assetReferenceKey(source) === key)}
              disabled={!valid || session.host.sourceIsInvalid(reference.source.documentId)}
              onChange={event => setSources(event.target.checked ? [...sources, reference.source] : sources.filter(source => assetReferenceKey(source) !== key))}/>}
            {reference.label} · {reference.variantId ? '固定版本' : '浮动引用'}{!valid && ' · 缺少精确字段位置'}
          </label></li>;
        })}</ul>}
      </CandidateFieldGroup>
      <CandidateToolbar label="透明版本审阅操作">
        <Button onClick={() => void act(async () => {
          if (id) resultValue(await services.discardBackground!(id));
          pending.current = undefined; session.setViewPending(viewId, false); setCandidate(undefined);
          setNotice('已放弃处理草稿。');
        })} disabled={busy}>放弃透明版本</Button>
        <Button variant="primary" disabled={busy || !id || scope === 'newAssetSelectedRefs' && !sources.length}
          disabledReason={services.confirmBackground ? undefined : '当前宿主未提供采用服务'}
          onClick={() => void act(async () => {
            const value: BackgroundAdoptionScope = scope === 'newAssetSelectedRefs' ? { kind: scope, sources } : scope;
            const result = resultValue(await services.confirmBackground!(id!, value));
            pending.current = undefined; session.setViewPending(viewId, false); setCandidate(undefined);
            session.refreshFromHost(); onAdopt(result.assetId, result.transparentVariantId);
          })}>应用透明版本</Button>
      </CandidateToolbar>
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
