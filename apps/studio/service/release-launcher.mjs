import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serveRelease } from '../main/release-server.mjs';
import { fail, ok } from '../main/result.mjs';

/** Node host launches the real Windows Player and verifies Web with its own browser. */
export function nodeReleaseLauncher({ userData, browser, shell }) {
  const servers = new Set();
  const stopping = new AbortController();
  async function launch(directory, manifest, signal, smoke, files = [], scenarios = []) {
    signal = signal ? AbortSignal.any([signal, stopping.signal]) : stopping.signal;
    signal.throwIfAborted();
    const temporary = join(userData, 'release-tests', manifest.projectId, manifest.target);
    await mkdir(temporary, { recursive: true });
    if (manifest.target === 'windows') {
      const report = join(temporary, 'launch.json'); if (smoke) await rm(report, { force: true });
      const compatibilityInput = join(temporary, 'compatibility-input.json');
      if (smoke) await writeFile(compatibilityInput, JSON.stringify({ files, scenarios }));
      const args = [`--galcraft-test-data=${join(temporary, 'profile')}`, ...(smoke ? [`--galcraft-smoke-report=${report}`, `--galcraft-compatibility=${compatibilityInput}`] : [])];
      return new Promise(resolve => {
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(join(directory, manifest.entry), args, { cwd: directory, windowsHide: smoke, env, stdio: smoke ? ['ignore', 'ignore', 'pipe'] : 'ignore' });
        let stderr = '';
        child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
        if (!smoke) child.once('spawn', () => { child.unref(); resolve(ok({ evidencePaths: [] })); });
        const abort = () => child.kill(); signal?.addEventListener('abort', abort, { once: true });
        const timer = smoke ? setTimeout(abort, 60000) : null;
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        child.once('error', error => { cleanup(); resolve(fail('PLAYER_LAUNCH', String(error), 'M11')); });
        child.once('close', async code => {
          cleanup(); if (!smoke) { resolve(ok({ evidencePaths: [] })); return; }
          try { const result = JSON.parse(await readFile(report, 'utf8')); resolve(code === 0 && result.result === 'passed' ? ok({ evidencePaths: [report, `${report}.png`], compatibility: result.compatibility, scenarios: result.scenarios }) : fail('PLAYER_LAUNCH', result.error ?? `Player exit ${code}`, 'M11')); }
          catch (error) { resolve(fail('PLAYER_LAUNCH', `Windows Player exited (${code ?? 'signal'}). ${stderr.trim() || String(error)}`, 'M11')); }
        });
      });
    }
    const server = await serveRelease(directory); servers.add(server);
    if (!smoke) { const error = await shell.openExternal(server.url); return error ? fail('PLAYER_LAUNCH', error, 'M11') : ok({ evidencePaths: [] }); }
    try {
      return await browser.withPage({ width: 1280, height: 720 }, async page => {
        const origin = new URL(server.url).origin;
        await page.route('**/*', route => { const url = route.request().url(); return /^https?:/.test(url) && new URL(url).origin !== origin ? route.abort() : route.continue(); });
        const abort = () => void page.close(); signal?.addEventListener('abort', abort, { once: true });
        try {
          signal?.throwIfAborted();
          await page.goto(`${server.url}?galcraft-validation=1`);
          await page.waitForFunction(() => { const root = document.getElementById('app'); if (root?.getAttribute('role') === 'alert') throw new Error(root.textContent); return !!root?.dataset.releaseReady; }, null, { timeout: 30000 });
          const compatibility = await page.evaluate(files => window.reportCompatibility(files), files);
          const routeReports = await page.evaluate(scenarios => window.validateScenarios(scenarios), scenarios);
          const report = join(temporary, 'compatibility.json'), screenshot = join(temporary, 'launch.png');
          await writeFile(report, JSON.stringify(compatibility, null, 2)); await page.screenshot({ path: screenshot });
          return ok({ evidencePaths: [report, screenshot], compatibility, scenarios: routeReports });
        } finally { signal?.removeEventListener('abort', abort); }
      });
    } catch (error) { return fail('PLAYER_LAUNCH', String(error), 'M11'); }
    finally { servers.delete(server); await server.close(); }
  }
  return {
    prepareStop: () => stopping.abort(new Error('Studio service is stopping.')),
    verify: (directory, manifest, signal, files, scenarios) => launch(directory, manifest, signal, true, files, scenarios),
    async test(receipt) {
      if (receipt.target === 'android' || receipt.target === 'ios') return fail('PLAYER_TARGET_ENVIRONMENT', receipt.target === 'android' ? '请在 Android 设备安装生成的 APK；本机体验尚未执行。' : '请在 macOS 打开生成的 Xcode 工程并选择设备；本机体验尚未执行。', 'M11');
      const manifest = JSON.parse(await readFile(join(receipt.outputDirectory, 'release.manifest.json'), 'utf8')); const result = await launch(receipt.outputDirectory, manifest, null, false); return result.ok ? ok(receipt) : result;
    },
    async close() { await Promise.all([...servers].map(server => server.close())); servers.clear(); },
  };
}
