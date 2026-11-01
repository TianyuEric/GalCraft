import { app, BrowserWindow, dialog, ipcMain, protocol, screen } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { registerResourceScheme, ResourceRegistry } from '@galcraft/media-tools/resources';
import { WindowsPlayerHost, registerPlayerIpc } from './host.mjs';
import { WindowsPlayerStorage } from './storage.mjs';
import { loadNativePlatforms } from './platforms.mjs';
import { initialPlayerContentSize, configurePlayerWindow } from './window-size.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRoot = join(root, '../..');
const option = name => process.argv.find(argument => argument.startsWith(`${name}=`))?.slice(name.length + 1);
registerResourceScheme(protocol);

async function start() {
  const manifest = JSON.parse(await readFile(join(releaseRoot, 'release.manifest.json'), 'utf8'));
  const snapshot = JSON.parse(await readFile(join(releaseRoot, manifest.snapshot), 'utf8'));
  // Keep the transport identity ASCII: Electron also uses the app name in protocol request headers.
  const userAgent = app.userAgentFallback;
  app.setName(snapshot.project.name);
  app.userAgentFallback = userAgent;
  const userData = option('--galcraft-test-data') ?? join(app.getPath('appData'), 'GalCraft', 'player', snapshot.projectId);
  await mkdir(userData, { recursive: true }); app.setPath('userData', userData);
  app.setAppUserModelId(`org.galcraft.player.${snapshot.projectId}`);
  await app.whenReady();

  const resources = new ResourceRegistry();
  resources.install(protocol);
  const window = new BrowserWindow({
  ...initialPlayerContentSize(snapshot.project.canvas), useContentSize: true,
  title: snapshot.project.name,
  icon: snapshot.project.display.icon ? join(root, 'branding/work.ico') : join(root, 'branding/galcraft.ico'),
  webPreferences: { preload: join(root, 'main', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setMenu(null);
  configurePlayerWindow(window,snapshot.project.canvas,screen.getDisplayMatching(window.getBounds()).workAreaSize);
  let allowClose = false;
  const platforms = await loadNativePlatforms({ releaseRoot, snapshot,
    domain: { projectId: snapshot.projectId, kind: option('--galcraft-compatibility') ? 'sample' : 'player', instance: 'default' } });
  const host = new WindowsPlayerHost({
    window, dialog, resourceRegistry: resources,
    assetProvider: { resolve: async (assetId, variantId) => {
      const asset = snapshot.assets.find(item => item.assetId === assetId && item.variantId === variantId);
      if (!asset) return null;
      return { projectId: snapshot.projectId, assetId, variantId, relative: asset.entry,
        path: join(releaseRoot, asset.entry), mime: asset.files.find(file => file.path === asset.entry)?.mime ?? 'application/octet-stream' };
    } },
    storageProvider: new WindowsPlayerStorage(join(app.getPath('userData'), 'player-data')),
    platformProvider: (name, args) => platforms.invoke(name, args),
  requestClose: async () => { allowClose = true; window.close(); return { ok: true, value: undefined, warnings: [] }; },
  });
  registerPlayerIpc(ipcMain, host);

  window.on('focus', () => window.webContents.send('player:lifecycle', { type: 'focus', at: new Date().toISOString() }));
  window.on('blur', () => window.webContents.send('player:lifecycle', { type: 'blur', at: new Date().toISOString() }));
  window.on('close', event => {
  if (allowClose) return;
  event.preventDefault();
  window.webContents.send('player:lifecycle', { type: 'closeRequested', at: new Date().toISOString() });
  });
  window.on('closed', () => { host.releaseAll(); void platforms.dispose(); });

  if (option('--galcraft-smoke-report') || process.argv.includes('--galcraft-offline')) window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }));
  await window.loadFile(join(root, 'dist', 'index.html'), { query: option('--galcraft-compatibility') ? { 'galcraft-validation': '1' } : {} });
  if (option('--galcraft-smoke-report')) {
    const report = option('--galcraft-smoke-report');
    try {
      await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+30000;const timer=setInterval(()=>{const root=document.getElementById('app');if(root?.dataset.releaseReady){clearInterval(timer);resolve(root.dataset.releaseReady);}else if(root?.getAttribute('role')==='alert'||Date.now()>end){clearInterval(timer);reject(new Error(root?.textContent||'Player timeout'));}},100);})`);
      const compatibilityInput = option('--galcraft-compatibility');
      const request = compatibilityInput ? JSON.parse(await readFile(compatibilityInput, 'utf8')) : null;
      const compatibility = request ? await window.webContents.executeJavaScript(`window.reportCompatibility(${JSON.stringify(Array.isArray(request) ? request : request.files)})`) : null;
      const scenarios = request && !Array.isArray(request) ? await window.webContents.executeJavaScript(`window.validateScenarios(${JSON.stringify(request.scenarios ?? [])})`) : [];
      await writeFile(report, JSON.stringify({ result: 'passed', version: snapshot.releaseVersion, target: 'windows', offline: true, compatibility, scenarios }));
      await writeFile(`${report}.png`, (await window.webContents.capturePage()).toPNG());
    } catch (error) { await writeFile(report, JSON.stringify({ result: 'failed', error: String(error) })); process.exitCode = 1; }
    allowClose = true; window.destroy(); app.exit(process.exitCode ?? 0);
  }
  app.on('window-all-closed', () => app.quit());
}

start().catch(error => { console.error(error); app.quit(); });
