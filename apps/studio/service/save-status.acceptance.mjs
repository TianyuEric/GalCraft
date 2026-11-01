import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, _electron } from 'playwright';
import { startStudioService } from './server.mjs';
import { createNodeStudioHost } from './host.mjs';

const source = process.argv[2];
const desktopMode = process.argv.includes('--desktop');
assert.ok(source, 'Pass an existing project directory; acceptance edits an isolated copy.');
const repo = resolve(import.meta.dirname, '../../..');
const evidence = join(repo, 'test-results/latest/save-collaboration');
await mkdir(evidence, { recursive: true });
const run = await mkdtemp(join(evidence, 'host-'));
const projectDirectory = join(run, 'project');
await cp(source, projectDirectory, { recursive: true, filter: path => !path.split(/[\\/]/).includes('.galcraft') });
const service = await startStudioService({ userData: join(run, 'user-data'), createHost: createNodeStudioHost, frontendDirectory: join(repo, 'apps/studio/dist') });
let browser, desktop;
const unwrap = result => { assert.ok(result.ok, JSON.stringify(result.error)); return result.value; };
const call = async (group, method, ...args) => unwrap(await fetch(`${service.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group, method, args, clientId: 'save-status-acceptance', entry: 'browser' }) }).then(response => response.json()));
try {
  await call('projects', 'open', projectDirectory);
  let documents = await call('documents', 'list');
  const project = documents.find(document => document.files['project.json']);
  const before = JSON.parse(project.files['project.json']).data.name;
  const edit = { label: '保存状态验收', origin: 'field', preparedAssets: [], requiredRefs: [], expected: [{ ref: { kind: 'document', id: project.documentId }, revision: project.revision }], patches: [{ kind: 'json', documentId: project.documentId, changes: [{ op: 'set', path: '/data/name', before, after: `${before} · 保存状态验收` }] }] };
  const plan = await call('documents', 'planEdit', edit);
  await call('documents', 'applyEdit', plan.planId, edit.expected);
  let page;
  if (desktopMode) {
    const env = { ...process.env, GALCRAFT_USER_DATA: join(run, 'user-data') }; delete env.ELECTRON_RUN_AS_NODE;
    desktop = await _electron.launch({ args: [join(repo, 'apps/studio')], env, timeout: 30000 });
    page = await desktop.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  } else {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(service.origin);
  }
  page.setDefaultTimeout(15000);
  await page.locator('.studio-rail').getByRole('button', { name: '发布', exact: true }).click();
  await page.locator('.publish-saved-state').getByText('有未保存修改', { exact: true }).waitFor();
  // Another client saves the shared working copy while this window still shows its earlier state.
  const savePlan = await call('documents', 'planSave', { kind: 'all' });
  const saved = await call('documents', 'save', savePlan.planId);
  assert.deepEqual(saved.remainingDirty, []);
  await page.getByRole('tab', { name: '发布，未保存', exact: true }).waitFor();
  await page.locator('.authoring-header').getByRole('button', { name: '保存全部', exact: true }).click();
  await page.getByText('当前没有待保存的修改', { exact: true }).waitFor();
  await page.locator('.publish-saved-state').getByText('已保存', { exact: true }).waitFor();
  await page.getByRole('tab', { name: '发布', exact: true }).waitFor();
  await page.locator('.gc-wb-status').getByText('已保存', { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, desktopMode ? 'publish-saved-desktop.png' : 'publish-saved.png'), scale: 'css' });
  documents = await call('documents', 'list');
  assert.ok(documents.every(document => !document.dirty));
  assert.equal(JSON.parse(await readFile(join(projectDirectory, 'project.json'), 'utf8')).data.name, `${before} · 保存状态验收`);
  await writeFile(join(evidence, desktopMode ? 'host-desktop.json' : 'host.json'), JSON.stringify({ environment: `Isolated real Node Studio service, ${desktopMode ? 'Electron' : 'Edge'}, copied user project`, source, projectDirectory, result: 'passed', checks: ['M02 writes normalized project and character documents', 'Empty save refreshes publish and workspace saved state', 'Disk retains the saved edit'] }, null, 2));
  console.log('PASS: real service save, empty save state refresh, and disk contents');
} finally {
  await browser?.close();
  await desktop?.close();
  await service.close();
}
