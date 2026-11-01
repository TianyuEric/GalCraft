(function () {
  const pending = new Map(); let sequence = 0;
  window.galcraftNativeReply = (id, result) => { const resolve = pending.get(id); pending.delete(id); resolve?.(result); };
  const call = async (method, args) => {
    if (window.GalCraftNative) {
      if (method === 'transfer.export') return new Promise(resolve => { const id = String(++sequence); pending.set(id, resolve); window.GalCraftNative.post(id, method, JSON.stringify(args)); });
      return JSON.parse(window.GalCraftNative.invoke(method, JSON.stringify(args)));
    }
    return new Promise(resolve => { const id = String(++sequence); pending.set(id, resolve); window.webkit.messageHandlers.galcraft.postMessage({ id, method, args }); });
  };
  window.createGalCraftPlayerHost = (web, target) => {
    const host = Object.create(web);
    Object.defineProperty(host, 'target', { value: target });
    host.storage = { read: async key => { const result = await call('storage.read', { key }); if (result.ok && result.value !== null) result.value = Uint8Array.from(result.value); return result; },
      commit: batch => call('storage.commit', { ...batch, writes: batch.writes.map(item => ({ ...item, bytes: Array.from(item.bytes) })) }) };
    host.transfer = { ...web.transfer, exportFile: (name, mime, bytes) => call('transfer.export', { name, mime, bytes: Array.from(bytes) }) };
    host.viewport = () => { const meta = window.galcraftMobileViewport ?? {}; return { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio,
      safeArea: meta.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 }, orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait' }; };
    host.subscribeLifecycle = fn => { const callback = event => fn(event.detail); window.addEventListener('galcraft-lifecycle', callback); return () => window.removeEventListener('galcraft-lifecycle', callback); };
    host.subscribeInput = fn => { const callback = event => fn(event.detail); window.addEventListener('galcraft-input', callback); return () => window.removeEventListener('galcraft-input', callback); };
    host.close = () => call('close', {});
    host.platform = (name, args) => call('platform', { name, args });
    return host;
  };
}());
