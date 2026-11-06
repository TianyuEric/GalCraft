import { useEffect, useMemo, useRef, useState } from 'react';
import { AssetSchema, AudioLoopSchema, NativeAnimationSchema, createId, type Asset, type Id, type NativeAnimation } from '@galcraft/contracts';
import { CandidateButton, CandidateState } from '../components/controls/index.js';
import { CandidateAnimationWorkbench, type CandidateAnimationGuiDraft } from '../components/professional/CandidateAnimationWorkbench.js';
import { CandidateLeasedAudioLoopEditor, type CandidateAudioLoopGuiDraft } from '../components/professional/CandidateAudioLoopEditor.js';
import { useCandidate } from '../application/context.js';
import { resultValue, workfaceError } from './workface-helpers.js';

type Props = { asset: Asset; active: boolean; variantId: Id; fixedVersion?: boolean };
export function CandidateAssetProfessionalView(props: Props) {
  const { asset } = props;
  if (asset.kind === 'animation') return <AnimationAssetEditor {...props}/>;
  if (asset.kind === 'audio') return <AudioAssetEditor key={props.variantId} {...props}/>;
  return <ModelAssetInspection {...props}/>;
}

function AnimationAssetEditor({ asset, active, variantId, fixedVersion }: Props) {
  const session = useCandidate(), { services } = session;
  const locale = session.controller.preferences.locale;
  const viewId = 'assets:' + asset.id, memory = 'animation-draft:' + asset.id;
  const [gui, setGui] = useState(() => session.viewState<CandidateAnimationGuiDraft>(memory));
  const [content, setContent] = useState<{ id: Id; animation: NativeAnimation }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const current = content?.id === variantId ? content.animation : undefined;

  useEffect(() => {
    if (!active) return;
    let live = true;
    setError('');
    void (async () => {
      if (!services.runtimeAssets) throw new Error('动画运行资源服务不可用。');
      const lease = resultValue(await services.runtimeAssets.resolveRuntime(asset.id, variantId));
      try {
        const response = await fetch(lease.uri);
        if (!response.ok) throw new Error('无法读取指定动画版本。');
        const animation = NativeAnimationSchema.parse(await response.json());
        if (live) setContent({ id: variantId, animation });
      } finally { await services.runtimeAssets.releaseRuntime(lease.leaseId); }
    })().catch(reason => { if (live) setError(workfaceError(reason)); });
    return () => { live = false; };
  }, [active, services, asset.id, variantId, attempt]);

  async function save(name: string, animation: NativeAnimation) {
    if (!services.saveAnimation) throw new Error('动画素材写回服务不可用。');
    if (fixedVersion || variantId !== asset.activeVariantId) throw new Error('恢复跟随活动版本后可写回动画。');
    resultValue(await services.saveAnimation({ assetId: asset.id, expectedRevision: asset.revision, name, animation }));
    session.refreshFromHost();
    return '已写入活动动画版本。';
  }

  useEffect(() => () => session.setViewPending(viewId, false), [session, viewId]);
  const onDraftChange = useMemo(() => (dirty: boolean) => session.setViewPending(viewId, dirty), [session, viewId]);
  const capture = useMemo(() => (value: CandidateAnimationGuiDraft) => session.rememberViewState(memory, value), [session, memory]);
  if (error) return <CandidateState kind="error" title="动画读取失败" description={error} action={<CandidateButton onClick={() => setAttempt(value => value + 1)}>重试读取</CandidateButton>}/>;
  if (!current) return <CandidateState kind="loading" title="正在读取动画版本"/>;
  if (fixedVersion || variantId !== asset.activeVariantId) return <CandidateState kind="empty" title="正在查看固定动画版本" description="在来源栏恢复跟随后可编辑关键帧；预览模式可播放此固定版本。"/>;
  return <CandidateAnimationWorkbench animation={current} locale={locale} targetLabel={asset.name} defaultName={asset.name} active={active}
    statusLabel="关键帧编辑生成活动版本 · 支持作品撤销" guiDraft={gui} onGuiDraftChange={capture}
    previewServices={services}
    onGenerate={async request => {
      const documentId = session.controller.source?.assetIndexDocumentId;
      if (!documentId) throw new Error('素材索引不可用。');
      await session.tasks.openAnimationProduction(
        request.mode === 'new' ? request : { ...request, assetId: asset.id, assetRevision: asset.revision },
        { documentId, assetId: asset.id, viewId },
      );
    }}
    onDraftChange={onDraftChange} onChange={async next => { await save(asset.name, next); setGui(undefined); }}/>;
}

