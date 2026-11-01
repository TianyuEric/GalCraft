import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';

// Run against an Electron instance using an isolated project under test-results/.
const repo = resolve(import.meta.dirname, '../../..'), evidence = join(repo, 'test-results/latest/studio-scale');
assert(process.env.GALCRAFT_SCALE_CDP, 'Set GALCRAFT_SCALE_CDP to the isolated Electron debugging URL');
const browser = await chromium.connectOverCDP(process.env.GALCRAFT_SCALE_CDP);
const page = browser.contexts()[0].pages()[0], origin = new URL(page.url()).origin;
const status = await fetch(`${origin}/api/status`).then(response => response.json());
assert(status.project && !relative(join(repo, 'test-results'), resolve(status.project.directory)).startsWith('..'), 'Use an isolated project copy in test-results/');
await mkdir(evidence, { recursive: true });
const records = [], errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().endsWith('/api/bridge')) { const { group, method } = request.postDataJSON(); requests.push({ group, method }); } });
const metrics = () => page.evaluate(() => ({ dom: document.getElementsByTagName('*').length, calls: document.querySelectorAll('.collaboration-call-list button').length, tasks: document.querySelectorAll('[data-task-id]').length }));
const record = (id, expected, actual) => records.push({ id, target: id, environment: 'Windows Electron 43.7.0 / actual desktop preload and Studio HTTP host / isolated real project copy / no generation sends', data: { projectId: status.project.projectId }, expected, actual, result: 'passed', evidencePaths: [join(evidence, 'acceptance-records.json')] });
try {
  await page.reload();
  await page.getByRole('button', { name: '协作', exact: true }).click();
  const calls = page.locator('.collaboration-call-list button'), history = page.getByRole('navigation', { name: '调用历史分页' });
  await calls.first().waitFor();
  if (await history.getByRole('button', { name: '首页' }).isEnabled()) await history.getByRole('button', { name: '首页' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.collaboration-call-list button').length === 25);
  const collaboration = await metrics();
  await calls.first().click(); await page.getByRole('button', { name: '参数与真实结果', exact: true }).waitFor();
  await history.getByRole('button', { name: '末页' }).click(); await page.getByText('676–690 / 690', { exact: true }).waitFor(); assert.equal(await calls.count(), 15);
  await page.getByRole('textbox', { name: '搜索调用', exact: true }).fill('no-matching-call');
  await page.getByText('没有匹配的调用。调整搜索或状态可查看其他记录。', { exact: true }).waitFor(); assert.equal(await history.count(), 0);
  await page.getByRole('textbox', { name: '搜索调用', exact: true }).fill('');
  await page.waitForFunction(() => document.querySelectorAll('.collaboration-call-list button').length === 25);
  assert.equal(requests.filter(request => request.method === 'readCall').length, 1);
  await page.screenshot({ path: join(evidence, 'collaboration-1440-light.png') });
  record('SCALE-history', '25 summaries per page; last and empty pages remain reachable; selection reads one full receipt across page/filter changes.', { ...collaboration, lastPage: 15, selectedReceiptReads: 1 });

  await page.getByRole('button', { name: '制作', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-task-id]').length === 20);
  const production = await metrics(), taskPages = page.getByRole('navigation', { name: '制作记录分页' });
  await taskPages.getByRole('button', { name: '末页' }).click(); await page.getByText('81–87 / 87', { exact: true }).waitFor(); assert.equal(await page.locator('[data-task-id]').count(), 7);
  const row = page.locator('[data-task-id]').first(), selected = await row.getAttribute('data-task-id'), name = await row.locator('strong').innerText(); await row.click();
  await page.waitForFunction(title => document.querySelector('.task-detail-heading h2')?.textContent === title, name);
  await page.getByRole('button', { name: '制作记录 · 87', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('[data-task-id]').length === 0);
  await page.getByRole('button', { name: '制作记录 · 87', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('[data-task-id]').length === 7);
  await taskPages.getByRole('button', { name: '首页' }).click(); await page.waitForFunction(() => document.querySelectorAll('[data-task-id]').length === 20);
  assert.equal(await page.locator('.task-detail-heading h2').innerText(), name);
  await page.screenshot({ path: join(evidence, 'production-1440-light.png') });
  record('SCALE-production', '20 navigation summaries per page; last page has 7; collapsing unmounts rows; paging retains the selected task.', { ...production, lastPage: 7, selected });

  await page.getByRole('button', { name: '切换深色主题', exact: true }).click(); await page.setViewportSize({ width: 900, height: 760 });
  await page.screenshot({ path: join(evidence, 'production-900-dark.png') });
  await page.getByRole('button', { name: '协作', exact: true }).click(); await calls.first().waitFor();
  await page.screenshot({ path: join(evidence, 'collaboration-900-dark.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  record('SCALE-layout', 'Desktop light and 900px dark keep paging, selection and normal workspace navigation available.', { viewports: [1440, 900], horizontalDocumentOverflow: false });

  await page.getByRole('button', { name: '创作', exact: true }).click(); await page.waitForTimeout(1000);
  const count = requests.filter(request => ['collaboration', 'production'].includes(request.group) && request.method === 'overview').length;
  await page.waitForTimeout(3800);
  assert.equal(requests.filter(request => ['collaboration', 'production'].includes(request.group) && request.method === 'overview').length, count);
  record('SCALE-hidden', 'Leaving both workspaces stops their background overview polling.', { overviewRequestsDuring3800ms: 0 });
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('button', { name: '切换浅色主题', exact: true }).click();
  await writeFile(join(evidence, 'acceptance-records.json'), JSON.stringify({ records, errors }, null, 2));
  console.log(JSON.stringify({ result: 'passed', records, evidence }));
} finally { await browser.close(); }
