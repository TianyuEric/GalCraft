import type { Domain, PlayerHost, Snapshot, StorageBatch } from '@galcraft/contracts';

const ok = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
const fail = (code: string, message: string) => { const error = { code, message, severity: 'error' as const,
  owner: 'M07' as const, related: [], actions: ['retry' as const] }; return { ok: false as const, error, issues: [error] }; };
const dbName = 'galcraft-player-v1';
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(dbName, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('values');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const prefix = (domain: Domain) => `player/${domain.projectId}/${domain.kind}/${encodeURIComponent(domain.instance)}/`;

export class WebPlayerHost implements PlayerHost {
  readonly target = 'web';
  constructor(readonly snapshot: Snapshot, readonly base = new URL('./', document.baseURI)) {}
  readonly resources: PlayerHost['resources'] = { resolve: async (assetId, variantId) => {
    const asset = this.snapshot.assets.find(item => item.assetId === assetId && item.variantId === variantId);
    if (!asset) return fail('ASSET_MISSING', '发行包缺少素材');
    const file = asset.files.find(item => item.path === asset.entry);
    return ok({ uri: new URL(asset.entry, this.base).href, mime: file?.mime ?? 'application/octet-stream',
      bytes: file?.bytes ?? 0, rangeSupported: true, release() {} });
  } };
  readonly storage: PlayerHost['storage'] = {
    read: async key => {
      try { const db = await database; const tx = db.transaction('values', 'readonly');
        const value = await new Promise<Uint8Array | null>((resolve, reject) => {
          const request = tx.objectStore('values').get(key);
          request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error);
        }); return ok(value);
      } catch (error) { return fail('STORAGE_READ', String(error)); }
    },
    commit: async (batch: StorageBatch) => {
      const domainPrefix = prefix(batch.domain);
      if ([...batch.writes.map(item => item.key), ...batch.deletes].some(key => !key.startsWith(domainPrefix)))
        return fail('STORAGE_DOMAIN', '资料批次包含其他资料域');
      try { const db = await database, tx = db.transaction('values', 'readwrite');
        const store = tx.objectStore('values');
        const result = await new Promise<{ ok: true; revision: number } | { ok: false; revision: number }>((resolve, reject) => {
          const read = store.get(`${domainPrefix}revision`);
          read.onsuccess = () => {
            const current = read.result ? JSON.parse(new TextDecoder().decode(read.result as Uint8Array)) as number : 0;
            if (current !== batch.expectedRevision) { tx.abort(); resolve({ ok: false, revision: current }); return; }
            for (const item of batch.writes) store.put(new Uint8Array(item.bytes), item.key);
            for (const key of batch.deletes) store.delete(key);
            resolve({ ok: true, revision: current + 1 });
          }; read.onerror = () => reject(read.error);
        });
        if (!result.ok) return fail('STORAGE_STALE', `资料版本已变化：${result.revision}`);
        await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
          tx.onerror = () => reject(tx.error); });
        return ok({ revision: result.revision });
      } catch (error) { return fail('STORAGE_COMMIT', String(error)); }
    },
  };
  readonly transfer: PlayerHost['transfer'] = {
    importFile: async accept => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = accept.join(',');
      return new Promise(resolve => { input.onchange = async () => resolve(ok(input.files?.[0] ? new Uint8Array(await input.files[0].arrayBuffer()) : null));
        input.oncancel = () => resolve(ok(null)); input.click(); });
    },
    exportFile: async (name, mime, bytes) => {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
      const link = document.createElement('a'); link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000); return ok(undefined);
    },
  };
  viewport() { return { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, orientation: innerWidth >= innerHeight ? 'landscape' as const : 'portrait' as const }; }
  subscribeLifecycle(fn: Parameters<PlayerHost['subscribeLifecycle']>[0]) {
    let focused = document.hasFocus(), paused = !focused || document.visibilityState === 'hidden';
    const update = () => { const next = !focused || document.visibilityState === 'hidden'; if (next === paused) return;
      paused = next; fn({ type: next ? 'blur' : 'focus', at: new Date().toISOString() }); };
    const onFocus = () => { focused = true; update(); };
    const onBlur = () => { focused = false; update(); };
    window.addEventListener('focus', onFocus); window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange',update);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange',update); };
  }
  subscribeInput(_fn: Parameters<PlayerHost['subscribeInput']>[0]) { return () => {}; }
  async close() { return ok(undefined); }
  async platform(_name: string, _args: Parameters<PlayerHost['platform']>[1]) {
    if(_name==='window.fullscreen'){try{const args=_args as {enabled?:boolean};if(args.enabled===true&&!document.fullscreenElement)await document.documentElement.requestFullscreen();if(args.enabled===false&&document.fullscreenElement)await document.exitFullscreen();return ok({enabled:!!document.fullscreenElement});}catch(error){return fail('FULLSCREEN_FAILED',String(error));}}
    return fail('PLATFORM_UNAVAILABLE', 'Web 平台没有此操作'); }
}
