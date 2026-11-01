// @ts-check
const { contextBridge, ipcRenderer, webUtils } = require('electron');
/** @type {(() => Promise<void>) | null | undefined} */
let detach;
ipcRenderer.on('studio:detachRequested', () => {
  Promise.resolve().then(() => detach?.()).then(() => ipcRenderer.send('studio:detachReady'), error => ipcRenderer.send('studio:detachReady', String(error.message ?? error)));
});
/** @type {import('../desktop-shell.js').StudioDesktopBridge} */
const desktop = {
  openExternal: url => ipcRenderer.invoke('studio:openExternal', url),
  setAppearance: theme => ipcRenderer.invoke('studio:setAppearance', theme),
  pathsForFiles: files => files.map(file => webUtils.getPathForFile(file)).filter(Boolean),
  chooseFiles: input => ipcRenderer.invoke('studio:localDialog', input),
  onDetach: callback => { detach = callback; return () => { if (detach === callback) detach = null; }; },
};
contextBridge.exposeInMainWorld('studioDesktop', desktop);
module.exports = desktop;
