import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const repo = resolve('../..'), testing = join(repo, 'tmp/testing/ui-polish'), evidence = join(repo, 'test-results/latest/ui-polish');
await mkdir(evidence, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9342');
const page = browser.contexts()[0].pages()[0]; page.setDefaultTimeout(12000);
const report = { result: 'failed', checks: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
const shot = name => page.screenshot({ path: join(evidence, `${name}.png`), scale: 'css' });
const nav = name => page.locator('.studio-rail').getByRole('button', { name, exact: true }).click();
const click = name => page.getByRole('button', { name, exact: true }).click();
try {
  await click('新建作品'); await page.getByLabel('作品名称', { exact: true }).fill('界面精修验收');
  await page.getByRole('dialog').locator('input[value=sample]').check(); await click('选择目录并创建');
  await page.locator('.authoring-editor').waitFor();
  await click('收起导航'); assert.equal(await page.locator('.studio-rail').evaluate(el => el.clientWidth), 59);
  assert.equal(await page.evaluate(() => localStorage.getItem('studio:railCollapsed')), 'true'); await shot('navigation-collapsed'); await click('展开导航');
  await page.getByRole('button', { name: '添加指令', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  await dialog.getByLabel('正文', { exact: true }).fill('界面精修后的对白。'); await dialog.getByLabel('正文', { exact: true }).press('Tab');
  await shot('command-dialog'); await dialog.getByRole('button', { name: '应用', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.authoring-card').length === 2);
  const order = () => page.locator('.authoring-card').evaluateAll(items => items.map(item => item.dataset.statementId));
  const initial = await order();
  await page.locator('.authoring-grip').first().focus(); await page.keyboard.press('Alt+ArrowDown');
  await page.waitForFunction(id => document.querySelector('.authoring-card')?.dataset.statementId !== id, initial[0]);
  await page.locator('.authoring-card').evaluateAll(items => Promise.all(items.flatMap(item => item.getAnimations().map(animation => animation.finished))));
  const first = await page.locator('.authoring-grip').first().boundingBox(), last = await page.locator('.authoring-card').last().boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
  await page.waitForTimeout(430); await page.mouse.move(last.x + last.width / 2, last.y + last.height - 4, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(id => document.querySelector('.authoring-card')?.dataset.statementId === id, initial[0]);
  report.checks.push('command insertion; keyboard and pointer card reorder');
  await page.locator('.authoring-card').first().click();
  await page.locator('.authoring-tabs').getByRole('button', { name: '写作', exact: true }).click(); await shot('writing');
  const area = await page.locator('.authoring-writing-input').first().boundingBox(); assert(area.width > 250 && area.height >= 90);
  await page.locator('.authoring-tabs').getByRole('button', { name: '卡片', exact: true }).click();
  await page.locator('.authoring-nav summary').filter({ hasText: '搜索' }).click();
  const searchMode = page.locator('.authoring-nav details select').first();
  assert.equal(await searchMode.evaluate(el => getComputedStyle(el).appearance), 'base-select');
  await searchMode.click(); await shot('search-picker'); await page.keyboard.press('Escape');
  const toolbarHeight = (await page.locator('.authoring-editor > .authoring-toolbar').boundingBox()).height;
  await click('创作状态'); await shot('authoring-status'); assert.equal((await page.locator('.authoring-editor > .authoring-toolbar').boundingBox()).height, toolbarHeight);
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await nav('素材'); await shot('assets-empty');
  await page.screenshot({ path: join(testing, 'drag.png'), clip: { x: 0, y: 0, width: 128, height: 128 } });
  await copyFile(join(testing, 'drag.png'), join(testing, 'picker.png')); await writeFile(join(testing, 'unsupported.txt'), 'not an asset');
  const cdp = await page.context().newCDPSession(page);
  const drop = async file => {
    const bounds = await page.locator('.authoring-assets').boundingBox();
    const input = { x: bounds.x + 200, y: bounds.y + 220, data: { items: [], files: [join(testing, file)], dragOperationsMask: 1 } };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, ...input });
  };
  await drop('drag.png'); await page.waitForFunction(() => document.querySelectorAll('.authoring-asset').length === 1);
  await drop('unsupported.txt'); await page.getByRole('status').filter({ hasText: '不支持文件' }).waitFor();
  assert.equal(await page.locator('.authoring-asset').count(), 1); await shot('unsupported-file'); await click('关闭提示');
  await click('导入素材'); await page.waitForFunction(() => document.querySelectorAll('.authoring-asset').length === 2);
  const chooser = JSON.parse(await readFile(join(evidence, 'file-dialog.json'), 'utf8'));
  assert(chooser.filters.length === 6 && chooser.filters.every(filter => !filter.extensions.includes('*')));
  await click('关闭提示'); await click('选择本页'); await shot('assets-selected'); await click('清空选择');
  report.checks.push('native file drop, unsupported format feedback, filtered picker, batch selection');
  await page.locator('.authoring-header').getByRole('button', { name: '保存全部', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await page.waitForFunction(async () => (await window.studioBridge.documents.list()).value.every(doc => !doc.dirty));
  const files = await page.evaluate(async () => (await window.studioBridge.documents.list()).value.flatMap(doc => Object.keys(doc.files)));
  const script = files.find(path => path.endsWith('/script.gal'));
  let savedText = '';
  for (let attempt = 0; attempt < 50; attempt++) {
    savedText = await readFile(join(testing, 'projects/界面精修验收', script), 'utf8');
    if (savedText.includes('界面精修后的对白。')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(savedText.includes('界面精修后的对白。'));
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await click('切换暮蓝主题');
    for (const [label, file] of [['作品', 'projects'], ['创作', 'editor'], ['素材', 'assets'], ['制作', 'production'], ['页面', 'pages'], ['插件', 'plugins'], ['发布', 'publish']]) {
      await nav(label);
      if (file === 'pages') await page.locator('.designer-canvas .galcraft-player').waitFor();
      else await page.locator('.studio-content main').waitFor();
      await shot(`${file}-${theme}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  await nav('制作'); await click('服务连接');
  const connection = await page.getByRole('button', { name: '添加连接', exact: true }).boundingBox();
  const workflow = await page.getByRole('button', { name: '添加语义工作流', exact: true }).boundingBox();
  assert.equal(connection.y, workflow.y); await shot('connections-dark'); await click('添加连接'); await shot('connection-dialog-dark'); await page.keyboard.press('Escape');
  await nav('创作'); await page.getByRole('button', { name: '添加指令', exact: true }).last().click();
  assert.equal(await page.getByRole('dialog').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(27, 36, 64)'); await shot('command-dialog-dark'); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 980, height: 760 });
  await page.waitForTimeout(200); await click('场景与搜索'); await page.waitForTimeout(250); await shot('editor-narrow'); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.authoring-grid').getAttribute('data-panel'), '');
  await page.setViewportSize({ width: 1440, height: 900 });
  await click('切换浅蓝主题');
  const native = JSON.parse(await readFile(join(evidence, 'window.json'), 'utf8')); assert.equal(native.nativeMenu, null); assert.equal(native.menuVisible, false); assert.deepEqual(native.size, native.contentSize);
  report.checks.push('seven pages in both themes; opaque dialogs; compact status; connection actions; narrow sidebar; native title/menu removed; saved to disk');
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) { report.failure = String(error.stack ?? error); throw error; }
finally { await writeFile(join(evidence, 'result.json'), JSON.stringify(report, null, 2)); await browser.close(); }
