import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const repo = resolve('../..'), evidence = join(repo, 'test-results/latest/desktop-first-run');
await mkdir(evidence, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9341');
const page = browser.contexts()[0].pages()[0]; page.setDefaultTimeout(15000);
const report = { result: 'failed', errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
try {
  const engines = await page.evaluate(() => window.studioBridge.engines.listCreationVersions());
  assert(engines.ok && engines.value.includes('0.1.0'));
  await page.getByRole('button', { name: '新建作品', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('combobox', { name: '引擎版本', exact: true }).innerText(), '0.1.0');
  await dialog.getByLabel('作品名称', { exact: true }).fill('首次启动体验');
  await dialog.locator('input[value=sample]').check();
  await page.screenshot({ path: join(evidence, 'create.png'), scale: 'css' });
  await dialog.getByRole('button', { name: '选择目录并创建', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' }); await page.locator('.authoring-editor').waitFor();
  await page.getByRole('menuitem', { name: '视图', exact: true }).click();
  await page.getByRole('menuitem', { name: '写作视图', exact: true }).click();
  const text = '从全新 Studio 开始的故事。';
  const input = page.locator('.authoring-writing-input').first();
  await input.fill(text); await input.press('Tab');
  await page.waitForFunction(async () => (await window.studioBridge.documents.list()).value.some(d => d.dirty));
  await page.locator('.authoring-header').getByRole('button', { name: '保存全部', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await page.locator('.authoring-toolbar').getByText('已保存', { exact: true }).waitFor();
  const docs = await page.evaluate(async () => (await window.studioBridge.documents.list()).value);
  const script = docs.flatMap(d => Object.entries(d.files)).find(([path]) => path.endsWith('.gal'));
  assert((await readFile(join(repo, 'tmp/testing/desktop-first-run/projects/首次启动体验', script[0]), 'utf8')).includes(text));
  await page.getByRole('button', { name: '从此句试玩', exact: true }).click();
  await page.locator('.studio-playtest .galcraft-player').waitFor();
  await page.getByRole('button', { name: '准备路线', exact: true }).click();
  await page.getByRole('button', { name: '启动试玩', exact: true }).click();
  await page.locator('.studio-playtest').getByText(text, { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, 'playtest.png'), scale: 'css' });
  await page.getByRole('button', { name: '返回编辑位置', exact: true }).click();
  const manifest = JSON.parse(await readFile(join(repo, 'tmp/testing/desktop-first-run/user-data/engines/0.1.0/manifest.json'), 'utf8'));
  report.environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, width: innerWidth, height: innerHeight }));
  report.engine = { version: manifest.version, files: manifest.files.length, entries: manifest.entries };
  report.actual = { selectedInstalledVersion: true, createdFromSample: true, savedToDisk: true, realEnginePlaytest: true };
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) { report.failure = String(error.stack ?? error); throw error; }
finally { await writeFile(join(evidence, 'result.json'), JSON.stringify(report, null, 2)); await browser.close(); }
