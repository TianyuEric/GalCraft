import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { join } from 'node:path';
import { ensureStudioService } from '../service/launcher.mjs';
import { studioUserData } from '../service/paths.mjs';

/** Electron owns windows and native dialogs; the detached service owns authoring. */
async function start() {
  app.setAppUserModelId('org.galcraft.studio');
  const userData = studioUserData(); app.setPath('userData', userData);
  await app.whenReady(); Menu.setApplicationMenu(null);
  const service = await ensureStudioService({ userData, executable: process.execPath, entry: join(import.meta.dirname, '../service/entry.mjs'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', GALCRAFT_USER_DATA: userData,
      GALCRAFT_ELECTRON_PATH: process.execPath, GALCRAFT_ELECTRON_APP: app.isPackaged ? '' : join(import.meta.dirname, '..'),
      ...(app.isPackaged ? { GALCRAFT_BUNDLED_ROOT: process.resourcesPath, GALCRAFT_STUDIO_ROOT: join(import.meta.dirname, '..') } : {}) } });
  const captureRuntime=await fetch(`${service.origin}/api/desktop-runtime`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({executablePath:process.execPath,appDirectory:app.isPackaged?'':join(import.meta.dirname,'..')})});
  if(!captureRuntime.ok)throw new Error('The Studio service could not attach its distributed capture runtime.');
  const window = new BrowserWindow({ show: false, width: 1440, height: 900, minWidth: 900, minHeight: 620, title: 'GalCraft Studio',
    icon: join(import.meta.dirname, '../resources/branding/galcraft.ico'), titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#70879b', height: 44 },
    webPreferences: { preload: join(import.meta.dirname, 'service-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  ipcMain.handle('studio:localDialog', async (event, input) => {
    if (event.sender !== window.webContents || new URL(event.sender.getURL()).origin !== service.origin) throw new Error('Unknown Studio dialog client');
    return input.kind === 'save' ? dialog.showSaveDialog(window, input) : dialog.showOpenDialog(window, input);
  });
  const isWindowClient = event => event.sender === window.webContents && new URL(event.sender.getURL()).origin === service.origin;
  ipcMain.handle('studio:openExternal', async (event, url) => {
    if (!isWindowClient(event) || !/^https:\/\/galcraft\.dev\/docs\/(zh-CN|en)\/studio-guide\/$/.test(url)) throw new Error('Unknown Studio help address');
    await shell.openExternal(url);
  });
  ipcMain.handle('studio:setAppearance', (event, theme) => {
    if (!isWindowClient(event) || !['light', 'dark'].includes(theme)) throw new Error('Unknown Studio appearance');
    window.setIcon(join(import.meta.dirname, `../resources/branding/galcraft-${theme}.png`));
    window.setTitleBarOverlay({ color: '#00000000', symbolColor: theme === 'dark' ? '#bcc6da' : '#4b6078', height: 44 });
  });
  let detached = false, detaching = false;
  window.webContents.on('render-process-gone', () => { detached = true; });
  ipcMain.on('studio:detachReady', (event, error) => {
    if (event.sender !== window.webContents || !detaching) return;
    if (error) { detaching = false; dialog.showErrorBox('编辑输入尚未保留', String(error)); return; }
    detached = true; window.close();
  });
  window.on('close', event => {
    if (detached || window.webContents.isDestroyed()) return;
    event.preventDefault(); if (detaching) return; detaching = true;
    window.webContents.send('studio:detachRequested');
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== service.origin) event.preventDefault(); });
  await window.loadURL(`${service.origin}/?entry=desktop`);
  window.show();
  app.on('window-all-closed', () => app.quit());
}

if (process.argv.includes('--galcraft-capture-helper')) {
  void (async()=>{
  await app.whenReady(); Menu.setApplicationMenu(null);
  const window = new BrowserWindow({ show:false, webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true} });
  window.webContents.on('paint',()=>{});window.webContents.startPainting();
  const origin = process.argv.find(arg=>arg.startsWith('--galcraft-capture-origin='))?.split('=').slice(1).join('=');
  if(!origin)throw new Error('Capture helper requires its Studio service origin.');
  window.webContents.setAudioMuted(true);
  await window.loadURL('about:blank');
  app.on('window-all-closed',()=>app.quit());
  })().catch(error=>{console.error(error);app.exit(1);});
} else start().catch(error => { console.error(error); dialog.showErrorBox('Studio 启动失败', String(error.message ?? error)); app.quit(); });
