import { displayMessage, operationTitle, operationDescription } from '@galcraft/plugins/contracts';
import { useEffect, useRef, useState } from 'react';
import { Button, Field } from '../../components/controls.js';
import { PluginFields } from '../Plugins/plugin-fields.js';
import { openAssetPicker } from '../../authoring/asset-picker.js';
import type { AuthoringServices } from '../../authoring/controller.js';
import type { StudioPluginHost } from '../Plugins/studio-host.js';
import type { ProductionSession } from './session.js';
import type { MediaInput } from '@galcraft/authoring/production';
import type { Json } from '@galcraft/contracts';
import { addProductionPortReference, productionPortReferences } from './extension-media-input.js';

export type ProductionEditorHost = Pick<StudioPluginHost, 'mountProductionFieldEditor'>;
export function ExtensionOperationForm({ session: s, host, locale, services }: { session: ProductionSession; host?: ProductionEditorHost | null; locale: string; services: AuthoringServices }) {
  const root = useRef<HTMLDivElement>(null), [mounted, setMounted] = useState(false);
  const snapshot = s.variant?.operationSnapshot, available = s.operationDefinition;
  useEffect(() => {
    setMounted(false);
    if (!root.current || !snapshot?.definition.fieldEditorKey || !host || !available || !s.draft?.revision) return;
    const release = host.mountProductionFieldEditor(snapshot.id, snapshot.definition.fieldEditorKey, root.current, s.productionEditorContext());
    setMounted(!!release); return () => release?.();
  }, [host, snapshot?.id, snapshot?.version, s.draft?.id, s.draft?.revision, s.variant?.connectionId, s.variant?.model, available?.provider?.version]);
  if (!snapshot || !available) return <p role="alert" className="workbench-error">{locale === 'en' ? 'The exact operation package is unavailable. Drafts, tasks, candidates and files are preserved.' : locale === 'ja' ? '操作の正確なパッケージを利用できません。下書き、タスク、候補、ファイルを保持しています。' : '此操作的精确包不可用。草稿、任务、候选和文件已保留。'}</p>;
  if (!s.draft?.revision) return <p role="status">{locale === 'en' ? 'Saving production draft…' : locale === 'ja' ? '制作下書きを保存しています…' : '正在保存制作草稿…'}</p>;
  const translate = (key: string) => displayMessage(available.messages, locale, key, key);
  const binding = s.data.workflows.find(workflow => workflow.id === s.variant?.workflowBindingId) ?? snapshot.definition.workflow as unknown as import('@galcraft/authoring/production').WorkflowBinding | undefined;
  const bound = available.definition.fields.filter(field => !binding || field.path === 'language' || binding.inputs.some(input => input.port === field.path));
  const batch = s.draft.activeUse === 'voice' && Array.isArray(s.variant!.fields.speechLines) && s.variant!.fields.speechLines.length > 0;
  const exposed = bound.filter(field => !(batch && field.path === 'text'));
  const unbound = available.definition.fields.filter(field => !bound.includes(field));
  const fields = Object.fromEntries(Object.entries(s.variant!.fields).filter(([key]) => key !== 'references'));
  const references = (s.variant!.fields.references ?? []) as unknown as MediaInput[];
  const mediaTypes: Record<string, string> = locale === 'en' ? { image: 'Image', audio: 'Audio', video: 'Video' } : locale === 'ja' ? { image: '画像', audio: '音声', video: '動画' } : { image: '图片', audio: '音频', video: '视频' };
  return <section data-production-operation={snapshot.id}>
    <h2>{operationTitle(available, locale)}</h2><p>{operationDescription(available, locale)}</p>
    <div ref={root} />
    {!!unbound.length && <p role="alert" className="field-error">{locale === 'en' ? 'These fields are retained but not bound to the execution graph: ' : locale === 'ja' ? '以下の項目を保持していますが、実行グラフに接続されていません：' : '以下输入保留在草稿中，当前执行图未绑定：'}{unbound.map(field => displayMessage(available.messages, locale, field.labelKey, field.label)).join('、')}</p>}
    {!mounted && <PluginFields fields={exposed} translate={translate} value={fields} locale={locale} change={value => s.update({ fields: { ...value, references: s.variant!.fields.references ?? [] } })}/>}
    {snapshot.definition.inputs.filter(port => port.type !== 'text').map(port => {
      const selected = productionPortReferences(references, snapshot.definition.inputs, port.key);
      const action = locale === 'en' ? port.multiple ? 'Add media' : selected.length ? 'Replace media' : 'Choose media' : locale === 'ja' ? port.multiple ? 'メディアを追加' : selected.length ? 'メディアを置換' : 'メディアを選択' : port.multiple ? '添加媒体' : selected.length ? '替换媒体' : '选择媒体';
      return <Field key={port.key} label={port.key === 'referenceAudio' ? locale === 'en' ? 'Reference audio' : locale === 'ja' ? '参照音声' : '参考音频' : mediaTypes[port.type] ?? port.type} required={port.required}>
        <p className="text-sm text-muted-foreground" style={{ margin: 0 }}>{mediaTypes[port.type] ?? port.type} · {locale === 'en' ? port.multiple ? 'Multiple media' : 'One media item' : locale === 'ja' ? port.multiple ? '複数選択可' : '単一選択' : port.multiple ? '可添加多个' : '单选'}</p>
        <div role="group" aria-label={port.key} className="min-w-0 space-y-2">
        {selected.length ? <ul className="m-0 list-none space-y-2 p-0">{references.map((reference, index) => selected.includes(reference) && <li key={index} className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 break-words">{s.data.assets.find(asset => asset.id === reference.assetId)?.name ?? reference.localPath.split(/[\\/]/).at(-1) ?? reference.mime}</span>
          <Button tone="quiet" disabled={!!s.draft?.submittedTaskId} aria-label={`${locale === 'en' ? 'Remove' : locale === 'ja' ? '削除' : '移除'} ${port.key} ${selected.indexOf(reference) + 1}`} onClick={() => s.field('references', references.filter((_, item) => item !== index) as unknown as Json)}>{locale === 'en' ? 'Remove' : locale === 'ja' ? '削除' : '移除'}</Button>
        </li>)}</ul> : <p className="text-sm text-muted-foreground" style={{ margin: 0 }}>{locale === 'en' ? 'No media selected' : locale === 'ja' ? 'メディア未選択' : '尚未选择媒体'}</p>}
        <Button disabled={!!s.draft?.submittedTaskId} aria-label={`${action} · ${port.key}`} onClick={() => {
          const draft = s.draft, variant = s.variant, container = root.current;
          void openAssetPicker({ services, projectId: s.projectId, allowedKinds: [port.type as import('@galcraft/contracts').AssetKind], locale, purpose: `${operationTitle(available, locale)} · ${port.key}`, remember: false,
            currentAssetId: !port.multiple ? selected[0]?.assetId : null, currentVariantId: !port.multiple ? selected[0]?.variantId : null,
            currentName: !port.multiple ? s.data.assets.find(asset => asset.id === selected[0]?.assetId)?.name : undefined,
            onApply: async choice => {
              const result = await s.bridge.production.mediaInput({ assetId: choice.assetId, variantId: choice.variantId ?? undefined });
              if (!result.ok) return result;
              if (s.draft !== draft || s.variant !== variant || draft?.submittedTaskId || !s.operationDefinition || !container?.isConnected || root.current !== container) {
                const error = { code: 'DRAFT_CONFLICT', severity: 'error' as const, owner: 'M10' as const, message: locale === 'en' ? 'The production draft has changed. Reopen the media picker.' : locale === 'ja' ? '制作下書きが変更されました。メディア選択を開き直してください。' : '制作草稿已变化，请重新打开媒体选择器。', related: [], actions: ['edit' as const] };
                return { ok: false, error, issues: [error] };
              }
              const updated = addProductionPortReference((variant!.fields.references ?? []) as unknown as MediaInput[], snapshot.definition.inputs, port, result.value);
              if (updated.ok) s.field('references', updated.value as unknown as Json);
              return updated;
            } });
        }}>{action}</Button>
        </div>
        {batch && port.key === 'referenceAudio' && !selected.length && <p className="text-sm text-muted-foreground">{locale === 'en' ? 'Each sentence can inherit its character voice. Choose here only to override references for this batch.' : locale === 'ja' ? '各台詞はキャラクターの参照音声を継承できます。ここで選択すると今回の共通参照を指定します。' : '每句可继承角色音色；在这里选择音频会覆盖本次共同参考。'}</p>}
      </Field>;
    })}
    <p>{snapshot.definition.outputs.map(output => `${output.key} · ${output.type}`).join(' / ')}</p>
  </section>;
}
