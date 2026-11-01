import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { _electron, chromium } from 'playwright';

const repo = resolve(import.meta.dirname, '../../..');
const evidence = await mkdtemp(join(await mkdir(join(repo, 'test-results/latest/studio-desktop'), { recursive: true }).then(() => join(repo, 'test-results/latest/studio-desktop')), 'run-'));
const profile = join(evidence, 'profile'), executablePath = join(repo, 'out/studio/win-unpacked/GalCraft Studio.exe');
const env = { ...process.env, GALCRAFT_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
let desktop, browser, origin;
try {
  desktop = await _electron.launch({ executablePath, env, timeout: 90000 });
  const window = await desktop.firstWindow(); await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => typeof window.studioDesktop?.onDetach === 'function' && document.body.innerText.includes('作品'), null, { timeout: 60000 });
  const url = new URL(window.url()); origin = url.origin; assert.equal(url.searchParams.get('entry'), 'desktop');
  await window.screenshot({ path: join(evidence, 'desktop.png') });
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  const first = await fetch(`${origin}/api/status`).then(response => response.json());
  const projects = join(evidence, 'projects'); await mkdir(projects);
  const call = (group, method, ...args) => fetch(`${origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group, method, args, clientId: 'DeskQA', entry: 'browser' }) }).then(response => response.json());
  const created = await call('projects', 'create', { path: projects, name: 'Shared desktop', template: 'light', width: 960, height: 540, engineVersion: '0.1.0' });
  assert(created.ok, JSON.stringify(created));
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto(origin);
  await page.locator('.authoring-shell').last().waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('作品'), null, { timeout: 60000 });
  await page.screenshot({ path: join(evidence, 'browser.png') });
  const both = await fetch(`${origin}/api/status`).then(response => response.json()); assert.equal(both.pid, first.pid); assert(both.project?.projectId);
  const exited = once(desktop.process(), 'exit');
  await desktop.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 50); });
  await Promise.race([exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Desktop detach did not finish')), 20000); timer.unref(); })]);
  desktop = undefined;
  const after = await fetch(`${origin}/api/status`).then(response => response.json()); assert.equal(after.pid, first.pid); assert.deepEqual(after.project, both.project);
  await browser.close(); browser = undefined;
  const detached = await fetch(`${origin}/api/status`).then(response => response.json()); assert.equal(detached.pid, first.pid);
  const stopped = await fetch(`${origin}/api/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert(stopped.ok);
  for (let i = 0; i < 200; i++) { try { await stat(join(profile, 'studio-service/active.json')); } catch { break; } await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.equal(await stat(join(profile, 'studio-service/active.json')).then(() => true, () => false), false);
  const report = { id: 'SH10-packaged-desktop', target: 'real packaged Electron and browser shared local service', environment: { platform: process.platform, arch: process.arch, node: process.version },
    data: { executablePath, profile, projectId: both.project.projectId }, expected: 'The packaged desktop uses native preload and the same actual Node owner as the browser. Closing both entry windows retains the project; explicit stop releases the owner.',
    actual: { origin, servicePid: first.pid, project: after.project, nativePreload: true, desktopDetached: true, browserDetached: true, explicitlyStopped: true }, result: 'passed', executedAt: new Date().toISOString(), evidencePaths: [evidence] };
  await writeFile(join(evidence, 'acceptance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  if (desktop) await Promise.race([desktop.close().catch(() => {}), new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
  if (origin) await fetch(`${origin}/api/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
}
