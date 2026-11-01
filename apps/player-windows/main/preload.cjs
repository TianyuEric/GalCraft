// @ts-check
const { contextBridge, ipcRenderer } = require('electron');

/** @template {keyof import('@galcraft/contracts').PlayerIpc} G
 * @template {keyof import('@galcraft/contracts').PlayerIpc[G] & string} M
 * @param {G} group @param {M} method
 * @param {import('@galcraft/contracts').IpcArgs<import('@galcraft/contracts').PlayerIpc[G][M]>} args
 * @returns {Promise<import('@galcraft/contracts').IpcValue<import('@galcraft/contracts').PlayerIpc[G][M]>>} */
const invoke = (group, method, ...args) => ipcRenderer.invoke(`player:${group}:${method}`, ...args);
/** @type {Set<(event: import('@galcraft/contracts').LifecycleEvent) => void>} */
const lifecycleSubscribers = new Set();
/** @type {Set<(event: import('@galcraft/contracts').HostInput) => void>} */
const inputSubscribers = new Set();
ipcRenderer.on('player:lifecycle', (_event, value) => lifecycleSubscribers.forEach(fn => fn(value)));

/** @template T @param {Set<T>} set @param {T} fn */
function subscribe(set, fn) {
  set.add(fn);
  return () => set.delete(fn);
}

/** @param {Event} event */
const uiOwnsInput = event => {
  const element = event.target instanceof HTMLElement ? event.target : null;
  return event.defaultPrevented || ('isComposing' in event && event.isComposing) || element?.isContentEditable ||
    Boolean(element?.closest?.('button,a,input,textarea,select,[role="button"]'));
};

window.addEventListener('keydown', event => {
  if (uiOwnsInput(event)) return;
  const action = event.key === 'Escape' ? 'back' : event.key === 'Enter' || event.key === ' ' ? 'confirm' : null;
  if (action) inputSubscribers.forEach(fn => fn({ action, phase: 'down', origin: 'keyboard', nativeCode: event.code }));
});
window.addEventListener('keyup', event => {
  if (uiOwnsInput(event)) return;
  const action = event.key === 'Escape' ? 'back' : event.key === 'Enter' || event.key === ' ' ? 'confirm' : null;
  if (action) inputSubscribers.forEach(fn => fn({ action, phase: 'up', origin: 'keyboard', nativeCode: event.code }));
});
/** @type {('pointerdown' | 'pointerup')[]} */
const pointerEvents = ['pointerdown', 'pointerup'];
for (const phase of pointerEvents) {
  window.addEventListener(phase, event => {
    if (uiOwnsInput(event) || event.button !== 0) return;
    inputSubscribers.forEach(fn => fn({
      action: 'advance', phase: phase === 'pointerdown' ? 'down' : 'up',
      origin: event.pointerType === 'touch' ? 'touch' : 'mouse',
      pointer: { x: event.clientX, y: event.clientY }, nativeCode: String(event.button),
    }));
  });
}

/** @type {import('@galcraft/contracts').PlayerHost} */
const playerHost = {
  target: 'windows',
  resources: {
    resolve: async (assetId, variantId) => {
      const result = await invoke('resources', 'resolve', assetId, variantId);
      if (!result.ok) return result;
      const { token, ...location } = result.value;
      return { ...result, value: { ...location, release: () => { void invoke('resources', 'release', token); } } };
    },
  },
  storage: {
    read: key => invoke('storage', 'read', key),
    commit: batch => invoke('storage', 'commit', batch),
  },
  transfer: {
    importFile: accept => invoke('transfer', 'importFile', accept),
    exportFile: (name, mime, bytes) => invoke('transfer', 'exportFile', name, mime, bytes),
  },
  viewport: () => ({
    width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
  }),
  subscribeLifecycle: fn => subscribe(lifecycleSubscribers, fn),
  subscribeInput: fn => subscribe(inputSubscribers, fn),
  close: () => invoke('host', 'close'),
  platform: (name, args) => invoke('host', 'platform', name, args),
};
contextBridge.exposeInMainWorld('playerHost', playerHost);
