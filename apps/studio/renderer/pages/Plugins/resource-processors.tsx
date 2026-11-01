import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { DocumentWorkspace } from '../../components/workbench/document-workspace.js';
import { useEffect, useRef, useState } from 'react';
import { createId, type Asset, type EditReceipt, type Json, type Result, type StudioBridge } from '@galcraft/contracts';
import type { ProcessorCandidate } from '@galcraft/assets/processing';
import type { ResourceProcessorContribution } from '@galcraft/plugins/contracts';
import { Button, Choice, Field } from '../../components/controls.js';
import { PluginFields, fieldDefaults, pluginInputsValid } from './plugin-fields.js';
import { validateFields } from '../../authoring/field-validation.js';

export type ProcessorSummary = Pick<ResourceProcessorContribution, 'key' | 'inputKinds' | 'outputKinds' | 'fields' | 'supportsCancel'> & { packageVersion: string };
type ProcessingBridge = StudioBridge['assets'] & { processorCatalog?(): Promise<Result<ProcessorSummary[]>>;
  previewResource?(preparationId: string): Promise<Result<{ leaseId: string; uri: string; mime: string }>> };
const unwrap = <T,>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
export type ResourceProcessorGuiDraft={processorKey:string;settings:Record<string,Json>;open:boolean;inputSelection:Asset[]};
export function ResourceProcessors({ bridge, selectedIds, locale, changed, indexRevision, inspectorContainer, workspace, onUnappliedChange,guiDraft,onGuiDraftChange }: { guiDraft?:ResourceProcessorGuiDraft|null;onGuiDraftChange?(draft:ResourceProcessorGuiDraft):void;onUnappliedChange?(dirty: boolean): void; workspace?: DocumentWorkspace; inspectorContainer?: HTMLElement; bridge: StudioBridge['assets']; selectedIds: string[]; locale: string; indexRevision?: number; changed(receipt: EditReceipt): Promise<void> }) {
  const assets = bridge as ProcessingBridge, [processors, setProcessors] = useState<ProcessorSummary[]>([]), [selected, setSelected] = useState<Asset[]>([]), [candidates, setCandidates] = useState<ProcessorCandidate[]>([]);
  const [processorKey, setProcessorKey] = useState(guiDraft?.processorKey??''), [settings, setSettings] = useState<Record<string, Json>>(guiDraft?.settings??{}), [open, setOpen] = useState(guiDraft?.open??false), [review, setReview] = useState<ProcessorCandidate | null>(null), [inputSelection, setInputSelection] = useState<Asset[]>(guiDraft?.inputSelection??[]);
  useEffect(()=>{onGuiDraftChange?.({processorKey,settings,open,inputSelection});},[onGuiDraftChange,processorKey,settings,open,inputSelection]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const batch = useRef<{ cancelled: boolean; operationId: string | null } | null>(null), actionVersion = useRef(0), processor = processors.find(item => item.key === processorKey);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  useEffect(() => { let alive = true; void (async () => {
    const values = assets.processorCatalog ? unwrap(await assets.processorCatalog()) as unknown as ProcessorSummary[] : []; if (!alive) return; setProcessors(values);
    if (!processorKey && values[0]) { setProcessorKey(values[0].key); setSettings(fieldDefaults(values[0].fields)); }
    const pending = assets.resourceCandidates ? unwrap(await assets.resourceCandidates()) as unknown as ProcessorCandidate[] : []; if (alive) setCandidates(pending);
  })().catch(e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, [assets, refresh]);
  useEffect(() => { let alive = true; void Promise.all(selectedIds.map(id => assets.get(id))).then(values => { if (alive) setSelected(values.flatMap(result => { const asset = unwrap(result); return asset ? [asset] : []; })); }).catch(e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, [assets, selectedIds.join('/'), indexRevision]);
  useEffect(() => () => { ++actionVersion.current; if (batch.current) { batch.current.cancelled = true; if (batch.current.operationId) void assets.cancelResource?.(batch.current.operationId); } }, [assets]);
  const unapplied = open && (busy || JSON.stringify(settings) !== JSON.stringify(fieldDefaults(processor?.fields ?? [])));
  useEffect(() => { onUnappliedChange?.(unapplied); }, [unapplied, onUnappliedChange]);
  useEffect(() => () => onUnappliedChange?.(false), []);
  const supported = inputSelection.filter(asset => processor?.inputKinds.includes(asset.kind) && processor.outputKinds.includes(asset.kind));
  const action = async (fn: () => Promise<void>) => { const version = ++actionVersion.current; setBusy(true); setError(''); try { await fn(); } catch (e) { if (version === actionVersion.current) setError(e instanceof Error ? e.message : String(e)); } finally { if (version === actionVersion.current) { setBusy(false); setRefresh(value => value + 1); } } };
  const openReview = (candidate: ProcessorCandidate) => {
    if (!workspace) { setReview(candidate); return; }
    workspace.open(`resource-review:${candidate.preparationId}`, t('资源处理候选审阅', 'Resource candidate review', '素材処理候補のレビュー'), done => {
      const node = document.createElement('section'), react = createRoot(node);
      react.render(<ResourceCandidateReview bridge={assets} candidate={candidate} locale={locale} changed={changed} close={() => { setRefresh(value => value + 1); done(); }}/>);
      const pause = () => node.querySelectorAll<HTMLMediaElement>('audio,video').forEach(media => media.pause());
      return { node, dirty: () => false, activate: active => { if (!active) pause(); }, dispose: () => { pause(); react.unmount(); } };
    });
  };
  const parameters = open && <section className="plugin-resource-parameters"><h3>{t('处理所选素材', 'Process selected assets', '選択素材を処理')}</h3>
      {error && <p role="alert" className="workbench-error">{error}</p>}
      <Field label={t('处理器', 'Processor', '処理プラグイン')}><Choice label={t('处理器', 'Processor', '処理プラグイン')} disabled={busy} value={processorKey} options={processors.map(item => ({ value: item.key, label: item.key.split('/').at(-1)! }))} onChange={key => { setProcessorKey(key); setSettings(fieldDefaults(processors.find(item => item.key === key)!.fields)); }}/></Field>
      <p>{t(`本次选择 ${inputSelection.length} 项，处理器支持 ${supported.length} 项。`, `${inputSelection.length} selected; ${supported.length} supported by this processor.`, `${inputSelection.length}件選択。処理プラグインは${supported.length}件に対応。`)}</p>
      {inputSelection.map(asset => <p key={asset.id}>{asset.name}{!supported.includes(asset) && ` · ${t('此处理器不支持该类型', 'Type unsupported by this processor', 'この種類には非対応')}`}</p>)}
      {processor && <><PluginFields fields={processor.fields} value={settings} change={setSettings} locale={locale} references={inputSelection.map(asset => ({ kind: 'asset', id: asset.id, name: asset.name, assetKind: asset.kind }))}/><p className="field-help">{processor.supportsCancel ? t('取消会请求处理器停止执行，已完成候选保留。', 'Cancel asks the processor to stop. Completed candidates are kept.', 'キャンセルは処理プラグインに停止を要求します。完了した候補は保持されます。') : t('处理器不支持中断内部工作；取消停止本地接收，已有候选保留。', 'The processor cannot interrupt its internal work. Cancel stops receiving results locally; existing candidates remain.', '内部処理の中断は非対応です。キャンセルはローカルで結果の受信を停止し、既存候補は保持します。')}</p></>}
      <footer><Button disabled={busy} onClick={() => setOpen(false)}>{t('关闭', 'Close', '閉じる')}</Button>{busy ? <Button onClick={() => { ++actionVersion.current; if (batch.current) { batch.current.cancelled = true; if (batch.current.operationId) void assets.cancelResource?.(batch.current.operationId); } setBusy(false); setRefresh(value => value + 1); setError(t('已停止本地接收和后续批次，已完成候选保留。', 'Stopped receiving results locally and skipped remaining items. Completed candidates are kept.', 'ローカルでの結果受信と残りの項目を停止しました。完了した候補は保持されています。')); }}>{t('取消处理', 'Cancel processing', '処理をキャンセル')}</Button> : <Button tone="primary" disabled={!supported.length || supported.length !== inputSelection.length} onClick={() => void action(async () => {
        if (!processor || !assets.processResource) throw new Error(t('资源处理服务不可用', 'Resource processing is unavailable', '素材処理を利用できません'));
        const invalid = validateFields(processor.fields, settings, field => field.label, locale); if (invalid.length) throw new Error(invalid.map(item => item.message).join(' · '));
        if (!pluginInputsValid()) return;
        const failures: string[] = [], currentBatch = { cancelled: false, operationId: null as string | null }; batch.current = currentBatch;
        for (const asset of supported) { if (currentBatch.cancelled) break; const operationId = createId(); currentBatch.operationId = operationId; const result = await assets.processResource({ processorKey, assetId: asset.id, sourceVariantId: asset.activeVariantId, settings, operationId }); if (!result.ok) failures.push(`${asset.name}: ${result.error.message}`); currentBatch.operationId = null; }
        if (failures.length) throw new Error(failures.join('\n')); if (!currentBatch.cancelled) setOpen(false);
      })}>{t('生成处理候选', 'Generate processing candidates', '処理候補を生成')}</Button>}</footer>
    </section>;
  if (!processors.length && !candidates.length && !error) return null;
  return <section className="plugin-author-contributions plugin-resource-processors"><h2>{t('插件资源处理', 'Plugin resource processing', 'プラグインの素材処理')}</h2>
    {error && !open && !review && <p role="alert" className="workbench-error">{error}</p>}
    {processors.length > 0 && <div className="gc-actions"><Button disabled={!selected.length} onClick={() => { if (!open) setInputSelection(structuredClone(selected)); setOpen(true); setError(''); }}>{t('处理所选素材', 'Process selected assets', '選択した素材を処理')}</Button>{!selected.length && <span>{t('请先选择素材。', 'Select assets first.', '素材を選択してください。')}</span>}</div>}
    {candidates.map(candidate => <article className="plugin-resource-candidate" key={candidate.preparationId}><strong>{selected.find(item => item.id === candidate.assetId)?.name ?? t('资源处理候选', 'Resource processing candidate', '素材処理候補')}</strong><span>{candidate.variant.files.length} {t('个文件', 'files', 'ファイル')}</span><Button onClick={() => { openReview(candidate); setError(''); }}>{t('审阅候选', 'Review candidate', '候補を確認')}</Button></article>)}
    {parameters && (inspectorContainer ? createPortal(parameters, inspectorContainer) : parameters)}
    {review && !workspace && <ResourceCandidateReview bridge={assets} candidate={review} locale={locale} changed={changed} close={() => { setReview(null); setRefresh(value => value + 1); }}/>}
  </section>;
}

function ResourceCandidateReview({ bridge: assets, candidate: review, locale, changed, close }: { bridge: ProcessingBridge; candidate: ProcessorCandidate; locale: string; changed(receipt: EditReceipt): Promise<void>; close(): void }) {
  const [preview, setPreview] = useState<{ uri: string; mime: string } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const container = useRef<HTMLElement>(null);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  useEffect(() => { let alive = true, leaseId: string | undefined;
    if (assets.previewResource) void assets.previewResource(review.preparationId).then(result => { const value = unwrap(result); leaseId = value.leaseId; if (alive) setPreview(value); else void assets.releaseRuntime(value.leaseId); }).catch(e => { if (alive) setError(String(e)); });
    const node = container.current;
    return () => { alive = false; node?.querySelectorAll<HTMLMediaElement>('audio,video').forEach(media => media.pause()); if (leaseId) void assets.releaseRuntime(leaseId); };
  }, [review.preparationId, assets]);
  const action = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  return <section ref={container} className="plugin-resource-review"><h2>{t('审阅资源处理候选', 'Review resource processing candidate', '素材処理候補を確認')}</h2>
    {error && <p role="alert" className="workbench-error">{error}</p>}
    {preview && (preview.mime.startsWith('image/') ? <img className="plugin-resource-preview" src={preview.uri} alt={t('处理结果', 'Processing result', '処理結果')}/> : preview.mime.startsWith('audio/') ? <audio controls src={preview.uri}/> : preview.mime.startsWith('video/') ? <video controls className="plugin-resource-preview" src={preview.uri}/> : null)}
    <p>{t('采用后新增派生版本并设为当前版本。原始文件和旧版本保留，修改可统一撤销和保存。', 'Adoption adds a derived version and makes it current. The original and earlier versions remain. Use shared undo and save.', '採用で派生版を追加し現在の版に設定。原本と旧版を保持し、共通操作で元に戻すか保存できます。')}</p>
    <ul>{review.variant.files.map(file => <li key={file.path}>{file.path} · {file.mime} · {file.bytes} B</li>)}</ul>
    <details><summary>{t('来源、版本和处理说明', 'Source, version and processing details', '元データ・バージョン・処理の詳細')}</summary><p>{review.processorKey} @ {review.packageVersion}</p><p>{review.assetId} / {review.sourceVariantId} · {review.assetRevision}</p><pre>{JSON.stringify(review.metadata, null, 2)}</pre></details>
    <footer><Button disabled={busy} onClick={close}>{t('稍后审阅', 'Review later', '後で確認')}</Button><Button disabled={busy} onClick={() => void action(async () => { if (!assets.discardResource) throw new Error(t('服务不可用', 'Service unavailable', 'サービスを利用できません')); unwrap(await assets.discardResource(review.preparationId)); close(); })}>{t('弃用候选', 'Discard candidate', '候補を破棄')}</Button><Button tone="primary" disabled={busy} onClick={() => void action(async () => { if (!assets.confirmResource) throw new Error(t('服务不可用', 'Service unavailable', 'サービスを利用できません')); const receipt = unwrap(await assets.confirmResource({ preparationId: review.preparationId, activate: true })); await changed(receipt); close(); })}>{t('采用并设为当前版本', 'Adopt as current version', '採用して現在のバージョンに設定')}</Button></footer>
  </section>;
}
