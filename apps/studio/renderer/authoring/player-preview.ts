import { createId } from '@galcraft/contracts';
import type { Domain, Snapshot } from '@galcraft/contracts';
import type { PlayerMount } from '@galcraft/player-ui';
import type { AuthoringServices } from './controller.js';
import { prepareProjectPlugins } from './plugins.js';
import '@galcraft/player-ui/player.css';
import { preparePreviewFonts, previewFontAssets } from './preview-fonts.js';

export async function openPlayerPreview(root: HTMLElement, services: AuthoringServices, snapshot: Snapshot,
  kind: 'sample' | 'playtest' | 'candidate', styles: Record<string, string> = {}, previewStyleIds: string[] = [], candidateResources: {assetId:string;variantId:string;uri:string;mime:string;bytes:number}[] = []): Promise<StudioPlayer> {
  if (!services.runtimeAssets) throw new Error('资源桥接尚未就绪');
  const engines = services.bridge.engines;
  if (!engines) throw new Error('预览引擎目录尚未就绪');
  const started = performance.now();
  const binding = await engines.resolvePreview(snapshot);
  if (!binding.ok) throw new Error(binding.error.message);
  const release = () => { void engines.releasePreview(binding.value.handleId); };
  try {
  const { mountPlayer, PreviewHost } = await import(/* @vite-ignore */ binding.value.url) as typeof import('@galcraft/player-ui');
  const engineReady = performance.now();
  const assets = services.runtimeAssets;
  const modelLeases = new Map<string, { uri: string; leaseId: string }>();
  const releaseModels = () => { for (const lease of modelLeases.values()) void assets.releaseRuntime(lease.leaseId); modelLeases.clear(); };
  const domain: Domain = { projectId: snapshot.projectId, kind, instance: createId() };
  const read = async (resource: Snapshot['assets'][number], path: string) => {
      if (!resource.files.some(file => file.path === path)) throw new Error(`未声明资源文件 ${path}`);
      const key = `${resource.assetId}/${resource.variantId}`;
      let lease = modelLeases.get(key);
      const candidate=candidateResources.find(item=>item.assetId===resource.assetId&&item.variantId===resource.variantId);
      if(candidate){const suffix=resource.entry.split('/').map(encodeURIComponent).join('/');const response=await fetch(candidate.uri.slice(0,-suffix.length)+path.split('/').map(encodeURIComponent).join('/'));if(!response.ok)throw new Error(`Resource missing: ${path}`);return response;}
      if (!lease) { const result = await assets.resolveRuntime(resource.assetId, resource.variantId);
        if (!result.ok) throw new Error(result.error.message); lease = result.value; modelLeases.set(key, lease); }
      const suffix = resource.entry.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(lease.uri.slice(0, -suffix.length) + path.split('/').map(encodeURIComponent).join('/'));
      if (!response.ok) throw new Error(`Resource missing: ${path}`); return response;
    };
  const plugins = await prepareProjectPlugins(services.bridge,
    snapshot.lock, snapshot.pluginDocuments, domain, [], snapshot.assets, 'runtime', {
      runtimeDependencies: { resolve: async key => binding.value.live2d && key === 'org.galcraft.live2d/cubism'
        ? { ok: true, value: binding.value.live2d, warnings: [] } : { ok: false, error: { code: 'RUNTIME_DEPENDENCY_MISSING', message: `外部运行时 ${key} 未准备`, owner: 'M06', severity: 'error', related: [], actions: ['supplyDependency'] }, issues: [] } },
      readText: async (resource, path) => (await read(resource, path)).text(),
      readBytes: async (resource, path) => new Uint8Array(await (await read(resource, path)).arrayBuffer()),
    });
  const pluginsReady = performance.now();
  const host = new PreviewHost(domain, { resolve: async (assetId, variantId) => {
    const candidate=candidateResources.find(r=>r.assetId===assetId&&r.variantId===variantId);
    if(candidate)return {ok:true,value:{...candidate,rangeSupported:true,release:()=>{}},warnings:[]};
    const result = await assets.resolveRuntime(assetId, variantId);
    return result.ok ? { ok: true, value: { ...result.value, rangeSupported: true,
      release: () => { void assets.releaseRuntime(result.value.leaseId); } }, warnings: result.warnings } : result;
  } }, root);
  const fontAssets = previewFontAssets(snapshot);
  const releaseFonts = await preparePreviewFonts(root, host.resources, snapshot).catch(error => { host.dispose(); releaseModels(); void plugins.dispose(); throw error; });
  try {
    const mounted = await mountPlayer(root, host, snapshot, domain, [], plugins.contributions.stages,
      { contributions: plugins.contributions, manifests: plugins.manifests }, styles, previewStyleIds);
    if (!mounted.ok) throw new Error(mounted.error.message);
    root.dataset.previewAssembly = JSON.stringify({ engineMs: engineReady-started, pluginsMs: pluginsReady-engineReady, mountMs: performance.now()-pluginsReady });
    return { ...mounted.value, updatePreview: (next: Snapshot, nextStyles?: Record<string, string>, nextStyleIds?: string[]): ReturnType<PlayerMount['updatePreview']> => {
      const nextFonts = previewFontAssets(next);
      if (fontAssets.length !== nextFonts.length || fontAssets.some(font => !nextFonts.some(next => next.assetId === font.assetId && next.variantId === font.variantId)))
        return { ok: false, error: { code: 'PREVIEW_REBUILD_REQUIRED', owner: 'M08', severity: 'error', message: '作品字体已变化，请重建预览。', related: [], actions: [] }, issues: [] };
      return mounted.value.updatePreview(next, nextStyles, nextStyleIds);
    }, dispose: () => { mounted.value.view.dispose(); releaseFonts(); host.dispose(); releaseModels(); void plugins.dispose(); release(); } };
  } catch (error) { releaseFonts(); host.dispose(); releaseModels(); await plugins.dispose(); throw error; }
  } catch (error) { release(); throw error; }
}
export type StudioPlayer = PlayerMount & { dispose(): void };
