import type { Asset, Id } from '@galcraft/contracts';
import type { AuthoringServices } from './controller.js';
import { configureAudioPreview } from './audio-preview.js';
import { mountAssetTypePreview, previewResource } from './asset-type-preview.js';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseAnimationResource } from '@galcraft/stage';
import { AnimationAssetPreview } from './professional/AnimationAssetPreview.js';
import { chooseAnimationPreviewTarget } from './animation-preview-target.js';

export function createAssetPickerPreview(root: HTMLElement, services: AuthoringServices, locale = 'zh-CN') {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  let generation = 0, cleanup: (() => void) | null = null;
  const clear = () => { generation++; cleanup?.(); cleanup = null; root.replaceChildren(); };
  const preview = async (asset: Asset, variantId: Id | null) => {
    clear(); const request = generation;
    const current = () => request === generation;
    const heading = document.createElement('strong'); heading.textContent = asset.name; root.append(heading);
    root.dataset.assetId=asset.id;root.dataset.variantId=variantId??asset.activeVariantId;
    const status = document.createElement('p'); status.setAttribute('role','status'); status.textContent = t('正在加载预览…','Loading preview…','プレビューを読み込み中…'); root.append(status);
    root.setAttribute('aria-busy','true');
    const failed = (message: string) => {
      if (!current()) return;
      cleanup?.(); cleanup=null; root.setAttribute('aria-busy','false');
      status.textContent=message;status.setAttribute('role','alert');root.append(status);
      const retry=document.createElement('button');retry.type='button';retry.textContent=t('重试预览','Retry preview','プレビューを再試行');retry.onclick=()=>void preview(asset,variantId);root.append(retry);
    };
    try {
      const variant = asset.variants.find(item => item.id === (variantId ?? asset.activeVariantId));
      if (!variant) throw new Error(t('引用版本缺失','Referenced version is missing','参照バージョンがありません'));
      if (asset.kind === 'animation') {
        const resolved = await services.runtimeAssets?.resolveRuntime(asset.id, variant.id);
        if (!resolved?.ok) throw new Error(resolved && !resolved.ok ? resolved.error.message : 'Animation resource service unavailable');
        try {
          const response = await fetch(resolved.value.uri); if (!response.ok) throw new Error(`Animation resource: HTTP ${response.status}`);
          const parsed = parseAnimationResource(await response.text()); if (!parsed.ok) throw new Error(parsed.error.message);
          if (!current()) return;
          const container = document.createElement('div'); container.className = 'animation-asset-preview'; root.append(container); const react = createRoot(container);
          cleanup = () => { react.unmount(); container.remove(); };
          react.render(createElement(AnimationAssetPreview, { animation: parsed.value, locale, chooseTarget: () => chooseAnimationPreviewTarget(services, locale) }));
          status.remove(); root.setAttribute('aria-busy', 'false'); return;
        } finally { void services.runtimeAssets?.releaseRuntime(resolved.value.leaseId); }
      }
      if (services.assetUi?.has(asset.kind, variant.typeData, 'preview')) {
        const abort = new AbortController(), container = document.createElement('div');
        container.className = 'asset-type-preview'; root.append(container);
        let release: (() => void) | null = null, leaseId: string | null = null;
        cleanup = () => { abort.abort(); release?.(); release=null; if (leaseId) {void services.runtimeAssets?.releaseRuntime(leaseId);leaseId=null;} container.remove(); };
        const resolved = await services.runtimeAssets?.resolveRuntime(asset.id, variant.id);
        if (!resolved?.ok) throw new Error(resolved && !resolved.ok ? resolved.error.message : 'Asset resource service unavailable');
        if (!current()) { void services.runtimeAssets?.releaseRuntime(resolved.value.leaseId); return; }
        leaseId = resolved.value.leaseId;
        release = await mountAssetTypePreview(container, services.assetUi, { source: { kind: 'asset', assetId: asset.id }, kind: asset.kind,
          name: asset.name, variant, resource: previewResource(resolved.value.uri, variant, abort.signal) }, abort.signal);
        if (!current()) { release?.(); return; }
        if (!release) throw new Error('Asset preview provider unavailable');
        status.remove();root.setAttribute('aria-busy','false'); return;
      }
      if (!['image', 'audio', 'video'].includes(asset.kind)) {
        status.textContent = `${asset.kind} · ${t('类型预览提供方不可用，原文件保留', 'Type preview provider unavailable; original files retained', '種類のプレビュー提供元がありません。元ファイルを保持します')} · ${variant.entry}`;root.setAttribute('aria-busy','false'); return;
      }
      // Inspector and picker own independent runtime leases; switching one never stops another preview.
      if (services.runtimeAssets) {
        const result=await services.runtimeAssets.resolveRuntime(asset.id,variant.id);
        if(!result.ok)throw new Error(result.error.message);
        if(!current()){void services.runtimeAssets.releaseRuntime(result.value.leaseId);return;}
        let released=false;
        const media=document.createElement(asset.kind==='audio'?'audio':asset.kind==='video'?'video':'img');
        cleanup=()=>{if(released)return;released=true;if(media instanceof HTMLMediaElement){media.pause();media.removeAttribute('src');media.load();}media.remove();void services.runtimeAssets!.releaseRuntime(result.value.leaseId);};
        media.addEventListener('error',()=>failed(t('版本文件无法读取，请检查文件后重试。','Version file is unavailable. Check the file and retry.','バージョンのファイルを確認して再試行してください。')));
        const ready=()=>{if(current()){status.remove();root.setAttribute('aria-busy','false');}};
        media.addEventListener(media instanceof HTMLImageElement?'load':'loadedmetadata',ready,{once:true});
        if(media instanceof HTMLImageElement)media.alt=asset.name;
        if(media instanceof HTMLMediaElement){media.controls=true;media.preload='metadata';}
        media.src=result.value.uri;root.append(media);return;
      }
      const result = await services.previewAsset?.(asset.id, variantId ?? undefined);
      if (!current()) return;
      if (!result?.ok) throw new Error(result && !result.ok ? result.error.message : '素材预览尚未就绪 / Preview is unavailable');
      const media = document.createElement(asset.kind === 'audio' ? 'audio' : asset.kind === 'video' ? 'video' : 'img');
      media.addEventListener('error', () => {media.remove();failed(t('引用版本的文件无法读取。请补齐该版本或显式选择替换。', 'Referenced version file is unavailable. Supply it or choose a replacement.', '参照バージョンのファイルを補完するか、置換を選択してください。')); });
      media.src = result.value.uri;
      if (media instanceof HTMLImageElement) media.alt = asset.name;
      if (media instanceof HTMLMediaElement) media.controls = true;
      const audioCleanup = media instanceof HTMLAudioElement ? configureAudioPreview(media, result.value.playback) : null;
      cleanup = () => { if (media instanceof HTMLMediaElement) { media.pause(); media.removeAttribute('src'); media.load(); }
        audioCleanup?.(); void services.stopAssetPreview?.(); };
      status.remove();root.setAttribute('aria-busy','false'); root.append(media);
    } catch (error) { failed(error instanceof Error ? error.message : String(error)); }
  };
  return { preview, clear, dispose: clear };
}
