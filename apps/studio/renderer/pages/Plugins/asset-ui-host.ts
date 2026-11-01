import type { AssetKind, AssetTypeData, Result } from '@galcraft/contracts';
import type { AssetEditorContext, AssetPreviewContext, Contributions, PluginDefinition, PluginManifest, StudioPluginContext } from '@galcraft/plugins/contracts';

export type AssetUiProvider = { manifest: PluginManifest; definition: PluginDefinition; contributions: Contributions; context: StudioPluginContext };
export type AssetEditorInput = Omit<AssetEditorContext, 'locale' | 'signal' | 'studio' | 'onDispose'>;
export type AssetPreviewInput = Omit<AssetPreviewContext, 'locale' | 'signal' | 'studio' | 'onDispose'>;
const failure = (message: string): Result<void> => { const error = { code: 'ASSET_EDITOR_UNAVAILABLE', owner: 'M01' as const, severity: 'error' as const, message, related: [], actions: [] }; return { ok: false, error, issues: [error] }; };

/** The ordinary editor lease owns every asset surface, including late asynchronous mounts. */
export class AssetUiHost {
  private views = new Map<() => void, HTMLElement>();
  private observer: MutationObserver | null = null;
  private attached = new WeakSet<HTMLElement>();
  constructor(private providers: () => AssetUiProvider[], private locale: () => string, private report: (reason: unknown) => void = () => {}) {}
  private definition(kind: AssetKind, data?: AssetTypeData) {
    for (const provider of this.providers()) {
      if (data && (provider.manifest.id !== data.provider.id || provider.manifest.version !== data.provider.version)) continue;
      const definition = provider.definition.assetTypes?.find(type => (type.builtinKind ?? type.key) === kind && type.typeVersion === (data?.typeVersion ?? 1));
      if (definition) return { provider, definition };
    }
    return null;
  }
  private lifecycle(root: HTMLElement, signal?: AbortSignal) {
    const abort = new AbortController(), releases = new Set<() => void | Promise<void>>();
    const releaseNow = (release: () => void | Promise<void>) => { try { void Promise.resolve(release()).catch(this.report); } catch (error) { this.report(error); } };
    const onDispose = (release: () => void | Promise<void>) => { if (abort.signal.aborted) releaseNow(release); else releases.add(release); };
    const dispose = () => { if (abort.signal.aborted) return; abort.abort(); signal?.removeEventListener('abort', dispose);
      this.views.delete(dispose); for (const release of releases) releaseNow(release); releases.clear(); root.replaceChildren(); root.remove?.(); };
    this.views.set(dispose, root);
    if (root.isConnected) this.attached.add(root);
    if (!this.observer && root.ownerDocument?.body && typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => { for (const [release, element] of [...this.views]) {
        if (element.isConnected) this.attached.add(element); else if (this.attached.has(element)) release();
      } });
      this.observer.observe(root.ownerDocument.body, { childList: true, subtree: true });
    }
    signal?.addEventListener('abort', dispose, { once: true });
    if (signal?.aborted) dispose();
    return { abort, dispose, onDispose };
  }
  mountEditor(root: HTMLElement, input: AssetEditorInput): (() => void) | null {
    const found = this.definition(input.kind, input.typeData), editor = found?.provider.contributions.assetEditors?.find(item => item.key === found.definition.editorKey);
    if (!found || !editor || !editor.contexts.includes(input.target.kind)) return null;
    const content = root.ownerDocument?.createElement('div') ?? root; if (content !== root) { content.className = 'asset-ui-surface'; root.append(content); }
    const life = this.lifecycle(content), context: AssetEditorContext = { ...input, locale: this.locale(), signal: life.abort.signal, studio: found.provider.context,
      onDispose: life.onDispose, commit: value => life.abort.signal.aborted || input.target.readonly ? Promise.resolve(failure('当前编辑上下文已关闭或为只读')) : input.commit(structuredClone(value)) };
    try { const release = editor.mount(content, context); if (release) life.onDispose(release); }
    catch (error) { content.textContent = String(error); content.setAttribute('role', 'alert'); }
    return life.dispose;
  }
  async mountPreview(root: HTMLElement, input: AssetPreviewInput, signal: AbortSignal, thumbnail = false): Promise<(() => void) | null> {
    const found = this.definition(input.kind, input.variant.typeData), key = thumbnail ? found?.definition.thumbnailKey : found?.definition.previewKey;
    const preview = (thumbnail ? found?.provider.contributions.assetThumbnails : found?.provider.contributions.assetPreviews)?.find(item => item.key === key);
    if (!found || !preview) return null;
    const content = root.ownerDocument?.createElement('div') ?? root; if (content !== root) { content.className = 'asset-ui-surface'; root.append(content); }
    const life = this.lifecycle(content, signal);
    try {
      if (!life.abort.signal.aborted) {
        const release = await preview.mount(content, { ...input, locale: this.locale(), signal: life.abort.signal, studio: found.provider.context, onDispose: life.onDispose });
        if (release) life.onDispose(release);
      }
      if (life.abort.signal.aborted) content.replaceChildren();
      return life.dispose;
    } catch (error) { life.dispose(); throw error; }
  }
  has(kind: AssetKind, data: AssetTypeData | undefined, mode: 'editor' | 'preview' | 'thumbnail') {
    const found = this.definition(kind, data); return !!found?.definition[mode === 'editor' ? 'editorKey' : mode === 'preview' ? 'previewKey' : 'thumbnailKey'];
  }
  dispose() { for (const release of [...this.views.keys()]) release(); this.observer?.disconnect(); this.observer = null; }
}

export function validateAssetUi(provider: AssetUiProvider): void {
  for (const [kind, collection, association] of [['assetEditor', provider.contributions.assetEditors, 'editorKey'], ['assetPreview', provider.contributions.assetPreviews, 'previewKey'], ['assetThumbnail', provider.contributions.assetThumbnails, 'thumbnailKey']] as const) {
    for (const contribution of collection ?? []) {
      const definition = provider.definition.assetTypes?.find(type => (type.builtinKind ?? type.key) === contribution.assetType && type[association] === contribution.key);
      if (!contribution.key.startsWith(`${provider.manifest.id}/`) || !definition || typeof contribution.mount !== 'function') throw new Error(`Invalid ${kind} ownership: ${contribution.key}`);
    }
    for (const declaration of provider.manifest.contributions.filter(item => item.kind === kind)) if ((collection ?? []).filter(item => item.key === declaration.key).length !== 1) throw new Error(`Missing unique ${kind}: ${declaration.key}`);
    for (const contribution of collection ?? []) if (!provider.manifest.contributions.some(item => item.kind === kind && item.key === contribution.key)) throw new Error(`Undeclared ${kind}: ${contribution.key}`);
  }
}
