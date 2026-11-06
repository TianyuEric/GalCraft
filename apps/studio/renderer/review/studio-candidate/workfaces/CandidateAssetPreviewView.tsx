import { useEffect, useRef, useState } from 'react';
import type { Id } from '@galcraft/contracts';
import { createAssetPickerPreview } from '../../../authoring/asset-picker-preview.js';
import { CandidateButton as Button, CandidateSelect, CandidateSourceStatus, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { CandidateLeasedAnimationPreview } from '../components/professional/CandidateAnimationPreview.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { useAssetDockVisible, useAssetWorkspace, useCandidateAssetIndex } from './asset-workspace.js';
import { CandidateAssetProfessionalView } from './CandidateAssetProfessionalView.js';
import { CandidateTransparencyReview } from './CandidateTransparencyReview.js';
import type { CandidateWorkfaceProps } from './workface-helpers.js';
import '../styles/assets.css';

const roles = { original: '原始', mask: '遮罩', transparent: '透明', trimmed: '裁剪', compatible: '兼容', group: '资源组' };

export function CandidateAssetPreviewView({ assetId, active = true, onNavigate }: CandidateWorkfaceProps & { assetId: Id; active?: boolean }) {
  const session = useCandidate(), { services } = session;
  const locale = session.controller.preferences.locale;
  const { byId, documentId } = useCandidateAssetIndex(session);
  const [{ requestedVariants, assetModes, selection }, update, read] = useAssetWorkspace(session);
  const asset = byId.get(assetId);
  const mode = assetModes[assetId] ?? 'preview';
  const requested = requestedVariants[assetId] ?? '';
  const variantId = requested || asset?.activeVariantId;
  const variant = asset?.variants.find(item => item.id === variantId);
  const pending = useCandidateState().pendingViews.includes('assets:' + assetId);
  const [nativeSize, setNativeSize] = useState(false);
  const root = useRef<HTMLElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const visible = useAssetDockVisible(root, active);
  const variants = asset?.variants.map((item, index) => ({
    value: item.id, label: (index + 1) + ' · ' + roles[item.role] + (item.id === asset.activeVariantId ? ' · 活动' : '') + ' · ' + item.entry,
  })) ?? [];
  if (requested && !variant) variants.push({ value: requested, label: '固定版本已失效' });

  useEffect(() => {
    if (!media.current || !visible || !asset || !variant || mode !== 'preview' || asset.kind === 'animation') return;
    const preview = createAssetPickerPreview(media.current, services, locale);
    void preview.preview(asset, variant.id);
    return preview.dispose;
  }, [asset, variant, locale, services, visible, mode]);

  function selectVariant(id: Id) {
    const next = { ...requestedVariants };
    if (id) next[assetId] = id;
    else delete next[assetId];
    update({ requestedVariants: next });
  }

  return <section ref={root} className="candidate-workface candidate-asset-object-preview" aria-label="素材预览" onFocusCapture={() => {
    if (documentId && session.getSnapshot().commandTarget !== documentId) session.target(documentId);
  }}>
    <CandidateSourceStatus label={requested ? '固定素材版本' : '跟随活动版本'} name={asset?.name ?? '素材已移除'}
      mode={!variant ? 'missing' : requested ? 'fixed' : 'following'}
      diagnostic={asset && !variant ? '当前固定版本已失效，可恢复跟随。' : undefined}
      locate={asset && onNavigate ? { label: '在库中定位', run: () => {
        update({ selection: { ...selection, activeId: assetId, selectedIds: [...new Set([...selection.selectedIds, assetId])] }, locateId: assetId });
        onNavigate('assets');
      } } : undefined}
      changeMode={requested && !pending ? { label: '恢复跟随', run: () => selectVariant('') } : undefined}/>
    {asset && <CandidateToolbar label="素材版本与编辑" className="candidate-asset-preview-tools">
      <CandidateSelect aria-label="预览版本" value={requested} disabled={pending} onValueChange={selectedValue => selectVariant(selectedValue)}>
        <option value="">跟随活动版本</option>
        {variants.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </CandidateSelect>
      {(['preview', ...(['audio', 'animation', 'live2d'].includes(asset.kind) ? ['edit'] : []), ...(asset.kind === 'image' ? ['process'] : [])] as const).map(tab =>
        <Button key={tab} aria-pressed={mode === tab} disabled={pending && mode !== tab}
          onClick={() => update({ assetModes: { ...read().assetModes, [assetId]: tab as 'preview' | 'edit' | 'process' } })}>
          {{ preview: '预览', edit: '专业编辑', process: '去背与版本影响' }[tab as 'preview' | 'edit' | 'process']}
        </Button>)}
      {asset.kind === 'image' && mode === 'preview' && <Button aria-pressed={nativeSize} onClick={() => setNativeSize(value => !value)}>{nativeSize ? '适应面板' : '原始尺寸'}</Button>}
    </CandidateToolbar>}
    {!asset && <CandidateState kind="empty" title="素材已移除或暂不可用"/>}
    {asset && variant && mode === 'preview' && <div ref={media} className="candidate-asset-media" data-native-size={nativeSize} data-kind={asset.kind}>
      {asset.kind === 'animation' && <CandidateLeasedAnimationPreview assetId={asset.id} variantId={variant.id} services={services} locale={locale} active={visible}/>}
    </div>}
    {asset && variant && mode === 'edit' && <div className="candidate-asset-professional-body"><CandidateAssetProfessionalView asset={asset} active={visible} variantId={variant.id} fixedVersion={!!requested}/></div>}
    {asset && variant && mode === 'process' && <div className="candidate-asset-professional-body">
      <CandidateTransparencyReview asset={asset} variantId={variant.id} onAdopt={(id, version) => {
        update({ requestedVariants: { ...read().requestedVariants, [id]: version }, assetModes: { ...read().assetModes, [id]: 'preview', [assetId]: 'preview' } });
        if (id !== assetId) onNavigate?.('assets:' + id);
      }}/>
    </div>}
  </section>;
}
