import { BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serveRelease } from './release-server.mjs';
import { fail, ok } from './result.mjs';

export function releaseLauncher(userData) {
  async function launch(directory, manifest, signal, smoke, files = [], scenarios = []) {
    const temporary = join(userData, 'release-tests', manifest.projectId, manifest.target);
    await mkdir(temporary, { recursive: true });
    if (manifest.target === 'windows') {
      const report = join(temporary, 'launch.json'); await rm(report, { force: true });
      const compatibilityInput = join(temporary, 'compatibility-input.json');
      if (smoke) await writeFile(compatibilityInput, JSON.stringify({ files, scenarios }));
      const args = [`--galcraft-test-data=${join(temporary, 'profile')}`, ...(smoke ? [`--galcraft-smoke-report=${report}`, `--galcraft-compatibility=${compatibilityInput}`] : [])];
      return new Promise(resolve => {
        const child = spawn(join(directory, manifest.entry), args, { cwd: directory, windowsHide: true, stdio: 'ignore' });
        const abort = () => child.kill(); signal?.addEventListener('abort', abort, { once: true });
        const timeout = smoke ? setTimeout(abort, 60000) : null;
        child.once('error', error => { if (timeout) clearTimeout(timeout); signal?.removeEventListener('abort', abort); resolve(fail('PLAYER_LAUNCH', String(error), 'M11')); });
        child.once('close', async code => {
          if (timeout) clearTimeout(timeout); signal?.removeEventListener('abort', abort);
          if (!smoke) { resolve(ok({ evidencePaths: [] })); return; }
          try { const result = JSON.parse(await readFile(report, 'utf8'));
            resolve(code === 0 && result.result === 'passed' ? ok({ evidencePaths: [report, `${report}.png`], compatibility: result.compatibility, scenarios: result.scenarios }) : fail('PLAYER_LAUNCH', result.error ?? `Player exit ${code}`, 'M11'));
          } catch (error) { resolve(fail('PLAYER_LAUNCH', String(error), 'M11')); }
        });
      });
    }
    const server = await serveRelease(directory);
    const window = new BrowserWindow({ width: 1280, height: 720, show: !smoke,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: smoke, backgroundThrottling: false, partition: `release-test-${manifest.projectId}-${Date.now()}` } });
    const keepPainting = () => {};
    const origin = new URL(server.url).origin;
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) && new URL(details.url).origin !== origin }));
    const abort = () => { if (!window.isDestroyed()) window.destroy(); }; signal?.addEventListener('abort', abort, { once: true });
    try {
      if (smoke) {
        window.webContents.on('paint', keepPainting);
        window.webContents.startPainting();
      }
      await window.loadURL(server.url + (smoke ? '?galcraft-validation=1' : ''));
      if (smoke) {
        window.webContents.debugger.attach('1.3');
        await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
      }
      await window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+30000;const timer=setInterval(()=>{const root=document.getElementById('app');if(root?.dataset.releaseReady){clearInterval(timer);resolve(root.dataset.releaseReady);}else if(root?.getAttribute('role')==='alert'||Date.now()>end){clearInterval(timer);reject(new Error(root?.textContent||'Player timeout'));}},100);})`);
      if (!smoke) { await new Promise(resolve => window.once('closed', resolve)); return ok({ evidencePaths: [] }); }
      const compatibility = await window.webContents.executeJavaScript(`window.reportCompatibility(${JSON.stringify(files)})`);
      const routeReports = await window.webContents.executeJavaScript(`window.validateScenarios(${JSON.stringify(scenarios)})`);
      const report = join(temporary, 'compatibility.json'), screenshot = join(temporary, 'launch.png');
      await writeFile(report, JSON.stringify(compatibility, null, 2));
      await new Promise((resolve, reject) => {
        const painted = () => { window.removeListener('closed', closed); resolve(); };
        const closed = () => { window.webContents.removeListener('paint', painted); reject(new Error('Player verification window closed before capture')); };
        window.once('closed', closed); window.webContents.once('paint', painted); window.webContents.invalidate();
      });
      await writeFile(screenshot, (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
      return ok({ evidencePaths: [report, screenshot], compatibility, scenarios: routeReports });
    } catch (error) { return fail('PLAYER_LAUNCH', String(error), 'M11'); }
    finally {
      signal?.removeEventListener('abort', abort);
      if (!window.isDestroyed()) {
        window.webContents.removeListener('paint', keepPainting);
        if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
      }
      abort(); await server.close();
    }
  }
  return { verify: (directory, manifest, signal, files, scenarios) => launch(directory, manifest, signal, true, files, scenarios),
    test: async receipt => {
      if (receipt.target === 'android' || receipt.target === 'ios') return fail('PLAYER_TARGET_ENVIRONMENT', receipt.target === 'android' ? '请在 Android 设备安装生成的 APK；本机体验尚未执行。' : '请在 macOS 打开生成的 Xcode 工程并选择设备；本机体验尚未执行。', 'M11');
      const manifest = JSON.parse(await readFile(join(receipt.outputDirectory, 'release.manifest.json'), 'utf8'));
      const result = await launch(receipt.outputDirectory, manifest, null, false);
      return result.ok ? ok(receipt) : result;
    } };
}