function AudioAssetEditor({ asset, active, variantId, fixedVersion }: Props) {
  const session = useCandidate();
  const variant = asset.variants.find(item => item.id === variantId);
  const viewId = 'assets:' + asset.id, memory = 'audio-loop-draft:' + asset.id + ':' + variantId;
  const [gui] = useState(() => session.viewState<CandidateAudioLoopGuiDraft>(memory));
  const committed = useRef(false);
  const capture = useMemo(() => (draft: CandidateAudioLoopGuiDraft) => {
    // Once this version has produced a new one, late renders must not resurrect its applied draft.
    session.rememberViewState(memory, committed.current ? undefined : draft);
  }, [session, memory]);
  const pending = useMemo(() => (dirty: boolean) => session.setViewPending(viewId, dirty), [session, viewId]);
  const loop = variant?.metadata.loop;
  const value = useMemo(() => ({ loopStartSec: loop?.startSec ?? null, loopEndSec: loop?.endSec ?? null }), [loop?.startSec, loop?.endSec]);
  const fixed = useMemo(() => ({ ...asset, activeVariantId: variantId }), [asset, variantId]);
  useEffect(() => () => session.setViewPending(viewId, false), [session, viewId]);
  if (!variant) return null;

  return <>{fixedVersion && <p className="candidate-pro-note">此固定版本只读。在来源栏恢复跟随后可编辑循环并生成新版本。</p>}<CandidateLeasedAudioLoopEditor asset={fixed} resources={session.services.runtimeAssets} value={value} active={active}
    locale={session.controller.preferences.locale} readonly={fixedVersion || variantId !== asset.activeVariantId} guiDraft={gui} onGuiDraftChange={capture} onDraftChange={pending} onChange={async (next, duration) => {
      if (fixedVersion) throw new Error('恢复跟随活动版本后可编辑循环。');
      const documents = session.host.list();
      const index = documents.find(item => 'assets/index.json' in item.files);
      const resources = documents.find(item => 'candidate/resources.json' in item.files);
      if (!index || !resources) throw new Error('作品缺少素材索引或候选资源文档。');
      const before = (JSON.parse(index.files['assets/index.json']!) as { data: { assets: Asset[] } }).data.assets;
      const latest = before.find(item => item.id === asset.id);
      if (latest?.revision !== asset.revision || latest.activeVariantId !== variantId) throw new Error('音频版本已变化，当前循环草稿已保留。');
      const locations = (JSON.parse(resources.files['candidate/resources.json']!) as { data: { locations: Record<string, string> } }).data.locations;
      const uri = locations[asset.id + '/' + variantId] ?? (variantId === asset.originalVariantId ? locations[asset.id] : undefined);
      if (!uri) throw new Error('音频文件不可用。');
      const id = createId([asset.variants]);
      const metadata = { ...variant.metadata };
      if (next.loopStartSec === null && next.loopEndSec === null) delete metadata.loop;
      else {
        if (duration > 0 && Number.isFinite(duration)) metadata.durationSec = duration;
        metadata.loop = AudioLoopSchema.parse({ startSec: next.loopStartSec ?? 0,
          endSec: next.loopEndSec ?? metadata.durationSec, tail: loop?.tail ?? 'wrap' });
      }
      const updated = AssetSchema.parse({ ...latest, revision: latest.revision + 1, activeVariantId: id, modifiedAt: new Date().toISOString(),
        variants: [...latest.variants, { ...variant, id, parentId: variantId, metadata }] });
      resultValue(await session.applyEdit({ label: '编辑音频循环 · ' + asset.name, origin: 'field',
        expected: [index, resources].map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
        patches: [
          { kind: 'json', documentId: index.documentId, changes: [{ path: '/data/assets', op: 'set', before, after: before.map(item => item.id === asset.id ? updated : item) }] },
          { kind: 'json', documentId: resources.documentId, changes: [{ path: '/data/locations', op: 'set', before: locations, after: { ...locations, [asset.id + '/' + id]: uri } }] },
        ],
        preparedAssets: [], requiredRefs: [{ kind: 'asset', id: asset.id }] }));
      // A successful edit creates a new version. Undo must reopen the original version without the applied field draft.
      committed.current = true;
      session.rememberViewState(memory, undefined);
    }}/></>;
}

function ModelAssetInspection({ asset, variantId }: Props) {
  const { services } = useCandidate();
  const [inspected, setInspected] = useState<Asset | null>();
  const [error, setError] = useState('');
  const variant = inspected?.variants.find(item => item.id === variantId);
  return <section className="candidate-model-inspection" aria-label="模型资源检查">
    <CandidateButton disabledReason={services.inspectModelAsset ? undefined : '当前宿主未提供模型检查'} onClick={() => {
      setError('');
      void services.inspectModelAsset!(asset.id).then(value => setInspected(resultValue(value))).catch(reason => setError(workfaceError(reason)));
    }}>检查模型文件</CandidateButton>
    {error && <p role="alert">{error}</p>}
    {inspected === null && <p role="status">模型资源已移除。</p>}
    {inspected && <><h3>模型文件</h3>
      <ul>{variant?.files.map(file => <li key={file.path + ':' + file.role}>{file.path} · {file.bytes} B</li>)}</ul>
      {variant?.groupCapabilities && <p>{variant.groupCapabilities.parameters.length} 个模型参数 · {variant.groupCapabilities.motions.length} 个动作 · {variant.groupCapabilities.expressions.length} 个表情</p>}
      <p>模型演出参数保存在使用此模型的立绘指令中。</p>
    </>}
  </section>;
}
